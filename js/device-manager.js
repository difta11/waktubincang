/**
 * device-manager.js
 * Manages device identity, presence broadcasting, and online-user tracking.
 *
 * Data paths:
 *   session1/users/{deviceId}  →  { name, deviceId, lastSeen, connectedAt }
 *
 * Usage:
 *   import DeviceManager from './device-manager.js';
 *   DeviceManager.init();
 */

import FirebaseService from './firebase-service.js';
import { Storage, nameToColor, nameToInitials, showToast } from '../utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const PRESENCE_PATH   = 'session1/users';
const HEARTBEAT_MS    = 15_000;  // write lastSeen every 15 s
const USERNAME_KEY    = 'markpro_username';
const DEVICE_ID_KEY   = 'markpro_deviceid';
const DEFAULT_NAMES   = ['Cam A','Cam B','Director','Script','Sound','Vfx','Floor'];

// ─── State ────────────────────────────────────────────────────────────────────
let _deviceId   = null;
let _username   = null;
let _onlineCount = 0;
let _heartbeat  = null;
let _presenceUnsub = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _generateDeviceId() {
  return 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _randomName() {
  return DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)] +
         '_' + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ─── Public API ───────────────────────────────────────────────────────────────
const DeviceManager = {

  // ── Getters ──────────────────────────────────────────────────────────────────

  get deviceId()    { return _deviceId; },
  get username()    { return _username; },
  get onlineCount() { return _onlineCount; },

  // ── Init ─────────────────────────────────────────────────────────────────────

  init() {
    // Restore or generate persistent device id
    _deviceId = Storage.get(DEVICE_ID_KEY) || _generateDeviceId();
    Storage.set(DEVICE_ID_KEY, _deviceId);

    // Restore or generate username
    _username = Storage.get(USERNAME_KEY);
    if (!_username) {
      _username = _randomName();
      Storage.set(USERNAME_KEY, _username);
    }

    // Sync to legacy global (used by inline index.html scripts)
    window.username = _username;
    window.deviceId = _deviceId;

    this._updateIdentityUI();
    this._startPresence();
    this._listenOnlineCount();

    // Re-export rename capability to window for inline onclick handlers
    window.openRenameModal = () => DeviceManager.openRenameModal();
  },

  // ── Presence ─────────────────────────────────────────────────────────────────

  _presencePath() {
    return `${PRESENCE_PATH}/${_deviceId}`;
  },

  _presence() {
    return {
      name:        _username,
      deviceId:    _deviceId,
      lastSeen:    Date.now(),
      connectedAt: Date.now()
    };
  },

  async _startPresence() {
    // Write initial presence
    await FirebaseService.set(this._presencePath(), this._presence());

    // Auto-remove on disconnect
    FirebaseService.onDisconnectRemove(this._presencePath());

    // Heartbeat
    clearInterval(_heartbeat);
    _heartbeat = setInterval(async () => {
      await FirebaseService.set(`${PRESENCE_PATH}/${_deviceId}/lastSeen`, Date.now());
    }, HEARTBEAT_MS);
  },

  async broadcastPresence() {
    await FirebaseService.set(this._presencePath(), this._presence());
    FirebaseService.onDisconnectRemove(this._presencePath());
  },

  // ── Online count listener ─────────────────────────────────────────────────

  _listenOnlineCount() {
    if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }
    _presenceUnsub = FirebaseService.listen(PRESENCE_PATH, (data) => {
      const users = data ? Object.values(data) : [];
      _onlineCount = users.length;
      const el = document.getElementById('online-count');
      if (el) el.innerText = `${_onlineCount} online`;
    });
  },

  // ── Username management ───────────────────────────────────────────────────

  async setUsername(newName) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === _username) return;
    _username = trimmed;
    window.username = _username;
    Storage.set(USERNAME_KEY, _username);
    await this.broadcastPresence();
    this._updateIdentityUI();
  },

  // ── UI updates ────────────────────────────────────────────────────────────

  _updateIdentityUI() {
    const color    = nameToColor(_username);
    const initials = nameToInitials(_username);

    // Header display
    const headerName = document.getElementById('username-display');
    if (headerName) headerName.textContent = _username || '—';

    // Identity bar (blocks screen)
    const identName   = document.getElementById('identity-name');
    const identAvatar = document.getElementById('identity-avatar');
    if (identName)   identName.textContent   = _username || '—';
    if (identAvatar) {
      identAvatar.textContent    = initials;
      identAvatar.style.background = color;
    }
  },

  // ── Rename modal ──────────────────────────────────────────────────────────

  openRenameModal() {
    // Try to use existing modal in index.html
    const modal = document.getElementById('modal-rename');
    if (modal) {
      const input = document.getElementById('rename-input');
      if (input) input.value = _username;
      modal.classList.add('open');
      if (input) setTimeout(() => { input.focus(); input.select(); }, 50);
      return;
    }
    // Fallback: simple prompt
    const name = prompt('Nama kamu:', _username);
    if (name) this.setUsername(name);
  },

  confirmRename() {
    const input = document.getElementById('rename-input');
    if (!input) return;
    const name = input.value.trim();
    if (name) {
      this.setUsername(name);
      showToast('✅ Nama diperbarui: ' + name);
    }
    const modal = document.getElementById('modal-rename');
    if (modal) modal.classList.remove('open');
  },

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    clearInterval(_heartbeat);
    if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }
  }
};

export default DeviceManager;

// ── Wire inline index.html handlers ──────────────────────────────────────────
// These globals are called by onclick="..." attributes in the existing HTML.
// Declare here so they work even before app.js runs.
window.updateIdentityUI   = () => DeviceManager._updateIdentityUI();
window.broadcastPresence  = () => DeviceManager.broadcastPresence();
window.confirmRename      = () => DeviceManager.confirmRename();
