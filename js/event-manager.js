import FirebaseService from './firebase-service.js';
import DeviceManager from './device-manager.js';
import { Storage, generateId, now } from './utils.js';

const QUEUE_KEY = 'markpro_offline_event_queue';
const DEDUPE_KEY = 'markpro_recent_client_events';
const MAX_DEDUPE = 500;

let replaying = false;

const EventManager = {
  init() {
    window.addEventListener('online', () => this.flushQueue());
  },

  async recordMarker(mark) {
    const sessionId = bridge().currentBlockId;
    if (!sessionId || !mark) return null;

    const eventId = FirebaseService.newKey(FirebaseService.paths.events(sessionId));
    const clientEventId = mark.client_event_id || generateId('client_evt');
    mark.client_event_id = clientEventId;
    mark.event_id = eventId;

    const event = this.markerToEvent(sessionId, eventId, clientEventId, mark);
    if (this.isDuplicate(clientEventId)) return eventId;

    this.remember(clientEventId);

    if (!navigator.onLine) {
      this.queue(event);
      return eventId;
    }

    try {
      await FirebaseService.set(FirebaseService.paths.event(sessionId, eventId), event);
      return eventId;
    } catch (error) {
      this.queue(event);
      console.warn('[EventManager] queued event after write failure', error);
      return eventId;
    }
  },

  markerToEvent(sessionId, eventId, clientEventId, mark) {
    DeviceManager.refreshIdentity();
    const timecode = mark.type === 'range' ? `${mark.startTC} -> ${mark.endTC}` : mark.startTC;
    return {
      event_id: eventId,
      session_id: sessionId,
      timestamp_server: FirebaseService.serverTimestamp(),
      local_timestamp: now(),
      device_id: DeviceManager.deviceId,
      device_name: DeviceManager.deviceName,
      operator_name: DeviceManager.operatorName || bridge().username || 'Anonymous',
      event_type: mark.type === 'range' ? 'RANGE' : 'MARKER',
      note: mark.notes || '',
      frame: mark.startFrame || bridge().frame || 0,
      end_frame: mark.endFrame ?? mark.startFrame ?? bridge().frame ?? 0,
      timecode,
      startTC: mark.startTC || timecode,
      endTC: mark.endTC || mark.startTC || timecode,
      color: mark.color || bridge().color || '#4f8ef7',
      client_event_id: clientEventId,
      created_order: now(),
      legacy_mark_id: String(mark.id),
      type: mark.type || 'point',
      user: mark.user || bridge().username || 'Anonymous'
    };
  },

  async updateEvent(mark) {
    const sessionId = bridge().currentBlockId;
    if (!sessionId || !mark) return;
    const eventId = mark.event_id || mark._eventKey;
    if (!eventId) return;
    await FirebaseService.update(FirebaseService.paths.event(sessionId, eventId), {
      note: mark.notes || '',
      color: mark.color || '#4f8ef7',
      startTC: mark.startTC || '',
      endTC: mark.endTC || '',
      timecode: mark.type === 'range' ? `${mark.startTC} -> ${mark.endTC}` : mark.startTC,
      updated_local: now()
    }).catch(() => {});
  },

  async deleteEvent(markId) {
    const sessionId = bridge().currentBlockId;
    const block = bridge().block;
    if (!sessionId || !block) return;
    const mark = (block.markings || []).find((item) => String(item.id) === String(markId));
    const eventId = mark?.event_id || mark?._eventKey;
    if (eventId) {
      await FirebaseService.update(FirebaseService.paths.event(sessionId, eventId), {
        deleted: true,
        deleted_local: now()
      }).catch(() => {});
    }
  },

  queue(event) {
    const queue = Storage.get(QUEUE_KEY, []);
    if (!queue.some((item) => item.client_event_id === event.client_event_id)) {
      queue.push(event);
      Storage.set(QUEUE_KEY, queue);
    }
  },

  async flushQueue() {
    if (replaying) return;
    replaying = true;
    try {
      const queue = Storage.get(QUEUE_KEY, []);
      const remaining = [];
      for (const event of queue) {
        try {
          if (!this.isDuplicate(event.client_event_id)) this.remember(event.client_event_id);
          await FirebaseService.set(FirebaseService.paths.event(event.session_id, event.event_id), {
            ...event,
            timestamp_server: FirebaseService.serverTimestamp(),
            replayed_local: now()
          });
        } catch {
          remaining.push(event);
        }
      }
      Storage.set(QUEUE_KEY, remaining);
    } finally {
      replaying = false;
    }
  },

  isDuplicate(clientEventId) {
    return Storage.get(DEDUPE_KEY, []).includes(clientEventId);
  },

  remember(clientEventId) {
    const recent = Storage.get(DEDUPE_KEY, []).filter(Boolean);
    recent.push(clientEventId);
    Storage.set(DEDUPE_KEY, recent.slice(-MAX_DEDUPE));
  }
};

function bridge() {
  return window.MarkProBridge || {};
}

export default EventManager;
