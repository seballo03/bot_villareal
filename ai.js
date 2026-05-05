// ai.js — Verificación de documentos y análisis crediticio con IA
const fetch = require("node-fetch");
const { ANTHROPIC_KEY, PROMPTS } = require("./config");

async function callAnthropic(messages, maxTokens = 500) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}`);
  const data = await r.json();
  return data.content?.[0]?.text || "";
}

function parseJSON(text) {
  try {
    return JSON.parse(text.replace(/```json\n?|```\n?/g, "").trim());
  } catch { return null; }
}

async function verifyDocument(buffer, mediaType, docType) {
  if (!ANTHROPIC_KEY) return { valid: true, message: "Sin verificación IA" };
  try {
    const base64 = buffer.toString("base64");
    const prompt = PROMPTS[docType] || 'Responde SOLO JSON: {"valid":true,"message":"ok"}';
    const isImg = mediaType.startsWith("image/");
    const item = isImg
      ? { type: "image",    source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
    const text = await callAnthropic([{ role: "user", content: [item, { type: "text", text: prompt }] }]);
    return parseJSON(text) || { valid: true, message: "Documento recibido" };
  } catch (e) {
    console.error("verifyDocument error:", e.message);
    return { valid: true, message: "Documento recibido" };
  }
}

async function getCreditScore(appData) {
  if (!ANTHROPIC_KEY) return null;
  try {
    const prompt = PROMPTS.credit_score(appData);
    const text = await callAnthropic([{ role: "user", content: prompt }], 800);
    return parseJSON(text);
  } catch (e) {
    console.error("getCreditScore error:", e.message);
    return null;
  }
}

module.exports = { verifyDocument, getCreditScore };
