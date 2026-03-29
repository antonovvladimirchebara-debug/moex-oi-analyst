/**
 * moex-news.js — Top 5 daily news from MOEX ISS API
 *
 * Source: https://iss.moex.com/iss/sitenews.json (public, no auth)
 * Refresh: every 30 minutes
 * Columns: id, tag, published, title, body
 */

const NEWS_URL = 'https://iss.moex.com/iss/sitenews.json' +
  '?iss.meta=off&iss.only=sitenews&lang=ru&start=0';

const NEWS_COUNT  = 5;
const NEWS_ITEM_URL = id => `https://www.moex.com/n${id}`;

// ── Helpers ───────────────────────────────────────────────────
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent.replace(/\s+/g, ' ').trim();
}

function fmtNewsDate(isoStr) {
  if (!isoStr) return '';
  // "2026-03-29 14:32:00" → "29 мар 2026, 14:32"
  const d = new Date(isoStr.replace(' ', 'T') + '+03:00');
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Сегодня, ${timeStr}`;

  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) + `, ${timeStr}`;
}

function timeAgo(isoStr) {
  if (!isoStr) return '';
  const d    = new Date(isoStr.replace(' ', 'T') + '+03:00');
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60)   return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return fmtNewsDate(isoStr);
}

// Tag label map
const TAG_LABELS = {
  news:        { text: 'НОВОСТЬ',    cls: '' },
  press:       { text: 'ПРЕСС-РЕЛИЗ', cls: 'tag-magenta' },
  disclosure:  { text: 'РАСКРЫТИЕ',  cls: 'tag-green' },
  regulation:  { text: 'РЕГУЛЯТОР',  cls: 'tag-magenta' },
  event:       { text: 'СОБЫТИЕ',    cls: 'tag-green' },
};

// ── Fetch ─────────────────────────────────────────────────────
async function fetchNews() {
  const res = await fetch(NEWS_URL + '&_=' + Date.now(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const cols = json.sitenews?.columns;
  const data = json.sitenews?.data;
  if (!cols || !data) throw new Error('No news data');

  const idx = name => cols.indexOf(name);
  const iId   = idx('id');
  const iTag  = idx('tag');
  const iPub  = idx('published');
  const iTitle = idx('title');
  const iBody  = idx('body');

  return data.slice(0, NEWS_COUNT).map(row => ({
    id:        row[iId],
    tag:       row[iTag] || 'news',
    published: row[iPub],
    title:     row[iTitle] || 'Без заголовка',
    excerpt:   stripHtml(row[iBody]).slice(0, 160),
    url:       NEWS_ITEM_URL(row[iId]),
  }));
}

// ── Render ────────────────────────────────────────────────────
function renderNews(items) {
  const list   = document.getElementById('news-list');
  const status = document.getElementById('news-status');
  if (!list) return;

  if (status) {
    const now = new Date();
    const mskTime = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000)
      .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    status.textContent = `ОБНОВЛЕНО ${mskTime} МСК`;
    status.className = 'rates-status live';
  }

  list.innerHTML = '';
  items.forEach((item, i) => {
    const tagMeta = TAG_LABELS[item.tag] || TAG_LABELS.news;
    const card = document.createElement('article');
    card.className = 'news-card reveal';
    card.style.animationDelay = `${i * 0.07}s`;
    card.setAttribute('aria-label', item.title);

    card.innerHTML = `
      <div class="news-card-left">
        <span class="news-num">${String(i + 1).padStart(2, '0')}</span>
      </div>
      <div class="news-card-body">
        <div class="news-card-meta">
          <span class="tag ${tagMeta.cls}">${tagMeta.text}</span>
          <time class="news-time" datetime="${item.published}" title="${fmtNewsDate(item.published)}">
            ${timeAgo(item.published)}
          </time>
        </div>
        <a href="${item.url}" target="_blank" rel="noopener noreferrer"
           class="news-title" aria-label="${item.title} (открыть на moex.com)">
          ${item.title}
        </a>
        <p class="news-excerpt">${item.excerpt}${item.excerpt.length >= 160 ? '...' : ''}</p>
      </div>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer"
         class="news-arrow" aria-hidden="true" tabindex="-1">→</a>
    `;

    list.appendChild(card);
  });

  // Trigger reveal animations
  requestAnimationFrame(() => {
    document.querySelectorAll('#news-list .reveal').forEach(el => {
      setTimeout(() => el.classList.add('visible'), 50);
    });
  });
}

function renderError(msg) {
  const list   = document.getElementById('news-list');
  const status = document.getElementById('news-status');
  if (list)   list.innerHTML = `<div class="error-state">⚠ ${msg}</div>`;
  if (status) { status.textContent = 'ОШИБКА ЗАГРУЗКИ'; status.className = 'rates-status closed'; }
}

function renderSkeleton() {
  const list = document.getElementById('news-list');
  if (!list) return;
  list.innerHTML = Array.from({ length: NEWS_COUNT }, (_, i) => `
    <div class="news-card news-skeleton" aria-hidden="true" style="animation-delay:${i * 0.1}s">
      <div class="news-card-left"><span class="news-num">0${i + 1}</span></div>
      <div class="news-card-body">
        <div class="news-skel-line news-skel-meta"></div>
        <div class="news-skel-line news-skel-title"></div>
        <div class="news-skel-line news-skel-excerpt"></div>
      </div>
    </div>
  `).join('');
}

// ── Update cycle ──────────────────────────────────────────────
async function updateNews() {
  try {
    const items = await fetchNews();
    renderNews(items);
  } catch (err) {
    console.warn('[MOEX news] fetch failed:', err.message);
    renderError('Не удалось загрузить новости MOEX. Попробуй обновить страницу.');
  }
}

// ── Init ──────────────────────────────────────────────────────
function initNews() {
  const widget = document.getElementById('news-widget');
  if (!widget) return;

  renderSkeleton();
  updateNews();

  // Refresh every 30 minutes
  setInterval(updateNews, 30 * 60 * 1000);

  // Manual refresh button
  document.getElementById('news-refresh-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('news-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⟳ ЗАГРУЗКА...'; }
    renderSkeleton();
    await updateNews();
    if (btn) { btn.disabled = false; btn.textContent = '⟳ ОБНОВИТЬ'; }
  });
}

document.addEventListener('DOMContentLoaded', initNews);
