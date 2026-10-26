'use strict';
// Labirinto co-op — server autoritativo (Node + ws)
// Le funzioni di gioco sono pure/esportate per poterle testare senza rete.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const TICK = 30, DT = 1 / TICK;
const MAXP = +process.env.MAXP || 4;
const MINP = +process.env.MINP || 2;
const LEVELS = 5;
const PSPEED = 3.2;      // tile/s
const PRAD = 0.2;        // raggio di collisione
const PAIR_R = 5;        // il mostro non attacca chi ha un compagno libero entro questa distanza (tile)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Valori della griglia: 0 pavimento, 1-4 muri di zona, 5-8 muri decorati,
// 9 e 10 porte a doppio pulsante, 11 porta di uscita
const D0 = 9, DEXIT = 11;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const passable = (v) => v === 0 || v >= D0;
const zoneOf = (x, y, N) => 1 + (x < N / 2 ? 0 : 1) + (y < N / 2 ? 0 : 2);

// ---------- Generazione del livello ----------
function bfs(g, N, s, pass) {
  const d = new Int32Array(g.length).fill(-1);
  const q = [s]; d[s] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % N, y = (c / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (d[ni] < 0 && pass(ni)) { d[ni] = d[c] + 1; q.push(ni); }
    }
  }
  return d;
}

function labelComps(L) {
  const { g, N } = L;
  const doorSet = new Set(L.doors.map((d) => d.i));
  const lab = new Int32Array(g.length).fill(-1);
  let n = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== 0 || doorSet.has(i) || lab[i] >= 0) continue;
    const q = [i]; lab[i] = n;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % N, y = (c / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        if (lab[ni] < 0 && g[ni] === 0 && !doorSet.has(ni)) { lab[ni] = n; q.push(ni); }
      }
    }
    n++;
  }
  return lab;
}

// Invarianti: 1) tutto il labirinto resta connesso (porte comprese)
// 2) ogni porta resta un "collo di bottiglia" (non si aggira)
function checkInv(L) {
  const { g, N } = L;
  let total = 0;
  for (let i = 0; i < g.length; i++) if (passable(g[i])) total++;
  const seen = new Uint8Array(g.length);
  const q = [L.startIdx]; seen[L.startIdx] = 1; let cnt = 0;
  while (q.length) {
    const c = q.pop(); cnt++;
    const x = c % N, y = (c / N) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (!seen[ni] && passable(g[ni])) { seen[ni] = 1; q.push(ni); }
    }
  }
  if (cnt !== total) return false;
  // ogni porta, da sola, deve essere un vero "collo di bottiglia": se la chiudo,
  // dal lato di entrata non si può arrivare al lato di uscita (nemmeno passando da un anello).
  // Questo vale anche per i muri mobili: le zone del labirinto restano quelle e non si salta nessuna porta.
  for (const d of L.doors) {
    const dist = bfs(g, N, d.a, (i) => passable(g[i]) && i !== d.i);
    if (dist[d.b] >= 0) return false;
  }
  return true;
}

