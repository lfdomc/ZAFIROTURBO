import { useState, useEffect, useMemo } from "react";

// URL del backend del bot (FastAPI en Railway). Misma variable que usa
// el panel Admin — configurada en Vercel como VITE_BOT_API_URL.
const BOT_API_URL = import.meta.env.VITE_BOT_API_URL || "https://tu-bot.up.railway.app";

function normalizeStr(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function Highlight({ text, term }) {
  const str = text === undefined || text === null ? "" : String(text);
  const t = (term || "").trim();
  if (!t) return <>{str}</>;
  const normStr = normalizeStr(str);
  const normTerm = normalizeStr(t);
  if (!normTerm || !normStr.includes(normTerm)) return <>{str}</>;
  const parts = [];
  let idx = 0, pos;
  while ((pos = normStr.indexOf(normTerm, idx)) !== -1) {
    if (pos > idx) parts.push(str.slice(idx, pos));
    parts.push(<mark key={pos} className="bg-yellow-200 text-slate-900 rounded px-0.5">{str.slice(pos, pos + normTerm.length)}</mark>);
    idx = pos + normTerm.length;
  }
  if (idx < str.length) parts.push(str.slice(idx));
  return <>{parts}</>;
}

function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  );
}

function Fila({ k, v, term }) {
  if (!v) return null;
  return (
    <p className="text-sm text-slate-700 py-1 border-b border-slate-50 last:border-0">
      <span className="font-medium text-slate-800"><Highlight text={k} term={term} />: </span>
      <Highlight text={v} term={term} />
    </p>
  );
}

// Construye una lista de {texto, buscable} para poder filtrar por
// coincidencia de texto en cualquier parte de la página.
function construirBloques(prop) {
  const bloques = [];
  const push = (seccion, titulo, texto) => bloques.push({ seccion, titulo, texto: `${titulo} ${texto}` });

  const req = prop.requisitosCheckIn || {};
  if (req.resumen || req.detalle) push("checkin", "Check-in", `${req.resumen || ""} ${req.detalle || ""}`);

  (prop.quickInfo || []).forEach(([k, v]) => push("info", k, v));
  (prop.rules || []).forEach((r) => push("reglas", "Regla", r));

  const pub = prop.publicInfo || {};
  if (pub.amenities?.length) push("amenidades", "Amenidades", pub.amenities.join(", "));
  (pub.rules || []).forEach((r) => push("reglas", "Regla", r));
  (pub.nearby || []).forEach((n) => push("cerca", "Cerca", typeof n === "object" ? n.text : n));

  if (prop.guiaDigital?.comoLlegar) push("como-llegar", "Cómo llegar", prop.guiaDigital.comoLlegar);

  const le = prop.localExperiences || {};
  if (le.resumen) push("experiencias", "Experiencias cercanas", le.resumen);

  (prop.messages || []).forEach((m) => push("mensajes", m.title, m.body));

  (prop.units || []).forEach((u) => {
    const nombreU = `${u.name || ""} ${u.num ? `(${u.num})` : ""}`.trim();
    if (u.pax) push("unidad", `${nombreU} · Capacidad`, `${u.pax} personas`);
    if (u.parqueo) push("unidad", `${nombreU} · Parqueo`, u.parqueo);
    if (u.accessCode) push("unidad", `${nombreU} · Código de acceso`, u.accessCode);
    if (u.app) push("unidad", `${nombreU} · Ingreso por app`, u.app);
    if (u.whatsapp) push("unidad", `${nombreU} · WhatsApp de seguridad`, u.whatsapp);
    (u.extra || []).forEach(([k, v]) => push("unidad", `${nombreU} · ${k}`, v));
    (u.rooms || []).forEach((r) => push("unidad", `${nombreU} · Habitación`, r));
    (u.checkin || []).forEach((m) => push("unidad", `${nombreU} · ${m.title}`, m.body));
    if (u.listing?.description) push("unidad", `${nombreU} · Descripción`, u.listing.description);
  });

  return bloques;
}

