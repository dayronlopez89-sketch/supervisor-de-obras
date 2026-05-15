


import { useState, useEffect, useRef } from "react";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const OBRAS_KEY   = "supervisor_obras_v2";
const ACTIVE_KEY  = "supervisor_active_obra";
const PIN_KEY     = "supervisor_pin_v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substr(2,9);
const today = () => new Date().toISOString().slice(0,10);
const fmt = n => n!=null&&n!==""?Number(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const fmtDate = s => s?new Date(s+"T12:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}):"—";
const daysDiff = s => { if(!s) return null; const d=Math.ceil((new Date(s+"T12:00:00")-new Date())/86400000); return d; };

const emptyObra = (nombre="") => ({
  id: uid(), nombre, descripcion:"", fechaInicio: today(), fechaFin:"", notas:"",
  zonas:[], trabajadores:[]
});

// ─── Async Storage ────────────────────────────────────────────────────────────
async function loadObras() {
  try { const r=await window.storage.get(OBRAS_KEY); return r?JSON.parse(r.value):[]; } catch { return []; }
}
async function saveObras(o) {
  try { await window.storage.set(OBRAS_KEY,JSON.stringify(o)); } catch {}
}
async function loadActiveId() {
  try { const r=await window.storage.get(ACTIVE_KEY); return r?r.value:null; } catch { return null; }
}
async function saveActiveId(id) {
  try { if(id) await window.storage.set(ACTIVE_KEY,id); } catch {}
}
async function loadPin() {
  try { const r=await window.storage.get(PIN_KEY); return r?r.value:""; } catch { return ""; }
}
async function savePin(p) {
  try { if(p) await window.storage.set(PIN_KEY,p); else await window.storage.delete(PIN_KEY); } catch {}
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
async function getJsPDF() {
  if(!window.jspdf){
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  return window.jspdf.jsPDF;
}

async function exportAvancePDF(obra, calcZonePct, totalPct) {
  const jsPDF = await getJsPDF();
  const doc = new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=40;
  let y=M;
  const chk=(n=30)=>{ if(y+n>H-M){doc.addPage();y=M;} };
  const now=new Date();

  // Header
  doc.setFillColor(10,22,40); doc.rect(0,0,W,75,"F");
  doc.setFillColor(245,158,11); doc.rect(0,73,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(241,245,249);
  doc.text("SUPERVISOR DE OBRA",M,28);
  doc.setFontSize(11); doc.setTextColor(245,158,11);
  doc.text(obra.nombre||"Obra sin nombre",M,46);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
  doc.text(`Generado: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})} — ${now.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`,M,62);

  const pct=totalPct();
  const pctClr = pct<30?[239,68,68]:pct<70?[245,158,11]:[34,197,94];
  doc.setFillColor(...pctClr); doc.roundedRect(W-M-80,8,80,54,6,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(26); doc.setTextColor(15,23,42);
  doc.text(`${pct}%`,W-M-40,38,{align:"center"});
  doc.setFontSize(7); doc.text("AVANCE",W-M-40,52,{align:"center"});

  y=90;
  const allItems=obra.zonas.flatMap(z=>z.items||[]);
  const done=allItems.filter(i=>i.terminado).length;
  const allMats=allItems.flatMap(i=>i.materiales||[]);
  const totalMat=allMats.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const gastado=allMats.filter(m=>["comprado","en_camino","entregado"].includes(m.estado||"")).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);

  const cards=[["ZONAS",obra.zonas.length,[30,58,95]],["TRABAJADORES",obra.trabajadores.length,[15,83,80]],["ÍTEMS TOTAL",allItems.length,[79,70,229]],["COMPLETADOS",done,[34,197,94]],["PRESUPUESTO","$"+fmt(totalMat),[245,158,11]],["GASTADO","$"+fmt(gastado),[239,68,68]]];
  const cw=(W-M*2-10)/3;
  cards.forEach(([label,val,rgb],i)=>{
    const row=Math.floor(i/3), col=i%3;
    const bx=M+col*(cw+5), by=y+row*54;
    doc.setFillColor(20,32,52); doc.roundedRect(bx,by,cw,46,5,5,"F");
    doc.setFillColor(...rgb); doc.rect(bx,by,3,46,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(typeof val==="number"?20:14); doc.setTextColor(241,245,249);
    doc.text(String(val),bx+cw/2,by+24,{align:"center"});
    doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139);
    doc.text(label,bx+cw/2,by+38,{align:"center"});
  });
  y+=118;

  // Zonas
  doc.setFillColor(245,158,11); doc.rect(M,y,3,18,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249);
  doc.text("ZONAS DE TRABAJO",M+10,y+13); y+=26;

  obra.zonas.forEach((zona,zi)=>{
    chk(50);
    const zPct=calcZonePct(zona);
    const zClr=zPct<30?[239,68,68]:zPct<70?[245,158,11]:[34,197,94];
    doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,38,5,5,"F");
    doc.setFillColor(...zClr); doc.roundedRect(M,y,4,38,2,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249);
    doc.text(`${zi+1}. ${zona.nombre}`,M+12,y+14);
    if(zona.descripcion){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(zona.descripcion,M+12,y+26);}
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...zClr);
    doc.text(`${zPct}%`,W-M-6,y+20,{align:"right"});
    const bX=M+12, bW=W-M*2-80;
    doc.setFillColor(30,41,59); doc.roundedRect(bX,y+30,bW,4,2,2,"F");
    if(zPct>0){doc.setFillColor(...zClr); doc.roundedRect(bX,y+30,bW*zPct/100,4,2,2,"F");}
    y+=46;
    (zona.items||[]).forEach(item=>{
      chk(22);
      const isDone=item.terminado;
      doc.setFillColor(isDone?15:25,isDone?50:35,isDone?30:55);
      doc.roundedRect(M+10,y,W-M*2-10,18,3,3,"F");
      doc.setFont("helvetica",isDone?"bold":"normal"); doc.setFontSize(8.5);
      doc.setTextColor(isDone?134:220,isDone?239:225,isDone?172:225);
      doc.text((isDone?"✓ ":"○ ")+item.nombre,M+16,y+12);
      if(item.fechaFin){ const d=daysDiff(item.fechaFin); const dc=d<0?[239,68,68]:d<3?[245,158,11]:[100,116,139]; doc.setTextColor(...dc); doc.setFontSize(7); doc.text(d<0?`Vencido ${Math.abs(d)}d`:`${d}d`,W-M-10,y+12,{align:"right"}); }
      y+=22;
    });
    y+=8;
  });

  // Trabajadores
  if(obra.trabajadores.length>0){
    chk(40);
    doc.setFillColor(245,158,11); doc.rect(M,y,3,18,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249);
    doc.text("PERSONAL DE OBRA",M+10,y+13); y+=26;
    obra.trabajadores.forEach(t=>{
      chk(18);
      const zona=obra.zonas.find(z=>z.id===t.zonaId);
      doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,16,3,3,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(220,225,235);
      doc.text(`👷 ${t.nombre}`,M+10,y+11);
      if(t.rol){doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(100,116,139);doc.text(t.rol,M+120,y+11);}
      if(zona){doc.setTextColor(245,158,11);doc.text(zona.nombre,W-M-6,y+11,{align:"right"});}
      y+=18;
    });
  }

  // Footer
  const pages=doc.internal.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-26,W,26,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(100,116,139);
    doc.text(`Supervisor de Obra — ${obra.nombre}`,M,H-10);
    doc.text(`Pág ${p}/${pages}`,W-M,H-10,{align:"right"});
  }
  doc.save(`avance-${(obra.nombre||"obra").replace(/\s+/g,"-").toLowerCase()}-${today()}.pdf`);
}

async function exportComprasPDF(obra) {
  const jsPDF = await getJsPDF();
  const doc = new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), M=40;
  let y=M;
  const chk=(n=30)=>{ if(y+n>H-M){doc.addPage();y=M;} };
  const now=new Date();

  doc.setFillColor(10,22,40); doc.rect(0,0,W,75,"F");
  doc.setFillColor(34,197,94); doc.rect(0,73,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(241,245,249);
  doc.text("ORDEN DE COMPRA",M,28);
  doc.setFontSize(10); doc.setTextColor(34,197,94);
  doc.text(obra.nombre||"Obra sin nombre",M,44);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
  doc.text(`Generado: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}`,M,60);
  y=90;

  let totalGeneral=0;
  const pendientes=[], todos=[];

  obra.zonas.forEach(zona=>{
    (zona.items||[]).forEach(item=>{
      (item.materiales||[]).forEach(mat=>{
        const total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0);
        totalGeneral+=total;
        const entry={...mat,zonaNombre:zona.nombre,itemNombre:item.nombre,total};
        todos.push(entry);
        if(!mat.estado||mat.estado==="pendiente") pendientes.push(entry);
      });
    });
  });

  const sections=[["MATERIALES PENDIENTES DE COMPRA",pendientes,"#ef4444"],["TODOS LOS MATERIALES",todos,"#94a3b8"]];
  sections.forEach(([title,items,color])=>{
    if(!items.length) return;
    chk(40);
    const [r,g,b]=color==="■ef4444"?[239,68,68]:[148,163,184];
    doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,24,4,4,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(241,245,249);
    doc.text(title,M+10,y+16); y+=32;
    items.forEach((mat,i)=>{
      chk(20);
      const EST={pendiente:[245,158,11],comprado:[34,197,94],en_camino:[56,189,248],entregado:[167,139,250]};
      const ec=EST[mat.estado||"pendiente"];
      doc.setFillColor(i%2===0?15:12,i%2===0?23:20,i%2===0?42:36);
      doc.rect(M,y,W-M*2,16,"F");
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(210,220,230);
      doc.text(mat.nombre||"",M+4,y+11);
      doc.setTextColor(...ec); doc.setFont("helvetica","bold"); doc.setFontSize(7);
      doc.text((mat.estado||"pendiente").toUpperCase(),M+120,y+11);
      doc.setFont("helvetica","normal"); doc.setTextColor(180,190,200); doc.setFontSize(8);
      doc.text(`${mat.cantidad||0} ${mat.unidad||""}`,M+180,y+11);
      doc.setTextColor(245,158,11); doc.setFont("helvetica","bold");
      doc.text(mat.total>0?`$${fmt(mat.total)}`:"—",W-M-6,y+11,{align:"right"});
      doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139); doc.setFontSize(7);
      doc.text(`${mat.zonaNombre} › ${mat.itemNombre}`,M+240,y+11);
      y+=17;
    });
    y+=10;
  });

  // Total
  chk(40);
  doc.setFillColor(245,158,11); doc.roundedRect(M,y,W-M*2,32,5,5,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(15,23,42);
  doc.text("TOTAL GENERAL",M+14,y+21);
  doc.setFontSize(16); doc.text(`$${fmt(totalGeneral)}`,W-M-10,y+21,{align:"right"});

  const pages=doc.internal.getNumberOfPages();
  for(let p=1;p<=pages;p++){
    doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-26,W,26,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(100,116,139);
    doc.text(`Orden de Compra — ${obra.nombre}`,M,H-10);
    doc.text(`Pág ${p}/${pages}`,W-M,H-10,{align:"right"});
  }
  doc.save(`compras-${(obra.nombre||"obra").replace(/\s+/g,"-").toLowerCase()}-${today()}.pdf`);
}

// ─── OCR Boleta con IA ───────────────────────────────────────────────────────
async function escanearBoleta(imageBase64) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
  if (!apiKey) throw new Error("No hay API Key configurada");

  const base64Data = imageBase64.split(",")[1];
  const mediaType = imageBase64.split(";")[0].split(":")[1] || "image/jpeg";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data }
          },
          {
            type: "text",
            text: `Analiza esta boleta o factura de materiales de construcción y extrae los datos.
Responde SOLO con un JSON válido, sin texto adicional, sin bloques de código, sin explicaciones.
El JSON debe tener exactamente esta estructura:
{
  "proveedor": "nombre del proveedor o tienda",
  "fechaCompra": "YYYY-MM-DD o vacío si no se ve",
  "materiales": [
    {
      "nombre": "nombre del producto",
      "cantidad": número,
      "unidad": "unidad (kg, bolsas, m², unidad, etc)",
      "precio": precio unitario como número
    }
  ]
}
Si no puedes leer algún campo, usa "" para strings y 0 para números.
Extrae TODOS los productos que aparezcan en la boleta.`
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Error al consultar la IA");
  }

  const data = await response.json();
  const text = data.content[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = {
  Hard: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>,
  Zone: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Plus: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Chev: ({open})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" style={{transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}><polyline points="6 9 12 15 18 9"/></svg>,
  Edit: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Lock: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="24" height="24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Unlock: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  Down: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Up: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Chart: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Gear: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Cart: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  Cam: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Photo: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Search: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Building: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10"/><path d="M9 7h1"/><path d="M14 7h1"/><path d="M9 11h1"/><path d="M14 11h1"/></svg>,
  Bell: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  Drag: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>,
  Key: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Cal: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Phone: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.52 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91A16 16 0 0 0 12 13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14v2.92z"/></svg>,
  Alert: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Check: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>,
  Note: ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  inp: {width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"9px 12px",color:"#f1f5f9",fontSize:"0.855rem",boxSizing:"border-box",outline:"none",fontFamily:"inherit"},
  btnP: {background:"#f59e0b",color:"#0f172a",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,cursor:"pointer",fontSize:"0.82rem",letterSpacing:"0.05em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:5},
  btnS: {background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnD: {background:"transparent",color:"#ef4444",border:"1px solid #ef444455",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnG: {background:"#0f172a",color:"#94a3b8",border:"1px solid #1e293b",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
};

const MAT_EST = {
  pendiente: {label:"Pendiente",color:"#f59e0b",bg:"#f59e0b18",dot:"#f59e0b"},
  comprado:  {label:"Comprado", color:"#22c55e",bg:"#22c55e18",dot:"#22c55e"},
  en_camino: {label:"En camino",color:"#38bdf8",bg:"#38bdf818",dot:"#38bdf8"},
  entregado: {label:"Entregado",color:"#a78bfa",bg:"#a78bfa18",dot:"#a78bfa"},
};

// ─── Progress Ring ────────────────────────────────────────────────────────────
function Ring({pct,size=56,stroke=5,color="#f59e0b"}) {
  const r=(size-stroke)/2,circ=2*Math.PI*r,off=circ-(pct/100)*circ;
  return <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset .5s"}}/>
  </svg>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({title,onClose,children,wide,full}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",display:"flex",alignItems:full?"stretch":"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)",padding:full?0:14}}>
    <div style={{background:"#0f172a",border:"1px solid #334155",borderRadius:full?0:16,width:`min(${wide?600:440}px,100vw)`,padding:"20px",boxShadow:"0 25px 60px rgba(0,0,0,.7)",maxHeight:full?"100vh":"92vh",overflowY:"auto",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexShrink:0}}>
        <h3 style={{margin:0,fontSize:"0.93rem",fontWeight:700,color:"#f1f5f9",letterSpacing:"0.06em",textTransform:"uppercase"}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:"1.5rem",lineHeight:1,padding:"2px 8px"}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto"}}>{children}</div>
    </div>
  </div>;
}

// ─── PIN Screen ───────────────────────────────────────────────────────────────
function PinScreen({onUnlock,hasPin}) {
  const [digits,setDigits]=useState(["","","","",""]);
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef()];
  const handle=(i,v)=>{
    if(!/^\d?$/.test(v))return;
    const next=[...digits]; next[i]=v; setDigits(next);
    if(v&&i<4) refs[i+1].current?.focus();
    if(next.every(d=>d!=="")){ const pin=next.join("");
      if(!hasPin||pin===window.__pin){ onUnlock(); }
      else{ setShake(true); setError("PIN incorrecto"); setTimeout(()=>{setDigits(["","","","",""]);setShake(false);setError("");refs[0].current?.focus();},700); }
    }
  };
  const onKey=(i,e)=>{ if(e.key==="Backspace"&&!digits[i]&&i>0) refs[i-1].current?.focus(); };
  return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{textAlign:"center",padding:"40px 24px"}}>
      <div style={{background:"#f59e0b22",borderRadius:"50%",width:76,height:76,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",border:"1px solid #f59e0b44"}}><Ico.Lock/></div>
      <h2 style={{margin:"0 0 6px",fontSize:"1.9rem",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",color:"#f1f5f9"}}>{hasPin?"Acceso Protegido":"Crear PIN"}</h2>
      <p style={{margin:"0 0 28px",fontSize:"0.84rem",color:"#64748b"}}>{hasPin?"Ingresa tu PIN de 5 dígitos":"Establece un PIN de 5 dígitos"}</p>
      <div style={{display:"flex",gap:10,justifyContent:"center",animation:shake?"shake .4s":"none"}}>
        {digits.map((d,i)=><input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1} value={d}
          onChange={e=>handle(i,e.target.value)} onKeyDown={e=>onKey(i,e)}
          style={{width:52,height:64,textAlign:"center",fontSize:"1.9rem",fontWeight:800,background:"#1e293b",border:`2px solid ${d?"#f59e0b":"#334155"}`,borderRadius:12,color:"#f1f5f9",outline:"none",transition:"border-color .2s"}}/>)}
      </div>
      {error&&<p style={{margin:"14px 0 0",color:"#ef4444",fontSize:"0.83rem"}}>{error}</p>}
      {!hasPin&&<><p style={{margin:"16px 0 4px",fontSize:"0.78rem",color:"#475569"}}>También puedes continuar sin PIN</p><button style={{...S.btnS,margin:"4px auto 0",justifyContent:"center"}} onClick={onUnlock}>Continuar sin PIN</button></>}
    </div>
  </div>;
}

// ─── Camera Modal ─────────────────────────────────────────────────────────────
function CameraModal({onCapture,onClose}) {
  const videoRef=useRef(); const canvasRef=useRef();
  const [stream,setStream]=useState(null);
  const [preview,setPreview]=useState(null);
  const [facingMode,setFacingMode]=useState("environment");

  useEffect(()=>{
    startCam(facingMode);
    return ()=>stopCam();
  },[facingMode]);

  const startCam=async(mode)=>{
    stopCam();
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:mode,width:{ideal:1280},height:{ideal:720}}});
      setStream(s);
      if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play();}
    }catch(e){console.error(e);}
  };
  const stopCam=()=>{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    setStream(null);
  };
  const capture=()=>{
    const v=videoRef.current,c=canvasRef.current;
    c.width=v.videoWidth; c.height=v.videoHeight;
    c.getContext("2d").drawImage(v,0,0);
    setPreview(c.toDataURL("image/jpeg",0.85));
  };
  const confirm=()=>{ onCapture(preview); onClose(); };
  const retake=()=>setPreview(null);

  return <Modal title="Tomar Foto" onClose={()=>{stopCam();onClose();}} full>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,height:"100%"}}>
      {!preview?<>
        <div style={{width:"100%",maxWidth:480,background:"#000",borderRadius:12,overflow:"hidden",flex:1,position:"relative"}}>
          <video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} playsInline muted/>
          <div style={{position:"absolute",inset:0,border:"2px solid rgba(245,158,11,.4)",borderRadius:12,pointerEvents:"none"}}/>
        </div>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        <div style={{display:"flex",gap:12,paddingBottom:8}}>
          <button style={S.btnG} onClick={()=>setFacingMode(f=>f==="environment"?"user":"environment")}>🔄 Voltear</button>
          <button style={{...S.btnP,padding:"14px 36px",fontSize:"1rem",borderRadius:50}} onClick={capture}>📸 Capturar</button>
          <button style={S.btnG} onClick={()=>{stopCam();onClose();}}>Cancelar</button>
        </div>
      </>:<>
        <img src={preview} style={{width:"100%",maxWidth:480,borderRadius:12,maxHeight:"70vh",objectFit:"contain"}} alt="preview"/>
        <div style={{display:"flex",gap:10,paddingBottom:8}}>
          <button style={S.btnG} onClick={retake}>🔄 Repetir</button>
          <button style={S.btnP} onClick={confirm}><Ico.Check/> Usar foto</button>
        </div>
      </>}
    </div>
  </Modal>;
}