function tryGen(level, nPlayers, seed) {
  const rnd = mulberry32(seed);
  const cells = Math.min(16, 5 + nPlayers + level);
  const N = cells * 2 + 1;
  const g = new Array(N * N).fill(1);
  const I = (x, y) => y * N + x;
  const vis = new Uint8Array(cells * cells);
  const st = [[0, 0]]; vis[0] = 1; g[I(1, 1)] = 0;
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const opts = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cells && ny < cells && !vis[ny * cells + nx]) opts.push([nx, ny, dx, dy]);
    }
    if (!opts.length) { st.pop(); continue; }
    const [nx, ny, dx, dy] = opts[(rnd() * opts.length) | 0];
    vis[ny * cells + nx] = 1;
    g[I(2 * cx + 1 + dx, 2 * cy + 1 + dy)] = 0;
    g[I(2 * nx + 1, 2 * ny + 1)] = 0;
    st.push([nx, ny]);
  }
  // cammino dalla partenza alla cella più lontana (albero: unico)
  const startIdx = I(1, 1);
  const d0 = bfs(g, N, startIdx, (i) => g[i] === 0);
  let exitCell = startIdx;
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    const i = I(2 * cx + 1, 2 * cy + 1);
    if (d0[i] > d0[exitCell]) exitCell = i;
  }
  const path = [exitCell];
  while (path[path.length - 1] !== startIdx) {
    const c = path[path.length - 1], x = c % N, y = (c / N) | 0;
    let nxt = -1;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx;
      if (g[ni] === 0 && d0[ni] === d0[c] - 1) { nxt = ni; break; }
    }
    path.push(nxt);
  }
  path.reverse();
  const len = path.length;
  const odd = (n) => (n % 2 ? n : n + 1);
  const i0 = odd(Math.round(len * 0.3)), i1 = odd(Math.round(len * 0.62)), iE = len - 2;
  if (len < 15 || i1 - i0 < 4 || iE - i1 < 4) return null;

  const doors = [];
  [[i0, 0, 'btn'], [i1, 1, 'btn'], [iE, 2, 'exit']].forEach(([pi, k, kind]) => {
    const i = path[pi];
    doors.push({ id: k, i, x: i % N, y: (i / N) | 0, v: D0 + k, kind, a: path[pi - 1], b: path[pi + 1], open: false, until: 0 });
    g[i] = D0 + k;
  });
  const L = { N, cells, g, doors, startIdx, exitCell, level, seed, theme: (level - 1) % 4, buttons: [], torches: [] };

  // anelli extra (rimuovo muri) senza creare scorciatoie intorno alle porte
  const closed = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if ((x + y) % 2 === 1 && g[I(x, y)] === 1) closed.push(I(x, y));
  for (let i = closed.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [closed[i], closed[j]] = [closed[j], closed[i]]; }
  const want = Math.round(closed.length * 0.12);
  let done = 0;
  for (const i of closed) {
    if (done >= want) break;
    g[i] = 0;
    if (checkInv(L)) done++; else g[i] = 1;
  }

  // tipi di muro: zone con colori diversi + decorazioni (punti di riferimento)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = I(x, y);
    if (g[i] !== 1) continue;
    let v = zoneOf(x, y, N);
    const nearFloor = DIRS.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && g[I(nx, ny)] === 0; });
    if (nearFloor && rnd() < 0.08) v = 5 + ((rnd() * 4) | 0);
    g[i] = v;
  }

  // pulsanti: nella zona prima di ciascuna porta a doppio pulsante, in due punti distanti
  const lab = labelComps(L);
  const doorSet = new Set(doors.map((d) => d.i));
  for (const door of doors) {
    if (door.kind !== 'btn') continue;
    const dist = bfs(g, N, door.a, (i) => g[i] === 0 && !doorSet.has(i));
    const cand = [];
    for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
      const i = I(2 * cx + 1, 2 * cy + 1);
      if (lab[i] === lab[door.a] && dist[i] >= 4 && dist[i] <= 16 && i !== startIdx) cand.push(i);
    }
    if (cand.length < 2) return null;
    const b1 = cand[(rnd() * cand.length) | 0];
    const d1 = bfs(g, N, b1, (i) => g[i] === 0 && !doorSet.has(i));
    let far = cand.filter((i) => d1[i] >= 6);
    if (!far.length) far = cand.filter((i) => i !== b1 && d1[i] >= 3);
    if (!far.length) return null;
    const b2 = far[(rnd() * far.length) | 0];
    door.btns = [];
    for (const bi of [b1, b2]) {
      const id = L.buttons.length;
      L.buttons.push({ id, door: door.id, x: (bi % N) + 0.5, y: ((bi / N) | 0) + 0.5, pr: 0, t: -99, by: -1 });
      door.btns.push(id);
    }
  }

  // torce sul pavimento, lontane dalla partenza
  const dS = bfs(g, N, startIdx, passable2(g));
  const tc = [];
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    const i = I(2 * cx + 1, 2 * cy + 1);
    if (dS[i] >= 8 && i !== exitCell && !L.buttons.some((b) => I(b.x | 0, b.y | 0) === i)) tc.push(i);
  }
  for (let k = 0; k < 2 && tc.length; k++) {
    const i = tc.splice((rnd() * tc.length) | 0, 1)[0];
    L.torches.push({ id: 100 + k, x: (i % N) + 0.5, y: ((i / N) | 0) + 0.5 });
  }
  // partenza del mostro: lontano
  const mc = [];
  let maxD = 0;
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) maxD = Math.max(maxD, dS[I(2 * cx + 1, 2 * cy + 1)]);
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    const i = I(2 * cx + 1, 2 * cy + 1);
    if (dS[i] >= maxD * 0.5 && i !== exitCell) mc.push(i);
  }
  const mi = mc[(rnd() * mc.length) | 0] || exitCell;
  L.monsterStart = { x: (mi % N) + 0.5, y: ((mi / N) | 0) + 0.5 };
  L.start = { x: 1.5, y: 1.5, a: g[I(2, 1)] === 0 ? 0 : Math.PI / 2 };
  L.exitDoor = doors[2];
  return L;
}
function passable2(g) { return (i) => passable(g[i]); }

