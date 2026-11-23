function vLogin() {
  $('#app').innerHTML = `<div class="card auth"><h1>Ingresar</h1>${msg()}
    <label for="e">Correo</label><input id="e" type="email" autocomplete="username">
    <label for="p">Contraseña</label><div class="pw"><input id="p" type="password" autocomplete="current-password" maxlength="128">
      <button type="button" class="s pw-eye" aria-label="Mostrar contraseña" aria-pressed="false" onclick="togglePw('p',this)">Ver</button></div>
    <div class="actions"><button class="g block" onclick="doLogin()">Iniciar sesión</button></div>
    <p class="m">¿Aún no tienes cuenta? <a href="index.html#contacto">Regístrate como empresa o como talento</a>.</p></div>`;
  $('#p').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
const doLogin = () => act(async () => setSession(await api('POST', '/login', { email: fv('e'), password: fv('p') })), '');

async function route() { await boot(vLogin); }
route();
