# Audit fitur NewsCG — 8 Oktober 2026

Audit atas working copy `C:/Users/WORKPLUS/Documents/WEB/newscg`, dilakukan oleh agen utama dan tiga sub-agent: frontend/operator, backend/data/API, dan output/animasi. Tujuan: memetakan fitur aktif, kode yang tidak terpakai, fitur yang belum final, dan perbaikan sebelum pelaksanaan cleanup.

**Hasil:** fondasi aplikasi bekerja dan pemeriksaan utama lolos, tetapi ada masalah penyimpanan draft, isolasi aset logo, validasi pengaturan, dan pembuktian status output. Cleanup sebaiknya dimulai dari masalah tersebut, kemudian konsistensi fitur dan kode sisa.

Tidak ada source aplikasi yang diubah dalam audit ini. Tidak ada perintah TAKE/UPDATE/CLEAR/MASTER ke server produksi, perubahan database produksi, atau perubahan preset vMix. Laporan ini merupakan satu-satunya berkas baru yang sengaja dibuat. Perubahan kode dan berkas ekspor yang sudah ada sebelum audit dipertahankan.

## Cara membaca hasil

- **P1:** masalah data/operator/siaran yang perlu didahulukan.
- **P2:** ketidakkonsistenan fitur, validasi, atau perilaku yang perlu dibereskan berikutnya.
- **P3:** cleanup, dokumentasi, atau peningkatan penggunaan.
- **Terbukti simulasi:** direproduksi pada komponen asli melalui React/JSDOM, fungsi asli dengan SQLite di memori, atau HTTP server uji terpisah. Ini bukan bukti visual vMix.
- **Terbukti source:** jalur dan kontrak kode menunjukkan masalah; dampak visual/perangkat belum diuji langsung.
- **Perlu verifikasi tambahan:** indikasi dari source yang belum direproduksi sepenuhnya. Jangan diperlakukan sebagai bug yang sudah pasti terjadi di perangkat.

## Peta fitur

| Area | Fitur yang ditemukan | Status audit |
|---|---|---|
| Program/rundown | Buat, ubah nama, hapus, pilih program, cari berita, urutkan, impor/ekspor JSON | Dasar aktif; validasi urutan, versi impor, dan dialog rename perlu diperbaiki. |
| Persiapan berita | Judul, slug, format, durasi, kebutuhan CG, status DRAFT/READY, grafis per berita, preset komposisi | Aktif; pemuatan default masih dapat bertabrakan dengan edit. |
| HEADLINE | Judul, detail, topik, lokasi, pilihan komposisi, Preview | Aktif; autosave dan transisi OUT bertopik perlu diperbaiki. |
| REPORTER/SOT | Nama/jabatan, masuk SOT lalu kembali ke headline, pertahankan konteks cerita | Aktif; ringkasan perubahan dan tombol DETAIL belum konsisten. |
| LOCATION | Grafis lokasi mandiri dan lokasi headline | Ada; input cepat LOCATION terbukti menyimpan nilai yang salah. |
| BREAKING | Kontrak data dan renderer tersedia | Belum lengkap di alur pembuatan berita; tidak ada tombol membuat BREAKING di editor cerita. |
| Produksi | Preview/Program, TAKE, UPDATE, OUT, ALL OUT beranimasi, emergency clear, navigasi cerita/cue, hotkey | Jalur utama aktif dan diuji; autosave serta penanda status output belum tuntas. |
| Master overlay | Stage kosong/logo/full, logo, LIVE, ticker, pilihan warna, penerapan master/M | Aktif; upload logo melanggar isolasi aset draft/Program. |
| Pilihan warna | CNN, Studio Navy, Studio Graphite, Studio Copper; Preview sebelum master diterapkan | Implementasi web ada dan pemeriksaan deterministik lolos; belum dinilai pada frame vMix aktual. |
| Galeri studio | Referensi virtual set, contoh teks, pilihan warna, kontrol animasi | Aktif dan terpisah dari perintah live. |
| Ticker/jam | Running text, pembaruan ticker segera, kecepatan, FPS, WIB/WITA/WIT/CUSTOM | Dasar aktif; CUSTOM adalah label, dan label panjang perlu diperiksa visual. |
| Settings/default | Logo teks/gambar, branding, ticker, zona waktu/FPS, default headline | Aktif; jalur settings umum terlalu longgar, kegagalan load disembunyikan, upload dapat mengembalikan draft lama. |
| Output web | `/output` transparan 1920×1080, SSE SYNC/reconnect, controller bersama Program | Aktif; belum ada ACK render, metadata snapshot belum sepenuhnya terisolasi, panduan safe area tidak cocok dengan layout. |
| API/data | CRUD, validasi shared, antrean aksi, idempotency, SQLite WAL, guard penghapusan grafis aktif | Dasar aktif; masih ada beberapa celah validasi dan konsistensi. |
| Riwayat aksi | Simpan dan baca log operasi | Aktif; tidak ada batas retensi/pembersihan otomatis. |
| Ekspor native GT | Script Python, paket `.gtzip`, kontrol/preset vMix, verifikasi manual | Jalur tambahan belum menjadi workflow proyek yang portabel dan terdokumentasi. |

