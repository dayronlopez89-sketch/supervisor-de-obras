import { useState, useEffect, useRef } from "react";

// ─── Storage Keys ─────────────────────────────────────────────────────────────
const OBRAS_KEY   = "supervisor_obras_v4";
const ACTIVE_KEY  = "supervisor_active_v4";
const USERS_KEY   = "supervisor_users_v4";
const SESSION_KEY = "supervisor_session_v4";
const INVITE_KEY  = "supervisor_invites_v4";  // códigos de enlace pendientes

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid     = () => Math.random().toString(36).substr(2,9);
const today   = () => new Date().toISOString().slice(0,10);
const fmt     = n => n!=null&&n!==""?Number(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const fmtDate = s => s?new Date(s+"T12:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}):"—";
const daysDiff= s => { if(!s)return null; return Math.ceil((new Date(s+"T12:00:00")-new Date())/86400000); };
const mkCode  = () => Math.floor(100000+Math.random()*900000).toString(); // 6 dígitos

const emptyObra = (nombre="") => ({
  id:uid(), nombre, descripcion:"", fechaInicio:today(), fechaFin:"", notas:"",
  zonas:[], trabajadores:[]
});

// Roles del sistema:
//   admin          → control total (crea obras, zonas, ítems)
//   colaborador    → crea/edita sus propias zonas, ve el resto
//   materiales     → solo puede agregar/editar materiales y boletas en todas las zonas
//                    ve el avance pero no toca ítems ni zonas

// ─── Storage (localStorage) ───────────────────────────────────────────────────
function sg(key){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):null; }catch{ return null; }}
function ss(key,val){ try{ localStorage.setItem(key,JSON.stringify(val)); }catch{}}
function sd(key){ try{ localStorage.removeItem(key); }catch{}}

function loadAll(){
  return {
    obras:   sg(OBRAS_KEY)||[],
    users:   sg(USERS_KEY)||[],
    activeId:sg(ACTIVE_KEY),
    session: sg(SESSION_KEY),
    invites: sg(INVITE_KEY)||[],
  };
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function getJsPDF(){
  if(!window.jspdf){ await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  return window.jspdf.jsPDF;
}
async function exportAvancePDF(obra,calcZonePct,totalPct){
  const jsPDF=await getJsPDF(); const doc=new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=40; let y=M;
  const chk=(n=30)=>{ if(y+n>H-M){doc.addPage();y=M;} };
  const now=new Date();
  doc.setFillColor(10,22,40); doc.rect(0,0,W,75,"F");
  doc.setFillColor(245,158,11); doc.rect(0,73,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(20); doc.setTextColor(241,245,249);
  doc.text("SUPERVISOR DE OBRA",M,28);
  doc.setFontSize(11); doc.setTextColor(245,158,11); doc.text(obra.nombre||"Obra sin nombre",M,46);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184);
  doc.text(`Generado: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}`,M,62);
  const pct=totalPct(); const pctClr=pct<30?[239,68,68]:pct<70?[245,158,11]:[34,197,94];
  doc.setFillColor(...pctClr); doc.roundedRect(W-M-80,8,80,54,6,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(26); doc.setTextColor(15,23,42);
  doc.text(`${pct}%`,W-M-40,38,{align:"center"}); doc.setFontSize(7); doc.text("AVANCE",W-M-40,52,{align:"center"});
  y=90;
  const allI=obra.zonas.flatMap(z=>z.items||[]);
  const done=allI.filter(i=>i.terminado).length;
  const allM=allI.flatMap(i=>i.materiales||[]);
  const totalM=allM.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const gast=allM.filter(m=>["comprado","en_camino","entregado"].includes(m.estado||"")).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const cards=[["ZONAS",obra.zonas.length,[30,58,95]],["TRABAJADORES",obra.trabajadores.length,[15,83,80]],["ÍTEMS",allI.length,[79,70,229]],["COMPLETADOS",done,[34,197,94]],["PRESUPUESTO","$"+fmt(totalM),[245,158,11]],["GASTADO","$"+fmt(gast),[239,68,68]]];
  const cw=(W-M*2-10)/3;
  cards.forEach(([label,val,rgb],i)=>{ const row=Math.floor(i/3),col=i%3,bx=M+col*(cw+5),by=y+row*54; doc.setFillColor(20,32,52); doc.roundedRect(bx,by,cw,46,5,5,"F"); doc.setFillColor(...rgb); doc.rect(bx,by,3,46,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(typeof val==="number"?20:14); doc.setTextColor(241,245,249); doc.text(String(val),bx+cw/2,by+24,{align:"center"}); doc.setFontSize(6.5); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139); doc.text(label,bx+cw/2,by+38,{align:"center"}); });
  y+=118;
  doc.setFillColor(245,158,11); doc.rect(M,y,3,18,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249); doc.text("ZONAS DE TRABAJO",M+10,y+13); y+=26;
  obra.zonas.forEach((zona,zi)=>{
    chk(50); const zPct=calcZonePct(zona),zClr=zPct<30?[239,68,68]:zPct<70?[245,158,11]:[34,197,94];
    doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,38,5,5,"F"); doc.setFillColor(...zClr); doc.roundedRect(M,y,4,38,2,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249); doc.text(`${zi+1}. ${zona.nombre}`,M+12,y+14);
    if(zona.descripcion){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text(zona.descripcion,M+12,y+26);}
    doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.setTextColor(...zClr); doc.text(`${zPct}%`,W-M-6,y+20,{align:"right"});
    const bX=M+12,bW=W-M*2-80; doc.setFillColor(30,41,59); doc.roundedRect(bX,y+30,bW,4,2,2,"F");
    if(zPct>0){doc.setFillColor(...zClr); doc.roundedRect(bX,y+30,bW*zPct/100,4,2,2,"F");} y+=46;
    (zona.items||[]).forEach(item=>{
      chk(22); const isDone=item.terminado;
      doc.setFillColor(isDone?15:25,isDone?50:35,isDone?30:55); doc.roundedRect(M+10,y,W-M*2-10,18,3,3,"F");
      doc.setFont("helvetica",isDone?"bold":"normal"); doc.setFontSize(8.5); doc.setTextColor(isDone?134:220,isDone?239:225,isDone?172:225);
      doc.text((isDone?"✓ ":"○ ")+item.nombre,M+16,y+12);
      if(item.fechaFin){ const d=daysDiff(item.fechaFin); const dc=d<0?[239,68,68]:d<3?[245,158,11]:[100,116,139]; doc.setTextColor(...dc); doc.setFontSize(7); doc.text(d<0?`Vencido ${Math.abs(d)}d`:`${d}d`,W-M-10,y+12,{align:"right"}); }
      y+=22;
      (item.subItems||[]).forEach(si=>{ chk(16); doc.setFillColor(10,18,32); doc.roundedRect(M+18,y,W-M*2-18,13,2,2,"F"); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(si.terminado?100:160,si.terminado?180:175,si.terminado?100:185); doc.text((si.terminado?"  ✓ ":"  ○ ")+si.nombre,M+22,y+9); y+=15; });
    }); y+=8;
  });
  if(obra.trabajadores.length>0){
    chk(40); doc.setFillColor(245,158,11); doc.rect(M,y,3,18,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(241,245,249); doc.text("PERSONAL DE OBRA",M+10,y+13); y+=26;
    obra.trabajadores.forEach(t=>{ chk(18); const zona=obra.zonas.find(z=>z.id===t.zonaId); doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,16,3,3,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(220,225,235); doc.text(`👷 ${t.nombre}`,M+10,y+11); if(t.rol){doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(100,116,139);doc.text(t.rol,M+120,y+11);} if(zona){doc.setTextColor(245,158,11);doc.text(zona.nombre,W-M-6,y+11,{align:"right"});} y+=18; });
  }
  const pages=doc.internal.getNumberOfPages();
  for(let p=1;p<=pages;p++){ doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-26,W,26,"F"); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(100,116,139); doc.text(`Supervisor de Obra — ${obra.nombre}`,M,H-10); doc.text(`Pág ${p}/${pages}`,W-M,H-10,{align:"right"}); }
  doc.save(`avance-${(obra.nombre||"obra").replace(/\s+/g,"-").toLowerCase()}-${today()}.pdf`);
}
async function exportComprasPDF(obra){
  const jsPDF=await getJsPDF(); const doc=new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=40; let y=M;
  const chk=(n=30)=>{ if(y+n>H-M){doc.addPage();y=M;} };
  const now=new Date();
  doc.setFillColor(10,22,40); doc.rect(0,0,W,75,"F"); doc.setFillColor(34,197,94); doc.rect(0,73,W,3,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(241,245,249); doc.text("ORDEN DE COMPRA",M,28);
  doc.setFontSize(10); doc.setTextColor(34,197,94); doc.text(obra.nombre||"Obra sin nombre",M,44);
  doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(148,163,184); doc.text(`Generado: ${now.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})}`,M,60); y=90;
  let totalGeneral=0; const pendientes=[],todos=[];
  obra.zonas.forEach(zona=>{ (zona.items||[]).forEach(item=>{ (item.materiales||[]).forEach(mat=>{ const total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0); totalGeneral+=total; const entry={...mat,zonaNombre:zona.nombre,itemNombre:item.nombre,total}; todos.push(entry); if(!mat.estado||mat.estado==="pendiente") pendientes.push(entry); }); }); });
  [["MATERIALES PENDIENTES",pendientes],["TODOS LOS MATERIALES",todos]].forEach(([title,items])=>{
    if(!items.length)return; chk(40);
    doc.setFillColor(15,23,42); doc.roundedRect(M,y,W-M*2,24,4,4,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(241,245,249); doc.text(title,M+10,y+16); y+=32;
    items.forEach((mat,i)=>{ chk(20); const EST={pendiente:[245,158,11],comprado:[34,197,94],en_camino:[56,189,248],entregado:[167,139,250]}; const ec=EST[mat.estado||"pendiente"]; doc.setFillColor(i%2===0?15:12,i%2===0?23:20,i%2===0?42:36); doc.rect(M,y,W-M*2,16,"F"); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(210,220,230); doc.text(mat.nombre||"",M+4,y+11); doc.setTextColor(...ec); doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.text((mat.estado||"pendiente").toUpperCase(),M+120,y+11); doc.setFont("helvetica","normal"); doc.setTextColor(180,190,200); doc.setFontSize(8); doc.text(`${mat.cantidad||0} ${mat.unidad||""}`,M+180,y+11); doc.setTextColor(245,158,11); doc.setFont("helvetica","bold"); doc.text(mat.total>0?`$${fmt(mat.total)}`:"—",W-M-6,y+11,{align:"right"}); doc.setFont("helvetica","normal"); doc.setTextColor(100,116,139); doc.setFontSize(7); doc.text(`${mat.zonaNombre} › ${mat.itemNombre}`,M+240,y+11); y+=17; }); y+=10;
  });
  chk(40); doc.setFillColor(245,158,11); doc.roundedRect(M,y,W-M*2,32,5,5,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(15,23,42); doc.text("TOTAL GENERAL",M+14,y+21); doc.setFontSize(16); doc.text(`$${fmt(totalGeneral)}`,W-M-10,y+21,{align:"right"});
  const pages=doc.internal.getNumberOfPages();
  for(let p=1;p<=pages;p++){ doc.setPage(p); doc.setFillColor(10,22,40); doc.rect(0,H-26,W,26,"F"); doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(100,116,139); doc.text(`Orden de Compra — ${obra.nombre}`,M,H-10); doc.text(`Pág ${p}/${pages}`,W-M,H-10,{align:"right"}); }
  doc.save(`compras-${(obra.nombre||"obra").replace(/\s+/g,"-").toLowerCase()}-${today()}.pdf`);
}

// ─── OCR Boleta ───────────────────────────────────────────────────────────────
async function escanearBoleta(imageBase64){
  const base64Data=imageBase64.split(",")[1]; const mediaType=imageBase64.split(";")[0].split(":")[1]||"image/jpeg";
  const response=await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}, body:JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:1024, messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:mediaType,data:base64Data}},{type:"text",text:`Analiza esta boleta o factura y extrae los datos.\nResponde SOLO con JSON válido sin texto adicional:\n{"proveedor":"nombre","fechaCompra":"YYYY-MM-DD","materiales":[{"nombre":"","cantidad":0,"unidad":"","precio":0}]}`}]}] }) });
  if(!response.ok){ const err=await response.json(); throw new Error(err.error?.message||"Error IA"); }
  const data=await response.json(); const text=data.content[0]?.text||"";
  return JSON.parse(text.replace(/```json|```/g,"").trim());
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = {
  Hard:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>,
  Zone:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Plus:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  Chev:    ({open})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" style={{transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}><polyline points="6 9 12 15 18 9"/></svg>,
  Edit:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Lock:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="24" height="24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Down:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Up:      ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Chart:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Gear:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Cart:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  Cam:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Photo:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  Search:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Building:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 22V12h6v10"/><path d="M9 7h1"/><path d="M14 7h1"/><path d="M9 11h1"/><path d="M14 11h1"/></svg>,
  Alert:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Check:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>,
  Note:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Drag:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/></svg>,
  Cal:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Phone:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.52 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91A16 16 0 0 0 12 13l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14v2.92z"/></svg>,
  User:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Users:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Eye:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  List:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Shield:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  LogOut:  ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Link:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Copy:    ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Share:   ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  Mat:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  Key:     ()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
};

