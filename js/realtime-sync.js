import FirebaseService from './firebase-service.js';
import DeviceManager from './device-manager.js';
import { toArrayFromObject } from './utils.js';

let timecodeUnsub = null;
let legacyTimecodeUnsub = null;
let settingsUnsub = null;
let legacySettingsUnsub = null;
let markersUnsub = null;
let eventsAddedUnsub = null;
let eventsChangedUnsub = null;
let devicesUnsub = null;
const seenEventsBySession = new Map();

const RealtimeSync = {
  init() {
    window.attachTimecodeListener = (id) => this.attachTimecodeListener(id);
    window.detachTimecodeListener = () => this.detachTimecodeListener();
    window.attachSettingsListener = (id) => this.attachSettingsListener(id);
    window.detachSettingsListener = () => this.detachSettingsListener();
    window.attachMarkersListener = (id) => this.attachMarkersListener(id);
    window.detachMarkersListener = () => this.detachMarkersListener();
  },

  attachTimecodeListener(sessionId) {
    this.detachTimecodeListener();
    timecodeUnsub = FirebaseService.listen(FirebaseService.paths.timecode(sessionId), (data) => {
      applyTimecode(sessionId, data);
    });
    legacyTimecodeUnsub = FirebaseService.listen(`${FirebaseService.paths.legacyTimecodes}/${sessionId}`, (data) => {
      if (data) applyTimecode(sessionId, data);
    });
  },

  detachTimecodeListener() {
    if (timecodeUnsub) timecodeUnsub();
    if (legacyTimecodeUnsub) legacyTimecodeUnsub();
    timecodeUnsub = null;
    legacyTimecodeUnsub = null;
  },

  attachSettingsListener(sessionId) {
    this.detachSettingsListener();
    settingsUnsub = FirebaseService.listen(FirebaseService.paths.settings(sessionId), (data) => applySettings(sessionId, data));
    legacySettingsUnsub = FirebaseService.listen(`${FirebaseService.paths.legacySettings}/${sessionId}`, (data) => applySettings(sessionId, data));
  },

  detachSettingsListener() {
    if (settingsUnsub) settingsUnsub();
    if (legacySettingsUnsub) legacySettingsUnsub();
    settingsUnsub = null;
    legacySettingsUnsub = null;
  },

  attachMarkersListener(sessionId) {
    this.detachMarkersListener();
    seenEventsBySession.set(sessionId, new Set());

    markersUnsub = FirebaseService.listen(`${FirebaseService.paths.legacyBlocks}/${sessionId}/markings`, (data) => {
      syncLegacyMarkersToUi(sessionId, data);
    });

    eventsAddedUnsub = FirebaseService.listenChildAdded(
      FirebaseService.paths.events(sessionId),
      { orderBy: 'created_order', limitLast: 300 },
      (event, key) => {
        if (!event || event.deleted) return;
        rememberEvent(sessionId, key);
        appendEventToUi(sessionId, event, key);
      }
    );

    eventsChangedUnsub = FirebaseService.listenChildChanged(
      FirebaseService.paths.events(sessionId),
      { orderBy: 'created_order', limitLast: 300 },
      (event, key) => {
        if (!event) return;
        patchEventInUi(sessionId, event, key);
      }
    );

    devicesUnsub = FirebaseService.listen(FirebaseService.paths.devices(sessionId), (data) => {
      const block = bridge().block;
      if (!block || bridge().currentBlockId !== sessionId) return;
      const devices = toArrayFromObject(data).filter((device) => device.status !== 'offline');
      block.participants = devices.map((device) => ({
        name: device.operator_name || device.name || 'Unknown',
        color: device.color || '#4f8ef7',
        device_id: device.device_id,
        device_name: device.device_name
      }));
      const onlineUsers = devices.reduce((acc, device) => {
        acc[device.device_id] = device;
        return acc;
      }, {});
      if (typeof bridge().setOnlineUsers === 'function') bridge().setOnlineUsers(onlineUsers);
      if (typeof bridge().renderUserList === 'function') bridge().renderUserList();
      if (typeof bridge().renderStats === 'function') bridge().renderStats();
    });
  },

  detachMarkersListener() {
    if (markersUnsub) markersUnsub();
    if (eventsAddedUnsub) eventsAddedUnsub();
    if (eventsChangedUnsub) eventsChangedUnsub();
    if (devicesUnsub) devicesUnsub();
    markersUnsub = null;
    eventsAddedUnsub = null;
    eventsChangedUnsub = null;
    devicesUnsub = null;
  }
};

