// dispatcher/src/auto-reply-detector.js
// Reconhece padrão de mensagem automática (away-message do WhatsApp Business,
// autorresponder genérico) pra NÃO tratar como resposta real do lead.
//
// É heurística, não garantia — não existe flag confiável no WhatsApp pra
// "isso é away-message". Quando bate um padrão forte, marca como "provável
// mensagem automática" e NADA é respondido sozinho: fica pra revisão humana
// na aba Prospecção Fria.

const TEXT_PATTERNS = [
  /n[ãa]o\s+pod(e|emos)\s+atender.{0,40}(momento|agora)/i,
  /estamos?\s+(temporariamente\s+)?(indispon[íi]ve(l|is)|ausentes?|fora\s+do\s+ar)/i,
  /obrigad[oa]\s+por\s+(entrar\s+em\s+contato|sua\s+mensagem).{0,60}(retorn|em\s+breve)/i,
  /hor[áa]rio\s+de\s+atendimento[:\s]/i,
  /resposta\s+autom[áa]tica/i,
  /mensagem\s+autom[áa]tica/i,
  /este\s+(é\s+)?(um\s+)?n[úu]mero\s+(comercial\s+)?(automatizado|n[ãa]o\s+monitorado)/i,
  /no\s+momento\s+(estou|estamos)\s+aus(ente|entes)/i,
  /retornaremos?\s+(o\s+mais\s+r[áa]pido\s+poss[íi]vel|assim\s+que\s+poss[íi]vel|em\s+breve)/i,
  /seg(unda)?\s*(a|à|-)\s*sex(ta)?.{0,25}\d{1,2}h/i,          // "Seg a Sex, 9h às 18h"
  /voc[êe]\s+est[áa]\s+fora\s+do\s+(nosso\s+)?hor[áa]rio/i,
  /esta\s+é\s+uma\s+mensagem\s+enviada\s+automaticamente/i,
  /atualmente\s+n[ãa]o\s+estamos?\s+dispon[íi]ve(l|is)/i,
];

// Ninguém lê + digita + envia em menos de ~3s — sinal forte de bot/autorresponder.
const MIN_HUMAN_REPLY_MS = 3000;

export function detectAutoReply({ message, sentAt, receivedAt }) {
  const text = String(message || '');
  const reasons = [];

  for (const re of TEXT_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`padrão de texto reconhecido`);
      break;
    }
  }

  if (sentAt && receivedAt) {
    const deltaMs = new Date(receivedAt).getTime() - new Date(sentAt).getTime();
    if (deltaMs >= 0 && deltaMs < MIN_HUMAN_REPLY_MS) {
      reasons.push(`respondeu em ${deltaMs}ms — rápido demais pra ser humano digitando`);
    }
  }

  return { isAutoReply: reasons.length > 0, reasons };
}
