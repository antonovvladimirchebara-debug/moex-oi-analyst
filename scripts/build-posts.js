#!/usr/bin/env node
/**
 * build-posts.js
 * Генерирует статические HTML-страницы для каждого поста из posts/*.json
 * и обновляет sitemap.xml.
 * Запуск: node scripts/build-posts.js
 * Нет внешних зависимостей — только Node.js built-ins.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const BASE_URL = 'https://antonovvladimirchebara-debug.github.io/moex-oi-analyst';
const SITE_NAME = 'Аналитик MOEX/OI';
const AUTHOR    = 'BigFish';
const OG_IMAGE  = `${BASE_URL}/og-image.png`;
const REPO      = 'antonovvladimirchebara-debug/moex-oi-analyst';
const GISCUS_REPO_ID    = 'R_kgDORz1qKQ';
const GISCUS_CATEGORY   = 'Ideas';
const GISCUS_CATEGORY_ID = 'DIC_kwDORz1qKc4C5ibi';

// ─── Inline Markdown → HTML renderer ────────────────────────────────────────

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineRender(text) {
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g,          '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g,          '<code>$1</code>');
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return text;
}

function renderTable(lines) {
  const parseRow = (line) =>
    line.split('|')
        .slice(1, -1)
        .map(c => c.trim());

  const headers = parseRow(lines[0]);
  const rows    = lines.slice(2).map(parseRow);

  const thead = `<thead><tr>${headers.map(h => `<th>${inlineRender(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row =>
    `<tr>${row.map(cell => `<td>${inlineRender(cell)}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;

  return `<div class="table-wrap"><table class="post-table">${thead}${tbody}</table></div>`;
}

function markdownToHtml(md) {
  const lines  = md.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const lvl = hMatch[1].length;
      blocks.push(`<h${lvl}>${inlineRender(hMatch[2])}</h${lvl}>`);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push('<hr>');
      i++; continue;
    }

    // Table (line starts with |)
    if (line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push(renderTable(tableLines));
      continue;
    }

    // Blockquote
    if (line.startsWith('> ') || line === '>') {
      const quoteContent = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        quoteContent.push(inlineRender(lines[i].replace(/^> ?/, '')));
        i++;
      }
      blocks.push(`<blockquote><p>${quoteContent.join('<br>')}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${inlineRender(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inlineRender(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++; continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,6}\s/) &&
      !(lines[i].startsWith('> ') || lines[i] === '>') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^\*\*\*+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${inlineRender(paraLines.join(' '))}</p>`);
    }
  }

  return blocks.join('\n');
}

// ─── Read time estimate ──────────────────────────────────────────────────────

function readTime(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// ─── Format date ─────────────────────────────────────────────────────────────

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return iso;
  }
}

// ─── Generate static HTML for one post ──────────────────────────────────────

function buildPostHtml(post, postData, allPosts) {
  const slug      = post.id;
  const title     = escHtml(postData.title || post.title);
  const desc      = escHtml((postData.excerpt || post.excerpt || '').replace(/\n+/g, ' ').trim());
  const date      = postData.date || post.date;
  const tags      = postData.tags || post.tags || [];
  const content   = postData.content || '';
  const bodyHtml  = markdownToHtml(content);
  const minutes   = readTime(content);
  const canonical = `${BASE_URL}/posts/${slug}/`;
  const dateHuman = formatDate(date);

  // Prev / Next
  const idx   = allPosts.findIndex(p => p.id === slug);
  const prev  = idx < allPosts.length - 1 ? allPosts[idx + 1] : null;
  const next  = idx > 0 ? allPosts[idx - 1] : null;

  const prevLink = prev
    ? `<a href="../../posts/${prev.id}/" class="post-nav-btn">← ${escHtml(prev.title)}</a>`
    : '';
  const nextLink = next
    ? `<a href="../../posts/${next.id}/" class="post-nav-btn">${escHtml(next.title)} →</a>`
    : '';

  const tagsHtml = tags.map(t =>
    `<span class="tag" role="listitem">${escHtml(t)}</span>`
  ).join('');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: postData.title || post.title,
    description: postData.excerpt || post.excerpt || '',
    datePublished: date,
    dateModified: date,
    url: canonical,
    author: {
      '@type': 'Person',
      name: AUTHOR,
      url: `https://github.com/${REPO.split('/')[0]}`
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: tags.join(', '),
    articleBody: content.replace(/[#*`|>-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 500)
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="ru" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">

  <title>${title} — ${SITE_NAME}</title>
  <meta name="description" content="${desc}">
  <meta name="author" content="${AUTHOR}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="article:published_time" content="${date}">
  <meta property="article:author" content="${AUTHOR}">
  <meta property="article:tag" content="${tags.map(escHtml).join(', ')}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${OG_IMAGE}">

  <!-- JSON-LD BlogPosting -->
  <script type="application/ld+json">
${jsonLd}
  </script>

  <link rel="stylesheet" href="../../css/style.css">
  <link rel="stylesheet" href="../../css/animations.css">
  <link rel="stylesheet" href="../../css/audio-player.css">
  <link rel="stylesheet" href="../../css/video-player.css?v=2">
  <link rel="icon" type="image/x-icon" href="${BASE_URL}/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="${BASE_URL}/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="${BASE_URL}/favicon-16.png">
  <link rel="icon" type="image/png" sizes="192x192" href="${BASE_URL}/favicon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="${BASE_URL}/apple-touch-icon.png">
  <meta name="theme-color" content="#0a0a1a">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600&family=Share+Tech+Mono&display=swap" rel="stylesheet">
</head>
<body class="page-post">
  <canvas id="bg-canvas"></canvas>
  <div class="scanlines"></div>
  <div class="noise-overlay"></div>

  <nav class="nav-main" role="navigation" aria-label="Главная навигация">
    <div class="nav-inner">
      <a href="../../index.html" class="nav-logo" aria-label="${SITE_NAME} — на главную">
        <span class="logo-icon">◈</span>
        <span class="logo-text">MOEX<span class="accent">/OI</span></span>
      </a>
      <ul class="nav-links" role="list">
        <li><a href="../../index.html" class="nav-link">ГЛАВНАЯ</a></li>
        <li><a href="../../blog.html" class="nav-link">БЛОГ</a></li>
        <li><a href="../../reviews.html" class="nav-link">ОБЗОРЫ</a></li>
        <li><a href="../../index.html#about" class="nav-link">ОБО МНЕ</a></li>
      </ul>
      <button class="nav-burger" id="nav-burger" aria-label="Открыть меню" aria-expanded="false" aria-controls="mobile-menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu" aria-hidden="true" role="dialog" aria-label="Мобильное меню">
    <nav class="mobile-menu-links">
      <a href="../../index.html" class="mobile-link">ГЛАВНАЯ</a>
      <a href="../../blog.html" class="mobile-link">БЛОГ</a>
      <a href="../../reviews.html" class="mobile-link">ОБЗОРЫ</a>
      <a href="../../index.html#about" class="mobile-link">ОБО МНЕ</a>
    </nav>
  </div>

  <main id="main-content" class="post-main">
    <article id="post-article" class="post-article" aria-label="Пост блога">

      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label="Хлебные крошки">
        <a href="../../index.html">Главная</a>
        <span aria-hidden="true">›</span>
        <a href="../../blog.html">Блог</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">${title}</span>
      </nav>

      <!-- Post header -->
      <header class="post-header">
        <div class="post-tags" role="list" aria-label="Теги поста">${tagsHtml}</div>
        <h1 class="post-title">${title}</h1>
        <div class="post-meta">
          <span class="post-author">
            <span class="author-icon">◈</span>
            ${AUTHOR}
          </span>
          <time class="post-date" datetime="${date}">${dateHuman}</time>
          <span class="post-read-time">${minutes} мин чтения</span>
        </div>
        <div class="post-divider" aria-hidden="true"></div>
      </header>

      <!-- Post body -->
      <div class="post-body prose" aria-label="Содержание поста">
${bodyHtml}
      </div>

      <!-- Post footer -->
      <footer class="post-footer">
        <div class="post-share" aria-label="Поделиться">
          <span class="share-label">ПОДЕЛИТЬСЯ:</span>
          <button class="share-btn" id="copy-link-btn" aria-label="Скопировать ссылку" onclick="navigator.clipboard.writeText('${canonical}').then(()=>{this.textContent='✓ СКОПИРОВАНО';setTimeout(()=>{this.textContent='ССЫЛКА'},2000)})">
            <span>ССЫЛКА</span>
          </button>
          <a href="https://t.me/share/url?url=${encodeURIComponent(canonical)}&text=${encodeURIComponent(title)}"
             target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Поделиться в Telegram">
            TG
          </a>
          <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(canonical)}&text=${encodeURIComponent(title)}"
             target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Поделиться в Twitter">
            ✕
          </a>
        </div>
        <div class="post-nav" role="navigation" aria-label="Навигация между постами">
          ${prevLink}
          <a href="../../blog.html" class="post-nav-btn btn-outline">ВСЕ ПОСТЫ</a>
          ${nextLink}
        </div>
      </footer>
    </article>

    <!-- Comments -->
    <section id="comments" class="comments-section" aria-labelledby="comments-heading">
      <div class="section-header">
        <div class="section-label">ОБСУЖДЕНИЕ</div>
        <h2 id="comments-heading" class="section-title">КОММЕНТАРИИ</h2>
      </div>
      <div id="giscus-container"></div>
    </section>
  </main>

  <div id="sidebar-video-mount" class="vp-sidebar-wrap" data-video-root></div>

  <footer class="site-footer" role="contentinfo">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-icon">◈</span>
        <span class="footer-title">АНАЛИТИК MOEX/OI</span>
      </div>
      <p class="footer-disclaimer">Все материалы носят информационный характер и не являются инвестиционными рекомендациями.</p>
      <div class="footer-links">
        <a href="../../index.html">Главная</a>
        <a href="../../blog.html">Блог</a>
        <a href="../../reviews.html">Обзоры</a>
        <a href="https://github.com/${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
      <p class="footer-copy">© 2026 ${AUTHOR}. Московская биржа MOEX/OI Аналитика.</p>
    </div>
  </footer>

  <script type="importmap">
  {
    "imports": {
      "three": "https://esm.sh/three@0.162.0",
      "three/addons/": "https://esm.sh/three@0.162.0/examples/jsm/"
    }
  }
  </script>
  <script type="module" src="../../js/three-scene.js"></script>
  <script src="../../js/blog.js" defer></script>
  <script src="../../js/audio-player.js" defer></script>
  <script src="../../js/video-player.js" defer></script>

  <!-- Giscus comments -->
  <script>
    (function() {
      var s = document.createElement('script');
      s.src = 'https://giscus.app/client.js';
      s.setAttribute('data-repo', '${REPO}');
      s.setAttribute('data-repo-id', '${GISCUS_REPO_ID}');
      s.setAttribute('data-category', '${GISCUS_CATEGORY}');
      s.setAttribute('data-category-id', '${GISCUS_CATEGORY_ID}');
      s.setAttribute('data-mapping', 'specific');
      s.setAttribute('data-term', '${slug}');
      s.setAttribute('data-strict', '0');
      s.setAttribute('data-reactions-enabled', '1');
      s.setAttribute('data-emit-metadata', '0');
      s.setAttribute('data-input-position', 'bottom');
      s.setAttribute('data-theme', 'transparent_dark');
      s.setAttribute('data-lang', 'ru');
      s.setAttribute('data-loading', 'lazy');
      s.crossOrigin = 'anonymous';
      s.async = true;
      document.getElementById('giscus-container').appendChild(s);
    })();
  </script>

  <!-- GoatCounter analytics -->
  <script data-goatcounter="https://moex-oi.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>`;
}

// ─── Generate sitemap.xml ────────────────────────────────────────────────────

function buildSitemap(allPosts, today) {
  const staticUrls = [
    { loc: `${BASE_URL}/`,          lastmod: today, freq: 'weekly',  pri: '1.0' },
    { loc: `${BASE_URL}/blog.html`, lastmod: today, freq: 'daily',   pri: '0.9' },
  ];

  const postUrls = allPosts.map(p => ({
    loc:     `${BASE_URL}/posts/${p.id}/`,
    lastmod: p.date || today,
    freq:    'monthly',
    pri:     '0.8'
  }));

  const urlsXml = [...staticUrls, ...postUrls].map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>
`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const today = new Date().toISOString().slice(0, 10);

  const indexPath = path.join(POSTS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('posts/index.json not found');
    process.exit(1);
  }

  const allPosts = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  let built = 0;

  for (const post of allPosts) {
    const postFile = path.join(POSTS_DIR, post.file || `${post.id}.json`);
    if (!fs.existsSync(postFile)) {
      console.warn(`  SKIP  ${post.id} — JSON not found`);
      continue;
    }

    const postData = JSON.parse(fs.readFileSync(postFile, 'utf8'));
    const outDir   = path.join(POSTS_DIR, post.id);
    const outFile  = path.join(outDir, 'index.html');

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, buildPostHtml(post, postData, allPosts), 'utf8');
    console.log(`  OK    posts/${post.id}/index.html`);
    built++;
  }

  // Sitemap
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, buildSitemap(allPosts, today), 'utf8');
  console.log(`  OK    sitemap.xml (${allPosts.length} posts)`);

  // Inject static post list into blog.html and index.html
  injectBlogList(allPosts);
  injectIndexPosts(allPosts);

  console.log(`\nBuild complete: ${built} posts pre-rendered.`);
}

// ─── Inject static post list into blog.html ──────────────────────────────────

function injectBlogList(allPosts) {
  const htmlPath = path.join(ROOT, 'blog.html');
  if (!fs.existsSync(htmlPath)) { console.warn('  SKIP  blog.html not found'); return; }

  let html = fs.readFileSync(htmlPath, 'utf8');

  const listItems = allPosts.map(post => {
    const title   = escHtml(post.title || post.id);
    const date    = post.date ? formatDate(post.date) : '';
    const excerpt = escHtml((post.excerpt || '').replace(/\n+/g, ' ').trim().slice(0, 160));
    const tags    = (post.tags || []).map(t =>
      `<span class="tag" style="font-size:0.65rem;padding:0.15rem 0.5rem;">${escHtml(t)}</span>`
    ).join(' ');
    const url     = `posts/${post.id}/`;
    return `    <li class="blog-post-item-static" style="padding:1rem 0;border-bottom:1px solid rgba(0,255,255,0.08);">
      <article>
        <div style="margin-bottom:0.4rem;">${tags}</div>
        <h2 style="font-size:1rem;margin:0 0 0.3rem;"><a href="${url}" style="color:var(--neon-cyan);text-decoration:none;">${title}</a></h2>
        <time datetime="${post.date}" style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-muted);letter-spacing:1px;">${date}</time>
        ${excerpt ? `<p style="font-size:0.82rem;color:var(--text-secondary);margin:0.4rem 0 0;">${excerpt}</p>` : ''}
      </article>
    </li>`;
  }).join('\n');

  const staticBlock =
    `\n      <!-- SEO static list — regenerated by build-posts.js -->\n` +
    `      <noscript>\n` +
    `        <ul class="blog-posts-static-noscript" style="list-style:none;padding:0;margin:0;">\n` +
    `${listItems}\n` +
    `        </ul>\n` +
    `      </noscript>\n      `;

  // Replace or insert inside #blog-posts div — idempotent
  const divOpen = `<div id="blog-posts" class="blog-posts-list" role="feed" aria-label="Все посты блога">`;
  const marker  = `<!-- SEO static list`;

  if (html.includes(marker)) {
    // Remove previous block between marker comment and </noscript> + whitespace
    html = html.replace(/\n\s*<!-- SEO static list[\s\S]*?<\/noscript>\n\s*/, '\n      ');
  }

  html = html.replace(divOpen, divOpen + staticBlock);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  OK    blog.html (${allPosts.length} posts injected into <noscript>)`);
}

// ─── Inject static post previews into index.html #posts-grid ─────────────────

function injectIndexPosts(allPosts) {
  const htmlPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(htmlPath)) { console.warn('  SKIP  index.html not found'); return; }

  let html = fs.readFileSync(htmlPath, 'utf8');

  const latest = allPosts.slice(0, 5);

  const listItems = latest.map(post => {
    const title   = escHtml(post.title || post.id);
    const date    = post.date ? formatDate(post.date) : '';
    const excerpt = escHtml((post.excerpt || '').replace(/\n+/g, ' ').trim().slice(0, 120));
    const tags    = (post.tags || []).slice(0, 4).map(t =>
      `<span class="tag" style="font-size:0.6rem;padding:0.1rem 0.4rem;">${escHtml(t)}</span>`
    ).join(' ');
    const url     = `posts/${post.id}/`;
    return `    <li style="padding:0.75rem 0;border-bottom:1px solid rgba(0,255,255,0.08);">
      <div style="margin-bottom:0.3rem;">${tags}</div>
      <a href="${url}" style="color:var(--neon-cyan);text-decoration:none;font-size:0.9rem;font-weight:600;">${title}</a>
      <div style="font-family:var(--font-mono);font-size:0.58rem;color:var(--text-muted);margin-top:0.2rem;">${date}</div>
      ${excerpt ? `<p style="font-size:0.78rem;color:var(--text-secondary);margin:0.3rem 0 0;">${excerpt}</p>` : ''}
    </li>`;
  }).join('\n');

  const staticBlock =
    `\n        <!-- SEO static list — regenerated by build-posts.js -->\n` +
    `        <noscript>\n` +
    `          <ul style="list-style:none;padding:0;margin:0;">\n` +
    `${listItems}\n` +
    `          </ul>\n` +
    `        </noscript>\n        `;

  const divOpen = `<div id="posts-grid" class="posts-grid" role="feed" aria-label="Лента постов">`;
  const marker  = `<!-- SEO static list`;

  if (html.includes(marker)) {
    html = html.replace(/\n\s*<!-- SEO static list[\s\S]*?<\/noscript>\n\s*/, '\n        ');
  }

  html = html.replace(divOpen, divOpen + staticBlock);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`  OK    index.html (${latest.length} posts injected into <noscript>)`);
}

main();
