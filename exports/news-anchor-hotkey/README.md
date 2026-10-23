# Pemeriksaan hotkey P · 15 Oktober 2026

- `default-news-anchor.png`: form default nama/jabatan beserta Preview.
- `operator-cnn.png`, `operator-liputan7.png`: kontrol P terpisah dari cue berita.
- `output-cnn.png`, `output-studio-navy.png`, `output-studio-graphite.png`,
  `output-studio-copper.png`, `output-liputan7.png`: hasil anchor di seluruh
  paket/warna. Latar output transparan.
- `verification.json`: browser Chromium 145.0.7632.6 menjalankan bundle produksi
  melalui HTTP dan SSE sebenarnya, memakai SQLite sementara di port acak.
  Nama NADIA PUTRI hanya data tes di database terpisah. Data/Program pengguna
  di server localhost:3001 tidak diubah oleh pemeriksaan ini.

Default disimpan melalui UI. Keyboard P menyiapkan Preview tanpa mengganti
Program maupun daftar cue; Spasi TAKE, reload output memulihkan anchor,
P lagi kembali ke headline tanpa mengganti Program, dan Esc CLEAR. Tidak ada
page error pada lima paket/warna. Gambar pengaturan, operator, dan keluaran
sudah diperiksa secara visual.

`npm test`: 304 tes pada 17 file lulus. Typecheck dan build lulus; build memiliki
peringatan anotasi komentar Zod yang tidak menggagalkan proses.
