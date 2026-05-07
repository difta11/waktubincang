/**
 * app.js
 * Main entry point — bootstraps all modules in dependency order.
 *
 * Replace the inline <script type="module"> block at the bottom of index.html
 * with a single import:
 *
 *   <script type="module" src="js/app.js"></script>
 *
 * Keep the existing non-module <script> blocks that contain the timecode engine
 * and UI helpers (togglePlay, resetTC, renderBlocks, etc.) — app.js only
 * adds the Firebase integration layer without touching them.
 */

import FirebaseService from './firebase-service.js';
import DeviceManager   from './device-manager.js';
import SessionManager  from '../session-manager.js';
import EventManager    from './event-manager.js';
import RealtimeSync    from '../realtime-sync.js';
import { initToast, showToast } from '../utils.js';

// ─── Boot sequence ────────────────────────────────────────────────────────────

async function boot() {
  // 1. Toast (UI element, no deps)
  initToast();
  window.showToast = showToast;

  // 2. Firebase (must be first — other modules need window.db etc.)
  const db = FirebaseService.init();

  // 3. Device identity & presence
  DeviceManager.init();

  // 4. Realtime sync — exposes attach/detach globals
  RealtimeSync.init();

  // 5. Session / block management — exposes renderBlocks, openBlock etc.
  SessionManager.init();

  // 6. Event / marking management — exposes addPoint, toggleRange etc.
  EventManager.init();

  // ── Fire post-init callbacks expected by existing inline code ──────────────
  if (typeof window.updateIdentityUI   === 'function') window.updateIdentityUI();
  if (typeof window.broadcastPresence  === 'function') window.broadcastPresence();

  // ── Process any pending listeners (block opened before Firebase was ready) ─
  if (window._pendingTimecodeBlock) {
    RealtimeSync.attachTimecodeListener(window._pendingTimecodeBlock);
    window._pendingTimecodeBlock = null;
  }
  if (window._pendingMarkersBlock) {
    RealtimeSync.attachMarkersListener(window._pendingMarkersBlock);
    window._pendingMarkersBlock = null;
  }

  // ── Global online-users count listener ─────────────────────────────────────
  FirebaseService.listen('session1/users', (data) => {
    const count = data ? Object.keys(data).length : 0;
    const el    = document.getElementById('online-count');
    if (el) el.innerText = `${count} online`;
  });

  // ── Restore last session (if user refreshed while inside a block) ──────────
  SessionManager.tryRestoreSession();

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  _initKeyboardShortcuts();

  // ── Connection status indicator ─────────────────────────────────────────────
  _initConnectionStatus();

  console.log('[App] Boot complete ✓  device:', DeviceManager.deviceId);
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function _initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't fire when typing in an input/textarea
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Close open modals on Escape
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
      return;
    }

    // Only active inside a block
    if (!SessionManager.currentBlockId) return;

    switch (e.key) {
      case ' ':
      case 'p':
        e.preventDefault();
        if (typeof window.togglePlay === 'function' && window.isHost) window.togglePlay();
        break;
      case 'm':
      case 'M':
        e.preventDefault();
        EventManager.addPoint();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        EventManager.toggleRange();
        break;
      case '0':
        e.preventDefault();
        if (typeof window.resetTC === 'function' && window.isHost) window.resetTC();
        break;
    }
  });
}

// ─── Connection status ────────────────────────────────────────────────────────
// Colours the user-dot green/amber based on navigator.onLine

function _initConnectionStatus() {
  const dots = document.querySelectorAll('.user-dot, #identity-dot');

  function updateDots(online) {
    dots.forEach(d => {
      d.style.background = online ? 'var(--green)' : 'var(--amber)';
    });
    if (!online) showToast('⚠️ Koneksi terputus — mencoba reconnect…');
    else         showToast('✅ Terhubung kembali');
  }

  window.addEventListener('online',  () => updateDots(true));
  window.addEventListener('offline', () => updateDots(false));
}

// ─── Kick off ─────────────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[App] Boot failed:', err);
  showToast('❌ Gagal menghubungkan ke Firebase');
});
