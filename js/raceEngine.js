// ============================================================================
// RACEENGINE.JS — Parche v1.5: Nuevas Stats Adelantamiento y Defensa, Rebufo
//                 Táctico + Barra "ADELANTAR" en Rectas con Paso Automático
//                 Limpio, Radar Trasero (HUD + Arco 3D), Largada Progresiva 4s
//                 desde 0 km/h (1ª->2ª->3ª), Ritmo -12% Más Pausado y Control
//                 100% Manual sin Auto-Centrado (Cero Basura GC por Frame)
// ============================================================================
(function (global) {
  'use strict';

  // Calibrated so the calmer v1.5 world-space pace (-12% vs v1.4) displays authentic F1 km/h (~295-330 km/h)
  const SPEED_DISPLAY_SCALE = 5.28;
  const CAR_MASS = 798;   // kg
  const WHEELBASE = 5.1;  // virtual F1 wheelbase for predictable bicycle steering kinematics
  const CAR_LEN = 4.65;
  const CAR_WID = 2.34;

  function createSampleStruct() {
    return {
      pos: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      curvature: 0,
      width: 0,
      halfWidth: 0,
      hasGrandstand: false,
      s: 0,
      d: 0
    };
  }

  class RaceEngine {
    constructor(track, playerDriverId, totalLaps = 3, callbacks = {}) {
      this.track = track;
      this.circuitMeta = track.circuitMeta;
      this.playerDriverId = playerDriverId;
      this.totalLaps = totalLaps;
      this.callbacks = callbacks;

      this.root = new THREE.Group();
      this.racers = [];
      this._orderedRacers = [];
      this.player = null;

      // Mario Kart / F1 5-light start minigame state
      this.phase = 'countdown';
      this.countdownTimer = 0;
      this.lightsOutTime = 3.60 + 0.50 + Math.random() * 0.35;
      this.lastLitCount = -1;
      this.lightsOutTriggered = false;
      this.playerPressedEarly = false;
      this.playerLaunchResolved = false;
      this.launchWindowTimer = 0;
      this.launchFlashTimer = 0;
      this.launchStatus = 'wait';

      this.raceElapsed = 0;
      this.paused = false;

      // Parche v1.5: Tactical straight-line slipstream & automatic clean overtake state (zero GC)
      this.overtake = {
        active: false,
        charging: false,
        executing: false,
        progress: 0,
        target: null,
        targetId: null,
        targetShort: '',
        targetDist: 99,
        playerStat: 85,
        rivalDefStat: 85,
        chargeDuration: 3.15,
        passSide: 1,
        passD: 0,
        execTimer: 0,
        cooldown: 0,
        onStraight: false
      };

      // Parche v1.5: Rear proximity directional radar state (zero GC)
      this._rearThreat = {
        active: false,
        severity: 'none',
        side: 'center',
        dist: 99,
        short: '',
        leftActive: false,
        centerActive: false,
        rightActive: false,
        leftSeverity: 'none',
        centerSeverity: 'none',
        rightSeverity: 'none'
      };

      // Reusable scratch objects (ZERO GC allocations per frame inside requestAnimationFrame)
      this._dummy = new THREE.Object3D();
      this._tmpPos = new THREE.Vector3();
      this._tmpVel = new THREE.Vector3();
      this._tmpRight = new THREE.Vector3();
      this._tmpQuat = new THREE.Quaternion();
      this._tmpCol = new THREE.Color();
      this._up = new THREE.Vector3(0, 1, 0);
      this._sampleA = createSampleStruct();
      this._sampleB = createSampleStruct();
      this._sampleC = createSampleStruct();
      this._proj = createSampleStruct();
      this._perfScratch = {
        maxSpeed: 0, engineForce: 0, brakeForce: 0, steerPower: 0,
        turboSpeedMult: 0, turboRecharge: 0, aggression: 0, consistency: 0,
        technique: 0, charisma: 0, overtake: 85, defense: 85,
        cornerPushFactor: 0, cornerSpeedCap: 0,
        effectiveWetPenalty: 0, tireScrubFactor: 0
      };
      this._hudSnapshot = {
        phase: 'countdown',
        launchProgress: 0,
        launchStatus: 'wait',
        launchFlashActive: false,
        wheelspinActive: false,
        launchBoostActive: false,
        position: 1, totalRacers: 22,
        lap: 1, totalLaps: totalLaps,
        kmh: 0, gear: 1, speedRatio: 0,
        turbo: 50, turboActive: false,
        moral: 25, moralMultiplier: 1, moralOverdrive: false,
        raceElapsed: 0, crowdExcitement: 0.3,
        playerPos: null, playerForward: null, playerHeading: 0,
        playerDriver: null, racers: this.racers,
        overtake: this.overtake,
        rearThreat: this._rearThreat
      };

      this._initParticlePools();
      this._spawnGrid();
    }

    // ========================================================================
    // LIGHTWEIGHT POOLED PARTICLE SYSTEM (SPARKS, BACKFIRE, TIRE SMOKE)
    // ========================================================================
    _initParticlePools() {
      const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

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
        p.pos.copy(racer.worldPos).addScaledVector(racer.worldForward, -2.02 - i * 0.22);
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
      const sTmp = this._sampleA;

      sorted.forEach((driver, gridIdx) => {
        const team = getTeamById(driver.teamId);
        const isPlayer = driver.id === this.playerDriverId;
        const carVisual = buildF1Car(driver, team, { detailed: isPlayer, driverMode: 'seated' });
        this.root.add(carVisual.root);

        const row = Math.floor(gridIdx / 2);
        const col = gridIdx % 2 === 0 ? -1 : 1;
        const startS = -8 - row * 7.2 - (col === 1 ? 2.6 : 0);
        const startD = col * Math.min(halfW * 0.42, 3.2);

        this.track.sampleAtDistanceInto(startS, sTmp);
        const startHeading = Math.atan2(sTmp.tangent.x, sTmp.tangent.z);
        const worldPos = new THREE.Vector3().copy(sTmp.pos).addScaledVector(sTmp.right, startD);
        worldPos.y = 0.08;
        const worldForward = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading));

        const isTopSix = gridIdx < 6;
        const racer = {
          driver, team, isPlayer, visual: carVisual,
          gridIdx,
          s: startS, lap: 1, d: startD, v: 0, prevV: 0,
          heading: startHeading,
          angularVel: 0,
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
          worldPos,
          worldForward,
          aiTargetD: startD,
          aiLaneTimer: 0.55 + Math.random() * 0.9,
          aiReactionDelay: isTopSix ? (0.01 + Math.random() * 0.03) : (0.06 + Math.random() * 0.14),
          aiPaceFactor: (isTopSix ? 1.015 : 0.992) + (driver.stats.velocidad * 0.00048) + (driver.stats.tecnica * 0.00038) + (Math.random() * 0.016 - 0.008),
          aiRubberBias: 1.0,
          aiDefend: { moveUsedOnStraight: false, activeTimer: 0, blockTargetD: startD }
        };

        this._syncCarTransform(racer, 0);
        this.racers.push(racer);
        this._orderedRacers.push(racer);
        if (isPlayer) this.player = racer;
      });
    }

    // ========================================================================
    // 1. PERFORMANCE MODEL (-12% CALMER TOP SPEED + ADELANTAMIENTO & DEFENSA)
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
      const ovt = Math.min(120, (s.adelantamiento ?? 85) * m);
      const def = Math.min(120, (s.defensa ?? 85) * m);

      const teamSpeedFactor = 0.89 + (teamRating / 100) * 0.15;
      // Parche v1.5: -12% additional base top speed reduction vs v1.4 (56 -> 49.3) for playable tactical rhythm
      const maxSpeed = (49.3 + (vel - 70) * 0.26) * teamSpeedFactor;
      const engineForce = (18200 + (ace - 70) * 230) * teamSpeedFactor; // Newtons
      const brakeForce = 46500 + (fre - 70) * 460; // Newtons
      const steerPower = 13.4 + (crv - 70) * 0.17;
      const turboSpeedMult = 1.18 + ((tec * 0.55 + neu * 0.45) - 70) * 0.0032;
      const turboRecharge = 5.2 + (neu - 70) * 0.13;

      const wetPenaltyBase = isWet ? this.circuitMeta.rainIntensity * 0.20 : 0;
      const techGripBonus = Math.max(0, (tec - 70) / 30);
      const tireGripBonus = Math.max(0, (neu - 70) / 30);
      const cornerSkillBonus = Math.max(0, (crv - 70) / 30);
      const effectiveWetPenalty = Math.max(0.015, wetPenaltyBase * (1 - techGripBonus * 0.65));

      const cornerPushFactor = Math.max(0.35, (1.14 + effectiveWetPenalty * 2.05) - (techGripBonus * 0.26 + tireGripBonus * 0.18));
      const cornerSpeedCap = maxSpeed * Math.max(0.46, 1.0 - curvatureAbs * (0.39 - (cornerSkillBonus * 0.08 + tireGripBonus * 0.05) + effectiveWetPenalty * 0.46));
      const tireScrubFactor = Math.max(0.64, 1.12 - tireGripBonus * 0.32);

      const p = this._perfScratch;
      p.maxSpeed = maxSpeed;
      p.engineForce = engineForce;
      p.brakeForce = brakeForce;
      p.steerPower = steerPower;
      p.turboSpeedMult = turboSpeedMult;
      p.turboRecharge = turboRecharge;
      p.aggression = con;
      p.consistency = con;
      p.technique = tec;
      p.charisma = car;
      p.overtake = ovt;
      p.defense = def;
      p.cornerPushFactor = cornerPushFactor;
      p.cornerSpeedCap = cornerSpeedCap;
      p.effectiveWetPenalty = effectiveWetPenalty;
      p.tireScrubFactor = tireScrubFactor;
      return p;
    }

    // ========================================================================
    // 4. PROGRESSIVE LAUNCH CURVE (0 km/h -> 1.ª -> 2.ª -> 3.ª OVER 4 SECONDS)
    // ========================================================================
    _getProgressiveLaunchFactor(elapsed) {
      if (elapsed <= 0) return 0.24;
      if (elapsed < 1.20) {
        // 1.ª marcha: entrega inicial suave y progresiva desde parado (0 km/h)
        return THREE.MathUtils.lerp(0.24, 0.48, elapsed / 1.20);
      }
      if (elapsed < 1.30) {
        // Transición de embrague 1.ª -> 2.ª
        return 0.42;
      }
      if (elapsed < 2.55) {
        // 2.ª marcha: empuje creciente controlado
        return THREE.MathUtils.lerp(0.48, 0.74, (elapsed - 1.30) / 1.25);
      }
      if (elapsed < 2.65) {
        // Transición 2.ª -> 3.ª
        return 0.66;
      }
      if (elapsed < 4.00) {
        // 3.ª marcha: alcanza el 100% de potencia de forma fluida a los 4.0s
        return THREE.MathUtils.lerp(0.74, 1.00, (elapsed - 2.65) / 1.35);
      }
      return 1.0;
    }

    // ========================================================================
    // MAIN SIMULATION UPDATE (SAFE DT CLAMPED <= 0.05s, ZERO GC)
    // ========================================================================
    update(dt, input) {
      const AudioFX = global.AudioFX;
      if (this.paused) {
        AudioFX.updateEngine(0, false, true);
        return;
      }
      const clampedDt = Math.min(Math.max(dt, 0), 0.05);
      if (this.launchFlashTimer > 0) this.launchFlashTimer = Math.max(0, this.launchFlashTimer - clampedDt);

      if (this.phase === 'countdown') {
        this._updateCountdown(clampedDt, input);
        this._updateParticles(clampedDt);
        return;
      }

      if (this.phase === 'racing') {
        this.raceElapsed += clampedDt;
        // 150ms post-lights-out precision window for Perfect Launch (NO instant speed jump: always scales from 0 km/h!)
        if (!this.playerLaunchResolved) {
          this.launchWindowTimer += clampedDt;
          const manualAccel = input.manualAccel !== undefined ? input.manualAccel : input.accel;
          if (manualAccel) {
            this.playerLaunchResolved = true;
            if (this.launchWindowTimer <= 0.15) {
              this.player.launchBoostTimer = 2.6;
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

      // 2 rigid-body passes prevent clipping through rivals
      this._resolveCarInteractions(clampedDt, true);
      this._resolveCarInteractions(clampedDt, false);
      this._updateStandings();
      this._updateRearThreat();

      for (let i = 0; i < this.racers.length; i++) {
        this._syncCarTransform(this.racers[i], clampedDt);
      }

      this._updateParticles(clampedDt);

      if (this.phase === 'racing') {
        AudioFX.updateEngine(this.player.v / 60, this.player.turboActive || this.player.launchBoostTimer > 0 || this.overtake.executing, false);
      } else {
        AudioFX.updateEngine(0, false, true);
      }
    }

    // ========================================================================
    // 5-LIGHT START MINIGAME (PROGRESSIVE START FROM 0 KM/H — NO SPEED TELEPORT)
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

      for (let i = 0; i < this.racers.length; i++) this._syncCarTransform(this.racers[i], dt);
      AudioFX.updateEngine(manualAccel ? 0.38 : 0.09, false, false);

      if (this.countdownTimer >= this.lightsOutTime && !this.lightsOutTriggered) {
        this.lightsOutTriggered = true;
        this.track.setStartLights(6);
        AudioFX.playCountdownBeep(true);
        this.callbacks.onCountdown?.('¡YA!', true, 6);
        this.phase = 'racing';
        this.launchStatus = 'go';

        // Parche v1.5: All cars launch strictly from 0 km/h (v = 0). Top-6 AI earn progressive traction boost only.
        for (let i = 0; i < this.racers.length; i++) {
          const r = this.racers[i];
          r.v = 0;
          if (!r.isPlayer && r.gridIdx < 6) {
            r.launchBoostTimer = 2.2;
            this._emitBackfire(r, true);
          }
        }

        if (this.playerPressedEarly && manualAccel) {
          this.playerLaunchResolved = true;
          this.player.wheelspinTimer = 1.65;
          this.player.v = 0;
          this.launchStatus = 'wheelspin';
          this._emitTireSmoke(this.player, 1.6, 4);
          AudioFX.playBump('start_wheelspin');
          this.callbacks.onToast?.('💨 ¡PATINAJE DE RUEDAS!', '#EF4444');
        } else if (manualAccel) {
          this.playerLaunchResolved = true;
          this.player.launchBoostTimer = 2.6;
          this.player.v = 0;
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
    // 2. TACTICAL STRAIGHT-LINE SLIPSTREAM & "ADELANTAR" AUTOMATIC PASS
    // ========================================================================
    _updateOvertakeSystem(r, dt, proj, perf, input) {
      const ov = this.overtake;
      const AudioFX = global.AudioFX;

      // Calibrated to tracks.js curvature scale (straights < 0.36, corners 0.50..7.3)
      const lookAhead = this.track.sampleAtDistanceInto(r.s + 14, this._sampleB);
      const curvNow = Math.abs(proj.curvature);
      const curvAhead = Math.abs(lookAhead.curvature);
      const isStraight = curvNow < 0.36 && curvAhead < 0.44;
      ov.onStraight = isStraight;

      if (ov.cooldown > 0) ov.cooldown = Math.max(0, ov.cooldown - dt);

      // Active clean automatic slipstream pass execution
      if (ov.executing) {
        ov.execTimer -= dt;
        const target = ov.target;
        const passedCleanly = !target || (r.s - target.s) > 4.6;
        if (passedCleanly || ov.execTimer <= 0 || input.brake || curvNow > 0.68) {
          ov.executing = false;
          ov.charging = false;
          ov.progress = 0;
          ov.cooldown = 0.75;
          ov.target = null;
          ov.targetId = null;
          ov.targetShort = '';
          ov.targetDist = 99;
          ov.active = false;
        } else {
          // Continuously verify passing lane clears the rival cleanly without crowding walls
          const maxLane = this.track.halfWidth - 1.75;
          ov.passD = THREE.MathUtils.clamp(target.d + ov.passSide * 3.25, -maxLane, maxLane);
          ov.targetDist = Math.max(0, target.s - r.s);
          ov.progress = 1.0;
          ov.active = true;
        }
        return;
      }

      // Scan closest rival strictly within < 16m ahead in slipstream corridor
      let closestTarget = null;
      let closestDist = 999;
      for (let i = 0; i < this.racers.length; i++) {
        const other = this.racers[i];
        if (other === r || other.finished) continue;
        const ds = other.s - r.s;
        if (ds >= 2.2 && ds <= 16.0) {
          const absDd = Math.abs(other.d - r.d);
          if (absDd < 5.0 && ds < closestDist) {
            closestDist = ds;
            closestTarget = other;
          }
        }
      }

      if (ov.cooldown <= 0 && closestTarget && isStraight && r.v > 12 && !input.brake) {
        const playerOvt = perf.overtake;
        const rivalDef = (closestTarget.driver.stats.defensa ?? 85) * closestTarget.moralMultiplier;
        const diff = playerOvt - rivalDef;
        // Player stronger ADE -> ~1.8s-2.5s | Rival stronger DEF -> ~3.5s-4.5s
        const duration = THREE.MathUtils.clamp(3.15 - diff * 0.08, 1.80, 4.50);

        if (ov.target && ov.target !== closestTarget) {
          ov.progress *= 0.80;
        }
        ov.target = closestTarget;
        ov.targetId = closestTarget.driver.id;
        ov.targetShort = closestTarget.driver.short;
        ov.targetDist = closestDist;
        ov.playerStat = Math.round(playerOvt);
        ov.rivalDefStat = Math.round(rivalDef);
        ov.chargeDuration = duration;
        ov.charging = true;
        ov.progress = Math.min(1.0, ov.progress + dt / duration);

        // Gentle slipstream aero tow reward while charging
        r.turbo = Math.min(100, r.turbo + 3.2 * dt);

        if (ov.progress >= 1.0) {
          // Pick cleanest open passing side (-1 = left / -d, +1 = right / +d)
          const maxLane = this.track.halfWidth - 1.75;
          let spaceLeft = closestTarget.d + maxLane;
          let spaceRight = maxLane - closestTarget.d;

          for (let j = 0; j < this.racers.length; j++) {
            const third = this.racers[j];
            if (third === r || third === closestTarget) continue;
            if (Math.abs(third.s - closestTarget.s) < 6.8) {
              if (third.d < closestTarget.d) spaceLeft -= 3.6;
              else spaceRight -= 3.6;
            }
          }

          let passSide = spaceRight >= spaceLeft ? 1 : -1;
          // Respect subtle manual steering intent if that side has plenty of room
          if (input.left && !input.right && spaceLeft >= 3.35) passSide = -1;
          else if (input.right && !input.left && spaceRight >= 3.35) passSide = 1;

          ov.passSide = passSide;
          ov.passD = THREE.MathUtils.clamp(closestTarget.d + passSide * 3.25, -maxLane, maxLane);
          ov.executing = true;
          ov.charging = false;
          ov.execTimer = 1.32;
          ov.progress = 1.0;

          this._emitBackfire(r, true);
          AudioFX.playTurbo();
          this.callbacks.onToast?.(`⚡ ¡ADELANTANDO A ${closestTarget.driver.short}!`, '#00F5D4');
        }
      } else {
        ov.charging = false;
        // Pause & gently decay if entering a tight corner or pulling away from slipstream
        const decayRate = isStraight ? 0.36 : 0.28;
        ov.progress = Math.max(0, ov.progress - dt * decayRate);
        if (ov.progress <= 0.005) {
          ov.progress = 0;
          ov.target = null;
          ov.targetId = null;
          ov.targetShort = '';
          ov.targetDist = 99;
        }
      }

      ov.active = ov.executing || ov.charging || ov.progress > 0.01;
    }

    // ========================================================================
    // 100% MANUAL PLAYER PHYSICS (ZERO AUTO-STEERING, PROGRESSIVE 4s LAUNCH,
    // SOFT STRAIGHT-TO-CORNER TRANSITION & CLEAN SLIPSTREAM OVERTAKE AT 100%)
    // ========================================================================
    _updatePlayer(r, dt, input) {
      const AudioFX = global.AudioFX;
      const proj = this.track.projectPointNearS(r.worldPos.x, r.worldPos.z, r.s, this._proj);
      const curvAbs = Math.abs(proj.curvature);
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, proj.hasGrandstand, perf.charisma);
      this._updateOvertakeSystem(r, dt, proj, perf, input);

      // Launch penalty / boost timers
      if (r.wheelspinTimer > 0) {
        r.wheelspinTimer = Math.max(0, r.wheelspinTimer - dt);
        if (Math.random() < 0.82) this._emitTireSmoke(r, 1.4, 2);
      }
      if (r.launchBoostTimer > 0) {
        r.launchBoostTimer = Math.max(0, r.launchBoostTimer - dt);
        if (Math.random() < 0.28) this._emitBackfire(r, true);
      }

      // Turbo / ERS activation
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
        const speedBonus = (r.v > 26 ? 1.12 : 0.68);
        r.turbo = Math.min(100, r.turbo + perf.turboRecharge * speedBonus * dt);
      }

      const effectiveAccelInput = this.playerLaunchResolved ? input.accel : (input.manualAccel ?? input.accel);
      if (r.prevAccel && !effectiveAccelInput && r.v > 34) {
        AudioFX.playTurboBlowOff();
      }
      r.prevAccel = !!effectiveAccelInput;
      r.prevTurboActive = r.turboActive;

      // --- 100% MANUAL STEERING INPUT (EXCLUSIVELY PLAYER INPUT, SMOOTH RETURN-TO-CENTER) ---
      const rawSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const steerRate = rawSteer !== 0 ? 8.2 : 11.2;
      const steerAlpha = 1 - Math.exp(-dt * steerRate);
      r.steerInputSmooth += (rawSteer - r.steerInputSmooth) * steerAlpha;
      if (rawSteer === 0 && Math.abs(r.steerInputSmooth) < 0.002) r.steerInputSmooth = 0;

      // Higher Defensa gives crisper line-holding lateral stability when covering a trailing attacker
      const defStability = this._rearThreat.active
        ? THREE.MathUtils.clamp((perf.defense - 70) / 30, 0, 1) * 0.08
        : 0;

      const absSteer = Math.abs(r.steerInputSmooth);
      const shapedSteer = Math.sign(r.steerInputSmooth) * (absSteer * 0.68 + absSteer * absSteer * 0.32) * (1 - defStability);

      // --- LONGITUDINAL DYNAMICS: PROGRESSIVE 4s LAUNCH + CALMER -12% PACE ---
      const progLaunch = this._getProgressiveLaunchFactor(this.raceElapsed);
      const launchMult = r.wheelspinTimer > 0 ? 0.42 : (r.launchBoostTimer > 0 ? 1.18 : 1.0);
      const ovExecuting = this.overtake.executing;
      const ovSurgeMult = ovExecuting ? 1.14 : 1.0;
      const effectiveMax = perf.maxSpeed * (r.turboActive ? perf.turboSpeedMult : 1.0) * ovSurgeMult * (r.wheelspinTimer > 0 ? 0.56 : 1.0);

      // Base aero/rolling drag + softened straight-to-corner steering scrub drag
      const aeroDrag = (r.v * r.v) * 0.0028 + r.v * 0.052;
      const steeringDrag = ovExecuting
        ? 0
        : Math.pow(absSteer, 2.15) * (r.v * 0.36 + (r.v * r.v) * 0.0046) * perf.tireScrubFactor;

      let netAccel = -(aeroDrag + steeringDrag);
      if (effectiveAccelInput || r.turboActive || ovExecuting) {
        const thrust = (perf.engineForce / CAR_MASS) * progLaunch * (r.turboActive ? 1.44 : 1.0) * (ovExecuting ? 1.32 : 1.0) * launchMult * 1.04;
        netAccel += thrust;
      }
      if (input.brake) {
        netAccel -= (perf.brakeForce / CAR_MASS);
        if (r.v > 20 && Math.random() < 0.52) {
          this._emitTireSmoke(r, 0.92, 1);
        }
      }

      if (ovExecuting && this.overtake.target) {
        // Controlled slipstream overtake surge smoothly outpacing the overtaken car
        const targetPassV = Math.min(effectiveMax * 1.05, Math.max(this.overtake.target.v + 9.2, perf.maxSpeed * 1.12));
        if (r.v < targetPassV) {
          r.v = Math.min(targetPassV, r.v + 24.0 * dt);
        }
        if (Math.random() < 0.36) this._emitBackfire(r, true);
      } else {
        r.v = THREE.MathUtils.clamp(r.v + netAccel * dt, 0, effectiveMax * 1.06);
        if (r.v > effectiveMax && !r.turboActive) {
          r.v += (effectiveMax - r.v) * (1 - Math.exp(-dt * 2.6));
        }
      }

      // Detect gear downshifts under heavy braking -> emit exhaust backfire!
      const kmh = Math.round(r.v * SPEED_DISPLAY_SCALE);
      const currentGear = Math.min(8, Math.max(1, Math.floor(kmh / 42) + 1));
      if (currentGear < r.prevGear && input.brake && r.v > 14) {
        this._emitBackfire(r, false);
      }
      r.prevGear = currentGear;

      if (ovExecuting) {
        // Clean automatic slipstream lane-change maneuver to the open side along the straight
        const trackYaw = Math.atan2(proj.tangent.x, proj.tangent.z);
        const dErr = this.overtake.passD - r.d;
        const latStepVel = THREE.MathUtils.clamp(dErr * 4.2, -9.2, 9.2);
        const desiredHeading = trackYaw - Math.atan2(latStepVel, Math.max(18, r.v));
        let hDiff = desiredHeading - r.heading;
        while (hDiff > Math.PI) hDiff -= Math.PI * 2;
        while (hDiff < -Math.PI) hDiff += Math.PI * 2;
        const ovTurnAlpha = 1 - Math.exp(-dt * 11.5);
        const prevHeading = r.heading;
        r.heading += hDiff * ovTurnAlpha;
        r.angularVel = dt > 0.0001 ? THREE.MathUtils.clamp((prevHeading - r.heading) / dt, -1.6, 1.6) : 0;

        const visualCmd = THREE.MathUtils.clamp(latStepVel / 8.5, -0.65, 0.65);
        r.steerVisual += (visualCmd - r.steerVisual) * (1 - Math.exp(-dt * 10.0));
      } else {
        // --- TRUE 100% MANUAL BICYCLE KINEMATIC HEADING UPDATE (ZERO AUTO-CENTERING!) ---
        const visAlpha = 1 - Math.exp(-dt * 12.0);
        r.steerVisual += (r.steerInputSmooth - r.steerVisual) * visAlpha;

        const speedFrac = THREE.MathUtils.clamp(r.v / Math.max(1, perf.maxSpeed), 0, 1.15);
        const statAgility = 0.94 + ((r.driver.stats.maniobrabilidad ?? 85) - 70) * 0.0042;
        const wetGrip = 1.0 - perf.effectiveWetPenalty * 0.42;
        const brakeTurnIn = (input.brake && r.v > 12) ? 1.14 : 1.0;
        const maxWheelAngle = THREE.MathUtils.lerp(0.36, 0.118, Math.pow(Math.min(1, speedFrac), 1.28))
          * statAgility * wetGrip * brakeTurnIn;

        const frontWheelAngle = shapedSteer * maxWheelAngle;
        const rawOmega = r.v > 0.35 ? (r.v / WHEELBASE) * Math.tan(frontWheelAngle) : 0;
        r.angularVel = THREE.MathUtils.clamp(rawOmega, -2.05, 2.05);
        r.heading -= r.angularVel * dt;
      }

      // Advance car strictly along its own front-wheel heading vector
      r.worldForward.set(Math.sin(r.heading), 0, Math.cos(r.heading));
      r.worldPos.x += r.worldForward.x * r.v * dt;
      r.worldPos.z += r.worldForward.z * r.v * dt;
      r.worldPos.y = 0.08;

      // Project updated world position onto circuit spline for telemetry, barriers, AI & lap counting
      const prevLap = r.lap;
      const prevD = r.d;
      const nextProj = this.track.projectPointNearS(r.worldPos.x, r.worldPos.z, r.s, this._proj);
      r.s = nextProj.s;
      r.d = nextProj.d;
      r.lateralVel = dt > 0.0001 ? THREE.MathUtils.clamp((r.d - prevD) / dt, -14, 14) : 0;

      // Kerb riding sparks + tire smoke
      const kerbEdge = this.track.halfWidth - 1.95;
      if (Math.abs(r.d) > kerbEdge && r.v > 16) {
        if (Math.random() < 0.46) {
          this._tmpPos.copy(r.worldPos);
          this._tmpPos.y = 0.14;
          this._emitSparkBurst(this._tmpPos, r.worldForward, 2, 5.2);
        }
        if (Math.random() < 0.40) this._emitTireSmoke(r, 0.88, 1);
      }

      // High-speed floor bottoming sparks
      if (r.v > perf.maxSpeed * 0.88 && curvAbs < 0.16 && Math.random() < 0.32) {
        this._tmpPos.copy(r.worldPos).addScaledVector(r.worldForward, -1.6);
        this._tmpPos.y = 0.13;
        this._emitSparkBurst(this._tmpPos, r.worldForward, 2, 4.0);
      }

      // Physical barrier containment (ONLY triggers when actually touching the track wall!)
      const maxD = this.track.halfWidth - 1.25;
      if (Math.abs(r.d) > maxD) {
        const sign = Math.sign(r.d);
        r.d = sign * maxD;
        r.worldPos.set(
          nextProj.pos.x + nextProj.right.x * r.d,
          0.08,
          nextProj.pos.z + nextProj.right.z * r.d
        );

        // Deflect heading ONLY along the wall face if nose is pushing outward into the barrier
        const outwardDot = r.worldForward.x * nextProj.right.x * sign + r.worldForward.z * nextProj.right.z * sign;
        if (outwardDot > 0.02) {
          const wallTangentYaw = Math.atan2(nextProj.tangent.x, nextProj.tangent.z);
          let diff = wallTangentYaw - r.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          r.heading += diff * Math.min(0.65, outwardDot * 0.95);
          r.worldForward.set(Math.sin(r.heading), 0, Math.cos(r.heading));
        }

        const wallRetain = THREE.MathUtils.clamp(0.92 + (perf.consistency - 70) * 0.0005, 0.90, 0.955);
        r.v *= wallRetain;
        r.bobbleVelZ -= sign * 7.5;
        this._tmpPos.copy(r.worldPos);
        this._tmpPos.y = 0.32;
        this._emitSparkBurst(this._tmpPos, r.worldForward, 5, 7.5);
        AudioFX.playBump(`${r.driver.id}_wall`);
      }

      // Lap progression
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
      if (this.circuitMeta.rainIntensity > 0 && r.v > 22 && Math.random() < 0.55) {
        this._emitTireSmoke(r, 0.88, 1);
      }

      r.bobbleVelZ += (-r.steerInputSmooth * 10 - r.angularVel * 3.5) * dt;
      if (r.turboActive || ovExecuting) r.bobbleVelX -= 12 * dt;
    }

    // ========================================================================
    // 2. DEMANDING AI: DEFENSA-DRIVEN BLOCKING, PRESSURE TRACTION & 4s LAUNCH
    // ========================================================================
    _updateAI(r, dt) {
      if (this.raceElapsed < r.aiReactionDelay) return;

      if (r.launchBoostTimer > 0) {
        r.launchBoostTimer = Math.max(0, r.launchBoostTimer - dt);
        if (Math.random() < 0.22) this._emitBackfire(r, true);
      }

      const sample = this.track.sampleAtDistanceInto(r.s, this._sampleA);
      const lookAhead = this.track.sampleAtDistanceInto(r.s + 24, this._sampleB);
      const lookFar = this.track.sampleAtDistanceInto(r.s + 46, this._sampleC);
      const curvNow = Math.abs(sample.curvature);
      const curvAhead = Math.abs(lookAhead.curvature);
      const curvAbs = Math.max(curvNow, curvAhead * 0.92);
      const perf = this._computePerformance(r, curvAbs);

      this._updateMoralSystem(r, dt, sample.hasGrandstand, perf.charisma * 0.82);

      // Minimal rubber-banding so front-runners stay genuinely competitive
      const distToPlayer = r.s - this.player.s;
      let rubber = 1.0;
      if (distToPlayer > 155) rubber = 0.97;
      else if (distToPlayer < -65) rubber = 1.05;
      r.aiRubberBias += (rubber - r.aiRubberBias) * (1 - Math.exp(-dt * 0.7));

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

      // Parche v1.5: Defensa stat governs composure under pressure & gap closing!
      const defNorm = THREE.MathUtils.clamp((perf.defense - 65) / 34, 0, 1.15);
      const dsBehind = r.s - this.player.s;
      const underPressure = !this.player.finished && dsBehind > 1.5 && dsBehind < 16.5 && Math.abs(this.player.d - r.d) < 4.8;
      // High Defensa holds rhythm & exit traction; low Defensa loses traction/pace under pressure
      const pressurePacePenalty = underPressure
        ? (1.0 - Math.min(1.0, defNorm)) * (isCornerExit ? 0.095 : 0.055)
        : 0;
      const pressureTractionMult = underPressure
        ? (1.0 - (1.0 - Math.min(1.0, defNorm)) * (isCornerExit ? 0.18 : 0.08))
        : 1.0;

      // Progressive 4-second launch delivery for AI (from 0 km/h)
      const aiLaunchElapsed = Math.max(0, this.raceElapsed - r.aiReactionDelay);
      const progLaunch = this._getProgressiveLaunchFactor(aiLaunchElapsed);

      const exitBoost = isCornerExit ? 1.20 : 1.04;
      const techBonus = 1.0 + (perf.technique - 82) * 0.0028;
      const aiCornerCap = Math.min(perf.maxSpeed * 1.04, perf.cornerSpeedCap * 1.15);
      const baseCap = aiCornerCap * r.aiPaceFactor * r.aiRubberBias * techBonus * (1 - pressurePacePenalty);
      const desiredSpeed = baseCap * (r.turboActive ? perf.turboSpeedMult : 1.0) * (r.launchBoostTimer > 0 ? 1.06 : 1.0);

      const aiAccel = (perf.engineForce / CAR_MASS) * progLaunch * 1.12 * exitBoost * pressureTractionMult * (r.launchBoostTimer > 0 ? 1.10 : 1.0);
      const aiBrake = (perf.brakeForce / CAR_MASS) * 0.85;
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

      // Position defense driven by Defensa stat (yield cleanly if player unlocked 100% ADELANTAR pass!)
      const isBeingCleanlyPassed = this.overtake.executing && this.overtake.target === r;
      let isBlockingPlayer = false;
      if (!isBeingCleanlyPassed && !this.player.finished && dsBehind > 1.6 && dsBehind < 18.0 && Math.abs(this.player.d - r.d) < 6.0) {
        const triggerDist = 11.5 + defNorm * 6.5;
        const speedGapTrigger = this.player.v >= r.v - (1.5 + defNorm * 4.5);
        if (!r.aiDefend.moveUsedOnStraight && dsBehind < triggerDist && (speedGapTrigger || dsBehind < 10.5)) {
          const leadTime = 0.08 + defNorm * 0.18;
          const predictedAttackD = this.player.d + this.player.lateralVel * leadTime;
          // High Defensa seals the exact line; low Defensa leaves a wider passing gap!
          const coverRatio = THREE.MathUtils.clamp(0.45 + defNorm * 0.55, 0.45, 1.0);
          const targetBlockD = THREE.MathUtils.lerp(r.d, predictedAttackD, coverRatio);
          r.aiDefend.blockTargetD = THREE.MathUtils.clamp(targetBlockD, -this.track.halfWidth + 1.85, this.track.halfWidth - 1.85);
          r.aiDefend.moveUsedOnStraight = true;
          r.aiDefend.activeTimer = 0.90 + defNorm * 0.65;
        }
        if (r.aiDefend.activeTimer > 0) {
          r.aiTargetD = r.aiDefend.blockTargetD;
          isBlockingPlayer = true;
        }
      } else if (isBeingCleanlyPassed) {
        // Hold current line peacefully while player executes clean 100% slipstream pass on the open side
        r.aiDefend.activeTimer = 0;
        r.aiTargetD = THREE.MathUtils.clamp(r.d, -this.track.halfWidth + 1.8, this.track.halfWidth - 1.8);
      }

      if (!isBlockingPlayer && !isBeingCleanlyPassed) {
        r.aiLaneTimer -= dt;
        if (r.aiLaneTimer <= 0) {
          r.aiLaneTimer = 0.55 + Math.random() * 0.85;
          const apexStrength = THREE.MathUtils.clamp(0.50 + (perf.technique - 74) * 0.012, 0.48, 0.76);
          // Low Defensa drifts slightly wider under pressure, creating realistic overtaking opportunities
          const pressureDrift = underPressure ? (1.0 - Math.min(1.0, defNorm)) * (r.d >= 0 ? -1.4 : 1.4) : 0;
          const apexTarget = curvAhead > 0.12
            ? Math.sign(lookAhead.curvature) * (this.track.halfWidth * apexStrength)
            : (Math.random() - 0.5) * (this.track.halfWidth * 0.28) + pressureDrift;
          r.aiTargetD = THREE.MathUtils.clamp(apexTarget, -this.track.halfWidth + 1.9, this.track.halfWidth - 1.9);
        }

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
      const blockSteerGain = 0.40 + defNorm * 0.20;
      const steerCmd = THREE.MathUtils.clamp(diffD * (isBlockingPlayer ? blockSteerGain : 0.46), -1, 1);
      r.steerVisual += (steerCmd - r.steerVisual) * (1 - Math.exp(-dt * (isBlockingPlayer ? (7.5 + defNorm * 2.8) : 7.8)));
      const latFactor = isBlockingPlayer ? (0.62 + defNorm * 0.22) : 0.68;
      r.lateralVel += (steerCmd * (perf.steerPower * latFactor) - r.lateralVel) * (1 - Math.exp(-dt * 6.8));
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
      r.bobbleVelZ += (-r.steerVisual * 7 - sample.curvature * 3.5) * dt;
    }

    _updateMoralSystem(r, dt, nearGrandstand, charisma) {
      const AudioFX = global.AudioFX;
      if (r.moralOverdriveTimer > 0) {
        r.moralOverdriveTimer = Math.max(0, r.moralOverdriveTimer - dt);
        r.moralMultiplier = 1.22;
        r.moral = (r.moralOverdriveTimer / 7.5) * 100;
        if (r.moralOverdriveTimer <= 0) r.moralMultiplier = 1.0;
        return;
      }

      const charismaFactor = 0.65 + (charisma / 99) * 1.15;
      const speedFactor = r.v > 24 ? 1.0 : 0.35;
      const crowdGain = nearGrandstand ? 6.8 * charismaFactor * speedFactor : 0.65 * charismaFactor * speedFactor;
      r.moral = Math.min(100, r.moral + crowdGain * dt);
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
    // SOLID RIGID CAR-TO-CAR COLLISIONS WITH 400ms DEBOUNCE, PLAYER DEFENSA
    // LATERAL STABILITY & CLEAN PASS PROTECTION DURING 100% SLIPSTREAM OVERTAKE
    // ========================================================================
    _resolveCarInteractions(dt, emitFx = true) {
      const AudioFX = global.AudioFX;
      const maxD = this.track.halfWidth - 1.25;
      let playerAdjusted = false;

      for (let i = 0; i < this.racers.length; i++) {
        const a = this.racers[i];
        for (let j = i + 1; j < this.racers.length; j++) {
          const b = this.racers[j];
          const ds = a.s - b.s;
          const absS = Math.abs(ds);
          const dd = a.d - b.d;
          const absD = Math.abs(dd);

          if (absS < CAR_LEN && absD < CAR_WID) {
            // Protect clean automatic slipstream pass against target rival from snagging/bumping!
            const isActiveOvertakePair = this.overtake.executing && this.overtake.target &&
              ((a.isPlayer && b === this.overtake.target) || (b.isPlayer && a === this.overtake.target));
            if (isActiveOvertakePair) {
              const target = this.overtake.target;
              const passSide = this.overtake.passSide;
              const neededD = THREE.MathUtils.clamp(target.d + passSide * (CAR_WID + 0.55), -maxD, maxD);
              this.player.d += (neededD - this.player.d) * 0.45;
              playerAdjusted = true;
              continue;
            }

            const ovS = CAR_LEN - absS;
            const ovD = CAR_WID - absD;
            const pairKey = a.driver.id < b.driver.id
              ? `${a.driver.id}__${b.driver.id}`
              : `${b.driver.id}__${a.driver.id}`;

            if (a.isPlayer || b.isPlayer) playerAdjusted = true;

            if (ovS < ovD * 1.15) {
              const leading = ds >= 0 ? a : b;
              const trailing = ds >= 0 ? b : a;
              const closingSpeed = Math.max(0, trailing.v - leading.v);

              trailing.s = leading.s - CAR_LEN - 0.03;
              trailing.v = Math.max(0, leading.v * 0.84 - closingSpeed * 0.35);
              leading.v = Math.min(leading.v + Math.min(5.2, closingSpeed * 0.22), 68);

              if (emitFx && (a.isPlayer || b.isPlayer)) {
                AudioFX.playBump(pairKey);
                trailing.bobbleVelX += 11;
                leading.bobbleVelX -= 7;
                this._tmpPos.lerpVectors(a.worldPos, b.worldPos, 0.5);
                this._tmpPos.y = 0.42;
                this._emitSparkBurst(this._tmpPos, trailing.worldForward, 8, 8.5);
              }
            } else {
              const dir = dd >= 0 ? 1 : -1;
              // Parche v1.5: Higher Defensa increases lateral defensive stability during wheel-to-wheel rubs
              const aDefNorm = THREE.MathUtils.clamp(((a.driver.stats.defensa ?? 85) - 65) / 34, 0, 1.1);
              const bDefNorm = THREE.MathUtils.clamp(((b.driver.stats.defensa ?? 85) - 65) / 34, 0, 1.1);
              const aShare = a.isPlayer ? THREE.MathUtils.clamp(0.52 - aDefNorm * 0.16, 0.34, 0.54) : 0.52;
              const bShare = b.isPlayer ? THREE.MathUtils.clamp(0.52 - bDefNorm * 0.16, 0.34, 0.54) : 0.52;
              const totalShare = aShare + bShare;
              const pushA = ovD * 1.04 * (aShare / totalShare);
              const pushB = ovD * 1.04 * (bShare / totalShare);

              a.d = THREE.MathUtils.clamp(a.d + dir * pushA, -maxD, maxD);
              b.d = THREE.MathUtils.clamp(b.d - dir * pushB, -maxD, maxD);

              const avgLat = (a.lateralVel + b.lateralVel) * 0.5;
              const impA = a.isPlayer ? 3.0 * (1 - aDefNorm * 0.34) : 3.0;
              const impB = b.isPlayer ? 3.0 * (1 - bDefNorm * 0.34) : 3.0;
              a.lateralVel = THREE.MathUtils.clamp(avgLat + dir * impA, -8.5, 8.5);
              b.lateralVel = THREE.MathUtils.clamp(avgLat - dir * impB, -8.5, 8.5);
              a.v *= a.isPlayer ? (0.988 + aDefNorm * 0.007) : 0.988;
              b.v *= b.isPlayer ? (0.988 + bDefNorm * 0.007) : 0.988;

              if (emitFx && (a.isPlayer || b.isPlayer)) {
                AudioFX.playBump(pairKey);
                a.bobbleVelZ += dir * (a.isPlayer ? 6.2 * (1 - aDefNorm * 0.25) : 6.2);
                b.bobbleVelZ -= dir * (b.isPlayer ? 6.2 * (1 - bDefNorm * 0.25) : 6.2);
                this._tmpPos.lerpVectors(a.worldPos, b.worldPos, 0.5);
                this._tmpPos.y = 0.36;
                this._emitSparkBurst(this._tmpPos, a.worldForward, 5, 7.0);
              }
            }
          } else if (emitFx && absS < 16 && absD < 2.1) {
            const trailing = a.s < b.s ? a : b;
            trailing.turbo = Math.min(100, trailing.turbo + 5.0 * dt);
            if (trailing.isPlayer) trailing.v = Math.min(trailing.v + 2.2 * dt, 66);
          }
        }
      }

      // Keep world-space player synced to collision push-out WITHOUT modifying manual heading!
      if (playerAdjusted && this.player) {
        const sOut = this.track.sampleAtDistanceInto(this.player.s, this._sampleA);
        this.player.worldPos.set(
          sOut.pos.x + sOut.right.x * this.player.d,
          0.08,
          sOut.pos.z + sOut.right.z * this.player.d
        );
      }
    }

    // ========================================================================
    // 3. REAR PROXIMITY RADAR SCANNER (ZERO GC, LEFT / CENTER / RIGHT,
    //    AMBER 9..20m -> RED < 9m)
    // ========================================================================
    _updateRearThreat() {
      const rt = this._rearThreat;
      rt.active = false;
      rt.severity = 'none';
      rt.side = 'center';
      rt.dist = 99;
      rt.short = '';
      rt.leftActive = false;
      rt.centerActive = false;
      rt.rightActive = false;
      rt.leftSeverity = 'none';
      rt.centerSeverity = 'none';
      rt.rightSeverity = 'none';

      const p = this.player;
      if (!p || this.phase !== 'racing') return;

      let closestDist = 999;
      for (let i = 0; i < this.racers.length; i++) {
        const other = this.racers[i];
        if (other === p || other.finished) continue;
        const dsBehind = p.s - other.s;
        if (dsBehind > 1.4 && dsBehind <= 20.0) {
          const deltaD = other.d - p.d;
          if (Math.abs(deltaD) > 7.8) continue;

          const sev = dsBehind < 9.0 ? 'danger' : 'warn';
          let side = 'center';
          if (deltaD < -1.15) side = 'left';
          else if (deltaD > 1.15) side = 'right';

          if (side === 'left') {
            rt.leftActive = true;
            if (sev === 'danger' || rt.leftSeverity === 'none') rt.leftSeverity = sev;
          } else if (side === 'right') {
            rt.rightActive = true;
            if (sev === 'danger' || rt.rightSeverity === 'none') rt.rightSeverity = sev;
          } else {
            rt.centerActive = true;
            if (sev === 'danger' || rt.centerSeverity === 'none') rt.centerSeverity = sev;
          }

          if (dsBehind < closestDist) {
            closestDist = dsBehind;
            rt.active = true;
            rt.severity = sev;
            rt.side = side;
            rt.dist = dsBehind;
            rt.short = other.driver.short;
          }
        }
      }
    }

    _updateStandings() {
      const AudioFX = global.AudioFX;
      this._orderedRacers.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.s - a.s;
      });

      for (let idx = 0; idx < this._orderedRacers.length; idx++) {
        const r = this._orderedRacers[idx];
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
      }
    }

    // ========================================================================
    // SYNC 3D TRANSFORMS (ZERO GC, 100% MANUAL HEADING + 3D REAR RADAR ARC)
    // ========================================================================
    _syncCarTransform(r, dt) {
      let curvForRoll = 0;
      if (r.isPlayer && this.phase === 'racing') {
        // Player position & yaw come strictly from true manual worldPos & heading!
        r.visual.root.position.set(r.worldPos.x, 0.08, r.worldPos.z);
        r.visual.root.rotation.y = r.heading;
        curvForRoll = r.angularVel * 0.42;
      } else {
        const sample = this.track.sampleAtDistanceInto(r.s, this._sampleA);
        r.worldPos.set(
          sample.pos.x + sample.right.x * r.d,
          0.08,
          sample.pos.z + sample.right.z * r.d
        );
        r.worldForward.copy(sample.tangent);
        r.visual.root.position.set(r.worldPos.x, 0.08, r.worldPos.z);

        const trackYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        if (r.isPlayer) {
          r.heading = trackYaw;
          r.visual.root.rotation.y = trackYaw;
        } else {
          const targetYawOff = -r.steerVisual * 0.15 + sample.curvature * 0.055;
          r.yawOffset += (targetYawOff - r.yawOffset) * (dt > 0 ? (1 - Math.exp(-dt * 9)) : 1);
          r.heading = trackYaw + r.yawOffset;
          r.visual.root.rotation.y = r.heading;
        }
        curvForRoll = sample.curvature;
      }

      // Dynamic Suspension Pitch & Roll (FPS-independent smoothing)
      const accelPitch = THREE.MathUtils.clamp(-r.longitudinalAccel * 0.0024, -0.075, 0.095);
      const turboPitch = (r.turboActive || r.launchBoostTimer > 0) ? -0.028 : 0;
      const targetPitch = accelPitch + turboPitch;

      const speedNorm = r.v / 55;
      const lateralG = -r.steerVisual * speedNorm * 0.095 - curvForRoll * speedNorm * 0.055;
      const targetRoll = THREE.MathUtils.clamp(lateralG, -0.14, 0.14);

      const suspAlpha = dt > 0 ? (1 - Math.exp(-dt * 8.5)) : 1;
      r.pitchVisual += (targetPitch - r.pitchVisual) * suspAlpha;
      r.rollVisual += (targetRoll - r.rollVisual) * suspAlpha;
      r.visual.bodyTiltGroup.rotation.x = r.pitchVisual;
      r.visual.bodyTiltGroup.rotation.z = r.rollVisual;

      r.wheelSpin += r.v * dt * 1.65;
      for (let i = 0; i < r.visual.wheels.length; i++) r.visual.wheels[i].rotation.x = r.wheelSpin;
      for (let i = 0; i < r.visual.frontSteerPivots.length; i++) r.visual.frontSteerPivots[i].rotation.y = -r.steerVisual * 0.42;

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

      r.visual.turboFlameGroup.visible = r.turboActive || r.launchBoostTimer > 0 || (r.isPlayer && this.overtake.executing);
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

      // Parche v1.5: Sync subtle 3D rear proximity arc behind player's rear wing
      if (r.isPlayer && r.visual.rearRadarArc) {
        const arc = r.visual.rearRadarArc;
        const rt = this._rearThreat;
        const showArc = this.phase === 'racing' && rt.active;
        arc.group.visible = showArc;
        if (showArc) {
          const dangerPulse = 0.60 + 0.32 * Math.abs(Math.sin(this.raceElapsed * 13.0));
          const updateSec = (mesh, mat, active, sev) => {
            mesh.visible = active;
            if (!active) return;
            if (sev === 'danger') {
              mat.color.setHex(0xEF4444);
              mat.opacity = dangerPulse;
            } else {
              mat.color.setHex(0xF59E0B);
              mat.opacity = 0.56;
            }
          };
          updateSec(arc.left, arc.leftMat, rt.leftActive, rt.leftSeverity);
          updateSec(arc.center, arc.centerMat, rt.centerActive, rt.centerSeverity);
          updateSec(arc.right, arc.rightMat, rt.rightActive, rt.rightSeverity);
        }
      }
    }

    // ========================================================================
    // UPDATE POOLED PARTICLES (ZERO GC)
    // ========================================================================
    _updateParticles(dt) {
      const dummy = this._dummy;

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
          const estSpeed = Math.max(38, r.v || 54);
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

      const snap = this._hudSnapshot;
      snap.phase = this.phase;
      snap.launchProgress = launchProgress;
      snap.launchStatus = this.launchStatus;
      snap.launchFlashActive = this.launchFlashTimer > 0;
      snap.wheelspinActive = p.wheelspinTimer > 0;
      snap.launchBoostActive = p.launchBoostTimer > 0;
      snap.position = p.position;
      snap.totalRacers = this.racers.length;
      snap.lap = Math.min(p.lap, this.totalLaps);
      snap.totalLaps = this.totalLaps;
      snap.kmh = kmh;
      snap.gear = gear;
      snap.speedRatio = THREE.MathUtils.clamp(kmh / 335, 0, 1);
      snap.turbo = p.turbo;
      snap.turboActive = p.turboActive || p.launchBoostTimer > 0;
      snap.moral = p.moral;
      snap.moralMultiplier = p.moralMultiplier;
      snap.moralOverdrive = p.moralOverdriveTimer > 0;
      snap.raceElapsed = this.raceElapsed;
      snap.crowdExcitement = crowdExcitement;
      snap.playerPos = p.worldPos;
      snap.playerForward = p.worldForward;
      snap.playerHeading = p.heading;
      snap.playerDriver = p.driver;
      snap.racers = this.racers;
      return snap;
    }
  }

  global.RaceEngine = RaceEngine;
})(window);
