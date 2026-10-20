// dispatcher/src/opt-out-detector.js
// Detecta, por regra (sem modelo), quando o lead pede pra parar de receber mensagem.
//
// Roda ANTES do modelo no modo automático, no "Puxar conversa do WhatsApp" do CRM e,
// no modo manual, antes de cada follow-up (index.js → checkBeforeFollowUp):
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
  .replace(/[\u200B-\u200D\uFEFF]/g, '') // caractere invisível colado ("Pare\u200B")
  .replace(/\s+/g, ' ')
  .trim();

// Mensagem que é só a palavra ("PARE", "Sair", "Stop").
const SO_A_PALAVRA = /^(pare|parem|parar|sair|stop|remover|remova|remove|descadastrar|descadastre|unsubscribe|cancelar|cancela|cancele|chega|basta)[\s.!?]*$/;

// A palavra com um "por favor"/"favor" em volta: "Por favor, pare." · "pare, por favor" · "Favor remover".
const PALAVRA_EDUCADA = /^(por favor|por gentileza|favor|pf|pfv|pfvr)?[\s,]*(pare|parem|parar|sair|stop|remover|remova|cancelar|chega)[\s,]*(por favor|por gentileza|pf|pfv)?[\s.!?]*$/;

const PADROES = [
  // "pare de me mandar", "chega de me ligar", "deixa de insistir"
  /\b(pare|parem|parar|para|chega|deixe|deixa|deixem) de (me )?(mandar|enviar|chamar|ligar|insistir|incomodar|procurar|contatar|escrever)\b/,
  // "não me mande mais", "não me chame", "não me ligue"
  /\bnao me (mande|manda|mandem|envie|enviem|chame|chama|procure|ligue|liguem|contate|incomode|escreva)\b/,
  // "não quero receber", "não quero mais contato", "não quero que me mande"
  /\bnao quero (mais )?(receber|contato|mensagem|mensagens|ser contatad[oa]|que (voce )?(me )?(mande|envie|chame|ligue|procure))/,
  // "Não quero." / "não quero mais, obrigado" (a mensagem inteira é a recusa)
  /^nao quero( mais)?[\s,.!]*(obrigad[oa])?[\s.!]*$/,
  // "tire meu número", "remova meu contato", "exclua meu cadastro"
  /\b(me )?(tire|tira|tirem|tirar|retire|remova|remove|removam|remover|exclua|exclui|excluam|excluir|apague|apagar|delete) (o |meu )?(meu )?(numero|contato|telefone|nome|cadastro)\b/,
  // "me tire da lista", "remova da sua base"
  /\b(tire|tira|tirem|retire|remova|remove|removam|exclua|exclui|excluam|apague) (me |meu |o meu )?(numero |contato |telefone )?(da|de|dessa|desta) (sua |seu |essa |esta |nossa )?(lista|base|cadastro)\b/,
  /\bnao (me )?(enviar|mandar|envie|enviem|mande|mandem) (mais )?(mensagem|mensagens|nada)\b/,
  // "não envie mais" / "não me mande mais" (a frase termina aí)
  /\bnao (me )?(envie|enviem|mande|mandem|manda|ligue|liguem) mais[\s.!]*$/,
  // "não entre em contato", "não entre mais em contato"
  /\bnao (me )?(entre|entrem|entra) (mais )?em contato\b/,
  // "me deixa em paz", "deixem-me em paz"
  /\b(me )?(deixa|deixe|deixem)(-me| me)? em paz\b/,
  // "quero sair" sozinho, ou "quero sair da lista/disso/daqui" (não pega "quero sair de férias")
  /\bquero (me )?sair( (da lista|da base|disso|daqui|dessa lista|desta lista))?[\s.!]*$/,
  /\bquero cancelar (o )?(recebimento|envio|as mensagens|isso)\b/,
  // "isso é spam", "para de spam"
  /\bspam\b/,
  /\bdescadastr/,
  /\bsair da (lista|base)\b/,
  // "não tenho interesse, pare" / "... Parem.": a mensagem termina com a ordem de parar
  /[,.;!]\s*(pare|parem|chega)[\s.!?]*$/,
  // "para com isso", "parar de receber", "não quero ser incomodado"
  /^(para|pare|parem) com isso\b/,
  /\b(parar|pare|parem) de receber\b/,
  /\bnao quero (mais )?ser (incomodad[oa]|contatad[oa]|perturbad[oa])\b/,
  // ameaça de denúncia/bloqueio: o próximo passo dele é denunciar o número
  /\b(vou|vamos) (te |lhe |voces )?(denunciar|bloquear|reportar)\b/,
  // inglês
  /\bunsubscribe\b|\bremove me\b|\bstop (messaging|texting|sending|contacting)\b|\bdo not (contact|message|text) me\b|\bdon'?t (contact|message|text) me\b/,
];

// { optOut: boolean, matched?: string }
export function detectOptOut(text) {
  const t = normalize(text);
  if (!t) return { optOut: false };
  if (SO_A_PALAVRA.test(t)) return { optOut: true, matched: 'palavra isolada' };
  if (PALAVRA_EDUCADA.test(t)) return { optOut: true, matched: 'palavra com por favor' };
  for (const re of PADROES) {
    if (re.test(t)) return { optOut: true, matched: re.source.slice(0, 48) };
  }
  return { optOut: false };
}
