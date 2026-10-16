# Troubleshooting — ZX Control 7 · Setup 17

Problemas comuns, causas e soluções. Se o problema não estiver aqui, abra o Claude
Code e descreva o que está acontecendo — ele pode diagnosticar a partir dos
arquivos de log do projeto.

---

## 1. Evolution API não conecta / WhatsApp desconecta durante o dia

**Sintoma:** O dispatcher para de enviar mensagens, ou `npm run setup` mostra que
a instância não está com `state: open`.

**Causa:** Container da Evolution parado, sessão do WhatsApp perdida (celular sem
internet, WhatsApp desvinculado manualmente) ou Docker Desktop fechado.

**Solução:**

```bash
# 1. Confirme que o Docker Desktop está aberto e o container está rodando
cd dispatcher
docker compose ps

# 2. Se não estiver, suba de novo
docker compose up -d

# 3. Confira o estado da instância
npm run setup
```

Se `npm run setup` disser que a instância existe mas não está conectada, abra
`http://localhost:8080/manager`, selecione a instância e escaneie o QR code de
novo (WhatsApp > Dispositivos Vinculados > Vincular dispositivo). Depois:

```bash
npm start
```

O dispatcher retoma de onde parou — mensagens já enviadas não são duplicadas.

> **Prevenção:** mantenha o celular do número de prospecção com internet estável
> e bateria carregada durante o horário de disparo (10h–18h).

---

## 2. Docker não sobe / "Cannot connect to the Docker daemon"

**Sintoma:** `docker compose up -d` falha com erro de conexão com o daemon.

**Causa:** Docker Desktop não está aberto, ou não terminou de iniciar.

**Solução:** abra o Docker Desktop, espere o ícone indicar que ele está rodando
(pode levar 30–60s na primeira vez do dia), e rode `docker compose up -d` de novo.

Se o Docker Desktop não estiver instalado, veja o link no `README.md` (seção de
pré-requisitos).

---

## 3. Leads não saindo mesmo com o dispatcher rodando

**Sintoma:** O dispatcher está ativo (terminal aberto, sem erros), mas nenhuma mensagem está sendo enviada.

**Checklist:**

**a) Verifique se há leads na fila:**
```bash
cd dispatcher && npm run status
```
Se mostrar `0 leads na fila`, o arquivo de fila pode não ter sido gerado na Fase 2.

**b) Verifique o horário:**
O dispatcher só envia entre 10h e 18h em dias úteis. Fora desse horário, ele aguarda silenciosamente.

**c) Verifique se o arquivo de fila existe:**
```bash
ls pipeline/queue-$(date +%Y-%m-%d).json
```
Se o arquivo não existir, a Fase 2 (Claude Code) não foi concluída corretamente. Rode novamente:
```
lê o enriched-leads mais recente e roda o pipeline
```

**d) Verifique o conteúdo do arquivo de fila:**
```bash
cat pipeline/queue-$(date +%Y-%m-%d).json
```
O arquivo deve ter um array com pelo menos um objeto de lead. Se estiver vazio (`[]`) ou malformado, refaça a Fase 2.

---

## 4. Claude Code não encontra a skill

**Sintoma:** Ao rodar o pipeline no Claude Code, ele não aplica a personalização esperada, ou dá erro mencionando que não encontrou a skill.

**Causa:** O arquivo da skill não está no caminho correto.

**Solução:**

Verifique se o arquivo existe:
```bash
ls .claude/skills/
```

Você deve ver uma pasta com o nome `bdr-{slug}`. Dentro dela:
```bash
ls .claude/skills/bdr-{slug}/
```

Deve conter o arquivo `SKILL.md`. Se a pasta não existir, o setup não foi concluído. Rode:

```bash
node setup/setup.js
```

Se a pasta existir mas o SKILL.md estiver vazio ou com o template não preenchido, o Claude Code vai usar o template padrão. Preencha a skill conforme `docs/personalizando-skill.md`.

---

## 5. Enriquecimento não produz leads

