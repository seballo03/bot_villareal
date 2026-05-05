// storage.js — Guardado de expedientes en JSONBin con soporte para archivos grandes
const fetch = require("node-fetch");
const crypto = require("crypto");
const { JSONBIN_KEY, HISTORY_BIN, SITE_URL } = require("./config");

const JB = "https://api.jsonbin.io/v3/b";
const CHUNK_SIZE = 700000; // 700KB por chunk (JSONBin free = 1MB max)

async function jbCreate(name, data) {
  const body = JSON.stringify(data);
  const r = await fetch(JB, {
    method: "POST",
    headers: { "Content-Type":"application/json","X-Master-Key":JSONBIN_KEY,"X-Bin-Name":name,"X-Bin-Private":"false" },
    body
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`JSONBin ${r.status}: ${txt.slice(0,200)}`);
  return JSON.parse(txt).metadata?.id;
}

async function jbUpdate(id, data) {
  const r = await fetch(`${JB}/${id}`, {
    method: "PUT",
    headers: { "Content-Type":"application/json","X-Master-Key":JSONBIN_KEY },
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error(`JSONBin update ${r.status}`);
}

async function jbGet(id) {
  const r = await fetch(`${JB}/${id}/latest`, { headers:{ "X-Master-Key":JSONBIN_KEY } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.record || d;
}

// Split base64 string into chunks and save each to JSONBin
async function saveDocChunked(prefix, base64, mediaType, name, docType) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
    chunks.push(base64.slice(i, i + CHUNK_SIZE));
  }
  console.log(`Saving doc ${docType} in ${chunks.length} chunk(s), total ${base64.length} bytes`);

  const chunkIds = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkId = await jbCreate(`${prefix}-c${i}`, { chunk: chunks[i], index: i, total: chunks.length });
    chunkIds.push(chunkId);
    await new Promise(r => setTimeout(r, 300)); // rate limit protection
  }

  // Save index bin with metadata and chunk references
  const indexId = await jbCreate(`${prefix}-idx`, {
    mediaType, name, docType,
    chunks: chunkIds,
    totalChunks: chunks.length
  });
  return indexId;
}

async function saveExpediente(appData, store, creditScore, docs) {
  const id = crypto.randomBytes(4).toString("hex").toUpperCase();

  // Save each doc (chunked if needed)
  const savedDocs = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const entry = { type:doc.type, name:doc.name, mediaType:doc.mediaType, binId:null, chunked:false };
    if (!doc.base64) { savedDocs.push(entry); continue; }

    try {
      if (doc.base64.length <= CHUNK_SIZE) {
        // Small enough — save in single bin
        const binId = await jbCreate(`doc-${id}-${i}`, {
          base64:doc.base64, mediaType:doc.mediaType, name:doc.name, docType:doc.type
        });
        entry.binId = binId;
        console.log(`Doc ${doc.type} saved single bin: ${binId}`);
      } else {
        // Too large — split into chunks
        const indexId = await saveDocChunked(`doc-${id}-${i}`, doc.base64, doc.mediaType, doc.name, doc.type);
        entry.binId = indexId;
        entry.chunked = true;
        console.log(`Doc ${doc.type} saved chunked, index: ${indexId}`);
      }
    } catch(e) {
      console.log(`Doc ${i} (${doc.type}) failed:`, e.message);
    }
    savedDocs.push(entry);
    await new Promise(r => setTimeout(r, 300));
  }

  // Save main expediente
  const payload = { appData, store, creditScore, savedAt:new Date().toISOString(), docs:savedDocs };
  const mainBinId = await jbCreate(`sol-${id}`, payload);

  // Update history
  if (HISTORY_BIN) {
    try {
      const hist = await jbGet(HISTORY_BIN) || { clientes:[] };
      hist.clientes = hist.clientes || [];
      hist.clientes.push({
        nombre: appData.name || `${appData.nombres||""} ${appData.apellido_paterno||""}`.trim(),
        curp: appData.curp || null,
        telefono: appData.phone || null,
        fecha: new Date().toISOString(),
        expedienteId: mainBinId
      });
      await jbUpdate(HISTORY_BIN, hist);
    } catch(e) { console.log("History failed:", e.message); }
  }

  return { id:mainBinId, url:`${SITE_URL}/ver?id=${mainBinId}` };
}

// Reassemble chunked document
async function getDocById(binId) {
  const data = await jbGet(binId);
  if (!data) return null;

  // If chunked (has chunks array), reassemble
  if (data.chunks && Array.isArray(data.chunks)) {
    console.log(`Reassembling ${data.chunks.length} chunks for ${data.docType}`);
    let base64 = "";
    for (const chunkId of data.chunks) {
      const chunk = await jbGet(chunkId);
      if (chunk?.chunk) base64 += chunk.chunk;
    }
    return { base64, mediaType:data.mediaType, name:data.name };
  }

  // Single bin
  return { base64:data.base64, mediaType:data.mediaType, name:data.name };
}

async function searchClient({ curp, telefono, nombre }) {
  if (!HISTORY_BIN || !JSONBIN_KEY) return null;
  try {
    const hist = await jbGet(HISTORY_BIN);
    if (!hist) return null;
    const clientes = hist.clientes || [];
    let match = null;
    if (curp)    match = clientes.find(c => c.curp && c.curp.toUpperCase()===curp.toUpperCase());
    if (!match && telefono) match = clientes.find(c => c.telefono && c.telefono.replace(/\D/g,"")=== telefono.replace(/\D/g,""));
    if (!match && nombre && nombre.length>3) match = clientes.find(c => c.nombre && c.nombre.toLowerCase().includes(nombre.toLowerCase()));
    return match || null;
  } catch(e) { return null; }
}

module.exports = { saveExpediente, searchClient, getDocById };
