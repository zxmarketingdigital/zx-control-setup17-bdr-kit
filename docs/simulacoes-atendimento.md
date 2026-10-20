# Simulações de atendimento

Conversas simuladas mostrando como o BDR se comporta do toque 1 até a call, com os
**pontos de inflexão** comentados: o momento em que a conversa pode desandar e o que
o agente faz pra contornar.

Tudo aqui segue a skill que o wizard gera (seção 9, condução da conversa, e seção 10,
checklist anti-IA). Os nomes, empresas e números são fictícios.

## Como ler

- **Contexto:** quem é o lead e o que o agente viu antes do toque 1.
- **Lead:** o que o lead mandou.
- **Agente:** o que o BDR responde. No fim de cada mensagem, entre crases, a **ação
  no modo automático**: `reply` (responde e segue), `book_meeting` (agenda direto),
  `close` (encerra) ou `handoff_human` (passa pra você).
- **⚡ Inflexão:** o que está em jogo naquele momento, o erro comum e o que o agente
  faz no lugar.

**Modo manual (padrão):** a conversa é a mesma. A diferença é que quem envia é você,
pela aba **Prospecção Fria**: o botão "Copiar prompt pro Claude Code" gera a sugestão,
você revisa, edita se quiser e clica em "Enviar agora".

**Modo automático:** o agente decide e envia sozinho, dentro da janela de envio, e só
oferece horário que está livre de verdade na sua agenda do Google.

**No CRM:** a aba **Simulações** mostra estas conversas em formato de WhatsApp, com a
análise de cada mensagem do agente (checklist anti-IA, o que a trava do modo automático
faria, tamanho e perguntas) e espaço pra você aprovar ou pedir ajuste. O painel lê este
arquivo: se editar, mantenha os rótulos `**Contexto:**`, `**Lead:**`, `**Agente:**`,
`**Toque 1 (Agente):**` e `> ⚡ **Inflexão: ...**` pra aba continuar entendendo.

---

## Personas das simulações

| | Agência de marketing | Outro B2B |
|---|---|---|
| Vendedor | **Lucas**, estrategista de growth pra clínicas de estética | **Renata**, contadora consultiva |
| Nicho | Clínicas de estética em Vitória-ES | Distribuidoras e pequenas indústrias do ES |
| Princípio | "Post bonito não enche agenda. Processo enche." | "Imposto se planeja antes, não se descobre depois." |
| Dores / ângulos | Setup validado (criativo, site, LP, pipeline) | Imposto pago a mais; caixa no escuro; fechamento do mês que atrasa |
| Decisor | Dono(a) ou sócio(a) da clínica | Dono ou sócio |

---

# Parte 1 — Agência de marketing

## A1. Curiosidade vira call (caminho feliz)

**Contexto:** Clínica Bella Vitta. Marina, dona. Nota 4,8 com 212 avaliações, anúncio ativo,
site sem pixel e sem GA4.
**Ângulo escolhido:** gargalo técnico de site (sinal confirmado, não inferido).

**Toque 1 (Agente):**
> Oi, Marina. Sou Lucas, trabalho com aquisição de pacientes pra clínicas de estética.
> A Bella Vitta tem uma reputação rara em Vitória, 4,8 com mais de 200 avaliações.
> Vi dois pontos no site que fazem o anúncio rodar sem medir o que traz paciente.
> Faz sentido uma ligação rápida pra eu te mostrar?

**Lead:** oi lucas, que pontos?

> ⚡ **Inflexão: curiosidade.** O risco aqui é entregar o diagnóstico inteiro no chat:
> a Marina lê, pensa "ah, é só isso" e some. O agente entrega **um** ponto concreto,
> pra ganhar crédito, guarda o outro e faz uma pergunta de qualificação.

**Agente:**
> Um deles: o site não tem rastreamento, então quem chega pelo anúncio e não agenda some
> sem deixar rastro. Hoje o que mais traz paciente novo, indicação ou anúncio? `reply`

**Lead:** mais indicação. o anúncio a agência que cuida mas sinceramente não sei se dá retorno