// Sala di prova: un piccolo labirinto finto (senza porte, mostro, blackout) dove si cammina e si parla
// mentre aspettano gli amici. Spariscono tutti quando il capo preme "Inizia".
function genLobby() {
  const cells = 5, N = cells * 2 + 1, g = new Array(N * N).fill(1), I = (x, y) => y * N + x;
  const vis = new Uint8Array(cells * cells), st = [[0, 0]]; vis[0] = 1; g[I(1, 1)] = 0;
  while (st.length) {
    const [cx, cy] = st[st.length - 1], opts = [];
    for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < cells && ny < cells && !vis[ny * cells + nx]) opts.push([nx, ny, dx, dy]); }
    if (!opts.length) { st.pop(); continue; }
    const [nx, ny, dx, dy] = opts[(Math.random() * opts.length) | 0];
    vis[ny * cells + nx] = 1; g[I(2 * cx + 1 + dx, 2 * cy + 1 + dy)] = 0; g[I(2 * nx + 1, 2 * ny + 1)] = 0; st.push([nx, ny]);
  }
  const closed = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) if ((x + y) % 2 === 1 && g[I(x, y)] === 1) closed.push(I(x, y));
  for (let k = 0; k < 4 && closed.length; k++) g[closed.splice((Math.random() * closed.length) | 0, 1)[0]] = 0;   // qualche anello
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[I(x, y)] !== 1) continue;
    let v = zoneOf(x, y, N);
    const nearFloor = DIRS.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && g[I(nx, ny)] === 0; });
    if (nearFloor && Math.random() < 0.1) v = 5 + ((Math.random() * 4) | 0);
    g[I(x, y)] = v;
  }
  return { N, g, level: 0, theme: 0, doors: [], buttons: [], torches: [], start: { x: 1.5, y: 1.5, a: g[I(2, 1)] === 0 ? 0 : Math.PI / 2 } };
}

function genLevel(level, nPlayers, seed) {
  for (let k = 0; k < 40; k++) {
    const L = tryGen(level, nPlayers, (seed + k * 7919) >>> 0);
    if (L) return L;
  }
  throw new Error('genLevel fallita');
}

// ---------- Fisica ----------
function blocked(g, N, x, y, rad) {
  const x0 = Math.floor(x - rad), x1 = Math.floor(x + rad), y0 = Math.floor(y - rad), y1 = Math.floor(y + rad);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= N || ty >= N || g[ty * N + tx] !== 0) return true;
  }
  return false;
}
function move(g, N, e, dx, dy, rad) {
  if (!blocked(g, N, e.x + dx, e.y, rad)) e.x += dx;
  if (!blocked(g, N, e.x, e.y + dy, rad)) e.y += dy;
}
const tileOf = (L, x, y) => (Math.floor(y) * L.N + Math.floor(x));

