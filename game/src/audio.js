// audio.js — IRONHOLD synth sound effects (Worker 3)
// WebAudio only: oscillators + filtered noise, no audio files.
// Lazy AudioContext (created on first unlock()/sound), every method guards
// a missing or suspended context, and rapid-fire shots are throttled so a
// busy wave can't spawn hundreds of nodes per second.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  const lastPlay = {}; // name -> ctx.currentTime of last play (throttle)

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = (typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext)) || null;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // 1s of white noise, reused by every noise burst
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function ready() {
    return ensure() && ctx.state === 'running';
  }

  // Throttle: at most one play of `name` per `ms` milliseconds.
  function gate(name, ms) {
    if (!ctx) return false;
    const now = ctx.currentTime;
    if (lastPlay[name] !== undefined && (now - lastPlay[name]) * 1000 < ms) return false;
    lastPlay[name] = now;
    return true;
  }

  // One oscillator blip with an attack/decay envelope.
  // opts: {f, f2, dur, type, vol, when}
  function tone(opts) {
    if (!ready()) return;
    try {
      const t0 = ctx.currentTime + (opts.when || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(1, opts.f), t0);
      if (opts.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f2), t0 + opts.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      osc.connect(g); g.connect(master);
      osc.start(t0); osc.stop(t0 + opts.dur + 0.05);
    } catch (e) { /* never let audio break the game */ }
  }

  // One filtered noise burst.
  // opts: {dur, vol, freq, type ('lowpass'|'highpass'|'bandpass'), q, when}
  function noise(opts) {
    if (!ready()) return;
    try {
      const t0 = ctx.currentTime + (opts.when || 0);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const flt = ctx.createBiquadFilter();
      flt.type = opts.type || 'lowpass';
      flt.frequency.value = opts.freq || 1000;
      flt.Q.value = opts.q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.3, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      src.connect(flt); flt.connect(g); g.connect(master);
      src.start(t0); src.stop(t0 + opts.dur + 0.05);
    } catch (e) { /* never let audio break the game */ }
  }

  return {
    // Resume/create the context. Call from a user gesture (click/key).
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') {
        try { c.resume(); } catch (e) { /* ignore */ }
      }
    },

    setMuted(m) {
      muted = !!m;
      if (master) {
        try { master.gain.value = muted ? 0 : 0.5; } catch (e) { /* ignore */ }
      }
    },

    isMuted() { return muted; },

    click() {
      if (!gate('click', 40)) return;
      tone({f: 880, f2: 660, dur: 0.04, type: 'square', vol: 0.08});
    },

    coin() {
      if (!gate('coin', 60)) return;
      tone({f: 1318, dur: 0.07, type: 'sine', vol: 0.14});
      tone({f: 1760, dur: 0.12, type: 'sine', vol: 0.14, when: 0.07});
    },

    // Per-tower shot sounds. Frost towers call frost() instead.
    shoot(type) {
      if (!gate('shoot', 35)) return;
      if (type === 'cannon') {
        tone({f: 170, f2: 45, dur: 0.16, type: 'sine', vol: 0.35});
        noise({dur: 0.12, vol: 0.2, freq: 500});
      } else if (type === 'sniper') {
        tone({f: 1300, f2: 280, dur: 0.08, type: 'square', vol: 0.14});
        noise({dur: 0.09, vol: 0.18, freq: 3000, type: 'highpass'});
      } else if (type === 'tesla') {
        this.zap();
      } else {
        // archer (default): quick wooden twang
        tone({f: 720, f2: 480, dur: 0.05, type: 'square', vol: 0.1});
      }
    },

    explosion() {
      if (!gate('explosion', 80)) return;
      noise({dur: 0.4, vol: 0.45, freq: 420});
      tone({f: 130, f2: 30, dur: 0.35, type: 'sine', vol: 0.4});
    },

    frost() {
      if (!gate('frost', 120)) return;
      tone({f: 1568, f2: 1175, dur: 0.28, type: 'sine', vol: 0.07});
      tone({f: 2093, f2: 1568, dur: 0.28, type: 'sine', vol: 0.05, when: 0.05});
    },

    zap() {
      if (!gate('zap', 50)) return;
      tone({f: 1500, f2: 180, dur: 0.09, type: 'sawtooth', vol: 0.16});
      noise({dur: 0.07, vol: 0.12, freq: 4000, type: 'highpass'});
    },

    horn() {
      if (!gate('horn', 200)) return;
      // war-horn chord, sawtooth, slow swell
      tone({f: 196, dur: 0.8, type: 'sawtooth', vol: 0.1});
      tone({f: 246.9, dur: 0.8, type: 'sawtooth', vol: 0.09});
      tone({f: 294.7, dur: 0.8, type: 'sawtooth', vol: 0.08});
    },

    alarm() {
      if (!gate('alarm', 150)) return;
      for (let i = 0; i < 3; i++) {
        tone({f: 660, dur: 0.11, type: 'square', vol: 0.12, when: i * 0.26});
        tone({f: 440, dur: 0.11, type: 'square', vol: 0.12, when: i * 0.26 + 0.13});
      }
    },

    skill() {
      if (!gate('skill', 150)) return;
      tone({f: 300, f2: 1400, dur: 0.28, type: 'sawtooth', vol: 0.12});
      tone({f: 1046, dur: 0.2, type: 'sine', vol: 0.1, when: 0.2});
      tone({f: 1568, dur: 0.3, type: 'sine', vol: 0.08, when: 0.3});
    },

    victory() {
      if (!gate('victory', 200)) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i++) {
        tone({f: notes[i], dur: 0.32, type: 'triangle', vol: 0.18, when: i * 0.13});
      }
      tone({f: 1318.5, dur: 0.6, type: 'triangle', vol: 0.15, when: 0.55});
    },

    defeat() {
      if (!gate('defeat', 200)) return;
      const notes = [392, 329.63, 261.63, 196];
      for (let i = 0; i < notes.length; i++) {
        tone({f: notes[i], dur: 0.34, type: 'sawtooth', vol: 0.1, when: i * 0.2});
      }
    },
  };
}
