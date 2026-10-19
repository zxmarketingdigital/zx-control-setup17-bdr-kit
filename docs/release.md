# Como publicar uma versão

Roteiro para quem mantém o repositório. O aluno não precisa disto.

A versão mora em **um arquivo só**, o `VERSION` (raiz). O `smoke.mjs` e o rodapé do CRM leem
dele. Um teste (`crm/test/version.test.js`) falha se o `VERSION`, os `package.json` (e
lockfiles) do `crm` e do `dispatcher` e a primeira entrada do `CHANGELOG.md` não baterem.

## Passo a passo

1. **Número novo.** Corrija = terceiro número (1.0.0 → 1.0.1), novidade compatível = segundo
   (1.0.0 → 1.1.0), mudança que exige ação do aluno = primeiro (1.0.0 → 2.0.0).
2. **Troque a versão nos cinco lugares:** `VERSION`, `crm/package.json`,
   `crm/package-lock.json` (duas ocorrências no topo), `dispatcher/package.json` e
   `dispatcher/package-lock.json` (duas ocorrências no topo). O teste do passo 4 confere.
3. **CHANGELOG.** Acrescente `## [X.Y.Z] — AAAA-MM-DD` no topo, com o que mudou (Segurança,
   Instalação, Funcionamento, Documentação) e o link da versão no rodapé do arquivo.
4. **Teste.**
   ```bash
   (cd crm && npm test)
   (cd dispatcher && npm test)
   python -m unittest discover -s scripts/tests
   node setup/smoke.mjs
   ```
5. **PDFs.** Se algum manual mudou, regere: `node docs/pdf-fonte/gerar-pdfs.mjs`.
6. **Commit e tag.**
   ```bash
   git commit -am "Versão X.Y.Z"
   git tag -a vX.Y.Z -m "ZX Control 7 · Setup 17 vX.Y.Z"
   git push && git push --tags
   ```
7. **Release no GitHub**, com os PDFs anexados:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <trecho do CHANGELOG> \
     docs/manual-instalacao-setup17.pdf docs/manual-uso-setup17.pdf \
     docs/Contingencia-WhatsApp-Setup17.pdf
   ```

## Depois de publicar

Avise os alunos para rodar `git pull` e `node setup/smoke.mjs` (veja "Como atualizar" no
`README.md`). A versão instalada aparece na primeira linha do smoke e no rodapé do CRM.
