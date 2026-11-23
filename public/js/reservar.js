async function vBook(id) {
  const pros = await api('GET', '/pros');
  const pro = id && pros.find(p => p.blocks.some(b => b.id === id));
  if (!pro) { location.href = 'marketplace.html'; return; }
  const b = pro.blocks.find(x => x.id === id), h = b.end - b.start, total = pro.rate * h;
  $('#app').innerHTML = `
    <div class="checkout">
      <section class="card">
        <h1>Checkout con custodia</h1>${msg()}
        <p><b>${esc(pro.name)}</b> · ${slot(b)} (${h} h)</p>
        <label for="t">Descripción del servicio</label>
        <input id="t" maxlength="120" placeholder="Ej: Conciliación bancaria">
        ${S.user ? '' : `<label for="ge">Tu correo (servicio como invitado)</label><input id="ge" type="email" autocomplete="email">`}
        <div class="pay-method"><span class="pm-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg></span>
          <div><b>Pago con Webpay Plus</b><span class="m">Tarjeta de crédito o débito. Te llevaremos al formulario seguro de Transbank y volverás aquí al terminar. Skilly nunca ve los datos de tu tarjeta.</span></div></div>
        <div class="box"><b>Pago en custodia</b>
          <ol>
            <li>Tu dinero queda retenido hasta que termine la reunión con el profesional.</li>
            <li>Si salió bien, eliges «Terminado» y el pago se libera automáticamente.</li>
            <li>Si no estás satisfecho, indicas el motivo y el dinero sigue retenido hasta resolver el problema.</li>
          </ol>
        </div>
        <p class="m">Ambiente de pruebas: no se realiza ningún cobro real. Cancelar con menos de 24 h puede generar penalización. Se puede reagendar solo una vez.</p>
        <div class="actions"><button id="pay" class="g">Pagar con Webpay</button></div>
      </section>
      <aside class="card summary">
        <h2>Resumen</h2>
        <div class="row"><span class="m">Tarifa</span><span>${clp(pro.rate)} /h</span></div>
        <div class="row"><span class="m">Horas</span><span>${h}</span></div>
        <hr style="border:0;border-top:1px solid var(--line)">
        <div class="row"><b>Total en custodia</b><span class="price" style="margin:0">${clp(total)}</span></div>
      </aside>
    </div>`;
  $('#pay').onclick = () => pay(b.id);
}

// Redirige al formulario de Transbank enviando token_ws por POST (así lo exige Webpay Plus)
function goWebpay(url, token) {
  const f = document.createElement('form');
  f.method = 'POST'; f.action = url;
  const i = document.createElement('input'); i.type = 'hidden'; i.name = 'token_ws'; i.value = token;
  f.appendChild(i); document.body.appendChild(f); f.submit();
}

async function pay(id) {
  const t = fv('t').trim();
  if (!t) { S.msg = ERR + 'Describe el servicio antes de pagar'; return route(); }
  const btn = $('#pay'); btn.disabled = true; btn.textContent = 'Conectando con Webpay…';
  try {
    const k = await api('POST', '/bookings', { blockId: id, title: t, guestEmail: S.user ? undefined : fv('ge') });
    const w = await api('POST', '/pay/init', { id: k.id, secret: k.secret });
    goWebpay(w.url, w.token);
  } catch (e) {
    S.msg = ERR + e.message; route();
  }
}

async function route() { await boot(() => vBook(new URLSearchParams(location.search).get('id'))); }
route();
