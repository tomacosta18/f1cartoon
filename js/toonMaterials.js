// ============================================================================
// TOONMATERIALS.JS — Cel-Shading, Outlines Negros & Texturas LEGO / Switch
// ============================================================================
(function (global) {
  'use strict';

  let _toonGradient = null;
  let _checkeredTex = null;
  let _asphaltTex = null;
  let _wetAsphaltTex = null;
  let _studGeo = null;
  const _toonCache = new Map();
  const _outlineMatCache = new Map();
  const _plateCache = new Map();

  function setTextureSRGB(tex) {
    if (!global.THREE) return;
    if ('colorSpace' in tex && THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.sRGBEncoding) {
      tex.encoding = THREE.sRGBEncoding;
    }
  }

  function getToonGradientMap() {
    if (_toonGradient) return _toonGradient;
    const colors = new Uint8Array([
      112, 112, 112, 255,
      178, 178, 178, 255,
      228, 228, 228, 255,
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
    const key = JSON.stringify({
      c: color,
      e: opts.emissive || null,
      ei: opts.emissiveIntensity || 0,
      t: !!opts.transparent,
      o: opts.opacity ?? 1,
      s: opts.side ?? THREE.FrontSide
    });
    if (_toonCache.has(key)) return _toonCache.get(key);

    const mat = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: getToonGradientMap(),
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity || 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide
    });
    _toonCache.set(key, mat);
    return mat;
  }

  function getPlasticGlossMaterial(color, opts = {}) {
    return new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      specular: new THREE.Color(opts.specular || '#ffffff'),
      shininess: opts.shininess ?? 110,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissiveIntensity || 0,
      flatShading: false
    });
  }

  function getOutlineMaterial(color = '#0B0F1A') {
    if (_outlineMatCache.has(color)) return _outlineMatCache.get(color);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.BackSide
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

    ctx.fillStyle = isWet ? '#273449' : '#384152';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = isWet ? 'rgba(120, 195, 255, 0.14)' : 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(46, 0, 34, 256);
    ctx.fillRect(176, 0, 34, 256);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(6, 0, 8, 256);
    ctx.fillRect(242, 0, 8, 256);

    ctx.fillStyle = isWet ? 'rgba(186, 230, 253, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    for (let y = 16; y < 256; y += 64) {
      ctx.fillRect(125, y, 6, 30);
    }

    if (isWet) {
      ctx.fillStyle = 'rgba(147, 197, 253, 0.22)';
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

  function createNumberPlateTexture(number, bgColor, textColor = '#FFFFFF') {
    const key = `${number}_${bgColor}_${textColor}`;
    if (_plateCache.has(key)) return _plateCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 96, 96);

    ctx.strokeStyle = '#0B0F1A';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 88, 88);

    ctx.fillStyle = textColor;
    ctx.font = '900 54px "Fredoka", "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0B0F1A';
    ctx.strokeText(String(number), 48, 52);
    ctx.fillText(String(number), 48, 52);

    const tex = new THREE.CanvasTexture(canvas);
    setTextureSRGB(tex);
    _plateCache.set(key, tex);
    return tex;
  }

  global.ToonMat = {
    setTextureSRGB,
    getToonGradientMap,
    getToonMaterial,
    getPlasticGlossMaterial,
    getOutlineMaterial,
    addCartoonOutline,
    createLegoStudRow,
    getCheckeredTexture,
    getAsphaltTexture,
    createNumberPlateTexture
  };
})(window);
