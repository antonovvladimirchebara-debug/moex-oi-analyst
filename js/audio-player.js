/**
 * audio-player.js — Neon Cyberpunk Audio Player
 * MOEX/OI Analyst — Deep Space theme
 *
 * Features:
 *  - Несколько плейлистов в конфиге; на сайте играет activePlaylistId (треки: файлы + URL)
 *  - Яндекс Музыка integration (OAuth Яндекс ID + embed)
 *  - Canvas FFT visualizer (neon bars)
 *  - Shuffle, Repeat modes
 */

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────
  const CONFIG_URL      = 'audio-config.json';
  const YANDEX_TK_KEY   = 'moex_oi_yandex_token';
  const YANDEX_UID_KEY  = 'moex_oi_yandex_uid';
  const AP_VOL_KEY      = 'moex_oi_ap_volume';

  // ── State ─────────────────────────────────────────────────────
  const state = {
    config: { playlists: [], activePlaylistId: '', yandexPlaylists: [], yandexClientId: '', activeSource: 'local' },
    currentIndex: 0,
    isPlaying: false,
    source: 'local',          // 'local' | 'yandex'
    shuffle: false,
    repeat: false,            // false | 'one' | 'all'
    shuffleQueue: [],
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    rafId: null,
    yandexToken: null,
    yandexUid: null,
    selectedYandexPlaylist: null,  // { kind, uid, title }
    isDraggingProgress: false,
    /** Индексы в localModeTracks с enabled и валидным источником */
    activeLocalIndexes: [],
    /** Треки активного плейлиста (копия ссылки на массив из конфига) */
    localModeTracks: [],
  };

  // ── Constants (admin detection) ───────────────────────────────
  const GH_TOKEN_KEY    = 'moex_oi_gh_token';
  const AP_COLLAPSED_KEY = 'moex_oi_ap_collapsed';

  // ── DOM refs ──────────────────────────────────────────────────
  let audio, canvas, ctx2d;
  let elTitle, elArtist, elTimeCur, elTimeTotal;
  let elProgressFill, elProgressHandle, elProgress;
  let elPlayBtn, elVolume;
  let elLocalMode, elYandexMode;
  let elYandexPlayer, elYandexPlaylists;
  let elTrackCount;
  let visIdleEl;
  let wrapEl;

  function getActivePlaylistTracks(cfg) {
    if (Array.isArray(cfg.playlists) && cfg.playlists.length > 0) {
      const id = cfg.activePlaylistId;
      const pl = cfg.playlists.find(p => p.id === id) || cfg.playlists[0];
      return Array.isArray(pl.tracks) ? pl.tracks : [];
    }
    return Array.isArray(cfg.localTracks) ? cfg.localTracks : [];
  }

  function rebuildActiveLocalIndexes() {
    state.activeLocalIndexes = [];
    const tracks = state.localModeTracks || [];
    tracks.forEach((t, i) => {
      if (!t || t.enabled === false) return;
      const isStream = t.source === 'stream' || (t.streamUrl && !t.filename);
      if (isStream) {
        if (t.streamUrl) state.activeLocalIndexes.push(i);
      } else if (t.filename) {
        state.activeLocalIndexes.push(i);
      }
    });
  }

  function activeLocalCount() {
    rebuildActiveLocalIndexes();
    return state.activeLocalIndexes.length;
  }

  function trackAudioSrc(track) {
    if (!track) return '';
    const isStream = track.source === 'stream' || (track.streamUrl && !track.filename);
    if (isStream && track.streamUrl) return track.streamUrl;
    if (track.filename) return `audio/${track.filename}`;
    return '';
  }

  // ── Build compact floating HTML ───────────────────────────────
  function buildHTML() {
    const wrap = document.createElement('div');
    // Start collapsed; will be uncollapsed if saved state says so
    wrap.className = 'ap-wrap ap-collapsed';
    wrap.id = 'ap-wrap';
    wrap.setAttribute('aria-label', 'Аудиоплеер');

    wrap.innerHTML = `
      <!-- Collapsed pill: click to expand -->
      <button class="ap-toggle-btn" id="ap-toggle-btn"
              aria-label="Открыть аудиоплеер" title="Аудиоплеер">
        <span class="ap-toggle-note" aria-hidden="true">♪</span>
        <span class="ap-toggle-label">AUDIO</span>
        <span class="ap-toggle-playing-dot" id="ap-toggle-dot" aria-hidden="true"></span>
      </button>

      <!-- Full player panel -->
      <div class="ap-player" id="ap-player" role="region" aria-label="Аудиоплеер">
        <!-- Corner decorations -->
        <div class="ap-corner ap-corner-tl"></div>
        <div class="ap-corner ap-corner-tr"></div>
        <div class="ap-corner ap-corner-bl"></div>
        <div class="ap-corner ap-corner-br"></div>

        <!-- Header -->
        <div class="ap-header">
          <div class="ap-label">
            <span class="ap-label-dot"></span>
            AUDIO STREAM
          </div>
          <div class="ap-header-right">
            <span class="ap-track-count" id="ap-track-count"></span>
            <button class="ap-btn ap-collapse-btn" id="ap-collapse-btn"
                    title="Свернуть" aria-label="Свернуть плеер">−</button>
          </div>
        </div>

        <!-- Source tabs (ADMIN ONLY — hidden for regular visitors) -->
        <div class="ap-source-tabs ap-admin-tabs" role="tablist"
             aria-label="Источник музыки">
          <button class="ap-src-btn active" data-src="local"
                  role="tab" aria-selected="true">LOCAL</button>
          <button class="ap-src-btn" data-src="yandex"
                  role="tab" aria-selected="false">ЯНДЕКС ♫</button>
        </div>

        <!-- LOCAL MODE -->
        <div id="ap-local-mode" role="tabpanel">
          <!-- Mini visualizer -->
          <div class="ap-visualizer-wrap">
            <canvas id="ap-visualizer" class="ap-visualizer"
                    aria-hidden="true"></canvas>
            <div class="ap-vis-idle" id="ap-vis-idle">
              <span class="ap-vis-idle-text">NO SIGNAL</span>
            </div>
          </div>

          <!-- Track info -->
          <div class="ap-track-info">
            <div class="ap-track-title-wrap">
              <span class="ap-track-title" id="ap-title">—</span>
            </div>
            <span class="ap-track-artist" id="ap-artist">—</span>
          </div>

          <!-- Progress -->
          <div class="ap-progress-row">
            <span class="ap-time" id="ap-time-cur">0:00</span>
            <div class="ap-progress" id="ap-progress" role="slider"
                 aria-label="Позиция воспроизведения" aria-valuemin="0"
                 aria-valuemax="100" aria-valuenow="0">
              <div class="ap-progress-fill" id="ap-progress-fill"></div>
              <div class="ap-progress-handle" id="ap-progress-handle"></div>
            </div>
            <span class="ap-time ap-time-total" id="ap-time-total">0:00</span>
          </div>

          <!-- Controls -->
          <div class="ap-controls">
            <div class="ap-extra-btns">
              <button class="ap-btn ap-extra" id="ap-shuffle"
                      title="Перемешать" aria-pressed="false">⇄</button>
              <button class="ap-btn ap-extra" id="ap-repeat"
                      title="Повтор" aria-pressed="false">↻</button>
            </div>
            <div class="ap-controls-center">
              <button class="ap-btn" id="ap-prev"
                      title="Предыдущий" aria-label="Предыдущий трек">⏮</button>
              <button class="ap-btn ap-play-btn" id="ap-play"
                      title="Воспроизвести" aria-label="Воспроизвести">▶</button>
              <button class="ap-btn" id="ap-next"
                      title="Следующий" aria-label="Следующий трек">⏭</button>
            </div>
            <div class="ap-volume-wrap">
              <button class="ap-btn ap-mute-btn" id="ap-mute"
                      title="Звук" aria-label="Выключить звук">🔊</button>
              <input type="range" class="ap-volume" id="ap-volume"
                     min="0" max="1" step="0.01" value="0.7"
                     aria-label="Громкость">
            </div>
          </div>
        </div>

        <!-- YANDEX MODE (admin only — only visible when tabs visible) -->
        <div id="ap-yandex-mode" class="ap-yandex-mode" role="tabpanel" hidden>
          <div id="ap-yandex-player" class="ap-yandex-player">
            <div class="ap-yandex-no-playlist" id="ap-yandex-empty">
              <div class="ap-yandex-logo">♫</div>
              <p>ПЛЕЙЛИСТ НЕ ВЫБРАН</p>
              <span class="ap-yandex-connect-hint">
                Подключите Яндекс Музыку в настройках (Admin → АУДИОПЛЕЕР)
              </span>
            </div>
          </div>
        </div>
      </div>
    `;

    return wrap;
  }

  // ── Collapse/Expand logic ─────────────────────────────────────
  function setCollapsed(collapsed) {
    if (!wrapEl) return;
    wrapEl.classList.toggle('ap-collapsed', collapsed);
    localStorage.setItem(AP_COLLAPSED_KEY, collapsed ? '1' : '0');
    const toggleBtn = document.getElementById('ap-toggle-btn');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', collapsed ? 'Открыть аудиоплеер' : 'Свернуть плеер');
    }
    // Resize canvas after expansion (was hidden before)
    if (!collapsed) {
      setTimeout(resizeCanvas, 50);
    }
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    const wrap = buildHTML();
    wrapEl = wrap;

    // Inject as fixed overlay into body (works on any page)
    document.body.appendChild(wrap);

    // ── Admin detection: show source tabs only if GitHub token present
    const isAdmin = !!localStorage.getItem(GH_TOKEN_KEY);
    if (isAdmin) {
      wrap.classList.add('ap-is-admin');
    }

    // Restore collapsed state (default: collapsed)
    const savedCollapsed = localStorage.getItem(AP_COLLAPSED_KEY);
    // null = first visit → start collapsed; '0' = user expanded before
    const startCollapsed = savedCollapsed !== '0';
    setCollapsed(startCollapsed);

    // Bind toggle/collapse buttons
    document.getElementById('ap-toggle-btn')?.addEventListener('click', () => setCollapsed(false));
    document.getElementById('ap-collapse-btn')?.addEventListener('click', () => setCollapsed(true));

    // Cache DOM refs
    audio          = document.createElement('audio');
    audio.preload  = 'metadata';
    audio.crossOrigin = 'anonymous';
    document.body.appendChild(audio);

    canvas         = document.getElementById('ap-visualizer');
    ctx2d          = canvas ? canvas.getContext('2d') : null;
    elTitle        = document.getElementById('ap-title');
    elArtist       = document.getElementById('ap-artist');
    elTimeCur      = document.getElementById('ap-time-cur');
    elTimeTotal    = document.getElementById('ap-time-total');
    elProgressFill = document.getElementById('ap-progress-fill');
    elProgressHandle = document.getElementById('ap-progress-handle');
    elProgress     = document.getElementById('ap-progress');
    elPlayBtn      = document.getElementById('ap-play');
    elVolume       = document.getElementById('ap-volume');
    elLocalMode    = document.getElementById('ap-local-mode');
    elYandexMode   = document.getElementById('ap-yandex-mode');
    elYandexPlayer = document.getElementById('ap-yandex-player');
    elTrackCount   = document.getElementById('ap-track-count');
    visIdleEl      = document.getElementById('ap-vis-idle');

    // Restore volume
    const savedVol = localStorage.getItem(AP_VOL_KEY);
    if (savedVol !== null && elVolume) {
      elVolume.value = savedVol;
      audio.volume = parseFloat(savedVol);
    } else {
      audio.volume = 0.7;
    }

    // Yandex token from localStorage
    state.yandexToken = localStorage.getItem(YANDEX_TK_KEY) || null;
    state.yandexUid   = localStorage.getItem(YANDEX_UID_KEY) || null;

    // Handle Yandex OAuth callback (token in URL hash)
    handleYandexOAuthReturn();

    // Load config
    await loadConfig();

    // Bind events
    bindEvents();

    // Set initial source
    const savedSource = state.config.activeSource || 'local';
    switchSource(savedSource, false);

    // Resize canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  // ── Load config ───────────────────────────────────────────────
  async function loadConfig() {
    try {
      const r = await fetch(CONFIG_URL + '?t=' + Date.now());
      if (r.ok) {
        state.config = await r.json();
      }
    } catch (_) {
      // Config not found — use defaults
    }

    state.localModeTracks = getActivePlaylistTracks(state.config);
    state.localModeTracks.forEach(t => {
      if (!t) return;
      if (t.enabled === undefined) t.enabled = true;
      if (!t.source) {
        if (t.streamUrl && !t.filename) t.source = 'stream';
        else t.source = 'local';
      }
    });

    rebuildActiveLocalIndexes();
    state.currentIndex = 0;

    // Update track count
    updateTrackCount();

    // Первый активный трек — превью в UI
    if (state.activeLocalIndexes.length > 0) {
      const first = state.localModeTracks[state.activeLocalIndexes[0]];
      renderTrackInfo(first);
    } else {
      // Нет активных треков
      const titleEl  = document.getElementById('ap-title');
      const artistEl = document.getElementById('ap-artist');
      const isAdmin  = !!localStorage.getItem(GH_TOKEN_KEY);
      const hasRows = state.localModeTracks.length > 0;
      if (titleEl) titleEl.textContent = hasRows ? 'ВСЕ ТРЕКИ ВЫКЛ' : 'НЕТ ТРЕКОВ';
      if (artistEl) {
        if (isAdmin) {
          artistEl.innerHTML =
            '<a href="admin.html" style="color:var(--neon-cyan);text-decoration:none;' +
            'font-size:0.6rem;letter-spacing:1px;" title="Загрузить аудиофайлы в Админ → АУДИОПЛЕЕР">' +
            '↗ загрузить в Админ → АУДИОПЛЕЕР</a>';
        } else {
          artistEl.textContent = '—';
        }
      }
    }

    // Load Yandex player if configured
    renderYandexContent();
  }

  // ── Canvas resize ─────────────────────────────────────────────
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(rect.width  * (window.devicePixelRatio || 1));
    canvas.height = Math.floor(rect.height * (window.devicePixelRatio || 1));
  }

  // ── AudioContext setup (called on first play) ─────────────────
  function setupAudioContext() {
    if (state.audioCtx) return;
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 256;
      state.analyser.smoothingTimeConstant = 0.8;

      state.sourceNode = state.audioCtx.createMediaElementSource(audio);
      state.sourceNode.connect(state.analyser);
      state.analyser.connect(state.audioCtx.destination);
    } catch (e) {
      console.warn('[AudioPlayer] AudioContext not available:', e);
    }
  }

  // ── Visualizer draw loop ──────────────────────────────────────
  function drawVisualizer() {
    if (!ctx2d || !state.analyser) {
      // Draw idle animation
      drawIdle();
      state.rafId = requestAnimationFrame(drawVisualizer);
      return;
    }

    const W = canvas.width;
    const H = canvas.height;
    const bufLen = state.analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    state.analyser.getByteFrequencyData(dataArr);

    ctx2d.clearRect(0, 0, W, H);

    const barCount = 48;
    const gap = 2 * (window.devicePixelRatio || 1);
    const barW = (W - gap * (barCount - 1)) / barCount;
    const step = Math.floor(bufLen / barCount);

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArr[i * step + j];
      }
      const val = sum / step / 255;
      const barH = Math.max(2 * (window.devicePixelRatio || 1), val * H * 0.95);
      const x = i * (barW + gap);
      const y = H - barH;

      // Gradient: bottom magenta → top cyan
      const grad = ctx2d.createLinearGradient(0, H, 0, y);
      grad.addColorStop(0,   'rgba(255, 0, 255, 0.85)');
      grad.addColorStop(0.5, 'rgba(0, 200, 255, 0.9)');
      grad.addColorStop(1,   'rgba(0, 255, 255, 1)');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(x, y, barW, barH);

      // Glow on peaks
      if (val > 0.6) {
        ctx2d.shadowColor  = 'rgba(0, 255, 255, 0.8)';
        ctx2d.shadowBlur   = 6 * (window.devicePixelRatio || 1);
        ctx2d.fillStyle    = 'rgba(0, 255, 255, 0.35)';
        ctx2d.fillRect(x, y, barW, 2 * (window.devicePixelRatio || 1));
        ctx2d.shadowBlur   = 0;
      }
    }

    state.rafId = requestAnimationFrame(drawVisualizer);
  }

  // Draw pulsing idle lines when not playing
  function drawIdle() {
    if (!ctx2d || !canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    const t = Date.now() / 1000;
    const barCount = 48;
    const gap = 2 * (window.devicePixelRatio || 1);
    const barW = (W - gap * (barCount - 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      const wave = 0.04 + 0.06 * Math.abs(Math.sin(t * 0.8 + i * 0.3));
      const barH = wave * H;
      const x = i * (barW + gap);
      const y = H - barH;
      ctx2d.fillStyle = `rgba(0, 255, 255, ${0.08 + wave})`;
      ctx2d.fillRect(x, y, barW, barH);
    }
  }

  // ── Play a track by index ─────────────────────────────────────
  /** index — позиция в активном плейлисте (только enabled) */
  function playTrack(index) {
    rebuildActiveLocalIndexes();
    const idxs = state.activeLocalIndexes;
    if (idxs.length === 0) return;

    state.currentIndex = ((index % idxs.length) + idxs.length) % idxs.length;
    const cfgIdx = idxs[state.currentIndex];
    const track = state.localModeTracks[cfgIdx];
    const src = trackAudioSrc(track);
    if (!src) return;

    setupAudioContext();
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    audio.src = src;
    audio.load();
    audio.play().then(() => {
      state.isPlaying = true;
      updatePlayBtn();
      renderTrackInfo(track);
      if (visIdleEl) visIdleEl.hidden = true;
      if (!state.rafId) drawVisualizer();
    }).catch(err => {
      console.warn('[AudioPlayer] Playback error:', err);
    });
  }

  // ── Toggle play/pause ─────────────────────────────────────────
  function togglePlay() {
    if (state.source !== 'local') return;
    if (activeLocalCount() === 0) return;

    if (state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
    } else {
      if (!audio.src || audio.src === window.location.href) {
        playTrack(state.currentIndex);
      } else {
        setupAudioContext();
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
          state.audioCtx.resume();
        }
        audio.play().then(() => {
          state.isPlaying = true;
          updatePlayBtn();
          if (visIdleEl) visIdleEl.hidden = true;
          if (!state.rafId) drawVisualizer();
        }).catch(() => {});
      }
    }
  }

  // ── Prev / Next ───────────────────────────────────────────────
  function prevTrack() {
    const n = activeLocalCount();
    if (n === 0) return;
    if (state.shuffle) {
      playTrack(Math.floor(Math.random() * n));
    } else {
      playTrack(state.currentIndex - 1);
    }
  }

  function nextTrack() {
    const n = activeLocalCount();
    if (n === 0) return;
    if (state.shuffle) {
      playTrack(Math.floor(Math.random() * n));
    } else {
      playTrack(state.currentIndex + 1);
    }
  }

  // ── Track ended ───────────────────────────────────────────────
  function onTrackEnded() {
    const n = activeLocalCount();
    if (n === 0) return;

    if (state.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else if (state.repeat === 'all' || state.currentIndex < n - 1) {
      nextTrack();
    } else if (state.shuffle) {
      nextTrack();
    } else {
      // Stop
      state.isPlaying = false;
      updatePlayBtn();
      if (visIdleEl) visIdleEl.hidden = false;
    }
  }

  // ── Update play button ────────────────────────────────────────
  function updatePlayBtn() {
    if (!elPlayBtn) return;
    elPlayBtn.textContent = state.isPlaying ? '⏸' : '▶';
    elPlayBtn.setAttribute('aria-label', state.isPlaying ? 'Пауза' : 'Воспроизвести');
    elPlayBtn.classList.toggle('playing', state.isPlaying);
    elPlayBtn.title = state.isPlaying ? 'Пауза' : 'Воспроизвести';
    // Update toggle button dot
    const dot = document.getElementById('ap-toggle-dot');
    if (dot) dot.classList.toggle('active', state.isPlaying);
  }

  // ── Render track info ─────────────────────────────────────────
  function renderTrackInfo(track) {
    if (!track) return;
    const title = track.title || track.filename || '—';
    const artist = track.artist || '—';

    if (elTitle) {
      elTitle.textContent = title;
      // Enable marquee for long titles
      elTitle.classList.toggle('scrolling', title.length > 30);
    }
    if (elArtist) elArtist.textContent = artist;
    updateTrackCount();
  }

  function updateTrackCount() {
    if (!elTrackCount) return;
    rebuildActiveLocalIndexes();
    const total = state.activeLocalIndexes.length;
    if (total === 0) {
      elTrackCount.textContent = '';
    } else {
      const safeIdx = Math.min(state.currentIndex, total - 1);
      elTrackCount.textContent = `${safeIdx + 1} / ${total}`;
    }
  }

  // ── Format time ───────────────────────────────────────────────
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Progress update ───────────────────────────────────────────
  function updateProgress() {
    if (!audio || state.isDraggingProgress) return;
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 0;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;

    if (elProgressFill) elProgressFill.style.width = pct + '%';
    if (elProgressHandle) elProgressHandle.style.left = pct + '%';
    if (elProgress) elProgress.setAttribute('aria-valuenow', Math.round(pct));
    if (elTimeCur) elTimeCur.textContent = formatTime(cur);
    if (elTimeTotal && dur > 0) elTimeTotal.textContent = formatTime(dur);
  }

  // ── Seek on progress click ────────────────────────────────────
  function seekFromEvent(e) {
    if (!elProgress || !audio || !audio.duration) return;
    const rect = elProgress.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = pct * audio.duration;
  }

  // ── Source switch ─────────────────────────────────────────────
  function switchSource(src, animate = true) {
    state.source = src;

    // Update tab buttons
    document.querySelectorAll('.ap-src-btn').forEach(btn => {
      const isActive = btn.dataset.src === src;
      btn.classList.toggle('active', isActive && src === 'local');
      btn.classList.toggle('yandex-active', isActive && src === 'yandex');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (elLocalMode) elLocalMode.hidden = (src !== 'local');
    if (elYandexMode) elYandexMode.hidden = (src !== 'yandex');

    // Pause local audio when switching to Yandex
    if (src === 'yandex' && state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
      updatePlayBtn();
    }
  }

  // ── Yandex OAuth return handler ───────────────────────────────
  function handleYandexOAuthReturn() {
    const hash = window.location.hash;
    if (!hash.includes('access_token=')) return;

    const params = new URLSearchParams(hash.replace('#', '?'));
    const token = params.get('access_token');
    if (!token) return;

    state.yandexToken = token;
    localStorage.setItem(YANDEX_TK_KEY, token);

    // Clean URL
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ── Render Yandex content ─────────────────────────────────────
  function renderYandexContent() {
    if (!elYandexPlayer) return;

    const playlists = state.config.yandexPlaylists || [];

    if (playlists.length === 0) {
      elYandexPlayer.innerHTML = `
        <div class="ap-yandex-no-playlist">
          <div class="ap-yandex-logo">♫</div>
          <p>ПЛЕЙЛИСТ НЕ НАСТРОЕН</p>
          <span class="ap-yandex-connect-hint">
            Зайдите в Admin → АУДИОПЛЕЕР и подключите Яндекс Музыку
          </span>
        </div>
      `;
      return;
    }

    // Show playlist selector + embed player
    let html = '';

    if (playlists.length > 1) {
      html += `<div class="ap-yandex-playlist-list" id="ap-yandex-list">`;
      playlists.forEach((pl, i) => {
        html += `
          <div class="ap-yandex-pl-item ${i === 0 ? 'active-pl' : ''}"
               data-idx="${i}" data-kind="${pl.kind}" data-uid="${pl.uid}"
               role="button" tabindex="0"
               aria-label="Плейлист ${pl.title}">
            <span class="ap-yandex-pl-icon">♪</span>
            <span class="ap-yandex-pl-name">${escapeHtml(pl.title)}</span>
            ${pl.trackCount ? `<span class="ap-yandex-pl-count">${pl.trackCount} тр.</span>` : ''}
          </div>
        `;
      });
      html += '</div>';
    }

    // Embed player for first (or selected) playlist
    const activePl = state.selectedYandexPlaylist || playlists[0];
    html += renderYandexEmbed(activePl);
    elYandexPlayer.innerHTML = html;

    // Bind playlist item clicks
    elYandexPlayer.querySelectorAll('.ap-yandex-pl-item').forEach(item => {
      item.addEventListener('click', () => {
        elYandexPlayer.querySelectorAll('.ap-yandex-pl-item').forEach(el => el.classList.remove('active-pl'));
        item.classList.add('active-pl');
        const pl = playlists[parseInt(item.dataset.idx)];
        state.selectedYandexPlaylist = pl;
        const embedWrap = elYandexPlayer.querySelector('.ap-yandex-embed-wrap');
        if (embedWrap) embedWrap.outerHTML = renderYandexEmbed(pl);
      });
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') item.click(); });
    });
  }

  function renderYandexEmbed(pl) {
    if (!pl) return '';
    const embedSrc = `https://music.yandex.ru/iframe/#playlist/${pl.uid}/${pl.kind}/show-cover/show-artist-title`;
    return `
      <div class="ap-yandex-embed-wrap">
        <iframe class="ap-yandex-iframe"
                src="${embedSrc}"
                frameborder="0"
                allowtransparency="true"
                allow="autoplay"
                title="Яндекс Музыка — ${escapeHtml(pl.title || 'Плейлист')}"
                loading="lazy">
        </iframe>
      </div>
    `;
  }

  // ── Utilities ─────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Bind all events ───────────────────────────────────────────
  function bindEvents() {
    // Play/Pause
    elPlayBtn?.addEventListener('click', togglePlay);

    // Prev / Next
    document.getElementById('ap-prev')?.addEventListener('click', prevTrack);
    document.getElementById('ap-next')?.addEventListener('click', nextTrack);

    // Source tabs
    document.querySelectorAll('.ap-src-btn').forEach(btn => {
      btn.addEventListener('click', () => switchSource(btn.dataset.src));
    });

    // Progress bar — mouse
    elProgress?.addEventListener('mousedown', e => {
      state.isDraggingProgress = true;
      seekFromEvent(e);
    });
    window.addEventListener('mousemove', e => {
      if (state.isDraggingProgress) seekFromEvent(e);
    });
    window.addEventListener('mouseup', () => {
      state.isDraggingProgress = false;
    });

    // Progress bar — touch
    elProgress?.addEventListener('touchstart', e => {
      state.isDraggingProgress = true;
      seekFromEvent(e);
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (state.isDraggingProgress) seekFromEvent(e);
    }, { passive: true });
    window.addEventListener('touchend', () => {
      state.isDraggingProgress = false;
    });

    // Audio events
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', onTrackEnded);
    audio.addEventListener('loadedmetadata', () => {
      if (elTimeTotal) elTimeTotal.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('error', () => {
      console.warn('[AudioPlayer] Audio error for:', audio.src);
      // Try next track
      if (state.isPlaying) setTimeout(() => nextTrack(), 500);
    });

    // Volume
    elVolume?.addEventListener('input', () => {
      audio.volume = parseFloat(elVolume.value);
      localStorage.setItem(AP_VOL_KEY, elVolume.value);
      updateMuteBtn();
    });

    // Mute toggle
    document.getElementById('ap-mute')?.addEventListener('click', () => {
      audio.muted = !audio.muted;
      updateMuteBtn();
    });

    // Shuffle
    document.getElementById('ap-shuffle')?.addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      const btn = document.getElementById('ap-shuffle');
      btn?.classList.toggle('active', state.shuffle);
      btn?.setAttribute('aria-pressed', state.shuffle ? 'true' : 'false');
    });

    // Repeat
    document.getElementById('ap-repeat')?.addEventListener('click', () => {
      if (!state.repeat)         state.repeat = 'all';
      else if (state.repeat === 'all')  state.repeat = 'one';
      else                              state.repeat = false;

      const btn = document.getElementById('ap-repeat');
      if (btn) {
        btn.classList.toggle('active', !!state.repeat);
        btn.setAttribute('aria-pressed', state.repeat ? 'true' : 'false');
        if (state.repeat === 'one') {
          btn.textContent = '↻¹';
          btn.title = 'Повтор одного';
        } else if (state.repeat === 'all') {
          btn.textContent = '↻';
          btn.title = 'Повтор всех';
        } else {
          btn.textContent = '↻';
          btn.title = 'Повтор выкл.';
        }
      }
    });

    // Keyboard shortcuts (when player is focused)
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space' && !e.shiftKey) {
        // Only intercept if not already used by page
        const playerEl = document.getElementById('ap-player');
        if (playerEl && playerEl.matches(':hover')) {
          e.preventDefault();
          togglePlay();
        }
      }
    });
  }

  function updateMuteBtn() {
    const btn = document.getElementById('ap-mute');
    if (!btn) return;
    if (audio.muted || audio.volume === 0) {
      btn.textContent = '🔇';
      btn.setAttribute('aria-label', 'Включить звук');
    } else if (audio.volume < 0.5) {
      btn.textContent = '🔉';
      btn.setAttribute('aria-label', 'Выключить звук');
    } else {
      btn.textContent = '🔊';
      btn.setAttribute('aria-label', 'Выключить звук');
    }
  }

  // ── Start ─────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for external use (admin can trigger config reload)
  window.audioPlayer = {
    reload: loadConfig,
    switchSource,
    playTrack,
    togglePlay,
  };

})();
