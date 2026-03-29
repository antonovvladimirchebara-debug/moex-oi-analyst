# Аналитик MOEX/OI

**Футуристичный блог по рынку акций и фьючерсов Московской биржи**

🔗 [Открыть сайт](https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/)

## О проекте

- **Стиль:** 3D NEON / Cyberpunk / Deep Space
- **3D графика:** Three.js (neon-grid, частицы, кольца, гистограмма OI)
- **Комментарии:** Giscus (GitHub Discussions)
- **Посты:** JSON-файлы в `posts/`, управление через `/admin.html`
- **SEO:** sitemap.xml, robots.txt, JSON-LD Schema.org, Open Graph

## Структура

```
├── index.html          — Главная страница
├── blog.html           — Все посты
├── post.html           — Страница поста
├── admin.html          — Панель автора (токен в localStorage)
├── css/
│   ├── style.css
│   └── animations.css
├── js/
│   ├── three-scene.js  — 3D сцена
│   ├── blog.js         — Логика блога
│   └── admin.js        — GitHub API постинг
├── posts/
│   └── index.json      — Индекс постов
├── sitemap.xml
└── robots.txt
```

## Как публиковать

1. Открой `/admin.html` на сайте
2. Введи GitHub Personal Access Token (с правами `repo`)
3. Заполни форму и нажми **ОПУБЛИКОВАТЬ**
4. Пост автоматически коммитится в репо и появляется на сайте

## Технологии

- Three.js 3D сцена
- Vanilla JS (без фреймворков)
- GitHub Pages хостинг
- GitHub Contents API для постинга
- Giscus для комментариев
- EasyMDE markdown-редактор
