let PROS = [], CFG = {};

// Categoría a la que pertenece un profesional (las que no están en el catálogo van a "Otros servicios")
const catDe = p => (esCatalogo(p.categoria) ? CATALOGO.find(c => c.nombre === p.categoria) : OTROS);
const prosDe = c => PROS.filter(p => catDe(p).id === c.id);
const verCat = id => { location.hash = id; };
const verCatalogo = () => { history.pushState('', '', location.pathname); renderMarket(); window.scrollTo({ top: 0 }); };

const proCard = p => {
  const ini = esc(p.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase());
  return `<article class="card pro">
  <div class="pro-head"><span class="avatar" aria-hidden="true">${ini}</span>
    <div><h2>${esc(p.name)}</h2>
    <div class="tags"><span class="tag">${esc(p.categoria || 'General')}</span><span class="tag">${esc(p.anios || '—')} años de trayectoria</span></div></div></div>
  <p class="price">${clp(p.rate)}<span class="m"> /hora · tarifa fijada por el profesional</span></p>
  <div class="m">Bloques disponibles</div>
  <div class="slots">${p.blocks.map(b => `<div class="slot"><span>${slot(b)}</span><a class="btn g" href="reservar.html?id=${esc(b.id)}">Reservar</a></div>`).join('')
    || '<span class="m">Sin disponibilidad por ahora</span>'}</div>
</article>`;
};

const catCard = c => {
  const n = prosDe(c).length;
  return `<button type="button" class="cat-card" onclick="verCat('${c.id}')" aria-label="Ver profesionales de ${esc(c.nombre)}">
    <span class="cat-ico">${c.icono}</span>
    <span class="cat-name">${esc(c.nombre)}</span>
    <span class="cat-desc">${esc(c.desc)}</span>
    <span class="cat-foot"><span class="badge ${n ? 'b-activo' : ''}">${n} ${n === 1 ? 'profesional' : 'profesionales'}</span><span class="cat-go" aria-hidden="true">Ver →</span></span>
  </button>`;
};

function renderPros() {
  const c = catPorId(location.hash.slice(1));
  const q = fv('q').trim().toLowerCase();
  const list = prosDe(c).filter(p => !q || p.name.toLowerCase().includes(q));
  $('#list').innerHTML = list.map(proCard).join('') || empty(prosDe(c).length
    ? 'No hay profesionales que coincidan con tu búsqueda.'
    : 'Aún no hay profesionales activos en esta categoría. <a href="registro-profesional.html">Únete como talento</a> o <a href="#" onclick="verCatalogo();return false">explora otras categorías</a>.');
}

function renderMarket() {
  const c = catPorId(location.hash.slice(1));
  if (!c) {
    const extra = PROS.some(p => !esCatalogo(p.categoria)) ? [OTROS] : [];
    $('#app').innerHTML = `
      <section class="page-hero"><h1>Catálogo de servicios</h1>
        <p>Elige el tipo de servicio que necesitas y te mostramos a los profesionales disponibles. El pago queda en custodia de Skilly hasta que el servicio se complete. El primer servicio no requiere cuenta.</p></section>
      ${msg()}
      <div class="cat-grid">${[...CATALOGO, ...extra].map(catCard).join('')}</div>`;
    return;
  }
  $('#app').innerHTML = `
    <nav class="crumbs" aria-label="Ruta"><a href="#" onclick="verCatalogo();return false">Catálogo</a><span aria-hidden="true">›</span><span aria-current="page">${esc(c.nombre)}</span></nav>
    <section class="page-hero compact"><div class="row between"><div><h1><span class="h-ico">${c.icono}</span>${esc(c.nombre)}</h1>
      <p>${esc(c.desc)} Elige un profesional y un bloque de su disponibilidad (máx. ${esc(CFG.maxHours)} h).</p></div>
      <button class="s" onclick="verCatalogo()">← Volver al catálogo</button></div></section>
    ${msg()}
    <div class="toolbar one">
      <input id="q" type="search" placeholder="Buscar profesional por nombre" aria-label="Buscar profesional" oninput="renderPros()">
    </div>
    <div id="list" class="grid"></div>`;
  renderPros();
}

async function vMarket() {
  [PROS, CFG] = await Promise.all([api('GET', '/pros'), api('GET', '/config')]);
  renderMarket();
}
window.addEventListener('hashchange', () => { if (PROS.length || CFG.maxHours) { renderMarket(); window.scrollTo({ top: 0 }); } });

async function route() { await boot(vMarket); }
route();
