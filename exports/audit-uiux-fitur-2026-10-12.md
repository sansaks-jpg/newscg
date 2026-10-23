# Audit UI/UX, fitur, dan kesiapan produksi NewsCG

Tanggal audit: 12 Oktober 2026 (WIB)

## Ruang lingkup

- Branch: simple; HEAD saat pemeriksaan: 2bd91f9 (fix: harden NewsCG live workflows and rundown ticker integration).
- Empat sub-agent memeriksa UX operator, grafis/output, backend/live state, dan QA/deployment. Prime menguji silang temuan dan menjalankan skrip validasi proyek.
- Pemeriksaan dilakukan melalui kode sumber, tes React/JSDOM, API/server, skema, dokumentasi, dan CSS. Tidak ada browser eksternal, capture aktual vMix/OBS, atau uji jaringan LAN fisik karena AGENTS.md melarang browser eksternal untuk debugging.
- Kategori: P1 = harus ditangani sebelum deployment berisiko atau siaran yang menuntut keandalan tinggi; P2 = revisi berikutnya; P3 = pembenahan jangka menengah. Peringkat mempertimbangkan dampak dan kondisi penggunaan.
- Semua temuan di bawah merupakan analisis; belum ada perbaikan fitur yang diterapkan.

## Ringkasan keputusan

NewsCG memiliki fondasi fitur produksi yang cukup baik: rundown dan cue terpisah dari snapshot Program, Preview/Program, SSE dengan SYNC, state persisten, validasi Zod, serialisasi aksi, idempotency sementara, pemilihan warna/identitas, ticker per rundown, serta dukungan output 1920 x 1080. Untuk uji coba lokal pada **satu proses backend**, arsitekturnya sudah masuk akal. Namun, pemakaian pada LAN bersama, origin publik/Cloudflare, deployment sementara, atau beberapa operator yang mengedit materi yang sama membutuhkan sejumlah revisi P1.

## Temuan P1

### F01 — API kontrol siaran tidak mengautentikasi pemanggil

Bukti: apps/server/src/index.ts:20-27, 98-108, 163-203, 245; apps/server/src/agentApi.ts:171-185.

Semua klien HTTP yang menjangkau port backend dapat melakukan mutasi termasuk CLEAR ALL atau penghapusan rundown. CORS tidak mengamankan permintaan HTTP nonbrowser. Kondisi paling berat: server dibuka via Cloudflare Tunnel/origin publik tanpa Access; risiko juga ada pada LAN dengan perangkat tidak tepercaya.

Revisi: default binding atau firewall dibatasi; tambahkan autentikasi + otorisasi untuk operasi mutasi/on-air. Jika dipublikasikan melalui Cloudflare, lindungi origin dan endpoint dengan Access/reverse-proxy; uji kasus tanpa kredensial untuk semua POST/PATCH/PUT/DELETE.

### F02 — Output dan monitor tidak mengetahui ketika SSE menjadi stale

Bukti: apps/web/src/useOverlayPlayback.ts:10-17, ProgramMonitor.tsx:4-8, OverlayWindow.tsx:64-71; apps/server/src/index.ts:204-224.

EventSource ditangani melalui onmessage saja. Ketika stream putus setelah TAKE, frame terakhir tetap tampil dan perintah CLEAR yang diproses server tidak mencapai output sampai koneksi pulih. Status sukses server mengonfirmasi perubahan state, bukan bukti frame vMix/OBS sudah dirender.

Revisi: catat onopen/onerror, waktu SYNC/event terakhir dan status output STALE/RECONNECTING; tampilkan alarm pada operator. Tentukan kebijakan fail-hold vs fail-clear sesuai kebutuhan produksi. Pertimbangkan heartbeat/render ACK dari browser output; monitor internal tidak boleh dilabeli sebagai verifikasi frame switcher.

### F03 — Penerapan master dapat diblokir oleh ticker rundown lain

Bukti: apps/web/src/SimpleProductionEditor.tsx:485-507; apps/server/src/live.ts:392-401.

Jika stagedMaster.showTicker aktif, penerapan logo atau warna turut mengirim POST /api/live/ticker. Saat Program berisi CG dari rundown A dan operator beralih memilih rundown B, server benar menolak ticker B (409), tetapi akibatnya logo/warna yang sedang diterapkan juga gagal. Aksi master memuat side effect editorial yang tidak selalu dimaksud operator.

Revisi: hitung delta konfigurasi per lapisan; pisahkan commit identitas/warna/logo dari commit ticker. Kirim /live/ticker hanya ketika ticker dipilih secara eksplisit untuk diterapkan. Laporkan partial success bila operasi berurutan diperlukan.

### F04 — TAKE/UPDATE tetap menyimpan ulang cue yang tidak berubah

Bukti: apps/web/src/SimpleProductionEditor.tsx:270-339, 463-481.