## P1 — perbaikan utama

### A01. Edit cue hilang ketika pindah cepat dengan mouse — terbukti simulasi, terbuka

Skenario: ubah cue A, klik cue B, lalu ketik di B sebelum debounce 500 ms selesai. Timer A dibatalkan oleh edit B; hanya PATCH B terkirim. Navigasi keyboard memiliki flush, tetapi klik cerita dan pill cue tidak memilikinya.

Lokasi: [debounce autosave](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:284), [flush navigasi keyboard](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:299), [pilih cerita dengan mouse](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:746), [pilih cue](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:776).

Perbaikan: semua perpindahan cue menggunakan satu jalur yang menyelesaikan penyimpanan cue lama; timer/payload terikat ke ID cue. Penerimaan: A dan B tetap menyimpan edit masing-masing ketika berpindah cepat melalui mouse maupun keyboard.

### A02. Edit yang berstatus “Tersimpan” kembali ke teks lama saat cue dibuka lagi — terbukti simulasi, terbuka

Skenario: ubah A, tunggu penyimpanan berhasil, pindah B, lalu kembali A. Editor membaca `selectedCue.draftFields` lama karena hasil PATCH tidak dimasukkan kembali ke state rundown. Nilai lama muncul lagi dan berpotensi tersimpan kembali saat TAKE/UPDATE. Ini terjadi pada satu operator, tanpa memerlukan konflik antar-tab.

Lokasi: [inisialisasi draft](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:191), [hasil PATCH diabaikan](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:262), [flush sebelum live](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:409).

Perbaikan: respons penyimpanan memperbarui cache/state rundown secara immutable. Penerimaan: edit A tetap sama setelah pindah cue, kembali, dan TAKE; database tidak tertimpa nilai sebelum edit.

### A03. Upload logo draft menimpa aset yang masih digunakan Program — terbukti simulasi, terbuka

Dua upload PNG menghasilkan nama fisik yang sama, `logo.png`; query `?v=` berbeda tetapi berkasnya tetap sama. Upload kedua mengganti isi berkas pertama sebelum operator menerapkan MASTER. Output lama yang memuat ulang URL tersebut dapat menerima logo draft baru.

Lokasi: [penulisan berkas upload](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:34), [upload sebagai draft settings](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:735).

Perbaikan: setiap upload mempunyai nama aset unik/immutable, lalu URL baru diterapkan hanya melalui master. Penerimaan: upload B tidak mengubah isi URL logo A yang sudah tayang, termasuk setelah output reconnect.

### A04. Settings umum dapat melewati validasi master dan membuat renderer gagal — terbukti simulasi, terbuka

`PATCH /api/settings` menerima nilai bebas melalui `z.any()`, termasuk `master_overlay: {tickerText: 123, showTicker: true}`. Nilai itu langsung tersimpan, dibaca kembali sebagai master, dan dapat gagal pada `.trim()` di renderer. Jalur ini juga tidak mengirim `MASTER_UPDATE`, sehingga output yang sudah terhubung dan yang baru tersambung dapat berbeda.

