// ============================================================================
// TRACKS.JS — 3 Circuitos 3D Animados (Mónaco, Silverstone, Abu Dabi)
//             Parche v1.1: Asfalto y=+0.08, polygonOffset, Opacidad Estricta,
//             Escapatorias Opacas, Cero Z-Fighting ni Solapamientos
// ============================================================================
(function (global) {
  'use strict';

  const CIRCUIT_CONTROL_POINTS = {
    monaco: [
      [0, 0], [0, 110], [35, 175], [115, 210], [175, 175], [150, 118],
      [195, 78], [140, 35], [185, -35], [165, -130], [95, -155], [70, -110],
      [30, -145], [-25, -115], [-12, -55]
    ],
    silverstone: [
      [0, 0], [0, 130], [45, 210], [125, 240], [180, 185], [230, 125],
      [255, 35], [205, -25], [245, -85], [195, -145], [95, -210],
      [-35, -215], [-95, -145], [-65, -65]
    ],
    abudhabi: [
      [0, 0], [0, 155], [45, 235], [135, 255], [200, 215], [245, 120],
      [255, -20], [235, -155], [165, -180], [120, -115], [70, -185],
      [-25, -195], [-85, -135], [-55, -60]
    ]
  };

  function buildCircuitScene(circuitMeta) {
    const rawPts = CIRCUIT_CONTROL_POINTS[circuitMeta.id] || CIRCUIT_CONTROL_POINTS.monaco;
    const controlVecs = rawPts.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(controlVecs, true, 'catmullrom', 0.45);

    const SAMPLES = 560;
    const totalLength = curve.getLength();
    const trackWidth = circuitMeta.trackWidth;
    const halfWidth = trackWidth * 0.5;

    const frames = [];
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      const pos = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      frames.push({
        u, s: u * totalLength, pos, tangent, right,
        curvature: 0, width: trackWidth, hasGrandstand: false
      });
    }

    for (let i = 0; i < SAMPLES; i++) {
      const prev = frames[(i - 3 + SAMPLES) % SAMPLES].tangent;
      const next = frames[(i + 3) % SAMPLES].tangent;
      const dot = THREE.MathUtils.clamp(prev.dot(next), -1, 1);
      const angle = Math.acos(dot);
      const crossY = prev.x * next.z - prev.z * next.x;
      frames[i].curvature = angle * Math.sign(crossY || 1) * 5.2;
    }

    const group = new THREE.Group();
    const animators = [];

    const envInfo = buildEnvironmentBackdrop(circuitMeta, group, animators);
    buildTrackRibbon(frames, halfWidth, circuitMeta, group);
    const startLights = buildStartGantry(frames[0], trackWidth, circuitMeta, group);
    buildAnimatedGrandstands(frames, halfWidth, circuitMeta, group, animators);

    if (circuitMeta.id === 'monaco') {
      buildMonacoLandmarks(frames, halfWidth, group, animators);
    } else if (circuitMeta.id === 'silverstone') {
      buildSilverstoneLandmarks(frames, halfWidth, group, animators);
    } else if (circuitMeta.id === 'abudhabi') {
      buildAbuDhabiLandmarks(frames, halfWidth, group, animators);
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    frames.forEach(f => {
      if (f.pos.x < minX) minX = f.pos.x;
      if (f.pos.x > maxX) maxX = f.pos.x;
      if (f.pos.z < minZ) minZ = f.pos.z;
      if (f.pos.z > maxZ) maxZ = f.pos.z;
    });

    function sampleAtDistance(s) {
      let wrapped = s % totalLength;
      if (wrapped < 0) wrapped += totalLength;
      const exactIdx = (wrapped / totalLength) * SAMPLES;
      const i0 = Math.floor(exactIdx) % SAMPLES;
      const i1 = (i0 + 1) % SAMPLES;
      const frac = exactIdx - Math.floor(exactIdx);
      const f0 = frames[i0];
      const f1 = frames[i1];

      const pos = new THREE.Vector3().lerpVectors(f0.pos, f1.pos, frac);
      const tangent = new THREE.Vector3().lerpVectors(f0.tangent, f1.tangent, frac).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const curvature = THREE.MathUtils.lerp(f0.curvature, f1.curvature, frac);

      return {
        pos, tangent, right, curvature,
        width: trackWidth, halfWidth,
        hasGrandstand: f0.hasGrandstand || f1.hasGrandstand
      };
    }

    function setStartLights(state) {
      startLights.forEach((bulb, idx) => {
        if (state === 6) {
          bulb.material.color.set('#22FF66');
          bulb.material.emissive.set('#22FF66');
          bulb.material.emissiveIntensity = 1.6;
        } else if (idx < state) {
          bulb.material.color.set('#FF2233');
          bulb.material.emissive.set('#FF1122');
          bulb.material.emissiveIntensity = 1.6;
        } else {
          bulb.material.color.set('#252B36');
          bulb.material.emissive.set('#000000');
          bulb.material.emissiveIntensity = 0;
        }
      });
    }

    return {
      group, circuitMeta, totalLength, trackWidth, halfWidth, frames,
      bounds: { minX, maxX, minZ, maxZ },
      skyColor: envInfo.skyColor,
      fogColor: envInfo.fogColor,
      sunColor: envInfo.sunColor,
      ambientColor: envInfo.ambientColor,
      sampleAtDistance,
      setStartLights,
      update(dt, elapsed, crowdExcitement, playerPos) {
        for (let i = 0; i < animators.length; i++) {
          animators[i](dt, elapsed, crowdExcitement, playerPos);
        }
      }
    };
  }

  function buildEnvironmentBackdrop(circuitMeta, group, animators) {
    const { getToonMaterial, setTextureSRGB } = global.ToonMat;
    let skyColor = '#56CCF2', fogColor = '#8DE0FF', groundColor = '#4ADE80', sunColor = '#FFFBEB', ambientColor = '#E0F2FE';

    if (circuitMeta.id === 'monaco') {
      skyColor = '#38BDF8'; fogColor = '#93E4FF'; groundColor = '#C6B08E'; sunColor = '#FFF8DC'; ambientColor = '#E0F7FF';
    } else if (circuitMeta.id === 'silverstone') {
      skyColor = '#6488A8'; fogColor = '#94B2CC'; groundColor = '#3DAE5C'; sunColor = '#E2F1FF'; ambientColor = '#B8D2E8';
    } else if (circuitMeta.id === 'abudhabi') {
      skyColor = '#3B1D60'; fogColor = '#7A2E6F'; groundColor = '#E8B87D'; sunColor = '#FFB366'; ambientColor = '#C084FC';
    }

    const groundMat = getToonMaterial(groundColor, {
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide
    });

    // Ground strictly at y = 0.0 so track asphalt at y = +0.08 is strictly +0.08 above terrain.
    // For Monaco & Abu Dhabi, split land cleanly at the seawall so ocean/marina NEVER overlaps terrain or asphalt.
    if (circuitMeta.id === 'monaco') {
      const landGeo = new THREE.PlaneGeometry(2600, 1500);
      landGeo.computeVertexNormals();
      const land = new THREE.Mesh(landGeo, groundMat);
      land.rotation.x = -Math.PI / 2;
      land.position.set(100, 0.0, 574); // South edge exactly at z = -176 (south of Monaco track)
      land.receiveShadow = true;
      group.add(land);
    } else if (circuitMeta.id === 'abudhabi') {
      const landGeo = new THREE.PlaneGeometry(2600, 1500);
      landGeo.computeVertexNormals();
      const land = new THREE.Mesh(landGeo, groundMat);
      land.rotation.x = -Math.PI / 2;
      land.position.set(80, 0.0, 526); // South edge exactly at z = -224 (south of Abu Dhabi track)
      land.receiveShadow = true;
      group.add(land);
    } else {
      const groundGeo = new THREE.CircleGeometry(1650, 64);
      groundGeo.computeVertexNormals();
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.0;
      ground.receiveShadow = true;
      group.add(ground);
    }

    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 32; skyCanvas.height = 256;
    const ctx = skyCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);

    if (circuitMeta.id === 'abudhabi') {
      grad.addColorStop(0.0, '#1B1145'); grad.addColorStop(0.32, '#5B2182');
      grad.addColorStop(0.54, '#D9468F'); grad.addColorStop(0.72, '#FF7B47');
      grad.addColorStop(0.88, '#FFD166'); grad.addColorStop(1.0, '#FFB703');
    } else if (circuitMeta.id === 'silverstone') {
      grad.addColorStop(0.0, '#4A6FA5'); grad.addColorStop(0.45, '#7FA2C4');
      grad.addColorStop(0.75, '#B4CDE0'); grad.addColorStop(1.0, '#D6E4EE');
    } else {
      grad.addColorStop(0.0, '#0284C7'); grad.addColorStop(0.48, '#38BDF8');
      grad.addColorStop(0.78, '#BAE6FD'); grad.addColorStop(1.0, '#FEF9C3');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 256);

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    setTextureSRGB(skyTex);
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(1900, 28, 18),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    group.add(skyDome);

    const cloudGroup = new THREE.Group();
    const cloudMat = getToonMaterial(circuitMeta.id === 'silverstone' ? '#DCE6F0' : circuitMeta.id === 'abudhabi' ? '#FFB5C2' : '#FFFFFF');
    const cloudPuffGeo = new THREE.SphereGeometry(12, 10, 8);
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Group();
      const angle = (i / 18) * Math.PI * 2;
      const dist = 290 + (i % 3) * 85;
      c.position.set(Math.cos(angle) * dist + 60, 102 + (i % 4) * 20, Math.sin(angle) * dist);
      for (let p = -1; p <= 1; p++) {
        const puff = new THREE.Mesh(cloudPuffGeo, cloudMat);
        puff.position.set(p * 11, p === 0 ? 4 : 0, (p % 2) * 3);
        puff.scale.set(1.2, 0.72, 0.9);
        c.add(puff);
      }
      cloudGroup.add(c);
    }
    group.add(cloudGroup);
    animators.push((dt) => { cloudGroup.rotation.y += dt * 0.008; });

    return { skyColor, fogColor, sunColor, ambientColor };
  }

  // Helper to construct a guaranteed upward-normal (+Y), FrontSide strip along track frames
  function createTrackStripGeometry(frames, innerOffsetFn, outerOffsetFn, yHeight) {
    const N = frames.length;
    const positions = [];
    const uvs = [];
    const indices = [];

    // Pass 1: build all ribbon vertices and UVs first
    for (let i = 0; i <= N; i++) {
      const f = frames[i % N];
      const offA = innerOffsetFn(f);
      const offB = outerOffsetFn(f);
      const ptA = f.pos.clone().addScaledVector(f.right, offA);
      const ptB = f.pos.clone().addScaledVector(f.right, offB);
      positions.push(ptA.x, yHeight, ptA.z);
      positions.push(ptB.x, yHeight, ptB.z);
      const v = i / N;
      uvs.push(0, v, 1, v);
    }

    // Pass 2: build triangles with strictly enforced upward (+Y) FrontSide winding
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;

      const pushUpTri = (i0, i1, i2) => {
        const x0 = positions[i0 * 3], z0 = positions[i0 * 3 + 2];
        const x1 = positions[i1 * 3], z1 = positions[i1 * 3 + 2];
        const x2 = positions[i2 * 3], z2 = positions[i2 * 3 + 2];
        // Y component of (P1 - P0) x (P2 - P0)
        const crossY = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
        if (crossY >= 0) {
          indices.push(i0, i1, i2);
        } else {
          indices.push(i0, i2, i1);
        }
      };

      pushUpTri(a, b, c);
      pushUpTri(b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  function buildTrackRibbon(frames, halfWidth, circuitMeta, group) {
    const { getToonMaterial, getToonGradientMap, getAsphaltTexture } = global.ToonMat;
    const N = frames.length;
    const wallOffset = circuitMeta.id === 'monaco' ? halfWidth + 2.3 : halfWidth + 4.4;

    // 1. ESCAPATORIAS (RUNOFF SHOULDERS) — Opaque, FrontSide, y = +0.035 (strictly below asphalt y = +0.08, above terrain y = 0.0)
    const runoffColor = circuitMeta.id === 'abudhabi'
      ? '#1E3A8A'
      : circuitMeta.id === 'monaco'
        ? '#64748B'
        : '#475569';
    const runoffMat = new THREE.MeshToonMaterial({
      color: new THREE.Color(runoffColor),
      gradientMap: getToonGradientMap(),
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const leftRunoffGeo = createTrackStripGeometry(frames, () => -(wallOffset + 0.6), () => -halfWidth, 0.035);
    const rightRunoffGeo = createTrackStripGeometry(frames, () => halfWidth, () => wallOffset + 0.6, 0.035);

    const leftRunoff = new THREE.Mesh(leftRunoffGeo, runoffMat);
    const rightRunoff = new THREE.Mesh(rightRunoffGeo, runoffMat);
    leftRunoff.receiveShadow = true;
    rightRunoff.receiveShadow = true;
    leftRunoff.castShadow = false;
    rightRunoff.castShadow = false;
    leftRunoff.frustumCulled = false;
    rightRunoff.frustumCulled = false;
    group.add(leftRunoff, rightRunoff);

    // 2. ASFALTO PRINCIPAL — Strictly elevated at y = +0.08 with polygonOffset (-1, -1), strictly opaque FrontSide
    const roadGeo = createTrackStripGeometry(frames, () => -halfWidth, () => halfWidth, 0.08);

    const isWet = circuitMeta.rainIntensity > 0;
    const roadMat = isWet
      ? new THREE.MeshPhongMaterial({
          map: getAsphaltTexture(true),
          specular: new THREE.Color('#93C5FD'),
          shininess: 95,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          depthTest: true,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        })
      : new THREE.MeshToonMaterial({
          map: getAsphaltTexture(false),
          gradientMap: getToonGradientMap(),
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          depthTest: true,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = false;
    roadMesh.frustumCulled = false;
    group.add(roadMesh);

    // 3. PIANOS (KERBS) Y BARRERAS — Strictly opaque FrontSide + recalculated normals
    const kerbColorA = circuitMeta.id === 'abudhabi' ? '#00F5D4' : '#FF2A44';
    const barrierColorA = circuitMeta.id === 'abudhabi' ? '#FF007F' : circuitMeta.id === 'monaco' ? '#FF2A44' : '#2563EB';
    const kerbGeo = new THREE.BoxGeometry(1.45, 0.20, 3.2);
    kerbGeo.computeVertexNormals();
    const barrierGeo = new THREE.BoxGeometry(0.9, 1.45, 4.2);
    barrierGeo.computeVertexNormals();

    const opaqueOpts = {
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide
    };

    const kerbA = new THREE.InstancedMesh(kerbGeo, getToonMaterial(kerbColorA, opaqueOpts), N);
    const kerbB = new THREE.InstancedMesh(kerbGeo, getToonMaterial('#FFFFFF', opaqueOpts), N);
    const barA = new THREE.InstancedMesh(barrierGeo, getToonMaterial(barrierColorA, opaqueOpts), N);
    const barB = new THREE.InstancedMesh(barrierGeo, getToonMaterial('#FFFFFF', opaqueOpts), N);

    kerbA.receiveShadow = true;
    kerbB.receiveShadow = true;
    barA.receiveShadow = true;
    barB.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let ka = 0, kb = 0, ba = 0, bb = 0;

    for (let i = 0; i < N; i += 2) {
      const f = frames[i];
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const isEven = (Math.floor(i / 2) % 2) === 0;
      [-1, 1].forEach(side => {
        const kPos = f.pos.clone().addScaledVector(f.right, side * (halfWidth + 0.68));
        dummy.position.set(kPos.x, 0.14, kPos.z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (isEven) kerbA.setMatrixAt(ka++, dummy.matrix);
        else kerbB.setMatrixAt(kb++, dummy.matrix);

        const bPos = f.pos.clone().addScaledVector(f.right, side * wallOffset);
        dummy.position.set(bPos.x, 0.76, bPos.z);
        dummy.updateMatrix();
        if (isEven) barA.setMatrixAt(ba++, dummy.matrix);
        else barB.setMatrixAt(bb++, dummy.matrix);
      });
    }

    kerbA.count = ka; kerbB.count = kb; barA.count = ba; barB.count = bb;
    kerbA.instanceMatrix.needsUpdate = true; kerbB.instanceMatrix.needsUpdate = true;
    barA.instanceMatrix.needsUpdate = true; barB.instanceMatrix.needsUpdate = true;
    group.add(kerbA, kerbB, barA, barB);
  }

  function buildStartGantry(frame0, trackWidth, circuitMeta, group) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline, getCheckeredTexture } = global.ToonMat;
    const gantry = new THREE.Group();
    gantry.position.copy(frame0.pos);
    gantry.rotation.y = Math.atan2(frame0.tangent.x, frame0.tangent.z);

    // Finish strip sits cleanly above the y = +0.08 asphalt with stronger polygonOffset (-2, -2)
    const finishGeo = new THREE.PlaneGeometry(trackWidth, 3.6);
    finishGeo.computeVertexNormals();
    const finishStrip = new THREE.Mesh(
      finishGeo,
      new THREE.MeshBasicMaterial({
        map: getCheckeredTexture(8, 2),
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
    );
    finishStrip.rotation.x = -Math.PI / 2;
    finishStrip.position.y = 0.095;
    gantry.add(finishStrip);

    const pillarMat = getPlasticGlossMaterial(circuitMeta.themeColor);
    const crossMat = getToonMaterial('#141926');
    const halfSpan = trackWidth * 0.5 + 2.2;

    [-halfSpan, halfSpan].forEach(xPos => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 9.2, 1.8), pillarMat);
      pillar.position.set(xPos, 4.6, 0);
      addCartoonOutline(pillar, [1.08, 1.02, 1.08]);
      gantry.add(pillar);
    });

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(trackWidth + 6.4, 2.2, 2.0), crossMat);
    crossbar.position.set(0, 8.8, 0);
    addCartoonOutline(crossbar, [1.02, 1.1, 1.1]);
    gantry.add(crossbar);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(trackWidth + 5.8, 0.85, 2.15),
      new THREE.MeshBasicMaterial({ map: getCheckeredTexture(12, 1) })
    );
    banner.position.set(0, 10.2, 0);
    gantry.add(banner);

    const bulbs = [];
    const podGeo = new THREE.BoxGeometry(1.3, 1.7, 0.7);
    const bulbGeo = new THREE.SphereGeometry(0.42, 12, 10);
    for (let i = 0; i < 5; i++) {
      const xPos = (i - 2) * 2.1;
      const pod = new THREE.Mesh(podGeo, getToonMaterial('#0F172A'));
      pod.position.set(xPos, 7.6, -0.9);
      gantry.add(pod);

      const bulbMat = new THREE.MeshStandardMaterial({ color: '#252B36', emissive: '#000000', emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(xPos, 7.6, -1.28);
      gantry.add(bulb);
      bulbs.push(bulb);
    }

    group.add(gantry);
    return bulbs;
  }

  function buildAnimatedGrandstands(frames, halfWidth, circuitMeta, group, animators) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;
    const N = frames.length;
    const standIndices = [16, 108, 215, 315, 415, 505];
    const standColors = ['#FF3B5C', '#00B4D8', '#FFD43B', '#FF8000', '#9775FA', '#22C55E'];

    const spectators = [];
    const skinPalette = ['#F6C8A8', '#E6B28A', '#8D5524', '#FAD2B4', '#DEA77E'];
    const shirtPalette = ['#FF3B5C', '#FF8000', '#FFD43B', '#00D2BE', '#3B82F6', '#A855F7', '#22C55E', '#FF4F9A'];

    standIndices.forEach((centerIdx, sIdx) => {
      const f = frames[centerIdx % N];
      for (let k = -18; k <= 18; k++) frames[(centerIdx + k + N) % N].hasGrandstand = true;

      const side = sIdx % 2 === 0 ? 1 : -1;
      const offset = halfWidth + (circuitMeta.id === 'monaco' ? 8.5 : 11.5);
      const standPos = f.pos.clone().addScaledVector(f.right, side * offset);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z) + (side === 1 ? Math.PI / 2 : -Math.PI / 2);

      const stand = new THREE.Group();
      stand.position.set(standPos.x, 0, standPos.z);
      stand.rotation.y = yaw;

      const accentMat = getToonMaterial(standColors[sIdx % standColors.length]);
      const concreteMat = getToonMaterial('#E2E8F0');
      const roofMat = getPlasticGlossMaterial(standColors[(sIdx + 2) % standColors.length]);

      for (let tier = 0; tier < 4; tier++) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(28, 1.3, 2.2), tier % 2 === 0 ? concreteMat : accentMat);
        bench.position.set(0, 0.7 + tier * 1.3, -tier * 2.0);
        stand.add(bench);

        for (let col = -12; col <= 12; col += 2.2) {
          const localPos = new THREE.Vector3(col + (Math.random() - 0.5) * 0.4, 1.75 + tier * 1.3, -tier * 2.0 + 0.2);
          localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          localPos.add(stand.position);
          spectators.push({
            x: localPos.x, y: localPos.y, z: localPos.z,
            phase: Math.random() * Math.PI * 2,
            shirt: shirtPalette[(Math.abs(Math.floor(col * 3)) + sIdx + tier) % shirtPalette.length],
            skin: skinPalette[(Math.abs(Math.floor(col)) + tier) % skinPalette.length]
          });
        }
      }

      const roof = new THREE.Mesh(new THREE.BoxGeometry(30, 0.75, 10.5), roofMat);
      roof.position.set(0, 9.8, -3.2);
      roof.rotation.x = 0.14;
      addCartoonOutline(roof, [1.02, 1.25, 1.04]);
      stand.add(roof);

      [-13.5, 13.5].forEach(px => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.8, 0.9), getToonMaterial('#1E293B'));
        post.position.set(px, 4.9, -7.2);
        stand.add(post);
      });
      group.add(stand);
    });

    const count = spectators.length;
    const bodyInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.85, 0.55), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), count);
    const headInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), count);

    const tmpColor = new THREE.Color();
    const dummy = new THREE.Object3D();
    spectators.forEach((sp, i) => {
      tmpColor.set(sp.shirt); bodyInst.setColorAt(i, tmpColor);
      tmpColor.set(sp.skin); headInst.setColorAt(i, tmpColor);
      dummy.position.set(sp.x, sp.y, sp.z); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(sp.x, sp.y + 0.95, sp.z); dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);
    });
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    if (headInst.instanceColor) headInst.instanceColor.needsUpdate = true;
    group.add(bodyInst, headInst);

    animators.push((dt, elapsed, crowdExcitement = 0.35) => {
      const jumpSpeed = 5.5 + crowdExcitement * 7.5;
      const jumpAmp = 0.25 + crowdExcitement * 0.55;
      for (let i = 0; i < count; i++) {
        const sp = spectators[i];
        const bounce = Math.abs(Math.sin(elapsed * jumpSpeed + sp.phase)) * jumpAmp;
        const headBob = Math.sin(elapsed * jumpSpeed * 1.1 + sp.phase) * 0.22;

        dummy.position.set(sp.x, sp.y + bounce, sp.z);
        dummy.rotation.set(0, 0, headBob * 0.4);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(sp.x, sp.y + 0.95 + bounce * 1.28, sp.z);
        dummy.rotation.set(0, 0, headBob);
        dummy.updateMatrix();
        headInst.setMatrixAt(i, dummy.matrix);
      }
      bodyInst.instanceMatrix.needsUpdate = true;
      headInst.instanceMatrix.needsUpdate = true;
    });
  }

  function buildMonacoLandmarks(frames, halfWidth, group, animators) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;

    // Mediterranean Sea strictly south of z = -176 (zero overlap with ground or track!)
    const seaGeo = new THREE.PlaneGeometry(2600, 1400);
    seaGeo.computeVertexNormals();
    const sea = new THREE.Mesh(
      seaGeo,
      getPlasticGlossMaterial('#00B4D8', {
        shininess: 140,
        specular: '#E0F7FF',
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(100, -0.24, -876); // North edge cleanly meets z = -176
    group.add(sea);

    // Harbor promenade seawall cleanly bordering z = -176 (NEVER crossing the asphalt!)
    const quay = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.95, 5.5), getToonMaterial('#F1E3C6'));
    quay.position.set(120, 0.05, -176);
    quay.receiveShadow = true;
    group.add(quay);

    const yachts = [];
    [
      { x: 115, z: -225, rot: 0.4, color: '#FFFFFF', stripe: '#FF2A44', scale: 1.3 },
      { x: 195, z: -215, rot: -0.3, color: '#FFFFFF', stripe: '#0077FF', scale: 1.5 },
      { x: 265, z: -205, rot: 1.1, color: '#FFFDF5', stripe: '#FFD43B', scale: 1.2 },
      { x: 245, z: -275, rot: 0.2, color: '#FFFFFF', stripe: '#00D2BE', scale: 1.65 },
      { x: 45, z: -245, rot: -0.6, color: '#FFFFFF', stripe: '#FF8000', scale: 1.15 },
      { x: 315, z: -240, rot: 1.5, color: '#FFFFFF', stripe: '#A855F7', scale: 1.35 },
      { x: 155, z: -295, rot: 0.8, color: '#FFFFFF', stripe: '#22C55E', scale: 1.4 },
      { x: -20, z: -260, rot: -0.2, color: '#FFFFFF', stripe: '#FF4F9A', scale: 1.25 }
    ].forEach((yc, idx) => {
      const yacht = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.2, 18), getPlasticGlossMaterial(yc.color));
      hull.position.y = 1.0;
      addCartoonOutline(hull, [1.04, 1.12, 1.02]);
      yacht.add(hull);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.65, 17.5), getToonMaterial(yc.stripe));
      stripe.position.y = 1.6;
      yacht.add(stripe);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.2, 9.5), getPlasticGlossMaterial('#F8FAFC'));
      deck.position.set(0, 3.0, -1.2);
      addCartoonOutline(deck, 1.05);
      yacht.add(deck);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.9, 4.2), getPlasticGlossMaterial('#0EA5E9', { shininess: 180 }));
      glass.position.set(0, 3.2, 1.4);
      yacht.add(glass);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 5.5, 8), getToonMaterial('#E2E8F0'));
      mast.position.set(0, 6.2, -1.5);
      yacht.add(mast);

      yacht.position.set(yc.x, 0.0, yc.z);
      yacht.rotation.y = yc.rot;
      yacht.scale.setScalar(yc.scale);
      group.add(yacht);
      yachts.push({ mesh: yacht, baseX: yc.x, baseZ: yc.z, phase: idx * 1.15, speed: 0.35 + (idx % 3) * 0.14 });
    });

    const pastelPalette = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#FFC6FF', '#FF8FA3', '#FFE5B4'];
    [
      [-45, 35, 24, 34, 20], [-52, 95, 26, 42, 22], [-42, 160, 22, 28, 22],
      [15, 235, 30, 38, 22], [90, 265, 32, 48, 24], [175, 255, 28, 36, 22],
      [235, 195, 26, 44, 24], [248, 125, 24, 34, 20], [245, 55, 26, 38, 20],
      [-65, -25, 26, 36, 22], [-75, -95, 28, 42, 24], [60, 70, 22, 32, 20],
      [85, 130, 20, 28, 18], [88, 15, 22, 26, 20]
    ].forEach(([x, z, w, h, d], idx) => {
      const bGrp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getToonMaterial(pastelPalette[idx % pastelPalette.length]));
      body.position.y = h / 2;
      addCartoonOutline(body, [1.03, 1.02, 1.03]);
      bGrp.add(body);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 2.4, d + 1.4), getToonMaterial('#E76F51'));
      roof.position.y = h + 1.1;
      bGrp.add(roof);

      const winMat = getPlasticGlossMaterial('#1E3A5F');
      const floors = Math.floor(h / 7);
      for (let fl = 1; fl <= floors; fl++) {
        for (let wx = -w * 0.3; wx <= w * 0.3; wx += w * 0.3) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.2, d + 0.5), winMat);
          win.position.set(wx, fl * 6.2, 0);
          bGrp.add(win);
        }
      }
      bGrp.position.set(x, 0, z);
      group.add(bGrp);
    });

    for (let i = 315; i < 351; i += 4) {
      const f = frames[i % frames.length];
      const arch = new THREE.Mesh(new THREE.TorusGeometry(halfWidth + 2.2, 1.35, 8, 16, Math.PI), getToonMaterial('#F1F5F9'));
      arch.position.copy(f.pos);
      arch.rotation.y = Math.atan2(f.tangent.x, f.tangent.z);
      group.add(arch);
    }

    animators.push((dt, elapsed) => {
      sea.position.y = -0.24 + Math.sin(elapsed * 1.4) * 0.05;
      for (let i = 0; i < yachts.length; i++) {
        const y = yachts[i];
        y.mesh.position.y = 0.0 + Math.sin(elapsed * 2.1 + y.phase) * 0.36;
        y.mesh.rotation.z = Math.sin(elapsed * 1.7 + y.phase) * 0.06;
        y.mesh.rotation.x = Math.cos(elapsed * 1.4 + y.phase) * 0.035;
        y.mesh.position.x = y.baseX + Math.sin(elapsed * y.speed + y.phase) * 9.5;
        y.mesh.position.z = y.baseZ + Math.cos(elapsed * y.speed * 0.7 + y.phase) * 6.0;
      }
    });
  }

  function buildSilverstoneLandmarks(frames, halfWidth, group, animators) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;
    const ferrisBase = new THREE.Group();
    ferrisBase.position.set(95, 0, 75);
    group.add(ferrisBase);

    const legMat = getToonMaterial('#E2E8F0');
    [-14, 14].forEach(lx => {
      const legA = new THREE.Mesh(new THREE.BoxGeometry(2.4, 52, 2.4), legMat);
      legA.position.set(lx * 0.45, 25, -8); legA.rotation.z = lx > 0 ? 0.24 : -0.24;
      const legB = new THREE.Mesh(new THREE.BoxGeometry(2.4, 52, 2.4), legMat);
      legB.position.set(lx * 0.45, 25, 8); legB.rotation.z = lx > 0 ? 0.24 : -0.24;
      ferrisBase.add(legA, legB);
    });

    const wheelSpinner = new THREE.Group();
    wheelSpinner.position.set(0, 48, 0);
    ferrisBase.add(wheelSpinner);

    const rimMat = getPlasticGlossMaterial('#FF2A44');
    const rim1 = new THREE.Mesh(new THREE.TorusGeometry(34, 1.35, 10, 32), rimMat); rim1.position.z = -3.2;
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(34, 1.35, 10, 32), rimMat); rim2.position.z = 3.2;
    wheelSpinner.add(rim1, rim2);

    const spokeMat = getToonMaterial('#FFFFFF');
    const gondolaColors = ['#FF3B5C', '#FFD43B', '#38BDF8', '#22C55E', '#A855F7', '#FF8000'];
    const gondolas = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(68, 0.85, 0.85), spokeMat);
      spoke.rotation.z = angle;
      wheelSpinner.add(spoke);

      const gPivot = new THREE.Group();
      gPivot.position.set(Math.cos(angle) * 34, Math.sin(angle) * 34, 0);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.2, 6.2), getPlasticGlossMaterial(gondolaColors[i % gondolaColors.length]));
      pod.position.y = -2.4;
      addCartoonOutline(pod, 1.07);
      gPivot.add(pod);
      wheelSpinner.add(gPivot);
      gondolas.push(gPivot);
    }

    [[-75, 55, 0.2], [-85, 145, -0.15], [135, -265, 0.05], [35, -275, -0.1]].forEach(([x, z, rot]) => {
      const hGrp = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 36, 14, 1, false, 0, Math.PI), getToonMaterial('#CBD5E1'));
      arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2;
      hGrp.add(arch);
      const door = new THREE.Mesh(new THREE.BoxGeometry(26, 11, 1.5), getToonMaterial('#1D4ED8'));
      door.position.set(0, 5.5, 18); hGrp.add(door);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(28, 2.0, 1.7), getToonMaterial('#EF4444'));
      stripe.position.set(0, 11.2, 18.1); hGrp.add(stripe);
      hGrp.position.set(x, 0, z); hGrp.rotation.y = rot;
      group.add(hGrp);
    });

    const trunkMat = getToonMaterial('#7C4A2D');
    const leafMat = getToonMaterial('#22C55E');
    [[-45, -185], [30, 145], [160, 85], [295, -55], [275, 155], [-135, -80], [90, -85], [155, -75]].forEach(([tx, tz]) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 6.5, 8), trunkMat); trunk.position.y = 3.2;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 8), leafMat); crown.position.y = 8.5;
      addCartoonOutline(crown, 1.06);
      t.add(trunk, crown); t.position.set(tx, 0, tz);
      group.add(t);
    });

    const RAIN_COUNT = 550;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 140;
      rainPos[i * 3 + 1] = Math.random() * 48;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainPoints = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#D8F3FF', size: 0.65, transparent: true, opacity: 0.72 }));
    group.add(rainPoints);

    animators.push((dt, elapsed, _exc, playerPos) => {
      wheelSpinner.rotation.z += dt * 0.32;
      for (let i = 0; i < gondolas.length; i++) gondolas[i].rotation.z = -wheelSpinner.rotation.z;
      if (playerPos) rainPoints.position.set(playerPos.x, 0, playerPos.z);
      const posAttr = rainGeo.attributes.position;
      for (let i = 0; i < RAIN_COUNT; i++) {
        let y = posAttr.getY(i) - dt * 44;
        let x = posAttr.getX(i) - dt * 6;
        if (y < 0) { y = 44 + Math.random() * 6; x = (Math.random() - 0.5) * 140; }
        posAttr.setXY(i, x, y);
      }
      posAttr.needsUpdate = true;
    });
  }

  function buildAbuDhabiLandmarks(frames, halfWidth, group, animators) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(72, 32), new THREE.MeshBasicMaterial({ color: '#FF9F43', fog: false }));
    sunDisc.position.set(-280, 92, -460);
    sunDisc.lookAt(0, 20, 0);
    group.add(sunDisc);

    // Yas Marina water strictly south of z = -224 (zero overlap with land or asphalt!)
    const marinaGeo = new THREE.PlaneGeometry(2600, 1300);
    marinaGeo.computeVertexNormals();
    const marina = new THREE.Mesh(
      marinaGeo,
      getPlasticGlossMaterial('#1E3A8A', {
        shininess: 150,
        specular: '#F472B6',
        transparent: false,
        opacity: 1.0,
        depthWrite: true,
        depthTest: true,
        side: THREE.FrontSide
      })
    );
    marina.rotation.x = -Math.PI / 2;
    marina.position.set(80, -0.22, -874);
    group.add(marina);

    const marinaWall = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.9, 4.5), getToonMaterial('#CBD5E1'));
    marinaWall.position.set(80, 0.05, -224);
    group.add(marinaWall);

    const hf = frames[428 % frames.length];
    const hotelGroup = new THREE.Group();
    hotelGroup.position.copy(hf.pos);
    hotelGroup.rotation.y = Math.atan2(hf.tangent.x, hf.tangent.z);

    const hotelBodyMat = getPlasticGlossMaterial('#F8FAFC', { shininess: 140 });
    const neonRibMaterials = [];

    [-halfWidth - 13, halfWidth + 13].forEach(xPos => {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 10.5, 22, 16), hotelBodyMat);
      tower.position.set(xPos, 11, 0);
      addCartoonOutline(tower, 1.04);
      hotelGroup.add(tower);
    });

    for (let i = 0; i < 11; i++) {
      const zOff = (i - 5) * 3.8;
      const mat = new THREE.MeshStandardMaterial({ color: '#00F5D4', emissive: '#00F5D4', emissiveIntensity: 1.5, roughness: 0.2 });
      neonRibMaterials.push(mat);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(halfWidth + 12.5, 0.95, 8, 28, Math.PI), mat);
      arch.position.set(0, 6.5, zOff);
      hotelGroup.add(arch);
    }

    const bridgeWalk = new THREE.Mesh(
      new THREE.BoxGeometry(halfWidth * 2 + 24, 3.8, 12),
      getPlasticGlossMaterial('#1E1B4B', { emissive: '#6D28D9', emissiveIntensity: 0.5 })
    );
    bridgeWalk.position.set(0, 14.5, 0);
    hotelGroup.add(bridgeWalk);
    group.add(hotelGroup);

    const pylonNeonMat = new THREE.MeshBasicMaterial({ color: '#00F5D4' });
    const pylonPostMat = getToonMaterial('#1E293B');
    for (let i = 0; i < frames.length; i += 24) {
      const f = frames[i];
      const pPos = f.pos.clone().addScaledVector(f.right, (i % 48 === 0 ? 1 : -1) * (halfWidth + 5.8));
      const pylon = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 10.5, 0.8), pylonPostMat); post.position.y = 5.2;
      const glowBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.5, 1.1), pylonNeonMat); glowBar.position.y = 9.5;
      pylon.add(post, glowBar); pylon.position.copy(pPos);
      group.add(pylon);
    }

    const palms = [];
    const palmTrunkMat = getToonMaterial('#8B5A2B');
    const palmLeafMat = getToonMaterial('#22C55E');
    [[-25, 45], [-28, 115], [160, 160], [185, 45], [180, -45], [135, -225], [20, -230], [-115, -145], [70, 55], [90, 145], [295, 65], [295, -55]].forEach(([px, pz], idx) => {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.15, 12.5, 8), palmTrunkMat);
      trunk.position.y = 6.2; trunk.rotation.z = 0.08;
      palm.add(trunk);
      const crown = new THREE.Group(); crown.position.set(0.6, 12.4, 0);
      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 6.4), palmLeafMat);
        const a = (f / 6) * Math.PI * 2;
        frond.position.set(Math.sin(a) * 2.8, -0.3, Math.cos(a) * 2.8);
        frond.rotation.y = a; frond.rotation.x = 0.35;
        crown.add(frond);
      }
      palm.add(crown); palm.position.set(px, 0, pz);
      group.add(palm);
      palms.push({ crown, phase: idx * 0.9 });
    });

    const colorTmp = new THREE.Color();
    animators.push((dt, elapsed) => {
      for (let i = 0; i < neonRibMaterials.length; i++) {
        const hue = (elapsed * 0.16 + i * 0.075) % 1;
        colorTmp.setHSL(hue, 0.95, 0.56);
        neonRibMaterials[i].color.copy(colorTmp);
        neonRibMaterials[i].emissive.copy(colorTmp);
      }
      colorTmp.setHSL((elapsed * 0.16) % 1, 0.95, 0.58);
      pylonNeonMat.color.copy(colorTmp);
      for (let i = 0; i < palms.length; i++) {
        palms[i].crown.rotation.z = Math.sin(elapsed * 1.8 + palms[i].phase) * 0.09;
      }
    });
  }

  global.TrackBuilder = { buildCircuitScene };
})(window);