export default function ConsultaView() {
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error
  const [mensajeError, setMensajeError] = useState("");
  const [propiedad, setPropiedad] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setEstado("error");
      setMensajeError("Este link no tiene la información necesaria. Pedile a Zafiro que te lo reenvíe.");
      return;
    }
    fetch(`${BOT_API_URL}/consulta/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.detail || "No se pudo cargar la información.");
        }
        return r.json();
      })
      .then((data) => {
        setPropiedad(data.propiedad);
        setEstado("ok");
      })
      .catch((e) => {
        setMensajeError(e.message);
        setEstado("error");
      });
  }, []);

  const bloques = useMemo(() => (propiedad ? construirBloques(propiedad) : []), [propiedad]);

  const bloquesFiltrados = useMemo(() => {
    const q = normalizeStr(busqueda.trim());
    if (!q) return bloques;
    return bloques.filter((b) => normalizeStr(b.texto).includes(q));
  }, [busqueda, bloques]);

  if (estado === "cargando") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Cargando información…</p>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="text-center max-w-xs">
          <p className="text-3xl mb-3">🔒</p>
          <p className="text-sm text-slate-600">{mensajeError}</p>
        </div>
      </div>
    );
  }

  const req = propiedad.requisitosCheckIn || {};
  const pub = propiedad.publicInfo || {};
  const le = propiedad.localExperiences || {};

  return (
    <div className="min-h-screen w-full max-w-full bg-slate-50 pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-3">
          <p className="text-lg font-bold text-slate-900">{propiedad.name}</p>
          {propiedad.zone && <p className="text-xs text-slate-400 mb-2">{propiedad.zone}</p>}
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar (ej. wifi, código, check-out...)"
            className="w-full rounded-full bg-slate-100 px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-800"
          />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {busqueda.trim() ? (
          bloquesFiltrados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center pt-8">Sin resultados para "{busqueda}"</p>
          ) : (
            bloquesFiltrados.map((b, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm text-slate-700"><Highlight text={b.texto} term={busqueda} /></p>
              </div>
            ))
          )
        ) : (
          <>
            {(req.resumen || req.detalle) && (
              <Card title="Check-in">
                {req.resumen && <p className="text-sm text-slate-700 mb-1">{req.resumen}</p>}
                {req.detalle && <p className="text-sm text-slate-600">{req.detalle}</p>}
                {req.link && (
                  <a href={req.link} target="_blank" rel="noreferrer" className="text-blue-900 text-sm font-medium underline break-all block mt-2">
                    {req.linkLabel || "Abrir formulario"}
                  </a>
                )}
              </Card>
            )}

            {propiedad.quickInfo?.length > 0 && (
              <Card title="Información rápida">
                {propiedad.quickInfo.map(([k, v], i) => <Fila key={i} k={k} v={v} />)}
              </Card>
            )}

            {propiedad.units?.map((u) => (
              <Card key={u.id} title={`${u.name || "Unidad"}${u.num ? ` · ${u.num}` : ""}`}>
                <Fila k="Capacidad" v={u.pax ? `${u.pax} personas` : null} />
                <Fila k="Parqueo" v={u.parqueo} />
                <Fila k="Código de acceso" v={u.accessCode} />
                <Fila k="Ingreso por app" v={u.app} />
                <Fila k="WhatsApp de seguridad" v={u.whatsapp} />
                {(u.extra || []).map(([k, v], i) => <Fila key={i} k={k} v={v} />)}
                {u.rooms?.length > 0 && <Fila k="Habitaciones" v={u.rooms.join(" · ")} />}
                {(u.checkin || []).map((m, i) => (
                  <div key={i} className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500">{m.title}</p>
                    <p className="text-sm text-slate-600 whitespace-pre-line">{m.body}</p>
                  </div>
                ))}
              </Card>
            ))}

            {propiedad.rules?.length > 0 && (
              <Card title="Reglas de la casa">
                <ul className="space-y-1.5">
                  {propiedad.rules.map((r, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-blue-800">•</span>{r}</li>
                  ))}
                </ul>
              </Card>
            )}

            {pub.amenities?.length > 0 && (
              <Card title="Amenidades">
                <p className="text-sm text-slate-700">{pub.amenities.join(" · ")}</p>
              </Card>
            )}

            {pub.nearby?.length > 0 && (
              <Card title="Cerca de la propiedad">
                <ul className="space-y-1.5">
                  {pub.nearby.map((n, i) => (
                    <li key={i} className="text-sm text-slate-700">{typeof n === "object" ? n.text : n}</li>
                  ))}
                </ul>
              </Card>
            )}

            {propiedad.guiaDigital?.comoLlegar && (
              <Card title="Cómo llegar">
                <p className="text-sm text-slate-700">{propiedad.guiaDigital.comoLlegar}</p>
              </Card>
            )}

            {le.resumen && (
              <Card title="Experiencias y actividades cercanas">
                <p className="text-sm text-slate-700 mb-2">{le.resumen}</p>
                {le.url && (
                  <a href={le.url} target="_blank" rel="noreferrer" className="text-blue-900 text-sm font-medium underline break-all">
                    Ver más ↗
                  </a>
                )}
              </Card>
            )}

            {propiedad.messages?.map((m) => (
              <Card key={m.id} title={m.title}>
                <p className="text-sm text-slate-700 whitespace-pre-line">{m.body}</p>
              </Card>
            ))}
          </>
        )}
      </div>

      <style>{`html, body { max-width: 100%; overflow-x: hidden; } img { max-width: 100%; }`}</style>
    </div>
  );
}
