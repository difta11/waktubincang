# Waktu Berbincang — Realtime Timecode Sync

Multi-device, low-latency timecode synchronization system untuk produksi live, multicam, dan shooting.

---

## Struktur Proyek

```
project/
├── index.html              ← UI utama (jangan diubah desainnya)
│
├── js/
│   ├── app.js              ← Bootstrap entry point
│   ├── firebase-service.js ← Low-level Firebase CRUD & listeners
│   ├── device-manager.js   ← Identity, presence, online count
│   ├── session-manager.js  ← Block CRUD, list, open/close
│   ├── event-manager.js    ← Marking add/edit/delete & render
│   ├── realtime-sync.js    ← Per-block realtime listeners
│   └── utils.js            ← Toast, debounce, color helpers
│
├── backend/
│   ├── firebase-rules.json ← Security rules (deploy ke Firebase)
│   └── firestore-schema.md ← Database schema & data flow docs
│
└── README.md
```

---

## Cara Integrasi ke index.html

Cari blok script module di bagian bawah `index.html`:

```html
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/...";
...
// semua kode inline Firebase
</script>
```

**Ganti seluruh blok tersebut** dengan satu baris:

```html
<script type="module" src="js/app.js"></script>
```

> ⚠️ Jangan hapus `<script>` non-module yang berisi timecode engine
> (togglePlay, resetTC, frameToTC, loop, dll) — cukup ganti blok module.

---

## Cara Deploy Firebase Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Init (pilih Realtime Database)
firebase init database

# Copy rules
cp backend/firebase-rules.json database.rules.json

# Deploy
firebase deploy --only database
```

---

## Cara Run Lokal

Karena menggunakan ES modules, **harus dijalankan lewat HTTP server**, tidak bisa dibuka langsung sebagai file.

```bash
# Opsi 1: Python
python3 -m http.server 3000

# Opsi 2: Node
npx serve .

# Opsi 3: VS Code Live Server extension
# Klik kanan index.html → Open with Live Server
```

Buka: `http://localhost:3000`

---

## Keyboard Shortcuts

| Shortcut | Aksi |
|----------|------|
| `Space` / `P` | Play / Pause (HOST only) |
| `M` | Tambah Point marking |
| `R` | Toggle Range start/end |
| `0` | Reset timecode (HOST only) |
| `Escape` | Tutup modal |

---

## Fitur

- ✅ Realtime multi-device sync (Firebase Realtime Database)
- ✅ Host/Guest role system
- ✅ Point marking & range marking
- ✅ Per-block FPS & format sync dari host ke guest
- ✅ Online presence counter
- ✅ Auto-cleanup presence on disconnect (onDisconnect)
- ✅ Session restore setelah refresh
- ✅ Toast notifikasi marker dari device lain
- ✅ Connection status indicator (online/offline)
- ✅ Keyboard shortcuts untuk operator kecepatan tinggi
- ✅ Modular ES6 — mudah di-extend

---

## Arsitektur Sync Timecode

```
HOST device
  Play pressed
    └─ write session1/timecodes/{id} { running:true, startTime, frameOffset }
    └─ jalankan requestAnimationFrame(loop) lokal (no-latency display)

GUEST devices (semua)
  onValue(timecodes/{id}) fires
    └─ hitung frame = (Date.now()-startTime)/1000 * fps + frameOffset
    └─ jalankan requestAnimationFrame(loop) lokal (smooth display)

Hasil: semua device sinkron dalam ~50-150ms
Timecode display berjalan smooth (60fps) di semua device tanpa polling.
```

---

## Estimasi Latency

| Aksi | Latency |
|------|---------|
| Play/Pause sync antar device | ~50–150 ms |
| Marking tampil di device lain | ~50–200 ms |
| Presence update | ~100–300 ms |

---

## Best Practices

1. **Satu HOST per block** — host adalah orang pertama yang membuka block, atau yang membuat block.
2. **Gunakan WiFi yang sama** untuk latency paling rendah antar device.
3. **Satu session per produksi** — buat block baru per scene/take, bukan per shift operator.
4. **Jangan hapus block saat produksi berjalan** — marking akan hilang permanen.
5. **Export CSV** sebelum hapus block (fitur export tersedia di UI).
