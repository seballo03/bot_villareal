// flow.js — Máquina de estados para el flujo de solicitud de crédito
const { verifyDocument, getCreditScore } = require("./ai");

// Get correct WhatsApp JID for a number
async function getJid(sock, number) {
  try {
    // Clean number - digits only
    const clean = number.replace(/\D/g, "");
    const results = await sock.onWhatsApp(clean);
    if (results && results.length > 0 && results[0].exists) {
      console.log(`JID found for ${clean}: ${results[0].jid}`);
      return results[0].jid;
    }
    // Fallback to standard format
    console.log(`No JID found for ${clean}, using fallback`);
    return `${clean}@s.whatsapp.net`;
  } catch(e) {
    console.log(`getJid error: ${e.message}`);
    return `${number.replace(/\D/g,"")}@s.whatsapp.net`;
  }
}
const { saveExpediente, searchClient } = require("./storage");
const { STORES, PARENTESCO } = require("./config");

// In-memory session storage (phone -> session)
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      step: "init",
      data: {},       // application data
      docs: [],       // uploaded documents
      pendingDocType: null,
      pendingChoice: null,
    });
  }
  return sessions.get(phone);
}

function clearSession(phone) {
  sessions.delete(phone);
}

// Build WhatsApp summary text
function buildSummary(D, store, score, linkUrl) {
  const now = new Date().toLocaleString("es-MX", { dateStyle:"short", timeStyle:"short" });
  const lines = [
    "📋 SOLICITUD DE CREDITO — CREDITO VILLARREAL",
    `📅 Fecha: ${now}`,
    `🏪 Tienda: ${store.name}`,
    score ? `\n🤖 DICTAMEN IA: ${score.decision||""} (${score.puntaje||0}/100)\n${score.resumen||""}` : "",
    "\n👤 CLIENTE",
    D.nombres       ? `Nombre(s): ${D.nombres}` : "",
    D.apellido_paterno ? `Ap. Paterno: ${D.apellido_paterno}` : "",
    D.apellido_materno ? `Ap. Materno: ${D.apellido_materno}` : "",
    !D.nombres && D.name ? `Nombre: ${D.name}` : "",
    D.dob           ? `Nacimiento: ${D.dob}` : "",
    D.curp          ? `CURP: ${D.curp}` : "",
    D.phone         ? `Tel: ${D.phone}` : "",
    D.age           ? `Edad: ${D.age} años` : "",
    D.gender        ? `Género: ${D.gender}` : "",
    D.civilStatus   ? `Estado Civil: ${D.civilStatus}` : "",
    D.customerId    ? `No. Cliente: ${D.customerId}` : "",
    "\n🏠 DOMICILIO",
    D.ine_address   ? `INE: ${D.ine_address}` : "",
    D.ine_cp        ? `CP: ${D.ine_cp}` : "",
    D._addressChanged && D.location?.street ? `Actual: ${D.location.street}` : "",
    "\n💼 ECONOMIA",
    D.incomeRange   ? `Ingresos: ${D.incomeRange}` : "",
    D.incomeAmount  ? `Monto doc: ${D.incomeAmount}` : "",
    D.mesesCubiertos ? `Comprobantes: ${D.mesesCubiertos}/3 meses` : "",
    D.stability     ? `Estabilidad: ${D.stability}` : "",
    D.product       ? `Producto: ${D.product}` : "",
    D.ref1 ? `\n📞 REF 1: ${D.ref1.name} ${D.ref1.apellidos} | ${D.ref1.parentesco} | ${D.ref1.phone}` : "",
    D.ref2 ? `📞 REF 2: ${D.ref2.name} ${D.ref2.apellidos} | ${D.ref2.parentesco} | ${D.ref2.phone}` : "",
    "\n📎 DOCUMENTOS VERIFICADOS CON IA",
    D.ineFront      ? "✅ INE (frente y reverso)" : "",
    D.incomeProof   ? "✅ Comprobante de ingresos" : "",
    D.addressProof  ? "✅ Comprobante de domicilio" : "",
    D.needsEnganche ? "\n⚠️ REQUIERE 10% DE ENGANCHE" : "",
    D.hasRezago     ? "⚠️ CON REZAGO — verificar" : "",
    (D.gender==="Hombre"||(D.age&&(D.age<=22||D.age>=70))) ? "⚠️ REQUIERE AVAL" : "",
    score?.alertas?.length ? "\n⚠️ ALERTAS:\n" + score.alertas.map(a=>`- ${a}`).join("\n") : "",
    linkUrl ? `\n🔗 EXPEDIENTE COMPLETO CON FOTOS:\n${linkUrl}` : "",
    "\n\nEl cliente se presentará en tienda para firmar el pagaré.",
  ].filter(Boolean).join("\n");
  return lines;
}

