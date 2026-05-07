# Firebase Realtime Database — Schema & Data Flow

> Project: **Waktu Berbincang** — Realtime Multi-Device Timecode Sync  
> Database: Firebase Realtime Database (not Firestore)

---

## Root Structure

```
session1/
├── users/          # Online presence per device
│   └── {deviceId}
│
├── blocks/         # Timecode sessions
│   └── {blockId}
│       └── markings/
│           └── {fbKey}
│
├── timecodes/      # Playback state per block
│   └── {blockId}
│
└── settings/       # FPS + format per block
    └── {blockId}
```

---

## Node Schemas

### `session1/users/{deviceId}`

Presence record for each connected device. Removed automatically on disconnect via `onDisconnect().remove()`.

```json
{
  "name":        "Cam A_XY3",
  "deviceId":    "dev_lz4f7_abc",
  "lastSeen":    1714000000000,
  "connectedAt": 1714000000000
}
```

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Display name (max 50 chars) |
| `deviceId` | string | Persistent UUID stored in localStorage |
| `lastSeen` | number | Unix ms — updated via heartbeat every 15 s |
| `connectedAt` | number | Unix ms — set on connect |

---

### `session1/blocks/{blockId}`

A timecode session (block). Contains nested markings.

```json
{
  "id":        "blk_lz4abc",
  "name":      "Scene 3 Take 2",
  "fps":       25,
  "created":   1714000000000,
  "createdBy": "Director_ABC",
  "liveUser":  "Director_ABC",
  "markings": {
    "-NxAbc123": {
      "id":         1714000000123.456,
      "type":       "point",
      "startTC":    "00:01:23:15",
      "startFrame": 2065,
      "endTC":      "00:01:23:15",
      "endFrame":   2065,
      "color":      "#4f8ef7",
      "notes":      "Good take",
      "user":       "Director_ABC",
      "ts":         1714000000123
    }
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Block id (matches key) |
| `name` | string | Human-readable name |
| `fps` | number | Frames per second |
| `created` | number | Creation timestamp (Unix ms) |
| `createdBy` | string | Username of creator |
| `liveUser` | string \| null | Username currently running timecode |
| `markings` | object | Push-list of marking objects (see below) |

#### `markings/{fbKey}`

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | `Date.now() + Math.random()` — collision-safe |
| `type` | `"point"` \| `"range"` | Marking type |
| `startTC` | string | Timecode string at mark start |
| `startFrame` | number | Frame number at mark start |
| `endTC` | string | Same as startTC for points |
| `endFrame` | number | Same as startFrame for points |
| `color` | string | Hex color |
| `notes` | string | Operator annotation (max 500 chars) |
| `user` | string | Username who created the marking |
| `ts` | number | Creation timestamp (Unix ms) |

---

### `session1/timecodes/{blockId}`

Playback state broadcast by the HOST device. All GUEST devices derive their local frame from this.

**When playing (`running: true`):**
```json
{
  "running":     true,
  "startTime":   1714000000000,
  "frameOffset": 0,
  "host":        "Director_ABC",
  "ts":          1714000000000
}
```

**When stopped (`running: false`):**
```json
{
  "running":     false,
  "frameAtStop": 1523,
  "host":        "Director_ABC",
  "ts":          1714000025000
}
```

**When reset:**
```json
{
  "running":     false,
  "frameAtStop": 0,
  "reset":       true,
  "host":        "Director_ABC",
  "ts":          1714000030000
}
```

Guest frame calculation:
```
elapsed  = (Date.now() - startTime) / 1000   // seconds
frame    = Math.floor(elapsed * fps) + frameOffset
```

---

### `session1/settings/{blockId}`

FPS and timecode format — written by HOST, read by all GUESTs.

```json
{
  "fps": 25,
  "fmt": "hh:mm:ss:ff",
  "ts":  1714000000000
}
```

Valid `fmt` values: `"hh:mm:ss:ff"`, `"mm:ss:ff"`, `"mm:ss"`, `"ss:ff"`, or any custom pattern string.

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                        DEVICE (HOST)                         │
│                                                              │
│  User presses Play                                           │
│       │                                                      │
│       ▼                                                      │
│  togglePlay() → syncStartTimecode()                          │
│       │         └─ fb_set(timecodes/{id}, { running:true,   │
│       │                   startTime: Date.now(), ... })      │
│       │                                                      │
│  requestAnimationFrame(loop) ← runs locally for low-latency  │
└──────────────────────┬───────────────────────────────────────┘
                       │ Firebase Realtime Database
                       │ (≈ 50–150 ms propagation)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   ALL GUEST DEVICES                          │
│                                                              │
│  attachTimecodeListener(blockId)                             │
│       │                                                      │
│       ▼                                                      │
│  onValue() fires → _applyTCToGuest(data, fps)               │
│       │                                                      │
│       ▼                                                      │
│  frame = Math.floor((Date.now()-startTime)/1000 * fps)      │
│  + frameOffset                                               │
│       │                                                      │
│       ▼                                                      │
│  start local requestAnimationFrame(loop) for smooth display  │
└──────────────────────────────────────────────────────────────┘
```

---

## Listener Lifecycle

| Listener | Attached when | Detached when |
|----------|--------------|---------------|
| `attachBlocksListener` | `SessionManager.init()` | App unmount |
| `attachTimecodeListener` | `openBlock(id)` | `backToBlocks()` |
| `attachSettingsListener` | `openBlock(id)` | `backToBlocks()` |
| `attachMarkersListener` | `openBlock(id)` | `backToBlocks()` |
| Presence (users) | `DeviceManager.init()` | App unmount |

---

## Performance Notes

- **Listener scope**: Per-block listeners are narrow — only subscribe to data for the active block, not all blocks globally.
- **No debounce on marking writes**: Marking writes are fire-and-forget via `push()` — no debounce needed.
- **Timecode writes**: Only the HOST writes to `timecodes/` on Play/Pause/Reset (3 events), not on every frame. Guests reconstruct the frame locally via `requestAnimationFrame`.
- **Heartbeat**: Presence heartbeat is 15 s — low overhead.
- **`onDisconnect`**: Auto-removes presence record on disconnect — no stale users.

---

## Bandwidth Estimate (per session, all devices)

| Event | Size | Frequency |
|-------|------|-----------|
| Play / Pause | ~100 B | On demand |
| Marking added | ~250 B | On demand |
| Settings change | ~60 B | Rarely |
| Heartbeat (per device) | ~20 B | Every 15 s |
| Block list sync | ~500 B | On block create/delete |

Total typical bandwidth: **< 1 KB/min per device** during idle; spikes on marking bursts.
