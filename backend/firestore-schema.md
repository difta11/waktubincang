# Firebase Realtime Database Schema

This project uses Firebase Realtime Database, not Firestore. The production
schema is canonical under `/sessions`, while `session1/*` remains as a
compatibility mirror for the existing `index.html` UI.

## Canonical Paths

```text
sessions/
  {sessionId}/
    events/{eventId}
    devices/{deviceId}
    state/timecode
    settings
```

### `/sessions/{sessionId}`

```json
{
  "session_id": "blk_123",
  "legacy_block_id": "blk_123",
  "name": "Scene 01",
  "description": "Opening cue",
  "host": "Operator A",
  "created_by": "Operator A",
  "date_label": "07 Mei 2026",
  "live_user": null,
  "status": "ready"
}
```

### `/sessions/{sessionId}/events/{eventId}`

Every marker, cue, range, or production note is stored as an append-oriented
event.

```json
{
  "event_id": "-NxPushKey",
  "session_id": "blk_123",
  "timestamp_server": 1712345680,
  "local_timestamp": 1712345678,
  "device_id": "dev_abc",
  "device_name": "Windows Device",
  "operator_name": "Operator A",
  "event_type": "MARKER",
  "note": "Scene transition",
  "frame": 1250,
  "end_frame": 1250,
  "timecode": "00:00:50:00",
  "color": "#4f8ef7",
  "client_event_id": "client_evt_xyz",
  "created_order": 1712345678
}
```

Important indexes:

- `timestamp_server`: authoritative ordering after Firebase resolves the server timestamp.
- `created_order`: immediate client-side ordering for low-latency feeds.
- `client_event_id`: duplicate replay prevention.
- `device_id`: device/operator filtering and diagnostics.

### `/sessions/{sessionId}/devices/{deviceId}`

```json
{
  "device_id": "dev_abc",
  "device_name": "Windows Device",
  "operator_name": "Operator A",
  "status": "online",
  "last_seen": 1712345680,
  "last_seen_local": 1712345678
}
```

Devices update heartbeat every five seconds. `onDisconnect().update()` marks
the device offline if the browser disconnects unexpectedly.

### `/sessions/{sessionId}/state/timecode`

```json
{
  "running": true,
  "startTime": 1712345678,
  "frameOffset": 0,
  "host": "Operator A",
  "device_id": "dev_abc",
  "timestamp_server": 1712345680
}
```

Guests calculate current frame locally:

```text
frame = floor((Date.now() - startTime) / 1000 * fps) + frameOffset
```

The host writes only on play, pause, and reset. Clients never write every frame.

### `/sessions/{sessionId}/settings`

```json
{
  "fps": 25,
  "fmt": "hh:mm:ss:ff",
  "timestamp_server": 1712345680
}
```

## Legacy Compatibility Paths

```text
session1/
  blocks/{blockId}
  blocks/{blockId}/markings/{markingId}
  timecodes/{blockId}
  settings/{blockId}
  users/{userKey}
```

The current UI still renders block cards and marking cards from
`session1/blocks`. New writes are mirrored to `/sessions` so production event
streams and presence are available without redesigning the app.

## Realtime Flow

1. App boots Firebase and exposes legacy globals used by the inline UI.
2. Existing block listener reads `session1/blocks`.
3. Opening a block registers the device under `/sessions/{sessionId}/devices`.
4. Marker clicks write:
   - canonical event to `/sessions/{sessionId}/events/{eventId}`
   - compatible marking to `session1/blocks/{blockId}/markings/{pushId}`
5. Timecode state writes to both canonical and legacy paths.
6. Active-session listeners are detached on leave to avoid cross-session leaks.

## Offline Recovery

Failed event writes are stored in `localStorage` under
`markpro_offline_event_queue`. Each event includes `client_event_id`; replay on
reconnect writes the same `event_id`, which makes retries idempotent.
