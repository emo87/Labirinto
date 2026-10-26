'use strict';
// Labirinto — client: raycasting, input, HUD, effetti sonori
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EM = ['🤠', '👩‍🍳', '🧑‍🔧', '🥷', '🤡', '🧑‍🚀'];
const COL = ['#ffd24a', '#7ee081', '#6ec1ff', '#ff8ad8', '#ffa96b', '#c3a6ff'];
const PH = ['AIUTOOO!', 'PREMO IO!', 'ARRIVO!', 'SIETE LENTI!'];
const fmt = (sec) => Math.floor(sec / 60) + ':' + ('0' + Math.round(sec % 60)).slice(-2);   // cronometro: serve solo a sapere quanto ci avete messo
const FOVK = 0.66;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const THEMES = [
  { name: 'Cantina', kind: 'stone', walls: ['#7a6652', '#667a52', '#52667a', '#7a5266'], floor: '#4a3c30', ceil: '#2a2118', graf: ['AIUTO!', 'HO FAME', 'PER DI QUA', 'NON FIDARTI'] },
  { name: 'Supermercato', kind: 'tile', walls: ['#cfc7a8', '#a8cfc7', '#c7a8cf', '#cfa8a8'], floor: '#6a6a78', ceil: '#34343f', graf: ['OFFERTA!', 'PREZZO ?', 'A SINISTRA', 'CASSA 4'] },
  { name: 'Ospedale', kind: 'tile', walls: ['#a6cfc0', '#a6bccf', '#bccfa6', '#cfc0a6'], floor: '#76887f', ceil: '#34423e', graf: ['SILENZIO', 'ATTESA 3 ORE', 'USCITA ?', 'AIUTO!'] },
  { name: 'Castello', kind: 'brick', walls: ['#80808c', '#8c7f80', '#7f808c', '#808c7f'], floor: '#3a3a44', ceil: '#1a1a22', graf: ['TORNA INDIETRO', 'NON QUI', 'VAI A DESTRA', 'DRAGO!'] },
];

