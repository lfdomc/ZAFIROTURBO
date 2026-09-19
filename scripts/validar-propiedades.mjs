// ============================================================================
// VALIDADOR de src/propiedades.json — corre como parte de "npm run build"
// (ver package.json), DESPUÉS de generar-propiedades.mjs.
//
// Antes esto también revisaba App.jsx en busca de campos duplicados dentro
// de una unidad (un bug de JS: una clave repetida en un objeto se pisa en
// silencio). Esa clase de bug ya no puede pasar — los datos ahora viven en
// Supabase, no hardcodeados en el código fuente — así que esta versión solo
// valida la ESTRUCTURA del JSON ya generado, para atrapar el mismo tipo de
// problema real que motivó este script originalmente (ej. una unidad sin
// "images" que rompía la página completa al abrirla).
//
// Un array "properties" vacío NO es un error — es el estado normal antes de
// la primera importación desde el panel Admin (huevo y gallina: el sitio
// tiene que poder construirse para poder usar el botón de importar). Solo se
// valida la estructura de las propiedades que SÍ existen.
//
// Si imprime "❌", el build se detiene (exit code 1). Si todo está bien,
// imprime "✅" y la build sigue hacia vite build.
// ============================================================================

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const propiedadesJsonPath = join(__dirname, "..", "src", "propiedades.json");

const errores = [];
const avisos = [];

let data;
try {
  data = JSON.parse(readFileSync(propiedadesJsonPath, "utf-8"));
} catch (e) {
  errores.push(`No se pudo leer/parsear src/propiedades.json: ${e.message}`);
}

const GRUPOS_VALIDOS = ["sanjose", "jaco", "guanacaste"];
const idsVistos = new Set();

if (data && !Array.isArray(data.properties)) {
  errores.push('El JSON no tiene "properties" (debería ser al menos un array, aunque esté vacío).');
} else if (data && data.properties.length === 0) {
  avisos.push('No hay ninguna propiedad cargada todavía — normal antes de la primera importación desde el panel Admin. El sitio se va a ver vacío hasta que importes datos.');
}

if (data && Array.isArray(data.properties)) {
  data.properties.forEach((p) => {
    if (!p.id) { errores.push(`Una propiedad no tiene "id".`); return; }
    if (idsVistos.has(p.id)) errores.push(`El id "${p.id}" está repetido en más de una propiedad.`);
    idsVistos.add(p.id);

    if (!p.name) errores.push(`Propiedad "${p.id}" no tiene "name".`);
    if (!p.group) {
      errores.push(`Propiedad "${p.id}" no tiene "group" — no va a aparecer agrupada en el menú.`);
    } else if (!GRUPOS_VALIDOS.includes(p.group)) {
      errores.push(`Propiedad "${p.id}" tiene group="${p.group}", que no es uno de los válidos (${GRUPOS_VALIDOS.join(", ")}) — revisar si es un typo.`);
    }

    const idsUnidad = new Set();
    (p.units || []).forEach((u) => {
      if (!u.id) { errores.push(`Una unidad de "${p.id}" no tiene "id".`); return; }
      if (idsUnidad.has(u.id)) errores.push(`Unidad "${u.id}" repetida dentro de "${p.id}".`);
      idsUnidad.add(u.id);
      if (!u.name) errores.push(`Unidad "${u.id}" no tiene "name".`);

      if (u.listing) {
        if (!u.listing.images || u.listing.images.length === 0) {
          errores.push(`Unidad "${u.id}": tiene "listing" pero sin "images" (o vacío) — esto rompe la página completa al abrirla.`);
        }
        if (!u.listing.url) avisos.push(`Unidad "${u.id}": el listing no tiene "url".`);
      }

      if (!u.rooms && !u.pax) {
        avisos.push(`Unidad "${u.id}": no tiene "rooms" ni "pax" — puede faltar info de capacidad.`);
      }
    });

    if (!p.units || p.units.length === 0) {
      avisos.push(`Propiedad "${p.id}" no tiene ninguna unidad cargada.`);
    }
  });
}

if (avisos.length > 0) {
  console.log(`\n⚠️  ${avisos.length} aviso(s) (no frenan la build, pero conviene revisarlos):`);
  avisos.forEach((a) => console.log(`   - ${a}`));
}

if (errores.length > 0) {
  console.error(`\n❌ ${errores.length} error(es) encontrados — la build se detiene:\n`);
  errores.forEach((e) => console.error(`   - ${e}`));
  console.error("\nCorregí esto desde la pestaña Admin (o en Supabase) y volvé a correr npm run build.\n");
  process.exit(1);
}

console.log(`✅ Validación de propiedades.json completa: ${(data.properties || []).length} propiedades revisadas, sin errores.`);