// Main message handler — returns array of response strings
async function handleMessage(phone, text, mediaBuffer, mediaType, sock) {
  const session = getSession(phone);
  const { step, data: D } = session;
  const responses = [];

  const reply = (msg) => responses.push(msg);
  const nums = (label, opts) => {
    reply(label + "\n" + opts.map((o,i)=>`${i+1}. ${o}`).join("\n") + "\n\n_Responde con el número_");
  };

  // ─── MEDIA MESSAGE ───
  if (mediaBuffer && session.pendingDocType) {
    const docType = session.pendingDocType;
    session.pendingDocType = null;
    reply("⏳ Verificando documento con IA...");

    const res = await verifyDocument(mediaBuffer, mediaType || "image/jpeg", docType);

    if (!res.valid) {
      reply(`⚠️ *Documento no válido:* ${res.message}\n\nPor favor envía el documento correcto.`);
      session.pendingDocType = docType; // ask again
      return responses;
    }

    // Store original buffer for direct WhatsApp forwarding to store manager
    let compressedBuffer = mediaBuffer;
    let finalMediaType = mediaType || "image/jpeg";
    if (!mediaType?.includes("pdf")) {
      try {
        const sharp = require("sharp");
        compressedBuffer = await sharp(mediaBuffer)
          .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toBuffer();
        finalMediaType = "image/jpeg";
      } catch(e) { console.log("Sharp error:", e.message); }
    }
    session.docs.push({
      type: docType,
      name: `${docType}-${Date.now()}.${finalMediaType.includes("pdf") ? "pdf" : "jpg"}`,
      mediaType: finalMediaType,
      buffer: compressedBuffer,          // keep buffer for WA forwarding
      base64: compressedBuffer.toString("base64") // keep base64 for JSONBin
    });
    console.log(`Doc stored: type=${docType} size=${compressedBuffer.length} bytes`);

    if (docType === "ine_front") {
      D.ineFront = true;
      if (res.nombres && res.apellido_paterno) {
        D.nombres = res.nombres; D.apellido_paterno = res.apellido_paterno; D.apellido_materno = res.apellido_materno || "";
        D.name = `${res.nombres} ${res.apellido_paterno} ${res.apellido_materno||""}`.trim();
      }
      D.dob  = res.dob  || D.dob;
      D.curp = res.curp || D.curp;
      D.ine_calle    = res.ine_calle    || null;
      D.ine_colonia  = res.ine_colonia  || null;
      D.ine_cp       = res.ine_cp       || null;
      D.ine_municipio= res.ine_municipio|| null;
      D.ine_estado   = res.ine_estado   || null;
      D.ine_address  = [res.ine_calle, res.ine_colonia && "Col. "+res.ine_colonia, res.ine_cp && "CP "+res.ine_cp, res.ine_municipio, res.ine_estado].filter(Boolean).join(", ");

      let infoMsg = `✅ *INE verificada*`;
      if (D.name) infoMsg += `\n👤 *${D.name}*`;
      if (D.dob)  infoMsg += ` | Nac: ${D.dob}`;
      if (D.ine_address) infoMsg += `\n🏠 ${D.ine_address}`;
      reply(infoMsg);

      // Search existing client
      const existing = await searchClient({ curp: D.curp, nombre: D.name });
      if (existing) {
        reply(`🔍 *¡Te encontramos en nuestra base de datos!*\nRegistro del ${new Date(existing.fecha).toLocaleDateString("es-MX")}.\nSerás atendido como *Cliente Preferente*. ⭐`);
        D.type = "preferente";
      }

      if (D.name) {
        if (D.ine_address) {
          reply(`¿El domicilio de tu INE es donde vives *actualmente*?\n\n1. ✅ Sí, ese es mi domicilio actual\n2. ❌ No, me cambié de domicilio`);
          session.step = "ine_address_confirm";
        } else {
          reply("Ahora envíame la foto del *REVERSO* de tu INE 📷");
          session.pendingDocType = "ine_back";
          session.step = "ine_back";
        }
      } else {
        reply("No pude leer tu nombre. Escríbeme tu *nombre completo* (nombres y apellidos):");
        session.step = "name_manual";
      }
      return responses;
    }

    if (docType === "ine_back") {
      D.ineBack = true;
      reply("✅ *Reverso de INE verificado.*\n\n¿Cuál es tu *número de teléfono*? 📞");
      session.step = "phone";
      return responses;
    }

    if (docType === "income_proof") {
      D.incomeFiles = D.incomeFiles || [];
      D.incomeFiles.push(docType);
      if (res.amount) D.incomeAmount = res.amount;
      const total = D.incomeFiles.length;
      D.mesesCubiertos = total;
      D.incomeProof = true;

      reply(`✅ *Comprobante ${total}/3 recibido*${res.amount ? ` | Monto: ${res.amount}` : ""}`);

      if (total < 3 && res.docType !== "carta laboral") {
        reply(`📊 Faltan *${3-total} ${3-total===1?"mes":"meses"}* más.\n\nEnvía otro comprobante (foto o PDF):`);
        session.pendingDocType = "income_proof";
      } else {
        reply("✅ *¡3 comprobantes listos!*");
        afterIncome(session, reply, nums);
      }
      return responses;
    }

    if (docType === "address_proof") {
      D.addressProof = true;
      if (res.address) D.address = res.address;
      reply(`✅ *Comprobante de domicilio verificado.*${res.address ? "\n📍 " + res.address : ""}`);
      afterAddress(session, reply, nums);
      return responses;
    }
  }

  // ─── TEXT MESSAGE ───
  const t = (text || "").trim();
  const num = parseInt(t);

  if (!t && !mediaBuffer) return responses;

  // TEST COMMAND — admin only
  if (t.toLowerCase().startsWith("test:")) {
    const targetNum = t.split(":")[1]?.trim();
    if (targetNum && sock) {
      try {
        const jid = await getJid(sock, targetNum);
        reply(`Buscando número ${targetNum}... JID: ${jid}`);
        await sock.sendMessage(jid, { text: "🤖 Prueba de envío desde bot Crédito Villarreal ✅" });
        reply(`✅ Mensaje enviado a ${jid}`);
      } catch(e) {
        reply(`❌ Error: ${e.message}`);
      }
    } else {
      reply("Uso: test:NUMERO (ej: test:528112345678)");
    }
    return responses;
  }

  // RESTART
  if (t.toLowerCase() === "inicio" || t.toLowerCase() === "reiniciar" || t === "0") {
    clearSession(phone);
    const newSess = getSession(phone);
    reply("↩️ *Solicitud reiniciada.*");
    reply("¡Hola! 👋 Bienvenido/a a *Crédito Villarreal*.\nTe ayudo a completar tu solicitud de crédito paso a paso.\n\n¿Cómo te clasificamos?\n\n1. 🆕 Soy cliente nuevo\n2. ⭐ Ya tengo crédito con Villarreal (Preferente)");
    newSess.step = "type";
    return responses;
  }

  // INIT
  if (step === "init") {
    reply("¡Hola! 👋 Bienvenido/a a *Crédito Villarreal*. 🏠\n\nTe ayudo a completar tu solicitud de crédito paso a paso.\n\n¿Cómo te clasificamos?\n\n1. 🆕 Soy cliente nuevo\n2. ⭐ Ya tengo crédito con Villarreal (Preferente)\n\n_En cualquier momento escribe *inicio* para empezar de nuevo_");
    session.step = "type";
    return responses;
  }

  if (step === "type") {
    if (num === 1 || t.toLowerCase().includes("nuevo")) {
      D.type = "new";
      reply("¡Perfecto! 🆕 Iniciamos como *cliente nuevo*.\n\n¿Eres *mujer* u *hombre*?\n\n1. 👩 Mujer\n2. 👨 Hombre");
      session.step = "gender";
    } else if (num === 2 || t.toLowerCase().includes("prefer")) {
      D.type = "preferente";
      reply("¡Bienvenido/a de regreso! ⭐\n\nEscribe tu *número de cliente*:");
      session.step = "pref_id";
    } else {
      reply("Por favor responde *1* para cliente nuevo o *2* si ya tienes crédito con nosotros.");
    }
    return responses;
  }

  // ─── NUEVO FLOW ───
  if (step === "gender") {
    if (num === 1 || t.toLowerCase().includes("mujer")) {
      D.gender = "Mujer";
      reply("¿Cuántos *años* tienes?");
      session.step = "age";
    } else if (num === 2 || t.toLowerCase().includes("hombre")) {
      D.gender = "Hombre";
      reply("¿Cuál es tu *estado civil*?\n\n1. Soltero\n2. Viudo\n3. Divorciado\n4. Casado");
      session.step = "civil";
    } else {
      reply("Responde *1* para Mujer o *2* para Hombre.");
    }
    return responses;
  }

  if (step === "civil") {
    const options = ["Soltero","Viudo","Divorciado","Casado"];
    const civil = options[num-1] || (options.find(o => t.toLowerCase().includes(o.toLowerCase())));
    if (!civil) { reply("Por favor responde del 1 al 4."); return responses; }
    D.civilStatus = civil;
    if (civil === "Casado") {
      reply("⚠️ La política requiere que la *esposa* solicite el crédito como titular.\n\n¿Tu esposa está presente y desea solicitar?\n\n1. ✅ Sí, mi esposa quiere solicitar\n2. ❌ No, iré a la tienda a preguntar");
      session.step = "casado";
    } else {
      reply("Necesitarás un *aval mujer* al firmar. ✅\n\n¿Cuántos *años* tienes?");
      session.step = "age";
    }
    return responses;
  }

  if (step === "casado") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si")) {
      D.gender = "Mujer"; D.civilStatus = "Casada";
      reply("¡Continuamos a nombre de tu *esposa*! 👩\n\n¿Cuántos *años* tiene ella?");
      session.step = "age";
    } else {
      reply("Entendido. Te esperamos en cualquier tienda Villarreal. 🙏\n\nEscribe *inicio* cuando quieras intentar de nuevo.");
      session.step = "ended";
    }
    return responses;
  }

  if (step === "age") {
    const age = parseInt(t);
    if (isNaN(age)||age<18) { reply("⚠️ La edad mínima es 18 años. Escribe tu edad:"); return responses; }
    if (age>80)             { reply("⚠️ El límite es 80 años. Visita una tienda Villarreal. 🙏"); session.step="ended"; return responses; }
    D.age = age;
    if (age<=22) reply("📌 Para edades 18–22 se requiere *aval*.");
    if (age>=70) reply("📌 Para edades 70–80 se requiere *aval*.");
    reply("Envíame la foto del *FRENTE* de tu INE, pasaporte vigente o cédula profesional 📷\n\n_Puede ser foto tomada con tu celular_");
    session.pendingDocType = "ine_front";
    session.step = "ine_front";
    return responses;
  }

  if (step === "name_manual") {
    D.name = t;
    reply(`Nombre registrado: *${t}* ✅\n\nEnvíame la foto del *REVERSO* de tu INE 📷`);
    session.pendingDocType = "ine_back";
    session.step = "ine_back";
    return responses;
  }

  if (step === "ine_address_confirm") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si") || t === "1") {
      D.location = { street: D.ine_address, city: D.ine_municipio || "" };
      reply("✅ Domicilio confirmado.\n\nAhora envíame la foto del *REVERSO* de tu INE 📷");
      session.pendingDocType = "ine_back";
      session.step = "ine_back";
    } else {
      reply("Escribe tu *calle y número* actual:");
      D._addressChanged = true;
      session.step = "new_street";
    }
    return responses;
  }

  if (step === "new_street") {
    D._newStreet = t;
    reply("¿En qué *colonia*?");
    session.step = "new_colonia";
    return responses;
  }

  if (step === "new_colonia") {
    D._newColonia = t;
    reply("¿Ciudad y *código postal*? (Ej: Monterrey 64000)");
    session.step = "new_city";
    return responses;
  }

  if (step === "new_city") {
    const parts = t.split(/\s+/);
    D._newCP = parts.find(p => /^\d{5}$/.test(p)) || "";
    D._newCity = parts.filter(p => !/^\d{5}$/.test(p)).join(" ");
    D.location = { street:`${D._newStreet}, Col. ${D._newColonia}`, city:D._newCity, cp:D._newCP };
    reply(`📍 *${D.location.street}, ${D._newCity}${D._newCP?" CP "+D._newCP:""}* ✅\n\nAhora envíame la foto del *REVERSO* de tu INE 📷`);
    session.pendingDocType = "ine_back";
    session.step = "ine_back";
    return responses;
  }

  if (step === "phone") {
    D.phone = t;
    reply(`Teléfono: *${t}* ✅\n\n¿Cuánto ganas aproximadamente al mes?\n\n1. Menos de $2,000\n2. Entre $2,000 y $3,999\n3. Entre $4,000 y $5,999\n4. Entre $6,000 y $9,999\n5. $10,000 o más`);
    session.step = "income_range";
    return responses;
  }

  if (step === "income_range") {
    const ranges = ["Menos de $2,000/mes","Entre $2,000 y $3,999/mes","Entre $4,000 y $5,999/mes","Entre $6,000 y $9,999/mes","$10,000 o más/mes"];
    const range = ranges[num-1];
    if (!range) { reply("Por favor responde del 1 al 5."); return responses; }
    D.incomeRange = range;
    if (num >= 3) {
      reply("💰 Envíame tu *comprobante de ingresos*.\n\nPuede ser foto o PDF de:\n• Recibo de nómina\n• Estado de cuenta bancario (3 meses)\n• Carta laboral con sello y firma\n• Recibos de remesas\n\n_Puedes enviar hasta 3 archivos, uno por uno_");
      session.pendingDocType = "income_proof";
      session.step = "income_proof";
    } else {
      reply("⚠️ Se requieren mínimo $4,000/mes (puedes sumar ingresos de tu familia).\n\n¿Sumando cónyuge e hijos que viven contigo, llegan a $4,000/mes?\n\n1. ✅ Sí\n2. ❌ No");
      session.step = "income_family";
    }
    return responses;
  }

  if (step === "income_family") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si")) {
      D.incomeRange = (D.incomeRange || "") + " (ingresos familiares)";
      reply("💰 Envíame tu *comprobante de ingresos*:");
      session.pendingDocType = "income_proof";
      session.step = "income_proof";
    } else {
      reply("Entendemos. Cuando tu situación mejore, ¡aquí te atendemos! 🙏\n\nEscribe *inicio* cuando quieras intentar de nuevo.");
      session.step = "ended";
    }
    return responses;
  }

  if (step === "stability") {
    const opts = ["1 año o más","Entre 6 meses y 1 año","Menos de 6 meses"];
    const stab = opts[num-1];
    if (!stab) { reply("Por favor responde 1, 2 o 3."); return responses; }
    D.stability = stab;
    if (num === 3) {
      reply("¿Tu *cónyuge* tiene 1 año o más en su trabajo actual?\n\n1. ✅ Sí\n2. ❌ No, ninguno cumple");
      session.step = "stability_spouse";
    } else {
      askProperty(session, reply, nums);
    }
    return responses;
  }

  if (step === "stability_spouse") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si")) {
      D.stabilityVia = "cónyuge";
      reply("✅ Se considera la estabilidad de tu cónyuge.");
    } else {
      D.needsEnganche = true;
      reply("⚠️ Se aplicará *enganche del 10%* del producto.");
    }
    askProperty(session, reply, nums);
    return responses;
  }

  if (step === "property") {
    if (!num || num < 1 || num > 4) { reply("Por favor responde del 1 al 4."); return responses; }
    const props = ["Soy dueño/a de mi casa","Casa de familiar directo","Más de 2 años en misma dirección","Menos de 2 años en mi domicilio"];
    D.propertyType = props[num-1];
    let docHint = "";
    if (num === 1) docHint = "Envíame tu *comprobante de propiedad*:\n• Predial\n• Escrituras\n• Carta entrega\n• INFONAVIT\n• Recibo de agua";
    else if (num === 2) docHint = "Envíame un comprobante de domicilio en casa del familiar:";
    else if (num === 3) { D.needsEnganche = true; docHint = "⚠️ Requieres *10% de enganche*.\n\nEnvíame tu comprobante de domicilio:"; }
    else { docHint = "Necesitarás un *aval*.\n\nEnvíame tu comprobante de domicilio actual:"; }
    reply(docHint + "\n\n_Acepto: CFE, agua, predial, gas, escrituras, INFONAVIT_");
    session.pendingDocType = "address_proof";
    session.step = "address_proof";
    return responses;
  }

  // Referencias
  if (step === "ref1_name")      { D.ref1 = {name:t}; reply("¿Sus *dos apellidos*?"); session.step="ref1_ap"; return responses; }
  if (step === "ref1_ap")        { D.ref1.apellidos=t; nums("¿Qué parentesco tiene contigo?",PARENTESCO); session.step="ref1_par"; return responses; }
  if (step === "ref1_par")       {
    D.ref1.parentesco = PARENTESCO[num-1] || t;
    reply("¿Su *número de teléfono*?"); session.step="ref1_phone"; return responses;
  }
  if (step === "ref1_phone")     {
    D.ref1.phone=t;
    reply(`✅ *Ref 1:* ${D.ref1.name} ${D.ref1.apellidos} | ${D.ref1.parentesco} | ${t}\n\n*Referencia 2* — ¿Cuál es su nombre?`);
    session.step="ref2_name"; return responses;
  }
  if (step === "ref2_name")      { D.ref2={name:t}; reply("¿Sus *dos apellidos*?"); session.step="ref2_ap"; return responses; }
  if (step === "ref2_ap")        { D.ref2.apellidos=t; nums("¿Qué parentesco tiene contigo?",PARENTESCO); session.step="ref2_par"; return responses; }
  if (step === "ref2_par")       {
    D.ref2.parentesco = PARENTESCO[num-1] || t;
    reply("¿Su *número de teléfono*?"); session.step="ref2_phone"; return responses;
  }
  if (step === "ref2_phone")     {
    D.ref2.phone=t;
    reply(`✅ *Ref 2:* ${D.ref2.name} ${D.ref2.apellidos} | ${D.ref2.parentesco} | ${t}`);
    askProduct(session, reply, nums);
    return responses;
  }

  if (step === "product") {
    const products = ["Muebles","Electrónica","Línea Blanca","Climas","Recámaras","Celular","Motocicleta"];
    if (D.type !== "new") products.push("Dinexpress");
    const product = products[num-1];
    if (!product) { reply("Por favor responde con un número de la lista."); return responses; }
    D.product = product;
    if (product === "Electrónica") reply("💡 Enganche: 7% o $500 (el menor). Pantallas/laptops: promo $50.");
    if (product === "Celular")     reply("📱 Enganche: 7% o $600 (el menor).");
    if (product === "Motocicleta") reply("🏍️ Enganche: $1,500–$3,500 según precio.");
    askStore(session, reply);
    return responses;
  }

  if (step === "store") {
    const store = STORES[num-1];
    if (!store) { reply("Por favor responde con un número del 1 al 10."); return responses; }
    D.selectedStore = store;
    session.step = "processing";
    await finalize(phone, session, reply, sock);
    return responses;
  }

  // ─── PREFERENTE FLOW ───
  if (step === "pref_id") {
    D.customerId = t;
    reply(`Cliente *#${t}* identificado. 🔍\n\nConfirma tu *número de teléfono*:`);
    session.step = "pref_phone";
    return responses;
  }

  if (step === "pref_phone") {
    D.phone = t;
    reply("✅ Identidad verificada.\n\n¿Has tenido *cambio de trabajo* o *aumento de sueldo* recientemente?\n\n1. ✅ Sí\n2. ❌ No");
    session.step = "pref_job_change";
    return responses;
  }

  if (step === "pref_job_change") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si")) {
      reply("Envíame tu *comprobante de ingresos actualizado*:");
      session.pendingDocType = "income_proof";
      session.step = "income_proof";
    } else {
      reply("¿Ha *cambiado tu dirección* desde tu último crédito?\n\n1. ✅ Sí, cambié\n2. ❌ No, mismo domicilio");
      session.step = "pref_address_change";
    }
    return responses;
  }

  if (step === "pref_address_change") {
    if (num === 1 || t.toLowerCase().startsWith("sí") || t.toLowerCase().startsWith("si")) {
      reply("Envíame tu *comprobante de domicilio actualizado*:");
      session.pendingDocType = "address_proof";
      session.step = "address_proof";
    } else {
      reply("¿Tienes *pagos atrasados* en tus cuentas?\n\n1. ✅ No, al corriente\n2. ⚠️ Sí, tengo pagos atrasados");
      session.step = "pref_rezago";
    }
    return responses;
  }

  if (step === "pref_rezago") {
    if (num === 2 || t.toLowerCase().includes("sí") || t.toLowerCase().includes("si")) {
      D.hasRezago = true;
      reply("📌 Clientes AAA/AA: hasta 4 pagos quincenales. Para Dinexpress: sin adeudos. El jefe validará en tienda.");
    } else {
      reply("¡Todo al corriente! ✅");
    }
    askProduct(session, reply, nums);
    return responses;
  }

  if (step === "ended") {
    reply("Escribe *inicio* para comenzar una nueva solicitud.");
    return responses;
  }

  // Default
  if (responses.length === 0) {
    reply("No entendí tu respuesta. Por favor responde con el *número* de la opción.\n\nEscribe *inicio* para empezar de nuevo.");
  }

  return responses;
}

