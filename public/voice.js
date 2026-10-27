'use strict';
// Chat vocale WebRTC (solo audio, mesh) con voce di prossimità.
// La segnalazione passa dal WebSocket del gioco: Voice.send({t:'sig',to,d}).
(function () {
  let ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const V = {
    ac: null, local: null, mic: 'pending', muted: false, global: false, ready: false,
    myId: null, send: () => {}, peers: new Map(), queue: [], meSpeaking: false, localAn: null,
  };

  // L'AudioContext va creato/riattivato dentro un gesto dell'utente (clic su "Crea/Entra")
  V.unlock = function () {
    if (!V.ac) { const C = window.AudioContext || window.webkitAudioContext; if (C) V.ac = new C(); }
    if (V.ac && V.ac.state === 'suspended') V.ac.resume();
    return V.ac;
  };

  V.initMic = async function () {
    try { const r = await fetch('/ice', { cache: 'no-store' }); const j = await r.json(); if (Array.isArray(j) && j.length) ICE = j; } catch (e) {}
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no mediaDevices');
      V.local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
      V.mic = 'ok';
      const ac = V.unlock();
      if (ac) {
        const src = ac.createMediaStreamSource(V.local);
        V.localAn = ac.createAnalyser(); V.localAn.fftSize = 512; V.localBuf = new Uint8Array(512);
        src.connect(V.localAn); // non lo collego alle casse: niente eco
      }
    } catch (e) { V.mic = 'denied'; V.local = null; }
    V.ready = true;
    const q = V.queue; V.queue = [];
    q.forEach(([from, d]) => V.onSig(from, d));
    return V.mic;
  };

  function mkPeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const P = { id, pc, state: 'new', speaking: false, nodes: null, pendingIce: [], hasRemote: false, since: Date.now(), talkT: 0 };
    V.peers.set(id, P);
    if (V.local) V.local.getAudioTracks().forEach((t) => pc.addTrack(t, V.local));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onicecandidate = (e) => { if (e.candidate) V.send({ t: 'sig', to: id, d: { c: e.candidate } }); };
    pc.ontrack = (e) => attach(P, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      P.state = pc.connectionState;
      if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && V.myId < id) {
        setTimeout(() => { if (V.peers.get(id) === P && P.pc.connectionState !== 'connected') offer(P, true); }, 2500);
      }
    };
    return P;
  }

  async function offer(P, restart) {
    try {
      const o = await P.pc.createOffer(restart ? { iceRestart: true } : undefined);
      await P.pc.setLocalDescription(o);
      V.send({ t: 'sig', to: P.id, d: { s: { type: P.pc.localDescription.type, sdp: P.pc.localDescription.sdp } } });
    } catch (e) { P.state = 'failed'; }
  }

  function cleanNodes(P) {
    if (P.nodes) { try { P.nodes.src.disconnect(); P.nodes.gain.disconnect(); } catch (e) {} P.nodes = null; }
    if (P.el) { try { P.el.srcObject = null; } catch (e) {} P.el = null; }
  }
  function attach(P, stream) {
    cleanNodes(P);
    // Chrome richiede che lo stream sia agganciato a un elemento audio perché arrivi a WebAudio
    const a = new Audio(); a.srcObject = stream; a.muted = true; if (a.play) a.play().catch(() => {});
    P.el = a;
    const ac = V.unlock(); if (!ac) { a.muted = false; return; }   // senza WebAudio: riproduzione normale, senza prossimità
    const src = ac.createMediaStreamSource(stream);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
    const gain = ac.createGain(); gain.gain.value = 1;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const an = ac.createAnalyser(); an.fftSize = 512;
    src.connect(lp); src.connect(an); lp.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(ac.destination); } else gain.connect(ac.destination);
    P.nodes = { src, lp, gain, pan, an, buf: new Uint8Array(an.fftSize) };
  }

  V.onSig = async function (from, d) {
    if (!V.ready) { V.queue.push([from, d]); return; }
    if (d.again) { if (V.myId < from) { dropPeer(from); offer(mkPeer(from), false); } return; }
    let P = V.peers.get(from);
    if (P && d.s && d.s.type === 'offer' && (P.pc.connectionState === 'failed' || P.pc.connectionState === 'closed' || P.pc.signalingState === 'have-local-offer')) { dropPeer(from); P = null; }
    if (!P) P = mkPeer(from);
    try {
      if (d.s) {
        await P.pc.setRemoteDescription(d.s); P.hasRemote = true;
        if (d.s.type === 'offer') {
          const an = await P.pc.createAnswer();
          await P.pc.setLocalDescription(an);
          V.send({ t: 'sig', to: from, d: { s: { type: P.pc.localDescription.type, sdp: P.pc.localDescription.sdp } } });
        }
        for (const c of P.pendingIce) await P.pc.addIceCandidate(c).catch(() => {});
        P.pendingIce = [];
      } else if (d.c) {
        if (P.hasRemote) await P.pc.addIceCandidate(d.c).catch(() => {}); else P.pendingIce.push(d.c);
      }
    } catch (e) { P.state = 'failed'; }
  };

  function dropPeer(id) {
    const P = V.peers.get(id); if (!P) return;
    try { P.pc.close(); } catch (e) {}
    cleanNodes(P); V.peers.delete(id);
  }
  // Riavvia da zero tutti i collegamenti non riusciti (anche dal pulsante "Voce")
  V.reconnect = function (all) {
    for (const [id, P] of [...V.peers]) {
      if (!all && P.state === 'connected') continue;
      dropPeer(id);
      const N = mkPeer(id);
      if (V.myId < id) offer(N, false); else V.send({ t: 'sig', to: id, d: { again: 1 } });
    }
    V.unlock();
  };
  // controllo periodico: collegamenti bloccati da più di 8 s vengono rifatti
  setInterval(() => {
    if (!V.ready) return;
    for (const [id, P] of [...V.peers]) {
      if (P.state === 'connected') { P.since = Date.now(); continue; }
      if (Date.now() - P.since > 8000) { dropPeer(id); const N = mkPeer(id); if (V.myId < id) offer(N, false); else V.send({ t: 'sig', to: id, d: { again: 1 } }); }
    }
  }, 4000);
  // Allinea i collegamenti con l'elenco dei giocatori presenti: offre il più basso id
  V.sync = function (ids) {
    if (!V.ready) return;
    for (const id of ids) {
      if (id === V.myId || V.peers.has(id)) continue;
      const P = mkPeer(id);
      if (V.myId < id) offer(P, false);
    }
    for (const [id, P] of V.peers) {
      if (ids.includes(id)) continue;
      try { P.pc.close(); } catch (e) {}
      cleanNodes(P);
      V.peers.delete(id);
    }
  };

  V.setMuted = function (m) {
    V.muted = m;
    if (V.local) V.local.getAudioTracks().forEach((t) => { t.enabled = !m; });
  };
  V.setGlobal = function (g) { V.global = g; };

  // Volume, stereo e "attutimento" in base a distanza, direzione e muri in mezzo
  // me {x,y,a}, posOf(id) -> {x,y}|null, occluded(a,b) -> bool
  V.update = function (me, posOf, occluded) {
    const ac = V.ac; if (!ac) return;
    if (ac.state !== 'running' && ac.resume) ac.resume().catch(() => {});
    const now = ac.currentTime, t = performance.now();
    for (const P of V.peers.values()) {
      const n = P.nodes; if (!n) continue;
      n.an.getByteTimeDomainData(n.buf);
      let s = 0; for (let i = 0; i < n.buf.length; i++) { const d = (n.buf[i] - 128) / 128; s += d * d; }
      if (Math.sqrt(s / n.buf.length) > 0.03) P.talkT = t;
      P.speaking = t - P.talkT < 350;
      let g = 1, f = 20000, pn = 0;
      const pos = posOf(P.id);
      if (!V.global && pos) {
        const dx = pos.x - me.x, dy = pos.y - me.y, d = Math.hypot(dx, dy);
        g = clamp(1 - (d - 3) / 22, 0.3, 1);   // la voce non sparisce mai del tutto: da lontano è solo più bassa
        if (occluded(me, pos)) { f = 1600; g *= 0.85; }
        pn = Math.sin(Math.atan2(dy, dx) - me.a) * 0.85 * Math.min(1, d / 1.5);
      }
      n.gain.gain.setTargetAtTime(g, now, 0.08);
      n.lp.frequency.setTargetAtTime(f, now, 0.08);
      if (n.pan) n.pan.pan.setTargetAtTime(pn, now, 0.08);
    }
    if (V.localAn) {
      V.localAn.getByteTimeDomainData(V.localBuf);
      let s = 0; for (let i = 0; i < V.localBuf.length; i++) { const d = (V.localBuf[i] - 128) / 128; s += d * d; }
      if (Math.sqrt(s / V.localBuf.length) > 0.03 && !V.muted) V.meTalkT = t;
      V.meSpeaking = t - (V.meTalkT || 0) < 350;
    }
  };

  // Stato per l'interfaccia: 'ok' collegato, 'wait' in collegamento, 'fail' non collegato
  V.status = function (id) {
    const P = V.peers.get(id); if (!P) return 'wait';
    if (P.state === 'connected') return 'ok';
    if (P.state === 'failed' || (Date.now() - P.since > 12000 && P.state !== 'connected')) return 'fail';
    return 'wait';
  };

  const wake = () => { if (V.ac && V.ac.state !== 'running') V.ac.resume().catch(() => {}); for (const P of V.peers.values()) if (P.el && P.el.paused && P.el.play) P.el.play().catch(() => {}); };
  document.addEventListener('visibilitychange', wake);
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => document.addEventListener(e, wake, { passive: true }));
  window.Voice = V;
})();
