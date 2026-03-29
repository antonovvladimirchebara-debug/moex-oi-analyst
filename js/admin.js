/**
 * admin.js — Owner-only posting panel
 * Uses GitHub Contents API to commit posts directly to the repo
 */

const REPO      = 'antonovvladimirchebara-debug/moex-oi-analyst';
const API_BASE  = `https://api.github.com/repos/${REPO}`;
const TOKEN_KEY = 'moex_oi_gh_token';

let mde = null;
let currentToken = null;

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

// ── GitHub API helpers ────────────────────────────────────────
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

// ── Publish a new post ────────────────────────────────────────
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
  btn.disabled = true;
  btn.textContent = 'ПУБЛИКАЦИЯ...';

  try {
    const date    = formatDateISO();
    const slugVal = slugEl?.value.trim() || slugify(title);
    const id      = `${date}-${slugVal}`;
    const file    = `${id}.json`;
    const tags    = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    // 1. Save post JSON file
    const postData = { id, title, date, tags, excerpt, content, file };
    const postContent = toBase64(JSON.stringify(postData, null, 2));
    const existingSha = await getFileSha(`posts/${file}`);

    const postBody = {
      message: `feat: add post "${title}"`,
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

    showStatus(`✓ ПОСТ ОПУБЛИКОВАН: "${title}"\nURL: post.html?id=${id}`, 'success');

    // Clear form
    titleEl.value   = '';
    tagsEl.value    = '';
    excerptEl.value = '';
    slugEl.value    = '';
    mde?.value('');

    // Reload manage tab
    await loadManagePosts();

  } catch (err) {
    showStatus(`ОШИБКА: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">▶</span>ОПУБЛИКОВАТЬ';
  }
}

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
        <button class="btn-danger" style="font-size:0.65rem;padding:0.35rem 0.8rem;" onclick="deletePost('${p.id}','${p.file}')">УДАЛИТЬ</button>
      </div>
    </div>
  `).join('');
}

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
  mde = new EasyMDE({
    element: document.getElementById('post-content-editor'),
    spellChecker: false,
    autosave: { enabled: true, uniqueId: 'moex-post-draft', delay: 3000 },
    placeholder: '## Анализ открытого интереса\n\nВведи текст поста в формате Markdown...',
    toolbar: ['bold','italic','heading','|','quote','unordered-list','ordered-list','|',
              'link','|','preview','side-by-side','fullscreen','|','guide'],
    minHeight: '400px',
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
  });
  slugInput.addEventListener('input', () => {
    slugInput.dataset.manual = 'true';
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
      document.getElementById('publish-btn')?.addEventListener('click', publishPost);
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
      document.getElementById('publish-btn')?.addEventListener('click', publishPost);
    }).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
    });
  }
});
