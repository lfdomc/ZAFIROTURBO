import React, { useState, useMemo, useEffect, useContext, createContext } from "react";
import { createPortal } from "react-dom";
import { Copy, Check, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Home, MessageSquareText, Phone, Menu, X, Calendar, CalendarDays, RefreshCw, Settings, Plus, Trash2, Save, Pencil, LayoutDashboard } from "lucide-react";
import DATA from "./propiedades.json";
import logoSofia from "./assets/logo-sofia.png";

// Blindaje: normaliza DATA una sola vez acá, para que todos los usos de
// DATA.general / DATA.properties / etc. en el resto del archivo sean
// seguros sin tener que tocar cada uno — cubre el caso de Supabase
// todavía vacío (antes de la primera importación) o cualquier campo
// que el backend no haya llegado a exportar todavía.
DATA.properties = Array.isArray(DATA.properties) ? DATA.properties : [];
DATA.masterTable = Array.isArray(DATA.masterTable) ? DATA.masterTable : [];
DATA.checkInGeneral = DATA.checkInGeneral || "";
DATA.checkOutGeneral = DATA.checkOutGeneral || "";
DATA.general = {
  mensajesFrecuentes: [], contactos: [], faqs: [],
  formulario: { texto: "", link: "", linkLabel: "" },
  comunicacion: null, reservaDirecta: null,
  ...(DATA.general || {}),
};
DATA.general.formulario = { texto: "", link: "", linkLabel: "", ...(DATA.general.formulario || {}) };

// URL del backend del bot (FastAPI en Railway) — se usa desde la pestaña Admin
// para leer/guardar propiedades en Supabase. Configurar en Vercel como variable
// de entorno VITE_BOT_API_URL; mientras no esté configurada, usa este valor de
// ejemplo (la pestaña Admin lo va a rechazar con un error claro).
const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || "https://tu-bot.up.railway.app";

// URL del Apps Script del CALENDARIO (proyecto separado del bot de Telegram,
// se encarga de sincronizar los links de iCal de Airbnb/Booking cada 30 min).
// Reemplazar por la URL real una vez publicado ese Apps Script como Web App
// (Implementar → Nueva implementación → Aplicación web → copiar la URL que
// termina en /exec). Mientras diga "PEGAR_AQUI", el calendario muestra datos
// de ejemplo para poder probar el diseño sin depender del script todavía.
const CALENDARIO_APPSCRIPT_URL = "PEGAR_AQUI_LA_URL_DEL_APPS_SCRIPT_DE_CALENDARIO";

// Quita tildes/diacríticos para que la búsqueda funcione con o sin acentos
// (ej. "huespedes" encuentra "huéspedes"). NFD + strip preserva la longitud
// del string 1 a 1, así que los índices siguen siendo válidos sobre el texto original.
function normalizeStr(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Contexto para resaltar el término buscado al llegar a una propiedad desde un resultado
const HighlightContext = createContext("");

function Highlight({ text }) {
  const term = useContext(HighlightContext);
  const str = text === undefined || text === null ? "" : String(text);
  const t = (term || "").trim();
  if (!t) return <>{str}</>;
  const normStr = normalizeStr(str);
  const normTerm = normalizeStr(t);
  if (!normTerm || !normStr.includes(normTerm)) return <>{str}</>;
  const parts = [];
  let idx = 0;
  let pos;
  while ((pos = normStr.indexOf(normTerm, idx)) !== -1) {
    if (pos > idx) parts.push(str.slice(idx, pos));
    parts.push(
      <mark key={pos} className="bg-yellow-200 text-slate-900 rounded px-0.5">
        {str.slice(pos, pos + normTerm.length)}
      </mark>
    );
    idx = pos + normTerm.length;
  }
  if (idx < str.length) parts.push(str.slice(idx));
  return <>{parts}</>;
}

// Metadatos visuales de cada grupo de propiedades (San José vs Guanacaste/Jacó)
const GROUP_META = {
  sanjose: {
    label: "San José",
    dot: "bg-indigo-500",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-700",
    pillActive: "bg-indigo-600",
    ring: "ring-indigo-200"
  },
  jaco: {
    label: "Jacó",
    dot: "bg-amber-500",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    pillActive: "bg-amber-600",
    ring: "ring-amber-200"
  },
  guanacaste: {
    label: "Guanacaste",
    dot: "bg-emerald-500",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    pillActive: "bg-emerald-600",
    ring: "ring-emerald-200"
  }
};

/* ============================================================================
   DATA ahora vive en ./propiedades.json — generado en build time desde
   Supabase (ver scripts/generar-propiedades.mjs). Para agregar o editar una
   propiedad, usa la pestaña Admin del sitio (o el panel/script del backend) —
   ya no se edita este archivo a mano.
   ============================================================================ */

// Mapa rápido propertyId -> grupo (San José / Playa), usado en la tabla de Inicio y el menú
const PROPERTY_GROUP = Object.fromEntries(DATA.properties.map((p) => [p.id, p.group]));

/* ============================================================================
   COMPONENTES
   ============================================================================ */

// Botón flotante de Telegram, fijo en pantalla (arriba de todo, no se va con el scroll)
function TelegramFloat() {
  return (
    <a
      href="https://t.me/Zafirocrbot"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat en Telegram"
      className="fixed bottom-5 right-5 z-[60] w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
    >
      <svg viewBox="0 0 240 240" width="56" height="56">
        <circle cx="120" cy="120" r="120" fill="#29A9EB" />
        <path
          fill="white"
          d="M170.6,72.3l-20.3,95.6c-1.5,6.8-5.5,8.5-11.2,5.3l-31-22.9l-15,14.4c-1.7,1.7-3.1,3.1-6.2,3.1l2.2-31.6l57.5-52c2.5-2.2-0.5-3.5-3.9-1.2l-71.1,44.8l-30.7-9.6c-6.7-2.1-6.8-6.7,1.4-9.9l120.1-46.3C167.5,60.1,172.2,63.4,170.6,72.3z"
        />
      </svg>
    </a>
  );
}


function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      onClick={onCopy}
      className={`flex items-center gap-1.5 rounded-full font-medium transition-all active:scale-95 ${
        copied ? "bg-emerald-600 text-white" : "bg-blue-900 text-white active:bg-blue-950"
      } ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
    >
      {copied ? <Check size={small ? 14 : 16} /> : <Copy size={small ? 14 : 16} />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

// Quita el sufijo "(Español)" del título para poder agrupar la versión en
// inglés y en español del mismo mensaje bajo un mismo título base.
function tituloBase(titulo) {
  return (titulo || "").replace(/\s*\(español\)\s*$/i, "").trim();
}

function esVersionEspanol(titulo) {
  return /\(español\)/i.test(titulo || "");
}

// Clasifica el mensaje por tipo (check-in / check-out / bienvenida / otro)
// para poder darle un color de fondo tenue distinto a cada uno.
function tipoDeMensaje(tituloBaseTexto) {
  const t = (tituloBaseTexto || "").toLowerCase();
  if (/welcome|bienvenida/.test(t)) return "bienvenida";
  if (/check[\s-]?in/.test(t)) return "checkin";
  if (/check[\s-]?out/.test(t)) return "checkout";
  return "otro";
}

// Colores muy tenues por tipo de mensaje (gris verdoso = check-in,
// gris rojizo = check-out, gris = bienvenida, blanco = el resto).
const ESTILOS_TIPO_MENSAJE = {
  checkin: { card: "#14231c", border: "#23392c", body: "#0f1a14" },
  checkout: { card: "#251a1a", border: "#3a2626", body: "#1a1212" },
  bienvenida: { card: "#16202f", border: "#26364d", body: "#101825" },
  otro: { card: "#131c2e", border: "#253150", body: "#0f1728" }
};

// Agrupa un array de mensajes por título base, juntando la versión en
// inglés y en español (si existe) del mismo mensaje en un solo grupo.
function agruparMensajesPorIdioma(mensajes) {
  const grupos = [];
  const indice = {};
  (mensajes || []).forEach((m) => {
    const base = tituloBase(m.title);
    if (!(base in indice)) {
      indice[base] = grupos.length;
      grupos.push({ base, variantes: [] });
    }
    grupos[indice[base]].variantes.push({ lang: esVersionEspanol(m.title) ? "es" : "en", msg: m });
  });
  // Orden fijo: Bienvenida primero, después Check In, después Check Out,
  // y cualquier otro tipo de mensaje al final (en el orden en que aparecía).
  const ORDEN_TIPO = { bienvenida: 0, checkin: 1, checkout: 2, otro: 3 };
  grupos.forEach((g, i) => { g._orden = i; }); // para mantener estable el orden dentro de un mismo tipo
  grupos.sort((a, b) => {
    const diff = ORDEN_TIPO[tipoDeMensaje(a.base)] - ORDEN_TIPO[tipoDeMensaje(b.base)];
    return diff !== 0 ? diff : a._orden - b._orden;
  });
  return grupos;
}

// Tarjeta de mensaje con pestañas Inglés/Español (si hay ambas versiones) y
// color de fondo tenue según el tipo (check-in, check-out, bienvenida, otro).
// Saca del cuerpo del mensaje cualquier "nota interna" (marcada con
// "⚠️ Nota interna:") para mostrarla aparte, como alerta junto al título —
// así nunca se cuela dentro del texto que se copia para mandarle al huésped.
function separarNotaInterna(body) {
  const texto = body || "";
  const regex = /(^|\n)\s*⚠️\s*Nota interna:?\s*([\s\S]*?)(?=\n\s*\n|$)/i;
  const match = texto.match(regex);
  if (!match) return { nota: null, cuerpo: texto };
  const nota = match[2].trim();
  const cuerpo = texto.replace(match[0], "").replace(/\n{3,}/g, "\n\n").trim();
  return { nota, cuerpo };
}

function MessageCard({ msg, variantes: variantesProp, baseTitle: baseTitleProp }) {
  const variantes = variantesProp || [{ lang: esVersionEspanol(msg.title) ? "es" : "en", msg }];
  const base = baseTitleProp || tituloBase(msg.title);
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(true);
  const activa = variantes[Math.min(tab, variantes.length - 1)].msg;
  const estilo = ESTILOS_TIPO_MENSAJE[tipoDeMensaje(base)];
  const { nota, cuerpo } = separarNotaInterna(activa.body);

  return (
    <div className="rounded-2xl border overflow-hidden min-w-0" style={{ backgroundColor: estilo.card, borderColor: estilo.border }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquareText size={16} className="text-blue-900 shrink-0" />
          <span className="font-semibold text-slate-800 text-sm truncate"><Highlight text={base} /></span>
          {nota && (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
              ⚠️ Falta info
            </span>
          )}
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {nota && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              <Highlight text={nota} />
            </div>
          )}
          {variantes.length > 1 && (
            <div className="flex gap-1.5 mb-3">
              {variantes.map((v, i) => (
                <button
                  key={v.lang}
                  onClick={() => setTab(i)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    i === tab ? "bg-blue-900 text-white" : "bg-white text-slate-600 border border-slate-300"
                  }`}
                >
                  {v.lang === "es" ? "🇪🇸 Español" : "🇬🇧 English"}
                </button>
              ))}
            </div>
          )}
          <pre
            className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-600 rounded-xl p-3 mb-3 max-h-72 overflow-y-auto"
            style={{ backgroundColor: estilo.body }}
          >
            <Highlight text={cuerpo} />
          </pre>
          <CopyButton text={cuerpo} />
        </div>
      )}
    </div>
  );
}

function Lightbox({ images, index, title, onClose, onNav }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white p-2 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
        aria-label="Cerrar"
      >
        <X size={22} />
      </button>

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(-1); }}
          className="absolute left-2 sm:left-4 text-white p-2 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          aria-label="Anterior"
        >
          <ChevronLeft size={26} />
        </button>
      )}

      <img
        src={images[index]}
        alt={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg"
      />

      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNav(1); }}
          className="absolute right-2 sm:right-4 text-white p-2 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          aria-label="Siguiente"
        >
          <ChevronRight size={26} />
        </button>
      )}

      <div className="absolute bottom-4 text-white text-xs" style={{ opacity: 0.8 }}>{index + 1} / {images.length}</div>
    </div>,
    document.body
  );
}

