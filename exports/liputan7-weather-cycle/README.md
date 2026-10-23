# Siklus logo dan cuaca · 15 Oktober 2026

Logo 10 detik → buka strip 700 ms → tujuh kota berurutan, masing-masing 3 detik
penuh ditambah perpindahan 300 ms OUT + 300 ms IN → tutup 700 ms → logo 10 detik
lagi. Total satu putaran tujuh kota 36 detik. Gerak naik tipis, geser pendek,
dan dissolve bergantian; strip tetap terbuka antarkota.

Siklus hanya berjalan saat CG aktif. Output kosong tetap menampilkan logo
program utuh. Saat CLEAR dimulai, weather menutup 700 ms; TAKE berikutnya
memulai ulang jeda 10 detik. Master TV dan ticker tetap independen.

## Bukti

- `empty-output-verification.json`: bundle produksi dengan waktu nyata:
  output kosong 12 detik, TAKE dan jeda 10 detik, CLEAR, kosong 11 detik,
  lalu TAKE ulang dan jeda baru. Semua pemeriksaan lulus tanpa mutasi live.
- `output-kosong-logo-saja.png`, `output-setelah-out.png`, dan
  `output-cg-weather.png`: hasil render kosong, setelah OUT, dan CG aktif.
- `logo-weather-10s-3s.mp4` / `logo-weather-runtime.webm`: rekaman browser dengan
  waktu sebenarnya. Tidak dipercepat dan tidak memakai jam palsu/seeking.
- `runtime-verification.json`: waktu kemunculan/pergantian setiap kota dan
  kembalinya logo, diambil melalui requestAnimationFrame. Mode reduced-motion
  juga mempertahankan durasi siaran. Bundle produksi dari localhost:3001.
- `logo-sebelum-cuaca.png`: logo pada detik 8,5, cuaca belum muncul.
- `weather-*.png`: ketujuh kota pada fase diam, diperiksa secara visual.
- `source-verification.json`: balasan asli tujuh endpoint publik, ditangkap
  ulang pada waktu `checkedAt`; kode dan nama kota, kelurahan, koordinat,
  kondisi, suhu/rentang, UTC/lokal, serta zona waktu dicocokkan dengan parser
  server yang digunakan aplikasi. Seluruh tujuh wilayah terverifikasi.

Jakarta diwakili Kemayoran, Bandung Sukarasa, Surabaya Karang Pilang, Medan
Pasar Baru, Semarang Miroto, Denpasar Serangan, dan Makassar Bontorannu.
Denpasar/Makassar memakai zona Asia/Makassar (WITA), lima kota lainnya WIB.
Pada pemeriksaan ini, Bandung/Surabaya/Denpasar mulai dari slot prakiraan
berikutnya; data tersebut mempertahankan waktu aslinya dan ditandai sebagai
`upcoming`, bukan pengamatan cuaca saat ini. Ikon siang/malam mengikuti jam
lokal slot prakiraan. Rentang suhu memakai data yang tersedia pada tanggal
prakiraan, bukan rentang observasi penuh 24 jam.

Pemeriksaan awal mengalami kegagalan koneksi sementara saat memanggil tujuh
endpoint bersamaan; pengambilan ulang bertahap berhasil untuk semuanya. Tidak
ada fallback kondisi/suhu rekaan. Browser memutar balasan asli yang baru
ditangkap tersebut agar uji visual tidak bergantung pada perubahan jaringan.
SSE browser terisolasi, request tulis diblokir, Program pengguna tidak diubah.

## Sumber gratis dan terbuka

- [Data prakiraan wilayah](https://data.bmkg.go.id/prakiraan-cuaca/): API publik
  tanpa kunci, per kelurahan/desa, interval tiga jam. Sumber ditampilkan pada
  pengaturan; tidak ada tulisan sumber pada grafis siaran.
- [Meteocons](https://github.com/basmilius/meteocons): ikon SVG animasi open source,
  lisensi MIT; aset lokal dan lisensi dipertahankan.
- [Open-Meteo](https://open-meteo.com/en/pricing) turut diperiksa: server open
  source, tetapi hosted free API dibatasi nonkomersial. Integrasi tetap memakai
  sumber wilayah Indonesia yang telah diverifikasi, tanpa menambah langganan.

`npm test`: 313 tes pada 18 file lulus; typecheck dan build lulus. Peringatan
anotasi komentar Zod tidak menggagalkan build. Kelancaran perangkat vMix/OBS
fisik tidak diukur dalam uji web ini.
