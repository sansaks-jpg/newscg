# AGENTS.md — Pedoman Pengembangan untuk Agen AI (NewsCG)

Dokumen ini adalah panduan teknis dan operasional resmi bagi agen AI (Antigravity, Claude Code, Cursor, Copilot, dsb.) yang bekerja pada repositori **NewsCG**. Setiap agen yang memodifikasi, memelihara, atau menambahkan fitur wajib membaca dan mematuhi panduan ini.

---

## 1. Ikhtisar Sistem & Arsitektur

NewsCG adalah sistem grafis siaran berita (*Character Generator* / CG) web-native yang memisahkan kontrol operator dengan visual output transparan (*alpha overlay*) berbasis arsitektur **Singular.live**. Output mandiri `/output` siap diintegrasikan sebagai *Web Browser Input* di berbagai switcher siaran seperti vMix, OBS Studio, dan Wirecast.

### Struktur Monorepo (npm workspaces)

```
newscg/
├── apps/
│   ├── server/                 # Layanan Backend Express 5 + SQLite
│   │   ├── src/
│   │   │   ├── index.ts        # REST endpoints & SSE streaming (/api/live/stream)
│   │   │   ├── db.ts           # SQLite better-sqlite3, migrasi schema, operasi CRUD
│   │   │   └── live.ts         # Live state machine, antrean aksi, idempotency, SSE pub/sub
│   │   └── tests/              # Pengujian integrasi alur produksi (Vitest)
│   └── web/                    # Frontend React 19 + Vite + Tailwind CSS v4
│       ├── src/
│       │   ├── App.tsx         # Root container, routing internal & tata letak operator
│       │   ├── BroadcastGraphic.tsx  # Engine render grafis layer siaran (Lower Third, Logo, Jam)
│       │   ├── OverlayWindow.tsx     # Output layar mandiri transparan (/output)
│       │   ├── AutoSquishText.tsx    # Komponen pencegah teks meluber keluar Safe Area
│       │   ├── BroadcastTicker.tsx   # Running text / ticker berita bawah
│       │   ├── Newsroom.tsx          # Panel manajemen rundown, berita, dan grafis
│       │   ├── SimpleProductionEditor.tsx # Panel kontrol eksekusi live siaran operator
│       │   ├── TemplatePreview.tsx   # Monitor preview grafis sebelum ditayangkan
│       │   ├── VisualTemplatePicker.tsx # Selektor templat visual
│       │   └── useLayerPresence.ts   # Hook transisi masuk/keluar layer grafis
├── packages/
│   └── shared/                 # Sumber Kebenaran Tunggal (SSOT)
│       └── src/index.ts        # Zod validation schemas, TypeScript interfaces, event types
├── package.json                # Root workspaces definition & runner scripts
└── tsconfig.base.json          # Basis konfigurasi TypeScript
```

---

## 2. Prinsip & Aturan Utama Pengembangan

### A. Immutability (Mutlak)
- Selalu buat objek atau array baru saat memperbarui state. Jangan pernah memutasi variabel state atau struktur database secara in-place.
- Manfaatkan spread operator (`...state`, `...item`) atau pure functional transform (`map`, `filter`).

### B. Single Source of Truth (SSOT) di `packages/shared`
- Setiap tipe data, interface, enum, dan skema validasi wajib berada di `packages/shared/src/index.ts`.
- Validasi data runtime menggunakan **Zod**. Baik client maupun server menggunakan skema validasi yang sama (`fieldSchemas`, `graphicInputSchema`, `rundownInputSchema`, dll.).
- Jangan membuat duplikasi tipe lokal yang bertentangan dengan `@newscg/shared`.

