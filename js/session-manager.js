import FirebaseService from './firebase-service.js';
import DeviceManager from './device-manager.js';
import { now } from './utils.js';

const SessionManager = {
  init() {
    if (typeof window.attachBlocksListener === 'function') {
      window.attachBlocksListener();
    }
  },

  currentSessionId() {
    return bridge().currentBlockId || null;
  },

  async mirrorBlock(block) {
    if (!block?.id) return;
    const session = {
      session_id: block.id,
      legacy_block_id: block.id,
      name: block.name || '',
      description: block.desc || '',
      host: block.host || bridge().username || 'Anonymous',
      created_by: block.host || bridge().username || 'Anonymous',
      date_label: block.date || '',
      created_local: now(),
      updated_local: now(),
      live_user: block.liveUser || null,
      status: block.liveUser ? 'live' : 'ready'
    };

    await FirebaseService.update(FirebaseService.paths.session(block.id), session).catch(() => {});
  },

  async joinSession(sessionId, block) {
    if (!sessionId) return;
    if (block) await this.mirrorBlock(block);
    await DeviceManager.joinSession(sessionId);
  },

  async leaveSession(sessionId) {
    await DeviceManager.leaveSession(sessionId);
  },

  async deleteSession(sessionId) {
    if (!sessionId) return;
    await FirebaseService.remove(FirebaseService.paths.session(sessionId)).catch(() => {});
    await FirebaseService.remove(`${FirebaseService.paths.legacyTimecodes}/${sessionId}`).catch(() => {});
    await FirebaseService.remove(`${FirebaseService.paths.legacySettings}/${sessionId}`).catch(() => {});
  },

  async setLiveStatus(isLive) {
    const sessionId = this.currentSessionId();
    if (!sessionId) return;
    await FirebaseService.update(FirebaseService.paths.session(sessionId), {
      live_user: isLive ? bridge().username : null,
      status: isLive ? 'live' : 'ready',
      updated_local: now()
    }).catch(() => {});
  }
};

function bridge() {
  return window.MarkProBridge || {};
}

export default SessionManager;