// ---------- Texture da codice ----------
function rngFn(seed) { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
function mkCanvas(s) { const c = document.createElement('canvas'); c.width = c.height = s || 64; return c; }
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shade(hex, f) { const [r, g, b] = rgb(hex); return 'rgb(' + clamp(r * f | 0, 0, 255) + ',' + clamp(g * f | 0, 0, 255) + ',' + clamp(b * f | 0, 0, 255) + ')'; }
function noise(x, R, n) { for (let i = 0; i < n; i++) { x.fillStyle = R() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.07)'; x.fillRect((R() * 64) | 0, (R() * 64) | 0, 1 + ((R() * 2) | 0), 1); } }
function wallTex(kind, color, seed) {
  const c = mkCanvas(), x = c.getContext('2d'), R = rngFn(seed);
  x.fillStyle = shade(color, 0.5); x.fillRect(0, 0, 64, 64);
  if (kind === 'brick' || kind === 'stone') {
    const rows = kind === 'brick' ? 4 : 3, rh = 64 / rows, bw = kind === 'brick' ? 32 : 40;
    for (let r = 0; r < rows; r++) for (let k = -1; k < 3; k++) {
      const off = (r % 2) * bw / 2 + (kind === 'stone' ? (R() * 8) | 0 : 0);
      x.fillStyle = shade(color, 0.8 + R() * 0.35);
      x.fillRect(k * bw + off + 1, r * rh + 1, bw - 2, rh - 2);
    }
  } else {
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      x.fillStyle = shade(color, 0.92 + R() * 0.12); x.fillRect(tx * 16 + 1, ty * 16 + 1, 14, 14);
      x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(tx * 16 + 1, ty * 16 + 1, 14, 1);
    }
  }
  noise(x, R, 260);
  return c;
}
function decorTex(idx, th) {
  const T = THEMES[th], c = wallTex(T.kind, T.walls[0], 77 + idx), x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (idx === 5) { // quadro con paesaggio
    x.fillStyle = '#5a3a1e'; x.fillRect(10, 12, 44, 34);
    x.fillStyle = '#7ec8ff'; x.fillRect(14, 16, 36, 15); x.fillStyle = '#5cae4a'; x.fillRect(14, 31, 36, 11);
    x.fillStyle = '#ffe36b'; x.beginPath(); x.arc(40, 22, 4, 0, 7); x.fill();
  } else if (idx === 6) { // ritratto con baffi
    x.fillStyle = '#c9a227'; x.fillRect(14, 8, 36, 46); x.fillStyle = '#3b2a4a'; x.fillRect(18, 12, 28, 38);
    x.fillStyle = '#ffd9a0'; x.beginPath(); x.arc(32, 30, 11, 0, 7); x.fill();
    x.fillStyle = '#222'; x.fillRect(27, 26, 3, 3); x.fillRect(35, 26, 3, 3); x.fillRect(26, 34, 13, 3);
  } else if (idx === 7) { // lampada
    const gr = x.createRadialGradient(32, 28, 2, 32, 28, 28); gr.addColorStop(0, 'rgba(255,240,150,.95)'); gr.addColorStop(1, 'rgba(255,220,100,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); x.fillStyle = '#fff6b0'; x.fillRect(26, 14, 12, 28); x.fillStyle = '#3a3a3a'; x.fillRect(24, 10, 16, 5); x.fillRect(24, 41, 16, 4);
  } else { // scritta comica
    x.fillStyle = '#d83a3a'; x.font = 'bold 13px sans-serif';
    const words = T.graf[(th + idx) % 4].split(' ');
    words.forEach((w, i) => x.fillText(w, 32, 32 + (i - (words.length - 1) / 2) * 15));
  }
  return c;
}
function doorTex(accent, label) {
  const c = mkCanvas(), x = c.getContext('2d');
  x.fillStyle = '#4e5058'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#3a3c42'; x.fillRect(0, 0, 64, 5); x.fillRect(0, 59, 64, 5); x.fillRect(0, 0, 5, 64); x.fillRect(59, 0, 5, 64);
  x.fillStyle = accent; x.fillRect(8, 8, 48, 6); x.fillRect(8, 50, 48, 6);
  x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(8, 16, 22, 32); x.fillRect(34, 16, 22, 32);
  x.fillStyle = accent; x.beginPath(); x.arc(24, 32, 4, 0, 7); x.arc(40, 32, 4, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 11px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 32, 44);
  return c;
}
function exitTex() {
  const c = mkCanvas(), x = c.getContext('2d');
  x.fillStyle = '#2d7d3f'; x.fillRect(0, 0, 64, 64);
  for (let i = -4; i < 12; i++) { x.fillStyle = i % 2 ? '#ffd24a' : '#222'; x.beginPath(); x.moveTo(i * 8, 0); x.lineTo(i * 8 + 8, 0); x.lineTo(i * 8 - 8, 8); x.lineTo(i * 8 - 16, 8); x.fill(); x.beginPath(); x.moveTo(i * 8, 56); x.lineTo(i * 8 + 8, 56); x.lineTo(i * 8 - 8, 64); x.lineTo(i * 8 - 16, 64); x.fill(); }
  x.fillStyle = '#e8ffe8'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('USCITA', 32, 26); x.fillText('TUTTI!', 32, 42);
  return c;
}
let TEX = [], texTheme = -1;
function buildTex(th) {
  if (th === texTheme) return; texTheme = th;
  const T = THEMES[th]; TEX = [null];
  for (let z = 0; z < 4; z++) TEX.push(wallTex(T.kind, T.walls[z], 11 + z * 7 + th));
  for (let d = 5; d <= 8; d++) TEX.push(decorTex(d, th));
  TEX.push(doorTex('#e04a3a', 'x2'), doorTex('#3a82e0', 'x2'), exitTex());
  bgKey = '';
}

// ---------- Sprite emoji ----------
const spriteCache = new Map();
function emojiCanvas(key, draw) {
  let c = spriteCache.get(key);
  if (!c) { c = mkCanvas(96); const x = c.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle'; draw(x); spriteCache.set(key, c); }
  return c;
}
function emo(x, ch, px, py, size) { x.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.fillText(ch, px, py); }
const playerSprite = (e, ch, it) => emojiCanvas('p' + e + ch + it, (x) => { emo(x, EM[e], 48, ch ? 38 : 46, 64); if (ch) emo(x, '⛓️', 48, 76, 34); if (it) emo(x, '🔦', 80, 62, 28); });
const monsterSprite = (st) => emojiCanvas('m' + st, (x) => emo(x, st ? '🥴' : '👹', 48, 50, 84));
const torchSprite = () => emojiCanvas('t', (x) => emo(x, '🔦', 48, 50, 76));
const buttonSprite = (d, on) => emojiCanvas('b' + d + on, (x) => emo(x, on ? '🟢' : (d === 0 ? '🔴' : '🔵'), 48, 50, 76));

// ---------- Stato ----------
const cv = $('cv'), ctx = cv.getContext('2d');
const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
const bg = document.createElement('canvas'), bgctx = bg.getContext('2d');
let ws = null, myId = null, code = '', S = null, G = null, needSnap = true;
let cw = 0, ch = 0, dpr = 1, zbuf = new Float32Array(1), bgKey = '';
const me = { x: 1.5, y: 1.5, a: 0 };
const disp = new Map();
const toasts = [];
let shakeT = 0, lightCur = 10, lastLvl = 0, thumpT = 0, vigKey = '', vig = null, lastUi = '', lastSent = '', lastSendT = 0, voiceT = 0;
const keys = new Set(); let useHeld = false, locked = false;
const T = { move: null, look: null };

function toast(text, ms, color) { toasts.push({ text, t: ms || 2600, max: ms || 2600, color: color || '#fff' }); if (toasts.length > 4) toasts.shift(); }
const myP = () => (S ? S.p.find((p) => p.i === myId) : null);
const nameOf = (id) => { const p = S && S.p.find((q) => q.i === id); return p ? p.n : '?'; };

// ---------- Suoni (Web Audio, volumi bassi per non coprire le voci) ----------
const SFX = {
  buf: null,
  pv(x, y) { if (x == null) return 1; return Math.pow(clamp(1 - (Math.hypot(x - me.x, y - me.y) - 1) / 14, 0, 1), 1.6); },
  tone(f, d, type, v, slide) {
    const ac = Voice.ac; if (!ac || v < 0.002) return; const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.03);
  },
  noise(d, v, fc) {
    const ac = Voice.ac; if (!ac || v < 0.002) return; const t = ac.currentTime;
    if (!this.buf) { this.buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const a = this.buf.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(); s.buffer = this.buf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fc;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.15, d / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + d + 0.05);
  },
  play(k, x, y) {
    const p = this.pv(x, y);
    switch (k) {
      case 'btn': this.tone(660, 0.12, 'square', 0.05 * p); break;
      case 'door': this.tone(180, 0.55, 'sawtooth', 0.06 * p, 0.4); this.noise(0.5, 0.05 * p, 700); break;
      case 'doorclose': this.tone(120, 0.3, 'square', 0.05 * p, 0.5); break;
      case 'chain': for (let i = 0; i < 4; i++) setTimeout(() => this.tone(1300 + i * 150, 0.07, 'square', 0.04 * Math.max(p, 0.4)), i * 70); this.noise(0.3, 0.05, 2500); break;
      case 'free': [520, 660, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'triangle', 0.06 * Math.max(p, 0.5)), i * 90)); break;
      case 'rumble': this.noise(3.2, 0.2, 150); this.tone(55, 3, 'sawtooth', 0.05, 0.6); break;
      case 'shift': this.noise(0.5, 0.14, 350); break;
      case 'blackout': this.tone(110, 1.3, 'sawtooth', 0.07, 0.3); break;
      case 'lights': this.tone(440, 0.25, 'sine', 0.05); break;
      case 'torch': this.tone(880, 0.12, 'triangle', 0.06); setTimeout(() => this.tone(1320, 0.15, 'triangle', 0.05), 90); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.07), i * 120)); break;
      case 'reset': this.tone(200, 0.7, 'sawtooth', 0.07, 0.3); break;
      case 'stumble': this.tone(380, 0.3, 'square', 0.05 * p, 0.35); break;
      case 'thump': this.tone(70, 0.14, 'sine', 0.2 * p); break;
    }
  },
};

