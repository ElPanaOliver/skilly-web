const REASONS = ['El profesional no se presentó', 'El servicio no cumplió lo acordado', 'Calidad insuficiente del trabajo',
  'El profesional llegó tarde o terminó antes', 'Otro motivo'];

function bookingCard(k, pros, cfg) {
  const pro = pros.find(p => p.id === k.proId);
  const opts = (pro ? pro.blocks : []).filter(b => b.end - b.start === k.hours && b.id !== k.blockId)
    .map(b => `<option value="${esc(b.id)}">${slot(b)}</option>`).join('');
  const facts = [['Total', clp(k.gross)], ['En custodia', clp(k.escrow || 0)]];
  if (k.penalty) facts.push(['Penalización', clp(k.penalty)]);
  if (k.status === 'cancelado') facts.push(['Reembolso', clp(k.refund)]);

  let body = '';
  if (k.status === 'agendado') {
    body = `
      <div class="actions">
        <button class="g" onclick="doA('confirm','${k.id}','¿Confirmas que el servicio está terminado? Se liberará el pago al profesional.')">Terminado: liberar pago</button>
        <button class="s" onclick="doA('cancel','${k.id}','¿Seguro que quieres cancelar este servicio?')">Cancelar${cfg.penalty ? ` (penalización ${cfg.penalty}% si faltan menos de 24 h)` : ''}</button>
      </div>
      ${k.rescheduled ? '<p class="m">Ya reagendaste este servicio.</p>'
        : `<div class="inline"><select id="rs${k.id}" ${opts ? '' : 'disabled'}>${opts || '<option value="">Sin bloques disponibles</option>'}</select>
           <button class="s" ${opts ? '' : 'disabled'} onclick="resch('${k.id}')">Reagendar (1 vez)</button></div>`}
      <details class="claim"><summary>No estoy satisfecho</summary>
        <select id="dr${k.id}"><option value="">¿Por qué no estás satisfecho?</option>${REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select>
        <textarea id="dd${k.id}" placeholder="Detalle (opcional)"></textarea>
        <button onclick="disp('${k.id}')">Reportar problema</button>
        <p class="m">El pago seguirá retenido hasta que se resuelva.</p>
      </details>`;
  }
  if (k.status === 'en_disputa') {
    body = `<div class="notice warn"><b>Pago retenido hasta resolver:</b> ${esc(k.dispute && k.dispute.reason)}
      <br><span class="m">Skilly te contactará. Cuando el problema se resuelva, confirma el servicio.</span>
      <div class="actions"><button class="g" onclick="doA('confirm','${k.id}','¿El problema está resuelto y el servicio terminado? Se liberará el pago.')">Problema resuelto: Terminado</button></div></div>`;
  }
  if (k.status === 'completado') {
    body = `<details class="claim"><summary>Enviar feedback privado a Skilly</summary>
      <textarea id="fb${k.id}" placeholder="Solo lo verá el equipo de Skilly"></textarea>
      <button class="s" onclick="fb('${k.id}')">Enviar feedback</button></details>`;
  }
  return `<article class="card">
    <div class="row between"><div><h2>${esc(k.title)}</h2><p class="m">${esc(k.proName || 'Profesional')} · ${k.block ? slot(k.block) : ''}</p></div>${badge(k.status)}</div>
    <dl class="facts">${facts.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${body}
  </article>`;
}

const resch = id => act(() => api('POST', '/reschedule', { id, blockId: fv('rs' + id) }), 'Servicio reagendado');
const fb = id => act(() => api('POST', '/feedback', { id, text: fv('fb' + id) }), 'Feedback enviado a Skilly');
const disp = id => act(() => api('POST', '/dispute', { id, reason: fv('dr' + id), detail: fv('dd' + id) }), 'Reporte enviado: el pago sigue retenido');

async function vEmp() {
  const [bs, pros, cfg] = await Promise.all([api('GET', '/my/bookings'), api('GET', '/pros'), api('GET', '/config')]);
  const list = bs.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  $('#app').innerHTML = `
    <div class="page-head"><div><h1>Mis servicios</h1><p class="m">Gestiona tus contrataciones y libera el pago cuando el servicio esté terminado.</p></div>
      <a class="btn g" href="marketplace.html">+ Solicitar especialista</a></div>
    ${msg()}
    ${list.map(k => bookingCard(k, pros, cfg)).join('') ||
      empty('Aún no tienes servicios. <a href="marketplace.html">Explora el marketplace</a> para contratar un especialista.')}`;
}

async function route() { await boot(vEmp); }
route();