function ListingGallery({ listing }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  // Si por algún motivo la ficha no tiene fotos cargadas, no rompemos la
  // página entera — simplemente no mostramos esta sección.
  if (!listing.images || listing.images.length === 0) return null;
  const navigate = (dir) => {
    setLightboxIndex((i) => (i + dir + listing.images.length) % listing.images.length);
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-w-0">
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto p-2 no-scrollbar snap-x snap-mandatory scroll-pl-2">
          {listing.images.map((src, i) => (
            <button key={i} onClick={() => setLightboxIndex(i)} className="shrink-0 snap-start">
              <img src={src} alt={listing.title} className="h-32 w-48 sm:h-36 sm:w-52 object-cover rounded-xl bg-slate-100" loading="lazy" />
            </button>
          ))}
        </div>
        {listing.images.length > 1 && (
          <>
            <div className="pointer-events-none absolute top-2 bottom-2 right-2 w-10 bg-gradient-to-l from-white to-transparent rounded-r-xl" />
            <span className="pointer-events-none absolute top-3 right-3 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
              {listing.images.length} fotos
            </span>
          </>
        )}
      </div>
      <div className="px-4 pb-4 pt-1 min-w-0">
        <p className="font-semibold text-slate-800 text-sm"><Highlight text={listing.title} /></p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1 mb-2">
          <span>{listing.guests} huéspedes</span>
          <span>·</span>
          <span>{listing.bedrooms} hab.</span>
          <span>·</span>
          <span>{listing.beds} camas</span>
          <span>·</span>
          <span>{listing.bathrooms} baños</span>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-3 break-words"><Highlight text={listing.description} /></p>
        {listing.images.length > 1 && (
          <button
            onClick={() => setLightboxIndex(0)}
            className="text-xs text-slate-500 mb-2 flex items-center gap-1"
          >
            Ver las {listing.images.length} fotos en pantalla completa <ChevronRight size={12} />
          </button>
        )}
        {listing.url && listing.url !== listing.airbnbUrl && (
          <a href={listing.url} target="_blank" rel="noreferrer" className="text-blue-900 text-xs font-semibold underline">
            Ver ficha pública en Zafiro PM ↗
          </a>
        )}
        {listing.airbnbUrl && (
          <a href={listing.airbnbUrl} target="_blank" rel="noreferrer" className="block text-blue-900 text-xs font-semibold underline mt-1">
            Ver anuncio en Airbnb ↗
          </a>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={listing.images}
          index={lightboxIndex}
          title={listing.title}
          onClose={() => setLightboxIndex(null)}
          onNav={navigate}
        />
      )}
    </div>
  );
}

function InfoRow({ k, v }) {
  const esLink = typeof v === "string" && /^https?:\/\//.test(v.trim());
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm break-inside-avoid">
      <span className="text-slate-500 shrink-0"><Highlight text={k} /></span>
      {esLink ? (
        <a href={v} target="_blank" rel="noreferrer" className="text-blue-900 font-semibold text-right underline break-all min-w-0">
          {v} ↗
        </a>
      ) : (
        <span className="text-slate-800 font-medium text-right break-words min-w-0"><Highlight text={v} /></span>
      )}
    </div>
  );
}

function GuiaDigitalCard({ guia }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      {guia.nota && <p className="text-sm text-slate-600 mb-1">{guia.nota}</p>}
      {guia.comoLlegar && (
        <a href={guia.comoLlegar} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm font-semibold underline break-all">
          Cómo llegar (Google Maps) ↗
        </a>
      )}
      <a href={guia.url} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm font-semibold underline break-all">
        Abrir guía digital ↗
      </a>
      {guia.whatsappConcierge && (
        <a href={guia.whatsappConcierge} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm underline break-all">
          WhatsApp concierge de experiencias (Localbird) ↗
        </a>
      )}
      {guia.linkReview && (
        <a href={guia.linkReview} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm underline break-all">
          Link de reseña en Airbnb ↗
        </a>
      )}
      {guia.linkReservaDirecta && (
        <a href={guia.linkReservaDirecta} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm underline break-all">
          Link de reserva directa (Zafiro PM) ↗
        </a>
      )}
    </div>
  );
}

function UnitCard({ unit }) {
  const [open, setOpen] = useState(true);
  const hasDetail = (unit.rooms && unit.rooms.length) || (unit.extra && unit.extra.length) || unit.checkin || unit.listing || unit.guiaDigital;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm break-words"><Highlight text={unit.name} />{unit.num ? ` · ${unit.num}` : ""}</p>
          {unit.listing && unit.listing.airbnbTitle && (
            <p className="text-xs text-slate-400 italic mt-0.5"><Highlight text={unit.listing.airbnbTitle} /> (Airbnb)</p>
          )}
        </div>
        {hasDetail && (
          <button onClick={() => setOpen(!open)} className="text-blue-900 text-xs font-medium shrink-0 flex items-center gap-0.5">
            {open ? "Ocultar" : "Detalle"} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {unit.note && (
        <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <Highlight text={unit.note} />
        </div>
      )}

      <div className="mt-2 space-y-0.5 min-w-0">
        <InfoRow k="Pax" v={unit.pax} />
        {unit.parqueo && <InfoRow k="Parqueo" v={unit.parqueo} />}
        {unit.accessCode && <InfoRow k="Acceso" v={unit.accessCode} />}
        {unit.forms && <InfoRow k="Formulario" v={unit.forms} />}
        {unit.correo && <InfoRow k="Correo recepción" v={unit.correo} />}
        {unit.whatsapp && <InfoRow k="WhatsApp caseta" v={unit.whatsapp} />}
        {unit.app && <InfoRow k="Ingreso app" v={unit.app} />}
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 min-w-0">
          {unit.extra && unit.extra.length > 0 && (
            <div>
              {unit.extra.map(([k, v]) => <InfoRow key={k} k={k} v={v} />)}
            </div>
          )}
          {unit.rooms && unit.rooms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Habitaciones</p>
              <ul className="space-y-1">
                {unit.rooms.map((r, i) => <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-blue-800">•</span><Highlight text={r} /></li>)}
              </ul>
            </div>
          )}
          {unit.listing && <ListingGallery listing={unit.listing} />}
          {unit.guiaDigital && <GuiaDigitalCard guia={unit.guiaDigital} />}
          {!unit.guiaDigital && unit.comoLlegar && (
            <a href={unit.comoLlegar} target="_blank" rel="noreferrer" className="block text-blue-900 text-sm font-semibold underline break-all">
              Cómo llegar (Google Maps) ↗
            </a>
          )}
          {unit.checkin && (
            Array.isArray(unit.checkin)
              ? agruparMensajesPorIdioma(unit.checkin).map((g) => (
                  <MessageCard key={g.base} msg={g.variantes[0].msg} variantes={g.variantes} baseTitle={g.base} />
                ))
              : <MessageCard msg={unit.checkin} />
          )}
        </div>
      )}
    </div>
  );
}