// ─── FLOW HELPERS ───
function afterIncome(session, reply, nums) {
  const D = session.data;
  if (D.type === "new") {
    reply("¿Cuánto tiempo llevas en tu *trabajo actual*?\n\n1. 1 año o más\n2. Entre 6 meses y 1 año\n3. Menos de 6 meses");
    session.step = "stability";
  } else {
    reply("¿Ha *cambiado tu dirección* desde tu último crédito?\n\n1. ✅ Sí, cambié\n2. ❌ No, mismo domicilio");
    session.step = "pref_address_change";
  }
}

function afterAddress(session, reply, nums) {
  const D = session.data;
  if (D.type === "new") {
    reply("Necesitamos *2 referencias familiares* que NO vivan contigo.\n(Padres, hermanos, tíos 1er grado, hijos o suegros)\n\n*Referencia 1* — ¿Cuál es su *nombre*?");
    session.step = "ref1_name";
  } else {
    reply("¿Tienes *pagos atrasados* en tus cuentas?\n\n1. ✅ No, al corriente\n2. ⚠️ Sí, tengo pagos atrasados");
    session.step = "pref_rezago";
  }
}

function askProperty(session, reply, nums) {
  reply("¿Cuál es tu situación con tu domicilio?\n\n1. 🏠 Soy dueño/a\n2. 👨‍👩‍👧 Casa de familiar directo\n3. 📅 Más de 2 años en la misma dirección\n4. 🔑 Menos de 2 años en mi domicilio");
  session.step = "property";
}

