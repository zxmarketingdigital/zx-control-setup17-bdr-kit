# Token da Meta Ads Library (opcional)

Serve pra `scripts/enrich-sites.py` (Fase 1a) e `scripts/fill-meta-ads.py` consultarem
automaticamente, via API, se o lead está anunciando. **É opcional:** sem token, o
campo `meta_ads` fica `null` no enriquecimento por script, e você confere a
Biblioteca de Anúncios pelo Claude Code na Fase 1b (`docs/operacao-diaria.md`) —
sem precisar de nada disso.

Vale configurar se você enriquece 10+ leads por dia e quer isso automático, sem
depender de conferir manualmente.

## Como gerar

1. Acesse [developers.facebook.com/apps](https://developers.facebook.com/apps) e
   crie um app (tipo "Empresa" é o mais simples).
2. No painel do app, vá em **Configurações do app → Básico**. Copie o **ID do app**
   e a **Chave secreta do app** (pode pedir pra confirmar sua senha).
3. Monte o token juntando os dois com uma barra vertical, sem espaço:
   ```
   ID_DO_APP|CHAVE_SECRETA
   ```
4. Salve isso no arquivo `pipeline/.meta_token` (crie o arquivo, cole só essa
   linha) — ou defina a variável de ambiente `META_ADS_TOKEN` com o mesmo valor.

Pronto. Da próxima vez que rodar `enrich-sites.py`, o campo `meta_ads` já vem
preenchido pra cada lead.

## Cuidado

- **Nunca commite `pipeline/.meta_token`** — o `.gitignore` do kit já ignora esse
  arquivo, mas confira antes de subir o projeto pra qualquer lugar.
- A chave secreta do app dá acesso à conta de desenvolvedor da Meta que a criou.
  Trate como senha.

## Preencher leads que já foram enriquecidos sem token

Se você configurou o token depois de já ter rodado a Fase 1a em alguns leads:

```bash
python3 scripts/fill-meta-ads.py
```

(No Windows, `python` no lugar de `python3`.)

Ele varre o `enriched-leads-{data}.json` mais recente e preenche só quem estava
com `meta_ads` nulo.
