# Status perbaikan NewsCG — 8 Oktober 2026

Audit awal: [audit-newscg-2026-10-08.md](audit-newscg-2026-10-08.md). Snapshot sebelum perbaikan sudah di-commit dan dipush ke `origin/simple`: **af9be6b**.

## Batch 1 — draft produksi, logo, dan pengaturan

Batch ini dikerjakan paralel oleh tiga agen dengan kepemilikan file terpisah. Root menggabungkan hasil, memperbaiki satu masalah tipe pada flag showKicker yang ditemukan saat pemeriksaan gabungan, dan menjalankan validasi proyek.

| Area audit | Hasil |
|---|---|
| A01/A02 | Draft tersimpan saat navigasi mouse/keyboard, pindah rundown, dan keluar panel; respons lama tidak mengembalikan teks lama. Cache mengikuti keberhasilan simpan dan refresh parent. |
| A03 | Upload logo memakai berkas/URL unik. URL logo lama tidak berubah setelah upload baru; penerapan ke master tetap terpisah. |
| A04 | Settings umum memakai schema eksplisit dan tidak menerima key master/default internal. Master dan headline defaults yang tersimpan dibaca melalui validasi; data lama dipertahankan dan JSON rusak dicadangkan sebelum penulisan. |
| A06 | Perintah idempotent memiliki fallback ketika randomUUID tidak tersedia, termasuk HTTP LAN. Empat tes transport lolos; perangkat LAN aktual belum diuji. |
| B03/B07/B08 | Body/limit/error HTTP jelas; gambar didecode dan diperiksa, MIME palsu ditolak, limit 2 MB sama di shared/UI/server; aset upload diproxy pada mode dev. |
| F01/F02/F03/F07 | LOCATION memakai field lokasi; ringkasan SOT mencakup nama/jabatan; DETAIL dan hotkey sesuai; debounce menjaga flag L/T/D terbaru. |
| F04/F05/F06 | Error load default terlihat dan penyimpanannya ditahan sampai load berhasil. Upload tidak menimpa edit ticker/warna; default lambat tidak menimpa field yang sudah diketik. |
| F08/F09 | Petunjuk logo dan batas field memakai kontrak shared. |
| U01 | Dialog rename mempertahankan target ID, semantik dialog, Tab/Escape, dan fokus. |
| Cleanup awal | Lima import App yang tidak dipakai dihapus; cache Python diabaikan Git. Tidak menghapus paket ekspor pengguna. |

Dependensi validasi gambar: Sharp dan saxes. Root memerlukan Node 20.19.x atau 22.12.0 ke atas, mengikuti persyaratan build Vite; server membutuhkan setidaknya Node 20.9.0 untuk Sharp.

Panduan baru [AI_RUNDOWN_GUIDE.md](../docs/AI_RUNDOWN_GUIDE.md) ditautkan dari AGENTS dan README. Panduan mencakup pemetaan rundown user, cue HEADLINE/REPORTER/SOT/LOCATION/BREAKING, batas field, contoh JSON, validasi schema, impor/append melalui API, pencegahan duplikat setelah timeout, serta readback. Materi baru tetap DRAFT dan tidak mengubah Program/master. Contoh JSON di panduan telah divalidasi secara lokal, tanpa diimpor ke database.

## Verifikasi batch 1

- Suite penuh: **148 tes**; 81 tes awal + 22 regresi produksi + 6 regresi Settings + 35 tes HTTP/logo + 4 tes lingkungan request.
- Typecheck seluruh workspace dan build produksi: **lolos** setelah koreksi showKicker.
- Pemeriksaan strict unused untuk frontend dan server: **lolos**.
- Pemeriksaan diff/whitespace: **lolos**.
- Build masih memberi dua warning anotasi PURE pada dependency Zod; build selesai dengan exit 0.
- Uji operator memakai React/JSDOM dengan fetch mock. Uji HTTP memakai database dan folder upload sementara yang terisolasi.
- Tidak menjalankan TAKE/UPDATE/CLEAR/MASTER ke server live, mengganti preset vMix, atau memakai browser eksternal. Belum ada bukti frame vMix/OBS aktual.

## Belum masuk batch 1

ACK/heartbeat output (A05), snapshot metadata live (B01), konflik idempotency key (B02), validasi contentMode (B04), reorder/impor versi (B05/B06), konflik antar-operator (G01), timing OUT/safe area (O01/O02), workflow native GT/palette (T01/T02), retention/stale error/jam/dokumentasi (U02–U05), serta cleanup kontrak/CSS dormant lainnya masih perlu batch berikutnya.

Audit dependency menemukan enam entri pada versi Vitest/mocker/tinypool, concurrently/shell-quote, dan source-map-js yang sudah sama pada snapshot awal. Sharp/saxes tidak masuk temuan tersebut. Pembaruan dependency dipisahkan dari batch 1 agar tidak mengganti test runner saat agen sedang bekerja.
