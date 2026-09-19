// ============================================================================
// GENERA src/propiedades.json AUTOMÁTICAMENTE DESDE SUPABASE (vía el backend
// del bot en Railway), como parte de "npm run build" (ver package.json).
//
// App.jsx ya NO tiene los datos hardcodeados — hace
// `import DATA from "./propiedades.json"` y Vite lo empaqueta como JS en el
// build. Este script es lo que mantiene ese archivo sincronizado con lo
// último que se guardó desde la pestaña Admin (o Supabase directamente).
//
// Variables de entorno requeridas (configurar en Vercel -> Settings ->
// Environment Variables):
//   VITE_BOT_API_URL   — misma URL que usa la pestaña Admin del sitio
//   BOT_ADMIN_KEY      — la misma X-Admin-Key del backend (esta SOLO se usa
//                        acá, en build time server-side; nunca llega al
//                        navegador, a diferencia de VITE_BOT_API_URL)
// ============================================================================

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, "..", "src", "propiedades.json");

const BOT_API_URL = process.env.VITE_BOT_API_URL;
const BOT_ADMIN_KEY = process.env.BOT_ADMIN_KEY;

if (!BOT_API_URL || !BOT_ADMIN_KEY) {
  console.warn(
    "⚠️  VITE_BOT_API_URL o BOT_ADMIN_KEY no están configuradas — se usa el " +
    "src/propiedades.json que ya está en el repo (posiblemente desactualizado) " +
    "en vez de traer la versión más reciente de Supabase."
  );
  process.exit(0);
}

const resp = await fetch(`${BOT_API_URL}/export/propiedades.json`, {
  headers: { "X-Admin-Key": BOT_ADMIN_KEY },
});

if (!resp.ok) {
  console.error(`❌ No se pudo exportar desde el backend: HTTP ${resp.status} ${resp.statusText}`);
  console.error("   Se sigue con el src/propiedades.json existente en el repo.");
  process.exit(0); // no rompe el build — mejor un sitio con datos viejos que un build fallido
}

const datos = await resp.json();
writeFileSync(outputPath, JSON.stringify(datos, null, 2), "utf-8");

console.log(`✅ propiedades.json actualizado desde Supabase (${datos.properties?.length ?? 0} propiedades).`);
