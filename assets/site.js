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
  const works = document.getElementById('works');
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
    const b = e.target.closest('.filter-btn'); if (!b) return;
    fbox.querySelectorAll('.filter-btn').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
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
    const seek = e => { if (!player) return; const r = bar.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); const d = player.dur(); if (d) { player.seek(x * d); fill.style.width = (x * 100) + '%'; } };
    bar.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); bar.classList.add('drag'); try { bar.setPointerCapture(e.pointerId); } catch(_){} seek(e); });
    bar.addEventListener('pointermove', e => { if (bar.classList.contains('drag')) seek(e); });
    const up = () => bar.classList.remove('drag');
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    clearInterval(tick);
    tick = setInterval(() => { if (!player || bar.classList.contains('drag')) return; const d = player.dur(); fill.style.width = d ? Math.min(100, player.time() / d * 100) + '%' : '0'; }, 250);
    setState('loading');
  }
  function setRatio(w, h){ if (w && h && Math.abs(w / h - ratio) > 0.02) { ratio = w / h; fit(); } }

  // ---- fullscreen: the whole frame with our controls where the browser allows it, iPhone's own player for our <video> ----
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsApi = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function toggleFs(){
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
    v.addEventListener('error', () => { if (failed) return; failed = true; onFail ? onFail() : setState('paused'); });
    // a host that answers but never delivers (throttled networks) gets the same fallback after 8 s
    const stall = onFail ? setTimeout(() => { if (!failed && v.readyState < 2) { failed = true; onFail(); } }, 8000) : null;
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

  function ytVideo(id){
    const host = document.createElement('div'); host.className = 'yt-host'; const inner = document.createElement('div'); host.appendChild(inner); frame.prepend(host);
    let yp = null, alive = true, wantPlay = true, guard = null;
    const create = () => {
      if (!alive) return;
      yp = new YT.Player(inner, { videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1, origin: location.origin },
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

  function stop(){ if (player) { player.destroy(); player = null; } clearInterval(tick); frame.innerHTML = ''; frame.className = 'vframe'; delete frame.dataset.state; }

  function coverOf(card, big){
    const img = card.querySelector('img');
    if (!img || img.classList.contains('broken')) return '';
    let s = img.getAttribute('src') || '';
    if (big && s.includes('drive.google.com/thumbnail')) s = s.replace(/sz=w\d+/, 'sz=w1280');
    return s;
  }

  function open(card){
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
    if (src === 'yt') { player = ytVideo(id); frame.classList.toggle('can-fs', fsApi()); return; }
    // Google Drive does not let other sites stream its files directly, so its own player is used here
    // (on phones only a shared link gets here, the grid opens Drive in a new tab)
    if (src === 'gd') { driveFallback(id, poster); return; }
    // 'cdn': our copy on media.nestudio.by, the Drive original (data-id) is the fallback
    player = htmlVideo(fileFor(card), src === 'cdn' ? () => { if (current === card) driveFallback(id, poster); } : null);
    frame.classList.add('can-fs');
    player.play();   // called inside the click, so the browser allows sound
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
  else if (caseCard) open(caseCard);
  // bottom bar «Работы» on the portfolio itself: back to the top instead of reloading
  document.querySelectorAll('[data-nav="works"]').forEach(a => a.addEventListener('click', e => { if (HOME) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); } }));
  document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => caseCard && open(caseCard)));
  requestAnimationFrame(() => { body.classList.remove('is-loading'); body.classList.add('is-ready'); });
})();
