// Utilidades comunes a todas las páginas (se carga antes que el script de cada página)
const $ = s => document.querySelector(s);
// Escapa cualquier dato que venga del usuario antes de insertarlo en el HTML
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clp = n => '$' + Math.round(n || 0).toLocaleString('es-CL') + ' CLP';
const hr = h => String(h).padStart(2, '0') + ':00';
const slot = b => `${esc(b.date)} ${hr(b.start)}–${hr(b.end)}`;
const fv = id => document.getElementById(id).value;
const fo = (...ids) => Object.fromEntries(ids.map(i => [i, fv(i)]));
const empty = html => `<div class="empty">${html}</div>`;

const ST = {
  pendiente_pago: 'Pendiente de pago', agendado: 'Agendado', completado: 'Completado', cancelado: 'Cancelado',
  en_disputa: 'En disputa', pendiente: 'En revisión', activo: 'Activo', baja: 'De baja', propuesta: 'Propuesta',
  acordada: 'Acordada', contraoferta: 'Contraoferta', abierto: 'Abierto', resuelto: 'Resuelto',
  // estados de una transacción Webpay
  iniciada: 'Iniciada', procesando: 'Procesando', autorizada: 'Autorizada', rechazada: 'Rechazada',
  abandonada: 'Anulada por el usuario', expirada: 'Expirada', error: 'Con error', reembolsada: 'Reembolsada'
};
const badge = s => `<span class="badge b-${esc(s)}">${esc(ST[s] || s)}</span>`;

const PANEL = { empresa: 'empresa.html', cliente: 'empresa.html', profesional: 'profesional.html', admin: 'admin.html' };
let S = { user: null, msg: sessionStorage.msg || '' };

