// config.js — Configuración central del bot
module.exports = {
  ANTHROPIC_KEY: process.env.ANTHROPIC_KEY || "",
  JSONBIN_KEY:   process.env.JSONBIN_KEY || "",
  HISTORY_BIN:   process.env.HISTORY_BIN || "",
  PORT:          process.env.PORT || 3000,
  SITE_URL:      process.env.SITE_URL || "https://credito-villarreal.onrender.com",

  STORES: [
    { id:1,  name:"Puerta del Sol",      wa:"528136088992" },
    { id:2,  name:"Raúl Salinas",        wa:"528124259322" },
    { id:3,  name:"Sendero Escobedo",    wa:"528124368937" },
    { id:4,  name:"Anáhuac Plaza Bella", wa:"528115380037" },
    { id:5,  name:"Smart",               wa:"526462759725" },
    { id:6,  name:"Santo Domingo",       wa:"528127590860" },
    { id:7,  name:"Soriana Fresnos",     wa:"528115352945" },
    { id:8,  name:"Metroplex",           wa:"528123409292" },
    { id:9,  name:"Sendero Apodaca",     wa:"528128732583" },
    { id:10, name:"Santa Rosa",          wa:"528131401108" },
  ],

  PARENTESCO: ["Padre / Madre","Hermano/a","Tío/a 1er grado","Hijo/a","Suegro/a"],

  PROMPTS: {
    ine_front: `Eres verificador de documentos para crédito en México. El cliente mandó foto de su INE/IFE. Puede estar girada, oscura, sobre mesa — eso es normal. En INE mexicana: primera línea=APELLIDO PATERNO, segunda=APELLIDO MATERNO, tercera=NOMBRE(S). Acepta si ves cualquier credencial oficial aunque no sea perfecta. Solo rechaza si es selfie sin documento o imagen completamente negra. Extrae todos los datos. Responde ÚNICAMENTE JSON sin backticks: {"valid":true,"apellido_paterno":"o null","apellido_materno":"o null","nombres":"o null","dob":"DD/MM/YYYY o null","curp":"o null","ine_calle":"o null","ine_colonia":"o null","ine_cp":"o null","ine_municipio":"o null","ine_estado":"o null","message":"ok"}`,

    ine_back: `Eres verificador. El cliente mandó foto del reverso de su INE. Puede estar girada u oscura. Acepta si ves códigos QR, barras, texto alfanumérico del INE. Solo rechaza si es completamente ilegible. Responde ÚNICAMENTE JSON: {"valid":true,"message":"ok"}`,

    income_proof: `Eres verificador financiero México. El cliente mandó comprobante de ingresos (foto o PDF). Acepta: nómina, estado de cuenta, carta laboral, remesas. Carta laboral cuenta como 3 meses. Solo rechaza si es selfie o imagen ilegible. Responde ÚNICAMENTE JSON: {"valid":true,"amount":"$X,XXX o null","docType":"tipo","meses_cubiertos":1,"message":"ok"}`,

    address_proof: `Eres verificador México. Solo acepta: recibo CFE (luz), agua (SIMAS/SADM), predial, escrituras notariadas, INFONAVIT, gas. RECHAZA: estados de cuenta bancarios, contratos renta, facturas de tiendas, cualquier PDF que no sea servicio domiciliario. Responde ÚNICAMENTE JSON: {"valid":true,"address":"dirección o null","docType":"CFE|agua|predial|escrituras|INFONAVIT|gas","message":"descripción"}`,

    credit_score: (data) => `Eres analista de crédito para Crédito Villarreal, mueblería en México nivel socioeconómico medio-bajo. Analiza la solicitud. DATOS: ${JSON.stringify(data)}. CRITERIOS: ingresos mínimos $4,000/mes, estabilidad laboral 6+ meses, domicilio comprobable, edad 18-80. Responde SOLO JSON sin backticks: {"decision":"APROBADO","semaforo":"verde","puntaje":85,"resumen":"texto para jefe","fortalezas":["punto"],"alertas":["alerta"],"recomendacion_linea":"estimado"}`
  }
};
