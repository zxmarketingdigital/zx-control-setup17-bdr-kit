#!/usr/bin/env python3
"""
transcribe-audio.py — transcreve um áudio recebido no WhatsApp, localmente.

Usa faster-whisper na CPU: o áudio não sai da máquina e não tem custo por
minuto. Lê ogg/opus (formato do WhatsApp), mp3, m4a e wav sem precisar de
ffmpeg instalado (o faster-whisper decodifica com PyAV).

Uso:
  python scripts/transcribe-audio.py <arquivo> [--model small] [--language pt]
  python scripts/transcribe-audio.py --warmup [--model small]   # baixa o modelo uma vez

Saída: uma linha JSON no stdout.
  {"ok": true, "text": "...", "duration": 12.4, "confidence": 0.78,
   "no_speech": 0.02, "model": "small", "language": "pt"}
  {"ok": false, "error": "..."}

"confidence" é a média de exp(avg_logprob) dos trechos, ponderada pela duração
(0 a 1). "no_speech" é a chance média de o trecho não ter fala. Quem chama
decide o corte (o dispatcher usa TRANSCRIBE_MIN_CONFIDENCE).

Instalação (uma vez): python -m pip install -r scripts/requirements-audio.txt
"""
import argparse
import json
import math
import sys


def out(payload, code=0):
    # ensure_ascii: acentos saem como \\uXXXX, à prova do encoding do console
    print(json.dumps(payload, ensure_ascii=True))
    sys.exit(code)


def main():
    ap = argparse.ArgumentParser(description="Transcreve áudio do WhatsApp com faster-whisper")
    ap.add_argument("file", nargs="?", help="arquivo de áudio")
    ap.add_argument("--model", default="small", help="tiny | base | small | medium | large-v3 (padrão: small)")
    ap.add_argument("--language", default="pt")
    ap.add_argument("--warmup", action="store_true", help="só baixa e carrega o modelo")
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        out({"ok": False, "error": "faster-whisper não instalado. Rode: python -m pip install -r scripts/requirements-audio.txt"}, 2)

    try:
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
    except Exception as e:  # modelo inexistente, sem internet no primeiro download etc.
        out({"ok": False, "error": f"não consegui carregar o modelo '{args.model}': {e}"}, 3)

    if args.warmup:
        out({"ok": True, "warmup": True, "model": args.model})

    if not args.file:
        out({"ok": False, "error": "informe o arquivo de áudio"}, 1)

    try:
        segments, info = model.transcribe(
            args.file,
            language=args.language or None,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        segs = list(segments)
    except Exception as e:
        out({"ok": False, "error": f"falha ao transcrever: {e}"}, 4)

    text = " ".join(s.text.strip() for s in segs).strip()
    weights = [max(s.end - s.start, 0.01) for s in segs]
    total = sum(weights) or 1.0
    confidence = sum(math.exp(s.avg_logprob) * w for s, w in zip(segs, weights)) / total if segs else 0.0
    no_speech = sum(s.no_speech_prob * w for s, w in zip(segs, weights)) / total if segs else 1.0

    out({
        "ok": True,
        "text": text,
        "duration": round(float(info.duration or 0), 1),
        "confidence": round(confidence, 3),
        "no_speech": round(no_speech, 3),
        "model": args.model,
        "language": info.language,
    })


if __name__ == "__main__":
    main()
