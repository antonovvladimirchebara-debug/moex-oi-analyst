/**
 * moex-news.js — Headline news from MOEX (filters out routine regulatory items)
 *
 * Source: https://iss.moex.com/iss/sitenews.json (public, no auth)
 * Loads multiple pages and filters out technical/regulatory noise,
 * keeping only substantive business news (same as moex.com "Главные").
 * Refresh: every 30 minutes
 */

const NEWS_BASE = 'https://iss.moex.com/iss/sitenews.json?iss.meta=off&iss.only=sitenews&lang=ru';
const NEWS_PAGE_SIZE = 50;
const NEWS_MAX_PAGES = 6;
const NEWS_COUNT = 8;
const NEWS_ITEM_URL = id => `https://www.moex.com/n${id}`;

const NOISE_PATTERNS = [
  /^О значениях риск/i,
  /^Об установлении риск/i,
  /^Об? изменени\w+ (дополнительных|риск-параметров|уровня листинга|режимов|параметров|нижних границ)/i,
  /^О регистрации /i,
  /^О внесении изменений/i,
  /^О начале торгов ценными бумагами/i,
  /^Об исключении ценных бумаг/i,
  /^О прекращении торгов/i,
  /^О допуске .* к (торгам|операциям)/i,
  /^О приостановлении/i,
  /^О приостановке торгов/i,
  /^О возобновлении/i,
  /^О включении ценных бумаг/i,
  /^Об определении/i,
  /^О порядке (приобретения|сбора|заключения)/i,
  /^О проведении .* (аукцион|размещения|выкупа)/i,
  /^О проведении выкупа облигаций/i,
  /состоится депозитный аукцион/i,
  /проведет депозитный аукцион/i,
  /проводится дискретный аукцион/i,
  /^О присвоении/i,
  /^О переводе (ценных бумаг|обязательств)/i,
  /^Об особенностях/i,
  /^Об оставлении ценных бумаг/i,
  /^О выявленном несоответствии/i,
  /^О публикации расчетных цен/i,
  /изменены значения .* границы ценового коридора/i,
  /изменены значения .* диапазона оценки/i,
  /Изменение параметров .* УФК/i,
  /^Итоги выпуска биржевых облигаций$/i,
  /^Об ограничении кодов расчетов/i,
  /^Информация о продаже инвестиционных паёв/i,
  /^Об отмене размещения/i,
  /^Дополнительные условия проведения торгов/i,
  /^О переносе даты/i,
  /^О предоставлении права/i,
  /^Определена цена исполнения/i,
  /^Цена исполнения /i,
  /^Расчетные цены по срочным/i,
  /^Тестирование /i,
  /^Технические работы /i,
  /тестовом .*(контуре|полигоне|рынка)/i,
  /^Обновлен\w+ (расписание торгов на тестовом|тестового|дистрибутив)/i,
  /^Обновление дистрибутивов/i,
  /^\d{4}-\d{2}-\d{2}/,
];

function isHeadline(title) {
  return !NOISE_PATTERNS.some(re => re.test(title));
}

// ── Helpers ───────────────────────────────────────────────────
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent.replace(/\s+/g, ' ').trim();
}

function fmtNewsDate(isoStr) {
  if (!isoStr) return '';
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

const TAG_LABELS = {
  news:        { text: 'ГЛАВНОЕ',    cls: '' },
  site:        { text: 'ГЛАВНОЕ',    cls: '' },
  press:       { text: 'ПРЕСС-РЕЛИЗ', cls: 'tag-magenta' },
  disclosure:  { text: 'РАСКРЫТИЕ',  cls: 'tag-green' },
  regulation:  { text: 'РЕГУЛЯТОР',  cls: 'tag-magenta' },
  event:       { text: 'СОБЫТИЕ',    cls: 'tag-green' },
};

// ── Fetch (multiple pages, filter noise) ─────────────────────
async function fetchPage(start) {
  const url = `${NEWS_BASE}&start=${start}&_=${Date.now()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.sitenews?.data || [];
}

async function fetchNews() {
  const headlines = [];
  const cols_map = { id: 0, tag: 1, title: 2, published_at: 3 };

  for (let page = 0; page < NEWS_MAX_PAGES && headlines.length < NEWS_COUNT; page++) {
    const rows = await fetchPage(page * NEWS_PAGE_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      const title = row[cols_map.title] || '';
      if (!isHeadline(title)) continue;

      headlines.push({
        id:        row[cols_map.id],
        tag:       row[cols_map.tag] || 'news',
        published: row[cols_map.published_at],
        title:     title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#160;/g, ' '),
        url:       NEWS_ITEM_URL(row[cols_map.id]),
      });

      if (headlines.length >= NEWS_COUNT) break;
    }
  }

  return headlines;
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
      </div>
      <a href="${item.url}" target="_blank" rel="noopener noreferrer"
         class="news-arrow" aria-hidden="true" tabindex="-1">→</a>
    `;

    list.appendChild(card);
  });

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
      <div class="news-card-left"><span class="news-num">${String(i + 1).padStart(2, '0')}</span></div>
      <div class="news-card-body">
        <div class="news-skel-line news-skel-meta"></div>
        <div class="news-skel-line news-skel-title"></div>
      </div>
    </div>
  `).join('');
}

// ── Update cycle ──────────────────────────────────────────────
async function updateNews() {
  try {
    const items = await fetchNews();
    if (items.length === 0) throw new Error('no headlines');
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

  setInterval(updateNews, 30 * 60 * 1000);

  document.getElementById('news-refresh-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('news-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⟳ ЗАГРУЗКА...'; }
    renderSkeleton();
    await updateNews();
    if (btn) { btn.disabled = false; btn.textContent = '⟳ ОБНОВИТЬ'; }
  });
}

document.addEventListener('DOMContentLoaded', initNews);