> ⚡ **Inflexão: dor admitida + tem agência.** Ela decide (é a dona), admitiu a dor
> ("não sei se dá retorno") e nada indica anti-fit. São 2 dos 3 sinais da seção 9.3:
> **hora de propor a call.** O erro comum é falar mal da agência atual. O agente nem
> toca no assunto. Oferece 2 horários livres da agenda, em dias diferentes.

**Agente:**
> Normal, e isso dá pra descobrir numa conversa de 10 minutos. Consegue terça às 10h
> ou quarta às 15h? `reply`

**Lead:** quarta 15h pode ser

**Agente:**
> Fechado, quarta às 15h.
>
> Link da call: https://meet.google.com/abc-defg-hij `book_meeting (quarta 15:00)`

**Resultado:** evento criado no Google Calendar com Meet, lead vira "Reunião agendada"
no CRM e o modo automático sai da conversa. O link foi anexado pelo sistema, não
escrito pelo agente.

---

## A2. Objeção "já tenho agência"

**Contexto:** Studio Pele. Carla, sócia. Anuncia com frequência, mas os mesmos 2 criativos
rodam há 2 meses.
**Ângulo:** saturação criativa.

**Toque 1 (Agente):**
> Oi, Carla. Sou Lucas, trabalho com aquisição de pacientes pra clínicas de estética.
> Vocês anunciam com constância, coisa que pouca clínica faz. O que notei é que os
> mesmos criativos rodam há semanas, e isso costuma cansar o público antes de cansar
> o orçamento. Podemos marcar uma ligação curta pra eu te mostrar?

**Lead:** já temos agência pra isso, obrigada

> ⚡ **Inflexão: objeção clássica.** Três erros comuns: rebater ("mas a sua agência..."),
> insistir, ou desistir na hora. O agente valida, reposiciona como segunda opinião e
> tenta a call **uma vez**.

**Agente:**
> Faz sentido, não é pra trocar ninguém. É uma segunda opinião sobre os criativos que se
> repetem há semanas. Se estiver tudo certo, você sai sabendo. Topa quinta às 16h? `reply`

**Lead:** vou ver com a minha sócia e te falo

> ⚡ **Inflexão: adiamento + outra pessoa decide.** Não é recusa, mas também não é sim.
> Insistir agora queima a relação. O agente abre espaço pra sócia entrar e combina
> quando retomar.

**Agente:**
> Claro. Se ajudar, a call pode ser com vocês duas. Posso te procurar na segunda pra
> saber? `reply`

**Lead:** pode sim

**Agente:**
> Combinado, falo com você na segunda. `close (adiado: segunda)`

**Resultado:** o lead vai pra "Precisa revisão" na aba Prospecção Fria, com a anotação
"Retomar combinado com o lead — adiado: segunda". O kit **não** retoma sozinho: como o
agente combinou o retorno, o lead fica visível pra você cumprir o combinado na segunda.

---

## A3. Preço antes da call e horário ambíguo

**Contexto:** Instituto Derma Plus. Dr. Rafael. Anúncio mandando pro Instagram, sem landing page.
**Ângulo:** LP de conversão fraca.

**Toque 1 (Agente):**
> Oi, Dr. Rafael. Sou Lucas, trabalho com aquisição de pacientes pra clínicas de estética.
> O Derma Plus já investe em anúncio, o que é ótimo. Só que o tráfego chega num lugar
> que não foi feito pra converter, e parte do investimento se perde no caminho.
> Faz sentido uma ligação rápida pra eu detalhar?

**Lead:** quanto custa o trabalho de vocês?

> ⚡ **Inflexão: preço antes de valor.** Passar número agora transforma a conversa em
> comparação de orçamento. Fugir da pergunta soa desonesto. O agente responde com
> honestidade (depende) e mostra que a call existe justamente pra isso.

**Agente:**
> Depende do que aparecer no diagnóstico. Às vezes é um ajuste pequeno, às vezes vira
> projeto. Por isso a conversa vem antes. Consegue 10 minutos essa semana? `reply`

**Lead:** pode ser amanhã à tarde

