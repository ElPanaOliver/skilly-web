function vRegEmp() {
  $('#app').innerHTML = `<div class="card" style="max-width:600px;margin:auto"><h1>Registra tu empresa</h1>${msg()}
    <p class="m">Al terminar entrarás directo al marketplace para contratar talento.</p>
    <div class="grid">
      <div><label for="name">Razón social</label><input id="name" autocomplete="organization" maxlength="120"></div>
      <div><label for="rut">RUT empresa</label><input id="rut" inputmode="text" autocomplete="off" maxlength="12" placeholder="76.123.456-7" aria-describedby="rut-hint"><p class="hint" id="rut-hint"></p></div>
      <div><label for="contacto">Contacto</label><input id="contacto" autocomplete="name" maxlength="120"></div>
      <div><label for="phone">Teléfono</label><input id="phone" type="tel" autocomplete="tel" maxlength="30"></div>
      <div><label for="industria">Industria</label><input id="industria" maxlength="120"></div>
      <div><label for="email">Correo corporativo</label><input id="email" type="email" autocomplete="email" maxlength="150"></div>
    </div>
    ${pwField('password', 'Contraseña')}
    <label for="password2">Repite la contraseña</label><input id="password2" type="password" autocomplete="new-password" maxlength="128"><p class="hint" id="password2-hint"></p>
    <div id="reg-msg"></div>
    <button id="reg-btn" onclick="reg('empresa')">Crear cuenta</button></div>`;
  bindRut('rut'); bindPw('password', 'password2');
}
async function route() { await boot(vRegEmp); }
route();
