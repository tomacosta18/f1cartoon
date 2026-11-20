// ============================================================================
// MAIN.JS — Controlador Principal (Switch × Netflix UI), Flujo de Pantallas,
//           Modo Campaña, Controles PC + Táctiles Android/Móvil, HUD y Minimapa
// ============================================================================
(function (global) {
  'use strict';

  const {
    DRIVERS,
    TEAMS,
    CIRCUITS,
    STAT_META,
    F1_POINTS,
    getTeamById,
    getDriverById,
    getCircuitById,
    getDriverOverall
  } = global.F1Data;
  const AudioFX = global.AudioFX;

  const AppState = {
    screen: 'home',
    gameMode: 'free',
    selectedDriverId: 'norris',
    selectedTeamFilter: 'all',
    selectedCircuitId: 'monaco',
    selectedLaps: 3,

    campaign: {
      active: false,
      roundIndex: 0,
      driverPoints: {},
      teamPoints: {}
    },

    input: { left: false, right: false, accel: false, brake: false, turbo: false },
    autoAccel: false,
    touchVisible: false,

    raceEngine: null,
    lastResults: []
  };

  let sceneMgr = null;
  let editorCtrl = null;
  let minimapCtx = null;
  let lastFrameTime = performance.now();
  let toastTimeout = null;
  let countdownTimeout = null;
  let threeRetryCount = 0;

  // ==========================================================================
  // SAFE INITIALIZATION (UI ALWAYS BINDS FIRST — ZERO BUTTON FREEZES!)
  // ==========================================================================
  function init() {
    const mmCanvas = document.getElementById('hud-minimap');
    if (mmCanvas) minimapCtx = mmCanvas.getContext('2d');

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    AppState.touchVisible = isTouch;
    if (isTouch) AppState.autoAccel = true;
    updateTouchControlsVisibility();

    // 1. Build ALL Netflix × Switch UI components & bind ALL buttons FIRST
    buildHomeGpRail();
    buildTeamFilters();
    buildDriverGrid();
    buildCircuitCards();
    bindUIEvents();
    bindKeyboardControls();
    bindTouchControls();

    // Initialize "Modo Lápiz" ✏️ Interactive 3D Editor
    if (global.F1EditorController) {
      editorCtrl = new global.F1EditorController({
        getSceneMgr: () => sceneMgr,
        getSelectedDriverId: () => AppState.selectedDriverId,
        setSelectedDriverId: (id) => { AppState.selectedDriverId = id; },
        getCurrentScreen: () => AppState.screen,
        onCommitChanges: (driverId) => refreshAllUI(driverId),
        onExitEditor: () => {
          refreshAllUI(AppState.selectedDriverId);
          sync3DStageForCurrentScreen();
        }
      });
    }

    // Render initial driver stats immediately (even before 3D finishes init)
    selectDriver(AppState.selectedDriverId, false);
    navigateTo('home', false);

    // 2. Safely initialize Three.js 3D Engine (with retry if fallback CDN is loading)
    tryInit3DEngine();

    requestAnimationFrame(mainLoop);
  }

  function refreshAllUI(focusDriverId = null) {
    if (focusDriverId) AppState.selectedDriverId = focusDriverId;
    const prevFilter = AppState.selectedTeamFilter;
    buildTeamFilters();
    buildDriverGrid();
    filterDriversByTeam(prevFilter);
    selectDriver(AppState.selectedDriverId, false);
    updateCircuitModeUI();
    if (AppState.gameMode === 'campaign' && AppState.lastResults.length) {
      renderCampaignStandings();
    }
  }

  function tryInit3DEngine() {
    if (typeof global.THREE === 'undefined') {
      if (threeRetryCount < 25) {
        threeRetryCount++;
        setTimeout(tryInit3DEngine, 200);
      } else {
        showEngineNotice('⚠️ No se pudo cargar Three.js (revisa tu conexión a internet para gráficos 3D).');
      }
      return;
    }

    try {
      const canvas = document.getElementById('game-canvas');
      sceneMgr = new global.SceneManager(canvas);
      hideEngineNotice();
      sync3DStageForCurrentScreen();
    } catch (err) {
      console.error('Error iniciando motor 3D WebGL:', err);
      showEngineNotice('⚠️ Tu navegador no pudo iniciar WebGL 3D. Activa aceleración por hardware.');
    }
  }

  function showEngineNotice(msg) {
    const el = document.getElementById('engine-status-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideEngineNotice() {
    const el = document.getElementById('engine-status-toast');
    if (el) el.style.display = 'none';
  }

  function sync3DStageForCurrentScreen() {
    if (!sceneMgr) return;
    const driver = getDriverById(AppState.selectedDriverId);
    if (editorCtrl && editorCtrl.isOpen) {
      sceneMgr.enterEditorPreview(driver);
      return;
    }
    if (AppState.screen === 'home') {
      sceneMgr.enterShowcase(driver, true);
    } else if (AppState.screen === 'select') {
      sceneMgr.enterShowcase(driver, false);
    } else if (AppState.screen === 'circuit') {
      sceneMgr.enterCircuitPreview(getCircuitById(AppState.selectedCircuitId));
    } else if (AppState.screen === 'results' && AppState.lastResults.length) {
      sceneMgr.enterPodium(AppState.lastResults);
    }
  }

  function mainLoop(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    let hudSnapshot = null;
    if (AppState.screen === 'race' && AppState.raceEngine) {
      const effectiveInput = {
        left: AppState.input.left,
        right: AppState.input.right,
        accel: AppState.input.accel || (AppState.autoAccel && !AppState.input.brake),
        brake: AppState.input.brake,
        turbo: AppState.input.turbo
      };
      AppState.raceEngine.update(dt, effectiveInput);
      hudSnapshot = AppState.raceEngine.getHudSnapshot();
      updateRaceHUD(hudSnapshot);
    }

    if (sceneMgr) {
      sceneMgr.render(dt, hudSnapshot);
    }

    requestAnimationFrame(mainLoop);
  }

  // ==========================================================================
  // ANIMATED SCREEN NAVIGATION
  // ==========================================================================
  function navigateTo(screenId, withSound = true) {
    if (withSound) AudioFX.playTransition();
    AppState.screen = screenId;

    document.querySelectorAll('.screen').forEach(el => {
      el.classList.toggle('active', el.id === `screen-${screenId}`);
    });

    const pauseModal = document.getElementById('modal-pause');
    if (pauseModal) pauseModal.classList.remove('open');

    // Control Netflix cinematic vignette
    const vignette = document.getElementById('cinematic-vignette');
    if (vignette) {
      vignette.classList.toggle('active', screenId === 'home' || screenId === 'select' || screenId === 'circuit');
      vignette.classList.toggle('light-vignette', screenId === 'select' || screenId === 'circuit');
    }

    const driver = getDriverById(AppState.selectedDriverId);

    if (screenId === 'home') {
      AudioFX.stopEngine();
      AppState.raceEngine = null;
      if (sceneMgr) sceneMgr.enterShowcase(driver, true);
    } else if (screenId === 'select') {
      AudioFX.stopEngine();
      AppState.raceEngine = null;
      if (sceneMgr) sceneMgr.enterShowcase(driver, false);
      updateSelectModeBanner();
    } else if (screenId === 'circuit') {
      AudioFX.stopEngine();
      AppState.raceEngine = null;
      const circuit = getCircuitById(AppState.selectedCircuitId);
      highlightCircuitCard(circuit.id);
      updateCircuitModeUI();
      if (sceneMgr) sceneMgr.enterCircuitPreview(getCircuitById(AppState.selectedCircuitId));
    } else if (screenId === 'race') {
      updateTouchControlsVisibility();
    } else if (screenId === 'results') {
      AudioFX.stopEngine();
      if (sceneMgr) sceneMgr.enterPodium(AppState.lastResults);
    }

    editorCtrl?.updateFabVisibility(screenId);
  }

  // ==========================================================================
  // SCREEN 1: HOME NETFLIX QUICK-LAUNCH GP POSTER RAIL
  // ==========================================================================
  function buildHomeGpRail() {
    const rail = document.getElementById('home-gp-rail');
    if (!rail) return;
    rail.innerHTML = '';

    const gradients = {
      monaco: ['#0284C7', '#0F172A'],
      silverstone: ['#2563EB', '#1E293B'],
      abudhabi: ['#7E22CE', '#BE185D']
    };

    CIRCUITS.forEach((c, idx) => {
      const [g1, g2] = gradients[c.id] || ['#1E293B', '#0F172A'];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nf-gp-poster';
      btn.style.setProperty('--gp-bg1', g1);
      btn.style.setProperty('--gp-bg2', g2);
      btn.innerHTML = `
        <div class="gp-poster-top">
          <span>GP ${idx + 1} · ${c.difficulty.toUpperCase()}</span>
          <span>${c.weatherLabel}</span>
        </div>
        <div class="gp-poster-title">${c.flag} ${c.name}</div>
        <div class="gp-poster-stat">${c.keyStatLabel}</div>
      `;
      btn.addEventListener('click', () => {
        AudioFX.unlock();
        AppState.gameMode = 'free';
        AppState.campaign.active = false;
        AppState.selectedCircuitId = c.id;
        navigateTo('select');
      });
      rail.appendChild(btn);
    });
  }

  // ==========================================================================
  // SCREEN 2: DRIVER & TEAM SELECTION + NETFLIX CAROUSEL + LIVE STATS
  // ==========================================================================
  function buildTeamFilters() {
    const container = document.getElementById('team-filter-bar');
    if (!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'team-pill active';
    allBtn.dataset.team = 'all';
    allBtn.innerHTML = `🏁 Todos (22)`;
    allBtn.addEventListener('click', () => {
      AudioFX.playClick();
      filterDriversByTeam('all');
    });
    container.appendChild(allBtn);

    TEAMS.forEach(team => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'team-pill';
      btn.dataset.team = team.id;
      btn.innerHTML = `<span class="pill-dot" style="background:${team.primary}"></span>${team.name}`;
      btn.addEventListener('click', () => {
        AudioFX.playClick();
        filterDriversByTeam(team.id);
      });
      container.appendChild(btn);
    });
  }

  function filterDriversByTeam(teamId) {
    AppState.selectedTeamFilter = teamId;
    document.querySelectorAll('.team-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.team === teamId);
    });

    const cards = document.querySelectorAll('.driver-card');
    let firstVisibleId = null;
    cards.forEach(card => {
      const visible = teamId === 'all' || card.dataset.team === teamId;
      card.style.display = visible ? '' : 'none';
      if (visible && !firstVisibleId) firstVisibleId = card.dataset.driver;
    });

    const rail = document.getElementById('driver-grid');
    if (rail) rail.scrollLeft = 0;

    if (teamId !== 'all' && firstVisibleId) {
      const curDriver = getDriverById(AppState.selectedDriverId);
      if (curDriver.teamId !== teamId) {
        selectDriver(firstVisibleId, true);
      }
    }
  }

  function buildDriverGrid() {
    const grid = document.getElementById('driver-grid');
    if (!grid) return;
    grid.innerHTML = '';

    DRIVERS.forEach(driver => {
      const team = getTeamById(driver.teamId);
      const ovr = getDriverOverall(driver);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'driver-card';
      card.dataset.driver = driver.id;
      card.dataset.team = team.id;

      card.innerHTML = `
        <div class="dc-banner" style="background:linear-gradient(135deg, ${team.primary}, ${team.secondary})">
          <div class="dc-avatar" style="background:${driver.look.helmetMain};border-color:${driver.look.helmetStripe}">
            <span class="dc-face" style="background:${driver.look.skin}"></span>
          </div>
          <span class="dc-ovr-pill">${ovr}</span>
        </div>
        <div class="dc-body">
          <div class="dc-name">${driver.flag} ${driver.name}</div>
          <div class="dc-sub">
            <span>${team.name}</span>
            <span>#${driver.number}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => selectDriver(driver.id, true));
      grid.appendChild(card);
    });
  }

  function selectDriver(driverId, withSound = true) {
    AppState.selectedDriverId = driverId;
    const driver = getDriverById(driverId);
    const team = getTeamById(driver.teamId);

    if (withSound) AudioFX.playSelectDriver();

    document.querySelectorAll('.driver-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.driver === driverId);
    });

    if (sceneMgr && !(editorCtrl && editorCtrl.isOpen)) {
      sceneMgr.updateShowcaseCar(driver);
    }

    const driverOvr = getDriverOverall(driver);
    const teamOvr = team.rating;

    document.getElementById('stat-driver-name').textContent = driver.name;
    document.getElementById('stat-driver-meta').innerHTML = `${driver.flag} <strong>${driver.short} #${driver.number}</strong> · ${driver.tagline}`;

    const teamBadge = document.getElementById('stat-team-badge');
    teamBadge.textContent = `${team.country} ${team.name}`;
    teamBadge.style.background = team.primary;
    teamBadge.style.color = isLightHex(team.primary) ? '#0B0D14' : '#FFFFFF';

    animateNumberPop('stat-driver-ovr', driverOvr);
    animateNumberPop('stat-team-ovr', teamOvr);

    const barsContainer = document.getElementById('stat-bars-list');
    barsContainer.innerHTML = STAT_META.map(meta => {
      const val = driver.stats[meta.key];
      return `
        <div class="stat-row" title="${meta.desc}">
          <div class="stat-row-top">
            <span class="stat-label">${meta.icon} ${meta.label}</span>
            <span class="stat-val" style="color:${meta.color}">${val}</span>
          </div>
          <div class="stat-track">
            <div class="stat-fill" style="width:${val}%;background:${meta.color}"></div>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('showcase-nameplate').innerHTML = `
      <span class="np-dot" style="background:${team.primary}"></span>
      <strong>${driver.name}</strong> · ${team.name}
      <span class="np-hint">↔ Arrastra para girar 3D</span>
    `;
  }

  function animateNumberPop(elId, val) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = val;
    el.classList.remove('pop-anim');
    void el.offsetWidth;
    el.classList.add('pop-anim');
  }

  function updateSelectModeBanner() {
    const badge = document.getElementById('select-mode-badge');
    const nextBtn = document.getElementById('btn-select-next');
    if (AppState.gameMode === 'campaign') {
      badge.textContent = '🏆 MODO CAMPAÑA · 3 GRANDES PREMIOS';
      nextBtn.textContent = '▶ HUB DE CAMPAÑA';
    } else {
      badge.textContent = '⚡ CARRERA LIBRE';
      nextBtn.textContent = '▶ ELEGIR CIRCUITO';
    }
  }

  // ==========================================================================
  // SCREEN 3: CIRCUIT SELECTION / CAMPAIGN HUB (NETFLIX EPISODES RAIL)
  // ==========================================================================
  function buildCircuitCards() {
    const container = document.getElementById('circuit-cards');
    if (!container) return;
    container.innerHTML = '';

    CIRCUITS.forEach((c, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'circuit-card';
      card.dataset.circuit = c.id;
      card.style.setProperty('--c-theme', c.themeColor);

      card.innerHTML = `
        <div class="cc-top">
          <span class="cc-round">GP ${idx + 1}</span>
          <span class="cc-weather">${c.weatherLabel}</span>
        </div>
        <div class="cc-title">${c.flag} ${c.name}</div>
        <div class="cc-sub">${c.location}</div>
        <p class="cc-desc">${c.description}</p>
        <div class="cc-keystat">${c.keyStatLabel}</div>
      `;

      card.addEventListener('click', () => {
        if (AppState.gameMode === 'campaign' && idx !== AppState.campaign.roundIndex) {
          AudioFX.playBack();
          return;
        }
        AudioFX.playSelectDriver();
        AppState.selectedCircuitId = c.id;
        highlightCircuitCard(c.id);
        if (sceneMgr) sceneMgr.enterCircuitPreview(c);
      });

      container.appendChild(card);
    });
  }

  function highlightCircuitCard(circuitId) {
    document.querySelectorAll('.circuit-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.circuit === circuitId);
    });
  }

  function updateCircuitModeUI() {
    const titleEl = document.getElementById('circuit-screen-title');
    const subEl = document.getElementById('circuit-screen-sub');
    const lapsWrap = document.getElementById('laps-selector-wrap');
    const launchBtn = document.getElementById('btn-start-race');
    const activeDriverEl = document.getElementById('circuit-active-driver');

    const driver = getDriverById(AppState.selectedDriverId);
    const team = getTeamById(driver.teamId);
    if (activeDriverEl) {
      activeDriverEl.innerHTML = `<span class="pill-dot" style="background:${team.primary}"></span>${driver.flag} <strong>${driver.short} #${driver.number}</strong> · ${team.name} · OVR ${getDriverOverall(driver)}`;
    }

    if (AppState.gameMode === 'campaign') {
      const gp = CIRCUITS[AppState.campaign.roundIndex];
      AppState.selectedCircuitId = gp.id;
      highlightCircuitCard(gp.id);

      titleEl.textContent = `🏆 Hub de Campaña · Ronda ${AppState.campaign.roundIndex + 1} de 3`;
      subEl.textContent = `${gp.fullName} · ${gp.weatherLabel}`;
      lapsWrap.style.display = 'none';
      launchBtn.textContent = `🚦 ¡CORRER EN ${gp.name.toUpperCase()}!`;

      document.querySelectorAll('.circuit-card').forEach((card, idx) => {
        card.classList.toggle('locked', idx > AppState.campaign.roundIndex);
        card.classList.toggle('completed', idx < AppState.campaign.roundIndex);
      });
    } else {
      titleEl.textContent = 'Elige tu Circuito';
      subEl.textContent = 'Vista aérea 3D en vivo';
      lapsWrap.style.display = 'flex';
      launchBtn.textContent = '🚦 ¡A LA PARRILLA!';
      document.querySelectorAll('.circuit-card').forEach(card => {
        card.classList.remove('locked', 'completed');
      });
    }
  }

  // ==========================================================================
  // CAMPAIGN MANAGEMENT
  // ==========================================================================
  function startNewCampaign() {
    AppState.gameMode = 'campaign';
    AppState.campaign.active = true;
    AppState.campaign.roundIndex = 0;
    AppState.campaign.driverPoints = {};
    AppState.campaign.teamPoints = {};
    DRIVERS.forEach(d => { AppState.campaign.driverPoints[d.id] = 0; });
    TEAMS.forEach(t => { AppState.campaign.teamPoints[t.id] = 0; });
  }

  function applyCampaignPoints(results) {
    results.forEach((entry, idx) => {
      const pts = F1_POINTS[idx] || 0;
      entry.pointsAwarded = pts;
      if (AppState.gameMode === 'campaign') {
        AppState.campaign.driverPoints[entry.driver.id] = (AppState.campaign.driverPoints[entry.driver.id] || 0) + pts;
        AppState.campaign.teamPoints[entry.team.id] = (AppState.campaign.teamPoints[entry.team.id] || 0) + pts;
      }
    });
  }

  // ==========================================================================
  // RACE LAUNCH & HUD
  // ==========================================================================
  function launchRace() {
    AudioFX.unlock();
    if (!sceneMgr) {
      showEngineNotice('⚠️ Esperando motor 3D WebGL... Verifica tu conexión para cargar Three.js.');
      tryInit3DEngine();
      if (!sceneMgr) return;
    }

    const circuit = getCircuitById(AppState.selectedCircuitId);
    const laps = AppState.gameMode === 'campaign' ? circuit.defaultLaps : AppState.selectedLaps;

    if (!sceneMgr.activeTrack || sceneMgr.activeTrackId !== circuit.id) {
      sceneMgr._loadTrackStage(circuit);
    }

    Object.keys(AppState.input).forEach(k => { AppState.input[k] = false; });

    const engine = new global.RaceEngine(sceneMgr.activeTrack, AppState.selectedDriverId, laps, {
      onCountdown: (label, isGo) => showCountdownBanner(label, isGo),
      onToast: (msg, color) => showRaceToast(msg, color),
      onLap: (lap, total) => { document.getElementById('hud-lap').textContent = `VUELTA ${lap} / ${total}`; },
      onFinish: (results) => handleRaceFinish(results)
    });

    AppState.raceEngine = engine;
    sceneMgr.enterRace(circuit, engine);

    const driver = getDriverById(AppState.selectedDriverId);
    const team = getTeamById(driver.teamId);
    document.getElementById('hud-circuit-pill').textContent = `${circuit.flag} ${circuit.name}`;
    document.getElementById('hud-weather-pill').textContent = circuit.weatherLabel;
    document.getElementById('hud-driver-pill').innerHTML = `<span class="pill-dot" style="background:${team.primary}"></span>${driver.short} #${driver.number}`;
    document.getElementById('hud-lap').textContent = `VUELTA 1 / ${laps}`;

    navigateTo('race', true);
  }

  function showCountdownBanner(label, isGo) {
    const el = document.getElementById('countdown-banner');
    el.textContent = label;
    el.className = 'countdown-banner show ' + (isGo ? 'go' : 'num');

    const lights = document.querySelectorAll('#hud-start-lights .sl-bulb');
    const wrap = document.getElementById('hud-start-lights');
    wrap.classList.add('visible');
    lights.forEach((b, idx) => {
      b.classList.remove('red', 'green');
      if (isGo) b.classList.add('green');
      else if (label === '3' && idx < 2) b.classList.add('red');
      else if (label === '2' && idx < 4) b.classList.add('red');
      else if (label === '1') b.classList.add('red');
    });

    clearTimeout(countdownTimeout);
    countdownTimeout = setTimeout(() => {
      el.classList.remove('show');
      if (isGo) wrap.classList.remove('visible');
    }, isGo ? 1050 : 820);
  }

  function showRaceToast(msg, color = '#FFD43B') {
    const toast = document.getElementById('hud-toast');
    toast.textContent = msg;
    toast.style.borderColor = color;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2100);
  }

  function updateRaceHUD(hud) {
    document.getElementById('hud-pos-num').textContent = `${hud.position}°`;
    document.getElementById('hud-pos-total').textContent = `/ ${hud.totalRacers}`;
    document.getElementById('hud-timer').textContent = formatTime(hud.raceElapsed);

    document.getElementById('hud-speed-val').textContent = hud.kmh;
    document.getElementById('hud-gear-badge').textContent = `M${hud.gear}`;
    document.getElementById('hud-speed-arc-fill').style.strokeDashoffset = 220 - Math.min(1, hud.speedRatio) * 220;

    document.getElementById('hud-turbo-fill').style.width = `${Math.round(hud.turbo)}%`;
    const turboWrap = document.getElementById('hud-turbo-box');
    turboWrap.classList.toggle('active', hud.turboActive);
    turboWrap.classList.toggle('ready', hud.turbo >= 22 && !hud.turboActive);

    document.getElementById('hud-moral-fill').style.width = `${Math.round(hud.moral)}%`;
    document.getElementById('hud-moral-mult').textContent = `×${hud.moralMultiplier.toFixed(2)} STATS`;
    document.getElementById('hud-moral-box').classList.toggle('overdrive', hud.moralOverdrive);

    document.getElementById('speed-lines').classList.toggle('active', hud.turboActive || hud.kmh > 315);

    renderMinimap(hud);
  }

  function renderMinimap(hud) {
    const track = sceneMgr && sceneMgr.activeTrack;
    if (!track || !minimapCtx) return;

    const ctx = minimapCtx;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const b = track.bounds;
    const spanX = Math.max(1, b.maxX - b.minX);
    const spanZ = Math.max(1, b.maxZ - b.minZ);
    const pad = 14;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
    const offX = (w - spanX * scale) * 0.5;
    const offY = (h - spanZ * scale) * 0.5;
    const toCanvas = (x, z) => [offX + (x - b.minX) * scale, offY + (z - b.minZ) * scale];

    ctx.beginPath();
    track.frames.forEach((f, idx) => {
      const [cx, cy] = toCanvas(f.pos.x, f.pos.z);
      if (idx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.strokeStyle = '#080A10'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 4; ctx.stroke();

    const [sx, sy] = toCanvas(track.frames[0].pos.x, track.frames[0].pos.z);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(sx - 4, sy - 4, 8, 8);

    hud.racers.forEach(r => {
      if (r.isPlayer) return;
      const [rx, ry] = toCanvas(r.worldPos.x, r.worldPos.z);
      ctx.beginPath(); ctx.arc(rx, ry, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = r.team.primary; ctx.fill();
      ctx.strokeStyle = '#080A10'; ctx.lineWidth = 1.2; ctx.stroke();
    });

    const [px, py] = toCanvas(hud.playerPos.x, hud.playerPos.z);
    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD43B'; ctx.fill();
    ctx.strokeStyle = '#080A10'; ctx.lineWidth = 2.2; ctx.stroke();
  }

  // ==========================================================================
  // SCREEN 6: PODIUM & RESULTS
  // ==========================================================================
  function handleRaceFinish(results) {
    applyCampaignPoints(results);
    AppState.lastResults = results;

    const playerEntry = results.find(r => r.isPlayer);
    const circuit = getCircuitById(AppState.selectedCircuitId);

    const titleEl = document.getElementById('results-title');
    const subEl = document.getElementById('results-sub');

    if (playerEntry.position === 1) titleEl.textContent = '🏆 ¡VICTORIA EN EL GRAN PREMIO!';
    else if (playerEntry.position <= 3) titleEl.textContent = `🥇 ¡PODIO! TERMINASTE ${playerEntry.position}°`;
    else titleEl.textContent = `🏁 FIN DE CARRERA · POSICIÓN ${playerEntry.position}°`;

    subEl.textContent = `${circuit.flag} ${circuit.fullName} · ${playerEntry.driver.name} (${playerEntry.team.name}) · +${playerEntry.pointsAwarded} pts`;

    const winnerTime = results[0].finishTime;
    document.getElementById('results-race-tbody').innerHTML = results.map((r, idx) => {
      const gap = idx === 0 ? formatTime(r.finishTime) : `+${(r.finishTime - winnerTime).toFixed(2)}s`;
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${r.position}°`;
      return `
        <tr class="${r.isPlayer ? 'player-row' : ''}">
          <td class="col-pos">${medal}</td>
          <td><span class="tbl-dot" style="background:${r.team.primary}"></span><strong>${r.driver.flag} ${r.driver.name}</strong></td>
          <td class="col-team">${r.team.name}</td>
          <td class="col-time">${gap}</td>
          <td class="col-pts">${r.pointsAwarded > 0 ? '+' + r.pointsAwarded : '—'}</td>
        </tr>
      `;
    }).join('');

    const campTabs = document.querySelectorAll('.campaign-only-tab');
    const nextGpBtn = document.getElementById('btn-next-gp');
    const replayBtn = document.getElementById('btn-replay-race');

    if (AppState.gameMode === 'campaign') {
      campTabs.forEach(t => { t.style.display = ''; });
      renderCampaignStandings();
      const isLastRound = AppState.campaign.roundIndex >= CIRCUITS.length - 1;
      if (isLastRound) {
        const champDriver = getSortedDriverStandings()[0];
        subEl.textContent = `🏆 ¡CAMPEONATO FINALIZADO! Campeón Mundial: ${champDriver.driver.flag} ${champDriver.driver.name} (${champDriver.points} pts)`;
        nextGpBtn.style.display = 'none';
        replayBtn.textContent = '🏆 Nueva Campaña';
      } else {
        const nextGp = CIRCUITS[AppState.campaign.roundIndex + 1];
        nextGpBtn.style.display = '';
        nextGpBtn.textContent = `▶ SIGUIENTE GP: ${nextGp.flag} ${nextGp.name.toUpperCase()}`;
        replayBtn.textContent = '🔄 Repetir GP';
      }
    } else {
      campTabs.forEach(t => { t.style.display = 'none'; });
      nextGpBtn.style.display = 'none';
      replayBtn.textContent = '🔄 Repetir';
    }

    switchResultsTab('race');
    navigateTo('results', false);
  }

  function getSortedDriverStandings() {
    return DRIVERS.map(d => ({
      driver: d, team: getTeamById(d.teamId),
      points: AppState.campaign.driverPoints[d.id] || 0,
      isPlayer: d.id === AppState.selectedDriverId
    })).sort((a, b) => b.points - a.points);
  }

  function getSortedTeamStandings() {
    return TEAMS.map(t => ({
      team: t,
      points: AppState.campaign.teamPoints[t.id] || 0,
      isPlayerTeam: t.id === getDriverById(AppState.selectedDriverId).teamId
    })).sort((a, b) => b.points - a.points);
  }

  function renderCampaignStandings() {
    document.getElementById('results-drivers-tbody').innerHTML = getSortedDriverStandings().map((row, idx) => `
      <tr class="${row.isPlayer ? 'player-row' : ''}">
        <td class="col-pos">${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `${idx + 1}°`}</td>
        <td><span class="tbl-dot" style="background:${row.team.primary}"></span><strong>${row.driver.flag} ${row.driver.name}</strong></td>
        <td class="col-team">${row.team.name}</td>
        <td class="col-pts"><strong>${row.points} pts</strong></td>
      </tr>
    `).join('');

    document.getElementById('results-teams-tbody').innerHTML = getSortedTeamStandings().map((row, idx) => `
      <tr class="${row.isPlayerTeam ? 'player-row' : ''}">
        <td class="col-pos">${idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `${idx + 1}°`}</td>
        <td><span class="tbl-dot" style="background:${row.team.primary}"></span><strong>${row.team.country} ${row.team.name}</strong></td>
        <td class="col-team">Media ${row.team.rating}</td>
        <td class="col-pts"><strong>${row.points} pts</strong></td>
      </tr>
    `).join('');
  }

  function switchResultsTab(tabName) {
    document.querySelectorAll('.res-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.res-table-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${tabName}`));
  }

  // ==========================================================================
  // EVENT LISTENERS (ALL BUTTONS & CAROUSEL CONTROLS)
  // ==========================================================================
  function bindUIEvents() {
    const enterFreeMode = () => {
      AudioFX.unlock();
      AppState.gameMode = 'free';
      AppState.campaign.active = false;
      navigateTo('select');
    };
    const enterCampaignMode = () => {
      AudioFX.unlock();
      startNewCampaign();
      navigateTo('select');
    };

    document.getElementById('btn-mode-free').addEventListener('click', enterFreeMode);
    document.getElementById('btn-mode-campaign').addEventListener('click', enterCampaignMode);
    document.getElementById('nav-free').addEventListener('click', enterFreeMode);
    document.getElementById('nav-campaign').addEventListener('click', enterCampaignMode);
    document.getElementById('nav-home').addEventListener('click', () => navigateTo('home'));

    document.querySelectorAll('.js-mute-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = AudioFX.toggleMute();
        document.querySelectorAll('.js-mute-btn').forEach(b => { b.textContent = m ? '🔇' : '🔊'; });
      });
    });

    document.getElementById('btn-select-back').addEventListener('click', () => {
      AudioFX.playBack();
      navigateTo('home', false);
    });
    document.getElementById('btn-select-next').addEventListener('click', () => navigateTo('circuit'));

    // Netflix Carousel Prev/Next scroll buttons
    const driverRail = document.getElementById('driver-grid');
    document.getElementById('rail-prev').addEventListener('click', () => {
      AudioFX.playClick();
      driverRail.scrollBy({ left: -340, behavior: 'smooth' });
    });
    document.getElementById('rail-next').addEventListener('click', () => {
      AudioFX.playClick();
      driverRail.scrollBy({ left: 340, behavior: 'smooth' });
    });

    document.getElementById('btn-circuit-back').addEventListener('click', () => {
      AudioFX.playBack();
      navigateTo('select', false);
    });

    document.querySelectorAll('.lap-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        AudioFX.playClick();
        AppState.selectedLaps = Number(chip.dataset.laps);
        document.querySelectorAll('.lap-chip').forEach(c => c.classList.toggle('active', c === chip));
      });
    });

    document.getElementById('btn-start-race').addEventListener('click', () => launchRace());

    document.getElementById('btn-hud-camera').addEventListener('click', () => {
      if (!sceneMgr) return;
      AudioFX.playClick();
      showRaceToast(sceneMgr.cycleCameraPreset(), '#00D2FF');
    });

    document.getElementById('btn-hud-touch').addEventListener('click', () => {
      AudioFX.playClick();
      AppState.touchVisible = !AppState.touchVisible;
      updateTouchControlsVisibility();
    });

    document.getElementById('btn-hud-pause').addEventListener('click', () => togglePause());

    const hudTurbo = document.getElementById('hud-turbo-box');
    hudTurbo.addEventListener('pointerdown', () => { AppState.input.turbo = true; });
    window.addEventListener('pointerup', () => { AppState.input.turbo = false; });

    document.getElementById('btn-pause-resume').addEventListener('click', () => togglePause(false));
    document.getElementById('btn-pause-restart').addEventListener('click', () => { togglePause(false); launchRace(); });
    document.getElementById('btn-pause-autoaccel').addEventListener('click', (e) => {
      AudioFX.playClick();
      AppState.autoAccel = !AppState.autoAccel;
      e.currentTarget.textContent = AppState.autoAccel ? '⚡ Auto-Acelerar: SÍ' : '⚡ Auto-Acelerar: NO';
    });
    document.getElementById('btn-pause-exit').addEventListener('click', () => { togglePause(false); navigateTo('home'); });

    document.querySelectorAll('.res-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        AudioFX.playClick();
        switchResultsTab(btn.dataset.tab);
      });
    });

    document.getElementById('btn-next-gp').addEventListener('click', () => {
      if (AppState.campaign.roundIndex < CIRCUITS.length - 1) {
        AppState.campaign.roundIndex += 1;
        navigateTo('circuit');
      }
    });

    document.getElementById('btn-replay-race').addEventListener('click', () => {
      if (AppState.gameMode === 'campaign' && AppState.campaign.roundIndex >= CIRCUITS.length - 1) {
        startNewCampaign();
        navigateTo('circuit');
      } else {
        launchRace();
      }
    });

    document.getElementById('btn-results-menu').addEventListener('click', () => navigateTo('home'));
  }

  function togglePause(forceState = null) {
    if (AppState.screen !== 'race' || !AppState.raceEngine) return;
    const next = forceState !== null ? forceState : !AppState.raceEngine.paused;
    AppState.raceEngine.paused = next;
    document.getElementById('modal-pause').classList.toggle('open', next);
    document.getElementById('btn-pause-autoaccel').textContent = AppState.autoAccel
      ? '⚡ Auto-Acelerar: SÍ' : '⚡ Auto-Acelerar: NO';
    if (next) AudioFX.playClick();
  }

  function bindKeyboardControls() {
    const keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'accel', KeyW: 'accel',
      ArrowDown: 'brake', KeyS: 'brake',
      Space: 'turbo', ShiftLeft: 'turbo', ShiftRight: 'turbo'
    };

    window.addEventListener('keydown', (e) => {
      if (AppState.screen !== 'race') return;
      if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
      if (e.code === 'KeyC' && sceneMgr) { showRaceToast(sceneMgr.cycleCameraPreset(), '#00D2FF'); return; }
      const action = keyMap[e.code];
      if (action) { e.preventDefault(); AppState.input[action] = true; }
    });

    window.addEventListener('keyup', (e) => {
      const action = keyMap[e.code];
      if (action) AppState.input[action] = false;
    });
  }

  function bindTouchControls() {
    const bindPad = (id, action) => {
      const el = document.getElementById(id);
      if (!el) return;
      const setActive = (val, e) => {
        if (e) e.preventDefault();
        AudioFX.unlock();
        AppState.input[action] = val;
        el.classList.toggle('pressed', val);
      };
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture?.(e.pointerId); setActive(true, e); });
      el.addEventListener('pointerup', (e) => setActive(false, e));
      el.addEventListener('pointercancel', (e) => setActive(false, e));
      el.addEventListener('lostpointercapture', () => setActive(false));
    };

    bindPad('touch-left', 'left');
    bindPad('touch-right', 'right');
    bindPad('touch-accel', 'accel');
    bindPad('touch-brake', 'brake');
    bindPad('touch-turbo', 'turbo');

    const autoBtn = document.getElementById('touch-auto-accel');
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        AudioFX.playClick();
        AppState.autoAccel = !AppState.autoAccel;
        autoBtn.classList.toggle('active', AppState.autoAccel);
        autoBtn.textContent = AppState.autoAccel ? 'AUTO GAS: ON' : 'AUTO GAS: OFF';
      });
    }
  }

  function updateTouchControlsVisibility() {
    const el = document.getElementById('touch-controls');
    if (el) el.classList.toggle('visible', AppState.touchVisible);
    const autoBtn = document.getElementById('touch-auto-accel');
    if (autoBtn) {
      autoBtn.classList.toggle('active', AppState.autoAccel);
      autoBtn.textContent = AppState.autoAccel ? 'AUTO GAS: ON' : 'AUTO GAS: OFF';
    }
  }

  function formatTime(sec) {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    const whole = Math.floor(rem);
    const ms = Math.floor((rem - whole) * 100);
    return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  }

  function isLightHex(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 178;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
