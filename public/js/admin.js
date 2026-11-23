async function vAdmin() {
  const o = await api('GET', '/admin/overview');
  const k = (l, v) => `<div class="card stat"><span class="m">${esc(l)}</span><span class="kpi">${esc(v)}</span></div>`;
  const abiertos = o.claims.filter(c => c.status === 'abierto').length;
  $('#app').innerHTML = `
    <div class="page-head"><div><h1>Panorama Skilly</h1><p class="m">Profesionales, reservas, reclamos y reputación interna.</p></div></div>
    ${msg()}
    <div class="grid">
      ${k('Empresas / Personas', o.empresas + ' / ' + o.clientes)}
      ${k('Reclamos abiertos', abiertos)}
      ${k('Profesionales activos', o.activos + ' / ' + o.pros)}
      ${k('Pendientes de entrevista', o.pendientes)}
      ${k('Reservas', o.reservas)}
      ${k('Agendadas', o.agendadas)}
      ${k('Completadas', o.completadas)}
      ${k('Canceladas', o.canceladas)}
      ${k('En custodia', clp(o.escrow))}
      ${k('Comisiones', clp(o.comisiones))}
    </div>

    <section class="card"><h2>Configuración</h2>
      <div class="row">
        <label>Comisión (%)<input id="cm" type="number" min="0" max="100" value="${esc(o.config.commission)}" style="width:110px"></label>
        <label>Penalización por cancelación (%)<input id="pn" type="number" min="0" max="100" value="${esc(o.config.penalty)}" style="width:110px"></label>
        <button class="s" onclick="cfg()">Guardar</button>
      </div>
    </section>

    <section class="card"><h2>Profesionales</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Estado</th><th>Tarifa</th><th>Entrevistas</th><th>Alertas</th><th>Acciones</th></tr></thead>
        <tbody>${o.pros_list.map(p => `<tr>
          <td><b>${esc(p.name)}</b><br>${p.linkedin ? `<a class="m" href="${esc(p.linkedin)}" target="_blank" rel="noopener noreferrer">Ver LinkedIn ↗</a>` : ''}</td>
          <td>${badge(p.status)}</td>
          <td>${clp(p.rate)}<br>${badge(p.rateStatus)}</td>
          <td>${p.interviews}/3</td><td>${p.strikes}/3</td>
          <td>
            <div class="row">
              <button class="s" onclick="pro('${esc(p.id)}','interview')">+ Entrevista</button>
              <button class="s" onclick="pro('${esc(p.id)}','approve')">Aprobar</button>
              <button class="s" onclick="pro('${esc(p.id)}','strike')">Alerta</button>
              <button class="s" onclick="pro('${esc(p.id)}','reject')">Dar de baja</button>
            </div>
            <div class="row" style="margin-top:6px">
              <input id="r${esc(p.id)}" type="number" min="1" placeholder="CLP/h" style="width:110px">
              <button class="s" onclick="rt('${esc(p.id)}',false)">Contraofertar</button>
              <button class="s" onclick="rt('${esc(p.id)}',true)">Acordar</button>
            </div>
          </td></tr>`).join('') || '<tr><td colspan="6" class="m">Sin profesionales registrados.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card"><h2>Reservas</h2>
      <p class="m">El veredicto final y la liberación del dinero los da siempre el cliente; Skilly solo media.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Servicio</th><th>Profesional</th><th>Total</th><th>Estado</th><th>Disputa</th></tr></thead>
        <tbody>${o.bookings.map(b => `<tr>
          <td>${esc(b.title)}</td><td>${esc(b.proName || '—')}</td><td>${clp(b.gross)}</td><td>${badge(b.status)}</td>
          <td>${b.status === 'en_disputa' ? `<small>${esc(b.dispute.reason)}${b.dispute.detail ? ': ' + esc(b.dispute.detail) : ''}</small><br>
            <button class="s" onclick="res('${esc(b.id)}','solucionado')">Marcar solucionado</button>` : '<span class="m">—</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="m">Sin reservas.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card"><h2>Transacciones Webpay</h2>
      <p class="m">Cada intento de pago con Transbank. El pago solo se da por bueno cuando el servidor lo confirma con Transbank.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Orden</th><th>Servicio</th><th>Monto</th><th>Tarjeta</th><th>Autorización</th><th>Modo</th><th>Estado</th></tr></thead>
        <tbody>${o.payments.map(p => `<tr>
          <td>${new Date(p.txDate || p.created).toLocaleString('es-CL')}</td>
          <td class="mono">${esc(p.id)}</td><td>${esc(p.servicio)}</td><td>${clp(p.amount)}</td>
          <td>${p.last4 ? '•••• ' + esc(p.last4) + (p.paymentType ? ' <span class="tag">' + esc(p.paymentType) + '</span>' : '') : '—'}</td>
          <td class="mono">${esc(p.authCode || '—')}</td><td><span class="tag">${esc(p.mode)}</span></td>
          <td>${badge(p.status)}${p.refundStatus ? '<br><span class="m">Reembolso: ' + esc(p.refundStatus) + '</span>' : ''}</td>
        </tr>`).join('') || '<tr><td colspan="8" class="m">Sin transacciones.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="card"><h2>Historial de reclamos</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Profesional</th><th>Motivo</th><th>Estado</th></tr></thead>
        <tbody>${o.claims.slice().reverse().map(c => `<tr>
          <td>${new Date(c.date).toLocaleDateString('es-CL')}</td>
          <td>${esc(c.cliente)} <span class="tag">${esc(c.tipo)}</span></td>
          <td>${esc(c.pro || '—')}</td>
          <td>${esc(c.reason)}${c.detail ? '<br><span class="m">' + esc(c.detail) + '</span>' : ''}</td>
          <td>${badge(c.status)}${c.how ? '<br><span class="m">' + esc(c.how) + '</span>' : ''}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="m">Sin reclamos.</td></tr>'}</tbody>
      </table></div>
    </section>

    <div class="two">
      <section class="card"><h2>Reputación: profesionales</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Servicios OK</th><th>Reclamos</th></tr></thead>
          <tbody>${o.pros_list.map(p => `<tr><td>${esc(p.name)}</td><td>${p.completados}</td><td>${p.reclamos}</td></tr>`).join('')}</tbody>
        </table></div></section>
      <section class="card"><h2>Reputación: clientes y empresas</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Servicios OK</th><th>Reclamos</th></tr></thead>
          <tbody>${o.clientesRep.map(c => `<tr><td>${esc(c.name)} <span class="tag">${esc(c.role)}</span></td><td>${c.servicios}</td><td>${c.reclamos}</td></tr>`).join('')}</tbody>
        </table></div></section>
    </div>

    <section class="card"><h2>Feedback privado de empresas</h2>
      <p class="m">Cada comentario lo escribe la empresa sobre el profesional que prestó el servicio. Solo lo ve Skilly.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Empresa que evalúa</th><th>Profesional evaluado</th><th>Servicio</th><th>Comentario</th></tr></thead>
        <tbody>${o.feedback.slice().reverse().map(f => `<tr>
          <td>${f.fecha ? new Date(f.fecha).toLocaleDateString('es-CL') : '—'}</td>
          <td><b>${esc(f.empresa)}</b></td>
          <td>${esc(f.pro || '—')}</td>
          <td>${esc(f.servicio || '—')}</td>
          <td>${esc(f.text)}</td>
        </tr>`).join('') || '<tr><td colspan="5" class="m">Sin feedback todavía.</td></tr>'}</tbody>
      </table></div>
    </section>`;
}

const pro = (id, action) => act(() => api('POST', '/admin/pro', { id, action }), 'Actualizado');
const rt = (id, accept) => act(() => api('POST', '/admin/pro', { id, action: 'rate', rate: fv('r' + id), accept }), 'Tarifa actualizada');
const cfg = () => act(() => api('POST', '/admin/config', { commission: fv('cm'), penalty: fv('pn') }), 'Configuración guardada');
const res = (id, action) => act(() => api('POST', '/admin/resolve', { id, action }), 'Disputa actualizada');

async function route() { await boot(vAdmin); }
route();
