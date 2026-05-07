# Waktu Berbincang Realtime Sync

Vanilla JavaScript realtime timecode and marker sync for live production,
multicam logging, cue tracking, and collaborative event notes.

## Folder Structure

```text
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── firebase-service.js
│   ├── realtime-sync.js
│   ├── session-manager.js
│   ├── event-manager.js
│   ├── device-manager.js
│   └── utils.js
├── backend/
│   ├── firebase-rules.json
│   └── firestore-schema.md
└── README.md
```

## Architecture

The visual UI remains in `index.html`. The ES modules add a production realtime
backend layer without redesigning the page.

- `firebase-service.js`: Firebase initialization, CRUD helpers, realtime listener helpers, path helpers, server timestamps.
- `device-manager.js`: persistent `device_id`, device name, operator name, session presence, heartbeat, reconnect status.
- `session-manager.js`: treats existing blocks as live sessions and mirrors them to `/sessions/{sessionId}`.
- `event-manager.js`: creates canonical event records, mirrors compatible markings, dedupes `client_event_id`, queues offline writes.
- `realtime-sync.js`: active-session listeners for canonical events/devices/timecode/settings plus legacy compatibility.
- `app.js`: boot sequence, keyboard shortcuts, reconnect recovery, and the legacy bridge.

## Data Model

Canonical production data:

```text
/sessions/{sessionId}
/sessions/{sessionId}/events/{eventId}
/sessions/{sessionId}/devices/{deviceId}
/sessions/{sessionId}/state/timecode
/sessions/{sessionId}/settings
```

Legacy UI compatibility:

```text
/session1/blocks/{blockId}
/session1/blocks/{blockId}/markings/{markingId}
/session1/timecodes/{blockId}
/session1/settings/{blockId}
/session1/users/{userKey}
```

Every event contains:

```json
{
  "event_id": "",
  "session_id": "",
  "timestamp_server": "",
  "local_timestamp": "",
  "device_id": "",
  "device_name": "",
  "operator_name": "",
  "event_type": "",
  "note": ""
}
```

Additional fields include `frame`, `timecode`, `color`, `client_event_id`, and
`created_order`.

## Run Locally

Because the app uses ES modules, open it through an HTTP server.

```bash
python -m http.server 3000
```

Then open:

```text
http://localhost:3000
```

## Firebase Rules

Deploy `backend/firebase-rules.json` to Firebase Realtime Database.

```bash
npm install -g firebase-tools
firebase login
firebase init database
firebase deploy --only database
```

## Realtime Data Flow

1. User opens the page.
2. Firebase initializes and legacy globals are exposed.
3. Device gets a persistent `device_id`.
4. User creates or opens a block.
5. The block is mirrored as `/sessions/{sessionId}`.
6. Device presence is written to `/sessions/{sessionId}/devices/{deviceId}`.
7. Marker input writes a canonical event and a legacy marking.
8. Other clients receive updates immediately through session-scoped listeners.
9. Timecode writes happen only on play, pause, and reset; clients derive frames locally.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `M` | Add point marker |
| `R` | Start/end range marker |
| `Space` or `P` | Host play/pause |
| `0` | Host reset |

## Low-Latency Strategy

- Firebase Realtime Database is used for direct low-latency socket updates.
- Active listeners are scoped to the currently opened session.
- Event feed uses child listeners instead of repeatedly downloading full trees.
- Timecode is not written every frame; clients compute display frames locally.
- Marker writes are fire-and-forget and UI feedback is immediate.
- Presence heartbeat is small and periodic.

## Concurrency Strategy

- Events use Firebase push IDs for collision-resistant keys.
- `timestamp_server` is authoritative once resolved.
- `created_order` provides immediate deterministic ordering before server time resolves.
- `client_event_id` prevents duplicate replay during reconnect.
- Legacy markings are mirrored for the existing UI, while `/sessions` remains the production event stream.

## Offline Recovery

If an event write fails or the browser is offline, the event is stored in
`localStorage` under `markpro_offline_event_queue`. On reconnect the app writes
the same `event_id` again with a fresh server timestamp, making replay
idempotent and preserving event order via `created_order`.

## Verification Checklist

- Load the app through an HTTP server and confirm there are no module import errors.
- Open two browser tabs and create a block in one; it should appear in the other.
- Join the same block from both tabs and confirm participants update.
- Add markers rapidly from both tabs; both feeds should converge.
- Start, pause, and reset as host; guest devices should follow.
- Toggle offline, add a marker, reconnect, and confirm it replays once.
