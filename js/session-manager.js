/**
 * session-manager.js
 * Manages "blocks" (timecode sessions) — create, list, join, delete.
 *
 * Firebase paths:
 *   session1/blocks/{blockId}  →  block object
 *
 * Each block:
 * {
 *   id, name, fps, created, createdBy,
 *   liveUser, markings: { [fbKey]: marking }
 * }
 */

import FirebaseService from './js/firebase-service.js';
import DeviceManager   from './device-manager.js';
import { Storage, nameToColor, nameToInitials, showToast } from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const BLOCKS_PATH     = 'session1/blocks';
const CURRENT_BLK_KEY = 'markpro_currentBlock';

// ─── State ────────────────────────────────────────────────────────────────────
let _blocks       = [];        // local cache
let _blocksUnsub  = null;      // realtime listener unsubscribe
let _currentBlockId = null;

// ─── Public API ───────────────────────────────────────────────────────────────
const SessionManager = {

  // ── Getters ──────────────────────────────────────────────────────────────────

  get blocks()         { return _blocks; },
  get currentBlockId() { return _currentBlockId; },

  getBlock(id) {
    return _blocks.find(b => b.id === id) ?? null;
  },

  getCurrentBlock() {
    return _currentBlockId ? this.getBlock(_currentBlockId) : null;
  },

  // ── Init ──────────────────────────────────────────────────────────────────────

  init() {
    this.attachBlocksListener();

    // Expose globals used by inline onclick handlers in index.html
    window.blocks         = _blocks;
    window.currentBlockId = _currentBlockId;
    window.getCurrentBlock = () => SessionManager.getCurrentBlock();
    window.openNewBlockModal = () => SessionManager.openNewBlockModal();
    window.confirmNewBlock   = () => SessionManager.confirmNewBlock();
    window.renderBlocks      = () => SessionManager.renderBlocks();
    window.backToBlocks      = () => SessionManager.backToBlocks();
    window.deleteBlock       = (id) => SessionManager.deleteBlock(id);
    window.openBlock         = (id) => SessionManager.openBlock(id);
  },

  // ── Blocks realtime listener ─────────────────────────────────────────────────

  attachBlocksListener() {
    if (_blocksUnsub) { _blocksUnsub(); _blocksUnsub = null; }
    _blocksUnsub = FirebaseService.listen(BLOCKS_PATH, (data) => {
      const prev = _currentBlockId;

      if (!data) {
        _blocks = [];
      } else {
        _blocks = Object.entries(data).map(([id, b]) => ({
          id,
          ...b,
          markings: b.markings
            ? Object.entries(b.markings).map(([fbKey, m]) => ({ ...m, _fbKey: fbKey }))
            : []
        }));
        _blocks.sort((a, b) => (b.created || 0) - (a.created || 0));
      }

      // Keep global reference in sync (for legacy inline code)
      window.blocks = _blocks;

      this.renderBlocks();

      // If we're inside a block, refresh local markings cache
      if (prev && _currentBlockId === prev) {
        const block = this.getBlock(prev);
        if (block && typeof window.markings !== 'undefined') {
          window.markings = block.markings;
        }
        if (typeof window.renderList  === 'function') window.renderList();
        if (typeof window.renderStats === 'function') window.renderStats();
      }
    });
  },

  detachBlocksListener() {
    if (_blocksUnsub) { _blocksUnsub(); _blocksUnsub = null; }
  },

  // ── Create block ─────────────────────────────────────────────────────────────

  openNewBlockModal() {
    const modal = document.getElementById('modal-new-block');
    if (modal) {
      const inp = document.getElementById('new-block-name');
      if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 50); }
      modal.classList.add('open');
    }
  },

  async confirmNewBlock() {
    const inp  = document.getElementById('new-block-name');
    const name = inp?.value.trim() || `Block ${_blocks.length + 1}`;

    const id    = 'blk_' + Date.now().toString(36);
    const block = {
      id,
      name,
      fps:       25,
      created:   Date.now(),
      createdBy: DeviceManager.username,
      liveUser:  null,
      markings:  {}
    };

    await FirebaseService.set(`${BLOCKS_PATH}/${id}`, block);

    const modal = document.getElementById('modal-new-block');
    if (modal) modal.classList.remove('open');

    showToast('✅ Block dibuat: ' + name);

    // Auto-open
    setTimeout(() => this.openBlock(id), 200);
  },

  // ── Delete block ─────────────────────────────────────────────────────────────

  async deleteBlock(id) {
    if (!confirm('Hapus block ini dan semua markingnya?')) return;
    await FirebaseService.remove(`${BLOCKS_PATH}/${id}`);
    await FirebaseService.remove(`session1/timecodes/${id}`);
    await FirebaseService.remove(`session1/settings/${id}`);
    if (_currentBlockId === id) this.backToBlocks();
    showToast('🗑 Block dihapus');
  },

  // ── Open / close block ────────────────────────────────────────────────────────

  openBlock(id) {
    const block = this.getBlock(id);
    if (!block) { showToast('Block tidak ditemukan'); return; }

    _currentBlockId        = id;
    window.currentBlockId  = id;
    Storage.set(CURRENT_BLK_KEY, id);

    // Show session screen, hide blocks screen
    document.getElementById('screen-blocks').style.display  = 'none';
    const ss = document.getElementById('screen-session');
    ss.style.display        = 'flex';
    ss.style.flexDirection  = 'column';

    // Session header
    const nameDisp = document.getElementById('session-name-display');
    if (nameDisp) nameDisp.textContent = block.name;

    // Determine host: first user to open = host, or createdBy
    const isHost = !block.liveUser || block.createdBy === DeviceManager.username;
    window.isHost = isHost;

    const roleChip = document.getElementById('session-role-chip');
    if (roleChip) {
      roleChip.textContent  = isHost ? 'HOST' : 'GUEST';
      roleChip.className    = isHost ? 'host-chip' : 'guest-chip';
    }

    const guestNotice = document.getElementById('guest-control-notice');
    if (guestNotice) guestNotice.style.display = isHost ? 'none' : '';

    // Desktop right panel
    if (window.innerWidth >= 700) {
      const rp = document.getElementById('tc-right-desktop');
      if (rp) rp.style.display = 'flex';
    }

    // Sync global markings + re-render
    window.markings = block.markings;
    if (typeof window.updateDisplay === 'function') window.updateDisplay();
    if (typeof window.renderList    === 'function') window.renderList();
    if (typeof window.renderStats   === 'function') window.renderStats();
    if (typeof window.renderUserList === 'function') window.renderUserList();
    if (typeof window.updateHostControls === 'function') window.updateHostControls();
    DeviceManager._updateIdentityUI();

    // Attach per-block realtime listeners
    if (typeof window.attachTimecodeListener  === 'function') window.attachTimecodeListener(id);
    if (typeof window.attachSettingsListener  === 'function') window.attachSettingsListener(id);
    window._lastMarkerCount = block.markings.length;
    if (typeof window.attachMarkersListener   === 'function') window.attachMarkersListener(id);

    // Host: sync settings immediately
    if (isHost && window.firebaseReady && typeof window.syncSettings === 'function') {
      try { window.syncSettings(); } catch(e) {}
    }
  },

  backToBlocks() {
    // Stop timecode if running
    if (window.running) {
      window.running = false;
      cancelAnimationFrame(window.raf);
      window.raf = null;
    }

    // Detach per-block listeners
    if (typeof window.detachTimecodeListener  === 'function') window.detachTimecodeListener();
    if (typeof window.detachSettingsListener  === 'function') window.detachSettingsListener();
    if (typeof window.detachMarkersListener   === 'function') window.detachMarkersListener();

    // Clear liveUser if we were host
    const block = this.getCurrentBlock();
    if (block && block.liveUser === DeviceManager.username) {
      FirebaseService.set(`${BLOCKS_PATH}/${_currentBlockId}/liveUser`, null).catch(() => {});
    }

    _currentBlockId        = null;
    window.currentBlockId  = null;
    Storage.remove(CURRENT_BLK_KEY);

    document.getElementById('screen-session').style.display = 'none';
    const bs = document.getElementById('screen-blocks');
    bs.style.display       = 'flex';
    bs.style.flexDirection = 'column';

    this.renderBlocks();
  },

  // ── Render block list ─────────────────────────────────────────────────────────

  renderBlocks() {
    const grid  = document.getElementById('blocks-grid');
    const empty = document.getElementById('blocks-empty');
    if (!grid) return;

    if (!_blocks.length) {
      if (empty) empty.style.display = '';
      // Remove all cards but keep the empty state element
      [...grid.children].forEach(c => { if (c !== empty) c.remove(); });
      return;
    }

    if (empty) empty.style.display = 'none';

    // Build a map of existing cards for efficient patching
    const existing = {};
    [...grid.querySelectorAll('.block-card')].forEach(c => {
      existing[c.dataset.blockId] = c;
    });

    // Render each block
    _blocks.forEach((block, idx) => {
      let card = existing[block.id];
      const isLive   = !!block.liveUser;
      const html     = this._blockCardHTML(block);

      if (!card) {
        card = document.createElement('div');
        card.className          = 'block-card';
        card.dataset.blockId    = block.id;
        card.addEventListener('click', (e) => {
          // Don't open if clicking on action buttons
          if (e.target.closest('.block-card-actions')) return;
          SessionManager.openBlock(block.id);
        });
        grid.appendChild(card);
        delete existing[block.id];
      } else {
        delete existing[block.id];
      }

      card.innerHTML = html;
    });

    // Remove stale cards
    Object.values(existing).forEach(c => c.remove());
  },

  _blockCardHTML(block) {
    const isLive      = !!block.liveUser;
    const markCount   = Array.isArray(block.markings) ? block.markings.length : 0;
    const created     = block.created ? new Date(block.created).toLocaleString('id-ID') : '—';
    const color       = nameToColor(block.createdBy || '');
    const initials    = nameToInitials(block.createdBy || '');

    return `
      <div class="block-card-top">
        <div class="block-card-name">${this._esc(block.name)}</div>
        ${isLive ? `<div class="live-badge"><div class="live-badge-dot"></div>LIVE</div>` : ''}
      </div>
      <div class="block-card-meta">
        <span class="block-meta-pill">⏱ ${block.fps || 25} FPS</span>
        <span class="block-meta-pill">📌 ${markCount} marking</span>
        <span class="block-meta-pill">🕐 ${created}</span>
      </div>
      <div class="block-card-participants">
        <div class="participant-dot" style="background:${color}" title="${this._esc(block.createdBy || '')}">
          ${initials}
        </div>
        ${isLive ? `<span style="font-size:10px;color:var(--red);margin-left:6px">● ${this._esc(block.liveUser)} sedang live</span>` : ''}
        <span class="join-badge">Tap untuk buka →</span>
      </div>
      <div class="block-card-actions">
        <button class="btn sm danger" onclick="event.stopPropagation();deleteBlock('${block.id}')">🗑 Hapus</button>
      </div>
    `;
  },

  _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  // ── Session restore after page refresh ───────────────────────────────────────

  tryRestoreSession() {
    const savedId = Storage.get(CURRENT_BLK_KEY);
    if (!savedId) return;

    // Wait until blocks listener has populated data
    const attempt = (tries = 0) => {
      const block = this.getBlock(savedId);
      if (block) {
        if (!_currentBlockId) this.openBlock(savedId);
      } else if (tries < 10) {
        setTimeout(() => attempt(tries + 1), 300);
      }
    };
    setTimeout(() => attempt(), 300);
  }
};

export default SessionManager;
