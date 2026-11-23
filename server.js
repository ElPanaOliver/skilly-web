// Skilly - servidor sin dependencias. Ejecutar: node server.js  -> http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const store = require('./database');
const webpay = require('./webpay');   // Transbank Webpay Plus (ver webpay.js y TRANSBANK.md)

// ---- Configuración (variables de entorno opcionales) ----
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';         // solo esta PC. Usa HOST=0.0.0.0 para la red local
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1'; // ponlo en 1 cuando sirvas la web por HTTPS
const PUBLIC = path.join(__dirname, 'public');
const MAX_BODY = 100 * 1024;                           // 100 KB máximo por solicitud
const ADMIN_PASSWORD = 'SkillyAdmin2026';             // clave predeterminada del admin (admin@skilly.cl)
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:' + PORT).replace(/\/$/, ''); // URL a la que Transbank devuelve al cliente
const PAY_MINUTES = 20;                               // tiempo máximo para completar un pago antes de liberar el bloque
const SESSION_HOURS = 12;
const COOKIE = 'skilly_sid';
const LOGIN_MAX = 10, LOGIN_WINDOW = 15 * 60e3;
const REASONS = ['El profesional no se presentó', 'El servicio no cumplió lo acordado',
  'Calidad insuficiente del trabajo', 'El profesional llegó tarde o terminó antes', 'Otro motivo'];

let db;
const save = () => store.save(db);
const E = (c, m) => Object.assign(new Error(m), { code: c });
const pub = u => { const { pass, ...r } = u; return r; };
const hrsTo = b => new Date(b.date + 'T' + String(b.start).padStart(2, '0') + ':00').getTime();

// ---- Criptografía ----
const uid = () => crypto.randomBytes(5).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex'); // 48 hex: cabe en sesiones.token
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const legacyHash = p => crypto.scryptSync(p, 'skilly', 32).toString('hex'); // formato antiguo (sal fija)
// Formato actual: s2$N$r$p$sal$hash (parámetros guardados junto al hash para poder subirlos en el futuro)
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const scryptHex = (pw, salt, N, r, p) => crypto.scryptSync(pw, salt, 64, { N, r, p, maxmem: SCRYPT.maxmem }).toString('hex');
function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  return ['s2', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt, scryptHex(p, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p)].join('$');
}
function checkPass(p, stored) {
  if (typeof p !== 'string' || typeof stored !== 'string' || p.length > 1024) return false;
  if (stored.startsWith('s2$')) {
    const [, N, r, pa, salt, h] = stored.split('$');
    try { return safeEq(scryptHex(p, salt, +N, +r, +pa), h); } catch { return false; }
  }
  if (stored.includes(':')) { const [salt, h] = stored.split(':'); return safeEq(crypto.scryptSync(p, salt, 32).toString('hex'), h); } // v1
  return safeEq(legacyHash(p), stored); // cuentas muy antiguas
}
const needsRehash = stored => !String(stored).startsWith('s2$' + SCRYPT.N + '$' + SCRYPT.r + '$' + SCRYPT.p + '$');
const DUMMY = hashPass('clave-que-nadie-usa'); // para igualar tiempos cuando el correo no existe

// ---- Validaciones ----
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const mail = v => { const e = str(v, 150).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw E(400, 'Correo no válido'); return e; };
const emailTaken = e => db.users.some(u => (u.email || '').toLowerCase() === e);
const intIn = (v, min, max, msg) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? +v : NaN);
  if (!Number.isInteger(n) || n < min || n > max) throw E(400, msg || 'Valor fuera de rango');
  return n;
};
const money = v => { const n = v === '' || v == null ? 0 : Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw E(400, 'Tarifa no válida'); return Math.round(n); };
// Contraseñas comunes que nunca se aceptan (se compara sin distinguir mayúsculas ni símbolos finales)
const COMMON_PW = new Set(['password','contrasena','clave','qwerty','abc','admin','welcome','skillycl','empresa','trabajo','chile','colocolo','pass','contraseña','12345678','123456789','1234567890','qwertyuiop','qwerty123',
  'admin123','skilly','skilly123','iloveyou','abc12345','chile123','santiago','bienvenido','welcome1','letmein123','passw0rd']);
