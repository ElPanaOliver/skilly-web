// Validación de RUT chileno (módulo 11). El servidor vuelve a validar: esto es solo ayuda visual.
function rutDv(body) {
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += +body[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
function parseRut(v) {
  const c = String(v || '').replace(/[.\-\s]/g, '').toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(c)) return null;
  const body = c.slice(0, -1), dv = c.slice(-1);
  if (+body < 1000000 || /^(\d)\1+$/.test(body) || rutDv(body) !== dv) return null;
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}
// Da formato mientras se escribe: 12.345.678-5
function fmtRut(v) {
  const c = String(v || '').replace(/[^\dkK]/g, '').toUpperCase().slice(0, 9);
  if (c.length < 2) return c;
  return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
}
function bindRut(id) {
  const el = document.getElementById(id), hint = document.getElementById(id + '-hint');
  const upd = final => {
    const raw = el.value.trim();
    if (!raw) { hint.textContent = ''; el.removeAttribute('aria-invalid'); return; }
    const ok = parseRut(raw);
    el.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (ok) { hint.className = 'hint ok'; hint.textContent = '✓ RUT válido'; }
    else if (final || /^\d{1,2}(\.?\d{3}){2}-?[\dkK]$/.test(raw)) { hint.className = 'hint bad'; hint.textContent = 'RUT no válido: revisa el dígito verificador'; }
    else { hint.className = 'hint'; hint.textContent = 'Ejemplo: 12.345.678-5'; }
  };
  el.addEventListener('input', () => { el.value = fmtRut(el.value); upd(false); });
  el.addEventListener('blur', () => upd(true));
}