// ---------- Stanze ----------
const rooms = new Map();
function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += A[(Math.random() * A.length) | 0]; } while (rooms.has(c));
  return c;
}
function createRoom(code) {
  return {
    code: code || makeCode(), lobbyL: genLobby(), players: new Map(), st: 'lobby', level: 0, L: null, host: null, nid: 1,
    time: 0, total: 0, lvT0: 0, lvTimes: [], lid: 0, tiles: [], ev: [], monster: null, shT: 45, shWarn: false, boT: 70, boLeft: 0,
    exitHold: 0, winT: 0, resetT: 0, noMonster: process.env.NO_MONSTER === '1',
  };
}
function cleanName(n) { return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Anonimo'; }
function addPlayer(r, ws, name) {
  const used = new Set([...r.players.values()].map((p) => p.e));
  let e = 0; while (used.has(e)) e++;
  const p = {
    id: r.nid++, ws, n: name, e, x: 1.5, y: 1.5, a: 0, in: { f: 0, s: 0, u: false }, edge: false,
    chained: false, fr: 0, imm: 0, it: null, sy: -1, syT: 0,
  };
  r.players.set(p.id, p);
  if (r.st === 'lobby') { const s0 = r.lobbyL.start; p.x = s0.x + (Math.random() - 0.5) * 0.4; p.y = s0.y + (Math.random() - 0.5) * 0.4; p.a = s0.a; }
  if (!r.host) r.host = p.id;
  if (ws) { ws.room = r; ws.pid = p.id; }
  if (r.L) placePlayers(r);
  return p;
}
function placePlayers(r) {
  const L = r.L, offs = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0], [0, 0.3]];
  let k = 0;
  for (const p of r.players.values()) {
    if (p.placed === L.seed) continue;
    p.x = L.start.x + offs[k % offs.length][0]; p.y = L.start.y + offs[k % offs.length][1]; p.a = L.start.a;
    p.chained = false; p.fr = 0; p.imm = 1; p.it = null; p.placed = L.seed; k++;
  }
}
function loadLevel(r, level) {
  if (level) r.level = level;
  const seed = (Math.random() * 4294967296) >>> 0;
  r.L = genLevel(r.level, Math.min(MAXP, Math.max(2, r.players.size)), seed);
  const L = r.L;
  r.tiles = []; r.winT = 0; r.resetT = 0; r.exitHold = 0; r.lvT0 = r.time; r.lid++;
  r.shT = 40 + Math.random() * 10; r.shWarn = false; r.boT = 50 + Math.random() * 25; r.boLeft = 0;
  for (const p of r.players.values()) p.placed = null;
  placePlayers(r);
  r.monster = r.noMonster ? null : { x: L.monsterStart.x, y: L.monsterStart.y, stun: 2, stumbleT: 5, cd: 0, dmap: null };
  r.st = 'play';
  r.ev.push({ k: 'level', lv: r.level });
}
function startGame(r) {
  r.total = 0; r.time = 0; r.lvTimes = [];
  loadLevel(r, 1);
}
function levelMsg(r, L) {
  L = L || r.L;
  return {
    t: 'lvl', id: r.lid, lv: L.level || 0, total: LEVELS, th: L.theme, N: L.N, g: L.g,
    doors: L.doors.map((d) => ({ id: d.id, x: d.x, y: d.y, v: d.v, k: d.kind })),
    bt: L.buttons.map((b) => ({ id: b.id, x: b.x, y: b.y, d: b.door })),
  };
}

function setTile(r, i, v) {
  const L = r.L;
  if (L.g[i] === v) return;
  L.g[i] = v; r.tiles.push([i % L.N, (i / L.N) | 0, v]);
}
function entsNear(r, x, y, rad) {
  for (const p of r.players.values()) if (Math.hypot(p.x - x, p.y - y) < rad) return true;
  if (r.monster && Math.hypot(r.monster.x - x, r.monster.y - y) < rad) return true;
  return false;
}