function PropertyView({ property }) {
  const gm = GROUP_META[property.group];
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold text-slate-900"><Highlight text={property.name} /></h2>
          {gm && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${gm.badgeBg} ${gm.badgeText}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${gm.dot}`} />
              {gm.label}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500"><Highlight text={property.zone} />{property.owner && property.owner !== "—" ? <> · Dueño: <Highlight text={property.owner} /></> : ""}</p>
      </div>

      {property.note && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <Highlight text={property.note} />
        </div>
      )}

      {property.requisitosCheckIn && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            ⚠️ Requisitos para el Check-In
          </p>
          <p className="text-sm font-semibold text-white"><Highlight text={property.requisitosCheckIn.resumen} /></p>
          {property.requisitosCheckIn.detalle && (
            <p className="text-sm text-white/90 mt-1"><Highlight text={property.requisitosCheckIn.detalle} /></p>
          )}
          {property.requisitosCheckIn.link && (
            <a
              href={property.requisitosCheckIn.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm font-semibold text-white underline"
            >
              {property.requisitosCheckIn.linkLabel || "Abrir enlace"} →
            </a>
          )}
        </div>
      )}

      {property.quickInfo && property.quickInfo.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Datos generales</p>
          <div className="lg:columns-2 lg:gap-x-8">
            {property.quickInfo.map(([k, v]) => <InfoRow key={k} k={k} v={v} />)}
          </div>
        </div>
      )}

      {property.rules && property.rules.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Horarios de áreas comunes</p>
          <ul className="space-y-1.5 lg:columns-2 lg:gap-x-8">
            {property.rules.map((r, i) => <li key={i} className="text-sm text-slate-700 flex gap-2 break-inside-avoid"><span className="text-blue-800">•</span><Highlight text={r} /></li>)}
          </ul>
        </div>
      )}

      {property.units && property.units.length > 0 && (
        <div className="space-y-2 min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Unidades</p>
          <div className="grid gap-3 lg:grid-cols-2 min-w-0">
            {property.units.map((u) => <UnitCard key={u.id} unit={u} />)}
          </div>
        </div>
      )}

      {property.correoTemplate && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Correo interno</p>
          <MessageCard msg={property.correoTemplate} />
        </div>
      )}

      {property.messages && property.messages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Mensajes para el huésped</p>
          <div className="grid gap-3 lg:grid-cols-2 min-w-0">
            {agruparMensajesPorIdioma(property.messages).map((g) => (
              <MessageCard key={g.base} msg={g.variantes[0].msg} variantes={g.variantes} baseTitle={g.base} />
            ))}
          </div>
        </div>
      )}

      {property.publicInfo && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Amenidades y reglas · ficha pública Zafiro PM</p>
          <PublicInfoCard info={property.publicInfo} />
        </div>
      )}

      {property.localExperiences && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Experiencias y actividades cercanas · Localbird</p>
          <LocalExperiencesCard info={property.localExperiences} />
        </div>
      )}

      {property.guiaDigital && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Guía digital del huésped</p>
          <GuiaDigitalCard guia={property.guiaDigital} />
        </div>
      )}
    </div>
  );
}

function LocalExperiencesCard({ info }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-slate-800 text-sm">Tours, actividades y experiencias</span>
        {open ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-sm text-slate-600 break-words">{info.resumen}</p>

          {info.categorias && info.categorias.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Categorías</p>
              <div className="flex flex-wrap gap-1.5">
                {info.categorias.map((c, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{c}</span>
                ))}
              </div>
            </div>
          )}

          {info.destacados && info.destacados.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Algunas destacadas</p>
              <ul className="space-y-1.5">
                {info.destacados.map((d, i) => (
                  <li key={i} className="text-sm text-slate-700 flex justify-between gap-2">
                    <span>{d.nombre}</span>
                    <span className="text-slate-400 shrink-0">{d.precio}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400 italic mt-2">Precios y ofertas cambian seguido — confirmar siempre en el link antes de citarle un precio a un huésped.</p>
            </div>
          )}

          <a href={info.url} target="_blank" rel="noreferrer" className="text-blue-900 text-xs font-semibold underline">
            Ver todas las experiencias en Localbird ↗
          </a>
        </div>
      )}
    </div>
  );
}

function PublicInfoCard({ info }) {
  const [open, setOpen] = useState(true);
  const rulesText = (info.rules || []).map((r) => `• ${r}`).join("\n");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden min-w-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-semibold text-slate-800 text-sm">Amenidades y reglas de la casa</span>
        {open ? <ChevronUp size={18} className="text-slate-400 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {info.amenities && info.amenities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Amenidades</p>
              <div className="flex flex-wrap gap-1.5">
                {info.amenities.map((a, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg"><Highlight text={a} /></span>
                ))}
              </div>
            </div>
          )}

          {info.nearby && info.nearby.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cerca de la propiedad</p>
              <ul className="space-y-1">
                {info.nearby.map((n, i) => {
                  const isLink = n && typeof n === "object";
                  const text = isLink ? n.text : n;
                  return (
                    <li key={i} className="text-sm text-slate-700 flex gap-2 break-words">
                      <span className="text-blue-800">•</span>
                      {isLink ? (
                        <a href={n.url} target="_blank" rel="noreferrer" className="text-blue-900 underline">
                          <Highlight text={text} />
                        </a>
                      ) : (
                        <Highlight text={text} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {info.rules && info.rules.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reglas de la casa</p>
                <CopyButton text={rulesText} small />
              </div>
              <ul className="space-y-1.5">
                {info.rules.map((r, i) => <li key={i} className="text-sm text-slate-700 flex gap-2 break-words"><span className="text-blue-800">•</span><Highlight text={r} /></li>)}
              </ul>
            </div>
          )}

          {info.note && (
            <p className="text-xs text-slate-400 italic"><Highlight text={info.note} /></p>
          )}
        </div>
      )}
    </div>
  );
}
function Badge({ label, value }) {
  const positive = /^(SI|S[Ií])/i.test(value) || (value.toUpperCase().startsWith("SI"));
  const neutral = value === "—";
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
        neutral ? "bg-slate-100 text-slate-400" : positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
      title={label}
    >
      {label}: {value.length > 14 ? value.slice(0, 14) + "…" : value}
    </span>
  );
}

function MasterTableRow({ row, onOpen }) {
  const gm = GROUP_META[PROPERTY_GROUP[row.propertyId]];
  return (
    <button
      onClick={() => onOpen(row.propertyId)}
      className={`w-full text-left rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center gap-3 active:bg-slate-50 transition-colors relative overflow-hidden`}
    >
      {gm && <span className={`absolute left-0 top-0 bottom-0 w-1 ${gm.dot}`} />}
      <div className="min-w-0 flex-1 pl-1.5">
        <p className="font-semibold text-slate-800 text-sm truncate">{row.property}</p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{row.unit} · Pax {row.pax}</p>
        <p className="text-xs text-slate-400 truncate mt-0.5">Parqueo: {row.parqueo}</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          <Badge label="Form" value={row.forms} />
          <Badge label="WSP" value={row.whatsapp} />
          <Badge label="App" value={row.app} />
        </div>
      </div>
      <ChevronRight size={18} className="text-slate-300 shrink-0" />
    </button>
  );
}

// ============================================================================
// CALENDARIO — vista multicalendario tipo Hostify: propiedades en filas,
// fechas en columnas, con barras de color por reserva. Los datos vienen del
// Apps Script de sincronización de iCal (proyecto separado del bot de
// Telegram). Mientras esa URL no esté configurada, muestra datos de ejemplo
// para poder probar el diseño.
// ============================================================================

const FUENTE_COLOR = {
  airbnb: { bg: "#FF5A5F", label: "Airbnb", inicial: "A" },
  booking: { bg: "#003580", label: "Booking.com", inicial: "B" },
  vrbo: { bg: "#3D67FF", label: "Vrbo", inicial: "V" },
  manual: { bg: "#64748b", label: "Bloqueo manual", inicial: "M" },
  otro: { bg: "#94a3b8", label: "Otro", inicial: "?" }
};

// Mismos colores que ya usa GROUP_META para cada región en el menú de
// navegación (índigo = San José, ámbar = Jacó, esmeralda = Guanacaste),
// acá en formato hex para usarlos como borde de color en el calendario.
const REGION_BORDE = {
  sanjose: "#6366f1",
  jaco: "#f59e0b",
  guanacaste: "#10b981",
  otro: "#94a3b8"
};

function formatearISO(d) {
  return d.toISOString().slice(0, 10);
}

function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

function diasEntre(a, b) {
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.round((new Date(b) - new Date(a)) / msPorDia);
}

const DIAS_SEMANA_CORTO = ["D", "L", "M", "M", "J", "V", "S"];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Genera datos de ejemplo realistas (usando los nombres reales de tus
// propiedades y unidades) para poder ver y probar el calendario mientras
// se configura la sincronización real con Airbnb/Booking.
function generarCalendarioDeEjemplo() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fuentes = ["airbnb", "booking", "vrbo"];
  const nombresEjemplo = ["María José", "John Smith", "Alexandra Z.", "Rosa Kamelia", "Jonathan P.", "Kelsey Layne", "Fabrizio R.", null];
  let semilla = 42;
  const random = () => {
    semilla = (semilla * 9301 + 49297) % 233280;
    return semilla / 233280;
  };

  const propiedades = [];
  DATA.properties.forEach((p) => {
    (p.units || []).forEach((u) => {
      const reservas = [];
      let cursor = -Math.floor(random() * 10);
      for (let i = 0; i < 4; i++) {
        cursor += Math.floor(random() * 4) + 1;
        const duracion = Math.floor(random() * 6) + 2;
        reservas.push({
          inicio: formatearISO(sumarDias(hoy, cursor)),
          fin: formatearISO(sumarDias(hoy, cursor + duracion)),
          fuente: fuentes[Math.floor(random() * fuentes.length)],
          huesped: nombresEjemplo[Math.floor(random() * nombresEjemplo.length)]
        });
        cursor += duracion;
      }
      propiedades.push({
        propertyId: p.id,
        propertyName: p.name,
        unitId: u.id,
        // Algunos nombres ya incluyen el número (ej. "Oasis 1", "Casa Malinches
        // 26A") y otros no (ej. "Casa Celeste", num aparte) — solo agregamos
        // el número si no está ya incluido en el nombre, para no duplicarlo.
        unitName: (u.num && !u.name.includes(u.num)) ? `${u.name} ${u.num}` : u.name,
        reservas
      });
    });
  });

  return { actualizado: null, esEjemplo: true, propiedades };
}

function CalendarioView() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [offsetDias, setOffsetDias] = useState(0);
  const DIAS_VISIBLES = 21;

  const cargarDatos = () => {
    setCargando(true);
    const urlConfigurada = CALENDARIO_APPSCRIPT_URL && !CALENDARIO_APPSCRIPT_URL.includes("PEGAR_AQUI");
    if (!urlConfigurada) {
      setDatos(generarCalendarioDeEjemplo());
      setCargando(false);
      return;
    }
    fetch(CALENDARIO_APPSCRIPT_URL)
      .then((r) => r.json())
      .then((data) => {
        setDatos(data);
        setCargando(false);
      })
      .catch(() => {
        setDatos(generarCalendarioDeEjemplo());
        setCargando(false);
      });
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const rangoInicio = useMemo(() => sumarDias(hoy, offsetDias), [hoy, offsetDias]);
  const diasVisibles = useMemo(
    () => Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(rangoInicio, i)),
    [rangoInicio]
  );
  const rangoFin = diasVisibles[diasVisibles.length - 1];

  // Agrupar unidades por propiedad, preservando el orden de DATA.properties
  // Agrupar unidades por propiedad, y las propiedades por región (San José /
  // Jacó / Guanacaste), en ese orden — mismo criterio y colores que ya usa
  // el menú de navegación (GROUP_META).
  const filasPorRegion = useMemo(() => {
    if (!datos) return [];
    const grupoPorPropiedad = {};
    DATA.properties.forEach((p) => { grupoPorPropiedad[p.id] = p.group; });

    const porPropiedad = {};
    const ordenPropiedades = [];
    datos.propiedades.forEach((u) => {
      if (!porPropiedad[u.propertyId]) {
        porPropiedad[u.propertyId] = {
          propertyName: u.propertyName,
          group: grupoPorPropiedad[u.propertyId] || "otro",
          unidades: []
        };
        ordenPropiedades.push(u.propertyId);
      }
      porPropiedad[u.propertyId].unidades.push(u);
    });

    const regiones = { sanjose: [], jaco: [], guanacaste: [], otro: [] };
    ordenPropiedades.forEach((id) => {
      const grupo = porPropiedad[id];
      (regiones[grupo.group] || regiones.otro).push(grupo);
    });

    return ["sanjose", "jaco", "guanacaste", "otro"]
      .filter((r) => regiones[r].length > 0)
      .map((r) => ({ region: r, propiedades: regiones[r] }));
  }, [datos]);

  if (cargando) {
    return <p className="text-sm text-slate-400 text-center pt-10">Cargando calendario…</p>;
  }

  return (
    <div className="space-y-4 pb-6">
      {datos.esEjemplo && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠️ Mostrando datos de ejemplo — todavía no está configurada la sincronización real con Airbnb/Booking.
        </div>
      )}

      {/* Controles: navegación + leyenda + actualizar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOffsetDias((o) => o - 7)}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-100"
            aria-label="Semana anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setOffsetDias(0)}
            className="px-3 h-8 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-100"
          >
            Hoy
          </button>
          <button
            onClick={() => setOffsetDias((o) => o + 7)}
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 active:bg-slate-100"
            aria-label="Semana siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <span className="text-xs text-slate-500 ml-1 hidden sm:inline">
            {MESES_CORTO[rangoInicio.getMonth()]} {rangoInicio.getDate()} – {MESES_CORTO[rangoFin.getMonth()]} {rangoFin.getDate()}
          </span>
        </div>
        <button
          onClick={cargarDatos}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-100"
        >
          <RefreshCw size={13} />
          Actualizar
        </button>
      </div>

      {/* Leyenda de colores */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(FUENTE_COLOR).map(([key, v]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: v.bg }} />
            <span className="text-[11px] text-slate-500">{v.label}</span>
          </div>
        ))}
      </div>

      {/* Grilla del calendario */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <div style={{ minWidth: `${140 + DIAS_VISIBLES * 40}px` }}>
            {/* Encabezado de fechas */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-slate-200">
              <div className="w-[140px] shrink-0 px-3 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200">
                Unidad
              </div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${DIAS_VISIBLES}, minmax(40px, 1fr))` }}>
                {diasVisibles.map((d, i) => {
                  const esHoy = formatearISO(d) === formatearISO(hoy);
                  const finde = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`text-center py-2 border-r border-slate-300 ${finde ? "bg-slate-50" : ""} ${esHoy ? "bg-blue-50" : ""}`}
                    >
                      <div className={`text-[10px] ${esHoy ? "text-blue-900 font-bold" : "text-slate-400"}`}>{DIAS_SEMANA_CORTO[d.getDay()]}</div>
                      <div className={`text-xs ${esHoy ? "text-blue-900 font-bold" : "text-slate-700 font-medium"}`}>{d.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filas agrupadas por región (San José / Jacó / Guanacaste), y
                dentro de cada región, por propiedad + unidad */}
            {filasPorRegion.map((regionGrupo) => {
              const gm = GROUP_META[regionGrupo.region] || { label: "Otras", dot: "bg-slate-400", badgeText: "text-slate-500" };
              return (
                <div key={regionGrupo.region} style={{ borderLeft: `4px solid ${REGION_BORDE[regionGrupo.region] || "#94a3b8"}` }}>
                  <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${gm.dot}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${gm.badgeText}`}>{gm.label}</span>
                  </div>
                  {regionGrupo.propiedades.map((grupo) => (
                    <div key={grupo.propertyName}>
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-[11px] font-bold text-slate-600"><Highlight text={grupo.propertyName} /></span>
                      </div>
                      {grupo.unidades.map((u) => {
                        const barras = (u.reservas || [])
                          .map((r) => {
                            // La barra empieza a la MITAD del día de entrada y termina
                            // a la MITAD del día de salida (igual que Hostify) — así,
                            // si un huésped sale a las 11am y otro entra a las 3pm el
                            // mismo día, se ve clarito que el día se reparte entre los dos.
                            const inicioEnDias = diasEntre(rangoInicio, r.inicio) + 0.5;
                            const finEnDias = diasEntre(rangoInicio, r.fin) + 0.5;
                            const inicioClamp = Math.max(0, Math.min(DIAS_VISIBLES, inicioEnDias));
                            const finClamp = Math.max(0, Math.min(DIAS_VISIBLES, finEnDias));
                            return { ...r, leftPct: (inicioClamp / DIAS_VISIBLES) * 100, widthPct: ((finClamp - inicioClamp) / DIAS_VISIBLES) * 100 };
                          })
                          .filter((r) => r.widthPct > 0);

                        return (
                          <div key={u.unitId} className="flex border-b border-slate-100 last:border-b-0">
                            <div className="w-[140px] shrink-0 px-3 py-2.5 text-xs text-slate-700 border-r border-slate-200 flex items-center">
                              <Highlight text={u.unitName} />
                            </div>
                            <div
                              className="flex-1 grid relative"
                              style={{ gridTemplateColumns: `repeat(${DIAS_VISIBLES}, minmax(40px, 1fr))`, gridTemplateRows: "40px" }}
                            >
                              {diasVisibles.map((d, i) => {
                                const finde = d.getDay() === 0 || d.getDay() === 6;
                                const esHoy = formatearISO(d) === formatearISO(hoy);
                                return (
                                  <div
                                    key={i}
                                    style={{ gridColumn: i + 1, gridRow: 1 }}
                                    className={`border-r border-slate-300 ${finde ? "bg-slate-50/60" : ""} ${esHoy ? "bg-blue-50/60" : ""}`}
                                  />
                                );
                              })}
                              {barras.map((b, i) => {
                                const conf = FUENTE_COLOR[b.fuente] || FUENTE_COLOR.otro;
                                return (
                                  <div
                                    key={i}
                                    title={`${conf.label}${b.huesped ? " — " + b.huesped : ""}: ${b.inicio} → ${b.fin}`}
                                    style={{
                                      position: "absolute",
                                      left: `${b.leftPct}%`,
                                      width: `${b.widthPct}%`,
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                      backgroundColor: conf.bg
                                    }}
                                    className="h-6 rounded-md opacity-90 hover:opacity-100 cursor-default flex items-center gap-1 px-1 overflow-hidden"
                                  >
                                    <span
                                      className="w-4 h-4 rounded-full bg-white flex items-center justify-center text-[9px] font-bold shrink-0"
                                      style={{ color: conf.bg }}
                                    >
                                      {conf.inicial}
                                    </span>
                                    {b.huesped && (
                                      <span className="text-[10px] font-semibold text-white truncate">{b.huesped}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {datos.actualizado && (
        <p className="text-[11px] text-slate-400 text-center">
          Última actualización: {new Date(datos.actualizado).toLocaleString("es-CR")}
        </p>
      )}
    </div>
  );
}

function HomeView({ general, checkInGeneral, checkOutGeneral, masterTable, onOpenProperty }) {
  general = { mensajesFrecuentes: [], contactos: [], faqs: [], ...(general || {}) };
  general.formulario = { texto: "", link: "", linkLabel: "", ...(general.formulario || {}) };
  masterTable = masterTable || [];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Inicio</h2>
        <p className="text-sm text-slate-500">Información general y acceso rápido a cada propiedad</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Horario estándar</p>
          <InfoRow k="Check in" v={checkInGeneral} />
          <InfoRow k="Check out" v={checkOutGeneral} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Formulario diario</p>
          <p className="text-sm text-slate-700 mb-2"><Highlight text={general.formulario.texto} /></p>
          <a href={general.formulario.link} target="_blank" rel="noreferrer" className="text-blue-900 text-sm font-medium underline break-all">
            {general.formulario.linkLabel}
          </a>
          {general.formulario.espaciosObligatorios && (
            <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100"><Highlight text={general.formulario.espaciosObligatorios} /></p>
          )}
        </div>
      </div>

      {general.comunicacion && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{general.comunicacion.titulo}</p>
          <ul className="space-y-1.5">
            {general.comunicacion.bullets.map((b, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-blue-800">•</span><Highlight text={b} /></li>
            ))}
          </ul>
        </div>
      )}

      {general.reservaDirecta && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Reserva directa (Zafiro PM)</p>
          <p className="text-sm text-slate-600 mb-2">{general.reservaDirecta.nota}</p>
          <a href={general.reservaDirecta.url} target="_blank" rel="noreferrer" className="text-blue-900 text-sm font-semibold underline break-all">
            Abrir zafiropm.com ↗
          </a>
        </div>
      )}

      {general.mensajesFrecuentes && general.mensajesFrecuentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Mensajes frecuentes · listos para copiar</p>
          <div className="grid gap-3 lg:grid-cols-2 min-w-0">
            {general.mensajesFrecuentes.map((m) => <MessageCard key={m.id} msg={m} />)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Contactos rápidos</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {general.contactos.map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <Phone size={13} className="text-blue-900 shrink-0" /> <Highlight text={c.label} />
                </p>
                <p className="text-sm text-slate-600"><Highlight text={c.value} /></p>
                {c.note && <p className="text-xs text-slate-400 mt-0.5"><Highlight text={c.note} /></p>}
              </div>
              <CopyButton text={c.value} small />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Preguntas frecuentes</p>
        <div className="grid gap-3 lg:grid-cols-2 min-w-0">
          {general.faqs.map((f) => <MessageCard key={f.q} msg={{ title: f.q, body: f.a }} />)}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">Cuadro de propiedades · toca para ver el detalle</p>
        {["sanjose", "jaco", "guanacaste"].map((groupId) => {
          const rows = masterTable.filter((row) => PROPERTY_GROUP[row.propertyId] === groupId);
          if (rows.length === 0) return null;
          const gm = GROUP_META[groupId];
          return (
            <div key={groupId} className="space-y-2">
              <div className="flex items-center gap-1.5 px-1">
                <span className={`w-2 h-2 rounded-full ${gm.dot}`} />
                <p className={`text-xs font-bold ${gm.badgeText}`}>{gm.label}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((row, i) => (
                  <MasterTableRow key={i} row={row} onOpen={onOpenProperty} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ============================================================================
   ADMIN — agregar/editar propiedades sin tocar código. Lee y escribe contra
   el backend del bot (FastAPI en Railway), que a su vez guarda en Supabase,
   reindexa embeddings para el bot, y dispara un redeploy automático del sitio
   (Vercel Deploy Hook) para que propiedades.json quede al día.
   ============================================================================ */

function useAdminKey() {
  const [key, setKey] = useState(() => localStorage.getItem("zafiro_admin_key") || "");
  const guardar = (v) => {
    setKey(v);
    localStorage.setItem("zafiro_admin_key", v);
  };
  return [key, guardar];
}

async function adminFetch(path, adminKey, options = {}) {
  const resp = await fetch(`${BOT_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    let detalle = resp.statusText;
    try {
      const data = await resp.json();
      detalle = data.detail || detalle;
    } catch {}
    throw new Error(`${resp.status}: ${detalle}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

function AdminKeyGate({ adminKey, onSave, children }) {
  const [input, setInput] = useState(adminKey);
  if (adminKey) return children;
  return (
    <div className="max-w-sm mx-auto mt-10 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-800 mb-2">Clave de administrador</p>
      <p className="text-xs text-slate-500 mb-3">Se guarda solo en este navegador.</p>
      <input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Admin key"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-3"
      />
      <button
        onClick={() => onSave(input)}
        disabled={!input.trim()}
        className="w-full rounded-lg bg-blue-900 text-white text-sm font-semibold py-2 disabled:opacity-40"
      >
        Continuar
      </button>
    </div>
  );
}

function ListaConEdicion({ items, renderLabel, onEdit, onDelete, addLabel, onAdd }) {
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="min-w-0 flex-1">{renderLabel(it)}</div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onEdit(it)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
              <Pencil size={15} />
            </button>
            <button onClick={() => onDelete(it)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
      <button onClick={onAdd} className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-blue-800 hover:text-blue-900 flex items-center justify-center gap-1.5">
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}

function PairListEditor({ pares, onChange, placeholderA = "Etiqueta", placeholderB = "Valor" }) {
  const set = (i, idx, v) => {
    const copia = pares.map((p) => [...p]);
    copia[i][idx] = v;
    onChange(copia);
  };
  const quitar = (i) => onChange(pares.filter((_, j) => j !== i));
  const agregar = () => onChange([...pares, ["", ""]]);
  return (
    <div className="space-y-1.5">
      {pares.map((p, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={p[0]} onChange={(e) => set(i, 0, e.target.value)} placeholder={placeholderA}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={p[1]} onChange={(e) => set(i, 1, e.target.value)} placeholder={placeholderB}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <button onClick={() => quitar(i)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={agregar} className="text-xs text-blue-900 font-medium flex items-center gap-1">
        <Plus size={13} /> Agregar fila
      </button>
    </div>
  );
}

function StringListEditor({ items, onChange, placeholder = "Texto" }) {
  const set = (i, v) => onChange(items.map((it, j) => (j === i ? v : it)));
  const quitar = (i) => onChange(items.filter((_, j) => j !== i));
  const agregar = () => onChange([...items, ""]);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5">
          <textarea value={it} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} rows={2}
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <button onClick={() => quitar(i)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={agregar} className="text-xs text-blue-900 font-medium flex items-center gap-1">
        <Plus size={13} /> Agregar
      </button>
    </div>
  );
}

const PROPERTY_VACIA = {
  id: "", name: "", group: "sanjose", zone: "", owner: "",
  requisitosCheckIn: { resumen: "", detalle: "", link: "", linkLabel: "" },
  quickInfo: [], rules: [], camposPersonalizados: {},
  units: [], messages: [],
};

function RevisarGuiaPanel({ propertyId, adminKey, urlGuia }) {
  const [comparacion, setComparacion] = useState(null);
  const [guia, setGuia] = useState(null);
  const [seleccionados, setSeleccionados] = useState({});
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const revisar = async () => {
    setCargando(true);
    setError("");
    setAviso("");
    try {
      const r = await adminFetch("/admin/previsualizar-guia", adminKey, {
        method: "POST",
        body: JSON.stringify({ url: urlGuia, property_id: propertyId }),
      });
      setGuia(r.guia);
      setComparacion(r.comparacion || []);
      setSeleccionados({});
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const aplicar = async () => {
    const campos = {};
    Object.keys(seleccionados).forEach((campo) => {
      if (seleccionados[campo] && guia && guia[campo] !== undefined) campos[campo] = guia[campo];
    });
    if (Object.keys(campos).length === 0) return;
    setAplicando(true);
    setError("");
    try {
      await adminFetch(`/admin/aplicar-cambios-guia/${propertyId}`, adminKey, {
        method: "POST", body: JSON.stringify({ campos }),
      });
      setAviso("Cambios guardados y reindexados para el bot.");
      setComparacion(null);
      setSeleccionados({});
    } catch (e) {
      setError(e.message);
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Guía pública externa (guia.zafiropm.com)</p>
      <p className="text-xs text-slate-400">Compara contra lo ya cargado — nada se cambia hasta que elijas qué aceptar.</p>
      <button onClick={revisar} disabled={cargando}
        className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600 disabled:opacity-40 flex items-center gap-1.5">
        <RefreshCw size={14} className={cargando ? "animate-spin" : ""} />
        {cargando ? "Revisando…" : "Revisar guía pública"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}

      {comparacion && comparacion.length === 0 && (
        <p className="text-xs text-slate-400">No se encontró nada en la guía para comparar.</p>
      )}

      {comparacion && comparacion.length > 0 && (
        <div className="space-y-2">
          {comparacion.map((fila) => (
            <div key={fila.campo} className={`rounded-lg border p-2.5 text-xs ${fila.hay_diferencia ? "border-amber-300 bg-amber-50" : "border-slate-100"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-700">
                  {fila.etiqueta}
                  {fila.hay_diferencia === true && <span className="ml-1.5 text-amber-700">· diferente</span>}
                  {fila.hay_diferencia === false && <span className="ml-1.5 text-slate-400">· igual</span>}
                </p>
                {fila.aplicable && (
                  <label className="flex items-center gap-1.5 text-slate-600 shrink-0">
                    <input type="checkbox" checked={!!seleccionados[fila.campo]}
                      onChange={(e) => setSeleccionados((s) => ({ ...s, [fila.campo]: e.target.checked }))} />
                    Usar este valor
                  </label>
                )}
              </div>
              <p className="text-slate-500 mt-1 whitespace-pre-line"><span className="font-medium">Actual:</span> {fila.valor_actual || "(no cargado)"}</p>
              <p className="text-slate-700 mt-0.5 whitespace-pre-line"><span className="font-medium">Guía:</span> {fila.valor_guia}</p>
              {fila.nota && <p className="text-slate-400 italic mt-1">{fila.nota}</p>}
            </div>
          ))}
          <button onClick={aplicar} disabled={aplicando || !Object.values(seleccionados).some(Boolean)}
            className="w-full rounded-lg bg-blue-900 text-white text-sm font-semibold py-2 disabled:opacity-40">
            {aplicando ? "Aplicando…" : "Aplicar cambios seleccionados"}
          </button>
        </div>
      )}
    </div>
  );
}

function MessageListEditor({ items, onChange }) {
  const set = (i, campo, v) => onChange(items.map((it, j) => (j === i ? { ...it, [campo]: v } : it)));
  const quitar = (i) => onChange(items.filter((_, j) => j !== i));
  const agregar = () => onChange([...items, { id: `msg-${Date.now()}`, title: "", body: "" }]);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id || i} className="rounded-lg border border-slate-200 p-2 space-y-1.5">
          <div className="flex gap-1.5">
            <input value={it.title || ""} onChange={(e) => set(i, "title", e.target.value)} placeholder="Título del mensaje"
              className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            <button onClick={() => quitar(i)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          </div>
          <textarea value={it.body || ""} onChange={(e) => set(i, "body", e.target.value)} placeholder="Contenido del mensaje" rows={4}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </div>
      ))}
      <button onClick={agregar} className="text-xs text-blue-900 font-medium flex items-center gap-1">
        <Plus size={13} /> Agregar mensaje
      </button>
    </div>
  );
}