### C. Keamanan Operasional Siaran (Broadcast Safety)
- **Terisolasi**: Menyunting draft di dashboard tidak boleh mengubah grafis yang sedang tayang (ON AIR).
- **Idempotency**: Semua perintah live (`TAKE`, `UPDATE`, `CLEAR`, `CLEAR_ALL`, `STAGE`, `VARIANT`) harus menerima atau menghasilkan `Idempotency-Key` untuk mencegah eksekusi ganda akibat double-click operator.
- **Transisi Halus**: Perubahan konten live harus mendukung pembaruan teks instan (`UPDATE`) tanpa merestart animasi masuk jika template sama, atau transisi keluar (`CLEAR`) sebelum grafis ditutup.
- **Dukungan `/output`**: Layar output `/output` tidak boleh dirusak atau dihapus karena merupakan antarmuka input utama untuk switcher siaran.

### D. Penanganan Kesalahan (Error Handling)
- Jangan pernah menyembunyikan galat (*silent fail* / *empty catch*).
- Berikan pesan kesalahan berbahasa Indonesia yang jelas dan informatif bagi operator siaran jika terjadi validasi gagal atau konflik live status.
- Rute API yang tidak ditemukan wajib mengembalikan respon HTTP 404 JSON, bukan fallback halaman HTML.

---

## 3. Alur Kerja Event Bus & Real-Time (SSE)

Output overlay (`/output`) terhubung ke backend melalui Server-Sent Events di `/api/live/stream`.

### Tipe-Tipe Event Overlay (`OverlayEvent`)
1. **`SYNC`**: Dikirim saat klien overlay pertama kali terhubung atau melakukan reconnect. Mengirimkan status live saat ini, grafis aktif, snapshot fields, dan master state.
2. **`TAKE`**: Menginstruksikan overlay untuk menampilkan grafis baru dengan animasi masuk.
3. **`UPDATE`**: Memperbarui teks/data pada grafis yang sedang tayang di layar secara instan tanpa memicu animasi masuk ulang.
4. **`CLEAR`**: Memainkan animasi keluar (*exit transition*) untuk grafis lower third, membiarkan master overlay (logo/jam/ticker) tetap aktif.
5. **`MASTER_UPDATE`**: Memperbarui konfigurasi logo, live badge, running ticker, atau zona waktu tanpa mengubah lower third.
6. **`CLEAR_ALL_IMMEDIATE`**: Menghilangkan seketika seluruh elemen di layar (blackout total darurat).
7. **`CLEAR_ALL_ANIMATED`**: Menghilangkan seluruh elemen di layar dengan animasi keluar yang halus.

---

## 4. Perintah Operasional & Pengujian

### Menjalankan Perintah Pengujian & Pengecekan
Agen AI **wajib** menjalankan pengujian dan verifikasi tipe sebelum menyelesaikan tugas:

```bash
# Menjalankan pengujian otomatis (Vitest)
npm test

# Menjalankan typecheck TypeScript di seluruh workspace
npm run typecheck

# Membangun (build) seluruh bundle
npm run build
```

### Aturan Debugging
- **JANGAN** pernah membuka peramban eksternal (*external browser*) untuk melakukan pengujian atau debugging.
- Lakukan seluruh validasi melalui terminal, pengujian unit Vitest, atau panggilan API via terminal (PowerShell / `curl`).

---

## 5. Basis Data & Persistensi (SQLite)

- Berkas SQLite berlokasi di `apps/server/data/newscg.db`.
- Menggunakan driver berkinerja tinggi `better-sqlite3` dengan mode **WAL (Write-Ahead Logging)** dan foreign keys diaktifkan.
- **PERINGATAN**: Berkas `*.db`, `*.db-shm`, dan `*.db-wal` telah diabaikan dalam `.gitignore`. Jangan pernah memaksakan commit file database biner ke Git.

---

## 6. Spesifikasi Visual & Safe Area Grafis Siaran

- Resolusi kanvas standar: `1920 x 1080` (Full HD).
- Latar belakang canvas output overlay wajib transparan murni (`background: transparent`).
- Seluruh elemen lower third wajib berada di dalam batas **Title Safe Area** siaran (standar EBU R95 / SMPTE).
- Komponen `AutoSquishText` harus digunakan untuk judul dan nama yang dinamis agar teks tidak meluap keluar batas saat karakter terlalu panjang.
