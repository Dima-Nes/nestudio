(() => {
  const body = document.body;
  // the portfolio itself, or the page of one video (/v/<slug>/), where the video's own card sits above the grid
  const HOME = body.dataset.page === 'works';
  const caseCard = document.querySelector('.case-media .card');
  // theme
  const tt = document.getElementById('themeToggle'), ti = document.getElementById('themeIcon');
  const store = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };
  function applyTheme(t){ body.classList.toggle('dark', t==='dark'); ti.textContent = t==='dark' ? '☀' : '◐'; store.set('theme', t); }
  applyTheme(store.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  tt.addEventListener('click', () => applyTheme(body.classList.contains('dark') ? 'light' : 'dark'));
  // header and phone bar: highlight the line of work this page belongs to (links carry data-match, a regexp of addresses)
  document.querySelectorAll('.dir-nav a[data-match], .bottom-nav a[data-match]').forEach(a => {
    if (new RegExp(a.dataset.match).test(location.pathname)) { a.setAttribute('aria-current', 'page'); a.classList.add('current'); }
  });
  // expandable answers open and close smoothly instead of jumping
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('details').forEach(d => {
    const s = d.querySelector('summary'); if (!s) return;
    s.addEventListener('click', ev => {
      if (still.matches || !d.animate) return;
      ev.preventDefault();
      if (d._anim) return;
      const closing = d.open, from = d.offsetHeight;
      d.open = false; const shut = d.offsetHeight; d.open = true; const full = d.offsetHeight;
      d.style.overflow = 'hidden';
      d.classList.toggle('is-opening', !closing);
      d._anim = d.animate({ height: [from + 'px', (closing ? shut : full) + 'px'] }, { duration: closing ? 260 : 340, easing: 'cubic-bezier(.2,.7,.2,1)' });
      d._anim.onfinish = d._anim.oncancel = () => { d.open = !closing; d.style.overflow = ''; d.classList.remove('is-opening'); d._anim = null; };
    });
  });
  document.querySelectorAll('[data-current-year]').forEach(e => e.textContent = new Date().getFullYear());

  // image fallbacks (YouTube maxres/oar -> hq; failed -> gradient placeholder)
  document.querySelectorAll('.cardimage img').forEach(img => {
    const fail = () => {
      const fb = img.dataset.fallback;
      if (fb && img.src !== fb) { img.src = fb; img.dataset.fallback = ''; return; }
      img.classList.add('broken');
    };
    img.addEventListener('error', fail);
    // YouTube returns a tiny 120x90 grey image instead of 404 for some missing sizes
    img.addEventListener('load', () => { if (img.naturalWidth && img.naturalWidth <= 120) fail(); });
  });

  // masonry
  const works = document.getElementById('works') || document.createElement('section');   // pages without a grid (/uslugi/, /sayty/)
  const cards = Array.from(works.querySelectorAll('.card'));
  let filter = 'all', lastCols = 0;
  const colsFor = () => innerWidth <= 330 ? 1 : innerWidth <= 760 ? 2 : innerWidth <= 1100 ? 3 : 4;
  function visible(){ return cards.filter(c => filter === 'all' || c.dataset.cats.split(' ').includes(filter)); }
  function render(animate){
    const n = colsFor(); lastCols = n;
    works.style.setProperty('--cols', n);
    works.innerHTML = '';
    const cols = Array.from({length:n}, () => { const d = document.createElement('div'); d.className = 'masonry-col'; works.appendChild(d); return d; });
    const h = new Array(n).fill(0);
    visible().forEach((c, i) => {
      let k = 0; for (let j = 1; j < n; j++) if (h[j] < h[k] - 1) k = j;
      cols[k].appendChild(c);
      const w = cols[k].clientWidth || 300;
      const ar = getComputedStyle(c.querySelector('.cardimage')).aspectRatio.split('/').map(Number);
      h[k] += w * (ar[1] || 1) / (ar[0] || 1) + 60;
      c.classList.remove('is-visible');
      if (animate) { c.style.transitionDelay = (Math.min(i, 12) * 0.03) + 's'; requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('is-visible'))); }
      else c.classList.add('is-visible');
    });
  }
  const fbox = document.getElementById('filters');
  if (fbox) fbox.addEventListener('click', e => {
    const b = e.target.closest('.filter-btn'); if (!b || b.tagName === 'A') return;
    fbox.querySelectorAll('button.filter-btn').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    filter = b.dataset.filter; render(true);
    const top = works.getBoundingClientRect().top + scrollY - 140;
    if (scrollY > top) scrollTo({ top, behavior: 'smooth' });
  });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (colsFor() !== lastCols) render(false); }, 120); });
  render(false);

  // ---------- modal + minimal player ----------
  const modal = document.getElementById('vmodal'), frame = document.getElementById('vframe'), box = modal.querySelector('.vbox'), info = modal.querySelector('.vinfo');
  const mt = document.getElementById('vtitle'), md = document.getElementById('vdesc'), mm = document.getElementById('vmeta');
  let current = null, player = null, ratio = 16 / 9, tick = null;
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ONLINE = location.protocol !== 'file:';

  function fit(){
    const mobile = innerWidth <= 760, short = innerHeight < 520;
    const W = innerWidth - (mobile ? 24 : 160);
    const room = innerHeight - (short ? 66 : 72);   // the modal's top and bottom padding
    // the caption (title, description, share) keeps its real height and the video gets the rest, so nothing scrolls;
    // its height depends on its width, so measure twice
    let w = Math.min(W, room * ratio);
    for (let i = 0; i < 2; i++) {
      info.style.width = Math.round(Math.max(w, Math.min(W, 520))) + 'px';
      w = Math.min(W, (room - (short ? 0 : info.offsetHeight + 14)) * ratio); if (w < 160) w = Math.min(W, 160);
    }
    frame.style.width = Math.round(w) + 'px'; frame.style.height = Math.round(w / ratio) + 'px';
    info.style.width = Math.round(Math.max(w, Math.min(W, 520))) + 'px';
    frame.style.setProperty('--pfs-w', innerWidth + 'px'); frame.style.setProperty('--pfs-h', innerHeight + 'px');
  }
  addEventListener('resize', () => { if (current) fit(); });

  // state: 'loading' (spinner) | 'playing' | 'paused' (play button); 'started' hides the cover once the first frame is shown
  function setState(s){ frame.dataset.state = s; if (s === 'playing') frame.classList.add('started'); }

  function ui(poster){
    frame.innerHTML = (poster ? '<img class="pl-cover" src="' + poster + '" alt="">' : '') +
      '<div class="pl-tap"></div><span class="pl-spin"></span><button class="pl-play" type="button" aria-label="Воспроизвести">' + PLAY + '</button>' +
      '<div class="pl-bar"><div class="pl-track"><div class="pl-fill"></div></div></div>' +
      '<button class="pl-fs" type="button" aria-label="Во весь экран">' +
        '<svg class="fs-on" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' +
        '<svg class="fs-off" viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg></button>';
    frame.querySelector('.pl-fs').onclick = toggleFs;
    const bar = frame.querySelector('.pl-bar'), fill = frame.querySelector('.pl-fill');
    frame.querySelector('.pl-tap').onclick = () => { if (!player) return; const s = frame.dataset.state; if (s === 'playing') player.pause(); else if (s === 'paused') player.play(); };
    frame.querySelector('.pl-play').onclick = () => player && player.play();
    const seek = e => { if (!player) return; const r = bar.getBoundingClientRect(); const turned = frame.classList.contains('pfs-land') && innerHeight > innerWidth; const x = Math.min(1, Math.max(0, turned ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width)); const d = player.dur(); if (d) { player.seek(x * d); fill.style.width = (x * 100) + '%'; } };
    bar.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); bar.classList.add('drag'); try { bar.setPointerCapture(e.pointerId); } catch(_){} seek(e); });
    bar.addEventListener('pointermove', e => { if (bar.classList.contains('drag')) seek(e); });
    const up = () => bar.classList.remove('drag');
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    clearInterval(tick);
    tick = setInterval(() => { if (!player || bar.classList.contains('drag')) return; const d = player.dur(); fill.style.width = d ? Math.min(100, player.time() / d * 100) + '%' : '0'; }, 250);
    setState('loading');
  }
  function setRatio(w, h){ if (w && h && Math.abs(w / h - ratio) > 0.02) { ratio = w / h; fit(); } frame.classList.toggle('pfs-land', frame.classList.contains('pfs') && ratio > 1); }

  // ---- fullscreen: the whole frame with our controls where the browser allows it, iPhone's own player for our <video> ----
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsApi = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  // Android browsers cover the screen with a "full screen" banner for the real Fullscreen API, and a page cannot turn it off.
  // So phones get the frame stretched over the whole page instead; a horizontal video lies sideways while the phone is held upright.
  let pfs = false;
  function phoneFs(on, fromHistory){
    if (on === pfs) return;
    pfs = on;
    frame.classList.toggle('pfs', on); frame.classList.toggle('pfs-land', on && ratio > 1); fit();
    const b = frame.querySelector('.pl-fs'); if (b) b.setAttribute('aria-label', on ? 'Свернуть' : 'Во весь экран');
    if (fromHistory) return;
    // the phone's back button leaves fullscreen instead of the page
    if (on) history.pushState({ pfs: 1 }, ''); else if (history.state && history.state.pfs) history.back();
  }
  addEventListener('popstate', () => { if (pfs) phoneFs(false, true); });
  function toggleFs(){
    if (isPhone() && fsApi()) { phoneFs(!pfs); return; }
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (req && fsApi()) {
      // phones: a horizontal video turns sideways by itself
      Promise.resolve(req.call(frame)).then(() => { if (ratio > 1 && screen.orientation && screen.orientation.lock) return screen.orientation.lock('landscape'); }).catch(() => {});
      return;
    }
    const v = frame.querySelector('video');
    if (v && v.webkitEnterFullscreen) { try { v.webkitEnterFullscreen(); } catch(_){} }
  }
  const fsChange = () => {
    const b = frame.querySelector('.pl-fs'); if (b) b.setAttribute('aria-label', fsEl() ? 'Свернуть' : 'Во весь экран');
    if (!fsEl() && screen.orientation && screen.orientation.unlock) try { screen.orientation.unlock(); } catch(_){}
  };
  document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);

  // phones and slow or data-saving connections get the lighter 720p copy when a video has one
  function fileFor(card){
    const c = navigator.connection || {};
    const light = isPhone() || c.saveData || /(^|-)[23]g$/.test(c.effectiveType || '');
    return (light && card.dataset.fileM) || card.dataset.file;
  }

  // ---- own <video>: Google Drive stream or local file ----
  function htmlVideo(src, onFail){
    const v = document.createElement('video');
    v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    let wantPlay = true, failed = false;
    v.addEventListener('loadedmetadata', () => setRatio(v.videoWidth, v.videoHeight));
    v.addEventListener('playing', () => setState('playing'));
    v.addEventListener('waiting', () => { if (wantPlay) setState('loading'); });
    v.addEventListener('pause', () => { if (!v.ended && !wantPlay) setState('paused'); });
    v.addEventListener('ended', () => { wantPlay = false; setState('paused'); });
    v.addEventListener('error', () => { if (failed) return; failed = true; clearTimeout(stall); onFail('error', v.error ? v.error.code : 0); });
    // a host that answers but never delivers (throttled networks) gets the same fallback; a slow one that keeps sending data is left alone
    let stall = null;
    const watch = () => { clearTimeout(stall); stall = setTimeout(() => { if (!failed && v.readyState < 2) { failed = true; onFail('stall', 0); } }, isPhone() ? 15000 : 10000); };
    watch();
    v.addEventListener('progress', () => { if (v.readyState < 2) watch(); });
    v.addEventListener('loadedmetadata', () => { if (v.readyState < 2) watch(); });
    v.addEventListener('loadeddata', () => clearTimeout(stall));
    v.src = src;
    frame.prepend(v);
    const p = {
      play(){ wantPlay = true; if (v.ended) v.currentTime = 0; setState('loading');
        const r = v.play(); if (r && r.catch) r.catch(err => { if (err && err.name === 'AbortError') return; wantPlay = false; setState('paused'); }); },
      pause(){ wantPlay = false; v.pause(); setState('paused'); },
      time(){ return v.currentTime || 0; }, dur(){ return isFinite(v.duration) ? v.duration : 0; },
      seek(t){ v.currentTime = t; },
      destroy(){ wantPlay = false; failed = true; clearTimeout(stall); v.pause(); v.removeAttribute('src'); try { v.load(); } catch(_){} } };
    return p;
  }

  // ---- YouTube through the IFrame API, our controls on top ----
  let ytReady = null;
  function loadYT(){
    if (ytReady) return ytReady;
    ytReady = new Promise(res => {
      if (window.YT && YT.Player) return res();
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
      const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
    });
    return ytReady;
  }
  if (ONLINE && document.querySelector('.card[data-src="yt"]')) loadYT();   // warm up early so a click starts playback at once

  function ytVideo(id, start){
    const host = document.createElement('div'); host.className = 'yt-host'; const inner = document.createElement('div'); host.appendChild(inner); frame.prepend(host);
    let yp = null, alive = true, wantPlay = true, guard = null;
    const create = () => {
      if (!alive) return;
      yp = new YT.Player(inner, { videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, start: Math.floor(start || 0), controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1, origin: location.origin },
        events: {
          onReady: e => { if (wantPlay) e.target.playVideo(); armGuard(); },
          onStateChange: e => { const st = e.data;
            if (st === 1) { frame.classList.remove('passthru'); setState('playing'); }
            else if (st === 3) { if (wantPlay) setState('loading'); }
            else if (st === 2 || st === 0) { if (st === 0) wantPlay = false; if (!wantPlay || st === 0) setState('paused'); }
          } } });
    };
    // browser refused to start with sound (mostly iPhone): let the next tap reach YouTube itself, it always starts from a real tap
    const armGuard = () => { clearTimeout(guard); guard = setTimeout(() => { if (alive && yp && yp.getPlayerState && yp.getPlayerState() !== 1) { frame.classList.add('passthru'); setState('paused'); } }, 2500); };
    if (window.YT && YT.Player) create(); else loadYT().then(create);
    const p = {
      play(){ wantPlay = true; setState('loading'); if (yp && yp.playVideo) { yp.playVideo(); armGuard(); } },
      pause(){ wantPlay = false; if (yp && yp.pauseVideo) yp.pauseVideo(); setState('paused'); },
      time(){ return yp && yp.getCurrentTime ? yp.getCurrentTime() : 0; }, dur(){ return yp && yp.getDuration ? yp.getDuration() : 0; },
      seek(t){ if (yp && yp.seekTo) yp.seekTo(t, true); },
      destroy(){ alive = false; clearTimeout(guard); try { yp && yp.destroy(); } catch(_){} } };
    return p;
  }

  function stop(){ if (pfs) phoneFs(false); if (player) { player.destroy(); player = null; } clearInterval(tick); frame.innerHTML = ''; frame.className = 'vframe'; delete frame.dataset.state; }

  function coverOf(card, big){
    const img = card.querySelector('img');
    if (!img || img.classList.contains('broken')) return '';
    let s = img.getAttribute('src') || '';
    if (big && s.includes('drive.google.com/thumbnail')) s = s.replace(/sz=w\d+/, 'sz=w1280');
    return s;
  }

  // start: seconds to play from (a frame of the case study, or ?t= in a link)
  function open(card, start){
    stop();
    current = card;
    const id = card.dataset.id, src = card.dataset.src, vert = card.dataset.vertical === '1';
    ratio = vert ? 9 / 16 : 16 / 9;
    mt.textContent = card.dataset.title;
    md.textContent = card.dataset.long;
    mm.textContent = card.dataset.tag + ' · ' + card.dataset.date;
    if (HOME && card.dataset.slug) history.replaceState(null, '', '?v=' + card.dataset.slug);
    if (!modal.classList.contains('open')) { modal.classList.add('open'); document.documentElement.style.overflow = 'hidden'; }
    fit();
    const poster = coverOf(card, true);
    if (src === 'yt' && !ONLINE) {
      frame.innerHTML = '<a class="vlocal" href="https://www.youtube.com/watch?v=' + id + '" target="_blank" rel="noopener">' +
        (poster ? '<img src="' + poster + '" alt="">' : '') + '<span class="play">' + PLAY + '</span><span class="vlocal-note">Смотреть на YouTube ↗</span></a>';
      return;
    }
    if (src !== 'gd') ui(poster);
    if (src === 'yt') { player = ytVideo(id, start); frame.classList.toggle('can-fs', fsApi()); return; }
    // Google Drive does not let other sites stream its files directly, so its own player is used here
    // (on phones only a shared link gets here, the grid opens Drive in a new tab)
    if (src === 'gd') { driveFallback(id, poster); return; }
    // 'cdn': our copy on media.nestudio.by, the Drive original (data-id) is the fallback
    // a file the phone cannot play: the other quality first, then Google Drive, then a message with the error code
    const first = fileFor(card), other = first === card.dataset.file ? card.dataset.fileM : card.dataset.file;
    const load = (file, retry) => {
      player = htmlVideo(file + (start ? '#t=' + start : ''), (kind, code) => {
        if (current !== card) return;
        if (kind === 'error' && retry) { player.destroy(); frame.querySelector('video').remove(); load(retry); return; }
        if (src === 'cdn') { driveFallback(id, poster); return; }
        fail(card, kind === 'stall' ? 'сеть' : code);
      });
      frame.classList.add('can-fs');
      player.play();   // called inside the click, so the browser allows sound
    };
    load(first, other && other !== first ? other : null);
  }
  function fail(card, code){
    setState('paused'); frame.classList.add('failed');
    const m = document.createElement('div'); m.className = 'pl-msg';
    m.innerHTML = '<p>Видео не загрузилось</p><button type="button">Повторить</button><small>код: ' + code + '</small>';
    m.querySelector('button').onclick = () => open(card);
    frame.appendChild(m);
  }
  function driveFallback(id, poster){
    stop();
    if (isPhone()) {   // no click here any more, so a new tab can only be opened by the viewer's own tap
      frame.innerHTML = '<a class="vlocal" href="https://drive.google.com/file/d/' + id + '/view" target="_blank" rel="noopener">' +
        (poster ? '<img src="' + poster + '" alt="">' : '') + '<span class="play">' + PLAY + '</span><span class="vlocal-note">Смотреть на Google Диске ↗</span></a>';
      return;
    }
    frame.innerHTML = '<iframe src="https://drive.google.com/file/d/' + id + '/preview" allow="autoplay; fullscreen" allowfullscreen></iframe>';
  }
  function close(){ if (fsEl()) toggleFs(); stop(); modal.classList.remove('open'); document.documentElement.style.overflow = ''; current = null; if (HOME) history.replaceState(null, '', location.pathname); }

  // ---- links to one video: nestudio.by/v/<slug>/, the video's own page (search engines, messenger previews) ----
  const shareBtn = document.getElementById('vshare'), shareLabel = shareBtn.querySelector('span');
  shareBtn.onclick = async () => {
    if (!current) return;
    const url = location.origin + '/v/' + current.dataset.slug + '/';
    if (navigator.share && isPhone()) { try { await navigator.share({ title: current.dataset.title, url }); } catch(_){} return; }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch(_) {
      const t = document.createElement('textarea'); t.value = url; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch(_){} t.remove();
    }
    shareLabel.textContent = ok ? 'Ссылка скопирована' : url;
    clearTimeout(shareBtn.t); shareBtn.t = setTimeout(() => { shareLabel.textContent = 'Поделиться'; }, 2500);
  };
  function step(d){ const v = (caseCard ? [caseCard] : []).concat(visible()).filter(c => !(c.dataset.src === 'gd' && isPhone())); const i = v.indexOf(current); if (i < 0) return; open(v[(i + d + v.length) % v.length]); }
  // phones and tablets: Drive's in-page player is unreliable there, so Drive videos open in a new tab; computers keep the modal
  const isPhone = () => matchMedia('(hover: none) and (pointer: coarse)').matches || innerWidth <= 760;
  // cards are real links to /v/<slug>/ (search engines follow them); a plain click plays the video here instead,
  // ctrl/cmd/shift/middle click still opens the page
  document.addEventListener('click', e => {
    const a = e.target.closest('.card .cardlink'); if (!a) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const c = a.closest('.card');
    if (c.dataset.src === 'gd' && isPhone()) {
      // Google Drive videos open straight in Drive's own player (new tab), our modal is only for YouTube and local files
      window.open('https://drive.google.com/file/d/' + c.dataset.id + '/view', '_blank', 'noopener');
      return;
    }
    open(c);
  });
  modal.addEventListener('click', e => { if (e.target === modal || e.target === box) close(); });
  document.getElementById('vclose').onclick = close;
  document.getElementById('vprev').onclick = () => step(-1);
  document.getElementById('vnext').onclick = () => step(1);
  addEventListener('keydown', e => { if (!current) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);
    if (/^[fFаА]$/.test(e.key) && frame.classList.contains('can-fs')) toggleFs();
    if (e.key === ' ' && player) { e.preventDefault(); frame.dataset.state === 'playing' ? player.pause() : player.play(); } });
  // old links /?v=<slug> still open their video on the portfolio; a video's own page opens it right away
  const linked = HOME && new URLSearchParams(location.search).get('v');
  const linkedCard = linked && [...works.querySelectorAll('.card')].find(c => c.dataset.slug === linked);
  if (linkedCard) { linkedCard.scrollIntoView({ block: 'center' }); open(linkedCard); }
  else if (linked) history.replaceState(null, '', location.pathname);
  else if (caseCard && (body.dataset.page !== 'case' || /[?&]t=\d/.test(location.search)))
    open(caseCard, +new URLSearchParams(location.search).get('t') || 0);   // a case study is read first, its video opens on a click
  // frames of a case study: a click plays the video from that moment
  document.querySelectorAll('.case-frame-play').forEach(b => b.parentElement.addEventListener('click', () => caseCard && open(caseCard, +b.dataset.t)));
  // bottom bar «Работы» on the portfolio itself: back to the top instead of reloading
  document.querySelectorAll('[data-nav="works"]').forEach(a => a.addEventListener('click', e => { if (HOME) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); } }));
  document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => caseCard && open(caseCard)));
  requestAnimationFrame(() => { body.classList.remove('is-loading'); body.classList.add('is-ready'); });
})();

