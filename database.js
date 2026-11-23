// Capa de base de datos MySQL/MariaDB (XAMPP) para Skilly.
// Traduce entre el formato interno del servidor (users, blocks, bookings...) y las tablas
// en espanol de la base `skilly` (usuarios, clientes, empresas, profesionales, reservas...).
// Al iniciar carga todo en memoria; en cada cambio guarda (INSERT ... ON DUPLICATE KEY UPDATE)
// y elimina lo que ya no existe. Las tablas no usadas por el proyecto no se tocan.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: +process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'skilly',
  decimalNumbers: true
});

// Tablas que maneja el servidor y su clave primaria (padres primero)
const TABLES = [
  ['usuarios', 'id_usuario'], ['clientes', 'id_cliente'], ['empresas', 'id_empresa'],
  ['profesionales', 'id_profesional'], ['bloques_disponibilidad', 'id_bloque'], ['reservas', 'id_reserva'],
  ['pagos_escrow', 'id_pago'], ['transacciones_webpay', 'buy_order'], ['boletas', 'id_boleta'], ['reclamos', 'id_reclamo'],
  ['feedback_clientes', 'id_feedback'], ['sesiones', 'token']
];

const n = v => (v === null || v === undefined ? null : Number(v));
const s = v => (v === null || v === undefined ? '' : v);
const nz = v => (v === undefined || (typeof v === 'number' && isNaN(v)) ? null : v);
const fechaHora = b => (b && /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? `${b.date} ${String(b.start).padStart(2, '0')}:00:00` : null);

// ---- memoria -> filas ----
function toRows(db) {
  const R = {};
  R.usuarios = db.users.map(u => ({ id_usuario: u.id, correo: u.email, contrasena: u.pass, rol: u.role, nombre: u.name, telefono: nz(u.phone) }));
  R.clientes = db.users.filter(u => u.role === 'cliente').map(u => ({ id_cliente: u.id, id_usuario: u.id, nombre: u.name, apellidos: s(u.apellidos), telefono: nz(u.phone) }));
  R.empresas = db.users.filter(u => u.role === 'empresa').map(u => ({ id_empresa: u.id, id_usuario: u.id, razon_social: u.name, rut: nz(u.rut), direccion: nz(u.direccion), contacto: nz(u.contacto), industria: nz(u.industria) }));
  R.profesionales = db.users.filter(u => u.role === 'profesional').map(u => ({
    id_profesional: u.id, id_usuario: u.id, nombre: u.name, especialidad: s(u.categoria), tarifa_hora: nz(u.rate) || 0, rut: nz(u.rut),
    linkedin: nz(u.linkedin), anios: nz(u.anios), estado_tarifa: nz(u.rateStatus), estado: nz(u.status), entrevistas: u.interviews || 0, alertas: u.strikes || 0
  }));
  R.bloques_disponibilidad = db.blocks.map(b => ({ id_bloque: b.id, id_profesional: b.proId, fecha: b.date, hora_inicio: b.start, hora_fin: b.end, tomado: +!!b.taken }));
  R.reservas = db.bookings.map(k => ({
    id_reserva: k.id, id_bloque: k.blockId, id_profesional: k.proId, id_cliente: nz(k.companyId), correo_invitado: nz(k.guestEmail), titulo: nz(k.title),
    fecha_reserva: fechaHora(db.blocks.find(b => b.id === k.blockId)), horas: nz(k.hours), monto_total: nz(k.gross), comision: nz(k.fee), monto_neto: nz(k.net),
    estado: k.status, reagendada: +!!k.rescheduled, monto_escrow: nz(k.escrow), monto_reembolso: nz(k.refund), penalizacion: nz(k.penalty),
    disputa: k.dispute ? JSON.stringify(k.dispute) : null, creado: nz(k.created)
  }));
  // Pagos en custodia: se derivan del estado de cada reserva ya pagada
  R.pagos_escrow = [];
  for (const k of db.bookings) {
    let estado = null;
    if (k.status === 'agendado' || k.status === 'en_disputa') estado = 'retenido_en_escrow';
    else if (k.status === 'completado') estado = 'liberado_al_profesional';
    else if (k.status === 'cancelado' && ((k.refund || 0) > 0 || (k.penalty || 0) > 0)) estado = 'reembolsado';
    if (estado) R.pagos_escrow.push({ id_pago: 'P-' + k.id, id_reserva: k.id, monto_total: k.gross || 0, comision_plataforma: k.fee || 0, estado_fondos: estado });
  }
  // Transacciones Webpay Plus (una por intento de pago; buy_order es la orden de compra enviada a Transbank)
  R.transacciones_webpay = db.payments.map(p => ({
    buy_order: p.id, id_reserva: p.bookingId, token: nz(p.token), monto: p.amount, estado: p.status, modo: p.mode,
    codigo_respuesta: nz(p.responseCode), codigo_autorizacion: nz(p.authCode), tipo_pago: nz(p.paymentType), cuotas: nz(p.installments),
    tarjeta_ultimos4: nz(p.last4), fecha_transaccion: nz(p.txDate), monto_reembolso: nz(p.refundAmount), estado_reembolso: nz(p.refundStatus), creado: nz(p.created)
  }));
  R.boletas = db.boletas.map(b => ({ id_boleta: b.id, id_reserva: b.bookingId, id_profesional: b.proId, monto: nz(b.monto), comision: nz(b.comision), fecha: nz(b.fecha), sii: b.sii || 'manual' }));
  R.reclamos = db.claims.map(c => ({ id_reclamo: c.id, id_reserva: c.bookingId, id_cliente: nz(c.companyId), id_profesional: c.proId, motivo: nz(c.reason), detalle: nz(c.detail), fecha: nz(c.date), estado: c.status || 'abierto', resolucion: nz(c.how), cerrado: nz(c.closed) }));
  R.feedback_clientes = db.feedback.map(f => ({ id_feedback: f.id, id_reserva: f.bookingId, id_profesional: f.proId, texto: nz(f.text), fecha: nz(f.fecha) }));
  R.sesiones = Object.entries(db.sessions).map(([token, id]) => ({ token, id_usuario: id }));
  return R;
}

