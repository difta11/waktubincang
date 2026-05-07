/**
 * realtime-sync.js
 * Per-block realtime Firebase listeners.
 *
 * Manages three listener categories:
 *   1. Timecode state  → session1/timecodes/{blockId}
 *   2. Settings (fps/format) → session1/settings/{blockId}
 *   3. Markings → session1/blocks/{blockId}/markings
 *
 * All listeners are attached when a block is opened and detached on close.
 * This module is purely reactive — it only reads from Firebase and updates
 * local state / UI.  Writes are done by EventManager / timecode engine.
 */

import FirebaseService from './js/firebase-service.js';
import SessionManager  from './session-manager.js';
import DeviceManager   from './device-manager.js';
import { showToast }   from './utils.js';

// ─── Unsubscribe handles ──────────────────────────────────────────────────────
let _tcUnsub       = null;
let _settingsUnsub = null;
let _markersUnsub  = null;

// ─── Public API ───────────────────────────────────────────────────────────────
const RealtimeSync = {

  init() {
    // Expose attach/detach functions to global scope for index.html inline code
    window.attachTimecodeListener  = (id) => RealtimeSync.attachTimecodeListener(id);
    window.detachTimecodeListener  = ()   => RealtimeSync.detachTimecodeListener();
    window.attachSettingsListener  = (id) => RealtimeSync.attachSettingsListener(id);
    window.detachSettingsListener  = ()   => RealtimeSync.detachSettingsListener();
    window.attachMarkersListener   = (id) => RealtimeSync.attachMarkersListener(id);
    window.detachMarkersListener   = ()   => RealtimeSync.detachMarkersListener();
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TIMECODE LISTENER
  // ═══════════════════════════════════════════════════════════════════════════

  attachTimecodeListener(blockId) {
    if (_tcUnsub) { _tcUnsub(); _tcUnsub = null; }
    let firstCall = true;

    _tcUnsub = FirebaseService.listen(`session1/timecodes/${blockId}`, (data) => {
      // Guard: ignore if we navigated away
      if (SessionManager.currentBlockId !== blockId) return;

      // Update LIVE badge
      const block = SessionManager.getCurrentBlock();
      if (block) {
        const wasLive  = !!block.liveUser;
        block.liveUser = data?.running ? (data.host || null) : null;
        if (wasLive !== !!block.liveUser && typeof window.renderBlocks === 'function') {
          window.renderBlocks();
        }
      }
      if (data && typeof window._updateLiveBadgeInSession === 'function') {
        window._updateLiveBadgeInSession(!!data.running);
      }

      if (!data) { firstCall = false; return; }

      const fps = window.fps || 25;

      if (window.isHost) {
        if (firstCall) {
          firstCall = false;
          this._applyTCToHost(data, fps);
        } else {
          // Follow Firebase only if change came from another device
          if (data.host && data.host !== DeviceManager.username) {
            this._applyTCToHost(data, fps);
          }
        }
        return;
      }

      // ── GUEST: always follow Firebase ───────────────────────────────────────
      firstCall = false;
      this._applyTCToGuest(data, fps);
    });
  },

  _applyTCToHost(data, fps) {
    if (data.running && !window.running) {
      const elapsed = (Date.now() - data.startTime) / 1000;
      window.frame  = Math.max(0, Math.floor(elapsed * fps) + (data.frameOffset || 0));
      window.running = true;
      cancelAnimationFrame(window.raf);
      window.lastTime = null;
      window.raf = requestAnimationFrame(window.loop);
      if (typeof window._setPlayUI === 'function') window._setPlayUI(true);
      if (typeof window._updateLiveBadgeInSession === 'function') window._updateLiveBadgeInSession(true);
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
    } else if (!data.running && window.running) {
      window.running = false;
      cancelAnimationFrame(window.raf); window.raf = null;
      if (data.reset) {
        window.frame = 0;
        if (typeof window._applyResetUI === 'function') window._applyResetUI();
      } else if (data.frameAtStop !== undefined) {
        window.frame = data.frameAtStop;
      }
      if (typeof window._setPlayUI === 'function') window._setPlayUI(false);
      if (typeof window._updateLiveBadgeInSession === 'function') window._updateLiveBadgeInSession(false);
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
    }
  },

  _applyTCToGuest(data, fps) {
    if (data.running) {
      const elapsed  = (Date.now() - data.startTime) / 1000;
      const newFrame = Math.floor(elapsed * fps) + (data.frameOffset || 0);
      window.frame   = Math.max(0, newFrame);
      if (!window.running) {
        window.running = true;
        cancelAnimationFrame(window.raf);
        window.lastTime = null;
        window.raf = requestAnimationFrame(window.loop);
        if (typeof window._setPlayUI === 'function') window._setPlayUI(true);
      }
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
    } else {
      window.running = false;
      cancelAnimationFrame(window.raf); window.raf = null;
      if (data.reset) {
        window.frame = 0;
        // Reset range UI
        const ri  = document.getElementById('range-indicator');
        if (ri)   ri.classList.remove('active');
        const btn = document.getElementById('btn-range-toggle');
        if (btn)  { btn.textContent = '▷ Start Range'; btn.classList.remove('warning'); }
        const mri = document.getElementById('m-range-icon');
        if (mri)  mri.textContent = '▷';
        const mrl = document.getElementById('m-range-label');
        if (mrl)  mrl.textContent = 'Start Range';
        const mrb = document.getElementById('m-btn-range');
        if (mrb)  mrb.classList.remove('recording');
      } else if (data.frameAtStop !== undefined) {
        window.frame = data.frameAtStop;
      }
      if (typeof window._setPlayUI === 'function') window._setPlayUI(false);
      if (typeof window._updateLiveBadgeInSession === 'function') window._updateLiveBadgeInSession(false);
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
    }
  },

  detachTimecodeListener() {
    if (_tcUnsub) { _tcUnsub(); _tcUnsub = null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SETTINGS LISTENER  (fps + format)
  // ═══════════════════════════════════════════════════════════════════════════

  attachSettingsListener(blockId) {
    if (_settingsUnsub) { _settingsUnsub(); _settingsUnsub = null; }

    _settingsUnsub = FirebaseService.listen(`session1/settings/${blockId}`, (data) => {
      if (!data || window.isHost || SessionManager.currentBlockId !== blockId) return;

      const validFmts = ['hh:mm:ss:ff','mm:ss:ff','mm:ss','ss:ff'];
      const fpsSel    = document.getElementById('fps-sel');
      const mFpsSel   = document.getElementById('m-fps-sel');
      const fmtSel    = document.getElementById('fmt-sel');
      const mFmtSel   = document.getElementById('m-fmt-sel');
      const customFmt = document.getElementById('custom-fmt');

      if (data.fps && data.fps !== window.fps) {
        window.fps = data.fps;
        if (fpsSel)  fpsSel.value  = data.fps;
        if (mFpsSel) mFpsSel.value = data.fps;
      }

      if (data.fmt) {
        if (validFmts.includes(data.fmt)) {
          if (fmtSel)  fmtSel.value  = data.fmt;
          if (mFmtSel) mFmtSel.value = data.fmt;
          if (customFmt) customFmt.style.display = 'none';
        } else {
          if (fmtSel)  fmtSel.value  = 'custom';
          if (customFmt) {
            customFmt.value        = data.fmt;
            customFmt.style.display = '';
          }
          if (mFmtSel) mFmtSel.value = 'hh:mm:ss:ff';
        }
      }

      if (typeof window.updateDisplay === 'function') window.updateDisplay();
      if (typeof window.renderList    === 'function') window.renderList();
    });
  },

  detachSettingsListener() {
    if (_settingsUnsub) { _settingsUnsub(); _settingsUnsub = null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MARKERS LISTENER
  // ═══════════════════════════════════════════════════════════════════════════

  attachMarkersListener(blockId) {
    if (_markersUnsub) { _markersUnsub(); _markersUnsub = null; }

    _markersUnsub = FirebaseService.listen(
      `session1/blocks/${blockId}/markings`,
      (data) => {
        if (SessionManager.currentBlockId !== blockId) return;

        const block = SessionManager.getCurrentBlock();
        if (!block) return;

        const newMarkings = data && typeof data === 'object'
          ? Object.entries(data).map(([fbKey, m]) => ({ ...m, _fbKey: fbKey }))
          : [];

        block.markings  = newMarkings;
        window.markings = newMarkings;

        if (typeof window.renderList  === 'function') window.renderList();
        if (typeof window.renderStats === 'function') window.renderStats();

        // Toast: notify about markers added by other users
        const prevCount = window._lastMarkerCount ?? 0;
        if (newMarkings.length > prevCount) {
          const newest = newMarkings[newMarkings.length - 1];
          if (newest?.user && newest.user !== DeviceManager.username) {
            showToast('📌 ' + newest.user + ' menambah marking');
          }
        }
        window._lastMarkerCount = newMarkings.length;
      }
    );
  },

  detachMarkersListener() {
    if (_markersUnsub) { _markersUnsub(); _markersUnsub = null; }
  }
};

export default RealtimeSync;