TAKE menunggu PATCH /api/graphics/:id dan reload walaupun tidak ada perubahan. Jika PATCH gagal atau respons lambat, TAKE tertahan, padahal cue persisten sebelumnya mungkin valid. Untuk operator live, hop jaringan yang tidak perlu memperbesar waktu respons.

Revisi: bandingkan fields/composition dengan versi tersimpan. Jika clean dan tidak ada save pending, langsung jalankan TAKE; jika dirty, selesaikan save yang valid lalu TAKE. Tambah regression test CLEAN TAKE saat PATCH endpoint gagal, serta latensi GET reload lambat.

### F05 — Penulisan satu cerita dapat menghapus cue milik editor lain

Bukti: apps/server/src/index.ts:60-75; apps/server/src/db.ts:158-175.

PUT story menerima daftar graphics pengganti tanpa version/If-Match. Jika operator A menambah G3 setelah kedua operator memuat daftar [G1,G2], lalu operator B menyimpan form lama berisi [G1,G2], backend menghapus G3 sebagai item yang tidak ada pada request B. Hanya CG yang sedang ON AIR memperoleh perlindungan tertentu.

Revisi: optimistic concurrency di level story dan CG (versi/ETag); bila berbeda balas konflik 409/412 serta diff. Perubahan kecil sebaiknya menggunakan PATCH granular per CG; destructive full-replace harus eksplisit.

### F06 — Safe area grafis belum sejalan dengan standar internal

Bukti: apps/web/src/broadcast-cnn.css:28-29,60; apps/web/src/newsroom.css:517-521; AGENTS.md bagian 6.

CNN lower third x=70..1850, bottom 30, sementara indikator title-safe yang tersedia memakai inset 10 persen (horizontal 192 dan bottom 108 pada 1920x1080). Sebagian konten penting berada di luar batas aman internal. Ini bukti koordinat CSS, belum uji pemotongan fisik pada switcher.

Revisi: atur batas aman konsisten antar template; tampilkan garis safe area di Preview dan buat uji bounding box grafik pada resolusi 1920x1080, kemudian lakukan verifikasi capture nyata pada vMix/OBS sebelum menaikkan revisi ke produksi.

### F07 — Persistensi/deployment belum mempunyai pemulihan data lengkap

Bukti: apps/server/src/db.ts:10-15,308-312; apps/server/src/index.ts:23-24,41-55,58,137-138.

SQLite WAL, master, action log, rundown, dan logo tersimpan lokal. Ekspor/impor rundown bukan backup penuh. Jika server memakai filesystem ephemeral atau mount tidak ditemukan, dapat terinisialisasi database baru serta seed kosong, sedangkan /api/health tetap menjawab OK. Ini risiko kondisional deployment, bukan bukti data pengguna saat ini telah hilang.

Revisi: volume durable, backup konsisten SQLite termasuk WAL dan folder uploads, retensi snapshot, latihan restore, dan startup fail-fast jika path database produksi yang seharusnya ada ternyata hilang. Readiness perlu memeriksa DB/storage dan tidak sekadar mengembalikan ok:true.

### F08 — Arsitektur real-time saat ini hanya aman untuk satu proses backend

Bukti: apps/server/src/live.ts:18-28,34-66,76-97; apps/server/src/db.ts:10-15; apps/server/src/index.ts:23-24.

Subscriber, antrean perintah, key idempotency, dan event revision tersimpan in-process; file SQLite serta upload berada di disk lokal. Dalam deployment lebih dari satu instance, TAKE yang mendarat di B tidak otomatis diteruskan kepada output SSE di A. Belum ada konfigurasi Cloudflare deployment pada tracked repository.

Revisi: paling ringan jalankan satu origin Node persisten melalui Tunnel + Access. Jika memerlukan multi-instance/Cloudflare Workers, desain ulang storage dan event broker (mis. D1/R2 dan coordinator berbasis Durable Objects, atau stack Node dengan broker dan shared store), lalu uji reconnect serta urutan event.

## Temuan P2