Lokasi: [schema settings](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:304), [endpoint umum](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:72), [penyimpanan settings](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:158), [pembacaan master](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:178), [pemakaian ticker](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:127).

Perbaikan: settings mempunyai schema eksplisit; key master tidak dapat menulis melalui jalur umum, atau wajib melewati validasi dan distribusi event yang sama. Penerimaan: payload bertipe salah ditolak 400 dan tidak mengubah master tersimpan.

### A05. “Terkonfirmasi ON AIR” hanya membuktikan server menerima perintah — terbukti simulasi/source, sebagian

TAKE dengan nol klien output tetap menghasilkan `commandStatus: confirmed` dan log “terkonfirmasi ON AIR”. Jumlah klien menghitung koneksi SSE. Tidak ada ACK dari output untuk revision/frame, dan ping SSE hanya menjaga koneksi. Pemisahan role `monitor`/`output` sudah ada, tetapi belum membuktikan frame berhasil digambar atau input vMix sedang digunakan.

Lokasi: [hitung koneksi output](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:63), [status/log TAKE](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:131), [kontrak event](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:127).

Perbaikan: pisahkan status server menerima, output terhubung, dan output mengakui revision yang dirender; nama/log harus mencerminkan bukti. Penerimaan: tidak ada label konfirmasi output ketika nol output; ACK yang kedaluwarsa tidak dianggap output sehat. Status aktif overlay web tetap belum membuktikan overlay tersebut sudah masuk Program vMix.

### A06. Mutasi live bergantung pada `crypto.randomUUID()` yang dapat tidak tersedia lewat HTTP LAN — terbukti helper, kondisi perangkat belum diuji

Helper client selalu memanggil `crypto.randomUUID()` sebelum mengirim mutasi idempotent. API browser ini membutuhkan secure context; HTTP dengan alamat IP LAN bukan konfigurasi yang bisa diasumsikan menyediakan API tersebut. Simulasi ketika fungsi tidak tersedia menghasilkan `crypto.randomUUID is not a function`, dengan nol pemanggilan fetch. Dokumentasi proyek menyebut LAN-ready dan memberi URL HTTP berbasis IP.

Lokasi: [helper mutasi](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/api.ts:3), [petunjuk LAN](C:/Users/WORKPLUS/Documents/WEB/newscg/README.md:112). Dependensi secure context juga tercantum dalam dokumentasi tipe DOM TypeScript yang terpasang.

Perbaikan: generator ID mempunyai fallback yang aman untuk lingkungan yang didukung, atau deployment LAN menyediakan secure context. Penerimaan: kontrol produksi berhasil mengirim perintah dari perangkat LAN yang benar-benar digunakan. Uji perangkat LAN aktual belum dilakukan.

## P2 — perilaku dan kontrak yang harus diselesaikan

