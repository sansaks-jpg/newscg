# Liputan7 / HOC TV

Template tambahan melalui **Template siaran → Liputan7 · HOC TV** di Produksi
atau Settings. Perubahan di Produksi masuk Preview; **TERAPKAN MASTER / M**
menerapkannya ke Program. Galeri `/templates/liputan7` tidak membuka SSE maupun
mengirim perintah live. `/output` tetap transparan dan memakai renderer yang sama
dengan monitor Program.

## Identitas dan komposisi

- Logo HOC TV mengikuti bentuk HOC dari gambar user, termasuk O berbentuk atap.
- Logo Liputan7 berdiri sendiri tanpa tulisan HOC.
- Palet: burgundy `#790D16`, sand `#E5D3AF`, ivory `#F5EFE1`, blue `#AEC4D4`.
- Logo program: x=96, y=826, 288×146. Headline mulai x=384 dan berakhir
  x=1850: jarak kanan 70 px, sama dengan template CNN. Area interpreter tidak disisakan.
- Tab topik/HIGHLIGHT menempel di **kiri atas** panel headline (sejajar x=384),
  mengikuti konvensi tab topik CNN. Tab memakai warna template sendiri:
  latar burgundy `#790D16`, teks ivory `#F5EFE1`, garis aksen sand `#E5D3AF`
  selebar 7 px di sisi kiri, tinggi 32 px, huruf kapital 20 px.
  Bila tab lokasi juga tampil, tab topik bertumpuk 32 px di atasnya agar
  keduanya terbaca. Topik biasa (bukan HIGHLIGHT) memakai gaya tab yang sama.
- Headline/nama memakai Barlow Semi Condensed 500; detail, kota, jam, dan ticker
  memakai Arial dengan bobot normal.
  Font WOFF2 lokal, dimuat awal, tanpa ketergantungan Google Fonts saat siaran.
- Lokasi pada tab di atas headline. Detail pada strip biru. Teks dinamis memakai
  AutoSquishText dalam viewport yang memotong overflow. Headline selalu satu
  baris, termasuk tanpa detail. Mengikuti contoh CNN terakhir dari user, judul
  panjang boleh dipadatkan horizontal sampai 72% dan ditinggikan secara terbatas:
  maksimal 1,45× tanpa detail, 1,25× dengan detail. Setelah batas horizontal
  tercapai, ukuran font ikut mengecil agar seluruh judul tetap masuk. Tinggi
  mengikuti ukuran tinta huruf yang sebenarnya; ruang kosong font tidak ikut
  diperbesar. Kebijakan terpusat pada `liputan7HeadlineFit` di shared.
  Nama anchor, detail, logo, ikon, dan jam tidak memakai peregangan vertikal.
  Jam **HH:mm WIB** memakai kotak sesuai lebar teks + padding 22 px per sisi.

Tiga master Produksi berdiri sendiri: **Logo Program (1)**, **Logo TV (2)**,
dan **Ticker (3)**. Weather mengikuti logo program, LIVE mengikuti logo TV,
dan jam mengikuti ticker. Tombol/shortcut hanya menyiapkan Preview sampai
operator menjalankan TERAPKAN MASTER. Preferensi weather tetap disimpan saat
logo program dimatikan.

## Gerak

Referensi yang dianalisis: https://www.youtube.com/watch?v=K28tfy0LPIY, 02:30–04:50.
Bidang dasar membuka dari logo program ke kanan, disusul bidang judul dan detail;
lokasi menyusul. UPDATE mempertahankan DOM dan tidak mengulang IN. CLEAR menahan
konten sampai OUT selesai dan mempertahankan master. Cuaca mulai menutup saat
CG di-OUT. ALL OUT mengeluarkan CG, ticker, logo program, lalu logo TV/LIVE; emergency blackout
menghapus semuanya segera.

