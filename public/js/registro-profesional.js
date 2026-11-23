function vRegPro(){$('#app').innerHTML=`<div class="card" style="max-width:600px;margin:auto"><h1>Únete a la red de talento</h1>${msg()}
 <p class="m">Tras registrarte, Skilly te contactará para una reunión (hasta 3 entrevistas) antes de activarte. No hay ranking público.</p><div class="grid">
 <div><label for="name">Nombre completo</label><input id="name" autocomplete="name" maxlength="120"></div>
 <div><label for="rut">RUT</label><input id="rut" autocomplete="off" maxlength="12" placeholder="12.345.678-5" aria-describedby="rut-hint"><p class="hint" id="rut-hint"></p></div>
 <div><label for="email">Correo</label><input id="email" type="email" autocomplete="email" maxlength="150"></div><div><label for="phone">Teléfono</label><input id="phone" type="tel" autocomplete="tel" maxlength="30"></div>
 <div><label>Categoría</label><select id="categoria">${CATALOGO.map(c => `<option>${esc(c.nombre)}</option>`).join('')}</select></div>
 <div><label>Años de trayectoria</label><input id="anios" type="number"></div>
 <div><label>Tu tarifa por hora (CLP)</label><input id="rate" type="number"></div><div><label>Perfil LinkedIn (obligatorio, público)</label><input id="linkedin" placeholder="https://linkedin.com/in/..."></div></div>
 ${pwField('password', 'Contraseña')}
 <label for="password2">Repite la contraseña</label><input id="password2" type="password" autocomplete="new-password" maxlength="128"><p class="hint" id="password2-hint"></p>
 <label><input type="checkbox" id="terms" style="width:auto"> Acepto T&C: estoy dispuesto a reunirme con Skilly, sin discriminación y con datos privados protegidos.</label>
 <div id="reg-msg"></div>
 <button id="reg-btn" onclick="reg('profesional')">Crear cuenta</button></div>`;
 bindRut('rut'); bindPw('password', 'password2');
}
async function route(){await boot(vRegPro)}
route();