/* Scroll videos of the websites: play only while on screen; not with reduced motion or data saver */
(() => {
  const vids = document.querySelectorAll('video[data-vis]');
  if (!vids.length) return;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData);
  if (calm || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.play().catch(() => {}); else e.target.pause(); }), { threshold: .35 });
  vids.forEach(v => io.observe(v));
})();

/* Contact button and on-site chat. Messages go to the relay in #chat[data-endpoint] (tools/chat-worker), which
   forwards them to the studio's Telegram; replies written there come back here. Without a relay the message is
   copied and Telegram opens, so nothing is lost. */
(() => {
  const fab = document.getElementById('contactFab'), btn = document.getElementById('fabBtn'), menu = document.getElementById('fabMenu');
  const chat = document.getElementById('chat');
  if (!fab || !btn || !chat) return;
  const store = { get(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
  const KEY = 'ns_chat';
  const S = store.get(KEY) || { sid: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)), name: '', contact: '', msgs: [], last: 0 };
  const save = () => store.set(KEY, S);
  const endpoint = (chat.dataset.endpoint || '').trim();
  const log = document.getElementById('chatLog'), form = document.getElementById('chatForm'), who = document.getElementById('chatWho'), me = document.getElementById('chatMe'), err = document.getElementById('chatErr');
  const send = form.querySelector('.chat-send');
  const fName = form.elements.namedItem('name');   // form.name is the form's own attribute
  const time = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  function setMenu(open) {
    fab.classList.toggle('open', open); btn.setAttribute('aria-expanded', open);
    if (open) { menu.hidden = false; } else { menu.hidden = true; }
  }
  btn.addEventListener('click', () => { if (!chat.hidden) { closeChat(); return; } setMenu(!fab.classList.contains('open')); });
  document.addEventListener('click', e => { if (fab.classList.contains('open') && !fab.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!chat.hidden) closeChat(); else setMenu(false); } });

  function render() {
    log.querySelectorAll('.msg.me, .msg.us.reply, .msg.sys').forEach(n => n.remove());
    S.msgs.forEach(m => {
      const d = document.createElement('div'); d.className = 'msg ' + (m.from === 'me' ? 'me' : m.from === 'sys' ? 'us sys' : 'us reply');
      const p = document.createElement('p'); p.textContent = m.text; d.appendChild(p);
      const s = document.createElement('small'); s.textContent = (m.from === 'us' ? 'nestudio · ' : '') + time(m.t); d.appendChild(s);
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
    const known = !!S.contact;
    who.hidden = known; me.hidden = !known;
    if (known) { me.innerHTML = ''; me.append('Ответим: ' + (S.name ? S.name + ', ' : '') + S.contact + ' · '); const b = document.createElement('button'); b.type = 'button'; b.textContent = 'изменить'; b.onclick = () => { who.hidden = false; me.hidden = true; fName.value = S.name; form.contact.value = S.contact; form.contact.focus(); }; me.appendChild(b); }
  }
  function openChat() {
    setMenu(false); chat.hidden = false; void chat.offsetWidth; chat.classList.add('open');
    render(); (S.contact ? form.text : form.contact).focus({ preventScroll: true }); poll();
  }
  function closeChat() { chat.classList.remove('open'); setTimeout(() => { chat.hidden = true; }, 300); stopPoll(); btn.focus({ preventScroll: true }); }
  document.querySelectorAll('[data-chat-open]').forEach(b => b.addEventListener('click', openChat));
  chat.querySelector('[data-chat-close]').addEventListener('click', closeChat);
  form.text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.text.addEventListener('input', () => { form.text.style.height = 'auto'; form.text.style.height = Math.min(form.text.scrollHeight, 140) + 'px'; });

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    if (!who.hidden) { S.name = fName.value.trim(); S.contact = form.contact.value.trim(); }
    const text = form.text.value.trim();
    if (!S.contact || S.contact.replace(/[^\d@a-zA-Z]/g, '').length < 5) { who.hidden = false; me.hidden = true; err.textContent = 'Оставьте телефон или ник в Telegram, чтобы мы могли ответить.'; form.contact.focus(); return; }
    if (!text) { err.textContent = 'Напишите сообщение.'; form.text.focus(); return; }
    const msg = { from: 'me', text, t: Date.now() };
    if (!endpoint) { fallback(text); return; }
    send.disabled = true;
    try {
      const r = await fetch(endpoint.replace(/\/$/, '') + '/msg', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: S.sid, name: S.name, contact: S.contact, text, page: location.href, website: form.website.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || r.status);
      S.msgs.push(msg); if (S.msgs.filter(m => m.from === 'me').length === 1) S.msgs.push({ from: 'sys', text: 'Сообщение у нас. Ответим здесь – окно можно закрыть, ответ сохранится, – или напишем на ' + S.contact + '.', t: Date.now() });
      save(); form.text.value = ''; form.text.style.height = ''; render(); poll();
    } catch (x) {
      err.textContent = 'Не получилось отправить. Скопировали ваш текст – откроем Telegram, вставьте его туда.'; fallback(text, true);
    } finally { send.disabled = false; }
  });
  function fallback(text, quiet) {
    const body = text + '\n\n' + (S.name ? S.name + ', ' : '') + S.contact;
    if (navigator.clipboard) navigator.clipboard.writeText(body).catch(() => {});
    S.msgs.push({ from: 'me', text, t: Date.now() });
    S.msgs.push({ from: 'sys', text: 'Текст скопирован. Сейчас откроется наш Telegram @nestudiopro – вставьте сообщение и отправьте. Или позвоните: +375 44 713-88-69.', t: Date.now() });
    save(); form.text.value = ''; render();
    if (!quiet) err.textContent = '';
    setTimeout(() => window.open('https://t.me/nestudiopro', '_blank', 'noopener'), 600);
  }

  // replies from Telegram: ask the relay every few seconds while the chat is open
  let timer = null, idle = 0;
  function stopPoll() { clearTimeout(timer); timer = null; }
  async function poll() {
    stopPoll();
    if (!endpoint || chat.hidden || !S.msgs.some(m => m.from === 'me')) return;
    try {
      const r = await fetch(endpoint.replace(/\/$/, '') + '/msg?sid=' + encodeURIComponent(S.sid) + '&after=' + (S.last || 0));
      const j = await r.json();
      if (j.ok && j.replies && j.replies.length) { j.replies.forEach(x => { S.msgs.push({ from: 'us', text: x.text, t: x.t }); S.last = Math.max(S.last || 0, x.t); }); save(); render(); idle = 0; }
      else idle++;
    } catch (x) { idle++; }
    if (idle < 180) timer = setTimeout(poll, idle < 20 ? 4000 : 10000);
  }
})();
