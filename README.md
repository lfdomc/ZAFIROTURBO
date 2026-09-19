# Airbnb — Panel Rápido

Herramienta interna (no pública) para consultar de un vistazo la información
de cada propiedad y copiar los mensajes de check-in / check-out / welcome
listos para pegarle al huésped.

## Cómo instalar y correr en local

Requisitos: [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (por defecto `http://localhost:5173`).
Funciona igual de bien en el celular si accedés desde la misma red usando
tu IP local (`npm run dev -- --host` te da esa URL).

## Cómo editar la información

Toda la información (propiedades, unidades, mensajes, contactos, FAQs y el
cuadro de Inicio) vive en un solo lugar: el objeto `DATA` al inicio de
`src/App.jsx`. Para:

- **Editar un dato** (código de acceso, wifi, horario, etc.) → buscar la
  propiedad dentro de `DATA.properties` y cambiar el valor.
- **Agregar una propiedad nueva** → copiar el bloque de una propiedad
  parecida dentro de `DATA.properties` y agregar su fila correspondiente en
  `DATA.masterTable` (el cuadro que aparece en Inicio) con el mismo `id`
  en `propertyId`.
- **Editar un mensaje** (check-in, check-out, welcome, etc.) → dentro de
  `messages` (o `checkin`, en el caso de las unidades de Hermosa Palms).

No hace falta tocar ningún componente para estos cambios — el diseño lee
todo desde `DATA`.

## Generar una versión para subir a un hosting (opcional)

```bash
npm run build
```

Esto genera la carpeta `dist/` lista para subir a cualquier hosting
estático (Vercel, Netlify, GitHub Pages, etc.), aunque para uso personal
también podés simplemente correr `npm run dev` cada vez que lo necesites.

## Stack

- React 19 + Vite
- Tailwind CSS 4
- lucide-react (íconos)

<!-- forzando rebuild real -->
