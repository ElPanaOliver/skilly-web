async function vPro() {
  const [bl, bs, bo] = await Promise.all([api('GET', '/my/blocks'), api('GET', '/my/bookings'), api('GET', '/my/boletas')]);
  const u = S.user, d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sorted = bl.slice().sort((a, b) => a.date === b.date ? a.start - b.start : (a.date < b.date ? -1 : 1));

  const offer = u.rateStatus === 'contraoferta' ? `<div class="notice warn">Skilly propone <b>${clp(u.rate)}/h</b>.
    <div class="inline"><button class="g" onclick="acceptRate()">Aceptar</button>
    <input id="nr" type="number" min="1" placeholder="Tu contrapropuesta (CLP/h)" style="width:220px">
    <button class="s" onclick="counterRate()">Enviar contrapropuesta</button></div></div>` : '';
  const review = u.status === 'pendiente' ? '<div class="notice">Tu perfil está en revisión. Skilly te contactará para entrevistas antes de activarte.</div>' : '';
  const blocks = sorted.map(b => `<div class="slot"><span>${slot(b)}</span>${b.taken
    ? '<span class="tag">Reservado</span>' : `<button class="s" onclick="delB('${b.id}')">Quitar</button>`}</div>`).join('')
    || '<p class="m">Aún no tienes bloques. Agrega tu disponibilidad para que te puedan reservar.</p>';
  const svc = bs.map(k => `<div class="slot"><span><b>${esc(k.title)}</b><br><span class="m">${k.block ? slot(k.block) : ''} · neto ${clp(k.net)}</span></span>${badge(k.status)}</div>`).join('')
    || '<p class="m">Sin servicios todavía.</p>';
  const bol = bo.map(b => `<div class="slot"><span>${esc(b.id)}<br><span class="m">Comisión Skilly ${clp(b.comision)}</span></span><b>${clp(b.monto)}</b></div>`).join('')
    || '<p class="m">Sin boletas todavía.</p>';

  $('#app').innerHTML = `
    <div class="page-head"><div><h1>Portal profesional</h1><p class="m">Hola, ${esc(u.name)}. Gestiona tu disponibilidad, tarifa y servicios.</p></div></div>
    ${msg()}${review}
    <section class="card">
      <dl class="facts">
        <div><dt>Estado</dt><dd>${badge(u.status)}</dd></div>
        <div><dt>Entrevistas</dt><dd>${u.interviews}/3</dd></div>
        <div><dt>Alertas</dt><dd>${u.strikes}/3</dd></div>
        <div><dt>Tarifa</dt><dd>${clp(u.rate)}/h ${badge(u.rateStatus)}</dd></div>
      </dl>${offer}
    </section>
    <section class="card">
      <h2>Mi disponibilidad</h2><p class="m">Bloques de máximo 4 horas, sin solaparse.</p>
      <div class="inline">
        <input id="d" type="date" min="${today}">
        <input id="s" type="number" min="0" max="23" placeholder="Desde (hora)" style="width:150px">
        <input id="en" type="number" min="1" max="24" placeholder="Hasta (hora)" style="width:150px">
        <button onclick="addB()">Agregar bloque</button>
      </div>
      <div class="slots">${blocks}</div>
    </section>
    <div class="two">
      <section class="card"><h2>Servicios</h2><div class="slots">${svc}</div></section>
      <section class="card"><h2>Mis boletas</h2><div class="slots">${bol}</div></section>
    </div>`;
}

const addB = () => act(() => api('POST', '/blocks', { date: fv('d'), start: fv('s'), end: fv('en') }), 'Bloque agregado');
const delB = id => act(() => api('DELETE', '/blocks', { id }), 'Bloque eliminado');
const acceptRate = () => act(() => api('POST', '/my/rate', { accept: true }), 'Tarifa acordada');
const counterRate = () => act(() => api('POST', '/my/rate', { accept: false, rate: fv('nr') }), 'Contrapropuesta enviada a Skilly');

async function route() { await boot(vPro); }
route();
