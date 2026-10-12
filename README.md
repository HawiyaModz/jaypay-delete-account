# NOKOS STORE — Vercel deployment

Frontend NOKOS STORE dan backend API Express yang diekspor sebagai Vercel Node.js Function.

## Deploy lewat GitHub → Vercel

1. Upload seluruh isi folder ini ke root repository GitHub (bukan folder pembungkus ZIP).
2. Di Vercel, pilih Add New → Project, lalu import repository.
3. Framework Preset: Other.
4. Di Project Settings → Environment Variables, tambahkan:
   - Name: `OTPINSTAN_API_KEY`
   - Value: API key reseller OTPInstan milik Anda
   - Environment: Production (tambahkan Preview bila dibutuhkan)
5. Deploy.
6. Uji `/api/health`, lalu `/api/services?server=wa`.

## Catatan penting
- Tidak ada `app.listen()` karena Vercel menjalankan `api/index.js` sebagai serverless function.
- Tidak perlu mengatur PORT di Vercel.
- API key tidak boleh dimasukkan ke frontend atau repository.
- Endpoint mengikuti dokumentasi OTPInstan yang diberikan. Struktur katalog server 1–5 mungkin perlu penyesuaian sesuai respons aktual provider.
- Ini belum menambahkan login pelanggan, database saldo pelanggan, atau payment gateway.
- Sebelum toko publik menerima pembayaran, tambahkan autentikasi, rate limiting, dan validasi kepemilikan order.
