require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const { PHONE_NUMBER_ID, ACCESS_TOKEN, VERIFY_TOKEN, PORT = 3000 } = process.env;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
const HEADERS = { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" };

// ─────────────────────────────────────────────
// TIENDAS REALES
// ─────────────────────────────────────────────
const TIENDAS = [
  { id: "1",  nombre: "Puerta del Sol",     tel: "528136088992", maps: "https://maps.app.goo.gl/QigBVwucAhG2cHhp6" },
  { id: "2",  nombre: "Raúl Salinas",       tel: "528124259322", maps: "https://maps.app.goo.gl/8ok1Uj2qq9EERUev7" },
  { id: "3",  nombre: "Sendero Escobedo",   tel: "528124368937", maps: "https://maps.app.goo.gl/vLWB1PdFzREx7YCW8" },
  { id: "4",  nombre: "Anáhuac Plaza Bella",tel: "528115380037", maps: "https://maps.app.goo.gl/53w7muPugC9mD6u27" },
  { id: "5",  nombre: "Smart",              tel: "526462759725", maps: "https://maps.app.goo.gl/bPPj6RytfBzhzHnn8" },
  { id: "6",  nombre: "Santo Domingo",      tel: "528127590860", maps: "https://maps.app.goo.gl/t7P7VS2zwHoFit3dA" },
  { id: "7",  nombre: "Soriana Fresnos",    tel: "528115352945", maps: "https://maps.app.goo.gl/WDqsuSBjY9HekBeT6" },
  { id: "8",  nombre: "Metroplex",          tel: "528123409292", maps: "https://maps.app.goo.gl/vauE1SqH3WNkAHHq9" },
  { id: "9",  nombre: "Sendero Apodaca",    tel: "528128732583", maps: "https://maps.app.goo.gl/WybhBfGYxsMiDCZu8" },
  { id: "10", nombre: "Santa Rosa",         tel: "528131401108", maps: "https://maps.app.goo.gl/gpH7yxu8e8s6jiNAA" },
];

// ─────────────────────────────────────────────
// SESIONES EN MEMORIA
// ─────────────────────────────────────────────
const sessions = {};
function getSession(phone) {
  if (!sessions[phone]) sessions[phone] = { step: "inicio", data: {} };
  return sessions[phone];
}
function resetSession(phone) {
  sessions[phone] = { step: "menu_principal", data: {} };
}

// ─────────────────────────────────────────────
// FUNCIONES DE ENVÍO
// ─────────────────────────────────────────────
async function sendText(to, text) {
  await axios.post(API_URL, {
    messaging_product: "whatsapp", to, type: "text", text: { body: text },
  }, { headers: HEADERS });
}

async function sendButtons(to, body, buttons) {
  await axios.post(API_URL, {
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "button", body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply", reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    },
  }, { headers: HEADERS });
}

async function sendList(to, header, body, buttonText, sections) {
  await axios.post(API_URL, {
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: header },
      body: { text: body },
      action: { button: buttonText, sections },
    },
  }, { headers: HEADERS });
}

