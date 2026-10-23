# News anchor default · P

1. Buka **Pengaturan Default → Pengaturan Default News Anchor**.
2. Isi **Nama Anchor** dan **Jabatan Anchor**, lalu **Simpan Default News Anchor**.
   Simpan Semua juga menyertakan pengaturan ini.
3. Kembali ke **Kontrol Siaran**, tekan **P** atau tombol **P NEWS ANCHOR**.
4. Preview memakai anchor default. **Spasi/Enter/→** menayangkan atau memperbarui
   anchor yang sudah Program; **←** menjalankan OUT seperti cue biasa. **P** lagi
   mengembalikan Preview ke cue berita.
5. **Esc/C** menjalankan OUT. Master logo/ticker tetap seperti alur CG lain.

Untuk reporter di lapangan, gunakan **O** dan pengaturan
**Default Reporter Lapangan**; lihat
[REPORTER_LAPANGAN_DEFAULT.md](REPORTER_LAPANGAN_DEFAULT.md). P dan O tidak
dapat aktif bersamaan di Preview; memilih salah satu menutup preview lainnya.

P berlaku pada CNN, Studio Navy/Graphite/Copper, dan Liputan7. Anchor global
tidak menjadi cue di daftar rundown, dan dapat disiapkan tanpa rundown atau
saat berita terpilih ditandai tanpa CG. Data anchor diedit melalui pengaturan
default; edit cepat cue berita dinonaktifkan saat Preview menampilkan anchor.
Hotkey diabaikan saat mengetik, dialog edit terbuka, tombol ditahan, memakai
Ctrl/Alt/Meta, HOTKEYS OFF, atau perintah lain masih diproses. Huruf P besar
dan p kecil sama-sama didukung.

Nama awal kosong; operator wajib mengisinya sebelum TAKE. Kegagalan memuat
default ditampilkan kepada operator dan cue Preview sebelumnya dipertahankan.
Tidak ada nama orang rekaan yang otomatis ditayangkan.

## Penyimpanan dan output

- Nama/jabatan disimpan pada settings `news_anchor_defaults` dengan schema
  shared. PATCH sebagian tidak menghapus field lain. Penyimpanan default tidak
  mengubah data berita, komposisi master, atau Program yang sedang tayang.
- Preview membawa snapshot nama/jabatan yang akan di-TAKE. Perubahan default
  setelah Preview disiapkan tidak diam-diam mengganti isinya.
- Anchor memakai renderer REPORTER yang sudah didukung semua paket. ID Program
  `newscg:default-news-anchor` merupakan identitas internal, bukan cue database.
- Snapshot Program disimpan pada `on_air_state`. Output/SSE yang reconnect
  memulihkan anchor dan data persis yang ditayangkan, termasuk bila default
  sudah diedit kemudian. TAKE cue berita biasa kembali ke alur rundown normal.
- Perintah anchor memakai antrean dan Idempotency-Key yang sama dengan live
  lainnya. TAKE saat anchor yang sama sudah Program memakai UPDATE agar IN
  tidak berulang. Ticker aktif dan seluruh pengaturan master dipertahankan.
- API: GET/PATCH `/api/settings/news-anchor-defaults` serta POST
  `/api/live/news-anchor`, dengan schema/request di discovery `/api/agent`.

## Verifikasi

Tes mencakup P pada dua paket, tidak menulis cue/Program sebelum TAKE, kembali
ke cue semula, pemakaian tanpa rundown, UPDATE, guard keyboard, default kosong/
gagal dimuat, partial PATCH, persistensi HTTP/SQLite/SSE, idempotency, dan CLEAR.
Pemeriksaan browser headless memakai bundle produksi dan database sementara
terpisah, dengan tombol keyboard P/Spasi/Esc sebenarnya, simpan default melalui
UI, serta reload `/output`. Seluruh lima pilihan paket/warna lulus.
Screenshot dibuka dan diperiksa; bukti di `exports/news-anchor-hotkey/`.
