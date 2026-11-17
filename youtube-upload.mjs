import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.STREAM_CLIP_CONFIG_DIR || path.join(ROOT_DIR, 'config', 'private');
const tokenFile = path.join(root, 'youtube-token.json');
const secretsFile = path.join(root, 'client_secrets.json');

function fail(message) { console.error(message); process.exit(1); }
const args = process.argv.slice(2);
const video = args[0];
const title = args[1] || 'Clip de Twitch #Shorts';
const confirm = args.includes('--confirm-rights');
function option(name) {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] || '') : '';
}
const description = option('--description') ||
  'Clip editado con subtítulos. Más momentos en el canal. #Shorts';
const tags = option('--tags').split(',').map(x => x.trim()).filter(Boolean).slice(0, 30);

if (!video) fail('Uso: node youtube-upload.mjs <video_final.mp4> "Título" --confirm-rights [--description "..."] [--tags "a,b"]');
if (!confirm) fail('Falta --confirm-rights.');
const file = path.resolve(video);
if (!file.endsWith('_final.mp4')) fail('Bloqueado: solo se pueden subir archivos *_final.mp4.');
if (!fs.existsSync(file)) fail('No existe el archivo: ' + file);
const stats = fs.statSync(file);
if (!stats.size) fail('El archivo está vacío.');
let probe;
try {
  probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-show_entries','format=duration','-of','json',file], { encoding:'utf8' }));
} catch { fail('No se pudo verificar el vídeo con ffprobe.'); }
const stream = probe.streams?.[0];
const duration = Number(probe.format?.duration);
if (stream?.width !== 1080 || stream?.height !== 1920) fail(`Bloqueado: resolución ${stream?.width}x${stream?.height}; se requiere 1080x1920.`);
if (!Number.isFinite(duration) || duration <= 0 || duration > 180) fail('Bloqueado: el vídeo debe durar entre 1 y 180 segundos.');

if (!fs.existsSync(secretsFile) || !fs.existsSync(tokenFile)) fail('Faltan las credenciales locales de YouTube.');
const creds = JSON.parse(fs.readFileSync(secretsFile, 'utf8')).installed;
const token = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
if (!token.refresh_token) fail('Falta refresh_token; vuelve a autorizar YouTube.');

async function refreshAccessToken() {
  const response = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || 'No se pudo renovar el token');
  const updated = { ...token, ...data, refresh_token: token.refresh_token, obtained_at: Date.now() };
  fs.writeFileSync(tokenFile, JSON.stringify(updated, null, 2), { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);
  return updated.access_token;
}

try {
  console.log('Renovando acceso de YouTube...');
  const accessToken = await refreshAccessToken();
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      tags,
      categoryId: '20'
    },
    status: { privacyStatus: 'private', selfDeclaredMadeForKids: false }
  };
  console.log('Iniciando subida privada:', path.basename(file), Math.round(stats.size / 1024 / 1024) + ' MB');
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(stats.size),
      'X-Upload-Content-Type': 'video/mp4'
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) throw new Error('YouTube rechazó el inicio de subida (' + init.status + '): ' + await init.text());
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube no devolvió la URL de subida.');
  const bytes = fs.readFileSync(file);
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
    body: bytes
  });
  const result = await uploaded.json();
  if (!uploaded.ok) throw new Error('Falló la subida (' + uploaded.status + '): ' + (result.error?.message || JSON.stringify(result)));
  console.log('UPLOAD_OK');
  console.log('Video ID:', result.id);
  console.log('Privacidad: privado');
  console.log('URL: https://www.youtube.com/watch?v=' + result.id);
} catch (error) {
  console.error('UPLOAD_ERROR:', error.message);
  process.exit(1);
}
