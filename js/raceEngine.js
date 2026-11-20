// ============================================================================
// RACEENGINE.JS — Parche v1.2: Física con Masa e Inercia, Subviraje Progresivo,
//                 Suspensión Dinámica (Pitch & Roll), IA Competitiva al Apex,
//                 Largada Mario Kart (5 Luces), Colisiones Sólidas y Pool de
//                 Partículas (Chispas, Fuego Backfire y Humo de Neumáticos)
// ============================================================================
(function (global) {
  'use strict';

  // Calibrated so ~15% calmer world-space pace still displays authentic F1 km/h
  const SPEED_DISPLAY_SCALE = 3.72;
  const CAR_MASS = 798; // kg
  const CAR_LEN = 4.65;
  const CAR_WID = 2.34;

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

      // Mario Kart / F1 5-light start minigame state
      this.phase = 'countdown';
      this.countdownTimer = 0;
      // 5 lights illuminate at 0.0, 0.72, 1.44, 2.16, 2.88 -> hold 0.55..0.90s -> Lights Out!
      this.lightsOutTime = 3.60 + 0.50 + Math.random() * 0.35;
      this.lastLitCount = -1;
      this.lightsOutTriggered = false;
      this.playerPressedEarly = false;
      this.playerLaunchResolved = false;
      this.launchWindowTimer = 0;
      this.launchFlashTimer = 0;
      this.launchStatus = 'wait'; // 'wait' | 'early' | 'go' | 'perfect' | 'wheelspin' | 'slow'

      this.raceElapsed = 0;
      this.paused = false;

      // Reusable scratch objects (zero GC allocations per frame)
      this._dummy = new THREE.Object3D();
      this._tmpPos = new THREE.Vector3();
      this._tmpVel = new THREE.Vector3();
      this._tmpRight = new THREE.Vector3();
      this._tmpCol = new THREE.Color();
      this._up = new THREE.Vector3(0, 1, 0);

      this._initParticlePools();
      this._spawnGrid();
    }

    // ========================================================================
    // 4. LIGHTWEIGHT POOLED PARTICLE SYSTEM (SPARKS, BACKFIRE, TIRE SMOKE)
    // ========================================================================
    _initParticlePools() {
      const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

      // 1. Floor, kerb & collision sparks (orange-gold, gravity + asphalt bounce)
      const sparkCount = 140;
      const sparkGeo = new THREE.BoxGeometry(0.085, 0.085, 0.42);
      const sparkMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, sparkCount);
      this.sparkMesh.frustumCulled = false;
      this.sparks = [];
      const goldPalette = ['#FFD43B', '#FFB703', '#FF8800', '#FFF0A8'];
      for (let i = 0; i < sparkCount; i++) {
        this.sparks.push({ active: false, life: 0, maxLife: 0.35, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
        this.sparkMesh.setMatrixAt(i, zeroMat);
        this._tmpCol.set(goldPalette[i % goldPalette.length]);
        this.sparkMesh.setColorAt(i, this._tmpCol);
      }
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
      this.sparkCursor = 0;
      this.root.add(this.sparkMesh);

      // 2. Exhaust backfire flames (blue/orange pops on downshift & turbo/launch)
      const fireCount = 48;
      const fireGeo = new THREE.SphereGeometry(0.24, 7, 6);
      const fireMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.92, depthWrite: false });
      this.fireMesh = new THREE.InstancedMesh(fireGeo, fireMat, fireCount);
      this.fireMesh.frustumCulled = false;
      this.fires = [];
      this._tmpCol.set('#38BDF8');
      for (let i = 0; i < fireCount; i++) {
        this.fires.push({ active: false, life: 0, maxLife: 0.16, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
        this.fireMesh.setMatrixAt(i, zeroMat);
        this.fireMesh.setColorAt(i, this._tmpCol);
      }
      this.fireMesh.instanceMatrix.needsUpdate = true;
      if (this.fireMesh.instanceColor) this.fireMesh.instanceColor.needsUpdate = true;
      this.fireCursor = 0;
      this.root.add(this.fireMesh);

      // 3. Tire smoke & wet spray (white/grayish expanding clouds behind rear wheels)
      const isWet = this.circuitMeta.rainIntensity > 0;
      const smokeCount = 120;
      const smokeGeo = new THREE.SphereGeometry(isWet ? 0.30 : 0.29, 7, 6);
      const smokeMat = new THREE.MeshBasicMaterial({
        color: isWet ? '#BAE6FD' : '#E2E8F0',
        transparent: true,
        opacity: 0.56,
        depthWrite: false
      });
      this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
      this.smokeMesh.frustumCulled = false;
      this.smokes = [];
      for (let i = 0; i < smokeCount; i++) {
        this.smokes.push({ active: false, life: 0, maxLife: 0.52, pos: new THREE.Vector3(), vel: new THREE.Vector3(), baseScale: 1.0 });
        this.smokeMesh.setMatrixAt(i, zeroMat);
      }
      this.smokeMesh.instanceMatrix.needsUpdate = true;
      this.smokeCursor = 0;
      this.root.add(this.smokeMesh);
    }

    _emitSpark(pos, vel, maxLife = 0.36) {
      const p = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
      p.active = true;
      p.life = 0;
      p.maxLife = maxLife;
      p.pos.copy(pos);
      p.vel.copy(vel);
    }

    _emitSparkBurst(origin, forward, count = 6, spread = 8) {
      for (let i = 0; i < count; i++) {
        this._tmpVel.set(
          -forward.x * (6 + Math.random() * 9) + (Math.random() - 0.5) * spread,
          2.4 + Math.random() * 4.6,
          -forward.z * (6 + Math.random() * 9) + (Math.random() - 0.5) * spread
        );
        this._emitSpark(origin, this._tmpVel, 0.28 + Math.random() * 0.25);
      }
    }

    _emitBackfire(racer, isBlue = true) {
      for (let i = 0; i < 3; i++) {
        const idx = this.fireCursor;
        const p = this.fires[idx];
        this.fireCursor = (this.fireCursor + 1) % this.fires.length;
        p.active = true;
        p.life = 0;
        p.maxLife = 0.14 + Math.random() * 0.08;
        p.pos.copy(racer.worldPos)
          .addScaledVector(racer.worldForward, -2.02 - i * 0.22);
        p.pos.y = 0.58 + (Math.random() - 0.5) * 0.07;
        p.vel.copy(racer.worldForward).multiplyScalar(-11 - Math.random() * 6);
        p.vel.y = (Math.random() - 0.5) * 1.1;
        this._tmpCol.set(i === 0 ? (isBlue ? '#38BDF8' : '#FF5E00') : (isBlue ? '#00E5FF' : '#FFB703'));
        this.fireMesh.setColorAt(idx, this._tmpCol);
      }
      if (this.fireMesh.instanceColor) this.fireMesh.instanceColor.needsUpdate = true;
    }

    _emitTireSmoke(racer, scale = 1.0, density = 1) {
      this._tmpRight.crossVectors(racer.worldForward, this._up).normalize();
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < density; k++) {
          const p = this.smokes[this.smokeCursor];
          this.smokeCursor = (this.smokeCursor + 1) % this.smokes.length;
          p.active = true;
          p.life = 0;
          p.maxLife = 0.44 + Math.random() * 0.24;
          p.baseScale = scale * (0.85 + Math.random() * 0.35);
          p.pos.copy(racer.worldPos)
            .addScaledVector(racer.worldForward, -1.52)
            .addScaledVector(this._tmpRight, side * 1.15);
          p.pos.y = 0.26 + Math.random() * 0.12;
          p.vel.set(
            (Math.random() - 0.5) * 2.4,
            1.65 + Math.random() * 1.9,
            (Math.random() - 0.5) * 2.4
          );
        }
      }
    }

    // ========================================================================
    // GRID SPAWNING (22 DRIVERS)
    // ========================================================================
    _spawnGrid() {
      const { DRIVERS, getTeamById } = global.F1Data;
      const { buildF1Car } = global.CarBuilder;

      const sorted = [...DRIVERS].sort((a, b) => {
        const scoreA = getTeamById(a.teamId).rating * 0.52 + a.stats.velocidad * 0.30 + a.stats.tecnica * 0.18 + (Math.random() * 4 - 2);
        const scoreB = getTeamById(b.teamId).rating * 0.52 + b.stats.velocidad * 0.30 + b.stats.tecnica * 0.18 + (Math.random() * 4 - 2);
        return scoreB - scoreA;
      });

      const pIdx = sorted.findIndex(d => d.id === this.playerDriverId);
      if (pIdx !== -1) {
        const [pDriver] = sorted.splice(pIdx, 1);
        const targetSlot = Math.min(11, Math.max(6, Math.floor(pIdx * 0.72) + 5));
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
        const startS = -8 - row * 7.2 - (col === 1 ? 2.6 : 0);
        const startD = col * Math.min(halfW * 0.42, 3.2);

        const isTopSix = gridIdx < 6;
        const racer = {
          driver, team, isPlayer, visual: carVisual,
          gridIdx,
          s: startS, lap: 1, d: startD, v: 0, prevV: 0,
          longitudinalAccel: 0, lateralVel: 0,
          steerInputSmooth: 0, steerVisual: 0, yawOffset: 0,
          pitchVisual: 0, rollVisual: 0,
          prevGear: 1,
          prevAccel: false,
          prevTurboActive: false,
          wheelspinTimer: 0,
          launchBoostTimer: 0,
          turbo: isPlayer ? 50 : 48 + Math.random() * 28,
          turboActive: false,
          moral: isPlayer ? 25 : 22,
          moralOverdriveTimer: 0,
          moralMultiplier: 1.0,
          bobbleVelX: 0, bobbleVelZ: 0, bobbleX: 0, bobbleZ: 0,
          wheelSpin: 0,
          position: gridIdx + 1, prevPosition: gridIdx + 1,
          finished: false, finishTime: 0,
          worldPos: new THREE.Vector3(),
          worldForward: new THREE.Vector3(0, 0, 1),
          aiTargetD: startD,
          aiLaneTimer: 0.55 + Math.random() * 0.9,
          aiReactionDelay: isTopSix ? (0.01 + Math.random() * 0.03) : (0.06 + Math.random() * 0.14),
          aiPaceFactor: (isTopSix ? 1.015 : 0.992) + (driver.stats.velocidad * 0.00048) + (driver.stats.tecnica * 0.00038) + (Math.random() * 0.016 - 0.008),
          aiRubberBias: 1.0,
          aiDefend: { moveUsedOnStraight: false, activeTimer: 0, blockTargetD: startD }
        };

        this._syncCarTransform(racer, 0);
        this.racers.push(racer);
        if (isPlayer) this.player = racer;
      });
    }

    // ========================================================================
    // 1. PERFORMANCE MODEL (~15% CALMER TOP SPEED + REAL MASS/INERTIA)
    // ========================================================================
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

      const teamSpeedFactor = 0.89 + (teamRating / 100) * 0.15;
      // Base world-space top speed reduced ~15% vs v1.1 for tactical corner reading
      const maxSpeed = (70 + (vel - 70) * 0.37) * teamSpeedFactor;
      const engineForce = (22500 + (ace - 70) * 290) * teamSpeedFactor; // Newtons
      const brakeForce = 42500 + (fre - 70) * 480; // Newtons
      const steerPower = 15.6 + (crv - 70) * 0.21;
      const turboSpeedMult = 1.18 + ((tec * 0.55 + neu * 0.45) - 70) * 0.0032;
      const turboRecharge = 5.2 + (neu - 70) * 0.13;

      const wetPenaltyBase = isWet ? this.circuitMeta.rainIntensity * 0.20 : 0;
      const techGripBonus = Math.max(0, (tec - 70) / 30);
      const tireGripBonus = Math.max(0, (neu - 70) / 30);
      const cornerSkillBonus = Math.max(0, (crv - 70) / 30);
      const effectiveWetPenalty = Math.max(0.015, wetPenaltyBase * (1 - techGripBonus * 0.65));

      const cornerPushFactor = Math.max(0.35, (1.20 + effectiveWetPenalty * 2.3) - (techGripBonus * 0.28 + tireGripBonus * 0.20));
      const cornerSpeedCap = maxSpeed * Math.max(0.48, 1.0 - curvatureAbs * (0.37 - (cornerSkillBonus * 0.08 + tireGripBonus * 0.05) + effectiveWetPenalty * 0.48));
      const tireScrubFactor = Math.max(0.64, 1.15 - tireGripBonus * 0.34);

      return {
        maxSpeed, engineForce, brakeForce, steerPower, turboSpeedMult, turboRecharge,
        aggression: con, consistency: con, technique: tec, charisma: car,
        cornerPushFactor, cornerSpeedCap, effectiveWetPenalty, tireScrubFactor
      };
    }

    // ========================================================================
    // MAIN SIMULATION UPDATE
    // ========================================================================
    update(dt, input) {
      const AudioFX = global.AudioFX;
      if (this.paused) {
        AudioFX.updateEngine(0, false, true);
        return;
      }
      const clampedDt = Math.min(dt, 0.05);
      if (this.launchFlashTimer > 0) this.launchFlashTimer = Math.max(0, this.launchFlashTimer - clampedDt);

      if (this.phase === 'countdown') {
        this._updateCountdown(clampedDt, input);
        this._updateParticles(clampedDt);
        return;
      }

      if (this.phase === 'racing') {
        this.raceElapsed += clampedDt;
        // Demanding 150ms post-lights-out precision window for Perfect Launch
        if (!this.playerLaunchResolved) {
          this.launchWindowTimer += clampedDt;
          const manualAccel = input.manualAccel !== undefined ? input.manualAccel : input.accel;
          if (manualAccel) {
            this.playerLaunchResolved = true;
            if (this.launchWindowTimer <= 0.15) {
              // PERFECT LAUNCH (150ms precision window)!
              this.player.launchBoostTimer = 1.35;
              this.player.v = Math.max(this.player.v, 21);
              this.player.turbo = Math.min(100, this.player.turbo + 16);
              this.player.moral = Math.min(100, this.player.moral + 12);
              this.launchFlashTimer = 0.50;
              this.launchStatus = 'perfect';
              this._emitBackfire(this.player, true);
              AudioFX.playTurbo();
              this.callbacks.onToast?.('🚀 ¡SALIDA PERFECTA!', '#22C55E');
            } else if (this.launchWindowTimer <= 0.40) {
              this.launchStatus = 'good';
              this.callbacks.onToast?.('🏁 SALIDA LIMPIA', '#00E5FF');
            } else {
              this.launchStatus = 'slow';
              this.callbacks.onToast?.('🐢 SALIDA LENTA', '#F59E0B');
            }
          } else if (this.launchWindowTimer > 0.48) {
            this.playerLaunchResolved = true;
            this.launchStatus = 'slow';
            this.callbacks.onToast?.('🐢 SALIDA LENTA', '#F59E0B');
          }
        }
      }

      for (let i = 0; i < this.racers.length; i++) {
        const r = this.racers[i];
        r.prevV = r.v;
        if (r.isPlayer && this.phase === 'racing') this._updatePlayer(r, clampedDt, input);
        else this._updateAI(r, clampedDt);
        r.longitudinalAccel = (r.v - r.prevV) / Math.max(0.001, clampedDt);
      }

      // 2 solver passes prevent any car from ever clipping through rivals even in dense Lap 1 packs
      this._resolveCarInteractions(clampedDt, true);
      this._resolveCarInteractions(clampedDt, false);
      this._updateStandings();

      for (let i = 0; i < this.racers.length; i++) {
        this._syncCarTransform(this.racers[i], clampedDt);
      }

      this._updateParticles(clampedDt);

      if (this.phase === 'racing') {
        AudioFX.updateEngine(this.player.v / 88, this.player.turboActive || this.player.launchBoostTimer > 0, false);
      } else {
        AudioFX.updateEngine(0, false, true);
      }
    }

    // ========================================================================
    // 2. MARIO KART / F1 5-LIGHT START MINIGAME (150ms WINDOW + FAST TOP-6)
    // ========================================================================
    _updateCountdown(dt, input) {
      const AudioFX = global.AudioFX;
      this.countdownTimer += dt;

      const litCount = Math.min(5, Math.floor(this.countdownTimer / 0.72) + 1);
      if (litCount !== this.lastLitCount && this.countdownTimer < this.lightsOutTime) {
        this.lastLitCount = litCount;
        this.track.setStartLights(litCount);
        AudioFX.playCountdownBeep(false);
        this.callbacks.onCountdown?.(String(litCount), false, litCount);
      }

      const manualAccel = input.manualAccel !== undefined ? input.manualAccel : input.accel;
      if (manualAccel && this.countdownTimer > 0.35 && this.countdownTimer < this.lightsOutTime) {
        this.playerPressedEarly = true;
        this.launchStatus = 'early';
        this.player.visual.bodyTiltGroup.position.y = Math.sin(this.countdownTimer * 46) * 0.035;
        this.player.wheelSpin += 24 * dt;
        if (Math.random() < 0.62) this._emitTireSmoke(this.player, 1.15, 1);
      } else {
        this.player.visual.bodyTiltGroup.position.y = 0;
        this.playerPressedEarly = false;
        this.launchStatus = 'wait';
      }

      this.racers.forEach(r => this._syncCarTransform(r, dt));
      AudioFX.updateEngine(manualAccel ? 0.38 : 0.09, false, false);

      if (this.countdownTimer >= this.lightsOutTime && !this.lightsOutTriggered) {
        this.lightsOutTriggered = true;
        this.track.setStartLights(6);
        AudioFX.playCountdownBeep(true);
        this.callbacks.onCountdown?.('¡YA!', true, 6);
        this.phase = 'racing';
        this.launchStatus = 'go';

        // Top 6 grid rivals execute ultra-fast starts by default so Turn 1 must be earned!
        this.racers.forEach(r => {
          if (!r.isPlayer && r.gridIdx < 6) {
            r.launchBoostTimer = 1.25;
            r.v = 18 + (6 - r.gridIdx) * 0.7;
            this._emitBackfire(r, true);
          }
        });

        if (this.playerPressedEarly && manualAccel) {
          // FALSE START -> WHEELSPIN PENALTY FOR 1.5s WITH DENSE SMOKE
          this.playerLaunchResolved = true;
          this.player.wheelspinTimer = 1.5;
          this.player.v = 5.5;
          this.launchStatus = 'wheelspin';
          this._emitTireSmoke(this.player, 1.6, 4);
          AudioFX.playBump('start_wheelspin');
          this.callbacks.onToast?.('💨 ¡PATINAJE DE RUEDAS!', '#EF4444');
        } else if (manualAccel) {
          // Hit throttle on exact frame of lights out -> PERFECT LAUNCH!
          this.playerLaunchResolved = true;
          this.player.launchBoostTimer = 1.35;
          this.player.v = 21;
          this.player.turbo = Math.min(100, this.player.turbo + 16);
          this.player.moral = Math.min(100, this.player.moral + 12);
          this.launchFlashTimer = 0.50;
          this.launchStatus = 'perfect';
          this._emitBackfire(this.player, true);
          AudioFX.playTurbo();
          this.callbacks.onToast?.('🚀 ¡SALIDA PERFECTA!', '#22C55E');
        }
      }
    }

    // ========================================================================
    // 1. PLAYER PHYSICS (MASS, INERTIA, PROGRESSIVE STEERING & UNDERSTEER)
    // ========================================================================
    _updatePlayer(r, dt, input) {
      const AudioFX = global.AudioFX;
      const sample = this.track.sampleAtDistance(r.s);
      const curvAbs = Math.abs(sample.curvature);
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, sample.hasGrandstand, perf.charisma);

      // Launch penalty / boost timers
      if (r.wheelspinTimer > 0) {
        r.wheelspinTimer = Math.max(0, r.wheelspinTimer - dt);
        if (Math.random() < 0.82) this._emitTireSmoke(r, 1.4, 2);
      }
      if (r.launchBoostTimer > 0) {
        r.launchBoostTimer = Math.max(0, r.launchBoostTimer - dt);
        if (Math.random() < 0.35) this._emitBackfire(r, true);
      }

      // Turbo / DRS activation (brief sound on engagement + soft blow-off valve on release)
      const wantsTurbo = input.turbo && r.turbo > 8 && r.wheelspinTimer <= 0;
      if (wantsTurbo && !r.turboActive && r.turbo >= 22) {
        r.turboActive = true;
        this._emitBackfire(r, true);
        AudioFX.playTurbo();
      } else if (!input.turbo || r.turbo <= 1) {
        if (r.turboActive) AudioFX.playTurboBlowOff();
        r.turboActive = false;
      }

      if (r.turboActive) {
        r.turbo = Math.max(0, r.turbo - dt * 31);
        if (r.turbo <= 0.5) {
          r.turboActive = false;
          AudioFX.playTurboBlowOff();
        }
      } else {
        const speedBonus = (r.v > 38 ? 1.12 : 0.68);
        r.turbo = Math.min(100, r.turbo + perf.turboRecharge * speedBonus * dt);
      }

      // Wait until player presses accel (or launch window closes) before autoAccel kicks in
      const effectiveAccelInput = this.playerLaunchResolved ? input.accel : (input.manualAccel ?? input.accel);

      // Soft turbo blow-off valve when lifting off full throttle at high speed
      if (r.prevAccel && !effectiveAccelInput && r.v > 48) {
        AudioFX.playTurboBlowOff();
      }
      r.prevAccel = !!effectiveAccelInput;
      r.prevTurboActive = r.turboActive;

      // --- LONGITUDINAL DYNAMICS WITH REAL MASS & AERODYNAMIC DRAG ---
      const launchMult = r.wheelspinTimer > 0 ? 0.36 : (r.launchBoostTimer > 0 ? 1.55 : 1.0);
      const effectiveMax = perf.maxSpeed * (r.turboActive ? perf.turboSpeedMult : 1.0) * (r.wheelspinTimer > 0 ? 0.52 : 1.0);
      const dragAccel = (r.v * r.v) * 0.0022 + r.v * 0.055;

      let netAccel = -dragAccel;
      if (effectiveAccelInput || r.turboActive) {
        const lowEndTorque = r.v < 26 ? 1.28 : 1.0;
        const thrust = (perf.engineForce / CAR_MASS) * (r.turboActive ? 1.50 : 1.0) * launchMult * lowEndTorque;
        netAccel += thrust;
      }
      if (input.brake) {
        netAccel -= (perf.brakeForce / CAR_MASS);
        if (r.v > 30 && Math.random() < 0.54) {
          this._emitTireSmoke(r, 0.96, 1);
        }
      }

      r.v = THREE.MathUtils.clamp(r.v + netAccel * dt, 0, effectiveMax * 1.06);
      if (r.v > effectiveMax && !r.turboActive) {
        r.v = THREE.MathUtils.lerp(r.v, effectiveMax, dt * 2.4);
      }

      // Detect gear downshifts under heavy braking -> emit exhaust backfire!
      const kmh = Math.round(r.v * SPEED_DISPLAY_SCALE);
      const currentGear = Math.min(8, Math.max(1, Math.floor(kmh / 42) + 1));
      if (currentGear < r.prevGear && input.brake && r.v > 20) {
        this._emitBackfire(r, false);
      }
      r.prevGear = currentGear;

      // Corner overspeed scrub
      const overspeedRatio = Math.max(0, (r.v - perf.cornerSpeedCap) / Math.max(1, perf.cornerSpeedCap));
      if (curvAbs > 0.22 && overspeedRatio > 0 && !r.turboActive) {
        const scrub = (r.v - perf.cornerSpeedCap) * (1.05 + perf.effectiveWetPenalty * 2.2) * perf.tireScrubFactor;
        r.v = Math.max(perf.cornerSpeedCap * 0.82, r.v - scrub * dt);
      }

      // --- PROGRESSIVE SPEED-SENSITIVE STEERING & UNDERSTEER (SUBVIRAJE) ---
      const rawSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      r.steerInputSmooth = THREE.MathUtils.lerp(r.steerInputSmooth, rawSteer, dt * 7.2);
      r.steerVisual = THREE.MathUtils.lerp(r.steerVisual, r.steerInputSmooth, dt * 10);

      const speedFrac = THREE.MathUtils.clamp(r.v / Math.max(1, perf.maxSpeed), 0, 1.15);
      const speedSensitivity = THREE.MathUtils.lerp(1.0, 0.54, Math.min(1, speedFrac * speedFrac));
      const lowSpeedScale = THREE.MathUtils.clamp(r.v / 22, 0.18, 1.0);

      const brakeTurnBonus = input.brake && r.v > 20 ? 1.14 : 1.0;
      const understeerGrip = (curvAbs > 0.20 && !input.brake)
        ? THREE.MathUtils.clamp(1.0 - overspeedRatio * 1.28, 0.28, 1.0)
        : 1.0;

      const targetLatVel = r.steerInputSmooth * perf.steerPower * speedSensitivity * lowSpeedScale * brakeTurnBonus * understeerGrip;
      const outwardPush = -sample.curvature * speedFrac * speedFrac * 15.6 * perf.cornerPushFactor * (1 + overspeedRatio * 1.38);

      const latGripRate = this.circuitMeta.rainIntensity > 0 ? 3.8 + (perf.technique - 70) * 0.06 : 5.4;
      r.lateralVel = THREE.MathUtils.lerp(r.lateralVel, targetLatVel + outwardPush, dt * latGripRate);
      r.d += r.lateralVel * dt;

      // Kerb riding sparks + wide grass/gravel drift tire smoke
      const kerbEdge = this.track.halfWidth - 1.95;
      if (Math.abs(r.d) > kerbEdge && r.v > 22) {
        if (Math.random() < 0.48) {
          this._tmpPos.copy(r.worldPos);
          this._tmpPos.y = 0.14;
          this._emitSparkBurst(this._tmpPos, r.worldForward, 2, 5.5);
        }
        if (Math.random() < 0.42) this._emitTireSmoke(r, 0.9, 1);
      }

      // High-speed aerodynamic floor bottoming sparks at end of straights
      if (r.v > perf.maxSpeed * 0.88 && curvAbs < 0.16 && Math.random() < 0.36) {
        this._tmpPos.copy(r.worldPos).addScaledVector(r.worldForward, -1.6);
        this._tmpPos.y = 0.13;
        this._emitSparkBurst(this._tmpPos, r.worldForward, 2, 4.2);
      }

      // Barrier containment with collision sparks & debounced carbon impact
      const maxD = this.track.halfWidth - 1.25;
      if (Math.abs(r.d) > maxD) {
        const sign = Math.sign(r.d);
        r.d = sign * maxD;
        r.lateralVel *= -0.22;
        const wallRetain = THREE.MathUtils.clamp(0.945 + (perf.consistency - 70) * 0.0005, 0.935, 0.968);
        r.v *= wallRetain;
        r.bobbleVelZ -= sign * 7.5;
        this._tmpPos.copy(r.worldPos);
        this._tmpPos.y = 0.32;
        this._emitSparkBurst(this._tmpPos, r.worldForward, 5, 7.5);
        AudioFX.playBump(`${r.driver.id}_wall`);
      }

      // Lap progression
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

      // Rain spray when wet
      if (this.circuitMeta.rainIntensity > 0 && r.v > 30 && Math.random() < 0.55) {
        this._emitTireSmoke(r, 0.9, 1);
      }

      r.bobbleVelZ += (-r.steerInputSmooth * 10 - sample.curvature * 4.5) * dt;
      if (r.turboActive) r.bobbleVelX -= 12 * dt;
    }

    // ========================================================================
    // 2. DEMANDING AI: AGGRESSIVE BLOCKING (<18m), ACTIVE ERS/TURBO & +15% PACE
    // ========================================================================
    _updateAI(r, dt) {
      if (this.raceElapsed < r.aiReactionDelay) return;

      if (r.launchBoostTimer > 0) {
        r.launchBoostTimer = Math.max(0, r.launchBoostTimer - dt);
        if (Math.random() < 0.25) this._emitBackfire(r, true);
      }

      const sample = this.track.sampleAtDistance(r.s);
      const lookAhead = this.track.sampleAtDistance(r.s + 24);
      const lookFar = this.track.sampleAtDistance(r.s + 46);
      const curvNow = Math.abs(sample.curvature);
      const curvAhead = Math.abs(lookAhead.curvature);
      const curvAbs = Math.max(curvNow, curvAhead * 0.92);
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, sample.hasGrandstand, perf.charisma * 0.82);

      // Minimal rubber-banding so front-runners stay genuinely hard to catch
      const distToPlayer = r.s - this.player.s;
      let rubber = 1.0;
      if (distToPlayer > 165) rubber = 0.97;
      else if (distToPlayer < -65) rubber = 1.06;
      r.aiRubberBias = THREE.MathUtils.lerp(r.aiRubberBias, rubber, dt * 0.7);

      // Corner exit detection (coming out of slow/medium bend onto straight)
      const isCornerExit = curvNow > 0.15 && Math.abs(lookFar.curvature) < curvNow * 0.75;

      // Active AI ERS / Turbo deployment on slow-corner exits, main straights & duels
      const playerThreat = distToPlayer > -3 && distToPlayer < 22;
      const shouldUseErs =
        (isCornerExit && r.turbo > 30) ||
        (curvAbs < 0.18 && r.turbo > 42) ||
        (playerThreat && curvAbs < 0.26 && r.turbo > 34);

      if (!r.turboActive && shouldUseErs && Math.random() < dt * 3.8) {
        r.turboActive = true;
        this._emitBackfire(r, true);
      }
      if (r.turboActive) {
        r.turbo = Math.max(0, r.turbo - dt * 29);
        if (Math.random() < 0.18) this._emitBackfire(r, false);
        if (r.turbo <= 4 || curvAbs > 0.48) r.turboActive = false;
      } else {
        r.turbo = Math.min(100, r.turbo + perf.turboRecharge * 0.96 * dt);
      }

      // +15% cornering speed & corner-exit traction for demanding AI pace
      const exitBoost = isCornerExit ? 1.24 : 1.05;
      const techBonus = 1.0 + (perf.technique - 82) * 0.0028;
      const aiCornerCap = Math.min(perf.maxSpeed * 1.04, perf.cornerSpeedCap * 1.15);
      const baseCap = aiCornerCap * r.aiPaceFactor * r.aiRubberBias * techBonus;
      const desiredSpeed = baseCap * (r.turboActive ? perf.turboSpeedMult : 1.0) * (r.launchBoostTimer > 0 ? 1.12 : 1.0);

      const aiAccel = (perf.engineForce / CAR_MASS) * 1.15 * exitBoost * (r.launchBoostTimer > 0 ? 1.38 : 1.0);
      const aiBrake = (perf.brakeForce / CAR_MASS) * 0.92;
      if (r.v < desiredSpeed) r.v = Math.min(desiredSpeed, r.v + aiAccel * dt);
      else r.v = Math.max(desiredSpeed, r.v - aiBrake * dt);

      // Reset one-defensive-move-per-straight flag whenever entering a notable corner
      if (curvNow > 0.24) {
        r.aiDefend.moveUsedOnStraight = false;
        r.aiDefend.activeTimer = 0;
      }
      if (r.aiDefend.activeTimer > 0) {
        r.aiDefend.activeTimer = Math.max(0, r.aiDefend.activeTimer - dt);
      }

      // --- AGGRESSIVE POSITION DEFENSE (BLOCKING WHEN PLAYER IS < 18m BEHIND) ---
      let isBlockingPlayer = false;
      const dsBehind = r.s - this.player.s;
      if (!this.player.finished && dsBehind > 1.6 && dsBehind < 18.0 && Math.abs(this.player.d - r.d) < 6.0) {
        if (!r.aiDefend.moveUsedOnStraight && (this.player.v >= r.v - 6 || dsBehind < 11.0)) {
          // Read the side the player is trying to pass on and shut the door cleanly
          const predictedAttackD = this.player.d + this.player.lateralVel * 0.22;
          r.aiDefend.blockTargetD = THREE.MathUtils.clamp(predictedAttackD, -this.track.halfWidth + 1.85, this.track.halfWidth - 1.85);
          r.aiDefend.moveUsedOnStraight = true;
          r.aiDefend.activeTimer = 1.45;
        }
        if (r.aiDefend.activeTimer > 0) {
          r.aiTargetD = r.aiDefend.blockTargetD;
          isBlockingPlayer = true;
        }
      }

      if (!isBlockingPlayer) {
        // Inside-apex racing line (positive curvature bends toward +d)
        r.aiLaneTimer -= dt;
        if (r.aiLaneTimer <= 0) {
          r.aiLaneTimer = 0.55 + Math.random() * 0.85;
          const apexStrength = THREE.MathUtils.clamp(0.50 + (perf.technique - 74) * 0.012, 0.48, 0.76);
          const apexTarget = curvAhead > 0.12
            ? Math.sign(lookAhead.curvature) * (this.track.halfWidth * apexStrength)
            : (Math.random() - 0.5) * (this.track.halfWidth * 0.28);
          r.aiTargetD = THREE.MathUtils.clamp(apexTarget, -this.track.halfWidth + 1.9, this.track.halfWidth - 1.9);
        }

        // Overtake avoidance when closing on slower car ahead
        for (let j = 0; j < this.racers.length; j++) {
          const other = this.racers[j];
          if (other === r) continue;
          const ds = other.s - r.s;
          if (ds > 2.0 && ds < 14 && Math.abs(other.d - r.d) < 2.95) {
            const passSide = other.d > 0 ? -1 : 1;
            const boldness = 2.95 + (perf.aggression / 99) * 2.0;
            r.aiTargetD = THREE.MathUtils.clamp(other.d + passSide * boldness, -this.track.halfWidth + 1.8, this.track.halfWidth - 1.8);
            break;
          }
        }
      }

      const diffD = r.aiTargetD - r.d;
      const steerCmd = THREE.MathUtils.clamp(diffD * (isBlockingPlayer ? 0.56 : 0.46), -1, 1);
      r.steerVisual = THREE.MathUtils.lerp(r.steerVisual, steerCmd, dt * (isBlockingPlayer ? 9.5 : 7.8));
      const latFactor = isBlockingPlayer ? 0.80 : 0.68;
      r.lateralVel = THREE.MathUtils.lerp(r.lateralVel, steerCmd * (perf.steerPower * latFactor), dt * 6.8);
      r.d = THREE.MathUtils.clamp(r.d + r.lateralVel * dt, -this.track.halfWidth + 1.4, this.track.halfWidth - 1.4);

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
      const baseFill = (r.v > 36 ? 1.8 : 0.4) * charismaFactor;
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

    // ========================================================================
    // 3. SOLID RIGID CAR-TO-CAR COLLISIONS WITH 400ms AUDIO DEBOUNCE PER PAIR
    // ========================================================================
    _resolveCarInteractions(dt, emitFx = true) {
      const AudioFX = global.AudioFX;
      const maxD = this.track.halfWidth - 1.25;

      for (let i = 0; i < this.racers.length; i++) {
        const a = this.racers[i];
        for (let j = i + 1; j < this.racers.length; j++) {
          const b = this.racers[j];
          const ds = a.s - b.s;
          const absS = Math.abs(ds);
          const dd = a.d - b.d;
          const absD = Math.abs(dd);

          // Rigid OBB / Capsule overlap test
          if (absS < CAR_LEN && absD < CAR_WID) {
            const ovS = CAR_LEN - absS;
            const ovD = CAR_WID - absD;
            const pairKey = a.driver.id < b.driver.id
              ? `${a.driver.id}__${b.driver.id}`
              : `${b.driver.id}__${a.driver.id}`;

            if (ovS < ovD * 1.15) {
              // --- REAR-END IMPACT ---
              const leading = ds >= 0 ? a : b;
              const trailing = ds >= 0 ? b : a;
              const closingSpeed = Math.max(0, trailing.v - leading.v);

              trailing.s = leading.s - CAR_LEN - 0.03;
              trailing.v = Math.max(0, leading.v * 0.84 - closingSpeed * 0.35);
              leading.v = Math.min(leading.v + Math.min(7.5, closingSpeed * 0.22), 92);

              if (emitFx && (a.isPlayer || b.isPlayer)) {
                AudioFX.playBump(pairKey);
                trailing.bobbleVelX += 11;
                leading.bobbleVelX -= 7;
                this._tmpPos.lerpVectors(a.worldPos, b.worldPos, 0.5);
                this._tmpPos.y = 0.42;
                this._emitSparkBurst(this._tmpPos, trailing.worldForward, 8, 8.5);
              }
            } else {
              // --- SIDE-BY-SIDE WHEEL-TO-WHEEL RUB ---
              const dir = dd >= 0 ? 1 : -1;
              const halfPush = ovD * 0.52;
              a.d = THREE.MathUtils.clamp(a.d + dir * halfPush, -maxD, maxD);
              b.d = THREE.MathUtils.clamp(b.d - dir * halfPush, -maxD, maxD);

              const avgLat = (a.lateralVel + b.lateralVel) * 0.5;
              a.lateralVel = THREE.MathUtils.clamp(avgLat + dir * 3.2, -9.5, 9.5);
              b.lateralVel = THREE.MathUtils.clamp(avgLat - dir * 3.2, -9.5, 9.5);
              a.v *= 0.988;
              b.v *= 0.988;

              if (emitFx && (a.isPlayer || b.isPlayer)) {
                AudioFX.playBump(pairKey);
                a.bobbleVelZ += dir * 6.2;
                b.bobbleVelZ -= dir * 6.2;
                this._tmpPos.lerpVectors(a.worldPos, b.worldPos, 0.5);
                this._tmpPos.y = 0.36;
                this._emitSparkBurst(this._tmpPos, a.worldForward, 5, 7.0);
              }
            }
          } else if (emitFx && absS < 16 && absD < 2.1) {
            // Slipstream draft behind rival
            const trailing = a.s < b.s ? a : b;
            trailing.turbo = Math.min(100, trailing.turbo + 6.0 * dt);
            if (trailing.isPlayer) trailing.v = Math.min(trailing.v + 4.0 * dt, 102);
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

    // ========================================================================
    // SYNC 3D TRANSFORMS + DYNAMIC SUSPENSION (PITCH & ROLL) + STEERING IK
    // ========================================================================
    _syncCarTransform(r, dt) {
      const sample = this.track.sampleAtDistance(r.s);
      const pos = sample.pos.clone().addScaledVector(sample.right, r.d);
      r.worldPos.copy(pos);
      r.worldForward.copy(sample.tangent);

      r.visual.root.position.set(pos.x, 0.08, pos.z);
      const trackYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
      const targetYawOff = -r.steerVisual * 0.15 + sample.curvature * 0.055;
      r.yawOffset = THREE.MathUtils.lerp(r.yawOffset, targetYawOff, Math.min(1, dt * 9 || 1));
      r.visual.root.rotation.y = trackYaw + r.yawOffset;

      // Dynamic Suspension Pitch (squat back on accel, nose dive forward on hard braking)
      const accelPitch = THREE.MathUtils.clamp(-r.longitudinalAccel * 0.0022, -0.075, 0.095);
      const turboPitch = (r.turboActive || r.launchBoostTimer > 0) ? -0.030 : 0;
      const targetPitch = accelPitch + turboPitch;

      // Dynamic Suspension Roll (chassis leans toward the outside of tight corners)
      const speedNorm = r.v / 78;
      const lateralG = -r.steerVisual * speedNorm * 0.085 - sample.curvature * speedNorm * speedNorm * 0.068;
      const targetRoll = THREE.MathUtils.clamp(lateralG, -0.14, 0.14);

      const suspLerp = Math.min(1, (dt || 0.016) * 8.5);
      r.pitchVisual = THREE.MathUtils.lerp(r.pitchVisual, targetPitch, suspLerp);
      r.rollVisual = THREE.MathUtils.lerp(r.rollVisual, targetRoll, suspLerp);
      r.visual.bodyTiltGroup.rotation.x = r.pitchVisual;
      r.visual.bodyTiltGroup.rotation.z = r.rollVisual;

      r.wheelSpin += r.v * dt * 1.45;
      for (let i = 0; i < r.visual.wheels.length; i++) r.visual.wheels[i].rotation.x = r.wheelSpin;
      for (let i = 0; i < r.visual.frontSteerPivots.length; i++) r.visual.frontSteerPivots[i].rotation.y = -r.steerVisual * 0.42;

      // Real-time steering wheel + articulated gloved arms IK
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

      r.visual.turboFlameGroup.visible = r.turboActive || r.launchBoostTimer > 0;
      if (r.visual.turboFlameGroup.visible) {
        r.visual.turboFlameGroup.scale.set(1, 1, 0.85 + Math.random() * 0.45);
      }

      const hasOverdrive = r.moralOverdriveTimer > 0;
      r.visual.moralAura.visible = hasOverdrive;
      if (hasOverdrive) {
        r.visual.moralAura.rotation.z += dt * 4.5;
        const s = 1 + Math.sin(this.raceElapsed * 12) * 0.08;
        r.visual.moralAura.scale.set(s, s, 1);
      }
    }

    // ========================================================================
    // UPDATE POOLED PARTICLES (SPARKS + ASPHALT BOUNCE, BACKFIRE, TIRE SMOKE)
    // ========================================================================
    _updateParticles(dt) {
      const dummy = this._dummy;

      // 1. Sparks with gravity + bounce off y = 0.09 asphalt
      let sparkDirty = false;
      for (let i = 0; i < this.sparks.length; i++) {
        const p = this.sparks[i];
        if (!p.active) continue;
        sparkDirty = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          dummy.scale.set(0, 0, 0); dummy.updateMatrix();
          this.sparkMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        p.vel.y -= 26 * dt;
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < 0.09) {
          p.pos.y = 0.09;
          p.vel.y = Math.abs(p.vel.y) * 0.42;
          p.vel.x *= 0.82;
          p.vel.z *= 0.82;
        }
        const t = 1 - p.life / p.maxLife;
        dummy.position.copy(p.pos);
        dummy.rotation.set(0, Math.atan2(p.vel.x, p.vel.z), 0);
        dummy.scale.set(t, t, 0.6 + t * 0.9);
        dummy.updateMatrix();
        this.sparkMesh.setMatrixAt(i, dummy.matrix);
      }
      if (sparkDirty) this.sparkMesh.instanceMatrix.needsUpdate = true;

      // 2. Exhaust backfire flames
      let fireDirty = false;
      for (let i = 0; i < this.fires.length; i++) {
        const p = this.fires[i];
        if (!p.active) continue;
        fireDirty = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          dummy.scale.set(0, 0, 0); dummy.updateMatrix();
          this.fireMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        p.pos.addScaledVector(p.vel, dt);
        const t = 1 - p.life / p.maxLife;
        dummy.position.copy(p.pos);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(t * 1.4);
        dummy.updateMatrix();
        this.fireMesh.setMatrixAt(i, dummy.matrix);
      }
      if (fireDirty) this.fireMesh.instanceMatrix.needsUpdate = true;

      // 3. Tire smoke clouds
      let smokeDirty = false;
      for (let i = 0; i < this.smokes.length; i++) {
        const p = this.smokes[i];
        if (!p.active) continue;
        smokeDirty = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          dummy.scale.set(0, 0, 0); dummy.updateMatrix();
          this.smokeMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        p.pos.addScaledVector(p.vel, dt);
        const prog = p.life / p.maxLife;
        const s = p.baseScale * (0.55 + prog * 1.55) * (1 - prog * 0.42);
        dummy.position.copy(p.pos);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.max(0.01, s));
        dummy.updateMatrix();
        this.smokeMesh.setMatrixAt(i, dummy.matrix);
      }
      if (smokeDirty) this.smokeMesh.instanceMatrix.needsUpdate = true;
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
          const estSpeed = Math.max(48, r.v || 68);
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
      const gear = Math.min(8, Math.max(1, Math.floor(kmh / 42) + 1));
      const crowdExcitement = p.moralOverdriveTimer > 0
        ? 1.0
        : THREE.MathUtils.clamp(0.25 + (p.moral / 100) * 0.65, 0.25, 0.9);

      const launchProgress = this.phase === 'countdown'
        ? THREE.MathUtils.clamp(this.countdownTimer / Math.max(0.1, this.lightsOutTime), 0, 1)
        : 1;

      return {
        phase: this.phase,
        launchProgress,
        launchStatus: this.launchStatus,
        launchFlashActive: this.launchFlashTimer > 0,
        wheelspinActive: p.wheelspinTimer > 0,
        launchBoostActive: p.launchBoostTimer > 0,
        position: p.position, totalRacers: this.racers.length,
        lap: Math.min(p.lap, this.totalLaps), totalLaps: this.totalLaps,
        kmh, gear, speedRatio: THREE.MathUtils.clamp(kmh / 340, 0, 1),
        turbo: p.turbo, turboActive: p.turboActive || p.launchBoostTimer > 0,
        moral: p.moral, moralMultiplier: p.moralMultiplier, moralOverdrive: p.moralOverdriveTimer > 0,
        raceElapsed: this.raceElapsed, crowdExcitement,
        playerPos: p.worldPos, playerForward: p.worldForward,
        playerDriver: p.driver,
        racers: this.racers
      };
    }
  }

  global.RaceEngine = RaceEngine;
})(window);
