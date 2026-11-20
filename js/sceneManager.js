// ============================================================================
// SCENEMANAGER.JS — Renderer 3D, Showcase Giratorio, Flyover, Cámara de
//                   Carrera Dinámica y Podio 3D Animado (Netflix × Switch)
// ============================================================================
(function (global) {
  'use strict';

  class SceneManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.2, 1100);

      this.hemiLight = new THREE.HemisphereLight('#FFFFFF', '#94A3B8', 1.2);
      this.scene.add(this.hemiLight);

      this.dirLight = new THREE.DirectionalLight('#FFFDF2', 1.65);
      this.dirLight.position.set(45, 75, 40);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
      this.dirLight.shadow.camera.near = 1;
      this.dirLight.shadow.camera.far = 260;
      const d = 55;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.scene.add(this.dirLight);

      this.rimLight = new THREE.DirectionalLight('#7DD3FC', 0.7);
      this.rimLight.position.set(-40, 28, -45);
      this.scene.add(this.rimLight);

      this.stageRoot = new THREE.Group();
      this.scene.add(this.stageRoot);

      this.mode = 'home';
      this.elapsed = 0;

      this.showcaseTurntable = null;
      this.showcaseCar = null;
      this.showcaseGlowMat = null;
      this.showcaseSparkles = null;
      this.showcasePopTime = 1;
      this.showcaseUserYaw = 0;

      this.activeTrack = null;
      this.activeTrackId = null;
      this.raceEngine = null;
      this.cameraPreset = 0;
      this.camPosSmooth = new THREE.Vector3(0, 8, -14);
      this.camLookSmooth = new THREE.Vector3(0, 1.5, 6);

      this.podiumDrivers = [];
      this.podiumConfetti = null;

      this._setupPointerOrbit();
      window.addEventListener('resize', () => this.onResize());
    }

    _setupPointerOrbit() {
      let dragging = false;
      let lastX = 0;
      this.canvas.addEventListener('pointerdown', (e) => {
        if (this.mode !== 'showcase' && this.mode !== 'home') return;
        dragging = true;
        lastX = e.clientX;
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        this.showcaseUserYaw += dx * 0.012;
      });
      window.addEventListener('pointerup', () => { dragging = false; });
    }

    onResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    _clearStage() {
      while (this.stageRoot.children.length > 0) {
        this.stageRoot.remove(this.stageRoot.children[0]);
      }
      this.showcaseTurntable = null;
      this.showcaseCar = null;
      this.showcaseSparkles = null;
      this.podiumDrivers = [];
      this.podiumConfetti = null;
    }

    enterShowcase(driver, isHome = false) {
      const wasShowcase = this.mode === 'showcase' || this.mode === 'home';
      this.mode = isHome ? 'home' : 'showcase';
      this.raceEngine = null;
      this.activeTrack = null;
      this.activeTrackId = null;

      const team = global.F1Data.getTeamById(driver.teamId);
      this.dirLight.color.set('#FFFDF2');
      this.dirLight.position.set(14, 24, 16);
      this.hemiLight.intensity = 1.28;

      if (!wasShowcase || !this.showcaseTurntable) {
        this._clearStage();
        this._buildShowcaseStage(team);
      }

      this.updateShowcaseCar(driver);
    }

    _buildShowcaseStage(team) {
      const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline, getCheckeredTexture } = global.ToonMat;

      const studioFloor = new THREE.Mesh(
        new THREE.CircleGeometry(46, 48),
        getToonMaterial('#141A2C')
      );
      studioFloor.rotation.x = -Math.PI / 2;
      studioFloor.position.y = -0.62;
      studioFloor.receiveShadow = true;
      this.stageRoot.add(studioFloor);

      const backRing1 = new THREE.Mesh(
        new THREE.TorusGeometry(9.5, 0.22, 10, 48),
        new THREE.MeshBasicMaterial({ color: '#00E5FF', transparent: true, opacity: 0.28 })
      );
      backRing1.position.set(0, 3.2, -6.5);
      this.stageRoot.add(backRing1);

      const turntable = new THREE.Group();
      turntable.position.set(0, 0, 0);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.7, 0.72, 36),
        getPlasticGlossMaterial('#181C28', { shininess: 140 })
      );
      base.position.y = -0.36;
      base.receiveShadow = true;
      addCartoonOutline(base, [1.02, 1.05, 1.02]);
      turntable.add(base);

      const topPlatter = new THREE.Mesh(
        new THREE.CylinderGeometry(3.85, 3.85, 0.08, 36),
        new THREE.MeshPhongMaterial({ map: getCheckeredTexture(6, 6), shininess: 110 })
      );
      topPlatter.position.y = 0.02;
      topPlatter.receiveShadow = true;
      turntable.add(topPlatter);

      this.showcaseGlowMat = new THREE.MeshStandardMaterial({
        color: team.primary,
        emissive: team.primary,
        emissiveIntensity: 1.5,
        roughness: 0.2
      });
      const ledRing = new THREE.Mesh(new THREE.TorusGeometry(4.15, 0.14, 12, 48), this.showcaseGlowMat);
      ledRing.rotation.x = Math.PI / 2;
      ledRing.position.y = 0.02;
      turntable.add(ledRing);

      const studGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 12);
      const studMat = getPlasticGlossMaterial('#FFFFFF', { shininess: 150 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(Math.cos(a) * 3.92, 0.12, Math.sin(a) * 3.92);
        turntable.add(stud);
      }

      this.stageRoot.add(turntable);
      this.showcaseTurntable = turntable;

      const spotCone = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, 11, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false })
      );
      spotCone.position.set(0, 5.4, 0);
      this.stageRoot.add(spotCone);

      const spGroup = new THREE.Group();
      const spGeo = new THREE.OctahedronGeometry(0.16, 0);
      const spColors = ['#FFD43B', '#00E5FF', '#E50914', '#FFFFFF', '#00F5D4'];
      for (let i = 0; i < 24; i++) {
        const sp = new THREE.Mesh(spGeo, new THREE.MeshBasicMaterial({ color: spColors[i % spColors.length] }));
        const a = (i / 24) * Math.PI * 2;
        const r = 3.4 + (i % 3) * 0.9;
        sp.position.set(Math.cos(a) * r, 0.8 + (i % 5) * 0.65, Math.sin(a) * r);
        sp.userData = { baseY: sp.position.y, phase: i * 0.7 };
        spGroup.add(sp);
      }
      this.stageRoot.add(spGroup);
      this.showcaseSparkles = spGroup;
    }

    updateShowcaseCar(driver) {
      if (!this.showcaseTurntable) return;
      if (this.showcaseCar) this.showcaseTurntable.remove(this.showcaseCar.root);

      const team = global.F1Data.getTeamById(driver.teamId);
      this.showcaseCar = global.CarBuilder.buildF1Car(driver, team, { detailed: true });
      this.showcaseCar.root.position.set(0, 0.06, 0);
      this.showcaseCar.root.scale.setScalar(1.24);
      this.showcaseTurntable.add(this.showcaseCar.root);

      if (this.showcaseGlowMat) {
        this.showcaseGlowMat.color.set(team.primary);
        this.showcaseGlowMat.emissive.set(team.primary);
      }
      const bgTint = new THREE.Color('#0E1220').lerp(new THREE.Color(team.primary), 0.16);
      this.scene.background = bgTint;
      this.scene.fog = new THREE.Fog(bgTint, 22, 58);
      this.showcasePopTime = 0;
    }

    enterCircuitPreview(circuitMeta) {
      this.mode = 'circuit_preview';
      this.raceEngine = null;
      this._loadTrackStage(circuitMeta);
    }

    _loadTrackStage(circuitMeta) {
      this._clearStage();
      this.activeTrack = global.TrackBuilder.buildCircuitScene(circuitMeta);
      this.activeTrackId = circuitMeta.id;
      this.stageRoot.add(this.activeTrack.group);

      this.scene.background = new THREE.Color(this.activeTrack.skyColor);
      this.scene.fog = new THREE.Fog(this.activeTrack.fogColor, 180, 620);
      this.dirLight.color.set(this.activeTrack.sunColor);
      this.dirLight.position.set(85, 115, 70);
      this.hemiLight.color.set(this.activeTrack.ambientColor);
      this.hemiLight.intensity = circuitMeta.id === 'abudhabi' ? 0.95 : 1.25;
    }

    enterRace(circuitMeta, raceEngine) {
      this.mode = 'race';
      if (!this.activeTrack || this.activeTrackId !== circuitMeta.id) {
        this._loadTrackStage(circuitMeta);
      } else if (this.raceEngine) {
        this.stageRoot.remove(this.raceEngine.root);
      }
      this.raceEngine = raceEngine;
      this.activeTrack?.setStartLights(0);
      this.stageRoot.add(raceEngine.root);

      const p = raceEngine.player;
      this.camPosSmooth.copy(p.worldPos).addScaledVector(p.worldForward, -16).add(new THREE.Vector3(6, 9, 0));
      this.camLookSmooth.copy(p.worldPos).addScaledVector(p.worldForward, 8);
    }

    cycleCameraPreset() {
      this.cameraPreset = (this.cameraPreset + 1) % 3;
      return ['📷 Cercana', '📷 Panorámica', '📷 Capó'][this.cameraPreset];
    }

    enterPodium(results) {
      const { getPlasticGlossMaterial, addCartoonOutline, getCheckeredTexture } = global.ToonMat;
      const { buildF1Car, buildStandingDriver } = global.CarBuilder;

      this.mode = 'podium';
      this.raceEngine = null;
      this.activeTrack = null;
      this.activeTrackId = null;
      this._clearStage();

      this.scene.background = new THREE.Color('#121528');
      this.scene.fog = new THREE.Fog('#121528', 28, 85);
      this.dirLight.color.set('#FFFBEB');
      this.dirLight.position.set(16, 28, 22);
      this.hemiLight.color.set('#FFFFFF');
      this.hemiLight.intensity = 1.3;

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(36, 48),
        new THREE.MeshPhongMaterial({ map: getCheckeredTexture(12, 12), shininess: 90 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      this.stageRoot.add(floor);

      const steps = [
        { idx: 0, x: 0, h: 2.35, color: '#FFD43B' },
        { idx: 1, x: -3.1, h: 1.65, color: '#CBD5E1' },
        { idx: 2, x: 3.1, h: 1.15, color: '#F59E0B' }
      ];

      this.podiumDrivers = [];
      steps.forEach((st) => {
        const entry = results[st.idx];
        if (!entry) return;

        const block = new THREE.Mesh(new THREE.BoxGeometry(2.75, st.h, 2.5), getPlasticGlossMaterial(st.color, { shininess: 140 }));
        block.position.set(st.x, st.h / 2, 0);
        addCartoonOutline(block, [1.03, 1.03, 1.03]);
        this.stageRoot.add(block);

        const standing = buildStandingDriver(entry.driver, entry.team);
        standing.root.position.set(st.x, st.h + 0.02, 0.1);
        this.stageRoot.add(standing.root);

        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.72, 12), getPlasticGlossMaterial(st.color, { shininess: 180 }));
        cup.position.set(st.x + 0.85, st.h + 0.42, 0.45);
        addCartoonOutline(cup, 1.1);
        this.stageRoot.add(cup);

        this.podiumDrivers.push({ standing, baseY: st.h + 0.02, phase: st.idx * 1.4 });

        const car = buildF1Car(entry.driver, entry.team, { detailed: true });
        car.root.position.set(st.x * 1.65, 0.04, -5.2 - (st.idx === 0 ? 0.6 : 0));
        car.root.rotation.y = st.idx === 1 ? 0.35 : st.idx === 2 ? -0.35 : 0;
        this.stageRoot.add(car.root);
      });

      const CONF_COUNT = 180;
      const confInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.06, 0.18), new THREE.MeshBasicMaterial({ color: '#FFFFFF' }), CONF_COUNT);
      const palette = ['#FFD43B', '#E50914', '#00F5D4', '#38BDF8', '#A855F7', '#22C55E', '#FF8000'];
      const tmpCol = new THREE.Color();
      const confData = [];
      for (let i = 0; i < CONF_COUNT; i++) {
        tmpCol.set(palette[i % palette.length]);
        confInst.setColorAt(i, tmpCol);
        confData.push({
          x: (Math.random() - 0.5) * 18, y: 2 + Math.random() * 14, z: (Math.random() - 0.5) * 14,
          vy: 1.6 + Math.random() * 2.2, rx: Math.random() * 6, ry: Math.random() * 6, phase: Math.random() * 6
        });
      }
      if (confInst.instanceColor) confInst.instanceColor.needsUpdate = true;
      this.stageRoot.add(confInst);
      this.podiumConfetti = { mesh: confInst, data: confData };
    }

    render(dt, hudSnapshot = null) {
      this.elapsed += dt;
      if (this.mode === 'home' || this.mode === 'showcase') this._animateShowcase(dt);
      else if (this.mode === 'circuit_preview') this._animateCircuitPreview(dt);
      else if (this.mode === 'race' && this.raceEngine && hudSnapshot) this._animateRace(dt, hudSnapshot);
      else if (this.mode === 'podium') this._animatePodium(dt);
      this.renderer.render(this.scene, this.camera);
    }

    _animateShowcase(dt) {
      if (this.showcaseTurntable) {
        this.showcaseTurntable.rotation.y = this.elapsed * 0.55 + this.showcaseUserYaw;
      }

      if (this.showcaseCar) {
        this.showcasePopTime = Math.min(1, this.showcasePopTime + dt * 3.4);
        const t = this.showcasePopTime;
        const popScale = t < 1 ? 1.24 * (1 + Math.sin(t * Math.PI * 2.1) * (1 - t) * 0.28) : 1.24;
        this.showcaseCar.root.scale.setScalar(popScale);

        this.showcaseCar.bodyTiltGroup.position.y = Math.abs(Math.sin(this.elapsed * 3.2)) * 0.085;
        this.showcaseCar.bodyTiltGroup.rotation.z = Math.sin(this.elapsed * 1.8) * 0.03;
        this.showcaseCar.headPivot.rotation.z = Math.sin(this.elapsed * 3.8) * 0.14;
        this.showcaseCar.headPivot.rotation.x = Math.cos(this.elapsed * 2.6) * 0.08;
        this.showcaseCar.headPivot.rotation.y = Math.sin(this.elapsed * 1.5) * 0.22;
        this.showcaseCar.wheels.forEach(w => { w.rotation.x += dt * 2.2; });
      }

      if (this.showcaseSparkles) {
        this.showcaseSparkles.rotation.y -= dt * 0.35;
        this.showcaseSparkles.children.forEach(sp => {
          sp.position.y = sp.userData.baseY + Math.sin(this.elapsed * 2.6 + sp.userData.phase) * 0.28;
          sp.rotation.x += dt * 1.8;
          sp.rotation.y += dt * 2.2;
        });
      }

      // Netflix × Switch Framing:
      // Home: car shines cleanly on the RIGHT side while Hero Title & Play CTA sit on the LEFT
      // Showcase: car shines cleanly in the UPPER-LEFT/CENTER while Stats Card sits on the RIGHT and Carousel on BOTTOM
      const isNarrow = window.innerWidth < 860;
      let targetPos, targetLook;
      if (this.mode === 'home') {
        targetPos = isNarrow ? new THREE.Vector3(0, 4.2, 10.2) : new THREE.Vector3(-2.6, 3.6, 8.8);
        targetLook = isNarrow ? new THREE.Vector3(0, 0.9, 0) : new THREE.Vector3(-2.2, 1.15, 0);
      } else {
        targetPos = isNarrow ? new THREE.Vector3(0, 4.4, 11.2) : new THREE.Vector3(2.2, 3.8, 9.8);
        targetLook = isNarrow ? new THREE.Vector3(0, 0.3, 0) : new THREE.Vector3(1.6, 0.55, 0);
      }

      this.camera.position.lerp(targetPos, Math.min(1, dt * 4.5));
      this.camLookSmooth.lerp(targetLook, Math.min(1, dt * 5));
      this.camera.lookAt(this.camLookSmooth);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 48, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    _animateCircuitPreview(dt) {
      if (!this.activeTrack) return;
      this.activeTrack.update(dt, this.elapsed, 0.5, new THREE.Vector3(90, 0, 40));

      const id = this.activeTrack.circuitMeta.id;
      let center = new THREE.Vector3(95, 8, 25), radius = 155, height = 62;
      if (id === 'monaco') { center.set(110, 6, -40); radius = 165; height = 58; }
      else if (id === 'silverstone') { center.set(95, 18, 40); radius = 140; height = 55; }
      else if (id === 'abudhabi') { center.set(70, 14, -140); radius = 130; height = 48; }

      const angle = this.elapsed * 0.22;
      const desiredPos = new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        height + Math.sin(this.elapsed * 0.5) * 6,
        center.z + Math.sin(angle) * radius
      );
      this.camera.position.lerp(desiredPos, Math.min(1, dt * 2.5));
      this.camLookSmooth.lerp(center, Math.min(1, dt * 3));
      this.camera.lookAt(this.camLookSmooth);
    }

    _animateRace(dt, hud) {
      if (this.activeTrack) this.activeTrack.update(dt, this.elapsed, hud.crowdExcitement, hud.playerPos);

      const p = this.raceEngine.player;
      const forward = p.worldForward;
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      let backDist = 9.4, upHeight = 4.2, lookAheadDist = 11;
      if (this.cameraPreset === 1) { backDist = 12.6; upHeight = 6.0; lookAheadDist = 14; }
      else if (this.cameraPreset === 2) { backDist = 1.4; upHeight = 2.45; lookAheadDist = 20; }

      if (hud.turboActive && this.cameraPreset !== 2) { backDist += 1.4; upHeight -= 0.25; }

      const desiredPos = p.worldPos.clone()
        .addScaledVector(forward, -backDist)
        .addScaledVector(right, p.steerVisual * 1.15);
      desiredPos.y = upHeight;

      if (hud.turboActive || hud.moralOverdrive) {
        desiredPos.x += (Math.random() - 0.5) * 0.11;
        desiredPos.y += (Math.random() - 0.5) * 0.08;
      }

      const desiredLook = p.worldPos.clone().addScaledVector(forward, lookAheadDist);
      desiredLook.y = this.cameraPreset === 2 ? 1.8 : 1.5;

      const lerpRate = this.cameraPreset === 2 ? 18 : 9.5;
      this.camPosSmooth.lerp(desiredPos, Math.min(1, dt * lerpRate));
      this.camLookSmooth.lerp(desiredLook, Math.min(1, dt * 12));
      this.camera.position.copy(this.camPosSmooth);
      this.camera.lookAt(this.camLookSmooth);

      const targetFov = 56 + hud.speedRatio * 12 + (hud.turboActive ? 9 : 0) + (hud.moralOverdrive ? 4 : 0);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 6));
      this.camera.updateProjectionMatrix();
    }

    _animatePodium(dt) {
      const camX = Math.sin(this.elapsed * 0.45) * 3.8;
      this.camera.position.lerp(new THREE.Vector3(camX, 5.1, 12.2), Math.min(1, dt * 3));
      this.camera.lookAt(0, 2.0, -0.5);

      this.podiumDrivers.forEach(pd => {
        const jump = Math.abs(Math.sin(this.elapsed * 5.2 + pd.phase)) * 0.55;
        pd.standing.root.position.y = pd.baseY + jump;
        pd.standing.headPivot.rotation.z = Math.sin(this.elapsed * 6.5 + pd.phase) * 0.2;
        pd.standing.leftArm.rotation.z = 2.3 + Math.sin(this.elapsed * 8 + pd.phase) * 0.35;
        pd.standing.rightArm.rotation.z = -2.3 - Math.sin(this.elapsed * 8 + pd.phase) * 0.35;
      });

      if (this.podiumConfetti) {
        const dummy = new THREE.Object3D();
        const data = this.podiumConfetti.data;
        for (let i = 0; i < data.length; i++) {
          const c = data[i];
          c.y -= c.vy * dt;
          c.x += Math.sin(this.elapsed * 2 + c.phase) * 0.6 * dt;
          c.rx += dt * 3.5; c.ry += dt * 2.8;
          if (c.y < 0.2) { c.y = 13 + Math.random() * 4; c.x = (Math.random() - 0.5) * 18; }
          dummy.position.set(c.x, c.y, c.z);
          dummy.rotation.set(c.rx, c.ry, 0);
          dummy.updateMatrix();
          this.podiumConfetti.mesh.setMatrixAt(i, dummy.matrix);
        }
        this.podiumConfetti.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  global.SceneManager = SceneManager;
})(window);
