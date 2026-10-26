'use strict';
// Test end-to-end con 2 browser veri (Chromium headless, microfono finto):
// lobby, avvio, rendering, movimento, collegamento vocale WebRTC e audio che arriva.
// Uso: NODE_PATH=/opt/npm-tools/node_modules node test/e2e.js [cartella-screenshot]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const shots = process.argv[2] || '/tmp';
const PORT = 3201, URL = 'http://localhost:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (c, msg) => { console.log((c ? '  ok   - ' : '  FAIL - ') + msg); if (!c) fails++; };

(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT }, stdio: 'inherit' });
  await sleep(800);
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
  const mk = async (name, mobile) => {
    const ctx = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, permissions: ['microphone'] }
      : { viewport: { width: 1000, height: 640 }, permissions: ['microphone'] });
    const page = await ctx.newPage(); page.errs = [];
    page.on('pageerror', (e) => page.errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') page.errs.push('console: ' + m.text()); });
    await page.goto(URL); await page.fill('#name', name);
    return page;
  };
  try {
    const A = await mk('Owe'), B = await mk('Amico', true);
    await A.click('#btnCreate');
    await A.waitForFunction(() => document.getElementById('lcode').textContent.length === 4 && __lab.S, null, { timeout: 8000 });
    const code = await A.textContent('#lcode');
    check(/^[A-Z]{4}$/.test(code), 'stanza creata con codice ' + code);
    await B.fill('#code', code); await B.click('#btnJoin');
    await B.waitForFunction(() => __lab.S && __lab.S.p.length === 2, null, { timeout: 8000 });
    check(true, 'B è entrato nella stanza dal telefono (viewport mobile)');
    // sala di prova: mentre aspettano gli amici si cammina in un piccolo labirinto
    await A.waitForFunction(() => __lab.G && __lab.G.lv === 0 && !__lab.needSnap, null, { timeout: 8000 });
    await sleep(500);
    const w0 = await A.evaluate(() => ({ x: __lab.me.x, y: __lab.me.y, N: __lab.G.N }));
    check(w0.N <= 15, 'sala di prova: piccolo labirinto ' + w0.N + 'x' + w0.N);
    await A.screenshot({ path: path.join(shots, 'pc-sala-di-prova.png') });
    await A.keyboard.down('KeyW'); await sleep(600); await A.keyboard.up('KeyW'); await sleep(400);
    const w1 = await A.evaluate(() => ({ x: __lab.me.x, y: __lab.me.y }));
    check(Math.hypot(w1.x - w0.x, w1.y - w0.y) > 0.5, 'sala di prova: A cammina (' + Math.hypot(w1.x - w0.x, w1.y - w0.y).toFixed(2) + ' tile)');
    const seenLobby = await B.evaluate((id) => { const a = __lab.S.p.find((p) => p.i !== __lab.Voice.myId); return { x: a.x, y: a.y }; });
    check(Math.hypot(seenLobby.x - w1.x, seenLobby.y - w1.y) < 0.8, 'sala di prova: B vede A nella nuova posizione');
    await A.click('#btnStart');
    await A.waitForFunction(() => __lab.G && __lab.G.lv === 1 && __lab.S.st === 'play', null, { timeout: 8000 });
    await B.waitForFunction(() => __lab.G && __lab.G.lv === 1 && __lab.S.st === 'play', null, { timeout: 8000 });
    await sleep(300);
    const g = await A.evaluate(() => ({ N: __lab.G.N, th: __lab.G.th, st: __lab.S.st }));
    check(g.N === 17, 'livello 1 per 2 giocatori: griglia ' + g.N + 'x' + g.N + ' (con 4 giocatori è 21x21)');
    await sleep(600);
    await A.screenshot({ path: path.join(shots, 'pc-livello1.png') });
    await B.screenshot({ path: path.join(shots, 'mobile-livello1.png') });

    // movimento: tengo premuto W su A e controllo che il server lo registri
    const p0 = await A.evaluate(() => ({ x: __lab.me.x, y: __lab.me.y }));
    await A.keyboard.down('KeyW'); await sleep(900); await A.keyboard.up('KeyW');
    await sleep(300);
    const p1 = await A.evaluate(() => { const m = __lab.S.p.find((p) => p.i === __lab.Voice.myId); return { x: __lab.me.x, y: __lab.me.y, sx: m.x, sy: m.y }; });
    const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    check(moved > 1.5, 'movimento: A avanza di ' + moved.toFixed(2) + ' tile in 0,9 s (atteso ~2,5, con le pareti meno)');
    check(Math.hypot(p1.x - p1.sx, p1.y - p1.sy) < 0.8, 'predizione client e posizione del server coincidono');
    // B (telefono) vede A muoversi
    const seen = await B.evaluate(() => { const a = __lab.S.p.find((p) => p.i !== __lab.Voice.myId); return { x: a.x, y: a.y }; });
    check(Math.hypot(seen.x - p1.sx, seen.y - p1.sy) < 0.6, 'B vede la posizione aggiornata di A');
    // rotazione con le frecce
    const a0 = await A.evaluate(() => __lab.me.a); await A.keyboard.down('ArrowRight'); await sleep(400); await A.keyboard.up('ArrowRight');
    const a1 = await A.evaluate(() => __lab.me.a); check(a1 - a0 > 0.7, 'rotazione con le frecce (+' + (a1 - a0).toFixed(2) + ' rad)');

    // voce WebRTC
    await A.waitForFunction(() => { const V = __lab.Voice; return V.peers.size === 1 && V.status([...V.peers.keys()][0]) === 'ok'; }, null, { timeout: 15000 }).catch(() => {});
    await B.waitForFunction(() => { const V = __lab.Voice; return V.peers.size === 1 && V.status([...V.peers.keys()][0]) === 'ok'; }, null, { timeout: 15000 }).catch(() => {});
    const va = await A.evaluate(() => ({ mic: __lab.Voice.mic, st: [...__lab.Voice.peers.values()].map((p) => p.state) }));
    const vb = await B.evaluate(() => ({ mic: __lab.Voice.mic, st: [...__lab.Voice.peers.values()].map((p) => p.state) }));
    check(va.mic === 'ok' && vb.mic === 'ok', 'microfono ottenuto da entrambi');
    check(va.st[0] === 'connected' && vb.st[0] === 'connected', 'chat vocale WebRTC collegata (A: ' + va.st + ', B: ' + vb.st + ')');
    // audio che arriva davvero: il microfono finto produce un tono, l'analisi deve vederlo almeno una volta
    let heard = false;
    for (let i = 0; i < 80 && !heard; i++) { heard = await B.evaluate(() => [...__lab.Voice.peers.values()].some((p) => p.speaking)); if (!heard) await sleep(150); }
    check(heard, 'B sente la voce di A (segnale audio rilevato dall\'analizzatore)');
    // silenzio
    await A.evaluate(() => document.getElementById('bMute').click());
    await sleep(900);
    const mutedState = await A.evaluate(() => __lab.Voice.muted); check(mutedState === true, 'pulsante muto');
    // voce di prossimità: guadagno cala con la distanza (parametri letti dai nodi)
    await A.evaluate(() => document.getElementById('bMute').click());
    const gains = await B.evaluate(async () => {
      const V = __lab.Voice, P = [...V.peers.values()][0], me = __lab.me, orig = V.update;
      V.update = () => {};                       // fermo il ciclo di gioco mentre misuro
      const read = async (x, y, occ) => { orig(me, () => ({ x, y }), () => occ); await new Promise((r) => setTimeout(r, 500)); return [P.nodes.gain.gain.value, P.nodes.lp.frequency.value]; };
      const near = (await read(me.x + 1, me.y, false))[0], far = (await read(me.x + 13, me.y, false))[0];
      const wall = await read(me.x + 4, me.y, true);
      V.update = orig;
      return { near, far, lpWall: wall[1] };
    });
    check(gains.near > 0.9 && gains.far < 0.2, 'voce di prossimità: vicino ' + gains.near.toFixed(2) + ', lontano ' + gains.far.toFixed(2));
    check(gains.lpWall < 3000, 'voce attutita dietro un muro (filtro a ' + Math.round(gains.lpWall) + ' Hz)');

    // pulsanti touch visibili su telefono
    const touchVis = await B.evaluate(() => getComputedStyle(document.getElementById('touch')).display);
    check(touchVis === 'block', 'controlli touch visibili sul telefono');

    // blackout, torcia, incatenato: li provo forzando lo stato lato server tramite eventi veri sono nei test logici;
    // qui guardo che il rendering col buio non produca errori
    await A.evaluate(() => { __lab.S.bo = 20; }); await sleep(1500);
    await A.screenshot({ path: path.join(shots, 'pc-blackout.png') });

    const errsA = A.errs.filter((e) => !/favicon/.test(e)), errsB = B.errs.filter((e) => !/favicon/.test(e));
    check(errsA.length === 0 && errsB.length === 0, 'nessun errore JavaScript nei browser' + (errsA.length + errsB.length ? ': ' + [...errsA, ...errsB].join(' | ') : ''));
  } catch (e) { console.log('ERRORE TEST:', e.message); fails++; }
  await browser.close(); srv.kill();
  console.log(fails ? '\n' + fails + ' CONTROLLI FALLITI' : '\nE2E OK');
  process.exit(fails ? 1 : 0);
})();
