# Escolhendo o Provedor de IA

O Setup 17 usa IA em dois momentos: enriquecimento de leads (Fase 1b — Instagram e
Meta Ads) e qualificação + geração de copy (Fase 2). **Os dois rodam pelo mesmo
Claude Code** — não há uma segunda ferramenta de IA no meio. Fase 1b tem também
um caminho sem IA nenhuma (o script `enrich-instagram.py`, puro Playwright).

---

## Seção 1: O que você já tem (Claude Pro/Max)

Se você tem uma assinatura Claude Pro ou Max, **já tem tudo que precisa para rodar o sistema inteiro**.

A Fase 2 — qualificação e geração de copy — usa o Claude da sua assinatura diretamente. Não há custo de API separado, não há chave para configurar. Você abre o Claude Code, roda o pipeline, e ele usa a mesma conta que você já paga mensalmente.

Isso cobre:
- Qualificação de leads (os 7 checks)
- Geração da copy do toque 1 e da ata por lead
- Revisão e ajuste interativo no terminal
- Enriquecimento pela Fase 1b, se você preferir pedir ao Claude Code em vez de rodar o script (mesma sessão, mesma assinatura — ver `docs/operacao-diaria.md`)

**Para a maioria dos usuários, isso é suficiente.** Você não precisa ler as seções 2 e 4 a menos que tenha uma necessidade específica.

O que o Claude Pro/Max não cobre:
- Rodar sem qualquer interação sua (headless 100% do tempo) — isso é o **modo automático** opcional do dispatcher, que usa `claude -p` com a mesma assinatura; veja `docs/modo-automatico.md`
- Integrações externas via API REST (casos avançados)

---

## Seção 2: Quando considerar outras APIs

Há dois cenários onde vale a pena olhar para APIs externas:

**Cenário A: Enriquecimento em volume muito alto, sem intervenção**

Fase 1a (site + Meta Ads via token) e Fase 1b via script (`enrich-instagram.py`)
já rodam 100% sozinhos, sem IA nenhuma. Se você quiser enriquecer com fontes
adicionais (análise de conteúdo de posts, resumo de histórico de empresa, etc.),
pode integrar APIs de LLM pra processar esse conteúdo antes da Fase 2.

Isso é opcional e não está no fluxo padrão do kit. O sistema funciona bem sem isso.

**Cenário B: Rodar sem assinatura Pro/Max**

Se preferir pagar por uso (pay-per-token) em vez de assinatura mensal, você pode configurar uma `ANTHROPIC_API_KEY` e rodar o Claude Code sem assinatura ativa. Veja a Seção 4.

---

## Seção 3: Tabela comparativa de provedores

Referência para copy gerada na Fase 2 (touch 1 = aproximadamente 400 tokens de input + 150 tokens de output).

| Provedor | Custo estimado / 1.000 leads | Facilidade de setup | Qualidade de copy | Recomendação |
|----------|------------------------------|---------------------|-------------------|--------------|
| **Claude Pro/Max** (assinatura) | Incluso na mensalidade | Zero configuração | Excelente — otimizado para o kit | Padrão recomendado |
| **Anthropic API** (pay-per-token) | ~R$ 8–15 / 1.000 leads¹ | Baixa (requer chave + config) | Excelente | Para quem não tem Pro/Max |
| **Google Gemini** (API) | ~R$ 2–5 / 1.000 leads¹ | Média (requer adaptação do prompt) | Boa, mas requer ajuste de prompts | Apenas para enriquecimento auxiliar |
| **OpenAI GPT-4o-mini** | ~R$ 3–8 / 1.000 leads¹ | Média (requer adaptação) | Boa para tarefas simples | Não recomendado para copy principal |

¹ Estimativas com câmbio aproximado. Valores variam conforme uso real e cotação.

**Nota sobre qualidade:** a skill foi escrita e calibrada para o Claude. Usar outro modelo na Fase 2 vai requerer ajustes de prompt — as copies podem sair com formato ou tom diferentes do esperado.

---

## Seção 4: Configurando ANTHROPIC_API_KEY no Claude Code

Use esta seção se você quer rodar sem assinatura Claude Pro/Max, pagando por uso via API.

**Passo 1: Criar a chave**

1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Faça login ou crie uma conta
3. Vá em **API Keys** no menu lateral
4. Clique em **Create Key**, dê um nome (ex: `zx-control-7`) e copie a chave gerada
5. Guarde em lugar seguro — ela não aparece novamente depois que você fechar a tela

**Passo 2: Configurar no ambiente**

Opção A — variável de ambiente (mais segura):

No terminal, antes de rodar o Claude Code:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
claude
```

Ou adicione ao seu `.bashrc` / `.zshrc` para persistir:

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc
```

Opção B — via `claude config`:

```bash
claude config set apiKey sk-ant-...
```

**Aviso importante:** a API key é separada da sua assinatura Pro/Max. Ter uma chave de API não ativa funcionalidades da assinatura, e ter assinatura Pro/Max não gera créditos de API automaticamente. São produtos distintos com cobranças distintas.

Se você já tem Pro/Max, **não precisa de API key** para o kit funcionar.

---

## Seção 5: Gemini para enriquecimento auxiliar (feature futura — v1.5)

> Esta seção descreve uma funcionalidade planejada que ainda não faz parte do kit atual.

O sistema atual (v1.x) não usa o Gemini em nenhuma etapa do core. A Fase 1b
(Instagram + Meta Ads) roda pelo script Playwright ou pelo próprio Claude Code
navegando direto nas páginas, e a Fase 2 processa os dados — sem terceira
ferramenta no meio.

**O que está sendo considerado para v1.5:**

Uma etapa opcional entre a Fase 1b e a Fase 2 onde um modelo como o Gemini Flash (disponível gratuitamente via Google AI Studio) poderia:

- Resumir bios longas de Instagram em 2–3 pontos de gargalo
- Extrair sinais de intenção de compra de posts recentes
- Condensar o histórico de anúncios do Meta Ads Library em uma linha de contexto

Isso reduziria o volume de tokens consumidos na Fase 2 e potencialmente melhoraria a precisão dos ângulos.

**Como ficaria na prática:**

```
Fase 1b: script ou Claude Code → enriched-leads brutos
Fase 1.5 (opcional): Gemini Flash → enriched-leads condensados
Fase 2: Claude Code → qualificação + copy
```

A integração usaria a [Google AI Studio API](https://aistudio.google.com) com o tier gratuito (até 1.500 requisições/dia no Gemini 1.5 Flash).

Se você tem interesse nessa feature, acompanhe as atualizações do kit. Por enquanto, o sistema funciona bem sem ela.
