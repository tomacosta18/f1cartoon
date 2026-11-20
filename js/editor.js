// ============================================================================
// EDITOR.JS — "Modo Lápiz" ✏️ Estudio Interactivo 3D en Tiempo Real (v1.1)
//             Pestaña 1: Auto y Escudería | Pestaña 2: Piloto y Apariencia
//             Pestaña 3: Estadísticas (1–99) + OVR | Persistencia localStorage
// ============================================================================
(function (global) {
  'use strict';

  class F1EditorController {
    constructor(deps) {
      this.getSceneMgr = deps.getSceneMgr;
      this.getSelectedDriverId = deps.getSelectedDriverId;
      this.setSelectedDriverId = deps.setSelectedDriverId;
      this.getCurrentScreen = deps.getCurrentScreen;
      this.onCommitChanges = deps.onCommitChanges;
      this.onExitEditor = deps.onExitEditor;

      this.isOpen = false;
      this.activeTab = 'car';
      this.editingDriverId = null;
      this.viewMode = 'duo'; // 'duo' | 'cockpit'
      this.hasUnsavedChanges = false;
      this.snapshotDrivers = null;
      this.snapshotTeams = null;
      this.rafPending = false;
      this.toastTimer = null;

      this._bindElements();
      this._buildStaticControls();
      this._bindEvents();
    }

    _bindElements() {
      this.fab = document.getElementById('btn-floating-editor');
      this.overlay = document.getElementById('editor-overlay');
      this.driverSelect = document.getElementById('ed-driver-select');
      this.ovrBadge = document.getElementById('ed-ovr-badge');
      this.toastEl = document.getElementById('ed-toast');

      this.tabBtns = Array.from(document.querySelectorAll('.ed-tab-btn'));
      this.tabPanes = Array.from(document.querySelectorAll('.ed-pane'));

      // 3D Preview toolbar
      this.btnViewDuo = document.getElementById('btn-ed-view-duo');
      this.btnViewCockpit = document.getElementById('btn-ed-view-cockpit');
      this.btnAutoSpin = document.getElementById('btn-ed-autospin');
      this.btnResetCam = document.getElementById('btn-ed-resetcam');

      // Tab 1 fields
      this.teamNameInput = document.getElementById('ed-team-name');
      this.carNumberInput = document.getElementById('ed-driver-number');
      this.carColorsWrap = document.getElementById('ed-car-colors');

      // Tab 2 fields
      this.driverNameInput = document.getElementById('ed-driver-name');
      this.driverShortInput = document.getElementById('ed-driver-short');
      this.driverFlagSelect = document.getElementById('ed-driver-flag');
      this.hairStyleGrid = document.getElementById('ed-hair-styles');
      this.beardStyleGrid = document.getElementById('ed-beard-styles');
      this.driverColorsWrap = document.getElementById('ed-driver-colors');
      this.helmetColorsWrap = document.getElementById('ed-helmet-colors');

      // Tab 3 fields
      this.statsOvrBig = document.getElementById('ed-stats-ovr-big');
      this.statsTierBadge = document.getElementById('ed-stats-tier');
      this.statsSlidersWrap = document.getElementById('ed-stats-sliders');

      // Action buttons
      this.btnClose = document.getElementById('btn-editor-close');
      this.btnSave = document.getElementById('btn-editor-save');
      this.btnRestore = document.getElementById('btn-editor-restore');
    }

    _buildStaticControls() {
      const { NATIONALITIES, HAIR_STYLES, BEARD_STYLES, SKIN_SWATCHES, HAIR_SWATCHES, RACING_SWATCHES, STAT_META } = global.F1Data;

      // Nationalities select
      if (this.driverFlagSelect) {
        this.driverFlagSelect.innerHTML = NATIONALITIES.map(n =>
          `<option value="${n.flag}">${n.flag} ${n.name}</option>`
        ).join('');
      }

      // Car color pickers (Tab 1)
      if (this.carColorsWrap) {
        this.carColorsWrap.innerHTML = [
          this._renderColorField('primary', 'Color Primario (Chasis y Mono)', RACING_SWATCHES),
          this._renderColorField('secondary', 'Color Secundario', RACING_SWATCHES),
          this._renderColorField('accent', 'Color Halo y Alerones', RACING_SWATCHES),
          this._renderColorField('wheelRim', 'Color de Llantas', RACING_SWATCHES)
        ].join('');
      }

      // Hair style chips (Tab 2)
      if (this.hairStyleGrid) {
        this.hairStyleGrid.innerHTML = HAIR_STYLES.map(h =>
          `<button type="button" class="ed-chip-btn" data-hair="${h.id}">${h.label}</button>`
        ).join('');
      }

      // Beard style chips (Tab 2)
      if (this.beardStyleGrid) {
        this.beardStyleGrid.innerHTML = BEARD_STYLES.map(b =>
          `<button type="button" class="ed-chip-btn" data-beard="${b.id}">${b.label}</button>`
        ).join('');
      }

      // Driver appearance colors (Tab 2)
      if (this.driverColorsWrap) {
        this.driverColorsWrap.innerHTML = [
          this._renderColorField('skin', 'Tono de Piel', SKIN_SWATCHES),
          this._renderColorField('hairColor', 'Color de Cabello y Barba', HAIR_SWATCHES)
        ].join('');
      }

      // Helmet & visor colors (Tab 2)
      if (this.helmetColorsWrap) {
        this.helmetColorsWrap.innerHTML = [
          this._renderColorField('helmetMain', 'Casco Principal', RACING_SWATCHES),
          this._renderColorField('helmetStripe', 'Franja del Casco', RACING_SWATCHES),
          this._renderColorField('helmetAccent', 'Alerón y Detalles Casco', RACING_SWATCHES),
          this._renderColorField('visor', 'Visera Polarizada Reflectante', RACING_SWATCHES)
        ].join('');
      }

      // 8 Stats Sliders (Tab 3)
      if (this.statsSlidersWrap) {
        this.statsSlidersWrap.innerHTML = STAT_META.map(meta => `
          <div class="ed-slider-row" data-stat-key="${meta.key}">
            <div class="ed-slider-top">
              <span class="ed-slider-lbl">${meta.icon} ${meta.label}</span>
              <span class="ed-slider-val" id="ed-val-${meta.key}" style="color:${meta.color}">85</span>
            </div>
            <input type="range"
                   class="ed-range-input"
                   id="ed-range-${meta.key}"
                   data-stat="${meta.key}"
                   min="1" max="99" value="85"
                   style="--sl-col:${meta.color}" />
          </div>
        `).join('');
      }
    }

    _renderColorField(fieldKey, label, swatches) {
      const swatchHtml = swatches.map(hex =>
        `<button type="button" class="ed-swatch" data-color-field="${fieldKey}" data-hex="${hex}" style="background:${hex}" title="${hex}"></button>`
      ).join('');
      return `
        <div class="ed-color-block" data-field="${fieldKey}">
          <div class="ed-color-head">
            <label class="ed-label">${label}</label>
            <div class="ed-color-inputs">
              <input type="color" class="ed-native-color" data-color-picker="${fieldKey}" value="#FF8000" aria-label="${label}" />
              <input type="text" class="ed-hex-input" data-hex-input="${fieldKey}" value="#FF8000" maxlength="7" spellcheck="false" aria-label="Código HEX ${label}" />
            </div>
          </div>
          <div class="ed-swatch-row">${swatchHtml}</div>
        </div>
      `;
    }

    _bindEvents() {
      const AudioFX = global.AudioFX;

      if (this.fab) {
        this.fab.addEventListener('click', () => {
          AudioFX.unlock();
          AudioFX.playTransition();
          this.open();
        });
      }

      if (this.btnClose) {
        this.btnClose.addEventListener('click', () => {
          AudioFX.playBack();
          this.close(false);
        });
      }

      if (this.btnSave) {
        this.btnSave.addEventListener('click', () => {
          this.saveChanges();
        });
      }

      if (this.btnRestore) {
        this.btnRestore.addEventListener('click', () => {
          this.restoreCurrentDefaults();
        });
      }

      // Tabs
      this.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          AudioFX.playClick();
          this.switchTab(btn.dataset.edTab);
        });
      });

      // Driver switcher inside Editor
      if (this.driverSelect) {
        this.driverSelect.addEventListener('change', (e) => {
          AudioFX.playSelectDriver();
          this.editingDriverId = e.target.value;
          this.setSelectedDriverId(this.editingDriverId);
          this._populateForm();
          this._schedule3DRefresh();
        });
      }

      // 3D Preview Toolbar controls
      if (this.btnViewDuo) {
        this.btnViewDuo.addEventListener('click', () => {
          AudioFX.playClick();
          this._setViewMode('duo');
        });
      }
      if (this.btnViewCockpit) {
        this.btnViewCockpit.addEventListener('click', () => {
          AudioFX.playClick();
          this._setViewMode('cockpit');
        });
      }
      if (this.btnAutoSpin) {
        this.btnAutoSpin.addEventListener('click', () => {
          AudioFX.playClick();
          const mgr = this.getSceneMgr();
          if (!mgr) return;
          const active = mgr.toggleEditorAutoRotate();
          this.btnAutoSpin.classList.toggle('active', active);
        });
      }
      if (this.btnResetCam) {
        this.btnResetCam.addEventListener('click', () => {
          AudioFX.playClick();
          this.getSceneMgr()?.resetEditorOrbit();
        });
      }

      // Tab 1 text/number listeners
      if (this.teamNameInput) {
        this.teamNameInput.addEventListener('input', (e) => {
          const { team } = this._getCurrentPair();
          team.name = e.target.value.slice(0, 24);
          this._markDirty();
          this._refreshDriverDropdownLabel();
        });
      }
      if (this.carNumberInput) {
        this.carNumberInput.addEventListener('input', (e) => {
          const { driver } = this._getCurrentPair();
          const val = parseInt(e.target.value, 10);
          if (Number.isFinite(val)) {
            driver.number = Math.max(1, Math.min(99, val));
            this._markDirty();
            this._refreshDriverDropdownLabel();
            this._schedule3DRefresh();
          }
        });
      }

      // Tab 2 text/select listeners
      if (this.driverNameInput) {
        this.driverNameInput.addEventListener('input', (e) => {
          const { driver } = this._getCurrentPair();
          driver.name = e.target.value.slice(0, 26);
          this._markDirty();
          this._refreshDriverDropdownLabel();
        });
      }
      if (this.driverShortInput) {
        this.driverShortInput.addEventListener('input', (e) => {
          const { driver } = this._getCurrentPair();
          const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
          e.target.value = clean;
          driver.short = clean || 'F1';
          this._markDirty();
          this._schedule3DRefresh();
        });
      }
      if (this.driverFlagSelect) {
        this.driverFlagSelect.addEventListener('change', (e) => {
          const { driver } = this._getCurrentPair();
          driver.flag = e.target.value;
          this._markDirty();
          this._refreshDriverDropdownLabel();
        });
      }

      // Hair style chips
      if (this.hairStyleGrid) {
        this.hairStyleGrid.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-hair]');
          if (!btn) return;
          AudioFX.playClick();
          const { driver } = this._getCurrentPair();
          driver.look.hairStyle = btn.dataset.hair;
          this._syncStyleChips();
          this._markDirty();
          this._schedule3DRefresh();
        });
      }

      // Beard style chips
      if (this.beardStyleGrid) {
        this.beardStyleGrid.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-beard]');
          if (!btn) return;
          AudioFX.playClick();
          const { driver } = this._getCurrentPair();
          driver.look.beard = btn.dataset.beard;
          this._syncStyleChips();
          this._markDirty();
          this._schedule3DRefresh();
        });
      }

      // Delegated color swatches, native color pickers, and HEX inputs across all panes
      if (this.overlay) {
        this.overlay.addEventListener('click', (e) => {
          const swatch = e.target.closest('.ed-swatch');
          if (!swatch) return;
          AudioFX.playClick();
          const field = swatch.dataset.colorField;
          const hex = swatch.dataset.hex;
          this._applyColorField(field, hex, true);
        });

        this.overlay.addEventListener('input', (e) => {
          const picker = e.target.closest('[data-color-picker]');
          if (picker) {
            this._applyColorField(picker.dataset.colorPicker, picker.value.toUpperCase(), false);
            return;
          }
          const hexInput = e.target.closest('[data-hex-input]');
          if (hexInput) {
            let raw = hexInput.value.trim().toUpperCase();
            if (raw && !raw.startsWith('#')) raw = '#' + raw;
            if (/^#[0-9A-F]{6}$/.test(raw)) {
              this._applyColorField(hexInput.dataset.hexInput, raw, false, true);
            }
            return;
          }
          const slider = e.target.closest('.ed-range-input');
          if (slider) {
            const key = slider.dataset.stat;
            const val = global.F1Data.clampStat(slider.value, 80);
            const { driver } = this._getCurrentPair();
            driver.stats[key] = val;
            this._updateSliderVisual(key, val);
            this._updateOvrDisplay();
            this._markDirty();
          }
        });
      }

      // Close with Escape when open
      window.addEventListener('keydown', (e) => {
        if (this.isOpen && e.code === 'Escape') {
          e.preventDefault();
          AudioFX.playBack();
          this.close(false);
        }
      });
    }

    _getCurrentPair() {
      const driver = global.F1Data.getDriverById(this.editingDriverId || this.getSelectedDriverId());
      const team = global.F1Data.getTeamById(driver.teamId);
      return { driver, team };
    }

    _applyColorField(field, hex, updateTextInput = true, skipTextOverwrite = false) {
      const cleanHex = global.F1Data.sanitizeHex(hex, '#FFFFFF');
      const { driver, team } = this._getCurrentPair();

      if (field === 'primary') {
        team.primary = cleanHex;
        team.suit = cleanHex; // Keep fireproof suit synchronized with chassis primary color
      } else if (field === 'secondary') {
        team.secondary = cleanHex;
      } else if (field === 'accent') {
        team.accent = cleanHex;
      } else if (field === 'wheelRim') {
        team.wheelRim = cleanHex;
      } else if (field in driver.look) {
        driver.look[field] = cleanHex;
      }

      // Sync UI inputs for this color field
      const picker = this.overlay.querySelector(`[data-color-picker="${field}"]`);
      if (picker) picker.value = cleanHex;
      const hexInput = this.overlay.querySelector(`[data-hex-input="${field}"]`);
      if (hexInput && (!skipTextOverwrite || updateTextInput)) hexInput.value = cleanHex;

      this.overlay.querySelectorAll(`.ed-swatch[data-color-field="${field}"]`).forEach(sw => {
        sw.classList.toggle('active', sw.dataset.hex.toUpperCase() === cleanHex);
      });

      this._markDirty();
      this._schedule3DRefresh();
    }

    _setViewMode(mode) {
      this.viewMode = mode === 'cockpit' ? 'cockpit' : 'duo';
      if (this.btnViewDuo) this.btnViewDuo.classList.toggle('active', this.viewMode === 'duo');
      if (this.btnViewCockpit) this.btnViewCockpit.classList.toggle('active', this.viewMode === 'cockpit');
      const mgr = this.getSceneMgr();
      if (mgr) {
        const { driver, team } = this._getCurrentPair();
        mgr.setEditorViewMode(this.viewMode, driver, team);
      }
    }

    _populateDriverSelect() {
      if (!this.driverSelect) return;
      const { DRIVERS, getTeamById } = global.F1Data;
      this.driverSelect.innerHTML = DRIVERS.map(d => {
        const t = getTeamById(d.teamId);
        return `<option value="${d.id}">${d.flag} #${d.number} ${d.name} (${t.name})</option>`;
      }).join('');
      this.driverSelect.value = this.editingDriverId;
    }

    _refreshDriverDropdownLabel() {
      if (!this.driverSelect) return;
      const { driver, team } = this._getCurrentPair();
      const opt = this.driverSelect.querySelector(`option[value="${driver.id}"]`);
      if (opt) opt.textContent = `${driver.flag} #${driver.number} ${driver.name} (${team.name})`;
    }

    _populateForm() {
      const { driver, team } = this._getCurrentPair();
      const { STAT_META } = global.F1Data;

      // Tab 1
      if (this.teamNameInput) this.teamNameInput.value = team.name;
      if (this.carNumberInput) this.carNumberInput.value = driver.number;
      this._syncColorControl('primary', team.primary);
      this._syncColorControl('secondary', team.secondary);
      this._syncColorControl('accent', team.accent);
      this._syncColorControl('wheelRim', team.wheelRim);

      // Tab 2
      if (this.driverNameInput) this.driverNameInput.value = driver.name;
      if (this.driverShortInput) this.driverShortInput.value = driver.short;
      if (this.driverFlagSelect) {
        // Ensure driver's flag exists in options
        const hasFlag = Array.from(this.driverFlagSelect.options).some(o => o.value === driver.flag);
        if (!hasFlag) {
          const opt = document.createElement('option');
          opt.value = driver.flag;
          opt.textContent = `${driver.flag} Personalizado`;
          this.driverFlagSelect.appendChild(opt);
        }
        this.driverFlagSelect.value = driver.flag;
      }
      this._syncStyleChips();
      this._syncColorControl('skin', driver.look.skin);
      this._syncColorControl('hairColor', driver.look.hairColor);
      this._syncColorControl('helmetMain', driver.look.helmetMain);
      this._syncColorControl('helmetStripe', driver.look.helmetStripe);
      this._syncColorControl('helmetAccent', driver.look.helmetAccent);
      this._syncColorControl('visor', driver.look.visor);

      // Tab 3
      STAT_META.forEach(meta => {
        const val = global.F1Data.clampStat(driver.stats[meta.key], 80);
        const range = document.getElementById(`ed-range-${meta.key}`);
        if (range) range.value = val;
        this._updateSliderVisual(meta.key, val);
      });
      this._updateOvrDisplay();
    }

    _syncColorControl(field, hex) {
      const cleanHex = global.F1Data.sanitizeHex(hex, '#FFFFFF');
      const picker = this.overlay.querySelector(`[data-color-picker="${field}"]`);
      if (picker) picker.value = cleanHex;
      const hexInput = this.overlay.querySelector(`[data-hex-input="${field}"]`);
      if (hexInput) hexInput.value = cleanHex;
      this.overlay.querySelectorAll(`.ed-swatch[data-color-field="${field}"]`).forEach(sw => {
        sw.classList.toggle('active', sw.dataset.hex.toUpperCase() === cleanHex);
      });
    }

    _syncStyleChips() {
      const { driver } = this._getCurrentPair();
      if (this.hairStyleGrid) {
        this.hairStyleGrid.querySelectorAll('[data-hair]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.hair === driver.look.hairStyle);
        });
      }
      if (this.beardStyleGrid) {
        this.beardStyleGrid.querySelectorAll('[data-beard]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.beard === driver.look.beard);
        });
      }
    }

    _updateSliderVisual(key, val) {
      const valEl = document.getElementById(`ed-val-${key}`);
      if (valEl) valEl.textContent = val;
      const range = document.getElementById(`ed-range-${key}`);
      if (range) {
        const pct = ((val - 1) / 98) * 100;
        range.style.setProperty('--sl-pct', `${pct}%`);
      }
    }

    _updateOvrDisplay() {
      const { driver } = this._getCurrentPair();
      const ovr = global.F1Data.getDriverOverall(driver);
      if (this.ovrBadge) this.ovrBadge.textContent = ovr;
      if (this.statsOvrBig) this.statsOvrBig.textContent = ovr;
      if (this.statsTierBadge) {
        if (ovr >= 94) {
          this.statsTierBadge.textContent = '🌟 LEYENDA F1';
          this.statsTierBadge.className = 'ed-tier-pill tier-legend';
        } else if (ovr >= 88) {
          this.statsTierBadge.textContent = '🔥 ÉLITE MUNDIAL';
          this.statsTierBadge.className = 'ed-tier-pill tier-elite';
        } else if (ovr >= 80) {
          this.statsTierBadge.textContent = '⚡ PILOTO PRO';
          this.statsTierBadge.className = 'ed-tier-pill tier-pro';
        } else {
          this.statsTierBadge.textContent = '🏁 PROMESA';
          this.statsTierBadge.className = 'ed-tier-pill tier-rookie';
        }
      }
    }

    _markDirty() {
      this.hasUnsavedChanges = true;
      if (this.btnSave) this.btnSave.classList.add('has-changes');
    }

    _schedule3DRefresh() {
      if (this.rafPending) return;
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        const mgr = this.getSceneMgr();
        if (!mgr || !this.isOpen) return;
        const { driver, team } = this._getCurrentPair();
        mgr.refreshEditorPreview(driver, team);
      });
    }

    switchTab(tabName) {
      this.activeTab = tabName || 'car';
      this.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.edTab === this.activeTab));
      this.tabPanes.forEach(p => p.classList.toggle('active', p.id === `ed-pane-${this.activeTab}`));
      this.getSceneMgr()?.setEditorFocus(this.activeTab);
    }

    updateFabVisibility(screenId) {
      if (!this.fab) return;
      const allowed = (screenId === 'home' || screenId === 'select' || screenId === 'circuit') && !this.isOpen;
      this.fab.classList.toggle('visible', allowed);
      document.body.dataset.screen = screenId;
    }

    open(driverId = null) {
      const { DRIVERS, TEAMS, deepClone } = global.F1Data;
      this.isOpen = true;
      this.editingDriverId = driverId || this.getSelectedDriverId();
      this.hasUnsavedChanges = false;
      this.snapshotDrivers = deepClone(DRIVERS);
      this.snapshotTeams = deepClone(TEAMS);

      if (this.btnSave) this.btnSave.classList.remove('has-changes');
      this._populateDriverSelect();
      this._populateForm();
      this.switchTab('car');

      document.body.classList.add('editor-open');
      if (this.overlay) this.overlay.classList.add('open');
      this.updateFabVisibility(this.getCurrentScreen());

      const mgr = this.getSceneMgr();
      if (mgr) {
        const { driver, team } = this._getCurrentPair();
        mgr.editorViewMode = this.viewMode;
        mgr.enterEditorPreview(driver, team);
        if (this.btnAutoSpin) this.btnAutoSpin.classList.toggle('active', mgr.editorAutoRotate);
      }
      if (this.btnViewDuo) this.btnViewDuo.classList.toggle('active', this.viewMode === 'duo');
      if (this.btnViewCockpit) this.btnViewCockpit.classList.toggle('active', this.viewMode === 'cockpit');
    }

    saveChanges() {
      const { driver, team } = this._getCurrentPair();
      // Guarantee non-empty strings before persisting
      if (!team.name || !team.name.trim()) {
        team.name = global.F1Data.getDefaultTeamById(team.id).name;
      }
      if (!driver.name || !driver.name.trim()) {
        driver.name = global.F1Data.getDefaultDriverById(driver.id).name;
      }
      if (!driver.short || !driver.short.trim()) {
        driver.short = global.F1Data.getDefaultDriverById(driver.id).short;
      }
      driver.short = driver.short.toUpperCase().slice(0, 3);

      global.F1Data.saveCustomizations();
      this.snapshotDrivers = global.F1Data.deepClone(global.F1Data.DRIVERS);
      this.snapshotTeams = global.F1Data.deepClone(global.F1Data.TEAMS);
      this.hasUnsavedChanges = false;
      if (this.btnSave) this.btnSave.classList.remove('has-changes');

      global.AudioFX.playSelectDriver();
      this._populateForm();
      this._refreshDriverDropdownLabel();
      this._schedule3DRefresh();
      this.onCommitChanges?.(driver.id);
      this._showToast('✅ ¡Cambios guardados!');
    }

    restoreCurrentDefaults() {
      const { driver, team } = global.F1Data.restoreDriverAndTeamDefaults(this.editingDriverId);
      // Update snapshot so restored values persist even if user immediately closes
      this.snapshotDrivers = global.F1Data.deepClone(global.F1Data.DRIVERS);
      this.snapshotTeams = global.F1Data.deepClone(global.F1Data.TEAMS);
      this.hasUnsavedChanges = false;
      if (this.btnSave) this.btnSave.classList.remove('has-changes');

      global.AudioFX.playClick();
      this._populateForm();
      this._refreshDriverDropdownLabel();
      this._schedule3DRefresh();
      this.onCommitChanges?.(driver.id);
      this._showToast(`↩️ ${driver.name} y ${team.name} restaurados`);
    }

    close(keepUnsaved = false) {
      if (!this.isOpen) return;

      // Revert unsaved draft edits cleanly if closed via ✕ without clicking Guardar Cambios
      if (!keepUnsaved && this.hasUnsavedChanges && this.snapshotDrivers && this.snapshotTeams) {
        this.snapshotTeams.forEach((t, idx) => Object.assign(global.F1Data.TEAMS[idx], t));
        this.snapshotDrivers.forEach((d, idx) => Object.assign(global.F1Data.DRIVERS[idx], d));
      }

      this.isOpen = false;
      this.hasUnsavedChanges = false;
      document.body.classList.remove('editor-open');
      if (this.overlay) this.overlay.classList.remove('open');

      this.onExitEditor?.();
      this.updateFabVisibility(this.getCurrentScreen());
    }

    _showToast(msg) {
      if (!this.toastEl) return;
      this.toastEl.textContent = msg;
      this.toastEl.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2200);
    }
  }

  global.F1EditorController = F1EditorController;
})(window);
