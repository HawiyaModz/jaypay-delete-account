# NOKOS STORE — Nokos Pusat API (Vercel)

Versi ini mengganti integrasi OTPInstan menjadi REST API Nokos Pusat. Frontend tetap memakai desain NOKOS STORE bergaya brutalism dan backend berjalan sebagai Vercel Serverless Function.

## Deploy ke Vercel
1. Unggah isi folder ini ke root repository GitHub: `api/`, `public/`, `package.json`, `vercel.json`, `.env.example`, dan `README.md`.
2. Import repository ke Vercel dengan Root Directory `./`.
3. Di **Project → Settings → Environment Variables**, buat `NOKOS_API_KEY` berisi API key dari https://nokospusat.com/dashboard/api.
4. Redeploy setelah menambahkan variable.
5. Uji `https://DOMAIN-VERCEL-ANDA/api/health`; hasil yang benar memiliki `ok: true`, `configured: true`, dan `provider: "Nokos Pusat"`.

## Fitur
- Baca saldo workspace melalui `GET /api/v1/wallet`.
- Katalog layanan, wilayah per provider, dan penawaran server terbaru.
- Pembelian memakai `quoted_price` dan `Idempotency-Key`.
- Polling status dan OTP, riwayat, permintaan pembatalan, OTP berikutnya jika didukung, dan penutupan aktivasi.
- Kunci API hanya berada di environment server, tidak dikirim ke browser.

## Catatan transaksi
- Pembelian memotong saldo sungguhan. UI meminta konfirmasi sebelum checkout.
- Jika harga berubah, muat ulang penawaran lalu konfirmasi harga baru.
- Jika request pembelian timeout atau mendapat `allocation_uncertain`, periksa riwayat pesanan dan jangan membuat pembelian pengganti. Retry transaksi yang sama harus memakai `Idempotency-Key` yang sama.
- Polling detail berjalan tiap 5 detik; respons `Retry-After`/`status_check_pending` perlu dihormati.
- Pembatalan tidak menjamin refund. Menutup aktivasi bersifat permanen dan tidak memberi refund.
- Fitur frontend ini merupakan panel operasional sederhana. Belum ada akun pelanggan, database order lokal, sistem pembayaran/top-up pelanggan, atau pembatasan akses admin.

Dokumentasi: https://nokospusat.com/docs/api
