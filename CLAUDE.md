# ZX Control 7 · Setup 17

Este arquivo é **versionado**: o `git pull` pode atualizá-lo. O contexto do negócio do
aluno (nome, nicho, posicionamento, regras de operação) fica em
`.claude/contexto-local.md`, que o setup gera e que **não** sobe para o git. Ele é
importado logo abaixo; enquanto não existir, o setup ainda não foi rodado.

@.claude/contexto-local.md

## Instalação (Claude Code: leia isto primeiro)

Se `.claude/contexto-local.md` **não existe** e o usuário pediu pra instalar (por
exemplo, "instale esse setup"), siga o roteiro em `INSTALACAO-GUIADA.md` (a primeira
pergunta é se o negócio é uma agência de marketing ou outro B2B). Durante a instalação o
`setup/setup.js` cria `.claude/contexto-local.md`; **não edite este `CLAUDE.md`**.

Se `.claude/contexto-local.md` já existe, a instalação foi feita: siga o contexto
importado acima e a skill do negócio em `.claude/skills/`.

Exceção: se o usuário pedir **explicitamente** para reinstalar ou refazer a instalação
(por exemplo, "reinstale esse setup por cima"), siga o `INSTALACAO-GUIADA.md` mesmo com o
contexto existente. Reinstalar por cima é seguro: o setup guarda uma cópia `.bak-*` de
tudo que vai sobrescrever e mantém a chave da Evolution.
