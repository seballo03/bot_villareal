// server.js — Servidor principal: WhatsApp bot con Baileys + Express
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  makeInMemoryStore,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const express = require("express");
const qrcode  = require("qrcode");
const pino    = require("pino");
const path    = require("path");
const fs      = require("fs");
const { handleMessage } = require("./flow");
const { PORT } = require("./config");

// ─── Express app (para ver QR y health check) ───
const app = express();
app.use(express.json());

let currentQR = null;
let botReady  = false;

app.get("/", (req, res) => {
  if (botReady) {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>✅ Bot de Crédito Villarreal Activo</h2>
      <p>El bot está conectado y recibiendo mensajes de WhatsApp.</p>
    </body></html>`);
  }
  if (currentQR) {
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:20px">
      <h2>📱 Escanea el código QR con WhatsApp</h2>
      <p>Abre WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>
      <img src="/qr" style="width:300px;height:300px;border:2px solid #075E54;border-radius:12px"/>
      <p style="color:#888;font-size:14px">La página se actualiza automáticamente</p>
      <script>setTimeout(()=>location.reload(), 10000)</script>
    </body></html>`);
  } else {
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>⏳ Iniciando bot...</h2>
      <script>setTimeout(()=>location.reload(), 3000)</script>
    </body></html>`);
  }
});

app.get("/qr", async (req, res) => {
  if (!currentQR) return res.status(404).send("Sin QR disponible");
  try {
    const img = await qrcode.toBuffer(currentQR, { width: 300 });
    res.set("Content-Type", "image/png");
    res.send(img);
  } catch(e) { res.status(500).send("Error generando QR"); }
});

app.get("/health", (req, res) => res.json({ status: botReady ? "connected" : "waiting_qr", timestamp: new Date() }));

// Serve ver.html for expediente viewing
app.get("/ver", (req, res) => {
  res.sendFile(path.join(__dirname, "ver.html"));
});

// Proxy get-app requests to JSONBin
app.get("/get-app", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Falta ID" });
  const key = process.env.JSONBIN_KEY;
  if (!key) return res.status(500).json({ error: "Sin JSONBIN_KEY" });
  try {
    const fetch = require("node-fetch");
    const r = await fetch(`https://api.jsonbin.io/v3/b/${id}/latest`, {
      headers: { "X-Master-Key": key }
    });
    if (!r.ok) return res.status(404).json({ error: "No encontrada" });
    const data = await r.json();
    res.json(data.record || data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Proxy get-doc requests to JSONBin
app.get("/get-doc", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send("Falta ID");
  const key = process.env.JSONBIN_KEY;
  if (!key) return res.status(500).send("Sin JSONBIN_KEY");
  try {
    const fetch = require("node-fetch");
    const r = await fetch(`https://api.jsonbin.io/v3/b/${id}/latest`, {
      headers: { "X-Master-Key": key }
    });
    if (!r.ok) return res.status(404).send("No encontrado");
    const data = await r.json();
    const { base64, mediaType } = data.record || data;
    if (!base64) return res.status(404).send("Sin datos");
    const buf = Buffer.from(base64, "base64");
    res.set("Content-Type", mediaType || "image/jpeg");
    res.set("Cache-Control", "public, max-age=2592000");
    res.send(buf);
  } catch(e) { res.status(500).send(e.message); }
});

// ─── Baileys WhatsApp Bot ───
async function startBot() {
  const authDir = path.join(__dirname, "auth_info_baileys");
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: "silent" });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: ["Credito Villarreal Bot", "Chrome", "1.0.0"],
  });

  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);

  // Connection updates
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      botReady  = false;
      console.log("📱 QR generado — visita http://localhost:" + PORT + " para escanearlo");
    }

    if (connection === "open") {
      currentQR = null;
      botReady  = true;
      console.log("✅ Bot conectado a WhatsApp exitosamente");
    }

    if (connection === "close") {
      botReady = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("🔄 Conexión cerrada. Reconectando:", shouldReconnect);
      if (shouldReconnect) {
        setTimeout(startBot, 5000);
      } else {
        console.log("❌ Sesión cerrada. Borra la carpeta auth_info_baileys y reinicia.");
        // Clear auth to force new QR
        try { fs.rmSync(authDir, { recursive: true }); } catch(e) {}
        setTimeout(startBot, 3000);
      }
    }
  });

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe)        continue; // ignore own messages
      if (!msg.message)          continue;
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // ignore groups

      const phone = msg.key.remoteJid;
      const msgType = Object.keys(msg.message)[0];

      console.log(`📨 Mensaje de ${phone} — tipo: ${msgType}`);

      // Extract text
      let text = "";
      if (msgType === "conversation")           text = msg.message.conversation;
      else if (msgType === "extendedTextMessage") text = msg.message.extendedTextMessage?.text;
      else if (msgType === "buttonsResponseMessage") text = msg.message.buttonsResponseMessage?.selectedDisplayText;

      // Extract media
      let mediaBuffer = null;
      let mediaType   = null;
      const isImage    = msgType === "imageMessage";
      const isDocument = msgType === "documentMessage";
      const isVideo    = msgType === "videoMessage";

      if (isImage || isDocument) {
        try {
          console.log(`📎 Descargando ${msgType}...`);
          const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
          if (buffer) {
            mediaBuffer = buffer;
            if (isImage)    mediaType = msg.message.imageMessage?.mimetype || "image/jpeg";
            if (isDocument) mediaType = msg.message.documentMessage?.mimetype || "application/pdf";
          }
        } catch(e) {
          console.error("Error descargando media:", e.message);
          await sendMessage(sock, phone, "⚠️ No pude recibir el archivo. Intenta enviarlo de nuevo.");
          continue;
        }
      }

      // Process message
      try {
        const responses = await handleMessage(phone, text, mediaBuffer, mediaType);
        for (const response of responses) {
          await sendMessage(sock, phone, response);
          await sleep(500); // small delay between messages
        }
      } catch(e) {
        console.error("Error procesando mensaje:", e.message, e.stack);
        await sendMessage(sock, phone, "❌ Ocurrió un error. Escribe *inicio* para comenzar de nuevo.");
      }
    }
  });

  return sock;
}

async function sendMessage(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text });
  } catch(e) {
    console.error("Error enviando mensaje:", e.message);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Keep-alive for Render free tier ───
const KEEP_ALIVE_URL = process.env.SITE_URL;
if (KEEP_ALIVE_URL) {
  setInterval(async () => {
    try {
      const fetch = require("node-fetch");
      await fetch(KEEP_ALIVE_URL + "/health");
    } catch(e) {}
  }, 14 * 60 * 1000); // ping every 14 minutes
}

// ─── Start ───
app.listen(PORT, () => {
  console.log(`🌐 Servidor web en puerto ${PORT}`);
  console.log(`📱 Visita http://localhost:${PORT} para escanear el QR`);
});

startBot().catch(err => {
  console.error("Error iniciando bot:", err);
  setTimeout(startBot, 5000);
});