// Muri che si spostano: sempre labirinto connesso, porte non aggirabili
function doShift(r) {
  const L = r.L, { N, g } = L;
  const doorIdx = L.doors.map((d) => d.i);
  const cand = [];
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if ((x + y) % 2 !== 1) continue;
    const i = y * N + x;
    if (doorIdx.includes(i)) continue;
    if (doorIdx.some((di) => Math.max(Math.abs((di % N) - x), Math.abs(((di / N) | 0) - y)) <= 1)) continue;
    const ex = L.exitDoor;
    if (Math.max(Math.abs(ex.x - x), Math.abs(ex.y - y)) <= 2) continue;
    if (entsNear(r, x + 0.5, y + 0.5, 2.4)) continue;
    cand.push(i);
  }
  for (let i = cand.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
  let done = 0;
  for (const i of cand) {
    if (done >= 6) break;
    const old = g[i], x = i % N, y = (i / N) | 0;
    g[i] = old === 0 ? zoneOf(x, y, N) : 0;
    if (checkInv(L)) { done++; r.tiles.push([x, y, g[i]]); } else g[i] = old;
  }
  return done;
}

// ---------- Interazioni ----------
function interact(r, p) {
  const L = r.L;
  let best = null, bd = 1.25;
  for (const b of L.buttons) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = b; } }
  if (best) {
    best.pr = 1.5; best.t = r.time; best.by = p.id;
    r.ev.push({ k: 'btn', x: best.x, y: best.y });
    const door = L.doors[best.door];
    const [b0, b1] = door.btns.map((id) => L.buttons[id]);
    if (r.time - b0.t <= 1.5 && r.time - b1.t <= 1.5 && b0.by !== b1.by && b0.by >= 0 && b1.by >= 0) {
      door.open = true; door.until = r.time + 8; setTile(r, door.i, 0);
      b0.t = b1.t = -99;
      r.ev.push({ k: 'door', x: door.x + 0.5, y: door.y + 0.5 });
    }
    return;
  }
  if (!p.it) {
    for (let k = 0; k < L.torches.length; k++) {
      const t = L.torches[k];
      if (Math.hypot(t.x - p.x, t.y - p.y) < 1.25) {
        p.it = 'torch'; L.torches.splice(k, 1); r.ev.push({ k: 'torch', id: p.id }); return;
      }
    }
  }
}
function dropItem(r, p) {
  if (!p.it || !r.L) return;
  r.L.torches.push({ id: r.nid++, x: p.x, y: p.y });
  p.it = null; r.ev.push({ k: 'drop' });
}

