#!/usr/bin/env node
// Screenshots of a website for the «Сайты» portfolio (/sayty/): first screen on a laptop and on a phone.
//
//   node tools/site_shots.mjs <slug> <url-or-local-html-file>
//
// Writes media/sites/<slug>-d.jpg (1440x900 at 2x, for link previews), <slug>-d.webp (1280 px wide) and
// <slug>-m.webp (phone, 390x844 at 2x, 500 px wide). Needs Google Chrome, Node 22+, cwebp and sips (macOS).
// Cookie banners are closed by clicking «Только обязательные» / «Отклонить» / «Принять» before the shot.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const [slug, target] = process.argv.slice(2);
if (!slug || !target) { console.error("usage: node tools/site_shots.mjs <slug> <url-or-file>"); process.exit(2); }
const url = /^https?:\/\//.test(target) ? target : pathToFileURL(resolve(target)).href;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "media", "sites");
mkdirSync(OUT, { recursive: true });

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
const profile = mkdtempSync(join(tmpdir(), "shots-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page() {
  for (let i = 0; i < 50; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = list.find(t => t.type === "page"); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await page());
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const CLOSE_BANNERS = `(() => {
  const words = ['только обязательные', 'отклонить', 'необходимые', 'принять', 'согласен', 'понятно', 'ok', 'accept'];
  const btns = [...document.querySelectorAll('button, a[role=button], [class*=cookie] a')].filter(b => b.offsetParent);
  for (const w of words) { const b = btns.find(x => x.textContent.trim().toLowerCase().startsWith(w)); if (b) { b.click(); return w; } }
  return '';
})()`;

async function shot(name, w, h, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
  await send("Emulation.setUserAgentOverride", { userAgent: mobile
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  await send("Page.navigate", { url });
  await sleep(6000);
  await send("Runtime.evaluate", { expression: CLOSE_BANNERS });
  await send("Runtime.evaluate", { expression: "document.querySelectorAll('[class*=reveal],[class*=fade],[data-aos]').forEach(e=>{e.style.opacity=1;e.style.transform='none'});scrollTo(0,0)" });
  await sleep(1500);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const png = join(profile, name + ".png");
  writeFileSync(png, Buffer.from(r.result.data, "base64"));
  return png;
}

await send("Page.enable");
const d = await shot("d", 1440, 900, false);
const m = await shot("m", 390, 844, true);
ws.close(); chrome.kill();

execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "1280", "0", d, "-o", join(OUT, `${slug}-d.webp`)]);
execFileSync("cwebp", ["-quiet", "-q", "80", "-resize", "500", "0", m, "-o", join(OUT, `${slug}-m.webp`)]);
execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1440", d, "--out", join(OUT, `${slug}-d.jpg`)], { stdio: "ignore" });
rmSync(profile, { recursive: true, force: true });
console.log(`media/sites/${slug}-d.webp, ${slug}-m.webp, ${slug}-d.jpg`);
