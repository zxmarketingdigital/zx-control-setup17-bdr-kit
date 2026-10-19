// dispatcher/src/opt-out-detector.js
// Detecta, por regra (sem modelo), quando o lead pede pra parar de receber mensagem.
//
// Roda ANTES do modelo no modo automático e no "Puxar conversa do WhatsApp" do CRM:
// pedido de parar é decisão determinística, não pode depender de o modelo entender.
// Errar pro lado seguro: na dúvida entre "pediu pra parar" e "conversa normal", o custo
// de tratar como opt-out é perder uma conversa; o custo do contrário é denúncia e
// risco de banimento do número.
//
// Só pedido EXPLÍCITO de parar conta. "Não tenho interesse" não é opt-out: é recusa
// (o lead fica frio e pode ser retomado no futuro).

const normalize = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Mensagem que é só a palavra ("PARE", "Sair", "Stop").
const SO_A_PALAVRA = /^(pare|parar|sair|stop|remover|remova|remove|descadastrar|descadastre|unsubscribe)[\s.!?]*$/;

const PADROES = [
  // "pare de me mandar", "chega de me ligar", "deixa de insistir"
  /\b(pare|parar|para|chega|deixe|deixa) de (me )?(mandar|enviar|chamar|ligar|insistir|incomodar|procurar|contatar|escrever)\b/,
  // "não me mande mais", "não me chame", "não me ligue"
  /\bnao me (mande|manda|envie|chame|chama|procure|ligue|contate|incomode|escreva)\b/,
  // "não quero receber", "não quero mais contato", "não quero que me mande"
  /\bnao quero (mais )?(receber|contato|mensagem|mensagens|ser contatad[oa]|que (voce )?(me )?(mande|envie|chame|ligue|procure))/,
  // "Não quero." / "não quero mais, obrigado" (a mensagem inteira é a recusa)
  /^nao quero( mais)?[\s,.!]*(obrigad[oa])?[\s.!]*$/,
  // "tire meu número", "remova meu contato", "exclua meu cadastro"
  /\b(me )?(tire|tira|retire|remova|remove|exclua|apague|delete) (o |meu )?(meu )?(numero|contato|telefone|nome|cadastro)\b/,
  // "me tire da lista", "remova da sua base"
  /\b(tire|tira|retire|remova|remove|exclua|apague) (me |meu |o meu )?(numero |contato |telefone )?(da|de) (sua |seu |essa |esta |nossa )?(lista|base|cadastro)\b/,
  /\bnao (enviar|mandar) (mais )?(mensagem|mensagens|nada)\b/,
  /\bdescadastr/,
  /\bsair da (lista|base)\b/,
  // inglês
  /\bunsubscribe\b|\bremove me\b|\bstop (messaging|texting|sending|contacting)\b|\bdo not (contact|message|text) me\b|\bdon'?t (contact|message|text) me\b/,
];

// { optOut: boolean, matched?: string }
export function detectOptOut(text) {
  const t = normalize(text);
  if (!t) return { optOut: false };
  if (SO_A_PALAVRA.test(t)) return { optOut: true, matched: 'palavra isolada' };
  for (const re of PADROES) {
    if (re.test(t)) return { optOut: true, matched: re.source.slice(0, 48) };
  }
  return { optOut: false };
}
