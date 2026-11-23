// Pasarela de pago SIMULADA de Skilly (solo con TBK_MODE=simulado). Reemplaza la página de Transbank cuando no hay internet.
// No procesa tarjetas reales: solo reconoce las tarjetas de prueba publicadas por Transbank.
const TARJETAS = [['4051 8856 0044 6623', 'VISA crédito', 'Aprobada'], ['4051 8842 3993 7763', 'Redcompra débito', 'Aprobada'], ['5186 0595 5959 0568', 'MasterCard crédito', 'Rechazada']];

async function vSim() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const info = await api('GET', '/sim/info?token=' + encodeURIComponent(token));
  $('#app').innerHTML = `<section class="card sim"><span class="sim-flag">Simulación · no se cobra dinero</span>
    <h1>Pagar con tarjeta</h1><p class="m">Orden <span class="mono">${esc(info.orden)}</span></p>
    <div class="row between"><span class="m">Total a pagar</span><span class="price" style="margin:0">${clp(info.monto)}</span></div>
    <label for="card">Número de tarjeta</label><input id="card" inputmode="numeric" autocomplete="off" maxlength="23" placeholder="4051 8856 0044 6623">
    <div id="sim-msg"></div>
    <div class="actions"><button class="g" id="go">Pagar</button><button class="s" id="no">Anular compra</button></div>
    <details class="claim" open><summary>Tarjetas de prueba (toca una para usarla)</summary>
      <div class="cards">${TARJETAS.map(([n, t, r]) => `<button type="button" class="s" data-n="${n}"><span>${n}</span><span>${t} · ${r}</span></button>`).join('')}</div></details></section>`;
  document.querySelectorAll('.cards button').forEach(b => b.onclick = () => { $('#card').value = b.dataset.n; });
  const decide = async body => {
    try { const r = await api('POST', '/sim/decidir', { token, ...body }); location.href = r.redirect; }
    catch (e) { $('#sim-msg').innerHTML = `<p class="alert err" role="alert">${esc(e.message)}</p>`; }
  };
  $('#go').onclick = () => decide({ card: fv('card') });
  $('#no').onclick = () => decide({ cancel: true });
}
async function route() { await boot(vSim); }
route();
