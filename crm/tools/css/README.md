# CSS e fontes do CRM

O CRM abre sem internet: o estilo e as fontes são arquivos locais em `crm/public/assets`.
Nada é carregado de CDN. Esta pasta guarda o que é preciso para **regenerar** o CSS. O aluno
nunca precisa fazer isto; só quem mantém o repositório, quando mudar uma classe do Tailwind no
`crm/public/index.html`.

| Arquivo | O que é |
|---|---|
| `public/assets/tailwind.css` | CSS gerado (Tailwind 3.4.17, minificado). Não edite à mão. |
| `public/assets/fonts.css` | `@font-face` das duas fontes. |
| `public/assets/fonts/*.woff2` | Inter e JetBrains Mono (variáveis, subconjunto latino). |
| `public/assets/fonts/LICENSE-*.txt` | Licença das fontes (SIL Open Font License 1.1). |
| `tools/css/tailwind.config.js` | O tema da ZX LAB (cores e fontes), antes embutido no `index.html`. |
| `tools/css/input.css` | Entrada do Tailwind. |

O CSS próprio da página (`.card`, `.btn`, `.badge`...) continua no `<style>` do `index.html`.
O `tailwind.css` é carregado **depois** desse `<style>`, de propósito: assim as classes
utilitárias (`text-accent-light`, `w-auto`...) ganham das classes da página, como acontecia com
o Tailwind do CDN.

## Regenerar o CSS

Na pasta `crm/`:

```bash
npx --yes tailwindcss@3.4.17 -c tools/css/tailwind.config.js -i tools/css/input.css -o public/assets/tailwind.css --minify
```

O Tailwind lê as classes que aparecem no texto de `public/index.html`. Escreva sempre a classe
inteira (`text-ok`), nunca montada por pedaços (`'text-' + cor`), senão ela não entra no CSS.
Depois de regenerar, abra o CRM e confira as telas.

## Atualizar as fontes

As fontes vêm dos pacotes `@fontsource-variable/inter` e `@fontsource-variable/jetbrains-mono`
(versão 5.3.0 quando foram embutidas). Copie de `files/` os arquivos
`*-latin-wght-normal.woff2` e o `LICENSE` de cada pacote, e mantenha o `fonts.css`.
