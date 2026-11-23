// Comprobante del pago. Se muestra después de que Transbank devuelve al cliente a /webpay/retorno
// (el servidor ya confirmó o rechazó el pago; aquí solo se lee el resultado).
const TIPO = { VD: 'Débito (Redcompra)', VN: 'Crédito (sin cuotas)', VC: 'Crédito en cuotas', SI: '3 cuotas sin interés', S2: '2 cuotas sin interés', NC: 'Cuotas sin interés', VP: 'Prepago' };
const MOTIVO = {
  rechazada: 'Tu banco o Transbank rechazó la transacción. No se realizó ningún cobro.',
  abandonada: 'Anulaste el pago en el formulario de Webpay. No se realizó ningún cobro.',
  expirada: 'Se agotó el tiempo para pagar. No se realizó ningún cobro.',
  error: 'Ocurrió un error al confirmar el pago. Si te cobraron, se revertirá automáticamente.',
  iniciada: 'El pago aún no se completa.', procesando: 'Estamos confirmando tu pago con Transbank…'
};

async function vResult() {
  const orden = new URLSearchParams(location.search).get('orden');
  if (!orden) { $('#app').innerHTML = `<div class="card receipt"><h1>No encontramos la transacción</h1><p class="m">Vuelve al marketplace e inténtalo otra vez.</p><div class="actions"><a class="btn g" href="marketplace.html">Ir al marketplace</a></div></div>`; return; }
  const r = await api('GET', '/pay/result?orden=' + encodeURIComponent(orden));
  const ok = r.estado === 'autorizada' || r.estado === 'reembolsada';
  const fecha = new Date(r.fecha).toLocaleString('es-CL');
  const rows = [['N.º de orden', `<span class="mono">${esc(r.orden)}</span>`], ['Servicio', esc(r.titulo || '—')], ['Fecha', esc(fecha)]];
  if (ok) rows.push(['Tarjeta', r.tarjeta ? '•••• •••• •••• ' + esc(r.tarjeta) : '—'], ['Tipo de pago', esc(TIPO[r.tipoPago] || r.tipoPago || '—')],
    ['Cuotas', esc(r.cuotas ?? '—')], ['Código de autorización', `<span class="mono">${esc(r.autorizacion || '—')}</span>`]);
  rows.push(['Estado', badge(r.estado)]);
  const volver = ok
    ? (S.user ? '<a class="btn g" href="empresa.html">Ver mis servicios</a>' : '<a class="btn g" href="marketplace.html">Volver al marketplace</a>')
    : (r.bloqueId ? `<a class="btn g" href="reservar.html?id=${esc(r.bloqueId)}">Intentar de nuevo</a>` : '') + '<a class="btn s" href="marketplace.html">Volver al marketplace</a>';
  $('#app').innerHTML = `<section class="card receipt">
    <span class="stamp ${ok ? 'ok' : 'err'}">${ok ? 'Pago aprobado' : 'Pago no realizado'}</span>
    <h1 style="margin-top:16px">${ok ? '¡Servicio agendado!' : 'No pudimos completar el pago'}</h1>
    <p class="m">${ok ? 'Tu dinero quedó en custodia de Skilly y se liberará cuando confirmes que el servicio terminó.' : esc(MOTIVO[r.estado] || '')}</p>
    <dl>${rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}
      <div class="total"><dt>Monto</dt><dd>${clp(r.monto)}</dd></div></dl>
    ${r.modo !== 'produccion' ? `<p class="notice">Ambiente de pruebas (${r.modo === 'simulado' ? 'pasarela simulada de Skilly' : 'Transbank integración'}): no se realizó ningún cobro real.</p>` : ''}
    <div class="actions">${volver}</div></section>`;
}
async function route() { await boot(vResult); }
route();
