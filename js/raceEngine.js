// ============================================================================
// RACEENGINE.JS — Física Arcade 3D, Impacto Real de 8 Atributos, IA 22 Pilotos,
//                 Sistema de Turbo & Moral (Carisma + Hinchada)
// ============================================================================
(function (global) {
  'use strict';

  const SPEED_DISPLAY_SCALE = 3.25;

  class RaceEngine {
    constructor(track, playerDriverId, totalLaps = 3, callbacks = {}) {
      this.track = track;
      this.circuitMeta = track.circuitMeta;
      this.playerDriverId = playerDriverId;
      this.totalLaps = totalLaps;
      this.callbacks = callbacks;

      this.root = new THREE.Group();
      this.racers = [];
      this.player = null;

      this.phase = 'countdown';
      this.countdownTimer = 0;
      this.lastCountdownStep = -1;
      this.raceElapsed = 0;
      this.paused = false;

      this._initParticles();
      this._spawnGrid();
    }

    _initParticles() {
      const isWet = this.circuitMeta.rainIntensity > 0;
      const count = 90;
      const geo = new THREE.SphereGeometry(isWet ? 0.28 : 0.24, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: isWet ? '#BAE6FD' : '#E2E8F0',
        transparent: true,
        opacity: 0.65
      });
      this.particleMesh = new THREE.InstancedMesh(geo, mat, count);
      this.particles = [];
      const dummy = new THREE.Object3D();
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      for (let i = 0; i < count; i++) {
        this.particles.push({ active: false, life: 0, maxLife: 0.4, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
        this.particleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.particleMesh.instanceMatrix.needsUpdate = true;
      this.particleCursor = 0;
      this.root.add(this.particleMesh);
    }

    _emitParticle(pos, vel, maxLife = 0.42) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      p.active = true;
      p.life = 0;
      p.maxLife = maxLife;
      p.pos.copy(pos);
      p.vel.copy(vel);
    }

    _spawnGrid() {
      const { DRIVERS, getTeamById } = global.F1Data;
      const { buildF1Car } = global.CarBuilder;

      const sorted = [...DRIVERS].sort((a, b) => {
        const scoreA = getTeamById(a.teamId).rating * 0.6 + a.stats.velocidad * 0.4 + (Math.random() * 6 - 3);
        const scoreB = getTeamById(b.teamId).rating * 0.6 + b.stats.velocidad * 0.4 + (Math.random() * 6 - 3);
        return scoreB - scoreA;
      });

      const pIdx = sorted.findIndex(d => d.id === this.playerDriverId);
      if (pIdx !== -1) {
        const [pDriver] = sorted.splice(pIdx, 1);
        const targetSlot = Math.min(9, Math.max(5, Math.floor(pIdx * 0.7) + 4));
        sorted.splice(targetSlot, 0, pDriver);
      }

      const halfW = this.track.halfWidth;

      sorted.forEach((driver, gridIdx) => {
        const team = getTeamById(driver.teamId);
        const isPlayer = driver.id === this.playerDriverId;
        const carVisual = buildF1Car(driver, team, { detailed: isPlayer, driverMode: 'seated' });
        this.root.add(carVisual.root);

        const row = Math.floor(gridIdx / 2);
        const col = gridIdx % 2 === 0 ? -1 : 1;
        const startS = -8 - row * 6.8 - (col === 1 ? 2.4 : 0);
        const startD = col * Math.min(halfW * 0.44, 3.2);

        const racer = {
          driver, team, isPlayer, visual: carVisual,
          s: startS, lap: 1, d: startD, v: 0, lateralVel: 0,
          steerVisual: 0, yawOffset: 0,
          turbo: isPlayer ? 55 : 40 + Math.random() * 30,
          turboActive: false,
          moral: isPlayer ? 25 : 15,
          moralOverdriveTimer: 0,
          moralMultiplier: 1.0,
          bobbleVelX: 0, bobbleVelZ: 0, bobbleX: 0, bobbleZ: 0,
          wheelSpin: 0,
          position: gridIdx + 1, prevPosition: gridIdx + 1,
          finished: false, finishTime: 0,
          worldPos: new THREE.Vector3(),
          worldForward: new THREE.Vector3(0, 0, 1),
          aiTargetD: startD,
          aiLaneTimer: 1.2 + Math.random() * 2.5,
          aiPaceFactor: 0.94 + Math.random() * 0.08,
          aiRubberBias: 1.0
        };

        this._syncCarTransform(racer, 0);
        this.racers.push(racer);
        if (isPlayer) this.player = racer;
      });
    }

    _computePerformance(racer, curvatureAbs) {
      const s = racer.driver.stats;
      const teamRating = racer.team.rating;
      const isWet = this.circuitMeta.rainIntensity > 0;
      const m = racer.moralMultiplier;

      const vel = Math.min(120, (s.velocidad ?? 85) * m);
      const ace = Math.min(120, (s.aceleracion ?? 85) * m);
      const crv = Math.min(120, (s.maniobrabilidad ?? 85) * m);
      const fre = Math.min(120, (s.freno ?? 85) * m);
      const tec = Math.min(120, (s.tecnica ?? 85) * m);
      const car = s.carisma ?? 85;
      const con = Math.min(120, (s.consistencia ?? s.agresividad ?? 85) * m);
      const neu = Math.min(120, (s.neumaticos ?? s.turbo ?? 85) * m);

      const teamSpeedFactor = 0.88 + (teamRating / 100) * 0.16;
      const maxSpeed = (82 + (vel - 70) * 0.44) * teamSpeedFactor;
      const accel = (34 + (ace - 70) * 0.42) * teamSpeedFactor;
      const brakePower = 54 + (fre - 70) * 0.65;
      const steerPower = 18 + (crv - 70) * 0.25;
      const turboSpeedMult = 1.20 + ((tec * 0.55 + neu * 0.45) - 70) * 0.0036;
      const turboRecharge = 5.5 + (neu - 70) * 0.14;

      const wetPenaltyBase = isWet ? this.circuitMeta.rainIntensity * 0.18 : 0;
      const techGripBonus = Math.max(0, (tec - 70) / 30);
      const tireGripBonus = Math.max(0, (neu - 70) / 30);
      const cornerSkillBonus = Math.max(0, (crv - 70) / 30);
      const effectiveWetPenalty = Math.max(0.015, wetPenaltyBase * (1 - techGripBonus * 0.65));

      const cornerPushFactor = Math.max(0.30, (1.12 + effectiveWetPenalty * 2.2) - (techGripBonus * 0.30 + tireGripBonus * 0.22));
      const cornerSpeedCap = maxSpeed * Math.max(0.56, 1.0 - curvatureAbs * (0.28 - (cornerSkillBonus * 0.07 + tireGripBonus * 0.05) + effectiveWetPenalty * 0.45));
      const tireScrubFactor = Math.max(0.62, 1.15 - tireGripBonus * 0.36);

      return {
        maxSpeed, accel, brakePower, steerPower, turboSpeedMult, turboRecharge,
        aggression: con, consistency: con, technique: tec, charisma: car,
        cornerPushFactor, cornerSpeedCap, effectiveWetPenalty, tireScrubFactor
      };
    }

    update(dt, input) {
      const AudioFX = global.AudioFX;
      if (this.paused) {
        AudioFX.updateEngine(0, false, true);
        return;
      }
      const clampedDt = Math.min(dt, 0.05);

      if (this.phase === 'countdown') {
        this.countdownTimer += clampedDt;
        const step = Math.floor(this.countdownTimer / 0.95);

        if (step !== this.lastCountdownStep) {
          this.lastCountdownStep = step;
          if (step === 0) {
            this.track.setStartLights(2); AudioFX.playCountdownBeep(false); this.callbacks.onCountdown?.('3', false);
          } else if (step === 1) {
            this.track.setStartLights(4); AudioFX.playCountdownBeep(false); this.callbacks.onCountdown?.('2', false);
          } else if (step === 2) {
            this.track.setStartLights(5); AudioFX.playCountdownBeep(false); this.callbacks.onCountdown?.('1', false);
          } else if (step >= 3) {
            this.track.setStartLights(6); AudioFX.playCountdownBeep(true); this.callbacks.onCountdown?.('¡YA!', true);
            this.phase = 'racing';
            if (input.accel) {
              this.player.v = 24;
              this.player.turbo = Math.min(100, this.player.turbo + 15);
              this.player.moral = Math.min(100, this.player.moral + 12);
              this.callbacks.onToast?.('🚀 ¡SALIDA PERFECTA!', '#22C55E');
            }
          }
        }

        this.racers.forEach(r => {
          if (r.isPlayer && input.accel) {
            r.bobbleVelX += (Math.random() - 0.5) * 4 * clampedDt;
            r.visual.bodyTiltGroup.position.y = Math.sin(this.countdownTimer * 38) * 0.03;
          }
          this._syncCarTransform(r, clampedDt);
        });
        AudioFX.updateEngine(input.accel ? 0.35 : 0.08, false, false);
        return;
      }

      if (this.phase === 'racing') this.raceElapsed += clampedDt;

      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        if (r.isPlayer && this.phase === 'racing') this._updatePlayer(r, clampedDt, input);
        else this._updateAI(r, clampedDt);
      }

      this._resolveCarInteractions(clampedDt);
      this._updateStandings();

      for (let i = 0; i < this.racers.length; i++) {
        this._syncCarTransform(this.racers[i], clampedDt);
      }

      this._updateParticles(clampedDt);

      if (this.phase === 'racing') {
        AudioFX.updateEngine(this.player.v / 105, this.player.turboActive, false);
      } else {
        AudioFX.updateEngine(0, false, true);
      }
    }

    _updatePlayer(r, dt, input) {
      const AudioFX = global.AudioFX;
      const sample = this.track.sampleAtDistance(r.s);
      const curvAbs = Math.abs(sample.curvature);
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, sample.hasGrandstand, perf.charisma);

      const wantsTurbo = input.turbo && r.turbo > 8;
      if (wantsTurbo && !r.turboActive && r.turbo >= 22) {
        r.turboActive = true;
        AudioFX.playTurbo();
      } else if (!input.turbo || r.turbo <= 1) {
        r.turboActive = false;
      }

      if (r.turboActive) {
        r.turbo = Math.max(0, r.turbo - dt * 32);
        if (r.turbo <= 0.5) r.turboActive = false;
      } else {
        const speedBonus = (r.v > 45 ? 1.15 : 0.7);
        r.turbo = Math.min(100, r.turbo + perf.turboRecharge * speedBonus * dt);
      }

      const effectiveMax = perf.maxSpeed * (r.turboActive ? perf.turboSpeedMult : 1.0);
      const effectiveAccel = perf.accel * (r.turboActive ? 1.65 : 1.0);

      if (input.accel || r.turboActive) {
        if (r.v < effectiveMax) {
          const lowBoost = r.v < 35 ? 1.35 : 1.0;
          r.v = Math.min(effectiveMax, r.v + effectiveAccel * lowBoost * dt);
        } else {
          r.v = THREE.MathUtils.lerp(r.v, effectiveMax, dt * 3.5);
        }
      } else if (input.brake) {
        r.v = Math.max(0, r.v - perf.brakePower * dt);
      } else {
        r.v = Math.max(0, r.v - 16 * dt);
      }

      if (curvAbs > 0.25 && r.v > perf.cornerSpeedCap && !r.turboActive) {
        const scrub = (r.v - perf.cornerSpeedCap) * (1.2 + perf.effectiveWetPenalty * 2.5) * perf.tireScrubFactor;
        r.v = Math.max(perf.cornerSpeedCap * 0.85, r.v - scrub * dt);
      }

      const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      r.steerVisual = THREE.MathUtils.lerp(r.steerVisual, steerInput, dt * 11);

      const brakeTurnBonus = input.brake && r.v > 25 ? 1.18 : 1.0;
      const speedSteerScale = THREE.MathUtils.clamp(r.v / 32, 0.25, 1.0);
      const targetLatVel = steerInput * perf.steerPower * brakeTurnBonus * speedSteerScale;

      const speedNorm = r.v / 95;
      const outwardPush = -sample.curvature * speedNorm * speedNorm * 13.5 * perf.cornerPushFactor;

      const latResponsiveness = this.circuitMeta.rainIntensity > 0 ? 5.2 + (perf.technique - 70) * 0.08 : 8.5;
      r.lateralVel = THREE.MathUtils.lerp(r.lateralVel, targetLatVel + outwardPush, dt * latResponsiveness);
      r.d += r.lateralVel * dt;

      const maxD = this.track.halfWidth - 1.25;
      if (Math.abs(r.d) > maxD) {
        const sign = Math.sign(r.d);
        r.d = sign * maxD;
        r.lateralVel *= -0.25;
        const wallRetain = THREE.MathUtils.clamp(0.955 + (perf.consistency - 70) * 0.0005, 0.945, 0.978);
        r.v *= wallRetain;
        r.bobbleVelZ -= sign * 8;
      }

      const prevLap = r.lap;
      r.s += r.v * dt;
      const newLap = Math.floor(Math.max(0, r.s) / this.track.totalLength) + 1;
      if (newLap > prevLap && r.s > 10) {
        r.lap = newLap;
        if (r.lap > this.totalLaps) {
          this._finishRace();
        } else {
          const isFinal = r.lap === this.totalLaps;
          AudioFX.playLapChime(isFinal);
          this.callbacks.onLap?.(r.lap, this.totalLaps);
          if (isFinal) this.callbacks.onToast?.('🏁 ¡ÚLTIMA VUELTA!', '#FFD43B');
          else this.callbacks.onToast?.(`⏱️ VUELTA ${r.lap} / ${this.totalLaps}`, '#00E5FF');
        }
      }

      if ((this.circuitMeta.rainIntensity > 0 && r.v > 35) || (Math.abs(r.lateralVel) > 8 && r.v > 45) || r.turboActive) {
        if (Math.random() < 0.65) {
          const emitPos = r.worldPos.clone().addScaledVector(r.worldForward, -2.0);
          emitPos.y = 0.35;
          const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2.2 + Math.random() * 2, (Math.random() - 0.5) * 3);
          this._emitParticle(emitPos, vel, 0.36);
        }
      }

      r.bobbleVelZ += (-steerInput * 12 - sample.curvature * 5) * dt;
      if (r.turboActive) r.bobbleVelX -= 14 * dt;
    }

    _updateAI(r, dt) {
      const sample = this.track.sampleAtDistance(r.s);
      const lookAhead = this.track.sampleAtDistance(r.s + 26);
      const curvAbs = Math.max(Math.abs(sample.curvature), Math.abs(lookAhead.curvature));
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, sample.hasGrandstand, perf.charisma * 0.72);

      const distToPlayer = r.s - this.player.s;
      let rubber = 1.0;
      if (distToPlayer > 75) rubber = 0.92;
      else if (distToPlayer > 140) rubber = 0.86;
      else if (distToPlayer < -95) rubber = 1.06;
      r.aiRubberBias = THREE.MathUtils.lerp(r.aiRubberBias, rubber, dt * 0.8);

      if (curvAbs < 0.22 && r.turbo > 68 && !r.turboActive && Math.random() < dt * 1.4) r.turboActive = true;
      if (r.turboActive) {
        r.turbo = Math.max(0, r.turbo - dt * 34);
        if (r.turbo <= 5 || curvAbs > 0.55) r.turboActive = false;
      } else {
        r.turbo = Math.min(100, r.turbo + perf.turboRecharge * 0.82 * dt);
      }

      const aggrBonus = 1.0 + (perf.aggression - 85) * 0.0018;
      const baseCap = Math.min(perf.maxSpeed, perf.cornerSpeedCap * 1.04) * r.aiPaceFactor * r.aiRubberBias * aggrBonus;
      const desiredSpeed = baseCap * (r.turboActive ? perf.turboSpeedMult * 0.95 : 1.0);

      if (r.v < desiredSpeed) r.v = Math.min(desiredSpeed, r.v + perf.accel * 1.08 * dt);
      else r.v = Math.max(desiredSpeed, r.v - perf.brakePower * 0.85 * dt);

      r.aiLaneTimer -= dt;
      if (r.aiLaneTimer <= 0) {
        r.aiLaneTimer = 1.1 + Math.random() * 1.9;
        const apexPref = Math.sign(lookAhead.curvature) * (this.track.halfWidth * 0.42);
        const jitter = (Math.random() - 0.5) * (this.track.halfWidth * 0.55);
        r.aiTargetD = THREE.MathUtils.clamp(apexPref + jitter, -this.track.halfWidth + 2.4, this.track.halfWidth - 2.4);
      }

      for (let j = 0; j < this.racers.length; j++) {
        const other = this.racers[j];
        if (other === r) continue;
        const ds = other.s - r.s;
        if (ds > 1.5 && ds < 14 && Math.abs(other.d - r.d) < 2.8) {
          const passSide = other.d > 0 ? -1 : 1;
          const boldness = 2.6 + (perf.aggression / 99) * 2.2;
          r.aiTargetD = THREE.MathUtils.clamp(other.d + passSide * boldness, -this.track.halfWidth + 2.0, this.track.halfWidth - 2.0);
          break;
        }
      }

      const diffD = r.aiTargetD - r.d;
      const steerCmd = THREE.MathUtils.clamp(diffD * 0.45, -1, 1);
      r.steerVisual = THREE.MathUtils.lerp(r.steerVisual, steerCmd, dt * 8);
      r.d += steerCmd * (perf.steerPower * 0.65) * dt;
      r.d = THREE.MathUtils.clamp(r.d, -this.track.halfWidth + 1.4, this.track.halfWidth - 1.4);

      r.s += r.v * dt;
      const newLap = Math.floor(Math.max(0, r.s) / this.track.totalLength) + 1;
      if (newLap > r.lap && r.s > 10) {
        r.lap = newLap;
        if (r.lap > this.totalLaps && !r.finished) {
          r.finished = true;
          r.finishTime = this.raceElapsed;
        }
      }
    }

    _updateMoralSystem(r, dt, nearGrandstand, charisma) {
      const AudioFX = global.AudioFX;
      if (r.moralOverdriveTimer > 0) {
        r.moralOverdriveTimer -= dt;
        r.moral = Math.max(0, (r.moralOverdriveTimer / 7.5) * 100);
        r.moralMultiplier = 1.22;
        if (r.moralOverdriveTimer <= 0) {
          r.moralOverdriveTimer = 0; r.moral = 0; r.moralMultiplier = 1.0;
        }
        return;
      }

      const charismaFactor = 0.55 + ((charisma - 70) / 30) * 0.95;
      const baseFill = (r.v > 45 ? 1.8 : 0.4) * charismaFactor;
      const grandstandBonus = nearGrandstand ? 6.2 * charismaFactor : 0;

      r.moral = Math.min(100, r.moral + (baseFill + grandstandBonus) * dt);
      r.moralMultiplier = 1.0 + (r.moral / 100) * 0.10;

      if (r.isPlayer && nearGrandstand && Math.random() < dt * 0.55) AudioFX.playCrowdCheer();

      if (r.moral >= 100) {
        r.moralOverdriveTimer = 7.5;
        r.moralMultiplier = 1.22;
        if (r.isPlayer) {
          AudioFX.playMoralOverdrive();
          AudioFX.playCrowdCheer();
          this.callbacks.onToast?.('⭐ ¡MORAL MÁXIMA! +22% TODAS LAS STATS', '#FFD43B');
        }
      }
    }

    _resolveCarInteractions(dt) {
      const AudioFX = global.AudioFX;
      for (let i = 0; i < this.racers.length; i++) {
        const a = this.racers[i];
        for (let j = i + 1; j < this.racers.length; j++) {
          const b = this.racers[j];
          const ds = Math.abs(a.s - b.s);
          if (ds < 4.3) {
            const dd = a.d - b.d;
            const absD = Math.abs(dd);
            if (absD < 2.25) {
              const push = (2.25 - absD) * 0.55;
              const dir = dd >= 0 ? 1 : -1;
              a.d = THREE.MathUtils.clamp(a.d + dir * push, -this.track.halfWidth + 1.3, this.track.halfWidth - 1.3);
              b.d = THREE.MathUtils.clamp(b.d - dir * push, -this.track.halfWidth + 1.3, this.track.halfWidth - 1.3);
              if (a.isPlayer || b.isPlayer) {
                AudioFX.playBump();
                a.bobbleVelZ += dir * 9;
                b.bobbleVelZ -= dir * 9;
              }
            }
          } else if (ds < 16 && Math.abs(a.d - b.d) < 2.0) {
            const trailing = a.s < b.s ? a : b;
            trailing.turbo = Math.min(100, trailing.turbo + 6.5 * dt);
            if (trailing.isPlayer) trailing.v = Math.min(trailing.v + 5.5 * dt, 130);
          }
        }
      }
    }

    _updateStandings() {
      const AudioFX = global.AudioFX;
      const ordered = [...this.racers].sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.s - a.s;
      });

      ordered.forEach((r, idx) => {
        r.prevPosition = r.position;
        r.position = idx + 1;
        if (r.isPlayer && this.phase === 'racing' && this.raceElapsed > 3.0 && r.position < r.prevPosition) {
          const gained = r.prevPosition - r.position;
          const boost = gained * (4.5 + (r.driver.stats.carisma - 70) * 0.14);
          if (r.moralOverdriveTimer <= 0) r.moral = Math.min(100, r.moral + boost);
          AudioFX.playCrowdCheer();
          if (r.position === 1) this.callbacks.onToast?.('👑 ¡LÍDER DE CARRERA!', '#FFD43B');
          else this.callbacks.onToast?.(`🔥 ¡ADELANTAMIENTO! P${r.position}`, '#00F5D4');
        }
      });
    }

    _syncCarTransform(r, dt) {
      const sample = this.track.sampleAtDistance(r.s);
      const pos = sample.pos.clone().addScaledVector(sample.right, r.d);
      r.worldPos.copy(pos);
      r.worldForward.copy(sample.tangent);

      r.visual.root.position.set(pos.x, 0.08, pos.z);
      const trackYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      const targetYawOff = -r.steerVisual * 0.17 + sample.curvature * 0.06;
      r.yawOffset = THREE.MathUtils.lerp(r.yawOffset, targetYawOff, Math.min(1, dt * 10 || 1));
      r.visual.root.rotation.y = trackYaw + r.yawOffset;

      const targetRoll = -r.steerVisual * 0.12;
      const targetPitch = r.turboActive ? -0.065 : (r.v > 10 ? -0.015 : 0);
      r.visual.bodyTiltGroup.rotation.z = THREE.MathUtils.lerp(r.visual.bodyTiltGroup.rotation.z, targetRoll, Math.min(1, dt * 9 || 1));
      r.visual.bodyTiltGroup.rotation.x = THREE.MathUtils.lerp(r.visual.bodyTiltGroup.rotation.x, targetPitch, Math.min(1, dt * 9 || 1));

      r.wheelSpin += r.v * dt * 1.45;
      for (let i = 0; i < r.visual.wheels.length; i++) r.visual.wheels[i].rotation.x = r.wheelSpin;
      for (let i = 0; i < r.visual.frontSteerPivots.length; i++) r.visual.frontSteerPivots[i].rotation.y = -r.steerVisual * 0.42;

      // Turn steering wheel + articulated gloved arms solidly in real time
      if (r.visual.updateSteering) r.visual.updateSteering(r.steerVisual);

      if (dt > 0) {
        const k = 95, damp = 9.2;
        r.bobbleVelX += (-k * r.bobbleX - damp * r.bobbleVelX) * dt;
        r.bobbleVelZ += (-k * r.bobbleZ - damp * r.bobbleVelZ) * dt;
        r.bobbleX = THREE.MathUtils.clamp(r.bobbleX + r.bobbleVelX * dt, -0.16, 0.16);
        r.bobbleZ = THREE.MathUtils.clamp(r.bobbleZ + r.bobbleVelZ * dt, -0.18, 0.18);
      }
      r.visual.headPivot.rotation.x = r.bobbleX;
      r.visual.headPivot.rotation.z = r.bobbleZ;
      r.visual.headPivot.rotation.y = -r.steerVisual * 0.28;

      r.visual.turboFlameGroup.visible = r.turboActive;
      if (r.turboActive) r.visual.turboFlameGroup.scale.set(1, 1, 0.85 + Math.random() * 0.45);

      const hasOverdrive = r.moralOverdriveTimer > 0;
      r.visual.moralAura.visible = hasOverdrive;
      if (hasOverdrive) {
        r.visual.moralAura.rotation.z += dt * 4.5;
        const s = 1 + Math.sin(this.raceElapsed * 12) * 0.08;
        r.visual.moralAura.scale.set(s, s, 1);
      }
    }

    _updateParticles(dt) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          dummy.scale.set(0, 0, 0); dummy.updateMatrix();
          this.particleMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        p.pos.addScaledVector(p.vel, dt);
        const t = 1 - p.life / p.maxLife;
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(t * 1.35);
        dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }

    _finishRace() {
      if (this.phase === 'finished') return;
      this.phase = 'finished';
      this.player.finished = true;
      this.player.finishTime = this.raceElapsed;
      global.AudioFX.stopEngine();
      global.AudioFX.playVictoryFanfare();

      const targetDist = this.track.totalLength * this.totalLaps;
      this.racers.forEach(r => {
        if (!r.finished) {
          const remaining = Math.max(2, targetDist - r.s);
          const estSpeed = Math.max(55, r.v || 82);
          r.finishTime = this.raceElapsed + remaining / estSpeed;
          r.finished = true;
        }
      });

      const results = [...this.racers]
        .sort((a, b) => a.finishTime - b.finishTime)
        .map((r, idx) => ({
          position: idx + 1, driver: r.driver, team: r.team, isPlayer: r.isPlayer, finishTime: r.finishTime
        }));

      this.callbacks.onFinish?.(results);
    }

    getHudSnapshot() {
      const p = this.player;
      const kmh = Math.round(p.v * SPEED_DISPLAY_SCALE);
      const gear = Math.min(8, Math.max(1, Math.floor(kmh / 45) + 1));
      const crowdExcitement = p.moralOverdriveTimer > 0
        ? 1.0
        : THREE.MathUtils.clamp(0.25 + (p.moral / 100) * 0.65, 0.25, 0.9);

      return {
        position: p.position, totalRacers: this.racers.length,
        lap: Math.min(p.lap, this.totalLaps), totalLaps: this.totalLaps,
        kmh, gear, speedRatio: THREE.MathUtils.clamp(kmh / 350, 0, 1),
        turbo: p.turbo, turboActive: p.turboActive,
        moral: p.moral, moralMultiplier: p.moralMultiplier, moralOverdrive: p.moralOverdriveTimer > 0,
        raceElapsed: this.raceElapsed, crowdExcitement,
        playerPos: p.worldPos, playerForward: p.worldForward, racers: this.racers
      };
    }
  }

  global.RaceEngine = RaceEngine;
})(window);
