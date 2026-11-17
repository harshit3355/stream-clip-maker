#!/usr/bin/env bash
set -euo pipefail

# One-link workflow: download Twitch chat, detect top moments, create vertical
# clips, add Spanish captions/title, and copy finished MP4s to Android Downloads.
URL="${1:-}"
TOP="${TOP:-3}"
if [ -z "$URL" ]; then
  echo "Uso: $0 'https://www.twitch.tv/videos/ID'"
  echo "Opcional: TOP=1 $0 'URL'"
  exit 2
fi
ID="$(printf '%s' "$URL" | sed -nE 's#.*(/v/|/videos/)([0-9]+).*#\2#p')"
if [ -z "$ID" ]; then
  echo "No he podido extraer el ID del VOD de Twitch."
  exit 2
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TDCLI="$REPO/tools/TwitchDownloaderCLI-bin/TwitchDownloaderCLI"
PROOT_ROOT="$PREFIX/var/lib/proot-distro/containers/debian/rootfs/root"
CHAT_NAME="${ID}_chat.json"
CHAT_DIR="$REPO/workspace/chats"
CHAT="$CHAT_DIR/$CHAT_NAME"
OUT="$REPO/workspace/clips/$ID"
DOWNLOADS="/storage/emulated/0/Download"

for cmd in node proot-distro ffmpeg; do
  command -v "$cmd" >/dev/null || { echo "Falta el comando: $cmd"; exit 3; }
done
[ -x "$TDCLI" ] || { echo "No encuentro TwitchDownloaderCLI en $TDCLI"; exit 3; }
[ -d "$DOWNLOADS" ] || { echo "No puedo acceder a Descargas. Da permiso de almacenamiento a Termux."; exit 3; }
[ -x "$REPO/enhance-clip.sh" ] || { echo "Falta enhance-clip.sh"; exit 3; }

mkdir -p "$CHAT_DIR" "$OUT"
rm -f "$OUT"/*.mp4 "$OUT"/*.srt

CHAT_WAS_DOWNLOADED=0
if [ -s "$CHAT" ]; then
  echo "[1/4] Usando chat ya descargado: $CHAT"
else
  echo "[1/4] Descargando el chat del VOD $ID..."
  proot-distro login debian -- "$TDCLI" chatdownload --id "$ID" -o "$CHAT_NAME"
  if [ ! -s "$PROOT_ROOT/$CHAT_NAME" ]; then
    echo "No aparece el chat descargado en Debian: $PROOT_ROOT/$CHAT_NAME"
    exit 4
  fi
  cp "$PROOT_ROOT/$CHAT_NAME" "$CHAT"
  CHAT_WAS_DOWNLOADED=1
fi

echo "[2/4] Detectando los $TOP mejores momentos y generando clips verticales..."
cd "$REPO"
node chat-clips.mjs "$CHAT" --url "$URL" --vertical --run --top "$TOP" --out "$OUT"

echo "[3/4] Añadiendo subtítulos en español y título..."
i=0
shopt -s nullglob
for clip in "$OUT"/*_9x16.mp4; do
  i=$((i + 1))
  title="MOMENTO DESTACADO #$i"
  ./enhance-clip.sh "$clip" "$title"
  final="${clip%.mp4}_final.mp4"
  [ -s "$final" ] || { echo "No se creó $final"; exit 5; }
  dims="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$final")"
  [ "$dims" = "1080x1920" ] || { echo "Resolución final inesperada: $dims"; exit 5; }
  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$final")"
  awk -v d="$duration" 'BEGIN { if (d <= 0 || d > 180) exit 1 }' || { echo "Duración inválida para Short: $duration"; exit 5; }
  base="$(basename "$final")"
  cp "$final" "$DOWNLOADS/clip_${ID}_$base"
  srt="${clip%.mp4}.srt"
  if [ -s "$srt" ]; then
    cp "$srt" "$DOWNLOADS/clip_${ID}_$(basename "$srt")"
  fi
  echo "Final listo: $final"
  echo "Copia en Descargas: $DOWNLOADS/clip_${ID}_$base"
done
shopt -u nullglob

if [ "$i" -eq 0 ]; then
  echo "No se generaron clips verticales. Revisa $OUT/moments.json"
  exit 6
fi

echo "[4/4] Limpiando temporales..."
if [ "$CHAT_WAS_DOWNLOADED" -eq 1 ]; then
  rm -f "$CHAT" "$PROOT_ROOT/$CHAT_NAME"
fi
echo "Terminado: $i clip(s) finales en $OUT y copias en Descargas."
echo "Para publicar uno, usa: ./publish-short.sh "$OUT/archivo_final.mp4" "Título" "Descripción" "tags""