Analisis referensi dilakukan pada setiap frame 60 fps: 108 frame IN sekitar
02:53 dan 90 frame OUT sekitar 03:02. Bidang dan teks mempunyai jalur terpisah;
teks bergerak selebar bidang dari belakang logo, tanpa fade. IN: dasar merah
600 ms; bidang ivory mulai +200 ms selama 500 ms; teks mulai +400 ms selama
350 ms. Detail mulai +400 ms, lokasi +700 ms, teks lokasi +1.000 ms.
OUT: lokasi keluar lebih dulu; teks +300 ms, ivory +400 ms, dasar +450 ms.
Dasar selesai pada 1.050 ms, di dalam **retensi 1.100 ms**.
Durasi terpusat pada `liputan7Motion` di shared.

Bentuk panel detail dipertahankan selama OUT. Retensi detail/lokasi dibatasi
identitas cue agar teks berita sebelumnya tidak ikut masuk ke cue baru tanpa
detail. UPDATE cue yang sama mempertahankan node dan tidak mengulang IN.

Aturan global `prefers-reduced-motion` sebelumnya memangkas animasi Liputan7
menjadi **0,01 ms**. Elemen di bawah `[data-broadcast-motion]` sekarang
dikecualikan dari pemangkasan tersebut. Preferensi aksesibilitas tetap berlaku
untuk UI operator; durasi gambar siaran sama pada mode normal maupun reduce.

Saat tidak ada CG aktif, hanya logo program yang tampil pada bidang program;
cuaca tidak berputar meskipun preferensi weather aktif. CLEAR menutup cuaca
dan mengembalikan logo utuh. TAKE CG berikutnya memulai ulang jeda 10 detik.
Logo TV dan ticker tetap mengikuti kontrol master masing-masing.

Saat CG aktif, logo tampil sendiri selama **10 detik**, kemudian cuaca membuka ruang 44 px
melalui transisi 700 ms. Seluruh kota muncul berurutan dengan **3 detik waktu
baca penuh per kota**; antarkota diberi OUT 300 ms dan IN 300 ms tanpa menutup
strip atau memantulkan logo. Setelah kota terakhir, strip menutup 700 ms dan
logo beristirahat 10 detik lagi. Satu siklus tujuh kota berlangsung 36 detik.
Gerak antarkota bergantian naik tipis, geser pendek, dan dissolve; variasi
bergeser pada putaran berikutnya. Logo bergeser 22 px tanpa diperkecil.
Kota, ikon, dan rentang suhu tetap satu baris. Ikon memakai **Meteocons** (Bas Milius, MIT), bukan gambar
cuaca buatan sendiri. Delapan SVG animasi siang/malam disimpan lokal; warna
disesuaikan ke palet dan timeline animasi aslinya dipertahankan.

## Highlight dan kontrol keyboard

HIGHLIGHT memakai template `HEADLINE` dengan `headlinePresentation: "bulletin"`
dan `kicker: "HIGHLIGHT"`, sehingga satu cue menampilkan satu judul besar.
Label tampil pada tab topik burgundy–ivory di kiri atas panel seperti dijelaskan
pada bagian identitas. Contoh interaktif ada di galeri `/templates/liputan7`
lewat pilihan **Jenis CG → Highlight (tab topik)**; galeri tidak membuka SSE
maupun mengirim perintah live.

Di panel Produksi:

- **→** pada cue biasa menjalankan TAKE/UPDATE; **←** menjalankan OUT.
- Saat Preview berupa HIGHLIGHT, **→ / ←** berpindah ke judul highlight
  berikutnya/sebelumnya pada berita yang sama (memutar, tanpa perintah live).
- Spasi/Enter tetap TAKE/UPDATE. OUT pada HIGHLIGHT memakai `Esc`/`C`.
- **↑ / ↓** berpindah berita; narasumber SOT dipilih dengan `PageUp`/`PageDown`.
- **P** menyiapkan news anchor default; **O** menyiapkan reporter lapangan
  default (nama/jabatan/lokasi dari Pengaturan Default Reporter Lapangan).
  Keduanya memakai Preview dan tidak membuat cue rundown.
- Setelah mouse mengklik kontrol, fokus dilepas sehingga shortcut langsung aktif
  kembali; fokus yang dicapai lewat Tab tetap memakai aktivasi tombol native.

## Cuaca otomatis

