# PROJECT_MAP.md — Аналитик MOEX/OI Blog

## Обзор

- **Название:** Аналитик MOEX/OI
- **Стек:** Vanilla JS, Three.js, GitHub Pages, GitHub Contents API, Giscus
- **Назначение:** Личный финансовый блог по рынку акций и фьючерсов Московской биржи
- **Владелец:** BigFish (antonovvladimirchebara-debug)
- **URL:** https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/

## Архитектура

```
Посетитель → GitHub Pages (статика)
Автор      → /admin.html → GitHub Contents API → коммит JSON → Pages rebuild
Комментарии → Giscus (GitHub Discussions)
3D фон     → Three.js (neon grid, particles, rings, icosahedron)
Посты      → posts/index.json + posts/YYYY-MM-DD-slug.json
```

## Структура файлов

```
moex-oi-analyst/
├── index.html            — Главная (3D hero + последние 6 постов)
├── blog.html             — Все посты (фильтры + пагинация 10/страница)
├── post.html             — Страница поста (markdown render + Giscus)
├── admin.html            — Панель автора (GitHub PAT auth)
├── css/
│   ├── style.css         — Deep Space Neon тема, glassmorphism
│   └── animations.css    — Keyframes, reveal, ticker, scan-line
├── js/
│   ├── three-scene.js    — Three.js: neon-grid, 800 частиц, кольца, OI-bars
│   ├── blog.js           — Fetch posts, render cards/list, пагинация, SEO
│   └── admin.js          — GitHub API: публикация, удаление, sitemap update
├── posts/
│   ├── index.json        — [{id, title, date, tags, excerpt, file}]
│   └── YYYY-MM-DD-slug.json — Полный пост с content (markdown)
├── sitemap.xml           — Авто-обновляется при каждом посте через admin.js
├── robots.txt
├── _config.yml
└── README.md
```

## Компоненты

### Three.js сцена (three-scene.js)
- **NeonGrid:** GridHelper 80x80 с 40 ячейками + custom LineSegments с перспективой
- **Particles:** 800 точек (cyan/magenta/green), AdditiveBlending, вращение
- **Rings:** 3 тора разного радиуса, пульсирующая opacity
- **Icosahedron:** wireframe геометрия, постоянное вращение
- **DataBars:** 16 wireframe boxes — визуализация OI-гистограммы
- **Mouse parallax:** камера следует за мышью (±3 по X, ±2 по Y)

### Blog system (blog.js)
- `fetchPostsIndex()` — fetch `posts/index.json` с cache-bust
- `fetchPostContent(file)` — fetch конкретного JSON поста
- `initIndexPage()` — 6 последних постов в grid
- `initBlogPage()` — все посты с фильтрацией по тегам + пагинация
- `initPostPage()` — рендер markdown через marked.js, SEO meta, Giscus
- `loadGiscus()` — динамическое подключение Giscus (нужно настроить repo-id)

### Admin system (admin.js)
- Auth: GitHub API `/user` → проверка login === 'antonovvladimirchebara-debug'
- PAT хранится в `localStorage` → auto-login при следующем визите
- `publishPost()` → коммит JSON поста + обновление index.json + sitemap.xml
- `deletePost()` → DELETE запрос к GitHub API + обновление index.json
- EasyMDE редактор с автосохранением

### SEO
- JSON-LD Schema.org: Blog (главная), BlogPosting (посты)
- Open Graph + Twitter Cards на всех страницах
- Canonical URL, meta description на каждой странице
- robots.txt с Disallow: /admin.html
- sitemap.xml — обновляется при каждом посте

## Хронология

| Дата | Коммит | Описание |
|------|--------|----------|
| 2026-03-29 | 044c00a | feat: initial launch — полный сайт-блог |

## Текущее состояние

- ✅ Сайт задеплоен на GitHub Pages, статус `built`
- ✅ URL: https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/
- ✅ Первый тестовый пост опубликован
- ⚠️ Giscus комментарии: нужно настроить `data-repo-id` и `data-category-id` через https://giscus.app
- ⚠️ OG-image: файл `og-image.png` не создан (можно добавить позже)

## Команды

```bash
# Локальная разработка
cd /home/vladi/projects/moex-oi-analyst
python3 -m http.server 8080  # open http://localhost:8080

# Пуш изменений
cd /home/vladi/projects/moex-oi-analyst
git add -A && git commit -m "fix: ..." && git push
```

## Словарь

- **OI** — Open Interest, открытый интерес на фьючерсах
- **SI** — Фьючерс на доллар/рубль
- **RI** — Фьючерс на индекс РТС
- **GAZR** — Фьючерс на акции Газпрома
- **Giscus** — Система комментариев на базе GitHub Discussions
- **PAT** — Personal Access Token GitHub
