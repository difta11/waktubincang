import FirebaseService from './firebase-service.js';
import DeviceManager from './device-manager.js';
import SessionManager from './session-manager.js';
import EventManager from './event-manager.js';
import RealtimeSync from './realtime-sync.js';
import { initToast, showToast } from './utils.js';

async function boot() {
  initToast();
  FirebaseService.init();
  DeviceManager.init();
  RealtimeSync.init();
  EventManager.init();

  window.MarkProRealtime = {
    mirrorBlock: (block) => SessionManager.mirrorBlock(block),
    deleteSession: (id) => SessionManager.deleteSession(id),
    joinSession: (id, block) => SessionManager.joinSession(id, block),
    leaveSession: (id) => SessionManager.leaveSession(id),
    recordMarker: (mark) => EventManager.recordMarker(mark),
    deleteEvent: (markId) => EventManager.deleteEvent(markId),
    updateEvent: (mark) => EventManager.updateEvent(mark),
    syncTimecode: (state) => syncCanonicalTimecode(state),
    syncSettings: (settings) => syncCanonicalSettings(settings),
    setLiveStatus: (isLive) => SessionManager.setLiveStatus(isLive),
    flushQueue: () => EventManager.flushQueue()
  };

  await DeviceManager.registerGlobalPresence().catch(() => {});
  SessionManager.init();
  installKeyboardShortcuts();
  installConnectionRecovery();
  replayPendingIfOnline();

  if (window._pendingTimecodeBlock) {
    window.attachTimecodeListener(window._pendingTimecodeBlock);
    window._pendingTimecodeBlock = null;
  }
  if (window._pendingMarkersBlock) {
    window.attachMarkersListener(window._pendingMarkersBlock);
    window._pendingMarkersBlock = null;
  }

  showToast('Realtime Firebase siap');
}

async function syncCanonicalTimecode(state) {
  const sessionId = bridge().currentBlockId;
  if (!sessionId) return;
  await FirebaseService.set(FirebaseService.paths.timecode(sessionId), {
    ...state,
    device_id: DeviceManager.deviceId,
    device_name: DeviceManager.deviceName,
    operator_name: DeviceManager.operatorName,
    timestamp_server: FirebaseService.serverTimestamp()
  }).catch(() => {});
}

async function syncCanonicalSettings(settings) {
  const sessionId = bridge().currentBlockId;
  if (!sessionId) return;
  await FirebaseService.set(FirebaseService.paths.settings(sessionId), {
    ...settings,
    device_id: DeviceManager.deviceId,
    operator_name: DeviceManager.operatorName,
    timestamp_server: FirebaseService.serverTimestamp()
  }).catch(() => {});
}

function installKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!bridge().currentBlockId) return;

    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      window.addPoint?.();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      window.toggleRange?.();
    } else if (event.key === ' ' || event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      if (bridge().isHost) window.togglePlay?.();
    } else if (event.key === '0') {
      event.preventDefault();
      if (bridge().isHost) window.resetTC?.();
    }
  });
}

function installConnectionRecovery() {
  window.addEventListener('online', () => {
    DeviceManager.heartbeat().catch(() => {});
    EventManager.flushQueue();
    showToast('Koneksi pulih, sinkronisasi dilanjutkan');
  });

  window.addEventListener('offline', () => {
    showToast('Offline: event akan diantrikan');
  });

  setInterval(() => DeviceManager.heartbeat().catch(() => {}), 5000);
}

function replayPendingIfOnline() {
  if (navigator.onLine) EventManager.flushQueue();
}

function bridge() {
  return window.MarkProBridge || {};
}

boot().catch((error) => {
  console.error('[app] boot failed', error);
  initToast();
  showToast('Gagal inisialisasi realtime Firebase');
});