// ─── Styles & Constants ───────────────────────────────────────────────────────
const S = {
  inp:  {width:"100%",background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"9px 12px",color:"#f1f5f9",fontSize:"0.855rem",boxSizing:"border-box",outline:"none",fontFamily:"inherit"},
  btnP: {background:"#f59e0b",color:"#0f172a",border:"none",borderRadius:8,padding:"9px 18px",fontWeight:700,cursor:"pointer",fontSize:"0.82rem",letterSpacing:"0.05em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:5},
  btnS: {background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnD: {background:"transparent",color:"#ef4444",border:"1px solid #ef444455",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnG: {background:"#0f172a",color:"#94a3b8",border:"1px solid #1e293b",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnT: {background:"#1e3a5f",color:"#7dd3fc",border:"1px solid #1e4d7a55",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
  btnG2:{background:"#1a2e1a",color:"#4ade80",border:"1px solid #22c55e44",borderRadius:8,padding:"8px 14px",fontWeight:600,cursor:"pointer",fontSize:"0.82rem",display:"flex",alignItems:"center",gap:5},
};
const MAT_EST = {
  pendiente:{label:"Pendiente",color:"#f59e0b",bg:"#f59e0b18",dot:"#f59e0b"},
  comprado: {label:"Comprado", color:"#22c55e",bg:"#22c55e18",dot:"#22c55e"},
  en_camino:{label:"En camino",color:"#38bdf8",bg:"#38bdf818",dot:"#38bdf8"},
  entregado:{label:"Entregado",color:"#a78bfa",bg:"#a78bfa18",dot:"#a78bfa"},
};

const ROLE_META = {
  admin:      {label:"Administrador", icon:"👑", desc:"Control total · crea obras y zonas",    color:"#f59e0b"},
  colaborador:{label:"Colaborador",   icon:"🔧", desc:"Edita sus zonas · ve todo",              color:"#38bdf8"},
  materiales: {label:"Enc. Materiales",icon:"📦",desc:"Solo materiales y boletas · ve el avance",color:"#a78bfa"},
};

// ─── Progress Ring ────────────────────────────────────────────────────────────
function Ring({pct,size=56,stroke=5,color="#f59e0b"}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,off=circ-(pct/100)*circ;
  return <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke}/>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" style={{transition:"stroke-dashoffset .5s"}}/>
  </svg>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({title,onClose,children,wide,full}){
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

// ─── PIN Input Row ────────────────────────────────────────────────────────────
function PinRow({value,onChange,refs,onComplete,shake,size=52,height=64}){
  const handle=(i,v)=>{
    if(!/^\d?$/.test(v))return;
    const next=[...value]; next[i]=v; onChange(next);
    if(v&&i<4) refs[i+1].current?.focus();
    if(next.every(d=>d!=="")&&onComplete) onComplete(next.join(""));
  };
  const onKey=(i,e)=>{ if(e.key==="Backspace"&&!value[i]&&i>0) refs[i-1].current?.focus(); };
  return <div style={{display:"flex",gap:10,justifyContent:"center",animation:shake?"shake .4s":"none"}}>
    {value.map((d,i)=><input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1} value={d}
      onChange={e=>handle(i,e.target.value)} onKeyDown={e=>onKey(i,e)}
      style={{width:size,height,textAlign:"center",fontSize:"1.9rem",fontWeight:800,background:"#1e293b",border:`2px solid ${d?"#f59e0b":"#334155"}`,borderRadius:12,color:"#f1f5f9",outline:"none",transition:"border-color .2s"}}/>)}
  </div>;
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({users,obras,invites,onLogin,onRegister,onAcceptInvite}){
  const [mode,setMode]=useState(users.length===0?"register":"login");
  const [nombre,setNombre]=useState("");
  const [rol,setRol]=useState("admin");
  const [pin,setPin]=useState(["","","","",""]);
  const [pin2,setPin2]=useState(["","","","",""]);
  const [selUser,setSelUser]=useState(users[0]?.id||"");
  const [error,setError]=useState("");
  const [shake,setShake]=useState(false);
  // Enlace
  const [enlaceMode,setEnlaceMode]=useState(null); // null | "generar" | "unirse"
  const [inviteCode,setInviteCode]=useState("");
  const [genCode,setGenCode]=useState("");
  const [copied,setCopied]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef()];
  const refs2=[useRef(),useRef(),useRef(),useRef(),useRef()];

  const doLogin=(pinStr)=>{
    const user=users.find(u=>u.id===selUser);
    if(!user){setError("Selecciona un usuario");return;}
    if(pinStr!==user.pin){ setShake(true); setError("PIN incorrecto"); setTimeout(()=>{setPin(["","","","",""]);setShake(false);setError("");refs[0].current?.focus();},700); return; }
    onLogin(user);
  };
  const doRegister=()=>{
    if(!nombre.trim()){setError("Escribe tu nombre");return;}
    const p1=pin.join(""),p2=pin2.join("");
    if(p1.length!==5){setError("PIN debe tener 5 dígitos");return;}
    if(p1!==p2){setError("Los PINes no coinciden");return;}
    onRegister({id:uid(),nombre:nombre.trim(),rol,pin:p1,color:["#f59e0b","#22c55e","#38bdf8","#a78bfa","#fb923c"][Math.floor(Math.random()*5)]});
  };
  const generarCodigo=()=>{
    const code=mkCode();
    setGenCode(code);
    onAcceptInvite({action:"generate",code});
  };
  const unirseConCodigo=()=>{
    const inv=invites.find(i=>i.code===inviteCode.trim()&&!i.used);
    if(!inv){setError("Código inválido o ya fue usado");return;}
    onAcceptInvite({action:"join",code:inviteCode.trim()});
    setEnlaceMode(null); setError("");
  };
  const copiar=()=>{ navigator.clipboard?.writeText(genCode).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}); };

  if(enlaceMode){
    return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>
        <div style={{background:"#1e3a5f22",borderRadius:"50%",width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",border:"1px solid #38bdf844"}}><span style={{fontSize:"1.8rem"}}>🔗</span></div>
        <h2 style={{margin:"0 0 4px",fontSize:"1.5rem",fontWeight:800,color:"#f1f5f9"}}>Enlazar Obra</h2>
        <p style={{margin:"0 0 20px",fontSize:"0.8rem",color:"#64748b"}}>Sincroniza una obra con otra persona</p>

        <div style={{display:"flex",gap:8,marginBottom:20,background:"#0f172a",borderRadius:10,padding:3,border:"1px solid #1e293b"}}>
          {[["generar","Generar código"],["unirse","Tengo un código"]].map(([v,l])=><button key={v} onClick={()=>{setEnlaceMode(v);setGenCode("");setInviteCode("");setError("");}} style={{flex:1,padding:"7px",borderRadius:8,border:"none",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",background:enlaceMode===v?"#1e293b":"transparent",color:enlaceMode===v?"#f1f5f9":"#64748b",transition:"all .2s"}}>{l}</button>)}
        </div>

        {enlaceMode==="generar"&&<div style={{textAlign:"left",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#1e293b",borderRadius:10,padding:14,fontSize:"0.8rem",color:"#94a3b8",lineHeight:1.6}}>
            Se generará un código de 6 dígitos.<br/>Mándalo por <strong style={{color:"#25D366"}}>WhatsApp</strong> o mensaje a la otra persona. Cuando lo ingrese, quedarán conectados a la misma obra.
          </div>
          {!genCode&&<button style={{...S.btnP,justifyContent:"center"}} onClick={generarCodigo}><Ico.Share/> Generar código</button>}
          {genCode&&<>
            <div style={{background:"#0a1628",border:"2px dashed #38bdf844",borderRadius:12,padding:"20px 14px",textAlign:"center"}}>
              <div style={{fontSize:"0.68rem",color:"#64748b",marginBottom:6,letterSpacing:"0.1em",textTransform:"uppercase"}}>Código de enlace</div>
              <div style={{fontSize:"2.8rem",fontWeight:900,letterSpacing:"0.2em",color:"#38bdf8",fontFamily:"monospace"}}>{genCode}</div>
              <div style={{fontSize:"0.68rem",color:"#475569",marginTop:6}}>Válido por 24 horas</div>
            </div>
            <button style={{...S.btnT,justifyContent:"center"}} onClick={copiar}><Ico.Copy/>{copied?"¡Copiado!":"Copiar código"}</button>
            <div style={{background:"#1e293b",borderRadius:8,padding:"10px 12px",fontSize:"0.78rem",color:"#64748b"}}>
              💬 Mensaje sugerido para WhatsApp:<br/>
              <span style={{color:"#94a3b8",fontStyle:"italic"}}>«Ingresa este código en Supervisor de Obra para enlazar nuestra obra: <strong style={{color:"#38bdf8"}}>{genCode}</strong>»</span>
            </div>
          </>}
        </div>}

        {enlaceMode==="unirse"&&<div style={{textAlign:"left",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"#1e293b",borderRadius:10,padding:14,fontSize:"0.8rem",color:"#94a3b8",lineHeight:1.6}}>
            El encargado de la obra te compartió un código de 6 dígitos. Ingrésalo aquí para unirte y ver la misma obra.
          </div>
          <div>
            <label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:5,fontWeight:600}}>Código de 6 dígitos</label>
            <input style={{...S.inp,fontSize:"1.6rem",letterSpacing:"0.3em",textAlign:"center",fontWeight:800}} maxLength={6} placeholder="000000" value={inviteCode} onChange={e=>{ if(/^\d{0,6}$/.test(e.target.value)) setInviteCode(e.target.value); }}/>
          </div>
          <button style={{...S.btnP,justifyContent:"center"}} onClick={unirseConCodigo} disabled={inviteCode.length!==6}><Ico.Link/> Unirse a la obra</button>
        </div>}

        {error&&<p style={{margin:"12px 0 0",color:"#ef4444",fontSize:"0.83rem",textAlign:"center"}}>{error}</p>}
        <button style={{...S.btnS,margin:"16px auto 0",justifyContent:"center"}} onClick={()=>{setEnlaceMode(null);setGenCode("");setError("");}}>← Volver</button>
      </div>
    </div>;
  }

  return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{width:"100%",maxWidth:400,textAlign:"center"}}>
      <div style={{background:"#f59e0b22",borderRadius:"50%",width:76,height:76,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",border:"1px solid #f59e0b44"}}><Ico.Lock/></div>
      <h2 style={{margin:"0 0 4px",fontSize:"1.8rem",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",color:"#f1f5f9"}}>Supervisor <span style={{color:"#f59e0b"}}>de Obra</span></h2>
      <p style={{margin:"0 0 20px",fontSize:"0.8rem",color:"#64748b"}}>Sistema multi-usuario</p>

      {/* Enlazar obra — botón prominente */}
      <button onClick={()=>setEnlaceMode("generar")} style={{...S.btnT,width:"100%",justifyContent:"center",marginBottom:16,padding:"11px 14px"}}>
        <Ico.Link/> Enlazar obra con otra persona
      </button>

      {/* Tabs login / registro */}
      <div style={{display:"flex",background:"#0f172a",borderRadius:10,padding:3,marginBottom:20,border:"1px solid #1e293b"}}>
        {users.length>0&&<button onClick={()=>setMode("login")} style={{flex:1,padding:"7px",borderRadius:8,border:"none",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",background:mode==="login"?"#1e293b":"transparent",color:mode==="login"?"#f1f5f9":"#64748b",transition:"all .2s"}}>Ingresar</button>}
        <button onClick={()=>setMode("register")} style={{flex:1,padding:"7px",borderRadius:8,border:"none",fontWeight:700,fontSize:"0.78rem",cursor:"pointer",background:mode==="register"?"#1e293b":"transparent",color:mode==="register"?"#f1f5f9":"#64748b",transition:"all .2s"}}>Nuevo usuario</button>
      </div>

      {mode==="login"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {users.map(u=>{
            const rm=ROLE_META[u.rol]||ROLE_META.colaborador;
            return <button key={u.id} onClick={()=>setSelUser(u.id)} style={{background:selUser===u.id?"#1e293b":"#0f172a",border:`2px solid ${selUser===u.id?u.color||"#f59e0b":"#1e293b"}`,borderRadius:12,padding:"11px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all .2s"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:(u.color||"#f59e0b")+"22",border:`2px solid ${u.color||"#f59e0b"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0,color:u.color||"#f59e0b",fontWeight:800}}>{u.nombre[0].toUpperCase()}</div>
              <div style={{textAlign:"left",flex:1}}>
                <div style={{fontWeight:700,color:"#f1f5f9",fontSize:"0.9rem"}}>{u.nombre}</div>
                <div style={{fontSize:"0.68rem",color:"#64748b"}}>{rm.icon} {rm.label}</div>
              </div>
              {selUser===u.id&&<Ico.Check/>}
            </button>;
          })}
        </div>
        {selUser&&<>
          <p style={{margin:"4px 0 0",fontSize:"0.8rem",color:"#64748b"}}>PIN de {users.find(u=>u.id===selUser)?.nombre}</p>
          <PinRow value={pin} onChange={setPin} refs={refs} onComplete={doLogin} shake={shake}/>
        </>}
      </div>}

      {mode==="register"&&<div style={{display:"flex",flexDirection:"column",gap:12,textAlign:"left"}}>
        <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:4,fontWeight:600}}>Nombre completo</label>
          <input style={S.inp} placeholder="Ej: Juan Pérez" value={nombre} onChange={e=>setNombre(e.target.value)}/></div>
        <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:6,fontWeight:600}}>Rol</label>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[["admin","👑 Administrador","Control total · crea obras y zonas"],["colaborador","🔧 Colaborador","Edita sus zonas · ve todo"]].map(([v,l,desc])=><button key={v} onClick={()=>setRol(v)} style={{background:rol===v?"#1e293b":"#0f172a",border:`2px solid ${rol===v?"#f59e0b":"#1e293b"}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",textAlign:"left",transition:"all .2s",display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontSize:"1.3rem"}}>{l.split(" ")[0]}</span>
              <div><div style={{fontWeight:700,color:"#f1f5f9",fontSize:"0.82rem"}}>{l.split(" ").slice(1).join(" ")}</div><div style={{fontSize:"0.62rem",color:"#64748b",marginTop:1}}>{desc}</div></div>
            </button>)}
          </div>
        </div>
        <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:6,fontWeight:600}}>Crear PIN (5 dígitos)</label>
          <PinRow value={pin} onChange={setPin} refs={refs} size={46} height={56}/></div>
        {pin.every(d=>d!=="")&&<div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:6,fontWeight:600}}>Confirmar PIN</label>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            {pin2.map((d,i)=><input key={i} ref={refs2[i]} type="password" inputMode="numeric" maxLength={1} value={d}
              onChange={e=>{ if(!/^\d?$/.test(e.target.value))return; const n=[...pin2];n[i]=e.target.value;setPin2(n); if(e.target.value&&i<4)refs2[i+1].current?.focus(); }}
              onKeyDown={e=>{ if(e.key==="Backspace"&&!pin2[i]&&i>0)refs2[i-1].current?.focus(); }}
              style={{width:46,height:56,textAlign:"center",fontSize:"1.6rem",fontWeight:800,background:"#1e293b",border:`2px solid ${d?"#22c55e":"#334155"}`,borderRadius:10,color:"#f1f5f9",outline:"none"}}/>)}
          </div></div>}
        <button style={{...S.btnP,justifyContent:"center",marginTop:4}} onClick={doRegister}><Ico.User/> Crear cuenta</button>
      </div>}

      {error&&<p style={{margin:"12px 0 0",color:"#ef4444",fontSize:"0.83rem",textAlign:"center"}}>{error}</p>}
    </div>
  </div>;
}

// ─── Camera Modal ─────────────────────────────────────────────────────────────
function CameraModal({onCapture,onClose}){
  const videoRef=useRef(); const canvasRef=useRef();
  const [stream,setStream]=useState(null); const [preview,setPreview]=useState(null); const [facingMode,setFacingMode]=useState("environment");
  useEffect(()=>{ startCam(facingMode); return ()=>stopCam(); },[facingMode]);
  const startCam=async(mode)=>{ stopCam(); try{ const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:mode,width:{ideal:1280},height:{ideal:720}}}); setStream(s); if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play();} }catch(e){console.error(e);} };
  const stopCam=()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); setStream(null); };
  const capture=()=>{ const v=videoRef.current,c=canvasRef.current; c.width=v.videoWidth; c.height=v.videoHeight; c.getContext("2d").drawImage(v,0,0); setPreview(c.toDataURL("image/jpeg",0.85)); };
  return <Modal title="Tomar Foto" onClose={()=>{stopCam();onClose();}} full>
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,height:"100%"}}>
      {!preview?<>
        <div style={{width:"100%",maxWidth:480,background:"#000",borderRadius:12,overflow:"hidden",flex:1,position:"relative"}}><video ref={videoRef} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} playsInline muted/></div>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        <div style={{display:"flex",gap:12,paddingBottom:8}}>
          <button style={S.btnG} onClick={()=>setFacingMode(f=>f==="environment"?"user":"environment")}>🔄 Voltear</button>
          <button style={{...S.btnP,padding:"14px 36px",fontSize:"1rem",borderRadius:50}} onClick={capture}>📸 Capturar</button>
          <button style={S.btnG} onClick={()=>{stopCam();onClose();}}>Cancelar</button>
        </div>
      </>:<>
        <img src={preview} style={{width:"100%",maxWidth:480,borderRadius:12,maxHeight:"70vh",objectFit:"contain"}} alt="preview"/>
        <div style={{display:"flex",gap:10,paddingBottom:8}}>
          <button style={S.btnG} onClick={()=>setPreview(null)}>🔄 Repetir</button>
          <button style={S.btnP} onClick={()=>{onCapture(preview);onClose();}}><Ico.Check/> Usar foto</button>
        </div>
      </>}
    </div>
  </Modal>;
}

// ─── Scan Boleta ──────────────────────────────────────────────────────────────
function ScanBoletaModal({onDatos,onClose}){
  const [foto,setFoto]=useState(null); const [scanning,setScanning]=useState(false); const [error,setError]=useState(""); const [camMode,setCamMode]=useState(false);
  const videoRef=useRef(); const canvasRef=useRef(); const [stream,setStream]=useState(null);
  const startCam=async()=>{ try{ const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}}); setStream(s); setCamMode(true); setTimeout(()=>{ if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play();} },100); }catch{ setError("No se pudo acceder a la cámara"); } };
  const stopCam=()=>{ stream?.getTracks().forEach(t=>t.stop()); setStream(null); setCamMode(false); };
  const capturar=()=>{ const v=videoRef.current,c=canvasRef.current; c.width=v.videoWidth; c.height=v.videoHeight; c.getContext("2d").drawImage(v,0,0); setFoto(c.toDataURL("image/jpeg",0.9)); stopCam(); };
  const analizar=async()=>{ if(!foto)return; setScanning(true); setError(""); try{ const datos=await escanearBoleta(foto); onDatos(datos); onClose(); }catch(e){ setError("Error: "+e.message); }finally{ setScanning(false); } };
  return <Modal title="Escanear Boleta con IA" onClose={()=>{stopCam();onClose();}} wide>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {!camMode&&!foto&&<div style={{display:"flex",gap:8}}>
        <button style={{...S.btnP,flex:1,justifyContent:"center"}} onClick={startCam}><Ico.Cam/> Cámara</button>
        <label style={{...S.btnS,flex:1,justifyContent:"center",cursor:"pointer"}}><Ico.Photo/> Galería<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>setFoto(ev.target.result); r.readAsDataURL(f); }}/></label>
      </div>}
      {camMode&&<><div style={{position:"relative",borderRadius:12,overflow:"hidden",background:"#000"}}><video ref={videoRef} style={{width:"100%",maxHeight:260,objectFit:"cover",display:"block"}} playsInline muted/></div><canvas ref={canvasRef} style={{display:"none"}}/><div style={{display:"flex",gap:8}}><button style={{...S.btnP,flex:1,justifyContent:"center"}} onClick={capturar}>📸 Capturar</button><button style={S.btnS} onClick={stopCam}>Cancelar</button></div></>}
      {foto&&!camMode&&<><img src={foto} alt="boleta" style={{width:"100%",borderRadius:10,maxHeight:220,objectFit:"contain",border:"1px solid #334155"}}/><div style={{display:"flex",gap:8}}><button style={{...S.btnP,flex:1,justifyContent:"center"}} onClick={analizar} disabled={scanning}>{scanning?"🔍 Analizando…":"🤖 Analizar con IA"}</button><button style={S.btnS} onClick={()=>setFoto(null)}>Cambiar</button></div></>}
      {error&&<div style={{background:"#450a0a",border:"1px solid #ef444444",borderRadius:8,padding:"10px 12px",fontSize:"0.8rem",color:"#fca5a5"}}>{error}</div>}
    </div>
  </Modal>;
}

