require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
// Port otomatis mengikuti environment hosting (Pterodactyl/cPanel/VPS).
// PORT biasanya diisi oleh panel. Jika tidak tersedia, gunakan 3000.
const API_KEY = process.env.OTPINSTAN_API_KEY;

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const SERVERS = {
  s1: { label: 'Server 1', base: 'https://otpinstan.com/api/reseller/s1/', type: 'platform' },
  s2: { label: 'Server 2', base: 'https://otpinstan.com/api/reseller/', type: 'platform' },
  s3: { label: 'Server 3', base: 'https://otpinstan.com/api/reseller/s3/', type: 'platform' },
  s4: { label: 'Server 4', base: 'https://otpinstan.com/api/reseller/s9/', type: 'platform' },
  s5: { label: 'Server 5', base: 'https://otpinstan.com/api/reseller/s5/', type: 'platform' },
  wa: { label: 'Server WA', base: 'https://otpinstan.com/api/reseller/wa/', type: 'service' }
};
const SHARED = 'https://otpinstan.com/api/reseller/';

function requireKey(req, res, next) {
  if (!API_KEY || API_KEY === 'ISI_API_KEY_ANDA') {
    return res.status(503).json({ error: 'API_KEY_NOT_CONFIGURED', message: 'API key belum dipasang di file .env server.' });
  }
  next();
}

async function upstream(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'X-Api-Key': API_KEY, ...(options.headers || {}) }
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 500) }; }
    if (!response.ok) {
      const error = new Error(data.message || `API provider HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function sendApiError(res, err) {
  console.error('OTPInstan request failed:', err.message);
  res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 502).json({
    error: err.data?.error_code || 'PROVIDER_ERROR',
    message: err.name === 'AbortError' ? 'Provider tidak merespons tepat waktu. Coba lagi.' : (err.data?.message || err.message || 'Gagal menghubungi provider.')
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, configured: Boolean(API_KEY && API_KEY !== 'ISI_API_KEY_ANDA') }));

app.get('/api/servers', (_req, res) => {
  res.json({ data: Object.entries(SERVERS).map(([id, s]) => ({ id, name: s.label, type: s.type })) });
});

app.get('/api/balance', requireKey, async (_req, res) => {
  try {
    const data = await upstream(`${SHARED}balance.php`);
    res.json(data);
  } catch (err) { sendApiError(res, err); }
});

app.get('/api/services', requireKey, async (req, res) => {
  const server = SERVERS[String(req.query.server || 'wa').toLowerCase()];
  if (!server) return res.status(400).json({ error: 'INVALID_SERVER', message: 'Server tidak dikenal.' });
  try {
    const data = await upstream(`${server.base}services.php`);
    res.json({ ...data, server: server.label, serverType: server.type });
  } catch (err) { sendApiError(res, err); }
});

app.post('/api/orders', requireKey, async (req, res) => {
  const server = SERVERS[String(req.body.server || 'wa').toLowerCase()];
  if (!server) return res.status(400).json({ error: 'INVALID_SERVER', message: 'Server tidak dikenal.' });
  let body;
  let headers = {};
  if (server.type === 'service') {
    const serviceId = Number(req.body.service_id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(400).json({ error: 'INVALID_SERVICE', message: 'Pilih layanan yang valid.' });
    }
    body = new URLSearchParams({ service_id: String(serviceId) });
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else {
    const platformId = Number(req.body.platform_id);
    const countryId = Number(req.body.country_id);
    if (!Number.isInteger(platformId) || platformId <= 0 || !Number.isInteger(countryId) || countryId <= 0) {
      return res.status(400).json({ error: 'INVALID_PARAMS', message: 'Server ini membutuhkan Platform ID dan Country ID.' });
    }
    body = JSON.stringify({ platform_id: platformId, country_id: countryId });
    headers['Content-Type'] = 'application/json';
  }
  try {
    const data = await upstream(`${server.base}order.php`, { method: 'POST', headers, body });
    res.json(data);
  } catch (err) { sendApiError(res, err); }
});

app.get('/api/orders/:server/:orderId', requireKey, async (req, res) => {
  const server = SERVERS[String(req.params.server).toLowerCase()];
  if (!server) return res.status(400).json({ error: 'INVALID_SERVER', message: 'Server tidak dikenal.' });
  const orderId = String(req.params.orderId);
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(orderId)) return res.status(400).json({ error: 'INVALID_ORDER_ID', message: 'Order ID tidak valid.' });
  try {
    const data = await upstream(`${server.base}check.php?order_id=${encodeURIComponent(orderId)}`);
    res.json(data);
  } catch (err) { sendApiError(res, err); }
});

async function orderAction(req, res, action) {
  const server = SERVERS[String(req.body.server || '').toLowerCase()];
  const orderId = String(req.body.order_id || '');
  if (!server) return res.status(400).json({ error: 'INVALID_SERVER', message: 'Server tidak dikenal.' });
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(orderId)) return res.status(400).json({ error: 'INVALID_ORDER_ID', message: 'Order ID tidak valid.' });
  try {
    const data = await upstream(`${server.base}${action}.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ order_id: orderId })
    });
    res.json(data);
  } catch (err) { sendApiError(res, err); }
}
app.post('/api/orders/resend', requireKey, (req, res) => orderAction(req, res, 'resend'));
app.post('/api/orders/cancel', requireKey, (req, res) => orderAction(req, res, 'cancel'));

app.get('/api/history', requireKey, async (_req, res) => {
  try {
    res.json(await upstream(`${SHARED}history.php`));
  } catch (err) { sendApiError(res, err); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const httpServer = module.exports = app; // Vercel menjalankan Express sebagai serverless function.
