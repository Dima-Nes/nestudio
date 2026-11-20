#!/bin/bash
# Включает онлайн-чат nestudio.by одной командой:  bash tools/chat-worker/setup.sh
# Что нужно заранее: бот от @BotFather (его токен) и доступ к аккаунту Cloudflare, где домен nestudio.by.
# Токен вводится здесь, в терминале, и хранится только в Cloudflare. Никому его не пересылайте.
set -euo pipefail
cd "$(dirname "$0")"
WR="npx -y wrangler@3"
say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
json() { python3 -I -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

command -v node >/dev/null || { echo "Нужен Node.js: https://nodejs.org"; exit 1; }

say "1/7 Вход в Cloudflare – откроется браузер, подтвердите вход аккаунтом, где домен nestudio.by"
$WR whoami 2>/dev/null | grep -q "associated with the email" || $WR login

if grep -q PUT_KV_ID_HERE wrangler.toml; then
  say "2/7 Создаю хранилище для переписки"
  out=$($WR kv namespace create CHAT 2>&1 || true); echo "$out" | tail -3
  id=$(echo "$out" | grep -oE '[0-9a-f]{32}' | head -1)
  [ -n "$id" ] || { echo "Не получилось создать хранилище. Пришлите этот вывод разработчику."; exit 1; }
  sed -i.bak "s/PUT_KV_ID_HERE/$id/" wrangler.toml && rm -f wrangler.toml.bak
else
  say "2/7 Хранилище уже есть"
fi

say "3/7 Токен бота"
read -r -s -p "Вставьте токен от @BotFather (символы не видны) и нажмите Enter: " TOKEN; echo
ME=$(curl -s "https://api.telegram.org/bot${TOKEN}/getMe")
echo "$ME" | grep -q '"ok":true' || { echo "Telegram не принял токен. Проверьте и запустите заново."; exit 1; }
BOT=$(echo "$ME" | json 'd["result"]["username"]')
curl -s "https://api.telegram.org/bot${TOKEN}/deleteWebhook" >/dev/null

say "4/7 Куда приходят сообщения"
echo "Напишите боту @${BOT} сообщение /start (в личке)."
echo "Или добавьте @${BOT} в группу «Заявки с сайта» и напишите там /id. Жду до 5 минут…"
CHAT=""
for i in $(seq 1 60); do
  CHAT=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=5" | python3 -I -c '
import json,sys
d=json.load(sys.stdin); ids=[u["message"]["chat"]["id"] for u in d.get("result",[]) if "message" in u and str(u["message"].get("text","")).startswith(("/start","/id"))]
print(ids[-1] if ids else "")')
  [ -n "$CHAT" ] && break
done
[ -n "$CHAT" ] || { echo "Сообщение /start не пришло. Запустите скрипт заново."; exit 1; }
echo "Чат найден: $CHAT"

say "5/7 Выкладываю сервер чата"
DEP=$($WR deploy 2>&1); echo "$DEP" | tail -4
URL=$(echo "$DEP" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$URL" ] || { echo "Не нашёл адрес сервера в выводе. Пришлите этот вывод разработчику."; exit 1; }

say "6/7 Секреты и связь с ботом"
SECRET=$(openssl rand -hex 24)
printf '%s' "$TOKEN"  | $WR secret put BOT_TOKEN >/dev/null
printf '%s' "$SECRET" | $WR secret put WEBHOOK_SECRET >/dev/null
printf '%s' "$CHAT"   | $WR secret put CHAT_ID >/dev/null
curl -s "https://api.telegram.org/bot${TOKEN}/setWebhook" --data-urlencode "url=${URL}/tg" --data-urlencode "secret_token=${SECRET}" | grep -q '"ok":true' \
  || { echo "Не получилось связать бота с сервером."; exit 1; }
curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=Готово: сюда будут приходить сообщения из чата на nestudio.by. Чтобы ответить посетителю, нажмите «Ответить» на его сообщении." >/dev/null

say "7/7 Включаю чат на сайте"
cd ../..
python3 -I - "$URL" <<'PY'
import sys, re
url = sys.argv[1]
p = "index.html"; s = open(p, encoding="utf-8").read()
s, n = re.subn(r'(<section class="chat" id="chat"[^>]*data-endpoint=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), s, count=1)
assert n == 1, "chat section not found"
open(p, "w", encoding="utf-8", newline="\n").write(s)
PY
python3 -I tools/build_video_pages.py | tail -1
echo
echo "Готово. Сервер чата: ${URL}"
echo "Осталось выложить сайт: git add -A && git commit -m 'Online chat on' && git push  (или скажите Claude «выложи»)."
