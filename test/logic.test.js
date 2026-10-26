'use strict';
// Test della logica di gioco (senza rete)
const assert = require('assert');
const S = require('../server.js');
const { genLevel, checkInv, labelComps, bfs, createRoom, addPlayer, startGame, step, interact, dropItem, doShift, snapshot, flush, constants } = S;

let n = 0;
const ok = (name) => { n++; console.log('  ok -', name); };
const stub = () => ({ readyState: 1, send() {}, room: null });
const passable = (v) => v === 0 || v >= constants.D0;

// 1) Generazione: risolvibilità, porte, pulsanti
{
  let levels = 0;
  for (let lv = 1; lv <= constants.LEVELS; lv++) for (let np = 2; np <= 4; np++) for (let seed = 1; seed <= 25; seed++) {
    const L = genLevel(lv, np, seed * 104729);
    levels++;
    assert(checkInv(L), 'invarianti violati');
    const d = bfs(L.g, L.N, L.startIdx, (i) => passable(L.g[i]));
    assert(d[L.exitCell] > 0, 'uscita non raggiungibile');
    assert.strictEqual(L.g[L.startIdx], 0);
    assert.strictEqual(L.doors.length, 3);
    // nessuna porta si può aggirare: chiudendone una sola, dall'inizio non si arriva all'uscita
    for (const dr of L.doors) {
      const dd = bfs(L.g, L.N, L.startIdx, (i) => passable(L.g[i]) && i !== dr.i);
      assert(dd[L.exitCell] < 0, 'l\'uscita si raggiunge senza passare dalla porta ' + dr.id);
    }
    assert.strictEqual(L.buttons.length, 4, 'servono 4 pulsanti');
    const lab = labelComps(L);
    for (const dr of L.doors) assert.notStrictEqual(lab[dr.a], lab[dr.b], 'porta aggirabile');
    for (const dr of L.doors.filter((x) => x.kind === 'btn')) {
      assert.strictEqual(dr.btns.length, 2);
      const [b0, b1] = dr.btns.map((id) => L.buttons[id]);
      const i0 = (b0.y | 0) * L.N + (b0.x | 0), i1 = (b1.y | 0) * L.N + (b1.x | 0);
      assert.strictEqual(lab[i0], lab[dr.a], 'pulsante 0 dopo la porta');
      assert.strictEqual(lab[i1], lab[dr.a], 'pulsante 1 dopo la porta');
      assert.notStrictEqual(i0, i1);
      const doorSet = new Set(L.doors.map((x) => x.i));
      const dd = bfs(L.g, L.N, dr.a, (i) => L.g[i] === 0 && !doorSet.has(i));
      assert(dd[i0] <= 16 && dd[i1] <= 16, 'pulsanti troppo lontani dalla porta');
      const d1 = bfs(L.g, L.N, i0, (i) => L.g[i] === 0 && !doorSet.has(i));
      assert(d1[i1] >= 3, 'pulsanti troppo vicini fra loro');
    }
    assert(L.torches.length >= 1, 'nessuna torcia');
    assert.strictEqual(L.g[(L.monsterStart.y | 0) * L.N + (L.monsterStart.x | 0)], 0);
    assert.strictEqual(L.N, Math.min(16, 5 + np + lv) * 2 + 1);
  }
  ok('generazione: ' + levels + ' livelli risolvibili, porte non aggirabili, pulsanti nella zona giusta');
  const L4 = genLevel(1, 4, 12345);
  assert.strictEqual(L4.N, 21);
  ok('livello 1 con 4 giocatori: griglia 21x21 (10x10 celle)');
}

// 2) Muri mobili: mai chiusi sopra a nessuno, sempre connesso, porte intatte
{
  const r = createRoom('TEST'); r.noMonster = true;
  for (let i = 0; i < 4; i++) addPlayer(r, stub(), 'P' + i);
  startGame(r);
  const L = r.L;
  let shifted = 0;
  for (let k = 0; k < 300; k++) {
    const floors = []; for (let i = 0; i < L.g.length; i++) if (L.g[i] === 0) floors.push(i);
    for (const p of r.players.values()) { const i = floors[(Math.random() * floors.length) | 0]; p.x = (i % L.N) + 0.5; p.y = ((i / L.N) | 0) + 0.5; }
    shifted += doShift(r);
    assert(checkInv(L), 'invarianti violati dopo lo spostamento ' + k);
    for (const dr of L.doors) {
      const dd = bfs(L.g, L.N, L.startIdx, (i) => passable(L.g[i]) && i !== dr.i);
      assert(dd[L.exitCell] < 0, 'dopo lo spostamento ' + k + ' la porta ' + dr.id + ' si aggira');
    }
    for (const p of r.players.values()) assert.strictEqual(L.g[S.tileOf(L, p.x, p.y)] === 0 || L.g[S.tileOf(L, p.x, p.y)] >= 9, true, 'giocatore dentro un muro');
  }
  assert(shifted > 300, 'i muri devono davvero spostarsi (' + shifted + ')');
  ok('muri mobili: ' + shifted + ' cambi in 300 turni, invarianti sempre rispettati');
}

