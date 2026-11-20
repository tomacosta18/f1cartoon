// ============================================================================
// TOONMATERIALS.JS — Cel-Shading, Outlines, Visera Polarizada PBR (v1.1)
//                    y Texturas de Asfalto / Dorsales / Estudio
// ============================================================================
(function (global) {
  'use strict';

  let _toonGradient = null;
  let _checkeredTex = null;
  let _asphaltTex = null;
  let _wetAsphaltTex = null;
  let _visorEnvMap = null;
  let _studGeo = null;
  const _toonCache = new Map();
  const _outlineMatCache = new Map();
  const _plateCache = new Map();
  const _dorsalCache = new Map();
  const _visorCache = new Map();

  function setTextureSRGB(tex) {
    if (!global.THREE || !tex) return;
    if ('colorSpace' in tex && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
      tex.encoding = THREE.sRGBEncoding;
    }
  }

  function mixHexColors(hexA, hexB, t = 0.5) {
    const a = new THREE.Color(hexA);
    const b = new THREE.Color(hexB);
    a.lerp(b, t);
    return '#' + a.getHexString();
  }

  function isLightColor(hex) {
    const c = new THREE.Color(hex);
    return (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 0.68;
  }

  function getToonGradientMap() {
    if (_toonGradient) return _toonGradient;
    const colors = new Uint8Array([
      118, 118, 118, 255,
      182, 182, 182, 255,
      230, 230, 230, 255,
      255, 255, 255, 255
    ]);
    const tex = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    _toonGradient = tex;
    return tex;
  }

  function getToonMaterial(color, opts = {}) {
    const transparent = !!opts.transparent;
    const opacity = transparent ? (opts.opacity ?? 1.0) : 1.0;
    const depthWrite = opts.depthWrite !== undefined ? !!opts.depthWrite : !transparent;
    const depthTest = opts.depthTest !== undefined ? !!opts.depthTest : true;
    const side = opts.side ?? THREE.FrontSide;
    const polygonOffset = !!opts.polygonOffset;
    const polygonOffsetFactor = opts.polygonOffsetFactor ?? 0;
    const polygonOffsetUnits = opts.polygonOffsetUnits ?? 0;

    const key = JSON.stringify({
      c: color,
      e: opts.emissive || null,
      ei: opts.emissiveIntensity || 0,
      t: transparent,
      o: opacity,
      dw: depthWrite,
      dt: depthTest,
      s: side,
      po: polygonOffset,
      pof: polygonOffsetFactor,
      pou: polygonOffsetUnits
    });
    if (_toonCache.has(key)) return _toonCache.get(key);

    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: getToonGradientMap(),
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity || 0,
      transparent,
      opacity,
      depthWrite,
      depthTest,
      side,
      polygonOffset,
      polygonOffsetFactor,
      polygonOffsetUnits
    });
    _toonCache.set(key, mat);
    return mat;
  }

  function getPlasticGlossMaterial(color, opts = {}) {
    return new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      specular: new THREE.Color(opts.specular || '#ffffff'),
      shininess: opts.shininess ?? 115,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity || 0,
      transparent: !!opts.transparent,
      opacity: opts.transparent ? (opts.opacity ?? 1.0) : 1.0,
      depthWrite: opts.depthWrite !== undefined ? !!opts.depthWrite : !opts.transparent,
      depthTest: opts.depthTest !== undefined ? !!opts.depthTest : true,
      side: opts.side ?? THREE.FrontSide,
      polygonOffset: !!opts.polygonOffset,
      polygonOffsetFactor: opts.polygonOffsetFactor ?? 0,
      polygonOffsetUnits: opts.polygonOffsetUnits ?? 0,
      flatShading: false
    });
  }

  // Procedural reflective cubemap so metallic polarized helmet visors gleam naturally
  function getVisorEnvMap() {
    if (_visorEnvMap) return _visorEnvMap;
    const faces = [];
    for (let f = 0; f < 6; f++) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');

      if (f === 2) {
        // Top (+Y): bright sky + studio softbox ring
        const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 72);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.45, '#93C5FD');
        grad.addColorStop(1, '#1E3A8A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
      } else if (f === 3) {
        // Bottom (-Y): dark track reflection
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(0, 0, 128, 128);
      } else {
        // Sides: bright horizon sky + specular light bands + dark asphalt below
        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0.0, '#38BDF8');
        grad.addColorStop(0.28, '#E0F2FE');
        grad.addColorStop(0.42, '#FFFFFF');
        grad.addColorStop(0.50, '#FDE68A');
        grad.addColorStop(0.56, '#334155');
        grad.addColorStop(1.0, '#0F172A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        // Crisp studio reflection streak
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fillRect(14, 24, 100, 10);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
        ctx.fillRect(0, 44, 128, 5);
      }
      faces.push(c);
    }

    const cubeTex = new THREE.CubeTexture(faces);
    setTextureSRGB(cubeTex);
    cubeTex.needsUpdate = true;
    _visorEnvMap = cubeTex;
    return cubeTex;
  }

  // Visera polarizada reflectante (estrictamente metalness: 0.9, roughness: 0.1)
  function getVisorMaterial(color = '#111827') {
    const key = String(color).toUpperCase();
    if (_visorCache.has(key)) return _visorCache.get(key);

    // Lighten ultra-dark visor hexes subtly in reflection tint while keeping rich polarized look
    const baseCol = new THREE.Color(color);
    const hsl = {};
    baseCol.getHSL(hsl);
    const tinted = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.15), Math.max(0.24, Math.min(0.68, hsl.l + 0.16)));

    const mat = new THREE.MeshStandardMaterial({
      color: tinted,
      metalness: 0.9,
      roughness: 0.1,
      envMap: getVisorEnvMap(),
      envMapIntensity: 1.45,
      emissive: baseCol.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.65,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide
    });
    _visorCache.set(key, mat);
    return mat;
  }

  function getOutlineMaterial(color = '#0B0F1A') {
    if (_outlineMatCache.has(color)) return _outlineMatCache.get(color);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.BackSide,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true
    });
    _outlineMatCache.set(color, mat);
    return mat;
  }

  function addCartoonOutline(mesh, scaleOffset = 1.07, color = '#0B0F1A') {
    const outline = new THREE.Mesh(mesh.geometry, getOutlineMaterial(color));
    if (typeof scaleOffset === 'number') {
      outline.scale.setScalar(scaleOffset);
    } else {
      outline.scale.set(scaleOffset[0], scaleOffset[1], scaleOffset[2]);
    }
    outline.castShadow = false;
    outline.receiveShadow = false;
    mesh.add(outline);
    return outline;
  }

  function createLegoStudRow(count, color, spacing = 0.28) {
    if (!_studGeo) _studGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12);
    const grp = new THREE.Group();
    const mat = getPlasticGlossMaterial(color, { shininess: 130 });
    const start = -((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      const stud = new THREE.Mesh(_studGeo, mat);
      stud.position.x = start + i * spacing;
      grp.add(stud);
    }
    return grp;
  }

  function getCheckeredTexture(repeatX = 4, repeatY = 2) {
    if (!_checkeredTex) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const size = 32;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#FFFFFF' : '#111827';
          ctx.fillRect(x * size, y * size, size, size);
        }
      }
      _checkeredTex = new THREE.CanvasTexture(canvas);
      _checkeredTex.wrapS = THREE.RepeatWrapping;
      _checkeredTex.wrapT = THREE.RepeatWrapping;
      setTextureSRGB(_checkeredTex);
    }
    const tex = _checkeredTex.clone();
    tex.repeat.set(repeatX, repeatY);
    tex.needsUpdate = true;
    return tex;
  }

  function getAsphaltTexture(isWet = false) {
    if (isWet && _wetAsphaltTex) return _wetAsphaltTex;
    if (!isWet && _asphaltTex) return _asphaltTex;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = isWet ? '#263348' : '#353F50';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle matte tarmac aggregate grain
    for (let i = 0; i < 420; i++) {
      const x = (i * 73) % 256;
      const y = (i * 137) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y, 2, 2);
    }

    // Dual rubber racing lines
    ctx.fillStyle = isWet ? 'rgba(120, 195, 255, 0.14)' : 'rgba(18, 22, 30, 0.16)';
    ctx.fillRect(46, 0, 34, 256);
    ctx.fillRect(176, 0, 34, 256);

    // Crisp FIA white track edge lines
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(6, 0, 9, 256);
    ctx.fillRect(241, 0, 9, 256);

    // Center guide dashes
    ctx.fillStyle = isWet ? 'rgba(186, 230, 253, 0.42)' : 'rgba(255, 255, 255, 0.22)';
    for (let y = 16; y < 256; y += 64) {
      ctx.fillRect(125, y, 6, 30);
    }

    if (isWet) {
      ctx.fillStyle = 'rgba(147, 197, 253, 0.24)';
      ctx.beginPath();
      ctx.ellipse(90, 80, 28, 18, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(170, 190, 32, 16, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 72);
    setTextureSRGB(tex);
    tex.anisotropy = 4;

    if (isWet) _wetAsphaltTex = tex;
    else _asphaltTex = tex;
    return tex;
  }

  function createNumberPlateTexture(number, bgColor, textColor = null) {
    const resolvedText = textColor || (isLightColor(bgColor) ? '#111827' : '#FFFFFF');
    const key = `${number}_${bgColor}_${resolvedText}`;
    if (_plateCache.has(key)) return _plateCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 128, 128);

    ctx.strokeStyle = '#0B0F1A';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 118, 118);

    ctx.fillStyle = resolvedText;
    ctx.font = '900 72px "Fredoka", "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#0B0F1A';
    ctx.strokeText(String(number), 64, 68);
    ctx.fillText(String(number), 64, 68);

    const tex = new THREE.CanvasTexture(canvas);
    setTextureSRGB(tex);
    _plateCache.set(key, tex);
    return tex;
  }

  // Dorsal & team badge texture for the fireproof racing suit back/chest
  function createDorsalTexture(number, shortName, suitColor, secondaryColor) {
    const key = `${number}_${shortName}_${suitColor}_${secondaryColor}`;
    if (_dorsalCache.has(key)) return _dorsalCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = suitColor;
    ctx.fillRect(0, 0, 128, 128);

    // Top racing stripe
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(8, 10, 112, 16);

    // Driver 3-letter code
    const textCol = isLightColor(suitColor) ? '#0F172A' : '#FFFFFF';
    ctx.fillStyle = textCol;
    ctx.font = '800 22px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((shortName || 'F1').toUpperCase().slice(0, 3), 64, 42);

    // Bold dorsal racing number
    ctx.font = '900 62px "Fredoka", "Inter", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0B0F1A';
    ctx.strokeText(String(number), 64, 90);
    ctx.fillStyle = isLightColor(secondaryColor) ? secondaryColor : '#FFFFFF';
    ctx.fillText(String(number), 64, 90);

    const tex = new THREE.CanvasTexture(canvas);
    setTextureSRGB(tex);
    _dorsalCache.set(key, tex);
    return tex;
  }

  global.ToonMat = {
    setTextureSRGB,
    mixHexColors,
    isLightColor,
    getToonGradientMap,
    getToonMaterial,
    getPlasticGlossMaterial,
    getVisorEnvMap,
    getVisorMaterial,
    getOutlineMaterial,
    addCartoonOutline,
    createLegoStudRow,
    getCheckeredTexture,
    getAsphaltTexture,
    createNumberPlateTexture,
    createDorsalTexture
  };
})(window);
