# Pemeriksaan visual Liputan7 — 15 Oktober 2026

Headline tetap **satu baris**. Sesuai screenshot CNN terakhir dari user, huruf
boleh dipadatkan dan ditinggikan secara terbatas agar judul panjang memenuhi
bidang. Batas horizontal 72%; batas vertikal 1,45× tanpa detail, 1,25× dengan
detail. Setelah batas horizontal tercapai, ukuran font mengecil. Nama anchor,
detail, jam, logo, serta ikon mempertahankan proporsinya.

## Hasil yang dapat ditinjau

- `headline-satu-baris.png`: judul 71 karakter dari screenshot user, tanpa detail.
- `headline-cnn-reference.png`: teks pada screenshot CNN terakhir user.
- `perbandingan-layout.jpg`: judul user, contoh CNN, dengan/tanpa detail, anchor.
- `headline-in-out.mp4`: rekaman pemutaran CSS alami dari bundle produksi;
  dengan dan tanpa detail, mode reduced-motion, tanpa mempercepat video.
- `frame-audit/perbandingan-in.jpg`, `frame-audit/perbandingan-out.jpg`:
  perbandingan dengan sumber pada interval 100 ms. Semua 280 frame hasil
  render tersedia sebagai contact sheet bernomor di folder tersebut.
- `frame-audit/master-controls.png`: tiga master Program / TV / Ticker.
- `frame-audit/jam-no-preference.png`: clock HH:mm WIB; padding 22 px per sisi.
- `weather-7-kota.jpg`, `weather-7-kota.mp4`: dokumentasi siklus cuaca sebelumnya.
  Siklus terbaru logo 10 detik → tujuh kota masing-masing 3 detik ada di
  `../liputan7-weather-cycle/`, beserta verifikasi sumber dan rekaman waktunya.
- `output-single-alpha.png`, `output-detail-alpha.png`, `output-706-alpha.png`:
  output transparan dari localhost:3001, dengan event SSE terisolasi di browser.

Studio hanya dipakai dalam galeri. Tidak ada perintah live ke server atau
perubahan Program aktual selama pemeriksaan visual. Permintaan tulis diblokir
oleh browser pengujian.

## Temuan dan perbaikan

Aturan global `prefers-reduced-motion` memotong durasi Liputan7 menjadi 0,01 ms.
Elemen grafis siaran kini dikecualikan dari pemangkasan tersebut; UI operator
tetap menghormati preferensi aksesibilitas. Pada mode normal dan reduce,
durasi IN/OUT kembali sama. Retensi OUT Liputan7 1.100 ms, lebih panjang dari
animasi panel yang selesai pada 1.050 ms.

Bidang dasar, bidang judul, dan teks bergerak sendiri melalui viewport. Teks
menyusul selebar bidang dari balik logo tanpa fade, mengikuti urutan referensi.
Detail/lokasi lama tidak terbawa ke cue baru tanpa detail. Logo program dan
weather tetap terlihat setelah OUT CG; ketiga master dikendalikan terpisah.

## Bukti pemeriksaan

- `frame-audit/render-measurements.json`: 280 sampel, setiap 1/60 detik untuk
  IN/OUT dengan dan tanpa detail. Jam JS dihentikan untuk pemeriksaan per frame.
- `frame-audit/comparison.json`: 198 frame sumber ditinjau. Rata-rata selisih
  posisi tepi bidang putih setelah normalisasi lebar: IN 1,07%, OUT 2,12%.
  Liputan7 sengaja memanjang ke x=1850 sesuai permintaan user; sumber berhenti
  di x=1548. Angka tersebut hanya membandingkan perkembangan lebar bidang.
- `frame-audit/runtime-verification.json`: pemutaran alami di Chromium
  145.0.7632.6 dengan jam sebenarnya dan requestAnimationFrame, tanpa seeking.
  Mode normal dan reduce masing-masing diuji untuk empat fase. Setiap fase
  menghasilkan 29–31 posisi bidang berbeda; layer baru dilepas setelah OUT.
  Tidak ada page error atau request tulis. WebM merekam browser pada 25 fps;
  MP4 mempertahankan waktunya. Pemeriksaan per frame menggunakan 60 sampel/detik.
- `headline-fit-verification.json`: judul pendek, contoh CNN (49 karakter),
  judul user (71), judul user dengan detail, dan judul 116 karakter pada ukuran
  1920×1080 serta 706×400. Tidak meluber atau berpindah baris. Judul user memakai
  scaleX 0,721 dan scaleY 1,45, dengan tinggi tinta huruf sekitar 56,6 px.
- `output-verification.json`: seluruh latar output transparan; UPDATE
  mempertahankan node headline. Jam tanpa transform. Screenshot/crop/contact
  sheet sudah dibuka dan diperiksa secara visual.
- `verification.json`: catatan pemeriksaan cuaca sebelumnya, termasuk HTTP 200
  dari tujuh endpoint BMKG dan rotasi kota. Catatan rasio judul/jam di file lama
  tersebut sudah digantikan oleh dua laporan terbaru di atas.
- `npm test`: **17 file, 294 tes lulus**. `npm run typecheck`, `npm run build`,
  dan `git diff --check` lulus. Build memberi peringatan anotasi komentar Zod
  yang tidak menggagalkan build.

Cuaca adalah prakiraan desa/kelurahan yang mewakili tiap kota, bukan rata-rata
seluruh kota. Timeout sementara BMKG pernah ditemukan; pemuatan tujuh wilayah
kemudian berhasil tanpa fixture cuaca. Atribusi dan detail wilayah ada di kontrol.
Kelancaran pada perangkat vMix/OBS fisik belum diuji.