> ⚡ **Inflexão: horário ambíguo.** "Amanhã à tarde" não é horário. O erro é agendar
> 14h por conta própria e o lead não aparecer. O agente oferece 2 horários **livres**
> da tarde e deixa ele escolher.

**Agente:**
> Amanhã tenho 14h ou 16h30, qual fica melhor? `reply`

**Lead:** 16h30

**Agente:**
> Combinado, amanhã 16h30.
>
> Link da call: https://meet.google.com/xyz-abcd-efg `book_meeting (amanhã 16:30)`

---

## A4. Mensagem automática antes, humano depois

**Contexto:** Espaço Lumi. Toque 1 enviado às 10h14.

**Lead (10h14, 2 segundos depois):**
> Olá! Obrigado por entrar em contato com o Espaço Lumi 💜 Nosso horário de atendimento
> é de segunda a sexta, das 9h às 19h. Em breve retornaremos!

> ⚡ **Inflexão: away-message do WhatsApp Business.** Se o agente responder isso, está
> conversando com um robô e ainda parece robô também. O filtro reconhece o padrão por
> dois motivos: o texto bate com away-message ("obrigado por entrar em contato",
> "horário de atendimento", "em breve retornaremos") e a resposta chegou em 2 segundos,
> rápido demais pra alguém ter lido e digitado.
>
> **O que acontece:** nada é enviado. A mensagem aparece em "Prováveis mensagens
> automáticas" na aba Prospecção Fria, e o lead continua ativo na cadência normal,
> porque isso não conta como resposta.

**Lead (15h40):** oi! vi sua msg agora, pode falar

**Agente:**
> Oi! O Lumi tem avaliação ótima, mas quase não aparece quando alguém busca estética no
> bairro. Te mostro em 10 minutos, amanhã 11h ou 15h? `reply`

**Lead:** 11h tá ótimo

**Agente:**
> Fechado, amanhã às 11h.
>
> Link da call: https://meet.google.com/lmn-opqr-stu `book_meeting (amanhã 11:00)`

---

## A5. Quem responde não é quem decide

**Contexto:** Clínica Harmonie. Número atendido pela recepção.

**Lead:** Oi, aqui é da recepção. Quem cuida dessa parte é a Dra. Paula

> ⚡ **Inflexão: não é o decisor.** Vender pra recepção não adianta, e ignorar é
> falta de educação. O agente pede ajuda pra chegar na Dra. Paula.

**Agente:**
> Obrigado por avisar. Consegue me passar o contato dela, ou prefere encaminhar essa
> mensagem pra ela? `reply`

**Lead:** o número dela é 27 99811-2233

> ⚡ **Inflexão: contato novo.** Esse número não está no pipeline e não tem toque 1
> aprovado. Mandar mensagem pra ele sozinho seria disparo sem revisão. O agente
> agradece, sem prometer que vai ligar (isso é decisão sua), e passa pra você.

**Agente:**
> Valeu pela ajuda! `handoff_human (contato da decisora: Dra. Paula, 27 99811-2233)`

---

## A6. Pedido pra parar

**Contexto:** qualquer lead, logo depois do toque 1 ou de um follow-up.

**Lead:** não tenho interesse, pode tirar meu número

> ⚡ **Inflexão: opt-out.** Qualquer tentativa aqui ("posso só te perguntar por quê?")
> vira denúncia de spam e queima o número. O agente encerra com uma frase e para.

**Agente:**
> Tranquilo, não te mando mais nada. Obrigado pelo retorno. `close (opt_out)`

**Variação hostil:** "de novo isso? já falei pra parar, vou denunciar"

**Agente:**
> Desculpa, não vai mais acontecer. `close (opt_out)`

**Resultado:** lead marcado com `opt_out`, cadência parada, número não volta pro pool.

---

## A7. Qualificar antes de agendar (opção ligada)

**Contexto:** Clínica Bella Vitta, depois do toque 1 (o mesmo do A1). Modo automático
ligado e, dentro dele, "Qualificar antes de agendar" também ligada, com faturamento
mínimo de R$ 600 mil por ano.

**Lead:** achei interessante, quero entender melhor. pode ser essa semana