// ---------- Rete ----------
function connect(first) {
  const name = $('name').value.trim() || 'Anonimo';
  try { localStorage.setItem('lab_name', name); } catch (e) {}
  $('err').textContent = '';
  Voice.unlock();
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => ws.send(JSON.stringify(first(name)));
  ws.onmessage = async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'joined') {
      myId = m.id; code = m.code; Voice.myId = myId; Voice.send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
      $('menu').style.display = 'none'; $('hudBtns').style.display = 'flex';
      history.replaceState(null, '', '?r=' + code);
      const mic = await Voice.initMic();
      if (mic !== 'ok') toast('Microfono non disponibile: potrai solo ascoltare', 5000, '#ffb46b');
    } else if (m.t === 'err') {
      $('err').textContent = m.m; if (myId === null) ws.close(); else toast(m.m, 3000, '#ff8a8a');
    } else if (m.t === 'lvl') onLevel(m);
    else if (m.t === 's') onSnapshot(m);
    else if (m.t === 'tiles') { if (G) for (const [x, y, v] of m.c) G.g[y * G.N + x] = v; }
    else if (m.t === 'ev') onEvent(m);
    else if (m.t === 'sig') Voice.onSig(m.from, m.d);
  };
  ws.onclose = () => {
    if (myId !== null) {
      myId = null; S = null; G = null;
      for (const id of [...Voice.peers.keys()]) Voice.sync([]);
      ['lobby', 'over', 'hudBtns', 'touch', 'shout'].forEach((i) => { $(i).style.display = 'none'; });
      $('menu').style.display = 'flex'; $('err').textContent = 'Connessione persa';
    }
  };
}
function onLevel(m) {
  const g = new Int8Array(m.g);
  G = { id: m.id, N: m.N, g, doors: m.doors, bt: m.bt, th: m.th, lv: m.lv, total: m.total };
  buildTex(m.th); needSnap = true; lastLvl = m.lv; zbuf = new Float32Array(Math.max(1, buf.width));
  if (m.lv === 0) toast('Sala di prova: girate e parlate finché arrivano gli amici', 4500, '#ffd24a');
  else toast('Livello ' + m.lv + ' — ' + THEMES[m.th].name, 3000, '#ffd24a');
}
function onSnapshot(m) {
  if (window.__lab && __lab.dbg.freeze) return;
  S = m;
  const my = myP();
  if (my) {
    const d = Math.hypot(my.x - me.x, my.y - me.y);
    if (needSnap) { me.x = my.x; me.y = my.y; me.a = my.a; needSnap = false; }
    else if (d > 1.2 || my.ch) { me.x = my.x; me.y = my.y; }
    else { me.x += (my.x - me.x) * 0.12; me.y += (my.y - me.y) * 0.12; }
  }
  Voice.sync(S.p.map((p) => p.i));
  const key = S.st + '|' + S.h + '|' + S.p.map((p) => p.i + p.n).join(',');
  if (key !== lastUi) { lastUi = key; syncUi(); }
}
function syncUi() {
  const isHost = S.h === myId;
  $('lobby').style.display = S.st === 'lobby' ? 'block' : 'none';
  $('lcode').textContent = S.c;
  $('lwho').innerHTML = S.p.map((p) => EM[p.e] + ' ' + p.n).join('<br>');
  $('btnStart').style.display = isHost ? '' : 'none';
  $('lhint').textContent = isHost ? (S.p.length < 2 ? 'Servono almeno 2 giocatori (' + S.p.length + '/4)' : 'Quando siete pronti, premi Inizia (' + S.p.length + '/4)') : 'In attesa che il capo avvii la partita…';
  $('over').style.display = S.st === 'over' ? 'flex' : 'none';
  $('btnAgain').style.display = isHost ? '' : 'none';
  $('owait').textContent = isHost ? '' : 'Aspetta che il capo ricominci…';
  $('otime').textContent = fmt(S.tot);
  $('olv').innerHTML = (S.lts || []).map((t, i) => 'Livello ' + (i + 1) + ': <b>' + fmt(t) + '</b>').join('<br>');
  $('touch').style.display = isTouch && (S.st === 'play' || S.st === 'lobby') ? 'block' : 'none';
}
function onEvent(e) {
  SFX.play(e.k, e.x, e.y);
  switch (e.k) {
    case 'door': toast('Porta aperta! Correte!', 2200, '#7ee081'); break;
    case 'chain': toast(e.id === myId ? 'Sei incatenato! Chiama aiuto!' : e.n + ' è incatenato! Liberalo!', 3000, '#ff8a8a'); break;
    case 'free': toast(e.id === myId ? 'Sei libero!' : e.n + ' è libero!', 2200, '#7ee081'); break;
    case 'rumble': toast('Il labirinto si muove!', 3200, '#ffb46b'); shakeT = 3.4; break;
    case 'shift': shakeT = Math.max(shakeT, 0.6); break;
    case 'blackout': toast('BLACKOUT! Cerca la torcia!', 3500, '#ff8a8a'); break;
    case 'lights': toast('Le luci sono tornate', 2200); break;
    case 'torch': if (e.id === myId) toast('Hai la torcia! (Q: lasciala)', 2800, '#ffe36b'); break;
    case 'win': toast('Livello completato in ' + fmt(e.lt) + '!', 3400, '#ffd24a'); break;
    case 'reset': toast('Siete tutti incatenati! Si ricomincia…', 3000, '#ff8a8a'); break;
    case 'stumble': break;
  }
}

