# Transcrição de áudio dos leads (opcional)

Lead brasileiro responde muito por áudio. Com a transcrição ligada, o kit
transforma o áudio em texto **na sua própria máquina** (faster-whisper) e usa esse
texto nos dois modos:

- **Modo manual:** na aba **Prospecção Fria**, abra o lead e clique em
  **"📥 Puxar conversa do WhatsApp"**. O CRM busca as mensagens que o lead mandou,
  transcreve os áudios e mostra cada um com o selo de confiança. O
  "📋 Copiar prompt pro Claude Code" já leva a transcrição, e a sugestão de
  resposta considera o que o lead falou.
- **Modo automático:** o áudio é transcrito assim que chega. Com a opção
  **"🎙 Responder áudios"** ligada (card do modo automático), o agente continua a
  conversa a partir do que o lead falou. Desligada, todo áudio vem pra você, já
  com a transcrição anexada.

O áudio não vai pra nenhum serviço externo e é apagado logo depois de transcrito.
Só o texto fica salvo, em `pipeline/responses.json`.

## Quando o agente NÃO responde sozinho

Mesmo com "responder áudios" ligado, o áudio vai pra você quando:

- a transcrição sai com **baixa confiança** (ruído, áudio cortado, fala longe do
  celular). O corte é `TRANSCRIBE_MIN_CONFIDENCE` (padrão 0,5);
- o áudio **não tem fala reconhecível** (silêncio, música, barulho);
- o lead passa dia, hora, nome ou número que ficou estranho na transcrição. O
  agente pergunta de novo em vez de assumir, e nunca agenda a partir de um trecho
  duvidoso.

Foto, vídeo e arquivo continuam indo sempre pra você.

## Como ligar

1. Instale o transcritor (uma vez):
   ```bash
   python -m pip install -r scripts/requirements-audio.txt
   ```
2. Baixe o modelo (uma vez, ~500 MB pro `small`, alguns minutos):
   ```bash
   python scripts/transcribe-audio.py --warmup --model small
   ```
3. Em **`dispatcher/.env` e `crm/.env`**, deixe:
   ```
   TRANSCRIBE_AUDIO=true
   PYTHON_CMD=python
   WHISPER_MODEL=small
   TRANSCRIBE_MIN_CONFIDENCE=0.5
   ```
4. Reinicie o dispatcher e o CRM.

Pela instalação guiada, é só dizer que quer a transcrição: o Claude Code faz os
quatro passos.

## Qual modelo usar

| Modelo | Download | Qualidade em português | Áudio de 20s, CPU comum |
|---|---|---|---|
| `base` | ~140 MB | boa em fala clara, troca palavra às vezes (no teste: "Viz" no lugar de "Vi") | ~6 s |
| `small` (padrão) | ~460 MB | o equilíbrio recomendado | entre os dois |
| `medium` | ~1,5 GB | a melhor dos três (no teste: texto 100% certo) | ~23 s |

Tempos medidos num notebook comum, já contando o carregamento do modelo; o `small`
fica entre os dois. Transcrição acontece fora do envio: o dispatcher continua
respeitando o intervalo entre mensagens.

## Testar sem lead real

Grave um áudio seu no WhatsApp, salve o arquivo `.ogg` e rode:

```bash
python scripts/transcribe-audio.py caminho/do/audio.ogg --model small
```

A saída mostra o texto, a duração e a confiança (0 a 1). Fala clara costuma dar
acima de 0,7.

## Problemas comuns

- **"faster-whisper não instalado"**: rode o passo 1 com o mesmo Python do
  `PYTHON_CMD`.
- **Primeira transcrição demora muito**: é o download do modelo. Rode o passo 2
  antes.
- **"Esse áudio foi registrado sem a referência do WhatsApp"**: o áudio entrou
  antes da transcrição existir. Use "Puxar conversa do WhatsApp" de novo.
- **Transcrição com palavra trocada**: normal em nome próprio e número. Por isso o
  agente confirma esses dados por escrito antes de agir.
