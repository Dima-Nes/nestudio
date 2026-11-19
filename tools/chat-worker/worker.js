// nestudio chat relay – Cloudflare Worker (free plan is enough).
// The chat on nestudio.by posts a visitor's message here; the Worker sends it to the studio's Telegram through a bot.
// When someone in Telegram answers that message with «Ответить / Reply», the answer is stored and the chat on the site
// picks it up within a few seconds.
//
// Routes:  POST /msg   – message from the site {sid, name, contact, text, page, website(honeypot)}
//          GET  /msg   – ?sid=…&after=<ms>  replies for this visitor
//          POST /tg    – Telegram webhook (checked with the secret token)
// Secrets: BOT_TOKEN, WEBHOOK_SECRET, CHAT_ID (wrangler secret put …).  KV binding: CHAT.  Setup: README.md next to this file.

const ORIGINS = ["https://nestudio.by", "https://www.nestudio.by", "https://nestudio.site", "http://127.0.0.1:8767", "http://localhost:8767"];
const DAY = 86400;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      if (url.pathname === "/tg" && req.method === "POST") return await telegram(req, env);
      if (url.pathname === "/msg" && req.method === "POST") return await incoming(req, env, cors, origin);
      if (url.pathname === "/msg" && req.method === "GET") return await replies(url, env, cors);
      return json({ ok: true, service: "nestudio chat" }, cors);
    } catch (e) {
      return json({ ok: false, error: "server" }, cors, 500);
    }
  },
};

function json(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json();
}

async function limited(env, key, max, ttl) {
  const n = parseInt((await env.CHAT.get(key)) || "0", 10);
  if (n >= max) return true;
  await env.CHAT.put(key, String(n + 1), { expirationTtl: ttl });
  return false;
}

async function incoming(req, env, cors, origin) {
  if (!ORIGINS.includes(origin)) return json({ ok: false, error: "origin" }, cors, 403);
  const d = await req.json().catch(() => ({}));
  if (d.website) return json({ ok: true }, cors);                       // honeypot: bots fill the hidden field
  const sid = clean(d.sid, 64), name = clean(d.name, 80), contact = clean(d.contact, 120), text = clean(d.text, 2000), page = clean(d.page, 300);
  if (!/^[\w-]{8,64}$/.test(sid) || !text || contact.length < 3) return json({ ok: false, error: "fields" }, cors, 400);
  const ip = req.headers.get("CF-Connecting-IP") || "0";
  if (await limited(env, `rl:${ip}`, 8, 600) || await limited(env, `rs:${sid}`, 40, DAY)) return json({ ok: false, error: "limit" }, cors, 429);
  if (!env.CHAT_ID) return json({ ok: false, error: "not configured" }, cors, 503);

  const msg = `Сообщение с сайта nestudio.by\nИмя: ${name || "не указано"}\nСвязь: ${contact}\nСтраница: ${page || "–"}\n\n${text}\n\n` +
              `Чтобы ответить в чат на сайте, нажмите «Ответить» на этом сообщении.`;
  const r = await tg(env, "sendMessage", { chat_id: env.CHAT_ID, text: msg, disable_web_page_preview: true });
  if (!r.ok) return json({ ok: false, error: "telegram" }, cors, 502);
  await env.CHAT.put(`m:${r.result.message_id}`, sid, { expirationTtl: 30 * DAY });
  return json({ ok: true }, cors);
}

async function replies(url, env, cors) {
  const sid = clean(url.searchParams.get("sid"), 64);
  const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
  if (!/^[\w-]{8,64}$/.test(sid)) return json({ ok: false, error: "sid" }, cors, 400);
  const list = JSON.parse((await env.CHAT.get(`r:${sid}`)) || "[]");
  return json({ ok: true, replies: list.filter(x => x.t > after) }, { ...cors, "Cache-Control": "no-store" });
}

async function telegram(req, env) {
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  const u = await req.json().catch(() => ({}));
  const m = u.message;
  if (!m || !m.text) return new Response("ok");
  const chat = String(m.chat.id);
  if (/^\/(start|id)\b/.test(m.text)) {                                // setup helper: tells the chat id to put into CHAT_ID
    await tg(env, "sendMessage", { chat_id: chat, text: `Chat id: ${chat}\nВпишите его в CHAT_ID (wrangler secret put CHAT_ID), и сообщения с сайта начнут приходить сюда.` });
    return new Response("ok");
  }
  if (chat !== String(env.CHAT_ID) || !m.reply_to_message) return new Response("ok");
  const sid = await env.CHAT.get(`m:${m.reply_to_message.message_id}`);
  if (!sid) return new Response("ok");
  const key = `r:${sid}`;
  const list = JSON.parse((await env.CHAT.get(key)) || "[]");
  list.push({ text: clean(m.text, 2000), t: Date.now() });
  await env.CHAT.put(key, JSON.stringify(list.slice(-50)), { expirationTtl: 30 * DAY });
  await env.CHAT.put(`m:${m.message_id}`, sid, { expirationTtl: 30 * DAY });   // a reply to our own reply continues the thread
  await tg(env, "sendMessage", { chat_id: chat, text: "Ответ отправлен в чат на сайте.", reply_to_message_id: m.message_id });
  return new Response("ok");
}