> ⚡ **Inflexão: interesse antes da qualificação.** Sem a opção ligada, o agente já
> ofereceria dois horários. Com ela, falta saber o faturamento e quem decide. O erro
> comum é fazer as duas perguntas juntas, ou perguntar "qual o faturamento?" seco,
> que soa como triagem. O agente aceita a conversa e pergunta o faturamento como
> preparação da call, em faixa.

**Agente:**
> Consigo sim. Pra eu chegar com o diagnóstico certo: a clínica fatura mais perto de
> 50, 100 ou 200 mil por mês? `reply`

**Lead:** uns 120 mil por mês

> ⚡ **Inflexão: faturamento confirmado, falta autoridade.** 120 mil por mês dá
> R$ 1,44 milhão por ano, acima do mínimo. O sistema registra o trecho "uns 120 mil
> por mês" como dito pela lead. Falta saber se ela decide sozinha.

**Agente:**
> Boa. E essa decisão é só sua ou tem sócia junto? `reply`

**Lead:** tenho uma sócia, mas quem bate o martelo sou eu

> ⚡ **Inflexão: qualificada.** Faturamento acima do mínimo e ela decide. Agora sim o
> agente propõe os dois horários livres. Se ela tivesse dito "uns 30 mil por mês",
> abaixo do mínimo, o agente não proporia call: o lead iria pra você decidir se abre
> exceção.

**Agente:**
> Então vale a conversa. Essa semana tenho horário na terça 10h e na quinta 14h. Qual
> você prefere? `reply`

**Lead:** terça 10h

**Agente:**
> Fechado, terça às 10h.
>
> Link da call: https://meet.google.com/qwe-rtyu-iop `book_meeting (terça 10:00)`

**Resultado:** no CRM, o lead mostra "Faturamento ✓ R$ 1,44 mi/ano" e "Autoridade ✓"
com as frases da lead. Se o agente tentasse agendar ou propor horário antes disso, o
sistema barraria e passaria o lead pra você.

---

# Parte 2 — Outro negócio B2B

## B1. Desconfiança, objeção e agendamento com o sócio

**Contexto:** Distribuidora Norte Alimentos. WhatsApp Business num telefone fixo, sem nome
de pessoa identificado. Dois centros de distribuição, vaga aberta pra auxiliar fiscal.
**Dor escolhida:** imposto pago a mais (indício: crescimento + contratação na área fiscal,
marcado como inferência na ata).

**Toque 1 (Agente):**
> Oi! Sou Renata, contadora focada em revisão tributária pra distribuidoras.
> A Norte já opera com dois centros de distribuição, porte que pouca empresa tem no ES.
> Vi a vaga aberta pra área fiscal, e nessa fase é comum ter imposto pago a mais sem
> ninguém notar. Faz sentido uma ligação de 10 minutos pra eu te mostrar onde olhar?

Sem nome de pessoa, a mensagem abre em "Oi!" em vez de inventar um nome.

**Lead:** quem é você? como conseguiu esse número?

> ⚡ **Inflexão: desconfiança.** Justificativa longa soa como golpe. O agente responde
> em uma linha, com a origem real do número.

**Agente:**
> Justo perguntar. Peguei no Google Maps da Norte, é o número público de vocês. Sou
> contadora aqui em Vitória e atendo empresa do Lucro Presumido. `reply`

**Lead:** a gente já tem contador

> ⚡ **Inflexão: a objeção central em serviço B2B recorrente.** Ninguém troca de
> contador por WhatsApp. O agente não pede troca: reposiciona como segunda leitura e
> faz uma pergunta de qualificação.

**Agente:**
> Imaginei. Não é pra trocar, é uma segunda leitura do enquadramento. Hoje vocês estão
> no Presumido ou no Real? `reply`

**Lead:** presumido, faturamos uns 8 milhões por ano

> ⚡ **Inflexão: informação de porte.** Fit forte. A tentação é dar o diagnóstico
> ("com esse faturamento vocês deveriam ir pro Real"). O agente só sinaliza que vale
> conferir e guarda a análise pra call.

**Agente:**
> Com esse faturamento, vale conferir se o Presumido ainda é o melhor regime pra vocês.
> Sem os números eu estaria chutando. Essa semana tenho horário na terça 10h e na
> quinta 14h. Qual você prefere? `reply`

