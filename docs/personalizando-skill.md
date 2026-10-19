# Personalizando a Skill BDR

A skill é o coração do sistema. É ela que define quem é você, quem é o seu cliente ideal, e como o Claude vai escrever as copies de prospecção. Sem personalização, as copies saem genéricas. Com uma boa skill, elas soam como se você tivesse escrito manualmente.

Este guia explica o que mudar, o que não mudar, e como iterar.

---

## Onde fica o arquivo

```
.claude/skills/bdr-{slug}/SKILL.md
```

O `{slug}` é o identificador do seu negócio, definido durante o setup (ex: `bdr-consultoria-rh`, `bdr-agencia-criativa`). Se você não souber qual é o seu, rode:

```bash
ls .claude/skills/
```

Abra o arquivo no seu editor preferido ou no próprio Claude Code:

```
abre o SKILL.md da skill bdr
```

---

## Agência ou outro B2B: qual skill você tem

A primeira pergunta da instalação define qual versão da skill é gerada:

- **Agência de marketing:** a skill validada em operação real. ICP de 7 critérios
  lidos no digital do lead (Meta Ads, Instagram, site, pixel) e 7 ângulos prontos
  (criativo amador, saturação, posicionamento, site técnico, LP fraca, pipeline,
  previsibilidade). Se você é agência, mexa pouco: ajuste identidade e exemplos.
- **Outro B2B** (contabilidade, software, consultoria, indústria, serviços): a skill
  é montada a partir do **briefing do nicho** que o Claude Code faz com você na
  instalação. Entram: oferta, o que o cliente ganha, porte mínimo, decisor, as dores
  (como o cliente fala delas, que sinal público indica cada uma e o que custam),
  perguntas de qualificação, desqualificadores, objeções com a sua resposta, prova
  que pode ser citada e como é a call.

  O que você não respondeu aparece na skill em **"Lacunas do briefing"**, e o agente
  não preenche com suposição: sem prova informada, ele não cita caso nenhum; dor sem
  sinal público vira só hipótese do segmento; objeção sem resposta vai pro humano.
  Completar essas lacunas é a primeira coisa a fazer depois de uma semana rodando:
  edite a tabela da seção 4, a lista de perguntas da 9.2 e a de objeções da 9.2.1,
  e apague da lista de lacunas o que você completou.

No B2B o ranking do pool também muda. O arquivo `pipeline/icp-config.json` guarda as
categorias-alvo e as excluídas; o `build-pool.py` usa isso pra colocar no topo quem é
do seu nicho, descartar concorrente e aceitar telefone fixo (comum em empresa). Pra
mudar o nicho depois da instalação, edite esse arquivo e rode o `build-pool.py` de
novo com o dataset.

```json
{
  "business_type": "b2b",
  "target_categories": ["distribuidora", "indústria", "atacadista"],
  "exclude_categories": ["escritório de contabilidade"],
  "accept_landline": true
}
```

## Seções 9 a 11: a conversa depois da resposta

- **Seção 9 (conduzindo a conversa):** como ler a resposta, as perguntas de
  qualificação (uma por mensagem, no máximo três), quando propor a call e as regras
  de agendamento. É o que o modo automático segue e o que o prompt "Copiar pro
  Claude Code" da aba Prospecção Fria usa.
- **Seção 10 (checklist anti-IA):** travessão, emoji, abertura elogiosa, lista de
  três, fecho de atendimento. No modo automático parte disso também é checado no
  código antes do envio.
- **Seção 11 (limites):** o que o agente nunca faz sozinho (preço, proposta, áudio,
  agendar sem agenda conectada).

Pode adicionar exemplos seus na seção 9 (objeções que você mais ouve e como responde).
Não mude os nomes das ações (`reply`, `book_meeting`, `handoff_human`, `close`): o
dispatcher depende deles. Veja conversas completas em `docs/simulacoes-atendimento.md`.

---

## O que personalizar primeiro

### Seção 1 — Identidade

Esta seção define quem você é. Preencha com exatidão — o Claude usa esses dados para construir o contexto de cada mensagem.

