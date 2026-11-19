#!/usr/bin/env node
// Scroll-through video of a website for the «Сайты» portfolio: the page is scrolled smoothly from the top,
// frame by frame, and encoded into a short loop that plays inside the browser frame on /sayty/.
//
//   node tools/site_scroll_video.mjs <slug> <url-or-local-html-file> [screens=4.5] [seconds=10]
//
// Writes media/sites/<slug>-scroll.mp4 (1280x800, for the project page) and <slug>-scroll-m.mp4 (720x450, for cards).
// Needs Google Chrome, Node 22+ and ffmpeg. Cookie banners are closed before recording.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const [slug, target, screensArg, secondsArg] = process.argv.slice(2);
if (!slug || !target) { console.error("usage: node tools/site_scroll_video.mjs <slug> <url-or-file> [screens] [seconds]"); process.exit(2); }
const url = /^https?:\/\//.test(target) ? target : pathToFileURL(resolve(target)).href;
const SCREENS = +(screensArg || 4.5), SECONDS = +(secondsArg || 10), FPS = 30, W = 1280, H = 800, HOLD = 0.8;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "media", "sites"); mkdirSync(OUT, { recursive: true });
const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
const work = mkdtempSync(join(tmpdir(), "scroll-")), frames = join(work, "f"); mkdirSync(frames);
const port = 9200 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, "p")}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener("message", m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(6000);
await evaluate(`(() => { const words = ['только обязательные','отклонить','необходимые','принять','согласен','понятно','ok','accept'];
  const b = [...document.querySelectorAll('button, a[role=button]')].filter(x => x.offsetParent);
  for (const w of words) { const x = b.find(y => y.textContent.trim().toLowerCase().startsWith(w)); if (x) { x.click(); break; } }
  document.documentElement.style.scrollBehavior = 'auto'; document.body && (document.body.style.scrollBehavior = 'auto'); scrollTo(0, 0); })()`);
await sleep(1200);
// the page itself, or (for demos that scroll inside a panel) the biggest scrollable element
await evaluate(`(() => { const doc = document.scrollingElement || document.documentElement;
  let el = doc;
  if (doc.scrollHeight - innerHeight < 50) {
    const c = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight - e.clientHeight > 200; })
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    if (c[0]) el = c[0];
    else { const f = [...document.querySelectorAll('iframe')].find(x => !x.hidden && x.clientHeight > 0 && x.contentDocument);
      if (f) el = f.contentDocument.scrollingElement || f.contentDocument.documentElement; }
  }
  window.__sc = el; el.style.scrollBehavior = 'auto'; el.scrollTop = 0; })()`);
const max = await evaluate(`Math.max(0, Math.min(window.__sc.scrollHeight - window.__sc.clientHeight, Math.round(innerHeight * ${SCREENS})))`);
const n = Math.round(SECONDS * FPS), hold = Math.round(HOLD * FPS);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let k = 0;
const shot = async () => { const s = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 }); writeFileSync(join(frames, String(k++).padStart(5, "0") + ".jpg"), Buffer.from(s.result.data, "base64")); };
for (let i = 0; i < hold; i++) await shot();
for (let i = 0; i <= n; i++) { await evaluate(`window.__sc.scrollTop = ${Math.round(max * ease(i / n))}`); await sleep(35); await shot(); }
for (let i = 0; i < hold; i++) await shot();
ws.close(); chrome.kill();

const enc = (w, crf, name) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"),
  "-vf", `scale=${w}:-2,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-movflags", "+faststart", "-an", join(OUT, name)]);
enc(1280, 31, `${slug}-scroll.mp4`);
enc(720, 30, `${slug}-scroll-m.mp4`);
rmSync(work, { recursive: true, force: true });
console.log(`media/sites/${slug}-scroll.mp4, ${slug}-scroll-m.mp4 (${k} frames, scrolled ${max}px)`);
