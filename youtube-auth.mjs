import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = process.env.STREAM_CLIP_CONFIG_DIR || path.join(ROOT_DIR, 'config', 'private');
fs.mkdirSync(CONFIG_DIR, { recursive: true });
const secretsPath = path.join(CONFIG_DIR, 'client_secrets.json');
const tokenPath = path.join(CONFIG_DIR, 'youtube-token.json');
if (!fs.existsSync(secretsPath)) throw new Error('Falta client_secrets.json');
const cfg = JSON.parse(fs.readFileSync(secretsPath, 'utf8')).installed;
if (!cfg?.client_id || !cfg?.client_secret) throw new Error('JSON OAuth no válido: debe ser cliente Desktop app.');

const state = crypto.randomBytes(24).toString('hex');
let redirectUri = ''; 
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/oauth2callback') {
    res.writeHead(404).end('Not found'); return;
  }
  if (u.searchParams.get('state') !== state) {
    res.writeHead(400).end('Estado OAuth no válido.'); server.close(); return;
  }
  const code = u.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end('Google no devolvió el código. Puedes volver a Termux.'); server.close(); return;
  }
  try {
    const body = new URLSearchParams({
      code, client_id: cfg.client_id, client_secret: cfg.client_secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    });
    const response = await fetch(cfg.token_uri, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.error || 'Error al obtener token');
    fs.writeFileSync(tokenPath, JSON.stringify({ ...data, obtained_at: Date.now() }, null, 2), { mode: 0o600 });
    fs.chmodSync(tokenPath, 0o600);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<h2>YouTube connected</h2><p>You can close this tab and return to Stream Clip Maker.</p>');
    console.log('YOUTUBE_OAUTH_OK: token guardado de forma local.');
  } catch (e) {
    res.writeHead(500).end('No se pudo guardar la autorización. Revisa Termux.');
    console.error('OAuth error:', e.message);
  } finally {
    server.close();
  }
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const auth = new URL(cfg.auth_uri);
  auth.search = new URLSearchParams({
    client_id: cfg.client_id, redirect_uri: redirectUri,
    response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.upload',
    access_type: 'offline', prompt: 'consent', state
  }).toString();
  console.log('Abriendo Google para autorizar YouTube...');
  console.log('Si no se abre automáticamente, copia esta URL en el navegador:');
  console.log(auth.toString());
  const openers = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', auth.toString()]]
    : process.platform === 'darwin'
      ? ['open', [auth.toString()]]
      : process.env.TERMUX_VERSION
        ? ['termux-open-url', [auth.toString()]]
        : ['xdg-open', [auth.toString()]];
  const opener = spawn(openers[0], openers[1], { stdio: 'ignore', detached: true });
  opener.on('error', () => console.log('Could not open a browser automatically. Use the authorization URL printed above.'));
  opener.unref();
  console.log('Waiting for authorization in your browser…');
});