Campos que você **deve** preencher:
- Seu nome e cargo
- Nome da empresa ou do seu negócio
- O que você entrega (em uma frase objetiva, sem jargão)
- Resultados típicos que você gera para clientes (números reais se tiver)
- Seu tom de voz (ex: direto, consultivo, descontraído-mas-profissional)

Exemplo preenchido:
```
Nome: Carlos Mendes
Cargo: Consultor de Aquisição de Talentos
Empresa: Mendes RH
Entrega: Reduzo o tempo de contratação de cargos técnicos de 60 para 15 dias
Resultado típico: 3 contratações/mês para times de engenharia sem headhunter caro
Tom: direto, sem enrolação, fala de igual para igual com gestores
```

### Seção 2 — ICP (Ideal Customer Profile)

Define quem você quer prospectar. Quanto mais específico, melhor o filtro de qualificação e melhor a copy.

Campos importantes:
- Segmento de mercado (ex: SaaS B2B, e-commerce, construtoras)
- Porte da empresa (faturamento estimado ou número de funcionários)
- Cargo do decisor (ex: Head de RH, CEO, Diretor Comercial)
- Sinais de compra que você busca (ex: empresa contratando muito, empresa com produto novo lançado)
- Sinais de descarte (ex: empresa muito pequena, segmento que você não atende)

### Seção 4 — Tabela gargalo → ângulo

Esta é a tabela mais importante da skill. Ela mapeia os problemas reais do seu nicho para os ângulos de abordagem que você vai usar nas copies.

Estrutura da tabela:

| Gargalo identificado | Ângulo de copy | Prova/ancoragem |
|----------------------|----------------|-----------------|
| [problema que o lead tem] | [como você abre a conversa] | [dado, caso, ou pergunta que ancora] |

**Como adaptar para o seu nicho:**

Se você é consultor de RH:
| Gargalo identificado | Ângulo de copy | Prova/ancoragem |
|----------------------|----------------|-----------------|
| Empresa com 5+ vagas abertas há mais de 30 dias | Custo invisível da vaga aberta | "Vaga técnica aberta por 45 dias custa ~R$18k em produtividade perdida" |
| Alta rotatividade (Glassdoor com reclamações) | Processo seletivo como filtro de fit cultural | "3 de 4 demissões no 1º ano têm origem no onboarding, não na competência" |
| Time pequeno de RH gerenciando muitas vagas | Leverage sem headhunter | "Estruturo o processo para que o gestor entreviste só os 3 melhores" |

Se você é de agência criativa:
| Gargalo identificado | Ângulo de copy | Prova/ancoragem |
|----------------------|----------------|-----------------|
| Instagram parado há +30 dias | Custo de oportunidade de presença parada | "Perfil parado não é neutro, ele comunica que a empresa não está operando" |
| Muitos posts genéricos sem engajamento | Diferença entre postar e prospectar via conteúdo | "Criei conteúdo para [cliente] que gerou 3 reuniões comerciais em 2 semanas" |

O princípio é sempre o mesmo: **gargalo específico → ângulo que cria urgência ou curiosidade → ancoragem com dado ou caso**.

---

## Como adicionar exemplos de copy para o seu nicho

O Claude aprende o padrão das suas copies a partir dos exemplos que você coloca na skill. Sem exemplos, ele vai fazer algo razoável mas genérico. Com 3 a 5 bons exemplos, ele replica seu estilo.

Onde adicionar: procure a seção **"Exemplos de copy aprovados"** no SKILL.md. Se não existir, adicione no final do arquivo.

Formato:

```markdown
## Exemplos de copy aprovados

### Touch 1 — Abertura (nicho: construtoras)
"Oi [Nome], vi que a [Empresa] está com obras em [Cidade]. 
Trabalho com construtoras de médio porte no RJ e SP reduzindo 
custo de subcontratação em projetos residenciais. 
Faz sentido conversar 15 minutos essa semana?"

### Touch 1 — Abertura (nicho: SaaS com time comercial)
"Oi [Nome], vi que vocês contrataram 3 SDRs nos últimos 2 meses.
Ajudo times comerciais a montar cadência de outbound sem depender 
de ferramenta cara. Posso mandar como funciona?"
```

