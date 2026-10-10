# NewsCG — Broadcast News Character Generator

NewsCG adalah sistem grafis siaran berita (*Character Generator* / CG) berbasis web dengan arsitektur modern ala **Singular.live**. Dirancang khusus untuk kebutuhan newsroom dan ruang siaran langsung (live broadcast), NewsCG memungkinkan pemisahan total antara ruang kendali operator siaran dan output visual transparan (*alpha channel*) beresolusi tinggi (1080p).

Sistem ini beroperasi 100% berbasis web-native yang siap di-embed langsung ke berbagai switcher siaran seperti **vMix**, **OBS Studio**, **Wirecast**, dan **Tricaster** melalui **Web Browser Input / Browser Source**.

---

## 📺 Fitur Utama

- **Dedicated Transparent Broadcast Overlay (`/output`)**: Output grafis mandiri berlatar belakang transparan murni (*alpha channel*), siap dihubungkan langsung ke switcher video melalui browser source tanpa memerlukan plugin eksternal.
- **Operator Control Dashboard**: Antarmuka responsif bagi operator untuk mengelola rundown berita, menyunting teks materi, memantau *Preview* vs *Program ON AIR*, serta mengeksekusi kontrol live (`TAKE`, `UPDATE LIVE`, `CLEAR`, `CLEAR ALL`).
- **Real-Time Sync via Server-Sent Events (SSE)**: Sinkronisasi instan berlatensi ultra-rendah (<50ms) dengan mekanisme auto-sync dan reconnect otomatis saat overlay di-refresh.
- **Dual Monitor & Draft Terisolasi**: Pengeditan atau pemilihan grafis di panel operator tidak akan memengaruhi tampilan siaran aktif (ON AIR) sampai tombol live dieksekusi.
- **Perlindungan Idempotency & Antrean Aksi**: Dilengkapi proteksi klik ganda (*double-click protection*) dan antrean serial (*action queue*) untuk mencegah konflik status siaran.
- **Templat Grafis Standar Siaran TV**:
  - **HEADLINE**: Kicker tab, judul utama, subline/lead, lokasi, running ticker, dan branding. Mendukung varian komposisi dinamis (toggle lokasi, toggle topik, toggle detail, dan clean headline).
  - **HEADLINE PEMBUKA**: Label HEADLINE di kiri dan satu judul besar per cue, tersedia lewat **+ Headline Pembuka**. Label/judul dapat diedit, susun beberapa cue untuk ringkasan awal bulletin. Tetap menggunakan template HEADLINE dengan `headlinePresentation: "bulletin"`.
  - **REPORTER**: Nama presenter/reporter, jabatan/role, lokasi, dan social media handle.
  - **SOT**: Headline berita, nama narasumber, dan jabatan/institusi.
  - **LOCATION**: Tag lokasi pojok kiri atas (*location bug*).
  - **BREAKING NEWS**: Grafis berita kilat dengan aksen visual darurat berkontras tinggi.
- **Master Broadcast Layer Controls**:
  - Logo stasiun (upload logo gambar PNG transparan atau teks kustom).
  - Live Bug & Jam Digital otomatis berbasis zona waktu (WIB, WITA, WIT, CUSTOM).
  - Running Ticker / Crawl Berita di bagian bawah layar dengan pengaturan kecepatan (px/detik) dan label program otomatis pas huruf (*auto-fit*).
- **Auto-Squish Typography**: Algoritma cerdas yang otomatis menyesuaikan rasio kompresi font (*horizontal squish*) agar teks panjang tidak pernah meluber melewati batas *Safe Area* siaran.
- **Keyboard Shortcuts Cepat**: Dukungan penuh shortcut keyboard (`Space`/`Enter` untuk TAKE/UPDATE, `U` untuk Update, `Esc`/`C` untuk OUT, `0` untuk ALL OUT (animasi), `M` untuk Terapkan Master, dll.).
- **Impor & Ekspor Rundown**: Dukungan pencadangan dan pemindahan rundown siaran dalam format JSON.
- **100% Offline & LAN-Ready**: Berjalan sepenuhnya di jaringan lokal tanpa ketergantungan koneksi internet publik.

---

## Template Warna Studio

Pilihan warna mengikuti virtual set dengan meja navy, dinding abu gelap, dan lampu hangat:

- **Studio Navy** (rekomendasi): biru navy, putih gading, dan garis tembaga tipis.
- **Studio Graphite**: abu arang, perak kebiruan, dan panel terang yang lebih redup.
- **Studio Copper**: tembaga redup dan krem hangat.