// ---- filas -> memoria ----
function fromRows(R, cfg) {
  const idx = (rows, k) => Object.fromEntries(rows.map(r => [r[k], r]));
  const emp = idx(R.empresas, 'id_usuario'), pro = idx(R.profesionales, 'id_usuario'), cli = idx(R.clientes, 'id_usuario');
  const db = {};
  db.users = R.usuarios.map(r => {
    const u = { id: r.id_usuario, role: r.rol, email: r.correo, name: r.nombre, pass: r.contrasena, phone: s(r.telefono) };
    if (r.rol === 'empresa' && emp[u.id]) { const e = emp[u.id]; Object.assign(u, { rut: s(e.rut), contacto: s(e.contacto), industria: s(e.industria) }); if (e.direccion) u.direccion = e.direccion; }
    else if (r.rol === 'cliente' && cli[u.id]) { if (cli[u.id].apellidos) u.apellidos = cli[u.id].apellidos; }
    else if (r.rol === 'profesional' && pro[u.id]) {
      const p = pro[u.id];
      Object.assign(u, { rut: s(p.rut), linkedin: s(p.linkedin), categoria: s(p.especialidad), anios: s(p.anios), rate: n(p.tarifa_hora) || 0,
        rateStatus: p.estado_tarifa, status: p.estado, interviews: n(p.entrevistas) || 0, strikes: n(p.alertas) || 0 });
    }
    return u;
  });
  db.blocks = R.bloques_disponibilidad.map(b => ({ id: b.id_bloque, proId: b.id_profesional, date: b.fecha, start: n(b.hora_inicio), end: n(b.hora_fin), taken: !!b.tomado }));
  db.bookings = R.reservas.map(r => {
    let d = r.disputa; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    const k = { id: r.id_reserva, blockId: r.id_bloque, proId: r.id_profesional, companyId: r.id_cliente, guestEmail: r.correo_invitado, title: r.titulo,
      hours: n(r.horas), gross: n(r.monto_total), fee: n(r.comision), net: n(r.monto_neto), status: r.estado, rescheduled: !!r.reagendada, created: n(r.creado) };
    if (r.monto_escrow !== null) k.escrow = n(r.monto_escrow);
    if (r.monto_reembolso !== null) k.refund = n(r.monto_reembolso);
    if (r.penalizacion !== null) k.penalty = n(r.penalizacion);
    if (d) k.dispute = d;
    return k;
  });
  db.payments = (R.transacciones_webpay || []).map(t => {
    const p = { id: t.buy_order, bookingId: t.id_reserva, token: t.token, amount: n(t.monto), status: t.estado, mode: t.modo, created: n(t.creado) };
    if (t.codigo_respuesta !== null) p.responseCode = n(t.codigo_respuesta);
    if (t.codigo_autorizacion) p.authCode = t.codigo_autorizacion;
    if (t.tipo_pago) p.paymentType = t.tipo_pago;
    if (t.cuotas !== null) p.installments = n(t.cuotas);
    if (t.tarjeta_ultimos4) p.last4 = t.tarjeta_ultimos4;
    if (t.fecha_transaccion !== null) p.txDate = n(t.fecha_transaccion);
    if (t.monto_reembolso !== null) p.refundAmount = n(t.monto_reembolso);
    if (t.estado_reembolso) p.refundStatus = t.estado_reembolso;
    return p;
  });
  db.boletas = R.boletas.map(b => ({ id: b.id_boleta, bookingId: b.id_reserva, proId: b.id_profesional, monto: n(b.monto), comision: n(b.comision), fecha: n(b.fecha), sii: b.sii }));
  db.claims = R.reclamos.map(c => {
    const o = { id: c.id_reclamo, bookingId: c.id_reserva, companyId: c.id_cliente, proId: c.id_profesional, reason: c.motivo, detail: s(c.detalle), date: n(c.fecha), status: c.estado };
    if (c.resolucion !== null) o.how = c.resolucion; if (c.cerrado !== null) o.closed = n(c.cerrado); return o;
  });
  db.feedback = R.feedback_clientes.map(f => ({ id: f.id_feedback, bookingId: f.id_reserva, proId: f.id_profesional, text: s(f.texto), fecha: n(f.fecha) }));
  db.sessions = Object.fromEntries(R.sesiones.map(x => [x.token, x.id_usuario]));
  db.config = cfg ? { commission: n(cfg.comision), penalty: n(cfg.penalizacion), maxHours: n(cfg.horas_maximas) } : { commission: 10, penalty: 20, maxHours: 4 };
  return db;
}