function applyTimecode(sessionId, data) {
  const b = bridge();
  if (!data || b.currentBlockId !== sessionId) return;
  const fromSelf = data.device_id && data.device_id === DeviceManager.deviceId;
  if (b.isHost && fromSelf) return;

  const fps = b.fps || 25;
  if (data.running) {
    const startTime = data.startTime || data.start_time_local || Date.now();
    const elapsed = (Date.now() - startTime) / 1000;
    b.frame = Math.max(0, Math.floor(elapsed * fps) + (data.frameOffset || data.frame_offset || 0));
    b.running = true;
    if (typeof b.startLoop === 'function') b.startLoop();
    if (typeof b.setPlayUI === 'function') b.setPlayUI(true);
    if (typeof b.updateLiveBadge === 'function') b.updateLiveBadge(true);
  } else {
    b.running = false;
    if (typeof b.stopLoop === 'function') b.stopLoop();
    if (data.reset && typeof b.applyResetUI === 'function') b.applyResetUI();
    b.frame = data.frameAtStop ?? data.frame_at_stop ?? b.frame ?? 0;
    if (typeof b.setPlayUI === 'function') b.setPlayUI(false);
    if (typeof b.updateLiveBadge === 'function') b.updateLiveBadge(false);
  }
  if (typeof b.updateDisplay === 'function') b.updateDisplay();
}

function applySettings(sessionId, data) {
  const b = bridge();
  if (!data || b.currentBlockId !== sessionId || b.isHost) return;
  if (data.fps) {
    b.fps = Number(data.fps);
    const fpsSel = document.getElementById('fps-sel');
    const mFpsSel = document.getElementById('m-fps-sel');
    if (fpsSel) fpsSel.value = String(data.fps);
    if (mFpsSel) mFpsSel.value = String(data.fps);
  }
  const fmt = data.fmt || data.format;
  if (fmt) {
    const fmtSel = document.getElementById('fmt-sel');
    const mFmtSel = document.getElementById('m-fmt-sel');
    const custom = document.getElementById('custom-fmt');
    const known = ['hh:mm:ss:ff', 'mm:ss:ff', 'mm:ss', 'ss:ff'];
    if (known.includes(fmt)) {
      if (fmtSel) fmtSel.value = fmt;
      if (mFmtSel) mFmtSel.value = fmt;
      if (custom) custom.style.display = 'none';
    } else {
      if (fmtSel) fmtSel.value = 'custom';
      if (custom) {
        custom.value = fmt;
        custom.style.display = '';
      }
    }
  }
  if (typeof b.updateDisplay === 'function') b.updateDisplay();
  if (typeof b.renderList === 'function') b.renderList();
}

function syncLegacyMarkersToUi(sessionId, data) {
  const b = bridge();
  if (b.currentBlockId !== sessionId) return;
  const block = b.block;
  if (!block) return;
  block.markings = toArrayFromObject(data, (fbKey, mark) => ({ ...mark, _fbKey: fbKey }));
  window.markings = block.markings;
  if (typeof b.saveBlocks === 'function') b.saveBlocks();
  if (typeof b.renderList === 'function') b.renderList();
  if (typeof b.renderStats === 'function') b.renderStats();
}

function appendEventToUi(sessionId, event, key) {
  const b = bridge();
  if (b.currentBlockId !== sessionId) return;
  const block = b.block;
  if (!block) return;
  if (event.device_id === DeviceManager.deviceId) return;
  const exists = (block.markings || []).some((mark) => mark.event_id === key || mark.client_event_id === event.client_event_id);
  if (exists) return;
  block.markings = [...(block.markings || []), eventToMark(event, key)];
  window.markings = block.markings;
  if (typeof b.renderList === 'function') b.renderList();
  if (typeof b.renderStats === 'function') b.renderStats();
}

function patchEventInUi(sessionId, event, key) {
  const b = bridge();
  if (b.currentBlockId !== sessionId) return;
  const block = b.block;
  if (!block) return;
  if (event.deleted) {
    block.markings = (block.markings || []).filter((mark) => mark.event_id !== key);
  } else {
    const index = (block.markings || []).findIndex((mark) => mark.event_id === key);
    if (index >= 0) block.markings[index] = { ...block.markings[index], ...eventToMark(event, key) };
  }
  window.markings = block.markings || [];
  if (typeof b.renderList === 'function') b.renderList();
  if (typeof b.renderStats === 'function') b.renderStats();
}

function eventToMark(event, key) {
  const isRange = event.event_type === 'RANGE' || event.type === 'range';
  return {
    id: event.legacy_mark_id || key,
    event_id: key,
    _eventKey: key,
    client_event_id: event.client_event_id,
    type: isRange ? 'range' : 'point',
    startTC: event.startTC || event.timecode || '00:00:00:00',
    startFrame: event.frame || 0,
    endTC: event.endTC || event.startTC || event.timecode || '00:00:00:00',
    endFrame: event.end_frame ?? event.frame ?? 0,
    color: event.color || '#4f8ef7',
    notes: event.note || '',
    user: event.operator_name || event.user || 'Unknown',
    ts: event.local_timestamp || event.created_order || Date.now()
  };
}

function rememberEvent(sessionId, key) {
  const seen = seenEventsBySession.get(sessionId) || new Set();
  seen.add(key);
  seenEventsBySession.set(sessionId, seen);
}

function bridge() {
  return window.MarkProBridge || {};
}

export default RealtimeSync;
