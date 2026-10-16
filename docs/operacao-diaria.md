# Operação Diária — ZX Control 7 · Setup 17

Rotina completa para um dia útil de prospecção. Siga as fases na ordem — cada uma depende da anterior.

> **Pré-requisito obrigatório:** Nunca inicie dois dispatchers ao mesmo tempo. Antes de começar, confirme que não há nenhuma instância do dispatcher rodando em outro terminal. Se houver dúvida, feche todos os terminais e reabra um novo.

---

## Fase 0 — Adicionar novo lote ao pool (quando necessário)

Esta fase **não é diária** — rode somente quando chegar um novo dataset da Apify ou quando o pool tiver menos de 30 leads com status `pending`.

1. Acesse o painel da Apify, abra o último run do seu actor e exporte o dataset como JSON.
2. Salve o arquivo na pasta do projeto (ex: `pipeline/dataset-2026-06-02.json`).
3. Execute o script de build do pool:

```bash
python3 scripts/build-pool.py pipeline/dataset-2026-06-02.json
```

O script vai normalizar os telefones, deduplicar contra o histórico, calcular o pre_score e adicionar os candidatos válidos ao arquivo `pipeline/pool-prequalificados.json`.

> **Quando reabastecer:** o script avisa automaticamente quando o pool cair abaixo de 30 leads pending.

---

## Fase 1a — Enriquecimento de site + Meta Ads (Terminal)

**Horário recomendado:** logo ao chegar, entre 8h e 9h.

Execute o script de enriquecimento de site:

```bash
python3 scripts/enrich-sites.py --n 10
```

O script vai:
- Selecionar os 10 próximos leads com status `pending` do pool
- Para cada um: detectar pixel FB, GA4, handle do Instagram no site, design signal
- Consultar a Meta Ads Library API (se `pipeline/.meta_token` estiver configurado)
- Salvar o resultado em `pipeline/site-enrichment-{YYYY-MM-DD}.json`

Leva menos de 2 minutos. Nenhum browser necessário.

> **Meta Ads token (opcional):** se o arquivo `pipeline/.meta_token` ainda não existir, crie-o com o conteúdo `APP_ID|APP_SECRET` (veja `docs/meta-ads-token.md` para instruções). Sem o token, o campo `meta_ads` fica null aqui na Fase 1a — o pipeline continua normalmente, e você confere a Biblioteca de Anúncios pelo Claude Code na Fase 1b (veja a alternativa logo abaixo).

---

## Fase 1b — Enriquecimento do Instagram (Terminal)

Execute o script de enriquecimento do Instagram:

```bash
python3 scripts/enrich-instagram.py
```

O script vai:
- Ler o `site-enrichment-{data-de-hoje}.json` produzido na Fase 1a
- Para cada lead: buscar o handle no Instagram, navegar ao perfil, extrair followers, posts, bio e engagement_signal
- Salvar o resultado em `pipeline/enriched-leads-{YYYY-MM-DD}.json`
- Marcar os leads como `enriched` no pool

> **Primeira vez:** você precisa fazer login antes de rodar o script pela primeira vez:
> ```bash
> python3 scripts/enrich-instagram.py --login
> ```
> Isso abre um browser real, você faz login no Instagram manualmente, e a sessão fica salva localmente em `scripts/.instagram-session.json`. Nas próximas vezes, rode sem `--login`.

### Alternativa — pelo próprio Claude Code, sem o script

Você não precisa instalar Playwright nem guardar sessão de login pra enriquecer.
No Claude Code (a mesma janela da Fase 2), cole:

```
enriquece o site-enrichment de hoje: pra cada lead, abre o Instagram (se tiver
handle) e a Biblioteca de Anúncios da Meta pelo teu navegador, e escreve o
enriched-leads de hoje no formato de sempre
```

O Claude Code lê `pipeline/site-enrichment-{data}.json`, navega o Instagram e a
Biblioteca de Anúncios da Meta (`facebook.com/ads/library` — pública, sem login,
sem token) com o próprio navegador dele, e grava `pipeline/enriched-leads-{data}.json`
no mesmo formato de sempre. A Fase 2 não muda nada, venha o arquivo de onde vier.

Nenhuma etapa do kit depende de outra ferramenta de IA — o Claude Code faz sozinho
o que antes precisava de um navegador à parte.

**Quando usar qual:**
| Situação | Use |
|---|---|
| 10+ leads por dia, todo dia | O script (Opção A) — mais rápido, não arrisca pedir login de novo no meio do lote |
| Lote pequeno, ou não quer instalar o Playwright | Claude Code (Opção B) |
| Meta Ads sem token configurado | Claude Code — a Biblioteca de Anúncios é pública, não precisa de token |

---

