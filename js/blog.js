/**
 * blog.js — Posts loading, rendering, pagination, post page logic
 * Handles: index.html (latest 5), blog.html (all + filter), post.html (single)
 */

const REPO       = 'antonovvladimirchebara-debug/moex-oi-analyst';
const BASE_URL   = `https://antonovvladimirchebara-debug.github.io/moex-oi-analyst`;
const POSTS_URL  = `posts/index.json`;
const POSTS_PER_PAGE = 10;

// ── Helpers ───────────────────────────────────────────────────
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(isoStr) {
  const d = new Date(isoStr);
  return {
    day:   d.toLocaleDateString('ru-RU', { day: 'numeric' }),
    month: d.toLocaleDateString('ru-RU', { month: 'short' }).toUpperCase(),
    year:  d.getFullYear(),
  };
}

function estimateReadTime(text) {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} мин чтения`;
}

function tagClass(tag) {
  const t = tag.toLowerCase();
  if (t.includes('oi') || t.includes('интерес')) return 'tag-magenta';
  if (t.includes('фьюч') || t.includes('futures')) return 'tag-green';
  return '';
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[а-яёa-z0-9]+/g, match => match)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-яё-]/g, '')
    .slice(0, 60);
}

// ── Fetch posts index ─────────────────────────────────────────
async function fetchPostsIndex() {
  try {
    const res = await fetch(POSTS_URL + '?_=' + Date.now());
    if (!res.ok) throw new Error('index not found');
    const data = await res.json();
    return Array.isArray(data) ? data.sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
  } catch {
    return [];
  }
}

async function fetchPostContent(file) {
  const res = await fetch(`posts/${file}?_=` + Date.now());
  if (!res.ok) throw new Error('Post not found');
  return res.json();
}

// ── Reveal animation on scroll ────────────────────────────────
function setupRevealObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Nav scroll effect ─────────────────────────────────────────
function setupNavScroll() {
  const nav = document.querySelector('.nav-main');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}

// ── Post card HTML ────────────────────────────────────────────
function renderPostCard(post, index) {
  const tags = (post.tags || []).map(t =>
    `<span class="tag ${tagClass(t)}">${t}</span>`
  ).join('');

  return `
    <article class="post-card reveal" style="animation-delay:${index * 0.08}s"
             onclick="location.href='post.html?id=${post.id}'"
             role="article" aria-label="${post.title}">
      <div class="post-card-date">${formatDate(post.date)}</div>
      <div class="post-card-tags" role="list">${tags}</div>
      <h3 class="post-card-title">${post.title}</h3>
      <p class="post-card-excerpt">${post.excerpt || ''}</p>
      <div class="post-card-footer">
        <a href="post.html?id=${post.id}" class="post-card-read" aria-label="Читать пост ${post.title}">ЧИТАТЬ →</a>
        <span class="post-card-arrow" aria-hidden="true">→</span>
      </div>
    </article>
  `;
}

// ── Blog list item HTML ───────────────────────────────────────
function renderBlogItem(post, index) {
  const { day, month } = formatDateShort(post.date);
  const tags = (post.tags || []).map(t =>
    `<span class="tag ${tagClass(t)}">${t}</span>`
  ).join('');

  return `
    <a href="post.html?id=${post.id}" class="blog-post-item reveal" style="animation-delay:${index * 0.05}s"
       aria-label="${post.title}">
      <div class="blog-post-date-block">
        <span class="post-date-day">${day}</span>
        <span class="post-date-month">${month}</span>
      </div>
      <div>
        <div class="post-card-tags">${tags}</div>
        <div class="blog-post-title">${post.title}</div>
        <p class="blog-post-excerpt">${post.excerpt || ''}</p>
      </div>
    </a>
  `;
}

// ── INDEX PAGE ────────────────────────────────────────────────
async function initIndexPage() {
  const grid = document.getElementById('posts-grid');
  const counter = document.getElementById('posts-count');
  if (!grid) return;

  const posts = await fetchPostsIndex();
  if (counter) counter.textContent = posts.length;

  if (posts.length === 0) {
    grid.innerHTML = '<div class="no-posts">ПОСТОВ ПОК НЕТ. СКОРО ЗДЕСЬ ПОЯВИТСЯ АНАЛИТИКА.</div>';
    return;
  }

  grid.innerHTML = posts.slice(0, 6).map(renderPostCard).join('');
  setupRevealObserver();
}

// ── BLOG PAGE ─────────────────────────────────────────────────
let allPosts = [];
let currentTag = 'all';
let currentPage = 1;

async function initBlogPage() {
  const container = document.getElementById('blog-posts');
  const countEl   = document.getElementById('blog-count');
  if (!container) return;

  allPosts = await fetchPostsIndex();

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTag = btn.dataset.tag;
      currentPage = 1;
      renderBlogPage();
    });
  });

  // Pagination
  document.getElementById('prev-page')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderBlogPage(); }
  });
  document.getElementById('next-page')?.addEventListener('click', () => {
    const filtered = filterPosts();
    const maxPage = Math.ceil(filtered.length / POSTS_PER_PAGE);
    if (currentPage < maxPage) { currentPage++; renderBlogPage(); }
  });

  renderBlogPage();

  function filterPosts() {
    if (currentTag === 'all') return allPosts;
    return allPosts.filter(p => (p.tags || []).some(t =>
      t.toLowerCase().includes(currentTag.toLowerCase())
    ));
  }

  function renderBlogPage() {
    const filtered = filterPosts();
    const total = filtered.length;
    const maxPage = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
    if (currentPage > maxPage) currentPage = maxPage;

    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const page  = filtered.slice(start, start + POSTS_PER_PAGE);

    if (countEl) {
      countEl.textContent = `НАЙДЕНО ПОСТОВ: ${total}`;
    }

    if (page.length === 0) {
      container.innerHTML = '<div class="no-posts">ПО ЭТОМУ ТЕГУ ПОСТОВ НЕТ.</div>';
    } else {
      container.innerHTML = page.map((p, i) => renderBlogItem(p, i)).join('');
      setupRevealObserver();
    }

    const paginationEl = document.getElementById('pagination');
    if (paginationEl) {
      paginationEl.hidden = maxPage <= 1;
      const pageInfo = document.getElementById('page-info');
      if (pageInfo) pageInfo.textContent = `${currentPage} / ${maxPage}`;
      const prevBtn = document.getElementById('prev-page');
      const nextBtn = document.getElementById('next-page');
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= maxPage;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ── POST PAGE ─────────────────────────────────────────────────
async function initPostPage() {
  const loadingEl  = document.getElementById('post-loading');
  const articleEl  = document.getElementById('post-article');
  const commentsEl = document.getElementById('comments');
  if (!loadingEl || !articleEl) return;

  const postId = getParam('id');
  if (!postId) {
    loadingEl.innerHTML = '<div class="error-state">ПОСТ НЕ НАЙДЕН. <a href="blog.html">ВЕРНУТЬСЯ В БЛОГ</a></div>';
    return;
  }

  try {
    const posts = await fetchPostsIndex();
    const meta  = posts.find(p => p.id === postId);
    if (!meta) throw new Error('Post not in index');

    const post  = await fetchPostContent(meta.file);

    // Fill DOM
    document.getElementById('post-title').textContent      = post.title || meta.title;
    document.getElementById('post-breadcrumb-title').textContent = post.title || meta.title;
    const dateEl = document.getElementById('post-date');
    dateEl.textContent = formatDate(post.date || meta.date);
    dateEl.setAttribute('datetime', post.date || meta.date);
    document.getElementById('post-read-time').textContent  = estimateReadTime(post.content || '');

    const tagsEl = document.getElementById('post-tags');
    (post.tags || meta.tags || []).forEach(t => {
      const span = document.createElement('span');
      span.className = `tag ${tagClass(t)}`;
      span.textContent = t;
      tagsEl.appendChild(span);
    });

    // Render markdown
    if (window.marked) {
      marked.setOptions({ breaks: true, gfm: true });
      document.getElementById('post-body').innerHTML = marked.parse(post.content || '');
    } else {
      document.getElementById('post-body').textContent = post.content || '';
    }

    // SEO dynamic meta
    const title = `${post.title || meta.title} — Аналитик MOEX/OI`;
    const desc  = post.excerpt || meta.excerpt || '';
    const url   = `${BASE_URL}/post.html?id=${postId}`;

    document.title = title;
    setMeta('description', desc);
    setMeta('og:title',  title,   true);
    setMeta('og:description', desc, true);
    setMeta('og:url',    url,     true);
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    document.getElementById('page-canonical')?.setAttribute('href', url);

    // JSON-LD BlogPosting
    const schemaEl = document.getElementById('post-schema');
    if (schemaEl) {
      schemaEl.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title || meta.title,
        description: desc,
        url,
        datePublished: post.date || meta.date,
        dateModified:  post.date || meta.date,
        author: {
          '@type': 'Person',
          name: 'BigFish',
          url: 'https://github.com/antonovvladimirchebara-debug',
        },
        publisher: {
          '@type': 'Person',
          name: 'Аналитик MOEX/OI',
        },
        keywords: (post.tags || meta.tags || []).join(', '),
        inLanguage: 'ru',
      });
    }

    // Share buttons
    const encodedUrl   = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(post.title || meta.title);
    document.getElementById('share-telegram').href =
      `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;
    document.getElementById('share-twitter').href =
      `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
    document.getElementById('copy-link-btn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copy-link-btn');
        btn.querySelector('span').textContent = 'СКОПИРОВАНО!';
        setTimeout(() => { btn.querySelector('span').textContent = 'ССЫЛКА'; }, 2000);
      });
    });

    // Prev / Next navigation
    const idx = posts.indexOf(meta);
    if (idx > 0) {
      const nextEl = document.getElementById('next-post');
      if (nextEl) {
        nextEl.href = `post.html?id=${posts[idx - 1].id}`;
        nextEl.hidden = false;
      }
    }
    if (idx < posts.length - 1) {
      const prevEl = document.getElementById('prev-post');
      if (prevEl) {
        prevEl.href = `post.html?id=${posts[idx + 1].id}`;
        prevEl.hidden = false;
      }
    }

    // Show article
    loadingEl.hidden  = true;
    articleEl.hidden  = false;
    if (commentsEl) commentsEl.hidden = false;

    // Load Giscus comments
    loadGiscus(postId);

    setupRevealObserver();
    initLightbox();

  } catch (err) {
    loadingEl.innerHTML = `<div class="error-state">ОШИБКА ЗАГРУЗКИ ПОСТА: ${err.message}. <a href="blog.html">НАЗАД В БЛОГ</a></div>`;
  }
}

function setMeta(name, content, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function loadGiscus(postId) {
  const container = document.getElementById('giscus-container');
  if (!container) return;

  const script = document.createElement('script');
  script.src = 'https://giscus.app/client.js';
  script.setAttribute('data-repo', REPO);
  script.setAttribute('data-repo-id', 'R_kgDORz1qKQ');
  script.setAttribute('data-category', 'Ideas');
  script.setAttribute('data-category-id', 'DIC_kwDORz1qKc4C5ibi');
  script.setAttribute('data-mapping', 'specific');
  script.setAttribute('data-term', postId);
  script.setAttribute('data-strict', '0');
  script.setAttribute('data-reactions-enabled', '1');
  script.setAttribute('data-emit-metadata', '0');
  script.setAttribute('data-input-position', 'bottom');
  script.setAttribute('data-theme', 'transparent_dark');
  script.setAttribute('data-lang', 'ru');
  script.setAttribute('data-loading', 'lazy');
  script.crossOrigin = 'anonymous';
  script.async = true;
  container.appendChild(script);
}

// ── Lightbox for post images ──────────────────────────────────
function initLightbox() {
  // Create overlay once
  const overlay = document.createElement('div');
  overlay.id = 'lightbox';
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Просмотр изображения');
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Закрыть">&times;</button>
    <div class="lightbox-img-wrap">
      <img class="lightbox-img" src="" alt="">
    </div>
    <div class="lightbox-caption"></div>
  `;
  document.body.appendChild(overlay);

  const lbImg     = overlay.querySelector('.lightbox-img');
  const lbCaption = overlay.querySelector('.lightbox-caption');
  const lbClose   = overlay.querySelector('.lightbox-close');

  function open(src, alt) {
    lbImg.src = src;
    lbImg.alt = alt || '';
    lbCaption.textContent = alt || '';
    lbCaption.hidden = !alt;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  }

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }

  lbClose.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target === overlay.querySelector('.lightbox-img-wrap')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) close(); });

  // Attach to all images inside .prose
  document.querySelectorAll('.prose img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `Увеличить: ${img.alt || 'изображение'}`);
    img.addEventListener('click', () => open(img.src, img.alt));
    img.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(img.src, img.alt); });
  });
}
document.addEventListener('DOMContentLoaded', () => {
  setupNavScroll();

  const path = window.location.pathname;
  const file = path.split('/').pop() || 'index.html';

  if (file === 'index.html' || file === '' || file === '/') {
    initIndexPage();
  } else if (file === 'blog.html') {
    initBlogPage();
  } else if (file === 'post.html') {
    initPostPage();
  }

  initMobileNav();
});

// ── Mobile nav (hamburger) ───────────────────────────────────
function initMobileNav() {
  const burger = document.getElementById('nav-burger');
  const menu   = document.getElementById('mobile-menu');
  if (!burger || !menu) return;

  function openMenu() {
    burger.classList.add('open');
    menu.classList.add('open');
    burger.setAttribute('aria-expanded', 'true');
    menu.removeAttribute('aria-hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    burger.classList.remove('open');
    menu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  burger.addEventListener('click', () => {
    burger.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Close on link click
  menu.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close on outside tap
  document.addEventListener('click', (e) => {
    if (menu.classList.contains('open') &&
        !menu.contains(e.target) &&
        !burger.contains(e.target)) {
      closeMenu();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // Close when viewport becomes desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeMenu();
  });
}
