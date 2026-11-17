#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://api.twitch.tv/helix";
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const topic = process.argv.slice(2).join(" ").trim();

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Faltan TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET. Configúralos en .env (no los compartas por el chat).");
  process.exit(2);
}
if (!topic) {
  console.error('Uso: ./discover-twitch.sh "GTA 6"');
  process.exit(2);
}

const rules = JSON.parse(readFileSync(new URL("./rules.json", import.meta.url), "utf8"));
const allowed = new Set((rules.allowedCreators || []).map(x => String(x).toLowerCase()));
const minViewers = Number(rules.minViewers ?? 0);
const maxStreams = Math.min(100, Math.max(1, Number(rules.maxStreamsPerScan ?? 50)));

async function getToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(`Twitch OAuth ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

async function helix(path, token) {
  const r = await fetch(API + path, {
    headers: { "Client-Id": CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Twitch API ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const token = await getToken();
  const categoryParams = new URLSearchParams({ query: topic, first: "100" });
  const categoryData = await helix("/search/categories?" + categoryParams, token);
  const categories = categoryData.data || [];
  if (!categories.length) {
    console.log(`No encuentro categorías de Twitch para: ${topic}`);
    return;
  }

  const found = new Map();
  for (const category of categories.slice(0, 10)) {
    const params = new URLSearchParams({ first: "100", game_id: category.id });
    const data = await helix("/streams?" + params, token);
    for (const s of data.data || []) found.set(s.id, { ...s, matchedCategory: category.name });
  }

  const streams = [...found.values()]
    .filter(s => Number(s.viewer_count) >= minViewers)
    .sort((a, b) => Number(b.viewer_count) - Number(a.viewer_count))
    .slice(0, maxStreams)
    .map(s => ({
      streamId: s.id,
      channelId: s.user_id,
      login: s.user_login,
      displayName: s.user_name,
      title: s.title,
      category: s.game_name,
      matchedCategory: s.matchedCategory,
      language: s.language || "other",
      viewers: Number(s.viewer_count),
      startedAt: s.started_at,
      thumbnailUrl: s.thumbnail_url,
      authorized: allowed.has(String(s.user_login).toLowerCase()),
      reuseAllowed: allowed.has(String(s.user_login).toLowerCase()),
    }));

  // Recupera VODs archivados de los canales con más audiencia encontrados.
  // Twitch limita cada respuesta; se consultan hasta 20 canales y 5 VODs por canal.
  const vods = [];
  for (const channel of streams.slice(0, 20)) {
    const params = new URLSearchParams({ user_id: channel.channelId, type: "archive", first: "5" });
    const data = await helix("/videos?" + params, token);
    for (const v of data.data || []) {
      vods.push({
        vodId: v.id,
        channel: channel.displayName,
        login: channel.login,
        title: v.title,
        category: channel.category,
        language: channel.language,
        createdAt: v.created_at,
        duration: v.duration,
        views: Number(v.view_count || 0),
        url: v.url,
        thumbnailUrl: v.thumbnail_url,
        authorized: channel.authorized,
        reuseAllowed: channel.reuseAllowed,
      });
    }
  }
  vods.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const result = {
    topic,
    scannedAt: new Date().toISOString(),
    languagePolicy: "all",
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    totalLiveMatches: streams.length,
    authorizedMatches: streams.filter(s => s.authorized).length,
    streams,
    totalVods: vods.length,
    vods,
    authorizationMode: "editor_permission_confirmed_by_user",
    note: "Los permisos de edición/publicación han sido confirmados por el usuario. La búsqueda incluye directos y VODs archivados; el descubrimiento de Twitch no determina por sí solo el estado de cada permiso.",
  };
  const outputPath = process.env.STREAM_CLIP_DISCOVERY_OUT || new URL("./workspace/discovery/discovery.json", import.meta.url);
  mkdirSync(new URL("./workspace/discovery/", import.meta.url), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    topic, categories: result.categories.map(c => c.name),
    foundLive: streams.length, foundVods: vods.length, authorized: result.authorizedMatches,
    streams: streams.slice(0, 15).map(({ login, title, category, language, viewers, authorized }) =>
      ({ login, title, category, language, viewers, authorized })),
    vods: vods.slice(0, 20).map(({ vodId, login, title, category, language, createdAt, duration, views, url }) =>
      ({ vodId, login, title, category, language, createdAt, duration, views, url })),
    saved: String(outputPath),
  }, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