Ketiganya memakai ukuran, susunan, serta animasi IN/UPDATE/OUT CNN yang sama. Warna berlaku untuk headline, nama/SOT, topik, lokasi, logo teks, LIVE, ticker, dan jam. Template CNN awal tetap tersedia.

Di panel Produksi, pilih **Warna template**, periksa Preview, lalu tekan **TERAPKAN MASTER / M**. Pilih warna saja belum mengubah Program. **TICKER SEGERA** hanya menerapkan teks/kecepatan ticker; pilihan warna yang masih di Preview tetap menunggu MASTER. Warna juga dapat dipilih di **Settings → Pengaturan Default Siaran & Ticker**, lalu diterapkan lewat **Simpan Default Master**.

Galeri `/templates/studio` memperlihatkan CG di atas foto virtual set referensi, dengan kontrol variasi teks dan animasi. Galeri tidak terhubung ke output live. `/templates/cnn` tetap dapat dibuka. Pilihan warna disimpan pada master overlay sebagai `colorTheme` dan ikut dikirim dalam event SSE. Data lama tanpa pilihan warna tetap menggunakan CNN.

Logo upload yang disarankan: **PNG transparan 800 × 500 px**, ruang kosong sekitar **40 px** di setiap tepi, maksimal **2 MB**. SVG juga didukung. Logo ditempatkan secara proporsional tanpa dipotong. Saat memilih warna studio, identitas contoh CNN diganti menjadi teks sementara NEWS; nama kustom dan logo yang sudah diunggah tetap dipertahankan.

---

## 🏗️ Arsitektur Proyek

Panduan untuk agen AI yang menerima rundown berita dari user tersedia di [docs/AI_RUNDOWN_GUIDE.md](docs/AI_RUNDOWN_GUIDE.md). Materi dimasukkan melalui API, lalu dibaca kembali tanpa menjalankan perintah live. Status persetujuan Draft/Ready/Perlu dicek sudah dihapus.

AI agent dapat menemukan seluruh operasi melalui `GET /api/agent`, membaca OpenAPI di `GET /api/agent/openapi.json`, dan mengambil panduan lengkap di `GET /api/agent/guide.md`. Lihat [docs/AI_AGENT_API.md](docs/AI_AGENT_API.md) untuk contoh tambah, edit, hapus, urut ulang, upload logo, dan kontrol siaran.

Daftar jenis CG berita, riset referensi CNN, dan cara membuat/edit headline pembuka tersedia di [docs/CG_GUIDE.md](docs/CG_GUIDE.md), juga melalui `GET /api/agent/cg-guide.md`. Discovery menyediakan preset siap isi di `graphicPresets`. Agent bisa PATCH headline maupun metadata rundown, mengurutkan berita, lalu readback; edit tersimpan tidak mengubah Program sampai perintah live dijalankan.

NewsCG dibangun dengan struktur monorepo menggunakan **npm workspaces**:

```
newscg/
├── apps/
│   ├── server/          # Backend Express 5 + SQLite (better-sqlite3) + SSE Bus
│   │   ├── src/         # API endpoints (/api/live/*), SSE streaming, persistensi SQLite, live state machine
│   │   └── tests/       # Pengujian unit, alur produksi & integrasi live (Vitest)
│   └── web/             # Frontend React 19 + TypeScript + Vite + Tailwind CSS v4
│       ├── public/      # Aset statis & logo branding
│       └── src/         # Dashboard operator, preview monitor, overlay window engine (/output)
├── packages/
│   └── shared/          # Single Source of Truth: Zod schemas, TypeScript types, SSE event contracts
├── package.json         # Konfigurasi monorepo root & runner script
└── tsconfig.base.json   # Konfigurasi TypeScript dasar
```

---

## 🚀 Panduan Memulai

### Prasyarat
- **Node.js**: Versi 20.19.x atau 22.12.0 ke atas (sesuai build Vite dan validasi gambar Sharp).
- **npm**: Versi 9.x atau lebih baru

### 1. Instalasi Dependensi
Jalankan perintah berikut di root repositori:
```bash
npm install
```

### 2. Konfigurasi Lingkungan (.env)
Buat berkas `.env` di root (opsional jika menggunakan port default):
```env
PORT=3001
WEB_ORIGIN=http://localhost:5173
DATABASE_PATH=./data/newscg.db
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

### Menggunakan vMix (Web Browser Input)
1. Buka **vMix**.
2. Klik tombol **Add Input** di pojok kiri bawah.
3. Pilih tab **Web Browser**.
4. Masukkan URL Output: `http://<IP-SERVER-NEWSCG>:3001/output` (atau `http://localhost:3001/output` jika pada PC yang sama).
5. Atur resolusi ke **1920x1080**.
6. Klik **OK**, lalu aktifkan channel **Overlay (1 / 2 / 3 / 4)** di vMix untuk menayangkan grafis di atas program siaran secara transparan.

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
5. Klik **OK**. Grafis akan tampil transparan murni di atas kamera/video utama.

