// crm/src/evolution.js
// Cliente HTTP fino da Evolution API, usado pela aba "Prospecção Fria"
// pra checar o status da instância e mandar uma resposta manual a um lead ativo.
// Envio imediato, sem fila/pacing — é uma resposta humana a uma conversa em
// andamento, não o disparo automático de cadência (esse continua só no dispatcher).

const HTTP_TIMEOUT_MS = 15_000;

function base() {
  return (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
}
function apiKey() {
  return process.env.EVOLUTION_API_KEY || '';
}
function instanceName() {
  return process.env.EVOLUTION_INSTANCE || 'bdr-instance';
}

async function evo(method, endpoint, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${endpoint}`, {
      method,
      headers: { apikey: apiKey(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = typeof data === 'string' ? data : JSON.stringify(data);
      throw new Error(`Evolution ${res.status}: ${msg.slice(0, 200)}`);
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export async function getStatus() {
  const managerUrl = `${base()}/manager`;
  try {
    const data = await evo('GET', `/instance/connectionState/${instanceName()}`);
    const state = data?.instance?.state ?? data?.state ?? 'unknown';
    return { connected: state === 'open', state, instance: instanceName(), managerUrl };
  } catch (err) {
    return { connected: false, state: 'unreachable', instance: instanceName(), managerUrl, error: err.message };
  }
}

function digits(phone) {
  return String(phone).replace(/\D/g, '');
}

export async function sendMessage(phone, text) {
  if (!text?.trim()) throw new Error('Mensagem vazia');
  const number = digits(phone);
  const res = await evo('POST', `/message/sendText/${instanceName()}`, { number, text });
  const msgId = res?.key?.id;
  if (!msgId) throw new Error(`Envio sem confirmação da Evolution: ${JSON.stringify(res).slice(0, 160)}`);
  const chatId = res?.key?.remoteJid ?? `${number}@s.whatsapp.net`;
  return { chatId, messageId: msgId };
}