| Kode | Masalah / bukti | Rekomendasi |
| --- | --- | --- |
| U01 | Perubahan form StoryEditor ditutup oleh Escape/X/Batal tanpa dirty guard; ticker editor dengan key rundown baru menghilangkan edit lokal saat pergantian rundown. Newsroom.tsx:673-677,907-909,1291-1299; RundownBroadcastEditor.tsx:9-26; test rundownBroadcastEditor.test.tsx:62-69. | Dialog Simpan/Buang/Tetap Edit; tanda belum tersimpan di tab; intercept pergantian rundown ketika dirty. |
| U02 | AutoSquishText.tsx:19 membatasi floor minimum 0.72 walau BroadcastGraphic.tsx:173-235 memanggil minScale 0.3-0.5. Font mengecil lebih dini pada teks panjang. | Bedakan batas horizontal squish dan font-size minimum; uji keterbacaan serta judul ekstrem. |
| U03 | body min-width:1100px pada apps/web/src/styles.css:2 memaksa overflow pada viewport sempit. | Sidebar yang bisa di-collapse, responsif 768/900/1100, tombol live tetap mudah dijangkau. |
| U04 | Quick edit punya label sibling tanpa htmlFor/id, tombol ikon X StoryEditor tanpa nama aksesibel, cue pill terpilih tanpa aria-pressed. SimpleProductionEditor.tsx:1117-1198,833-844; Newsroom.tsx:907-909. | Relasikan label-input, beri nama ikon dan status state untuk pembaca layar; uji keyboard/fokus. |
| U05 | Hotkey 0 mengeksekusi ALL OUT animasi tanpa tahapan arming; tombol ALL OUT dan CLEAR ALL Darurat berdekatan. productionFlow.ts:11; SimpleProductionEditor.tsx:719-720,1078-1082. | Review mitigasi salah tekan khusus aksi ALL OUT, misalnya arm/hold singkat, sambil mempertahankan jalur darurat langsung. Ini keputusan UX operasional, bukan bug fungsional. |
| B01 | UPDATE live menulis last_pushed_fields dan on_air_state dengan operasi terpisah; apps/server/src/live.ts:214-215. | Gabungkan ke dalam transaksi SQLite dan uji injeksi kegagalan di tengah. |
| B02 | Idempotency hanya Map selama 60 detik dan hilang saat restart; aksi toggle varian bisa berbalik jika retry identik terjadi setelah expiry. live.ts:76-96,230-313. | Ledger persisten jangka pendek + perintah set-state atau expected-revision untuk toggle berisiko. |
| B03 | selectedGraphicId masih bisa menunjuk cue yang sudah dihapus. live.ts:6,99-123; server index.ts:115-116,136. | Reset selection ketika menghapus cue atau verifikasi referensi sebelum memberi state ke operator. |
| O01 | File logo baru dibuat setiap upload tanpa reclamation; action_logs tidak dibatasi; SSE res.write tidak menangani backpressure. index.ts:51-55,215-220; db.ts:246-251. | Retensi dan garbage collection aset/log serta monitoring disk dan backlog client SSE. |
| B04 | Semua event yang tidak dikenali jatuh ke cabang default CLEAR ALL di apps/web/src/overlayPlayback.ts:107-125; JSON SSE hanya di-cast sebagai tipe tanpa validasi runtime pada useOverlayPlayback.ts:13. Event baru atau salah format berpotensi mengosongkan output. | Gunakan case CLEAR_ALL eksplisit dan abaikan/log tipe tidak dikenal; validasi Zod sebelum diteruskan ke playback. |
| B05 | Preset STAGE full hanya menyalakan layer ticker tanpa menjamin pemilik rundown sudah berganti; live.ts:359-366 dan db.ts:258-263. Setelah berpindah persiapan dari A ke B, ticker A dapat muncul lagi. | Tetapkan ticker rundown yang dimaksud dalam operasi stage atau validasi owner sebelum menunjukkan ticker. |
| U06 | Indikator CONNECTED menghitung klien SSE biasa sebagai output karena role default=output pada index.ts:204-216; live.ts:68-74,99-108. GET dari curl dapat menaikkan jumlah klien output tanpa browser switcher. | Gunakan role monitor sebagai default; identitas output eksplisit, heartbeat dan acknowledgement frame, serta label status yang membedakan koneksi SSE dari bukti rendering. |
| U07 | CUSTOM timezone label bisa mencapai 40 karakter (shared/src/index.ts:212), sedangkan ruang jam ticker berlebar tetap 240px, font 36px tanpa auto-fit (BroadcastGraphic.tsx:331-347; broadcast-cnn.css:92-100). CUSTOM juga mengganti label, bukan offset waktu. | Batasi dan sesuaikan label tampilannya atau auto-fit; tulis semantik 'label jam WIB' secara eksplisit bila offset tidak bisa dipilih. |

## Temuan P3 dan pengembangan produk