function passwordIssues(v, ctx = {}) {
  const out = [];
  if (typeof v !== 'string') return ['Contraseña no válida'];
  if (v.length < 10) out.push('al menos 10 caracteres');
  if (v.length > 128) out.push('máximo 128 caracteres');
  if (!/[a-z]/.test(v)) out.push('una minúscula');
  if (!/[A-Z]/.test(v)) out.push('una mayúscula');
  if (!/\d/.test(v)) out.push('un número');
  if (!/[^A-Za-z0-9]/.test(v)) out.push('un símbolo (por ejemplo ! ? # $ %)');
  if (/\s/.test(v)) out.push('sin espacios');
  const low = v.toLowerCase();
  if (COMMON_PW.has(low) || COMMON_PW.has(low.replace(/[^a-zñ]+$/g, '').replace(/^[^a-zñ]+/, '')) || /^(.)\1+$/.test(v)) out.push('no ser una contraseña común');
  else if (/(.)\1{3,}/.test(v)) out.push('sin 4 o más caracteres iguales seguidos');
  else if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(v)) out.push('sin secuencias como 1234 o abcd');
  const local = (ctx.email || '').split('@')[0];
  if (local.length >= 4 && low.includes(local)) out.push('no contener tu correo');
  const digits = (ctx.rut || '').replace(/\D/g, '');
  if (digits.length >= 6 && v.replace(/\D/g, '').includes(digits.slice(0, -1))) out.push('no contener tu RUT');
  const nm = (ctx.name || '').toLowerCase().split(/\s+/).filter(w => w.length >= 5);
  if (nm.some(w => low.includes(w))) out.push('no contener tu nombre');
  return out;
}
function password(v, ctx) {
  const bad = passwordIssues(v, ctx);
  if (bad.length) throw E(400, 'La contraseña debe tener: ' + bad.join(', '));
  return v;
}

// ---- RUT chileno: módulo 11 ----
function rutDv(body) {
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += +body[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
// Devuelve { clean: '123456785', pretty: '12.345.678-5' } o null si no es válido
function parseRut(v) {
  if (typeof v !== 'string') return null;
  const c = v.replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(c)) return null;
  const body = c.slice(0, -1), dv = c.slice(-1);
  if (+body < 1000000 || /^(\d)\1+$/.test(body)) return null; // rango real y sin RUT de relleno (11.111.111, etc.)
  if (rutDv(body) !== dv) return null;
  return { clean: c, pretty: body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv };
}
function rutOf(v, label = 'RUT') {
  const r = parseRut(v);
  if (!r) throw E(400, label + ' no válido: revisa el número y el dígito verificador');
  if (db.users.some(u => u.rut && (parseRut(u.rut) || {}).clean === r.clean)) throw E(400, 'Ese ' + label + ' ya está registrado');
  return r.pretty;
}
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00'));
function linkedin(v) {
  let s = str(v, 200);
  if (!s) throw E(400, 'Perfil de LinkedIn obligatorio (linkedin.com/in/...)');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/^http:\/\//i, 'https://');
  if (!/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-.%]+\/?$/i.test(s)) throw E(400, 'Perfil de LinkedIn no válido (linkedin.com/in/...)');
  return s;
}

// ---- Sesiones y límite de intentos ----
const fails = new Map();
const LOGIN_MAX_ACCOUNT = 5; // intentos fallidos por cuenta (frena ataques repartidos entre varias IP)
function limitLogin(...keys) {
  for (const k of keys) {
    const r = fails.get(k), max = k.startsWith('acc:') ? LOGIN_MAX_ACCOUNT : LOGIN_MAX;
    if (r && Date.now() - r.t < LOGIN_WINDOW && r.n >= max) throw E(429, 'Demasiados intentos. Espera 15 minutos.');
  }
}
function failLogin(...keys) {
  const now = Date.now();
  for (const k of keys) {
    let r = fails.get(k);
    if (!r || now - r.t >= LOGIN_WINDOW) r = { n: 0, t: now };
    r.n++; fails.set(k, r);
  }
}
setInterval(() => { const now = Date.now(); for (const [k, r] of fails) if (now - r.t >= LOGIN_WINDOW) fails.delete(k); }, 60e3).unref();
function cookieOf(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([a-f0-9]{48})(?:;|$)'));
  return m ? m[1] : '';
}
function startSession(u, ctx) {
  const t = newToken();
  db.sessions[t] = u.id; save();
  ctx.setCookie = `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${COOKIE_SECURE ? '; Secure' : ''}`;
  return { user: pub(u) };
}
function login(em, pw, ctx) {
  const mailN = typeof em === 'string' ? em.trim().toLowerCase().slice(0, 150) : '';
  const accKey = 'acc:' + mailN;
  limitLogin(ctx.ip, accKey);
  const u = db.users.find(x => (x.email || '').toLowerCase() === mailN);
  const ok = checkPass(pw, u ? u.pass : DUMMY);
  if (!u || !ok) { failLogin(ctx.ip, accKey); throw E(401, 'Credenciales inválidas'); }
  if (u.status === 'baja') throw E(403, 'Cuenta dada de baja');
  if (needsRehash(u.pass)) u.pass = hashPass(pw); // migrar a la forma de cifrado actual
  fails.delete(ctx.ip); fails.delete(accKey);
  return startSession(u, ctx);
}