// ─── Material Row ─────────────────────────────────────────────────────────────
function MatRow({mat,onEdit,onDelete,onStatus}) {
  const est=MAT_EST[mat.estado||"pendiente"];
  const total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0);
  return <div style={{background:"#060e1a",borderTop:"1px solid #0d1526",padding:"7px 14px 7px 20px"}}>
    <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:est.dot,flexShrink:0}}/>
      <span style={{flex:1,fontSize:"0.81rem",color:"#cbd5e1",fontWeight:500,minWidth:60}}>{mat.nombre}</span>
      <span style={{fontSize:"0.75rem",color:"#94a3b8"}}>{mat.cantidad} {mat.unidad}</span>
      {total>0&&<span style={{fontSize:"0.8rem",fontWeight:700,color:"#f59e0b"}}>${fmt(total)}</span>}
      <select value={mat.estado||"pendiente"} onChange={e=>onStatus(e.target.value)}
        style={{background:est.bg,border:`1px solid ${est.dot}44`,borderRadius:6,color:est.color,fontSize:"0.67rem",fontWeight:700,padding:"2px 5px",cursor:"pointer",outline:"none"}}>
        {Object.entries(MAT_EST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
      </select>
      <button className="ic" onClick={onEdit}><Ico.Edit/></button>
      <button className="ic danger" onClick={onDelete}><Ico.Trash/></button>
    </div>
    {(mat.proveedor||mat.fechaCompra)&&<div style={{display:"flex",gap:10,marginTop:3,paddingLeft:14,flexWrap:"wrap"}}>
      {mat.proveedor&&<span style={{fontSize:"0.65rem",color:"#475569"}}>🏪 {mat.proveedor}</span>}
      {mat.fechaCompra&&<span style={{fontSize:"0.65rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{mat.fechaCompra}</span>}
      {mat.notas&&<span style={{fontSize:"0.65rem",color:"#475569",fontStyle:"italic"}}>📝 {mat.notas}</span>}
    </div>}
  </div>;
}

// ─── Scan Boleta Modal ────────────────────────────────────────────────────────
function ScanBoletaModal({ onDatos, onClose }) {
  const [foto, setFoto] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [camMode, setCamMode] = useState(false);
  const videoRef = useRef(); const canvasRef = useRef();
  const [stream, setStream] = useState(null);

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(s);
      setCamMode(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); } }, 100);
    } catch { setError("No se pudo acceder a la cámara"); }
  };
  const stopCam = () => { stream?.getTracks().forEach(t => t.stop()); setStream(null); setCamMode(false); };
  const capturar = () => {
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    setFoto(c.toDataURL("image/jpeg", 0.9));
    stopCam();
  };
  const handleFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setFoto(ev.target.result); r.readAsDataURL(f);
  };
  const analizar = async () => {
    if (!foto) return;
    setScanning(true); setError("");
    try {
      const datos = await escanearBoleta(foto);
      onDatos(datos);
      onClose();
    } catch (e) {
      setError("Error: " + e.message);
    } finally { setScanning(false); }
  };

  return <Modal title="📷 Escanear Boleta con IA" onClose={() => { stopCam(); onClose(); }} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#1e293b", borderRadius: 10, padding: 12, fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.6 }}>
        🤖 <strong style={{ color: "#f59e0b" }}>IA leerá tu boleta</strong> y completará los materiales, cantidades y precios automáticamente.
      </div>

      {!camMode && !foto && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ ...S.btnP, flex: 1, justifyContent: "center" }} onClick={startCam}>
          📸 Usar Cámara
        </button>
        <label style={{ ...S.btnS, flex: 1, justifyContent: "center", cursor: "pointer" }}>
          🖼️ Galería
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </label>
      </div>}

      {camMode && <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <div style={{ width: "100%", background: "#000", borderRadius: 10, overflow: "hidden", maxHeight: 300 }}>
          <video ref={videoRef} style={{ width: "100%", objectFit: "cover", display: "block" }} playsInline muted />
        </div>
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btnG} onClick={stopCam}>Cancelar</button>
          <button style={{ ...S.btnP, padding: "12px 28px" }} onClick={capturar}>📸 Capturar</button>
        </div>
      </div>}

      {foto && !camMode && <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
        <img src={foto} style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid #334155" }} alt="boleta" />
        <div style={{ display: "flex", gap: 8, width: "100%" }}>
          <button style={{ ...S.btnG, flex: 1, justifyContent: "center" }} onClick={() => { setFoto(null); setError(""); }}>🔄 Otra foto</button>
          <button style={{ ...S.btnP, flex: 2, justifyContent: "center", opacity: scanning ? 0.7 : 1 }} onClick={analizar} disabled={scanning}>
            {scanning ? "🤖 Analizando..." : "🤖 Analizar con IA"}
          </button>
        </div>
      </div>}

      {scanning && <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: "2rem", animation: "spin 1s linear infinite", display: "inline-block" }}>⚙</div>
        <p style={{ color: "#f59e0b", fontSize: "0.82rem", marginTop: 8 }}>Claude está leyendo tu boleta...</p>
      </div>}

      {error && <div style={{ background: "#450a0a", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: "#fca5a5" }}>
        {error}
      </div>}
    </div>
  </Modal>;
}

