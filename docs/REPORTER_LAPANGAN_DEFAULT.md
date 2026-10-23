# Default Reporter Lapangan · O

Fitur ini menyiapkan CG **REPORTER** untuk reporter di lapangan tanpa membuat cue
di rundown, memakai data default yang disimpan operator.

1. Buka **Pengaturan Default → Pengaturan Default Reporter Lapangan**.
2. Isi **Nama Reporter**, **Jabatan Reporter** (bawaan `Reporter Lapangan`), dan
   **Lokasi Liputan** (opsional), lalu **Simpan Default Reporter Lapangan**.
   **Simpan Semua** juga menyertakan pengaturan ini.
3. Buka **Kontrol Siaran**, tekan **O** atau tombol **O REPORTER LAPANGAN**.
4. Preview menampilkan nama/jabatan/lokasi dari default. **Spasi/→** menayangkan
   atau memperbarui reporter yang sudah Program; **O** lagi mengembalikan Preview
   ke cue berita.
5. **Esc/C/←** menjalankan OUT. Master logo/ticker tetap seperti alur CG lain.

O berlaku pada semua template (CNN, seluruh warna Studio, dan Liputan7). Reporter
lapangan tidak menjadi cue di daftar rundown dan dapat dipakai tanpa rundown atau
saat preview cue berita biasa. Data diedit melalui Pengaturan Default; shortcut O
tidak membuka editor teks.

## Perbedaan dengan cue REPORTER

Cue `REPORTER` di rundown tetap ada sebagai materi tersimpan (mis. nama pembawa
berita pada berita tertentu). O hanya memakai **default global** dan tidak
menambah/mengubah cue. Saat Preview reporter lapangan aktif, pintasan edit cue
(Q), toggle lokasi/topik/detail, dan navigasi highlight dinonaktifkan sampai
kembali ke cue dengan O atau memilih cue berita.

## Penyimpanan dan output

- Nama/jabatan/lokasi disimpan pada settings `reporter_defaults` dengan schema
  shared (`reporterDefaultsSchema`). PATCH sebagian tidak menghapus field lain.
  Penyimpanan default tidak mengubah data berita, komposisi master, atau Program
  yang sedang tayang.
- Preview membawa snapshot nama/jabatan/lokasi yang akan di-TAKE. Perubahan
  default setelah Preview disiapkan tidak diam-diam mengganti isinya.
- Reporter lapangan memakai renderer `REPORTER` yang sudah didukung semua paket.
  Jika **Lokasi Liputan** diisi, Liputan7 menampilkan tab lokasi di atas panel
  headline seperti pada CG lain; anchor default tanpa lokasi tidak menampilkan
  tab tersebut. ID Program `newscg:default-field-reporter` merupakan identitas
  internal, bukan cue database.
- Snapshot Program disimpan pada `on_air_state`; output/SSE yang reconnect
  memulihkan reporter dan data persis yang ditayangkan, termasuk bila default
  sudah diedit kemudian. TAKE cue berita biasa kembali ke alur rundown normal.
- Perintah reporter memakai antrean dan Idempotency-Key yang sama dengan live
  lainnya. TAKE saat reporter yang sama sudah Program memakai UPDATE agar IN
  tidak berulang. Ticker aktif dan seluruh pengaturan master dipertahankan.
- Nama wajib diisi. TAKE dengan nama kosong gagal dengan pesan Indonesia, dan
  UPDATE ditolak bila reporter lapangan tidak sedang Program.
- API: GET/PATCH `/api/settings/reporter-defaults` serta POST
  `/api/live/reporter`, dengan schema/request di discovery `/api/agent`
  (`ReporterDefaults`, `ReporterDefaultsPatch`, `LiveReporter`).

## Verifikasi

Tes mencakup hotkey O pada dua paket, tidak menulis cue/Program sebelum TAKE,
kembali ke cue semula, pemakaian tanpa rundown, UPDATE, guard keyboard, default
kosong/gagal dimuat, partial PATCH `{name,role,location}`, persistensi
HTTP/SQLite/SSE, idempotency, dan CLEAR. Jalankan `npm test`, `npm run typecheck`,
dan `npm run build` setelah perubahan terkait.