// La sesión viaja en una cookie HttpOnly: el JavaScript no puede leerla
async function api(m, p, b) {
  const r = await fetch('/api' + p, {
    method: m, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo completar la acción');
  return j;
}

function goTo(page) { sessionStorage.msg = S.msg || ''; location.href = page; }
function setSession(r, nuevo) {
  S.user = r.user; S.msg = '';
  // Una empresa recién registrada va directo al marketplace; al iniciar sesión va a su panel
  location.href = nuevo && r.user.role === 'empresa' ? 'marketplace.html' : (PANEL[r.user.role] || 'index.html');
}

function nav() {
  const u = S.user, panel = u && PANEL[u.role];
  const here = location.pathname.split('/').pop() || 'index.html';
  const cur = f => here === f ? ' aria-current="page"' : '';
  $('#nav').innerHTML = `
    <a class="brand" href="index.html" aria-label="Skilly, inicio"><img src="img/logo.png" alt="Skilly"></a>
    <button class="menu-btn s" aria-label="Abrir menú" aria-expanded="false" aria-controls="links" onclick="toggleMenu(this)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <div class="links" id="links">
      <a href="index.html"${cur('index.html')}>Inicio</a>
      <a href="marketplace.html"${cur('marketplace.html')}>Servicios</a>
      <a href="index.html#como-funciona">Cómo funciona</a>
      <a href="index.html#quienes-somos">Nosotros</a>
      ${u ? `<a href="${panel}"${cur(panel)}>Mi panel</a>`
        : `<a href="registro-empresa.html"${cur('registro-empresa.html')}>Para empresas</a><a href="registro-profesional.html"${cur('registro-profesional.html')}>Para talento</a>`}
    </div>
    <span class="sp"></span>
    ${u ? `<span class="who">${esc(u.name)} <span class="tag">${esc(u.role)}</span></span><button class="s" onclick="logout()">Salir</button>`
      : `<a class="btn" href="login.html">Ingresar</a>`}`;
}
// Pie de página común a todas las páginas
function foot() {
  if (document.querySelector('.foot')) return;
  const f = document.createElement('footer'); f.className = 'foot';
  f.innerHTML = `<div class="in"><span>© Skilly Latam · Marketplace de Personas y Back Office</span>
    <span class="tbk">Pagos con Webpay Plus · Transbank (ambiente de pruebas)</span>
    <span><a href="marketplace.html">Servicios</a> · <a href="index.html#quienes-somos">Nosotros</a> · <a href="login.html">Ingresar</a></span></div>`;
  document.body.appendChild(f);
}
function toggleMenu(btn) {
  const open = $('#nav').classList.toggle('open');
  btn.setAttribute('aria-expanded', String(open));
}
async function logout() {
  try { await api('POST', '/logout'); } catch { /* si ya expiró, igual salimos */ }
  S.user = null; location.href = 'index.html';
}

const ERR = '[error] '; // marca interna de mensajes de error (no se muestra)
const msg = () => S.msg ? `<p class="alert ${S.msg.startsWith(ERR) ? 'err' : 'ok'}" role="status">${esc(S.msg.replace(ERR, ''))}</p>` : '';

async function boot(view) {
  try { S.user = (await api('GET', '/me')).user; } catch { S.user = null; }
  nav(); foot();
  try { await view(); }
  catch (e) { $('#app').innerHTML = `<div class="card"><p class="alert err">${esc(e.message)}</p></div>`; }
  S.msg = ''; sessionStorage.msg = '';
}

async function act(fn, ok) {
  try { S.msg = ''; await fn(); S.msg = S.msg || ok || ''; }
  catch (e) { S.msg = ERR + e.message; }
  route();
}

// ---- Contraseñas: reglas (iguales a las del servidor), medidor y mostrar/ocultar ----
function pwIssues(v, ctx = {}) {
  const out = [];
  if (v.length < 10) out.push('10 caracteres o más');
  if (!/[a-z]/.test(v)) out.push('una minúscula');
  if (!/[A-Z]/.test(v)) out.push('una mayúscula');
  if (!/\d/.test(v)) out.push('un número');
  if (!/[^A-Za-z0-9]/.test(v)) out.push('un símbolo');
  if (/\s/.test(v)) out.push('sin espacios');
  if (/(.)\1{3,}/.test(v)) out.push('sin 4 caracteres iguales seguidos');
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(v)) out.push('sin secuencias (1234, abcd)');
  const local = (ctx.email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && v.toLowerCase().includes(local)) out.push('sin tu correo');
  return out;
}
function pwField(id, label, ctxIds = []) {
  return `<label for="${id}">${label}</label>
    <div class="pw"><input id="${id}" type="password" autocomplete="new-password" maxlength="128" aria-describedby="${id}-hint">
    <button type="button" class="s pw-eye" aria-label="Mostrar contraseña" aria-pressed="false" onclick="togglePw('${id}',this)">Ver</button></div>
    <div class="meter" aria-hidden="true"><i id="${id}-bar"></i></div>
    <p class="hint" id="${id}-hint">Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo.</p>`;
}
function togglePw(id, btn) {
  const el = document.getElementById(id), show = el.type === 'password';
  el.type = show ? 'text' : 'password'; btn.textContent = show ? 'Ocultar' : 'Ver';
  btn.setAttribute('aria-pressed', String(show)); btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
}
function bindPw(id, confirmId) {
  const el = document.getElementById(id), hint = document.getElementById(id + '-hint'), bar = document.getElementById(id + '-bar');
  const upd = () => {
    const v = el.value, bad = pwIssues(v, { email: (document.getElementById('email') || {}).value || '' });
    const score = v ? Math.max(0, 5 - bad.length) : 0; // 0..5
    bar.style.width = (score * 20) + '%'; bar.dataset.s = score <= 2 ? 'low' : score <= 4 ? 'mid' : 'high';
    hint.className = 'hint ' + (v && !bad.length ? 'ok' : v ? 'bad' : '');
    hint.textContent = !v ? 'Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo.'
      : bad.length ? 'Falta: ' + bad.join(', ') : '✓ Contraseña segura';
  };
  el.addEventListener('input', upd);
  if (confirmId) {
    const c = document.getElementById(confirmId), ch = document.getElementById(confirmId + '-hint');
    const cu = () => { ch.className = 'hint ' + (c.value && c.value === el.value ? 'ok' : c.value ? 'bad' : '');
      ch.textContent = !c.value ? '' : c.value === el.value ? '✓ Coinciden' : 'Las contraseñas no coinciden'; };
    c.addEventListener('input', cu); el.addEventListener('input', cu);
  }
}

// El formulario no se vuelve a dibujar si hay un error: así no se pierde lo que la persona escribió
async function reg(role) {
  const box = document.getElementById('reg-msg'), btn = document.getElementById('reg-btn');
  const fail = m => { box.innerHTML = `<p class="alert err" role="alert">${esc(m)}</p>`; box.scrollIntoView({ block: 'nearest' }); };
  box.innerHTML = '';
  const fields = ['name', 'rut', 'email', 'phone', 'password', 'password2',
    ...(role === 'empresa' ? ['contacto', 'industria'] : ['categoria', 'anios', 'rate', 'linkedin'])];
  const b = fo(...fields); b.role = role;
  if (!b.name.trim()) return fail('Falta el nombre');
  if (!parseRut(b.rut)) return fail('RUT no válido: revisa el número y el dígito verificador');
  const bad = pwIssues(b.password, { email: b.email });
  if (bad.length) return fail('La contraseña debe tener: ' + bad.join(', '));
  if (b.password !== b.password2) return fail('Las contraseñas no coinciden');
  if (role === 'profesional') b.terms = document.getElementById('terms').checked;
  btn.disabled = true;
  try { setSession(await api('POST', '/register', b), true); }
  catch (e) { fail(e.message); btn.disabled = false; }
}

// Acción sobre una reserva; "q" es una confirmación opcional para acciones que mueven dinero
const doA = (a, id, q) => { if (q && !confirm(q)) return; act(() => api('POST', '/' + a, { id }), 'Hecho'); };
