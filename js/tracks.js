// ============================================================================
// TRACKS.JS — Parche v1.4: 3 Circuitos 3D Enriquecidos y Optimizados (60 FPS)
//             • Muestreo/Proyección Cero-GC (sampleAtDistanceInto, projectPointNearS)
//             • Pianos 3D con Relieve, Barreras de Hormigón + Vallas Metálicas FIA
//             • Protecciones Tecpro Rojas/Blancas, Carteles de Frenada (150/100/50m)
//             • Marcas de Goma Oscura en Frenada, Edificio de Boxes (Pit Lane)
//             • InstancedMesh Masivo para Gradas, Árboles, Postes y Vallas
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

  // Sculpted 3D serrated rumble-strip kerb geometry (angled wedge with corrugated ribs)
  function createReliefKerbGeometry() {
    const geo = new THREE.BoxGeometry(1.52, 0.24, 3.25, 4, 2, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); // -0.76 .. +0.76
      let y = pos.getY(i);   // -0.12 .. +0.12
      const z = pos.getZ(i); // -1.625 .. +1.625
      if (y > 0) {
        // Taper inner edge slightly lower + add 3D serrated rumble grooves along Z
        const edgeSlope = (Math.abs(x) / 0.76) * 0.055;
        const rumble = Math.sin((z / 3.25) * Math.PI * 6) * 0.022;
        y += edgeSlope + rumble;
      }
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Interlocking beveled Tecpro foam barrier block geometry
  function createTecproBlockGeometry() {
    const geo = new THREE.BoxGeometry(1.15, 1.38, 2.85, 2, 2, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y > 0.3) x *= 0.86; // beveled top foam shoulder
      if (Math.abs(y) < 0.2 && Math.abs(z) < 0.5) x *= 0.92; // center energy-absorption recess
      pos.setX(i, x);
    }
    geo.computeVertexNormals();
    return geo;
  }

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

    // Identify heavy braking corners for 150m/100m/50m boards, braking rubber marks & Tecpro zones
    const heavyCorners = detectHeavyBrakingCorners(frames, totalLength);

    const envInfo = buildEnvironmentBackdrop(circuitMeta, group, animators);
    buildTrackRibbon(frames, halfWidth, circuitMeta, group);
    const startLights = buildStartGantry(frames[0], trackWidth, circuitMeta, group);
    buildBrakingZonesAndTecpro(frames, heavyCorners, halfWidth, totalLength, circuitMeta, group);
    buildPitLaneBuilding(frames, halfWidth, circuitMeta, group);
    buildInstancedGrandstands(frames, halfWidth, circuitMeta, group, animators);

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

    // Zero-GC frame sampling into pre-allocated output struct
    function sampleAtDistanceInto(s, out) {
      let wrapped = s % totalLength;
      if (wrapped < 0) wrapped += totalLength;
      const exactIdx = (wrapped / totalLength) * SAMPLES;
      const i0 = Math.floor(exactIdx) % SAMPLES;
      const i1 = (i0 + 1) % SAMPLES;
      const frac = exactIdx - Math.floor(exactIdx);
      const f0 = frames[i0];
      const f1 = frames[i1];

      out.pos.lerpVectors(f0.pos, f1.pos, frac);
      out.tangent.lerpVectors(f0.tangent, f1.tangent, frac).normalize();
      out.right.crossVectors(out.tangent, up).normalize();
      out.curvature = f0.curvature + (f1.curvature - f0.curvature) * frac;
      out.width = trackWidth;
      out.halfWidth = halfWidth;
      out.hasGrandstand = f0.hasGrandstand || f1.hasGrandstand;
      return out;
    }

    // Legacy compatibility wrapper for non-hot callers
    function sampleAtDistance(s) {
      return sampleAtDistanceInto(s, {
        pos: new THREE.Vector3(),
        tangent: new THREE.Vector3(),
        right: new THREE.Vector3(),
        curvature: 0,
        width: trackWidth,
        halfWidth,
        hasGrandstand: false
      });
    }

    // Zero-GC local projection from world (x, z) onto spline near hintS for 100% manual driving
    function projectPointNearS(worldX, worldZ, hintS, out) {
      let wrappedHint = hintS % totalLength;
      if (wrappedHint < 0) wrappedHint += totalLength;
      const centerIdx = Math.floor((wrappedHint / totalLength) * SAMPLES) % SAMPLES;

      let bestDistSq = Infinity;
      let bestI0 = centerIdx;
      let bestT = 0;
      let bestPx = 0;
      let bestPz = 0;

      for (let offset = -24; offset <= 24; offset++) {
        const i0 = (centerIdx + offset + SAMPLES) % SAMPLES;
        const i1 = (i0 + 1) % SAMPLES;
        const a = frames[i0].pos;
        const b = frames[i1].pos;
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz;
        let t = 0;
        if (lenSq > 1e-6) {
          t = ((worldX - a.x) * abx + (worldZ - a.z) * abz) / lenSq;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
        }
        const px = a.x + abx * t;
        const pz = a.z + abz * t;
        const dx = worldX - px;
        const dz = worldZ - pz;
        const distSq = dx * dx + dz * dz;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestI0 = i0;
          bestT = t;
          bestPx = px;
          bestPz = pz;
        }
      }

      const i1 = (bestI0 + 1) % SAMPLES;
      const f0 = frames[bestI0];
      const f1 = frames[i1];

      out.pos.set(bestPx, 0, bestPz);
      out.tangent.lerpVectors(f0.tangent, f1.tangent, bestT).normalize();
      out.right.crossVectors(out.tangent, up).normalize();
      out.curvature = f0.curvature + (f1.curvature - f0.curvature) * bestT;
      out.width = trackWidth;
      out.halfWidth = halfWidth;
      out.hasGrandstand = f0.hasGrandstand || f1.hasGrandstand;

      const sWrapped = ((bestI0 + bestT) / SAMPLES) * totalLength;
      let delta = sWrapped - wrappedHint;
      if (delta > totalLength * 0.5) delta -= totalLength;
      else if (delta < -totalLength * 0.5) delta += totalLength;
      out.s = hintS + delta;
      out.d = (worldX - bestPx) * out.right.x + (worldZ - bestPz) * out.right.z;
      return out;
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
      group, circuitMeta, totalLength, trackWidth, halfWidth, frames, heavyCorners,
      bounds: { minX, maxX, minZ, maxZ },
      skyColor: envInfo.skyColor,
      fogColor: envInfo.fogColor,
      fogDensity: envInfo.fogDensity,
      sunColor: envInfo.sunColor,
      ambientColor: envInfo.ambientColor,
      sampleAtDistance,
      sampleAtDistanceInto,
      projectPointNearS,
      setStartLights,
      update(dt, elapsed, crowdExcitement, playerPos) {
        for (let i = 0; i < animators.length; i++) {
          animators[i](dt, elapsed, crowdExcitement, playerPos);
        }
      }
    };
  }

  // Detect major braking corners (spaced cleanly so 150m/100m/50m boards never clash)
  function detectHeavyBrakingCorners(frames, totalLength) {
    const N = frames.length;
    const candidates = [];
    for (let i = 10; i < N - 10; i++) {
      const c = Math.abs(frames[i].curvature);
      if (c < 0.42) continue;
      let isPeak = true;
      for (let k = -8; k <= 8; k++) {
        if (k !== 0 && Math.abs(frames[(i + k + N) % N].curvature) > c) {
          isPeak = false;
          break;
        }
      }
      if (isPeak) {
        candidates.push({ idx: i, s: frames[i].s, curvature: frames[i].curvature, absCurv: c });
      }
    }
    candidates.sort((a, b) => b.absCurv - a.absCurv);

    const selected = [];
    const minSep = Math.max(110, totalLength * 0.115);
    for (let i = 0; i < candidates.length && selected.length < 5; i++) {
      const cand = candidates[i];
      const tooClose = selected.some(sel => {
        const diff = Math.abs(sel.s - cand.s);
        return Math.min(diff, totalLength - diff) < minSep;
      });
      if (!tooClose) selected.push(cand);
    }
    selected.sort((a, b) => a.s - b.s);
    return selected;
  }

  function buildEnvironmentBackdrop(circuitMeta, group, animators) {
    const { getToonMaterial, setTextureSRGB } = global.ToonMat;
    let skyColor = '#56CCF2', fogColor = '#93D8F8', fogDensity = 0.00105;
    let groundColor = '#4ADE80', sunColor = '#FFFBEB', ambientColor = '#E0F2FE';

    if (circuitMeta.id === 'monaco') {
      skyColor = '#38BDF8'; fogColor = '#9ED8F6'; fogDensity = 0.0009;
      groundColor = '#B49B74'; sunColor = '#FFF5D6'; ambientColor = '#D8F2FF';
    } else if (circuitMeta.id === 'silverstone') {
      skyColor = '#5E82A4'; fogColor = '#93B0CA'; fogDensity = 0.00145;
      groundColor = '#369E52'; sunColor = '#E2F0FF'; ambientColor = '#BDD6EB';
    } else if (circuitMeta.id === 'abudhabi') {
      skyColor = '#3B1D60'; fogColor = '#6E2E68'; fogDensity = 0.0012;
      groundColor = '#D19A5E'; sunColor = '#FFB56B'; ambientColor = '#C084FC';
    }

    const groundMat = getToonMaterial(groundColor, {
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide
    });

    if (circuitMeta.id === 'monaco') {
      const landGeo = new THREE.PlaneGeometry(2600, 1500);
      landGeo.computeVertexNormals();
      const land = new THREE.Mesh(landGeo, groundMat);
      land.rotation.x = -Math.PI / 2;
      land.position.set(100, 0.0, 574);
      land.receiveShadow = true;
      group.add(land);
    } else if (circuitMeta.id === 'abudhabi') {
      const landGeo = new THREE.PlaneGeometry(2600, 1500);
      landGeo.computeVertexNormals();
      const land = new THREE.Mesh(landGeo, groundMat);
      land.rotation.x = -Math.PI / 2;
      land.position.set(80, 0.0, 526);
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

    // Instanced sky clouds (single draw call!)
    const cloudMat = getToonMaterial(circuitMeta.id === 'silverstone' ? '#DCE6F0' : circuitMeta.id === 'abudhabi' ? '#FFB5C2' : '#FFFFFF');
    const cloudPuffGeo = new THREE.SphereGeometry(12, 10, 8);
    const cloudInst = new THREE.InstancedMesh(cloudPuffGeo, cloudMat, 18 * 3);
    const dummy = new THREE.Object3D();
    let ci = 0;
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const dist = 290 + (i % 3) * 85;
      const cx = Math.cos(angle) * dist + 60;
      const cy = 102 + (i % 4) * 20;
      const cz = Math.sin(angle) * dist;
      for (let p = -1; p <= 1; p++) {
        dummy.position.set(cx + p * 11, cy + (p === 0 ? 4 : 0), cz + (p % 2) * 3);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1.2, 0.72, 0.9);
        dummy.updateMatrix();
        cloudInst.setMatrixAt(ci++, dummy.matrix);
      }
    }
    cloudInst.instanceMatrix.needsUpdate = true;
    group.add(cloudInst);
    animators.push((dt) => { cloudInst.rotation.y += dt * 0.008; });

    return { skyColor, fogColor, fogDensity, sunColor, ambientColor };
  }

  // Helper to construct a guaranteed upward-normal (+Y), FrontSide strip along track frames
  function createTrackStripGeometry(frames, innerOffsetFn, outerOffsetFn, yHeight) {
    const N = frames.length;
    const positions = [];
    const uvs = [];
    const indices = [];

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

    for (let i = 0; i < N; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;

      const pushUpTri = (i0, i1, i2) => {
        const x0 = positions[i0 * 3], z0 = positions[i0 * 3 + 2];
        const x1 = positions[i1 * 3], z1 = positions[i1 * 3 + 2];
        const x2 = positions[i2 * 3], z2 = positions[i2 * 3 + 2];
        const crossY = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
        if (crossY >= 0) indices.push(i0, i1, i2);
        else indices.push(i0, i2, i1);
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
    const { getToonMaterial, getToonGradientMap, getAsphaltTexture, getCatchFenceTexture } = global.ToonMat;
    const N = frames.length;
    const wallOffset = circuitMeta.id === 'monaco' ? halfWidth + 2.3 : halfWidth + 4.4;

    // 1. ESCAPATORIAS (RUNOFF SHOULDERS) — Opaque, FrontSide, y = +0.035
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

    const leftRunoffGeo = createTrackStripGeometry(frames, () => -(wallOffset + 0.8), () => -halfWidth, 0.035);
    const rightRunoffGeo = createTrackStripGeometry(frames, () => halfWidth, () => wallOffset + 0.8, 0.035);

    const leftRunoff = new THREE.Mesh(leftRunoffGeo, runoffMat);
    const rightRunoff = new THREE.Mesh(rightRunoffGeo, runoffMat);
    leftRunoff.receiveShadow = true;
    rightRunoff.receiveShadow = true;
    leftRunoff.frustumCulled = false;
    rightRunoff.frustumCulled = false;
    group.add(leftRunoff, rightRunoff);

    // 2. ASFALTO PRINCIPAL — Strictly elevated at y = +0.08 with polygonOffset (-1, -1), opaque FrontSide
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

    // 3. PIANOS (KERBS) BICOLORES CON RELIEVE 3D + MUROS DE HORMIGÓN + VALLAS METÁLICAS FIA (InstancedMesh)
    const kerbColorA = circuitMeta.id === 'abudhabi' ? '#00F5D4' : '#FF2A44';
    const barrierAccent = circuitMeta.id === 'abudhabi' ? '#FF007F' : circuitMeta.id === 'monaco' ? '#FF2A44' : '#2563EB';
    const kerbGeo = createReliefKerbGeometry();
    const concreteWallGeo = new THREE.BoxGeometry(0.92, 1.35, 4.35);
    concreteWallGeo.computeVertexNormals();
    const wallTopCapGeo = new THREE.BoxGeometry(0.98, 0.24, 4.35);
    wallTopCapGeo.computeVertexNormals();
    const fencePostGeo = new THREE.CylinderGeometry(0.085, 0.095, 2.95, 6);
    const fenceMeshGeo = new THREE.PlaneGeometry(8.6, 2.35);

    const opaqueOpts = {
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide
    };

    const kerbA = new THREE.InstancedMesh(kerbGeo, getToonMaterial(kerbColorA, opaqueOpts), N);
    const kerbB = new THREE.InstancedMesh(kerbGeo, getToonMaterial('#FFFFFF', opaqueOpts), N);
    kerbA.name = 'track_kerbs_3d_a';
    kerbB.name = 'track_kerbs_3d_b';

    const concreteBase = new THREE.InstancedMesh(concreteWallGeo, getToonMaterial('#CBD5E1', opaqueOpts), N);
    const wallCapA = new THREE.InstancedMesh(wallTopCapGeo, getToonMaterial(barrierAccent, opaqueOpts), N);
    const wallCapB = new THREE.InstancedMesh(wallTopCapGeo, getToonMaterial('#FFFFFF', opaqueOpts), N);
    const fencePosts = new THREE.InstancedMesh(fencePostGeo, getToonMaterial('#64748B', opaqueOpts), N);
    fencePosts.name = 'track_fia_fence_posts';

    const fenceMat = new THREE.MeshBasicMaterial({
      map: getCatchFenceTexture(),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const fencePanels = new THREE.InstancedMesh(fenceMeshGeo, fenceMat, Math.ceil(N / 2) + 4);
    fencePanels.name = 'track_fia_fence_panels';

    kerbA.receiveShadow = true; kerbB.receiveShadow = true;
    concreteBase.receiveShadow = true; wallCapA.receiveShadow = true; wallCapB.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let ka = 0, kb = 0, cb = 0, wca = 0, wcb = 0, fp = 0, fn = 0;

    for (let i = 0; i < N; i += 2) {
      const f = frames[i];
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const isEven = (Math.floor(i / 2) % 2) === 0;
      const isPitOpening = (i < 24 || i > N - 14); // keep pit wall cleanly separated on right side of start straight

      [-1, 1].forEach(side => {
        const kPos = f.pos.clone().addScaledVector(f.right, side * (halfWidth + 0.68));
        dummy.position.set(kPos.x, 0.145, kPos.z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        if (isEven) kerbA.setMatrixAt(ka++, dummy.matrix);
        else kerbB.setMatrixAt(kb++, dummy.matrix);

        const bPos = f.pos.clone().addScaledVector(f.right, side * wallOffset);
        dummy.position.set(bPos.x, 0.68, bPos.z);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        concreteBase.setMatrixAt(cb++, dummy.matrix);

        dummy.position.set(bPos.x, 1.44, bPos.z);
        dummy.updateMatrix();
        if (isEven) wallCapA.setMatrixAt(wca++, dummy.matrix);
        else wallCapB.setMatrixAt(wcb++, dummy.matrix);

        // FIA metallic catch-fence posts & wire mesh panels on top of concrete barrier
        if (i % 4 === 0 && !(isPitOpening && side === -1)) {
          dummy.position.set(bPos.x, 2.85, bPos.z);
          dummy.rotation.set(0, yaw, 0);
          dummy.updateMatrix();
          fencePosts.setMatrixAt(fp++, dummy.matrix);

          // Wire panel aligned along track tangent
          dummy.position.set(bPos.x, 2.78, bPos.z);
          dummy.rotation.set(0, yaw + Math.PI / 2, 0);
          dummy.updateMatrix();
          if (fn < fencePanels.count) fencePanels.setMatrixAt(fn++, dummy.matrix);
        }
      });
    }

    kerbA.count = ka; kerbB.count = kb;
    concreteBase.count = cb; wallCapA.count = wca; wallCapB.count = wcb;
    fencePosts.count = fp; fencePanels.count = fn;

    [kerbA, kerbB, concreteBase, wallCapA, wallCapB, fencePosts, fencePanels].forEach(im => {
      im.instanceMatrix.needsUpdate = true;
      group.add(im);
    });
  }

  // ==========================================================================
  // CARTELES DE FRENADA (150m/100m/50m), PROTECCIONES TECPRO Y MARCAS DE GOMA
  // ==========================================================================
  function buildBrakingZonesAndTecpro(frames, heavyCorners, halfWidth, totalLength, circuitMeta, group) {
    const {
      getToonMaterial,
      createBrakeBoardTexture,
      getBrakingRubberTexture
    } = global.ToonMat;
    const N = frames.length;
    const wallOffset = circuitMeta.id === 'monaco' ? halfWidth + 2.3 : halfWidth + 4.4;
    const dummy = new THREE.Object3D();

    // Helper: fetch closest frame at distance s
    const frameAtS = (s) => {
      let wrapped = s % totalLength;
      if (wrapped < 0) wrapped += totalLength;
      return frames[Math.floor((wrapped / totalLength) * N) % N];
    };

    // 1. Physical FIA Braking Distance Boards (150m, 100m, 50m) before each heavy braking zone
    const boardDistances = [
      { label: 150, distBefore: 66 },
      { label: 100, distBefore: 44 },
      { label: 50, distBefore: 22 }
    ];
    const boardGeo = new THREE.BoxGeometry(2.6, 1.65, 0.16);
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    const poleMat = getToonMaterial('#334155');
    const backMat = getToonMaterial('#1E293B');

    const boardMats = {};
    boardDistances.forEach(({ label }) => {
      const faceMat = new THREE.MeshBasicMaterial({ map: createBrakeBoardTexture(label), side: THREE.FrontSide });
      // Box faces: +X, -X, +Y, -Y, +Z, -Z (oncoming driver looks along +tangent -> sees -Z face!)
      boardMats[label] = [backMat, backMat, backMat, backMat, faceMat, faceMat];
    });

    const boardGroup = new THREE.Group();
    boardGroup.name = 'track_braking_boards';
    const poleMatrices = [];

    heavyCorners.forEach(corner => {
      const turnSign = Math.sign(corner.curvature || 1);
      // Place braking boards on the OUTSIDE of the corner approach where driver looks!
      const outsideSide = -turnSign;
      const entryS = corner.s - 12;

      boardDistances.forEach(({ label, distBefore }) => {
        const f = frameAtS(entryS - distBefore);
        const yaw = Math.atan2(f.tangent.x, f.tangent.z);
        const bPos = f.pos.clone().addScaledVector(f.right, outsideSide * (wallOffset - 0.55));

        const board = new THREE.Mesh(boardGeo, boardMats[label]);
        board.name = `brake_board_${label}m`;
        board.position.set(bPos.x, 2.35, bPos.z);
        board.rotation.y = yaw;
        boardGroup.add(board);

        [-0.85, 0.85].forEach(px => {
          dummy.position.set(
            bPos.x + f.right.x * px,
            1.1,
            bPos.z + f.right.z * px
          );
          dummy.rotation.set(0, yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poleMatrices.push(dummy.matrix.clone());
        });
      });
    });

    if (poleMatrices.length > 0) {
      const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, poleMatrices.length);
      poleMatrices.forEach((m, idx) => poleInst.setMatrixAt(idx, m));
      poleInst.instanceMatrix.needsUpdate = true;
      boardGroup.add(poleInst);
    }
    group.add(boardGroup);

    // 2. Red & White Tecpro Safety Barriers (InstancedMesh) in outer runoff zones of heavy corners
    const tecproGeo = createTecproBlockGeometry();
    const tecproRed = new THREE.InstancedMesh(tecproGeo, getToonMaterial('#E50914'), 260);
    const tecproWhite = new THREE.InstancedMesh(tecproGeo, getToonMaterial('#F8FAFC'), 260);
    tecproRed.name = 'track_tecpro_red';
    tecproWhite.name = 'track_tecpro_white';
    tecproRed.receiveShadow = true;
    tecproWhite.receiveShadow = true;

    let tr = 0, tw = 0;
    const usedIdx = new Set();
    for (let i = 0; i < N; i += 2) {
      const curv = frames[i].curvature;
      if (Math.abs(curv) < 0.34) continue;
      const outsideSide = -Math.sign(curv);
      const key = `${i}_${outsideSide}`;
      if (usedIdx.has(key)) continue;
      usedIdx.add(key);

      const f = frames[i];
      const yaw = Math.atan2(f.tangent.x, f.tangent.z);
      const tPos = f.pos.clone().addScaledVector(f.right, outsideSide * (wallOffset - 0.95));
      dummy.position.set(tPos.x, 0.72, tPos.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      if (((i >> 1) % 2) === 0 && tr < 260) tecproRed.setMatrixAt(tr++, dummy.matrix);
      else if (tw < 260) tecproWhite.setMatrixAt(tw++, dummy.matrix);
    }
    tecproRed.count = tr;
    tecproWhite.count = tw;
    tecproRed.instanceMatrix.needsUpdate = true;
    tecproWhite.instanceMatrix.needsUpdate = true;
    group.add(tecproRed, tecproWhite);

    // 3. Dark Rubber Braking Skid-Marks along the ideal braking entry line
    const rubberMat = new THREE.MeshBasicMaterial({
      map: getBrakingRubberTexture(),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const rubberGroup = new THREE.Group();
    rubberGroup.name = 'track_braking_rubber_marks';

    heavyCorners.forEach(corner => {
      const turnSign = Math.sign(corner.curvature || 1);
      const outsideD = -turnSign * (halfWidth * 0.56);
      const apexD = turnSign * (halfWidth * 0.45);
      const steps = 14;
      const startS = corner.s - 48;
      const endS = corner.s - 2;

      const positions = [];
      const uvs = [];
      const indices = [];
      const stripHalfW = 1.65;

      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const s = startS + (endS - startS) * t;
        const f = frameAtS(s);
        // Stay on outside braking line, then smoothly blend toward inside apex in final 30%
        const blend = t < 0.65 ? 0 : Math.pow((t - 0.65) / 0.35, 1.6);
        const centerD = THREE.MathUtils.lerp(outsideD, apexD, blend);
        const pL = f.pos.clone().addScaledVector(f.right, centerD - stripHalfW);
        const pR = f.pos.clone().addScaledVector(f.right, centerD + stripHalfW);
        positions.push(pL.x, 0.088, pL.z, pR.x, 0.088, pR.z);
        uvs.push(0, t, 1, t);
      }

      for (let k = 0; k < steps; k++) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
        const pushUp = (i0, i1, i2) => {
          const crossY = (positions[i1 * 3 + 2] - positions[i0 * 3 + 2]) * (positions[i2 * 3] - positions[i0 * 3])
            - (positions[i1 * 3] - positions[i0 * 3]) * (positions[i2 * 3 + 2] - positions[i0 * 3 + 2]);
          if (crossY >= 0) indices.push(i0, i1, i2);
          else indices.push(i0, i2, i1);
        };
        pushUp(a, b, c);
        pushUp(b, d, c);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, rubberMat);
      mesh.renderOrder = 1;
      rubberGroup.add(mesh);
    });
    group.add(rubberGroup);
  }

  // ==========================================================================
  // EDIFICIO DE BOXES (PIT LANE + GARAJES + TORRE DE CONTROL)
  // ==========================================================================
  function buildPitLaneBuilding(frames, halfWidth, circuitMeta, group) {
    const { getToonMaterial, getPlasticGlossMaterial, createPitSignTexture } = global.ToonMat;
    const f0 = frames[0];
    const yaw = Math.atan2(f0.tangent.x, f0.tangent.z);

    // Position Pit Complex cleanly along the left side (-right) of the Start/Finish straight,
    // rotated +PI so local +X (garages, glass gallery & PIT LANE sign) faces directly onto the grid!
    const pitGroup = new THREE.Group();
    pitGroup.name = 'track_pit_lane_building';
    const sideOffset = -(halfWidth + (circuitMeta.id === 'monaco' ? 12.8 : 15.2));
    const anchor = f0.pos.clone().addScaledVector(f0.right, sideOffset);
    pitGroup.position.set(anchor.x, 0, anchor.z);
    pitGroup.rotation.y = yaw + Math.PI;

    // Pit Lane asphalt apron strip (y = +0.055 strictly below track asphalt +0.08, above terrain 0.0)
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 78),
      getToonMaterial('#2B3444', {
        transparent: false, opacity: 1.0, depthWrite: true, depthTest: true, side: THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(4.8, 0.055, 8);
    apron.receiveShadow = true;
    pitGroup.add(apron);

    // Pit speed-limit guide stripe
    const pitLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 74),
      new THREE.MeshBasicMaterial({ color: '#FFD43B', polygonOffset: true, polygonOffsetFactor: -2 })
    );
    pitLine.rotation.x = -Math.PI / 2;
    pitLine.position.set(7.6, 0.062, 8);
    pitGroup.add(pitLine);

    // Main two-story F1 Pit Building structure
    const bodyMat = getToonMaterial('#E2E8F0');
    const darkMat = getToonMaterial('#1E293B');
    const glassMat = getPlasticGlossMaterial('#0EA5E9', { shininess: 160 });
    const accentMat = getToonMaterial(circuitMeta.themeColor);

    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(10.2, 11.5, 68), bodyMat);
    mainHall.position.set(-4.8, 5.75, 8);
    mainHall.castShadow = true;
    mainHall.receiveShadow = true;
    pitGroup.add(mainHall);

    // Overhanging Pit Canopy Roof + Red/Cyan Pit Lane Sign Banner facing the track
    const roof = new THREE.Mesh(new THREE.BoxGeometry(13.6, 1.15, 70), darkMat);
    roof.position.set(-3.4, 11.9, 8);
    pitGroup.add(roof);

    const pitBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 2.3),
      new THREE.MeshBasicMaterial({ map: createPitSignTexture(circuitMeta.name), side: THREE.FrontSide })
    );
    pitBanner.rotation.y = Math.PI / 2;
    pitBanner.position.set(3.48, 11.9, 8);
    pitGroup.add(pitBanner);

    // Upper Paddock Club continuous panoramic glass gallery
    const paddockGlass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 64), glassMat);
    paddockGlass.position.set(0.45, 8.2, 8);
    pitGroup.add(paddockGlass);

    // 8 Multi-Bay Team Garages (recessed dark bay doors + colorful team headers)
    const teamHeaders = ['#FF8000', '#DC0000', '#0600EF', '#00D2BE', '#006F62', '#005AFF', '#FF87BC', '#22C55E'];
    const bayDoorGeo = new THREE.BoxGeometry(0.45, 4.1, 6.2);
    const bayHeaderGeo = new THREE.BoxGeometry(0.65, 1.15, 6.8);
    for (let b = 0; b < 8; b++) {
      const bz = -20 + b * 8.0;
      const door = new THREE.Mesh(bayDoorGeo, darkMat);
      door.position.set(0.45, 2.05, bz);
      pitGroup.add(door);

      const header = new THREE.Mesh(bayHeaderGeo, getToonMaterial(teamHeaders[b % teamHeaders.length]));
      header.position.set(0.52, 4.65, bz);
      pitGroup.add(header);
    }

    // Race Control Tower overlooking the start/finish gantry
    const towerBase = new THREE.Mesh(new THREE.BoxGeometry(6.8, 17.5, 8.2), darkMat);
    towerBase.position.set(-4.2, 8.75, -29.5);
    towerBase.castShadow = true;
    pitGroup.add(towerBase);

    const towerGlass = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.6, 8.8), glassMat);
    towerGlass.position.set(-4.2, 15.2, -29.5);
    pitGroup.add(towerGlass);

    const towerTrim = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.85, 9.2), accentMat);
    towerTrim.position.set(-4.2, 17.5, -29.5);
    pitGroup.add(towerTrim);

    group.add(pitGroup);
  }

  function buildStartGantry(frame0, trackWidth, circuitMeta, group) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline, getCheckeredTexture } = global.ToonMat;
    const gantry = new THREE.Group();
    gantry.name = 'track_start_gantry';
    gantry.position.copy(frame0.pos);
    gantry.rotation.y = Math.atan2(frame0.tangent.x, frame0.tangent.z);

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

  // ==========================================================================
  // TRIBUNAS INSTANCIADAS (InstancedMesh) + PÚBLICO ESTILIZADO ANIMADO
  // ==========================================================================
  function buildInstancedGrandstands(frames, halfWidth, circuitMeta, group, animators) {
    const { getToonMaterial } = global.ToonMat;
    const N = frames.length;
    const standIndices = [16, 108, 215, 315, 415, 505];
    const standColors = ['#FF3B5C', '#00B4D8', '#FFD43B', '#FF8000', '#9775FA', '#22C55E'];

    const spectators = [];
    const skinPalette = ['#F6C8A8', '#E6B28A', '#8D5524', '#FAD2B4', '#DEA77E'];
    const shirtPalette = ['#FF3B5C', '#FF8000', '#FFD43B', '#00D2BE', '#3B82F6', '#A855F7', '#22C55E', '#FF4F9A'];

    // InstancedMeshes for all repeated grandstand structures (benches, roofs, pillars!)
    const standCount = standIndices.length;
    const benchInst = new THREE.InstancedMesh(new THREE.BoxGeometry(28, 1.3, 2.2), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), standCount * 4);
    const roofInst = new THREE.InstancedMesh(new THREE.BoxGeometry(30, 0.75, 10.5), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), standCount);
    const pillarInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 9.8, 0.9), getToonMaterial('#1E293B'), standCount * 2);
    benchInst.name = 'track_grandstands_benches';
    roofInst.name = 'track_grandstands_roofs';
    pillarInst.name = 'track_grandstands_pillars';
    benchInst.receiveShadow = true;

    const tmpCol = new THREE.Color();
    const dummy = new THREE.Object3D();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const localVec = new THREE.Vector3();
    let bi = 0, ri = 0, pi = 0;

    standIndices.forEach((centerIdx, sIdx) => {
      const f = frames[centerIdx % N];
      for (let k = -18; k <= 18; k++) frames[(centerIdx + k + N) % N].hasGrandstand = true;

      // Put first grandstand on right (+1) cleanly opposite the Pit Lane building (-1)
      const side = sIdx === 0 ? 1 : (sIdx % 2 === 0 ? 1 : -1);
      const offset = halfWidth + (circuitMeta.id === 'monaco' ? 8.5 : 11.5);
      const standPos = f.pos.clone().addScaledVector(f.right, side * offset);
      const yaw = Math.atan2(f.tangent.x, f.tangent.z) + (side === 1 ? Math.PI / 2 : -Math.PI / 2);

      for (let tier = 0; tier < 4; tier++) {
        localVec.set(0, 0.7 + tier * 1.3, -tier * 2.0).applyAxisAngle(upAxis, yaw).add(standPos);
        dummy.position.copy(localVec);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        benchInst.setMatrixAt(bi, dummy.matrix);
        tmpCol.set(tier % 2 === 0 ? '#E2E8F0' : standColors[sIdx % standColors.length]);
        benchInst.setColorAt(bi, tmpCol);
        bi++;

        for (let col = -12; col <= 12; col += 2.2) {
          localVec.set(col + (Math.random() - 0.5) * 0.4, 1.75 + tier * 1.3, -tier * 2.0 + 0.2)
            .applyAxisAngle(upAxis, yaw)
            .add(standPos);
          spectators.push({
            x: localVec.x, y: localVec.y, z: localVec.z,
            phase: Math.random() * Math.PI * 2,
            shirt: shirtPalette[(Math.abs(Math.floor(col * 3)) + sIdx + tier) % shirtPalette.length],
            skin: skinPalette[(Math.abs(Math.floor(col)) + tier) % skinPalette.length]
          });
        }
      }

      // Canopy roof
      localVec.set(0, 9.8, -3.2).applyAxisAngle(upAxis, yaw).add(standPos);
      dummy.position.copy(localVec);
      dummy.rotation.set(0, yaw, 0);
      dummy.rotateX(0.14);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roofInst.setMatrixAt(ri, dummy.matrix);
      tmpCol.set(standColors[(sIdx + 2) % standColors.length]);
      roofInst.setColorAt(ri, tmpCol);
      ri++;

      // Twin support pillars
      [-13.5, 13.5].forEach(px => {
        localVec.set(px, 4.9, -7.2).applyAxisAngle(upAxis, yaw).add(standPos);
        dummy.position.copy(localVec);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pillarInst.setMatrixAt(pi++, dummy.matrix);
      });
    });

    benchInst.instanceMatrix.needsUpdate = true;
    roofInst.instanceMatrix.needsUpdate = true;
    pillarInst.instanceMatrix.needsUpdate = true;
    if (benchInst.instanceColor) benchInst.instanceColor.needsUpdate = true;
    if (roofInst.instanceColor) roofInst.instanceColor.needsUpdate = true;
    group.add(benchInst, roofInst, pillarInst);

    // Animated Stylized Spectators (InstancedMesh, zero per-frame allocations)
    const count = spectators.length;
    const bodyInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.85, 0.55), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), count);
    const headInst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshToonMaterial({ color: '#FFFFFF' }), count);

    spectators.forEach((sp, i) => {
      tmpCol.set(sp.shirt); bodyInst.setColorAt(i, tmpCol);
      tmpCol.set(sp.skin); headInst.setColorAt(i, tmpCol);
      dummy.position.set(sp.x, sp.y, sp.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);
      dummy.position.set(sp.x, sp.y + 0.95, sp.z); dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);
    });
    if (bodyInst.instanceColor) bodyInst.instanceColor.needsUpdate = true;
    if (headInst.instanceColor) headInst.instanceColor.needsUpdate = true;
    group.add(bodyInst, headInst);

    const animDummy = new THREE.Object3D();
    animators.push((dt, elapsed, crowdExcitement = 0.35) => {
      const jumpSpeed = 5.5 + crowdExcitement * 7.5;
      const jumpAmp = 0.25 + crowdExcitement * 0.55;
      for (let i = 0; i < count; i++) {
        const sp = spectators[i];
        const bounce = Math.abs(Math.sin(elapsed * jumpSpeed + sp.phase)) * jumpAmp;
        const headBob = Math.sin(elapsed * jumpSpeed * 1.1 + sp.phase) * 0.22;

        animDummy.position.set(sp.x, sp.y + bounce, sp.z);
        animDummy.rotation.set(0, 0, headBob * 0.4);
        animDummy.scale.set(1, 1, 1);
        animDummy.updateMatrix();
        bodyInst.setMatrixAt(i, animDummy.matrix);

        animDummy.position.set(sp.x, sp.y + 0.95 + bounce * 1.28, sp.z);
        animDummy.rotation.set(0, 0, headBob);
        animDummy.updateMatrix();
        headInst.setMatrixAt(i, animDummy.matrix);
      }
      bodyInst.instanceMatrix.needsUpdate = true;
      headInst.instanceMatrix.needsUpdate = true;
    });
  }

  // Helper: Instanced Palm Tree Grove (shared by Monaco & Abu Dhabi)
  function addInstancedPalmTrees(coords, group, leafColor = '#22C55E', trunkColor = '#8B5A2B') {
    const { getToonMaterial } = global.ToonMat;
    const n = coords.length;
    if (!n) return;
    const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.58, 1.08, 11.5, 7), getToonMaterial(trunkColor), n);
    const frondInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.55, 0.35, 6.2), getToonMaterial(leafColor), n * 6);
    trunkInst.name = 'track_instanced_palms_trunks';
    frondInst.name = 'track_instanced_palms_fronds';

    const dummy = new THREE.Object3D();
    let fi = 0;
    coords.forEach(([px, pz, scale = 1.0], idx) => {
      const rotBase = idx * 0.85;
      dummy.position.set(px, 5.6 * scale, pz);
      dummy.rotation.set(0, rotBase, 0.08);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      for (let f = 0; f < 6; f++) {
        const a = rotBase + (f / 6) * Math.PI * 2;
        dummy.position.set(
          px + Math.sin(a) * 2.6 * scale + 0.45 * scale,
          11.2 * scale,
          pz + Math.cos(a) * 2.6 * scale
        );
        dummy.rotation.set(0, a, 0);
        dummy.rotateX(0.36);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        frondInst.setMatrixAt(fi++, dummy.matrix);
      }
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    frondInst.instanceMatrix.needsUpdate = true;
    group.add(trunkInst, frondInst);
  }

  function buildMonacoLandmarks(frames, halfWidth, group, animators) {
    const { getToonMaterial, getPlasticGlossMaterial, addCartoonOutline } = global.ToonMat;

    // Mediterranean Sea strictly south of z = -176
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
    sea.position.set(100, -0.24, -876);
    group.add(sea);

    const quay = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.95, 5.5), getToonMaterial('#F1E3C6'));
    quay.position.set(120, 0.05, -176);
    quay.receiveShadow = true;
    group.add(quay);

    // Instanced Mediterranean Palms & Cypresses along harbor & Riviera hillsides
    addInstancedPalmTrees([
      [-18, -166, 0.95], [22, -168, 1.05], [62, -167, 1.0], [108, -169, 1.1],
      [152, -167, 1.0], [198, -168, 1.05], [232, -142, 0.95], [225, -80, 0.95],
      [218, 15, 1.0], [132, 168, 0.92], [58, 195, 1.02], [-26, 132, 0.95],
      [-32, -62, 0.92], [52, -55, 0.96]
    ], group, '#16A34A', '#8B5A2B');

    const cypCoords = [
      [-55, 65], [-58, 130], [-20, 215], [52, 240], [140, 238],
      [215, 220], [242, 85], [222, -15], [112, 95], [48, 118],
      [-55, -70], [-45, -148], [130, -58], [62, -18]
    ];
    const cypTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.65, 3.2, 6), getToonMaterial('#6B4423'), cypCoords.length);
    const cypCrown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 12.5, 7), getToonMaterial('#15803D'), cypCoords.length);
    cypCrown.name = 'track_instanced_cypresses';
    const dummy = new THREE.Object3D();
    cypCoords.forEach(([cx, cz], idx) => {
      const sc = 0.85 + (idx % 3) * 0.16;
      dummy.position.set(cx, 1.6 * sc, cz);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      cypTrunk.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(cx, 8.2 * sc, cz);
      dummy.updateMatrix();
      cypCrown.setMatrixAt(idx, dummy.matrix);
    });
    cypTrunk.instanceMatrix.needsUpdate = true;
    cypCrown.instanceMatrix.needsUpdate = true;
    group.add(cypTrunk, cypCrown);

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
      [-52, 55, 24, 34, 20], [-56, 112, 26, 42, 22], [-42, 165, 22, 28, 22],
      [15, 235, 30, 38, 22], [90, 265, 32, 48, 24], [175, 255, 28, 36, 22],
      [235, 195, 26, 44, 24], [248, 125, 24, 34, 20], [245, 55, 26, 38, 20],
      [-72, -32, 26, 36, 22], [-75, -95, 28, 42, 24], [60, 70, 22, 32, 20],
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

    // Instanced Monaco Tunnel Arches
    const archIndices = [];
    for (let i = 315; i < 351; i += 4) archIndices.push(i);
    const archInst = new THREE.InstancedMesh(new THREE.TorusGeometry(halfWidth + 2.2, 1.35, 8, 16, Math.PI), getToonMaterial('#F1F5F9'), archIndices.length);
    archIndices.forEach((fi, idx) => {
      const f = frames[fi % frames.length];
      dummy.position.copy(f.pos);
      dummy.rotation.set(0, Math.atan2(f.tangent.x, f.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      archInst.setMatrixAt(idx, dummy.matrix);
    });
    archInst.instanceMatrix.needsUpdate = true;
    group.add(archInst);

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

    [[-82, 55, 0.2], [-88, 145, -0.15], [135, -265, 0.05], [35, -275, -0.1]].forEach(([x, z, rot]) => {
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

    // Instanced British Oak & Conifer Forest (36 trees in only 3 InstancedMeshes!)
    const oakCoords = [
      [-45, -185], [30, 145], [160, 85], [295, -55], [275, 155], [-135, -80], [90, -85], [155, -75],
      [-32, 245], [82, 275], [195, 238], [268, 200], [302, 55], [292, -135], [225, -205],
      [155, -245], [-92, -238], [-145, -155], [-128, -22], [45, -115], [138, 158], [62, 148]
    ];
    const pineCoords = [
      [-55, -172], [44, 158], [176, 98], [308, -32], [286, 138], [-142, -96], [106, -98],
      [-12, 260], [115, 282], [218, 224], [312, 12], [272, -162], [-68, -252], [-132, -195]
    ];
    const dummy = new THREE.Object3D();
    const trunkMat = getToonMaterial('#7C4A2D');
    const oakLeafMat = getToonMaterial('#22C55E');
    const pineLeafMat = getToonMaterial('#15803D');

    const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.0, 1.45, 6.2, 7), trunkMat, oakCoords.length + pineCoords.length);
    const oakCrownInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(5.2, 1), oakLeafMat, oakCoords.length);
    const pineCrownInst = new THREE.InstancedMesh(new THREE.ConeGeometry(4.4, 13.5, 7), pineLeafMat, pineCoords.length);
    oakCrownInst.name = 'track_instanced_oaks';
    pineCrownInst.name = 'track_instanced_pines';

    let ti = 0;
    oakCoords.forEach(([tx, tz], idx) => {
      const sc = 0.85 + (idx % 4) * 0.14;
      dummy.position.set(tx, 3.1 * sc, tz); dummy.rotation.set(0, idx * 0.6, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      trunkInst.setMatrixAt(ti++, dummy.matrix);
      dummy.position.set(tx, 8.2 * sc, tz); dummy.scale.set(sc * 1.08, sc * 0.92, sc); dummy.updateMatrix();
      oakCrownInst.setMatrixAt(idx, dummy.matrix);
    });
    pineCoords.forEach(([tx, tz], idx) => {
      const sc = 0.88 + (idx % 3) * 0.16;
      dummy.position.set(tx, 3.1 * sc, tz); dummy.rotation.set(0, idx * 0.9, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
      trunkInst.setMatrixAt(ti++, dummy.matrix);
      dummy.position.set(tx, 9.8 * sc, tz); dummy.scale.setScalar(sc); dummy.updateMatrix();
      pineCrownInst.setMatrixAt(idx, dummy.matrix);
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    oakCrownInst.instanceMatrix.needsUpdate = true;
    pineCrownInst.instanceMatrix.needsUpdate = true;
    group.add(trunkInst, oakCrownInst, pineCrownInst);

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

    // Yas Marina water strictly south of z = -224
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

    // Instanced Neon Light Pylons (2 draw calls instead of 48!)
    const pylonIndices = [];
    for (let i = 0; i < frames.length; i += 24) pylonIndices.push(i);
    const pylonNeonMat = new THREE.MeshBasicMaterial({ color: '#00F5D4' });
    const pylonPostInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 10.5, 0.8), getToonMaterial('#1E293B'), pylonIndices.length);
    const pylonGlowInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 3.5, 1.1), pylonNeonMat, pylonIndices.length);
    pylonPostInst.name = 'track_instanced_pylons';

    const dummy = new THREE.Object3D();
    pylonIndices.forEach((fi, idx) => {
      const f = frames[fi];
      const pPos = f.pos.clone().addScaledVector(f.right, (fi % 48 === 0 ? 1 : -1) * (halfWidth + 5.8));
      dummy.position.set(pPos.x, 5.2, pPos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pylonPostInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(pPos.x, 9.5, pPos.z);
      dummy.updateMatrix();
      pylonGlowInst.setMatrixAt(idx, dummy.matrix);
    });
    pylonPostInst.instanceMatrix.needsUpdate = true;
    pylonGlowInst.instanceMatrix.needsUpdate = true;
    group.add(pylonPostInst, pylonGlowInst);

    // Instanced Yas Marina Palm Groves
    addInstancedPalmTrees([
      [-32, 65, 1.05], [-34, 130, 1.0], [160, 160, 1.1], [185, 45, 1.0],
      [180, -45, 1.08], [135, -212, 1.12], [20, -214, 1.05], [-115, -145, 1.0],
      [70, 55, 1.0], [90, 145, 1.08], [295, 65, 1.1], [295, -55, 1.02],
      [210, -212, 1.06], [-55, -212, 1.0], [15, 255, 1.04], [245, 210, 1.08]
    ], group, '#22C55E', '#8B5A2B');

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
    });
  }

  global.TrackBuilder = { buildCircuitScene };
})(window);