// ---- Reglas de negocio ----
const isCli = u => !!u && (u.role === 'empresa' || u.role === 'cliente');
function needCli(me) { if (!isCli(me)) throw E(403, 'No autorizado'); }
function need(me, r) { if (!me || me.role !== r) throw E(403, 'No autorizado'); }
function bk(id) { const k = db.bookings.find(x => x.id === id); if (!k) throw E(404, 'Reserva no existe'); return k; }
function mine(k, me) { if (k.companyId !== me.id && k.proId !== me.id) throw E(403, 'No autorizado'); }
// El secreto de un invitado solo vive en memoria: nunca se expone en respuestas de lectura
function enrich(b) {
  const { secret, ...rest } = b;
  const blk = db.blocks.find(x => x.id === b.blockId), pro = db.users.find(x => x.id === b.proId);
  return { ...rest, block: blk, proName: pro && pro.name };
}
function closeClaims(bid, how) {
  db.claims.filter(c => c.bookingId === bid && c.status === 'abierto').forEach(c => { c.status = 'resuelto'; c.how = how; c.closed = Date.now(); });
}

const routes = {
  'POST /api/register': (q, b, me, ctx) => {
    limitLogin(ctx.ip);
    if (!['empresa', 'profesional'].includes(b.role)) throw E(400, 'Rol no válido'); // ya no se registran personas sueltas
    const name = str(b.name, 120); if (!name) throw E(400, 'Falta el nombre');
    const em = mail(b.email);
    if (emailTaken(em)) throw E(400, 'Correo ya registrado');
    const rut = rutOf(b.rut, b.role === 'empresa' ? 'RUT de la empresa' : 'RUT');
    const pw = password(b.password, { email: em, rut, name });
    if (b.password2 !== undefined && b.password2 !== pw) throw E(400, 'Las contraseñas no coinciden');
    const u = { id: uid(), role: b.role, email: em, name, pass: hashPass(pw), phone: str(b.phone, 30), rut };
    if (u.role === 'empresa') Object.assign(u, { contacto: str(b.contacto, 120), industria: str(b.industria, 120) });
    else {
      if (b.terms !== true) throw E(400, 'Debes aceptar reunirte con Skilly (T&C)');
      Object.assign(u, { linkedin: linkedin(b.linkedin), categoria: str(b.categoria, 80),
        anios: intIn(b.anios || 0, 0, 80, 'Años de trayectoria no válidos'), rate: money(b.rate),
        rateStatus: 'propuesta', status: 'pendiente', interviews: 0, strikes: 0 });
    }
    db.users.push(u); save();
    return startSession(u, ctx);
  },
  'POST /api/login': (q, b, me, ctx) => login(b.email, b.password, ctx),
  'POST /api/logout': (q, b, me, ctx) => {
    if (ctx.tok) { delete db.sessions[ctx.tok]; save(); }
    ctx.setCookie = `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`;
    return { ok: 1 };
  },
  'GET /api/me': (q, b, me) => ({ user: pub(me) }),
  'GET /api/config': () => db.config,
  'GET /api/pros': () => db.users.filter(u => u.role === 'profesional' && u.status === 'activo' && u.rateStatus === 'acordada')
    .map(u => ({ id: u.id, name: u.name, categoria: u.categoria, anios: u.anios, rate: u.rate,
      blocks: db.blocks.filter(b => b.proId === u.id && !b.taken && hrsTo(b) > Date.now()) })),

  // Profesional
  'POST /api/blocks': (q, b, me) => {
    need(me, 'profesional');
    if (!isDate(b.date)) throw E(400, 'Fecha no válida');
    const start = intIn(b.start, 0, 23, 'Hora de inicio no válida');
    const end = intIn(b.end, 1, 24, 'Hora de término no válida');
    if (end <= start || end - start > db.config.maxHours) throw E(400, `Bloque máximo ${db.config.maxHours} horas`);
    if (hrsTo({ date: b.date, start }) <= Date.now()) throw E(400, 'El bloque debe ser en el futuro');
    if (db.blocks.some(x => x.proId === me.id && x.date === b.date && start < x.end && end > x.start)) throw E(400, 'El bloque se solapa con otro');
    db.blocks.push({ id: uid(), proId: me.id, date: b.date, start, end, taken: false }); save();
    return { ok: 1 };
  },
  'GET /api/my/blocks': (q, b, me) => { need(me, 'profesional'); return db.blocks.filter(x => x.proId === me.id); },
  'DELETE /api/blocks': (q, b, me) => {
    need(me, 'profesional');
    const x = db.blocks.find(k => k.id === b.id && k.proId === me.id);
    if (!x || x.taken) throw E(400, 'No se puede eliminar');
    db.blocks = db.blocks.filter(k => k !== x); save(); return { ok: 1 };
  },
  'POST /api/my/rate': (q, b, me) => {
    need(me, 'profesional');
    const u = db.users.find(x => x.id === me.id);
    if (b.accept === true) u.rateStatus = 'acordada';
    else { const r = money(b.rate); if (!r) throw E(400, 'Ingresa una tarifa válida'); u.rate = r; u.rateStatus = 'propuesta'; }
    save(); return pub(u);
  },
  'GET /api/my/boletas': (q, b, me) => { need(me, 'profesional'); return db.boletas.filter(x => x.proId === me.id); },

  // Reservas (empresa, persona o invitado)
  'POST /api/bookings': (q, b, me) => {
    const blk = db.blocks.find(x => x.id === b.blockId);
    const pro = blk && db.users.find(x => x.id === blk.proId && x.status === 'activo' && x.rateStatus === 'acordada');
    if (!blk || blk.taken || !pro || hrsTo(blk) <= Date.now()) throw E(400, 'Bloque no disponible');
    let guest = null;
    if (me) needCli(me);
    else {
      guest = mail(b.guestEmail);
      if (emailTaken(guest)) throw E(401, 'Ese correo tiene cuenta: ingresa para reservar.');
      if (db.bookings.some(x => x.guestEmail === guest && x.status !== 'pendiente_pago' && !(x.status === 'cancelado' && x.refund === undefined))) throw E(401, 'Tu siguiente servicio requiere cuenta. Regístrate como empresa.');
    }
    const hours = blk.end - blk.start, gross = pro.rate * hours, fee = Math.round(gross * db.config.commission / 100);
    blk.taken = true;
    const k = { id: uid(), blockId: blk.id, proId: pro.id, companyId: me ? me.id : null, guestEmail: guest,
      title: str(b.title, 120) || 'Servicio', hours, gross, fee, net: gross - fee, status: 'pendiente_pago',
      rescheduled: false, created: Date.now(), secret: newToken() };
    db.bookings.push(k); save();
    return { ...enrich(k), secret: k.secret };
  },
  // Pago con Webpay Plus. Paso 1: crea la transacción en Transbank y devuelve la URL + token para redirigir al navegador.
  // Solo el dueño de la reserva (o quien tiene el secreto de invitado) puede iniciarla. El pago NO se da por hecho aquí:
  // se confirma en /webpay/retorno con commit() desde el servidor.
  'POST /api/pay/init': async (q, b, me) => {
    const k = bk(b.id);
    const owner = !!me && !!k.companyId && k.companyId === me.id;
    const guestOk = !k.companyId && !!k.secret && typeof b.secret === 'string' && safeEq(b.secret, k.secret);
    if (!owner && !guestOk) throw E(403, 'No autorizado');
    if (k.status !== 'pendiente_pago') throw E(400, 'Esta reserva ya no está pendiente de pago');
    if (!Number.isInteger(k.gross) || k.gross < 50) throw E(400, 'Monto no válido');
    for (const p of db.payments) if (p.bookingId === k.id && p.status === 'iniciada') p.status = 'abandonada'; // solo un intento vivo
    const buyOrder = 'SK' + crypto.randomBytes(8).toString('hex'); // 18 caracteres (Transbank permite hasta 26)
    let r;
    try {
      r = await webpay.create({ buyOrder, sessionId: k.id, amount: k.gross, returnUrl: PUBLIC_URL + '/webpay/retorno', publicUrl: PUBLIC_URL });
    } catch (e) {
      console.error('Webpay create falló:', e.message);
      cancelPending(k); save();
      throw E(502, 'No pudimos conectar con Webpay. Intenta de nuevo en unos minutos.');
    }
    db.payments.push({ id: buyOrder, bookingId: k.id, token: r.token, amount: k.gross, status: 'iniciada', mode: webpay.MODE, created: Date.now() });
    save();
    return { url: r.url, token: r.token };
  },
  // Paso 3 (el navegador ya volvió de Transbank): datos no sensibles del comprobante, buscados por número de orden (aleatorio)
  'GET /api/pay/result': (q) => {
    const p = db.payments.find(x => x.id === String(q.orden || ''));
    if (!p) throw E(404, 'Transacción no encontrada');
    const k = db.bookings.find(x => x.id === p.bookingId) || {};
    return { orden: p.id, estado: p.status, monto: p.amount, titulo: k.title || '', tarjeta: p.last4 || null, autorizacion: p.authCode || null,
      tipoPago: p.paymentType || null, cuotas: p.installments ?? null, fecha: p.txDate || p.created, modo: p.mode,
      bloqueId: k.blockId || null, invitado: !!k.guestEmail };
  },
  'GET /api/my/bookings': (q, b, me) => db.bookings.filter(x => x.companyId === me.id || x.proId === me.id).map(enrich),
  'POST /api/cancel': (q, b, me) => {
    needCli(me); const k = bk(b.id); mine(k, me);
    if (!['agendado', 'pendiente_pago'].includes(k.status)) throw E(400, 'No cancelable');
    const blk = db.blocks.find(x => x.id === k.blockId), late = blk && hrsTo(blk) - Date.now() < 24 * 3600e3;
    const pen = k.escrow && late && me.role === 'empresa' ? Math.round(k.escrow * db.config.penalty / 100) : 0;
    k.refund = (k.escrow || 0) - pen; k.penalty = pen; k.status = 'cancelado'; k.escrow = 0;
    if (blk) blk.taken = false;
    refundWebpay(k);
    save(); return enrich(k);
  },
  'POST /api/reschedule': (q, b, me) => {
    needCli(me); const k = bk(b.id); mine(k, me);
    if (k.rescheduled) throw E(400, 'Solo se puede reagendar una vez');
    if (k.status !== 'agendado') throw E(400, 'No reagendable');
    const nb = db.blocks.find(x => x.id === b.blockId), old = db.blocks.find(x => x.id === k.blockId);
    if (!nb || nb.taken || nb.proId !== k.proId || nb.end - nb.start !== k.hours || hrsTo(nb) <= Date.now())
      throw E(400, 'Bloque inválido (mismo profesional, duración y fecha futura)');
    if (old) old.taken = false;
    nb.taken = true; k.blockId = nb.id; k.rescheduled = true; save();
    return enrich(k);
  },
  'POST /api/confirm': (q, b, me) => {
    if (!isCli(me)) throw E(403, 'Solo el cliente da el veredicto final');
    const k = bk(b.id); mine(k, me);
    if (!['agendado', 'en_disputa'].includes(k.status)) throw E(400, 'No confirmable');
    k.status = 'completado'; k.escrow = 0; closeClaims(k.id, 'cerrado por el cliente (Terminado)');
    db.boletas.push({ id: 'B-' + uid().toUpperCase(), bookingId: k.id, proId: k.proId, monto: k.net, comision: k.fee, fecha: Date.now(), sii: 'manual' });
    save(); return enrich(k);
  },
  'POST /api/dispute': (q, b, me) => {
    needCli(me); const k = bk(b.id); mine(k, me);
    if (k.status !== 'agendado') throw E(400, 'No se puede reportar');
    const reason = str(b.reason, 80);
    if (!REASONS.includes(reason)) throw E(400, 'Elige un motivo válido');
    const detail = str(b.detail, 1000);
    k.status = 'en_disputa'; k.dispute = { reason, detail, date: Date.now() };
    db.claims.push({ id: uid(), bookingId: k.id, companyId: k.companyId, proId: k.proId, reason, detail, date: Date.now(), status: 'abierto' });
    save(); return enrich(k); // el dinero sigue retenido
  },
  'POST /api/feedback': (q, b, me) => {
    needCli(me); const k = bk(b.id); mine(k, me);
    const text = str(b.text, 2000); if (!text) throw E(400, 'Escribe un comentario');
    db.feedback.push({ id: uid(), bookingId: k.id, proId: k.proId, text, fecha: Date.now() }); save();
    return { ok: 1 };
  },

  // Pasarela simulada (solo con TBK_MODE=simulado): lo que Transbank haría en su propia página
  'GET /api/sim/info': q => { if (webpay.MODE !== 'simulado') throw E(404, 'No encontrado'); const i = webpay.simInfo(String(q.token || '')); if (!i) throw E(404, 'Transacción no disponible'); return i; },
  'POST /api/sim/decidir': (q, b) => {
    if (webpay.MODE !== 'simulado') throw E(404, 'No encontrado');
    try { return webpay.simDecide(String(b.token || ''), { card: str(b.card, 30), cancel: !!b.cancel }); }
    catch (e) { throw E(e.code || 400, e.message); }
  },

  // Admin
  'GET /api/admin/overview': (q, b, me) => {
    need(me, 'admin');
    const bs = db.bookings, pros = db.users.filter(u => u.role === 'profesional');
    return {
      empresas: db.users.filter(u => u.role === 'empresa').length, clientes: db.users.filter(u => u.role === 'cliente').length,
      pros: pros.length, activos: pros.filter(p => p.status === 'activo').length, pendientes: pros.filter(p => p.status === 'pendiente').length,
      reservas: bs.length, agendadas: bs.filter(x => x.status === 'agendado').length, completadas: bs.filter(x => x.status === 'completado').length,
      canceladas: bs.filter(x => x.status === 'cancelado').length,
      escrow: bs.reduce((s, x) => s + (x.escrow || 0), 0), comisiones: bs.filter(x => x.status === 'completado').reduce((s, x) => s + x.fee, 0),
      pros_list: pros.map(p => ({ ...pub(p), reclamos: db.claims.filter(c => c.proId === p.id).length, completados: bs.filter(x => x.proId === p.id && x.status === 'completado').length })),
      claims: db.claims.map(c => { const u = db.users.find(x => x.id === c.companyId) || {}; return { ...c, cliente: u.name || 'Invitado', tipo: u.role || 'invitado', pro: (db.users.find(x => x.id === c.proId) || {}).name }; }),
      clientesRep: db.users.filter(isCli).map(u => ({ id: u.id, name: u.name, role: u.role, servicios: bs.filter(x => x.companyId === u.id && x.status === 'completado').length, reclamos: db.claims.filter(c => c.companyId === u.id).length })),
      bookings: bs.map(enrich),
      payments: db.payments.slice().reverse().slice(0, 50).map(p => ({ ...p, token: undefined, servicio: (db.bookings.find(x => x.id === p.bookingId) || {}).title || '' })),
      feedback: db.feedback.map(f => {
        const k = db.bookings.find(x => x.id === f.bookingId) || {}, emp = db.users.find(u => u.id === k.companyId);
        return { ...f, pro: (db.users.find(u => u.id === f.proId) || {}).name, // profesional evaluado
          empresa: emp ? emp.name : (k.guestEmail ? 'Invitado (' + k.guestEmail + ')' : 'Empresa desconocida'), // quien evalúa
          servicio: k.title || '' };
      }),
      config: db.config
    };
  },
  'POST /api/admin/pro': (q, b, me) => {
    need(me, 'admin');
    const u = db.users.find(x => x.id === b.id && x.role === 'profesional');
    if (!u) throw E(404, 'Profesional no existe');
    switch (b.action) {
      case 'interview': if (u.interviews >= 3) throw E(400, 'Máx. 3 entrevistas'); u.interviews++; break;
      case 'approve': if (u.interviews < 1) throw E(400, 'Requiere al menos 1 entrevista'); u.status = 'activo'; break;
      case 'reject': u.status = 'baja'; break;
      case 'strike': u.strikes++; if (u.strikes >= 3) u.status = 'baja'; break;
      case 'rate': { const r = money(b.rate); if (!r) throw E(400, 'Tarifa no válida'); u.rate = r; u.rateStatus = b.accept === true ? 'acordada' : 'contraoferta'; break; }
      default: throw E(400, 'Acción no válida');
    }
    save(); return pub(u);
  },
  'POST /api/admin/config': (q, b, me) => {
    need(me, 'admin');
    db.config.commission = intIn(b.commission, 0, 100, 'La comisión debe estar entre 0 y 100');
    db.config.penalty = intIn(b.penalty, 0, 100, 'La penalización debe estar entre 0 y 100');
    save(); return db.config;
  },
  'POST /api/admin/resolve': (q, b, me) => {
    need(me, 'admin');
    const k = bk(b.id);
    if (k.status !== 'en_disputa') throw E(400, 'No está en disputa');
    if (b.action !== 'solucionado') throw E(403, 'El veredicto final y la liberación del dinero los da el cliente');
    k.status = 'agendado'; closeClaims(k.id, 'solucionado por Skilly; el cliente decide'); save();
    return enrich(k); // el dinero sigue retenido
  }
};