**Lead:** quinta 14h, mas quem decide isso é meu sócio, posso chamar ele?

**Agente:**
> Pode sim, melhor ainda. Quinta às 14h com vocês dois.
>
> Link da call: https://meet.google.com/qrs-tuvw-xyz `book_meeting (quinta 14:00)`

---

## B2. "Manda por e-mail que eu vejo"

**Contexto:** Metalúrgica Serra. Antônio, dono. Algumas avaliações de clientes citam
atraso na nota fiscal.
**Dor escolhida:** fechamento do mês que atrasa.

**Toque 1 (Agente):**
> Oi, Antônio. Sou Renata, contadora focada em indústria de pequeno porte.
> A Metalúrgica Serra tem cliente fiel há anos, dá pra ver nas avaliações. Algumas
> citam atraso na nota fiscal, e isso quase sempre vem de fechamento do mês travado.
> Consegue uma ligação rápida essa semana pra eu te mostrar o que costuma causar isso?

**Lead:** manda uma proposta por e-mail que eu vejo com calma

> ⚡ **Inflexão: dispensa educada.** "Manda por e-mail" quase sempre é um jeito gentil
> de encerrar. O agente tenta a call uma vez, com um motivo concreto.

**Agente:**
> Posso até enviar. Só que proposta sem ver como vocês fecham o mês tende a ficar
> genérica. Consigo te ligar? Em 2 minutos por telefone eu já te digo se vale a pena. `reply`

**Lead:** prefiro por email mesmo. antonio@metalserra-ficticio.com.br

> ⚡ **Inflexão: ele insistiu.** O agente não manda proposta (regra da skill). Aceita,
> responde com cortesia pra não deixar no vácuo e passa pra você.

**Agente:**
> Combinado, te escrevo por lá. `handoff_human (pediu proposta por e-mail: antonio@metalserra-ficticio.com.br)`

---

## B3. Anti-fit que só aparece na conversa

**Contexto:** Transportadora Litoral, depois do toque 1.

**Lead:** a gente fechou o CNPJ mês passado, tô só resolvendo as pendências

> ⚡ **Inflexão: anti-fit revelado.** Nenhum sinal público mostrava isso. Continuar
> seria constrangedor. O agente encerra com respeito.

**Agente:**
> Poxa, entendi. Obrigada por avisar, não te chamo mais. `close (anti_fit)`

---

## B4. O lead responde por áudio

**Contexto:** Distribuidora Norte Alimentos, depois do toque 1. Transcrição de áudio
ligada e "responder áudios" ligado no modo automático.

**Lead (áudio 0:20, transcrição automática):** Oi Renata, tudo bem? Vi sua mensagem
agora. Olha, a gente está no Presumido e fatura uns 8 milhões por ano. Meu sócio que
cuida dessa parte, mas pode ser uma conversa rápida na quinta de tarde.

> ⚡ **Inflexão: áudio com três informações de uma vez.** Regime, faturamento, quem
> decide e uma janela de horário vaga, tudo em 20 segundos. Os erros comuns: responder
> um parágrafo pra cada ponto, dizer "ouvi seu áudio" ou agendar "quinta de tarde"
> num horário escolhido pelo agente. O agente responde ao principal, curto, puxa o
> sócio pra call e oferece 2 horários livres dentro da tarde que o lead falou.

**Agente:**
> Com esse faturamento vale conferir o enquadramento. Quinta tenho 14h ou 16h, e o
> seu sócio pode entrar junto. Qual fica melhor? `reply`

**Lead:** 16h

**Agente:**
> Fechado, quinta às 16h com vocês dois.
>
> Link da call: https://meet.google.com/tuv-wxyz-abc `book_meeting (quinta 16:00)`

**Resultado:** o lead respondeu por áudio e o agendamento só aconteceu depois de ele
confirmar a hora **por escrito**. Se a transcrição tivesse saído com baixa confiança,
ou com o dia estranho ("quinta" virando "quinze"), nada seria enviado: o lead iria
pra "Precisa revisão" com a transcrição anexada, pra você ouvir e responder.

