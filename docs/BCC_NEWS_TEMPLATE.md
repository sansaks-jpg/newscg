# BCC News Broadcast Template

Template siaran **BCC News** terintegrasi di NewsCG bersama template **CNN / Studio** dan **Liputan7 · HOC TV**. Template ini mengadopsi struktur geometri dan timing animasi broadcast standar TV dari CNN dengan identitas visual, logo resmi, dan palet warna BCC News.

---

## 1. Identitas Visual & Palet Warna

Berdasarkan referensi visual siaran BCC News:
- **Bar Judul Utama (Headline Plate)**:
  - Latar Belakang: Merah Marun Tua pekat (`#6B0908` / `#4A0706`)
  - Warna Teks: Putih (`#FFFFFF`), huruf kapital tebal (Arial Narrow / Roboto Condensed / Arial)
  - Tinggi: 106 px (188 px pada mode single headline bersih)
  - Transisi Tinggi: `transition: height 260ms cubic-bezier(.16,1,.3,1)` halus saat detail masuk atau keluar
- **Bar Subline / Narasumber / Detail (Subline Plate)**:
  - Latar Belakang: Krem Hangat / Peach Beige (`#F6D2A7`)
  - Warna Teks: Hitam / Dark Maroon (`#1A1A1A`), font Arial normal
  - Divider SOT: Garis vertikal marun (`#6B0908`) pemisah nama narasumber dan peran/instansi
  - Tinggi: 82 px
- **Tab Topik / Kicker / Lokasi**:
  - Latar Belakang: Oranye Terang (`#FF6115`)
  - Warna Teks: Putih (`#FFFFFF`), huruf miring (*italic*) tebal
  - Bentuk: Sudut miring kanan atas (*chamfered polygon tab*)
  - Tinggi: 52 px, sejajar di atas bar judul marun
- **Kotak Logo Master Permanen (Logo Box)**:
  - Posisi: Sisi **kiri** menyatu sejajar dengan bar judul dan subline
  - Latar Belakang: Krem Hangat (`#F6D5A9`), persis menyatu dengan piksel latar logo
  - Dimensi: 192 × 188 px
  - Logo Resmi: "BCC NEWS" (`/branding/bcc.png` / `/branding/bcc.webp`) berwarna merah marun (`#720F0A` – `#5B0400`)
  - **Sifat Master**: Kotak logo bersifat permanen di layarnya, tidak di-unmount atau di-reanimate ketika headline masuk (TAKE) maupun keluar (CLEAR).
- **Badge LIVE**:
  - Posisi: Tepat di atas kotak logo kiri (`bottom: 100%`)
  - Dimensi: 192 × 52 px (ketinggian sama persis dengan tab kicker di sampingnya)
  - Latar Belakang: Oranye (`#FF6115`), teks putih tebal "LIVE"
  - **Persistensi**: Tetap aktif dan stabil mendampingi kotak logo sebelum, saat, dan sesudah headline tayang.
- **Ticker Bar (Bawah)**:
  - Latar Belakang: Marun Gelap (`#4A0706` / `#360505`)
  - Tinggi: 56 px
  - Jam Realtime: Berada di sisi **kiri** ticker bar, tepat di bawah kotak logo dengan lebar identik (192 px), latar belakang marun pekat (`#360505`), dan font tabular putih tebal beserta zona waktu siaran. Badge "BCCNEWS.ID" ditiadakan sehingga blok jam mengisi sisi kiri secara rapi dan selaras vertikal dengan kotak logo di atasnya.
  - Running Text: Putih (`#FFFFFF`) dengan bullet pemisah oranye ("■") mengisi seluruh ruang di sebelah kanan jam.
  - Teks Bawaan: Dilengkapi teks default `"INFORMASI TERKINI • SIARAN LANGSUNG • DATA TERVERIFIKASI BCC NEWS"` apabila rundown belum memiliki teks ticker khusus.
- **Kontrol Master Independen di Produksi**:
  - Sama seperti Liputan7, template BCC News memiliki 3 tombol master mandiri di panel kontrol siaran:
    - **[1] LOGO**: Mengaktifkan / menonaktifkan kotak logo di Preview.
    - **[2] LIVE**: Mengaktifkan / menonaktifkan badge LIVE di Preview.
    - **[3] TICKER**: Mengaktifkan / menonaktifkan ticker bar di Preview.
    - **[M] TERAPKAN MASTER**: Menerapkan konfigurasi master dari Preview ke ON AIR (Program).

---

## 2. Animasi & Koreografi

- **Master Layers (Logo, LIVE Badge, Ticker)**:
  - Masuk saat master diaktifkan (`bcc-brand-in`, 420 ms).
  - Tetap statis dan stabil selama pergantian materi headline ON AIR.
  - Keluar hanya ketika layer master dimatikan atau saat operator menekan **ALL OUT (0)** / `CLEAR_ALL_ANIMATED`.
- **Headline Entry (TAKE)**:
  - Bar judul marun dan bar subline krem menyapu masuk secara horizontal dari kiri ke kanan (`bcc-panel-in`, 520 ms) seolah keluar dari balik kotak logo kiri.
  - Tab kicker oranye menyapu masuk dari kiri (`bcc-panel-in`, 400 ms, delay 100 ms).
  - Teks judul bergeser naik halus (`bcc-text-in`, 360 ms, delay 160 ms).
  - Teks subline/narasumber bergeser naik halus (`bcc-text-in`, 340 ms, delay 240 ms).
- **Update Live (UPDATE)**:
  - Memperbarui teks secara instan tanpa mengulang animasi masuk panel.
- **Headline Exit (CLEAR / OUT)**:
  - Teks judul dan detail memudar (`bcc-text-out`, 160 ms).
  - Bar judul marun dan subline krem menyapu keluar ke kiri (`bcc-panel-out`, 360 ms) secara serempak tanpa terputus di tengah jalan.
  - Tab kicker oranye menyapu keluar ke kiri (`bcc-panel-out`, 280 ms).
  - Logo dan LIVE badge tetap stabil di layarnya tanpa animasi buka-tutup.
- **Detail Toggle Mandiri (Hotkey `D` / `SWITCH_DETAIL`)**:
  - Saat detail dimatikan: Bar subline krem memainkan animasi geser keluar (`cg-detail-out` / `bcc-panel-out`, 220 ms) dan bar judul marun meluas dengan transisi tinggi halus dari 106 px ke 188 px.
  - Saat detail dihidupkan: Bar judul mengecil ke 106 px dan bar subline krem menyapu masuk dengan `bcc-panel-in`.

---

## 3. Cara Penggunaan & Akses

1. **Pemilihan Template**:
   - Di panel **Produksi**: Pada dropdown **Template siaran**, pilih **BCC News**, periksa tampilan di monitor Preview, lalu tekan **TERAPKAN MASTER (M)**.
   - Di **Settings**: Pada menu **Pengaturan Default Siaran & Ticker**, pilih **BCC News** lalu klik **Simpan Default Master**.
2. **Pratinjau Interaktif**:
   - Buka URL `/templates/bcc` untuk mencoba variasi grafis BCC News (SOT, Headline, Highlight, Reporter, Breaking News) dan animasi IN/OUT secara interaktif.
3. **Output Siaran**:
   - URL `/output` otomatis merender grafis BCC News secara transparan murni (*alpha overlay*) siap dihubungkan ke switcher siaran (vMix, OBS Studio, Wirecast).