// ---------- Input ----------
const say = (k) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'say', k })); };
const dropIt = () => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'drop' })); };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyE' || e.code === 'Space') { useHeld = true; e.preventDefault(); }
  if (e.code === 'KeyQ') dropIt();
  if (e.code === 'KeyM') toggleMute();
  if (e.code >= 'Digit1' && e.code <= 'Digit4') say(+e.code.slice(5) - 1);
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyE' || e.code === 'Space') useHeld = false; });
cv.addEventListener('click', () => { if (!isTouch && S && (S.st === 'play' || S.st === 'lobby') && cv.requestPointerLock) cv.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; });
document.addEventListener('mousemove', (e) => { if (locked) me.a += e.movementX * 0.0024; });
const tt = (e, fn) => { e.preventDefault(); for (const t of e.changedTouches) fn(t); };
cv.addEventListener('touchstart', (e) => tt(e, (t) => {
  if (t.clientX < innerWidth * 0.5) { if (!T.move) T.move = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; }
  else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY };
}), { passive: false });
cv.addEventListener('touchmove', (e) => tt(e, (t) => {
  if (T.move && T.move.id === t.identifier) { T.move.x = t.clientX; T.move.y = t.clientY; }
  if (T.look && T.look.id === t.identifier) { me.a += (t.clientX - T.look.x) * 0.008; T.look.x = t.clientX; T.look.y = t.clientY; }
}), { passive: false });
const tEnd = (e) => tt(e, (t) => { if (T.move && T.move.id === t.identifier) T.move = null; if (T.look && T.look.id === t.identifier) T.look = null; });
cv.addEventListener('touchend', tEnd, { passive: false }); cv.addEventListener('touchcancel', tEnd, { passive: false });
function holdBtn(id, on, off) {
  const b = $(id);
  b.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
  b.addEventListener('touchend', (e) => { e.preventDefault(); off && off(); }, { passive: false });
  b.addEventListener('mousedown', on); b.addEventListener('mouseup', () => off && off());
}
holdBtn('bUse', () => { useHeld = true; }, () => { useHeld = false; });
holdBtn('bDrop', dropIt);
$('bChat').onclick = () => { const s = $('shout'); s.style.display = s.style.display === 'flex' ? 'none' : 'flex'; };
PH.forEach((t, i) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { say(i); $('shout').style.display = 'none'; }; $('shout').appendChild(b); });
function toggleMute() { Voice.setMuted(!Voice.muted); $('bMute').textContent = Voice.muted ? '🔇 Muto' : '🎤 Mic'; $('bMute').className = Voice.muted ? 'off' : ''; }
$('bMute').onclick = toggleMute;
$('bVoice').onclick = () => { Voice.setGlobal(!Voice.global); $('bVoice').textContent = Voice.global ? '📢 Tutti' : '🔊 Vicini'; };