- GET /api/rundowns membaca setiap rundown beserta item dan CG-nya secara berulang; indeks foreign key belum tampak. apps/server/src/db.ts:18-43,69-83. Untuk newsroom besar, uji query plan dan pertimbangkan batch loading beserta indeks rundown_id/item_id.
- Timestamp updated_at rundown tidak selalu disentuh saat CRUD grafis individu; apps/server/src/db.ts:144-157. Urutan rundown menurut updated_at dapat meleset dari aktivitas terakhir.
- Dashboard dapat ditambah panel riwayat terakhir TAKE/UPDATE/OUT dan tombol restore snapshot sebelumnya dengan batas hak akses. Riwayat aksi sudah ada pada GET /api/actions, tetapi mekanisme rollback khusus perlu desain terpisah.
- Ukur keterbacaan UI saat operator siaran: beberapa label memakai font yang amat kecil pada CSS. Lakukan penilaian visual dan accessibility audit; jangan menyimpulkan gagal WCAG hanya dari pemeriksaan statis.
- README.md:13 menyebut latensi SSE di bawah 50 ms tanpa hasil benchmark dalam repo. Ganti dengan pengukuran empiris jaringan LAN, termasuk p95 dan p99.
- .env.example:4-8 masih berisi VMIX_MODE/HOST/USERNAME/PASSWORD walau jalur aktif memakai browser overlay web. Perjelas bila ini konfigurasi legacy agar tidak membingungkan deployment.
- BroadcastTicker.tsx:55-88 tetap menjalankan loop requestAnimationFrame pada kondisi teks ticker kosong; pause loop saat tidak ada materi yang dapat dianimasikan untuk mengurangi kerja per frame.

## Validasi yang dijalankan

| Perintah | Hasil |
| --- | --- |
| npm test | 15 test suites, 265/265 tes lulus |
| npm run typecheck | Lulus seluruh workspace |
| npm run build | Lulus (Vite menghasilkan CSS 127.70 kB dan JS 453.21 kB sebelum gzip) |
| git status --short --branch pada awal audit | Branch simple; tidak ada perubahan kerja |

Build menghasilkan dua warning nonfatal akibat anotasi pure pada dependensi Zod. Belum ada pengujian actual frame lewat browser/vMix/OBS, tes ARIA penuh, atau tes jaringan terputus di komputer operator. Semua P1 yang bersifat kondisi deployment perlu divalidasi di lingkungan produksi target.

## Rencana implementasi yang disarankan

1. **Batch 1, keamanan operasional dan integritas materi:** batasi akses origin/API; authz; version conflict pada saveStory/cue; perbaiki master yang terikat ticker; bypass PATCH bila cue bersih; dirty guard.
2. **Batch 2, output dan reliability:** instrumentasi stream stale/ACK, backup & restore, readiness, single-node topology yang eksplisit, pengujian safe area, atomic UPDATE.
3. **Batch 3, ergonomi dan maintainability:** responsif UI, aksesibilitas, retensi data, optimasi query, sinkronisasi selected cue, dokumentasi deployment dan metrik.

## Skenario penerimaan wajib sebelum siaran

1. Operator A sedang menayangkan cue A. Operator B memilih rundown B, mengubah warna/logo tanpa mengganti ticker: perubahan master yang sah berhasil tanpa memindah ticker atau mengubah CG.
2. TAKE cue yang sudah tersimpan ketika endpoint PATCH sengaja dibuat gagal: live request tetap terkirim karena tidak ada perubahan yang perlu disimpan.
3. Dua operator mengedit berita sama dari snapshot berbeda: tambahan G3 milik A tidak hilang diam-diam akibat simpan form B; terjadi konflik yang dapat ditangani.
4. TAKE lalu putuskan EventSource di browser output; lakukan CLEAR ALL di server: operator menerima status STALE dan kebijakan failover yang dipilih terbukti.
5. Simulasikan restart, hilangnya volume, backup, dan restore pada data plus logo; startup harus mendeteksi kondisi berbahaya dan tidak diam-diam membuat DB produksi kosong.
6. Periksa screenshot/capture 1920x1080 pada headline pendek/panjang, REPORTER, SOT, LOCATION, BREAKING, ticker dan logo dengan overlay safe area yang konsisten.
7. Uji tombol cepat di resolusi desktop rendah, navigasi keyboard/dialog, reload saat draft belum disimpan, serta akses tidak sah ke semua endpoint mutasi.

## Literatur pendukung evaluasi UX

1. Endsley, M. R. (1995). Toward a Theory of Situation Awareness in Dynamic Systems. *Human Factors*, 37(1), 32-64. DOI: https://doi.org/10.1518/001872095779049543. Relevansi: operator membutuhkan representasi status aktual dan stale secara jelas.
2. Parasuraman, R., Sheridan, T. B., & Wickens, C. D. (2000). A Model for Types and Levels of Human Interaction with Automation. *IEEE Transactions on Systems, Man, and Cybernetics - Part A*, 30(3), 286-297. DOI: https://doi.org/10.1109/3468.844354. Relevansi: otomasi perintah live harus memberikan kontrol dan umpan balik yang sesuai risiko.
3. Hornbæk, K. (2006). Current practice in measuring usability: Challenges to usability studies and research. *International Journal of Human-Computer Studies*, 64(2), 79-102. DOI: https://doi.org/10.1016/j.ijhcs.2005.06.002. Relevansi: audit statis perlu dilengkapi tugas operator nyata, metrik waktu, kesalahan, dan kepuasan.