function UnitEditCard({ unidad, onChange, onEliminar, camposUnidad }) {
  const set = (campo, v) => onChange({ ...unidad, [campo]: v });
  const setListing = (campo, v) => onChange({ ...unidad, listing: { ...(unidad.listing || {}), [campo]: v } });
  const setGuia = (campo, v) => onChange({ ...unidad, guiaDigital: { ...(unidad.guiaDigital || {}), [campo]: v } });
  const setCampoPersonalizado = (id, v) =>
    onChange({ ...unidad, camposPersonalizados: { ...(unidad.camposPersonalizados || {}), [id]: v } });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <input value={unidad.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Nombre de la unidad (ej. Praia 41)"
          className="flex-1 min-w-0 font-semibold text-sm text-slate-800 rounded-lg border border-slate-300 px-2.5 py-1.5" />
        <button onClick={onEliminar} className="shrink-0 text-red-600 hover:bg-red-50 rounded-lg w-9 h-9 flex items-center justify-center">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Número / identificador
          <input value={unidad.num || ""} onChange={(e) => set("num", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">Capacidad (personas)
          <input value={unidad.pax || ""} onChange={(e) => set("pax", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">Parqueo
          <input value={unidad.parqueo || ""} onChange={(e) => set("parqueo", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">Código de acceso
          <input value={unidad.accessCode || ""} onChange={(e) => set("accessCode", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">App de ingreso
          <input value={unidad.app || ""} onChange={(e) => set("app", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-500">WhatsApp de seguridad
          <input value={unidad.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </label>
      </div>

      {camposUnidad.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Campos personalizados de esta unidad</p>
          {camposUnidad.map((c) => (
            <label key={c.id} className="block text-xs text-slate-500">
              {c.etiqueta}
              <input
                value={(unidad.camposPersonalizados || {})[c.id] || ""}
                onChange={(e) => setCampoPersonalizado(c.id, e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
      )}

      <details className="pt-2 border-t border-slate-100">
        <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">WiFi y otros datos</summary>
        <div className="mt-2"><PairListEditor pares={unidad.extra || []} onChange={(v) => set("extra", v)} placeholderA="ej. WiFi" placeholderB="ej. red / contraseña" /></div>
      </details>

      <details className="pt-2 border-t border-slate-100">
        <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">Habitaciones</summary>
        <div className="mt-2"><StringListEditor items={unidad.rooms || []} onChange={(v) => set("rooms", v)} placeholder="ej. Habitación 1: cama king" /></div>
      </details>

      <details className="pt-2 border-t border-slate-100">
        <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">Mensajes de check-in de esta unidad</summary>
        <div className="mt-2"><MessageListEditor items={unidad.checkin || []} onChange={(v) => set("checkin", v)} /></div>
      </details>

      <details className="pt-2 border-t border-slate-100">
        <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">Ficha pública (listing)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={unidad.listing?.title || ""} onChange={(e) => setListing("title", e.target.value)} placeholder="Título del listing"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.url || ""} onChange={(e) => setListing("url", e.target.value)} placeholder="URL del listing"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.airbnbUrl || ""} onChange={(e) => setListing("airbnbUrl", e.target.value)} placeholder="URL de Airbnb"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.guests ?? ""} onChange={(e) => setListing("guests", e.target.value)} placeholder="Huéspedes"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.bedrooms ?? ""} onChange={(e) => setListing("bedrooms", e.target.value)} placeholder="Habitaciones"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.beds ?? ""} onChange={(e) => setListing("beds", e.target.value)} placeholder="Camas"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.listing?.bathrooms ?? ""} onChange={(e) => setListing("bathrooms", e.target.value)} placeholder="Baños"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <textarea value={unidad.listing?.description || ""} onChange={(e) => setListing("description", e.target.value)} placeholder="Descripción" rows={3}
            className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500 mb-1">Fotos (URLs)</p>
            <StringListEditor items={unidad.listing?.images || []} onChange={(v) => setListing("images", v)} placeholder="https://..." />
          </div>
        </div>
      </details>

      <details className="pt-2 border-t border-slate-100">
        <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer">Guía digital de esta unidad</summary>
        <div className="mt-2 space-y-1.5">
          <input value={unidad.guiaDigital?.url || ""} onChange={(e) => setGuia("url", e.target.value)} placeholder="URL de la guía"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={unidad.guiaDigital?.comoLlegar || ""} onChange={(e) => setGuia("comoLlegar", e.target.value)} placeholder="Cómo llegar"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <textarea value={unidad.guiaDigital?.nota || ""} onChange={(e) => setGuia("nota", e.target.value)} placeholder="Nota sobre esta guía" rows={2}
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        </div>
      </details>

      <label className="block text-xs text-slate-500 pt-2 border-t border-slate-100">
        Nota interna de esta unidad (nunca se le muestra al huésped)
        <textarea value={unidad.note || ""} onChange={(e) => set("note", e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </label>
    </div>
  );
}

function UnitsEditor({ unidades, onChange, camposUnidad }) {
  const actualizar = (i, nueva) => onChange(unidades.map((u, j) => (j === i ? nueva : u)));
  const eliminar = (i) => {
    if (!confirm("¿Eliminar esta unidad del formulario?")) return;
    onChange(unidades.filter((_, j) => j !== i));
  };
  const agregar = () => onChange([...unidades, { id: `unidad-${Date.now()}`, name: "", num: "", pax: "" }]);

  return (
    <div className="space-y-3">
      {unidades.map((u, i) => (
        <UnitEditCard key={u.id || i} unidad={u} onChange={(n) => actualizar(i, n)} onEliminar={() => eliminar(i)} camposUnidad={camposUnidad} />
      ))}
      <button onClick={agregar} className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:border-blue-800 hover:text-blue-900 flex items-center justify-center gap-1.5">
        <Plus size={15} /> Agregar unidad (casa/apartamento)
      </button>
    </div>
  );
}

function PropertyForm({ propiedadInicial, esNueva, camposPersonalizados, onGuardar, onCancelar, guardando, error, adminKey }) {
  const base = propiedadInicial || PROPERTY_VACIA;
  const [form, setForm] = useState({
    id: base.id || "", name: base.name || "", group: base.group || "sanjose",
    zone: base.zone || "", owner: base.owner || "",
    requisitosCheckIn: base.requisitosCheckIn || { resumen: "", detalle: "", link: "", linkLabel: "" },
    quickInfo: base.quickInfo || [], rules: base.rules || [],
    camposPersonalizados: base.camposPersonalizados || {},
  });
  const [units, setUnits] = useState(base.units || []);
  const [messages, setMessages] = useState(base.messages || []);
  const [publicInfo, setPublicInfo] = useState(base.publicInfo || { rules: [], amenities: [], nearby: [] });
  const [localExperiences, setLocalExperiences] = useState(base.localExperiences || { url: "", resumen: "", categorias: [], destacados: [] });
  const [correoTemplate, setCorreoTemplate] = useState(base.correoTemplate || { title: "", body: "" });
  const [guiaDigitalProp, setGuiaDigitalProp] = useState(base.guiaDigital || { url: "", nota: "", comoLlegar: "" });
  const [notaInterna, setNotaInterna] = useState(base.note || "");
  const [jsonError, setJsonError] = useState("");

  const camposUnidad = camposPersonalizados.filter((c) => c.nivel === "unidad");
  const camposPropiedad = camposPersonalizados.filter((c) => c.nivel !== "unidad");

  const set = (campo, v) => setForm((f) => ({ ...f, [campo]: v }));
  const setPublicInfoField = (campo, v) => setPublicInfo((p) => ({ ...p, [campo]: v }));
  const setLocalExpField = (campo, v) => setLocalExperiences((p) => ({ ...p, [campo]: v }));
  const setCorreoField = (campo, v) => setCorreoTemplate((p) => ({ ...p, [campo]: v }));
  const setGuiaPropField = (campo, v) => setGuiaDigitalProp((p) => ({ ...p, [campo]: v }));

  const submit = () => {
    setJsonError("");
    if (!form.id.trim() || !form.name.trim()) {
      setJsonError("id y nombre son obligatorios.");
      return;
    }
    const tieneLocalExp = localExperiences.url || localExperiences.resumen || (localExperiences.categorias || []).length || (localExperiences.destacados || []).length;
    const tieneCorreo = correoTemplate.title || correoTemplate.body;
    const tieneGuia = guiaDigitalProp.url || guiaDigitalProp.nota || guiaDigitalProp.comoLlegar;

    onGuardar({
      ...form, units, messages,
      publicInfo,
      localExperiences: tieneLocalExp ? localExperiences : undefined,
      correoTemplate: tieneCorreo ? correoTemplate : undefined,
      guiaDigital: tieneGuia ? guiaDigitalProp : undefined,
      note: notaInterna || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos básicos</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Id (slug único)
            <input value={form.id} disabled={!esNueva} onChange={(e) => set("id", e.target.value.trim())}
              placeholder="ej. casa-nueva"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" />
          </label>
          <label className="text-xs text-slate-500">Nombre
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-500">Grupo
            <select value={form.group} onChange={(e) => set("group", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="sanjose">San José</option>
              <option value="jaco">Jacó</option>
              <option value="guanacaste">Guanacaste</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">Zona
            <input value={form.zone} onChange={(e) => set("zone", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">Owner
            <input value={form.owner} onChange={(e) => set("owner", e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Requisitos de check-in</p>
        <textarea value={form.requisitosCheckIn.resumen} onChange={(e) => set("requisitosCheckIn", { ...form.requisitosCheckIn, resumen: e.target.value })}
          placeholder="Resumen" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <textarea value={form.requisitosCheckIn.detalle} onChange={(e) => set("requisitosCheckIn", { ...form.requisitosCheckIn, detalle: e.target.value })}
          placeholder="Detalle" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.requisitosCheckIn.link} onChange={(e) => set("requisitosCheckIn", { ...form.requisitosCheckIn, link: e.target.value })}
            placeholder="Link del formulario" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input value={form.requisitosCheckIn.linkLabel} onChange={(e) => set("requisitosCheckIn", { ...form.requisitosCheckIn, linkLabel: e.target.value })}
            placeholder="Texto del link" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick info</p>
        <PairListEditor pares={form.quickInfo} onChange={(v) => set("quickInfo", v)} placeholderA="ej. Check in" placeholderB="ej. 3:00 PM" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reglas de la casa</p>
        <StringListEditor items={form.rules} onChange={(v) => set("rules", v)} placeholder="Regla" />
      </div>

      {!esNueva && form.camposPersonalizados.link_guia_publica && (
        <RevisarGuiaPanel propertyId={form.id} adminKey={adminKey} urlGuia={form.camposPersonalizados.link_guia_publica} />
      )}

      {camposPropiedad.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Campos personalizados</p>
          {camposPropiedad.map((c) => (
            <label key={c.id} className="block text-xs text-slate-500">
              {c.etiqueta}
              <input
                value={form.camposPersonalizados[c.id] || ""}
                onChange={(e) => set("camposPersonalizados", { ...form.camposPersonalizados, [c.id]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidades (casas / apartamentos)</p>
        <p className="text-xs text-slate-400">Cada unidad es una casa o apartamento real dentro de esta propiedad/condominio.</p>
        <UnitsEditor unidades={units} onChange={setUnits} camposUnidad={camposUnidad} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Mensajes de la propiedad</p>
        <p className="text-xs text-slate-400">Bienvenida, check-out, y otros mensajes generales de toda la propiedad (no de una unidad puntual).</p>
        <MessageListEditor items={messages} onChange={setMessages} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ficha pública</p>
        <div>
          <p className="text-xs text-slate-500 mb-1">Amenidades</p>
          <StringListEditor items={publicInfo.amenities || []} onChange={(v) => setPublicInfoField("amenities", v)} placeholder="ej. Piscina privada" />
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Reglas (ficha pública)</p>
          <StringListEditor items={publicInfo.rules || []} onChange={(v) => setPublicInfoField("rules", v)} placeholder="Regla" />
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Lugares cercanos</p>
          <PairListEditor
            pares={(publicInfo.nearby || []).map((n) => (typeof n === "object" ? [n.text || "", n.url || ""] : [n, ""]))}
            onChange={(pares) => setPublicInfoField("nearby", pares.map(([text, url]) => ({ text, url })))}
            placeholderA="Descripción" placeholderB="URL (opcional)"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Experiencias locales</p>
        <input value={localExperiences.url || ""} onChange={(e) => setLocalExpField("url", e.target.value)}
          placeholder="Link (ej. LocalBird)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <textarea value={localExperiences.resumen || ""} onChange={(e) => setLocalExpField("resumen", e.target.value)}
          placeholder="Resumen" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <div>
          <p className="text-xs text-slate-500 mb-1">Categorías</p>
          <StringListEditor items={localExperiences.categorias || []} onChange={(v) => setLocalExpField("categorias", v)} placeholder="ej. Tours de aventura" />
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Destacados</p>
          <PairListEditor
            pares={(localExperiences.destacados || []).map((d) => [d.nombre || "", d.precio || ""])}
            onChange={(pares) => setLocalExpField("destacados", pares.map(([nombre, precio]) => ({ nombre, precio })))}
            placeholderA="Nombre" placeholderB="Precio (ej. Desde $70)"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Guía digital de la propiedad</p>
        <p className="text-xs text-slate-400">Solo si aplica a toda la propiedad y no a una unidad puntual (esas se cargan dentro de cada unidad).</p>
        <input value={guiaDigitalProp.url || ""} onChange={(e) => setGuiaPropField("url", e.target.value)} placeholder="URL de la guía"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={guiaDigitalProp.comoLlegar || ""} onChange={(e) => setGuiaPropField("comoLlegar", e.target.value)} placeholder="Cómo llegar"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <textarea value={guiaDigitalProp.nota || ""} onChange={(e) => setGuiaPropField("nota", e.target.value)} placeholder="Nota" rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Plantilla de correo a recepción (interno)</p>
        <input value={correoTemplate.title || ""} onChange={(e) => setCorreoField("title", e.target.value)} placeholder="Asunto"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <textarea value={correoTemplate.body || ""} onChange={(e) => setCorreoField("body", e.target.value)} placeholder="Cuerpo del correo" rows={4}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nota interna de la propiedad</p>
        <p className="text-xs text-slate-400">Nunca se le muestra al huésped.</p>
        <textarea value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)} rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {(jsonError || error) && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{jsonError || error}</p>
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={guardando}
          className="flex-1 rounded-lg bg-blue-900 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50">
          <Save size={15} /> {guardando ? "Guardando…" : "Guardar y publicar"}
        </button>
        <button onClick={onCancelar} className="rounded-lg border border-slate-300 text-sm text-slate-600 px-4">Cancelar</button>
      </div>
    </div>
  );
}

function CamposPersonalizadosPanel({ campos, adminKey, onCambio }) {
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [nuevoNivel, setNuevoNivel] = useState("propiedad");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  const crear = async () => {
    const etiqueta = nuevaEtiqueta.trim();
    if (!etiqueta) return;
    const id = etiqueta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    setCreando(true);
    setError("");
    try {
      await adminFetch("/admin/campos", adminKey, { method: "POST", body: JSON.stringify({ id, etiqueta, tipo: "texto", nivel: nuevoNivel }) });
      setNuevaEtiqueta("");
      onCambio();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  };

  const eliminar = async (c) => {
    if (!confirm(`¿Eliminar el campo "${c.etiqueta}"? Esto no borra los valores ya guardados en cada propiedad/unidad.`)) return;
    try {
      await adminFetch(`/admin/campos/${c.id}`, adminKey, { method: "DELETE" });
      onCambio();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Campos personalizados
      </p>
      <p className="text-xs text-slate-400">
        "Propiedad" agrega el campo una vez por propiedad. "Unidad" agrega el campo a cada casa/apartamento por separado.
      </p>
      {campos.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
          <span className="text-sm text-slate-700">
            {c.etiqueta} <span className="text-slate-400">({c.id})</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${c.nivel === "unidad" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
              {c.nivel === "unidad" ? "Unidad" : "Propiedad"}
            </span>
            <button onClick={() => eliminar(c)} className="text-red-600 hover:bg-red-50 rounded-lg w-7 h-7 flex items-center justify-center">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <input value={nuevaEtiqueta} onChange={(e) => setNuevaEtiqueta(e.target.value)}
          placeholder="ej. ¿Aceptan animales?"
          className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <select value={nuevoNivel} onChange={(e) => setNuevoNivel(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
          <option value="propiedad">Por propiedad</option>
          <option value="unidad">Por unidad</option>
        </select>
        <button onClick={crear} disabled={creando || !nuevaEtiqueta.trim()}
          className="rounded-lg bg-blue-900 text-white text-sm font-semibold px-3 disabled:opacity-40">
          Agregar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ImportarJsonPanel({ adminKey }) {
  const [estado, setEstado] = useState(null); // null | {corriendo, completadas, total, error, propiedad_actual}
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!estado?.corriendo) return;
    const t = setInterval(async () => {
      try {
        const e = await adminFetch("/admin/importar/estado", adminKey);
        setEstado(e);
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [estado?.corriendo, adminKey]);

  const onFile = async (file) => {
    setError("");
    setConfirmando(false);
    let datos;
    try {
      datos = JSON.parse(await file.text());
    } catch (e) {
      setError(`El archivo no es un JSON válido: ${e.message}`);
      return;
    }
    try {
      await adminFetch("/admin/importar", adminKey, { method: "POST", body: JSON.stringify(datos) });
      setEstado({ corriendo: true, completadas: 0, total: (datos.properties || []).length + 1, error: null, propiedad_actual: null });
    } catch (e) {
      setError(e.message);
    }
  };

  const [descargando, setDescargando] = useState(false);

  const descargarJson = async () => {
    setDescargando(true);
    setError("");
    try {
      const datos = await adminFetch("/export/propiedades.json", adminKey);
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `propiedades_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Importar JSON completo (carga inicial o reemplazo total)</p>
      <p className="text-xs text-slate-400">
        Sube tu propiedades.json completo. Reemplaza TODAS las propiedades y la info general en Supabase.
        Puede tardar varios minutos — se hace en segundo plano, podés cerrar esta pestaña y volver después.
      </p>

      <button onClick={descargarJson} disabled={descargando}
        className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600 disabled:opacity-40">
        {descargando ? "Descargando…" : "⬇ Descargar JSON actual (respaldo)"}
      </button>

      {estado?.corriendo ? (
        <div className="space-y-1.5">
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-blue-900 transition-all" style={{ width: `${Math.min(100, (estado.completadas / Math.max(1, estado.total)) * 100)}%` }} />
          </div>
          <p className="text-xs text-slate-500">
            {estado.completadas} / {estado.total} {estado.propiedad_actual ? `— ${estado.propiedad_actual}` : ""}
          </p>
        </div>
      ) : estado && !estado.corriendo && estado.error ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Falló: {estado.error}</p>
      ) : estado && !estado.corriendo ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Importación completa ({estado.completadas} elementos). El sitio se actualiza solo en unos minutos.
        </p>
      ) : null}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {!confirmando ? (
        <button onClick={() => setConfirmando(true)} disabled={estado?.corriendo}
          className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600 disabled:opacity-40">
          Elegir archivo…
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Esto reemplaza todos los datos actuales en Supabase por los del archivo. ¿Confirmás?
          </p>
          <input type="file" accept="application/json"
            onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
            className="text-sm" />
        </div>
      )}
    </div>
  );
}

function NuevaPropiedadIntro({ adminKey, onListo, onOmitir }) {
  const [idSugerido, setIdSugerido] = useState("");
  const [url, setUrl] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const cargarDesdeGuia = async () => {
    if (!idSugerido.trim() || !url.trim()) return;
    setCargando(true);
    setError("");
    try {
      const r = await adminFetch("/admin/previsualizar-guia", adminKey, {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), id_sugerido: idSugerido.trim() }),
      });
      onListo(r.campos_prellenado);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-800">Nueva propiedad</p>
      <p className="text-xs text-slate-500">
        Si ya existe una guía en guia.zafiropm.com para esta casa, podés pre-llenar el formulario desde ahí
        (vas a poder revisar y editar todo antes de guardar).
      </p>
      <label className="block text-xs text-slate-500">Id (slug único)
        <input value={idSugerido} onChange={(e) => setIdSugerido(e.target.value.trim())} placeholder="ej. casa-nueva"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs text-slate-500">Link de la guía pública
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://guia.zafiropm.com/g/..."
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={cargarDesdeGuia} disabled={cargando || !idSugerido.trim() || !url.trim()}
          className="flex-1 rounded-lg bg-blue-900 text-white text-sm font-semibold py-2 disabled:opacity-40">
          {cargando ? "Cargando…" : "Cargar desde la guía"}
        </button>
        <button onClick={onOmitir} className="rounded-lg border border-slate-300 text-sm text-slate-600 px-4">
          Empezar en blanco
        </button>
      </div>
    </div>
  );
}

function ConfiguracionGeneralPanel({ adminKey }) {
  const [config, setConfig] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    adminFetch("/admin/configuracion", adminKey)
      .then(setConfig)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const set = (clave, v) => setConfig((c) => ({ ...c, [clave]: v }));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      await adminFetch("/admin/configuracion", adminKey, { method: "POST", body: JSON.stringify(config) });
      setAviso("Guardado.");
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (!config) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Configuración general</p>
      <label className="block text-xs text-slate-500">WhatsApp de mantenimiento (para todas las propiedades)
        <input value={config.whatsapp_mantenimiento_default || ""} onChange={(e) => set("whatsapp_mantenimiento_default", e.target.value)}
          placeholder="+506xxxxxxxx" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs text-slate-500">WhatsApp de limpieza (para todas las propiedades)
        <input value={config.whatsapp_limpieza_default || ""} onChange={(e) => set("whatsapp_limpieza_default", e.target.value)}
          placeholder="+506xxxxxxxx" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="block text-xs text-slate-500">Destinatarios del informe mensual (separados por coma)
        <input value={config.informe_mensual_destinatarios || ""} onChange={(e) => set("informe_mensual_destinatarios", e.target.value)}
          placeholder="gerencia@zafiropm.com, dueno@ejemplo.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <p className="text-xs text-slate-400">
        Si una propiedad puntual necesita un número distinto, se puede anular con un campo personalizado
        ("whatsapp_mantenimiento" / "whatsapp_limpieza") en esa propiedad.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      <button onClick={guardar} disabled={guardando}
        className="rounded-lg bg-blue-900 text-white text-sm font-semibold px-4 py-2 disabled:opacity-40">
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

// Número que "cuenta" desde 0 hasta su valor final cuando aparece en
// pantalla (se dispara una sola vez, con IntersectionObserver + rAF).
function Contador({ valor, sufijo = "", duracionMs = 900 }) {
  const ref = React.useRef(null);
  const [mostrado, setMostrado] = useState(0);
  const yaAnimado = React.useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting && !yaAnimado.current) {
            yaAnimado.current = true;
            const inicio = performance.now();
            const paso = (ahora) => {
              const progreso = Math.min((ahora - inicio) / duracionMs, 1);
              const facilitado = 1 - Math.pow(1 - progreso, 3); // ease-out
              setMostrado(Math.round(facilitado * valor));
              if (progreso < 1) requestAnimationFrame(paso);
            };
            requestAnimationFrame(paso);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [valor, duracionMs]);

  return (
    <span ref={ref}>
      {mostrado}
      {sufijo}
    </span>
  );
}

function InformeMensualPanel({ adminKey }) {
  const ahora = new Date();
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1); // mes actual (parcial) por defecto; el mes anterior suele ser el más útil para un cierre
  const [informe, setInforme] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [avisoEnvio, setAvisoEnvio] = useState("");
  const [error, setError] = useState("");

  const cargar = async () => {
    const clave = `sofia_informe_cache_${anio}-${mes}`;
    try {
      const crudo = sessionStorage.getItem(clave);
      if (crudo) {
        const { datos, en } = JSON.parse(crudo);
        if (Date.now() - en < 5 * 60 * 1000) {
          setInforme(datos);
          return; // datos frescos en caché (< 5 min) — no repetir la consulta a la base de datos
        }
      }
    } catch {}
    setCargando(true);
    setError("");
    try {
      const datos = await adminFetch(`/admin/informe-mensual?anio=${anio}&mes=${mes}`, adminKey);
      setInforme(datos);
      sessionStorage.setItem(clave, JSON.stringify({ datos, en: Date.now() }));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const descargar = () => {
    if (!informe) return;
    const blob = new Blob([JSON.stringify(informe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_${anio}-${String(mes).padStart(2, "0")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const descargarPdf = async () => {
    setError("");
    try {
      const resp = await fetch(`${BOT_API_URL}/admin/informe-mensual/pdf?anio=${anio}&mes=${mes}`, {
        headers: { "X-Admin-Key": adminKey },
      });
      if (!resp.ok) throw new Error(`No se pudo generar el PDF (HTTP ${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe_${anio}-${String(mes).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  const enviarPorCorreo = async () => {
    setEnviando(true);
    setError("");
    setAvisoEnvio("");
    try {
      const resultado = await adminFetch(`/admin/informe-mensual/enviar?anio=${anio}&mes=${mes}`, adminKey, { method: "POST" });
      setAvisoEnvio(`Enviado a: ${resultado.enviado_a.join(", ")}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const nombresMes = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Informe mensual de consultas</p>
      <p className="text-xs text-slate-400">
        Desglose de las consultas del mes por tipo (informativa, mantenimiento, limpieza, queja...) y por
        sentimiento (positivo/neutral/negativo), en base al historial histórico.
      </p>

      <div className="flex gap-2">
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
          {nombresMes.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>
        <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))}
          className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        <button onClick={cargar} disabled={cargando}
          className="rounded-lg bg-blue-900 text-white text-sm font-semibold px-4 disabled:opacity-40">
          {cargando ? "Cargando…" : "Ver"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {informe && (
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-2xl text-white"><Contador valor={informe.total_consultas} /></span> consultas en {nombresMes[informe.mes - 1]} {informe.anio}
          </p>

          {informe.total_consultas > 0 && (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Por tipo</p>
                {Object.entries(informe.por_tipo).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                  <p key={tipo} className="text-xs text-slate-600">
                    {tipo}: {n} (<Contador valor={Math.round((n / informe.total_consultas) * 100)} sufijo="%" />)
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Por sentimiento</p>
                {Object.entries(informe.por_sentimiento).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <p key={s} className="text-xs text-slate-600">
                    {s}: {n} ({Math.round((n / informe.total_consultas) * 100)}%)
                  </p>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Por propiedad</p>
                {Object.entries(informe.por_propiedad).map(([prop, tipos]) => (
                  <p key={prop} className="text-xs text-slate-600">
                    <span className="font-medium">{prop}</span>: {Object.entries(tipos).map(([t, n]) => `${t} ${n}`).join(", ")}
                  </p>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-2 flex-wrap">
            <button onClick={descargar} className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600">
              ⬇ Descargar (JSON)
            </button>
            <button onClick={descargarPdf} className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600">
              📄 Descargar (PDF)
            </button>
            <button onClick={enviarPorCorreo} disabled={enviando}
              className="text-sm rounded-lg bg-blue-900 text-white px-3 py-2 disabled:opacity-40">
              {enviando ? "Enviando…" : "✉ Enviar por correo"}
            </button>
          </div>
          {avisoEnvio && <p className="text-xs text-emerald-700">{avisoEnvio}</p>}
        </div>
      )}
    </div>
  );
}

// Barra horizontal simple (CSS, sin librería de gráficos) — para el
// dashboard en vivo: una barra de progreso coloreada + etiqueta + %.
function BarraViva({ etiqueta, pct, color = "#e1543c" }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span className="truncate pr-2">{etiqueta}</span>
        <span className="font-semibold shrink-0"><Contador valor={pct} sufijo="%" /></span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const COLOR_SEMAFORO_DASH = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626" };

const DASHBOARD_CACHE_KEY = "sofia_dashboard_cache";
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos — suficiente para no repetir la consulta al ir y venir de pestañas, pero sigue "casi en vivo"

function DashboardLive({ adminKey }) {
  const ahora = new Date();
  const claveMes = `${ahora.getFullYear()}-${ahora.getMonth() + 1}`;
  const [informe, setInforme] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState(null);

  const leerCache = () => {
    try {
      const crudo = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (!crudo) return null;
      const { clave, datos, en } = JSON.parse(crudo);
      if (clave !== claveMes) return null; // cambió el mes, no sirve
      if (Date.now() - en > DASHBOARD_CACHE_TTL_MS) return null; // venció
      return { datos, en };
    } catch {
      return null;
    }
  };

  const cargar = async (forzar = false) => {
    if (!forzar) {
      const cache = leerCache();
      if (cache) {
        setInforme(cache.datos);
        setActualizadoEn(new Date(cache.en));
        return;
      }
    }
    setCargando(true);
    setError("");
    try {
      const datos = await adminFetch(`/admin/informe-mensual?anio=${ahora.getFullYear()}&mes=${ahora.getMonth() + 1}`, adminKey);
      setInforme(datos);
      const en = Date.now();
      setActualizadoEn(new Date(en));
      sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ clave: claveMes, datos, en }));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nombresMes = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const total = informe?.total_consultas || 0;
  const pctConfianzaAlta = total ? Math.round(((informe.por_confianza?.alta || 0) / total) * 100) : 0;
  const pctSentimientoNeg = total ? Math.round(((informe.por_sentimiento?.negativo || 0) / total) * 100) : 0;
  const fcrPct = informe?.fcr?.fcr_pct;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><LayoutDashboard size={18} /> Dashboard</h2>
          <p className="text-sm text-slate-500">
            {nombresMes[ahora.getMonth()]} {ahora.getFullYear()} · datos guardados en este navegador hasta 5 min, para no golpear la base de datos en cada visita.
          </p>
        </div>
        <button onClick={() => cargar(true)} disabled={cargando} className="text-sm rounded-lg border border-slate-300 px-3 py-2 text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
          <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {informe && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold text-blue-900"><Contador valor={total} /></p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">Consultas este mes</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold" style={{ color: pctConfianzaAlta >= 70 ? "#16a34a" : pctConfianzaAlta >= 40 ? "#d97706" : "#dc2626" }}>
                <Contador valor={pctConfianzaAlta} sufijo="%" />
              </p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">Confianza alta</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold" style={{ color: pctSentimientoNeg >= 20 ? "#dc2626" : pctSentimientoNeg >= 10 ? "#d97706" : "#16a34a" }}>
                <Contador valor={pctSentimientoNeg} sufijo="%" />
              </p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">Sentimiento negativo</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold text-blue-900">{fcrPct != null ? <Contador valor={fcrPct} sufijo="%" /> : "—"}</p>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide mt-1">First Contact Resolution</p>
            </div>
          </div>

          {total > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por tipo de consulta</p>
                {Object.entries(informe.por_tipo).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => (
                  <BarraViva key={tipo} etiqueta={tipo} pct={Math.round((n / total) * 100)} color="#e1543c" />
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Por sentimiento</p>
                {Object.entries(informe.por_sentimiento).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <BarraViva key={s} etiqueta={s} pct={Math.round((n / total) * 100)}
                    color={s === "negativo" ? "#dc2626" : s === "positivo" ? "#16a34a" : "#2563eb"} />
                ))}
              </div>
            </div>
          )}

          {(informe.rendimiento_por_unidad || []).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Rendimiento del bot por unidad</p>
              <p className="text-xs text-slate-400 mb-3">Verde = va bien · amarillo = revisar · rojo = necesita atención.</p>
              {informe.rendimiento_por_unidad.map((r) => (
                <div key={r.unidad} className="mb-3 pb-3 border-b border-slate-100 last:border-0 last:mb-0 last:pb-0">
                  <p className="text-xs font-medium text-slate-700 mb-1.5">{r.unidad} <span className="text-slate-400">({r.total_consultas} consultas)</span></p>
                  <BarraViva etiqueta="Confianza alta" pct={r.confianza_pct} color={COLOR_SEMAFORO_DASH[r.confianza_color]} />
                  <BarraViva etiqueta="Sin sentimiento negativo" pct={r.sentimiento_pct} color={COLOR_SEMAFORO_DASH[r.sentimiento_color]} />
                </div>
              ))}
            </div>
          )}

          {actualizadoEn && (
            <p className="text-[11px] text-slate-400 text-right">Actualizado {actualizadoEn.toLocaleTimeString("es-CR")}</p>
          )}
        </>
      )}
    </div>
  );
}

function DashboardView() {
  const [adminKey, setAdminKey] = useAdminKey();
  return (
    <AdminKeyGate adminKey={adminKey} onSave={setAdminKey}>
      <DashboardLive adminKey={adminKey} />
    </AdminKeyGate>
  );
}

function AdminView() {
  const [adminKey, setAdminKey] = useAdminKey();
  const [vista, setVista] = useState("lista"); // 'lista' | 'nueva' | id de propiedad
  const [propiedades, setPropiedades] = useState([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState([]);
  const [propiedadEditando, setPropiedadEditando] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargarListas = async () => {
    setCargando(true);
    setError("");
    try {
      const [props, campos] = await Promise.all([
        adminFetch("/admin/propiedades", adminKey),
        adminFetch("/admin/campos", adminKey),
      ]);
      setPropiedades(props);
      setCamposPersonalizados(campos);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (adminKey) cargarListas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  const abrirEdicion = async (resumen) => {
    setCargando(true);
    setError("");
    try {
      const completa = await adminFetch(`/admin/propiedades/${resumen.id}`, adminKey);
      setPropiedadEditando(completa);
      setVista(resumen.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const eliminarPropiedad = async (resumen) => {
    if (!confirm(`¿Eliminar "${resumen.nombre}"? Esto la quita del sitio y del bot.`)) return;
    setError("");
    try {
      await adminFetch(`/admin/propiedades/${resumen.id}`, adminKey, { method: "DELETE" });
      setAviso("Propiedad eliminada. El sitio se va a actualizar solo en unos minutos.");
      cargarListas();
    } catch (e) {
      setError(e.message);
    }
  };

  const guardarPropiedad = async (datos) => {
    setGuardando(true);
    setError("");
    try {
      await adminFetch("/admin/propiedades", adminKey, { method: "POST", body: JSON.stringify(datos) });
      setAviso("Guardado. El sitio se va a actualizar solo en unos minutos (redeploy automático).");
      setVista("lista");
      setPropiedadEditando(null);
      cargarListas();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <AdminKeyGate adminKey={adminKey} onSave={setAdminKey}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Settings size={18} /> Admin</h2>
            <p className="text-sm text-slate-500">Agregar, editar y eliminar propiedades — se guarda en Supabase y el sitio se actualiza solo.</p>
          </div>
          {vista !== "lista" && (
            <button onClick={() => { setVista("lista"); setPropiedadEditando(null); }} className="text-sm text-blue-900 font-medium">
              ← Volver a la lista
            </button>
          )}
        </div>

        {aviso && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {cargando && <p className="text-sm text-slate-400">Cargando…</p>}

        {vista === "lista" && !cargando && (
          <>
            <ConfiguracionGeneralPanel adminKey={adminKey} />
            <InformeMensualPanel adminKey={adminKey} />
            <ImportarJsonPanel adminKey={adminKey} />
            <CamposPersonalizadosPanel campos={camposPersonalizados} adminKey={adminKey} onCambio={cargarListas} />
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Propiedades ({propiedades.length})</p>
              <ListaConEdicion
                items={propiedades}
                renderLabel={(p) => (
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
                    <p className="text-xs text-slate-400">{p.zona}</p>
                    {p.avisos?.length > 0 && (
                      <details className="mt-1">
                        <summary className="text-xs text-red-600 font-medium cursor-pointer">
                          ⚠ {p.avisos.length} dato{p.avisos.length === 1 ? "" : "s"} importante{p.avisos.length === 1 ? "" : "s"} faltante{p.avisos.length === 1 ? "" : "s"}
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {p.avisos.map((a, i) => <li key={i} className="text-xs text-red-500">• {a}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                onEdit={abrirEdicion}
                onDelete={eliminarPropiedad}
                addLabel="Agregar propiedad"
                onAdd={() => { setPropiedadEditando(null); setVista("nueva-intro"); }}
              />
            </div>
          </>
        )}

        {vista === "nueva-intro" && (
          <NuevaPropiedadIntro
            adminKey={adminKey}
            onListo={(campos) => { setPropiedadEditando(campos); setVista("nueva"); }}
            onOmitir={() => { setPropiedadEditando(null); setVista("nueva"); }}
          />
        )}

        {(vista === "nueva" || (vista !== "lista" && propiedadEditando)) && (
          <PropertyForm
            propiedadInicial={propiedadEditando}
            esNueva={vista === "nueva"}
            camposPersonalizados={camposPersonalizados}
            onGuardar={guardarPropiedad}
            onCancelar={() => { setVista("lista"); setPropiedadEditando(null); }}
            guardando={guardando}
            error={error}
            adminKey={adminKey}
          />
        )}
      </div>
    </AdminKeyGate>
  );
}

export default function App() {
  const [selected, setSelected] = useState("home");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightTerm, setHighlightTerm] = useState("");

  // Animación "aparecer al entrar en pantalla": observa cualquier tarjeta
  // (patrón .rounded-2xl.border.border-slate-200.bg-white) que exista o se
  // agregue al DOM — como el contenido cambia al navegar entre propiedades,
  // un MutationObserver detecta las tarjetas nuevas y las suma al mismo
  // IntersectionObserver, sin tener que tocar cada componente.
  useEffect(() => {
    const SELECTOR = ".rounded-2xl.border.border-slate-200.bg-white";
    const observadas = new WeakSet();
    const io = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("in-view");
            io.unobserve(entrada.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    const observarNuevas = () => {
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (!observadas.has(el)) {
          observadas.add(el);
          io.observe(el);
        }
      });
    };
    observarNuevas();
    const mo = new MutationObserver(observarNuevas);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  // Propiedades en orden alfabético para el menú (Inicio siempre va primero, fijo)
  const alphabeticalProperties = useMemo(
    () => [...DATA.properties].sort((a, b) => a.name.localeCompare(b.name, "es")),
    []
  );

  const navItems = useMemo(
    () => [{ id: "home", name: "Inicio", icon: true, group: null }, ...alphabeticalProperties.map((p) => ({ id: p.id, name: p.name, group: p.group }))],
    [alphabeticalProperties]
  );

  // Índice de búsqueda: recorre propiedades, unidades y datos generales
  // para poder encontrar coincidencias de contenido (ej. "42", "S2P34", "aditum")
  const searchIndex = useMemo(() => {
    const items = [];
    const push = (label, sub, propertyId, text) => {
      items.push({ label, sub, propertyId, text: normalizeStr(text) });
    };

    // Contenido general de Inicio (mensajes frecuentes, contactos, FAQs, comunicación)
    (DATA.general.mensajesFrecuentes || []).forEach((m) => {
      push(m.title, "Inicio · Mensajes frecuentes", "home", `${m.title} ${m.body}`);
    });
    (DATA.general.contactos || []).forEach((c) => {
      push(c.label, "Inicio · Contactos rápidos", "home", `${c.label} ${c.value} ${c.note || ""}`);
    });
    (DATA.general.faqs || []).forEach((f) => {
      push(f.q, "Inicio · Preguntas frecuentes", "home", `${f.q} ${f.a}`);
    });
    if (DATA.general.comunicacion) {
      push(DATA.general.comunicacion.titulo, "Inicio", "home", `${DATA.general.comunicacion.titulo} ${DATA.general.comunicacion.bullets.join(" ")}`);
    }
    if (DATA.general.formulario) {
      push("Formulario diario", "Inicio", "home", `${DATA.general.formulario.texto} ${DATA.general.formulario.espaciosObligatorios || ""}`);
    }

    DATA.properties.forEach((p) => {
      push(p.name, p.zone, p.id, `${p.name} ${p.zone} ${p.owner || ""} ${p.note || ""}`);

      (p.quickInfo || []).forEach(([k, v]) => {
        push(`${k}: ${v}`, p.name, p.id, `${p.name} ${k} ${v}`);
      });

      (p.rules || []).forEach((r) => {
        push(r.length > 70 ? r.slice(0, 70) + "…" : r, `${p.name} · Horarios`, p.id, `${p.name} ${r}`);
      });

      if (p.correoTemplate) {
        push(p.correoTemplate.title, p.name, p.id, `${p.name} ${p.correoTemplate.title} ${p.correoTemplate.body}`);
      }

      (p.messages || []).forEach((m) => {
        push(m.title, p.name, p.id, `${p.name} ${m.title} ${m.body}`);
      });

      if (p.publicInfo) {
        const pi = p.publicInfo;
        if (pi.amenities && pi.amenities.length) {
          push("Amenidades", p.name, p.id, `${p.name} amenidades ${pi.amenities.join(" ")}`);
        }
        (pi.rules || []).forEach((r) => {
          push(r.length > 70 ? r.slice(0, 70) + "…" : r, `${p.name} · Reglas de la casa`, p.id, `${p.name} ${r}`);
        });
        (pi.nearby || []).forEach((n) => {
          const text = n && typeof n === "object" ? n.text : n;
          push(text, `${p.name} · Cerca de la propiedad`, p.id, `${p.name} ${text}`);
        });
        if (pi.note) push(pi.note.length > 70 ? pi.note.slice(0, 70) + "…" : pi.note, p.name, p.id, `${p.name} ${pi.note}`);
      }

      if (p.localExperiences) {
        push("Experiencias y actividades cercanas", p.name, p.id, `${p.name} tours actividades experiencias localbird ${p.localExperiences.resumen} ${(p.localExperiences.categorias || []).join(" ")} ${(p.localExperiences.destacados || []).map((d) => d.nombre).join(" ")}`);
      }

      if (p.guiaDigital) {
        push("Guía digital del huésped", p.name, p.id, `${p.name} guia digital huesped ${p.guiaDigital.nota || ""}`);
      }

      (p.units || []).forEach((u) => {
        const baseFields = [u.name, u.num, u.pax, u.parqueo, u.accessCode, u.forms, u.correo, u.whatsapp, u.app].filter(Boolean).join(" ");
        push(`${u.name}${u.num ? ` · ${u.num}` : ""}`, p.name, p.id, `${p.name} ${baseFields}`);

        (u.extra || []).forEach(([k, v]) => {
          push(`${k}: ${v}`, `${p.name} · ${u.name}`, p.id, `${p.name} ${u.name} ${k} ${v}`);
        });

        (u.rooms || []).forEach((r) => {
          push(r, `${p.name} · ${u.name} · Habitaciones`, p.id, `${p.name} ${u.name} ${r}`);
        });

        if (u.checkin) {
          const checkinMsgs = Array.isArray(u.checkin) ? u.checkin : [u.checkin];
          checkinMsgs.forEach((cm) => {
            push(cm.title, p.name, p.id, `${p.name} ${u.name} ${cm.title} ${cm.body}`);
          });
        }

        if (u.listing) {
          push(u.listing.title, `${p.name} · ficha pública`, p.id, `${p.name} ${u.name} ${u.listing.title} ${u.listing.description}`);
        }

        if (u.guiaDigital) {
          push("Guía digital del huésped", `${p.name} · ${u.name}`, p.id, `${p.name} ${u.name} guia digital huesped ${u.guiaDigital.nota || ""}`);
        }
      });
    });

    return items;
  }, []);

  const searchResults = useMemo(() => {
    const q = normalizeStr(search.trim());
    if (!q) return [];
    const seen = new Set();
    const out = [];
    for (const item of searchIndex) {
      if (!item.text.includes(q)) continue;
      const key = item.propertyId + "|" + item.label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= 20) break;
    }
    return out;
  }, [search, searchIndex]);

  const [searchFocused, setSearchFocused] = useState(false);

  const selectedProperty = DATA.properties.find((p) => p.id === selected);

  const goToProperty = (id, term) => {
    setSelected(id);
    setSearch("");
    setMenuOpen(false);
    setHighlightTerm(term || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen w-full max-w-full bg-slate-50 pb-10">
      <TelegramFloat />
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2 flex items-center gap-2">
            <button onClick={() => goToProperty("home")} className="flex items-center gap-2 min-w-0 shrink-0 lg:flex-initial text-left">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                <img src={logoSofia} alt="S.O.F.I.A." className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm leading-tight whitespace-nowrap">S.O.F.I.A.</p>
                <p className="text-[11px] text-slate-400 leading-tight whitespace-nowrap">Sistema Operativo de Fidelización e Información Avanzada</p>
              </div>
            </button>
            <span className="hidden sm:inline-block text-[11px] text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 whitespace-nowrap ml-1">
              Cliente: Zafiro Property Management
            </span>

            {/* Búsqueda inline: solo en desktop/tablet (lg+), al lado del nombre */}
            <div className="hidden lg:block flex-1 max-w-sm relative ml-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Buscar en el contenido... (ej. 42, S2P34, wifi)"
                className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-800"
              />
              {searchFocused && search.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-lg max-h-80 overflow-y-auto z-30">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-slate-400 px-4 py-3">Sin resultados para "{search}"</p>
                  ) : (
                    searchResults.map((r, i) => (
                      <button
                        key={i}
                        onMouseDown={() => goToProperty(r.propertyId, search)}
                        className="w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                      >
                        <p className="text-sm font-medium text-slate-800 truncate">{r.label}</p>
                        <p className="text-xs text-slate-400 truncate">{r.sub}</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 lg:hidden" />

            {/* Hamburguesa: visible en todos los tamaños */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 bg-slate-100 active:bg-slate-200"
              aria-label="Abrir menú"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          {/* Search: mobile, debajo del header (en desktop ya está arriba, al lado del nombre) */}
          <div className="lg:hidden px-4 sm:px-6 pb-2 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Buscar en el contenido... (ej. 42, S2P34, wifi)"
              className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-800"
            />
            {searchFocused && search.trim() && (
              <div className="absolute left-4 right-4 sm:left-6 top-full mt-1 bg-white rounded-2xl border border-slate-200 shadow-lg max-h-80 overflow-y-auto z-30">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3">Sin resultados para "{search}"</p>
                ) : (
                  searchResults.map((r, i) => (
                    <button
                      key={i}
                      onMouseDown={() => goToProperty(r.propertyId, search)}
                      className="w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <p className="text-sm font-medium text-slate-800 truncate">{r.label}</p>
                      <p className="text-xs text-slate-400 truncate">{r.sub}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Menú desplegable (grupos San José / Guanacaste-Jacó): en todos los tamaños, con hamburguesa */}
          {menuOpen && (
            <div className="px-4 sm:px-6 lg:px-8 pb-3 max-h-[60vh] overflow-y-auto">
              <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
                <button
                  onClick={() => goToProperty("home")}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selected === "home" ? "bg-blue-900 text-white" : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  <Home size={14} />
                  Inicio
                </button>
                <button
                  onClick={() => goToProperty("calendario")}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selected === "calendario" ? "bg-blue-900 text-white" : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  <CalendarDays size={14} />
                  Calendario
                </button>
                <button
                  onClick={() => goToProperty("dashboard")}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selected === "dashboard" ? "bg-blue-900 text-white" : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  <LayoutDashboard size={14} />
                  Dashboard
                </button>
                <button
                  onClick={() => goToProperty("admin")}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selected === "admin" ? "bg-blue-900 text-white" : "text-slate-600 active:bg-slate-100"
                  }`}
                >
                  <Settings size={14} />
                  Admin
                </button>
                {["sanjose", "jaco", "guanacaste"].map((groupId) => {
                  const items = navItems.filter((i) => i.group === groupId);
                  if (items.length === 0) return null;
                  const gm = GROUP_META[groupId];
                  return (
                    <div key={groupId} className="mt-2">
                      <p className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-3 mb-1 ${gm.badgeText}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${gm.dot}`} />
                        {gm.label}
                      </p>
                      <div className="lg:grid lg:grid-cols-3 lg:gap-1">
                        {items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => goToProperty(item.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                              selected === item.id ? `${gm.pillActive} text-white` : "text-slate-600 active:bg-slate-100"
                            }`}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 max-w-6xl mx-auto">
        <HighlightContext.Provider value={highlightTerm}>
          {selected === "home" ? (
            <HomeView
              general={DATA.general}
              checkInGeneral={DATA.checkInGeneral}
              checkOutGeneral={DATA.checkOutGeneral}
              masterTable={DATA.masterTable}
              onOpenProperty={goToProperty}
            />
          ) : selected === "calendario" ? (
            <CalendarioView />
          ) : selected === "dashboard" ? (
            <DashboardView />
          ) : selected === "admin" ? (
            <AdminView />
          ) : selectedProperty ? (
            <PropertyView property={selectedProperty} />
          ) : (
            <p className="text-sm text-slate-400 text-center pt-10">Selecciona una propiedad arriba.</p>
          )}
        </HighlightContext.Provider>
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        html, body { max-width: 100%; overflow-x: hidden; }
        img { max-width: 100%; }
      `}</style>
    </div>
  );
}
