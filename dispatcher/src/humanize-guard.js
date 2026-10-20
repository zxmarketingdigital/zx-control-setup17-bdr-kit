// dispatcher/src/humanize-guard.js
// Última barreira antes de o modo automático enviar qualquer coisa: no modo
// automático ninguém revisa a mensagem, então o checklist anti-IA da skill
// (seção 10) também roda aqui, de forma determinística. O prompt pede; o código
// garante.
//
// - Travessão e emoji: corrigidos na hora (troca por vírgula / remove).
// - Frase de robô ("fico à disposição", "espero que esteja bem"...): não dá pra
//   consertar sem reescrever, então a mensagem NÃO sai e o lead vai pro humano.

const ROBOT_PHRASES = [
  /fico [àa] disposi[çc][ãa]o/i,
  /qualquer d[úu]vida,? (estou|fico|me chama)/i,
  /espero (que (esteja|estejam) bem|ter ajudado)/i,
  /tenha um [óo]timo (dia|fim de semana)/i,
  /[óo]tima pergunta/i,
  /entendo perfeitamente/i,
  /^(perfeito|excelente|com certeza)[!.,]/i,
  /vale (a pena )?ressaltar/i,
  /[ée] importante destacar/i,
  /\bprezad[oa]s?\b/i,
  /\bcordialmente\b/i,
  /venho por meio desta/i,
  /\bpotencializ/i,
  /\balavanc/i,
  /\bsinergia\b/i,
];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

export function humanizeGuard(text) {
  let fixed = String(text || '');
  const fixes = [];

  if (/\s*[—–]\s*/.test(fixed)) {
    fixed = fixed.replace(/\s*[—–]\s*/g, ', ');
    fixes.push('travessão trocado por vírgula');
  }
  if (EMOJI.test(fixed)) {
    fixed = fixed.replace(EMOJI, '');
    fixes.push('emoji removido');
  }
  fixed = fixed.replace(/ {2,}/g, ' ').replace(/ ,/g, ',').replace(/,\s*,/g, ',').trim();

  const hit = ROBOT_PHRASES.find((re) => re.test(fixed));
  return {
    ok: !hit,
    text: fixed,
    fixes,
    reason: hit ? `frase com cara de robô: "${fixed.match(hit)[0]}"` : null,
  };
}
