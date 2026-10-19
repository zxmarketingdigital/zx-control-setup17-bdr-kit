# Changelog

Todas as mudanças relevantes do ZX Control 7 · Setup 17 ficam aqui, da mais nova para a
mais antiga. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e
a numeração segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

A versão instalada aparece ao rodar `node setup/smoke.mjs` e no rodapé do CRM. Para
atualizar, veja "Como atualizar" no `README.md`.

## [1.0.0] — 2026-10-20

Primeira versão oficial do ZX Control 7 · Setup 17 (antes distribuído com outro nome).

### Segurança

- A Evolution API (a ponte com o WhatsApp) passa a escutar só no próprio computador
  (`127.0.0.1:8080`), com imagem de versão fixa e uma chave gerada pelo setup. Chave fraca ou
  de exemplo é recusada.
- O CRM escuta só em `127.0.0.1` e recusa requisições cujo `Host` ou `Origin` não sejam do
  próprio computador.
- Modo automático e "Gerar sugestão": o Claude roda sem acesso ao computador (sem ferramentas,
  sem arquivos, sem MCP), a mensagem do lead é tratada como dado, nunca como instrução, e
  nenhuma resposta sai sem passar por um filtro que barra chaves e segredos do projeto.
- O token da Apify não fica em nenhum arquivo do projeto: os comandos usam a variável de
  ambiente `APIFY_TOKEN`.
- O telefone do lead é mascarado também no arquivo `dispatcher.log`, que gira ao passar de 5 MB.

### Anti-banimento e conformidade

- Pedido explícito de parar ("pare", "sair", "não quero mais receber", "remove meu número"...)
  é detectado por regra, antes de qualquer IA. O lead vira opt-out e nunca mais entra na fila,
  nem por dataset novo. O CRM ganhou o botão "Não contatar mais".
- Teto de 20 leads novos por dia (`DAILY_NEW_CAP`).
- Se o número do lead não puder ser validado, o envio é pulado em vez de acontecer mesmo assim.
- Aviso no README sobre disparo frio, risco de banimento e LGPD.

### Instalação e atualização

- Instalação por repositório (`gh repo clone` ou o link no app Claude), com `CLAUDE.md`
  versionado e o contexto do seu negócio em `.claude/contexto-local.md`, fora do git. O
  `git pull` não conflita com a sua instalação.
- Versões fixas das dependências: `package-lock.json` no `dispatcher` e no `crm`,
  `scripts/requirements*.txt` no Python. O setup usa `npm ci`.
- O setup confere os pré-requisitos antes de começar (Node, Python, Docker, Docker Compose e
  se o Docker está rodando) e diz o que instalar em Windows, Mac e Linux.
- Reinstalar não destrói a sua personalização: antes de sobrescrever um arquivo, o setup guarda
  `<arquivo>.bak-AAAAMMDD-HHMMSS` e mantém a chave da Evolution que já existia.

### Funcionamento

- Telefone internacional: país padrão configurável (`DEFAULT_COUNTRY`) e validação por país,
  por exemplo Portugal.
- Fuso horário configurável (`TIMEZONE`) na janela de envio, nos follow-ups, na agenda do
  Google e no modo automático, com horário de verão.
- Modelo do Claude escolhido em um lugar só (`CLAUDE_MODEL`, opcional); a documentação não
  cita mais versão de modelo.
- CRM com módulos de gestão genéricos, para agência ou qualquer negócio B2B.
- O CRM abre sem internet: o estilo (Tailwind) e as fontes (Inter e JetBrains Mono, licença OFL)
  passam a ser arquivos locais em `crm/public/assets`, em vez de vir de `cdn.tailwindcss.com` e
  do Google Fonts. Como regenerar o CSS: `crm/tools/css/README.md`.

### Marca, licença e suporte

- Renomeado para ZX Control 7 · Setup 17, com a marca e o suporte oficiais da ZX LAB em todo o
  material (código, telas, manuais, PDFs).
- Licença sem fluxo de cadastro de comprador.

### Documentação

- Guia de primeiro uso (`docs/primeiro-uso.md`) e FAQ com 15 perguntas (`docs/faq.md`).
- Estimativa de custo da Apify por lote de 100 leads, no README.
- Manuais de instalação e de uso, e guia de contingência do WhatsApp, em PDF (`docs/`).
- Como publicar uma versão (`docs/release.md`).
- Roteiro de demonstração ao vivo de 20 minutos (`docs/demonstracao.md`) e dados de exemplo
  fictícios com `python scripts/seed-demo.py`. Os leads de exemplo têm o envio bloqueado no
  dispatcher, no modo automático e no "Enviar agora" do CRM; só o Lead de Teste (o número de
  teste do operador) recebe.
- Desinstalação e reinstalação por cima (`docs/desinstalar.md`) e roteiro de teste em máquina
  limpa para Windows e Mac (`docs/teste-instalacao-limpa.md`).

[1.0.0]: https://github.com/zxmarketingdigital/zx-control-setup17-bdr-kit/releases/tag/v1.0.0
