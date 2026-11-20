// ============================================================================
// SCENEMANAGER.JS — Renderer 3D (Parche v1.1), Frustum near=0.5 / far=3500,
//                   shadow.bias=-0.0005, Showcase Piloto+Auto, Modo Editor 3D
//                   Interactivo 360°, Flyover, Carrera y Podio 3D
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
      // Frustum estabilizado (near = 0.5, far = 3500) para evitar recortes y Z-fighting
      this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.5, 3500);

      this.hemiLight = new THREE.HemisphereLight('#F8FAFC', '#1E293B', 0.42);
      this.scene.add(this.hemiLight);

      // Luz principal dura (Hard Key Light) con shadow.bias = -0.0005 y mapa 2048x2048
      this.dirLight = new THREE.DirectionalLight('#FFF9EE', 1.12);
      this.dirLight.position.set(16, 26, 18);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(2048, 2048);
      this.dirLight.shadow.bias = -0.0005;
      this.dirLight.shadow.normalBias = 0.016;
      this.dirLight.shadow.camera.near = 1;
      this.dirLight.shadow.camera.far = 280;
      const d = 14;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.scene.add(this.dirLight);
      this.scene.add(this.dirLight.target);

      // Luz de contorno marcada (Rim Light) para esculpir volumen y silueta PBR
      this.rimLight = new THREE.DirectionalLight('#7DD3FC', 0.92);
      this.rimLight.position.set(-16, 14, -18);
      this.scene.add(this.rimLight);

      // Luz de relleno tenue en el lado de sombra para conservar textura del mono ignífugo
      this.fillLight = new THREE.DirectionalLight('#CBD5E1', 0.18);
      this.fillLight.position.set(-14, 7, 14);
      this.scene.add(this.fillLight);

      this.stageRoot = new THREE.Group();
      this.scene.add(this.stageRoot);

      this.mode = 'home';
      this.elapsed = 0;

      // Showcase & Editor stage state
      this.showcaseTurntable = null;
      this.showcaseCar = null;
      this.showcaseDriver = null;
      this.showcaseGlowMat = null;
      this.showcaseSparkles = null;
      this.showcasePopTime = 1;
      this.showcaseUserYaw = 0;

      // Interactive 360° Editor orbit state
      this.editorViewMode = 'duo'; // 'duo' (Standing Driver + Car/Helmet) | 'cockpit' (Seated Helmeted Driver + Steering)
      this.editorFocus = 'car';    // 'car' | 'driver' | 'stats'
      this.editorAutoRotate = true;
      this.editorYaw = 0.25;
      this.editorPitch = 0.24;
      this.editorZoom = 1.0;
      this.isDraggingOrbit = false;

      // Track & Race state
      this.activeTrack = null;
      this.activeTrackId = null;
      this.raceEngine = null;
      this.cameraPreset = 0;
      this.camPosSmooth = new THREE.Vector3(0, 8, -14);
      this.camLookSmooth = new THREE.Vector3(0, 1.5, 6);

      // Podium state
      this.podiumDrivers = [];
      this.podiumConfetti = null;

      this._setupPointerOrbit();
      window.addEventListener('resize', () => this.onResize());
    }

    _setupPointerOrbit() {
      let lastX = 0;
      let lastY = 0;

      this.canvas.addEventListener('pointerdown', (e) => {
        if (this.mode !== 'showcase' && this.mode !== 'home' && this.mode !== 'editor') return;
        this.isDraggingOrbit = true;
        lastX = e.clientX;
        lastY = e.clientY;
        this.canvas.setPointerCapture?.(e.pointerId);
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.isDraggingOrbit) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        if (this.mode === 'editor') {
          this.editorYaw += dx * 0.011;
          this.editorPitch = THREE.MathUtils.clamp(this.editorPitch + dy * 0.006, 0.08, 0.85);
        } else {
          this.showcaseUserYaw += dx * 0.012;
        }
      });

      const stopDrag = () => { this.isDraggingOrbit = false; };
      window.addEventListener('pointerup', stopDrag);
      window.addEventListener('pointercancel', stopDrag);

      this.canvas.addEventListener('wheel', (e) => {
        if (this.mode !== 'editor') return;
        e.preventDefault();
        this.editorZoom = THREE.MathUtils.clamp(this.editorZoom + Math.sign(e.deltaY) * 0.08, 0.62, 1.45);
      }, { passive: false });
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
      this.showcaseDriver = null;
      this.showcaseSparkles = null;
      this.podiumDrivers = [];
      this.podiumConfetti = null;
    }

    _setShadowBounds(d) {
      const cam = this.dirLight.shadow.camera;
      cam.left = -d;
      cam.right = d;
      cam.top = d;
      cam.bottom = -d;
      cam.updateProjectionMatrix();
    }

    _applyStudioLighting(isPodium = false) {
      this._setShadowBounds(isPodium ? 18 : 11);
      // Hard primary key light casting strong sculptural shadows across face & suit folds
      this.dirLight.color.set('#FFF9F0');
      this.dirLight.intensity = isPodium ? 1.24 : 1.28;
      this.dirLight.position.set(isPodium ? 14 : 11, isPodium ? 22 : 16, isPodium ? 16 : 13);
      this.dirLight.target.position.set(0, 1.0, 0);
      this.dirLight.target.updateMatrixWorld();

      // Low ambient fill with deep floor bounce so shadows carry real mass & volume
      this.hemiLight.color.set('#F8FAFC');
      this.hemiLight.groundColor.set('#1E293B');
      this.hemiLight.intensity = isPodium ? 0.48 : 0.46;

      // Crisp rim light outlining shoulders, cheekbones, hair locks & helmet lacquer
      this.rimLight.color.set('#BAE6FD');
      this.rimLight.intensity = isPodium ? 0.78 : 0.84;
      this.rimLight.position.set(-14, 11, -15);

      if (this.fillLight) {
        this.fillLight.color.set('#FDE68A');
        this.fillLight.intensity = 0.14;
      }
    }

    enterShowcase(driver, isHome = false) {
      const wasStudio = this.mode === 'showcase' || this.mode === 'home' || this.mode === 'editor';
      this.mode = isHome ? 'home' : 'showcase';
      this.editorViewMode = 'duo';
      this.raceEngine = null;
      this.activeTrack = null;
      this.activeTrackId = null;

      const team = global.F1Data.getTeamById(driver.teamId);
      this._applyStudioLighting(false);

      if (!wasStudio || !this.showcaseTurntable) {
        this._clearStage();
        this._buildShowcaseStage(team);
      }

      this.updateShowcaseCar(driver, team, true);
    }

    enterEditorPreview(driver, team) {
      const wasStudio = this.mode === 'showcase' || this.mode === 'home' || this.mode === 'editor';
      this.mode = 'editor';
      this.raceEngine = null;
      this.activeTrack = null;
      this.activeTrackId = null;

      const resolvedTeam = team || global.F1Data.getTeamById(driver.teamId);
      this._applyStudioLighting(false);

      if (!wasStudio || !this.showcaseTurntable) {
        this._clearStage();
        this._buildShowcaseStage(resolvedTeam);
      }

      this.updateShowcaseCar(driver, resolvedTeam, false);
    }

    refreshEditorPreview(driver, team) {
      if (!this.showcaseTurntable) {
        this.enterEditorPreview(driver, team);
        return;
      }
      this.updateShowcaseCar(driver, team, false);
    }

    setEditorFocus(tabName) {
      this.editorFocus = tabName || 'car';
    }

    setEditorViewMode(viewMode, driver, team) {
      this.editorViewMode = viewMode === 'cockpit' ? 'cockpit' : 'duo';
      if (driver) this.updateShowcaseCar(driver, team, false);
    }

    toggleEditorAutoRotate() {
      this.editorAutoRotate = !this.editorAutoRotate;
      return this.editorAutoRotate;
    }

    resetEditorOrbit() {
      this.editorYaw = 0.28;
      this.editorPitch = 0.24;
      this.editorZoom = 1.0;
    }

    _buildShowcaseStage(team) {
      const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline, getCheckeredTexture } = global.ToonMat;

      const studioFloor = new THREE.Mesh(
        new THREE.CircleGeometry(48, 48),
        getToonMaterial('#141A2C')
      );
      studioFloor.rotation.x = -Math.PI / 2;
      studioFloor.position.y = -0.62;
      studioFloor.receiveShadow = true;
      this.stageRoot.add(studioFloor);

      const backRing1 = new THREE.Mesh(
        new THREE.TorusGeometry(9.5, 0.22, 10, 48),
        new THREE.MeshBasicMaterial({ color: '#00E5FF', transparent: true, opacity: 0.26 })
      );
      backRing1.position.set(0, 3.2, -6.5);
      this.stageRoot.add(backRing1);

      const turntable = new THREE.Group();
      turntable.position.set(0, 0, 0);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(4.4, 4.9, 0.72, 40),
        getPlasticGlossMaterial('#181C28', { shininess: 140 })
      );
      base.position.y = -0.36;
      base.receiveShadow = true;
      addCartoonOutline(base, [1.02, 1.05, 1.02]);
      turntable.add(base);

      const topPlatter = new THREE.Mesh(
        new THREE.CylinderGeometry(4.05, 4.05, 0.08, 40),
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
      const ledRing = new THREE.Mesh(new THREE.TorusGeometry(4.35, 0.14, 12, 48), this.showcaseGlowMat);
      ledRing.rotation.x = Math.PI / 2;
      ledRing.position.y = 0.02;
      turntable.add(ledRing);

      const studGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 12);
      const studMat = getPlasticGlossMaterial('#FFFFFF', { shininess: 150 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(Math.cos(a) * 4.12, 0.12, Math.sin(a) * 4.12);
        turntable.add(stud);
      }

      this.stageRoot.add(turntable);
      this.showcaseTurntable = turntable;

      const spotCone = new THREE.Mesh(
        new THREE.ConeGeometry(5.4, 11.5, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
      );
      spotCone.position.set(0, 5.6, 0);
      this.stageRoot.add(spotCone);

      const spGroup = new THREE.Group();
      const spGeo = new THREE.OctahedronGeometry(0.15, 0);
      const spColors = ['#FFD43B', '#00E5FF', '#E50914', '#FFFFFF', '#00F5D4'];
      for (let i = 0; i < 22; i++) {
        const sp = new THREE.Mesh(spGeo, new THREE.MeshBasicMaterial({ color: spColors[i % spColors.length] }));
        const a = (i / 22) * Math.PI * 2;
        const r = 3.7 + (i % 3) * 0.85;
        sp.position.set(Math.cos(a) * r, 0.8 + (i % 5) * 0.65, Math.sin(a) * r);
        sp.userData = { baseY: sp.position.y, phase: i * 0.7 };
        spGroup.add(sp);
      }
      this.stageRoot.add(spGroup);
      this.showcaseSparkles = spGroup;
    }

    updateShowcaseCar(driver, teamOverride = null, withPop = true) {
      if (!this.showcaseTurntable) return;
      if (this.showcaseCar) {
        this.showcaseTurntable.remove(this.showcaseCar.root);
        this.showcaseCar = null;
      }
      if (this.showcaseDriver) {
        this.showcaseTurntable.remove(this.showcaseDriver.root);
        this.showcaseDriver = null;
      }

      const team = teamOverride || global.F1Data.getTeamById(driver.teamId);

      if (this.mode === 'editor' && this.editorViewMode === 'cockpit') {
        // Seated helmeted driver gripping steering wheel + HANS system
        this.showcaseCar = global.CarBuilder.buildF1Car(driver, team, {
          detailed: true,
          driverMode: 'seated'
        });
        this.showcaseCar.root.position.set(0, 0.06, 0);
        this.showcaseCar.root.rotation.y = 0.15;
        this.showcaseCar.root.scale.setScalar(1.22);
        this.showcaseTurntable.add(this.showcaseCar.root);
      } else {
        // Heroic Duo Showcase: F1 Car (with detailed reflective helmet on Halo) + Unhelmeted Anatomical Driver beside it!
        this.showcaseCar = global.CarBuilder.buildF1Car(driver, team, {
          detailed: true,
          driverMode: 'parked_with_helmet'
        });
        this.showcaseCar.root.position.set(0.68, 0.06, -0.22);
        this.showcaseCar.root.rotation.y = -0.18;
        this.showcaseCar.root.scale.setScalar(1.08);
        this.showcaseTurntable.add(this.showcaseCar.root);

        this.showcaseDriver = global.CarBuilder.buildStandingDriver(driver, team, { pose: 'hero' });
        this.showcaseDriver.root.position.set(-1.82, 0.06, 0.96);
        this.showcaseDriver.root.rotation.y = 0.34;
        this.showcaseDriver.root.scale.setScalar(1.06);
        this.showcaseTurntable.add(this.showcaseDriver.root);
      }

      if (this.showcaseGlowMat) {
        this.showcaseGlowMat.color.set(team.primary);
        this.showcaseGlowMat.emissive.set(team.primary);
      }
      const bgTint = new THREE.Color('#0E1220').lerp(new THREE.Color(team.primary), 0.16);
      this.scene.background = bgTint;
      this.scene.fog = new THREE.Fog(bgTint, 24, 65);
      this.showcasePopTime = withPop ? 0 : 1;
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

      this._setShadowBounds(58);
      this.scene.background = new THREE.Color(this.activeTrack.skyColor);
      this.scene.fog = new THREE.Fog(this.activeTrack.fogColor, 260, 1450);
      this.dirLight.color.set(this.activeTrack.sunColor);
      this.dirLight.intensity = circuitMeta.id === 'abudhabi' ? 0.78 : 0.85;
      this.dirLight.position.set(85, 115, 70);
      this.dirLight.target.position.set(0, 0, 0);
      this.dirLight.target.updateMatrixWorld();
      this.hemiLight.color.set(this.activeTrack.ambientColor);
      this.hemiLight.groundColor.set('#334155');
      this.hemiLight.intensity = circuitMeta.id === 'abudhabi' ? 0.48 : 0.56;
      this.rimLight.color.set('#7DD3FC');
      this.rimLight.intensity = circuitMeta.id === 'abudhabi' ? 0.34 : 0.28;
      this.rimLight.position.set(-40, 28, -45);
      if (this.fillLight) this.fillLight.intensity = 0.0;
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
      this.scene.fog = new THREE.Fog('#121528', 28, 95);
      this._applyStudioLighting(true);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(38, 48),
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
        block.castShadow = true;
        block.receiveShadow = true;
        addCartoonOutline(block, [1.03, 1.03, 1.03]);
        this.stageRoot.add(block);

        const standing = buildStandingDriver(entry.driver, entry.team, { pose: 'podium' });
        standing.root.position.set(st.x, st.h + 0.02, 0.12);
        this.stageRoot.add(standing.root);

        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.16, 0.72, 12), getPlasticGlossMaterial(st.color, { shininess: 180 }));
        cup.position.set(st.x + 0.85, st.h + 0.42, 0.45);
        addCartoonOutline(cup, 1.1);
        this.stageRoot.add(cup);

        this.podiumDrivers.push({ standing, baseY: st.h + 0.02, phase: st.idx * 1.4 });

        const car = buildF1Car(entry.driver, entry.team, { detailed: true, driverMode: 'parked_with_helmet' });
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
      else if (this.mode === 'editor') this._animateEditor(dt);
      else if (this.mode === 'circuit_preview') this._animateCircuitPreview(dt);
      else if (this.mode === 'race' && this.raceEngine && hudSnapshot) this._animateRace(dt, hudSnapshot);
      else if (this.mode === 'podium') this._animatePodium(dt);
      this.renderer.render(this.scene, this.camera);
    }

    _animateStudioEntities(dt) {
      if (this.showcaseCar) {
        this.showcasePopTime = Math.min(1, this.showcasePopTime + dt * 3.4);
        const t = this.showcasePopTime;
        const baseScale = (this.mode === 'editor' && this.editorViewMode === 'cockpit') ? 1.22 : 1.1;
        const popScale = t < 1 ? baseScale * (1 + Math.sin(t * Math.PI * 2.1) * (1 - t) * 0.22) : baseScale;
        this.showcaseCar.root.scale.setScalar(popScale);

        this.showcaseCar.bodyTiltGroup.position.y = Math.abs(Math.sin(this.elapsed * 2.8)) * 0.045;
        this.showcaseCar.bodyTiltGroup.rotation.z = Math.sin(this.elapsed * 1.6) * 0.02;

        if (this.mode === 'editor' && this.editorViewMode === 'cockpit') {
          const demoSteer = Math.sin(this.elapsed * 1.45) * 0.78;
          this.showcaseCar.updateSteering?.(demoSteer);
          this.showcaseCar.frontSteerPivots.forEach(p => { p.rotation.y = -demoSteer * 0.42; });
          this.showcaseCar.headPivot.rotation.y = -demoSteer * 0.26;
          this.showcaseCar.headPivot.rotation.z = Math.sin(this.elapsed * 2.2) * 0.06;
        }
        this.showcaseCar.wheels.forEach(w => { w.rotation.x += dt * 1.8; });
      }

      if (this.showcaseDriver) {
        const breath = Math.sin(this.elapsed * 2.4);
        this.showcaseDriver.torsoGroup.position.y = breath * 0.022;
        this.showcaseDriver.headPivot.rotation.y = Math.sin(this.elapsed * 1.35) * 0.22;
        this.showcaseDriver.headPivot.rotation.x = Math.cos(this.elapsed * 1.9) * 0.05;
        this.showcaseDriver.headPivot.rotation.z = Math.sin(this.elapsed * 1.7) * 0.04;
        this.showcaseDriver.leftArm.rotation.z = 0.22 + Math.sin(this.elapsed * 2.1) * 0.04;
      }

      if (this.showcaseSparkles) {
        this.showcaseSparkles.rotation.y -= dt * 0.35;
        this.showcaseSparkles.children.forEach(sp => {
          sp.position.y = sp.userData.baseY + Math.sin(this.elapsed * 2.6 + sp.userData.phase) * 0.26;
          sp.rotation.x += dt * 1.8;
          sp.rotation.y += dt * 2.2;
        });
      }
    }

    _animateShowcase(dt) {
      if (this.showcaseTurntable) {
        this.showcaseTurntable.rotation.y = this.elapsed * 0.42 + this.showcaseUserYaw;
      }
      this._animateStudioEntities(dt);

      const isNarrow = window.innerWidth < 860;
      let targetPos, targetLook;
      if (this.mode === 'home') {
        targetPos = isNarrow ? new THREE.Vector3(0, 4.1, 10.6) : new THREE.Vector3(-2.6, 3.5, 9.2);
        targetLook = isNarrow ? new THREE.Vector3(0, 1.0, 0) : new THREE.Vector3(-2.2, 1.25, 0);
      } else {
        targetPos = isNarrow ? new THREE.Vector3(0, 4.2, 11.4) : new THREE.Vector3(2.2, 3.6, 10.0);
        targetLook = isNarrow ? new THREE.Vector3(0, 0.5, 0) : new THREE.Vector3(1.6, 0.78, 0);
      }

      this.camera.position.lerp(targetPos, Math.min(1, dt * 4.5));
      this.camLookSmooth.lerp(targetLook, Math.min(1, dt * 5));
      this.camera.lookAt(this.camLookSmooth);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 48, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    _animateEditor(dt) {
      if (this.editorAutoRotate && !this.isDraggingOrbit) {
        this.editorYaw += dt * 0.32;
      }
      if (this.showcaseTurntable) {
        this.showcaseTurntable.rotation.y = this.editorYaw;
      }
      this._animateStudioEntities(dt);

      const isNarrow = window.innerWidth < 920;
      const baseRadius = (this.editorFocus === 'driver' ? 7.2 : 9.4) * this.editorZoom;
      const pitch = this.editorPitch;

      // Keep subject framed clearly in the open canvas area (LEFT on desktop, TOP on mobile)
      const camY = Math.max(1.2, Math.sin(pitch) * baseRadius + 1.45);
      const camZ = Math.cos(pitch) * baseRadius;

      let targetPos, targetLook;
      if (isNarrow) {
        targetPos = new THREE.Vector3(0, camY + 0.5, camZ + 1.2);
        targetLook = new THREE.Vector3(0, this.editorFocus === 'driver' ? 0.55 : -0.35, 0);
      } else {
        // Shift look target +X so the turntable sits comfortably on the LEFT 56% of viewport
        const xOffset = this.editorFocus === 'driver' ? 1.55 : 2.15;
        targetPos = new THREE.Vector3(xOffset, camY, camZ);
        targetLook = new THREE.Vector3(xOffset, this.editorFocus === 'driver' ? 1.38 : 1.05, 0);
      }

      this.camera.position.lerp(targetPos, Math.min(1, dt * 6));
      this.camLookSmooth.lerp(targetLook, Math.min(1, dt * 6));
      this.camera.lookAt(this.camLookSmooth);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.editorFocus === 'driver' ? 44 : 48, dt * 5);
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

      // Track player cleanly with directional light shadow frustum so shadows stay crisp across entire circuit
      this.dirLight.position.set(p.worldPos.x + 52, 96, p.worldPos.z + 44);
      this.dirLight.target.position.set(p.worldPos.x, 0, p.worldPos.z);
      this.dirLight.target.updateMatrixWorld();

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
      this.camera.lookAt(0, 2.1, -0.5);

      this.podiumDrivers.forEach(pd => {
        const jump = Math.abs(Math.sin(this.elapsed * 5.2 + pd.phase)) * 0.48;
        pd.standing.root.position.y = pd.baseY + jump;
        pd.standing.headPivot.rotation.z = Math.sin(this.elapsed * 6.5 + pd.phase) * 0.14;
        pd.standing.leftArm.rotation.z = 2.45 + Math.sin(this.elapsed * 8 + pd.phase) * 0.28;
        pd.standing.rightArm.rotation.z = -2.45 - Math.sin(this.elapsed * 8 + pd.phase) * 0.28;
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
