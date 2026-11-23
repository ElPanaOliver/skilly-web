// Skilly - cliente de Transbank Webpay Plus (API REST v1.2), sin dependencias externas.
//
// Modos (variable de entorno TBK_MODE):
//   integracion (por defecto) -> ambiente de pruebas real de Transbank (webpay3gint.transbank.cl).
//                                Usa las credenciales públicas de integración; no se cobra dinero.
//   produccion                -> Webpay real. Exige TBK_COMMERCE_CODE y TBK_API_SECRET propios.
//   simulado                  -> pasarela local de Skilly, sin internet (para demos sin conexión).
//
// Flujo Webpay Plus:  create -> redirigir al navegador a "url" con token_ws -> Transbank vuelve a
// return_url -> commit(token) confirma el pago desde el SERVIDOR (nunca se confía en el navegador).
const https = require('https'), http = require('http'), crypto = require('crypto');

const MODE = (process.env.TBK_MODE || 'integracion').toLowerCase();
const INTEGRATION = {
  host: 'https://webpay3gint.transbank.cl',
  code: '597055555532',
  secret: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C'
};
const PRODUCTION_HOST = 'https://webpay3g.transbank.cl';
const API = '/rswebpaytransaction/api/webpay/v1.2/transactions';

if (!['integracion', 'produccion', 'simulado'].includes(MODE)) throw new Error('TBK_MODE inválido: ' + MODE);
if (MODE === 'produccion' && !(process.env.TBK_COMMERCE_CODE && process.env.TBK_API_SECRET))
  throw new Error('TBK_MODE=produccion requiere TBK_COMMERCE_CODE y TBK_API_SECRET');

const cfg = MODE === 'produccion'
  ? { host: PRODUCTION_HOST, code: process.env.TBK_COMMERCE_CODE, secret: process.env.TBK_API_SECRET }
  : { ...INTEGRATION };
// TBK_BASE_URL solo sirve para pruebas automáticas contra un servidor falso
if (process.env.TBK_BASE_URL) cfg.host = process.env.TBK_BASE_URL;

// ---- Llamada HTTP a Transbank ----
function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(cfg.host + path), data = body ? JSON.stringify(body) : null;
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, {
      method, timeout: 15000,
      headers: {
        'Tbk-Api-Key-Id': cfg.code, 'Tbk-Api-Key-Secret': cfg.secret,
        'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = {}; try { json = raw ? JSON.parse(raw) : {}; } catch { /* respuesta no JSON */ }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        reject(Object.assign(new Error('Transbank respondió ' + res.statusCode + (json.error_message ? ': ' + json.error_message : '')),
          { tbkStatus: res.statusCode }));
      });
    });
    req.on('timeout', () => req.destroy(new Error('Transbank no respondió a tiempo')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---- Pasarela simulada (modo "simulado") ----
// Tarjetas de prueba, iguales a las del ambiente de integración de Transbank.
const SIM_CARDS = {
  '4051885600446623': { ok: true, type: 'VN', label: 'VISA crédito' },
  '5186059559590568': { ok: false, type: 'VN', label: 'MasterCard crédito (rechazada)' },
  '4051884239937763': { ok: true, type: 'VD', label: 'Redcompra débito' }
};
const sims = new Map(); // token -> transacción simulada (solo en memoria)
const SIM_TTL = 20 * 60e3;
const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000Z`;

function simCreate({ buyOrder, sessionId, amount, returnUrl, publicUrl }) {
  for (const [t, s] of sims) if (Date.now() - s.created > SIM_TTL) sims.delete(t);
  const token = crypto.randomBytes(32).toString('hex');
  sims.set(token, { token, buyOrder, sessionId, amount, returnUrl, created: Date.now(), decision: null, committed: false });
  return { token, url: publicUrl + '/pasarela-simulada' };
}
const simInfo = token => {
  const s = sims.get(token);
  return s && !s.committed ? { orden: s.buyOrder, monto: s.amount } : null;
};
// La persona elige pagar con una tarjeta o anular; devuelve a dónde volver (igual que Transbank)
function simDecide(token, { card, cancel }) {
  const s = sims.get(token);
  if (!s || s.committed || s.decision) throw Object.assign(new Error('Transacción no disponible'), { code: 400 });
  if (cancel) {
    s.decision = { aborted: true };
    const q = new URLSearchParams({ TBK_TOKEN: token, TBK_ORDEN_COMPRA: s.buyOrder, TBK_ID_SESION: s.sessionId });
    return { redirect: s.returnUrl + '?' + q };
  }
  const digits = String(card || '').replace(/\D/g, ''), c = SIM_CARDS[digits];
  s.decision = { ok: !!(c && c.ok), type: c ? c.type : 'VN', last4: digits.slice(-4) || '0000' };
  return { redirect: s.returnUrl + '?' + new URLSearchParams({ token_ws: token }) };
}
function simCommit(token) {
  const s = sims.get(token);
  if (!s || s.committed || !s.decision || s.decision.aborted) throw Object.assign(new Error('Transacción simulada no válida'), { tbkStatus: 422 });
  s.committed = true;
  const now = new Date(), d = s.decision;
  return {
    vci: 'TSY', amount: s.amount, status: d.ok ? 'AUTHORIZED' : 'FAILED', buy_order: s.buyOrder, session_id: s.sessionId,
    card_detail: { card_number: d.last4 }, accounting_date: pad(now.getMonth() + 1) + pad(now.getDate()),
    transaction_date: stamp(now), authorization_code: d.ok ? String(Math.floor(100000 + Math.random() * 900000)) : '000000',
    payment_type_code: d.type, response_code: d.ok ? 0 : -1, installments_number: 0
  };
}

// ---- API pública del módulo ----
async function create({ buyOrder, sessionId, amount, returnUrl, publicUrl }) {
  if (MODE === 'simulado') return simCreate({ buyOrder, sessionId, amount, returnUrl, publicUrl });
  const r = await call('POST', API, { buy_order: buyOrder, session_id: sessionId, amount, return_url: returnUrl });
  if (!r.token || !r.url) throw new Error('Transbank no entregó token');
  return { token: r.token, url: r.url };
}
async function commit(token) {
  if (MODE === 'simulado') return simCommit(token);
  return call('PUT', API + '/' + encodeURIComponent(token));
}
async function status(token) {
  if (MODE === 'simulado') return { status: sims.get(token) ? 'SIMULATED' : 'UNKNOWN' };
  return call('GET', API + '/' + encodeURIComponent(token));
}
// Reembolso total o parcial. Transbank decide si es "reversa" o "anulación" según el momento.
async function refund(token, amount) {
  if (MODE === 'simulado') return { type: 'SIMULATED', response_code: 0 };
  return call('POST', API + '/' + encodeURIComponent(token) + '/refunds', { amount });
}

module.exports = { MODE, create, commit, status, refund, simInfo, simDecide, SIM_CARDS };