// ---------- Mostro goffo ----------
function monsterStep(r, dt) {
  const m = r.monster, L = r.L; if (!m) return;
  const players = [...r.players.values()];
  // chi ha almeno un compagno libero vicino è al sicuro: il mostro attacca solo chi è solo
  const isPair = (p) => players.some((q) => q !== p && !q.chained && Math.hypot(q.x - p.x, q.y - p.y) < PAIR_R);
  m.hold = false;
  if (m.stun > 0) { m.stun -= dt; return; }
  m.stumbleT -= dt;
  if (m.stumbleT <= 0) { m.stun = 1.5; m.stumbleT = 4 + Math.random() * 5; r.ev.push({ k: 'stumble', x: m.x, y: m.y }); return; }
  m.cd -= dt;
  const free = (i) => passable(L.g[i]);   // il mostro è grosso: sfonda le porte
  if (m.cd <= 0) {
    m.cd = 0.3;
    const dm = bfs(L.g, L.N, tileOf(L, m.x, m.y), free);
    let best = null, bd = 1e9, solo = null, sd = 1e9;      // preferisce chi è solo; se sono tutti in coppia segue il più vicino ma non lo attacca
    for (const p of players) if (!p.chained) {
      const di = dm[tileOf(L, p.x, p.y)]; if (di < 0) continue;
      if (di < bd) { bd = di; best = p; }
      if (di < sd && !isPair(p)) { sd = di; solo = p; }
    }
    const pick = solo || best;
    m.tgt = pick ? pick.id : null;
    m.dmap = pick ? bfs(L.g, L.N, tileOf(L, pick.x, pick.y), free) : null;
  }
  const tp = m.tgt != null ? r.players.get(m.tgt) : null;
  if (tp && isPair(tp) && Math.hypot(tp.x - m.x, tp.y - m.y) < 2.4) m.hold = true;   // brontola a distanza, non può toccarli
  if (tp && m.dmap && !m.hold) {
    const cur = tileOf(L, m.x, m.y), dc = m.dmap[cur];
    let tx, ty;
    if (dc <= 0) { tx = tp.x; ty = tp.y; } else {
      let nb = -1, nd = dc;
      for (const [dx, dy] of DIRS) {
        const nx = (cur % L.N) + dx, ny = ((cur / L.N) | 0) + dy;
        if (nx < 0 || ny < 0 || nx >= L.N || ny >= L.N) continue;
        const ni = ny * L.N + nx;
        if (m.dmap[ni] >= 0 && m.dmap[ni] < nd) { nd = m.dmap[ni]; nb = ni; }
      }
      if (nb < 0) return;
      tx = (nb % L.N) + 0.5; ty = ((nb / L.N) | 0) + 0.5;
    }
    const dx = tx - m.x, dy = ty - m.y, dl = Math.hypot(dx, dy);
    const sp = (2.1 + 0.12 * r.level) * dt;
    if (dl > 0.001) { const k = Math.min(1, sp / dl); m.x += dx * k; m.y += dy * k; }
  }
  for (const p of players) {
    if (p.chained || p.imm > 0 || isPair(p)) continue;
    if (Math.hypot(p.x - m.x, p.y - m.y) < 0.65) {
      p.chained = true; p.fr = 0; m.stun = 1.2; m.dmap = null; m.cd = 0;
      if (p.it) dropItem(r, p);
      r.ev.push({ k: 'chain', id: p.id, n: p.n, x: p.x, y: p.y });
    }
  }
}

