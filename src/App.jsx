import { useState, useEffect } from "react";

const STORAGE_KEY = "supervisor_obra_v1";

// ── PDF Export ──────────────────────────────────────────────────────────────
async function exportPDF(data, calcZonePct, totalPct) {
  const jspdfUrl = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = jspdfUrl; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const checkPage = (need = 30) => {
    if (y + need > H - margin) { doc.addPage(); y = margin; }
  };

  // ── Header ──
  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, W, 70, "F");
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 68, W, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(241, 245, 249);
  doc.text("SUPERVISOR DE OBRA", margin, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  const now = new Date();
  doc.text(`Reporte generado: ${now.toLocaleDateString("es-ES", { day:"2-digit", month:"long", year:"numeric" })} — ${now.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" })}`, margin, 48);
  // Avance total badge
  const pct = totalPct();
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(W - margin - 80, 12, 80, 44, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text(`${pct}%`, W - margin - 40, 36, { align: "center" });
  doc.setFontSize(8);
  doc.text("AVANCE TOTAL", W - margin - 40, 50, { align: "center" });

  y = 90;

  // ── Summary boxes ──
  const allItems = data.zonas.flatMap(z => z.items || []);
  const done = allItems.filter(i => i.terminado === 1).length;
  const summaries = [
    ["ZONAS", data.zonas.length, [30, 58, 95]],
    ["TRABAJADORES", data.trabajadores.length, [15, 83, 80]],
    ["ÍTEMS TOTALES", allItems.length, [79, 70, 229]],
    ["COMPLETADOS", done, [34, 197, 94]],
  ];
  const bw = (W - margin * 2 - 12) / 4;
  summaries.forEach(([label, val, rgb], i) => {
    const bx = margin + i * (bw + 4);
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(bx, y, bw, 46, 5, 5, "F");
    doc.setFillColor(...rgb);
    doc.rect(bx, y, 3, 46, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(241, 245, 249);
    doc.text(String(val), bx + bw / 2, y + 26, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(label, bx + bw / 2, y + 39, { align: "center" });
  });
  y += 62;

  // ── Section helper ──
  const sectionTitle = (title) => {
    checkPage(36);
    doc.setFillColor(245, 158, 11);
    doc.rect(margin, y, 3, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(241, 245, 249);
    doc.text(title.toUpperCase(), margin + 10, y + 13);
    y += 26;
  };

  // ── Zonas ──
  sectionTitle("Zonas de Trabajo");
  data.zonas.forEach((zona, zi) => {
    checkPage(60);
    const zPct = calcZonePct(zona);
    const zColor = zPct < 30 ? [239,68,68] : zPct < 70 ? [245,158,11] : [34,197,94];
    // Zone header
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, W - margin * 2, 36, 5, 5, "F");
    doc.setFillColor(...zColor);
    doc.roundedRect(margin, y, 4, 36, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(241, 245, 249);
    doc.text(`${zi + 1}. ${zona.nombre}`, margin + 12, y + 14);
    if (zona.descripcion) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(zona.descripcion, margin + 12, y + 26);
    }
    // Pct
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...zColor);
    doc.text(`${zPct}%`, W - margin - 6, y + 18, { align: "right" });
    // Progress bar
    const barX = margin + 12; const barW = W - margin * 2 - 80;
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(barX, y + 28, barW, 4, 2, 2, "F");
    doc.setFillColor(...zColor);
    doc.roundedRect(barX, y + 28, barW * zPct / 100, 4, 2, 2, "F");
    y += 44;

    // Workers in zone
    const workers = data.trabajadores.filter(t => t.zonaId === zona.id);
    if (workers.length > 0) {
      checkPage(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(125, 211, 252);
      doc.text("Trabajadores: " + workers.map(w => `${w.nombre}${w.rol ? ` (${w.rol})` : ""}`).join(" · "), margin + 12, y);
      y += 14;
    }

    // Items
    (zona.items || []).forEach((item) => {
      checkPage(24);
      const isDone = item.terminado === 1;
      doc.setFillColor(isDone ? 20 : 30, isDone ? 83 : 41, isDone ? 45 : 59);
      doc.roundedRect(margin + 10, y, W - margin * 2 - 10, 20, 3, 3, "F");
      // Checkbox
      doc.setFillColor(isDone ? 34 : 51, isDone ? 197 : 65, isDone ? 94 : 85);
      doc.roundedRect(margin + 15, y + 5, 10, 10, 2, 2, "F");
      if (isDone) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text("1", margin + 20, y + 13, { align: "center" });
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("0", margin + 20, y + 13, { align: "center" });
      }
      doc.setFont("helvetica", isDone ? "normal" : "normal");
      doc.setFontSize(9);
      doc.setTextColor(isDone ? 134 : 226, isDone ? 239 : 232, isDone ? 172 : 232);
      doc.text(item.nombre, margin + 30, y + 13);
      if (item.descripcion) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`— ${item.descripcion}`, margin + 30 + doc.getTextWidth(item.nombre) + 4, y + 13);
      }
      y += 24;

      // Materials
      if (item.materiales?.length > 0) {
        item.materiales.forEach(mat => {
          checkPage(16);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(`•  ${mat.nombre}`, margin + 30, y);
          doc.setTextColor(245, 158, 11);
          doc.setFont("helvetica", "bold");
          doc.text(`${mat.cantidad} ${mat.unidad}`, W - margin - 6, y, { align: "right" });
          y += 13;
        });
        y += 3;
      }
    });
    y += 10;
  });

  // ── Trabajadores ──
  if (data.trabajadores.length > 0) {
    checkPage(50);
    sectionTitle("Personal de Obra");
    const cols = 2;
    const tw = (W - margin * 2 - 8) / cols;
    data.trabajadores.forEach((t, i) => {
      if (i % cols === 0) checkPage(44);
      const tx = margin + (i % cols) * (tw + 8);
      const ty = y;
      if (i % cols === 0 && i > 0) y += 44;
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(tx, ty, tw, 36, 4, 4, "F");
      doc.setFillColor(30, 58, 95);
      doc.circle(tx + 20, ty + 18, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(241, 245, 249);
      doc.text(t.nombre, tx + 34, ty + 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      const zona = data.zonas.find(z => z.id === t.zonaId);
      doc.text(`${t.rol || "Sin rol"} — ${zona ? zona.nombre : "Sin zona"}`, tx + 34, ty + 26);
      if (i % cols === cols - 1) y += 44;
    });
    if (data.trabajadores.length % cols !== 0) y += 44;
  }

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFillColor(10, 22, 40);
    doc.rect(0, H - 28, W, 28, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Supervisor de Obra — Reporte de Avance", margin, H - 10);
    doc.text(`Página ${p} de ${pageCount}`, W - margin, H - 10, { align: "right" });
  }

  doc.save(`reporte-obra-${now.toISOString().slice(0,10)}.pdf`);
}

const defaultData = {
  trabajadores: [],
  zonas: [],
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultData;
  } catch {
    return defaultData;
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// ── Icons ──────────────────────────────────────────────────────────────────
const IconHardHat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>
    <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
  </svg>
);
const IconZone = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);
const IconBox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconChevron = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="16" height="16"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s" }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="13" height="13">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ── Progress Ring ───────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 56, stroke = 5, color = "#f59e0b" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.5s ease" }} strokeLinecap="round"/>
    </svg>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:"16px", width:"min(440px,92vw)", padding:"24px", boxShadow:"0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
          <h3 style={{ margin:0, fontSize:"1rem", fontWeight:700, color:"#f1f5f9", fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:"0.05em", textTransform:"uppercase" }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:"1.4rem", lineHeight:1, padding:"2px 6px" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
const inputStyle = { width:"100%", background:"#1e293b", border:"1px solid #334155", borderRadius:"8px", padding:"10px 12px", color:"#f1f5f9", fontSize:"0.875rem", boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
const btnPrimary = { background:"#f59e0b", color:"#0f172a", border:"none", borderRadius:"8px", padding:"10px 20px", fontWeight:700, cursor:"pointer", fontSize:"0.875rem", fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:"0.05em", textTransform:"uppercase" };
const btnSecondary = { background:"transparent", color:"#94a3b8", border:"1px solid #334155", borderRadius:"8px", padding:"10px 20px", fontWeight:600, cursor:"pointer", fontSize:"0.875rem" };

export default function SupervisorObra() {
  const [data, setData] = useState(loadData);
  const [activeTab, setActiveTab] = useState("zonas");
  const [expandedZones, setExpandedZones] = useState({});
  const [expandedItems, setExpandedItems] = useState({});
  const [modal, setModal] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Form states
  const [form, setForm] = useState({});

  useEffect(() => { saveData(data); }, [data]);

  const closeModal = () => { setModal(null); setForm({}); };

  const handleExportPDF = async () => {
    setExporting(true);
    try { await exportPDF(data, calcZonePct, totalPct); }
    finally { setExporting(false); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  const calcZonePct = (zona) => {
    if (!zona.items || zona.items.length === 0) return 0;
    const done = zona.items.filter(i => i.terminado === 1).length;
    return Math.round((done / zona.items.length) * 100);
  };

  const totalPct = () => {
    const allItems = data.zonas.flatMap(z => z.items || []);
    if (allItems.length === 0) return 0;
    return Math.round(allItems.filter(i => i.terminado === 1).length / allItems.length * 100);
  };

  const toggleZone = (id) => setExpandedZones(p => ({ ...p, [id]: !p[id] }));
  const toggleItem = (id) => setExpandedItems(p => ({ ...p, [id]: !p[id] }));

  // ── CRUD ───────────────────────────────────────────────────────────────
  const addTrabajador = () => {
    if (!form.nombre?.trim()) return;
    const zonaObj = data.zonas.find(z => z.id === form.zonaId);
    const nuevo = { id: generateId(), nombre: form.nombre.trim(), rol: form.rol?.trim() || "", zonaId: form.zonaId || null, zonaNombre: zonaObj?.nombre || "Sin zona" };
    setData(p => ({ ...p, trabajadores: [...p.trabajadores, nuevo] }));
    closeModal();
  };

  const deleteTrabajador = (id) => setData(p => ({ ...p, trabajadores: p.trabajadores.filter(t => t.id !== id) }));

  const addZona = () => {
    if (!form.nombre?.trim()) return;
    setData(p => ({ ...p, zonas: [...p.zonas, { id: generateId(), nombre: form.nombre.trim(), descripcion: form.descripcion?.trim() || "", items: [] }] }));
    closeModal();
  };

  const deleteZona = (id) => setData(p => ({ ...p, zonas: p.zonas.filter(z => z.id !== id), trabajadores: p.trabajadores.map(t => t.zonaId === id ? { ...t, zonaId: null, zonaNombre: "Sin zona" } : t) }));

  const addItem = (zonaId) => {
    if (!form.nombre?.trim()) return;
    const nuevoItem = { id: generateId(), nombre: form.nombre.trim(), descripcion: form.descripcion?.trim() || "", terminado: 0, materiales: [] };
    setData(p => ({ ...p, zonas: p.zonas.map(z => z.id === zonaId ? { ...z, items: [...z.items, nuevoItem] } : z) }));
    closeModal();
  };

  const deleteItem = (zonaId, itemId) => setData(p => ({ ...p, zonas: p.zonas.map(z => z.id === zonaId ? { ...z, items: z.items.filter(i => i.id !== itemId) } : z) }));

  const toggleItem_ = (zonaId, itemId) => setData(p => ({ ...p, zonas: p.zonas.map(z => z.id === zonaId ? { ...z, items: z.items.map(i => i.id === itemId ? { ...i, terminado: i.terminado === 1 ? 0 : 1 } : i) } : z) }));

  const addMaterial = (zonaId, itemId) => {
    if (!form.nombre?.trim()) return;
    const mat = { id: generateId(), nombre: form.nombre.trim(), cantidad: parseFloat(form.cantidad) || 0, unidad: form.unidad?.trim() || "" };
    setData(p => ({ ...p, zonas: p.zonas.map(z => z.id === zonaId ? { ...z, items: z.items.map(i => i.id === itemId ? { ...i, materiales: [...(i.materiales||[]), mat] } : i) } : z) }));
    closeModal();
  };

  const deleteMaterial = (zonaId, itemId, matId) => setData(p => ({ ...p, zonas: p.zonas.map(z => z.id === zonaId ? { ...z, items: z.items.map(i => i.id === itemId ? { ...i, materiales: i.materiales.filter(m => m.id !== matId) } : i) } : z) }));

  // ── Render ─────────────────────────────────────────────────────────────
  const pct = totalPct();
  const pctColor = pct < 30 ? "#ef4444" : pct < 70 ? "#f59e0b" : "#22c55e";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #020b18; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0f172a; } ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .tab-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.06em; text-transform: uppercase; transition: all 0.2s; }
        .tab-btn.active { color: #f59e0b; border-bottom: 2px solid #f59e0b; }
        .tab-btn:not(.active) { color: #64748b; border-bottom: 2px solid transparent; }
        .tab-btn:hover:not(.active) { color: #94a3b8; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 10px; overflow: hidden; transition: border-color 0.2s; }
        .card:hover { border-color: #334155; }
        .card-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
        .badge { display: inline-flex; align-items: center; justify-content: center; padding: 3px 8px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.05em; text-transform: uppercase; }
        .btn-icon { background: none; border: 1px solid #334155; border-radius: 8px; color: #64748b; cursor: pointer; padding: 5px 8px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .btn-icon:hover { border-color: #f59e0b; color: #f59e0b; }
        .btn-icon.danger:hover { border-color: #ef4444; color: #ef4444; }
        .toggle-item { width: 36px; height: 20px; border-radius: 10px; border: none; cursor: pointer; position: relative; transition: background 0.2s; display: flex; align-items: center; padding: 2px; }
        .toggle-knob { width: 16px; height: 16px; border-radius: 50%; background: white; transition: transform 0.2s; }
        .item-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid #1e293b; }
        .material-row { display: flex; align-items: center; gap: 8px; padding: 7px 16px 7px 40px; background: #020b18; border-top: 1px solid #0f172a; font-size: 0.8rem; color: #64748b; }
        input:focus { border-color: #f59e0b !important; }
        select { appearance: none; }
        .progress-bar-bg { height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; }
        .progress-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ minHeight:"100vh", background:"linear-gradient(135deg, #020b18 0%, #0a1628 100%)", fontFamily:"'DM Sans', sans-serif", color:"#f1f5f9" }}>

        {/* Header */}
        <div style={{ background:"#0a1628", borderBottom:"1px solid #1e293b", padding:"0 20px" }}>
          <div style={{ maxWidth:800, margin:"0 auto" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 0 12px" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:2 }}>
                  <div style={{ background:"#f59e0b22", borderRadius:8, padding:"6px 8px", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <IconHardHat />
                  </div>
                  <h1 style={{ margin:0, fontFamily:"'Barlow Condensed', sans-serif", fontSize:"1.6rem", fontWeight:800, letterSpacing:"0.04em", textTransform:"uppercase", color:"#f1f5f9" }}>
                    Supervisor <span style={{ color:"#f59e0b" }}>de Obra</span>
                  </h1>
                </div>
                <p style={{ margin:0, fontSize:"0.78rem", color:"#64748b", marginLeft:42 }}>
                  {data.zonas.length} zona{data.zonas.length !== 1 ? "s" : ""} · {data.trabajadores.length} trabajador{data.trabajadores.length !== 1 ? "es" : ""}
                </p>
              </div>
              {/* Global progress */}
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontFamily:"'Barlow Condensed', sans-serif", fontWeight:800, fontSize:"1.8rem", color: pctColor, lineHeight:1 }}>{pct}%</div>
                  <div style={{ fontSize:"0.7rem", color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em" }}>Avance total</div>
                </div>
                <ProgressRing pct={pct} color={pctColor}/>
              </div>
            </div>
            {/* Tabs + PDF button */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:0 }}>
                {[["zonas","Zonas & Ítems"],["trabajadores","Trabajadores"]].map(([key, label]) => (
                  <button key={key} className={`tab-btn ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>{label}</button>
                ))}
              </div>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                style={{ display:"flex", alignItems:"center", gap:7, background: exporting ? "#334155" : "#f59e0b", color: exporting ? "#94a3b8" : "#0f172a", border:"none", borderRadius:"8px", padding:"7px 14px", fontWeight:700, cursor: exporting ? "not-allowed" : "pointer", fontSize:"0.78rem", fontFamily:"'Barlow Condensed', sans-serif", letterSpacing:"0.05em", textTransform:"uppercase", transition:"all 0.2s", marginBottom:4 }}>
                {exporting ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation:"spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                )}
                {exporting ? "Generando..." : "Exportar PDF"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth:800, margin:"0 auto", padding:"20px 20px 80px" }}>

          {/* ── ZONAS TAB ─────────────────────────────────────────────── */}
          {activeTab === "zonas" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:"0.78rem", color:"#64748b", textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:600 }}>Zonas de trabajo</span>
                <button style={btnPrimary} onClick={() => setModal({ type:"addZona" })}>
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}><IconPlus/> Nueva zona</span>
                </button>
              </div>

              {data.zonas.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#334155" }}>
                  <IconZone/><p style={{ marginTop:12, fontSize:"0.9rem" }}>No hay zonas aún. ¡Agrega la primera!</p>
                </div>
              )}

              {data.zonas.map(zona => {
                const zonaPct = calcZonePct(zona);
                const zColor = zonaPct < 30 ? "#ef4444" : zonaPct < 70 ? "#f59e0b" : "#22c55e";
                const isOpen = expandedZones[zona.id];
                const workers = data.trabajadores.filter(t => t.zonaId === zona.id);
                return (
                  <div key={zona.id} className="card">
                    <div className="card-header" onClick={() => toggleZone(zona.id)}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <span style={{ fontWeight:700, fontSize:"0.95rem" }}>{zona.nombre}</span>
                          {zona.descripcion && <span style={{ fontSize:"0.75rem", color:"#64748b" }}>— {zona.descripcion}</span>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div className="progress-bar-bg" style={{ flex:1 }}>
                            <div className="progress-bar-fill" style={{ width:`${zonaPct}%`, background: zColor }}/>
                          </div>
                          <span style={{ fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700, fontSize:"0.85rem", color: zColor, minWidth:36 }}>{zonaPct}%</span>
                          <span className="badge" style={{ background:"#1e293b", color:"#94a3b8" }}>{zona.items?.length || 0} ítems</span>
                          {workers.length > 0 && <span className="badge" style={{ background:"#f59e0b22", color:"#f59e0b" }}>{workers.length} 👷</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn-icon" onClick={() => setModal({ type:"addItem", zonaId: zona.id })} title="Agregar ítem"><IconPlus/></button>
                        <button className="btn-icon danger" onClick={() => deleteZona(zona.id)} title="Eliminar zona"><IconTrash/></button>
                        <span style={{ color:"#334155" }} onClick={() => toggleZone(zona.id)}><IconChevron open={isOpen}/></span>
                      </div>
                    </div>

                    {isOpen && (
                      <div>
                        {/* Workers in zone */}
                        {workers.length > 0 && (
                          <div style={{ padding:"6px 16px 10px", display:"flex", flexWrap:"wrap", gap:6, borderTop:"1px solid #1e293b" }}>
                            {workers.map(w => (
                              <span key={w.id} style={{ background:"#0f2027", border:"1px solid #1e3a5f", borderRadius:20, padding:"3px 10px", fontSize:"0.75rem", color:"#7dd3fc" }}>
                                👷 {w.nombre}{w.rol ? ` · ${w.rol}` : ""}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Items */}
                        {(!zona.items || zona.items.length === 0) && (
                          <div style={{ padding:"14px 16px", color:"#334155", fontSize:"0.82rem", borderTop:"1px solid #1e293b" }}>Sin ítems todavía.</div>
                        )}
                        {zona.items?.map(item => {
                          const itemOpen = expandedItems[item.id];
                          return (
                            <div key={item.id}>
                              <div className="item-row">
                                {/* Toggle 0/1 */}
                                <button className="toggle-item" style={{ background: item.terminado ? "#22c55e" : "#1e293b" }}
                                  onClick={() => toggleItem_(zona.id, item.id)}>
                                  <div className="toggle-knob" style={{ transform: item.terminado ? "translateX(16px)" : "translateX(0)" }}/>
                                </button>
                                <div style={{ flex:1 }}>
                                  <span style={{ fontSize:"0.88rem", fontWeight:500, color: item.terminado ? "#22c55e" : "#e2e8f0", textDecoration: item.terminado ? "line-through" : "none", opacity: item.terminado ? 0.7 : 1 }}>
                                    {item.nombre}
                                  </span>
                                  {item.descripcion && <span style={{ fontSize:"0.75rem", color:"#475569", marginLeft:6 }}>{item.descripcion}</span>}
                                </div>
                                <span className="badge" style={{ background: item.terminado ? "#14532d" : "#1e293b", color: item.terminado ? "#22c55e" : "#64748b" }}>
                                  {item.terminado ? <><IconCheck/> 1</> : "0"}
                                </span>
                                <button className="btn-icon" onClick={() => { setModal({ type:"addMaterial", zonaId: zona.id, itemId: item.id }); }} title="Agregar material"><IconBox/></button>
                                {item.materiales?.length > 0 && (
                                  <button className="btn-icon" onClick={() => toggleItem(item.id)} style={{ fontSize:"0.7rem", gap:4, padding:"5px 8px" }}>
                                    <IconChevron open={itemOpen}/>
                                    <span style={{ fontFamily:"'Barlow Condensed', sans-serif", fontWeight:700 }}>{item.materiales.length}</span>
                                  </button>
                                )}
                                <button className="btn-icon danger" onClick={() => deleteItem(zona.id, item.id)}><IconTrash/></button>
                              </div>
                              {/* Materials */}
                              {itemOpen && item.materiales?.map(mat => (
                                <div key={mat.id} className="material-row">
                                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#f59e0b", flexShrink:0, display:"inline-block" }}/>
                                  <span style={{ flex:1 }}>{mat.nombre}</span>
                                  <span style={{ color:"#f59e0b", fontWeight:600, fontFamily:"'Barlow Condensed', sans-serif", fontSize:"0.85rem" }}>
                                    {mat.cantidad} {mat.unidad}
                                  </span>
                                  <button className="btn-icon danger" style={{ padding:"3px 6px" }} onClick={() => deleteMaterial(zona.id, item.id, mat.id)}><IconTrash/></button>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        <div style={{ padding:"10px 16px", borderTop:"1px solid #1e293b" }}>
                          <button style={{ ...btnSecondary, fontSize:"0.78rem", padding:"6px 14px", display:"flex", alignItems:"center", gap:6 }}
                            onClick={() => setModal({ type:"addItem", zonaId: zona.id })}>
                            <IconPlus/> Agregar ítem
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TRABAJADORES TAB ──────────────────────────────────────── */}
          {activeTab === "trabajadores" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <span style={{ fontSize:"0.78rem", color:"#64748b", textTransform:"uppercase", letterSpacing:"0.07em", fontWeight:600 }}>Personal de obra</span>
                <button style={btnPrimary} onClick={() => setModal({ type:"addTrabajador" })}>
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}><IconPlus/> Nuevo trabajador</span>
                </button>
              </div>

              {data.trabajadores.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#334155" }}>
                  <IconHardHat/><p style={{ marginTop:12, fontSize:"0.9rem" }}>No hay trabajadores. ¡Agrega el primero!</p>
                </div>
              )}

              <div style={{ display:"grid", gap:8 }}>
                {data.trabajadores.map(t => {
                  const zona = data.zonas.find(z => z.id === t.zonaId);
                  const zonaPct = zona ? calcZonePct(zona) : null;
                  return (
                    <div key={t.id} className="card" style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px" }}>
                      <div style={{ width:40, height:40, borderRadius:"50%", background:"#1e3a5f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.2rem", flexShrink:0 }}>
                        👷
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:"0.95rem", marginBottom:2 }}>{t.nombre}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          {t.rol && <span className="badge" style={{ background:"#1e293b", color:"#94a3b8" }}>{t.rol}</span>}
                          {zona ? (
                            <span className="badge" style={{ background:"#f59e0b22", color:"#f59e0b" }}>
                              📍 {zona.nombre} · {zonaPct}%
                            </span>
                          ) : (
                            <span className="badge" style={{ background:"#1e293b", color:"#475569" }}>Sin zona asignada</span>
                          )}
                        </div>
                      </div>
                      <button className="btn-icon danger" onClick={() => deleteTrabajador(t.id)}><IconTrash/></button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}

      {modal?.type === "addZona" && (
        <Modal title="Nueva Zona" onClose={closeModal}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input style={inputStyle} placeholder="Nombre de la zona *" value={form.nombre||""} onChange={e => setForm(p=>({...p, nombre:e.target.value}))}/>
            <input style={inputStyle} placeholder="Descripción (opcional)" value={form.descripcion||""} onChange={e => setForm(p=>({...p, descripcion:e.target.value}))}/>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnSecondary} onClick={closeModal}>Cancelar</button>
              <button style={btnPrimary} onClick={addZona}>Crear zona</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === "addItem" && (
        <Modal title="Nuevo Ítem" onClose={closeModal}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input style={inputStyle} placeholder="Nombre del ítem *" value={form.nombre||""} onChange={e => setForm(p=>({...p, nombre:e.target.value}))}/>
            <input style={inputStyle} placeholder="Descripción (opcional)" value={form.descripcion||""} onChange={e => setForm(p=>({...p, descripcion:e.target.value}))}/>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnSecondary} onClick={closeModal}>Cancelar</button>
              <button style={btnPrimary} onClick={() => addItem(modal.zonaId)}>Agregar ítem</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === "addMaterial" && (
        <Modal title="Agregar Material" onClose={closeModal}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input style={inputStyle} placeholder="Material *" value={form.nombre||""} onChange={e => setForm(p=>({...p, nombre:e.target.value}))}/>
            <div style={{ display:"flex", gap:8 }}>
              <input style={{...inputStyle, width:"40%"}} type="number" placeholder="Cantidad" value={form.cantidad||""} onChange={e => setForm(p=>({...p, cantidad:e.target.value}))}/>
              <input style={{...inputStyle, flex:1}} placeholder="Unidad (bolsas, m², kg…)" value={form.unidad||""} onChange={e => setForm(p=>({...p, unidad:e.target.value}))}/>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnSecondary} onClick={closeModal}>Cancelar</button>
              <button style={btnPrimary} onClick={() => addMaterial(modal.zonaId, modal.itemId)}>Agregar</button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === "addTrabajador" && (
        <Modal title="Nuevo Trabajador" onClose={closeModal}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input style={inputStyle} placeholder="Nombre completo *" value={form.nombre||""} onChange={e => setForm(p=>({...p, nombre:e.target.value}))}/>
            <input style={inputStyle} placeholder="Rol / Cargo (ej: Albañil, Electricista)" value={form.rol||""} onChange={e => setForm(p=>({...p, rol:e.target.value}))}/>
            <select style={{...inputStyle, color: form.zonaId ? "#f1f5f9" : "#64748b"}} value={form.zonaId||""} onChange={e => setForm(p=>({...p, zonaId:e.target.value}))}>
              <option value="">Sin zona asignada</option>
              {data.zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={btnSecondary} onClick={closeModal}>Cancelar</button>
              <button style={btnPrimary} onClick={addTrabajador}>Agregar</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