function askProduct(session, reply, nums) {
  const D = session.data;
  const products = ["Muebles","Electrónica","Línea Blanca","Climas","Recámaras","Celular","Motocicleta"];
  if (D.type !== "new") products.push("Dinexpress");
  reply("¿Qué tipo de *producto* te interesa? 🛍️\n\n" + products.map((p,i)=>`${i+1}. ${p}`).join("\n"));
  session.step = "product";
}

function askStore(session, reply) {
  reply("¿A qué *tienda Villarreal* vas a ir a firmar? 🏪\n\n" + STORES.map((s,i)=>`${i+1}. ${s.name}`).join("\n"));
  session.step = "store";
}

async function finalize(phone, session, reply, sock) {
  const D = session.data;
  const store = D.selectedStore;

  reply(`¡Elegiste *${store.name}*! 🎉\n\nAnalizando tu perfil crediticio... 🤖`);

  // Credit score
  let score = null;
  try {
    score = await getCreditScore(D);
    if (score) {
      const msgs = {
        verde:    `✅ *¡Buenas noticias!* Tu perfil se ve *favorable*. ${score.recomendacion_linea||""}`,
        amarillo: `⚠️ *Requiere revisión.* ${score.resumen} No es un no definitivo.`,
        rojo:     `❌ *Hay observaciones.* ${score.resumen} Ve a tienda — puede haber opciones con aval.`
      };
      reply(msgs[score.semaforo] || score.resumen || "Perfil analizado.");
      if (score.fortalezas?.length) reply("*Lo positivo:*\n" + score.fortalezas.map(f=>"✅ "+f).join("\n"));
      if (score.alertas?.length && score.semaforo !== "verde") reply("*El jefe revisará:*\n" + score.alertas.map(a=>"📋 "+a).join("\n"));
    }
  } catch(e) { reply("Perfil registrado. El jefe evaluará en persona."); }

  // Save expediente
  reply("Guardando tu expediente... ⏳");
  let linkResult = null;
  try {
    linkResult = await saveExpediente(D, store, score, session.docs);
    reply(`✅ *Expediente guardado.*\n\n🔗 Link para el jefe:\n${linkResult.url}`);
  } catch(e) {
    reply("⚠️ No se pudo guardar el link. El resumen se enviará por WhatsApp.");
  }

  const summary = buildSummary(D, store, score, linkResult?.url);

  // ─── Envío automático al jefe de tienda ───
  const jefWa = store.wa;
  console.log(`Buscando JID para jefe de ${store.name}: ${jefWa}`);
  const jefJid = await getJid(sock, jefWa);
  console.log(`JID del jefe: ${jefJid}`);
  console.log(`sock disponible: ${!!sock}`);
  console.log(`Docs a enviar: ${session.docs.length}`);

  const docLabels = {
    ine_front:     "📷 INE — Frente",
    ine_back:      "📷 INE — Reverso",
    income_proof:  "📄 Comprobante de Ingresos",
    address_proof: "📄 Comprobante de Domicilio"
  };

  let jefeEnviado = false;
  let errorJefe = "";

  // Verificar que sock existe
  if (!sock) {
    console.error("ERROR: sock es null/undefined — no se puede enviar al jefe");
    errorJefe = "sock no disponible";
  } else {
    try {
      // 1. Alerta
      console.log("Enviando alerta al jefe...");
      await sock.sendMessage(jefJid, {
        text: `🔔 *NUEVA SOLICITUD DE CRÉDITO*

🏪 Tienda: *${store.name}*
📅 ${new Date().toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"})}
👤 Cliente: ${D.name||D.nombres||"Sin nombre"}
📞 Tel: ${D.phone||"N/A"}`
      });
      console.log("Alerta enviada OK");
      await new Promise(r => setTimeout(r, 800));

      // 2. Resumen
      console.log("Enviando resumen al jefe...");
      await sock.sendMessage(jefJid, { text: summary });
      console.log("Resumen enviado OK");
      await new Promise(r => setTimeout(r, 800));

      // 3. Link expediente
      if (linkResult?.url) {
        await sock.sendMessage(jefJid, {
          text: `📋 *Expediente completo:*
${linkResult.url}`
        });
        await new Promise(r => setTimeout(r, 500));
      }

      // 4. Documentos
      console.log(`Enviando ${session.docs.length} documentos...`);
      for (const doc of session.docs) {
        if (!doc.buffer) { console.log(`Doc ${doc.type}: sin buffer`); continue; }
        try {
          const isImage = doc.mediaType?.startsWith("image/");
          const label = docLabels[doc.type] || doc.name;
          console.log(`Enviando ${doc.type} (${doc.buffer.length} bytes, isImage=${isImage})...`);
          if (isImage) {
            await sock.sendMessage(jefJid, {
              image: doc.buffer,
              caption: label,
              mimetype: doc.mediaType || "image/jpeg"
            });
          } else {
            await sock.sendMessage(jefJid, {
              document: doc.buffer,
              fileName: doc.name || `${doc.type}.pdf`,
              caption: label,
              mimetype: doc.mediaType || "application/pdf"
            });
          }
          console.log(`Doc ${doc.type} enviado OK`);
          await new Promise(r => setTimeout(r, 1000));
        } catch(e) {
          console.error(`Error enviando doc ${doc.type}:`, e.message);
        }
      }

      jefeEnviado = true;
      console.log(`✅ Todo enviado al jefe de ${store.name}`);

    } catch(e) {
      errorJefe = e.message;
      console.error("Error enviando al jefe:", e.message, e.stack);
    }
  }

  if (jefeEnviado) {
    reply(`✅ *¡Solicitud completada!*

Tu información y documentos fueron enviados al jefe de *${store.name}* por WhatsApp. 📲

Preséntate con tus documentos originales para firmar el pagaré. 🏪`);
  } else {
    reply(`✅ *¡Solicitud completada!*

Preséntate en *${store.name}* con tus documentos.

⚠️ _Error notificando al jefe: ${errorJefe} — muéstrale este resumen:_

${summary.slice(0,800)}`);
  }

  session.step = "done";
  clearSession(phone);
}

module.exports = { handleMessage };