// ---- Pagos Webpay: helpers ----
// Una reserva sin pagar vuelve a estado cancelado y su bloque queda libre otra vez
function cancelPending(k) {
  if (k.status !== 'pendiente_pago') return;
  k.status = 'cancelado'; delete k.secret;
  const bl = db.blocks.find(x => x.id === k.blockId); if (bl) bl.taken = false;
}
// Reembolso en Webpay cuando se cancela una reserva ya pagada (mejor esfuerzo: si falla queda registrado para revisión manual)
function refundWebpay(k) {
  const p = db.payments.find(x => x.bookingId === k.id && x.status === 'autorizada');
  if (!p || !(k.refund > 0)) return;
  p.refundAmount = k.refund; p.refundStatus = 'pendiente';
  webpay.refund(p.token, k.refund)
    .then(r => { p.refundStatus = 'reembolsado'; p.refundType = r && r.type || null; if (k.refund >= p.amount) p.status = 'reembolsada'; })
    .catch(e => { p.refundStatus = 'error'; console.error('Reembolso Webpay falló (' + p.id + '):', e.message); })
    .finally(save);
}
// Pagos que nunca volvieron de Transbank: se liberan al pasar PAY_MINUTES
function sweepPending() {
  const limit = Date.now() - PAY_MINUTES * 60e3; let changed = false;
  for (const k of db.bookings) if (k.status === 'pendiente_pago' && (k.created || 0) < limit) {
    cancelPending(k);
    for (const p of db.payments) if (p.bookingId === k.id && p.status === 'iniciada') p.status = 'expirada';
    changed = true;
  }
  if (changed) save();
}