// ─────────────────────────────────────────────
// NOTIFICACIÓN AL JEFE DE TIENDA
// ─────────────────────────────────────────────
async function notificarJefeTienda(tienda, data, folio) {
  const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Monterrey" });
  const esNuevo = data.tipo_cliente === "NUEVO";
  const tipoTexto = esNuevo ? "🆕 CLIENTE NUEVO" : "⭐ CLIENTE PREFERENTE";

  const docsNuevo = esNuevo
    ? `• INE/Identificación: ✅\n• Comprobante de ingresos: ✅\n• Comprobante de propiedad: ${data.propiedad === "Casa familiar" ? "Casa familiar" : "✅"}\n• Referencias familiares: ✅\n• Selfie con ID: ✅`
    : `• Identificación oficial: ✅`;

  const mensaje =
    `🔔 *NUEVA SOLICITUD DE CRÉDITO*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Folio:* ${folio}\n` +
    `📅 *Fecha:* ${fecha}\n` +
    `🏪 *Sucursal:* ${tienda.nombre}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *DATOS DEL CLIENTE*\n` +
    `• Nombre: ${data.nombre}\n` +
    `• Teléfono: ${data.telefono}\n` +
    `• Correo: ${data.correo || "No proporcionado"}\n` +
    `• Tipo: ${tipoTexto}\n` +
    (esNuevo ? `• Estado civil: ${data.estado_civil || "No especificado"}\n` : "") +
    (data.referencias ? `• Referencias: ${data.referencias}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📁 *DOCUMENTOS RECIBIDOS*\n${docsNuevo}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 *ACCIÓN REQUERIDA:*\n` +
    `Contactar al cliente y capturar en sistema.\n\n` +
    `📞 WhatsApp del cliente:\n` +
    `wa.me/${data.whatsapp_origen}`;

  await sendText(tienda.tel, mensaje);
}

// ─────────────────────────────────────────────
// MENÚS
// ─────────────────────────────────────────────
async function sendMenuPrincipal(to) {
  await sendButtons(to,
    `🏪 *Bienvenido a Villarreal* 👋\n\n` +
    `Soy tu asesor virtual 24/7 de *Grupo ROGA*.\n` +
    `¿En qué te puedo ayudar hoy?`,
    [
      { id: "SOLICITUD", title: "📋 Solicitar crédito" },
      { id: "CATALOGO",  title: "🛍️ Ver catálogo" },
      { id: "FAQ",       title: "❓ Preguntas frecuentes" },
    ]
  );
}

async function sendMenuTipoCliente(to) {
  await sendButtons(to,
    `¿Ya eres cliente con historial en Villarreal o eres nuevo?`,
    [
      { id: "PREFERENTE", title: "⭐ Ya soy cliente" },
      { id: "NUEVO",      title: "🆕 Soy cliente nuevo" },
    ]
  );
}

async function sendSeleccionTienda(to) {
  await sendList(to,
    "📍 Selecciona tu tienda",
    "Elige la sucursal Villarreal más cercana a ti:",
    "Ver sucursales",
    [{
      title: "Sucursales Villarreal",
      rows: TIENDAS.map((t) => ({
        id: `TIENDA_${t.id}`,
        title: t.nombre,
        description: "Toca para seleccionar",
      })),
    }]
  );
}

// ─────────────────────────────────────────────
// CATÁLOGO
// ─────────────────────────────────────────────
async function sendMenuCatalogo(to) {
  await sendList(to,
    "🛍️ Catálogo Villarreal",
    "Selecciona una categoría:",
    "Ver categorías",
    [{
      title: "Categorías disponibles",
      rows: [
        { id: "CAT_CLIMAS",   title: "❄️ Climas",          description: "Minisplit, portátil" },
        { id: "CAT_MUEBLES",  title: "🛋️ Muebles",         description: "Sala, comedor, recámara" },
        { id: "CAT_LINEA",    title: "🍽️ Línea Blanca",    description: "Refrigerador, lavadora" },
        { id: "CAT_ELECTRO",  title: "📺 Electrónica",     description: "Pantallas, laptops, cel" },
        { id: "CAT_RECAMARA", title: "🛏️ Recámaras",       description: "Camas, colchones" },
        { id: "CAT_MOTO",     title: "🏍️ Motocicletas",    description: "Enganche desde $1,500" },
      ],
    }]
  );
}

const CATALOGOS = {
  CAT_CLIMAS:   "❄️ *Climas Villarreal*\n\n• Minisplit 1 ton — desde $8,999\n• Minisplit 1.5 ton — desde $10,499\n• Minisplit 2 ton — desde $13,999\n• Portátil — desde $6,500\n\n_Sin enganche para clientes preferentes_",
  CAT_MUEBLES:  "🛋️ *Muebles Villarreal*\n\n• Sala 3 piezas — desde $12,999\n• Comedor 6 personas — desde $8,499\n• Recámara completa — desde $18,999\n• Buró individual — desde $1,999",
  CAT_LINEA:    "🍽️ *Línea Blanca Villarreal*\n\n• Refrigerador 14 pies — desde $11,999\n• Lavadora automática — desde $8,299\n• Estufa 4 quemadores — desde $5,499\n• Microondas — desde $2,999",
  CAT_ELECTRO:  "📺 *Electrónica Villarreal*\n\n• Pantallas Smart TV — desde $4,999\n  _(Enganche promocional: solo $50)_\n• Laptops — desde $8,999\n  _(Enganche promocional: solo $50)_\n• Celulares — 7% o $600 de enganche\n• Equipos de sonido — desde $3,499",
  CAT_RECAMARA: "🛏️ *Recámaras Villarreal*\n\n• Set recámara matrimonial — desde $18,999\n• Colchón matrimonial — desde $5,999\n• Cama individual — desde $3,499\n• Literas — desde $6,999",
  CAT_MOTO:     "🏍️ *Motocicletas Villarreal*\n\n• Enganche efectivo: $1,500 a $3,500\n  _(depende del precio de la moto)_\n• Se evalúa historial de pago\n• Modelos sujetos a disponibilidad",
};

// ─────────────────────────────────────────────
// FAQ — BASADO EN GUÍAS REALES GRUPO ROGA
// ─────────────────────────────────────────────
async function sendFAQ(to) {
  await sendList(to,
    "❓ Preguntas frecuentes",
    "Selecciona tu pregunta:",
    "Ver preguntas",
    [
      {
        title: "Requisitos",
        rows: [
          { id: "FAQ_REQ_NUEVO", title: "Req. cliente nuevo",     description: "¿Qué necesito para aplicar?" },
          { id: "FAQ_REQ_PREF",  title: "Req. cliente preferente",description: "Ya soy cliente, ¿qué necesito?" },
          { id: "FAQ_EDAD",      title: "Edades aceptadas",        description: "¿Qué edad necesito?" },
          { id: "FAQ_INGRESOS",  title: "Ingresos mínimos",        description: "¿Cuánto debo ganar?" },
          { id: "FAQ_AVAL",      title: "¿Cuándo necesito aval?",  description: "Requisitos del aval" },
        ],
      },
      {
        title: "Proceso y pagos",
        rows: [
          { id: "FAQ_TIEMPO",    title: "¿Cuánto tarda?",          description: "Tiempos de aprobación" },
          { id: "FAQ_ENGANCHE",  title: "¿Hay enganche?",           description: "Enganches por producto" },
          { id: "FAQ_PAGO",      title: "¿Cómo pago?",             description: "Formas de pago" },
          { id: "FAQ_LIMITE",    title: "¿Cuál es mi límite?",      description: "Cómo se calcula el crédito" },
          { id: "FAQ_REZAGO",    title: "Tengo rezago, ¿puedo?",    description: "Política de cuentas atrasadas" },
        ],
      },
    ]
  );
}

const FAQ_RESPUESTAS = {
  FAQ_REQ_NUEVO:
    `🆕 *Requisitos — Cliente Nuevo*\n\n` +
    `1️⃣ Identificación oficial (INE, pasaporte o cédula)\n` +
    `2️⃣ Preferentemente mujer (hombres solteros/viudos/divorciados con aval mujer)\n` +
    `3️⃣ Edad 23 a 69 años\n` +
    `4️⃣ Teléfono propio\n` +
    `5️⃣ Ingresos familiares mínimos $4,000/mes\n` +
    `6️⃣ Estabilidad laboral mínima 1 año\n` +
    `7️⃣ Comprobar propiedad y habitarla\n` +
    `8️⃣ 2 referencias familiares\n\n` +
    `_Documentos: nómina, estado de cuenta (3 meses), comprobante de propiedad_`,

  FAQ_REQ_PREF:
    `⭐ *Requisitos — Cliente Preferente*\n\n` +
    `1️⃣ Identificación oficial vigente\n` +
    `2️⃣ Teléfono propio\n` +
    `3️⃣ Edad 18 a 80 años\n` +
    `4️⃣ Sin rezago en cuentas activas\n` +
    `5️⃣ Comprobante de ingresos (solo si cambió de trabajo)\n` +
    `6️⃣ Comprobante de domicilio (solo si cambió de dirección)\n\n` +
    `_Clientes AAA y AA tienen condiciones especiales mejoradas_ 🏆`,

  FAQ_EDAD:
    `👤 *Edades aceptadas*\n\n` +
    `*Cliente Nuevo:*\n` +
    `• 23 a 69 años → sin aval\n` +
    `• 18 a 22 años → necesitas aval\n` +
    `• 70 a 80 años → necesitas aval\n\n` +
    `*Cliente Preferente:*\n` +
    `• 18 a 74 años → sin aval\n` +
    `• 75 a 80 años → puede requerir aval`,

  FAQ_INGRESOS:
    `💰 *Ingresos requeridos*\n\n` +
    `*Cliente Nuevo:* Mínimo $4,000/mes familiares\n` +
    `_(Cliente + cónyuge + hijos solteros en casa con mínimo 6 meses de estabilidad)_\n\n` +
    `*Cliente Preferente:* Solo se revisan si cambió de trabajo o pide aumento de línea\n\n` +
    `✅ Documentos válidos:\n• Nómina reciente\n• Estado de cuenta (3 meses)\n• Remesas (3 meses)\n• Carta laboral sellada y firmada`,

  FAQ_AVAL:
    `👥 *¿Cuándo necesitas aval?*\n\n` +
    `• Hombres clientes nuevos (aval debe ser mujer)\n` +
    `• Edades fuera del rango estándar\n` +
    `• Sin teléfono propio\n` +
    `• Sin comprobante de propiedad\n\n` +
    `*Requisitos del aval:*\n` +
    `✅ 25 a 68 años\n` +
    `✅ Comprobar propiedad y habitarla\n` +
    `✅ Teléfono propio\n` +
    `✅ Estabilidad laboral mínima 1 año\n` +
    `✅ No ser incobrable\n` +
    `❌ No puede ser empleado de ROGA\n` +
    `❌ No puede ser aval de otra cuenta activa\n` +
    `❌ El cónyuge NO puede ser aval`,

  FAQ_TIEMPO:
    `⏱️ *¿Cuánto tarda mi crédito?*\n\n` +
    `El proceso se realiza en tienda el mismo día.\n\n` +
    `Con documentación completa:\n` +
    `• Crédito valida en el momento\n` +
    `• Te llevas tu producto el mismo día ✅\n\n` +
    `_Entre más completa tu documentación, más rápido es todo_ 💨`,

  FAQ_ENGANCHE:
    `💵 *Enganches por tipo de artículo*\n\n` +
    `• Mercancía general: sin enganche*\n` +
    `• Electrónica: 7% o $500 (el menor)\n` +
    `• Pantallas y laptops: solo $50 de enganche 🎉\n` +
    `• Celulares: 7% o $600 (el menor)\n` +
    `• Motocicletas: $1,500 a $3,500 en efectivo\n` +
    `• Sin estabilidad laboral: 10% de enganche\n\n` +
    `_*Aplica para clientes con buen historial_`,

  FAQ_PAGO:
    `💳 *Formas de pago*\n\n` +
    `• En tienda (efectivo o tarjeta)\n` +
    `• OXXO Pay\n` +
    `• Transferencia bancaria\n\n` +
    `Los pagos son *quincenales* según tu plan.\n` +
    `Pagar antes de tu fecha te mantiene en categoría AAA/AA ⭐`,

  FAQ_LIMITE:
    `📊 *¿Cómo se calcula tu límite?*\n\n` +
    `El sistema calcula tu línea según:\n` +
    `• Ingresos comprobables\n` +
    `• Historial de pago en Villarreal\n` +
    `• Clasificación: AAA, AA, A, B, C\n\n` +
    `_Clientes AAA y AA conservan el límite más alto que han manejado históricamente, sin importar ingresos actuales_ 🏆`,

  FAQ_REZAGO:
    `⚠️ *¿Tengo rezago, puedo pedir crédito?*\n\n` +
    `*Clientes AAA y AA:*\n` +
    `→ Hasta 4 abonos quincenales vencidos permitidos\n\n` +
    `*Importante:*\n` +
    `• Rezago en Dinexpress → debes liquidarlo primero\n` +
    `• Para nuevo préstamo Dinexpress → cero rezago\n` +
    `• No se otorga crédito si cliente, cónyuge, aval o referencias son incobrables`,
};

// ─────────────────────────────────────────────
// MANEJADOR PRINCIPAL
// ─────────────────────────────────────────────
async function handleMessage(phone, message) {
  const session = getSession(phone);
  const msgType = message.type;
  let input = "";

  if (msgType === "text") {
    input = message.text.body.trim();
  } else if (msgType === "interactive") {
    const iv = message.interactive;
    input = iv.type === "button_reply" ? iv.button_reply.id : iv.list_reply.id;
  } else if (["image", "document", "audio", "video"].includes(msgType)) {
    input = "__media__";
  }

  const inputLower = input.toLowerCase();
  const saludos = ["hola", "inicio", "menu", "menú", "start", "hi", "buenas", "buenos días", "buenas tardes", "buenas noches"];

  if (saludos.includes(inputLower) || input === "MENU_HOME") {
    resetSession(phone);
    await sendMenuPrincipal(phone);
    return;
  }

  switch (session.step) {

    case "inicio":
    case "menu_principal":
      if (input === "SOLICITUD") {
        session.step = "tipo_cliente";
        await sendMenuTipoCliente(phone);
      } else if (input === "CATALOGO") {
        session.step = "catalogo";
        await sendMenuCatalogo(phone);
      } else if (input === "FAQ") {
        session.step = "faq";
        await sendFAQ(phone);
      } else {
        await sendMenuPrincipal(phone);
      }
      break;

    case "catalogo":
      if (CATALOGOS[input]) {
        await sendText(phone, CATALOGOS[input]);
        await sendButtons(phone, "¿Qué deseas hacer?", [
          { id: "SOLICITUD", title: "📋 Solicitar crédito" },
          { id: "CATALOGO",  title: "🔙 Ver más catálogo" },
          { id: "MENU_HOME", title: "🏠 Menú principal" },
        ]);
        session.step = "menu_principal";
      } else {
        await sendMenuCatalogo(phone);
      }
      break;

    case "faq":
      if (FAQ_RESPUESTAS[input]) {
        await sendText(phone, FAQ_RESPUESTAS[input]);
        await sendButtons(phone, "¿Necesitas algo más?", [
          { id: "SOLICITUD", title: "📋 Iniciar solicitud" },
          { id: "FAQ",       title: "🔙 Más preguntas" },
          { id: "MENU_HOME", title: "🏠 Menú principal" },
        ]);
        session.step = "menu_principal";
      } else {
        await sendFAQ(phone);
      }
      break;

    // ── TIPO CLIENTE ──
    case "tipo_cliente":
      if (input === "PREFERENTE" || input === "NUEVO") {
        session.data.tipo_cliente = input;
        session.data.whatsapp_origen = phone;
        session.step = "pedir_nombre";
        const saludo = input === "PREFERENTE"
          ? "⭐ *Solicitud — Cliente Preferente*\n\n¡Bienvenido de vuelta! Comencemos.\n\n"
          : "🆕 *Solicitud — Cliente Nuevo*\n\nVamos a recopilar tu información.\n\n";
        await sendText(phone, saludo + "👤 ¿Cuál es tu *nombre completo*?");
      } else {
        await sendMenuTipoCliente(phone);
      }
      break;

    case "pedir_nombre":
      if (msgType === "text" && input.length > 2) {
        session.data.nombre = input;
        session.step = "pedir_telefono";
        await sendText(phone, `Mucho gusto, *${input}* 👋\n\n📱 ¿Cuál es tu número de teléfono de contacto?`);
      } else {
        await sendText(phone, "Por favor escribe tu nombre completo.");
      }
      break;

    case "pedir_telefono":
      if (msgType === "text") {
        session.data.telefono = input;
        session.step = "pedir_correo";
        await sendText(phone, "📧 ¿Cuál es tu correo electrónico?\n_(Escribe \"no tengo\" si no tienes)_");
      }
      break;

    case "pedir_correo":
      if (msgType === "text") {
        session.data.correo = input;
        if (session.data.tipo_cliente === "PREFERENTE") {
          session.step = "pref_pedir_id";
          await sendText(phone,
            `📄 *Documento requerido — Cliente Preferente*\n\n` +
            `Envíame una foto de tu *identificación oficial*:\n` +
            `• INE (frente o ambos lados)\n• Pasaporte vigente\n• Cédula profesional\n• Licencia de conducir vigente`
          );
        } else {
          session.step = "nuevo_estado_civil";
          await sendButtons(phone, "👤 ¿Cuál es tu estado civil?", [
            { id: "EC_CASADA",  title: "💍 Casada/o" },
            { id: "EC_SOLTERA", title: "🙋 Soltera/o" },
            { id: "EC_OTRA",    title: "📋 Viuda/Divorciada/o" },
          ]);
        }
      }
      break;

    // ─── FLUJO PREFERENTE ───
    case "pref_pedir_id":
      if (input === "__media__") {
        session.data.id_recibida = true;
        session.step = "seleccionar_tienda";
        await sendText(phone, "✅ *Identificación recibida* 👍\n\nAhora selecciona la sucursal donde quieres ser atendido 👇");
        await sendSeleccionTienda(phone);
      } else {
        await sendText(phone, "⚠️ Por favor envía una *foto* de tu identificación oficial.");
      }
      break;

    // ─── FLUJO NUEVO ───
    case "nuevo_estado_civil":
      if (["EC_CASADA", "EC_SOLTERA", "EC_OTRA"].includes(input)) {
        session.data.estado_civil = input === "EC_CASADA" ? "Casada/o" : input === "EC_SOLTERA" ? "Soltera/o" : "Viuda/Divorciada/o";
        session.step = "nuevo_pedir_id";
        await sendText(phone,
          `📄 *Paso 1 de 5 — Identificación oficial*\n\n` +
          `Envíame una foto de tu *INE, pasaporte o cédula profesional* vigente.`
        );
      } else {
        await sendButtons(phone, "Por favor elige tu estado civil:", [
          { id: "EC_CASADA",  title: "💍 Casada/o" },
          { id: "EC_SOLTERA", title: "🙋 Soltera/o" },
          { id: "EC_OTRA",    title: "📋 Viuda/Divorciada/o" },
        ]);
      }
      break;

    case "nuevo_pedir_id":
      if (input === "__media__") {
        session.data.id_recibida = true;
        session.step = "nuevo_pedir_nomina";
        await sendText(phone,
          `✅ Identificación recibida\n\n` +
          `🏦 *Paso 2 de 5 — Comprobante de ingresos*\n\n` +
          `Envía uno de los siguientes:\n` +
          `• Nómina reciente\n• Estado de cuenta (últimos 3 meses)\n• Recibos de remesas (3 meses)\n• Carta laboral sellada, membretada y firmada`
        );
      } else {
        await sendText(phone, "⚠️ Por favor envía una *foto o PDF* de tu identificación oficial.");
      }
      break;

    case "nuevo_pedir_nomina":
      if (input === "__media__") {
        session.data.nomina_recibida = true;
        session.step = "nuevo_pedir_propiedad";
        await sendText(phone,
          `✅ Comprobante de ingresos recibido\n\n` +
          `🏠 *Paso 3 de 5 — Comprobante de propiedad*\n\n` +
          `Envía uno de los siguientes:\n` +
          `• Recibo de predial\n• Escrituras\n• Carta entrega\n• Descuento INFONAVIT\n• Recibo de agua\n\n` +
          `_Si vives en casa de familiar escribe: *"casa familiar"*_`
        );
      } else {
        await sendText(phone, "⚠️ Por favor envía el comprobante de ingresos como imagen o PDF.");
      }
      break;

    case "nuevo_pedir_propiedad":
      if (input === "__media__") {
        session.data.propiedad_recibida = true;
        session.step = "nuevo_pedir_referencias";
        await sendText(phone,
          `✅ Comprobante de propiedad recibido\n\n` +
          `👥 *Paso 4 de 5 — Referencias familiares*\n\n` +
          `Necesito 2 referencias (padres, hermanos, tíos 1er grado, hijos o suegros que *NO vivan contigo*).\n\n` +
          `Escribe nombre, parentesco y teléfono de cada una:\n\n` +
          `_Ejemplo:_\nJuana Martínez, hermana, 81-2345-6789\nCarlos López, papá, 81-9876-5432`
        );
      } else if (msgType === "text" && inputLower.includes("casa familiar")) {
        session.data.propiedad = "Casa familiar";
        session.step = "nuevo_pedir_referencias";
        await sendText(phone,
          `✅ Casa familiar registrada\n\n` +
          `👥 *Paso 4 de 5 — Referencias familiares*\n\n` +
          `Necesito 2 referencias (padres, hermanos, tíos, hijos o suegros que *NO vivan contigo*).\n\n` +
          `Escribe nombre, parentesco y teléfono:\n\n` +
          `_Ejemplo:_\nJuana Martínez, hermana, 81-2345-6789\nCarlos López, papá, 81-9876-5432`
        );
      } else {
        await sendText(phone, "⚠️ Envía una foto del comprobante de propiedad, o escribe *\"casa familiar\"* si aplica.");
      }
      break;

    case "nuevo_pedir_referencias":
      if (msgType === "text" && input.length > 10) {
        session.data.referencias = input;
        session.step = "nuevo_pedir_selfie";
        await sendText(phone,
          `✅ Referencias registradas\n\n` +
          `🤳 *Paso 5 de 5 — Selfie con identificación*\n\n` +
          `Tómate una foto sosteniendo tu *INE junto a tu rostro* para verificar identidad.`
        );
      } else {
        await sendText(phone, "Por favor escribe los datos de tus 2 referencias familiares.");
      }
      break;

    case "nuevo_pedir_selfie":
      if (input === "__media__") {
        session.data.selfie_recibida = true;
        session.step = "seleccionar_tienda";
        await sendText(phone, "✅ *¡Documentación completa!* 🎉\n\nSelecciona la sucursal donde deseas ser atendido 👇");
        await sendSeleccionTienda(phone);
      } else {
        await sendText(phone, "⚠️ Por favor envía tu selfie sosteniendo tu identificación.");
      }
      break;

    // ── SELECCIÓN TIENDA ──
    case "seleccionar_tienda":
      if (input.startsWith("TIENDA_")) {
        const tiendaId = input.replace("TIENDA_", "");
        const tienda = TIENDAS.find((t) => t.id === tiendaId);
        if (tienda) {
          session.data.tienda = tienda;
          session.step = "confirmacion";
          const esNuevo = session.data.tipo_cliente === "NUEVO";
          const resumen =
            `📋 *Resumen de tu solicitud*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 Nombre: ${session.data.nombre}\n` +
            `📱 Teléfono: ${session.data.telefono}\n` +
            `📧 Correo: ${session.data.correo}\n` +
            `🏷️ Tipo: ${esNuevo ? "Cliente Nuevo 🆕" : "Cliente Preferente ⭐"}\n` +
            (esNuevo ? `💍 Estado civil: ${session.data.estado_civil}\n` : "") +
            `📁 Documentos: ✅ Completos\n` +
            `📍 Tienda: ${tienda.nombre}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `¿Confirmas el envío?`;
          await sendButtons(phone, resumen, [
            { id: "CONFIRMAR", title: "✅ Confirmar" },
            { id: "CANCELAR",  title: "❌ Cancelar" },
          ]);
        }
      } else {
        await sendSeleccionTienda(phone);
      }
      break;

    // ── CONFIRMACIÓN FINAL ──
    case "confirmacion":
      if (input === "CONFIRMAR") {
        const folio = `VLL-${Date.now().toString().slice(-7)}`;
        const tienda = session.data.tienda;

        await sendText(phone,
          `🎉 *¡Solicitud enviada con éxito!*\n\n` +
          `📋 *Folio:* ${folio}\n\n` +
          `El equipo de *${tienda.nombre}* revisará tu información y te contactará en breve.\n\n` +
          `📍 *Ubicación de tu sucursal:*\n${tienda.maps}\n\n` +
          `¡Gracias por elegir *Villarreal* / Grupo ROGA! 🏪\n\n` +
          `_Escribe *hola* para volver al menú principal_`
        );

        // Notificar al jefe de tienda
        try {
          await notificarJefeTienda(tienda, session.data, folio);
          console.log(`✅ Notificación enviada → ${tienda.nombre} (${tienda.tel})`);
        } catch (err) {
          console.error(`❌ Error al notificar tienda: ${err.message}`);
        }

        resetSession(phone);

      } else if (input === "CANCELAR") {
        resetSession(phone);
        await sendButtons(phone, "Solicitud cancelada. ¿Qué deseas hacer?", [
          { id: "SOLICITUD", title: "📋 Nueva solicitud" },
          { id: "MENU_HOME", title: "🏠 Menú principal" },
        ]);
      }
      break;

    default:
      resetSession(phone);
      await sendMenuPrincipal(phone);
  }
}

// ─────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const value    = req.body.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages;
    if (!messages?.length) return;
    const message = messages[0];
    console.log(`📩 [${message.from}] ${message.type}`);
    await handleMessage(message.from, message);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
});

app.get("/", (req, res) => res.send("🤖 Bot Villarreal / Grupo ROGA — Activo ✅"));

app.listen(PORT, () => console.log(`🚀 Bot Villarreal corriendo en puerto ${PORT}`));
