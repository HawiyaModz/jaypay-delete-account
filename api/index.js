require('dotenv').config();
const express = require('express');
const app = express();
const API_KEY = process.env.NOKOS_API_KEY;
const BASE = 'https://nokospusat.com/api/v1';

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

function requireKey(_req, res, next) {
  if (!API_KEY || API_KEY === 'ISI_API_KEY_ANDA') {
    return res.status(503).json({ error: { code: 'API_KEY_NOT_CONFIGURED', message: 'API key Nokos Pusat belum dipasang di Environment Variables Vercel (NOKOS_API_KEY).' } });
  }
  next();
}

async function upstream(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: { code: 'INVALID_UPSTREAM_RESPONSE', message: raw.slice(0, 300) } }; }
    if (!response.ok) {
      const err = new Error(data?.error?.message || data?.message || `Nokos Pusat HTTP ${response.status}`);
      err.status = response.status;
      err.payload = data;
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) err.retryAfter = retryAfter;
      throw err;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function fail(res, err) {
  console.error('Nokos Pusat API error:', err.message);
  if (err.retryAfter) res.set('Retry-After', err.retryAfter);
  res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json(
    err.payload || { error: { code: err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'PROVIDER_ERROR', message: err.name === 'AbortError' ? 'Nokos Pusat tidak merespons tepat waktu. Coba lagi nanti.' : (err.message || 'Gagal menghubungi Nokos Pusat.') } }
  );
}

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(API_KEY && API_KEY !== 'ISI_API_KEY_ANDA'), provider: 'Nokos Pusat' }));

app.get('/api/balance', requireKey, async (_req, res) => {
  try { res.json(await upstream('/wallet')); } catch (err) { fail(res, err); }
});

app.get('/api/services', requireKey, async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const key of ['q', 'category', 'page', 'limit']) {
      const value = req.query[key];
      if (value !== undefined && String(value).trim() !== '') qs.set(key, String(value).trim());
    }
    res.json(await upstream(`/services${qs.size ? `?${qs}` : ''}`));
  } catch (err) { fail(res, err); }
});

app.get('/api/services/:serviceId/countries', requireKey, async (req, res) => {
  try {
    const provider = String(req.query.provider || 'provider_1');
    if (!/^provider_[1-5]$/.test(provider)) return res.status(400).json({ error: { code: 'INVALID_PROVIDER', message: 'Pilih provider_1 sampai provider_5.' } });
    res.json(await upstream(`/services/${encodeURIComponent(req.params.serviceId)}/countries?provider=${encodeURIComponent(provider)}`));
  } catch (err) { fail(res, err); }
});

app.get('/api/services/:serviceId/offers', requireKey, async (req, res) => {
  try {
    const provider = String(req.query.provider || 'provider_1');
    const countryCode = String(req.query.country_code || '');
    if (!/^provider_[1-5]$/.test(provider)) return res.status(400).json({ error: { code: 'INVALID_PROVIDER', message: 'Pilih provider_1 sampai provider_5.' } });
    if (!countryCode) return res.status(400).json({ error: { code: 'COUNTRY_REQUIRED', message: 'Pilih wilayah terlebih dahulu.' } });
    res.json(await upstream(`/services/${encodeURIComponent(req.params.serviceId)}/offers?provider=${encodeURIComponent(provider)}&country_code=${encodeURIComponent(countryCode)}`));
  } catch (err) { fail(res, err); }
});

app.post('/api/orders', requireKey, async (req, res) => {
  const { service_id, provider = 'provider_1', country_code, provider_id, quoted_price } = req.body || {};
  const idempotencyKey = String(req.get('Idempotency-Key') || '');
  if (!service_id || !provider_id || !country_code || !/^provider_[1-5]$/.test(String(provider)) || !Number.isInteger(Number(quoted_price)) || Number(quoted_price) < 0) {
    return res.status(400).json({ error: { code: 'INVALID_ORDER_PARAMS', message: 'Pilih layanan, provider, wilayah, dan penawaran server yang valid.' } });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Kunci transaksi tidak valid. Muat ulang halaman lalu coba kembali.' } });
  }
  try {
    res.json(await upstream('/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ service_id: String(service_id), provider: String(provider), country_code: String(country_code), provider_id: String(provider_id), quoted_price: Number(quoted_price) })
    }));
  } catch (err) { fail(res, err); }
});

app.get('/api/orders/:id', requireKey, async (req, res) => {
  try { res.json(await upstream(`/orders/${encodeURIComponent(req.params.id)}`)); } catch (err) { fail(res, err); }
});
app.get('/api/history', requireKey, async (req, res) => {
  try {
    const qs = new URLSearchParams();
    for (const key of ['page', 'limit', 'status', 'service_id', 'q', 'from', 'to']) if (req.query[key] !== undefined) qs.set(key, String(req.query[key]));
    res.json(await upstream(`/orders${qs.size ? `?${qs}` : ''}`));
  } catch (err) { fail(res, err); }
});
app.delete('/api/orders/:id', requireKey, async (req, res) => {
  try { res.json(await upstream(`/orders/${encodeURIComponent(req.params.id)}`, { method: 'DELETE' })); } catch (err) { fail(res, err); }
});
app.post('/api/orders/:id/request-otp', requireKey, async (req, res) => {
  try { res.json(await upstream(`/orders/${encodeURIComponent(req.params.id)}/request-otp`, { method: 'POST' })); } catch (err) { fail(res, err); }
});
app.post('/api/orders/:id/finish', requireKey, async (req, res) => {
  try { res.json(await upstream(`/orders/${encodeURIComponent(req.params.id)}/finish`, { method: 'POST' })); } catch (err) { fail(res, err); }
});

module.exports = app;
