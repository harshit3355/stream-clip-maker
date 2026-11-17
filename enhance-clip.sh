#!/usr/bin/env bash
set -euo pipefail

# Add Spanish speech captions and a title to an already vertical MP4.
# Usage: ./enhance-clip.sh input_9x16.mp4 "Título del clip"

INPUT="${1:-}"
TITLE="${2:-}"
if [ -z "$INPUT" ] || [ ! -f "$INPUT" ]; then
  echo "Uso: $0 video_vertical.mp4 [título]"
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/tools/whisper.cpp"
WHISPER="$ROOT/build/bin/whisper-cli"
MODEL="${WHISPER_MODEL:-$ROOT/models/ggml-base.bin}"
if [ ! -x "$WHISPER" ]; then
  echo "Falta Whisper.cpp. Compílalo desde $ROOT primero."
  exit 3
fi
if [ ! -f "$MODEL" ]; then
  echo "Falta el modelo español/multilingüe: $MODEL"
  echo "Descárgalo con: bash $ROOT/models/download-ggml-model.sh base"
  exit 4
fi

DIR="$(cd "$(dirname "$INPUT")" && pwd)"
FILE="$(basename "$INPUT")"
STEM="${FILE%.*}"
WAV="$DIR/$STEM.audio.wav"
SRT="$DIR/$STEM.srt"
TITLEFILE="$DIR/$STEM.title.txt"
OUTPUT="$DIR/${STEM}_final.mp4"

if [ -z "$TITLE" ]; then
  TITLE="MOMENTO DESTACADO"
fi
printf '%s\n' "$TITLE" > "$TITLEFILE"

echo "[1/3] Extrayendo audio para transcribir..."
ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$WAV"

echo "[2/3] Generando subtítulos en español con Whisper..."
"$WHISPER" -m "$MODEL" -f "$WAV" -l es -osrt -of "$DIR/$STEM"

if [ ! -s "$SRT" ]; then
  echo "Whisper no generó el SRT esperado: $SRT"
  exit 5
fi

echo "[3/3] Incrustando título y subtítulos..."
cd "$DIR"
ffmpeg -hide_banner -y -i "$FILE" \
  -vf "drawtext=fontfile=/system/fonts/Roboto-Bold.ttf:textfile='$STEM.title.txt':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=70,subtitles='$STEM.srt':force_style='FontName=Roboto,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=180'" \
  -c:v libx264 -preset veryfast -crf 21 -c:a copy "$OUTPUT"

rm -f "$WAV" "$TITLEFILE"
echo "Listo: $OUTPUT"