// menu
const qs = new URLSearchParams(location.search);
if (qs.get('r')) $('code').value = qs.get('r').toUpperCase().slice(0, 4);
try { $('name').value = localStorage.getItem('lab_name') || ''; } catch (e) {}
$('btnCreate').onclick = () => connect((name) => ({ t: 'create', name }));
$('btnJoin').onclick = () => {
  const c = $('code').value.trim().toUpperCase();
  if (c.length !== 4) { $('err').textContent = 'Il codice ha 4 lettere'; return; }
  connect((name) => ({ t: 'join', code: c, name }));
};
$('btnStart').onclick = () => ws && ws.send(JSON.stringify({ t: 'start' }));
$('btnAgain').onclick = () => ws && ws.send(JSON.stringify({ t: 'start' }));
$('btnShare').onclick = async () => {
  const url = location.origin + '/?r=' + code, text = 'Vieni nel labirinto! Codice stanza: ' + code;
  try { if (navigator.share) { await navigator.share({ title: 'Labirinto', text, url }); return; } } catch (e) {}
  try { await navigator.clipboard.writeText(url); $('btnShare').textContent = 'Link copiato!'; setTimeout(() => { $('btnShare').textContent = 'Invita amici'; }, 1500); }
  catch (e) { prompt('Copia il link:', url); }
};

// ---------- Movimento locale con predizione ----------
function blockedAt(x, y, rad) {
  const N = G.N, g = G.g, x0 = Math.floor(x - rad), x1 = Math.floor(x + rad), y0 = Math.floor(y - rad), y1 = Math.floor(y + rad);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tx < 0 || ty < 0 || tx >= N || ty >= N || g[ty * N + tx] !== 0) return true;
  return false;
}
function readInput() {
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('KeyA')) s -= 1;
  if (T.move) {
    let vx = (T.move.x - T.move.ox) / 55, vy = (T.move.y - T.move.oy) / 55; const l = Math.hypot(vx, vy);
    if (l > 0.12) { if (l > 1) { vx /= l; vy /= l; } s += vx; f -= vy; }
  }
  return { f: clamp(f, -1, 1), s: clamp(s, -1, 1) };
}
let inp = { f: 0, s: 0 };
function stepLocal(dt) {
  if (keys.has('ArrowLeft')) me.a -= 2.4 * dt;
  if (keys.has('ArrowRight')) me.a += 2.4 * dt;
  inp = readInput();
  const my = myP();
  if (!G || !S || (S.st !== 'play' && S.st !== 'lobby') || !my || my.ch || S.win || S.rs) return;
  const ca = Math.cos(me.a), sa = Math.sin(me.a);
  let vx = inp.f * ca - inp.s * sa, vy = inp.f * sa + inp.s * ca; const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
  const dx = vx * 3.2 * dt, dy = vy * 3.2 * dt;
  if (!blockedAt(me.x + dx, me.y, 0.2)) me.x += dx;
  if (!blockedAt(me.x, me.y + dy, 0.2)) me.y += dy;
}
function sendInput(t) {
  if (!ws || ws.readyState !== 1 || myId === null || !G || needSnap) return;   // finché non ho preso la posizione/direzione dal server non spedisco nulla
  const msg = { t: 'in', l: G.id, f: +inp.f.toFixed(2), s: +inp.s.toFixed(2), a: +me.a.toFixed(3), u: useHeld };
  const key = msg.f + '|' + msg.s + '|' + msg.u;
  if (t - lastSendT > 33 || key !== lastSent) { ws.send(JSON.stringify(msg)); lastSent = key; lastSendT = t; }
}
function occluded(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), n = Math.ceil(d / 0.25);
  for (let i = 1; i < n; i++) { const x = a.x + dx * i / n, y = a.y + dy * i / n; if (G.g[Math.floor(y) * G.N + Math.floor(x)] !== 0) return true; }
  return false;
}

// ---------- Rendering ----------
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); cw = innerWidth; ch = innerHeight;
  cv.width = cw * dpr; cv.height = ch * dpr;
  const RW = clamp(Math.round(cw / 2.1), 320, 560);
  buf.width = RW; buf.height = Math.max(120, Math.round(RW * ch / cw)); bg.width = buf.width; bg.height = buf.height;
  zbuf = new Float32Array(RW); bgKey = ''; vigKey = '';
}
addEventListener('resize', resize); resize();

