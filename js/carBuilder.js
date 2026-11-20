// ============================================================================
// CARBUILDER.JS — Parche v1.1: Monoplaza F1 con Halo + Volante Telemetría,
//                 Pilotos Anatómicos Estilizados (Sin Casco en Menú/Podio),
//                 Sistema HANS, Brazos Articulados IK en Volante y Casco PBR
// ============================================================================
(function (global) {
  'use strict';

  let GEO = null;

  function ensureGeo() {
    if (GEO) return GEO;
    GEO = {
      // Car body
      chassis: new THREE.BoxGeometry(1.42, 0.44, 3.28),
      nose: new THREE.BoxGeometry(0.74, 0.30, 1.38),
      noseTip: new THREE.BoxGeometry(0.56, 0.20, 0.56),
      sidepod: new THREE.BoxGeometry(0.44, 0.36, 1.78),
      engineCover: new THREE.BoxGeometry(0.66, 0.46, 1.36),
      airbox: new THREE.BoxGeometry(0.50, 0.34, 0.64),
      frontWing: new THREE.BoxGeometry(2.14, 0.11, 0.56),
      frontWingFlap: new THREE.BoxGeometry(1.98, 0.08, 0.24),
      endplateF: new THREE.BoxGeometry(0.11, 0.34, 0.62),
      rearWing: new THREE.BoxGeometry(1.88, 0.12, 0.48),
      rearWingUpper: new THREE.BoxGeometry(1.84, 0.22, 0.14),
      rearPillar: new THREE.BoxGeometry(0.11, 0.68, 0.54),
      cockpitRim: new THREE.BoxGeometry(0.94, 0.18, 1.12),
      cockpitTub: new THREE.BoxGeometry(0.76, 0.26, 0.94),
      wheelTire: new THREE.CylinderGeometry(0.45, 0.45, 0.42, 18),
      wheelRim: new THREE.CylinderGeometry(0.28, 0.28, 0.44, 16),
      wheelHub: new THREE.CylinderGeometry(0.12, 0.12, 0.46, 10),
      exhaust: new THREE.CylinderGeometry(0.11, 0.14, 0.34, 10),
      flame: new THREE.ConeGeometry(0.24, 1.25, 10),
      flameInner: new THREE.ConeGeometry(0.13, 0.85, 8),
      auraRing: new THREE.TorusGeometry(2.15, 0.1, 8, 28),

      // Seamless sculpted unhelmeted head anatomy (LatheGeometry with defined jaw & chin)
      ear: new THREE.SphereGeometry(0.072, 10, 8),
      earInner: new THREE.SphereGeometry(0.042, 8, 6),
      noseBridge: new THREE.BoxGeometry(0.048, 0.115, 0.085),
      noseTipFace: new THREE.SphereGeometry(0.040, 10, 8),
      eyeWhite: new THREE.SphereGeometry(0.062, 10, 10),
      eyeIris: new THREE.SphereGeometry(0.039, 10, 10),
      eyePupil: new THREE.SphereGeometry(0.024, 8, 8),
      eyeShine: new THREE.SphereGeometry(0.013, 6, 6),
      eyelid: new THREE.BoxGeometry(0.105, 0.019, 0.028),
      brow: new THREE.BoxGeometry(0.132, 0.034, 0.044),
      mouth: new THREE.BoxGeometry(0.128, 0.028, 0.028),
      teeth: new THREE.BoxGeometry(0.098, 0.015, 0.030),
      scalpCap: new THREE.SphereGeometry(0.328, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),

      // Detailed F1 helmet
      helmetDome: new THREE.SphereGeometry(0.37, 20, 16),
      helmetJaw: new THREE.CylinderGeometry(0.325, 0.275, 0.22, 16),
      helmetChinLip: new THREE.BoxGeometry(0.32, 0.048, 0.13),
      helmetVisor: new THREE.CylinderGeometry(0.372, 0.362, 0.175, 22, 1, true, -Math.PI * 0.36, Math.PI * 0.72),
      helmetZylon: new THREE.CylinderGeometry(0.376, 0.374, 0.048, 22, 1, true, -Math.PI * 0.36, Math.PI * 0.72),
      helmetVent: new THREE.BoxGeometry(0.072, 0.052, 0.19),
      helmetSpoilerMain: new THREE.BoxGeometry(0.42, 0.038, 0.13),
      helmetSpoilerFin: new THREE.BoxGeometry(0.032, 0.09, 0.14),
      visorScrew: new THREE.CylinderGeometry(0.034, 0.034, 0.035, 10),

      // Standing & seated anatomical body parts
      neckCyl: new THREE.CylinderGeometry(0.102, 0.122, 0.19, 12),
      collarCyl: new THREE.CylinderGeometry(0.155, 0.178, 0.11, 14),
      chestUpper: new THREE.CylinderGeometry(0.31, 0.24, 0.38, 14),
      abdomen: new THREE.CylinderGeometry(0.245, 0.215, 0.24, 14),
      pelvis: new THREE.CylinderGeometry(0.225, 0.20, 0.17, 12),
      shoulderCap: new THREE.SphereGeometry(0.125, 12, 10),
      armSeg: new THREE.CylinderGeometry(0.088, 0.074, 0.28, 10),
      forearmSeg: new THREE.CylinderGeometry(0.074, 0.062, 0.26, 10),
      elbowBall: new THREE.SphereGeometry(0.072, 10, 8),
      handFist: new THREE.SphereGeometry(0.074, 10, 8),
      thighSeg: new THREE.CylinderGeometry(0.138, 0.108, 0.42, 12),
      kneeBall: new THREE.SphereGeometry(0.102, 10, 8),
      calfSeg: new THREE.CylinderGeometry(0.105, 0.082, 0.41, 12),
      bootUpper: new THREE.BoxGeometry(0.19, 0.14, 0.31),
      bootSole: new THREE.BoxGeometry(0.205, 0.048, 0.33),

      // In-car articulated limb cylinders (unit height along +Y for fast IK scaling)
      ikLimb: new THREE.CylinderGeometry(0.076, 0.064, 1.0, 10),
      ikGlove: new THREE.BoxGeometry(0.10, 0.115, 0.12)
    };

    // Single seamless heroic head profile (chin -> defined jaw -> cheekbones -> temples -> cranium)
    const headProfile = [
      new THREE.Vector2(0.001, -0.305),
      new THREE.Vector2(0.088, -0.292),
      new THREE.Vector2(0.165, -0.238),
      new THREE.Vector2(0.238, -0.145),
      new THREE.Vector2(0.282, -0.035),
      new THREE.Vector2(0.298,  0.075),
      new THREE.Vector2(0.288,  0.185),
      new THREE.Vector2(0.230,  0.278),
      new THREE.Vector2(0.128,  0.328),
      new THREE.Vector2(0.001,  0.342)
    ];
    GEO.sculptedHead = new THREE.LatheGeometry(headProfile, 24);
    GEO.sculptedHead.computeVertexNormals();

    // Flush lower-jaw beard/stubble shell wrapping ONLY front chin & jawline (never touches eyes!)
    const beardProfile = [
      new THREE.Vector2(0.001, -0.312),
      new THREE.Vector2(0.095, -0.298),
      new THREE.Vector2(0.175, -0.242),
      new THREE.Vector2(0.246, -0.152),
      new THREE.Vector2(0.282, -0.092)
    ];
    GEO.beardShell = new THREE.LatheGeometry(beardProfile, 18, -Math.PI * 0.48, Math.PI * 0.96);
    GEO.beardShell.computeVertexNormals();

    GEO.wheelTire.rotateZ(Math.PI / 2);
    GEO.wheelRim.rotateZ(Math.PI / 2);
    GEO.wheelHub.rotateZ(Math.PI / 2);
    GEO.exhaust.rotateX(Math.PI / 2);
    GEO.flame.rotateX(-Math.PI / 2);
    GEO.flameInner.rotateX(-Math.PI / 2);
    GEO.visorScrew.rotateZ(Math.PI / 2);

    // Build curved Halo tubes once and reuse for crisp FPS
    const haloLeftCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 1.18, 0.56),
      new THREE.Vector3(0.26, 1.19, 0.46),
      new THREE.Vector3(0.45, 1.16, 0.16),
      new THREE.Vector3(0.45, 1.02, -0.32)
    ]);
    const haloRightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, 1.18, 0.56),
      new THREE.Vector3(-0.26, 1.19, 0.46),
      new THREE.Vector3(-0.45, 1.16, 0.16),
      new THREE.Vector3(-0.45, 1.02, -0.32)
    ]);
    GEO.haloLeft = new THREE.TubeGeometry(haloLeftCurve, 16, 0.048, 8, false);
    GEO.haloRight = new THREE.TubeGeometry(haloRightCurve, 16, 0.048, 8, false);

    // HANS horseshoe yoke curve
    const hansCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.20, 0.89, 0.20),
      new THREE.Vector3(0.22, 0.99, 0.04),
      new THREE.Vector3(0.14, 1.06, -0.14),
      new THREE.Vector3(0.0, 1.08, -0.18),
      new THREE.Vector3(-0.14, 1.06, -0.14),
      new THREE.Vector3(-0.22, 0.99, 0.04),
      new THREE.Vector3(-0.20, 0.89, 0.20)
    ]);
    GEO.hansYoke = new THREE.TubeGeometry(hansCurve, 18, 0.044, 8, false);

    return GEO;
  }

  // ==========================================================================
  // 1. SCULPTED UNHELMETED HEAD (Menú, Showcase, Editor, Podio)
  // ==========================================================================
  function buildSculptedHead(driver, detailed = true) {
    const g = ensureGeo();
    const { getToonMaterial, addCartoonOutline, mixHexColors } = global.ToonMat;
    const look = driver.look;
    const headGroup = new THREE.Group();

    const skinMat = getToonMaterial(look.skin);
    const earShadeMat = getToonMaterial(mixHexColors(look.skin, '#7C3E26', 0.34));
    const noseShadeMat = getToonMaterial(mixHexColors(look.skin, '#9A5438', 0.14));
    const lipMat = getToonMaterial(mixHexColors(look.skin, '#8C2D2D', 0.52));
    const hairMat = getToonMaterial(look.hairColor);
    const whiteMat = getToonMaterial('#FFFFFF');
    const pupilMat = getToonMaterial('#0F172A');
    const irisColor = ['#B5894A', '#D4A857', '#A67C46', '#D9B36C'].includes(look.hairColor.toUpperCase())
      ? '#2563EB'
      : '#3B2314';
    const irisMat = getToonMaterial(irisColor);
    const lidMat = getToonMaterial(mixHexColors(look.skin, '#1E1B18', 0.62));

    // Seamless sculpted cranium + cheekbones + defined jawline + chin
    const headMesh = new THREE.Mesh(g.sculptedHead, skinMat);
    headMesh.scale.set(0.96, 1.0, 1.04);
    headMesh.castShadow = detailed;
    if (detailed) addCartoonOutline(headMesh, 1.055);
    headGroup.add(headMesh);

    // Sculpted Ears (left & right, cleanly tucked along temples)
    [-1, 1].forEach(side => {
      const earPivot = new THREE.Group();
      earPivot.position.set(side * 0.285, -0.005, -0.015);
      earPivot.rotation.y = side * -0.26;
      earPivot.rotation.z = side * -0.08;

      const earOuter = new THREE.Mesh(g.ear, skinMat);
      earOuter.scale.set(0.45, 1.18, 0.72);
      if (detailed) addCartoonOutline(earOuter, 1.12);
      earPivot.add(earOuter);

      const earInner = new THREE.Mesh(g.earInner, earShadeMat);
      earInner.position.set(side * 0.015, 0, 0.010);
      earInner.scale.set(0.34, 0.92, 0.58);
      earPivot.add(earInner);

      headGroup.add(earPivot);
    });

    // Sleek Sculpted Nose (bridge + subtle tip, no harsh inner outline ring)
    const noseBridge = new THREE.Mesh(g.noseBridge, noseShadeMat);
    noseBridge.position.set(0, -0.015, 0.282);
    noseBridge.rotation.x = -0.26;
    headGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(g.noseTipFace, noseShadeMat);
    noseTip.position.set(0, -0.068, 0.318);
    noseTip.scale.set(1.1, 0.78, 0.92);
    headGroup.add(noseTip);

    // Expressive Eyes & Eyebrows
    [-0.105, 0.105].forEach((xPos, idx) => {
      const eyeGrp = new THREE.Group();
      eyeGrp.position.set(xPos, 0.042, 0.268);
      eyeGrp.rotation.y = xPos > 0 ? 0.22 : -0.22;

      const sclera = new THREE.Mesh(g.eyeWhite, whiteMat);
      sclera.scale.set(1.06, 1.0, 0.44);
      eyeGrp.add(sclera);

      const iris = new THREE.Mesh(g.eyeIris, irisMat);
      iris.position.set(0, -0.002, 0.020);
      iris.scale.set(1.0, 1.02, 0.45);
      eyeGrp.add(iris);

      const pupil = new THREE.Mesh(g.eyePupil, pupilMat);
      pupil.position.set(0, -0.002, 0.033);
      pupil.scale.set(1.0, 1.0, 0.45);
      eyeGrp.add(pupil);

      const shine = new THREE.Mesh(g.eyeShine, whiteMat);
      shine.position.set(0.016, 0.019, 0.043);
      eyeGrp.add(shine);

      const lid = new THREE.Mesh(g.eyelid, lidMat);
      lid.position.set(0, 0.052, 0.018);
      eyeGrp.add(lid);

      headGroup.add(eyeGrp);

      // Expressive sculpted eyebrow
      const brow = new THREE.Mesh(g.brow, hairMat);
      brow.position.set(xPos, 0.132, 0.285);
      brow.rotation.y = xPos > 0 ? 0.2 : -0.2;
      if (look.browStyle === 'fierce') {
        brow.rotation.z = idx === 0 ? -0.28 : 0.28;
      } else if (look.browStyle === 'playful') {
        brow.rotation.z = idx === 0 ? 0.18 : -0.08;
        if (idx === 0) brow.position.y += 0.014;
      } else if (look.browStyle === 'happy') {
        brow.rotation.z = idx === 0 ? 0.14 : -0.14;
      } else {
        brow.rotation.z = idx === 0 ? -0.1 : 0.1;
      }
      headGroup.add(brow);
    });

    // Confident Mouth
    const mouth = new THREE.Mesh(g.mouth, lipMat);
    mouth.position.set(0, -0.155, 0.258);
    headGroup.add(mouth);

    const teeth = new THREE.Mesh(g.teeth, whiteMat);
    teeth.position.set(0, -0.150, 0.267);
    headGroup.add(teeth);

    // Flush Contoured Facial Hair / Beard Styles (strictly below eyes, hugging jawline smoothly)
    const beardType = look.beard || 'none';
    if (beardType === 'stubble') {
      const stubMat = getToonMaterial(mixHexColors(look.skin, look.hairColor, 0.38));
      const stub = new THREE.Mesh(g.beardShell, stubMat);
      stub.scale.set(0.985, 1.0, 1.065);
      headGroup.add(stub);
    } else if (beardType === 'beard') {
      const beard = new THREE.Mesh(g.beardShell, hairMat);
      beard.scale.set(1.015, 1.02, 1.095);
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.034, 0.048), hairMat);
      stache.position.set(0, -0.118, 0.268);
      headGroup.add(beard, stache);
    } else if (beardType === 'mustache') {
      const stacheL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.046, 0.056), hairMat);
      stacheL.position.set(-0.065, -0.118, 0.275);
      stacheL.rotation.z = 0.22;
      const stacheR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.046, 0.056), hairMat);
      stacheR.position.set(0.065, -0.118, 0.275);
      stacheR.rotation.z = -0.22;
      headGroup.add(stacheL, stacheR);
    } else if (beardType === 'goatee') {
      const goateeChin = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), hairMat);
      goateeChin.position.set(0, -0.235, 0.165);
      goateeChin.scale.set(1.05, 0.92, 0.9);
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.032, 0.048), hairMat);
      stache.position.set(0, -0.118, 0.268);
      headGroup.add(goateeChin, stache);
    }

    // Differentiated 360-degree Hairstyles snugly fitted to cranium
    const style = look.hairStyle || 'swept';
    if (style !== 'bald') {
      const hairGroup = new THREE.Group();

      // Base scalp cap hugging upper cranium & back of head with crisp clearance
      const cap = new THREE.Mesh(g.scalpCap, hairMat);
      cap.position.set(0, 0.055, -0.012);
      cap.rotation.x = -0.26;
      cap.scale.set(0.975, 1.02, 1.075);
      if (detailed) addCartoonOutline(cap, 1.045);
      hairGroup.add(cap);

      // Back hair nape taper
      const nape = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.20, 0.14), hairMat);
      nape.position.set(0, -0.04, -0.255);
      hairGroup.add(nape);

      // Clean sideburns
      [-0.27, 0.27].forEach(sx => {
        const sb = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.14, 0.095), hairMat);
        sb.position.set(sx, 0.035, 0.04);
        hairGroup.add(sb);
      });

      if (style === 'curly') {
        const curlGeo = new THREE.SphereGeometry(0.095, 8, 8);
        [
          [-0.18, 0.28, 0.19], [-0.06, 0.32, 0.22], [0.07, 0.32, 0.22], [0.18, 0.27, 0.18],
          [-0.14, 0.36, 0.06], [0.0, 0.38, 0.07], [0.14, 0.36, 0.05],
          [-0.19, 0.26, -0.09], [0.19, 0.26, -0.09]
        ].forEach(([cx, cy, cz]) => {
          const c = new THREE.Mesh(curlGeo, hairMat);
          c.position.set(cx, cy, cz);
          hairGroup.add(c);
        });
      } else if (style === 'swept') {
        const quiff = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.34), hairMat);
        quiff.position.set(0.03, 0.325, 0.10);
        quiff.rotation.z = -0.14;
        quiff.rotation.x = -0.10;
        if (detailed) addCartoonOutline(quiff, 1.06);
        const crest = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), hairMat);
        crest.scale.set(1.48, 0.60, 1.08);
        crest.position.set(0.05, 0.355, 0.15);
        hairGroup.add(quiff, crest);
      } else if (style === 'spiky') {
        const spikeGeo = new THREE.ConeGeometry(0.076, 0.20, 6);
        [
          [-0.13, 0.35, 0.18, 0.40, 0.22],
          [0.0, 0.39, 0.20, 0.45, 0.0],
          [0.13, 0.35, 0.18, 0.40, -0.22],
          [-0.09, 0.40, 0.03, 0.16, 0.18],
          [0.09, 0.40, 0.03, 0.16, -0.18],
          [0.0, 0.38, -0.10, -0.12, 0.0]
        ].forEach(([sx, sy, sz, rx, rz]) => {
          const sp = new THREE.Mesh(spikeGeo, hairMat);
          sp.position.set(sx, sy, sz);
          sp.rotation.set(rx, 0, rz);
          hairGroup.add(sp);
        });
      } else if (style === 'wavy') {
        const waveGeo = new THREE.SphereGeometry(0.125, 10, 8);
        [
          [-0.07, 0.34, 0.16, 1.50, 0.62, 1.12],
          [0.12, 0.32, 0.14, 1.32, 0.62, 1.08],
          [-0.22, 0.18, 0.0, 0.70, 1.15, 1.12],
          [0.22, 0.18, 0.0, 0.70, 1.15, 1.12],
          [0.0, 0.18, -0.24, 1.68, 0.95, 0.82]
        ].forEach(([wx, wy, wz, sx, sy, sz]) => {
          const w = new THREE.Mesh(waveGeo, hairMat);
          w.position.set(wx, wy, wz);
          w.scale.set(sx, sy, sz);
          hairGroup.add(w);
        });
      } else if (style === 'braids') {
        for (let r = -2; r <= 2; r++) {
          const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.40, 7), hairMat);
          ridge.rotation.x = Math.PI / 2 - 0.1;
          ridge.position.set(r * 0.082, 0.325 - Math.abs(r) * 0.022, 0.02);
          hairGroup.add(ridge);
        }
        const lockGeo = new THREE.CylinderGeometry(0.038, 0.030, 0.36, 7);
        for (let i = -3; i <= 3; i++) {
          const lock = new THREE.Mesh(lockGeo, hairMat);
          lock.position.set(i * 0.085, -0.10, -0.30 - (3 - Math.abs(i)) * 0.018);
          lock.rotation.x = 0.22;
          hairGroup.add(lock);
        }
      } else if (style === 'mullet') {
        const topCut = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.095, 0.28), hairMat);
        topCut.position.set(0, 0.33, 0.09);
        const backFlow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.16), hairMat);
        backFlow.position.set(0, -0.15, -0.31);
        backFlow.rotation.x = 0.26;
        if (detailed) addCartoonOutline(backFlow, 1.07);
        hairGroup.add(topCut, backFlow);
      } else if (style === 'buzz') {
        cap.scale.set(0.945, 0.98, 1.035);
      }

      headGroup.add(hairGroup);
    }

    return headGroup;
  }

  // ==========================================================================
  // 2. DETAILED F1 HELMET (En Carrera + Exhibición Showcase)
  //    Tomas de aire superiores, Alerón trasero, Visera Polarizada (M:0.9, R:0.1)
  // ==========================================================================
  function buildDetailedHelmet(driver, detailed = true) {
    const g = ensureGeo();
    const { getToonMaterial, getPlasticGlossMaterial, getVisorMaterial, addCartoonOutline } = global.ToonMat;
    const look = driver.look;
    const helmetGroup = new THREE.Group();

    const mainMat = getPlasticGlossMaterial(look.helmetMain, { shininess: 150 });
    const stripeMat = getPlasticGlossMaterial(look.helmetStripe, { shininess: 150 });
    const accentMat = getPlasticGlossMaterial(look.helmetAccent, { shininess: 150 });
    const darkCarbonMat = getToonMaterial('#141821');
    const visorMat = getVisorMaterial(look.visor); // metalness: 0.9, roughness: 0.1

    // Main aerodynamic shell dome
    const dome = new THREE.Mesh(g.helmetDome, mainMat);
    dome.position.set(0, 0.04, -0.02);
    dome.scale.set(0.96, 0.96, 1.08);
    dome.castShadow = detailed;
    if (detailed) addCartoonOutline(dome, 1.055);
    helmetGroup.add(dome);

    // Sculpted forward chin bar / jaw guard
    const jawGuard = new THREE.Mesh(g.helmetJaw, mainMat);
    jawGuard.position.set(0, -0.145, 0.045);
    jawGuard.scale.set(0.95, 1.0, 1.12);
    jawGuard.castShadow = detailed;
    if (detailed) addCartoonOutline(jawGuard, 1.06);
    helmetGroup.add(jawGuard);

    // Lower front aero chin spoiler lip + chin vent
    const chinLip = new THREE.Mesh(g.helmetChinLip, accentMat);
    chinLip.position.set(0, -0.235, 0.34);
    helmetGroup.add(chinLip);

    const chinVent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.045, 0.05), darkCarbonMat);
    chinVent.position.set(0, -0.155, 0.39);
    helmetGroup.add(chinVent);

    // Pilot livery: crown racing stripe
    const crownStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.62), stripeMat);
    crownStripe.position.set(0, 0.37, -0.02);
    crownStripe.rotation.x = -0.12;
    helmetGroup.add(crownStripe);

    // Pilot livery: side sweeping speed chevrons
    [-1, 1].forEach(side => {
      const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.44), accentMat);
      sideStripe.position.set(side * 0.345, -0.06, -0.02);
      sideStripe.rotation.x = -0.22;
      helmetGroup.add(sideStripe);

      const upperAccent = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.38), stripeMat);
      upperAccent.position.set(side * 0.335, 0.14, -0.04);
      upperAccent.rotation.x = -0.16;
      helmetGroup.add(upperAccent);
    });

    // Top Air Intakes (Tomas de aire superiores)
    [-0.115, 0.115].forEach(vx => {
      const scoop = new THREE.Mesh(g.helmetVent, accentMat);
      scoop.position.set(vx, 0.355, 0.08);
      scoop.rotation.x = 0.14;
      helmetGroup.add(scoop);

      const intakeHole = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.04), darkCarbonMat);
      intakeHole.position.set(vx, 0.352, 0.172);
      helmetGroup.add(intakeHole);
    });
    const rearExhaustVent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), darkCarbonMat);
    rearExhaustVent.position.set(0, 0.335, -0.21);
    rearExhaustVent.rotation.x = -0.35;
    helmetGroup.add(rearExhaustVent);

    // Rear Aero Spoiler (Alerón trasero del casco)
    const spoilerGrp = new THREE.Group();
    spoilerGrp.position.set(0, 0.165, -0.39);
    spoilerGrp.rotation.x = -0.22;

    const spoilerWing = new THREE.Mesh(g.helmetSpoilerMain, accentMat);
    if (detailed) addCartoonOutline(spoilerWing, [1.06, 1.35, 1.15]);
    spoilerGrp.add(spoilerWing);

    [-0.20, 0.20].forEach(fx => {
      const fin = new THREE.Mesh(g.helmetSpoilerFin, stripeMat);
      fin.position.set(fx, -0.015, 0.02);
      spoilerGrp.add(fin);
    });
    helmetGroup.add(spoilerGrp);

    // Polarized Reflective Visor (Visera polarizada reflectante: metalness 0.9, roughness 0.1)
    const visor = new THREE.Mesh(g.helmetVisor, visorMat);
    visor.position.set(0, 0.028, 0.048);
    visor.scale.set(0.97, 1.0, 1.06);
    helmetGroup.add(visor);

    // Zylon top protective brow strip above visor
    const zylon = new THREE.Mesh(g.helmetZylon, stripeMat);
    zylon.position.set(0, 0.125, 0.048);
    zylon.scale.set(0.98, 1.0, 1.07);
    helmetGroup.add(zylon);

    // Visor pivot screws on helmet temples
    [-0.355, 0.355].forEach(sx => {
      const screw = new THREE.Mesh(g.visorScrew, darkCarbonMat);
      screw.position.set(sx, 0.025, 0.06);
      helmetGroup.add(screw);
    });

    return helmetGroup;
  }

  // ==========================================================================
  // 3. STANDING HEROIC DRIVER (Sin Casco — Menú, Showcase, Editor, Podio)
  // ==========================================================================
  function buildStandingDriver(driver, team, options = {}) {
    const g = ensureGeo();
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline, createDorsalTexture, createNumberPlateTexture } = global.ToonMat;
    const pose = options.pose || 'hero'; // 'hero' or 'podium'

    const root = new THREE.Group();
    const suitBaseColor = team.suit || team.primary;
    const suitMat = getToonMaterial(suitBaseColor);
    const secMat = getToonMaterial(team.secondary);
    const accMat = getToonMaterial(team.accent);
    const skinMat = getToonMaterial(driver.look.skin);
    const bootMat = getToonMaterial('#141821');
    const gloveMat = getToonMaterial(team.secondary);
    const metalMat = getPlasticGlossMaterial('#E2E8F0', { shininess: 160 });

    // --- LEGS & RACING BOOTS ---
    [-0.145, 0.145].forEach((xPos, idx) => {
      const legGrp = new THREE.Group();
      const stanceX = pose === 'hero' ? (idx === 0 ? -0.155 : 0.155) : xPos;
      legGrp.position.set(stanceX, 0, 0);
      if (pose === 'hero') legGrp.rotation.y = idx === 0 ? -0.12 : 0.12;

      // Boot sole + motorsport high-top shoe
      const sole = new THREE.Mesh(g.bootSole, secMat);
      sole.position.set(0, 0.024, 0.05);
      legGrp.add(sole);

      const boot = new THREE.Mesh(g.bootUpper, bootMat);
      boot.position.set(0, 0.115, 0.04);
      boot.castShadow = true;
      addCartoonOutline(boot, 1.09);
      legGrp.add(boot);

      const ankleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.04, 0.21), accMat);
      ankleStrap.position.set(0, 0.165, 0.01);
      legGrp.add(ankleStrap);

      // Calf
      const calf = new THREE.Mesh(g.calfSeg, suitMat);
      calf.position.set(0, 0.37, 0);
      calf.castShadow = true;
      addCartoonOutline(calf, 1.08);
      legGrp.add(calf);

      // Knee joint
      const knee = new THREE.Mesh(g.kneeBall, secMat);
      knee.position.set(0, 0.56, 0.02);
      knee.scale.set(0.95, 0.85, 0.92);
      legGrp.add(knee);

      // Thigh
      const thigh = new THREE.Mesh(g.thighSeg, suitMat);
      thigh.position.set(0, 0.76, 0);
      thigh.castShadow = true;
      addCartoonOutline(thigh, 1.07);
      legGrp.add(thigh);

      // Side racing stripe along thigh
      const legStripe = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.36, 0.08), secMat);
      legStripe.position.set(idx === 0 ? -0.125 : 0.125, 0.76, 0);
      legGrp.add(legStripe);

      root.add(legGrp);
    });

    // --- PELVIS & ARTICULATED TORSO (MONO IGNÍFUGO) ---
    const torsoGroup = new THREE.Group();
    root.add(torsoGroup);

    const pelvis = new THREE.Mesh(g.pelvis, suitMat);
    pelvis.position.set(0, 0.98, 0);
    pelvis.scale.set(1.16, 1.0, 0.78);
    addCartoonOutline(pelvis, 1.06);
    torsoGroup.add(pelvis);

    const abdomen = new THREE.Mesh(g.abdomen, suitMat);
    abdomen.position.set(0, 1.15, 0);
    abdomen.scale.set(1.14, 1.0, 0.74);
    abdomen.castShadow = true;
    addCartoonOutline(abdomen, 1.06);
    torsoGroup.add(abdomen);

    // Waist racing belt + metallic FIA buckle
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.235, 0.085, 14), secMat);
    belt.position.set(0, 1.06, 0);
    belt.scale.set(1.17, 1.0, 0.78);
    torsoGroup.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.072, 0.045), metalMat);
    buckle.position.set(0, 1.06, 0.185);
    torsoGroup.add(buckle);

    // Broad athletic upper chest
    const chest = new THREE.Mesh(g.chestUpper, suitMat);
    chest.position.set(0, 1.41, 0);
    chest.scale.set(1.18, 1.0, 0.74);
    chest.castShadow = true;
    addCartoonOutline(chest, 1.06);
    torsoGroup.add(chest);

    // Racing suit vertical chest stripes + V-chevron
    [-0.14, 0.14].forEach(sx => {
      const cStripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.04), secMat);
      cStripe.position.set(sx, 1.34, 0.195);
      torsoGroup.add(cStripe);
    });
    const centerZip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.46, 0.03), accMat);
    centerZip.position.set(0, 1.35, 0.205);
    torsoGroup.add(centerZip);

    // Front chest number patch
    const chestNumTex = createNumberPlateTexture(driver.number, team.secondary);
    const chestBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.15),
      new THREE.MeshBasicMaterial({ map: chestNumTex, side: THREE.FrontSide })
    );
    chestBadge.position.set(0.16, 1.44, 0.228);
    torsoGroup.add(chestBadge);

    // Back dorsal plate (number + 3-letter code)
    const dorsalTex = createDorsalTexture(driver.number, driver.short, suitBaseColor, team.secondary);
    const dorsalPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshBasicMaterial({ map: dorsalTex, side: THREE.FrontSide })
    );
    dorsalPlate.rotation.y = Math.PI;
    dorsalPlate.position.set(0, 1.38, -0.232);
    torsoGroup.add(dorsalPlate);

    // Broad shoulders + FIA rescue shoulder epaulets
    [-0.36, 0.36].forEach(sx => {
      const shoulder = new THREE.Mesh(g.shoulderCap, suitMat);
      shoulder.position.set(sx, 1.52, 0);
      shoulder.scale.set(1.08, 0.94, 0.96);
      addCartoonOutline(shoulder, 1.08);
      torsoGroup.add(shoulder);

      const epaulet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.11), accMat);
      epaulet.position.set(sx * 0.82, 1.605, 0);
      epaulet.rotation.z = sx > 0 ? -0.18 : 0.18;
      torsoGroup.add(epaulet);
    });

    // High FIA fireproof neck collar + Velcro closure tab
    const collar = new THREE.Mesh(g.collarCyl, suitMat);
    collar.position.set(0, 1.62, 0);
    addCartoonOutline(collar, 1.08);
    torsoGroup.add(collar);

    const collarTab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.06), secMat);
    collarTab.position.set(0, 1.625, 0.155);
    torsoGroup.add(collarTab);

    // Visible muscular neck
    const neck = new THREE.Mesh(g.neckCyl, skinMat);
    neck.position.set(0, 1.72, 0.01);
    torsoGroup.add(neck);

    // --- ARTICULATED ARMS (Shoulder -> Upper Arm -> Elbow -> Forearm -> Hand) ---
    function buildArticulatedArm(sideSign) {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(sideSign * 0.39, 1.51, 0);

      const upperArm = new THREE.Mesh(g.armSeg, suitMat);
      upperArm.position.set(0, -0.14, 0);
      upperArm.castShadow = true;
      addCartoonOutline(upperArm, 1.09);
      shoulderPivot.add(upperArm);

      const armBand = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.084, 0.055, 10), secMat);
      armBand.position.set(0, -0.10, 0);
      shoulderPivot.add(armBand);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.28, 0);
      shoulderPivot.add(elbowPivot);

      const elbow = new THREE.Mesh(g.elbowBall, suitMat);
      elbowPivot.add(elbow);

      const forearm = new THREE.Mesh(g.forearmSeg, suitMat);
      forearm.position.set(0, -0.13, 0);
      forearm.castShadow = true;
      addCartoonOutline(forearm, 1.09);
      elbowPivot.add(forearm);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.048, 10), accMat);
      cuff.position.set(0, -0.24, 0);
      elbowPivot.add(cuff);

      // Sculpted hand / motorsport glove
      const hand = new THREE.Mesh(g.handFist, pose === 'podium' ? gloveMat : skinMat);
      hand.position.set(0, -0.30, 0.015);
      hand.scale.set(0.95, 1.08, 0.88);
      addCartoonOutline(hand, 1.1);
      elbowPivot.add(hand);

      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 7), pose === 'podium' ? gloveMat : skinMat);
      thumb.position.set(-sideSign * 0.055, -0.285, 0.045);
      elbowPivot.add(thumb);

      return { shoulderPivot, elbowPivot };
    }

    const leftRig = buildArticulatedArm(1);
    const rightRig = buildArticulatedArm(-1);
    torsoGroup.add(leftRig.shoulderPivot, rightRig.shoulderPivot);

    if (pose === 'podium') {
      // Celebratory arms raised high
      leftRig.shoulderPivot.rotation.set(-0.2, 0, 2.55);
      leftRig.elbowPivot.rotation.set(-0.35, 0, -0.25);
      rightRig.shoulderPivot.rotation.set(-0.2, 0, -2.55);
      rightRig.elbowPivot.rotation.set(-0.35, 0, 0.25);
    } else {
      // Heroic athletic F1 driver stance (right hand near hip, left relaxed confident)
      rightRig.shoulderPivot.rotation.set(-0.12, 0, -0.44);
      rightRig.elbowPivot.rotation.set(-0.35, 0, 0.72);
      leftRig.shoulderPivot.rotation.set(-0.18, 0, 0.22);
      leftRig.elbowPivot.rotation.set(-0.42, 0, -0.14);
    }

    // --- SCULPTED UNHELMETED HEAD ---
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.97, 0.01);
    const headMesh = buildSculptedHead(driver, true);
    headMesh.scale.setScalar(0.98);
    headPivot.add(headMesh);
    torsoGroup.add(headPivot);

    return {
      root,
      torsoGroup,
      headPivot,
      leftArm: leftRig.shoulderPivot,
      rightArm: rightRig.shoulderPivot,
      leftForearm: leftRig.elbowPivot,
      rightForearm: rightRig.elbowPivot
    };
  }

  // ==========================================================================
  // 4. F1 CAR BUILDER (Halo + Butterfly Steering Wheel + HANS + IK Gloved Arms)
  // ==========================================================================
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
    const driverMode = options.driverMode || 'seated'; // 'seated' | 'parked_with_helmet' | 'empty'

    const root = new THREE.Group();
    const bodyTiltGroup = new THREE.Group();
    root.add(bodyTiltGroup);

    const primaryMat = getPlasticGlossMaterial(team.primary, { shininess: 125 });
    const secondaryMat = getPlasticGlossMaterial(team.secondary, { shininess: 125 });
    const accentMat = getPlasticGlossMaterial(team.accent, { shininess: 130 });
    const darkMat = getToonMaterial('#1A1E26');
    const carbonMat = getPlasticGlossMaterial('#1F2430', { shininess: 85 });
    const suitMat = getToonMaterial(team.suit || team.primary);

    // Chassis & Nose
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

    // Nose Number Plate
    const numTex = createNumberPlateTexture(driver.number, team.secondary);
    const numPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.46),
      new THREE.MeshBasicMaterial({ map: numTex, side: THREE.FrontSide })
    );
    numPlate.rotation.x = -Math.PI / 2 + 0.08;
    numPlate.position.set(0, 0.655, 1.75);
    bodyTiltGroup.add(numPlate);

    // Sidepods
    [-0.82, 0.82].forEach(xPos => {
      const pod = new THREE.Mesh(g.sidepod, primaryMat);
      pod.position.set(xPos, 0.54, -0.18);
      pod.castShadow = detailed;
      if (detailed) addCartoonOutline(pod, [1.12, 1.15, 1.04]);
      bodyTiltGroup.add(pod);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 1.56), secondaryMat);
      stripe.position.set(xPos, 0.62, -0.18);
      bodyTiltGroup.add(stripe);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.1), darkMat);
      intake.position.set(xPos, 0.54, 0.72);
      bodyTiltGroup.add(intake);
    });

    // Engine cover, shark fin & Airbox
    const engineCover = new THREE.Mesh(g.engineCover, primaryMat);
    engineCover.position.set(0, 0.90, -0.82);
    engineCover.castShadow = detailed;
    if (detailed) addCartoonOutline(engineCover, [1.09, 1.1, 1.05]);
    bodyTiltGroup.add(engineCover);

    const airbox = new THREE.Mesh(g.airbox, accentMat);
    airbox.position.set(0, 1.24, -0.58);
    if (detailed) addCartoonOutline(airbox, [1.11, 1.14, 1.1]);
    bodyTiltGroup.add(airbox);

    // Side engine cover number decals
    if (detailed) {
      [-0.345, 0.345].forEach(sx => {
        const sideNum = new THREE.Mesh(
          new THREE.PlaneGeometry(0.36, 0.36),
          new THREE.MeshBasicMaterial({ map: numTex, side: THREE.FrontSide })
        );
        sideNum.position.set(sx, 0.92, -0.88);
        sideNum.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        bodyTiltGroup.add(sideNum);
      });

      const studRow1 = createLegoStudRow(2, team.primary, 0.30);
      studRow1.position.set(0, 1.16, -0.98);
      const studRow2 = createLegoStudRow(2, team.primary, 0.30);
      studRow2.position.set(0, 1.16, -1.28);
      bodyTiltGroup.add(studRow1, studRow2);
    }

    // Front Wing & Flap (Accent = Halo / Alerones)
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

    // Rear Wing & Upper Flap
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

    // Cockpit Rim & Interior Seat Tub
    const cockpit = new THREE.Mesh(g.cockpitRim, darkMat);
    cockpit.position.set(0, 0.74, 0.14);
    bodyTiltGroup.add(cockpit);

    const cockpitTub = new THREE.Mesh(g.cockpitTub, carbonMat);
    cockpitTub.position.set(0, 0.64, 0.12);
    bodyTiltGroup.add(cockpitTub);

    // --- F1 HALO PROTECTION SYSTEM (Colored by team.accent / Halo & Alerones) ---
    const haloPylon = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.44, 10), accentMat);
    haloPylon.position.set(0, 0.98, 0.65);
    haloPylon.rotation.x = -0.44;
    bodyTiltGroup.add(haloPylon);

    const haloLeft = new THREE.Mesh(g.haloLeft, accentMat);
    const haloRight = new THREE.Mesh(g.haloRight, accentMat);
    if (detailed) {
      haloLeft.castShadow = true;
      haloRight.castShadow = true;
    }
    bodyTiltGroup.add(haloLeft, haloRight);

    // --- DETAILED F1 BUTTERFLY STEERING WHEEL + TELEMETRY LEDs ---
    const steeringMount = new THREE.Group();
    steeringMount.position.set(0, 0.91, 0.50);
    steeringMount.rotation.x = -0.32;
    bodyTiltGroup.add(steeringMount);

    const steeringCol = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.26, 8), darkMat);
    steeringCol.rotation.x = Math.PI / 2;
    steeringCol.position.set(0, 0, 0.12);
    steeringMount.add(steeringCol);

    const steeringPivot = new THREE.Group();
    steeringMount.add(steeringPivot);

    const swBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.042), carbonMat);
    steeringPivot.add(swBody);

    [-0.175, 0.175].forEach(gx => {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 8), accentMat);
      grip.position.set(gx, 0, 0);
      steeringPivot.add(grip);
    });

    const swScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.075, 0.048),
      new THREE.MeshBasicMaterial({ color: '#00E5FF' })
    );
    swScreen.position.set(0, 0.015, -0.004);
    steeringPivot.add(swScreen);

    ['#22C55E', '#FFD43B', '#FF2A44'].forEach((col, i) => {
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.052, 8),
        new THREE.MeshBasicMaterial({ color: col })
      );
      dial.rotation.x = Math.PI / 2;
      dial.position.set((i - 1) * 0.06, -0.048, -0.006);
      steeringPivot.add(dial);
    });

    // Exhausts & Turbo Flames
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

    // ========================================================================
    // DRIVER COCKPIT RIG: SEATED (IN-RACE) vs PARKED_WITH_HELMET (SHOWCASE)
    // ========================================================================
    const headPivot = new THREE.Group();
    let updateSteering = (steerVal) => {
      steeringPivot.rotation.z = steerVal * 0.72;
    };

    if (driverMode === 'seated') {
      const driverGroup = new THREE.Group();
      bodyTiltGroup.add(driverGroup);

      // Reclined seated fireproof torso
      const seatedTorso = new THREE.Mesh(g.chestUpper, suitMat);
      seatedTorso.position.set(0, 0.84, 0.04);
      seatedTorso.rotation.x = -0.26;
      seatedTorso.scale.set(1.02, 0.96, 0.76);
      if (detailed) addCartoonOutline(seatedTorso, 1.06);
      driverGroup.add(seatedTorso);

      // Forward thighs inside cockpit tub
      [-0.12, 0.12].forEach(tx => {
        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.42, 10), suitMat);
        thigh.rotation.x = Math.PI / 2 - 0.16;
        thigh.position.set(tx, 0.71, 0.29);
        driverGroup.add(thigh);
      });

      // Broad shoulders + high fireproof collar
      [-0.27, 0.27].forEach(sx => {
        const sh = new THREE.Mesh(g.shoulderCap, suitMat);
        sh.position.set(sx, 0.95, 0.02);
        sh.scale.set(0.92, 0.86, 0.88);
        driverGroup.add(sh);
      });

      const seatCollar = new THREE.Mesh(g.collarCyl, suitMat);
      seatCollar.position.set(0, 1.03, -0.02);
      seatCollar.rotation.x = -0.18;
      driverGroup.add(seatCollar);

      // --- SISTEMA HANS (Carbon horseshoe collar + FIA harness straps + helmet tethers) ---
      const hansYoke = new THREE.Mesh(g.hansYoke, carbonMat);
      hansYoke.position.set(0, 0.01, -0.01);
      driverGroup.add(hansYoke);

      const harnessMat = getToonMaterial(team.secondary);
      [-0.17, 0.17].forEach(hx => {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.26, 0.032), harnessMat);
        strap.position.set(hx, 0.88, 0.20);
        strap.rotation.x = -0.45;
        strap.rotation.z = hx > 0 ? 0.14 : -0.14;
        driverGroup.add(strap);

        const tether = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.16, 0.024), darkMat);
        tether.position.set(hx * 1.15, 1.11, -0.06);
        tether.rotation.x = 0.28;
        driverGroup.add(tether);
      });

      // --- DETAILED F1 HELMET (Inside Halo) ---
      headPivot.position.set(0, 1.24, 0.01);
      const helmetMesh = buildDetailedHelmet(driver, detailed);
      helmetMesh.scale.setScalar(0.92);
      headPivot.add(helmetMesh);
      driverGroup.add(headPivot);

      // --- ARTICULATED GLOVED ARMS COUPLED TO STEERING WHEEL IN REAL TIME ---
      const gloveMat = getToonMaterial(team.secondary);
      const gloveAccentMat = getToonMaterial(team.accent);

      const createCockpitArm = () => {
        const upper = new THREE.Mesh(g.ikLimb, suitMat);
        const elbow = new THREE.Mesh(g.elbowBall, suitMat);
        elbow.scale.setScalar(0.95);
        const forearm = new THREE.Mesh(g.ikLimb, suitMat);
        const gloveGrp = new THREE.Group();
        const gloveMain = new THREE.Mesh(g.ikGlove, gloveMat);
        const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.042, 0.075), gloveAccentMat);
        knuckle.position.set(0, 0.02, -0.025);
        gloveGrp.add(gloveMain, knuckle);

        driverGroup.add(upper, elbow, forearm, gloveGrp);
        return { upper, elbow, forearm, gloveGrp };
      };

      const leftCockpitArm = createCockpitArm();
      const rightCockpitArm = createCockpitArm();

      // Reusable temp vectors for allocation-free 60 FPS real-time 2-bone IK
      const shoulderL = new THREE.Vector3(0.28, 0.94, 0.03);
      const shoulderR = new THREE.Vector3(-0.28, 0.94, 0.03);
      const poleL = new THREE.Vector3(0.85, -0.42, 0.15).normalize();
      const poleR = new THREE.Vector3(-0.85, -0.42, 0.15).normalize();
      const vHand = new THREE.Vector3();
      const vElbow = new THREE.Vector3();
      const vDir = new THREE.Vector3();
      const vPerp = new THREE.Vector3();
      const vUp = new THREE.Vector3(0, 1, 0);
      const vMid = new THREE.Vector3();
      const upperLen = 0.30;
      const lowerLen = 0.30;

      const tiltCos = Math.cos(-0.32);
      const tiltSin = Math.sin(-0.32);

      const solveArmIK = (armObj, shoulderPos, gripLocalX, wheelAngle, poleDir) => {
        // Compute exact steering grip position in bodyTiltGroup space
        const c = Math.cos(wheelAngle);
        const s = Math.sin(wheelAngle);
        const gx = gripLocalX * c;
        const gy = gripLocalX * s;
        const gz = -0.01;
        // Apply steeringMount tilt (-0.32 rad around X) + position (0, 0.91, 0.50)
        const ty = gy * tiltCos - gz * tiltSin;
        const tz = gy * tiltSin + gz * tiltCos;
        vHand.set(gx, 0.91 + ty, 0.50 + tz);

        // Analytic 2-bone IK for elbow position
        vDir.subVectors(vHand, shoulderPos);
        const dist = Math.min(Math.max(vDir.length(), 0.12), upperLen + lowerLen - 0.015);
        vDir.normalize();

        const cosA = THREE.MathUtils.clamp((upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist), -1, 1);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

        // Project pole vector perpendicular to shoulder->hand axis
        vPerp.copy(poleDir).addScaledVector(vDir, -poleDir.dot(vDir));
        if (vPerp.lengthSq() < 1e-4) vPerp.set(poleDir.x, -0.5, 0);
        vPerp.normalize();

        vElbow.copy(shoulderPos)
          .addScaledVector(vDir, upperLen * cosA)
          .addScaledVector(vPerp, upperLen * sinA);

        // Position & orient upper arm (shoulder -> elbow)
        vMid.addVectors(shoulderPos, vElbow).multiplyScalar(0.5);
        armObj.upper.position.copy(vMid);
        vDir.subVectors(vElbow, shoulderPos);
        const len1 = vDir.length();
        armObj.upper.scale.set(1, len1, 1);
        armObj.upper.quaternion.setFromUnitVectors(vUp, vDir.normalize());

        // Elbow joint
        armObj.elbow.position.copy(vElbow);

        // Position & orient forearm (elbow -> hand)
        vMid.addVectors(vElbow, vHand).multiplyScalar(0.5);
        armObj.forearm.position.copy(vMid);
        vDir.subVectors(vHand, vElbow);
        const len2 = vDir.length();
        armObj.forearm.scale.set(0.92, len2, 0.92);
        armObj.forearm.quaternion.setFromUnitVectors(vUp, vDir.normalize());

        // Lock motorsport glove directly onto the steering wheel grip
        armObj.gloveGrp.position.copy(vHand);
        armObj.gloveGrp.rotation.set(-0.32, 0, wheelAngle);
      };

      updateSteering = (steerVal) => {
        const wheelAngle = steerVal * 0.72;
        steeringPivot.rotation.z = wheelAngle;
        solveArmIK(leftCockpitArm, shoulderL, 0.175, wheelAngle, poleL);
        solveArmIK(rightCockpitArm, shoulderR, -0.175, wheelAngle, poleR);
      };

      // Initialize neutral straight-ahead grip pose immediately
      updateSteering(0);
    } else if (driverMode === 'parked_with_helmet') {
      // Showcase / Podium parked F1 car: detailed bucket seat + driver's helmet resting proudly on the cockpit/Halo
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.14), carbonMat);
      seatBack.position.set(0, 0.78, -0.16);
      seatBack.rotation.x = -0.28;
      bodyTiltGroup.add(seatBack);

      headPivot.position.set(0, 1.24, 0.24);
      const displayHelmet = buildDetailedHelmet(driver, true);
      displayHelmet.scale.setScalar(0.92);
      displayHelmet.rotation.y = -0.35;
      displayHelmet.rotation.x = 0.08;
      headPivot.add(displayHelmet);
      bodyTiltGroup.add(headPivot);
    } else {
      bodyTiltGroup.add(headPivot);
    }

    // --- WHEELS (Tires + Custom Rim Color + Hub + Spokes) ---
    const tireMat = getToonMaterial('#191D24');
    const rimMat = getPlasticGlossMaterial(team.wheelRim, { shininess: 145 });
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

      const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.075, 0.44), darkMat);
      const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.44, 0.075), darkMat);
      spinGroup.add(spoke1, spoke2);

      wheels.push(spinGroup);
      if (wp.front) frontSteerPivots.push(pivot);
    });

    return {
      root,
      bodyTiltGroup,
      headPivot,
      steeringPivot,
      wheels,
      frontSteerPivots,
      turboFlameGroup,
      moralAura,
      updateSteering
    };
  }

  global.CarBuilder = {
    buildSculptedHead,
    buildDetailedHelmet,
    buildBobbleheadHead: buildSculptedHead,
    buildF1Car,
    buildStandingDriver
  };
})(window);
