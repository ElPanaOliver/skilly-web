// Servicios destacados en el inicio (cambia esta lista para mostrar otros); el resto está en el catálogo completo
const DESTACADOS = ['desarrollo', 'datos-ia', 'diseno', 'marketing', 'finanzas', 'legal'];
$('#mini-cat').innerHTML = DESTACADOS.map(id => catPorId(id)).map(c => `<a class="mini" href="marketplace.html#${c.id}">
  <span class="cat-ico">${c.icono}</span><b>${esc(c.nombre)}</b><span class="m">${esc(c.desc)}</span></a>`).join('');
async function route() { await boot(() => {}); }
route();