Sumber: https://data.bmkg.go.id/prakiraan-cuaca/.
`GET /api/weather?adm4=31.71.03.1001` membaca prakiraan BMKG Kemayoran. Tujuh kota
bawaan: Jakarta, Bandung, Surabaya, Medan, Semarang, Denpasar, dan Makassar.
Kode default diverifikasi dengan balasan BMKG aktual. Pengaturan menyediakan
tombol untuk mengembalikan tujuh kota tersebut. Operator dapat mengisi sampai
delapan kode wilayah beserta label yang tampil di layar.
Kode memakai tingkat kelurahan/desa; label kota bukan rata-rata seluruh kota.
Verifikasi sumber terbaru mencocokkan kode, kota/kelurahan, koordinat, suhu,
kondisi, zona waktu, dan slot UTC/lokal bagi ketujuh lokasi. Jika slot saat ini
tidak tersedia, slot prakiraan terdekat maksimal tiga jam ke depan tetap
memakai waktu berlakunya yang asli. Pengaturan menandai **Slot berikut**,
menampilkan kota/kelurahan dan waktu lokal, sehingga prakiraan tidak disebut
sebagai pengukuran saat ini. Rentang suhu memakai slot yang tersedia pada
tanggal lokal tersebut. Nama sumber tidak muncul pada grafis siaran; tautan
dan informasi sumber tetap tersedia di **Info data prakiraan** pada pengaturan.

Server memvalidasi JSON, memilih slot UTC aktif, menghitung minimum–maksimum
dari tanggal lokal slot tersebut, menyimpan cache maksimal 10 menit, dan
menggabungkan permintaan serentak. Slot yang kedaluwarsa tidak dilayani dari
cache; kegagalan diberi jeda retry satu menit. Kontrol operator menampilkan
atribusi BMKG, nama kelurahan/desa, tanggal prakiraan, dan detail kondisi.
Nama wilayah yang gagal dimuat tidak ditayangkan dan galat terlihat di kontrol
operator. Tidak ada suhu/kondisi fallback rekaan. Ticker tetap berasal dari rundown.

Pengaturan master baru: `broadcastTemplate`, `showProgramLogo`, `showWeather`,
`programLogoImage`, `weatherLocations`. Semuanya memakai schema shared dan
persistensi settings yang sudah ada; tidak memerlukan migrasi SQLite.

## Verifikasi

Tes mencakup nama animasi pada layer yang dirender di jsdom, posisi dan bobot font,
identitas DOM saat UPDATE, retensi OUT, perpindahan cue tanpa sisa detail/lokasi,
weather IN/OUT, blackout, tiga master dan staging Preview,
aset Meteocons/WOFF2 lokal, validasi serta cache BMKG, dan HTTP–SQLite–SSE untuk
persistensi/blackout master baru. Build, typecheck, dan semua tes dijalankan.
HTTP lokal dan BMKG diuji langsung melalui terminal. Render browser headless
1920×1080 dan monitor 706×400 diperiksa melalui screenshot headline dengan/tanpa
detail, kedua judul screenshot user, judul 116 karakter, nama anchor, dan tujuh kota.
Selain 280 sampel frame render IN/OUT, pemutaran CSS alami pada bundle produksi
`http://localhost:3001/output` diuji dengan jam browser sebenarnya dan
requestAnimationFrame, pada mode normal dan reduce. Pengujian memakai SSE
terisolasi di browser serta memblokir request tulis; tidak mengubah Program
server. Artefak berada di `exports/liputan7-visual/`, terutama
`headline-fit-verification.json` dan `frame-audit/runtime-verification.json`.
Hasil ini tidak menetapkan kelancaran frame pada perangkat vMix/OBS.

Siklus logo/cuaca terbaru direkam dengan jam web sebenarnya selama 47,5 detik,
termasuk putaran penuh dan pembukaan cuaca putaran kedua. Bukti sumber,
pengukuran waktu, screenshot tujuh kota, dan video berada di
`exports/liputan7-weather-cycle/`. Data browser untuk rekaman tersebut memakai
balasan sumber asli yang baru ditangkap dan diverifikasi; SSE diisolasi dan
tidak mengirim mutasi ke Program server.

Lisensi aset ada di `/weather/meteocons/LICENSE` dan `/fonts/barlow/OFL.txt`.