**Sintoma:** `enrich-sites.py` ou `enrich-instagram.py` rodam sem erro, mas
`pipeline/enriched-leads-{data}.json` sai vazio ou não é criado — ou o mesmo
acontece quando você pede pro Claude Code enriquecer pelo navegador dele.

**Checklist:**

**a) O pool tem leads pending?**
```bash
cat pipeline/pool-prequalificados.json | grep -c '"status": "pending"'
```
Se der 0, rode a Fase 0 com um novo dataset da Apify antes de continuar.

**b) Token da Apify (só importa na Fase 0, ao rodar `build-pool.py`):**
Verifique o token em `docs/comandos-diarios.md` (arquivo gerado pelo setup, só seu). O token começa com `apify_api_...`.

**c) Actor ID:**
Confirme que o `APIFY_ACTOR_ID` em `.claude/contexto-local.md` está correto. Você encontra o ID na URL do actor na Apify: `apify.com/actors/{actor-id}`.

**d) Dataset do actor:**
O actor precisa ter rodado pelo menos uma vez e gerado resultados. Acesse o Apify Console, abra o actor, vá em **Last Run** e confira se há itens no dataset.

**e) Formato do celular:**
O sistema filtra apenas leads com celular no formato brasileiro (`+55` seguido de DDD + número com 9 dígitos). Se os leads no dataset estão com formato diferente (sem `+55`, com espaços, etc.), o filtro vai descartar todos.

Formato aceito: `+5511999990000`, `+5521987654321`
Formato rejeitado: `11999990000`, `(11) 99999-0000`, `55 11 99999-0000`

**f) Se enriqueceu pelo Claude Code (navegador dele) e o arquivo saiu incompleto:**
Peça pra ele conferir de novo os leads que ficaram com `followers`/`meta_ads`
nulos — às vezes o Instagram pede login no meio de um lote grande (é por isso
que o script `enrich-instagram.py` continua sendo a opção mais confiável pra
10+ leads por dia; veja `docs/operacao-diaria.md`).

---

## 6. Dispatcher enviou mensagem duplicada

**Sintoma:** Um lead recebeu a mesma mensagem duas vezes.

**Como funciona a proteção:** O sistema usa o `leads-master.json` para rastrear envios. Antes de cada envio, o dispatcher verifica se aquele toque já foi enviado para aquele número.

**Se a duplicação ocorreu, investigue:**

```bash
cat pipeline/log-disparos.json | grep "[número do lead]"
```

Isso vai mostrar todos os envios registrados para aquele número, com timestamp.

**Ação manual para evitar novos envios para o lead afetado:**

```
# No Claude Code:
abre o leads-master.json e marca o lead [nome ou número] como responded
```

Ou edite diretamente o `leads-master.json` e altere o campo `"status"` do lead para `"responded"`.

**Causa mais comum de duplicação:** Dispatcher foi iniciado duas vezes ao mesmo tempo, ou foi reiniciado antes do arquivo de log ser atualizado. Por isso a regra: nunca rodar dois dispatchers simultaneamente.

---

## 7. Número restrito ou banido no WhatsApp

**Sintoma:** Conta com aviso de restrição temporária, ou "este número não pode
mais usar o WhatsApp".

Isso é um risco real e conhecido de qualquer automação de WhatsApp não oficial
(a instância Evolution do kit inclui). O kit já vem com limites pra reduzir o
risco (intervalo entre mensagens, teto diário, respeito à janela de horário),
mas não elimina — a pergunta certa é "quando", não "se".

**Leia o guia completo antes de precisar dele:** `docs/Contingencia-WhatsApp-Setup17.pdf`
(ou a versão `-Mobile.pdf`, pra ler no celular sem dar zoom).
Ele cobre erro de sessão, restrição temporária e banimento — o que fazer em cada
caso, como manter um número reserva aquecendo, e o prompt pronto pra pedir ao
Claude Code que suba uma instância Evolution nova.

