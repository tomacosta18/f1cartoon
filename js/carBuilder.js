// ============================================================================
// CARBUILDER.JS — Monoplaza LEGO/Cartoon 3D + Piloto Cabezón (Bobblehead)
// ============================================================================
(function (global) {
  'use strict';

  let GEO = null;

  function ensureGeo() {
    if (GEO) return GEO;
    GEO = {
      chassis: new THREE.BoxGeometry(1.42, 0.44, 3.25),
      nose: new THREE.BoxGeometry(0.76, 0.32, 1.35),
      noseTip: new THREE.BoxGeometry(0.58, 0.22, 0.55),
      sidepod: new THREE.BoxGeometry(0.42, 0.36, 1.75),
      engineCover: new THREE.BoxGeometry(0.68, 0.46, 1.35),
      airbox: new THREE.BoxGeometry(0.52, 0.34, 0.62),
      frontWing: new THREE.BoxGeometry(2.12, 0.12, 0.56),
      frontWingFlap: new THREE.BoxGeometry(1.96, 0.08, 0.24),
      endplateF: new THREE.BoxGeometry(0.11, 0.34, 0.62),
      rearWing: new THREE.BoxGeometry(1.88, 0.12, 0.48),
      rearWingUpper: new THREE.BoxGeometry(1.84, 0.22, 0.14),
      rearPillar: new THREE.BoxGeometry(0.11, 0.66, 0.54),
      cockpitRim: new THREE.BoxGeometry(0.92, 0.18, 1.05),
      wheelTire: new THREE.CylinderGeometry(0.45, 0.45, 0.42, 16),
      wheelRim: new THREE.CylinderGeometry(0.27, 0.27, 0.44, 14),
      wheelHub: new THREE.CylinderGeometry(0.12, 0.12, 0.46, 10),
      exhaust: new THREE.CylinderGeometry(0.11, 0.14, 0.34, 10),
      flame: new THREE.ConeGeometry(0.24, 1.25, 10),
      flameInner: new THREE.ConeGeometry(0.13, 0.85, 8),
      head: new THREE.SphereGeometry(0.54, 18, 16),
      eyeWhite: new THREE.SphereGeometry(0.115, 10, 10),
      eyePupil: new THREE.SphereGeometry(0.068, 10, 10),
      eyeShine: new THREE.SphereGeometry(0.028, 6, 6),
      brow: new THREE.BoxGeometry(0.21, 0.055, 0.06),
      noseFace: new THREE.SphereGeometry(0.075, 8, 8),
      mouth: new THREE.BoxGeometry(0.22, 0.055, 0.05),
      helmetShell: new THREE.SphereGeometry(0.61, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.72),
      helmetStripe: new THREE.BoxGeometry(0.24, 0.28, 1.15),
      visorBand: new THREE.TorusGeometry(0.56, 0.085, 8, 18, Math.PI * 0.72),
      earPod: new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10),
      neck: new THREE.CylinderGeometry(0.16, 0.2, 0.22, 10),
      torso: new THREE.BoxGeometry(0.7, 0.62, 0.44),
      arm: new THREE.BoxGeometry(0.2, 0.48, 0.22),
      steeringWheel: new THREE.TorusGeometry(0.19, 0.045, 8, 12),
      auraRing: new THREE.TorusGeometry(2.15, 0.1, 8, 28)
    };
    GEO.wheelTire.rotateZ(Math.PI / 2);
    GEO.wheelRim.rotateZ(Math.PI / 2);
    GEO.wheelHub.rotateZ(Math.PI / 2);
    GEO.exhaust.rotateX(Math.PI / 2);
    GEO.flame.rotateX(-Math.PI / 2);
    GEO.flameInner.rotateX(-Math.PI / 2);
    GEO.earPod.rotateZ(Math.PI / 2);
    return GEO;
  }

  function buildBobbleheadHead(driver, detailed = true) {
    const g = ensureGeo();
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;
    const look = driver.look;
    const headGroup = new THREE.Group();

    const skinMat = getToonMaterial(look.skin);
    const headMesh = new THREE.Mesh(g.head, skinMat);
    headMesh.scale.set(1.03, 1.0, 0.96);
    headMesh.castShadow = detailed;
    if (detailed) addCartoonOutline(headMesh, 1.07);
    headGroup.add(headMesh);

    const whiteMat = getToonMaterial('#FFFFFF');
    const pupilMat = getToonMaterial('#111827');
    const browMat = getToonMaterial(look.hairColor);

    [-0.19, 0.19].forEach((xPos, idx) => {
      const eyeW = new THREE.Mesh(g.eyeWhite, whiteMat);
      eyeW.position.set(xPos, 0.06, 0.45);
      eyeW.scale.set(1, 1.15, 0.55);
      headGroup.add(eyeW);

      const pupil = new THREE.Mesh(g.eyePupil, pupilMat);
      pupil.position.set(xPos, 0.055, 0.50);
      pupil.scale.set(1, 1.1, 0.6);
      headGroup.add(pupil);

      const shine = new THREE.Mesh(g.eyeShine, whiteMat);
      shine.position.set(xPos + 0.03, 0.095, 0.53);
      headGroup.add(shine);

      const brow = new THREE.Mesh(g.brow, browMat);
      brow.position.set(xPos, 0.21, 0.48);
      if (look.browStyle === 'fierce') {
        brow.rotation.z = idx === 0 ? -0.26 : 0.26;
      } else if (look.browStyle === 'playful') {
        brow.rotation.z = idx === 0 ? 0.18 : -0.08;
        if (idx === 0) brow.position.y += 0.025;
      } else if (look.browStyle === 'happy') {
        brow.rotation.z = idx === 0 ? 0.14 : -0.14;
      } else {
        brow.rotation.z = idx === 0 ? -0.09 : 0.09;
      }
      headGroup.add(brow);
    });

    const nose = new THREE.Mesh(g.noseFace, skinMat);
    nose.position.set(0, -0.04, 0.51);
    nose.scale.set(1.05, 0.85, 0.95);
    headGroup.add(nose);

    const mouth = new THREE.Mesh(g.mouth, getToonMaterial('#5A1E1E'));
    mouth.position.set(0, -0.19, 0.48);
    headGroup.add(mouth);

    const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.055), whiteMat);
    teeth.position.set(0, -0.178, 0.488);
    headGroup.add(teeth);

    const hairMat = getToonMaterial(look.hairColor);
    if (look.beard === 'beard') {
      const beardGeo = new THREE.SphereGeometry(0.555, 14, 10, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.54, Math.PI * 0.44);
      beardGeo.rotateY(Math.PI / 2);
      const beard = new THREE.Mesh(beardGeo, hairMat);
      beard.position.set(0, -0.03, 0.02);
      headGroup.add(beard);
    } else if (look.beard === 'stubble') {
      const stubbleMat = getToonMaterial(look.hairColor, { transparent: true, opacity: 0.45 });
      const stubGeo = new THREE.SphereGeometry(0.55, 12, 8, -Math.PI * 0.28, Math.PI * 0.56, Math.PI * 0.57, Math.PI * 0.35);
      stubGeo.rotateY(Math.PI / 2);
      const stub = new THREE.Mesh(stubGeo, stubbleMat);
      stub.position.set(0, -0.03, 0.02);
      headGroup.add(stub);
    } else if (look.beard === 'mustache') {
      const stacheL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.09), hairMat);
      stacheL.position.set(-0.11, -0.13, 0.51);
      stacheL.rotation.z = 0.22;
      const stacheR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.09), hairMat);
      stacheR.position.set(0.11, -0.13, 0.51);
      stacheR.rotation.z = -0.22;
      headGroup.add(stacheL, stacheR);
    }

    const hairGroup = new THREE.Group();
    if (look.hairStyle === 'curly') {
      const puffGeo = new THREE.SphereGeometry(0.15, 8, 8);
      [[-0.28, 0.34, 0.36], [-0.10, 0.39, 0.40], [0.10, 0.38, 0.41], [0.28, 0.33, 0.35], [0.0, 0.42, 0.32]].forEach(([x, y, z]) => {
        const p = new THREE.Mesh(puffGeo, hairMat);
        p.position.set(x, y, z);
        hairGroup.add(p);
      });
    } else if (look.hairStyle === 'braids') {
      const braidGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.42, 7);
      for (let i = -2; i <= 2; i++) {
        const b = new THREE.Mesh(braidGeo, hairMat);
        b.position.set(i * 0.16, -0.14, -0.45 - Math.abs(i) * 0.03);
        b.rotation.x = 0.25;
        hairGroup.add(b);
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.18), hairMat);
      front.position.set(0, 0.34, 0.38);
      hairGroup.add(front);
    } else if (look.hairStyle === 'mullet') {
      const mullet = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.44, 0.24), hairMat);
      mullet.position.set(0, -0.2, -0.52);
      mullet.rotation.x = 0.22;
      const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.12, 0.2), hairMat);
      bangs.position.set(0, 0.34, 0.38);
      hairGroup.add(mullet, bangs);
    } else if (look.hairStyle === 'swept') {
      const quiff = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.28), hairMat);
      quiff.position.set(0.04, 0.36, 0.37);
      quiff.rotation.z = -0.16;
      hairGroup.add(quiff);
    } else if (look.hairStyle === 'wavy') {
      const wave1 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), hairMat);
      wave1.scale.set(1.6, 0.7, 1.0);
      wave1.position.set(-0.08, 0.36, 0.37);
      const wave2 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), hairMat);
      wave2.scale.set(1.4, 0.7, 0.9);
      wave2.position.set(0.18, 0.33, 0.36);
      hairGroup.add(wave1, wave2);
    } else {
      const spikeGeo = new THREE.ConeGeometry(0.11, 0.24, 6);
      [-0.18, 0, 0.18].forEach((x, idx) => {
        const sp = new THREE.Mesh(spikeGeo, hairMat);
        sp.position.set(x, 0.40, 0.39);
        sp.rotation.x = 0.55;
        sp.rotation.z = (idx - 1) * -0.25;
        hairGroup.add(sp);
      });
    }
    headGroup.add(hairGroup);

    const helmetMainMat = getPlasticGlossMaterial(look.helmetMain, { shininess: 140 });
    const helmetStripeMat = getPlasticGlossMaterial(look.helmetStripe, { shininess: 140 });
    const helmetAccentMat = getPlasticGlossMaterial(look.helmetAccent, { shininess: 140 });
    const visorMat = getPlasticGlossMaterial(look.visor, { shininess: 180, specular: '#FFFFFF' });

    const helmetTop = new THREE.Mesh(g.helmetShell, helmetMainMat);
    helmetTop.position.set(0, 0.05, -0.05);
    helmetTop.rotation.x = -0.44;
    helmetTop.castShadow = detailed;
    if (detailed) addCartoonOutline(helmetTop, 1.06);
    headGroup.add(helmetTop);

    const stripe = new THREE.Mesh(g.helmetStripe, helmetStripeMat);
    stripe.position.set(0, 0.49, -0.1);
    stripe.rotation.x = -0.35;
    headGroup.add(stripe);

    const visor = new THREE.Mesh(g.visorBand, visorMat);
    visor.position.set(0, 0.25, 0.14);
    visor.rotation.x = Math.PI / 2 - 0.52;
    visor.rotation.z = Math.PI * 0.14;
    headGroup.add(visor);

    [-0.58, 0.58].forEach(xPos => {
      const pod = new THREE.Mesh(g.earPod, helmetAccentMat);
      pod.position.set(xPos, -0.02, -0.02);
      if (detailed) addCartoonOutline(pod, 1.12);
      headGroup.add(pod);
    });

    return headGroup;
  }

  function buildF1Car(driver, team, options = {}) {
    const g = ensureGeo();
    const {
      getToonMaterial,
      getPlasticGlossMaterial,
      addCartoonOutline,
      createLegoStudRow,
      createNumberPlateTexture
    } = global.ToonMat;

    const detailed = options.detailed ?? true;
    const root = new THREE.Group();
    const bodyTiltGroup = new THREE.Group();
    root.add(bodyTiltGroup);

    const primaryMat = getPlasticGlossMaterial(team.primary, { shininess: 120 });
    const secondaryMat = getPlasticGlossMaterial(team.secondary, { shininess: 120 });
    const accentMat = getPlasticGlossMaterial(team.accent, { shininess: 120 });
    const darkMat = getToonMaterial('#1A1E26');
    const suitMat = getToonMaterial(team.suit);

    const chassis = new THREE.Mesh(g.chassis, primaryMat);
    chassis.position.set(0, 0.52, -0.08);
    chassis.castShadow = detailed;
    chassis.receiveShadow = true;
    if (detailed) addCartoonOutline(chassis, [1.05, 1.14, 1.03]);
    bodyTiltGroup.add(chassis);

    const nose = new THREE.Mesh(g.nose, primaryMat);
    nose.position.set(0, 0.48, 1.85);
    nose.rotation.x = 0.08;
    nose.castShadow = detailed;
    if (detailed) addCartoonOutline(nose, [1.09, 1.18, 1.05]);
    bodyTiltGroup.add(nose);

    const noseTip = new THREE.Mesh(g.noseTip, secondaryMat);
    noseTip.position.set(0, 0.41, 2.55);
    if (detailed) addCartoonOutline(noseTip, [1.1, 1.2, 1.1]);
    bodyTiltGroup.add(noseTip);

    const isLightSec = ['#FFFFFF', '#FFF200', '#F5C518', '#CEDC00'].includes(team.secondary);
    const numTex = createNumberPlateTexture(driver.number, team.secondary, isLightSec ? '#111827' : '#FFFFFF');
    const numPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.46),
      new THREE.MeshBasicMaterial({ map: numTex })
    );
    numPlate.rotation.x = -Math.PI / 2 + 0.08;
    numPlate.position.set(0, 0.66, 1.75);
    bodyTiltGroup.add(numPlate);

    [-0.82, 0.82].forEach(xPos => {
      const pod = new THREE.Mesh(g.sidepod, primaryMat);
      pod.position.set(xPos, 0.54, -0.18);
      pod.castShadow = detailed;
      if (detailed) addCartoonOutline(pod, [1.12, 1.15, 1.04]);
      bodyTiltGroup.add(pod);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.55), secondaryMat);
      stripe.position.set(xPos, 0.62, -0.18);
      bodyTiltGroup.add(stripe);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), darkMat);
      intake.position.set(xPos, 0.54, 0.72);
      bodyTiltGroup.add(intake);
    });

    const engineCover = new THREE.Mesh(g.engineCover, primaryMat);
    engineCover.position.set(0, 0.90, -0.82);
    engineCover.castShadow = detailed;
    if (detailed) addCartoonOutline(engineCover, [1.09, 1.1, 1.05]);
    bodyTiltGroup.add(engineCover);

    const airbox = new THREE.Mesh(g.airbox, accentMat);
    airbox.position.set(0, 1.24, -0.58);
    if (detailed) addCartoonOutline(airbox, [1.11, 1.14, 1.1]);
    bodyTiltGroup.add(airbox);

    if (detailed) {
      const studRow1 = createLegoStudRow(2, team.primary, 0.30);
      studRow1.position.set(0, 1.16, -0.98);
      const studRow2 = createLegoStudRow(2, team.primary, 0.30);
      studRow2.position.set(0, 1.16, -1.28);
      bodyTiltGroup.add(studRow1, studRow2);
    }

    const frontWing = new THREE.Mesh(g.frontWing, secondaryMat);
    frontWing.position.set(0, 0.25, 2.52);
    frontWing.castShadow = detailed;
    if (detailed) addCartoonOutline(frontWing, [1.03, 1.38, 1.12]);
    bodyTiltGroup.add(frontWing);

    const frontFlap = new THREE.Mesh(g.frontWingFlap, accentMat);
    frontFlap.position.set(0, 0.33, 2.38);
    frontFlap.rotation.x = 0.22;
    bodyTiltGroup.add(frontFlap);

    [-1.06, 1.06].forEach(xPos => {
      const ep = new THREE.Mesh(g.endplateF, primaryMat);
      ep.position.set(xPos, 0.36, 2.5);
      if (detailed) addCartoonOutline(ep, [1.28, 1.14, 1.1]);
      bodyTiltGroup.add(ep);
    });

    const rearWing = new THREE.Mesh(g.rearWing, secondaryMat);
    rearWing.position.set(0, 1.26, -1.86);
    rearWing.castShadow = detailed;
    if (detailed) addCartoonOutline(rearWing, [1.04, 1.35, 1.14]);
    bodyTiltGroup.add(rearWing);

    const rearWingUpper = new THREE.Mesh(g.rearWingUpper, accentMat);
    rearWingUpper.position.set(0, 1.39, -1.96);
    rearWingUpper.rotation.x = 0.24;
    bodyTiltGroup.add(rearWingUpper);

    [-0.92, 0.92].forEach(xPos => {
      const pillar = new THREE.Mesh(g.rearPillar, primaryMat);
      pillar.position.set(xPos, 1.05, -1.86);
      if (detailed) addCartoonOutline(pillar, [1.3, 1.07, 1.12]);
      bodyTiltGroup.add(pillar);
    });

    const cockpit = new THREE.Mesh(g.cockpitRim, darkMat);
    cockpit.position.set(0, 0.74, 0.16);
    bodyTiltGroup.add(cockpit);

    const wheel = new THREE.Mesh(g.steeringWheel, accentMat);
    wheel.position.set(0, 0.92, 0.56);
    wheel.rotation.x = -0.35;
    bodyTiltGroup.add(wheel);

    const exhaustL = new THREE.Mesh(g.exhaust, darkMat);
    exhaustL.position.set(-0.24, 0.55, -1.82);
    const exhaustR = new THREE.Mesh(g.exhaust, darkMat);
    exhaustR.position.set(0.24, 0.55, -1.82);
    bodyTiltGroup.add(exhaustL, exhaustR);

    const turboFlameGroup = new THREE.Group();
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: '#FF6B00', transparent: true, opacity: 0.92 });
    const flameInnerMat = new THREE.MeshBasicMaterial({ color: '#FFF066' });
    [-0.24, 0.24].forEach(xPos => {
      const fOut = new THREE.Mesh(g.flame, flameOuterMat);
      fOut.position.set(xPos, 0.55, -2.55);
      const fIn = new THREE.Mesh(g.flameInner, flameInnerMat);
      fIn.position.set(xPos, 0.55, -2.35);
      turboFlameGroup.add(fOut, fIn);
    });
    turboFlameGroup.visible = false;
    bodyTiltGroup.add(turboFlameGroup);

    const moralAura = new THREE.Mesh(
      g.auraRing,
      new THREE.MeshBasicMaterial({ color: '#FFD43B', transparent: true, opacity: 0.75 })
    );
    moralAura.rotation.x = Math.PI / 2;
    moralAura.position.y = 0.28;
    moralAura.visible = false;
    root.add(moralAura);

    const driverGroup = new THREE.Group();
    driverGroup.position.set(0, 0.85, 0.08);
    bodyTiltGroup.add(driverGroup);

    const torso = new THREE.Mesh(g.torso, suitMat);
    torso.position.set(0, 0.05, 0);
    if (detailed) addCartoonOutline(torso, [1.1, 1.1, 1.12]);
    driverGroup.add(torso);

    [-0.38, 0.38].forEach(xPos => {
      const arm = new THREE.Mesh(g.arm, suitMat);
      arm.position.set(xPos, 0.08, 0.24);
      arm.rotation.x = 1.1;
      arm.rotation.z = xPos > 0 ? 0.22 : -0.22;
      driverGroup.add(arm);
    });

    const neck = new THREE.Mesh(g.neck, getToonMaterial(driver.look.skin));
    neck.position.set(0, 0.36, 0);
    driverGroup.add(neck);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.92, 0.02);
    const headMeshGroup = buildBobbleheadHead(driver, detailed);
    headMeshGroup.scale.setScalar(1.16);
    headPivot.add(headMeshGroup);
    driverGroup.add(headPivot);

    const tireMat = getToonMaterial('#191D24');
    const rimMat = getPlasticGlossMaterial(team.wheelRim, { shininess: 140 });
    const hubMat = getToonMaterial('#FFFFFF');

    const wheels = [];
    const frontSteerPivots = [];
    [
      { x: -1.16, y: 0.45, z: 1.48, front: true },
      { x: 1.16, y: 0.45, z: 1.48, front: true },
      { x: -1.20, y: 0.48, z: -1.28, front: false },
      { x: 1.20, y: 0.48, z: -1.28, front: false }
    ].forEach(wp => {
      const pivot = new THREE.Group();
      pivot.position.set(wp.x, wp.y, wp.z);
      root.add(pivot);

      const spinGroup = new THREE.Group();
      pivot.add(spinGroup);

      const tire = new THREE.Mesh(g.wheelTire, tireMat);
      if (!wp.front) tire.scale.set(1.18, 1.07, 1.07);
      tire.castShadow = detailed;
      if (detailed) addCartoonOutline(tire, [1.14, 1.08, 1.08]);
      spinGroup.add(tire);

      const rim = new THREE.Mesh(g.wheelRim, rimMat);
      if (!wp.front) rim.scale.set(1.18, 1.07, 1.07);
      spinGroup.add(rim);

      const hub = new THREE.Mesh(g.wheelHub, hubMat);
      if (!wp.front) hub.scale.set(1.18, 1.07, 1.07);
      spinGroup.add(hub);

      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.08, 0.44), darkMat);
      spinGroup.add(spoke);

      wheels.push(spinGroup);
      if (wp.front) frontSteerPivots.push(pivot);
    });

    return { root, bodyTiltGroup, headPivot, wheels, frontSteerPivots, turboFlameGroup, moralAura };
  }

  function buildStandingDriver(driver, team) {
    const { getToonMaterial, addCartoonOutline } = global.ToonMat;
    const root = new THREE.Group();
    const suitMat = getToonMaterial(team.suit);
    const accentMat = getToonMaterial(team.secondary);
    const bootMat = getToonMaterial('#111827');

    const legGeo = new THREE.BoxGeometry(0.28, 0.56, 0.28);
    [-0.18, 0.18].forEach(xPos => {
      const leg = new THREE.Mesh(legGeo, suitMat);
      leg.position.set(xPos, 0.34, 0);
      addCartoonOutline(leg, 1.1);
      root.add(leg);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.16, 0.38), bootMat);
      boot.position.set(xPos, 0.08, 0.05);
      root.add(boot);
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.72, 0.46), suitMat);
    torso.position.set(0, 0.96, 0);
    addCartoonOutline(torso, 1.08);
    root.add(torso);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 0.48), accentMat);
    belt.position.set(0, 0.68, 0);
    root.add(belt);

    const armGeo = new THREE.BoxGeometry(0.22, 0.58, 0.22);
    const leftArm = new THREE.Mesh(armGeo, suitMat);
    leftArm.position.set(-0.54, 1.24, 0);
    leftArm.rotation.z = 2.45;
    addCartoonOutline(leftArm, 1.1);
    root.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, suitMat);
    rightArm.position.set(0.54, 1.24, 0);
    rightArm.rotation.z = -2.45;
    addCartoonOutline(rightArm, 1.1);
    root.add(rightArm);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.92, 0);
    const head = buildBobbleheadHead(driver, true);
    head.scale.setScalar(1.26);
    headPivot.add(head);
    root.add(headPivot);

    return { root, headPivot, leftArm, rightArm };
  }

  global.CarBuilder = { buildBobbleheadHead, buildF1Car, buildStandingDriver };
})(window);
