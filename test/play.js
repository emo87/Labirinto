'use strict';
// Partita vera via WebSocket: 4 bot (un solo cervello) risolvono il livello 1 e passano al 2.
// Controlla il protocollo completo: stanza, avvio, porte a doppio pulsante, uscita con tutti.
// Il mostro è spento (NO_MONSTER) e la simulazione è accelerata (SIM_SPEEDUP).
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 3203, SPEED = +process.env.PLAY_SPEED || 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, NO_MONSTER: '1', SIM_SPEEDUP: String(SPEED) }, stdio: 'inherit' });
const fail = (m) => { console.log('FAIL:', m); srv.kill(); process.exit(1); };

(async () => {
  await sleep(700);
  const bots = []; let code = null, G = null, snap = null; const evs = [];
  const mk = (name) => new Promise((res) => {
    const ws = new WebSocket('ws://localhost:' + PORT); const b = { ws, name, id: null, u: false, f: 0, s: 0 };
    ws.on('open', () => ws.send(JSON.stringify(code ? { t: 'join', code, name } : { t: 'create', name })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'joined') { b.id = m.id; code = m.code; res(b); }
      else if (m.t === 'lvl' && b === bots[0]) { G = { id: m.id, N: m.N, g: Int8Array.from(m.g), doors: m.doors, bt: m.bt, lv: m.lv }; evs.push('lvl' + m.lv); }
      else if (m.t === 'tiles' && b === bots[0] && G) for (const [x, y, v] of m.c) G.g[y * G.N + x] = v;
      else if (m.t === 's' && b === bots[0]) snap = m;
      else if (m.t === 'ev' && b === bots[0]) evs.push(m.k);
    });
    bots.push(b);
  });
  for (const n of ['Owe', 'Amico', 'Giulia', 'Marco']) await mk(n);
  console.log('stanza', code, 'con', bots.length, 'bot');
  bots[0].ws.send(JSON.stringify({ t: 'start' }));
  for (let i = 0; i < 100 && !(G && G.lv === 1); i++) await sleep(50);
  if (!G || G.lv !== 1) fail('livello non arrivato');

  const N = () => G.N, idx = (x, y) => y * N() + x;
  const tile = (p) => [Math.floor(p.x), Math.floor(p.y)];
  const pos = (b) => snap.p.find((p) => p.i === b.id);
  // percorso sulle tile libere (le porte aperte valgono 0)
  function pathTo(from, to) {
    const n = N(), prev = new Int32Array(n * n).fill(-1), q = [idx(...from)]; prev[q[0]] = q[0];
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % n, y = (c / n) | 0; if (c === idx(...to)) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue; const ni = ny * n + nx; if (prev[ni] < 0 && G.g[ni] === 0) { prev[ni] = c; q.push(ni); } }
    }
    if (prev[idx(...to)] < 0) return null;
    const out = []; for (let c = idx(...to); c !== idx(...from); c = prev[c]) out.push([c % n, (c / n) | 0]); return out.reverse();
  }
  function walk(b, target) {            // un passo verso la tile bersaglio; ritorna 0 quando è arrivato al centro
    const p = pos(b); if (!p) return 99;
    const t = tile(p), cx = target[0] + 0.5, cy = target[1] + 0.5;
    if (t[0] === target[0] && t[1] === target[1]) {
      const dx = cx - p.x, dy = cy - p.y, l = Math.hypot(dx, dy);
      if (l < 0.12) { b.f = 0; b.s = 0; return 0; }
      const k = Math.min(1, l * 4); b.f = dx / l * k; b.s = dy / l * k; return l;
    }
    const path = pathTo(t, target);
    if (!path) { b.f = 0; b.s = 0; return 99; }
    const [tx, ty] = path[0]; const dx = tx + 0.5 - p.x, dy = ty + 0.5 - p.y, l = Math.hypot(dx, dy) || 1;
    b.f = dx / l; b.s = dy / l; return path.length;
  }
  const stop = (b) => { b.f = 0; b.s = 0; };
  setInterval(() => { for (const b of bots) if (b.ws.readyState === 1) b.ws.send(JSON.stringify({ t: 'in', l: G ? G.id : 0, f: +b.f.toFixed(2), s: +b.s.toFixed(2), a: 0, u: b.u })); }, 33);

  // lato "prima" della porta = quello raggiungibile da dove si trovano ora i bot (le porte chiuse alle spalle non contano)
  function sides(door) {
    const from = tile(pos(bots[2]));
    const c = [[door.x - 1, door.y], [door.x + 1, door.y], [door.x, door.y - 1], [door.x, door.y + 1]].filter(([x, y]) => G.g[idx(x, y)] === 0);
    const reach = (t) => (t[0] === from[0] && t[1] === from[1]) || !!pathTo(from, t);
    const a = c.find(reach), b = c.find((t) => t !== a);
    return { a, b };
  }
  const t0 = Date.now(); const LEVELS = +process.env.PLAY_LEVELS || 1;
  const check = () => { if (Date.now() - t0 > 560000) fail('tempo scaduto, eventi: ' + evs.join(',')); };
  async function solveLevel() {
    const n = G.lv, size = G.N;
    const doors = G.doors.filter((d) => d.k === 'btn'), exit = G.doors.find((d) => d.k === 'exit');
    for (const door of doors) {
      if (process.env.PLAY_DEBUG) console.log('  verso la porta', door.id);
      const [bA, bB] = G.bt.filter((b) => b.d === door.id), sd = sides(door);
      const tgt = [[bA.x | 0, bA.y | 0], [bB.x | 0, bB.y | 0]];
      // A e B ai pulsanti, C e D davanti alla porta; i pulsanti si premono SOLO quando entrambi sono arrivati
      let pressed = false;
      while (G.g[idx(door.x, door.y)] !== 0) {
        check(); await sleep(40);
        const dA = walk(bots[0], tgt[0]), dB = walk(bots[1], tgt[1]); walk(bots[2], sd.a); walk(bots[3], sd.a);
        if (dA === 0 && dB === 0 && !pressed) {
          pressed = true; bots[0].u = bots[1].u = true; await sleep(120); bots[0].u = bots[1].u = false;
          await sleep(300); pressed = false;
        }
      }
      if (process.env.PLAY_DEBUG) console.log('  porta', door.id, 'aperta');
      let cT = 0;
      // tutti dall'altra parte, subito (la porta resta aperta 8 secondi)
      while (bots.some((b) => { const p = pos(b); return Math.floor(p.x) !== sd.b[0] || Math.floor(p.y) !== sd.b[1]; })) {
        check(); await sleep(40); for (const b of bots) { const d = walk(b, sd.b); if (d === 0) stop(b); }
        if (process.env.PLAY_DEBUG && Date.now() - cT > 4000) { cT = Date.now(); console.log('  attraverso', door.id, 'verso', sd.b, 'bot', bots.map((b) => { const p = pos(b); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' | ')); }
      }
      for (const b of bots) stop(b);
    }
    // uscita: tutti vicino alla porta finale
    const es = sides(exit);
    let dbgT = 0;
    while (G.lv === n && snap.st !== 'over') { check(); await sleep(40); if (process.env.PLAY_DEBUG && Date.now() - dbgT > 4000) { dbgT = Date.now(); console.log('  uscita', es.a, 'bot', bots.map((b) => { const p = pos(b); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' | '), 'vicini', snap.ex.join('/'), 'st', snap.st, 'win', snap.win); } for (const b of bots) { const d = walk(b, es.a); if (d === 0) stop(b); } }
    for (const b of bots) stop(b);
    console.log('livello', n, 'risolto: griglia', size + 'x' + size);
  }
  for (let k = 1; k <= LEVELS; k++) {
    // aspetto il nuovo livello E la prima posizione di partenza (altrimenti uso le coordinate del livello precedente)
    if (k > 1) { while (G.lv !== k) { check(); await sleep(40); } await sleep(500); }
    await solveLevel();
  }
  await sleep(500);
  console.log('eventi:', [...new Set(evs)].join(', '));
  for (const need of ['door', 'win']) if (!evs.includes(need)) fail('manca l\'evento ' + need);
  if (LEVELS === 1 && !evs.includes('lvl2')) fail('manca il livello 2');
  const lts = snap.lts || [];
  console.log('PLAY OK: ' + LEVELS + ' livello/i risolti dai 4 bot. Tempi di gioco per livello (s):', lts.join(', '), '· totale', snap.tm, 's');
  srv.kill(); process.exit(0);
})().catch((e) => { console.log('ERRORE', e); srv.kill(); process.exit(1); });
