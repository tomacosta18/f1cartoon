// ============================================================================
// AUDIO.JS — Parche v1.3: Motor Grave Filtrado (Lowpass 450–750Hz),
//            Turbo Cálido (-70% volumen + Válvula de Descarga Breve) y
//            Golpe Seco de Fibra de Carbono con Debounce por Par (400ms)
// ============================================================================
(function (global) {
  'use strict';

  class ArcadeAudio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.engineNodes = null;
      this.engineActive = false;
      this.lastCrowdCheer = 0;
      this.lastBlowOffMs = 0;
      this.collisionCooldowns = new Map(); // pairKey -> last timestamp (ms)
      this._noiseBuffer = null;
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
        }
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      } catch (_) {}
    }

    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) this.stopEngine();
      return this.muted;
    }

    _getNoiseBuffer() {
      if (this._noiseBuffer || !this.ctx) return this._noiseBuffer;
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
      return buf;
    }

    _playTone(freq, duration, type = 'triangle', gainVal = 0.11, freqEnd = null, delay = 0, lowpassHz = 2200) {
      if (this.muted) return;
      this.unlock();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (freqEnd !== null) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), now + duration);
        }

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(lowpassHz, now);
        filter.Q.value = 0.9;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(gainVal, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.025);
      } catch (_) {}
    }

    playClick() { this._playTone(520, 0.065, 'triangle', 0.09, 760, 0, 1400); }
    playHover() { this._playTone(390, 0.035, 'sine', 0.04, 480, 0, 1200); }
    playSelectDriver() {
      this._playTone(440, 0.08, 'triangle', 0.09, 554.37, 0, 1500);
      this._playTone(554.37, 0.1, 'triangle', 0.1, 659.25, 0.055, 1600);
    }
    playTransition() { this._playTone(240, 0.14, 'sine', 0.085, 580, 0, 1200); }
    playBack() { this._playTone(420, 0.08, 'triangle', 0.08, 260, 0, 1200); }

    playCountdownBeep(isGo = false) {
      if (isGo) {
        this._playTone(587.3, 0.34, 'triangle', 0.11, 784, 0, 1400);
        this._playTone(880, 0.36, 'sine', 0.09, 1046.5, 0.03, 1500);
      } else {
        this._playTone(360, 0.15, 'triangle', 0.085, 345, 0, 900);
      }
    }

    // Turbo cálido (-70% volumen respecto a v1.2, rango grave/medio filtrado <= 620Hz, breve al activar)
    playTurbo() {
      if (this.muted) return;
      this._playTone(135, 0.24, 'triangle', 0.036, 310, 0, 580);
      this._playTone(210, 0.22, 'sine', 0.028, 390, 0.02, 620);
    }

    // Válvula de descarga suave (blow-off) al soltar acelerador a fondo o cerrar Turbo
    playTurboBlowOff() {
      const nowMs = performance.now();
      if (this.muted || nowMs - this.lastBlowOffMs < 550) return;
      this.lastBlowOffMs = nowMs;
      this.unlock();
      if (!this.ctx) return;
      try {
        const buf = this._getNoiseBuffer();
        if (!buf) return;
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(560, now);
        filter.frequency.exponentialRampToValueAtTime(240, now + 0.18);
        filter.Q.value = 1.6;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.026, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
        src.stop(now + 0.21);
      } catch (_) {}
    }

    playMoralOverdrive() {
      [392.0, 493.88, 587.33, 783.99].forEach((n, idx) => {
        this._playTone(n, 0.22, 'triangle', 0.10, n * 1.02, idx * 0.065, 1400);
      });
    }

    playCrowdCheer() {
      const nowMs = performance.now();
      if (nowMs - this.lastCrowdCheer < 2800 || this.muted) return;
      this.lastCrowdCheer = nowMs;
      this.unlock();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.55);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(780, now);
        filter.frequency.linearRampToValueAtTime(1180, now + 0.28);
        filter.Q.value = 1.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.54);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
      } catch (_) {}
    }

    // Golpe seco y grave de fibra de carbono (120Hz -> 45Hz + ruido blanco filtrado 0.15s)
    // Con enfriamiento obligatorio de 400ms por par de autos (cero bucles frame a frame)
    playBump(pairKey = 'global') {
      if (this.muted) return false;
      const nowMs = performance.now();
      const last = this.collisionCooldowns.get(pairKey) || 0;
      if (nowMs - last < 400) return false;
      this.collisionCooldowns.set(pairKey, nowMs);

      this.unlock();
      if (!this.ctx) return false;
      try {
        const now = this.ctx.currentTime;

        // 1. Sub-golpe seco 120Hz -> 45Hz
        const osc = this.ctx.createOscillator();
        const thudFilter = this.ctx.createBiquadFilter();
        const thudGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

        thudFilter.type = 'lowpass';
        thudFilter.frequency.setValueAtTime(340, now);

        thudGain.gain.setValueAtTime(0.0001, now);
        thudGain.gain.linearRampToValueAtTime(0.18, now + 0.008);
        thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

        osc.connect(thudFilter);
        thudFilter.connect(thudGain);
        thudGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);

        // 2. Ruido blanco filtrado de fibra de carbono (duración 0.15s)
        const buf = this._getNoiseBuffer();
        if (buf) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = buf;

          const noiseFilter = this.ctx.createBiquadFilter();
          noiseFilter.type = 'lowpass';
          noiseFilter.frequency.setValueAtTime(580, now);
          noiseFilter.frequency.exponentialRampToValueAtTime(190, now + 0.15);
          noiseFilter.Q.value = 0.8;

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(0.0001, now);
          noiseGain.gain.linearRampToValueAtTime(0.11, now + 0.006);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

          noise.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(this.ctx.destination);
          noise.start(now);
          noise.stop(now + 0.16);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    playLapChime(isFinalLap = false) {
      if (isFinalLap) {
        this._playTone(523.25, 0.13, 'triangle', 0.11, null, 0, 1500);
        this._playTone(659.25, 0.13, 'triangle', 0.11, null, 0.1, 1500);
        this._playTone(880, 0.26, 'triangle', 0.12, null, 0.2, 1600);
      } else {
        this._playTone(587.3, 0.11, 'triangle', 0.1, null, 0, 1500);
        this._playTone(783.99, 0.17, 'triangle', 0.1, null, 0.09, 1500);
      }
    }

    playVictoryFanfare() {
      const seq = [
        [440, 0.14, 0],
        [554.37, 0.14, 0.12],
        [659.25, 0.14, 0.24],
        [880, 0.30, 0.36],
        [659.25, 0.14, 0.56],
        [880, 0.50, 0.7]
      ];
      seq.forEach(([f, dur, d]) => {
        this._playTone(f, dur, 'triangle', 0.12, f * 1.01, d, 1600);
        this._playTone(f * 0.5, dur, 'sine', 0.07, null, d, 900);
      });
    }

    // Motor cálido grave/medio estrictamente filtrado con BiquadFilterNode lowpass (450Hz - 750Hz)
    startEngine() {
      if (this.muted || this.engineActive) return;
      this.unlock();
      if (!this.ctx) return;
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        const harmonicGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.value = 58;
        osc2.frequency.value = 116;

        subGain.gain.value = 0.78;
        harmonicGain.gain.value = 0.34;

        filter.type = 'lowpass';
        filter.frequency.value = 480;
        filter.Q.value = 1.1;

        gain.gain.value = 0.0001;

        osc1.connect(subGain);
        osc2.connect(harmonicGain);
        subGain.connect(filter);
        harmonicGain.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start();
        osc2.start();
        this.engineNodes = { osc1, osc2, subGain, harmonicGain, filter, gain };
        this.engineActive = true;
      } catch (_) {}
    }

    updateEngine(speedRatio, isTurbo, isPaused) {
      if (this.muted || isPaused) {
        if (this.engineNodes && this.ctx) {
          this.engineNodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.06);
        }
        return;
      }
      if (!this.engineActive) this.startEngine();
      if (!this.engineNodes || !this.ctx) return;

      const now = this.ctx.currentTime;
      const clamped = Math.max(0, Math.min(1.25, speedRatio));
      const gear = Math.min(8, Math.floor(clamped * 6.5) + 1);
      const gearLocal = (clamped * 6.5) % 1;

      // Rango grave/medio cálido (sin chirridos ni zumbido agudo continuo de turbo)
      const baseFreq = 52 + gear * 14 + gearLocal * 36 + (isTurbo ? 12 : 0);
      this.engineNodes.osc1.frequency.setTargetAtTime(baseFreq, now, 0.055);
      this.engineNodes.osc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.055);

      // Filtro paso bajo estrictamente entre 450Hz y 750Hz
      const cutoff = Math.min(750, Math.max(450, 450 + clamped * 235 + (isTurbo ? 45 : 0)));
      this.engineNodes.filter.frequency.setTargetAtTime(cutoff, now, 0.06);

      // Volumen controlado y agradable (turbo sólo +0.006 de cuerpo grave, -70% respecto a silbido anterior)
      const masterVol = 0.036 + clamped * 0.034 + (isTurbo ? 0.006 : 0);
      this.engineNodes.gain.gain.setTargetAtTime(masterVol, now, 0.06);
    }

    stopEngine() {
      if (!this.engineNodes) return;
      try {
        this.engineNodes.osc1.stop();
        this.engineNodes.osc2.stop();
        this.engineNodes.osc1.disconnect();
        this.engineNodes.osc2.disconnect();
        this.engineNodes.subGain.disconnect();
        this.engineNodes.harmonicGain.disconnect();
        this.engineNodes.filter.disconnect();
        this.engineNodes.gain.disconnect();
      } catch (_) {}
      this.engineNodes = null;
      this.engineActive = false;
    }
  }

  global.AudioFX = new ArcadeAudio();
})(window);