// ---------- Passo di simulazione ----------
function lobbyStep(r, dt) {
  const L = r.lobbyL;
  for (const p of r.players.values()) {
    if (p.syT > 0) { p.syT -= dt; if (p.syT <= 0) p.sy = -1; }
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    let vx = p.in.f * ca - p.in.s * sa, vy = p.in.f * sa + p.in.s * ca;
    const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
    move(L.g, L.N, p, vx * PSPEED * dt, vy * PSPEED * dt, PRAD);
  }
}
function step(r, dt) {
  if (r.st === 'lobby') { lobbyStep(r, dt); return; }
  if (r.st !== 'play' || !r.L) return;
  const L = r.L, players = [...r.players.values()];
  r.time += dt;
  for (const p of players) { if (p.syT > 0) { p.syT -= dt; if (p.syT <= 0) p.sy = -1; } if (p.imm > 0) p.imm -= dt; }
  for (const b of L.buttons) if (b.pr > 0) b.pr -= dt;
  if (r.resetT > 0) { r.resetT -= dt; if (r.resetT <= 0) loadLevel(r); return; }
  if (r.winT > 0) {
    r.winT -= dt;
    if (r.winT <= 0) {
      if (r.level >= LEVELS) { r.st = 'over'; r.total = r.time; r.ev.push({ k: 'over' }); } else loadLevel(r, r.level + 1);
    }
    return;
  }
  // movimento
  for (const p of players) {
    if (p.chained) continue;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    let vx = p.in.f * ca - p.in.s * sa, vy = p.in.f * sa + p.in.s * ca;
    const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
    move(L.g, L.N, p, vx * PSPEED * dt, vy * PSPEED * dt, PRAD);
  }
  // pulsanti e oggetti
  for (const p of players) if (p.edge) { p.edge = false; if (!p.chained) interact(r, p); }
  // liberazione: un compagno tiene premuto "interagisci" vicino a te per 3 secondi
  for (const p of players) {
    if (!p.chained) continue;
    const helper = players.find((q) => q !== p && !q.chained && q.in.u && Math.hypot(q.x - p.x, q.y - p.y) < 1.4);
    p.fr = helper ? p.fr + dt / 3 : Math.max(0, p.fr - dt * 0.7);
    if (p.fr >= 1) {
      p.chained = false; p.fr = 0; p.imm = 2;
      if (r.monster) { r.monster.stun = 3; r.monster.dmap = null; }
      r.ev.push({ k: 'free', id: p.id, n: p.n, x: p.x, y: p.y });
    }
  }
  // porte temporanee
  for (const d of L.doors) {
    if (d.kind !== 'btn' || !d.open || r.time < d.until) continue;
    if (entsNear(r, d.x + 0.5, d.y + 0.5, 0.9)) { d.until += 0.2; continue; }
    d.open = false; setTile(r, d.i, d.v); r.ev.push({ k: 'doorclose', x: d.x + 0.5, y: d.y + 0.5 });
  }
  monsterStep(r, dt);
  // blackout
  if (r.boLeft > 0) {
    r.boLeft -= dt;
    if (r.boLeft <= 0) { r.boT = 60 + Math.random() * 30; r.ev.push({ k: 'lights' }); }
  } else {
    r.boT -= dt;
    if (r.boT <= 0) { r.boLeft = 25; r.ev.push({ k: 'blackout' }); }
  }
  // labirinto che cambia
  r.shT -= dt;
  if (!r.shWarn && r.shT <= 3) { r.shWarn = true; r.ev.push({ k: 'rumble' }); }
  if (r.shT <= 0) { doShift(r); r.shT = 45 + Math.random() * 15; r.shWarn = false; r.ev.push({ k: 'shift' }); }
  // uscita: tutti i giocatori liberi vicino alla porta
  const ex = L.exitDoor;
  const dist = bfs(L.g, L.N, ex.a, (i) => L.g[i] === 0);
  const near = players.filter((p) => !p.chained && dist[tileOf(L, p.x, p.y)] >= 0 && dist[tileOf(L, p.x, p.y)] <= 4);
  r.exitNear = near.length;
  if (players.length > 0 && near.length === players.length) {
    r.exitHold += dt;
    if (r.exitHold >= 1.2) {
      setTile(r, ex.i, 0); r.winT = 2.5; r.lvTimes.push(r.time - r.lvT0);
      r.ev.push({ k: 'win', x: ex.x + 0.5, y: ex.y + 0.5, lt: Math.round(r.time - r.lvT0) });
    }
  } else r.exitHold = 0;
  // tutti incatenati: si ricomincia il livello
  if (players.length > 0 && players.every((p) => p.chained) && r.resetT <= 0) {
    r.resetT = 3; r.ev.push({ k: 'reset' });
  }
}

function snapshot(r) {
  const L = r.L, m = r.monster;
  return {
    t: 's', st: r.st, c: r.code, h: r.host, lv: r.level, tm: Math.round(r.time), l0: Math.round(r.lvT0), lts: r.lvTimes.map((x) => Math.round(x)),
    p: [...r.players.values()].map((p) => ({
      i: p.id, n: p.n, e: p.e, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
      a: Math.round(p.a * 100) / 100, ch: p.chained ? 1 : 0, fr: Math.round(p.fr * 100) / 100, it: p.it ? 1 : 0, sy: p.sy,
    })),
    m: m ? [Math.round(m.x * 100) / 100, Math.round(m.y * 100) / 100, m.stun > 0 || m.hold ? 1 : 0] : null,
    pb: L ? L.buttons.filter((b) => b.pr > 0).map((b) => b.id) : [],
    tc: L ? L.torches.map((t) => [Math.round(t.x * 100) / 100, Math.round(t.y * 100) / 100]) : [],
    bo: r.boLeft > 0 ? Math.ceil(r.boLeft) : 0,
    sh: r.shT <= 3 && r.shT > 0 ? 1 : 0,
    ex: [r.exitNear || 0, r.players.size], win: r.winT > 0 ? 1 : 0, rs: r.resetT > 0 ? 1 : 0,
    tot: Math.round(r.total),
  };
}

