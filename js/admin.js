/**
 * admin.js — Owner-only posting panel
 * Uses GitHub Contents API to commit posts directly to the repo
 */

const REPO      = 'antonovvladimirchebara-debug/moex-oi-analyst';
const API_BASE  = `https://api.github.com/repos/${REPO}`;
const TOKEN_KEY = 'moex_oi_gh_token';

let mde = null;
let currentToken = null;
let editMode = null; // null | { id, file, originalDate, postSha }

// ── Utils ─────────────────────────────────────────────────────
function slugify(str) {
  const ru = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',
    ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  return str.toLowerCase()
    .split('').map(c => ru[c] !== undefined ? ru[c] : c).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function toBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function fromBase64(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function formatDateISO() {
  return new Date().toISOString().split('T')[0];
}

function genId() {
  return `${formatDateISO()}-${Math.random().toString(36).slice(2, 8)}`;
}

function showStatus(msg, type = 'success') {
  const el = document.getElementById('publish-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `publish-status ${type}`;
  el.hidden = false;
  if (type === 'success') {
    setTimeout(() => { el.hidden = true; }, 6000);
  }
}

// ── AUTO-HASHTAG ENGINE ───────────────────────────────────────

/**
 * MOEX/Financial keyword → tag mapping dictionary
 * Key: regex pattern (case-insensitive, Russian + Latin)
 * Value: canonical tag name
 */
const HASHTAG_DICTIONARY = [
  // ── Открытый интерес ──────────────────────────────────────
  { patterns: [/\boi\b/i, /открыт\w* интерес/i, /open interest/i, /\bОИ\b/],
    tag: 'OI', priority: 10 },

  // ── Конкретные фьючерсы ───────────────────────────────────
  { patterns: [/\bSI\b/, /доллар.рубл/i, /USD.RUB/i, /\bSiH/i, /\bSiM/i, /\bSiU/i, /\bSiZ/i],
    tag: 'SI', priority: 9 },
  { patterns: [/\bRI\b/, /индекс РТС/i, /RTS/i, /\bRiH/i, /\bRiM/i, /\bRiU/i, /\bRiZ/i],
    tag: 'RI', priority: 9 },
  { patterns: [/\bGAZR\b/i, /\bGAZP\b/i, /газпром/i, /GAZR/i],
    tag: 'GAZR', priority: 9 },
  { patterns: [/\bSBER\b/i, /сбербанк/i, /сбер(?!банк)/i],
    tag: 'SBER', priority: 9 },
  { patterns: [/\bLKOH\b/i, /лукойл/i],
    tag: 'LKOH', priority: 9 },
  { patterns: [/\bGMKN\b/i, /норникель/i, /норильский никель/i],
    tag: 'GMKN', priority: 9 },
  { patterns: [/\bYNDX\b/i, /яндекс/i],
    tag: 'YNDX', priority: 9 },
  { patterns: [/\bTAT[NP]\b/i, /татнефть/i],
    tag: 'TATN', priority: 9 },
  { patterns: [/\bROSN\b/i, /роснефть/i],
    tag: 'ROSN', priority: 9 },
  { patterns: [/\bNLMK\b/i, /НЛМК/i],
    tag: 'NLMK', priority: 8 },
  { patterns: [/\bMAGN\b/i, /ММК\b/i],
    tag: 'MAGN', priority: 8 },
  { patterns: [/\bAFKS\b/i, /АФК система/i],
    tag: 'AFKS', priority: 8 },
  { patterns: [/\bVTBR\b/i, /\bVTB\b/i, /ВТБ\b/i],
    tag: 'VTBR', priority: 8 },
  { patterns: [/\bMGNT\b/i, /магнит/i],
    tag: 'MGNT', priority: 8 },
  { patterns: [/\bPHOR\b/i, /фосагро/i],
    tag: 'PHOR', priority: 8 },
  { patterns: [/\bSNGS\b/i, /сургутнефт/i],
    tag: 'SNGS', priority: 8 },
  { patterns: [/\bMVID\b/i, /м\.видео/i, /мвидео/i],
    tag: 'MVID', priority: 7 },
  { patterns: [/\bGOLD\b/i, /\bGDH\b/i, /золото/i, /gold futures/i],
    tag: 'золото', priority: 8 },
  { patterns: [/\bED\b/, /евро.долл/i, /EUR.USD/i],
    tag: 'ED', priority: 8 },

  // ── Индексы ───────────────────────────────────────────────
  { patterns: [/индекс мосбирж/i, /индекс московской/i, /IMOEX/i, /MOEX index/i],
    tag: 'индекс MOEX', priority: 8 },
  { patterns: [/индекс РТС/i, /\bRTSI\b/i],
    tag: 'индекс РТС', priority: 8 },

  // ── Тип анализа ───────────────────────────────────────────
  { patterns: [/фьюч\w+/i, /futures/i, /контракт\w*/i, /экспирац/i, /поставк\w+/i],
    tag: 'фьючерсы', priority: 7 },
  { patterns: [/акци\w+/i, /акционер\w*/i, /дивиденд\w*/i, /\bstock\b/i],
    tag: 'акции', priority: 7 },
  { patterns: [/опцион\w*/i, /\boption\b/i, /страйк\w*/i, /\bdelta\b/i, /\bgamma\b/i, /\bvega\b/i],
    tag: 'опционы', priority: 7 },
  { patterns: [/обзор рынк/i, /обзор недел/i, /обзор торг/i, /weekly review/i, /итог\w+ недел/i],
    tag: 'обзор рынка', priority: 7 },
  { patterns: [/техничес\w+ анализ/i, /теханализ/i, /технический анализ/i],
    tag: 'теханализ', priority: 6 },
  { patterns: [/фундаменталь\w*/i, /fundamental\w*/i, /мультипликатор\w*/i, /P\/E/i, /EV\/EBITDA/i],
    tag: 'фундаментал', priority: 6 },

  // ── Торговые концепции ────────────────────────────────────
  { patterns: [/ликвидность/i, /liquidity/i, /ликвидн\w*/i],
    tag: 'ликвидность', priority: 6 },
  { patterns: [/уровень\w*/i, /поддержк\w*/i, /сопротивлен\w*/i, /support/i, /resistance/i],
    tag: 'уровни', priority: 6 },
  { patterns: [/стакан/i, /order book/i, /стакан\w*/i, /объём\w*/i, /volume/i],
    tag: 'объём', priority: 6 },
  { patterns: [/имбаланс/i, /imbalance/i, /дисбаланс/i],
    tag: 'имбаланс', priority: 6 },
  { patterns: [/крупный игрок/i, /институционал/i, /smart money/i, /маркет.мейкер/i],
    tag: 'крупные игроки', priority: 7 },
  { patterns: [/шорт.сквиз/i, /short squeeze/i, /выбива\w+ стопов/i, /стоп.охота/i],
    tag: 'шорт-сквиз', priority: 6 },
  { patterns: [/лонг/i, /long position/i, /покупател\w*/i, /быки/i, /bullish/i],
    tag: 'лонг', priority: 5 },
  { patterns: [/шорт\b/i, /short position/i, /продавц\w*/i, /медведи/i, /bearish/i],
    tag: 'шорт', priority: 5 },
  { patterns: [/волатильность/i, /volatility/i, /\bVIX\b/i, /\bRVI\b/i],
    tag: 'волатильность', priority: 6 },
  { patterns: [/тренд\w*/i, /trend/i, /импульс/i, /импульсн\w*/i],
    tag: 'тренд', priority: 5 },
  { patterns: [/боков\w+/i, /флэт/i, /flat market/i, /range/i, /консолидац/i],
    tag: 'боковик', priority: 5 },

  // ── Макро / Рынок ─────────────────────────────────────────
  { patterns: [/ключ\w+ ставк/i, /ставка ЦБ/i, /цб рф/i, /центробанк/i, /банк росси/i],
    tag: 'ЦБ РФ', priority: 7 },
  { patterns: [/инфляц/i, /inflation/i, /ИПЦ\b/i, /\bCPI\b/i],
    tag: 'инфляция', priority: 6 },
  { patterns: [/нефть/i, /\bBrent\b/i, /\bBRZ\b/i, /\bBRH\b/i, /crude oil/i, /\bWTI\b/i],
    tag: 'нефть', priority: 8 },
  { patterns: [/санкци/i, /sanction/i],
    tag: 'санкции', priority: 7 },
  { patterns: [/дивиденд\w*/i, /dividend/i, /ДИВГЭП/i, /дивидендный гэп/i],
    tag: 'дивиденды', priority: 6 },
  { patterns: [/отчётность/i, /отчет\w*/i, /МСФО/i, /РСБУ/i, /earnings/i, /квартальн\w+ результат/i],
    tag: 'отчётность', priority: 6 },

  // ── Торговые инструменты ──────────────────────────────────
  { patterns: [/стратеги\w+/i, /торговая идея/i, /торговый план/i, /сетап/i, /setup/i],
    tag: 'стратегия', priority: 6 },
  { patterns: [/сигнал\w*/i, /signal/i, /точка входа/i, /entry/i],
    tag: 'сигнал', priority: 5 },
  { patterns: [/риск.менеджмент/i, /стоп.лосс/i, /stop loss/i, /тейк.профит/i],
    tag: 'риск-менеджмент', priority: 6 },
];

/**
 * Analyse text and return suggested tags sorted by priority and frequency
 * @param {string} text — combined title + content
 * @returns {string[]} — array of unique tag names
 */
function generateTagsFromText(text) {
  if (!text || text.trim().length < 10) return [];

  const found = new Map(); // tag → {priority, count}

  for (const entry of HASHTAG_DICTIONARY) {
    let count = 0;
    for (const pattern of entry.patterns) {
      const matches = text.match(new RegExp(pattern.source, 'gi'));
      if (matches) count += matches.length;
    }
    if (count > 0) {
      found.set(entry.tag, {
        priority: entry.priority,
        count,
        score: entry.priority * 2 + count,
      });
    }
  }

  // Sort by score descending, return top 8 tags
  return [...found.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 8)
    .map(([tag]) => tag);
}

/**
 * Render suggestion chips under the tags input
 */
function renderTagSuggestions(suggested) {
  const container = document.getElementById('tags-suggestions');
  const input     = document.getElementById('post-tags-input');
  if (!container || !input) return;

  container.hidden = false;
  container.innerHTML = '';

  if (suggested.length === 0) {
    container.innerHTML = '<span class="tags-suggestions-empty">Ничего не найдено. Напиши больше текста.</span>';
    return;
  }

  // Label
  const label = document.createElement('div');
  label.className = 'tags-suggestions-label';
  label.textContent = 'НАЙДЕНО ТЕГОВ — КЛИКНИ ЧТОБЫ ДОБАВИТЬ:';
  container.appendChild(label);

  // Current tags in the input
  const current = input.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  suggested.forEach(tag => {
    const alreadyAdded = current.includes(tag.toLowerCase());
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `tag-suggestion ${alreadyAdded ? 'exists' : 'new'}`;
    chip.innerHTML = alreadyAdded
      ? `<span>${tag}</span><span class="tag-add-icon">✓</span>`
      : `<span>${tag}</span><span class="tag-add-icon">+</span>`;
    chip.title = alreadyAdded ? 'Уже добавлен' : `Добавить тег «${tag}»`;
    chip.disabled = alreadyAdded;
    chip.setAttribute('aria-pressed', alreadyAdded ? 'true' : 'false');

    if (!alreadyAdded) {
      chip.addEventListener('click', () => {
        const val = input.value.trim();
        input.value = val ? `${val}, ${tag}` : tag;
        // Re-render to update which tags are already added
        renderTagSuggestions(suggested);
      });
    }

    container.appendChild(chip);
  });
}

/**
 * Main auto-tag trigger
 */
function triggerAutoTags() {
  const btn     = document.getElementById('auto-tags-btn');
  const title   = document.getElementById('post-title-input')?.value || '';
  const content = mde?.value() || '';
  const combined = `${title} ${content}`;

  if (combined.trim().length < 20) {
    const container = document.getElementById('tags-suggestions');
    if (container) {
      container.hidden = false;
      container.innerHTML = '<span class="tags-suggestions-empty">Введи заголовок или содержание поста для анализа.</span>';
    }
    return;
  }

  btn?.classList.add('loading');
  // Small async delay to show loading state
  setTimeout(() => {
    const tags = generateTagsFromText(combined);
    renderTagSuggestions(tags);
    btn?.classList.remove('loading');
  }, 150);
}


async function ghGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `token ${currentToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function ghPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${currentToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getFileSha(path) {
  try {
    const data = await ghGet(`/contents/${path}`);
    return data.sha;
  } catch {
    return null;
  }
}

// ── Load posts index from GitHub ──────────────────────────────
async function loadPostsIndex() {
  try {
    const data = await ghGet('/contents/posts/index.json');
    const content = fromBase64(data.content.replace(/\n/g, ''));
    return { posts: JSON.parse(content), sha: data.sha };
  } catch {
    return { posts: [], sha: null };
  }
}

// ── Save posts index to GitHub ────────────────────────────────
async function savePostsIndex(posts, sha) {
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  const content = toBase64(JSON.stringify(sorted, null, 2));
  const body = {
    message: `docs: update posts index [${formatDateISO()}]`,
    content,
  };
  if (sha) body.sha = sha;
  return ghPut('/contents/posts/index.json', body);
}

// ── Publish / Update post ─────────────────────────────────────
async function publishPost() {
  const titleEl   = document.getElementById('post-title-input');
  const tagsEl    = document.getElementById('post-tags-input');
  const excerptEl = document.getElementById('post-excerpt-input');
  const slugEl    = document.getElementById('post-slug-input');

  const title   = titleEl?.value.trim();
  const tagsRaw = tagsEl?.value.trim();
  const excerpt = excerptEl?.value.trim();
  const content = mde?.value()?.trim();

  if (!title) { showStatus('Введи заголовок поста!', 'error'); return; }
  if (!content) { showStatus('Введи содержание поста!', 'error'); return; }

  const btn = document.getElementById('publish-btn');
  const isEditing = !!editMode;
  btn.disabled = true;
  btn.textContent = isEditing ? 'СОХРАНЕНИЕ...' : 'ПУБЛИКАЦИЯ...';

  try {
    const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const date    = isEditing ? editMode.originalDate : formatDateISO();
    const slugVal = slugEl?.value.trim() || slugify(title);
    const id      = isEditing ? editMode.id : `${date}-${slugVal}`;
    const file    = isEditing ? editMode.file : `${id}.json`;

    // 1. Save post JSON
    const postData = { id, title, date, tags, excerpt, content, file };
    const postContent = toBase64(JSON.stringify(postData, null, 2));
    const existingSha = isEditing ? editMode.postSha : await getFileSha(`posts/${file}`);

    const postBody = {
      message: isEditing ? `fix: update post "${title}"` : `feat: add post "${title}"`,
      content: postContent,
    };
    if (existingSha) postBody.sha = existingSha;
    await ghPut(`/contents/posts/${file}`, postBody);

    // 2. Update index
    const { posts, sha } = await loadPostsIndex();
    const existing = posts.findIndex(p => p.id === id);
    const meta = { id, title, date, tags, excerpt, file };
    if (existing >= 0) {
      posts[existing] = meta;
    } else {
      posts.push(meta);
    }
    await savePostsIndex(posts, sha);

    // 3. Update sitemap
    await updateSitemap(posts);

    showStatus(
      isEditing
        ? `✓ ПОСТ ОБНОВЛЁН: "${title}"\nURL: post.html?id=${id}`
        : `✓ ПОСТ ОПУБЛИКОВАН: "${title}"\nURL: post.html?id=${id}`,
      'success'
    );

    clearPostForm();
    cancelEditMode();
    await loadManagePosts();

  } catch (err) {
    showStatus(`ОШИБКА: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = editMode
      ? '<span class="btn-icon">✎</span>ОБНОВИТЬ'
      : '<span class="btn-icon">▶</span>ОПУБЛИКОВАТЬ';
  }
}

function clearPostForm() {
  document.getElementById('post-title-input').value   = '';
  document.getElementById('post-tags-input').value    = '';
  document.getElementById('post-excerpt-input').value = '';
  document.getElementById('post-slug-input').value    = '';
  const suggestionsEl = document.getElementById('tags-suggestions');
  if (suggestionsEl) suggestionsEl.hidden = true;
  mde?.value('');
}

function cancelEditMode() {
  editMode = null;
  const btn = document.getElementById('publish-btn');
  if (btn) btn.innerHTML = '<span class="btn-icon">▶</span>ОПУБЛИКОВАТЬ';
  const formTitle = document.getElementById('form-mode-title');
  if (formTitle) formTitle.textContent = 'СОЗДАТЬ ПОСТ';
  const cancelBtn = document.getElementById('cancel-edit-btn');
  if (cancelBtn) cancelBtn.hidden = true;
  const slugInput = document.getElementById('post-slug-input');
  if (slugInput) {
    slugInput.disabled = false;
    delete slugInput.dataset.manual;
  }
}

window.cancelEditModeGlobal = function() {
  cancelEditMode();
  clearPostForm();
};

// ── Update sitemap after post ─────────────────────────────────
async function updateSitemap(posts) {
  const base = 'https://antonovvladimirchebara-debug.github.io/moex-oi-analyst';
  const today = formatDateISO();
  const postUrls = posts.map(p => `
  <url>
    <loc>${base}/post.html?id=${p.id}</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${base}/blog.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>${postUrls}
</urlset>`;

  const sha = await getFileSha('sitemap.xml');
  const body = {
    message: `chore: update sitemap [${today}]`,
    content: toBase64(xml),
  };
  if (sha) body.sha = sha;
  await ghPut('/contents/sitemap.xml', body).catch(() => {});
}

// ── Load manage posts tab ─────────────────────────────────────
async function loadManagePosts() {
  const listEl = document.getElementById('admin-posts-list');
  if (!listEl) return;

  listEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>ЗАГРУЗКА...</span></div>';

  const { posts } = await loadPostsIndex();

  if (posts.length === 0) {
    listEl.innerHTML = '<div class="no-posts">ПОСТОВ НЕТ.</div>';
    return;
  }

  listEl.innerHTML = posts.map(p => `
    <div class="admin-post-row">
      <span class="admin-post-title">${p.title}</span>
      <span class="admin-post-date">${p.date}</span>
      <div class="admin-post-actions">
        <a href="post.html?id=${p.id}" target="_blank" class="btn-secondary" style="font-size:0.65rem;padding:0.35rem 0.8rem;">ПРОСМОТР</a>
        <button class="btn-outline" style="font-size:0.65rem;padding:0.35rem 0.8rem;" onclick="editPost('${p.id}','${p.file}')">✎ РЕДАКТИРОВАТЬ</button>
        <button class="btn-danger" style="font-size:0.65rem;padding:0.35rem 0.8rem;" onclick="deletePost('${p.id}','${p.file}')">УДАЛИТЬ</button>
      </div>
    </div>
  `).join('');
}

// ── Edit post ─────────────────────────────────────────────────
window.editPost = async function(id, file) {
  try {
    // Fetch full post content from GitHub
    const data = await ghGet(`/contents/posts/${file}`);
    const postJson = fromBase64(data.content.replace(/\n/g, ''));
    const post = JSON.parse(postJson);

    // Fill form
    document.getElementById('post-title-input').value   = post.title || '';
    document.getElementById('post-tags-input').value    = (post.tags || []).join(', ');
    document.getElementById('post-excerpt-input').value = post.excerpt || '';
    const slugInput = document.getElementById('post-slug-input');
    slugInput.value = id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    slugInput.disabled = true; // slug locked in edit mode
    slugInput.dataset.manual = 'true';
    if (mde) mde.value(post.content || '');

    // Store edit state
    editMode = { id, file, originalDate: post.date, postSha: data.sha };

    // Update UI
    const formTitle = document.getElementById('form-mode-title');
    if (formTitle) formTitle.textContent = 'РЕДАКТИРОВАТЬ ПОСТ';
    const publishBtn = document.getElementById('publish-btn');
    if (publishBtn) publishBtn.innerHTML = '<span class="btn-icon">✎</span>ОБНОВИТЬ';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.hidden = false;

    // Switch to new-post tab
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.admin-tab-content').forEach(t => { t.hidden = true; });
    const newPostTab = document.querySelector('[data-tab="new-post"]');
    if (newPostTab) { newPostTab.classList.add('active'); newPostTab.setAttribute('aria-selected', 'true'); }
    const tabContent = document.getElementById('tab-new-post');
    if (tabContent) tabContent.hidden = false;

    // Scroll to form
    document.getElementById('tab-new-post')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showStatus(`Редактирование: "${post.title}"`, 'success');

  } catch (err) {
    alert(`Ошибка загрузки поста: ${err.message}`);
  }
};

// ── Delete post ───────────────────────────────────────────────
window.deletePost = async function(id, file) {
  if (!confirm(`Удалить пост "${id}"?`)) return;

  try {
    const sha = await getFileSha(`posts/${file}`);
    if (sha) {
      await ghPut(`/contents/posts/${file}`, {
        message: `chore: delete post ${id}`,
        sha,
        content: '',
      }).catch(async () => {
        // DELETE method
        await fetch(`${API_BASE}/contents/posts/${file}`, {
          method: 'DELETE',
          headers: {
            Authorization: `token ${currentToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: `chore: delete post ${id}`, sha }),
        });
      });
    }

    const { posts, sha: indexSha } = await loadPostsIndex();
    const filtered = posts.filter(p => p.id !== id);
    await savePostsIndex(filtered, indexSha);
    await loadManagePosts();
  } catch (err) {
    alert(`Ошибка удаления: ${err.message}`);
  }
};

// ── Auth ──────────────────────────────────────────────────────
async function verifyToken(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) throw new Error('Неверный токен');
  const user = await res.json();
  if (user.login !== 'antonovvladimirchebara-debug') {
    throw new Error(`Доступ только для автора блога. Ваш логин: ${user.login}`);
  }
  return user;
}

function showPanel() {
  document.getElementById('auth-gate').hidden  = true;
  document.getElementById('admin-panel').hidden = false;
  document.getElementById('logout-btn').hidden  = false;
}

// ── Init Editor ───────────────────────────────────────────────
function initEditor() {
  if (typeof EasyMDE === 'undefined') return;

  // Hidden file input for image upload
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  mde = new EasyMDE({
    element: document.getElementById('post-content-editor'),
    spellChecker: false,
    autosave: { enabled: true, uniqueId: 'moex-post-draft', delay: 3000 },
    placeholder: '## Анализ открытого интереса\n\nВведи текст поста в формате Markdown...',
    toolbar: [
      'bold', 'italic', 'heading', '|',
      'quote', 'unordered-list', 'ordered-list', '|',
      'link',
      {
        name: 'upload-image',
        action: () => fileInput.click(),
        className: 'fa fa-image',
        title: 'Загрузить изображение с ПК',
        text: '📷',
      },
      '|',
      'preview', 'side-by-side', 'fullscreen', '|', 'guide',
    ],
    minHeight: '400px',
  });

  // Image upload handler
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showStatus('Файл слишком большой (макс. 10 МБ)', 'error');
      fileInput.value = '';
      return;
    }

    showStatus('⏳ Загрузка изображения...', 'success');

    try {
      // Read as base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to posts/images/
      const ext = file.name.split('.').pop().toLowerCase();
      const safeName = `${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${ext}`;
      const ghPath = `/contents/posts/images/${safeName}`;
      const existingSha = await getFileSha(`posts/images/${safeName}`);
      const body = {
        message: `feat: upload image ${safeName}`,
        content: base64,
      };
      if (existingSha) body.sha = existingSha;
      await ghPut(ghPath, body);

      // Insert markdown at cursor
      const rawUrl = `https://raw.githubusercontent.com/${REPO}/main/posts/images/${safeName}`;
      const mdText = `\n![изображение](${rawUrl})\n`;
      const cm = mde.codemirror;
      const cursor = cm.getCursor();
      cm.replaceRange(mdText, cursor);

      showStatus(`✓ Изображение загружено: ${safeName}`, 'success');
    } catch (err) {
      showStatus(`Ошибка загрузки: ${err.message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  // Re-run auto-tags after user stops typing in editor (debounced)
  let debounceTimer = null;
  mde.codemirror.on('change', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const container = document.getElementById('tags-suggestions');
      if (container && !container.hidden) triggerAutoTags();
    }, 600);
  });
}

// ── Auto-generate slug from title ────────────────────────────
function setupSlugAutoGen() {
  const titleInput = document.getElementById('post-title-input');
  const slugInput  = document.getElementById('post-slug-input');
  if (!titleInput || !slugInput) return;

  titleInput.addEventListener('input', () => {
    if (!slugInput.dataset.manual) {
      slugInput.value = slugify(titleInput.value);
    }
    // Re-render suggestions if panel already open
    const container = document.getElementById('tags-suggestions');
    if (container && !container.hidden) triggerAutoTags();
  });
  slugInput.addEventListener('input', () => {
    slugInput.dataset.manual = 'true';
  });
}

// ── Auto-tags wiring ──────────────────────────────────────────
function setupAutoTags() {
  const btn = document.getElementById('auto-tags-btn');
  if (!btn) return;
  btn.addEventListener('click', triggerAutoTags);

  // Re-render chip states when user manually edits tags field
  document.getElementById('post-tags-input')?.addEventListener('input', () => {
    const container = document.getElementById('tags-suggestions');
    if (container && !container.hidden) triggerAutoTags();
  });
}

// ── Tabs ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.admin-tab-content').forEach(t => { t.hidden = true; });

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const tabId = `tab-${btn.dataset.tab}`;
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.hidden = false;

      if (btn.dataset.tab === 'manage-posts') {
        await loadManagePosts();
      } else if (btn.dataset.tab === 'audio-player') {
        initAudioTab();
      } else if (btn.dataset.tab === 'video-player') {
        initVideoTab();
      }
    });
  });
}

// ── Preview ───────────────────────────────────────────────────
function setupPreview() {
  document.getElementById('preview-btn')?.addEventListener('click', () => {
    const pane    = document.getElementById('preview-pane');
    const content = document.getElementById('preview-content');
    if (!pane || !content) return;

    const md = mde?.value() || '';
    if (window.marked) {
      content.innerHTML = marked.parse(md);
    } else {
      content.textContent = md;
    }
    pane.hidden = !pane.hidden;
  });
}

// ── Main entry ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Check saved token
  const saved = localStorage.getItem(TOKEN_KEY);

  const loginBtn  = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const tokenInput = document.getElementById('token-input');
  const authError  = document.getElementById('auth-error');

  loginBtn?.addEventListener('click', async () => {
    const token = tokenInput?.value.trim();
    if (!token) return;

    loginBtn.disabled = true;
    loginBtn.textContent = 'ПРОВЕРКА...';

    try {
      await verifyToken(token);
      currentToken = token;
      localStorage.setItem(TOKEN_KEY, token);
      showPanel();
      initEditor();
      setupTabs();
      setupPreview();
      setupSlugAutoGen();
      setupAutoTags();
      document.getElementById('publish-btn')?.addEventListener('click', publishPost);
      initAudioTab();
      initVideoTab();
    } catch (err) {
      if (authError) {
        authError.textContent = err.message;
        authError.hidden = false;
      }
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span class="btn-icon">▶</span>ВОЙТИ';
    }
  });

  tokenInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn?.click();
  });

  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    currentToken = null;
    location.reload();
  });

  // Nav scroll
  const nav = document.querySelector('.nav-main');
  window.addEventListener('scroll', () => {
    nav?.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });

  // Auto-login if token saved
  if (saved) {
    if (tokenInput) tokenInput.value = saved;
    verifyToken(saved).then(() => {
      currentToken = saved;
      showPanel();
      initEditor();
      setupTabs();
      setupPreview();
      setupSlugAutoGen();
      setupAutoTags();
      document.getElementById('publish-btn')?.addEventListener('click', publishPost);
      initAudioTab();
      initVideoTab();
    }).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
    });
  }

  // Mobile nav
  const burger = document.getElementById('nav-burger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const open = burger.classList.toggle('open');
      mobileMenu.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      open ? mobileMenu.removeAttribute('aria-hidden') : mobileMenu.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('.mobile-link').forEach(l => l.addEventListener('click', () => {
      burger.classList.remove('open');
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') burger.click(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 768 && burger.classList.contains('open')) burger.click(); });
  }
});

// ══════════════════════════════════════════════════════════════════
//  AUDIO PLAYER ADMIN — Управление аудиоплеером
// ══════════════════════════════════════════════════════════════════

const AUDIO_CONFIG_PATH = 'audio-config.json';
const AUDIO_DIR         = 'audio/';
const YANDEX_TK_ADMIN   = 'moex_oi_yandex_token';
const YANDEX_UID_ADMIN  = 'moex_oi_yandex_uid';

let audioConfig = { localTracks: [], yandexPlaylists: [], yandexClientId: '', activeSource: 'local' };
let audioConfigSha = null;     // current SHA of audio-config.json in repo

// ── Init audio tab ────────────────────────────────────────────────
let _audioTabSetupDone = false;
function initAudioTab() {
  loadAudioConfig();
  if (!_audioTabSetupDone) {
    _audioTabSetupDone = true;
    setupAudioUpload();
    setupAudioSave();
    setupAudioUrlButton();
    setupYandexSection();
  }
  checkYandexOAuthReturn();
}

// ── Load audio-config.json from GitHub ───────────────────────────
async function loadAudioConfig() {
  try {
    const r = await fetch(`${API_BASE}/contents/${AUDIO_CONFIG_PATH}`, {
      headers: { 'Authorization': `token ${currentToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (r.ok) {
      const data = await r.json();
      audioConfigSha = data.sha;
      const decoded = fromBase64(data.content.replace(/\n/g, ''));
      audioConfig = JSON.parse(decoded);
    }
  } catch (_) {
    // File doesn't exist yet — use defaults
    audioConfigSha = null;
  }
  normalizeAudioPlaylistTracks();
  renderLocalTracksList();
  renderSelectedYandexPlaylists();
  updateYandexConnectionUI();
}

/** Поля enabled/source по умолчанию (обратная совместимость со старым audio-config). */
function normalizeAudioPlaylistTracks() {
  if (!audioConfig.localTracks) audioConfig.localTracks = [];
  audioConfig.localTracks.forEach(t => {
    if (t.enabled === undefined) t.enabled = true;
    if (!t.source) {
      if (t.streamUrl && !t.filename) t.source = 'stream';
      else t.source = 'local';
    }
  });
}

function parseAudioStreamUrl(raw) {
  const u = raw.trim();
  if (!u) return null;
  try {
    const url = new URL(u.startsWith('http') ? u : `https://${u}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { streamUrl: url.href };
  } catch {
    return null;
  }
}

// ── Save audio-config.json to GitHub ─────────────────────────────
async function saveAudioConfig(config) {
  const content = toBase64(JSON.stringify(config, null, 2));
  const body = {
    message: 'feat: update audio player config',
    content,
    ...(audioConfigSha ? { sha: audioConfigSha } : {})
  };

  const r = await fetch(`${API_BASE}/contents/${AUDIO_CONFIG_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${currentToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}`);
  }
  const data = await r.json();
  audioConfigSha = data.content.sha;
  audioConfig = config;
  return data;
}

// ── Upload audio file to /audio/ in repo ─────────────────────────
async function uploadAudioFile(file) {
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  if (file.size > MAX_SIZE) {
    throw new Error(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} MB > 50 MB)`);
  }

  const filename = sanitizeFilename(file.name);
  const path     = `${AUDIO_DIR}${filename}`;

  // Check if file already exists (get SHA for update)
  let existingSha = null;
  try {
    const checkR = await fetch(`${API_BASE}/contents/${path}`, {
      headers: { 'Authorization': `token ${currentToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (checkR.ok) {
      const existing = await checkR.json();
      existingSha = existing.sha;
    }
  } catch (_) {}

  // Read file as base64
  const base64 = await fileToBase64(file);

  const body = {
    message: `feat: upload audio ${filename}`,
    content: base64,
    ...(existingSha ? { sha: existingSha } : {})
  };

  const r = await fetch(`${API_BASE}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${currentToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}`);
  }

  return filename;
}

// Read file as raw base64 (no data-url prefix)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(',')[1]; // remove "data:audio/...;base64,"
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Sanitize filename: transliterate + safe chars only
function sanitizeFilename(name) {
  const ru = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',
    к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',
    ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  const base = name.toLowerCase()
    .replace(/\.[^.]+$/, '')           // remove extension
    .split('').map(c => ru[c] !== undefined ? ru[c] : c).join('')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const ext = (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  return base + ext;
}

// ── Render local + URL playlist (как видеоплеер) ──────────────────
function renderLocalTracksList() {
  const list = document.getElementById('audio-track-list');
  if (!list) return;

  const tracks = audioConfig.localTracks || [];
  if (tracks.length === 0) {
    list.innerHTML = '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-muted);text-align:center;padding:1rem;letter-spacing:1px;">ПЛЕЙЛИСТ ПУСТ — ЗАГРУЗИ ФАЙЛ ИЛИ ДОБАВЬ URL</div>';
    return;
  }

  list.innerHTML = tracks
    .map((tr, i) => {
      const on = tr.enabled !== false;
      const isStream = tr.source === 'stream' || (tr.streamUrl && !tr.filename);
      const badge = isStream ? 'URL' : 'FILE';
      const meta = isStream
        ? escapeAdminHtml((tr.streamUrl || '').slice(0, 80))
        : escapeAdminHtml(tr.filename || '');
      return `
    <div class="audio-track-item audio-playlist-item" draggable="true" data-index="${i}">
      <label class="video-on-label" title="В плейлисте на сайте">
        <input type="checkbox" class="audio-enabled-cb" data-index="${i}" ${on ? 'checked' : ''}>
        <span>ЭФИР</span>
      </label>
      <span class="audio-track-drag" title="Перетащить">⠿</span>
      <div class="audio-track-info-text" style="flex:1;min-width:0;">
        <input type="text" class="form-input neon-input audio-title-input" data-index="${i}"
               value="${escapeAdminHtml(tr.title || '')}"
               placeholder="Название"
               style="font-size:0.65rem;padding:0.35rem 0.5rem;margin-bottom:0.25rem;width:100%;">
        <div class="audio-track-artist-edit">
          <input type="text" class="audio-artist-input"
                 value="${escapeAdminHtml(tr.artist || '')}"
                 placeholder="Исполнитель"
                 data-index="${i}"
                 style="background:transparent;border:none;border-bottom:1px solid rgba(0,255,255,0.1);
                        color:var(--text-secondary);font-family:var(--font-mono);font-size:0.58rem;
                        width:100%;max-width:220px;outline:none;letter-spacing:0.5px;">
        </div>
        <div style="font-family:var(--font-mono);font-size:0.52rem;color:var(--text-muted);word-break:break-all;">${meta}</div>
      </div>
      <div class="audio-track-size" style="font-size:0.5rem;">${badge}</div>
      <span class="audio-track-status done">✓</span>
      <button type="button" class="audio-track-del" data-index="${i}" title="Удалить">✕</button>
    </div>`;
    })
    .join('');

  list.querySelectorAll('.audio-enabled-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.index, 10);
      if (audioConfig.localTracks[idx]) {
        audioConfig.localTracks[idx].enabled = cb.checked;
      }
    });
  });

  list.querySelectorAll('.audio-title-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.index, 10);
      if (audioConfig.localTracks[idx]) {
        audioConfig.localTracks[idx].title = inp.value.trim();
      }
    });
  });

  list.querySelectorAll('.audio-artist-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.index, 10);
      if (audioConfig.localTracks[idx]) {
        audioConfig.localTracks[idx].artist = inp.value.trim();
      }
    });
  });

  list.querySelectorAll('.audio-track-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      audioConfig.localTracks.splice(idx, 1);
      renderLocalTracksList();
    });
  });

  setupAudioPlaylistDragSort(list, '.audio-playlist-item');
}

function setupAudioPlaylistDragSort(container, selector) {
  let dragging = null;
  container.querySelectorAll(selector).forEach(item => {
    item.addEventListener('dragstart', () => {
      dragging = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragging = null;
      const newOrder = [];
      container.querySelectorAll(selector).forEach(el => {
        const idx = parseInt(el.dataset.index, 10);
        if (!isNaN(idx) && audioConfig.localTracks[idx]) {
          newOrder.push(audioConfig.localTracks[idx]);
        }
      });
      audioConfig.localTracks = newOrder;
      renderLocalTracksList();
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === item) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) container.insertBefore(dragging, item);
      else container.insertBefore(dragging, item.nextSibling);
    });
  });
}

function setupAudioUrlButton() {
  const btn = document.getElementById('audio-add-url-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const urlInp = document.getElementById('audio-url-input');
    const titleInp = document.getElementById('audio-url-title');
    const artistInp = document.getElementById('audio-url-artist');
    const parsed = parseAudioStreamUrl(urlInp?.value || '');
    if (!parsed) {
      alert('Нужна корректная http(s) ссылка на аудиопоток.');
      return;
    }
    audioConfig.localTracks.push({
      id: genId(),
      title: (titleInp?.value || '').trim() || 'Поток',
      artist: (artistInp?.value || '').trim(),
      source: 'stream',
      streamUrl: parsed.streamUrl,
      enabled: true,
    });
    if (urlInp) urlInp.value = '';
    if (titleInp) titleInp.value = '';
    if (artistInp) artistInp.value = '';
    renderLocalTracksList();
  });
}

function escapeAdminHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Setup upload zone ─────────────────────────────────────────────
function setupAudioUpload() {
  const zone = document.getElementById('audio-upload-zone');
  const input = document.getElementById('audio-file-input');
  if (!zone || !input) return;
  if (zone.dataset.uploadInited) return;
  zone.dataset.uploadInited = '1';

  // <label for="audio-file-input"> opens dialog natively — no click handler needed
  zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleAudioFiles(e.dataTransfer.files);
  });

  input.addEventListener('change', () => {
    handleAudioFiles(input.files);
    input.value = '';
  });
}

async function handleAudioFiles(files) {
  if (!files || files.length === 0) return;
  const list = document.getElementById('audio-track-list');

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('audio/')) continue;

    // Add pending item to UI
    const tempId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item = document.createElement('div');
    item.className = 'audio-track-item';
    item.id = tempId;
    item.innerHTML = `
      <span class="audio-track-drag">⠿</span>
      <div class="audio-track-info-text">
        <div class="audio-track-name">${escapeAdminHtml(file.name)}</div>
        <div class="audio-track-artist-edit" style="color:var(--text-muted);font-family:var(--font-mono);font-size:0.58rem;">
          ${(file.size / 1024 / 1024).toFixed(2)} MB
        </div>
      </div>
      <div class="audio-track-size">${file.name}</div>
      <span class="audio-track-status uploading">ЗАГРУЗКА...</span>
      <button class="audio-track-del" disabled>✕</button>
    `;
    // Insert before "list empty" message or append
    const emptyMsg = list.querySelector('div[style]');
    if (emptyMsg) emptyMsg.remove();
    list.appendChild(item);

    try {
      const filename = await uploadAudioFile(file);
      const statusEl = item.querySelector('.audio-track-status');
      if (statusEl) {
        statusEl.textContent = '✓ ЗАГРУЖЕН';
        statusEl.className = 'audio-track-status done';
      }

      // Add to config
      const trackTitle = file.name.replace(/\.[^.]+$/, '');
      audioConfig.localTracks.push({
        id: genId(),
        title: trackTitle,
        artist: '',
        filename,
        source: 'local',
        enabled: true,
      });

      item.remove();
      renderLocalTracksList();

    } catch (err) {
      const statusEl = item.querySelector('.audio-track-status');
      if (statusEl) {
        statusEl.textContent = `ОШИБКА: ${err.message}`;
        statusEl.className = 'audio-track-status error';
      }
    }
  }
}

// ── Setup save button ─────────────────────────────────────────────
function setupAudioSave() {
  const btn = document.getElementById('audio-save-playlist-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    setAudioSaveStatus('СОХРАНЕНИЕ...', 'loading');
    btn.disabled = true;
    try {
      await saveAudioConfig({ ...audioConfig });
      setAudioSaveStatus('✓ ПЛЕЙЛИСТ СОХРАНЁН В РЕПОЗИТОРИЙ', 'success');
      if (window.audioPlayer && typeof window.audioPlayer.reload === 'function') {
        window.audioPlayer.reload();
      }
    } catch (err) {
      setAudioSaveStatus(`ОШИБКА: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

function setAudioSaveStatus(msg, type) {
  const el = document.getElementById('audio-save-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `audio-save-status ${type}`;
  el.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 6000);
  }
}

// ── Yandex Music section ──────────────────────────────────────────
function setupYandexSection() {
  const connectBtn    = document.getElementById('yandex-connect-btn');
  const disconnectBtn = document.getElementById('yandex-disconnect-btn');
  const addPlBtn      = document.getElementById('yandex-add-playlist-btn');
  const saveBtn       = document.getElementById('yandex-save-btn');

  connectBtn?.addEventListener('click', () => {
    const clientId = document.getElementById('yandex-client-id-input')?.value.trim();
    if (!clientId) {
      showYandexMsg('Введи Client ID приложения Яндекс OAuth', 'error');
      return;
    }
    // Save client ID
    audioConfig.yandexClientId = clientId;
    // Redirect to Yandex OAuth
    const redirectUri = encodeURIComponent(window.location.href.split('#')[0]);
    const oauthUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&scope=music%3Aread`;
    window.location.href = oauthUrl;
  });

  disconnectBtn?.addEventListener('click', () => {
    localStorage.removeItem(YANDEX_TK_ADMIN);
    localStorage.removeItem(YANDEX_UID_ADMIN);
    audioConfig.yandexClientId = '';
    updateYandexConnectionUI();
    showYandexMsg('Аккаунт Яндекс Музыки отключён', 'success');
  });

  addPlBtn?.addEventListener('click', addYandexPlaylistManual);

  saveBtn?.addEventListener('click', async () => {
    setYandexSaveStatus('СОХРАНЕНИЕ...', 'loading');
    saveBtn.disabled = true;
    try {
      const clientId = document.getElementById('yandex-client-id-input')?.value.trim() || audioConfig.yandexClientId;
      audioConfig.yandexClientId = clientId;
      await saveAudioConfig({ ...audioConfig });
      setYandexSaveStatus('✓ НАСТРОЙКИ ЯНДЕКС СОХРАНЕНЫ', 'success');
      if (window.audioPlayer && typeof window.audioPlayer.reload === 'function') {
        window.audioPlayer.reload();
      }
    } catch (err) {
      setYandexSaveStatus(`ОШИБКА: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ── Check OAuth return (token in URL hash from Yandex redirect) ───
function checkYandexOAuthReturn() {
  const hash = window.location.hash;
  if (!hash.includes('access_token=')) return;

  const params = new URLSearchParams(hash.replace('#', '?'));
  const token = params.get('access_token');
  if (!token) return;

  localStorage.setItem(YANDEX_TK_ADMIN, token);
  history.replaceState(null, '', window.location.pathname + window.location.search);

  showYandexMsg('✓ Аккаунт Яндекс подключён! Загружаем плейлисты...', 'success');
  updateYandexConnectionUI();
  fetchAndShowYandexPlaylists(token);
}

function updateYandexConnectionUI() {
  const token         = localStorage.getItem(YANDEX_TK_ADMIN);
  const statusEl      = document.getElementById('yandex-status');
  const connectBtn    = document.getElementById('yandex-connect-btn');
  const disconnectBtn = document.getElementById('yandex-disconnect-btn');
  const section       = document.getElementById('yandex-playlists-section');
  const clientInput   = document.getElementById('yandex-client-id-input');

  if (token) {
    if (statusEl) {
      statusEl.textContent = 'ПОДКЛЮЧЁН';
      statusEl.className = 'yandex-connect-status connected';
    }
    if (connectBtn)    connectBtn.hidden    = true;
    if (disconnectBtn) disconnectBtn.hidden = false;
    if (section)       section.hidden       = false;
    fetchAndShowYandexPlaylists(token);
  } else {
    if (statusEl) {
      statusEl.textContent = 'НЕ ПОДКЛЮЧЁН';
      statusEl.className = 'yandex-connect-status disconnected';
    }
    if (connectBtn)    connectBtn.hidden    = false;
    if (disconnectBtn) disconnectBtn.hidden = true;
    if (section)       section.hidden       = true;
  }

  // Fill client ID if saved in config
  if (clientInput && audioConfig.yandexClientId) {
    clientInput.value = audioConfig.yandexClientId;
  }

  renderSelectedYandexPlaylists();
}

async function fetchAndShowYandexPlaylists(token) {
  const loadingEl = document.getElementById('yandex-playlists-loading');
  const grid      = document.getElementById('yandex-playlists-grid');
  const corsWarn  = document.getElementById('yandex-cors-warning');
  const manualSec = document.getElementById('yandex-manual-playlist-section');

  if (loadingEl) loadingEl.hidden = false;
  if (grid)      grid.innerHTML = '';

  try {
    // Step 1: get account info for UID
    const statusR = await fetch('https://api.music.yandex.net/account/status', {
      headers: {
        'Authorization': `OAuth ${token}`,
        'X-Yandex-Music-Client': 'WindowsPhone/3.17'
      }
    });

    if (!statusR.ok) throw new Error(`status ${statusR.status}`);
    const statusData = await statusR.json();
    const uid = statusData?.result?.account?.uid;
    if (!uid) throw new Error('uid не получен');

    localStorage.setItem(YANDEX_UID_ADMIN, uid);

    // Step 2: get playlists
    const plR = await fetch(`https://api.music.yandex.net/users/${uid}/playlists/list`, {
      headers: {
        'Authorization': `OAuth ${token}`,
        'X-Yandex-Music-Client': 'WindowsPhone/3.17'
      }
    });

    if (!plR.ok) throw new Error(`playlists status ${plR.status}`);
    const plData = await plR.json();
    const playlists = plData?.result || [];

    if (loadingEl) loadingEl.hidden = true;
    if (corsWarn)  corsWarn.hidden  = true;
    if (manualSec) manualSec.hidden = false;

    if (playlists.length === 0) {
      if (grid) grid.innerHTML = '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-muted);letter-spacing:1px;">ПЛЕЙЛИСТЫ НЕ НАЙДЕНЫ</div>';
      return;
    }

    renderYandexPlaylistsGrid(playlists, uid, grid);

  } catch (err) {
    // CORS or other error
    if (loadingEl) loadingEl.hidden = true;
    if (corsWarn)  corsWarn.hidden  = false;
    if (manualSec) manualSec.hidden = false;

    if (grid) grid.innerHTML = '';
    console.warn('[Audio Admin] Yandex API error:', err.message);
  }
}

function renderYandexPlaylistsGrid(playlists, uid, container) {
  if (!container) return;

  const selectedKinds = new Set((audioConfig.yandexPlaylists || []).map(p => String(p.kind)));

  container.innerHTML = playlists.map(pl => {
    const checked = selectedKinds.has(String(pl.kind)) ? 'checked' : '';
    const count   = pl.trackCount ?? pl.track_count ?? '';
    return `
      <label class="yandex-playlist-select-item">
        <input type="checkbox" value="${pl.kind}" data-uid="${uid}"
               data-title="${escapeAdminHtml(pl.title || `Плейлист ${pl.kind}`)}"
               data-count="${count}" ${checked}>
        <span class="yandex-playlist-select-label">${escapeAdminHtml(pl.title || `Плейлист ${pl.kind}`)}</span>
        ${count ? `<span class="yandex-playlist-select-count">${count} тр.</span>` : ''}
      </label>
    `;
  }).join('');

  // Bind checkbox changes → update audioConfig.yandexPlaylists
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', syncYandexPlaylistSelection);
  });
}

function syncYandexPlaylistSelection() {
  const grid = document.getElementById('yandex-playlists-grid');
  if (!grid) return;

  const checked = [];
  grid.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    checked.push({
      kind:       parseInt(cb.value),
      uid:        cb.dataset.uid,
      title:      cb.dataset.title,
      trackCount: cb.dataset.count ? parseInt(cb.dataset.count) : undefined
    });
  });

  // Also keep manually added playlists that are not from the API
  const manualOnly = (audioConfig.yandexPlaylists || []).filter(p => p.manual);
  audioConfig.yandexPlaylists = [...checked, ...manualOnly];
  renderSelectedYandexPlaylists();
}

function addYandexPlaylistManual() {
  const urlInput   = document.getElementById('yandex-playlist-url');
  const titleInput = document.getElementById('yandex-playlist-title');
  const rawUrl     = urlInput?.value.trim();
  const title      = titleInput?.value.trim() || 'Плейлист';

  if (!rawUrl) return;

  // Parse music.yandex.ru/users/LOGIN/playlists/KIND
  const match = rawUrl.match(/users\/([^/]+)\/playlists\/(\d+)/);
  if (!match) {
    showYandexMsg('Неверный формат URL. Пример: music.yandex.ru/users/LOGIN/playlists/1234', 'error');
    return;
  }

  const uid  = match[1];
  const kind = parseInt(match[2]);

  // Avoid duplicates
  const exists = (audioConfig.yandexPlaylists || []).some(p => String(p.kind) === String(kind) && p.uid === uid);
  if (exists) {
    showYandexMsg('Этот плейлист уже добавлен', 'error');
    return;
  }

  if (!audioConfig.yandexPlaylists) audioConfig.yandexPlaylists = [];
  audioConfig.yandexPlaylists.push({ kind, uid, title, manual: true });
  renderSelectedYandexPlaylists();

  if (urlInput)   urlInput.value   = '';
  if (titleInput) titleInput.value = '';
  showYandexMsg(`✓ Плейлист «${title}» добавлен`, 'success');
}

function renderSelectedYandexPlaylists() {
  const list = document.getElementById('yandex-selected-list');
  if (!list) return;

  const playlists = audioConfig.yandexPlaylists || [];
  if (playlists.length === 0) {
    list.innerHTML = '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-muted);letter-spacing:1px;padding:0.3rem 0;">НЕТ ВЫБРАННЫХ ПЛЕЙЛИСТОВ</div>';
    return;
  }

  list.innerHTML = playlists.map((pl, i) => `
    <div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.65rem;
                border:1px solid rgba(255,204,0,0.12);border-radius:6px;
                background:rgba(255,204,0,0.03);">
      <span style="color:#ffcc00;font-size:0.85rem;">♪</span>
      <span style="font-family:var(--font-body);font-size:0.75rem;color:var(--text-secondary);flex:1;">
        ${escapeAdminHtml(pl.title)}
      </span>
      <span style="font-family:var(--font-mono);font-size:0.55rem;color:var(--text-muted);">
        uid:${pl.uid} / kind:${pl.kind}
      </span>
      <button class="audio-track-del" data-pl-idx="${i}" title="Удалить">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.audio-track-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.plIdx);
      audioConfig.yandexPlaylists.splice(idx, 1);
      renderSelectedYandexPlaylists();
    });
  });
}

function showYandexMsg(msg, type) {
  const el = document.getElementById('yandex-connect-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (type === 'error') {
    el.style.color = 'var(--neon-magenta)';
    el.style.background = 'rgba(255,0,255,0.06)';
    el.style.border = '1px solid rgba(255,0,255,0.2)';
  } else {
    el.style.color = 'var(--neon-green)';
    el.style.background = 'rgba(0,255,136,0.06)';
    el.style.border = '1px solid rgba(0,255,136,0.2)';
  }
  if (type !== 'error') {
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }
}

function setYandexSaveStatus(msg, type) {
  const el = document.getElementById('yandex-save-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `audio-save-status ${type}`;
  el.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }
}

// ══════════════════════════════════════════════════════════════════
//  VIDEO PLAYER ADMIN
// ══════════════════════════════════════════════════════════════════

const VIDEO_CONFIG_PATH = 'video-config.json';
const VIDEO_DIR = 'video/';

let videoConfig = { playlist: [] };
let videoConfigSha = null;
let _videoTabSetupDone = false;

/**
 * Разбор URL видеохостинга или прямой поток
 * @returns {null | { source, provider?, embedUrl?, streamUrl?, titleHint }}
 */
function parseVideoUrl(raw) {
  const u = raw.trim();
  if (!u) return null;
  let url;
  try {
    url = new URL(u.startsWith('http') ? u : `https://${u}`);
  } catch {
    return null;
  }

  const pathQ = url.pathname + url.search;
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(pathQ)) {
    return { source: 'stream', provider: 'direct', streamUrl: url.href, titleHint: 'Поток' };
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    if (id) {
      return {
        source: 'embed',
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${id}`,
        titleHint: 'YouTube',
      };
    }
  }

  if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
    let id = url.searchParams.get('v');
    if (!id && url.pathname.includes('/embed/')) {
      id = url.pathname.split('/embed/')[1]?.split('/')[0];
    }
    if (!id && url.pathname.includes('/shorts/')) {
      id = url.pathname.split('/shorts/')[1]?.split('/')[0];
    }
    if (id) {
      return {
        source: 'embed',
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(id)}`,
        titleHint: 'YouTube',
      };
    }
  }

  if (host.includes('vimeo.com')) {
    const m = url.pathname.match(/\/(?:video\/)?(\d+)/);
    if (m) {
      return {
        source: 'embed',
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${m[1]}`,
        titleHint: 'Vimeo',
      };
    }
  }

  if (host.includes('rutube.ru')) {
    let m = url.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    if (!m) m = url.pathname.match(/\/play\/embed\/([a-zA-Z0-9]+)/);
    if (m) {
      return {
        source: 'embed',
        provider: 'rutube',
        embedUrl: `https://rutube.ru/play/embed/${m[1]}`,
        titleHint: 'Rutube',
      };
    }
  }

  if (host.includes('vk.com') || host.includes('vkvideo.ru')) {
    if (url.pathname.includes('video_ext.php')) {
      return { source: 'embed', provider: 'vk', embedUrl: url.href, titleHint: 'VK' };
    }
    const m = url.pathname.match(/video(-?\d+)_(\d+)/);
    if (m) {
      const oid = m[1];
      const vid = m[2];
      return {
        source: 'embed',
        provider: 'vk',
        embedUrl: `https://vk.com/video_ext.php?oid=${encodeURIComponent(oid)}&id=${encodeURIComponent(vid)}`,
        titleHint: 'VK',
      };
    }
  }

  if (host.includes('dailymotion.com')) {
    const m = url.pathname.match(/\/video\/([^_?/]+)/);
    if (m) {
      return {
        source: 'embed',
        provider: 'dailymotion',
        embedUrl: `https://www.dailymotion.com/embed/video/${m[1]}`,
        titleHint: 'Dailymotion',
      };
    }
  }

  if (u.includes('embed') || u.includes('iframe')) {
    return { source: 'embed', provider: 'iframe', embedUrl: u, titleHint: 'Embed' };
  }

  return null;
}

async function loadVideoConfig() {
  if (!currentToken) return;
  try {
    const r = await fetch(`${API_BASE}/contents/${VIDEO_CONFIG_PATH}`, {
      headers: { Authorization: `token ${currentToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (r.ok) {
      const data = await r.json();
      videoConfigSha = data.sha;
      const decoded = fromBase64(data.content.replace(/\n/g, ''));
      videoConfig = JSON.parse(decoded);
    }
  } catch (_) {
    videoConfigSha = null;
  }
  if (!videoConfig.playlist) videoConfig.playlist = [];
  renderVideoPlaylist();
}

async function saveVideoConfig(config) {
  const content = toBase64(JSON.stringify(config, null, 2));
  const body = {
    message: 'feat: update video player config',
    content,
    ...(videoConfigSha ? { sha: videoConfigSha } : {}),
  };
  const r = await fetch(`${API_BASE}/contents/${VIDEO_CONFIG_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${currentToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${r.status}`);
  }
  const data = await r.json();
  videoConfigSha = data.content.sha;
  videoConfig = config;
  return data;
}

async function uploadVideoFile(file) {
  const MAX_SIZE = 80 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ > 80 МБ)`);
  }
  const filename = sanitizeFilename(file.name);
  const path = `${VIDEO_DIR}${filename}`;
  let existingSha = null;
  try {
    const checkR = await fetch(`${API_BASE}/contents/${path}`, {
      headers: { Authorization: `token ${currentToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (checkR.ok) {
      const existing = await checkR.json();
      existingSha = existing.sha;
    }
  } catch (_) {}

  const b64 = await fileToBase64(file);
  const putBody = {
    message: `feat: upload video ${filename}`,
    content: b64,
    ...(existingSha ? { sha: existingSha } : {}),
  };
  const putR = await fetch(`${API_BASE}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${currentToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  });
  if (!putR.ok) {
    const err = await putR.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${putR.status}`);
  }
  return filename;
}

function renderVideoPlaylist() {
  const list = document.getElementById('video-track-list');
  if (!list) return;

  const tracks = videoConfig.playlist || [];
  if (tracks.length === 0) {
    list.innerHTML =
      '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-muted);text-align:center;padding:1rem;letter-spacing:1px;">ПЛЕЙЛИСТ ПУСТ — ЗАГРУЗИ ФАЙЛ ИЛИ ДОБАВЬ ССЫЛКУ</div>';
    return;
  }

  list.innerHTML = tracks
    .map((tr, i) => {
      const on = tr.enabled !== false;
      let meta = '';
      let badge = '';
      if (tr.source === 'local') {
        meta = escapeAdminHtml(tr.filename || '');
        badge = 'FILE';
      } else if (tr.source === 'stream') {
        meta = escapeAdminHtml((tr.streamUrl || '').slice(0, 72));
        badge = 'URL';
      } else {
        meta = escapeAdminHtml((tr.embedUrl || '').slice(0, 72));
        badge = (tr.provider || 'WEB').toUpperCase().slice(0, 6);
      }
      return `
    <div class="audio-track-item video-track-item" draggable="true" data-index="${i}">
      <label class="video-on-label" title="Показывать на главной">
        <input type="checkbox" class="video-enabled-cb" data-index="${i}" ${on ? 'checked' : ''}>
        <span>ЭФИР</span>
      </label>
      <span class="audio-track-drag" title="Перетащить">⠿</span>
      <div class="audio-track-info-text" style="flex:1;min-width:0;">
        <input type="text" class="form-input neon-input video-title-input" data-index="${i}"
               value="${escapeAdminHtml(tr.title || '')}"
               placeholder="Заголовок"
               style="font-size:0.65rem;padding:0.35rem 0.5rem;margin-bottom:0.25rem;width:100%;">
        <div style="font-family:var(--font-mono);font-size:0.52rem;color:var(--text-muted);word-break:break-all;">${meta}</div>
      </div>
      <div class="audio-track-size" style="font-size:0.5rem;">${badge}</div>
      <span class="audio-track-status done">✓</span>
      <button type="button" class="audio-track-del video-track-del" data-index="${i}" title="Удалить">✕</button>
    </div>`;
    })
    .join('');

  list.querySelectorAll('.video-enabled-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.index, 10);
      if (!videoConfig.playlist[idx]) return;
      videoConfig.playlist[idx].enabled = cb.checked;
    });
  });

  list.querySelectorAll('.video-title-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.index, 10);
      if (videoConfig.playlist[idx]) videoConfig.playlist[idx].title = inp.value.trim();
    });
  });

  list.querySelectorAll('.video-track-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      videoConfig.playlist.splice(idx, 1);
      renderVideoPlaylist();
    });
  });

  setupVideoDragSort(list, '.video-track-item');
}

function setupVideoDragSort(container, selector) {
  let dragging = null;
  container.querySelectorAll(selector).forEach(item => {
    item.addEventListener('dragstart', () => {
      dragging = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragging = null;
      const newOrder = [];
      container.querySelectorAll(selector).forEach(el => {
        const idx = parseInt(el.dataset.index, 10);
        if (!isNaN(idx) && videoConfig.playlist[idx]) newOrder.push(videoConfig.playlist[idx]);
      });
      videoConfig.playlist = newOrder;
      renderVideoPlaylist();
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === item) return;
      const rect = item.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) container.insertBefore(dragging, item);
      else container.insertBefore(dragging, item.nextSibling);
    });
  });
}

function setupVideoUpload() {
  const zone = document.getElementById('video-upload-zone');
  const input = document.getElementById('video-file-input');
  if (!zone || !input) return;
  if (zone.dataset.uploadInited) return;
  zone.dataset.uploadInited = '1';

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleVideoFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => handleVideoFiles(input.files));
}

async function handleVideoFiles(files) {
  const input = document.getElementById('video-file-input');
  if (!currentToken) return;

  for (const file of files) {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|ogg|mov)$/i.test(file.name)) continue;

    const list = document.getElementById('video-track-list');
    const item = document.createElement('div');
    item.className = 'audio-track-item';
    item.innerHTML = `
      <span class="audio-track-drag">⠿</span>
      <div class="audio-track-info-text">
        <div class="audio-track-name">${escapeAdminHtml(file.name)}</div>
        <div style="font-size:0.55rem;color:var(--text-muted);">ЗАГРУЗКА...</div>
      </div>
      <span class="audio-track-status uploading">...</span>`;
    list.appendChild(item);

    try {
      const filename = await uploadVideoFile(file);
      item.remove();
      const baseTitle = file.name.replace(/\.[^.]+$/, '');
      videoConfig.playlist.push({
        id: genId(),
        title: baseTitle,
        enabled: true,
        source: 'local',
        filename,
      });
      renderVideoPlaylist();
    } catch (err) {
      item.querySelector('.audio-track-status').textContent = 'ERR';
      item.querySelector('.audio-track-status').className = 'audio-track-status error';
      console.warn(err);
    }
  }
  if (input) input.value = '';
}

function setupVideoSave() {
  const btn = document.getElementById('video-save-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    const status = document.getElementById('video-save-status');
    if (status) {
      status.textContent = 'СОХРАНЕНИЕ...';
      status.className = 'audio-save-status loading';
    }
    try {
      await saveVideoConfig({ ...videoConfig, playlist: [...videoConfig.playlist] });
      if (status) {
        status.textContent = '✓ СОХРАНЕНО';
        status.className = 'audio-save-status success';
      }
      if (window.videoPlayer && typeof window.videoPlayer.reload === 'function') {
        window.videoPlayer.reload();
      }
    } catch (err) {
      if (status) {
        status.textContent = `ОШИБКА: ${err.message}`;
        status.className = 'audio-save-status error';
      }
    }
  });
}

function setupVideoUrlButton() {
  const btn = document.getElementById('video-add-url-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const urlInp = document.getElementById('video-url-input');
    const titleInp = document.getElementById('video-url-title');
    const raw = urlInp?.value?.trim() || '';
    const parsed = parseVideoUrl(raw);
    if (!parsed) {
      alert('Не удалось распознать ссылку. Поддерживаются YouTube, Vimeo, Rutube, VK, Dailymotion и прямые .mp4/.webm');
      return;
    }
    const title = (titleInp?.value?.trim() || parsed.titleHint || 'Видео');
    const entry = { id: genId(), title, enabled: true };
    if (parsed.source === 'stream') {
      entry.source = 'stream';
      entry.provider = parsed.provider || 'direct';
      entry.streamUrl = parsed.streamUrl;
    } else {
      entry.source = 'embed';
      entry.provider = parsed.provider || 'iframe';
      entry.embedUrl = parsed.embedUrl;
    }
    videoConfig.playlist.push(entry);
    if (urlInp) urlInp.value = '';
    if (titleInp) titleInp.value = '';
    renderVideoPlaylist();
  });
}

function initVideoTab() {
  if (!currentToken) return;
  loadVideoConfig();
  if (!_videoTabSetupDone) {
    _videoTabSetupDone = true;
    setupVideoUpload();
    setupVideoSave();
    setupVideoUrlButton();
  }
}

