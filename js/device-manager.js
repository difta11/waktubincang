import FirebaseService from './firebase-service.js';
import { Storage, generateId, nameToColor, safeKey, now } from './utils.js';

const DEVICE_ID_KEY = 'markpro_device_id';
const DEVICE_NAME_KEY = 'markpro_device_name';
const USERNAME_KEY = 'markpro_username';
const HEARTBEAT_MS = 5000;

let heartbeat = null;
let activeSessionId = null;

const DeviceManager = {
  deviceId: null,
  deviceName: null,
  operatorName: 'Anonymous',

  init() {
    this.deviceId = Storage.get(DEVICE_ID_KEY) || generateId('dev');
    this.deviceName = Storage.get(DEVICE_NAME_KEY) || defaultDeviceName();
    this.operatorName = localStorage.getItem(USERNAME_KEY) || bridge().username || 'Anonymous';

    Storage.set(DEVICE_ID_KEY, this.deviceId);
    Storage.set(DEVICE_NAME_KEY, this.deviceName);

    window.markproDeviceId = this.deviceId;
    window.markproDeviceName = this.deviceName;
  },

  refreshIdentity() {
    this.operatorName = localStorage.getItem(USERNAME_KEY) || bridge().username || this.operatorName || 'Anonymous';
    this.deviceName = Storage.get(DEVICE_NAME_KEY) || this.deviceName || defaultDeviceName();
  },

  presenceRecord(status = 'online') {
    this.refreshIdentity();
    return {
      device_id: this.deviceId,
      device_name: this.deviceName,
      operator_name: this.operatorName,
      name: this.operatorName,
      color: bridge().myAvatarColor || nameToColor(this.operatorName),
      status,
      last_seen: FirebaseService.serverTimestamp(),
      last_seen_local: now()
    };
  },

  async registerGlobalPresence() {
    this.refreshIdentity();
    const path = `${FirebaseService.paths.legacyUsers}/${safeKey(this.deviceId)}`;
    await FirebaseService.set(path, {
      name: this.operatorName,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      status: 'online',
      lastSeen: now()
    });
    FirebaseService.onDisconnectRemove(path);
  },

  async joinSession(sessionId) {
    if (!sessionId) return;
    activeSessionId = sessionId;
    await FirebaseService.set(FirebaseService.paths.device(sessionId, this.deviceId), this.presenceRecord('online'));
    FirebaseService.onDisconnectUpdate(FirebaseService.paths.device(sessionId, this.deviceId), {
      status: 'offline',
      last_seen: FirebaseService.serverTimestamp(),
      last_seen_local: now()
    });

    clearInterval(heartbeat);
    heartbeat = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
  },

  async heartbeat() {
    this.refreshIdentity();
    if (!activeSessionId) {
      await this.registerGlobalPresence().catch(() => {});
      return;
    }
    await FirebaseService.update(FirebaseService.paths.device(activeSessionId, this.deviceId), {
      operator_name: this.operatorName,
      name: this.operatorName,
      device_name: this.deviceName,
      status: 'online',
      last_seen: FirebaseService.serverTimestamp(),
      last_seen_local: now()
    }).catch(() => {});
  },

  async leaveSession(sessionId = activeSessionId) {
    if (!sessionId) return;
    await FirebaseService.update(FirebaseService.paths.device(sessionId, this.deviceId), {
      status: 'offline',
      last_seen: FirebaseService.serverTimestamp(),
      last_seen_local: now()
    }).catch(() => {});
    if (sessionId === activeSessionId) {
      activeSessionId = null;
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }
};

function bridge() {
  return window.MarkProBridge || {};
}

function defaultDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Browser';
  return `${platform} Device`;
}

export default DeviceManager;
