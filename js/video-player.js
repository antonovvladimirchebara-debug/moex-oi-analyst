/**
 * video-player.js — 3D neon video block on index hero
 * Local files (/video/), embeds (YouTube, Vimeo, Rutube, VK, …), direct MP4/WebM
 */
(function () {
  'use strict';

  const CONFIG_URL = 'video-config.json';
  const GH_TOKEN_KEY = 'moex_oi_gh_token';

  const state = {
    config: { playlist: [] },
    /** indices into config.playlist for enabled items only */
    activeMap: [],
    currentPos: 0,
  };

  let mountEl;
  let stageEl;
  let titleEl;
  let countEl;
  let videoEl;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildActiveMap() {
    const pl = state.config.playlist || [];
    state.activeMap = [];
    pl.forEach((item, idx) => {
      if (item && item.enabled !== false) state.activeMap.push(idx);
    });
  }

  function getActiveItem() {
    const i = state.activeMap[state.currentPos];
    if (i === undefined) return null;
    return state.config.playlist[i];
  }

  let metaTitleEl, metaRowEl;

  function buildShell() {
    mountEl.innerHTML = `
      <div class="vp-root" role="region" aria-label="Видеоплеер">
        <div class="vp-label-row">
          <div class="vp-label">
            <span class="vp-label-dot" aria-hidden="true"></span>
            VIDEO 3D
          </div>
          <span class="vp-count" id="vp-count" aria-live="polite"></span>
        </div>
        <div class="vp-perspective">
          <div class="vp-3d-tilt">
            <div class="vp-frame">
              <div class="vp-corner vp-corner-tl"></div>
              <div class="vp-corner vp-corner-tr"></div>
              <div class="vp-corner vp-corner-bl"></div>
              <div class="vp-corner vp-corner-br"></div>
              <div class="vp-frame-inner">
                <div class="vp-stage" id="vp-stage"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="vp-meta">
          <div class="vp-meta-title" id="vp-meta-title"></div>
          <div class="vp-meta-row" id="vp-meta-row"></div>
        </div>
        <div class="vp-toolbar">
          <button type="button" class="vp-btn" id="vp-prev" aria-label="Предыдущее видео">⏮</button>
          <button type="button" class="vp-btn" id="vp-next" aria-label="Следующее видео">⏭</button>
          <span class="vp-title-scroll" id="vp-title">—</span>
        </div>
        <div class="vp-playlist" id="vp-playlist" role="tablist" aria-label="Плейлист видео"></div>
      </div>
    `;

    stageEl = document.getElementById('vp-stage');
    titleEl = document.getElementById('vp-title');
    countEl = document.getElementById('vp-count');
    metaTitleEl = document.getElementById('vp-meta-title');
    metaRowEl = document.getElementById('vp-meta-row');

    document.getElementById('vp-prev').addEventListener('click', () => step(-1));
    document.getElementById('vp-next').addEventListener('click', () => step(1));
  }

  function formatViews(n) {
    if (!n && n !== 0) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + ' млн просмотров';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' тыс. просмотров';
    return n + ' просмотров';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + ' мин. назад';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' ч. назад';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + ' дн. назад';
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + ' нед. назад';
    const months = Math.floor(days / 30);
    if (months < 12) return months + ' мес. назад';
    return Math.floor(days / 365) + ' г. назад';
  }

  function clearStage() {
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl = null;
    }
    if (stageEl) stageEl.innerHTML = '';
  }

  function showPlaceholder(title, subHtml) {
    clearStage();
    stageEl.innerHTML = `
      <div class="vp-placeholder">
        <div class="vp-placeholder-icon" aria-hidden="true">▣</div>
        <div class="vp-placeholder-title">${escapeHtml(title)}</div>
        <div class="vp-placeholder-sub">${subHtml}</div>
      </div>
    `;
  }

  function renderStage(item) {
    clearStage();
    if (!item) {
      const isAdmin = !!localStorage.getItem(GH_TOKEN_KEY);
      showPlaceholder(
        'НЕТ АКТИВНЫХ ВИДЕО',
        isAdmin
          ? 'Включи ролики в плейлисте: <a href="admin.html">Admin → ВИДЕОПЛЕЕР</a>'
          : 'Скоро здесь появятся видеоматериалы.'
      );
      return;
    }

    if (item.source === 'embed' && item.embedUrl) {
      const iframe = document.createElement('iframe');
      iframe.src = item.embedUrl;
      iframe.title = escapeHtml(item.title || 'Видео');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      );
      iframe.loading = 'lazy';
      stageEl.appendChild(iframe);
      return;
    }

    if (item.source === 'local' && item.filename) {
      videoEl = document.createElement('video');
      videoEl.controls = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('controlsList', 'nodownload');
      videoEl.src = `video/${encodeURIComponent(item.filename)}`;
      videoEl.addEventListener('ended', () => step(1));
      stageEl.appendChild(videoEl);
      return;
    }

    if (item.source === 'stream' && item.streamUrl) {
      videoEl = document.createElement('video');
      videoEl.controls = true;
      videoEl.playsInline = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.src = item.streamUrl;
      videoEl.addEventListener('ended', () => step(1));
      stageEl.appendChild(videoEl);
      return;
    }

    showPlaceholder('НЕВЕРНАЯ ЗАПИСЬ', 'Проверьте настройки в админке.');
  }

  function updateChrome() {
    const n = state.activeMap.length;
    const item = getActiveItem();

    if (countEl) {
      countEl.textContent = n > 0 ? `${state.currentPos + 1} / ${n}` : '';
    }
    if (titleEl) {
      const t = item ? (item.title || 'Без названия') : '—';
      titleEl.textContent = t;
      titleEl.classList.toggle('scrolling', t.length > 28);
    }

    if (metaTitleEl) {
      metaTitleEl.textContent = item ? (item.title || '') : '';
    }
    if (metaRowEl && item) {
      const parts = [];
      const prov = item.provider || item.source || '';
      if (prov) parts.push(`<span class="vp-meta-provider">${escapeHtml(prov.toUpperCase())}</span>`);
      const views = formatViews(item.views);
      if (views) parts.push(views);
      const ago = timeAgo(item.publishedAt || item.date);
      if (ago) parts.push(ago);
      metaRowEl.innerHTML = parts.join('<span class="vp-meta-dot">·</span>');
    } else if (metaRowEl) {
      metaRowEl.innerHTML = '';
    }

    const prev = document.getElementById('vp-prev');
    const next = document.getElementById('vp-next');
    if (prev) prev.disabled = n <= 1;
    if (next) next.disabled = n <= 1;

    const plEl = document.getElementById('vp-playlist');
    if (!plEl) return;
    if (n === 0) {
      plEl.innerHTML = '';
      return;
    }
    plEl.innerHTML = state.activeMap
      .map((cfgIdx, pos) => {
        const it = state.config.playlist[cfgIdx];
        const typeLabel =
          it.source === 'local' ? 'LOC' : it.source === 'stream' ? 'URL' : (it.provider || 'WEB').slice(0, 4).toUpperCase();
        const active = pos === state.currentPos ? ' active' : '';
        return `<button type="button" class="vp-chip${active}" data-pos="${pos}" role="tab" aria-selected="${pos === state.currentPos}">
          <span class="vp-chip-type">${escapeHtml(typeLabel)}</span>${escapeHtml(it.title || 'Видео')}
        </button>`;
      })
      .join('');

    plEl.querySelectorAll('.vp-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const pos = parseInt(btn.dataset.pos, 10);
        if (!isNaN(pos)) {
          state.currentPos = pos;
          renderStage(getActiveItem());
          updateChrome();
        }
      });
    });
  }

  function step(delta) {
    const n = state.activeMap.length;
    if (n === 0) return;
    state.currentPos = (state.currentPos + delta + n) % n;
    renderStage(getActiveItem());
    updateChrome();
  }

  async function loadConfig() {
    try {
      const r = await fetch(CONFIG_URL + '?t=' + Date.now());
      if (r.ok) state.config = await r.json();
    } catch (_) {}

    if (!state.config.playlist) state.config.playlist = [];

    buildActiveMap();
    if (state.currentPos >= state.activeMap.length) state.currentPos = 0;

    renderStage(getActiveItem());
    updateChrome();
  }

  function trackAudioPlayer() {
    const apWrap = document.querySelector('.ap-wrap');
    if (!apWrap) {
      mountEl.style.top = '90px';
      return;
    }

    function reposition() {
      const rect = apWrap.getBoundingClientRect();
      const gap = 12;
      mountEl.style.top = Math.round(rect.bottom + gap) + 'px';
    }

    reposition();
    const observer = new MutationObserver(reposition);
    observer.observe(apWrap, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', reposition);
    setInterval(reposition, 1000);
  }

  function setupTilt3D() {
    const root = mountEl.querySelector('.vp-root');
    const tilt = mountEl.querySelector('.vp-3d-tilt');
    if (!root || !tilt) return;

    root.addEventListener('mousemove', (e) => {
      const rect = root.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotY = (x - 0.5) * 20;
      const rotX = (0.5 - y) * 12;
      tilt.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg)`;
    });

    root.addEventListener('mouseleave', () => {
      tilt.style.transform = '';
    });
  }

  function init() {
    mountEl = document.getElementById('sidebar-video-mount');
    if (!mountEl) return;

    buildShell();
    setupTilt3D();
    trackAudioPlayer();
    loadConfig();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.videoPlayer = {
    reload: loadConfig,
  };
})();
