// ============================================================================
// CARBUILDER.JS — Parche v1.3: Piloto PBR con Peso y Estructura Realista
//                 (Mono Ignífugo Mate R:0.9/M:0.05, Arnés 6 Puntos + Hebilla M:0.85,
//                 Casco Lacado R:0.15/M:0.35 + Mentonera Angular + Visera M:0.95/R:0.08,
//                 Sistema HANS Carbono #1a1a1a R:0.4, Rostro Planar + Mechones Definidos,
//                 Guantes con Costuras/Dedos Articulados y Botas sobre Pedales)
// ============================================================================
(function (global) {
  'use strict';

  let GEO = null;

  // Deterministic vertex sculpting for chiseled heroic facial planes (brow ridge,
  // recessed eye sockets, defined cheekbones, hollow cheeks, angular jaw & chin)
  function sculptPlanarHeadGeometry(scaleOut = 1.0, clipBeardOnly = false) {
    const base = new THREE.SphereGeometry(0.302 * scaleOut, 20, 18);
    const pos = base.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Normalize coordinates to canonical radius ~0.30
      let x = v.x / scaleOut;
      let y = v.y / scaleOut;
      let z = v.z / scaleOut;

      const ax = Math.abs(x);

      // Slight vertical heroic elongation & cranium taper
      y *= 1.08;
      if (y > 0.04) {
        // Structured cranium with flatter temple planes (no balloon look)
        const templeFlatten = Math.max(0, (ax - 0.16) * 0.42) * Math.max(0, 1 - Math.abs(y - 0.11) * 5.2);
        x -= Math.sign(x) * templeFlatten;
      }

      // Prominent overhanging brow ridge (arco superciliar)
      if (z > 0.09 && y > 0.065 && y < 0.175) {
        const browBand = Math.sin(((y - 0.065) / 0.11) * Math.PI);
        const browSpan = Math.max(0, 1 - (ax / 0.23) * (ax / 0.23));
        z += 0.036 * browBand * browSpan;
      }

      // Recessed orbital eye sockets right under the brow ridge
      if (z > 0.10 && y > -0.015 && y < 0.072 && ax > 0.035 && ax < 0.185) {
        const sockY = Math.sin(((y + 0.015) / 0.087) * Math.PI);
        const sockX = Math.sin(((ax - 0.035) / 0.15) * Math.PI);
        z -= 0.028 * sockY * sockX;
      }

      // High angular cheekbones (pómulos marcados)
      if (z > 0.05 && y > -0.095 && y < 0.015 && ax > 0.115 && ax < 0.255) {
        const cheekY = Math.sin(((y + 0.095) / 0.11) * Math.PI);
        const cheekX = Math.sin(((ax - 0.115) / 0.14) * Math.PI);
        x += Math.sign(x) * 0.028 * cheekY * cheekX;
        z += 0.024 * cheekY * cheekX;
      }

      // Sculpted hollow cheek planes beneath cheekbones
      if (z > 0.03 && y > -0.185 && y < -0.075 && ax > 0.08 && ax < 0.23) {
        const holY = Math.sin(((y + 0.185) / 0.11) * Math.PI);
        const holX = Math.sin(((ax - 0.08) / 0.15) * Math.PI);
        x -= Math.sign(x) * 0.020 * holY * holX;
        z -= 0.016 * holY * holX;
      }

      // Defined angular jaw & chiseled square chin
      if (y < -0.09) {
        const jawT = Math.min(1, (-y - 0.09) / 0.23);
        // Pull lower face into a clean chiseled taper with strong mandibular corners
        const backJawCorner = (z > -0.10 && z < 0.08 && ax > 0.13) ? (1 - Math.abs(y + 0.19) * 7.0) : 0;
        if (backJawCorner > 0) {
          x += Math.sign(x) * 0.022 * backJawCorner;
        }
        // Taper width cleanly toward a strong chiseled chin
        x *= (1 - jawT * 0.24);
        // Project strong athletic chin forward
        if (z > 0.02) {
          const chinFocus = Math.max(0, 1 - (ax / 0.16) * (ax / 0.16));
          z += 0.044 * jawT * chinFocus;
          y -= 0.022 * jawT * chinFocus;
        }
      }

      // Slight front face flattening for crisp sculptural planes
      if (z > 0.255 && y > -0.22 && y < 0.22) {
        z = 0.255 + (z - 0.255) * 0.65;
      }

      pos.setXYZ(i, x * scaleOut, y * scaleOut, z * scaleOut);
    }

    if (clipBeardOnly) {
      // Rebuild indexed triangles keeping ONLY lower jaw & chin front triangles
      const idx = base.index;
      const kept = [];
      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const vc = new THREE.Vector3();
      for (let i = 0; i < idx.count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        va.fromBufferAttribute(pos, a);
        vb.fromBufferAttribute(pos, b);
        vc.fromBufferAttribute(pos, c);
        const cy = (va.y + vb.y + vc.y) / 3;
        const cz = (va.z + vb.z + vc.z) / 3;
        if (cy < -0.102 * scaleOut && cz > -0.045 * scaleOut) {
          kept.push(a, b, c);
        }
      }
      base.setIndex(kept);
    }

    base.computeVertexNormals();
    return base;
  }

  // Sculpted angular lock blade for structured hair (no clay spheres!)
  function createHairLockGeometry(width = 0.078, length = 0.24, depth = 0.046) {
    const geo = new THREE.CylinderGeometry(width * 0.18, width * 0.62, length, 5, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i) * (depth / width);
      const t = (y + length * 0.5) / length;
      z += Math.sin(t * Math.PI) * 0.022;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Chunky beveled twisted curl lock (faceted ribbon prism — dense sculpted curls, zero spikes or clay balls!)
  function createCurlLockGeometry() {
    const geo = new THREE.BoxGeometry(0.115, 0.092, 0.135, 2, 2, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      // Gentle faceted S-wave twist & slight taper along Z so locks interlock organically
      const tz = z / 0.0675; // -1..1
      x += Math.sin(tz * 1.4) * 0.016;
      y -= tz * tz * 0.014;
      const taper = 1.0 - Math.max(0, tz) * 0.24;
      x *= taper;
      y *= taper;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Faceted angular F1 helmet chin bar / lower jaw guard
  function createAngularChinBarGeometry() {
    const geo = new THREE.CylinderGeometry(0.325, 0.278, 0.215, 8, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      let z = pos.getZ(i);
      // Push front jaw prow forward into a sharp F1 angular chin guard
      if (z > 0.05) {
        const frontFactor = Math.min(1, z / 0.30);
        z += 0.095 * frontFactor * (y < 0 ? 1.05 : 0.72);
        x *= 1 - 0.12 * frontFactor;
      }
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    return geo;
  }

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
      cockpitRim: new THREE.BoxGeometry(0.94, 0.18, 1.24),
      cockpitTub: new THREE.BoxGeometry(0.76, 0.26, 1.12),
      wheelTire: new THREE.CylinderGeometry(0.45, 0.45, 0.42, 18),
      wheelRim: new THREE.CylinderGeometry(0.28, 0.28, 0.44, 16),
      wheelHub: new THREE.CylinderGeometry(0.12, 0.12, 0.46, 10),
      exhaust: new THREE.CylinderGeometry(0.11, 0.14, 0.34, 10),
      flame: new THREE.ConeGeometry(0.24, 1.25, 10),
      flameInner: new THREE.ConeGeometry(0.13, 0.85, 8),
      auraRing: new THREE.TorusGeometry(2.15, 0.1, 8, 28),

      // Sculpted planar head & structured facial features
      sculptedHead: sculptPlanarHeadGeometry(1.0, false),
      beardShell: sculptPlanarHeadGeometry(1.028, true),
      ear: new THREE.BoxGeometry(0.042, 0.135, 0.072),
      earInner: new THREE.BoxGeometry(0.022, 0.085, 0.042),
      noseBridge: new THREE.CylinderGeometry(0.018, 0.040, 0.125, 4),
      noseTipFace: new THREE.BoxGeometry(0.058, 0.038, 0.058),
      eyeWhite: new THREE.SphereGeometry(0.058, 10, 10),
      eyeIris: new THREE.SphereGeometry(0.036, 10, 10),
      eyePupil: new THREE.SphereGeometry(0.022, 8, 8),
      eyeShine: new THREE.SphereGeometry(0.011, 6, 6),
      eyelid: new THREE.BoxGeometry(0.106, 0.020, 0.034),
      brow: new THREE.BoxGeometry(0.134, 0.032, 0.044),
      mouth: new THREE.BoxGeometry(0.122, 0.024, 0.026),
      upperLip: new THREE.BoxGeometry(0.116, 0.014, 0.028),
      teeth: new THREE.BoxGeometry(0.088, 0.012, 0.026),

      // Structured hair lock geometries (faceted blades & sculpted curls — zero clay spheres!)
      scalpCap: new THREE.SphereGeometry(0.312, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.54),
      hairLock: createHairLockGeometry(0.078, 0.24, 0.046),
      hairLockWide: createHairLockGeometry(0.112, 0.28, 0.056),
      hairLockShort: createHairLockGeometry(0.068, 0.155, 0.044),
      hairCurlChunk: createCurlLockGeometry(),

      // Detailed F1 helmet with angular chin bar & aerodynamic features
      helmetDome: new THREE.SphereGeometry(0.372, 22, 18),
      helmetJaw: createAngularChinBarGeometry(),
      helmetChinProw: new THREE.BoxGeometry(0.24, 0.135, 0.12),
      helmetChinLip: new THREE.BoxGeometry(0.34, 0.042, 0.13),
      helmetVisor: new THREE.CylinderGeometry(0.376, 0.365, 0.172, 24, 1, true, -Math.PI * 0.37, Math.PI * 0.74),
      helmetZylon: new THREE.CylinderGeometry(0.381, 0.379, 0.046, 24, 1, true, -Math.PI * 0.37, Math.PI * 0.74),
      helmetVent: new THREE.BoxGeometry(0.074, 0.052, 0.195),
      helmetSpoilerMain: new THREE.BoxGeometry(0.44, 0.038, 0.14),
      helmetSpoilerFin: new THREE.BoxGeometry(0.032, 0.095, 0.15),
      visorScrew: new THREE.CylinderGeometry(0.036, 0.036, 0.036, 12),
      visorBolt: new THREE.CylinderGeometry(0.018, 0.018, 0.046, 6),

      // Heavy anatomical body parts (broad athletic build, clear joints)
      neckCyl: new THREE.CylinderGeometry(0.106, 0.128, 0.20, 12),
      collarCyl: new THREE.CylinderGeometry(0.162, 0.188, 0.115, 14),
      chestUpper: new THREE.CylinderGeometry(0.325, 0.248, 0.40, 14),
      abdomen: new THREE.CylinderGeometry(0.252, 0.222, 0.25, 14),
      pelvis: new THREE.CylinderGeometry(0.235, 0.208, 0.18, 12),
      shoulderPad: new THREE.BoxGeometry(0.21, 0.145, 0.21),
      shoulderCap: new THREE.SphereGeometry(0.128, 12, 10),
      armSeg: new THREE.CylinderGeometry(0.094, 0.078, 0.29, 10),
      forearmSeg: new THREE.CylinderGeometry(0.078, 0.064, 0.265, 10),
      elbowPad: new THREE.BoxGeometry(0.145, 0.105, 0.145),
      glovePalm: new THREE.BoxGeometry(0.102, 0.105, 0.078),
      fingerSeg: new THREE.BoxGeometry(0.020, 0.068, 0.024),
      thumbSeg: new THREE.BoxGeometry(0.024, 0.056, 0.028),
      thighSeg: new THREE.CylinderGeometry(0.145, 0.112, 0.43, 12),
      kneePad: new THREE.BoxGeometry(0.185, 0.115, 0.19),
      calfSeg: new THREE.CylinderGeometry(0.110, 0.085, 0.41, 12),
      bootUpper: new THREE.BoxGeometry(0.195, 0.15, 0.32),
      bootSole: new THREE.BoxGeometry(0.21, 0.048, 0.34),
      buckleHub: new THREE.CylinderGeometry(0.068, 0.072, 0.032, 8),

      // In-car articulated limb cylinders (unit height along +Y for fast IK scaling)
      ikLimb: new THREE.CylinderGeometry(0.080, 0.066, 1.0, 10),
      ikGlovePalm: new THREE.BoxGeometry(0.096, 0.105, 0.082),
      pedalPlate: new THREE.BoxGeometry(0.095, 0.165, 0.022),
      pedalArm: new THREE.BoxGeometry(0.026, 0.14, 0.026)
    };

    GEO.wheelTire.rotateZ(Math.PI / 2);
    GEO.wheelRim.rotateZ(Math.PI / 2);
    GEO.wheelHub.rotateZ(Math.PI / 2);
    GEO.exhaust.rotateX(Math.PI / 2);
    GEO.flame.rotateX(-Math.PI / 2);
    GEO.flameInner.rotateX(-Math.PI / 2);
    GEO.visorScrew.rotateZ(Math.PI / 2);
    GEO.visorBolt.rotateZ(Math.PI / 2);
    GEO.buckleHub.rotateX(Math.PI / 2);
    GEO.noseBridge.rotateY(Math.PI / 4);

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

    // Heavy molded carbon-fiber HANS horseshoe yoke resting solidly over shoulders
    const hansCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.19, 0.87, 0.24),
      new THREE.Vector3(0.225, 0.99, 0.05),
      new THREE.Vector3(0.145, 1.07, -0.15),
      new THREE.Vector3(0.0, 1.10, -0.20),
      new THREE.Vector3(-0.145, 1.07, -0.15),
      new THREE.Vector3(-0.225, 0.99, 0.05),
      new THREE.Vector3(-0.19, 0.87, 0.24)
    ]);
    GEO.hansYoke = new THREE.TubeGeometry(hansCurve, 20, 0.048, 8, false);

    return GEO;
  }

  // Helper: Stitched motorsport glove with 4 articulated curled fingers + opposing thumb
  function buildStitchedGlove(gloveMat, accentMat, stitchMat, sideSign, gripMode = 'relaxed') {
    const g = ensureGeo();
    const gloveGrp = new THREE.Group();
    gloveGrp.name = sideSign > 0 ? 'pilot_glove_L' : 'pilot_glove_R';

    // Main Nomex/suede palm & backhand
    const palm = new THREE.Mesh(gripMode === 'wheel' ? g.ikGlovePalm : g.glovePalm, gloveMat);
    palm.castShadow = true;
    gloveGrp.add(palm);

    // Raised knuckle reinforcement pad
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.036, 0.042), accentMat);
    knuckle.position.set(0, 0.022, gripMode === 'wheel' ? -0.028 : 0.032);
    gloveGrp.add(knuckle);

    // External stitched seams along backhand & wrist cuff
    const stitchBar = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.012, 0.086), stitchMat);
    stitchBar.position.set(0, -0.016, 0);
    gloveGrp.add(stitchBar);

    const cuffStrap = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.028, 0.092), accentMat);
    cuffStrap.position.set(0, 0.052, 0);
    gloveGrp.add(cuffStrap);

    // 4 Articulated curled fingers (index, middle, ring, pinky)
    const fingerOffsets = [-0.034, -0.011, 0.012, 0.035];
    const fingerScales = [0.96, 1.06, 0.98, 0.82];
    for (let f = 0; f < 4; f++) {
      const fPivot = new THREE.Group();
      if (gripMode === 'wheel') {
        // Fingers curl tightly forward around the steering wheel handle (+Z)
        fPivot.position.set(fingerOffsets[f] * sideSign, -0.01 + (f - 1.5) * 0.004, 0.038);
        fPivot.rotation.x = -1.15;
      } else {
        // Standing athletic semi-curled fist fingers
        fPivot.position.set(fingerOffsets[f], -0.048, 0.016);
        fPivot.rotation.x = 0.58;
      }

      const fMesh = new THREE.Mesh(g.fingerSeg, gloveMat);
      fMesh.scale.set(0.95, fingerScales[f], 0.95);
      fMesh.position.y = -0.028 * fingerScales[f];
      fPivot.add(fMesh);

      // Distal curled fingertip joint
      const fTip = new THREE.Mesh(g.fingerSeg, stitchMat);
      fTip.scale.set(0.86, 0.52 * fingerScales[f], 0.86);
      fTip.position.set(0, -0.058 * fingerScales[f], gripMode === 'wheel' ? -0.016 : -0.014);
      fTip.rotation.x = gripMode === 'wheel' ? -0.85 : 0.72;
      fPivot.add(fTip);

      gloveGrp.add(fPivot);
    }

    // Articulated opposing thumb wrapping over grip/fist
    const thumbPivot = new THREE.Group();
    if (gripMode === 'wheel') {
      thumbPivot.position.set(-sideSign * 0.048, 0.028, 0.015);
      thumbPivot.rotation.set(-0.55, 0, sideSign * 0.65);
    } else {
      thumbPivot.position.set(-sideSign * 0.054, -0.018, 0.034);
      thumbPivot.rotation.set(0.32, 0, sideSign * 0.48);
    }
    const thumbMesh = new THREE.Mesh(g.thumbSeg, gloveMat);
    thumbMesh.position.y = -0.022;
    thumbPivot.add(thumbMesh);
    gloveGrp.add(thumbPivot);

    return gloveGrp;
  }

  // ==========================================================================
  // 1. SCULPTED PLANAR UNHELMETED HEAD (Menú, Showcase, Editor, Podio)
  //    Planos faciales definidos + Cabello estructurado con mechones angulares
  // ==========================================================================
  function buildSculptedHead(driver, detailed = true) {
    const g = ensureGeo();
    const { getSkinPBRMaterial, getHairPBRMaterial, getToonMaterial, mixHexColors } = global.ToonMat;
    const look = driver.look;
    const headGroup = new THREE.Group();
    headGroup.name = 'pilot_sculpted_head';

    // Matte natural PBR skin (zero clay/plastic gloss!)
    const skinMat = getSkinPBRMaterial(look.skin, false);
    const skinPlaneMat = getSkinPBRMaterial(mixHexColors(look.skin, '#7C3E26', 0.18), true);
    const earShadeMat = getSkinPBRMaterial(mixHexColors(look.skin, '#6B2F1D', 0.36), true);
    const lipMat = getSkinPBRMaterial(mixHexColors(look.skin, '#7F2B2B', 0.48), false);
    const hairMat = getHairPBRMaterial(look.hairColor);
    const hairShadeMat = getHairPBRMaterial(mixHexColors(look.hairColor, '#0B0F1A', 0.24));
    const whiteMat = getSkinPBRMaterial('#F8FAFC', false);
    const pupilMat = getToonMaterial('#090D16');
    const irisColor = ['#B5894A', '#D4A857', '#A67C46', '#D9B36C'].includes(look.hairColor.toUpperCase())
      ? '#2563EB'
      : '#3B2314';
    const irisMat = getSkinPBRMaterial(irisColor, false);
    const lidMat = getSkinPBRMaterial(mixHexColors(look.skin, '#1E1B18', 0.56), false);

    // Chiseled planar cranium + brow ridge + cheekbones + defined angular jaw & chin
    const headMesh = new THREE.Mesh(g.sculptedHead, skinMat);
    headMesh.name = 'pilot_head_cranium';
    headMesh.scale.set(0.95, 1.0, 1.02);
    headMesh.castShadow = detailed;
    headMesh.receiveShadow = detailed;
    headGroup.add(headMesh);

    // Sculpted angular ears tucked cleanly along temples
    [-1, 1].forEach(side => {
      const earPivot = new THREE.Group();
      earPivot.position.set(side * 0.282, -0.012, -0.018);
      earPivot.rotation.y = side * -0.28;
      earPivot.rotation.z = side * -0.08;

      const earOuter = new THREE.Mesh(g.ear, skinMat);
      earOuter.castShadow = detailed;
      earPivot.add(earOuter);

      const earInner = new THREE.Mesh(g.earInner, earShadeMat);
      earInner.position.set(side * 0.014, 0, 0.008);
      earPivot.add(earInner);

      headGroup.add(earPivot);
    });

    // Structured angular nose bridge + defined nasal tip & nostril planes
    const noseBridge = new THREE.Mesh(g.noseBridge, skinPlaneMat);
    noseBridge.position.set(0, -0.008, 0.282);
    noseBridge.rotation.x = -0.22;
    noseBridge.castShadow = detailed;
    headGroup.add(noseBridge);

    const noseTip = new THREE.Mesh(g.noseTipFace, skinPlaneMat);
    noseTip.position.set(0, -0.066, 0.312);
    noseTip.rotation.x = 0.22;
    headGroup.add(noseTip);

    // Deep-set expressive eyes & sculpted athletic eyebrows sitting cleanly proud of brow ridge
    [-0.102, 0.102].forEach((xPos, idx) => {
      const eyeGrp = new THREE.Group();
      eyeGrp.position.set(xPos, 0.036, 0.264);
      eyeGrp.rotation.y = xPos > 0 ? 0.22 : -0.22;

      const sclera = new THREE.Mesh(g.eyeWhite, whiteMat);
      sclera.scale.set(1.06, 0.92, 0.42);
      eyeGrp.add(sclera);

      const iris = new THREE.Mesh(g.eyeIris, irisMat);
      iris.position.set(0, -0.002, 0.020);
      iris.scale.set(1.0, 1.0, 0.44);
      eyeGrp.add(iris);

      const pupil = new THREE.Mesh(g.eyePupil, pupilMat);
      pupil.position.set(0, -0.002, 0.032);
      pupil.scale.set(1.0, 1.0, 0.44);
      eyeGrp.add(pupil);

      const shine = new THREE.Mesh(g.eyeShine, whiteMat);
      shine.position.set(0.014, 0.016, 0.041);
      eyeGrp.add(shine);

      const lid = new THREE.Mesh(g.eyelid, lidMat);
      lid.position.set(0, 0.044, 0.018);
      eyeGrp.add(lid);

      headGroup.add(eyeGrp);

      // Sculpted overhanging brow bar cleanly positioned outside brow ridge (zero clipping)
      const brow = new THREE.Mesh(g.brow, hairMat);
      brow.position.set(xPos, 0.114, 0.298);
      brow.rotation.y = xPos > 0 ? 0.22 : -0.22;
      if (look.browStyle === 'fierce') {
        brow.rotation.z = idx === 0 ? -0.24 : 0.24;
      } else if (look.browStyle === 'playful') {
        brow.rotation.z = idx === 0 ? 0.16 : -0.08;
        if (idx === 0) brow.position.y += 0.012;
      } else if (look.browStyle === 'happy') {
        brow.rotation.z = idx === 0 ? 0.12 : -0.12;
      } else {
        brow.rotation.z = idx === 0 ? -0.10 : 0.10;
      }
      brow.castShadow = detailed;
      headGroup.add(brow);
    });

    // Defined confident mouth & upper/lower lip planes cleanly proud of chin surface
    const mouth = new THREE.Mesh(g.mouth, lipMat);
    mouth.position.set(0, -0.150, 0.278);
    headGroup.add(mouth);

    const upperLip = new THREE.Mesh(g.upperLip, skinPlaneMat);
    upperLip.position.set(0, -0.135, 0.281);
    headGroup.add(upperLip);

    const teeth = new THREE.Mesh(g.teeth, whiteMat);
    teeth.position.set(0, -0.148, 0.286);
    headGroup.add(teeth);

    // Flush Contoured Facial Hair / Beard Styles (strictly hugging angular jawline)
    const beardType = look.beard || 'none';
    if (beardType === 'stubble') {
      const stubMat = getSkinPBRMaterial(mixHexColors(look.skin, look.hairColor, 0.42), false);
      const stub = new THREE.Mesh(g.beardShell, stubMat);
      stub.scale.set(0.955, 1.005, 1.028);
      headGroup.add(stub);
    } else if (beardType === 'beard') {
      const beard = new THREE.Mesh(g.beardShell, hairMat);
      beard.scale.set(0.98, 1.02, 1.055);
      beard.castShadow = detailed;
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.032, 0.044), hairMat);
      stache.position.set(0, -0.114, 0.284);
      headGroup.add(beard, stache);
    } else if (beardType === 'mustache') {
      const stacheL = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.042, 0.048), hairMat);
      stacheL.position.set(-0.062, -0.114, 0.288);
      stacheL.rotation.z = 0.22;
      const stacheR = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.042, 0.048), hairMat);
      stacheR.position.set(0.062, -0.114, 0.288);
      stacheR.rotation.z = -0.22;
      headGroup.add(stacheL, stacheR);
    } else if (beardType === 'goatee') {
      const goateeChin = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.11, 0.11), hairMat);
      goateeChin.position.set(0, -0.236, 0.205);
      goateeChin.rotation.x = 0.28;
      const stache = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.028, 0.042), hairMat);
      stache.position.set(0, -0.114, 0.284);
      headGroup.add(goateeChin, stache);
    }

    // Structured 360-degree Hairstyles with DEFINED ANGULAR LOCKS (mechones definidos — cero esferas!)
    const style = look.hairStyle || 'swept';
    if (style !== 'bald') {
      const hairGroup = new THREE.Group();
      hairGroup.name = 'pilot_hair_locks';

      // Faceted base scalp cap lifted back naturally off the forehead
      const cap = new THREE.Mesh(g.scalpCap, hairShadeMat);
      cap.position.set(0, 0.088, -0.025);
      cap.rotation.x = -0.36;
      cap.scale.set(0.955, 1.03, 1.045);
      cap.castShadow = detailed;
      hairGroup.add(cap);

      // Tapered angular nape layers
      [-0.12, 0, 0.12].forEach(nx => {
        const napeLock = new THREE.Mesh(g.hairLockShort, hairShadeMat);
        napeLock.position.set(nx, -0.055, -0.255);
        napeLock.rotation.set(Math.PI + 0.18, 0, nx * 0.6);
        hairGroup.add(napeLock);
      });

      // Tapered sideburns
      [-0.258, 0.258].forEach(sx => {
        const sb = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.145, 0.088), hairShadeMat);
        sb.position.set(sx, 0.035, 0.035);
        hairGroup.add(sb);
      });

      if (style === 'curly') {
        // Dense sculpted layered curls framing forehead, crown & temples (faceted beveled chunks — ZERO spikes or spheres!)
        [
          // Front hairline brow-framing curls
          [-0.17, 0.25, 0.20, 0.35, 0.42, 0.22, 1.05],
          [-0.07, 0.27, 0.23, 0.28, 0.15, -0.12, 1.15],
          [0.05, 0.27, 0.23, 0.26, -0.18, 0.16, 1.18],
          [0.16, 0.24, 0.20, 0.36, -0.42, -0.22, 1.04],
          // Upper crown dense layered curls
          [-0.14, 0.34, 0.11, 0.12, 0.32, 0.30, 1.15],
          [-0.02, 0.36, 0.13, 0.08, -0.10, -0.14, 1.24],
          [0.11, 0.35, 0.11, 0.10, -0.28, -0.26, 1.18],
          [-0.15, 0.35, -0.04, -0.15, 0.25, 0.28, 1.14],
          [0.0, 0.37, -0.05, -0.18, 0.05, 0.12, 1.22],
          [0.15, 0.35, -0.04, -0.15, -0.25, -0.28, 1.14],
          // Back & side temple curls
          [-0.23, 0.21, 0.06, 0.18, 0.72, 0.38, 0.96],
          [0.23, 0.21, 0.06, 0.18, -0.72, -0.38, 0.96],
          [-0.22, 0.22, -0.10, -0.22, 0.65, 0.34, 0.98],
          [0.22, 0.22, -0.10, -0.22, -0.65, -0.34, 0.98],
          [0.0, 0.28, -0.20, -0.45, 0.12, 0.0, 1.12]
        ].forEach(([lx, ly, lz, rx, ry, rz, sc], i) => {
          const curl = new THREE.Mesh(g.hairCurlChunk, i % 3 === 0 ? hairShadeMat : hairMat);
          curl.position.set(lx, ly, lz);
          curl.rotation.set(rx, ry, rz);
          curl.scale.set(sc, sc * 0.96, sc);
          curl.castShadow = detailed;
          hairGroup.add(curl);
        });
      } else if (style === 'swept') {
        // Dynamic layered swept quiff composed of crisp overlapping hair blades
        [
          [-0.12, 0.33, 0.14, 0.92, 0.22, -0.52, 1.15],
          [-0.02, 0.36, 0.17, 0.84, 0.12, -0.42, 1.28],
          [0.09, 0.35, 0.16, 0.88, 0.05, -0.58, 1.22],
          [0.18, 0.30, 0.11, 0.96, -0.18, -0.72, 1.05],
          [-0.10, 0.36, 0.0, 0.45, 0.18, -0.48, 1.12],
          [0.04, 0.38, -0.02, 0.38, 0.10, -0.40, 1.18],
          [0.15, 0.33, -0.04, 0.42, -0.12, -0.56, 1.05],
          [-0.18, 0.24, 0.04, 0.62, 0.45, -0.25, 0.92]
        ].forEach(([lx, ly, lz, rx, ry, rz, sc], i) => {
          const blade = new THREE.Mesh(g.hairLockWide, i % 3 === 0 ? hairShadeMat : hairMat);
          blade.position.set(lx, ly, lz);
          blade.rotation.set(rx, ry, rz);
          blade.scale.set(sc, sc * 0.95, 1.0);
          blade.castShadow = detailed;
          hairGroup.add(blade);
        });
      } else if (style === 'spiky') {
        // Sharp faceted angular spikes fanning forward and up
        [
          [-0.15, 0.34, 0.18, 0.56, 0.18, 0.28, 1.05],
          [-0.05, 0.39, 0.21, 0.52, 0.05, 0.10, 1.18],
          [0.06, 0.39, 0.21, 0.52, -0.05, -0.12, 1.18],
          [0.16, 0.34, 0.18, 0.56, -0.18, -0.28, 1.05],
          [-0.13, 0.41, 0.05, 0.18, 0.12, 0.26, 1.12],
          [0.0, 0.43, 0.06, 0.20, 0.0, 0.0, 1.24],
          [0.13, 0.41, 0.05, 0.18, -0.12, -0.26, 1.12],
          [-0.11, 0.37, -0.09, -0.26, 0.1, 0.22, 1.0],
          [0.0, 0.39, -0.11, -0.32, 0.0, 0.0, 1.08],
          [0.11, 0.37, -0.09, -0.26, -0.1, -0.22, 1.0]
        ].forEach(([sx, sy, sz, rx, ry, rz, sc], i) => {
          const sp = new THREE.Mesh(g.hairLock, i % 2 === 0 ? hairMat : hairShadeMat);
          sp.position.set(sx, sy, sz);
          sp.rotation.set(rx, ry, rz);
          sp.scale.set(sc, sc * 1.08, sc);
          sp.castShadow = detailed;
          hairGroup.add(sp);
        });
      } else if (style === 'wavy') {
        // Layered sculpted wave locks cascading around crown, temples & back
        [
          [-0.12, 0.34, 0.17, 1.08, 0.24, 0.42, 1.15],
          [0.02, 0.36, 0.19, 1.02, -0.15, -0.32, 1.24],
          [0.15, 0.32, 0.15, 1.08, -0.32, -0.58, 1.10],
          [-0.23, 0.17, 0.05, 2.55, 0.32, 0.28, 1.05],
          [0.23, 0.17, 0.05, 2.55, -0.32, -0.28, 1.05],
          [-0.22, 0.14, -0.10, 2.75, 0.28, 0.24, 1.12],
          [0.22, 0.14, -0.10, 2.75, -0.28, -0.24, 1.12],
          [-0.10, 0.14, -0.24, 2.92, 0.12, 0.12, 1.18],
          [0.0, 0.16, -0.26, 2.95, 0.0, 0.0, 1.22],
          [0.10, 0.14, -0.24, 2.92, -0.12, -0.12, 1.18]
        ].forEach(([wx, wy, wz, rx, ry, rz, sc], i) => {
          const w = new THREE.Mesh(g.hairLockWide, i % 3 === 0 ? hairShadeMat : hairMat);
          w.position.set(wx, wy, wz);
          w.rotation.set(rx, ry, rz);
          w.scale.set(sc, sc, 0.95);
          w.castShadow = detailed;
          hairGroup.add(w);
        });
      } else if (style === 'braids') {
        for (let r = -2; r <= 2; r++) {
          const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.42, 6), hairMat);
          ridge.rotation.x = Math.PI / 2 - 0.12;
          ridge.position.set(r * 0.080, 0.335 - Math.abs(r) * 0.022, 0.02);
          ridge.castShadow = detailed;
          hairGroup.add(ridge);
        }
        const braidGeo = new THREE.CylinderGeometry(0.034, 0.024, 0.38, 6);
        for (let i = -3; i <= 3; i++) {
          const lock = new THREE.Mesh(braidGeo, i % 2 === 0 ? hairMat : hairShadeMat);
          lock.position.set(i * 0.080, -0.10, -0.295 - (3 - Math.abs(i)) * 0.018);
          lock.rotation.x = 0.24;
          lock.castShadow = detailed;
          hairGroup.add(lock);
        }
      } else if (style === 'mullet') {
        // Short structured top fringe locks + layered back mullet blades
        [-0.12, 0.0, 0.12].forEach((tx, idx) => {
          const topLock = new THREE.Mesh(g.hairLockShort, idx === 1 ? hairMat : hairShadeMat);
          topLock.position.set(tx, 0.35, 0.13);
          topLock.rotation.set(0.82, 0, -tx * 1.4);
          topLock.scale.set(1.25, 1.0, 1.0);
          hairGroup.add(topLock);
        });
        for (let i = -2; i <= 2; i++) {
          const backLock = new THREE.Mesh(g.hairLockWide, Math.abs(i) % 2 === 0 ? hairMat : hairShadeMat);
          backLock.position.set(i * 0.095, -0.13, -0.295 - (2 - Math.abs(i)) * 0.015);
          backLock.rotation.set(2.86, i * 0.10, i * 0.14);
          backLock.scale.set(1.05, 1.45, 1.0);
          backLock.castShadow = detailed;
          hairGroup.add(backLock);
        }
      } else if (style === 'buzz') {
        cap.scale.set(0.935, 1.0, 1.015);
        // Clean structured front hairline edge
        const frontEdge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.12), hairShadeMat);
        frontEdge.position.set(0, 0.255, 0.195);
        frontEdge.rotation.x = 0.42;
        hairGroup.add(frontEdge);
      }

      headGroup.add(hairGroup);
    }

    return headGroup;
  }

  // ==========================================================================
  // 2. DETAILED F1 HELMET (PBR Lacado Automotriz R:0.15/M:0.35,
  //    Mentonera Angular, Tomas de Aire, Alerón Trasero,
  //    Visera Oscura Iridiscente M:0.95/R:0.08 + Tornillos Metálicos M:0.85)
  // ==========================================================================
  function buildDetailedHelmet(driver, detailed = true) {
    const g = ensureGeo();
    const {
      getHelmetShellMaterial,
      getCarbonFiberMaterial,
      getVisorMaterial,
      getBuckleMetalMaterial
    } = global.ToonMat;
    const look = driver.look;
    const helmetGroup = new THREE.Group();
    helmetGroup.name = 'pilot_helmet_group';

    const mainMat = getHelmetShellMaterial(look.helmetMain);     // roughness: 0.15, metalness: 0.35
    const stripeMat = getHelmetShellMaterial(look.helmetStripe); // roughness: 0.15, metalness: 0.35
    const accentMat = getHelmetShellMaterial(look.helmetAccent); // roughness: 0.15, metalness: 0.35
    const darkCarbonMat = getCarbonFiberMaterial('#1a1a1a');     // roughness: 0.4
    const visorMat = getVisorMaterial(look.visor);               // metalness: 0.95, roughness: 0.08
    const screwMetalMat = getBuckleMetalMaterial('#D8E0EA');     // metalness: 0.85

    // Main automotive lacquered aerodynamic shell dome
    const dome = new THREE.Mesh(g.helmetDome, mainMat);
    dome.name = 'pilot_helmet_shell';
    dome.position.set(0, 0.045, -0.02);
    dome.scale.set(0.96, 0.96, 1.08);
    dome.castShadow = detailed;
    dome.receiveShadow = detailed;
    helmetGroup.add(dome);

    // Sculpted ANGULAR chin bar (mentonera angular) with faceted lower jaw prow
    const jawGuard = new THREE.Mesh(g.helmetJaw, mainMat);
    jawGuard.name = 'pilot_helmet_chinbar';
    jawGuard.position.set(0, -0.145, 0.035);
    jawGuard.scale.set(0.95, 1.0, 1.06);
    jawGuard.castShadow = detailed;
    jawGuard.receiveShadow = detailed;
    helmetGroup.add(jawGuard);

    const chinProw = new THREE.Mesh(g.helmetChinProw, mainMat);
    chinProw.position.set(0, -0.152, 0.352);
    chinProw.rotation.x = 0.14;
    chinProw.castShadow = detailed;
    helmetGroup.add(chinProw);

    // Lower front aero chin spoiler lip + recessed carbon chin intake grille
    const chinLip = new THREE.Mesh(g.helmetChinLip, accentMat);
    chinLip.position.set(0, -0.232, 0.365);
    helmetGroup.add(chinLip);

    const chinVent = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.048, 0.052), darkCarbonMat);
    chinVent.position.set(0, -0.150, 0.405);
    helmetGroup.add(chinVent);

    // Pilot livery: crown racing stripe + aggressive side speed chevrons
    const crownStripe = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.068, 0.62), stripeMat);
    crownStripe.position.set(0, 0.372, -0.02);
    crownStripe.rotation.x = -0.12;
    helmetGroup.add(crownStripe);

    [-1, 1].forEach(side => {
      const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.095, 0.45), accentMat);
      sideStripe.position.set(side * 0.348, -0.058, -0.01);
      sideStripe.rotation.x = -0.22;
      helmetGroup.add(sideStripe);

      const upperAccent = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.052, 0.38), stripeMat);
      upperAccent.position.set(side * 0.338, 0.142, -0.04);
      upperAccent.rotation.x = -0.16;
      helmetGroup.add(upperAccent);
    });

    // Top Air Intakes (Tomas de aire superiores)
    [-0.115, 0.115].forEach(vx => {
      const scoop = new THREE.Mesh(g.helmetVent, accentMat);
      scoop.position.set(vx, 0.358, 0.08);
      scoop.rotation.x = 0.14;
      scoop.castShadow = detailed;
      helmetGroup.add(scoop);

      const intakeHole = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.034, 0.044), darkCarbonMat);
      intakeHole.position.set(vx, 0.354, 0.176);
      helmetGroup.add(intakeHole);
    });
    const rearExhaustVent = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.042, 0.125), darkCarbonMat);
    rearExhaustVent.position.set(0, 0.338, -0.21);
    rearExhaustVent.rotation.x = -0.35;
    helmetGroup.add(rearExhaustVent);

    // Rear Aero Spoiler (Alerón trasero del casco)
    const spoilerGrp = new THREE.Group();
    spoilerGrp.position.set(0, 0.168, -0.395);
    spoilerGrp.rotation.x = -0.22;

    const spoilerWing = new THREE.Mesh(g.helmetSpoilerMain, accentMat);
    spoilerWing.castShadow = detailed;
    spoilerGrp.add(spoilerWing);

    [-0.21, 0.21].forEach(fx => {
      const fin = new THREE.Mesh(g.helmetSpoilerFin, stripeMat);
      fin.position.set(fx, -0.015, 0.02);
      spoilerGrp.add(fin);
    });
    helmetGroup.add(spoilerGrp);

    // Dark Iridescent Reflective Visor (metalness: 0.95, roughness: 0.08)
    const visor = new THREE.Mesh(g.helmetVisor, visorMat);
    visor.name = 'pilot_helmet_visor';
    visor.position.set(0, 0.032, 0.050);
    visor.scale.set(0.97, 1.0, 1.06);
    helmetGroup.add(visor);

    // Zylon top protective brow strip above visor
    const zylon = new THREE.Mesh(g.helmetZylon, stripeMat);
    zylon.position.set(0, 0.128, 0.050);
    zylon.scale.set(0.985, 1.0, 1.075);
    helmetGroup.add(zylon);

    // Machined Metallic Side Visor Pivot Screws (metalness: 0.85)
    [-0.358, 0.358].forEach(sx => {
      const screw = new THREE.Mesh(g.visorScrew, screwMetalMat);
      screw.name = 'pilot_visor_screw';
      screw.position.set(sx, 0.028, 0.062);
      helmetGroup.add(screw);

      const bolt = new THREE.Mesh(g.visorBolt, darkCarbonMat);
      bolt.position.set(sx + Math.sign(sx) * 0.008, 0.028, 0.062);
      helmetGroup.add(bolt);
    });

    return helmetGroup;
  }

  // ==========================================================================
  // 3. STANDING HEROIC DRIVER (Sin Casco — Menú, Showcase, Editor, Podio)
  //    Mono Ignífugo Mate PBR (R:0.9/M:0.05), Arnés 6 Puntos + Hebilla M:0.85,
  //    Paneles Laterales en Relieve, Costuras, Guantes con Dedos Articulados
  // ==========================================================================
  function buildStandingDriver(driver, team, options = {}) {
    const g = ensureGeo();
    const {
      getFabricSuitMaterial,
      getBuckleMetalMaterial,
      getCarbonFiberMaterial,
      getSkinPBRMaterial,
      getGloveLeatherMaterial,
      getBootMaterial,
      createContactShadowMesh,
      mixHexColors,
      createDorsalTexture,
      createNumberPlateTexture
    } = global.ToonMat;
    const pose = options.pose || 'hero'; // 'hero' or 'podium'

    const root = new THREE.Group();
    root.name = 'pilot_standing_root';

    const suitBaseColor = team.suit || team.primary;
    const suitMat = getFabricSuitMaterial(suitBaseColor);                             // roughness: 0.9, metalness: 0.05
    const secSuitMat = getFabricSuitMaterial(team.secondary);                         // roughness: 0.9, metalness: 0.05
    const accSuitMat = getFabricSuitMaterial(team.accent);                            // roughness: 0.9, metalness: 0.05
    const seamMat = getFabricSuitMaterial(mixHexColors(suitBaseColor, '#090D16', 0.45), { bumpScale: 0.01 });
    const panelDarkMat = getFabricSuitMaterial(mixHexColors(suitBaseColor, '#111827', 0.58), { bumpScale: 0.028 });
    const harnessMat = getFabricSuitMaterial('#161B24', { bumpScale: 0.03 });
    const buckleMetalMat = getBuckleMetalMaterial('#D8E0EA');                         // metalness: 0.85
    const skinMat = getSkinPBRMaterial(driver.look.skin, false);
    const bootMat = getBootMaterial('#141821');
    const gloveMat = getGloveLeatherMaterial(team.secondary);
    const gloveAccentMat = getGloveLeatherMaterial(team.accent);
    const carbonMat = getCarbonFiberMaterial('#1a1a1a');

    // Grounded Contact Shadow Ambient Occlusion Disc right under racing boots
    const aoShadow = createContactShadowMesh(0.56, 0.48, 0.82);
    aoShadow.name = 'pilot_contact_shadow';
    aoShadow.position.set(0, 0.008, 0.03);
    root.add(aoShadow);

    // --- HEAVY GROUNDED LEGS, KNEE FLEX PADS & MOTORSPORT BOOTS ---
    [-0.155, 0.155].forEach((xPos, idx) => {
      const sideSign = idx === 0 ? -1 : 1;
      const legGrp = new THREE.Group();
      const stanceX = pose === 'hero' ? sideSign * 0.165 : xPos;
      legGrp.position.set(stanceX, 0, 0);
      if (pose === 'hero') legGrp.rotation.y = sideSign * 0.13;

      // Grippy sole + high-top racing boot + heel guard + ankle strap
      const sole = new THREE.Mesh(g.bootSole, secSuitMat);
      sole.position.set(0, 0.024, 0.052);
      sole.castShadow = true;
      legGrp.add(sole);

      const boot = new THREE.Mesh(g.bootUpper, bootMat);
      boot.name = idx === 0 ? 'pilot_boot_R' : 'pilot_boot_L';
      boot.position.set(0, 0.118, 0.042);
      boot.castShadow = true;
      boot.receiveShadow = true;
      legGrp.add(boot);

      const toeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.055, 0.09), carbonMat);
      toeGuard.position.set(0, 0.082, 0.175);
      legGrp.add(toeGuard);

      const ankleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.042, 0.215), accSuitMat);
      ankleStrap.position.set(0, 0.172, 0.015);
      legGrp.add(ankleStrap);

      // Calf with stitched outer seam
      const calf = new THREE.Mesh(g.calfSeg, suitMat);
      calf.position.set(0, 0.375, 0);
      calf.castShadow = true;
      calf.receiveShadow = true;
      legGrp.add(calf);

      const calfSeam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.36, 0.048), seamMat);
      calfSeam.position.set(sideSign * 0.095, 0.375, 0);
      legGrp.add(calfSeam);

      // Articulated knee flex pad
      const knee = new THREE.Mesh(g.kneePad, panelDarkMat);
      knee.position.set(0, 0.568, 0.018);
      knee.castShadow = true;
      legGrp.add(knee);

      // Strong sculpted thigh + raised side panel stripe
      const thigh = new THREE.Mesh(g.thighSeg, suitMat);
      thigh.position.set(0, 0.77, 0);
      thigh.castShadow = true;
      thigh.receiveShadow = true;
      legGrp.add(thigh);

      const legPanel = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.36, 0.11), secSuitMat);
      legPanel.position.set(sideSign * 0.128, 0.77, 0);
      legGrp.add(legPanel);

      root.add(legGrp);
    });

    // --- PELVIS & STRUCTURED ATHLETIC TORSO (MONO IGNÍFUGO PBR) ---
    const torsoGroup = new THREE.Group();
    root.add(torsoGroup);

    const pelvis = new THREE.Mesh(g.pelvis, suitMat);
    pelvis.position.set(0, 0.99, 0);
    pelvis.scale.set(1.18, 1.0, 0.80);
    pelvis.castShadow = true;
    pelvis.receiveShadow = true;
    torsoGroup.add(pelvis);

    const abdomen = new THREE.Mesh(g.abdomen, suitMat);
    abdomen.position.set(0, 1.16, 0);
    abdomen.scale.set(1.15, 1.0, 0.76);
    abdomen.castShadow = true;
    abdomen.receiveShadow = true;
    torsoGroup.add(abdomen);

    // Broad muscular athletic chest
    const chest = new THREE.Mesh(g.chestUpper, suitMat);
    chest.name = 'pilot_suit_chest';
    chest.position.set(0, 1.42, 0);
    chest.scale.set(1.20, 1.0, 0.76);
    chest.castShadow = true;
    chest.receiveShadow = true;
    torsoGroup.add(chest);

    // Raised Side Torso Rib/Oblique Panels (Paneles laterales en relieve)
    [-1, 1].forEach(sideSign => {
      const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.44, 0.25), panelDarkMat);
      sidePanel.name = sideSign > 0 ? 'pilot_side_panel_L' : 'pilot_side_panel_R';
      sidePanel.position.set(sideSign * 0.305, 1.31, -0.005);
      sidePanel.rotation.z = sideSign * 0.16;
      sidePanel.castShadow = true;
      torsoGroup.add(sidePanel);

      const panelTrim = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.42, 0.045), accSuitMat);
      panelTrim.position.set(sideSign * 0.336, 1.31, 0.095);
      panelTrim.rotation.z = sideSign * 0.16;
      torsoGroup.add(panelTrim);
    });

    // Stitched center zipper seam + vertical suit quilting seams
    const centerZip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.50, 0.032), seamMat);
    centerZip.position.set(0, 1.35, 0.218);
    torsoGroup.add(centerZip);

    [-0.19, 0.19].forEach(sx => {
      const chestSeam = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.44, 0.032), seamMat);
      chestSeam.position.set(sx, 1.38, 0.202);
      torsoGroup.add(chestSeam);
    });

    // --- 6-POINT FIA RACING HARNESS / BELT + CENTRAL METALLIC BUCKLE (metalness: 0.85) ---
    // Waist lap belt (Points 3 & 4)
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.242, 0.088, 14), harnessMat);
    belt.position.set(0, 1.07, 0);
    belt.scale.set(1.19, 1.0, 0.80);
    belt.castShadow = true;
    torsoGroup.add(belt);

    // Dual upper shoulder harness straps (Points 1 & 2) contoured flush down the chest to camlock buckle
    [-0.145, 0.145].forEach(hx => {
      const upperStrap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.48, 0.026), harnessMat);
      upperStrap.position.set(hx * 0.72, 1.32, 0.212);
      upperStrap.rotation.x = -0.10;
      upperStrap.rotation.z = hx > 0 ? -0.17 : 0.17;
      upperStrap.castShadow = true;
      torsoGroup.add(upperStrap);

      const strapPad = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.14, 0.036), secSuitMat);
      strapPad.position.set(hx * 0.90, 1.45, 0.228);
      strapPad.rotation.x = -0.10;
      strapPad.rotation.z = hx > 0 ? -0.17 : 0.17;
      torsoGroup.add(strapPad);

      // Machined metallic harness adjuster slider (metalness: 0.85)
      const adjuster = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.028, 0.034), buckleMetalMat);
      adjuster.position.set(hx * 0.56, 1.21, 0.205);
      adjuster.rotation.z = hx > 0 ? -0.17 : 0.17;
      torsoGroup.add(adjuster);

      // Anti-submarine lower pelvis straps (Points 5 & 6)
      const subStrap = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.16, 0.024), harnessMat);
      subStrap.position.set(hx * 0.42, 0.96, 0.194);
      subStrap.rotation.x = 0.08;
      subStrap.rotation.z = hx > 0 ? 0.20 : -0.20;
      torsoGroup.add(subStrap);
    });

    // Central FIA Camlock Metallic Buckle (estrictamente metalness: 0.85)
    const buckleHub = new THREE.Mesh(g.buckleHub, buckleMetalMat);
    buckleHub.name = 'pilot_harness_buckle';
    buckleHub.position.set(0, 1.075, 0.208);
    buckleHub.scale.setScalar(1.12);
    buckleHub.castShadow = true;
    torsoGroup.add(buckleHub);

    const buckleLever = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.092, 0.024), buckleMetalMat);
    buckleLever.position.set(0, 1.075, 0.228);
    buckleLever.rotation.z = 0.24;
    torsoGroup.add(buckleLever);

    const buckleLatch = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.030), accSuitMat);
    buckleLatch.position.set(0, 1.075, 0.232);
    torsoGroup.add(buckleLatch);

    // Front chest number patch (matte textile PBR)
    const chestNumTex = createNumberPlateTexture(driver.number, team.secondary);
    const chestBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.145, 0.145),
      new THREE.MeshStandardMaterial({ map: chestNumTex, roughness: 0.9, metalness: 0.05, side: THREE.FrontSide })
    );
    chestBadge.position.set(0.21, 1.45, 0.236);
    torsoGroup.add(chestBadge);

    // Back dorsal plate (number + 3-letter code)
    const dorsalTex = createDorsalTexture(driver.number, driver.short, suitBaseColor, team.secondary);
    const dorsalPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshStandardMaterial({ map: dorsalTex, roughness: 0.9, metalness: 0.05, side: THREE.FrontSide })
    );
    dorsalPlate.rotation.y = Math.PI;
    dorsalPlate.position.set(0, 1.40, -0.242);
    torsoGroup.add(dorsalPlate);

    // Padded Quilted Shoulders + FIA Rescue Shoulder Epaulets
    [-1, 1].forEach(sideSign => {
      const shoulder = new THREE.Mesh(g.shoulderCap, suitMat);
      shoulder.position.set(sideSign * 0.375, 1.54, 0);
      shoulder.scale.set(1.12, 0.95, 1.02);
      shoulder.castShadow = true;
      torsoGroup.add(shoulder);

      const padBolster = new THREE.Mesh(g.shoulderPad, panelDarkMat);
      padBolster.position.set(sideSign * 0.34, 1.59, 0);
      padBolster.rotation.z = sideSign * -0.22;
      padBolster.castShadow = true;
      torsoGroup.add(padBolster);

      const epaulet = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.044, 0.115), accSuitMat);
      epaulet.position.set(sideSign * 0.31, 1.65, 0);
      epaulet.rotation.z = sideSign * -0.20;
      torsoGroup.add(epaulet);
    });

    // Structured High Fireproof Neck Collar + Velcro Strap
    const collar = new THREE.Mesh(g.collarCyl, suitMat);
    collar.position.set(0, 1.64, 0);
    collar.castShadow = true;
    torsoGroup.add(collar);

    const collarRib = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.172, 0.036, 14), panelDarkMat);
    collarRib.position.set(0, 1.69, 0);
    torsoGroup.add(collarRib);

    const collarTab = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.068, 0.062), secSuitMat);
    collarTab.position.set(0, 1.645, 0.162);
    torsoGroup.add(collarTab);

    // Muscular sculpted neck
    const neck = new THREE.Mesh(g.neckCyl, skinMat);
    neck.position.set(0, 1.74, 0.01);
    neck.castShadow = true;
    torsoGroup.add(neck);

    // --- ARTICULATED ARMS (Padded Shoulder -> Upper Arm -> Elbow Pad -> Forearm -> Stitched Glove w/ Fingers) ---
    function buildArticulatedArm(sideSign) {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(sideSign * 0.41, 1.53, 0);

      const upperArm = new THREE.Mesh(g.armSeg, suitMat);
      upperArm.position.set(0, -0.145, 0);
      upperArm.castShadow = true;
      upperArm.receiveShadow = true;
      shoulderPivot.add(upperArm);

      const sleeveSeam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.25, 0.046), seamMat);
      sleeveSeam.position.set(sideSign * 0.082, -0.145, 0);
      shoulderPivot.add(sleeveSeam);

      const armBand = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.088, 0.056, 10), secSuitMat);
      armBand.position.set(0, -0.10, 0);
      shoulderPivot.add(armBand);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.29, 0);
      shoulderPivot.add(elbowPivot);

      const elbow = new THREE.Mesh(g.elbowPad, panelDarkMat);
      elbow.castShadow = true;
      elbowPivot.add(elbow);

      const forearm = new THREE.Mesh(g.forearmSeg, suitMat);
      forearm.position.set(0, -0.135, 0);
      forearm.castShadow = true;
      forearm.receiveShadow = true;
      elbowPivot.add(forearm);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.070, 0.052, 10), accSuitMat);
      cuff.position.set(0, -0.245, 0);
      elbowPivot.add(cuff);

      // Stitched Motorsport Glove with 4 articulated fingers + thumb
      const glove = buildStitchedGlove(gloveMat, gloveAccentMat, seamMat, sideSign, 'relaxed');
      glove.position.set(0, -0.315, 0.012);
      elbowPivot.add(glove);

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
      // Heavy, grounded heroic F1 driver stance
      rightRig.shoulderPivot.rotation.set(-0.14, 0, -0.44);
      rightRig.elbowPivot.rotation.set(-0.38, 0, 0.72);
      leftRig.shoulderPivot.rotation.set(-0.18, 0, 0.24);
      leftRig.elbowPivot.rotation.set(-0.42, 0, -0.14);
    }

    // --- SCULPTED PLANAR UNHELMETED HEAD ---
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.99, 0.01);
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
  // 4. F1 CAR BUILDER (Halo + Butterfly Steering Wheel + Carbon HANS +
  //    6-Point Harness + IK Stitched Gloves/Fingers + Cockpit Pedals & Boots)
  // ==========================================================================
  function buildF1Car(driver, team, options = {}) {
    const g = ensureGeo();
    const {
      getToonMaterial,
      getPlasticGlossMaterial,
      getFabricSuitMaterial,
      getCarbonFiberMaterial,
      getBuckleMetalMaterial,
      getGloveLeatherMaterial,
      getBootMaterial,
      createContactShadowMesh,
      mixHexColors,
      addCartoonOutline,
      createLegoStudRow,
      createNumberPlateTexture
    } = global.ToonMat;

    const detailed = options.detailed ?? true;
    const driverMode = options.driverMode || 'seated'; // 'seated' | 'parked_with_helmet' | 'empty'

    const root = new THREE.Group();
    const bodyTiltGroup = new THREE.Group();
    root.add(bodyTiltGroup);

    // Subtle grounded contact shadow AO under the monoplaza
    if (detailed) {
      const carShadow = createContactShadowMesh(1.42, 2.55, 0.62);
      carShadow.position.set(0, 0.014, 0.15);
      root.add(carShadow);
    }

    const primaryMat = getPlasticGlossMaterial(team.primary, { shininess: 125 });
    const secondaryMat = getPlasticGlossMaterial(team.secondary, { shininess: 125 });
    const accentMat = getPlasticGlossMaterial(team.accent, { shininess: 130 });
    const darkMat = getToonMaterial('#1A1E26');
    const carbonMat = getCarbonFiberMaterial('#1a1a1a'); // roughness: 0.4
    const buckleMetalMat = getBuckleMetalMaterial('#D8E0EA'); // metalness: 0.85

    const suitBaseColor = team.suit || team.primary;
    const suitMat = getFabricSuitMaterial(suitBaseColor); // roughness: 0.9, metalness: 0.05
    const secSuitMat = getFabricSuitMaterial(team.secondary);
    const panelDarkMat = getFabricSuitMaterial(mixHexColors(suitBaseColor, '#111827', 0.58), { bumpScale: 0.025 });
    const seamMat = getFabricSuitMaterial(mixHexColors(suitBaseColor, '#090D16', 0.45), { bumpScale: 0.01 });
    const harnessMat = getFabricSuitMaterial('#161B24', { bumpScale: 0.03 });
    const gloveMat = getGloveLeatherMaterial(team.secondary);
    const gloveAccentMat = getGloveLeatherMaterial(team.accent);
    const bootMat = getBootMaterial('#141821');

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

    // Front Wing & Flap
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

    // Open Recessed Carbon Cockpit Tub & Perimeter Headrest Rails (exposes interior pedal footwell cleanly)
    const cockpitFloor = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 1.18), carbonMat);
    cockpitFloor.position.set(0, 0.62, 0.24);
    bodyTiltGroup.add(cockpitFloor);

    [-0.43, 0.43].forEach(rx => {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.22, 1.24), darkMat);
      sideRail.position.set(rx, 0.74, 0.24);
      bodyTiltGroup.add(sideRail);
    });
    const rearRail = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.24, 0.14), darkMat);
    rearRail.position.set(0, 0.75, -0.34);
    bodyTiltGroup.add(rearRail);
    const frontCoaming = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 0.12), darkMat);
    frontCoaming.position.set(0, 0.73, 0.84);
    bodyTiltGroup.add(frontCoaming);

    // --- F1 HALO PROTECTION SYSTEM ---
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

    // --- COCKPIT ALUMINUM PEDALS (Brake Left / Throttle Right tucked inside recessed footwell) ---
    const pedalWell = new THREE.Group();
    pedalWell.name = 'pilot_cockpit_pedals';
    pedalWell.position.set(0, 0.65, 0.72);
    bodyTiltGroup.add(pedalWell);

    [
      { name: 'pilot_cockpit_pedal_brake', x: 0.115, tilt: -0.26 },
      { name: 'pilot_cockpit_pedal_gas', x: -0.115, tilt: -0.34 }
    ].forEach(pd => {
      const pPlate = new THREE.Mesh(g.pedalPlate, buckleMetalMat);
      pPlate.name = pd.name;
      pPlate.scale.set(0.95, 0.86, 1.0);
      pPlate.position.set(pd.x, 0.06, 0.03);
      pPlate.rotation.x = pd.tilt;
      pedalWell.add(pPlate);

      const pArm = new THREE.Mesh(g.pedalArm, carbonMat);
      pArm.position.set(pd.x, 0.03, 0.055);
      pedalWell.add(pArm);
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
    // DRIVER COCKPIT RIG: SEATED (IN-RACE / EDITOR COCKPIT) vs PARKED_WITH_HELMET
    // ========================================================================
    const headPivot = new THREE.Group();
    let updateSteering = (steerVal) => {
      steeringPivot.rotation.z = steerVal * 0.72;
    };

    if (driverMode === 'seated') {
      const driverGroup = new THREE.Group();
      driverGroup.name = 'pilot_seated_cockpit';
      bodyTiltGroup.add(driverGroup);

      // Reclined matte fireproof Nomex torso (roughness: 0.9, metalness: 0.05)
      const seatedTorso = new THREE.Mesh(g.chestUpper, suitMat);
      seatedTorso.name = 'pilot_suit_chest';
      seatedTorso.position.set(0, 0.85, 0.03);
      seatedTorso.rotation.x = -0.28;
      seatedTorso.scale.set(1.04, 0.96, 0.78);
      seatedTorso.castShadow = detailed;
      driverGroup.add(seatedTorso);

      // Raised side torso panels inside cockpit
      [-1, 1].forEach(sideSign => {
        const sPanel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.30, 0.22), panelDarkMat);
        sPanel.position.set(sideSign * 0.26, 0.84, 0.04);
        sPanel.rotation.x = -0.28;
        driverGroup.add(sPanel);
      });

      // Forward thighs, knees, shins & RACING BOOTS tucked cleanly onto the cockpit pedals!
      [-0.115, 0.115].forEach((tx, idx) => {
        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.088, 0.36, 10), suitMat);
        thigh.rotation.x = Math.PI / 2 - 0.10;
        thigh.position.set(tx, 0.72, 0.27);
        driverGroup.add(thigh);

        const knee = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.12), panelDarkMat);
        knee.position.set(tx, 0.74, 0.44);
        driverGroup.add(knee);

        const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.068, 0.25, 10), suitMat);
        shin.rotation.x = Math.PI / 2 + 0.14;
        shin.position.set(tx, 0.71, 0.56);
        driverGroup.add(shin);

        // Racing boot resting firmly against the aluminum cockpit pedal inside the tub
        const cBoot = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.145, 0.092), bootMat);
        cBoot.name = idx === 0 ? 'pilot_cockpit_boot_R' : 'pilot_cockpit_boot_L';
        cBoot.position.set(tx, 0.705, 0.685);
        cBoot.rotation.x = -0.30;
        driverGroup.add(cBoot);

        const cBootSole = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.15, 0.026), secSuitMat);
        cBootSole.position.set(tx, 0.705, 0.725);
        cBootSole.rotation.x = -0.30;
        driverGroup.add(cBootSole);
      });

      // Padded broad shoulders + structured high fireproof collar
      [-0.275, 0.275].forEach(sx => {
        const sh = new THREE.Mesh(g.shoulderCap, suitMat);
        sh.position.set(sx, 0.96, 0.02);
        sh.scale.set(0.95, 0.88, 0.92);
        sh.castShadow = detailed;
        driverGroup.add(sh);

        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.075, 0.16), panelDarkMat);
        pad.position.set(sx * 0.92, 1.02, 0.01);
        driverGroup.add(pad);
      });

      const seatCollar = new THREE.Mesh(g.collarCyl, suitMat);
      seatCollar.position.set(0, 1.04, -0.02);
      seatCollar.rotation.x = -0.18;
      driverGroup.add(seatCollar);

      // --- SISTEMA HANS EN FIBRA DE CARBONO OSCURA (#1a1a1a, roughness: 0.4) ---
      const hansYoke = new THREE.Mesh(g.hansYoke, carbonMat);
      hansYoke.name = 'pilot_hans_collar';
      hansYoke.position.set(0, 0.015, -0.01);
      hansYoke.castShadow = detailed;
      driverGroup.add(hansYoke);

      // Rear vertical carbon HANS neck support & shoulder wing flanges
      const hansRearCollar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.065), carbonMat);
      hansRearCollar.position.set(0, 1.15, -0.21);
      hansRearCollar.rotation.x = 0.18;
      driverGroup.add(hansRearCollar);

      [-0.19, 0.19].forEach(hx => {
        const hansFlange = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.036, 0.26), carbonMat);
        hansFlange.position.set(hx, 0.97, 0.12);
        hansFlange.rotation.x = 0.34;
        driverGroup.add(hansFlange);
      });

      // --- 6-POINT FIA HARNESS + CENTRAL METALLIC BUCKLE (metalness: 0.85) ---
      [-0.16, 0.16].forEach(hx => {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.32, 0.028), harnessMat);
        strap.position.set(hx * 0.86, 0.89, 0.215);
        strap.rotation.x = -0.42;
        strap.rotation.z = hx > 0 ? 0.18 : -0.18;
        driverGroup.add(strap);

        const strapBrand = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.095, 0.034), secSuitMat);
        strapBrand.position.set(hx * 0.96, 0.96, 0.185);
        strapBrand.rotation.x = -0.42;
        driverGroup.add(strapBrand);

        // Lap belts & HANS helmet safety tethers
        const lapBelt = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.048, 0.028), harnessMat);
        lapBelt.position.set(hx * 0.85, 0.77, 0.25);
        lapBelt.rotation.y = hx > 0 ? -0.35 : 0.35;
        driverGroup.add(lapBelt);

        const tether = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.17, 0.022), harnessMat);
        tether.position.set(hx * 1.15, 1.13, -0.06);
        tether.rotation.x = 0.28;
        driverGroup.add(tether);
      });

      // Central FIA Metallic Camlock Buckle inside cockpit (metalness: 0.85)
      const cockpitBuckle = new THREE.Mesh(g.buckleHub, buckleMetalMat);
      cockpitBuckle.name = 'pilot_harness_buckle';
      cockpitBuckle.position.set(0, 0.79, 0.268);
      cockpitBuckle.rotation.x = -0.38;
      driverGroup.add(cockpitBuckle);

      // --- DETAILED PBR F1 HELMET (Inside Halo) ---
      headPivot.position.set(0, 1.25, 0.01);
      const helmetMesh = buildDetailedHelmet(driver, detailed);
      helmetMesh.scale.setScalar(0.92);
      headPivot.add(helmetMesh);
      driverGroup.add(headPivot);

      // --- ARTICULATED GLOVED ARMS WITH FINGERS COUPLED TO STEERING WHEEL IN REAL TIME ---
      const createCockpitArm = (sideSign) => {
        const upper = new THREE.Mesh(g.ikLimb, suitMat);
        const elbow = new THREE.Mesh(g.elbowPad, panelDarkMat);
        elbow.scale.setScalar(0.88);
        const forearm = new THREE.Mesh(g.ikLimb, suitMat);
        const gloveGrp = buildStitchedGlove(gloveMat, gloveAccentMat, seamMat, sideSign, 'wheel');
        gloveGrp.scale.setScalar(0.98);

        driverGroup.add(upper, elbow, forearm, gloveGrp);
        return { upper, elbow, forearm, gloveGrp };
      };

      const leftCockpitArm = createCockpitArm(1);
      const rightCockpitArm = createCockpitArm(-1);

      // Reusable temp vectors for allocation-free 60 FPS real-time 2-bone IK
      const shoulderL = new THREE.Vector3(0.285, 0.95, 0.03);
      const shoulderR = new THREE.Vector3(-0.285, 0.95, 0.03);
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
        const c = Math.cos(wheelAngle);
        const s = Math.sin(wheelAngle);
        const gx = gripLocalX * c;
        const gy = gripLocalX * s;
        const gz = -0.01;
        const ty = gy * tiltCos - gz * tiltSin;
        const tz = gy * tiltSin + gz * tiltCos;
        vHand.set(gx, 0.91 + ty, 0.50 + tz);

        vDir.subVectors(vHand, shoulderPos);
        const dist = Math.min(Math.max(vDir.length(), 0.12), upperLen + lowerLen - 0.015);
        vDir.normalize();

        const cosA = THREE.MathUtils.clamp((upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist), -1, 1);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

        vPerp.copy(poleDir).addScaledVector(vDir, -poleDir.dot(vDir));
        if (vPerp.lengthSq() < 1e-4) vPerp.set(poleDir.x, -0.5, 0);
        vPerp.normalize();

        vElbow.copy(shoulderPos)
          .addScaledVector(vDir, upperLen * cosA)
          .addScaledVector(vPerp, upperLen * sinA);

        vMid.addVectors(shoulderPos, vElbow).multiplyScalar(0.5);
        armObj.upper.position.copy(vMid);
        vDir.subVectors(vElbow, shoulderPos);
        const len1 = vDir.length();
        armObj.upper.scale.set(1, len1, 1);
        armObj.upper.quaternion.setFromUnitVectors(vUp, vDir.normalize());

        armObj.elbow.position.copy(vElbow);

        vMid.addVectors(vElbow, vHand).multiplyScalar(0.5);
        armObj.forearm.position.copy(vMid);
        vDir.subVectors(vHand, vElbow);
        const len2 = vDir.length();
        armObj.forearm.scale.set(0.92, len2, 0.92);
        armObj.forearm.quaternion.setFromUnitVectors(vUp, vDir.normalize());

        armObj.gloveGrp.position.copy(vHand);
        armObj.gloveGrp.rotation.set(-0.32, 0, wheelAngle);
      };

      updateSteering = (steerVal) => {
        const wheelAngle = steerVal * 0.72;
        steeringPivot.rotation.z = wheelAngle;
        solveArmIK(leftCockpitArm, shoulderL, 0.175, wheelAngle, poleL);
        solveArmIK(rightCockpitArm, shoulderR, -0.175, wheelAngle, poleR);
      };

      updateSteering(0);
    } else if (driverMode === 'parked_with_helmet') {
      // Showcase / Podium parked F1 car: detailed carbon bucket seat + PBR helmet + HANS resting on Halo
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.14), carbonMat);
      seatBack.position.set(0, 0.78, -0.16);
      seatBack.rotation.x = -0.28;
      bodyTiltGroup.add(seatBack);

      const parkedHans = new THREE.Mesh(g.hansYoke, carbonMat);
      parkedHans.name = 'pilot_hans_collar';
      parkedHans.position.set(0, 0.02, 0.06);
      parkedHans.scale.setScalar(0.92);
      bodyTiltGroup.add(parkedHans);

      headPivot.position.set(0, 1.25, 0.24);
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