// 2b) Sala di prova: un piccolo labirinto dove si cammina mentre aspettano gli amici
{
  const r = createRoom('LOBB'); const ps = []; for (let i = 0; i < 3; i++) ps.push(addPlayer(r, stub(), 'P' + i));
  assert.strictEqual(r.st, 'lobby'); assert(r.lobbyL && r.lobbyL.N <= 15, 'la sala di prova è piccola');
  const msg = S.levelMsg(r, r.lobbyL); assert.strictEqual(msg.lv, 0); assert.strictEqual(msg.doors.length, 0);
  const g = r.lobbyL.g, N = r.lobbyL.N, startIdx = 1 * N + 1;
  const d = bfs(g, N, startIdx, (i) => passable(g[i])); assert(!Array.from(d).some((v, i) => passable(g[i]) && v < 0), 'sala di prova tutta raggiungibile');
  const p = ps[0], x0 = p.x, y0 = p.y;
  p.a = r.lobbyL.start.a; p.in.f = 1;
  for (let i = 0; i < 20; i++) step(r, 1 / 30);
  assert(Math.hypot(p.x - x0, p.y - y0) > 0.5, 'in sala di prova ci si muove');
  for (let k = 0; k < 600; k++) { p.a = Math.random() * 6.28; p.in.f = 1; p.in.s = Math.random() - 0.5; step(r, 1 / 30); assert(g[Math.floor(p.y) * N + Math.floor(p.x)] === 0, 'dentro un muro'); }
  const lid0 = r.lid; startGame(r);
  assert(r.lid > lid0 && r.st === 'play' && r.L, 'con Inizia si passa al livello vero');
  for (const q of r.players.values()) assert.strictEqual(Math.hypot(q.x - r.L.start.x, q.y - r.L.start.y) < 0.6, true, 'tutti alla partenza del livello vero');
  ok('sala di prova: si cammina nel piccolo labirinto, poi Inizia porta tutti al livello 1');
}

// helper: stanza pronta con 4 giocatori e senza mostro
function room4() {
  const r = createRoom('T' + Math.random()); r.noMonster = true;
  const ps = []; for (let i = 0; i < 4; i++) ps.push(addPlayer(r, stub(), 'P' + i));
  startGame(r); r.boT = 1e9; r.shT = 1e9;
  return { r, ps, L: r.L };
}
const tp = (p, x, y) => { p.x = x; p.y = y; };
const press = (r, p) => { p.edge = true; step(r, 1 / 30); };

// 3) Porte a doppio pulsante
{
  const { r, ps, L } = room4();
  const d = L.doors[0], [b0, b1] = d.btns.map((id) => L.buttons[id]);
  // stessa persona non basta
  tp(ps[0], b0.x, b0.y); press(r, ps[0]); step(r, 0.5); tp(ps[0], b1.x, b1.y); press(r, ps[0]);
  assert.strictEqual(L.g[d.i], d.v, 'una sola persona non deve aprire');
  ok('porta: una persona sola non apre');
  step(r, 3);
  // due persone ma troppo distanti nel tempo
  tp(ps[0], b0.x, b0.y); tp(ps[1], b1.x, b1.y);
  press(r, ps[0]); step(r, 2); press(r, ps[1]);
  assert.strictEqual(L.g[d.i], d.v, 'pressioni distanti nel tempo non aprono');
  ok('porta: pressioni a più di 1,5 s non aprono');
  step(r, 3);
  // due persone insieme
  press(r, ps[0]); step(r, 0.5); press(r, ps[1]);
  assert.strictEqual(L.g[d.i], 0, 'due pulsanti insieme devono aprire');
  assert(r.tiles.some((t) => t[0] === d.x && t[1] === d.y && t[2] === 0));
  ok('porta: due giocatori su due pulsanti la aprono');
  // si richiude dopo 8 s
  step(r, 7); assert.strictEqual(L.g[d.i], 0);
  step(r, 1.5); assert.strictEqual(L.g[d.i], d.v);
  ok('porta: si richiude dopo 8 secondi');
  // non si richiude addosso a qualcuno
  press(r, ps[0]); step(r, 0.3); press(r, ps[1]);
  assert.strictEqual(L.g[d.i], 0);
  tp(ps[2], d.x + 0.5, d.y + 0.5);
  step(r, 9); assert.strictEqual(L.g[d.i], 0, 'non deve chiudersi con qualcuno nel varco');
  tp(ps[2], b0.x, b0.y); step(r, 1); assert.strictEqual(L.g[d.i], d.v);
  ok('porta: aspetta se qualcuno è nel varco');
}

