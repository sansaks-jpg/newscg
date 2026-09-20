# NewsCG — Broadcast News Character Generator

NewsCG adalah sistem grafis siaran berita (*Character Generator* / CG) berbasis web dengan arsitektur modern ala **Singular.live**. Dirancang khusus untuk kebutuhan newsroom dan ruang siaran langsung (live broadcast), NewsCG memungkinkan pemisahan total antara ruang kendali operator siaran dan output visual transparan (*alpha channel*) beresolusi tinggi (1080p).

Sistem ini mendukung integrasi langsung ke berbagai software switcher siaran seperti **vMix**, **OBS Studio**, **Wirecast**, serta mendukung pengontrolan langsung via API vMix GT Title.

---

## 📺 Fitur Utama

- **Dedicated Transparent Broadcast Overlay (`/output`)**: Output grafis mandiri berlatar belakang transparan murni (*alpha channel*), siap dihubungkan langsung ke switcher video melalui browser source.
- **Operator Control Dashboard**: Antarmuka responsif bagi operator untuk mengelola rundown berita, menyunting teks materi, memantau *Preview* vs *Program ON AIR*, serta mengeksekusi kontrol live (`TAKE`, `UPDATE LIVE`, `CLEAR`, `CLEAR ALL`).
- **Real-Time Sync via Server-Sent Events (SSE)**: Sinkronisasi instan berlatensi ultra-rendah (<50ms) dengan mekanisme auto-sync dan reconnect otomatis saat overlay di-refresh.
- **Dual Monitor & Draft Terisolasi**: Pengeditan atau pemilihan grafis di panel operator tidak akan memengaruhi tampilan siaran aktif (ON AIR) sampai tombol live dieksekusi.
- **Perlindungan Idempotency & Antrean Aksi**: Dilengkapi proteksi klik ganda (*double-click protection*) dan antrean serial (*action queue*) untuk mencegah konflik status siaran.
- **Templat Grafis Standar Siaran TV**:
  - **HEADLINE**: Kicker tab, judul utama, subline/lead, lokasi, running ticker, dan branding.
  - **REPORTER**: Nama presenter/reporter, jabatan/role, lokasi, dan social media handle.
  - **LOCATION**: Tag lokasi pojok kiri atas (*location bug*).
  - **BREAKING NEWS**: Grafis berita kilat dengan aksen visual darurat berkontras tinggi.
- **Master Broadcast Layer Controls**:
  - Logo stasiun (Logo gambar atau teks kustom).
  - Live Bug & Jam Digital otomatis berbasis zona waktu (WIB, WITA, WIT, CUSTOM).
  - Running Ticker / Crawl Berita di bagian bawah layar.
- **Auto-Squish Typography**: Algoritma cerdas yang otomatis menyesuaikan rasio kompresi font (*horizontal squish*) agar teks panjang tidak pernah meluber melewati garis *Safe Area* siaran.
- **Keyboard Shortcuts Cepat**: Dukungan penuh shortcut keyboard (`Space`/`T` untuk TAKE, `Enter` untuk TAKE & Advance, `U` untuk Update, `Esc`/`C` untuk Clear, `0` untuk Clear All, dll.).
- **Impor & Ekspor Rundown**: Dukungan pencadangan dan pemindahan rundown siaran dalam format JSON.
- **100% Offline & LAN-Ready**: Berjalan sepenuhnya di jaringan lokal tanpa ketergantungan koneksi internet publik.

---

## 🏗️ Arsitektur Proyek

NewsCG dibangun dengan struktur monorepo menggunakan **npm workspaces**:

```
newscg/
├── apps/
│   ├── server/          # Backend Express 5 + SQLite (better-sqlite3) + SSE Bus
│   │   ├── src/         # API endpoints, event streaming, SQLite persistence, vMix adapter
│   │   └── tests/       # Unit & integration testing dengan Vitest
│   └── web/             # Frontend React 19 + TypeScript + Vite + Tailwind CSS v4
│       ├── public/      # Aset statis & logo branding
│       └── src/         # Operator dashboard, preview monitors, overlay engine
├── packages/
│   └── shared/          # Tipe data TypeScript, skema validasi Zod, kontrak event bus
├── package.json         # Konfigurasi monorepo root & script orkestrasi
└── tsconfig.base.json   # Konfigurasi TypeScript dasar
```

