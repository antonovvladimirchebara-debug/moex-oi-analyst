/**
 * reviews.js — loads video-config.json, renders video cards grid,
 * opens lightbox modal on click
 */
(function () {
  'use strict';

  const CONFIG_URL = 'video-config.json';

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resolvePlaylist(cfg) {
    if (Array.isArray(cfg.playlists) && cfg.playlists.length > 0) {
      const all = [];
      cfg.playlists.forEach(pl => {
        (pl.tracks || []).forEach(t => {
          if (t && t.enabled !== false && t.showOnReviews !== false) all.push(t);
        });
      });
      return all;
    }
    if (Array.isArray(cfg.playlist)) return cfg.playlist.filter(t => t && t.enabled !== false);
    return [];
  }

  function youtubeThumbUrl(embedUrl) {
    const m = embedUrl.match(/embed\/([^?&#]+)/);
    if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
    return null;
  }

  function formatViews(n) {
    if (!n && n !== 0) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + ' млн';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' тыс.';
    return String(n);
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return days + ' дн. назад';
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + ' нед. назад';
    const months = Math.floor(days / 30);
    if (months < 12) return months + ' мес. назад';
    return Math.floor(days / 365) + ' г. назад';
  }

  function buildThumbHtml(item) {
    if (item.source === 'embed' && item.provider === 'youtube' && item.embedUrl) {
      const thumb = youtubeThumbUrl(item.embedUrl);
      if (thumb) return `<img class="review-card-yt-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(item.title)}" loading="lazy">`;
    }
    if (item.source === 'embed' && item.embedUrl) {
      return `<iframe src="${escapeHtml(item.embedUrl)}" loading="lazy" tabindex="-1"></iframe>`;
    }
    if (item.source === 'local' && item.filename) {
      return `<video src="video/${encodeURIComponent(item.filename)}" preload="metadata" muted></video>`;
    }
    if (item.source === 'stream' && item.streamUrl) {
      return `<video src="${escapeHtml(item.streamUrl)}" preload="metadata" muted></video>`;
    }
    return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:2rem;">▣</div>`;
  }

  function renderGrid(items) {
    const grid = document.getElementById('reviews-grid');
    const count = document.getElementById('reviews-count');
    if (!grid) return;

    if (count) count.textContent = `${items.length} ${declension(items.length, ['обзор', 'обзора', 'обзоров'])}`;

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="reviews-empty">
          <div class="reviews-empty-icon">▣</div>
          <div>НЕТ ВИДЕООБЗОРОВ</div>
          <div style="margin-top:0.5rem;font-size:0.6rem;">Добавь видео в плейлист через Admin → ВИДЕОПЛЕЕР</div>
        </div>`;
      return;
    }

    grid.innerHTML = items.map((item, i) => {
      const prov = (item.provider || item.source || '').toUpperCase();
      const metaParts = [];
      if (prov) metaParts.push(`<span class="review-card-provider">${escapeHtml(prov)}</span>`);
      const v = formatViews(item.views);
      if (v) metaParts.push(v + ' просм.');
      const ago = timeAgo(item.publishedAt || item.date);
      if (ago) metaParts.push(ago);

      return `
        <article class="review-card" data-index="${i}" tabindex="0" role="button" aria-label="Открыть: ${escapeHtml(item.title)}">
          <div class="review-card-thumb">
            ${buildThumbHtml(item)}
            <div class="review-play-overlay"><div class="review-play-icon">▶</div></div>
          </div>
          <div class="review-card-body">
            <div class="review-card-title">${escapeHtml(item.title || 'Без названия')}</div>
            <div class="review-card-meta">${metaParts.join('<span class="review-card-dot">·</span>')}</div>
          </div>
        </article>`;
    }).join('');

    grid.querySelectorAll('.review-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index, 10);
        if (!isNaN(idx) && items[idx]) openModal(items[idx]);
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  function declension(n, forms) {
    const abs = Math.abs(n) % 100;
    const n1 = abs % 10;
    if (abs > 10 && abs < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  /* ── Modal / lightbox ── */
  let modalOverlay = null;

  function createModal() {
    modalOverlay = document.createElement('div');
    modalOverlay.className = 'review-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="review-modal-content" id="review-modal-stage"></div>
      <button class="review-modal-close" aria-label="Закрыть">✕</button>
      <div class="review-modal-title" id="review-modal-title"></div>`;
    document.body.appendChild(modalOverlay);

    modalOverlay.querySelector('.review-modal-close').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('active')) closeModal();
    });
  }

  function openModal(item) {
    if (!modalOverlay) createModal();
    const stage = document.getElementById('review-modal-stage');
    const title = document.getElementById('review-modal-title');

    if (item.source === 'embed' && item.embedUrl) {
      let url = item.embedUrl;
      if (item.provider === 'youtube' && !url.includes('autoplay')) {
        url += (url.includes('?') ? '&' : '?') + 'autoplay=1';
      }
      stage.innerHTML = `<iframe src="${escapeHtml(url)}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
    } else if (item.source === 'local' && item.filename) {
      stage.innerHTML = `<video src="video/${encodeURIComponent(item.filename)}" controls autoplay></video>`;
    } else if (item.source === 'stream' && item.streamUrl) {
      stage.innerHTML = `<video src="${escapeHtml(item.streamUrl)}" controls autoplay></video>`;
    }

    if (title) title.textContent = item.title || '';
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modalOverlay) return;
    const stage = document.getElementById('review-modal-stage');
    if (stage) stage.innerHTML = '';
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  /* ── Init ── */
  async function init() {
    try {
      const r = await fetch(CONFIG_URL + '?t=' + Date.now());
      if (!r.ok) throw new Error('fetch failed');
      const cfg = await r.json();
      const items = resolvePlaylist(cfg);
      renderGrid(items);
    } catch (_) {
      renderGrid([]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