// 4) Uscita solo con tutti
{
  const { r, ps, L } = room4();
  const ex = L.exitDoor;
  const ax = (ex.a % L.N) + 0.5, ay = ((ex.a / L.N) | 0) + 0.5;
  for (let i = 0; i < 3; i++) tp(ps[i], ax, ay);
  tp(ps[3], 1.5, 1.5);
  step(r, 3); assert.strictEqual(L.g[ex.i], ex.v, 'manca uno: non deve aprirsi');
  assert.strictEqual(r.winT, 0);
  ok('uscita: con un giocatore lontano resta chiusa');
  tp(ps[3], ax, ay); ps[3].chained = true;
  step(r, 3); assert.strictEqual(L.g[ex.i], ex.v, 'incatenato non conta');
  ok('uscita: un giocatore incatenato non conta come presente');
  ps[3].chained = false;
  step(r, 1.5);
  assert.strictEqual(L.g[ex.i], 0); assert(r.winT > 0);
  ok('uscita: con tutti presenti si apre');
  const lv1 = r.level; step(r, 3);
  assert.strictEqual(r.level, lv1 + 1); assert.strictEqual(r.st, 'play');
  assert(r.L.N >= L.N);
  ok('si passa al livello successivo, più grande');
  // ultimo livello -> fine
  r.level = constants.LEVELS; r.winT = 0.01; step(r, 0.1);
  assert.strictEqual(r.st, 'over');
  ok('dopo l\'ultimo livello la partita finisce');
}

// 5) Mostro: incatena, si libera, tutti incatenati -> si ricomincia
{
  const r = createRoom('MOST'); for (let i = 0; i < 4; i++) addPlayer(r, stub(), 'P' + i);
  startGame(r); r.boT = 1e9; r.shT = 1e9;
  const [a, b, c, d] = [...r.players.values()]; let L = r.L, m = r.monster;
  assert(m, 'mostro presente');
  for (const p of r.players.values()) p.imm = 0;
  // mostro lontano → si avvicina da solo
  // (insegue il giocatore più vicino, non per forza "a": confronto la distanza minima)
  // distanza lungo il percorso del labirinto (in linea d'aria può anche aumentare mentre aggira i muri)
  const minD = () => { const d = bfs(r.L.g, r.L.N, S.tileOf(r.L, m.x, m.y), (i) => passable(r.L.g[i])); return Math.min(...[...r.players.values()].map((p) => d[S.tileOf(r.L, p.x, p.y)])); };
  const startD = minD();
  m.stun = 0; m.stumbleT = 1e9;
  for (let i = 0; i < 30 * 8; i++) step(r, 1 / 30);
  assert(minD() < startD || [...r.players.values()].some((p) => p.chained), 'il mostro insegue');
  L = r.L; m = r.monster;   // il livello può essere ricominciato se il mostro li ha presi tutti
  ok('mostro: insegue i giocatori');
  // incatenamento
  for (const p of r.players.values()) { p.chained = false; p.imm = 0; }
  m.stun = 0; m.stumbleT = 1e9; m.x = a.x + 0.3; m.y = a.y;
  // gli altri stanno lontano sia da lui sia dal mostro (tile di pavimento più isolato)
  let far = { x: 1.5, y: 1.5, s: -1 };
  for (let i = 0; i < L.g.length; i++) if (L.g[i] === 0) {
    const x = (i % L.N) + 0.5, y = ((i / L.N) | 0) + 0.5, sc = Math.min(Math.hypot(x - a.x, y - a.y), Math.hypot(x - L.monsterStart.x, y - L.monsterStart.y));
    if (sc > far.s) far = { x, y, s: sc };
  }
  tp(b, far.x, far.y); tp(c, far.x, far.y); tp(d, far.x, far.y);
  step(r, 1 / 30);
  assert.strictEqual(a.chained, true); assert(r.ev.some((e) => e.k === 'chain'));
  ok('mostro: tocca e incatena');
  // in coppia (compagno libero entro 5 tile) il mostro non può incatenare; da solo sì
  for (const q of r.players.values()) { q.chained = false; q.imm = 0; }
  a.chained = false; tp(b, a.x + 1.5, a.y); m.stun = 0; m.stumbleT = 1e9; m.x = a.x + 0.3; m.y = a.y;
  for (const q of [c, d]) tp(q, far.x, far.y);
  r.ev = []; for (let i = 0; i < 30; i++) step(r, 1 / 30);
  assert.strictEqual(a.chained, false, 'in coppia non si viene incatenati');
  assert(!r.ev.some((e) => e.k === 'chain'));
  assert.strictEqual(snapshot(r).m[2], 1, 'il mostro mostra di non poter attaccare');
  ok('mostro: non attacca chi ha un compagno vicino');
  tp(b, far.x, far.y);                               // a resta solo
  m.x = a.x + 0.3; m.y = a.y; m.stun = 0;
  step(r, 1 / 30);
  assert.strictEqual(a.chained, true, 'da solo si viene incatenati');
  ok('mostro: attacca chi è solo');
  for (const q of r.players.values()) { q.chained = false; }
  a.chained = true; m.x = a.x + 0.3; m.y = a.y; m.stun = 0;   // ripristino lo stato atteso dai test seguenti
  // l'incatenato non si muove
  a.in.f = 1; a.a = 0; const ax0 = a.x; for (let i = 0; i < 10; i++) step(r, 1 / 30);
  assert.strictEqual(a.x, ax0);
  ok('incatenato: non può muoversi');
  // liberazione: serve restare 3 secondi
  m.stun = 0; m.x = L.monsterStart.x; m.y = L.monsterStart.y;
  tp(b, a.x + 0.8, a.y); b.in.u = true;
  for (let i = 0; i < 30 * 2; i++) step(r, 1 / 30);
  assert.strictEqual(a.chained, true, 'dopo 2s è ancora incatenato');
  let guard = 0; while (a.chained && guard++ < 200) step(r, 1 / 30);
  assert.strictEqual(a.chained, false); assert(m.stun > 2.5, 'stun ' + m.stun);
  assert(r.ev.some((e) => e.k === 'free'));
  ok('liberazione: dopo 3 secondi il compagno libera e il mostro è stordito');
  // senza compagno vicino il progresso cala
  for (const p of r.players.values()) { p.chained = false; p.fr = 0; }
  a.chained = true; b.in.u = false; a.fr = 0.5; for (let i = 0; i < 30 * 2; i++) step(r, 1 / 30);
  assert(a.fr < 0.1); ok('liberazione: il progresso cala se il compagno si allontana');
  // tutti incatenati -> ricomincia
  b.in.u = false; for (const p of r.players.values()) { p.chained = true; }
  const seed0 = r.L.seed;
  step(r, 1 / 30); assert(r.resetT > 0); assert(r.ev.some((e) => e.k === 'reset'));
  for (let i = 0; i < 30 * 3.5; i++) step(r, 1 / 30);
  assert.notStrictEqual(r.L.seed, seed0); assert([...r.players.values()].every((p) => !p.chained));
  ok('tutti incatenati: il livello ricomincia');
}