Dicas para bons exemplos:
- Use copies que já funcionaram para você no passado
- Inclua o nicho no título do exemplo para o Claude contextualizar
- Não use copies longas — touch 1 deve ter no máximo 3 frases
- Evite formalidade excessiva e palavras como "solução", "parceria", "sinergia"

---

## O que NÃO mudar

Algumas partes do SKILL.md existem para garantir que o sistema funciona corretamente. Alterar essas seções pode quebrar o pipeline.

**Não altere:**

- **Estrutura dos 7 checks de qualificação** — esses checks determinam se um lead vai para a fila ou é descartado. Mudar os critérios sem entender o impacto pode resultar em leads ruins entrando na fila ou bons leads sendo descartados.
- **Formato da ata de qualificação** — o Claude gera um JSON estruturado que o dispatcher lê. Se você alterar os campos, o dispatcher não vai conseguir processar a fila.
- **Schema do output JSON** — os campos `lead_id`, `phone`, `copy`, `status` são obrigatórios no objeto de saída do pipeline. O dispatcher lê esses campos de `pipeline/queue-{data}.json` via `dispatcher/src/queue.js`. Não remova nem renomeie esses campos.
- **Regra de não prometer resultado financeiro** — isso é uma regra absoluta do sistema (veja abaixo).

---

## Regra absoluta: nunca prometer resultado financeiro

Nenhuma copy gerada pelo sistema pode conter promessa de resultado financeiro específico para o lead. Frases como "vou dobrar seu faturamento", "garanto X% de aumento em vendas", "você vai faturar R$50k a mais" são proibidas.

Isso está no SKILL.md e o Claude é instruído a rejeitar esses ângulos automaticamente. Se você tentar forçar uma copy com esse tipo de promessa, o sistema vai gerar uma versão sem ela.

O motivo é prático: além dos problemas legais com promessas financeiras, esse tipo de copy tem taxa de resposta baixa — soa como spam.

O que você pode usar: resultados típicos ("clientes similares reduziram X"), provas sociais ("ajudei 3 empresas como a sua a fazer Y"), e perguntas que criam curiosidade ("você sabe qual é o custo real de deixar essa vaga aberta?").

---

## Como iterar: o ciclo de melhoria

O processo recomendado para melhorar a skill ao longo do tempo:

1. **Rode o pipeline** com a skill atual e aprove as copies (mesmo as que não estão perfeitas)
2. **Observe as respostas** ao longo da semana — quais toques geraram mais engajamento?
3. **Identifique o padrão** — as copies que funcionaram têm alguma coisa em comum? (ângulo, tamanho, pergunta específica?)
4. **Atualize a skill** — adicione exemplos das copies que funcionaram, ajuste a tabela de ângulos
5. **Repita**

Não tente deixar a skill perfeita antes de rodar. A calibração real acontece com dados reais.

---

## Como testar a skill sem leads reais

Se você quer testar se a skill está bem configurada sem esperar pelo Stage 1, crie um lead fictício no Claude Code:

1. Abra o Claude Code:

```bash
claude
```

2. Cole o seguinte comando, substituindo pelos dados de um lead do seu nicho:

```
cria um lead de teste com esses dados e roda o pipeline:
nome: João Silva
empresa: Construtora Silva & Filhos
cargo: Sócio-diretor
celular: +5511999990000
instagram: @construtorasilva
site: construtorasilva.com.br
contexto: empresa com 4 vagas abertas no LinkedIn, perfil do Instagram parado há 45 dias
```

3. O Claude vai rodar os 7 checks de qualificação e gerar as copies para os 6 toques.
4. Avalie: o ângulo escolhido faz sentido para esse lead? A copy soa como você escreveria?
5. Se não estiver bom, ajuste a seção correspondente na skill e repita.

Você pode criar quantos leads de teste quiser. Eles não são salvos na fila real a menos que você explicitamente peça para salvar.
