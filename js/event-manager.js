/**
 * event-manager.js
 * Handles all marking/event recording, display, edit, and delete.
 *
 * Firebase path:
 *   session1/blocks/{blockId}/markings/{fbKey}  →  marking object
 *
 * Each marking:
 * {
 *   id, type, startTC, startFrame, endTC, endFrame,
 *   color, notes, user, ts, _fbKey (local only)
 * }
 */

import FirebaseService from './firebase-service.js';
import DeviceManager   from './device-manager.js';
import SessionManager  from '../session-manager.js';
import { showToast, flashElement } from '../utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const MARKS_PATH = (blockId) => `session1/blocks/${blockId}/markings`;

// ─── State ────────────────────────────────────────────────────────────────────
let _editingId = null;   // id of marking being edited in modal

// ─── Public API ───────────────────────────────────────────────────────────────
const EventManager = {

  // ── Init ─────────────────────────────────────────────────────────────────────

  init() {
    // Wire global functions used by inline onclick handlers
    window.addPoint          = () => EventManager.addPoint();
    window.toggleRange       = () => EventManager.toggleRange();
    window.deleteMarking     = (id) => EventManager.deleteMarking(id);
    window.openEditModal     = (id) => EventManager.openEditModal(id);
    window.confirmEditMarking = () => EventManager.confirmEditMarking();
    window.renderList        = () => EventManager.renderList();
    window.renderStats       = () => EventManager.renderStats();
    window.flashDisplay      = () => EventManager.flashDisplay();
  },

  // ── Add Point ─────────────────────────────────────────────────────────────────

  addPoint() {
    const blockId = SessionManager.currentBlockId;
    if (!blockId) return;

    const tc   = window.frameToTC ? window.frameToTC(window.frame) : '00:00:00:00';
    const mark = {
      id:         Date.now() + Math.random(),
      type:       'point',
      startTC:    tc,
      startFrame: window.frame || 0,
      endTC:      tc,
      endFrame:   window.frame || 0,
      color:      this._getSelectedColor(),
      notes:      this._getNotes() || ('mark' + ((SessionManager.getCurrentBlock()?.markings?.length ?? 0) + 1)),
      user:       DeviceManager.username,
      ts:         Date.now()
    };

    this._syncMarker(blockId, mark);
    this.flashDisplay();

    if (window.innerWidth < 700 && typeof window.switchTab === 'function') {
      window.switchTab('markings');
    }
  },

  // ── Range (Start / End) ───────────────────────────────────────────────────────

  toggleRange() {
    if (window.rangeStart === null || window.rangeStart === undefined) {
      // Start range
      window.rangeStart      = window.frameToTC ? window.frameToTC(window.frame) : '00:00:00:00';
      window.rangeStartFrame = window.frame || 0;

      const ri   = document.getElementById('range-indicator');
      if (ri) ri.classList.add('active');
      const rtog = document.getElementById('btn-range-toggle');
      if (rtog) { rtog.textContent = '■ End Range'; rtog.classList.add('warning'); }
      const mri  = document.getElementById('m-range-icon');
      if (mri) mri.textContent = '■';
      const mrl  = document.getElementById('m-range-label');
      if (mrl) mrl.textContent = 'End Range';
      const mrb  = document.getElementById('m-btn-range');
      if (mrb) mrb.classList.add('recording');

      const rsd = document.getElementById('range-start-display');
      if (rsd) rsd.textContent = 'From ' + window.rangeStart;

    } else {
      // End range
      const blockId = SessionManager.currentBlockId;
      if (!blockId) return;

      const endTC    = window.frameToTC ? window.frameToTC(window.frame) : '00:00:00:00';
      const endFrame = window.frame || 0;
      const block    = SessionManager.getCurrentBlock();

      const mark = {
        id:         Date.now() + Math.random(),
        type:       'range',
        startTC:    window.rangeStart,
        startFrame: window.rangeStartFrame,
        endTC,
        endFrame,
        color:      this._getSelectedColor(),
        notes:      this._getNotes() || ('range' + ((block?.markings?.length ?? 0) + 1)),
        user:       DeviceManager.username,
        ts:         Date.now()
      };

      this._syncMarker(blockId, mark);
      this.flashDisplay();

      // Reset range state
      window.rangeStart      = null;
      window.rangeStartFrame = null;

      const ri   = document.getElementById('range-indicator');
      if (ri) ri.classList.remove('active');
      const rtog = document.getElementById('btn-range-toggle');
      if (rtog) { rtog.textContent = '▷ Start Range'; rtog.classList.remove('warning'); }
      const mri  = document.getElementById('m-range-icon');
      if (mri) mri.textContent = '▷';
      const mrl  = document.getElementById('m-range-label');
      if (mrl) mrl.textContent = 'Start Range';
      const mrb  = document.getElementById('m-btn-range');
      if (mrb) mrb.classList.remove('recording');

      if (window.innerWidth < 700 && typeof window.switchTab === 'function') {
        window.switchTab('markings');
      }
    }
  },

  // ── Firebase sync ─────────────────────────────────────────────────────────────

  async _syncMarker(blockId, mark) {
    try {
      const key = await FirebaseService.push(MARKS_PATH(blockId), mark);
      mark._fbKey = key;
    } catch(e) {
      console.warn('[EventManager] syncMarker error', e);
    }
  },

  async deleteMarking(id) {
    const blockId = SessionManager.currentBlockId;
    if (!blockId) return;
    const block = SessionManager.getCurrentBlock();
    if (!block) return;

    const mark = block.markings.find(m => String(m.id) === String(id));
    if (!mark?._fbKey) return;

    await FirebaseService.remove(`${MARKS_PATH(blockId)}/${mark._fbKey}`);
  },

  async _syncEditMarker(mark) {
    const blockId = SessionManager.currentBlockId;
    if (!blockId || !mark._fbKey) return;
    await FirebaseService.set(`${MARKS_PATH(blockId)}/${mark._fbKey}`, mark);
  },

  // ── Edit modal ────────────────────────────────────────────────────────────────

  openEditModal(id) {
    const block = SessionManager.getCurrentBlock();
    if (!block) return;
    const mark = block.markings.find(m => String(m.id) === String(id));
    if (!mark) return;

    _editingId = id;

    const modal = document.getElementById('modal-edit');
    if (!modal) return;

    const notesEl = document.getElementById('edit-notes');
    if (notesEl) notesEl.value = mark.notes || '';

    // Color picker
    const colorPicker = modal.querySelector('#edit-color-picker');
    if (colorPicker) {
      colorPicker.querySelectorAll('[data-color]').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === mark.color);
      });
    }

    modal.classList.add('open');
    setTimeout(() => notesEl?.focus(), 50);
  },

  async confirmEditMarking() {
    if (_editingId === null) return;

    const block = SessionManager.getCurrentBlock();
    if (!block) return;
    const mark = block.markings.find(m => String(m.id) === String(_editingId));
    if (!mark) return;

    const notesEl = document.getElementById('edit-notes');
    if (notesEl) mark.notes = notesEl.value.trim();

    const modal = document.getElementById('modal-edit');
    const colorSel = modal?.querySelector('#edit-color-picker .selected');
    if (colorSel) mark.color = colorSel.dataset.color;

    await this._syncEditMarker(mark);

    if (modal) modal.classList.remove('open');
    _editingId = null;
    showToast('✅ Marking diperbarui');
  },

  // ── Render marking list ───────────────────────────────────────────────────────

  renderList() {
    const listEl = document.getElementById('list');
    if (!listEl) return;

    const block = SessionManager.getCurrentBlock();
    const markings = block?.markings ?? [];

    if (!markings.length) {
      listEl.innerHTML = `
        <div class="empty-state" style="padding:32px 0">
          <div class="icon">📌</div>
          <p>Belum ada marking.<br>Tekan <b>Point</b> atau <b>Range</b> untuk mulai.</p>
        </div>`;
      return;
    }

    // Sort by startFrame ascending
    const sorted = [...markings].sort((a, b) => (a.startFrame || 0) - (b.startFrame || 0));

    listEl.innerHTML = sorted.map((m, i) => this._markingRowHTML(m, i)).join('');
  },

  _markingRowHTML(m, idx) {
    const tcLabel = m.type === 'range'
      ? `${m.startTC} → ${m.endTC}`
      : m.startTC;
    const durationFrames = (m.endFrame || 0) - (m.startFrame || 0);
    const durationLabel  = m.type === 'range' ? ` (${durationFrames}f)` : '';

    return `
      <div class="list-item" data-mark-id="${m.id}">
        <div class="list-item-color" style="background:${m.color||'var(--accent)'}"></div>
        <div class="list-item-body">
          <div class="list-item-tc">${tcLabel}${durationLabel}</div>
          <div class="list-item-notes">${this._esc(m.notes || '')}
            <span class="list-item-user" style="color:var(--text3);font-size:10px"> · ${this._esc(m.user || '')}</span>
          </div>
        </div>
        <div class="list-item-actions">
          <button class="btn icon sm" title="Edit" onclick="openEditModal(${m.id})">✏️</button>
          <button class="btn icon sm danger" title="Hapus" onclick="deleteMarking(${m.id})">🗑</button>
        </div>
      </div>`;
  },

  // ── Stats ─────────────────────────────────────────────────────────────────────

  renderStats() {
    const statsEl = document.getElementById('stats');
    if (!statsEl) return;

    const block    = SessionManager.getCurrentBlock();
    const markings = block?.markings ?? [];
    const points   = markings.filter(m => m.type === 'point').length;
    const ranges   = markings.filter(m => m.type === 'range').length;

    statsEl.innerHTML = `
      <div class="stat-item"><span class="stat-label">Total</span><span class="stat-value">${markings.length}</span></div>
      <div class="stat-item"><span class="stat-label">Point</span><span class="stat-value">${points}</span></div>
      <div class="stat-item"><span class="stat-label">Range</span><span class="stat-value">${ranges}</span></div>
    `;
  },

  // ── Visual feedback ───────────────────────────────────────────────────────────

  flashDisplay() {
    flashElement('tc-display',        'var(--green)', 150);
    flashElement('mobile-tc-display', 'var(--green)', 150);
  },

  // ── Helpers ───────────────────────────────────────────────────────────────────

  _getSelectedColor() {
    return document.querySelector('#color-picker .selected')?.dataset.color || '#4f8ef7';
  },

  _getNotes() {
    return document.getElementById('mark-notes')?.value.trim() || '';
  },

  _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
};

export default EventManager;
