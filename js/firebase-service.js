/**
 * firebase-service.js
 * Low-level Firebase initialization and CRUD primitives.
 * Exposes a single `FirebaseService` singleton.
 *
 * Usage:
 *   import FirebaseService from './firebase-service.js';
 *   await FirebaseService.ready();
 *   FirebaseService.set('path', value);
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, remove,
  onValue, onDisconnect, serverTimestamp,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// ─── Firebase project config ──────────────────────────────────────────────────
// NOTE: Keep this config here (single source of truth).
// Remove the inline <script type="module"> block from index.html once modular
// files are wired in — or keep only the firebaseConfig and delegate everything
// else to this module.
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCMIfnGA9gUbVSjJi_h7g5nFh8O3xMEOhc",
  authDomain:        "timecode-bincang.firebaseapp.com",
  databaseURL:       "https://timecode-bincang-default-rtdb.firebaseio.com",
  projectId:         "timecode-bincang",
  storageBucket:     "timecode-bincang.firebasestorage.app",
  messagingSenderId: "989394037116",
  appId:             "1:989394037116:web:4b5f34fc107e503a79dcf9",
  measurementId:     "G-8MZ2MB9KDW"
};

// ─── Singleton ────────────────────────────────────────────────────────────────
let _app, _db;
let _initialized = false;

function _init() {
  if (_initialized) return;
  _app = initializeApp(FIREBASE_CONFIG);
  _db  = getDatabase(_app);
  _initialized = true;

  // Expose to global scope for legacy inline scripts in index.html
  // (remove these globals once all inline JS is migrated)
  window.db              = _db;
  window.fb_ref          = ref;
  window.fb_set          = set;
  window.fb_onValue      = onValue;
  window.fb_push         = push;
  window.fb_onDisconnect = onDisconnect;
  window.firebaseReady   = true;
}

// ─── Public API ───────────────────────────────────────────────────────────────
const FirebaseService = {

  /** Initialise (idempotent) and return the database instance */
  init() {
    _init();
    return _db;
  },

  /** Resolve when Firebase is ready */
  ready() {
    _init();
    return Promise.resolve(_db);
  },

  /** Return a database ref at `path` */
  ref(path) {
    _init();
    return ref(_db, path);
  },

  // ── CRUD ────────────────────────────────────────────────────────────────────

  /** set(path, value) → Promise */
  async set(path, value) {
    try { await set(ref(_db, path), value); return true; }
    catch (e) { console.warn('[FB] set error', path, e); return false; }
  },

  /** get(path) → Promise<snapshot.val()> */
  async get(path) {
    try {
      const snap = await get(ref(_db, path));
      return snap.val();
    } catch (e) { console.warn('[FB] get error', path, e); return null; }
  },

  /** push(path, value) → Promise<key> */
  async push(path, value) {
    try {
      const r = push(ref(_db, path));
      await set(r, value);
      return r.key;
    } catch (e) { console.warn('[FB] push error', path, e); return null; }
  },

  /** remove(path) → Promise */
  async remove(path) {
    try { await remove(ref(_db, path)); return true; }
    catch (e) { console.warn('[FB] remove error', path, e); return false; }
  },

  // ── Realtime listeners ──────────────────────────────────────────────────────

  /**
   * onValue(path, callback) → unsubscribe function
   * callback receives snapshot.val()
   */
  listen(path, callback) {
    _init();
    const unsubscribe = onValue(ref(_db, path), snap => {
      try { callback(snap.val(), snap); }
      catch (e) { console.warn('[FB] listener callback error', path, e); }
    });
    return unsubscribe; // call to detach
  },

  /**
   * listenQuery — ordered/limited query
   * options: { orderBy, limitLast }
   */
  listenQuery(path, options = {}, callback) {
    _init();
    let q = ref(_db, path);
    if (options.orderBy) q = query(q, orderByChild(options.orderBy));
    if (options.limitLast) q = query(q, limitToLast(options.limitLast));
    const unsubscribe = onValue(q, snap => {
      try { callback(snap.val(), snap); }
      catch (e) { console.warn('[FB] listenQuery callback error', path, e); }
    });
    return unsubscribe;
  },

  // ── onDisconnect helpers ────────────────────────────────────────────────────

  /**
   * Register a value to be set at `path` when this client disconnects.
   * Returns the onDisconnect object so callers can chain .cancel() if needed.
   */
  onDisconnectSet(path, value) {
    _init();
    const odc = onDisconnect(ref(_db, path));
    odc.set(value);
    return odc;
  },

  /** Remove `path` when this client disconnects */
  onDisconnectRemove(path) {
    _init();
    const odc = onDisconnect(ref(_db, path));
    odc.remove();
    return odc;
  },

  /** Firebase server timestamp sentinel */
  serverTimestamp() {
    return serverTimestamp();
  },

  /** Utility: push a new child ref and return its key (no write) */
  newKey(path) {
    _init();
    return push(ref(_db, path)).key;
  }
};

export default FirebaseService;