function buildBg(Lr) {
  const W = bg.width, H = bg.height, T = THEMES[G.th];
  const mix = (hex, b) => { const [r, g, bl] = rgb(hex); return 'rgb(' + (r * b | 0) + ',' + (g * b | 0) + ',' + (bl * b | 0) + ')'; };
  const br = (d) => 1 - Math.pow(clamp(d / Lr, 0, 1), 1.3);
  const gc = bgctx.createLinearGradient(0, 0, 0, H / 2), gf = bgctx.createLinearGradient(0, H / 2, 0, H);
  for (let i = 0; i <= 12; i++) {
    const o = i / 12;
    gc.addColorStop(o, mix(T.ceil, br(1 / Math.max(0.04, 1 - o)) * 1.3));
    gf.addColorStop(o, mix(T.floor, br(1 / Math.max(0.04, o)) * 1.1));
  }
  bgctx.fillStyle = gc; bgctx.fillRect(0, 0, W, H / 2);
  bgctx.fillStyle = gf; bgctx.fillRect(0, H / 2, W, H / 2);
}

function lightTarget() {
  if (window.__lab && __lab.dbg.force) return __lab.dbg.force;
  const my = myP(); const bo = S.bo > 0;
  let L = bo ? 1.9 : 10;
  if (my && my.it) L = bo ? 6.5 : 13;
  else if (bo) for (const o of S.p) if (o.it && o.i !== myId && Math.hypot(o.x - me.x, o.y - me.y) < 4.5) L = Math.max(L, 4.2);
  return L;
}

function renderScene(dt, Lr) {
  const W = buf.width, H = buf.height, N = G.N, g = G.g;
  const key = G.th + '|' + W + 'x' + H + '|' + Math.round(Lr * 4);
  if (key !== bgKey) { bgKey = key; buildBg(Lr); }
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(bg, 0, 0);
  const dirX = Math.cos(me.a), dirY = Math.sin(me.a), plX = -dirY * FOVK, plY = dirX * FOVK;
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1, rdx = dirX + plX * camX, rdy = dirY + plY * camX;
    let mx = Math.floor(me.x), my = Math.floor(me.y);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let sx, sy, sdx, sdy;
    if (rdx < 0) { sx = -1; sdx = (me.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - me.x) * ddx; }
    if (rdy < 0) { sy = -1; sdy = (me.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - me.y) * ddy; }
    let side = 0, val = 0;
    for (let i = 0; i < 80; i++) {
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= N || my >= N) { val = 1; break; }
      val = g[my * N + mx]; if (val) break;
    }
    let perp = side === 0 ? sdx - ddx : sdy - ddy; if (perp < 0.05) perp = 0.05;
    zbuf[x] = perp;
    const lineH = H / perp, y0 = H / 2 - lineH / 2;
    let wx = side === 0 ? me.y + perp * rdy : me.x + perp * rdx; wx -= Math.floor(wx);
    let tx = (wx * 64) | 0; if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) tx = 63 - tx;   // l'asse y va verso il basso: senza questo le scritte sono a specchio
    const tex = TEX[val] || TEX[1];
    bctx.drawImage(tex, tx, 0, 1, 64, x, y0, 1, lineH);
    let a = Math.pow(Math.min(1, perp / Lr), 1.25) * 0.97; if (side === 1) a += (1 - a) * 0.3;
    if (a > 0.004) { bctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(2) + ')'; bctx.fillRect(x, y0, 1, lineH); }
  }
  // sprite
  const items = [];
  const add = (x, y, img, scale, vOff, label, color, extra, big) => items.push({ x, y, img, scale, vOff, label, color, extra, big });
  for (const p of S.p) {
    if (p.i === myId) continue; const d = disp.get('p' + p.i); if (!d) continue;
    let label = p.n; if (p.ch) label += ' ⛓' + (p.fr > 0 ? ' ' + Math.round(p.fr * 100) + '%' : '');
    add(d.x, d.y, playerSprite(p.e, p.ch, p.it), 0.85, 0.1, label, COL[p.e], p.sy);
  }
  if (S.m) { const d = disp.get('m'); if (d) add(d.x, d.y, monsterSprite(S.m[2]), 1.25, 0.02, null, null, null, true); }
  for (const t of S.tc) add(t[0], t[1], torchSprite(), 0.32, 0.34, null);
  for (const b of G.bt) add(b.x, b.y, buttonSprite(b.d, S.pb.includes(b.id) ? 1 : 0), 0.34, 0.33, null);
  const labels = [];
  for (const it of items) {
    const dx = it.x - me.x, dy = it.y - me.y; it.fwd = dx * dirX + dy * dirY; it.sx = W / 2 * (1 + ((-dx * dirY + dy * dirX) / (it.fwd || 1)) / FOVK); it.dist = Math.hypot(dx, dy);
  }
  items.sort((p, q) => q.fwd - p.fwd);
  for (const it of items) {
    if (it.fwd < 0.2) continue;
    const near = it.big ? 0.9 : 0.6;                     // chi ti sta addosso sfuma invece di riempire lo schermo
    const h = (H / it.fwd) * it.scale, w = h, top = H / 2 - h / 2 + (H / it.fwd) * it.vOff, x0 = Math.floor(it.sx - w / 2), x1 = Math.floor(it.sx + w / 2);
    const al = (1 - Math.pow(Math.min(1, it.dist / Lr), 1.25) * 0.97) * clamp((it.dist - near * 0.6) / (near * 0.5), 0, 1); if (al < 0.03) continue;
    bctx.globalAlpha = al;
    for (let sx = Math.max(0, x0); sx <= Math.min(W - 1, x1); sx++) {
      if (it.fwd >= zbuf[sx]) continue;
      bctx.drawImage(it.img, ((sx - x0) / w * it.img.width) | 0, 0, 1, it.img.height, sx, top, 1, h);
    }
    bctx.globalAlpha = 1;
    const cx = clamp(Math.round(it.sx), 0, W - 1);
    if (it.label && it.fwd < zbuf[cx] && al > 0.25) labels.push({ x: it.sx, y: top, text: it.label, color: it.color, say: it.extra, al });
  }
  return labels;
}

