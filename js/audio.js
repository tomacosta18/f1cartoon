// ============================================================================
// AUDIO.JS — Motor de Audio Arcade Nintendo Switch (Web Audio API Procedural)
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

    _playTone(freq, duration, type = 'triangle', gainVal = 0.14, freqEnd = null, delay = 0) {
      if (this.muted) return;
      this.unlock();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (freqEnd !== null) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(gainVal, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      } catch (_) {}
    }

    playClick() { this._playTone(620, 0.075, 'triangle', 0.11, 920); }
    playHover() { this._playTone(440, 0.04, 'sine', 0.045, 540); }
    playSelectDriver() {
      this._playTone(523.25, 0.085, 'triangle', 0.11, 659.25, 0);
      this._playTone(659.25, 0.105, 'triangle', 0.12, 783.99, 0.055);
    }
    playTransition() { this._playTone(280, 0.15, 'sine', 0.1, 740); }
    playBack() { this._playTone(520, 0.085, 'triangle', 0.09, 310); }

    playCountdownBeep(isGo = false) {
      if (isGo) {
        this._playTone(880, 0.42, 'sawtooth', 0.14, 1175, 0);
        this._playTone(1318, 0.42, 'triangle', 0.13, 1568, 0.03);
      } else {
        this._playTone(440, 0.18, 'square', 0.09, 430, 0);
      }
    }

    playTurbo() {
      this._playTone(180, 0.35, 'sawtooth', 0.12, 980, 0);
      this._playTone(360, 0.32, 'triangle', 0.11, 1450, 0.04);
    }

    playMoralOverdrive() {
      [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) => {
        this._playTone(n, 0.24, 'triangle', 0.13, n * 1.03, idx * 0.065);
      });
    }

    playCrowdCheer() {
      const nowMs = performance.now();
      if (nowMs - this.lastCrowdCheer < 2600 || this.muted) return;
      this.lastCrowdCheer = nowMs;
      this.unlock();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.65);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950, now);
        filter.frequency.linearRampToValueAtTime(1650, now + 0.3);
        filter.Q.value = 1.6;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.085, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.64);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
      } catch (_) {}
    }

    playBump() { this._playTone(135, 0.11, 'sawtooth', 0.11, 55); }

    playLapChime(isFinalLap = false) {
      if (isFinalLap) {
        this._playTone(587.3, 0.14, 'triangle', 0.14, null, 0);
        this._playTone(783.99, 0.14, 'triangle', 0.14, null, 0.1);
        this._playTone(1174.6, 0.28, 'triangle', 0.15, null, 0.2);
      } else {
        this._playTone(659.25, 0.12, 'triangle', 0.12, null, 0);
        this._playTone(880, 0.18, 'triangle', 0.12, null, 0.09);
      }
    }

    playVictoryFanfare() {
      const seq = [
        [523.25, 0.14, 0],
        [659.25, 0.14, 0.12],
        [783.99, 0.14, 0.24],
        [1046.5, 0.32, 0.36],
        [783.99, 0.14, 0.56],
        [1046.5, 0.55, 0.7]
      ];
      seq.forEach(([f, dur, d]) => {
        this._playTone(f, dur, 'triangle', 0.15, f * 1.01, d);
        this._playTone(f * 0.5, dur, 'sine', 0.08, null, d);
      });
    }

    startEngine() {
      if (this.muted || this.engineActive) return;
      this.unlock();
      if (!this.ctx) return;
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.value = 95;
        osc2.frequency.value = 190;
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        filter.Q.value = 3.2;
        gain.gain.value = 0.0001;
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc1.start();
        osc2.start();
        this.engineNodes = { osc1, osc2, filter, gain };
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
      const clamped = Math.max(0, Math.min(1.4, speedRatio));
      const gear = Math.min(7, Math.floor(clamped * 6.5) + 1);
      const gearLocal = (clamped * 6.5) % 1;
      const baseFreq = 85 + gear * 32 + gearLocal * 78 + (isTurbo ? 68 : 0);
      this.engineNodes.osc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
      this.engineNodes.osc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.05);
      this.engineNodes.filter.frequency.setTargetAtTime(isTurbo ? 1750 : 480 + clamped * 820, now, 0.06);
      this.engineNodes.gain.gain.setTargetAtTime(0.042 + clamped * 0.042 + (isTurbo ? 0.022 : 0), now, 0.06);
    }

    stopEngine() {
      if (!this.engineNodes) return;
      try {
        this.engineNodes.osc1.stop();
        this.engineNodes.osc2.stop();
        this.engineNodes.osc1.disconnect();
        this.engineNodes.osc2.disconnect();
        this.engineNodes.filter.disconnect();
        this.engineNodes.gain.disconnect();
      } catch (_) {}
      this.engineNodes = null;
      this.engineActive = false;
    }
  }

  global.AudioFX = new ArcadeAudio();
})(window);