// ─── MatForm ──────────────────────────────────────────────────────────────────
function MatForm({mat,onChange}) {
  const p=parseFloat(mat.precio)||0,q=parseFloat(mat.cantidad)||0,t=p*q;
  return <div style={{display:"flex",flexDirection:"column",gap:9}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Material *</label><input style={S.inp} placeholder="Ej: Cemento" value={mat.nombre||""} onChange={e=>onChange("nombre",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Estado</label>
        <select style={{...S.inp,color:"#f1f5f9"}} value={mat.estado||"pendiente"} onChange={e=>onChange("estado",e.target.value)}>
          {Object.entries(MAT_EST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Cantidad</label><input style={S.inp} type="number" min="0" step="any" placeholder="0" value={mat.cantidad||""} onChange={e=>onChange("cantidad",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Unidad</label><input style={S.inp} placeholder="kg, m²" value={mat.unidad||""} onChange={e=>onChange("unidad",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Precio u.</label><input style={S.inp} type="number" min="0" step="any" placeholder="0" value={mat.precio||""} onChange={e=>onChange("precio",e.target.value)}/></div>
    </div>
    {t>0&&<div style={{background:"#1e293b",borderRadius:8,padding:"7px 12px",display:"flex",justifyContent:"space-between"}}>
      <span style={{fontSize:"0.75rem",color:"#64748b"}}>Total</span>
      <span style={{fontSize:"0.95rem",fontWeight:800,color:"#f59e0b"}}>${fmt(t)}</span>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Proveedor</label><input style={S.inp} placeholder="Nombre" value={mat.proveedor||""} onChange={e=>onChange("proveedor",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha compra</label><input style={S.inp} type="date" value={mat.fechaCompra||""} onChange={e=>onChange("fechaCompra",e.target.value)}/></div>
    </div>
    <input style={S.inp} placeholder="Notas del material" value={mat.notas||""} onChange={e=>onChange("notas",e.target.value)}/>
  </div>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({obra,calcZonePct,totalPct,onPDF,onCompras}) {
  const pct=totalPct(), pc=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";
  const allI=obra.zonas.flatMap(z=>z.items||[]);
  const allM=allI.flatMap(i=>i.materiales||[]);
  const done=allI.filter(i=>i.terminado).length;
  const pend=allI.filter(i=>!i.terminado).length;
  const crit=allI.filter(i=>(i.peso||1)>=8&&!i.terminado).length;
  const presup=allM.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const gast=allM.filter(m=>["comprado","en_camino","entregado"].includes(m.estado||"")).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const pendMat=allM.filter(m=>!m.estado||m.estado==="pendiente").length;
  const alertas=allI.filter(i=>{ const d=daysDiff(i.fechaFin); return !i.terminado&&d!==null&&d<=3; });
  const sorted=[...obra.zonas].sort((a,b)=>calcZonePct(b)-calcZonePct(a));

  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
    {/* Hero avance */}
    <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",border:"1px solid #334155",borderRadius:16,padding:18,display:"flex",alignItems:"center",gap:16}}>
      <div style={{position:"relative",flexShrink:0}}>
        <Ring pct={pct} size={90} stroke={7} color={pc}/>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:"1.3rem",fontWeight:800,color:pc,lineHeight:1}}>{pct}%</span>
          <span style={{fontSize:"0.5rem",color:"#64748b",fontWeight:700,letterSpacing:"0.05em"}}>AVANCE</span>
        </div>
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:"1rem",fontWeight:700,color:"#f1f5f9",marginBottom:4}}>{obra.nombre||"Sin nombre"}</div>
        {obra.descripcion&&<div style={{fontSize:"0.75rem",color:"#64748b",marginBottom:4}}>{obra.descripcion}</div>}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {obra.fechaInicio&&<span style={{fontSize:"0.68rem",color:"#64748b",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(obra.fechaInicio)}</span>}
          {obra.fechaFin&&<span style={{fontSize:"0.68rem",color:daysDiff(obra.fechaFin)<7?"#ef4444":"#64748b",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(obra.fechaFin)}</span>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          <button style={{...S.btnP,fontSize:"0.72rem",padding:"6px 12px"}} onClick={onPDF}>📄 PDF Avance</button>
          <button style={{...S.btnS,fontSize:"0.72rem",padding:"6px 10px"}} onClick={onCompras}><Ico.Cart/> PDF Compras</button>
        </div>
      </div>
    </div>

    {/* Alertas */}
    {alertas.length>0&&<div style={{background:"#450a0a",border:"1px solid #ef444444",borderRadius:12,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,color:"#fca5a5",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}><Ico.Alert/> {alertas.length} ítem(s) próximo(s) a vencer</div>
      {alertas.map(it=>{ const d=daysDiff(it.fechaFin); return <div key={it.id} style={{fontSize:"0.8rem",color:"#fca5a5",marginBottom:3}}>⚠ {it.nombre} — {d<0?`Vencido hace ${Math.abs(d)}d`:`${d}d restante${d!==1?"s":""}`}</div>; })}
    </div>}

    {/* Stats grid */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
      {[["Completados",done,"#22c55e"],["Pendientes",pend,"#f59e0b"],["Críticos",crit,"#ef4444"]].map(([l,v,c])=>(
        <div key={l} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"13px 10px",textAlign:"center"}}>
          <div style={{fontSize:"1.8rem",fontWeight:800,color:c,lineHeight:1}}>{v}</div>
          <div style={{fontSize:"0.62rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{l}</div>
        </div>
      ))}
    </div>

    {/* Presupuesto */}
    {presup>0&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.68rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}><Ico.Cart/> Materiales</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
        {[["Presupuesto","$"+fmt(presup),"#94a3b8"],["Gastado","$"+fmt(gast),"#f59e0b"],["Pendiente",pendMat+" ítems","#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center"}}>
            <div style={{fontSize:"0.88rem",fontWeight:800,color:c}}>{v}</div>
            <div style={{fontSize:"0.58rem",color:"#475569",marginTop:1}}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden",marginBottom:3}}>
        <div style={{height:"100%",width:`${Math.min(100,(gast/presup)*100)}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b)",borderRadius:3,transition:"width .6s"}}/>
      </div>
      <div style={{fontSize:"0.62rem",color:"#475569"}}>{Math.round((gast/presup)*100)}% comprometido</div>
    </div>}

    {/* Zonas ranking */}
    {sorted.length>0&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:14}}>
      <div style={{fontSize:"0.68rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Avance por Zona</div>
      {sorted.map(z=>{
        const zp=calcZonePct(z),zc=zp<30?"#ef4444":zp<70?"#f59e0b":"#22c55e";
        return <div key={z.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
            <span style={{fontSize:"0.82rem",color:"#e2e8f0",fontWeight:500}}>{z.nombre}</span>
            <span style={{fontSize:"0.82rem",fontWeight:700,color:zc}}>{zp}%</span>
          </div>
          <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${zp}%`,background:zc,borderRadius:3,transition:"width .5s"}}/>
          </div>
          <div style={{fontSize:"0.63rem",color:"#475569",marginTop:2}}>{(z.items||[]).filter(i=>i.terminado).length}/{(z.items||[]).length} ítems · {obra.trabajadores.filter(t=>t.zonaId===z.id).length} trabajadores</div>
        </div>;
      })}
    </div>}

    {obra.notas&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:11,padding:13}}>
      <div style={{fontSize:"0.65rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5,display:"flex",alignItems:"center",gap:4}}><Ico.Note/> Notas</div>
      <p style={{margin:0,fontSize:"0.83rem",color:"#94a3b8",lineHeight:1.6}}>{obra.notas}</p>
    </div>}

    {obra.zonas.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:"#334155"}}>
      <Ico.Building/><p style={{marginTop:12,fontSize:"0.9rem",color:"#334155"}}>Agrega zonas para comenzar</p>
    </div>}
  </div>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function SupervisorObra() {
  const [ready,setReady]=useState(false);
  const [unlocked,setUnlocked]=useState(false);
  const [obras,setObras]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [exZones,setExZones]=useState({});
  const [exItems,setExItems]=useState({});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [matForm,setMatForm]=useState({});
  const [exporting,setExporting]=useState(false);
  const [search,setSearch]=useState("");
  const [dragI,setDragI]=useState(null);
  const [dragO,setDragO]=useState(null);
  const [cameraFor,setCameraFor]=useState(null); // {zonaId,itemId}

  const [scanBoleta, setScanBoleta] = useState(null); // {zId, iId}

  const obra = obras.find(o=>o.id===activeId) || obras[0] || null;

  useEffect(()=>{
    (async()=>{
      const [savedObras,savedId,savedPin]=await Promise.all([loadObras(),loadActiveId(),loadPin()]);
      window.__pin=savedPin;
      let list=savedObras;
      if(!list.length){ list=[emptyObra("Mi Primera Obra")]; }
      setObras(list);
      setActiveId(savedId||list[0]?.id||null);
      setUnlocked(!savedPin);
      setReady(true);
    })();
  },[]);

  useEffect(()=>{
    if(!ready) return;
    const t=setTimeout(()=>{ saveObras(obras); },300);
    return ()=>clearTimeout(t);
  },[obras,ready]);

  const updObra=(fn)=>setObras(prev=>prev.map(o=>o.id===activeId?fn(o):o));
  const closeModal=()=>{ setModal(null); setForm({}); setMatForm({}); };
  const toast=(msg,type="ok")=>{ setModal({type:"toast",msg,toastType:type}); setTimeout(()=>setModal(m=>m?.type==="toast"?null:m),2400); };

  // ── Calculos ──
  const calcZonePct=(zona)=>{
    if(!(zona.items||[]).length) return 0;
    const tw=zona.items.reduce((s,i)=>s+(i.peso||1),0);
    const dw=zona.items.filter(i=>i.terminado).reduce((s,i)=>s+(i.peso||1),0);
    return Math.round((dw/tw)*100);
  };
  const totalPct=()=>{
    if(!obra) return 0;
    const all=obra.zonas.flatMap(z=>z.items||[]);
    if(!all.length) return 0;
    const tw=all.reduce((s,i)=>s+(i.peso||1),0);
    const dw=all.filter(i=>i.terminado).reduce((s,i)=>s+(i.peso||1),0);
    return Math.round((dw/tw)*100);
  };

  // ── CRUD Obras ──
  const createObra=()=>{ if(!form.nombre?.trim())return; const o=emptyObra(form.nombre.trim()); o.descripcion=form.descripcion||""; o.fechaInicio=form.fechaInicio||today(); o.fechaFin=form.fechaFin||""; setObras(p=>[...p,o]); setActiveId(o.id); saveActiveId(o.id); closeModal(); };
  const deleteObra=(id)=>{ if(!window.confirm("¿Eliminar esta obra?"))return; const next=obras.filter(o=>o.id!==id); setObras(next); if(activeId===id){ const nid=next[0]?.id||null; setActiveId(nid); saveActiveId(nid); } };

  // ── CRUD Zonas ──
  const addZona=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:[...o.zonas,{id:uid(),nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1,items:[]}]})); closeModal(); };
  const editZona=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===modal.zId?{...z,nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1}:z)})); closeModal(); };
  const delZona=(id)=>{ if(!window.confirm("¿Eliminar zona?"))return; updObra(o=>({...o,zonas:o.zonas.filter(z=>z.id!==id),trabajadores:o.trabajadores.map(t=>t.zonaId===id?{...t,zonaId:null}:t)})); };

  // ── CRUD Items ──
  const addItem=(zId)=>{ if(!form.nombre?.trim())return; const ni={id:uid(),nombre:form.nombre.trim(),descripcion:form.descripcion||"",terminado:false,peso:parseFloat(form.peso)||1,materiales:[],fotos:[],notas:form.notas||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||""}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:[...z.items,ni]}:z)})); closeModal(); };
  const editItem=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===modal.zId?{...z,items:z.items.map(i=>i.id===modal.iId?{...i,nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1,notas:form.notas||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||""}:i)}:z)})); closeModal(); };
  const delItem=(zId,iId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.filter(i=>i.id!==iId)}:z)}));
  const toggleItem=(zId,iId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,terminado:!i.terminado}:i)}:z)}));

  // ── CRUD Materiales ──
  const addMat=(zId,iId)=>{ if(!matForm.nombre?.trim())return; const m={id:uid(),...matForm,nombre:matForm.nombre.trim(),cantidad:parseFloat(matForm.cantidad)||0,precio:parseFloat(matForm.precio)||0,estado:matForm.estado||"pendiente"}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:[...(i.materiales||[]),m]}:i)}:z)})); closeModal(); };
  const editMat=()=>{ if(!matForm.nombre?.trim())return; const {zId,iId,mId}=modal; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:i.materiales.map(m=>m.id===mId?{...m,...matForm,cantidad:parseFloat(matForm.cantidad)||0,precio:parseFloat(matForm.precio)||0}:m)}:i)}:z)})); closeModal(); };
  const delMat=(zId,iId,mId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:i.materiales.filter(m=>m.id!==mId)}:i)}:z)}));
  const setMatStatus=(zId,iId,mId,estado)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:i.materiales.map(m=>m.id===mId?{...m,estado}:m)}:i)}:z)}));

  // ── Trabajadores ──
  const addTrab=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,trabajadores:[...o.trabajadores,{id:uid(),nombre:form.nombre.trim(),rol:form.rol||"",zonaId:form.zonaId||null,telefono:form.telefono||""}]})); closeModal(); };
  const editTrab=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,trabajadores:o.trabajadores.map(t=>t.id===modal.tId?{...t,nombre:form.nombre.trim(),rol:form.rol||"",zonaId:form.zonaId||null,telefono:form.telefono||""}:t)})); closeModal(); };
  const delTrab=(id)=>updObra(o=>({...o,trabajadores:o.trabajadores.filter(t=>t.id!==id)}));

  // ── Fotos ──
  const addFoto=(zId,iId,data)=>{ const f={id:uid(),data,fecha:new Date().toLocaleDateString("es-ES"),hora:new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,fotos:[...(i.fotos||[]),f]}:i)}:z)})); toast("📸 Foto guardada"); };
  const delFoto=(zId,iId,fId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,fotos:(i.fotos||[]).filter(f=>f.id!==fId)}:i)}:z)}));
  const handleFilePhoto=(zId,iId,e)=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>addFoto(zId,iId,ev.target.result); r.readAsDataURL(f); e.target.value=""; };

  // ── Drag zonas ──
  const hDS=(e,i)=>{ setDragI(i); e.dataTransfer.effectAllowed="move"; };
  const hDO=(e,i)=>{ e.preventDefault(); setDragO(i); };
  const hDD=(e,i)=>{ e.preventDefault(); if(dragI===null||dragI===i){setDragI(null);setDragO(null);return;} updObra(o=>{const z=[...o.zonas];const[m]=z.splice(dragI,1);z.splice(i,0,m);return{...o,zonas:z};}); setDragI(null);setDragO(null); };

  // ── Escanear Boleta ──
  const handleBoletaDatos = (datos, zId, iId) => {
    if (!datos.materiales?.length) { toast("No se encontraron materiales", "err"); return; }
    datos.materiales.forEach(m => {
      const mat = { id:uid(), nombre:m.nombre||"", estado:"pendiente", cantidad:m.cantidad||0, unidad:m.unidad||"", precio:m.precio||0, proveedor:datos.proveedor||"", fechaCompra:datos.fechaCompra||"", fechaEntrega:"", notas:"" };
      updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:[...(i.materiales||[]),mat]}:i)}:z)}));
    });
    toast(`✅ ${datos.materiales.length} material(es) agregado(s) desde la boleta`);
  };

  // ── Export ──
  const doPDF=async()=>{ if(!obra)return; setExporting(true); try{await exportAvancePDF(obra,calcZonePct,totalPct);}catch(e){toast("Error al generar PDF","err");}finally{setExporting(false);} };
  const doCompras=async()=>{ if(!obra)return; setExporting(true); try{await exportComprasPDF(obra);}catch(e){toast("Error al generar PDF","err");}finally{setExporting(false);} };

  // ── JSON ──
  const doExportJSON=()=>{ const b=new Blob([JSON.stringify(obras,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement("a");a.href=u;a.download=`supervisor-backup-${today()}.json`;a.click();URL.revokeObjectURL(u); };
  const doImportJSON=(e)=>{ const f=e.target.files[0];if(!f)return; const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(Array.isArray(d)){setObras(d);setActiveId(d[0]?.id||null);toast("✅ Datos importados");}else if(d.zonas){const o=[emptyObra("Importada"),...obras];o[0]={...o[0],...d};setObras(o);toast("✅ Importado");}}catch{toast("❌ Error al leer","err");}}; r.readAsText(f);e.target.value=""; };

  if(!ready) return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#64748b"}}>
    <span style={{fontSize:"2.5rem",animation:"spin 1s linear infinite",display:"inline-block"}}>⚙</span>
    <span style={{fontSize:"0.82rem"}}>Cargando...</span>
  </div>;

  if(!unlocked) return <PinScreen onUnlock={()=>setUnlocked(true)} hasPin={!!window.__pin}/>;

  const pct=obra?totalPct():0;
  const pc=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";
  const TABS=[{id:"dashboard",label:"Resumen",icon:<Ico.Chart/>},{id:"zonas",label:"Zonas",icon:<Ico.Zone/>},{id:"personal",label:"Personal",icon:<Ico.Hard/>}];

  // Filtro búsqueda
  const filteredZonas = search.trim() ? (obra?.zonas||[]).map(z=>({...z,items:(z.items||[]).filter(i=>i.nombre.toLowerCase().includes(search.toLowerCase())||i.descripcion?.toLowerCase().includes(search.toLowerCase()))})).filter(z=>z.items.length>0) : (obra?.zonas||[]);

  return <>
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet"/>
    <style>{`
      *{box-sizing:border-box;} body{margin:0;background:#020b18;font-family:'DM Sans',sans-serif;}
      ::-webkit-scrollbar{width:3px;height:3px;} ::-webkit-scrollbar-track{background:#0f172a;} ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px;}
      .tb{background:none;border:none;cursor:pointer;padding:9px 10px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:0.8rem;letter-spacing:0.06em;text-transform:uppercase;transition:all .2s;display:flex;align-items:center;gap:4px;white-space:nowrap;}
      .tb.on{color:#f59e0b;border-bottom:2px solid #f59e0b;} .tb:not(.on){color:#64748b;border-bottom:2px solid transparent;} .tb:hover:not(.on){color:#94a3b8;}
      .card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;margin-bottom:8px;overflow:hidden;transition:border-color .2s;} .card:hover{border-color:#334155;}
      .badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:0.63rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;}
      .ic{background:none;border:1px solid #334155;border-radius:7px;color:#64748b;cursor:pointer;padding:4px 6px;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
      .ic:hover{border-color:#f59e0b;color:#f59e0b;} .ic.danger:hover{border-color:#ef4444;color:#ef4444;}
      .tog{width:32px;height:18px;border-radius:9px;border:none;cursor:pointer;position:relative;transition:background .2s;display:flex;align-items:center;padding:2px;flex-shrink:0;}
      .knob{width:14px;height:14px;border-radius:50%;background:white;transition:transform .2s;}
      .dov{border-color:#f59e0b!important;background:#f59e0b07!important;}
      input:focus,select:focus,textarea:focus{border-color:#f59e0b!important;} select{appearance:none;} textarea{resize:vertical;min-height:56px;}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      .fa{animation:fadeUp .22s ease;}
    `}</style>

    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#020b18 0%,#0a1628 100%)",color:"#f1f5f9"}}>

      {/* ── HEADER ── */}
      <div style={{background:"#080f1e",borderBottom:"1px solid #1e293b",padding:"0 12px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0 7px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              <div style={{background:"#f59e0b22",borderRadius:8,padding:"5px 7px",flexShrink:0}}><Ico.Hard/></div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.3rem",fontWeight:800,letterSpacing:"0.04em",textTransform:"uppercase",color:"#f1f5f9",whiteSpace:"nowrap"}}>Supervisor <span style={{color:"#f59e0b"}}>de Obra</span></h1>
                {obra&&<button onClick={()=>setModal({type:"obras"})} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:"#64748b",fontSize:"0.68rem",display:"flex",alignItems:"center",gap:3,marginTop:1}}>
                  <Ico.Building/> {obra.nombre} ▾
                </button>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              {obra&&<div style={{position:"relative",flexShrink:0}}>
                <Ring pct={pct} size={40} stroke={4} color={pc}/>
                <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:"0.58rem",fontWeight:800,color:pc}}>{pct}%</span>
                </div>
              </div>}
              <button className="ic" onClick={()=>setModal({type:"settings",newPin:"",newPin2:""})}><Ico.Gear/></button>
            </div>
          </div>
          <div style={{display:"flex",borderTop:"1px solid #1e293b",overflowX:"auto"}}>
            {TABS.map(t=><button key={t.id} className={`tb ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>{t.icon}{t.label}</button>)}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:820,margin:"0 auto",padding:"12px 12px 90px"}} className="fa">

        {tab==="dashboard"&&obra&&<Dashboard obra={obra} calcZonePct={calcZonePct} totalPct={totalPct} onPDF={doPDF} onCompras={doCompras}/>}

        {tab==="zonas"&&obra&&<div>
          {/* Search */}
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
            <div style={{flex:1,position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#475569"}}><Ico.Search/></span>
              <input style={{...S.inp,paddingLeft:32}} placeholder="Buscar ítems…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            <button style={S.btnP} onClick={()=>setModal({type:"addZona"})}><Ico.Plus/> Zona</button>
          </div>

          {filteredZonas.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:"#334155"}}>
            {search?<><Ico.Search/><p style={{marginTop:10,color:"#334155"}}>Sin resultados para "{search}"</p></>:<><Ico.Zone/><p style={{marginTop:10,color:"#334155"}}>Sin zonas. ¡Crea la primera!</p></>}
          </div>}

          {filteredZonas.map((zona,zi)=>{
            const isOpen=exZones[zona.id], zPct=calcZonePct(zona), zc=zPct<30?"#ef4444":zPct<70?"#f59e0b":"#22c55e";
            const isDO=dragO===zi&&typeof dragI==="number";
            return <div key={zona.id} className={`card${isDO?" dov":""}`}
              draggable onDragStart={e=>hDS(e,zi)} onDragOver={e=>hDO(e,zi)} onDrop={e=>hDD(e,zi)} onDragLeave={()=>setDragO(null)}>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:"pointer"}} onClick={()=>setExZones(p=>({...p,[zona.id]:!p[zona.id]}))}>
                <span style={{color:"#334155",cursor:"grab",flexShrink:0}}><Ico.Drag/></span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:"0.93rem"}}>{zona.nombre}</span>
                    <span className="badge" style={{background:zc+"22",color:zc}}>{zPct}%</span>
                    <span style={{fontSize:"0.65rem",color:"#475569"}}>{(zona.items||[]).filter(i=>i.terminado).length}/{(zona.items||[]).length}</span>
                  </div>
                  {zona.descripcion&&<div style={{fontSize:"0.7rem",color:"#475569",marginTop:1}}>{zona.descripcion}</div>}
                </div>
                <div style={{display:"flex",gap:5}} onClick={e=>e.stopPropagation()}>
                  <button className="ic" onClick={()=>{setForm({nombre:zona.nombre,descripcion:zona.descripcion||"",peso:zona.peso||1});setModal({type:"editZona",zId:zona.id});}}><Ico.Edit/></button>
                  <button className="ic danger" onClick={()=>delZona(zona.id)}><Ico.Trash/></button>
                </div>
                <Ico.Chev open={isOpen}/>
              </div>
              <div style={{height:3,background:"#1e293b"}}>
                <div style={{height:"100%",width:`${zPct}%`,background:zc,transition:"width .5s"}}/>
              </div>
              {isOpen&&<div>
                {(zona.items||[]).map((item,ii)=>{
                  const iOpen=exItems[item.id], d=daysDiff(item.fechaFin);
                  const overdue=d!==null&&d<0&&!item.terminado, warning=d!==null&&d<=3&&d>=0&&!item.terminado;
                  return <div key={item.id} style={{borderTop:"1px solid #1e293b",background:item.terminado?"#0a1a0a":"transparent"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,padding:"8px 12px",flexWrap:"wrap"}}>
                      <button className="tog" style={{background:item.terminado?"#22c55e":"#1e293b"}} onClick={()=>toggleItem(zona.id,item.id)}>
                        <div className="knob" style={{transform:item.terminado?"translateX(14px)":"translateX(0)"}}/>
                      </button>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.87rem",fontWeight:600,color:item.terminado?"#4ade80":"#e2e8f0",textDecoration:item.terminado?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.nombre}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:2}}>
                          {item.fechaFin&&<span style={{fontSize:"0.63rem",display:"flex",alignItems:"center",gap:2,color:overdue?"#ef4444":warning?"#f59e0b":"#475569"}}>{overdue?"⚠":warning?"⏰":""}<Ico.Cal/>{item.fechaFin}</span>}
                          {(item.fotos||[]).length>0&&<span style={{fontSize:"0.63rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Photo/>{item.fotos.length}</span>}
                          {(item.materiales||[]).length>0&&<span style={{fontSize:"0.63rem",color:"#475569"}}>📦 {item.materiales.length}</span>}
                        </div>
                      </div>
                      <span className="badge" style={{background:"#1e293b",color:"#64748b",fontSize:"0.58rem"}}>W{item.peso||1}</span>
                      <button className="ic" onClick={()=>{setForm({nombre:item.nombre,descripcion:item.descripcion||"",peso:item.peso||1,notas:item.notas||"",fechaInicio:item.fechaInicio||"",fechaFin:item.fechaFin||""});setModal({type:"editItem",zId:zona.id,iId:item.id});}}><Ico.Edit/></button>
                      <button className="ic" title="Agregar material" onClick={()=>setModal({type:"addMat",zId:zona.id,iId:item.id})} style={{fontSize:"0.68rem",fontWeight:700}}>+M</button>
                      <button className="ic" title="Fotos de trabajo" onClick={()=>setExItems(p=>({...p,[item.id]:!p[item.id]}))}><Ico.Cam/></button>
                      {(item.materiales||[]).length>0&&<button className="ic" onClick={()=>setExItems(p=>({...p,[item.id]:!p[item.id]}))}>
                        <Ico.Chev open={iOpen}/><span style={{fontSize:"0.68rem",fontWeight:700,marginLeft:2}}>{item.materiales.length}</span>
                      </button>}
                      <button className="ic danger" onClick={()=>delItem(zona.id,item.id)}><Ico.Trash/></button>
                    </div>
                    {/* Botón escanear boleta separado y visible */}
                    <div style={{padding:"6px 12px",borderTop:"1px solid #1e293b22",display:"flex",gap:6}}>
                      <button style={{...S.btnP,fontSize:"0.72rem",padding:"6px 12px",borderRadius:8,flex:1,justifyContent:"center"}}
                        onClick={()=>setScanBoleta({zId:zona.id,iId:item.id})}>
                        🧾 Escanear Boleta con IA
                      </button>
                      <button style={{...S.btnS,fontSize:"0.72rem",padding:"6px 12px",borderRadius:8}}
                        onClick={()=>setModal({type:"addMat",zId:zona.id,iId:item.id})}>
                        + Material manual
                      </button>
                    </div>

                    {iOpen&&<>
                      {/* Materiales */}
                      {(item.materiales||[]).map(mat=><MatRow key={mat.id} mat={mat}
                        onEdit={()=>{setMatForm({...mat});setModal({type:"editMat",zId:zona.id,iId:item.id,mId:mat.id});}}
                        onDelete={()=>delMat(zona.id,item.id,mat.id)}
                        onStatus={s=>setMatStatus(zona.id,item.id,mat.id,s)}/>)}

                      {/* Fotos section */}
                      <div style={{padding:"10px 12px",background:"#06101e",borderTop:"1px solid #0f172a"}}>
                        <div style={{fontSize:"0.64rem",color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><Ico.Photo/> Fotos de trabajo ({(item.fotos||[]).length})</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {(item.fotos||[]).map(foto=><div key={foto.id} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid #1e293b",cursor:"pointer"}} onClick={()=>setModal({type:"viewPhoto",src:foto.data,fecha:foto.fecha,hora:foto.hora})}>
                            <img src={foto.data} alt="foto" style={{width:70,height:70,objectFit:"cover",display:"block"}}/>
                            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",padding:"2px 4px",fontSize:"0.5rem",color:"#94a3b8",textAlign:"center"}}>{foto.fecha}</div>
                            <button onClick={e=>{e.stopPropagation();delFoto(zona.id,item.id,foto.id);}} style={{position:"absolute",top:2,right:2,background:"rgba(239,68,68,.85)",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:"#fff",fontSize:"0.6rem",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>×</button>
                          </div>)}
                          {/* Cámara */}
                          <button onClick={()=>setCameraFor({zId:zona.id,iId:item.id})}
                            style={{width:70,height:70,border:"1px dashed #334155",borderRadius:8,background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:"#475569"}}>
                            <Ico.Cam/><span style={{fontSize:"0.55rem",fontWeight:700}}>Cámara</span>
                          </button>
                          {/* Galería */}
                          <label style={{width:70,height:70,border:"1px dashed #334155",borderRadius:8,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:"#475569"}}>
                            <Ico.Photo/><span style={{fontSize:"0.55rem",fontWeight:700}}>Galería</span>
                            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFilePhoto(zona.id,item.id,e)}/>
                          </label>
                        </div>
                      </div>
                    </>}
                  </div>;
                })}
                <div style={{padding:"8px 12px",borderTop:"1px solid #1e293b"}}>
                  <button style={{...S.btnS,fontSize:"0.72rem",padding:"5px 10px"}} onClick={()=>setModal({type:"addItem",zId:zona.id})}><Ico.Plus/> Agregar ítem</button>
                </div>
              </div>}
            </div>;
          })}
        </div>}

        {tab==="personal"&&obra&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:"0.72rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Personal · {obra.trabajadores.length}</span>
            <button style={S.btnP} onClick={()=>setModal({type:"addTrab"})}><Ico.Plus/> Trabajador</button>
          </div>
          {!obra.trabajadores.length&&<div style={{textAlign:"center",padding:"50px 20px",color:"#334155"}}><Ico.Hard/><p style={{marginTop:10}}>Sin trabajadores registrados</p></div>}
          {obra.trabajadores.map(t=>{ const zona=obra.zonas.find(z=>z.id===t.zonaId); return <div key={t.id} className="card" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px"}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>👷</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:"0.9rem",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.nombre}</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {t.rol&&<span className="badge" style={{background:"#1e293b",color:"#94a3b8"}}>{t.rol}</span>}
                {t.telefono&&<span style={{fontSize:"0.68rem",color:"#7dd3fc",display:"flex",alignItems:"center",gap:2}}><Ico.Phone/>{t.telefono}</span>}
                {zona?<span className="badge" style={{background:"#f59e0b22",color:"#f59e0b"}}>📍 {zona.nombre}</span>:<span className="badge" style={{background:"#1e293b",color:"#475569"}}>Sin zona</span>}
              </div>
            </div>
            <button className="ic" onClick={()=>{setForm({nombre:t.nombre,rol:t.rol||"",zonaId:t.zonaId||"",telefono:t.telefono||""});setModal({type:"editTrab",tId:t.id});}}><Ico.Edit/></button>
            <button className="ic danger" onClick={()=>delTrab(t.id)}><Ico.Trash/></button>
          </div>; })}
        </div>}
      </div>
    </div>

    {/* ── MODALS ── */}

    {/* Obras */}
    {modal?.type==="obras"&&<Modal title="Mis Obras" onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {obras.map(o=>{
          const aPct=()=>{ const all=o.zonas.flatMap(z=>z.items||[]); if(!all.length)return 0; const tw=all.reduce((s,i)=>s+(i.peso||1),0); const dw=all.filter(i=>i.terminado).reduce((s,i)=>s+(i.peso||1),0); return Math.round((dw/tw)*100); };
          const p=aPct(), pc=p<30?"#ef4444":p<70?"#f59e0b":"#22c55e";
          return <div key={o.id} style={{background:"#1e293b",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,border:o.id===activeId?"1px solid #f59e0b44":"1px solid transparent",cursor:"pointer"}} onClick={()=>{setActiveId(o.id);saveActiveId(o.id);closeModal();}}>
            <div style={{position:"relative",flexShrink:0}}><Ring pct={p} size={38} stroke={4} color={pc}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"0.55rem",fontWeight:800,color:pc}}>{p}%</span></div></div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:"0.9rem"}}>{o.nombre}</div><div style={{fontSize:"0.68rem",color:"#64748b"}}>{o.zonas.length} zonas · {o.trabajadores.length} trabajadores</div></div>
            {o.id===activeId&&<span style={{fontSize:"0.65rem",color:"#f59e0b",fontWeight:700}}>ACTIVA</span>}
            <button className="ic danger" onClick={e=>{e.stopPropagation();deleteObra(o.id);}}><Ico.Trash/></button>
          </div>;
        })}
        <button style={S.btnP} onClick={()=>{closeModal();setModal({type:"newObra"});}}><Ico.Plus/> Nueva Obra</button>
      </div>
    </Modal>}

    {/* Nueva Obra */}
    {modal?.type==="newObra"&&<Modal title="Nueva Obra" onClose={closeModal}>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre de la obra *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Descripción (opcional)" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha inicio</label><input style={S.inp} type="date" value={form.fechaInicio||today()} onChange={e=>setForm(p=>({...p,fechaInicio:e.target.value}))}/></div>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha fin est.</label><input style={S.inp} type="date" value={form.fechaFin||""} onChange={e=>setForm(p=>({...p,fechaFin:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:4}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={createObra}><Ico.Plus/> Crear</button></div>
      </div>
    </Modal>}

    {/* Zona */}
    {(modal?.type==="addZona"||modal?.type==="editZona")&&<Modal title={modal.type==="addZona"?"Nueva Zona":"Editar Zona"} onClose={closeModal}>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Descripción" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
        <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Peso (1–10)</label><input style={{...S.inp,width:80}} type="number" min="1" max="10" value={form.peso||1} onChange={e=>setForm(p=>({...p,peso:e.target.value}))}/></div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addZona"?addZona:editZona}>{modal.type==="addZona"?"Crear":"Guardar"}</button></div>
      </div>
    </Modal>}

    {/* Item */}
    {(modal?.type==="addItem"||modal?.type==="editItem")&&<Modal title={modal.type==="addItem"?"Nuevo Ítem":"Editar Ítem"} onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Descripción" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
        <textarea style={S.inp} placeholder="Notas / Observaciones" value={form.notas||""} onChange={e=>setForm(p=>({...p,notas:e.target.value}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha inicio</label><input style={S.inp} type="date" value={form.fechaInicio||""} onChange={e=>setForm(p=>({...p,fechaInicio:e.target.value}))}/></div>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha límite ⚠</label><input style={S.inp} type="date" value={form.fechaFin||""} onChange={e=>setForm(p=>({...p,fechaFin:e.target.value}))}/></div>
        </div>
        <div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:3}}>Prioridad / Peso (1–10)</label>
          <input style={{...S.inp,width:80}} type="number" min="1" max="10" value={form.peso||1} onChange={e=>setForm(p=>({...p,peso:e.target.value}))}/>
          <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",marginTop:5,width:"100%"}}>
            <div style={{height:"100%",width:`${((parseFloat(form.peso)||1)/10)*100}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)",borderRadius:2,transition:"width .2s"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addItem"?()=>addItem(modal.zId):editItem}>{modal.type==="addItem"?"Agregar":"Guardar"}</button></div>
      </div>
    </Modal>}

    {/* Material */}
    {(modal?.type==="addMat"||modal?.type==="editMat")&&<Modal title={modal.type==="addMat"?"Agregar Material":"Editar Material"} onClose={closeModal} wide>
      <MatForm mat={matForm} onChange={(k,v)=>setMatForm(p=>({...p,[k]:v}))}/>
      <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:12}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addMat"?()=>addMat(modal.zId,modal.iId):editMat}>{modal.type==="addMat"?"Agregar":"Guardar"}</button></div>
    </Modal>}

    {/* Trabajador */}
    {(modal?.type==="addTrab"||modal?.type==="editTrab")&&<Modal title={modal.type==="addTrab"?"Nuevo Trabajador":"Editar Trabajador"} onClose={closeModal}>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre completo *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Rol / Cargo" value={form.rol||""} onChange={e=>setForm(p=>({...p,rol:e.target.value}))}/>
        <input style={S.inp} placeholder="Teléfono" value={form.telefono||""} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))}/>
        <select style={{...S.inp,color:form.zonaId?"#f1f5f9":"#64748b"}} value={form.zonaId||""} onChange={e=>setForm(p=>({...p,zonaId:e.target.value}))}>
          <option value="">Sin zona asignada</option>
          {(obra?.zonas||[]).map(z=><option key={z.id} value={z.id}>{z.nombre}</option>)}
        </select>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addTrab"?addTrab:editTrab}>{modal.type==="addTrab"?"Agregar":"Guardar"}</button></div>
      </div>
    </Modal>}

    {/* Ver foto */}
    {modal?.type==="viewPhoto"&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.94)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={closeModal}>
      <div style={{position:"relative",maxWidth:"95vw",maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>
        <img src={modal.src} alt="Foto" style={{maxWidth:"100%",maxHeight:"82vh",borderRadius:12,display:"block"}}/>
        <div style={{textAlign:"center",fontSize:"0.73rem",color:"#64748b",marginTop:8}}>{modal.fecha} {modal.hora&&`· ${modal.hora}`}</div>
        <button onClick={closeModal} style={{position:"absolute",top:-10,right:-10,background:"#ef4444",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",color:"#fff",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
    </div>}

    {/* Configuración */}
    {modal?.type==="settings"&&<Modal title="Configuración" onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {obra&&<div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Obra Activa</label>
          <input style={{...S.inp,marginBottom:7}} placeholder="Nombre de la obra" value={obra.nombre||""} onChange={e=>updObra(o=>({...o,nombre:e.target.value}))}/>
          <input style={{...S.inp,marginBottom:7}} placeholder="Descripción" value={obra.descripcion||""} onChange={e=>updObra(o=>({...o,descripcion:e.target.value}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:7}}>
            <input style={S.inp} type="date" value={obra.fechaInicio||""} onChange={e=>updObra(o=>({...o,fechaInicio:e.target.value}))}/>
            <input style={S.inp} type="date" value={obra.fechaFin||""} onChange={e=>updObra(o=>({...o,fechaFin:e.target.value}))} placeholder="Fecha fin"/>
          </div>
          <textarea style={S.inp} placeholder="Notas generales" value={obra.notas||""} onChange={e=>updObra(o=>({...o,notas:e.target.value}))}/>
        </div>}
        <div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"flex",alignItems:"center",gap:4,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}><Ico.Key/> PIN de Seguridad</label>
          <input style={{...S.inp,marginBottom:7}} type="password" inputMode="numeric" maxLength={5} placeholder={window.__pin?"Nuevo PIN":"Crear PIN (5 dígitos)"} value={modal.newPin||""} onChange={e=>{if(/^\d{0,5}$/.test(e.target.value))setModal(p=>({...p,newPin:e.target.value}));}}/>
          {modal.newPin?.length===5&&<input style={{...S.inp,marginBottom:7}} type="password" inputMode="numeric" maxLength={5} placeholder="Confirmar PIN" value={modal.newPin2||""} onChange={e=>{if(/^\d{0,5}$/.test(e.target.value))setModal(p=>({...p,newPin2:e.target.value}));}}/>}
          {modal.newPin?.length===5&&modal.newPin2?.length===5&&(modal.newPin===modal.newPin2?
            <button style={S.btnP} onClick={()=>{window.__pin=modal.newPin;savePin(modal.newPin);toast("✅ PIN guardado");closeModal();}}>Guardar PIN</button>:
            <span style={{fontSize:"0.8rem",color:"#ef4444"}}>Los PINs no coinciden</span>)}
          {window.__pin&&<button style={{...S.btnD,marginTop:7}} onClick={()=>{window.__pin="";savePin("");toast("🔓 PIN eliminado");closeModal();}}><Ico.Unlock/> Quitar PIN</button>}
        </div>
        <div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:7,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Datos</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button style={S.btnG} onClick={doExportJSON}><Ico.Down/> Exportar JSON</button>
            <label style={{...S.btnG,cursor:"pointer"}}><Ico.Up/> Importar JSON<input type="file" accept=".json" style={{display:"none"}} onChange={doImportJSON}/></label>
          </div>
        </div>
        <div style={{borderTop:"1px solid #1e293b",paddingTop:12}}>
          <button style={S.btnD} onClick={()=>{if(window.confirm("¿Resetear TODOS los datos?")){ const fresh=[emptyObra("Mi Obra")]; setObras(fresh); setActiveId(fresh[0].id); saveActiveId(fresh[0].id); closeModal(); }}}>🗑️ Resetear todo</button>
        </div>
      </div>
    </Modal>}

    {/* Toast */}
    {modal?.type==="toast"&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1e293b",border:`1px solid ${modal.toastType==="err"?"#ef444444":"#334155"}`,borderRadius:12,padding:"10px 20px",fontSize:"0.85rem",color:"#f1f5f9",zIndex:2000,boxShadow:"0 8px 30px rgba(0,0,0,.5)",animation:"fadeUp .25s ease",whiteSpace:"nowrap",maxWidth:"90vw"}}>
      {modal.msg}
    </div>}

    {/* Exportando */}
    {exporting&&<div style={{position:"fixed",bottom:24,right:16,background:"#1e293b",border:"1px solid #f59e0b44",borderRadius:12,padding:"9px 16px",fontSize:"0.8rem",color:"#f59e0b",zIndex:2000,display:"flex",alignItems:"center",gap:7}}>
      <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Generando PDF…
    </div>}

    {/* Camera */}
    {cameraFor&&<CameraModal onCapture={data=>addFoto(cameraFor.zId,cameraFor.iId,data)} onClose={()=>setCameraFor(null)}/>}

    {/* Scan Boleta */}
    {scanBoleta&&<ScanBoletaModal
      onDatos={datos=>handleBoletaDatos(datos,scanBoleta.zId,scanBoleta.iId)}
      onClose={()=>setScanBoleta(null)}/>}
  </>;
}