function drawHud(labels, Lr) {
  const sx = cw / buf.width, sy = ch / buf.height;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of labels) {
    ctx.globalAlpha = clamp(l.al * 1.4, 0.3, 1);
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#000a';
    const w = ctx.measureText(l.text).width + 10; ctx.fillRect(l.x * sx - w / 2, l.y * sy - 20, w, 17);
    ctx.fillStyle = l.color; ctx.fillText(l.text, l.x * sx, l.y * sy - 11);
    if (l.say >= 0) {
      ctx.font = 'bold 15px sans-serif'; const t = PH[l.say], bw = ctx.measureText(t).width + 16;
      ctx.fillStyle = '#fff'; ctx.fillRect(l.x * sx - bw / 2, l.y * sy - 46, bw, 22); ctx.fillStyle = '#000'; ctx.fillText(t, l.x * sx, l.y * sy - 35);
    }
    ctx.globalAlpha = 1;
  }
  // mirino
  ctx.fillStyle = '#fff8'; ctx.fillRect(cw / 2 - 1, ch / 2 - 1, 3, 3);
  // vignetta
  const vk = cw + 'x' + ch + (S.bo > 0 ? 'b' : 'n');
  if (vk !== vigKey) {
    vigKey = vk; vig = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, S.bo > 0 ? 'rgba(0,0,0,.85)' : 'rgba(0,0,0,.5)');
  }
  ctx.fillStyle = vig; ctx.fillRect(0, 0, cw, ch);
  const my = myP();
  if (my && my.ch) { ctx.fillStyle = 'rgba(120,120,140,.28)'; ctx.fillRect(0, 0, cw, ch); }

  // intestazione
  ctx.textAlign = 'left'; ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#fff';
  if (S.st === 'play') {
    const lvT = fmt(S.tm - S.l0), tot = fmt(S.tm);
    if (cw < 520) { ctx.font = 'bold 12px sans-serif'; ctx.fillText('Liv. ' + G.lv + '/' + G.total + ' · ⏱ ' + lvT + ' · tot ' + tot, 10, 18); }   // sul telefono i pulsanti voce occupano l'angolo
    else ctx.fillText('Livello ' + G.lv + '/' + G.total + ' · ' + THEMES[G.th].name + ' · ⏱ ' + lvT + ' (totale ' + tot + ')', 10, 18);
  }
  // elenco giocatori + stato voce
  ctx.font = '13px sans-serif';
  S.p.forEach((p, i) => {
    let st = '';
    if (p.i === myId) st = Voice.mic === 'ok' ? (Voice.muted ? '🔇' : (Voice.meSpeaking ? '🗣️' : '🎤')) : '🚫';
    else { const v = Voice.status(p.i); const P = Voice.peers.get(p.i); st = v === 'ok' ? (P && P.speaking ? '🗣️' : '🔈') : v === 'fail' ? '⚠️' : '⏳'; }
    const y = ch - 14 - (S.p.length - 1 - i) * 19;
    ctx.fillStyle = '#000a'; ctx.fillRect(6, y - 9, 150, 17);
    ctx.fillStyle = COL[p.e]; ctx.fillText(st + ' ' + EM[p.e] + ' ' + p.n + (p.ch ? ' ⛓' : '') + (p.it ? ' 🔦' : ''), 10, y);
  });
  // suggerimenti contestuali
  let hint = '';
  if (my && !my.ch) {
    let nb = null; for (const b of G.bt) if (Math.hypot(b.x - me.x, b.y - me.y) < 1.25) nb = b;
    const nt = S.tc.find((t) => Math.hypot(t[0] - me.x, t[1] - me.y) < 1.25);
    const nc = S.p.find((p) => p.i !== myId && p.ch && Math.hypot(p.x - me.x, p.y - me.y) < 1.4);
    if (nc) hint = 'Tieni premuto E per liberare ' + nc.n + (nc.fr > 0 ? ' (' + Math.round(nc.fr * 100) + '%)' : '');
    else if (nb) hint = 'E: premi il pulsante — serve un amico sull\'altro!';
    else if (nt && !my.it) hint = 'E: raccogli la torcia';
  }
  if (my && my.ch) hint = 'Sei incatenato! Chiama aiuto a voce' + (my.fr > 0 ? ' — ' + Math.round(my.fr * 100) + '%' : '');
  ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
  if (hint) { ctx.fillStyle = '#000b'; const w = ctx.measureText(hint).width + 20; ctx.fillRect(cw / 2 - w / 2, ch - 90, w, 28); ctx.fillStyle = '#ffe36b'; ctx.fillText(hint, cw / 2, ch - 76); }
  if (S.ex[0] > 0 && !S.win && S.st === 'play') {
    const t = 'Porta di uscita: ' + S.ex[0] + '/' + S.ex[1] + ' vicini — servono tutti!';
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#000b'; const w = ctx.measureText(t).width + 20; ctx.fillRect(cw / 2 - w / 2, 28, w, 24); ctx.fillStyle = '#7ee081'; ctx.fillText(t, cw / 2, 40);
  }
  if (!isTouch && !locked && (S.st === 'play' || S.st === 'lobby')) { ctx.font = '12px sans-serif'; ctx.fillStyle = '#fffa'; ctx.fillText('Clicca per usare il mouse · WASD muovi · E usa · Q lascia · 1-4 urla · M muto', cw / 2, ch - 8); }
  // avvisi
  for (let i = toasts.length - 1; i >= 0; i--) {
    const ts = toasts[i]; ts.t -= 16; if (ts.t <= 0) { toasts.splice(i, 1); continue; }
  }
  const ty0 = S.st === 'lobby' ? ch * 0.52 : ch * 0.18;   // in sala d'attesa il pannello del codice occupa la parte alta
  toasts.forEach((ts, i) => {
    ctx.globalAlpha = clamp(ts.t / 500, 0, 1) * clamp((ts.max - ts.t) / 150 + 0.2, 0, 1);
    ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#000c'; const w = ctx.measureText(ts.text).width + 28; ctx.fillRect(cw / 2 - w / 2, ty0 + i * 40 - 18, w, 34);
    ctx.fillStyle = ts.color; ctx.fillText(ts.text, cw / 2, ty0 + i * 40);
    ctx.globalAlpha = 1;
  });
  // joystick touch
  for (const k of ['move', 'look']) {
    const t = T[k]; if (!t || k === 'look') continue;
    ctx.strokeStyle = '#fff6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.ox, t.oy, 55, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff5'; ctx.beginPath(); ctx.arc(t.ox + clamp(t.x - t.ox, -55, 55), t.oy + clamp(t.y - t.oy, -55, 55), 24, 0, 7); ctx.fill();
  }
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, cw, ch);
  if (!S || !G) return;     // in sala d'attesa G è il piccolo labirinto di prova: si cammina e si parla davvero
  stepLocal(dt); sendInput(now);
  // posizioni morbide degli altri
  const k = 1 - Math.exp(-dt * 14);
  const sm = (key, x, y) => { let d = disp.get(key); if (!d) { d = { x, y }; disp.set(key, d); } d.x += (x - d.x) * k; d.y += (y - d.y) * k; d.seen = now; };
  for (const p of S.p) if (p.i !== myId) sm('p' + p.i, p.x, p.y);
  if (S.m) sm('m', S.m[0], S.m[1]);
  for (const [key, d] of disp) if (now - d.seen > 2000) disp.delete(key);
  // luce
  lightCur += (lightTarget() - lightCur) * Math.min(1, dt * 4);
  const labels = renderScene(dt, lightCur);
  // schermo
  let ox = 0, oy = 0; if (shakeT > 0) { shakeT -= dt; const m = Math.min(1, shakeT) * 7; ox = (Math.random() - 0.5) * m; oy = (Math.random() - 0.5) * m; }
  ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, ox, oy, cw, ch);
  drawHud(labels, lightCur);
  // voce di prossimità ogni 100 ms + passi del mostro
  voiceT += dt;
  if (voiceT > 0.1) {
    voiceT = 0;
    Voice.update(me, (id) => disp.get('p' + id) || null, occluded);
  }
  if (S.m && !S.m[2]) {
    const d = disp.get('m');
    if (d) { const dist = Math.hypot(d.x - me.x, d.y - me.y); if (dist < 12) { thumpT -= dt; if (thumpT <= 0) { thumpT = 0.5; SFX.play('thump', d.x, d.y); } } }
  }
}
requestAnimationFrame(frame);

// aggancio per i test automatici
window.__lab = { dbg: { freeze: false, force: 0 }, get needSnap() { return needSnap; }, set S(v) { S = v; }, get S() { return S; }, get G() { return G; }, me, get lightCur() { return lightCur; }, Voice, SFX, THEMES };
