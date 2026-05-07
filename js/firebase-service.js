import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  push,
  remove,
  onValue,
  onChildAdded,
  onChildChanged,
  onDisconnect,
  serverTimestamp,
  query,
  orderByChild,
  limitToLast
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCMIfnGA9gUbVSjJi_h7g5nFh8O3xMEOhc',
  authDomain: 'timecode-bincang.firebaseapp.com',
  databaseURL: 'https://timecode-bincang-default-rtdb.firebaseio.com',
  projectId: 'timecode-bincang',
  storageBucket: 'timecode-bincang.firebasestorage.app',
  messagingSenderId: '989394037116',
  appId: '1:989394037116:web:4b5f34fc107e503a79dcf9',
  measurementId: 'G-8MZ2MB9KDW'
};

let app = null;
let db = null;

function init() {
  if (db) return db;
  app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  db = getDatabase(app);

  window.db = db;
  window.fb_ref = ref;
  window.fb_set = set;
  window.fb_update = update;
  window.fb_onValue = onValue;
  window.fb_onChildAdded = onChildAdded;
  window.fb_push = push;
  window.fb_onDisconnect = onDisconnect;
  window.fb_serverTimestamp = serverTimestamp;
  window.firebaseReady = true;

  return db;
}

function dbRef(path) {
  return ref(init(), path);
}

function makeQuery(path, options = {}) {
  let q = dbRef(path);
  if (options.orderBy) q = query(q, orderByChild(options.orderBy));
  if (options.limitLast) q = query(q, limitToLast(options.limitLast));
  return q;
}

const FirebaseService = {
  init,
  ready: () => Promise.resolve(init()),
  ref: dbRef,
  serverTimestamp,

  paths: {
    legacyBlocks: 'session1/blocks',
    legacyUsers: 'session1/users',
    legacyTimecodes: 'session1/timecodes',
    legacySettings: 'session1/settings',
    session: (sessionId) => `sessions/${sessionId}`,
    events: (sessionId) => `sessions/${sessionId}/events`,
    event: (sessionId, eventId) => `sessions/${sessionId}/events/${eventId}`,
    devices: (sessionId) => `sessions/${sessionId}/devices`,
    device: (sessionId, deviceId) => `sessions/${sessionId}/devices/${deviceId}`,
    timecode: (sessionId) => `sessions/${sessionId}/state/timecode`,
    settings: (sessionId) => `sessions/${sessionId}/settings`
  },

  async set(path, value) {
    await set(dbRef(path), value);
    return true;
  },

  async update(path, value) {
    await update(dbRef(path), value);
    return true;
  },

  async get(path) {
    const snap = await get(dbRef(path));
    return snap.val();
  },

  async push(path, value) {
    const child = push(dbRef(path));
    if (value !== undefined) await set(child, value);
    return child.key;
  },

  newKey(path) {
    return push(dbRef(path)).key;
  },

  async remove(path) {
    await remove(dbRef(path));
    return true;
  },

  listen(path, callback) {
    return onValue(dbRef(path), (snap) => callback(snap.val(), snap));
  },

  listenQuery(path, options, callback) {
    return onValue(makeQuery(path, options), (snap) => callback(snap.val(), snap));
  },

  listenChildAdded(path, options, callback) {
    return onChildAdded(makeQuery(path, options), (snap, previousKey) => {
      callback(snap.val(), snap.key, previousKey, snap);
    });
  },

  listenChildChanged(path, options, callback) {
    return onChildChanged(makeQuery(path, options), (snap) => {
      callback(snap.val(), snap.key, snap);
    });
  },

  onDisconnectSet(path, value) {
    const hook = onDisconnect(dbRef(path));
    hook.set(value);
    return hook;
  },

  onDisconnectUpdate(path, value) {
    const hook = onDisconnect(dbRef(path));
    hook.update(value);
    return hook;
  },

  onDisconnectRemove(path) {
    const hook = onDisconnect(dbRef(path));
    hook.remove();
    return hook;
  }
};

export default FirebaseService;