| ID | Temuan, bukti, dan dampak | Arah perbaikan |
|---|---|---|
| B01 | **Metadata draft bocor saat SYNC — terbukti simulasi.** TAKE HEADLINE lalu ubah tipe draft menjadi REPORTER; reconnect menggabungkan metadata REPORTER dari database dengan snapshot field HEADLINE lama. [live.ts:35](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:35), [overlayPlayback.ts:48](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/overlayPlayback.ts:48). | Simpan metadata template beserta field dalam snapshot live; SYNC dan UPDATE menggunakan snapshot yang konsisten. |
| B02 | **Idempotency key tidak terikat ke aksi/payload — terbukti simulasi.** Key sama untuk TAKE lalu CLEAR mengembalikan hasil TAKE dari cache; CLEAR tidak berjalan. [live.ts:71](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:71). | Ikat key pada jenis aksi dan payload; penggunaan ulang yang berbeda menghasilkan konflik eksplisit. |
| B03 | **Beberapa input buruk menjadi HTTP 500 — terbukti HTTP uji terpisah.** JSON rusak, STAGE tanpa body, upload melebihi 3 MB, dan `actions?limit=1.5` menghasilkan galat server/teks mentah. [index.ts:82](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:82), [error handler](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:114), [db.ts:169](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:169). | Validasi body/angka integer; pertahankan status 400/413 yang sesuai dan pesan Indonesia. |
| B04 | **Mode konten alternatif melewati batas field — terbukti simulasi.** HEADLINE dengan `contentMode: presenter` menerima nama/jabatan 500 karakter melalui passthrough, sedangkan REPORTER menolaknya. [shared:174](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:174), [renderer](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:82). | Validasi berdasarkan mode konten yang benar-benar dirender, dengan schema bersama. |
| B05 | **Validasi reorder belum lengkap — terbukti source.** Endpoint hanya memeriksa array tidak kosong; tidak memeriksa string, keunikan, kepemilikan semua ID, dan kelengkapan urutan. Transaksi database sudah ada. [index.ts:53](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:53), [db.ts:94](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:94). | Tolak daftar duplikat, asing, atau tidak sesuai kontrak; urutan tetap konsisten setelah permintaan ditolak. |
| B06 | **Versi impor belum dijaga — terbukti source.** Ekspor menyertakan `schemaVersion: 1`, tetapi impor mengabaikan versi. Regenerasi ID ketika impor sudah ada dan diuji. [index.ts:69](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:69). | Validasi versi dan buat kebijakan migrasi/penolakan versi yang jelas. |
| B07 | **Validasi upload baru percaya MIME — terbukti HTTP uji terpisah.** Byte yang bukan gambar tetap diterima ketika header `image/png`; UI membatasi 2 MB, backend 3 MB. [index.ts:23](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:23). | Validasi file sesuai format dan samakan limit di shared. Ukuran 800×500 tetap rekomendasi, bukan alasan menolak rasio logo lain tanpa keputusan produk. |
| B08 | **Logo upload dalam mode dev belum mempunyai proxy aset — terbukti source.** Vite port 5173 hanya memproxy `/api`, sedangkan upload mengembalikan URL relatif `/uploads/...` yang disajikan server port 3001. [vite.config.ts:4](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/vite.config.ts:4), [index.ts:19](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/index.ts:19). | Proxy `/uploads` atau gunakan URL aset yang benar. Tidak ada logo tersimpan untuk pembandingan respons image kedua origin pada audit ini; tampilan logo dev perlu diuji setelah diperbaiki. |
| F01 | **Input cepat LOCATION mengedit field yang salah — terbukti React/JSDOM.** Lokasi JAKARTA tetap tersimpan ketika input berlabel “Teks Lokasi” diubah menjadi BANDUNG; field tersebut mengubah headline, sedangkan flush memilih lokasi lama. [SimpleProductionEditor:197](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:197), [254](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:254), [1072](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:1072). | Satu field sumber untuk LOCATION pada editor, Preview, dan payload simpan. |
| F02 | **Ringkasan perubahan tidak menghitung nama/jabatan SOT — terbukti React/JSDOM.** Perubahan nama sudah ter-PATCH, tetapi UI menyebut Preview sama dengan snapshot Program. [SimpleProductionEditor:710](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:710). | Bandingkan field berdasarkan jenis konten, termasuk name/role. |
| F03 | **Tombol DETAIL dan hotkey D berbeda pada SOT — terbukti source.** Tombol dinonaktifkan jika role kosong, meskipun handler mendukung kembali ke headline dengan detail dan hotkey masih menjalankannya. [SimpleProductionEditor:568](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:568), [1016](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:1016). | Satu perhitungan capability untuk tombol dan hotkey. |
| F04 | **Kegagalan load default disembunyikan — terbukti source.** Empty catch meninggalkan nilai awal kosong; Simpan Semua dapat menulis default tersebut setelah GET gagal. [App:688](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:688), [696](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:696), [Newsroom:674](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/Newsroom.tsx:674). | Tampilkan kegagalan; pisahkan belum dimuat, gagal, dan kosong; simpan bagian ini setelah data valid tersedia. |
| F05 | **Respons upload dapat mengembalikan edit Settings lama — terbukti source.** Setelah upload berjalan, perubahan ticker/warna baru dapat tertimpa karena respons memakai salinan masterForm saat upload dimulai. [App:735](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:735). | Functional state update yang hanya mengganti field logo dari respons upload. |
| F06 | **Load default dapat menimpa judul yang baru diketik — terbukti source.** Callback permintaan default menggunakan judul yang ditangkap saat permintaan dimulai. [Newsroom:674](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/Newsroom.tsx:674). | Apply default hanya jika field belum disentuh; batalkan hasil load yang tidak lagi relevan. |
| F07 | **Debounce edit berpotensi membatalkan perubahan L/T/D — perlu verifikasi tambahan.** Timer edit lama tidak dibatalkan saat toggle komposisi; ia masih membawa salinan flag sebelumnya. [SimpleProductionEditor:289](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:289), [520](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/SimpleProductionEditor.tsx:520). | Reproduksi dengan timer terkontrol, lalu satukan antrean update draft/komposisi. |
| F08 | **Spesifikasi logo bertentangan — terbukti source.** Modal menulis 310×196 px, Settings/shared/README menyarankan 800×500 px. [App:608](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:608), [shared:77](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:77). | Semua petunjuk memakai broadcastLogoUploadSpec yang sama. |
| F09 | **Batas teks editor berbeda dengan schema — terbukti source.** Input cepat lokasi sampai 60 karakter, REPORTER/LOCATION menerima 50; default subline 160, editor cerita membatasi 140. [shared:193](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:193). | Turunkan limit UI dari kontrak shared per jenis field. |
| O01 | **Delay OUT berubah saat topik dilepas — terbukti React/JSDOM, visual belum diuji.** Kelas cg-has-topic hilang sekitar 260 ms setelah OUT, padahal headline masih ditahan sampai 780 ms. Override delay teks/panel yang bergantung kelas ikut hilang sebelum urutan selesai. [BroadcastGraphic:77](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:77), [155](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:155), [broadcast-motion.css:71](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/broadcast-motion.css:71). | Bekukan komposisi awal OUT sampai seluruh sequence selesai; cek topik keluar dulu, lalu headline, pada render aktual. |
| O02 | **Panduan title-safe dan layout tidak cocok — terbukti source.** Panduan Preview bertuliskan area 80%/inset 10%, sedangkan CG memakai margin kiri/kanan 70 px dan bawah 30 px pada 1920×1080. [BroadcastGraphic:429](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:429), [broadcast-cnn.css:28](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/broadcast-cnn.css:28). | Putuskan standar safe area target dan samakan panduan/layout; perubahan posisi perlu tetap menjaga desain yang sudah disetujui. |
| T01 | **Workflow ekspor GT belum portabel — terbukti source.** Script menulis ke Documents/News-Vmix di luar repo, membaca aset PNG eksternal, dan pembuat preset membutuhkan snapshot/file sementara. Manifest exports/vmix-gt berisi katalog 12 template, sedangkan exporter saat ini menghasilkan 3 judul dengan bentuk manifest berbeda. [exporter:10](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/export_vmix_gt.py:10), [63](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/export_vmix_gt.py:63), [163](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/export_vmix_gt.py:163), [preset:9](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/build_vmix_preset.py:9), [manifest](C:/Users/WORKPLUS/Documents/WEB/newscg/exports/vmix-gt/manifest.json). | Tentukan versi paket yang digunakan; parameterisasi folder, sertakan sumber aset, dan dokumentasikan urutan build/verifikasi. Jangan menghapus ekspor pengguna sebagai dead code. |
| T02 | **Warna web belum diterapkan otomatis ke native GT — terbukti source.** Exporter membaca timing broadcastMotion, tetapi tidak membaca colorTheme/palette; brand contoh CNN/Indonesia masih muncul dalam generator. Perbedaan easing, gerak teks, autosize, dan jam tercantum pada manifest. [exporter:72](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/export_vmix_gt.py:72), [163](C:/Users/WORKPLUS/Documents/WEB/newscg/scripts/export_vmix_gt.py:163). | Pisahkan penerimaan web overlay dan native GT; buat sumber warna bersama jika paket GT juga ingin mengikuti tema studio. Kesamaan animasi native GT belum boleh dinyatakan persis dengan CSS. |
| G01 | **Belum ada perlindungan revisi antar-tab/operator — terbukti source, fitur sebagian.** UPDATE/PATCH tidak memiliki versi draft/optimistic concurrency; penyimpanan terakhir dapat menimpa edit lain. Ini berbeda dari bug satu operator A01/A02. | Tambahkan pemeriksaan versi dan konflik yang dapat dipahami operator jika penggunaan multi-operator didukung. |