// Tabla de pagos Webpay. Se crea sola si la base se importó con una versión anterior de skilly.sql.
const DDL_WEBPAY = "CREATE TABLE IF NOT EXISTS `transacciones_webpay` (" +
  "`buy_order` varchar(30) NOT NULL, `id_reserva` varchar(30) NOT NULL, `token` varchar(100) DEFAULT NULL, `monto` int(11) NOT NULL," +
  "`estado` enum('iniciada','procesando','autorizada','rechazada','abandonada','expirada','error','reembolsada') NOT NULL DEFAULT 'iniciada'," +
  "`modo` enum('integracion','produccion','simulado') NOT NULL, `codigo_respuesta` int(11) DEFAULT NULL, `codigo_autorizacion` varchar(12) DEFAULT NULL," +
  "`tipo_pago` varchar(4) DEFAULT NULL, `cuotas` int(11) DEFAULT NULL, `tarjeta_ultimos4` char(4) DEFAULT NULL, `fecha_transaccion` bigint(20) DEFAULT NULL," +
  "`monto_reembolso` int(11) DEFAULT NULL, `estado_reembolso` varchar(20) DEFAULT NULL, `creado` bigint(20) DEFAULT NULL," +
  "PRIMARY KEY (`buy_order`), UNIQUE KEY `uq_token` (`token`), KEY `idx_reserva` (`id_reserva`), KEY `idx_estado` (`estado`)," +
  "CONSTRAINT `fk_webpay_reserva` FOREIGN KEY (`id_reserva`) REFERENCES `reservas` (`id_reserva`) ON DELETE CASCADE" +
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci";

async function load() {
  await pool.query(DDL_WEBPAY);
  const R = {};
  for (const [t] of TABLES) [R[t]] = await pool.query('SELECT * FROM `' + t + '`');
  const [c] = await pool.query('SELECT * FROM `configuracion` WHERE id=1');
  return fromRows(R, c[0]);
}

async function write(db, conn) {
  const R = toRows(db), cn = conn || await pool.getConnection();
  try {
    await cn.query('SET FOREIGN_KEY_CHECKS=0'); await cn.beginTransaction();
    for (const [t, pk] of TABLES) {
      const rows = R[t];
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        const upd = cols.filter(c => c !== pk).map(c => '`' + c + '`=VALUES(`' + c + '`)').join(',');
        await cn.query('INSERT INTO `' + t + '` (' + cols.map(c => '`' + c + '`').join(',') + ') VALUES ? ON DUPLICATE KEY UPDATE ' + upd, [rows.map(r => cols.map(c => r[c]))]);
        await cn.query('DELETE FROM `' + t + '` WHERE `' + pk + '` NOT IN (?)', [rows.map(r => r[pk])]);
      } else await cn.query('DELETE FROM `' + t + '`');
    }
    await cn.query('UPDATE `configuracion` SET comision=?,penalizacion=?,horas_maximas=? WHERE id=1', [db.config.commission, db.config.penalty, db.config.maxHours]);
    await cn.commit();
  } catch (e) { await cn.rollback(); throw e; }
  finally { await cn.query('SET FOREIGN_KEY_CHECKS=1'); cn.release(); }
}

let queue = Promise.resolve();
const save = db => queue = queue.then(() => write(db)).catch(e => console.error('Error al guardar en MySQL:', e.message));
module.exports = { load, save, _toRows: toRows, _fromRows: fromRows, _write: write };
