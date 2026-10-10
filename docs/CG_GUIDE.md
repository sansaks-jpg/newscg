# CG berita dan highlight

Highlight tersedia di **Rundown & CG → Tambah/Edit Berita → + Highlight Berita**. Label HIGHLIGHT memakai tab topik di atas judul, sehingga judul mendapat ruang penuh tanpa panel label samping. Warna mengikuti master CNN atau studio. Satu cue menampilkan satu judul. Tambahkan beberapa cue sesuai urutan untuk ringkasan awal bulletin, pilih di Produksi, kemudian TAKE. Pergantian judul dikendalikan operator; tidak ada rotasi atau penayangan otomatis.

## Jenis grafis berita dan referensi CNN

Riset diakses 10 Oktober 2026. Paket CNN berbeda menurut negara, program, dan periode. Uraian CNN 2023 di bawah merupakan referensi historis desain, bukan klaim bahwa seluruh siaran CNN hari ini memakai susunan yang identik. CNN Indonesia TV tidak berhasil diakses melalui alat riset pada sesi ini; kecocokan visual dengan siaran terbarunya belum diverifikasi.

Pada paket CNN Juni 2023, informasi dipisahkan menjadi headline, tab topik/program, logo, indikator LIVE, locator/waktu lokal, ticker/flipper, dan jam/informasi pasar. Penempatan dapat berubah saat banner muncul. Pengamatan tersebut menjadi acuan pembagian fungsi, bukan spesifikasi internal CNN. [NewscastStudio, paket CNN 1 Juni 2023](https://www.newscaststudio.com/2023/06/01/cnn-new-graphics-chryons-lower-thirds/).

| Jenis CG | Fungsi editorial | Dukungan NewsCG |
|---|---|---|
| Headline / story strap | Judul pokok berita di bawah gambar | `HEADLINE`, judul tunggal atau dengan detail |
| Highlight / recap | Judul-judul pilihan saat awal/ringkasan bulletin | `HEADLINE` dengan `headlinePresentation: "bulletin"`, `kicker: "HIGHLIGHT"`; satu judul per cue |
| Kicker / topic strap | Konteks topik di atas judul | `kicker` + `showKicker` |
| Breaking / developing flag | Menandai urgensi/perkembangan berita | `BREAKING`; teks flag bisa diedit. Developing dapat memakai kicker HEADLINE |
| Name strap / identifier | Nama presenter, reporter, atau tamu | `REPORTER`; nama + jabatan/akun |
| SOT identifier | Identitas pembicara sambil mempertahankan judul berita | `SOT`; headline + nama + jabatan |
| Locator | Tempat laporan atau gambar | `LOCATION` atau field lokasi pada cue |
| Station bug / LIVE / clock | Identitas kanal dan status siaran | Master logo, LIVE, jam/zona waktu |
| Ticker / crawl / flipper | Informasi tambahan bergantian/berjalan | Master ticker berjalan; flipper belum tersedia |
| Program / segment bug | Identitas acara atau segmen | `brandText` pada ticker; belum berupa layer program mandiri |
| Source / courtesy / archive label | Menjelaskan asal/tanggal gambar | Belum ada layer khusus; jangan menyamarkan kredit sumber sebagai locator |
| Full-screen / quote / factbox | Kutipan, fakta, kronologi, atau poin data | Belum ada template khusus; subline hanya untuk detail pendek |
| OTS / shoulder graphic | Gambar topik di samping presenter | Belum tersedia |
| Two-box / multi-box | Bingkai dua atau lebih sumber video | Belum tersedia; komposisi video ditangani switcher |
| Map / chart / election results | Visualisasi data dan hasil pemilihan | Belum tersedia |
| Tease / coming up / bumper | Pengantar segmen atau jeda | Cue headline pembuka bisa memberi teks teaser; bukan paket bumper/video |

Baris yang belum tersedia merupakan peta kebutuhan produksi, bukan fitur yang telah dibuat. Istilah praktis name strap/SOT/recap di sini memetakan fungsi NewsCG, bukan daftar nama template resmi CNN.

Untuk liputan khusus, pembuat paket CNN Election, BIGSTAR, mendokumentasikan lower thirds/locators, peta, struktur data, dan toolkit animasi. Ini membuktikan bahwa kebutuhan paket berita dapat meluas ke grafis data serta paket acara, di luar teks overlay harian. [BIGSTAR — CNN Election Package](https://bgstr.com/work/project/cnn-election-package/).

## Field dan cara mengoperasikan highlight

Template tetap `HEADLINE`, sehingga rundown lama dan alur TAKE/UPDATE/CLEAR tetap kompatibel. Kontrak berada di `packages/shared/src/index.ts`:

| Field | Nilai / batas |
|---|---|
| `headline` | Wajib, 1–120 karakter |
| `headlinePresentation` | `story` (bawaan untuk materi lama) atau `bulletin` |
| `kicker` | Label tab topik, maksimal 60 karakter; preset `HIGHLIGHT` |
| `showKicker` | Preset `"true"`; tombol T mengatur tampil/sembunyi topik sebelum TAKE/UPDATE |
| `contentMode` | Gunakan `headline` untuk highlight |
| `layoutStyle` | Preset `single`; `sub` jika memang memerlukan detail |
| `showLocation`, `showDetail` | Preset `"false"`; nilai flag berupa string |

Jenis Headline dapat dipilih di editor berita. Label disunting lewat Sub Topik/Kicker; label dan judul juga tersedia di Edit Cepat Produksi. Topik memakai AutoSquishText dan animasi topik yang sama: judul selesai masuk sebelum topik masuk; topik keluar sebelum panel judul. Master logo/ticker tetap mandiri. Output tetap `/output`, canvas transparan 1920 × 1080. Mengubah teks melalui UPDATE mempertahankan panel yang sama tanpa mengulang IN; CLEAR memainkan OUT dan mempertahankan master.

`headlineLabel` (1–24 karakter) hanya diterima untuk kompatibilitas preset samping lama. Pada cue `bulletin`, label lama dipindahkan ke `kicker` bila topik belum terisi; label contoh `HEADLINE` menjadi `HIGHLIGHT`. Editor dan PATCH menormalisasi ke field topik tanpa mengubah data secara in-place. Semua materi baru menggunakan `kicker`/`showKicker`.

## Edit melalui agent

Mulai `GET /api/agent`. `graphicPresets` menyediakan preset `headline-bulletin`; `links.cgGuide` menunjuk panduan ini dan OpenAPI mempublikasikan field/batasnya. Gabungkan preset dengan judul yang benar dari sumber:

```json
{
  "templateType": "HEADLINE",
  "sortOrder": 0,
  "draftFields": {
    "headline": "JUDUL BERITA DARI SUMBER",
    "headlinePresentation": "bulletin",
    "kicker": "HIGHLIGHT",
    "contentMode": "headline",
    "layoutStyle": "single",
    "showLocation": "false",
    "showKicker": "true",
    "showDetail": "false"
  }
}
```

Kirim ke `POST /api/items/{itemId}/graphics`, lalu `GET /api/graphics/{graphicId}`. Untuk menyunting:

```http
PATCH /api/graphics/{graphicId}
Content-Type: application/json

{"draftFields":{"headline":"JUDUL REVISI DARI SUMBER","kicker":"HIGHLIGHT","showKicker":"true"}}
```

PATCH menggabungkan field sehingga field lain tetap tersimpan. Baca kembali CG, berita, dan rundown. Judul item berita dan teks headline merupakan dua field berbeda: jika user meminta keduanya berubah, lakukan juga `PATCH /api/items/{itemId}` dengan `title`.

Untuk metadata edisi gunakan `PATCH /api/rundowns/{rundownId}`. Urutan berita memakai `POST /api/rundowns/{rundownId}/reorder` dengan seluruh `itemIds` tepat sekali. Untuk mengedit urutan cue, PATCH `sortOrder` masing-masing CG, lalu baca item kembali. PUT story mengganti seluruh daftar CG: sertakan ID dan seluruh cue yang masih dibutuhkan. Panduan lengkap: [AI_AGENT_API.md](AI_AGENT_API.md), [AI_RUNDOWN_GUIDE.md](AI_RUNDOWN_GUIDE.md).

Edit materi tidak mengubah snapshot Program dan tidak mengirim event overlay. TAKE/UPDATE/CLEAR/master hanya dijalankan bila operator menginstruksikan live. Setelah UPDATE, readback `/api/live/state` dan event UPDATE membuktikan pemrosesan/sinkronisasi data; frame yang dirender serta hasil vMix/OBS tetap perlu pemeriksaan visual.