// 6) Torcia e blackout
{
  const { r, ps, L } = room4();
  const t = L.torches[0];
  tp(ps[0], t.x, t.y); press(r, ps[0]);
  assert.strictEqual(ps[0].it, 'torch'); assert(!L.torches.includes(t));
  ok('torcia: si raccoglie');
  tp(ps[1], t.x, t.y); const before = L.torches.length;
  ps[1].it = 'torch'; press(r, ps[1]); assert.strictEqual(L.torches.length, before);
  ps[1].it = null;
  ok('un solo oggetto per volta');
  tp(ps[0], 5.5, 1.5); dropItem(r, ps[0]);
  assert.strictEqual(ps[0].it, null); assert(L.torches.some((x) => Math.hypot(x.x - 5.5, x.y - 1.5) < 0.01));
  tp(ps[2], 5.5, 1.5); press(r, ps[2]); assert.strictEqual(ps[2].it, 'torch');
  ok('torcia: si lascia a terra e un compagno la raccoglie');
  r.boT = 0.01; step(r, 0.1);
  assert(r.boLeft > 20); assert(snapshot(r).bo > 20);
  step(r, 26); assert.strictEqual(r.boLeft <= 0, true); assert(r.boT > 50);
  ok('blackout: parte, dura circa 25 secondi, poi le luci tornano');
}

// 7) Snapshot e messaggi
{
  const { r, ps } = room4();
  const s = snapshot(r); assert.strictEqual(s.p.length, 4); assert.strictEqual(s.st, 'play');
  const lm = S.levelMsg(r); assert.strictEqual(lm.g.length, lm.N * lm.N); assert.strictEqual(lm.bt.length, 4);
  assert(JSON.stringify(s).length < 900, 'snapshot troppo grande: ' + JSON.stringify(s).length);
  ok('snapshot ' + JSON.stringify(s).length + ' byte, messaggio di livello ' + JSON.stringify(lm).length + ' byte');
}

console.log('\n' + n + ' test OK');