---

## 🚀 Panduan Memulai

### Prasyarat
- **Node.js**: Versi 20.x atau lebih baru
- **npm**: Versi 9.x atau lebih baru

### 1. Instalasi Dependensi
Jalankan perintah berikut di root repositori:
```bash
npm install
```

### 2. Konfigurasi Lingkungan (.env)
Salin berkas konfigurasi contoh:
```bash
cp .env.example .env
```
Variabel konfigurasi yang tersedia:
```env
PORT=3001
WEB_ORIGIN=http://localhost:5173
DATABASE_PATH=./data/newscg.db
VMIX_MODE=mock
VMIX_HOST=192.168.1.10
VMIX_PORT=8088
VMIX_USERNAME=
VMIX_PASSWORD=
```

### 3. Menjalankan di Lingkungan Pengembangan
Jalankan server backend dan client frontend secara bersamaan:
```bash
npm run dev
```
- **Operator Dashboard**: `http://localhost:5173`
- **Output Overlay Transparan**: `http://localhost:5173/output` (atau `http://localhost:3001/output` saat build production)
- **Backend API**: `http://localhost:3001`

Database SQLite otomatis dibuat di `apps/server/data/newscg.db` beserta data awal (*seeding*) rundown berita demo.

### 4. Menjalankan di Lingkungan Produksi
```bash
npm run build
npm start
```
Server produksi terpadu akan melayani dashboard dan overlay di `http://localhost:3001`.

---

## 📡 Panduan Integrasi ke Switcher Siaran

### Menggunakan OBS Studio (Browser Source)
1. Buka **OBS Studio**.
2. Pada panel **Sources**, klik tombol **+** dan pilih **Browser**.
3. Beri nama input, misalnya `NewsCG Overlay`.
4. Atur properti:
   - **URL**: `http://<IP-SERVER-NEWSCG>:3001/output`
   - **Width**: `1920`
   - **Height**: `1080`
   - **FPS**: `60`
   - Centang **Shutdown source when not visible** jika diinginkan.
5. Klik **OK**. Grafis akan tampil transparan di atas kamera/video utama.

### Menggunakan vMix (Web Browser Input)
1. Buka **vMix**.
2. Klik tombol **Add Input** di pojok kiri bawah.
3. Pilih tab **Web Browser**.
4. Masukkan URL: `http://<IP-SERVER-NEWSCG>:3001/output`.
5. Atur resolusi ke `1920x1080`.
6. Klik **OK**, lalu gunakan channel **Overlay (1 / 2 / 3 / 4)** di vMix untuk menayangkan grafis di atas program siaran.

---

## ⌨️ Pintasan Keyboard (Hotkeys Operator)

| Tombol | Aksi |
|---|---|
| `Space` / `T` | **TAKE** (Kirim grafis terpilih ke siaran live) |
| `Enter` | **TAKE & NEXT** (Tayangkan grafis dan pilih grafis berikutnya) |
| `U` | **UPDATE LIVE** (Perbarui teks grafis live tanpa transisi keluar) |
| `Escape` / `C` | **CLEAR** (Tarik grafis keluar dari siaran live dengan animasi transisi) |
| `0` | **CLEAR ALL** (Bersihkan seluruh grafis termasuk master overlay) |
| `1` | **STAGE LOGO** (Aktifkan logo & live bug) |
| `2` | **STAGE FULL** (Aktifkan seluruh master layer: logo, live bug, ticker) |
| `ArrowUp` / `ArrowDown` | Navigasi antar baris grafis / rundown |

---

## 🧪 Pengujian & Pengecekan Kualitas Kode

NewsCG dilengkapi dengan pengujian unit dan integrasi otomatis:

```bash
# Menjalankan seluruh pengujian unit & integrasi
npm test

# Menjalankan verifikasi tipe TypeScript
npm run typecheck

# Memastikan build seluruh package dan apps berhasil
npm run build
```

---

## 📜 Lisensi & Kontribusi

Proyek ini dikembangkan untuk operasional siaran berita profesional berstandar tinggi.