## P3 — penyelesaian UX dan pemeliharaan

| ID | Temuan | Tindak lanjut |
|---|---|---|
| U01 | Dialog rename program belum memakai semantik dialog/focus trap. Pilihan rundown di topbar masih dapat berubah saat dialog terbuka; ada risiko konteks target/nama menjadi tidak cocok. [Newsroom:526](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/Newsroom.tsx:526), [App:190](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:190). Source, dampak salah target perlu reproduksi. | Kunci ID target pada saat dialog dibuka dan tata focus/keyboard. |
| U02 | Error live dari aksi gagal dapat bertahan setelah CLEAR_ALL berhasil. Dibuktikan pada simulasi fungsi backend. [live.ts:259](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:259), [321](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/live.ts:321). | Keberhasilan command membersihkan error yang sudah tidak relevan. |
| U03 | Action log terus ditambahkan tanpa kebijakan retensi; limit hanya membatasi pembacaan. [db.ts:166](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:166). | Tetapkan retensi/arsip yang sesuai operasi. |
| U04 | Label zona waktu CUSTOM boleh 40 karakter tetapi jam berada dalam panel 240 px dengan span biasa. Risiko potong/overflow perlu pemeriksaan visual; bukan bug offset waktu karena UI memang menawarkan label. [shared:171](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:171), [BroadcastGraphic:349](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:349). | Batasi label yang terbaca atau gunakan autosize yang sesuai. |
| U05 | README masih menyebut seed rundown demo, toggle-topic, dan latensi kurang dari 50 ms. Seed saat ini kosong; API memakai toggle-kicker; angka latensi tidak dibuktikan dalam audit. [README](C:/Users/WORKPLUS/Documents/WEB/newscg/README.md). | Sesuaikan dokumentasi dengan implementasi dan bukti pengukuran. |