---

## ⌨️ Pintasan Keyboard (Hotkeys Operator)

| Tombol | Aksi | Keterangan |
|---|---|---|
| `Space` / `Enter` | **TAKE / COMMIT** | Menayangkan grafis terpilih ke siaran live (atau perbarui live jika grafis yang sama sedang tayang) |
| `U` | **UPDATE LIVE** | Memperbarui teks/data pada grafis yang sedang tayang tanpa animasi ulang |
| `Escape` / `C` | **CLEAR CG** | Menarik grafis lower third keluar dari siaran live dengan animasi transisi keluar |
| `0` | **ALL OUT (ANIMASI)** | Menarik keluar seluruh grafis di layar (termasuk logo dan ticker) dengan transisi animasi halus. Untuk blackout instan darurat, gunakan tombol UI 'CLEAR ALL Darurat' |
| `1` | **STAGE LOGO** | Toggle Logo di Preview (tekan `M` untuk menerapkan ke siaran live) |
| `2` | **STAGE TICKER & LIVE** | Toggle Ticker dan badge LIVE di Preview (tekan `M` untuk menerapkan ke siaran live) |
| `M` | **TERAPKAN MASTER** | Menerapkan perubahan staging logo / ticker / live badge ke siaran live |
| `K` | **SOT NARASUMBER** | Buka/tutup LT SOT narasumber (`ArrowLeft`/`ArrowRight` untuk pilih narasumber) |
| `H` | **MODE HEADLINE** | Mengatur template ke mode Headline Bersih |
| `L` | **TOGGLE LOKASI** | Menampilkan atau menyembunyikan elemen lokasi pada grafis |
| `T` | **TOGGLE TOPIK** | Menampilkan atau menyembunyikan kicker / topik di atas headline |
| `D` | **TOGGLE DETAIL** | Menampilkan atau menyembunyikan baris detail / sub-judul |
| `ArrowUp` | **PREVIOUS STORY** | Berpindah ke berita sebelumnya pada rundown |
| `ArrowDown` | **NEXT STORY** | Berpindah ke berita berikutnya pada rundown |

---

## 🔌 Integrasi API Siaran & Remote Control Eksternal

NewsCG menyediakan REST API yang siap dihubungkan ke switcher siaran, Stream Deck, atau Bitfocus Companion:

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/live/stream?role=output` | GET (SSE) | Real-time event stream untuk browser overlay (/output) |
| `/api/live/stream?role=monitor` | GET (SSE) | Real-time event stream untuk operator preview monitor |
| `/api/live/take` | POST | Menayangkan grafis (`graphicId`) ke siaran live |
| `/api/live/update` | POST | Memperbarui teks/data grafis yang sedang tayang |
| `/api/live/clear` | POST | Menarik keluar grafis lower third (animasi keluar) |
| `/api/live/clear-all` | POST | Menghilangkan seluruh layer (`immediate: true/false`) |
| `/api/live/prepare` | POST | Menyiapkan cue standby tanpa mengubah status live |
| `/api/live/variant` | POST | Men-toggle elemen live (`toggle-location`, `toggle-kicker`, `toggle-detail`, `clean-headline`) |
| `/api/live/stage` | POST | Langsung menerapkan preset master (`empty`, `logo`, `full`) dan membersihkan lower third |
| `/api/live/master` | PATCH | Mengonfigurasi master overlay (logo, jam digital, ticker) |
| `/api/rundowns/:id/export` | GET | Mengunduh berkas JSON backup rundown siaran |
| `/api/rundowns/import` | POST | Mengimpor berkas JSON rundown baru |

---

## 🧪 Pengujian & Pengecekan Kualitas Kode

NewsCG dilengkapi dengan pengujian unit dan integrasi otomatis:

```bash
# Menjalankan seluruh pengujian unit & integrasi
npm test

# Menjalankan verifikasi tipe TypeScript di semua workspaces
npm run typecheck

# Memastikan build seluruh package dan apps berhasil
npm run build
```

---

## 📜 Lisensi & Kontribusi

Proyek ini dikembangkan untuk operasional siaran berita profesional berstandar tinggi.