// Paso 2 del pago: Transbank devuelve al cliente a /webpay/retorno (por POST o GET).
//   token_ws                  -> flujo normal: se confirma con commit()
//   TBK_TOKEN (+ TBK_ORDEN_COMPRA)  -> la persona anuló el pago en el formulario de Transbank
//   solo TBK_ORDEN_COMPRA     -> se agotó el tiempo en el formulario
async function webpayReturn(params, res) {
  const go = orden => { res.writeHead(303, { ...SEC, Location: '/pago-resultado.html' + (orden ? '?orden=' + encodeURIComponent(orden) : '?error=1'), 'Cache-Control': 'no-store' }); res.end(); };
  const tw = str(params.token_ws, 100), tt = str(params.TBK_TOKEN, 100), oc = str(params.TBK_ORDEN_COMPRA, 40);
  const p = (tw && db.payments.find(x => x.token === tw)) || (tt && db.payments.find(x => x.token === tt)) || (oc && db.payments.find(x => x.id === oc));
  if (!p) return go(null);
  const k = db.bookings.find(x => x.id === p.bookingId);
  if (p.status !== 'iniciada') return go(p.id);          // recarga de la página o doble retorno: no se vuelve a confirmar
  if (!tw || tt) {                                        // anulado por la persona (o error del formulario) / tiempo agotado
    p.status = tt ? 'abandonada' : 'expirada'; if (k) cancelPending(k); save(); return go(p.id);
  }
  p.status = 'procesando';                                // evita confirmar dos veces si llegan dos retornos a la vez
  try {
    const r = await webpay.commit(tw);
    const ok = r.status === 'AUTHORIZED' && r.response_code === 0 && r.buy_order === p.id && r.amount === p.amount && k && k.gross === p.amount;
    Object.assign(p, { last4: str(String((r.card_detail || {}).card_number || ''), 4).slice(-4) || null, authCode: str(r.authorization_code, 12) || null,
      paymentType: str(r.payment_type_code, 4) || null, installments: Number.isInteger(r.installments_number) ? r.installments_number : null,
      txDate: r.transaction_date ? Date.parse(r.transaction_date) || Date.now() : Date.now(), responseCode: Number.isInteger(r.response_code) ? r.response_code : null });
    if (ok && k.status === 'pendiente_pago') {
      p.status = 'autorizada'; k.status = 'agendado'; k.escrow = k.gross; delete k.secret;   // el dinero queda en custodia
    } else {
      p.status = ok ? 'error' : 'rechazada'; if (k) cancelPending(k);
      if (ok) webpay.refund(tw, p.amount).catch(e => console.error('Reversa tras reserva vencida falló:', e.message)); // se cobró pero la reserva ya no existe
    }
  } catch (e) {
    console.error('Webpay commit falló:', e.message);
    p.status = 'error'; if (k) cancelPending(k);
  }
  save(); go(p.id);
}