---

# Parte 3 — Antes e depois do checklist anti-IA

A mesma intenção, escrita do jeito que IA costuma escrever e do jeito que o agente
escreve depois do checklist da seção 10.

**Toque 1**

Com cara de IA:
> Olá, Marina! Espero que esteja bem! 😊 Meu nome é Lucas e sou especialista em
> marketing digital para clínicas de estética. Notei que sua clínica possui excelentes
> avaliações — parabéns! Além disso, identifiquei algumas oportunidades estratégicas
> que podem potencializar seus resultados. Que tal agendarmos uma reunião?

Depois do checklist:
> Oi, Marina. Sou Lucas, trabalho com aquisição de pacientes pra clínicas de estética.
> A Bella Vitta tem uma reputação rara em Vitória, 4,8 com mais de 200 avaliações.
> Vi dois pontos no site que fazem o anúncio rodar sem medir o que traz paciente.
> Faz sentido uma ligação rápida pra eu te mostrar?

O que saiu: saudação cerimoniosa, emoji, "especialista", travessão, elogio sem fato,
"além disso", "oportunidades estratégicas", "potencializar", "reunião".

**Resposta a objeção**

Com cara de IA:
> Entendo perfeitamente! Faz todo o sentido vocês já contarem com uma agência. No
> entanto, vale ressaltar que uma segunda opinião pode trazer insights valiosos,
> novas perspectivas e oportunidades de melhoria. Fico à disposição!

Depois do checklist:
> Faz sentido, não é pra trocar ninguém. É uma segunda opinião sobre os criativos que se
> repetem há semanas. Se estiver tudo certo, você sai sabendo. Topa quinta às 16h?

O que saiu: abertura de atendente, "vale ressaltar", regra de três, "insights", fecho
de robô. O que entrou: fato específico e um pedido claro.

**Confirmação de agendamento**

Com cara de IA:
> Perfeito! Sua reunião está agendada para quarta-feira às 15h. Qualquer dúvida,
> estou por aqui! Tenha um ótimo dia! 😊

Depois do checklist:
> Fechado, quarta às 15h.

---

# Resumo: o que o agente faz em cada situação

| Situação | Ação | Mensagem |
|---|---|---|
| Curiosidade ("que pontos?") | `reply` | 1 ponto concreto + guarda o resto + 1 pergunta |
| Interesse ou dor admitida | `reply` | 2 horários livres da agenda, dias diferentes |
| Interesse, com "Qualificar antes de agendar" ligado e faltando dado | `reply` | Pergunta o que falta (faturamento em faixa, depois autoridade), uma coisa por vez |
| Faturamento abaixo do mínimo | `handoff_human` | Nenhuma call proposta; você decide se abre exceção |
| Lead escolheu dia e hora | `book_meeting` | Confirmação curta; link do Meet anexado pelo sistema |
| Horário ambíguo | `reply` | Oferece 2 horários concretos no período que ele disse |
| Objeção | `reply` | Valida, reposiciona, tenta a call uma vez |
| Preço | `reply` | "Depende do diagnóstico", oferece a call |
| Desconfiança | `reply` | Origem do número em 1 linha |
| Não é o decisor | `reply` → `handoff_human` | Pede ajuda; se vier contato novo, passa pra você |
| Adiamento | `close (adiado)` | Combina quando retomar; lead fica em "Precisa revisão" com a data |
| Pediu e-mail, proposta, contrato | `handoff_human` | Cortesia curta, sem prometer prazo |
| Recusa ou pedido de parar | `close (opt_out)` | Uma frase e para |
| Anti-fit revelado | `close (anti_fit)` | Agradece e para |
| Áudio transcrito com confiança ("responder áudios" ligado) | `reply` | Responde ao ponto principal, curto; confirma dia e hora por escrito antes de agendar |
| Áudio com baixa confiança, foto, arquivo | `handoff_human` | Nada: vai pra você, com a transcrição anexada quando houver |
| Away-message | nenhuma | Aparece em "Prováveis mensagens automáticas"; cadência segue |
| 8º turno automático | `handoff_human` | Trava de segurança |
