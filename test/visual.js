'use strict';
// Schermate di controllo: porta, pulsanti, torcia, mostro, incatenato, blackout.
// Uso: NODE_PATH=/opt/npm-tools/node_modules node test/visual.js <cartella>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const out = process.argv[2] || '/tmp', PORT = 3202;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, MAXP: '4' }, stdio: 'inherit' });
  await sleep(700);
  const br = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox'] });
  const mk = async (n) => { const c = await br.newContext({ viewport: { width: 1000, height: 640 }, permissions: ['microphone'] }); const p = await c.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); await p.goto('http://localhost:' + PORT); await p.fill('#name', n); return p; };
  const A = await mk('Owe'), B = await mk('Amico'), C = await mk('Giulia'), D = await mk('Marco');
  await A.click('#btnCreate'); await A.waitForFunction(() => __lab.S, null, { timeout: 8000 });
  const code = await A.textContent('#lcode');
  for (const P of [B, C, D]) { await P.fill('#code', code); await P.click('#btnJoin'); }
  await A.waitForFunction(() => __lab.S.p.length === 4, null, { timeout: 8000 });
  await A.click('#btnStart'); await A.waitForFunction(() => __lab.G && __lab.S.st === 'play', null, { timeout: 8000 });
  await sleep(500);
  const info = await A.evaluate(() => ({ N: __lab.G.N, doors: __lab.G.doors, bt: __lab.G.bt }));
  console.log('griglia', info.N, 'porte', info.doors.length, 'pulsanti', info.bt.length);
  // congela gli snapshot e costruisco scene a mano
  const shot = async (name, scene) => {
    await A.evaluate((sc) => {
      const L = __lab, g = L.G.g, N = L.G.N; L.dbg.freeze = true;
      const S0 = JSON.parse(JSON.stringify(L.S)); S0.bo = 0; S0.tc = []; S0.pb = []; S0.m = null; S0.ex = [0, 4];
      const open = (x, y) => g[y * N + x] === 0;
      // trova una porta e una direzione libera davanti
      const dr = L.G.doors[sc.door ?? 0]; const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      if (sc.straight) {
        outer: for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) for (const [dx, dy] of dirs) {
          let ok = true; for (let k = 0; k < sc.straight; k++) { const xx = x + dx * k, yy = y + dy * k; if (xx < 1 || yy < 1 || xx >= N - 1 || yy >= N - 1 || g[yy * N + xx] !== 0) { ok = false; break; } }
          if (ok) { sc.__s = { x, y, dir: [dx, dy] }; break outer; }
        }
      }
      let dir = dirs.find(([dx, dy]) => open(dr.x - dx, dr.y - dy) && open(dr.x - 2 * dx, dr.y - 2 * dy)) || dirs[0];
      const back = sc.back ?? 2;
      if (sc.__s) { dir = sc.__s.dir; L.me.x = sc.__s.x + 0.5; L.me.y = sc.__s.y + 0.5; }
      else { L.me.x = dr.x + 0.5 - dir[0] * back; L.me.y = dr.y + 0.5 - dir[1] * back; }
      L.me.a = Math.atan2(dir[1], dir[0]);
      const my = S0.p[0]; my.x = L.me.x; my.y = L.me.y;
      const ahead = (d, side) => ({ x: L.me.x + dir[0] * d - dir[1] * side, y: L.me.y + dir[1] * d + dir[0] * side });
      sc.apply && eval('(' + sc.apply + ')')(S0, L, ahead, my);
      L.S = S0; L.dbg.force = sc.force || 0;
    }, scene);
    await sleep(900);
    await A.screenshot({ path: path.join(out, name + '.png') });
  };
  await shot('v1-porta', { door: 0, back: 2.2 });
  await shot('v2-uscita', { door: 2, back: 2.2 });
  await shot('v3-mostro-e-incatenato', { straight: 7, apply: `(S0, L, ahead, my) => {
      const m = ahead(3.4, 0); S0.m = [m.x, m.y, 0];
      const p1 = ahead(2.0, 0.0); S0.p[1].x = p1.x; S0.p[1].y = p1.y; S0.p[1].ch = 1; S0.p[1].fr = 0.45; S0.p[1].sy = 0;
      const t = ahead(0.9, 0); S0.tc = [[t.x, t.y]];
    }` });
  await shot('v4-pulsanti-torcia', { door: 1, back: 1.5, apply: `(S0, L, ahead, my) => {
      const t = ahead(0.9, 0); S0.tc = [[t.x, t.y]];
      const b = ahead(1.2, 0.0); L.G.bt[0].x = b.x; L.G.bt[0].y = b.y; L.G.bt[1].x = b.x + 0; L.G.bt[1].y = b.y; S0.pb = [L.G.bt[1].id];
      S0.p[2].x = ahead(2.2, 0).x; S0.p[2].y = ahead(2.2, 0).y; S0.p[2].it = 1; S0.p[2].sy = 1;
    }` });
  await shot('v5-blackout-con-torcia', { door: 0, back: 2.6, force: 6.5, apply: `(S0, L, ahead, my) => {
      S0.bo = 18; my.it = 1; const p = ahead(2.5, 0); S0.p[1].x = p.x; S0.p[1].y = p.y;
      const m = ahead(4.6, 0); S0.m = [m.x, m.y, 0];
    }` });
  await shot('v6-blackout-senza-torcia', { door: 0, back: 2.0, force: 1.9, apply: `(S0, L, ahead, my) => { S0.bo = 18; const p = ahead(1.5, 0); S0.p[1].x = p.x; S0.p[1].y = p.y; }` });
  console.log('errori JS:', [...A.errs, ...B.errs].join(' | ') || 'nessuno');
  await br.close(); srv.kill(); process.exit(0);
})();