// Rutas que no requieren sesión (los invitados reservan y pagan sin cuenta, con su secreto)
const PUBLIC_ROUTES = new Set(['POST /api/register', 'POST /api/login', 'POST /api/logout', 'GET /api/pros',
  'GET /api/config', 'POST /api/bookings', 'POST /api/pay/init', 'GET /api/pay/result', 'GET /api/sim/info', 'POST /api/sim/decidir']);

// ---- Respuestas y cabeceras de seguridad ----
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; " +
    "form-action 'self' https://webpay3gint.transbank.cl https://webpay3g.transbank.cl; object-src 'none'"
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const head = (res, code, type, extra = {}) => res.writeHead(code, { ...SEC, 'Content-Type': type, ...extra });
const text = (res, code, msg) => { head(res, code, 'text/plain; charset=utf-8'); res.end(msg); };
const sendJSON = (res, code, obj, extra = {}) => { head(res, code, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra }); res.end(JSON.stringify(obj)); };

// Solo sirve archivos dentro de /public
function serveStatic(res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return text(res, 400, 'Solicitud inválida'); }
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const file = path.resolve(PUBLIC, '.' + p);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return text(res, 403, 'Prohibido');
  fs.readFile(file, (err, data) => {
    if (err) return text(res, 404, '404');
    head(res, 200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// Lee un cuerpo application/x-www-form-urlencoded (así vuelve Transbank por POST)
function readForm(req, cb) {
  const chunks = []; let size = 0, big = false;
  req.on('data', c => { size += c.length; if (size > MAX_BODY) big = true; else chunks.push(c); });
  req.on('end', () => cb(big ? {} : Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
}

function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/webpay/retorno') {
    const done = params => webpayReturn(params, res).catch(e => { console.error(e); text(res, 500, 'Error interno del servidor'); });
    if (req.method === 'POST') return readForm(req, done);
    if (req.method === 'GET') return done(Object.fromEntries(url.searchParams));
    return text(res, 405, 'Método no permitido');
  }
  if (url.pathname === '/pasarela-simulada' && req.method === 'POST' && webpay.MODE === 'simulado') {   // equivale al formulario de Transbank
    return readForm(req, f => { res.writeHead(303, { ...SEC, Location: '/pasarela-simulada.html?token=' + encodeURIComponent(str(f.token_ws, 100)) }); res.end(); });
  }
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Método no permitido');
    return serveStatic(res, url.pathname);
  }
  const key = req.method + ' ' + url.pathname, route = routes[key];
  if (!route) return sendJSON(res, 404, { error: 'No encontrado' });
  if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json'))
    return sendJSON(res, 415, { error: 'Se requiere application/json' });

  const chunks = []; let size = 0, tooBig = false;
  req.on('data', c => { size += c.length; if (size > MAX_BODY) tooBig = true; else chunks.push(c); });
  req.on('end', async () => {
    if (tooBig) return sendJSON(res, 413, { error: 'Solicitud demasiado grande' });
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = {};
      if (raw.trim()) { try { body = JSON.parse(raw); } catch { throw E(400, 'JSON inválido'); } }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw E(400, 'Datos no válidos');

      const tok = cookieOf(req, COOKIE);
      const sid = Object.prototype.hasOwnProperty.call(db.sessions, tok) ? db.sessions[tok] : null;
      let me = sid ? db.users.find(u => u.id === sid) || null : null;
      if (me && me.status === 'baja') me = null;
      if (!me && !PUBLIC_ROUTES.has(key)) throw E(401, 'Inicia sesión');

      const ctx = { tok, ip: req.socket.remoteAddress, setCookie: null };
      const out = await route(Object.fromEntries(url.searchParams), body, me, ctx);
      sendJSON(res, 200, out ?? { ok: 1 }, ctx.setCookie ? { 'Set-Cookie': ctx.setCookie } : {});
    } catch (e) {
      const code = typeof e.code === 'number' && e.code >= 400 && e.code < 600 ? e.code : 500;
      if (code === 500) console.error(e);
      sendJSON(res, code, { error: code === 500 ? 'Error interno del servidor' : e.message });
    }
  });
}

store.load().then(async d => {
  db = d;
  // Admin: clave predeterminada. Si el admin ya existe con otra clave, se actualiza a esta al iniciar.
  const admin = db.users.find(u => u.role === 'admin');
  if (!admin) {
    db.users.push({ id: 'admin', role: 'admin', email: 'admin@skilly.cl', name: 'Admin Skilly', pass: hashPass(ADMIN_PASSWORD) });
    await save();
    console.log('Admin creado (admin@skilly.cl).');
  } else if (!checkPass(ADMIN_PASSWORD, admin.pass)) {
    admin.pass = hashPass(ADMIN_PASSWORD); await save();
    console.log('Clave de admin restablecida a la predeterminada.');
  }
  // Reservas de invitados que quedaron sin pagar al reiniciar: se liberan el bloque
  let released = 0;
  for (const k of db.bookings) if (k.status === 'pendiente_pago' && !k.companyId) {
    k.status = 'cancelado'; released++;
    const bl = db.blocks.find(x => x.id === k.blockId); if (bl) bl.taken = false;
  }
  if (released) await save();
  sweepPending(); setInterval(sweepPending, 60e3).unref();
  console.log('Pagos Webpay en modo: ' + webpay.MODE);

  http.createServer(handle).listen(PORT, HOST, () => console.log(`Skilly en http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
}).catch(e => { console.error('No se pudo conectar a MySQL. ¿Está MySQL encendido en XAMPP y importaste database/skilly.sql?\n', e.message); process.exit(1); });