// ---------- Rete ----------
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(r, obj) { const s = JSON.stringify(obj); for (const p of r.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); }
function flush(r) {
  if (r.tiles.length) { broadcast(r, { t: 'tiles', c: r.tiles }); r.tiles = []; }
  if (r.ev.length) {
    for (const e of r.ev) {
      if (e.k === 'level') broadcast(r, levelMsg(r, r.L));
      broadcast(r, { t: 'ev', ...e });
    }
    r.ev = [];
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function makeServer() {
  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/index.html';
    const f = path.join(__dirname, 'public', path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.join(__dirname, 'public')) || !MIME[path.extname(f)]) { res.writeHead(404); return res.end('404'); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)], 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    const welcome = (r, p) => {
      send(ws, { t: 'joined', id: p.id, code: r.code, max: MAXP });
      send(ws, levelMsg(r, r.L && r.st === 'play' ? r.L : r.lobbyL));
    };
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!ws.room) {
        if (m.t === 'create') {
          const r = createRoom(); rooms.set(r.code, r);
          welcome(r, addPlayer(r, ws, cleanName(m.name)));
        } else if (m.t === 'join') {
          const r = rooms.get(String(m.code || '').toUpperCase().trim());
          if (!r) return send(ws, { t: 'err', m: 'Stanza non trovata' });
          if (r.players.size >= MAXP) return send(ws, { t: 'err', m: 'Stanza piena (max ' + MAXP + ' giocatori)' });
          welcome(r, addPlayer(r, ws, cleanName(m.name)));
        }
        return;
      }
      const r = ws.room, p = r.players.get(ws.pid);
      if (!p) return;
      if (m.t === 'in') {
        if (m.l !== r.lid) return;   // input vecchio, spedito prima che il client caricasse questo livello: non deve sovrascrivere la direzione di partenza
        p.in.f = clamp(+m.f || 0, -1, 1); p.in.s = clamp(+m.s || 0, -1, 1);
        p.a = Number.isFinite(+m.a) ? +m.a : p.a;
        const u = !!m.u; if (u && !p.in.u) p.edge = true; p.in.u = u;
      } else if (m.t === 'start' && r.host === p.id && r.st !== 'play') {
        if (r.players.size < MINP) return send(ws, { t: 'err', m: 'Servono almeno ' + MINP + ' giocatori' });
        startGame(r);
      } else if (m.t === 'drop') dropItem(r, p);
      else if (m.t === 'say') { const k = m.k | 0; if (k >= 0 && k < 4) { p.sy = k; p.syT = 2.5; } }
      else if (m.t === 'sig') {
        const to = r.players.get(m.to | 0);
        if (to && to !== p && to.ws) send(to.ws, { t: 'sig', from: p.id, d: m.d });
      }
    });
    ws.on('close', () => {
      const r = ws.room; if (!r) return;
      r.players.delete(ws.pid);
      if (r.players.size === 0) { rooms.delete(r.code); return; }
      if (r.host === ws.pid) r.host = [...r.players.keys()][0];
    });
    ws.on('error', () => {});
  });
  let tick = 0;
  setInterval(() => {
    tick++;
    for (const r of rooms.values()) {
      step(r, DT); flush(r);
      if (tick % 2 === 0) { const s = JSON.stringify(snapshot(r)); for (const p of r.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); }
    }
  }, 1000 / TICK / (+process.env.SIM_SPEEDUP || 1));   // SIM_SPEEDUP serve solo ai test automatici
  return server;
}

module.exports = { genLevel, checkInv, labelComps, bfs, createRoom, addPlayer, startGame, loadLevel, step, snapshot, interact, dropItem, doShift, levelMsg, flush, move, blocked, tileOf, rooms, constants: { LEVELS, MAXP, MINP, PSPEED, D0, DEXIT } };

if (require.main === module) {
  makeServer().listen(PORT, () => console.log('Labirinto co-op in ascolto su http://localhost:' + PORT));
}