## Dead code dan bagian dormant

Analisis import runtime menemukan **21 modul TypeScript/TSX runtime; semuanya terjangkau dari entrypoint web/server**. Jadi tidak ditemukan file TS/TSX aplikasi yang sepenuhnya yatim. Cleanup lebih tepat pada simbol, opsi, kontrak lama, dan blok CSS tertentu.

| Kandidat | Kategori dan bukti | Keputusan yang disarankan |
|---|---|---|
| AlertTriangle, MapPin, MonitorPlay, UserRound, TemplateType di App.tsx | Import tidak digunakan; pemeriksaan strict unused gagal pada kelima simbol. [App:3](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:3). | Hapus import; aktifkan pemeriksaan unused pada alur validasi setelah cleanup. |
| takeThenAdvance | Fungsi hanya dipanggil oleh tes, tidak oleh UI/runtime. [productionFlow:40](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/productionFlow.ts:40). | Tentukan apakah TAKE lalu next memang fitur yang diinginkan; sambungkan atau hapus fungsi dan tes khususnya. Jangan hapus seluruh productionFlow. |
| OverlayState, HeadlineVisibility | Tipe ekspor tanpa konsumen runtime sekarang. HeadlineVisibility juga mempunyai konsep yang diduplikasi sebagai PreviewComposition lokal. [shared:318](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:318), [331](C:/Users/WORKPLUS/Documents/WEB/newscg/packages/shared/src/index.ts:331). | Pakai tipe shared untuk data yang sama; hapus tipe legacy setelah pemeriksaan kontrak publik. |
| ghostPreview/ghostFields | Renderer mempunyai cabang ghost, tetapi tidak ada caller eksternal yang mengaktifkannya. [BroadcastGraphic:27](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:27). | Implementasikan tujuan Preview yang jelas atau hapus cabang tak terpakai. |
| isMini | Opsi renderer tidak dipakai caller dan tidak mempunyai styling mini yang sesuai. [BroadcastGraphic:23](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:23). | Hapus jika tidak ada rencana tampilan mini. |
| _visualTemplate / cnn selalu true | Opsi layout lama diabaikan renderer. Schema mengubah classic menjadi cnn; ini kompatibilitas data, bukan bug tema warna baru. | Nyatakan hanya layout CNN didukung; jangan putus impor lama saat membersihkan stub. |
| cg-sequential-out | Kelas dihasilkan JSX tetapi tidak mempunyai aturan CSS. Sequence sebenarnya dikontrol controller/timing. [BroadcastGraphic:151](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/BroadcastGraphic.tsx:151). | Hapus kelas tanpa perilaku jika bukan hook yang sengaja dipertahankan. |
| cg-all-exit, cg-sot-block, cg-sot-headline-row, ticker-changing, cg-ticker-loop | Selector/keyframe lama tidak dipakai renderer aktif. Ada aturan logo duplikat di broadcast-cnn.css. | Hapus per blok setelah cek cascade; sebagian file CSS masih mempunyai aturan aktif. |
| vmix-production-shell, btn-vmix-take-next | Nama kelas dari panel produksi lama tanpa markup runtime saat ini; masih muncul dalam newsroom.css/live-control.css. | Bersihkan selector lama; jangan hapus seluruh live-control.css karena topbar, focus, scrollbar, dan galeri masih memakainya. |
| OverlayPlaybackState.synced | Ditulis controller tetapi tidak dibaca renderer saat ini. | Pakai untuk indikator sinkronisasi yang jelas atau hilangkan field setelah memeriksa konsumen lain. |
| fields.brand / lastPushedFields | brand masih diterima schema tetapi render mengikuti master.brandText; lastPushedFields tersimpan/dikembalikan namun tidak mengendalikan perilaku saat ini. | Tandai kontrak lama/dormant dan lakukan migrasi bila diperlukan. Jangan menghidupkan branding per cue tanpa keputusan karena master merupakan sumber branding sekarang. |
| outputMode: web dan form settings umum | outputMode hanya default legacy; form AppSettings dimuat/disimpan tetapi tidak ada kontrol edit yang bermakna. [db:152](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/server/src/db.ts:152), [App:680](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/App.tsx:680). | Rapikan setelah jalur settings dischema-kan; pertahankan master/default headline yang aktif. |
| AutoSquishText minScale | Nilai caller 0.3/0.35/0.45/0.5 dijepit ke minimum 0.72. Font juga diperkecil sehingga ini bukan bukti headline pasti meluber. [AutoSquishText:19](C:/Users/WORKPLUS/Documents/WEB/newscg/apps/web/src/AutoSquishText.tsx:19). | Samakan kontrak parameter dengan perilaku yang diinginkan. |
| scripts/__pycache__/*.pyc | Artefak Python lokal; .gitignore belum mengatur cache Python. | Abaikan artefak cache; pertahankan script sumber dan ekspor asli pengguna. |

**Jangan langsung dianggap dead code:** endpoint prepare/stage dan selectedGraphicId server dapat digunakan kontrol eksternal; BREAKING masih didukung kontrak/renderer; `.gtzip`, `.vmix`, PNG/source ekspor adalah deliverable, bukan sampah; queued merupakan nilai kontrak status meskipun belum dipancarkan sebagai state sekarang. Tidak ada alasan membuat kembali adapter vMix HTTP untuk arsitektur web overlay yang memang memakai Browser Input.

## Bagian yang sudah bekerja dan perlu dipertahankan

- READY gate sebelum TAKE, proteksi menghapus grafis/berita/rundown yang sedang aktif, regenerasi ID impor, dan transaksi pengurutan sudah tersedia.
- Draft field live disimpan sebagai snapshot; masalah B01 adalah metadata template saat reconnect, bukan ketiadaan snapshot field.
- Role SSE monitor/output sudah dibedakan; masalah A05 adalah bukti render, bukan ProgramMonitor dihitung sebagai output.
- UPDATE pada grafis yang sama memakai jalur pembaruan konten tanpa memulai ulang semua animasi IN; pergantian grafis memakai OUT sebelum IN.
- ALL OUT beranimasi dan emergency clear mempunyai jalur terpisah; ticker, logo, dan location mempunyai lifecycle sendiri.
- Pilihan warna studio adalah perubahan palet web, tetap menggunakan renderer/timeline CNN yang sama; pemilihan Preview dan penerapan master dipisahkan.
- Ticker segera hanya menerapkan perubahan ticker, sehingga pilihan warna yang sedang menunggu di Preview tidak ikut diterapkan.
- Clipboard mempunyai fallback dan pesan gagal; tidak semua catch adalah silent fail. Empty catch yang bermasalah disebut pada F04.

## Verifikasi dan batas bukti

| Pemeriksaan | Hasil |
|---|---|
| npm test | **Lolos: 81 tes pada 5 berkas.** overlayPlayback 21, productionFlow 10, liveVariant 8, live unit 12, broadcastLayers 30. |
| npm run typecheck | **Lolos** seluruh workspace. |
| npm run build | **Lolos.** Vite menghasilkan bundle web; dua warning anotasi PURE pada dependency Zod tidak menggagalkan build. |
| git diff --check | **Lolos.** Warning normalisasi LF/CRLF tidak dianggap kegagalan pemeriksaan whitespace. |
| Strict unused frontend | **Gagal:** lima import/simbol pada App.tsx yang disebut di tabel cleanup. Typecheck normal belum mengaktifkan noUnusedLocals/noUnusedParameters. |
| Strict unused server | **Lolos.** |
| Import graph runtime | **21/21 modul runtime terjangkau; tidak ditemukan modul TS/TSX aplikasi yatim.** |
| Simulasi operator | Membuktikan A01, A02, F01, dan F02 melalui komponen asli dengan fetch mock; tidak mengirim ke server live. |
| Simulasi backend/API | SQLite di memori dan listener HTTP uji terpisah membuktikan A03/A04/A05, B01/B02/B03/B04/B07, dan U02. |
| Simulasi OUT | Membuktikan kelas penentu delay berubah di tengah OUT (O01); belum membuktikan kualitas transisi pada frame vMix. |
| Helper pada crypto terbatas | A06 gagal sebelum fetch jika randomUUID tidak tersedia; perangkat HTTP LAN aktual belum diuji. |
| API live read-only | GET health pada 3001 dan proxy 5173 merespons 200. Tidak ada mutasi live dalam audit. |
| Visual/perangkat | Browser eksternal tidak digunakan sesuai AGENTS. Tidak ada uji render vMix/OBS, screenshot output aktual, perangkat LAN, atau pengukuran latensi akhir. |

Tes yang disebut “API” saat ini banyak memanggil fungsi/database secara langsung. Belum ada suite HTTP route yang mencakup upload, malformed body, settings umum, limit action, dan daftar reorder yang salah. Simulasi tambahan menjelaskan mengapa 81 tes bisa lolos sementara masalah di atas tetap ditemukan.

## Urutan pelaksanaan yang disarankan

1. **Penyimpanan operator:** A01/A02, kemudian F01/F02/F07. Selesaikan jalur draft sebelum cleanup besar.
2. **Isolasi dan validasi siaran:** A03/A04/B01, lalu semantik konfirmasi A05 dan dukungan lingkungan A06.
3. **Konsistensi API/UI:** idempotency, error/status, upload, reorder/impor, default settings, batas teks, hotkey, dan spesifikasi logo.
4. **Output:** stabilkan OUT dengan topik, samakan safe area, dan cek frame aktual di vMix; nilai web dan native GT secara terpisah.
5. **Cleanup:** import, selector, cabang renderer, kontrak dormant, dokumentasi, dan workflow GT. Pertahankan seluruh perubahan serta aset pengguna yang sudah ada.

Untuk perbaikan nanti, tambahkan regresi hanya pada masalah yang bermakna: perpindahan cue, cache sesudah simpan, aset logo immutable, validasi settings, metadata SYNC, konflik idempotency, dan urutan OUT. Setelah perubahan, jalankan kembali tes, typecheck, build, pemeriksaan diff, lalu verifikasi perangkat/output yang sesuai lingkup perbaikan.