// ─── MatRow ───────────────────────────────────────────────────────────────────
function MatRow({mat,onEdit,onDelete,onStatus,canEdit}){
  const est=MAT_EST[mat.estado||"pendiente"],total=(parseFloat(mat.precio)||0)*(parseFloat(mat.cantidad)||0);
  return <div style={{background:"#060e1a",borderTop:"1px solid #0d1526",padding:"7px 14px 7px 20px"}}>
    <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:est.dot,flexShrink:0}}/>
      <span style={{flex:1,fontSize:"0.81rem",color:"#cbd5e1",fontWeight:500,minWidth:60}}>{mat.nombre}</span>
      <span style={{fontSize:"0.75rem",color:"#94a3b8"}}>{mat.cantidad} {mat.unidad}</span>
      {total>0&&<span style={{fontSize:"0.8rem",fontWeight:700,color:"#f59e0b"}}>${fmt(total)}</span>}
      {canEdit?<select value={mat.estado||"pendiente"} onChange={e=>onStatus(e.target.value)} style={{background:est.bg,border:`1px solid ${est.dot}44`,borderRadius:6,color:est.color,fontSize:"0.67rem",fontWeight:700,padding:"2px 5px",cursor:"pointer",outline:"none"}}>
        {Object.entries(MAT_EST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
      </select>:<span style={{background:est.bg,border:`1px solid ${est.dot}44`,borderRadius:6,color:est.color,fontSize:"0.67rem",fontWeight:700,padding:"2px 7px"}}>{est.label}</span>}
      {canEdit&&<><button className="ic" onClick={onEdit}><Ico.Edit/></button><button className="ic danger" onClick={onDelete}><Ico.Trash/></button></>}
    </div>
    {(mat.proveedor||mat.fechaCompra||mat.notas)&&<div style={{display:"flex",gap:10,marginTop:3,paddingLeft:14,flexWrap:"wrap"}}>
      {mat.proveedor&&<span style={{fontSize:"0.65rem",color:"#475569"}}>🏪 {mat.proveedor}</span>}
      {mat.fechaCompra&&<span style={{fontSize:"0.65rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{mat.fechaCompra}</span>}
      {mat.notas&&<span style={{fontSize:"0.65rem",color:"#475569",fontStyle:"italic"}}>📝 {mat.notas}</span>}
    </div>}
  </div>;
}

// ─── MatForm ──────────────────────────────────────────────────────────────────
function MatForm({mat,onChange}){
  const p=parseFloat(mat.precio)||0,q=parseFloat(mat.cantidad)||0,t=p*q;
  return <div style={{display:"flex",flexDirection:"column",gap:9}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Material *</label><input style={S.inp} placeholder="Ej: Cemento" value={mat.nombre||""} onChange={e=>onChange("nombre",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Estado</label>
        <select style={{...S.inp,color:"#f1f5f9"}} value={mat.estado||"pendiente"} onChange={e=>onChange("estado",e.target.value)}>
          {Object.entries(MAT_EST).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Cantidad</label><input style={S.inp} type="number" min="0" step="any" placeholder="0" value={mat.cantidad||""} onChange={e=>onChange("cantidad",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Unidad</label><input style={S.inp} placeholder="kg, m²" value={mat.unidad||""} onChange={e=>onChange("unidad",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Precio u.</label><input style={S.inp} type="number" min="0" step="any" placeholder="0" value={mat.precio||""} onChange={e=>onChange("precio",e.target.value)}/></div>
    </div>
    {t>0&&<div style={{background:"#1e293b",borderRadius:8,padding:"7px 12px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:"0.75rem",color:"#64748b"}}>Total</span><span style={{fontSize:"0.95rem",fontWeight:800,color:"#f59e0b"}}>${fmt(t)}</span></div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Proveedor</label><input style={S.inp} placeholder="Nombre" value={mat.proveedor||""} onChange={e=>onChange("proveedor",e.target.value)}/></div>
      <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha compra</label><input style={S.inp} type="date" value={mat.fechaCompra||""} onChange={e=>onChange("fechaCompra",e.target.value)}/></div>
    </div>
    <input style={S.inp} placeholder="Notas del material" value={mat.notas||""} onChange={e=>onChange("notas",e.target.value)}/>
  </div>;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({obra,calcZonePct,totalPct,onPDF,onCompras,currentUser}){
  const pct=totalPct(),pc=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";
  const allI=obra.zonas.flatMap(z=>z.items||[]);
  const allM=allI.flatMap(i=>i.materiales||[]);
  const done=allI.filter(i=>i.terminado).length,pend=allI.filter(i=>!i.terminado).length;
  const crit=allI.filter(i=>(i.peso||1)>=8&&!i.terminado).length;
  const presup=allM.reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const gast=allM.filter(m=>["comprado","en_camino","entregado"].includes(m.estado||"")).reduce((s,m)=>(parseFloat(m.precio)||0)*(parseFloat(m.cantidad)||0)+s,0);
  const pendMat=allM.filter(m=>!m.estado||m.estado==="pendiente").length;
  const alertas=allI.filter(i=>{ const d=daysDiff(i.fechaFin); return !i.terminado&&d!==null&&d<=3; });
  const sorted=[...obra.zonas].sort((a,b)=>calcZonePct(b)-calcZonePct(a));
  return <div style={{display:"flex",flexDirection:"column",gap:12}}>
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
        {(obra.fechaInicio||obra.fechaFin)&&<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {obra.fechaInicio&&<span style={{fontSize:"0.68rem",color:"#64748b",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(obra.fechaInicio)}</span>}
          {obra.fechaFin&&<span style={{fontSize:"0.68rem",color:daysDiff(obra.fechaFin)<7?"#ef4444":"#64748b",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(obra.fechaFin)}</span>}
        </div>}
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          <button style={{...S.btnP,fontSize:"0.72rem",padding:"6px 12px"}} onClick={onPDF}>📄 PDF Avance</button>
          <button style={{...S.btnS,fontSize:"0.72rem",padding:"6px 10px"}} onClick={onCompras}><Ico.Cart/> PDF Compras</button>
        </div>
      </div>
    </div>
    {alertas.length>0&&<div style={{background:"#450a0a",border:"1px solid #ef444444",borderRadius:12,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,color:"#fca5a5",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em"}}><Ico.Alert/> {alertas.length} ítem(s) próximo(s) a vencer</div>
      {alertas.map(it=>{ const d=daysDiff(it.fechaFin); return <div key={it.id} style={{fontSize:"0.8rem",color:"#fca5a5",marginBottom:3}}>⚠ {it.nombre} — {d<0?`Vencido hace ${Math.abs(d)}d`:`${d}d restante${d!==1?"s":""}`}</div>; })}
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
      {[["Completados",done,"#22c55e"],["Pendientes",pend,"#f59e0b"],["Críticos",crit,"#ef4444"]].map(([l,v,c])=>(
        <div key={l} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"13px 10px",textAlign:"center"}}>
          <div style={{fontSize:"1.8rem",fontWeight:800,color:c,lineHeight:1}}>{v}</div>
          <div style={{fontSize:"0.62rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginTop:3}}>{l}</div>
        </div>
      ))}
    </div>
    {presup>0&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.68rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}><Ico.Cart/> Materiales</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
        {[["Presupuesto","$"+fmt(presup),"#94a3b8"],["Gastado","$"+fmt(gast),"#f59e0b"],["Pendiente",pendMat+" ítems","#ef4444"]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center"}}><div style={{fontSize:"0.88rem",fontWeight:800,color:c}}>{v}</div><div style={{fontSize:"0.58rem",color:"#475569",marginTop:1}}>{l}</div></div>
        ))}
      </div>
      <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden",marginBottom:3}}>
        <div style={{height:"100%",width:`${Math.min(100,(gast/presup)*100)}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b)",borderRadius:3,transition:"width .6s"}}/>
      </div>
      <div style={{fontSize:"0.62rem",color:"#475569"}}>{Math.round((gast/presup)*100)}% comprometido</div>
    </div>}
    {sorted.length>0&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:13,padding:14}}>
      <div style={{fontSize:"0.68rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Avance por Zona</div>
      {sorted.map(z=>{ const zp=calcZonePct(z),zc=zp<30?"#ef4444":zp<70?"#f59e0b":"#22c55e"; return <div key={z.id} style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"center"}}>
          <span style={{fontSize:"0.82rem",color:"#e2e8f0",fontWeight:500}}>{z.nombre}</span>
          <span style={{fontSize:"0.82rem",fontWeight:700,color:zc}}>{zp}%</span>
        </div>
        <div style={{height:5,background:"#1e293b",borderRadius:3,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${zp}%`,background:zc,borderRadius:3,transition:"width .5s"}}/>
        </div>
        <div style={{fontSize:"0.63rem",color:"#475569",marginTop:2}}>{(z.items||[]).filter(i=>i.terminado).length}/{(z.items||[]).length} ítems</div>
      </div>; })}
    </div>}
    {obra.notas&&<div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:11,padding:13}}>
      <div style={{fontSize:"0.65rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5,display:"flex",alignItems:"center",gap:4}}><Ico.Note/> Notas</div>
      <p style={{margin:0,fontSize:"0.83rem",color:"#94a3b8",lineHeight:1.6}}>{obra.notas}</p>
    </div>}
  </div>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function SupervisorObra(){
  const [ready,setReady]=useState(false);
  const [obras,setObras]=useState([]);
  const [users,setUsers]=useState([]);
  const [invites,setInvites]=useState([]);
  const [currentUser,setCurrentUser]=useState(null);
  const [activeId,setActiveId]=useState(null);
  const [tab,setTab]=useState("dashboard");
  const [exZones,setExZones]=useState({});
  const [exItems,setExItems]=useState({});
  const [exSubItems,setExSubItems]=useState({});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [matForm,setMatForm]=useState({});
  const [exporting,setExporting]=useState(false);
  const [search,setSearch]=useState("");
  const [dragI,setDragI]=useState(null);
  const [dragO,setDragO]=useState(null);
  const [cameraFor,setCameraFor]=useState(null);
  const [scanBoleta,setScanBoleta]=useState(null);

  const obra=obras.find(o=>o.id===activeId)||obras[0]||null;

  useEffect(()=>{
    const {obras:o,users:u,activeId:aid,session:ses,invites:inv}=loadAll();
    let list=o.length?o:[emptyObra("Mi Primera Obra")];
    setObras(list); setUsers(u); setInvites(inv||[]);
    setActiveId(aid||list[0]?.id||null);
    if(ses&&u.find(x=>x.id===ses)) setCurrentUser(u.find(x=>x.id===ses));
    setReady(true);
  },[]);

  useEffect(()=>{ if(!ready)return; const t=setTimeout(()=>ss(OBRAS_KEY,obras),300); return()=>clearTimeout(t); },[obras,ready]);
  useEffect(()=>{ if(!ready)return; ss(USERS_KEY,users); },[users,ready]);
  useEffect(()=>{ if(!ready)return; ss(INVITE_KEY,invites); },[invites,ready]);

  const updObra=(fn)=>setObras(prev=>prev.map(o=>o.id===activeId?fn(o):o));
  const closeModal=()=>{ setModal(null); setForm({}); setMatForm({}); };
  const toast=(msg,type="ok")=>{ setModal({type:"toast",msg,toastType:type}); setTimeout(()=>setModal(m=>m?.type==="toast"?null:m),2600); };

  // ── Permisos ──
  const isMateriales = currentUser?.rol==="materiales";
  const canEditZona  = (zona) => {
    if(isMateriales) return false; // materiales no edita zonas/ítems
    if(!zona) return false;
    if(currentUser?.rol==="admin") return true;
    if(!zona.ownerUserId) return true;
    return zona.ownerUserId===currentUser?.id;
  };
  const canEditMat = (zona) => {
    if(isMateriales) return true;  // materiales edita en todas
    return canEditZona(zona);
  };

  // ── Cálculos ──
  const calcItemPct=(item)=>{ const subs=item.subItems||[]; if(!subs.length) return item.terminado?100:0; return Math.round((subs.filter(s=>s.terminado).length/subs.length)*100); };
  const isItemDone=(item)=>{ const subs=item.subItems||[]; return subs.length?subs.every(s=>s.terminado):item.terminado; };
  const calcZonePct=(zona)=>{ if(!(zona.items||[]).length)return 0; const tw=zona.items.reduce((s,i)=>s+(i.peso||1),0); const dw=zona.items.reduce((s,i)=>s+(i.peso||1)*(calcItemPct(i)/100),0); return Math.round((dw/tw)*100); };
  const totalPct=()=>{ if(!obra)return 0; const all=obra.zonas.flatMap(z=>z.items||[]); if(!all.length)return 0; const tw=all.reduce((s,i)=>s+(i.peso||1),0); const dw=all.reduce((s,i)=>s+(i.peso||1)*(calcItemPct(i)/100),0); return Math.round((dw/tw)*100); };

  // ── Auth ──
  const handleLogin=(user)=>{ setCurrentUser(user); ss(SESSION_KEY,user.id); };
  const handleRegister=(user)=>{ const next=[...users,user]; setUsers(next); ss(USERS_KEY,next); setCurrentUser(user); ss(SESSION_KEY,user.id); };
  const handleLogout=()=>{ setCurrentUser(null); sd(SESSION_KEY); };

  // ── Enlace de obra ──
  const handleInvite=({action,code})=>{
    if(action==="generate"){
      const newInv={code,obraId:obra?.id||null,createdAt:Date.now(),used:false,expiresAt:Date.now()+86400000};
      const next=[...invites.filter(i=>!i.used&&i.obraId===obra?.id),newInv];
      setInvites(next); ss(INVITE_KEY,next);
    } else if(action==="join"){
      const inv=invites.find(i=>i.code===code&&!i.used&&i.expiresAt>Date.now());
      if(!inv){toast("Código inválido o expirado","err");return;}
      // Marcar usado + activar esa obra si existe
      const nextInv=invites.map(i=>i.code===code?{...i,used:true}:i);
      setInvites(nextInv); ss(INVITE_KEY,nextInv);
      if(inv.obraId){ setActiveId(inv.obraId); ss(ACTIVE_KEY,inv.obraId); }
      toast("✅ ¡Obra enlazada correctamente!");
    }
  };

  // ── CRUD Obras ──
  const createObra=()=>{ if(!form.nombre?.trim())return; const o=emptyObra(form.nombre.trim()); o.descripcion=form.descripcion||""; o.fechaInicio=form.fechaInicio||today(); o.fechaFin=form.fechaFin||""; setObras(p=>[...p,o]); setActiveId(o.id); ss(ACTIVE_KEY,o.id); setTab("zonas"); closeModal(); };
  const deleteObra=(id)=>{ if(!window.confirm("¿Eliminar esta obra?"))return; const next=obras.filter(o=>o.id!==id); setObras(next); if(activeId===id){ const nid=next[0]?.id||null; setActiveId(nid); ss(ACTIVE_KEY,nid); } };

  // ── CRUD Zonas ──
  const addZona=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:[...o.zonas,{id:uid(),nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1,items:[],ownerUserId:currentUser?.id||null}]})); closeModal(); };
  const editZona=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===modal.zId?{...z,nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1}:z)})); closeModal(); };
  const delZona=(id)=>{ if(!window.confirm("¿Eliminar zona?"))return; updObra(o=>({...o,zonas:o.zonas.filter(z=>z.id!==id),trabajadores:o.trabajadores.map(t=>t.zonaId===id?{...t,zonaId:null}:t)})); };

  // ── CRUD Items ──
  const addItem=(zId)=>{ if(!form.nombre?.trim())return; const ni={id:uid(),nombre:form.nombre.trim(),descripcion:form.descripcion||"",terminado:false,peso:parseFloat(form.peso)||1,materiales:[],fotos:[],notas:form.notas||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||"",subItems:[]}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:[...z.items,ni]}:z)})); closeModal(); };
  const editItem=()=>{ if(!form.nombre?.trim())return; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===modal.zId?{...z,items:z.items.map(i=>i.id===modal.iId?{...i,nombre:form.nombre.trim(),descripcion:form.descripcion||"",peso:parseFloat(form.peso)||1,notas:form.notas||"",fechaInicio:form.fechaInicio||"",fechaFin:form.fechaFin||""}:i)}:z)})); closeModal(); };
  const delItem=(zId,iId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.filter(i=>i.id!==iId)}:z)}));
  const toggleItem=(zId,iId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,terminado:!i.terminado}:i)}:z)}));

  // ── Sub-Ítems ──
  const addSubItem=(zId,iId)=>{ if(!form.subNombre?.trim())return; const ns={id:uid(),nombre:form.subNombre.trim(),terminado:false}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,subItems:[...(i.subItems||[]),ns]}:i)}:z)})); setForm(p=>({...p,subNombre:""})); };
  const toggleSubItem=(zId,iId,sId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,subItems:(i.subItems||[]).map(s=>s.id===sId?{...s,terminado:!s.terminado}:s)}:i)}:z)}));
  const delSubItem=(zId,iId,sId)=>updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,subItems:(i.subItems||[]).filter(s=>s.id!==sId)}:i)}:z)}));

  // ── Materiales ──
  const addMat=(zId,iId)=>{ if(!matForm.nombre?.trim())return; const m={id:uid(),...matForm,nombre:matForm.nombre.trim(),cantidad:parseFloat(matForm.cantidad)||0,precio:parseFloat(matForm.precio)||0,estado:matForm.estado||"pendiente",agregadoPor:currentUser?.id}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:[...(i.materiales||[]),m]}:i)}:z)})); closeModal(); };
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

  // ── Boleta ──
  const handleBoletaDatos=(datos,zId,iId)=>{ if(!datos.materiales?.length){toast("No se encontraron materiales","err");return;} datos.materiales.forEach(m=>{ const mat={id:uid(),nombre:m.nombre||"",estado:"pendiente",cantidad:m.cantidad||0,unidad:m.unidad||"",precio:m.precio||0,proveedor:datos.proveedor||"",fechaCompra:datos.fechaCompra||"",notas:"",agregadoPor:currentUser?.id}; updObra(o=>({...o,zonas:o.zonas.map(z=>z.id===zId?{...z,items:z.items.map(i=>i.id===iId?{...i,materiales:[...(i.materiales||[]),mat]}:i)}:z)})); }); toast(`✅ ${datos.materiales.length} material(es) agregado(s)`); };

  // ── Drag ──
  const hDS=(e,i)=>{ setDragI(i); e.dataTransfer.effectAllowed="move"; };
  const hDO=(e,i)=>{ e.preventDefault(); setDragO(i); };
  const hDD=(e,i)=>{ e.preventDefault(); if(dragI===null||dragI===i){setDragI(null);setDragO(null);return;} updObra(o=>{const z=[...o.zonas];const[m]=z.splice(dragI,1);z.splice(i,0,m);return{...o,zonas:z};}); setDragI(null);setDragO(null); };

  // ── Export ──
  const doPDF=async()=>{ if(!obra)return; setExporting(true); try{await exportAvancePDF(obra,calcZonePct,totalPct);}catch{toast("Error al generar PDF","err");}finally{setExporting(false);} };
  const doCompras=async()=>{ if(!obra)return; setExporting(true); try{await exportComprasPDF(obra);}catch{toast("Error al generar PDF","err");}finally{setExporting(false);} };
  const doExportJSON=()=>{ const b=new Blob([JSON.stringify(obras,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement("a");a.href=u;a.download=`supervisor-backup-${today()}.json`;a.click();URL.revokeObjectURL(u); };
  const doImportJSON=(e)=>{ const f=e.target.files[0];if(!f)return; const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(Array.isArray(d)){setObras(d);setActiveId(d[0]?.id||null);toast("✅ Datos importados");}else if(d.zonas){setObras(p=>[...p,{...emptyObra("Importada"),...d}]);toast("✅ Importado");}}catch{toast("❌ Error al leer","err");}}; r.readAsText(f);e.target.value=""; };

  // ── Agregar usuario desde configuración ──
  const addUserFromSettings=()=>{
    const {nuNombre,nuRol,nuPin,nuPin2}=form;
    if(!nuNombre?.trim()){toast("Escribe un nombre","err");return;}
    if(!nuPin||nuPin.length!==5){toast("PIN de 5 dígitos requerido","err");return;}
    if(nuPin!==nuPin2){toast("Los PINes no coinciden","err");return;}
    const nu={id:uid(),nombre:nuNombre.trim(),rol:nuRol||"materiales",pin:nuPin,color:["#f59e0b","#22c55e","#38bdf8","#a78bfa","#fb923c"][Math.floor(Math.random()*5)]};
    const next=[...users,nu]; setUsers(next); ss(USERS_KEY,next);
    toast(`✅ Usuario "${nu.nombre}" creado`); setForm({}); 
  };

  if(!ready) return <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#020b18,#0a1628)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#64748b"}}><span style={{fontSize:"2.5rem",animation:"spin 1s linear infinite",display:"inline-block"}}>⚙</span><span style={{fontSize:"0.82rem"}}>Cargando...</span></div>;

  if(!currentUser) return <AuthScreen users={users} obras={obras} invites={invites} onLogin={handleLogin} onRegister={handleRegister} onAcceptInvite={handleInvite}/>;

  const pct=obra?totalPct():0; const pc=pct<30?"#ef4444":pct<70?"#f59e0b":"#22c55e";
  const rm=ROLE_META[currentUser.rol]||ROLE_META.colaborador;

  // Tabs según rol
  const TABS = isMateriales
    ? [{id:"dashboard",label:"Resumen",icon:<Ico.Chart/>},{id:"zonas",label:"Zonas",icon:<Ico.Zone/>}]
    : [{id:"dashboard",label:"Resumen",icon:<Ico.Chart/>},{id:"zonas",label:"Zonas",icon:<Ico.Zone/>},{id:"personal",label:"Personal",icon:<Ico.Hard/>}];

  const filteredZonas=search.trim()?(obra?.zonas||[]).map(z=>({...z,items:(z.items||[]).filter(i=>i.nombre.toLowerCase().includes(search.toLowerCase()))})).filter(z=>z.items.length>0):(obra?.zonas||[]);

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
      .sub-tog{width:24px;height:14px;border-radius:7px;border:none;cursor:pointer;position:relative;transition:background .2s;display:flex;align-items:center;padding:1px;flex-shrink:0;}
      .sub-knob{width:12px;height:12px;border-radius:50%;background:white;transition:transform .2s;}
      .dov{border-color:#f59e0b!important;background:#f59e0b07!important;}
      input:focus,select:focus,textarea:focus{border-color:#f59e0b!important;} select{appearance:none;} textarea{resize:vertical;min-height:56px;}
      @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      .fa{animation:fadeUp .22s ease;}
    `}</style>

    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#020b18 0%,#0a1628 100%)",color:"#f1f5f9"}}>

      {/* HEADER */}
      <div style={{background:"#080f1e",borderBottom:"1px solid #1e293b",padding:"0 12px",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:820,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0 7px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
              <div style={{background:"#f59e0b22",borderRadius:8,padding:"5px 7px",flexShrink:0}}><Ico.Hard/></div>
              <div style={{minWidth:0}}>
                <h1 style={{margin:0,fontFamily:"'Barlow Condensed',sans-serif",fontSize:"1.3rem",fontWeight:800,letterSpacing:"0.04em",textTransform:"uppercase",color:"#f1f5f9",whiteSpace:"nowrap"}}>Supervisor <span style={{color:"#f59e0b"}}>de Obra</span></h1>
                {obra&&<button onClick={()=>!isMateriales&&setModal({type:"obras"})} style={{background:"none",border:"none",cursor:isMateriales?"default":"pointer",padding:0,color:"#64748b",fontSize:"0.68rem",display:"flex",alignItems:"center",gap:3,marginTop:1}}>
                  <Ico.Building/> {obra.nombre}
                </button>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{display:"flex",alignItems:"center",gap:5,background:"#0f172a",border:`1px solid ${currentUser.color||"#f59e0b"}33`,borderRadius:8,padding:"4px 8px"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:(currentUser.color||"#f59e0b")+"22",border:`1.5px solid ${currentUser.color||"#f59e0b"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",fontWeight:800,color:currentUser.color||"#f59e0b"}}>{currentUser.nombre[0].toUpperCase()}</div>
                <span style={{fontSize:"0.68rem",color:"#94a3b8"}}>{rm.icon}</span>
              </div>
              {obra&&<div style={{position:"relative",flexShrink:0}}><Ring pct={pct} size={40} stroke={4} color={pc}/><div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"0.58rem",fontWeight:800,color:pc}}>{pct}%</span></div></div>}
              {!isMateriales&&<button className="ic" onClick={()=>setModal({type:"settings"})}><Ico.Gear/></button>}
              <button className="ic" title="Cerrar sesión" onClick={handleLogout}><Ico.LogOut/></button>
            </div>
          </div>
          <div style={{display:"flex",borderTop:"1px solid #1e293b",overflowX:"auto"}}>
            {TABS.map(t=><button key={t.id} className={`tb ${tab===t.id?"on":""}`} onClick={()=>setTab(t.id)}>{t.icon}{t.label}</button>)}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{maxWidth:820,margin:"0 auto",padding:"12px 12px 90px"}} className="fa">

        {/* Banner para rol materiales */}
        {isMateriales&&<div style={{background:"#1a1a2e",border:"1px solid #a78bfa33",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontSize:"0.78rem",color:"#a78bfa"}}>
          <span style={{fontSize:"1.1rem"}}>📦</span>
          <span>Acceso de <strong>Encargado de Materiales</strong> — puedes agregar y gestionar materiales en todas las zonas.</span>
        </div>}

        {tab==="dashboard"&&obra&&<Dashboard obra={obra} calcZonePct={calcZonePct} totalPct={totalPct} onPDF={doPDF} onCompras={doCompras} currentUser={currentUser}/>}

        {tab==="zonas"&&obra&&<div>
          <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
            <div style={{flex:1,position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#475569"}}><Ico.Search/></span>
              <input style={{...S.inp,paddingLeft:32}} placeholder="Buscar ítems…" value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            {!isMateriales&&<button style={S.btnP} onClick={()=>setModal({type:"addZona"})}><Ico.Plus/> Zona</button>}
          </div>

          {filteredZonas.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:"#334155"}}>
            {search?<p style={{color:"#334155"}}>Sin resultados</p>:<p style={{color:"#334155"}}>{isMateriales?"No hay zonas en esta obra":"Sin zonas. ¡Crea la primera!"}</p>}
          </div>}

          {filteredZonas.map((zona,zi)=>{
            const isOpen=exZones[zona.id],zPct=calcZonePct(zona),zc=zPct<30?"#ef4444":zPct<70?"#f59e0b":"#22c55e";
            const isDO=dragO===zi&&typeof dragI==="number";
            const ceZona=canEditZona(zona);
            const ceMat=canEditMat(zona);
            const ownerUser=users.find(u=>u.id===zona.ownerUserId);

            return <div key={zona.id} className={`card${isDO?" dov":""}`}
              draggable={ceZona} onDragStart={e=>ceZona&&hDS(e,zi)} onDragOver={e=>hDO(e,zi)} onDrop={e=>hDD(e,zi)} onDragLeave={()=>setDragO(null)}>

              <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",cursor:"pointer"}} onClick={()=>setExZones(p=>({...p,[zona.id]:!p[zona.id]}))}>
                {ceZona?<span style={{color:"#334155",cursor:"grab",flexShrink:0}}><Ico.Drag/></span>:<span style={{color:"#1e3a5f",flexShrink:0}}><Ico.Eye/></span>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:"0.93rem"}}>{zona.nombre}</span>
                    <span className="badge" style={{background:zc+"22",color:zc}}>{zPct}%</span>
                    <span style={{fontSize:"0.65rem",color:"#475569"}}>{(zona.items||[]).filter(i=>isItemDone(i)).length}/{(zona.items||[]).length}</span>
                    {ownerUser&&<span style={{fontSize:"0.6rem",color:ownerUser.color||"#f59e0b",background:(ownerUser.color||"#f59e0b")+"18",borderRadius:4,padding:"1px 5px"}}>{ownerUser.nombre}</span>}
                    {isMateriales&&<span style={{fontSize:"0.6rem",color:"#a78bfa",background:"#a78bfa18",borderRadius:4,padding:"1px 6px"}}>📦 tus materiales</span>}
                  </div>
                  {zona.descripcion&&<div style={{fontSize:"0.7rem",color:"#475569",marginTop:1}}>{zona.descripcion}</div>}
                </div>
                <div style={{display:"flex",gap:5}} onClick={e=>e.stopPropagation()}>
                  {ceZona&&<><button className="ic" onClick={()=>{setForm({nombre:zona.nombre,descripcion:zona.descripcion||"",peso:zona.peso||1});setModal({type:"editZona",zId:zona.id});}}><Ico.Edit/></button>
                  <button className="ic danger" onClick={()=>delZona(zona.id)}><Ico.Trash/></button></>}
                </div>
                <Ico.Chev open={isOpen}/>
              </div>

              <div style={{height:3,background:"#1e293b"}}><div style={{height:"100%",width:`${zPct}%`,background:zc,transition:"width .5s"}}/></div>

              {isOpen&&<div>
                {(zona.items||[]).map((item)=>{
                  const iOpen=exItems[item.id],sOpen=exSubItems[item.id];
                  const d=daysDiff(item.fechaFin);
                  const overdue=d!==null&&d<0&&!isItemDone(item),warning=d!==null&&d<=3&&d>=0&&!isItemDone(item);
                  const iPct=calcItemPct(item),iDone=isItemDone(item),hasSubs=(item.subItems||[]).length>0;
                  const ic=iPct===100?"#22c55e":iPct>0?"#f59e0b":"#64748b";

                  return <div key={item.id} style={{borderTop:"1px solid #1e293b",background:iDone?"#0a1a0a":"transparent"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,padding:"8px 12px",flexWrap:"wrap"}}>
                      {!hasSubs&&ceZona&&<button className="tog" style={{background:iDone?"#22c55e":"#1e293b"}} onClick={()=>toggleItem(zona.id,item.id)}><div className="knob" style={{transform:iDone?"translateX(14px)":"translateX(0)"}}/></button>}
                      {!hasSubs&&!ceZona&&<div style={{width:32,height:18,borderRadius:9,background:iDone?"#22c55e33":"#1e293b",border:`1px solid ${iDone?"#22c55e55":"#334155"}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"0.6rem",color:iDone?"#22c55e":"#64748b"}}>{iDone?"✓":"○"}</span></div>}
                      {hasSubs&&<div style={{position:"relative",width:30,height:30,flexShrink:0}}>
                        <Ring pct={iPct} size={30} stroke={3} color={ic}/>
                        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"0.45rem",fontWeight:800,color:ic}}>{iPct}%</span></div>
                      </div>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:"0.87rem",fontWeight:600,color:iDone?"#4ade80":"#e2e8f0",textDecoration:iDone?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.nombre}</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:2}}>
                          {item.fechaFin&&<span style={{fontSize:"0.63rem",color:overdue?"#ef4444":warning?"#f59e0b":"#475569",display:"flex",alignItems:"center",gap:2}}>{overdue?"⚠":warning?"⏰":""}<Ico.Cal/>{item.fechaFin}</span>}
                          {(item.fotos||[]).length>0&&<span style={{fontSize:"0.63rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Photo/>{item.fotos.length}</span>}
                          {(item.materiales||[]).length>0&&<span style={{fontSize:"0.63rem",color:"#475569"}}>📦 {item.materiales.length}</span>}
                          {hasSubs&&<span style={{fontSize:"0.63rem",color:"#64748b",display:"flex",alignItems:"center",gap:2}}><Ico.List/>{(item.subItems||[]).filter(s=>s.terminado).length}/{(item.subItems||[]).length}</span>}
                        </div>
                      </div>
                      {!isMateriales&&<span className="badge" style={{background:"#1e293b",color:"#64748b",fontSize:"0.58rem"}}>W{item.peso||1}</span>}
                      {/* Sub-ítems toggle */}
                      {!isMateriales&&<button className="ic" title="Sub-ítems" onClick={()=>setExSubItems(p=>({...p,[item.id]:!p[item.id]}))} style={{color:hasSubs?"#a78bfa":"#64748b",borderColor:hasSubs?"#a78bfa44":"#334155"}}>
                        <Ico.List/>{hasSubs&&<span style={{fontSize:"0.65rem",fontWeight:700,marginLeft:1}}>{(item.subItems||[]).length}</span>}
                      </button>}
                      {ceZona&&<>
                        <button className="ic" onClick={()=>{setForm({nombre:item.nombre,descripcion:item.descripcion||"",peso:item.peso||1,notas:item.notas||"",fechaInicio:item.fechaInicio||"",fechaFin:item.fechaFin||""});setModal({type:"editItem",zId:zona.id,iId:item.id});}}><Ico.Edit/></button>
                        <button className="ic" onClick={()=>setExItems(p=>({...p,[item.id]:!p[item.id]}))}><Ico.Cam/></button>
                        <button className="ic danger" onClick={()=>delItem(zona.id,item.id)}><Ico.Trash/></button>
                      </>}
                      {/* Botón expandir materiales para rol materiales */}
                      {isMateriales&&<button className="ic" title="Materiales" onClick={()=>setExItems(p=>({...p,[item.id]:!p[item.id]}))} style={{color:"#a78bfa",borderColor:"#a78bfa44"}}><Ico.Mat/></button>}
                    </div>

                    {/* SUB-ÍTEMS */}
                    {sOpen&&!isMateriales&&<div style={{background:"#070f1e",borderTop:"1px solid #0d1a2e",padding:"8px 14px 10px 28px"}}>
                      <div style={{fontSize:"0.65rem",color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><Ico.List/> Sub-ítems</div>
                      {(item.subItems||[]).length===0&&<p style={{fontSize:"0.78rem",color:"#334155",margin:"0 0 8px"}}>Sin sub-ítems aún.</p>}
                      {(item.subItems||[]).map(si=><div key={si.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #0f1e30"}}>
                        {ceZona?<button className="sub-tog" style={{background:si.terminado?"#22c55e":"#1e293b"}} onClick={()=>toggleSubItem(zona.id,item.id,si.id)}><div className="sub-knob" style={{transform:si.terminado?"translateX(10px)":"translateX(0)"}}/></button>:<div style={{width:24,height:14,display:"flex",alignItems:"center",justifyContent:"center",color:si.terminado?"#22c55e":"#475569",fontSize:"0.8rem"}}>{si.terminado?"✓":"○"}</div>}
                        <span style={{flex:1,fontSize:"0.82rem",color:si.terminado?"#4ade80":"#94a3b8",textDecoration:si.terminado?"line-through":"none"}}>{si.nombre}</span>
                        {ceZona&&<button className="ic danger" style={{padding:"2px 5px"}} onClick={()=>delSubItem(zona.id,item.id,si.id)}><Ico.Trash/></button>}
                      </div>)}
                      {ceZona&&<div style={{display:"flex",gap:7,marginTop:10}}>
                        <input style={{...S.inp,fontSize:"0.8rem",padding:"7px 10px"}} placeholder="Nombre del sub-ítem…" value={form.subNombre||""} onChange={e=>setForm(p=>({...p,subNombre:e.target.value}))} onKeyDown={e=>{ if(e.key==="Enter") addSubItem(zona.id,item.id); }}/>
                        <button style={{...S.btnP,padding:"7px 12px",fontSize:"0.75rem",flexShrink:0}} onClick={()=>addSubItem(zona.id,item.id)}><Ico.Plus/></button>
                      </div>}
                    </div>}

                    {/* BOLETA + MATERIAL — visible para quien pueda editar materiales */}
                    {ceMat&&<div style={{padding:"6px 12px",borderTop:"1px solid #1e293b22",display:"flex",gap:6}}>
                      <button style={{...S.btnP,fontSize:"0.72rem",padding:"6px 12px",borderRadius:8,flex:1,justifyContent:"center"}} onClick={()=>setScanBoleta({zId:zona.id,iId:item.id})}>🧾 Escanear Boleta</button>
                      <button style={{...S.btnS,fontSize:"0.72rem",padding:"6px 12px",borderRadius:8}} onClick={()=>setModal({type:"addMat",zId:zona.id,iId:item.id})}>+ Material</button>
                    </div>}

                    {/* MATERIALES + FOTOS expandidos */}
                    {iOpen&&<>
                      {(item.materiales||[]).map(mat=><MatRow key={mat.id} mat={mat} canEdit={ceMat}
                        onEdit={()=>{setMatForm({...mat});setModal({type:"editMat",zId:zona.id,iId:item.id,mId:mat.id});}}
                        onDelete={()=>delMat(zona.id,item.id,mat.id)}
                        onStatus={s=>setMatStatus(zona.id,item.id,mat.id,s)}/>)}
                      {!isMateriales&&ceZona&&<div style={{padding:"10px 12px",background:"#06101e",borderTop:"1px solid #0f172a"}}>
                        <div style={{fontSize:"0.64rem",color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><Ico.Photo/> Fotos ({(item.fotos||[]).length})</div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {(item.fotos||[]).map(foto=><div key={foto.id} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid #1e293b",cursor:"pointer"}} onClick={()=>setModal({type:"viewPhoto",src:foto.data,fecha:foto.fecha,hora:foto.hora})}>
                            <img src={foto.data} alt="foto" style={{width:70,height:70,objectFit:"cover",display:"block"}}/>
                            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,.7)",padding:"2px 4px",fontSize:"0.5rem",color:"#94a3b8",textAlign:"center"}}>{foto.fecha}</div>
                            <button onClick={e=>{e.stopPropagation();delFoto(zona.id,item.id,foto.id);}} style={{position:"absolute",top:2,right:2,background:"rgba(239,68,68,.85)",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:"#fff",fontSize:"0.6rem",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800}}>×</button>
                          </div>)}
                          <button onClick={()=>setCameraFor({zId:zona.id,iId:item.id})} style={{width:70,height:70,border:"1px dashed #334155",borderRadius:8,background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:"#475569"}}>
                            <Ico.Cam/><span style={{fontSize:"0.55rem",fontWeight:700}}>Cámara</span>
                          </button>
                          <label style={{width:70,height:70,border:"1px dashed #334155",borderRadius:8,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:"#475569"}}>
                            <Ico.Photo/><span style={{fontSize:"0.55rem",fontWeight:700}}>Galería</span>
                            <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFilePhoto(zona.id,item.id,e)}/>
                          </label>
                        </div>
                      </div>}
                    </>}
                  </div>;
                })}
                {ceZona&&<div style={{padding:"8px 12px",borderTop:"1px solid #1e293b"}}>
                  <button style={{...S.btnS,fontSize:"0.72rem",padding:"5px 10px"}} onClick={()=>setModal({type:"addItem",zId:zona.id})}><Ico.Plus/> Agregar ítem</button>
                </div>}
              </div>}
            </div>;
          })}
        </div>}

        {tab==="personal"&&obra&&!isMateriales&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:"0.72rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:600}}>Personal · {obra.trabajadores.length}</span>
            <button style={S.btnP} onClick={()=>setModal({type:"addTrab"})}><Ico.Plus/> Trabajador</button>
          </div>
          {!obra.trabajadores.length&&<div style={{textAlign:"center",padding:"50px 20px",color:"#334155"}}><Ico.Hard/><p style={{marginTop:10}}>Sin trabajadores registrados</p></div>}
          {obra.trabajadores.map(t=>{ const zona=obra.zonas.find(z=>z.id===t.zonaId); return <div key={t.id} className="card" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px"}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:"#1e3a5f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>👷</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:"0.9rem",marginBottom:2}}>{t.nombre}</div>
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

    {modal?.type==="obras"&&<Modal title="Mis Obras" onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* Botón Nueva Obra siempre visible arriba */}
        {currentUser?.rol==="admin"&&<button style={{...S.btnP,justifyContent:"center",marginBottom:4}} onClick={()=>{closeModal();setModal({type:"newObra"});}}><Ico.Plus/> Nueva Obra</button>}
        {obras.length===0&&<div style={{textAlign:"center",padding:"30px 0",color:"#334155",fontSize:"0.85rem"}}>No hay obras aún. ¡Crea la primera!</div>}
        {obras.map(o=>{
          const aPct=()=>{ const all=o.zonas.flatMap(z=>z.items||[]); if(!all.length)return 0; const tw=all.reduce((s,i)=>s+(i.peso||1),0),dw=all.reduce((s,i)=>s+(i.peso||1)*(calcItemPct(i)/100),0); return Math.round((dw/tw)*100); };
          const p=aPct(),pc2=p<30?"#ef4444":p<70?"#f59e0b":"#22c55e";
          const allI=o.zonas.flatMap(z=>z.items||[]);
          const doneI=allI.filter(i=>i.terminado).length;
          const allM=allI.flatMap(i=>i.materiales||[]);
          const pendM=allM.filter(m=>!m.estado||m.estado==="pendiente").length;
          const isActive=o.id===activeId;
          return <div key={o.id} style={{background:isActive?"#0f1f36":"#0f172a",borderRadius:12,border:`2px solid ${isActive?"#f59e0b":"#1e293b"}`,overflow:"hidden",transition:"all .2s",cursor:"pointer"}}
            onClick={()=>{setActiveId(o.id);ss(ACTIVE_KEY,o.id);setTab("zonas");closeModal();}}>
            {/* Header tarjeta */}
            <div style={{padding:"13px 14px 10px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{position:"relative",flexShrink:0}}>
                <Ring pct={p} size={52} stroke={5} color={pc2}/>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:"0.7rem",fontWeight:800,color:pc2,lineHeight:1}}>{p}%</span>
                </div>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:"1rem",color:"#f1f5f9",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  {o.nombre}
                  {isActive&&<span style={{fontSize:"0.58rem",background:"#f59e0b",color:"#0f172a",borderRadius:4,padding:"1px 6px",fontWeight:800,letterSpacing:"0.05em"}}>ACTIVA</span>}
                </div>
                {o.descripcion&&<div style={{fontSize:"0.72rem",color:"#475569",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.descripcion}</div>}
                {(o.fechaInicio||o.fechaFin)&&<div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap"}}>
                  {o.fechaInicio&&<span style={{fontSize:"0.63rem",color:"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(o.fechaInicio)}</span>}
                  {o.fechaFin&&<span style={{fontSize:"0.63rem",color:daysDiff(o.fechaFin)<7?"#ef4444":"#475569",display:"flex",alignItems:"center",gap:2}}><Ico.Cal/>{fmtDate(o.fechaFin)}</span>}
                </div>}
              </div>
              <div style={{display:"flex",gap:5,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                {currentUser?.rol==="admin"&&<button className="ic danger" onClick={()=>deleteObra(o.id)}><Ico.Trash/></button>}
              </div>
            </div>
            {/* Stats mini */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",borderTop:"1px solid #1e293b"}}>
              {[
                ["Zonas",o.zonas.length,"#64748b"],
                ["Ítems",allI.length,"#64748b"],
                ["Listos",doneI,"#22c55e"],
                ["Mat. pend.",pendM,"#f59e0b"],
              ].map(([l,v,c])=><div key={l} style={{padding:"8px 6px",textAlign:"center",borderRight:"1px solid #1e293b"}}>
                <div style={{fontSize:"1rem",fontWeight:800,color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:"0.55rem",color:"#475569",marginTop:2,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>{l}</div>
              </div>)}
            </div>
            {/* Call to action */}
            <div style={{padding:"8px 14px",background:isActive?"#0a1628":"#080f1e",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:"0.68rem",color:"#475569"}}>Toca para ver zonas e ítems →</span>
              {o.trabajadores.length>0&&<span style={{fontSize:"0.65rem",color:"#64748b"}}>👷 {o.trabajadores.length} trabajador{o.trabajadores.length!==1?"es":""}</span>}
            </div>
          </div>;
        })}
      </div>
    </Modal>}

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

    {(modal?.type==="addZona"||modal?.type==="editZona")&&<Modal title={modal.type==="addZona"?"Nueva Zona":"Editar Zona"} onClose={closeModal}>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Descripción" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
        <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Peso (1–10)</label><input style={{...S.inp,width:80}} type="number" min="1" max="10" value={form.peso||1} onChange={e=>setForm(p=>({...p,peso:e.target.value}))}/></div>
        {modal.type==="addZona"&&<div style={{background:"#1e293b",borderRadius:8,padding:"10px 12px",fontSize:"0.78rem",color:"#64748b",display:"flex",gap:6,alignItems:"flex-start"}}><Ico.Shield/><span>Zona asignada a <strong style={{color:"#f59e0b"}}>{currentUser?.nombre}</strong>. Solo tú podrás editarla.</span></div>}
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addZona"?addZona:editZona}>{modal.type==="addZona"?"Crear":"Guardar"}</button></div>
      </div>
    </Modal>}

    {(modal?.type==="addItem"||modal?.type==="editItem")&&<Modal title={modal.type==="addItem"?"Nuevo Ítem":"Editar Ítem"} onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:9}}>
        <input style={S.inp} placeholder="Nombre *" value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))}/>
        <input style={S.inp} placeholder="Descripción" value={form.descripcion||""} onChange={e=>setForm(p=>({...p,descripcion:e.target.value}))}/>
        <textarea style={S.inp} placeholder="Notas / Observaciones" value={form.notas||""} onChange={e=>setForm(p=>({...p,notas:e.target.value}))}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha inicio</label><input style={S.inp} type="date" value={form.fechaInicio||""} onChange={e=>setForm(p=>({...p,fechaInicio:e.target.value}))}/></div>
          <div><label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:3}}>Fecha límite</label><input style={S.inp} type="date" value={form.fechaFin||""} onChange={e=>setForm(p=>({...p,fechaFin:e.target.value}))}/></div>
        </div>
        <div><label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:3}}>Peso (1–10)</label>
          <input style={{...S.inp,width:80}} type="number" min="1" max="10" value={form.peso||1} onChange={e=>setForm(p=>({...p,peso:e.target.value}))}/>
          <div style={{height:4,background:"#1e293b",borderRadius:2,overflow:"hidden",marginTop:5}}><div style={{height:"100%",width:`${((parseFloat(form.peso)||1)/10)*100}%`,background:"linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)",borderRadius:2,transition:"width .2s"}}/></div>
        </div>
        <div style={{display:"flex",gap:7,justifyContent:"flex-end"}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addItem"?()=>addItem(modal.zId):editItem}>{modal.type==="addItem"?"Agregar":"Guardar"}</button></div>
      </div>
    </Modal>}

    {(modal?.type==="addMat"||modal?.type==="editMat")&&<Modal title={modal.type==="addMat"?"Agregar Material":"Editar Material"} onClose={closeModal} wide>
      <MatForm mat={matForm} onChange={(k,v)=>setMatForm(p=>({...p,[k]:v}))}/>
      <div style={{display:"flex",gap:7,justifyContent:"flex-end",marginTop:12}}><button style={S.btnS} onClick={closeModal}>Cancelar</button><button style={S.btnP} onClick={modal.type==="addMat"?()=>addMat(modal.zId,modal.iId):editMat}>{modal.type==="addMat"?"Agregar":"Guardar"}</button></div>
    </Modal>}

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

    {modal?.type==="viewPhoto"&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.94)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={closeModal}>
      <div style={{position:"relative",maxWidth:"95vw",maxHeight:"90vh"}} onClick={e=>e.stopPropagation()}>
        <img src={modal.src} alt="Foto" style={{maxWidth:"100%",maxHeight:"82vh",borderRadius:12,display:"block"}}/>
        <div style={{textAlign:"center",fontSize:"0.73rem",color:"#64748b",marginTop:8}}>{modal.fecha} {modal.hora&&`· ${modal.hora}`}</div>
        <button onClick={closeModal} style={{position:"absolute",top:-10,right:-10,background:"#ef4444",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",color:"#fff",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
    </div>}

    {modal?.type==="settings"&&<Modal title="Configuración" onClose={closeModal} wide>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {obra&&<div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Obra Activa</label>
          <input style={{...S.inp,marginBottom:7}} placeholder="Nombre" value={obra.nombre||""} onChange={e=>updObra(o=>({...o,nombre:e.target.value}))}/>
          <input style={{...S.inp,marginBottom:7}} placeholder="Descripción" value={obra.descripcion||""} onChange={e=>updObra(o=>({...o,descripcion:e.target.value}))}/>
          <textarea style={S.inp} placeholder="Notas generales" value={obra.notas||""} onChange={e=>updObra(o=>({...o,notas:e.target.value}))}/>
        </div>}

        {/* Usuarios del sistema */}
        <div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"flex",alignItems:"center",gap:4,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}><Ico.Users/> Usuarios registrados</label>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
            {users.map(u=>{ const rm2=ROLE_META[u.rol]||ROLE_META.colaborador; return <div key={u.id} style={{background:"#1e293b",borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:(u.color||"#f59e0b")+"22",border:`1.5px solid ${u.color||"#f59e0b"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.8rem",fontWeight:800,color:u.color||"#f59e0b",flexShrink:0}}>{u.nombre[0].toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:"0.85rem",fontWeight:600,color:"#f1f5f9"}}>{u.nombre} {u.id===currentUser?.id&&<span style={{fontSize:"0.6rem",color:"#f59e0b"}}>(tú)</span>}</div>
                <div style={{fontSize:"0.65rem",color:"#64748b"}}>{rm2.icon} {rm2.label}</div>
              </div>
              {u.id!==currentUser?.id&&currentUser?.rol==="admin"&&<button className="ic danger" style={{padding:"3px 6px"}} onClick={()=>{ if(window.confirm(`¿Eliminar a ${u.nombre}?`)){ const next=users.filter(x=>x.id!==u.id); setUsers(next); ss(USERS_KEY,next); } }}><Ico.Trash/></button>}
            </div>; })}
          </div>

          {/* Agregar nuevo usuario */}
          {currentUser?.rol==="admin"&&<div style={{background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:10,padding:"14px"}}>
            <div style={{fontSize:"0.72rem",color:"#38bdf8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:10,display:"flex",alignItems:"center",gap:5}}><Ico.Plus/> Agregar usuario</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <input style={S.inp} placeholder="Nombre completo *" value={form.nuNombre||""} onChange={e=>setForm(p=>({...p,nuNombre:e.target.value}))}/>
              <div>
                <label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:5}}>Rol</label>
                <div style={{display:"flex",gap:6}}>
                  {[["colaborador","🔧 Colaborador"],["materiales","📦 Enc. Materiales"]].map(([v,l])=><button key={v} onClick={()=>setForm(p=>({...p,nuRol:v}))} style={{flex:1,background:(form.nuRol||"materiales")===v?"#1e293b":"#0f172a",border:`2px solid ${(form.nuRol||"materiales")===v?"#f59e0b":"#1e293b"}`,borderRadius:8,padding:"7px 6px",cursor:"pointer",color:"#f1f5f9",fontSize:"0.72rem",fontWeight:700,transition:"all .2s"}}>{l}</button>)}
                </div>
              </div>
              <div>
                <label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:5}}>PIN (5 dígitos)</label>
                <div style={{display:"flex",gap:6}}>
                  {[0,1,2,3,4].map(i=><input key={i} type="password" inputMode="numeric" maxLength={1} value={(form.nuPin||"")[i]||""} onChange={e=>{ if(!/^\d?$/.test(e.target.value))return; const arr=(form.nuPin||"     ").split(""); arr[i]=e.target.value; setForm(p=>({...p,nuPin:arr.join("")})); }} style={{width:42,height:50,textAlign:"center",fontSize:"1.4rem",fontWeight:800,background:"#1e293b",border:`2px solid ${(form.nuPin||"")[i]?"#f59e0b":"#334155"}`,borderRadius:9,color:"#f1f5f9",outline:"none"}}/>)}
                </div>
              </div>
              <div>
                <label style={{fontSize:"0.72rem",color:"#64748b",display:"block",marginBottom:5}}>Confirmar PIN</label>
                <div style={{display:"flex",gap:6}}>
                  {[0,1,2,3,4].map(i=><input key={i} type="password" inputMode="numeric" maxLength={1} value={(form.nuPin2||"")[i]||""} onChange={e=>{ if(!/^\d?$/.test(e.target.value))return; const arr=(form.nuPin2||"     ").split(""); arr[i]=e.target.value; setForm(p=>({...p,nuPin2:arr.join("")})); }} style={{width:42,height:50,textAlign:"center",fontSize:"1.4rem",fontWeight:800,background:"#1e293b",border:`2px solid ${(form.nuPin2||"")[i]?"#22c55e":"#334155"}`,borderRadius:9,color:"#f1f5f9",outline:"none"}}/>)}
                </div>
              </div>
              <button style={{...S.btnG2,justifyContent:"center"}} onClick={addUserFromSettings}><Ico.User/> Crear usuario</button>
            </div>
          </div>}
        </div>

        <div>
          <label style={{fontSize:"0.72rem",color:"#94a3b8",display:"block",marginBottom:7,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Datos</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button style={S.btnG} onClick={doExportJSON}><Ico.Down/> Exportar JSON</button>
            <label style={{...S.btnG,cursor:"pointer"}}><Ico.Up/> Importar JSON<input type="file" accept=".json" style={{display:"none"}} onChange={doImportJSON}/></label>
          </div>
        </div>
        {currentUser?.rol==="admin"&&<div style={{borderTop:"1px solid #1e293b",paddingTop:12}}>
          <button style={S.btnD} onClick={()=>{if(window.confirm("¿Resetear TODOS los datos?")){ const fresh=[emptyObra("Mi Obra")]; setObras(fresh); setActiveId(fresh[0].id); ss(ACTIVE_KEY,fresh[0].id); closeModal(); }}}>🗑️ Resetear todo</button>
        </div>}
      </div>
    </Modal>}

    {modal?.type==="toast"&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1e293b",border:`1px solid ${modal.toastType==="err"?"#ef444444":"#334155"}`,borderRadius:12,padding:"10px 20px",fontSize:"0.85rem",color:"#f1f5f9",zIndex:2000,boxShadow:"0 8px 30px rgba(0,0,0,.5)",animation:"fadeUp .25s ease",whiteSpace:"nowrap",maxWidth:"90vw"}}>{modal.msg}</div>}
    {exporting&&<div style={{position:"fixed",bottom:24,right:16,background:"#1e293b",border:"1px solid #f59e0b44",borderRadius:12,padding:"9px 16px",fontSize:"0.8rem",color:"#f59e0b",zIndex:2000,display:"flex",alignItems:"center",gap:7}}><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> Generando PDF…</div>}
    {cameraFor&&<CameraModal onCapture={data=>addFoto(cameraFor.zId,cameraFor.iId,data)} onClose={()=>setCameraFor(null)}/>}
    {scanBoleta&&<ScanBoletaModal onDatos={datos=>handleBoletaDatos(datos,scanBoleta.zId,scanBoleta.iId)} onClose={()=>setScanBoleta(null)}/>}
  </>;
}