## Fase 2 — Qualificação e geração de copy (Claude Code)

1. Abra um terminal na pasta raiz do projeto.
2. Inicie o Claude Code com o modelo correto:

```bash
claude --model claude-sonnet-4-6
```

3. Aguarde o Claude Code carregar (ele vai reconhecer o `CLAUDE.md` do projeto automaticamente).
4. Confirme que o arquivo de leads enriquecidos existe:

```bash
ls pipeline/enriched-leads-*.json
```

5. Cole o comando no Claude Code:

```
lê o enriched-leads mais recente e roda o pipeline
```

6. O Claude Code vai:
   - Ler o arquivo `enriched-leads-{data-de-hoje}.json`
   - Para cada lead, rodar os 7 checks de qualificação da skill
   - Gerar copy + ata para os leads qualificados
   - Apresentar cada copy no terminal para sua aprovação

7. **Para cada lead**, você vai ver o copy proposto e terá três opções:
   - **Aprovar:** pressione Enter ou digite `ok`
   - **Editar:** digite a versão corrigida diretamente
   - **Pular o lead:** digite `skip` — o lead não entra na fila hoje

8. Ao final, o Claude Code salva `pipeline/queue-{YYYY-MM-DD}.json` com todos os leads aprovados e seus copies prontos para disparo.

> **Dica:** Se você editar muito as copies, considere atualizar os exemplos no seu `SKILL.md`. Copies editadas com frequência indicam que a skill pode ser melhor calibrada para o seu nicho.

---

## Stage 3 — Disparo via WhatsApp (Dispatcher)

1. Abra um **novo terminal** (não feche o Claude Code, mantenha em segundo plano se quiser).
2. Navegue até a pasta do dispatcher e inicie:

```bash
cd dispatcher && npm start
```

3. Na primeira vez do dia, o dispatcher vai exibir o QR code no terminal. Escaneie com o WhatsApp do número de prospecção (não o seu número pessoal).
4. Após autenticação, o dispatcher vai:
   - Ler a fila do dia (`pipeline/queue-{YYYY-MM-DD}.json`)
   - Enviar os toques respeitando a janela de 10h às 18h
   - Respeitar o intervalo mínimo de 120 segundos entre mensagens
   - Registrar cada envio em `pipeline/log-disparos.json`

5. **Deixe o terminal aberto** com o dispatcher rodando até as 18h. Minimizar está ok, fechar não.

> O dispatcher respeita a janela 10h–18h automaticamente. Se você iniciar às 9h, ele vai aguardar as 10h para começar a enviar.

---

## Como marcar uma resposta manualmente

Se um lead respondeu fora do WhatsApp (e-mail, ligação, LinkedIn) e você precisa pausar os toques automáticos para ele:

1. Abra o Claude Code (modelo Haiku para economizar — é uma edição trivial):

```bash
claude --model claude-haiku-4-5-20251001
```

2. Cole o comando:

```
abre o leads-master.json e marca o lead [nome ou número] como respondido
```

O Claude Code vai atualizar o status do lead para `responded`, e o dispatcher vai ignorá-lo nos próximos toques.

Alternativa manual: edite diretamente o `leads-master.json` e altere o campo `"status"` do lead para `"responded"`.

---

## Encerramento do dia

1. Às 18h (ou quando terminar o expediente), vá ao terminal do dispatcher e pressione:

```
Ctrl+C
```

2. Verifique o resumo do dia:

```bash
cd dispatcher && npm run status
```

Isso mostra:
- Quantas mensagens foram enviadas
- Quantos leads estão em cada fase do funil
- Quantos leads responderam hoje
- Erros de envio (se houver)

3. Feche os terminais. Não há mais nada para fazer até o próximo dia útil.

---

## Dicas operacionais

| Regra | Motivo |
|-------|--------|
| Nunca rodar em fins de semana | Mensagens de negócio no sábado/domingo têm taxa de resposta muito baixa e aumentam o risco de bloqueio |
| Respeitar a janela 10h–18h | O dispatcher já faz isso automaticamente, mas não inicie o Stage 3 fora desse horário esperando que funcione imediatamente |
| Não ultrapassar 15 msgs/dia nas primeiras 2 semanas | Aquecimento de número — aumente gradualmente para reduzir risco de ban |
| Não rodar dois dispatchers | Causa duplicação de mensagens e corrompe o log |
| Fazer Fase 1a antes das 9h | Garante que os leads estão prontos quando você for para a Fase 2 |
| Checar `npm run status` todo dia | Mantém visibilidade do funil sem precisar abrir arquivos JSON manualmente |
| Sessão do Instagram expira em ~30 dias | Se `enrich-instagram.py` travar no login, rode `--login` de novo para renovar |