**Resumo rápido:**
- **Erro de sessão** (sem aviso, app funciona normal): espere 24h, suba Evolution zerada.
- **Restrição temporária** (24–48h): número reserva assume em instância nova;
  o restrito volta depois em instância limpa, com motor `whatsapp-web.js`
  (peça ao Claude Code: "troque o motor desse número de Evolution API para
  whatsapp-web.js").
- **Banimento:** abandone o número, suba Evolution nova, do zero, com o reserva.

**Sempre tenha um segundo número aquecendo** (WhatsApp Business cadastrado, em
uso normal há pelo menos 3 dias) pronto pra assumir. Detalhes no PDF.

---

## 8. Claude Code está gerando copies genéricas

**Sintoma:** As copies saem corretas em formato, mas sem personalização real — parecem templates genéricos sem relação com o lead ou com o seu negócio.

**Causa A: Skill não personalizada**

Se a Seção 1 (identidade) e a Seção 2 (ICP) do SKILL.md estão com os valores do template, as copies vão ser genéricas. Preencha a skill com seus dados reais. Veja `docs/personalizando-skill.md`.

**Causa B: Falta de exemplos de copy no seu nicho**

Adicione exemplos de copies que você já usou e que funcionaram na seção **"Exemplos de copy aprovados"** do SKILL.md. O Claude vai calibrar o estilo a partir deles.

**Causa C: Leads chegando sem dados de enriquecimento**

Se o arquivo `enriched-leads-{data}.json` tem apenas dados básicos (nome, empresa, celular) sem dados de contexto (bio do Instagram, anúncios ativos, sinais do site), o Claude não tem material para personalizar.

Verifique o conteúdo de um lead enriquecido:

```bash
cat pipeline/enriched-leads-$(date +%Y-%m-%d).json | head -100
```

Cada lead deve ter o objeto `enrichment` com `instagram`, `meta_ads` e
`website_signals` preenchidos (ou `null` explícito, não ausente). Se estiver
vazio, a Fase 1a/1b não rodou até o fim — refaça (script ou Claude Code, veja
`docs/operacao-diaria.md`).

---

## 9. Erro "ENOENT pipeline/leads-master.json"

**Sintoma:** O dispatcher ou o Claude Code dão erro parecido com:
```
Error: ENOENT: no such file or directory, open 'pipeline/leads-master.json'
```

**No primeiro uso:** Este é o comportamento esperado. O `leads-master.json` é criado automaticamente no primeiro dispatch bem-sucedido. Aguarde o primeiro envio e o arquivo será criado.

**Se o erro persiste após o primeiro dispatch:**

Crie o arquivo manualmente:

```bash
echo '{}' > pipeline/leads-master.json
```

Isso cria um arquivo JSON vazio válido. O dispatcher vai populá-lo normalmente nos envios seguintes.

---

## 10. Volume alto — mais de um número, mais de uma pessoa usando

O kit já roda em cima da Evolution API (não é `whatsapp-web.js` direto), então
suporta múltiplas instâncias e webhooks nativamente — não é uma migração que
você precisa fazer, é só configurar:

- **Mais de um número:** suba outra instância na mesma Evolution
  (`http://localhost:8080/manager` → nova instância) e configure um segundo
  dispatcher apontando `EVOLUTION_INSTANCE` pra ela.
- **Mais de uma pessoa usando:** o CRM (`cd crm && npm start`) e a Evolution API
  atendem **só neste computador** (`127.0.0.1`), de propósito: o CRM não tem login,
  e quem alcançasse a porta pela rede conseguiria enviar WhatsApp pelo seu número.
  Para mais de uma pessoa, hospede os dois num servidor (VPS) atrás de um proxy
  com autenticação. Não abra as portas 3001 e 8080 para a rede.
- **Volume alto num único número:** o risco de restrição sobe com o volume.
  Veja o item 7 e `docs/Contingencia-WhatsApp-Setup17.pdf` antes de escalar.

---

## Suporte

Não resolveu? Fale com o suporte oficial da ZX LAB: https://suporte.zxlab.com.br/hub ou contato@zxlab.com.br. Inclua a saída de `node setup/smoke.mjs` e de `npm run status` (na pasta `dispatcher`).
