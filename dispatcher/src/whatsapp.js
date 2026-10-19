// Transporte de envio via Evolution API (Baileys) — sem Chrome/Puppeteer.
// Fala o protocolo do WhatsApp por HTTP local, resolve LID/9º dígito
// nativamente e valida se o número tem WhatsApp antes de enviar.
// Interface pública consumida por index.js/master.js: initWhatsApp / isReady /
// sendMessage / destroyClient / getClient.
import { config } from './config.js';
import { logger } from './log.js';

const MOD = 'whatsapp';
const HTTP_TIMEOUT_MS = 20_000;
const STATE_POLL_MS = 30_000;

let ready = false;
let onReadyCallback = null;
let firedReady = false;
let pollTimer = null;

function base() {
  return config.evolutionApiUrl.replace(/\/+$/, '');
}

async function evo(method, endpoint, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${endpoint}`, {
      method,
      headers: { apikey: config.evolutionApiKey, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      throw new Error(`Evolution ${res.status}: ${msg.slice(0, 160)}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function refreshState() {
  try {
    const data = await evo('GET', `/instance/connectionState/${config.evolutionInstance}`);
    const state = data?.instance?.state;
    const wasReady = ready;
    ready = state === 'open';
    if (ready && !wasReady) logger.info(MOD, `Evolution instance '${config.evolutionInstance}' open`);
    if (!ready && wasReady) logger.warn(MOD, `Evolution instance state=${state} — envios pausados até reconectar`);
    if (ready && !firedReady) {
      firedReady = true;
      onReadyCallback?.();
    }
  } catch (err) {
    if (ready) logger.warn(MOD, `Falha ao checar estado da Evolution: ${err.message.slice(0, 100)}`);
    ready = false;
  }
}

export async function initWhatsApp({ onReady } = {}) {
  onReadyCallback = onReady ?? null;
  if (!config.evolutionApiKey) {
    logger.error(MOD, 'EVOLUTION_API_KEY não configurada — defina no .env do dispatcher');
  }
  logger.info(MOD, `Usando Evolution API em ${base()} (instância ${config.evolutionInstance})`);
  await refreshState();
  pollTimer = setInterval(refreshState, STATE_POLL_MS);
}

export function isReady() {
  return ready;
}

// Normaliza para dígitos (sem '+'). O Baileys resolve 9º dígito/LID sozinho.
function digits(phone) {
  return String(phone).replace(/\D/g, '');
}

export async function sendMessage(phone, text) {
  if (!ready) throw new Error('Evolution instance not open');
  if (!text?.trim()) throw new Error('Cannot send empty message');

  const number = digits(phone);

  // 1) Valida se o número tem WhatsApp (resolve o JID correto). Se a checagem em si
  //    falhar (rede/endpoint), o envio é PULADO: mandar pra número não validado é o que
  //    mais gera denúncia. O lead continua na fila e é tentado de novo no próximo ciclo.
  let targetNumber = number;
  try {
    const check = await evo('POST', `/chat/whatsappNumbers/${config.evolutionInstance}`, { numbers: [number] });
    const info = Array.isArray(check) ? check[0] : null;
    if (info && info.exists === false) {
      throw new Error(`Número sem WhatsApp: ${phone}`);
    }
    if (info?.jid) targetNumber = info.jid.split('@')[0];
  } catch (err) {
    if (err.message.startsWith('Número sem WhatsApp')) throw err;
    logger.warn(MOD, `Validação de número falhou (${err.message.slice(0, 80)}) — envio pulado, tenta de novo no próximo ciclo`);
    throw new Error(`Não consegui validar o número ${phone} (${err.message.slice(0, 80)}): envio pulado`);
  }

  // 2) Envia
  const res = await evo('POST', `/message/sendText/${config.evolutionInstance}`, {
    number: targetNumber,
    text,
  });

  const msgId = res?.key?.id;
  if (!msgId) {
    throw new Error(`Envio sem confirmação da Evolution: ${JSON.stringify(res).slice(0, 160)}`);
  }

  const chatId = res?.key?.remoteJid ?? `${targetNumber}@s.whatsapp.net`;

  // 3) O aceite inicial (key.id) NÃO garante envio: o WhatsApp pode marcar
  //    ERROR de forma assíncrona segundos (às vezes minutos) depois. 45s é um
  //    meio-termo — não elimina o risco, por isso index.js/master.js também
  //    tratam "sent_unconfirmed" (PENDING neste prazo) como NÃO sucesso, sem
  //    avançar a cadência do lead.
  const verdict = await waitForStatus(msgId, 45_000);
  if (verdict === 'ERROR') {
    throw new Error(`WhatsApp rejeitou o envio para ${phone} (status ERROR pós-aceite)`);
  }
  const ackMap = { SERVER_ACK: 1, DELIVERY_ACK: 2, READ: 3, PLAYED: 3 };
  const ack = ackMap[verdict] ?? null; // PENDING/desconhecido → não confirmado

  if (ack === null) {
    logger.warn(MOD, `Status ${verdict ?? 'indisponível'} para ${phone} (id ${msgId}) — entrega NÃO confirmada`);
  } else {
    logger.info(MOD, `Sent to ${phone} via ${chatId} (${verdict}, ack ${ack}, id ${msgId}): "${text.slice(0, 50)}…"`);
  }
  return { chatId, ack, messageId: msgId, status: verdict ?? 'PENDING' };
}

async function fetchMessageStatus(msgId) {
  try {
    const data = await evo('POST', `/chat/findMessages/${config.evolutionInstance}`, {
      where: { key: { id: msgId } },
    });
    const records = data?.messages?.records
      ?? (Array.isArray(data?.messages) ? data.messages : null)
      ?? (Array.isArray(data) ? data : []);
    const rec = Array.isArray(records)
      ? (records.find((r) => r?.key?.id === msgId) ?? records[0])
      : null;
    return rec?.status ?? null;
  } catch {
    return null;
  }
}

async function waitForStatus(msgId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    last = await fetchMessageStatus(msgId);
    if (last && last !== 'PENDING') return last;
  }
  return last;
}

export async function destroyClient() {
  if (pollTimer) clearInterval(pollTimer);
  ready = false;
  logger.info(MOD, 'Transporte Evolution encerrado');
}

// Compat: nada de client puppeteer aqui. Mantido para não quebrar imports.
export function getClient() {
  return null;
}
