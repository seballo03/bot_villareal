// storage.js — Guardado de expedientes y historial en JSONBin
const fetch = require("node-fetch");
const crypto = require("crypto");
const { JSONBIN_KEY, HISTORY_BIN, SITE_URL } = require("./config");

const JB = "https://api.jsonbin.io/v3/b";

async function jbCreate(name, data) {
  const r = await fetch(JB, {
    method: "POST",
    headers: { "Content-Type":"application/json","X-Master-Key":JSONBIN_KEY,"X-Bin-Name":name,"X-Bin-Private":"false" },
    body: JSON.stringify(data)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`JSONBin ${r.status}: ${txt.slice(0,200)}`);
  return JSON.parse(txt).metadata?.id;
}

async function jbUpdate(id, data) {
  await fetch(`${JB}/${id}`, {
    method: "PUT",
    headers: { "Content-Type":"application/json","X-Master-Key":JSONBIN_KEY },
    body: JSON.stringify(data)
  });
}

async function jbGet(id) {
  const r = await fetch(`${JB}/${id}/latest`, { headers: { "X-Master-Key":JSONBIN_KEY } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.record || d;
}

async function saveExpediente(appData, store, creditScore, docs) {
  const id = crypto.randomBytes(4).toString("hex").toUpperCase();

  // Save docs separately (each as its own bin)
  const savedDocs = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const entry = { type: doc.type, name: doc.name, mediaType: doc.mediaType, binId: null };
    if (doc.base64 && doc.base64.length < 700000) {
      try {
        const binId = await jbCreate(`doc-${id}-${i}`, { base64: doc.base64, mediaType: doc.mediaType, name: doc.name, docType: doc.type });
        entry.binId = binId;
      } catch(e) { console.log(`Doc ${i} failed:`, e.message); }
    }
    savedDocs.push(entry);
  }

  // Save main expediente
  const payload = { appData, store, creditScore, savedAt: new Date().toISOString(), docs: savedDocs };
  const mainBinId = await jbCreate(`sol-${id}`, payload);

  // Update customer history
  if (HISTORY_BIN) {
    try {
      const hist = await jbGet(HISTORY_BIN) || { clientes: [] };
      hist.clientes = hist.clientes || [];
      hist.clientes.push({
        nombre: appData.name || `${appData.nombres||""} ${appData.apellido_paterno||""}`.trim(),
        curp: appData.curp || null,
        telefono: appData.phone || null,
        fecha: new Date().toISOString(),
        expedienteId: mainBinId
      });
      await jbUpdate(HISTORY_BIN, hist);
    } catch(e) { console.log("History update failed:", e.message); }
  }

  return { id: mainBinId, url: `${SITE_URL}/ver?id=${mainBinId}` };
}

async function searchClient({ curp, telefono, nombre }) {
  if (!HISTORY_BIN || !JSONBIN_KEY) return null;
  try {
    const hist = await jbGet(HISTORY_BIN);
    if (!hist) return null;
    const clientes = hist.clientes || [];
    let match = null;
    if (curp) match = clientes.find(c => c.curp && c.curp.toUpperCase() === curp.toUpperCase());
    if (!match && telefono) match = clientes.find(c => c.telefono && c.telefono.replace(/\D/g,"") === telefono.replace(/\D/g,""));
    if (!match && nombre && nombre.length > 3) match = clientes.find(c => c.nombre && c.nombre.toLowerCase().includes(nombre.toLowerCase()));
    return match || null;
  } catch(e) { return null; }
}

module.exports = { saveExpediente, searchClient };
