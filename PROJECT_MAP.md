# PROJECT_MAP.md — Аналитик MOEX/OI Blog

## Обзор

- **Название:** Аналитик MOEX/OI
- **Стек:** Vanilla JS, Three.js, GitHub Pages, GitHub Contents API, Giscus
- **Назначение:** Личный финансовый блог по рынку акций и фьючерсов Московской биржи
- **Владелец:** BigFish (antonovvladimirchebara-debug)
- **URL:** https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/
- **Репо:** https://github.com/antonovvladimirchebara-debug/moex-oi-analyst (публичное — Pages требует)

## Архитектура

```
Посетитель → GitHub Pages (статика)
Автор      → /admin.html → GitHub Contents API → коммит JSON → Pages rebuild
Комментарии → Giscus (GitHub Discussions)
3D фон     → Three.js (neon grid, particles, rings, icosahedron, OI-bars)
Посты      → posts/index.json + posts/YYYY-MM-DD-slug.json
Курсы валют → MOEX ISS CETS board API (real-time, каждые 30 сек)
Новости    → MOEX ISS sitenews.json (каждые 30 мин)
Расписание → Локальное расписание + живые часы МСК (каждую секунду)
```

## Структура файлов

```
moex-oi-analyst/
├── index.html            — Главная: hero (текст + справа 3D-плейс + видео 16:9) + курсы + сессии + новости + посты
├── blog.html             — Все посты (фильтры + пагинация 10/страница)
├── post.html             — Страница поста (markdown render + Giscus)
├── admin.html            — Панель автора (GitHub PAT auth)
├── css/
│   ├── style.css         — Deep Space Neon тема, glassmorphism, все виджеты
│   ├── animations.css    — Keyframes, reveal, ticker, scan-line
│   ├── audio-player.css  — Neon cyberpunk аудиоплеер (стили)
│   └── video-player.css  — Видеоблок hero: 3D рамка, 16:9, чипы плейлиста
├── js/
│   ├── three-scene.js    — Three.js: neon-grid, частицы, кольца, OI-bars, parallax
│   │                       Мобильная оптимизация: 200 частиц, 30fps, low-power, gyro
│   ├── blog.js           — Fetch posts, render cards/list, пагинация, SEO meta, initMobileNav
│   ├── admin.js          — GitHub API: посты, sitemap, автотеги, аудио- и видео-админка
│   ├── audio-player.js   — Аудиоплеер: HTML5 Audio, FFT visualizer, Яндекс embed
│   ├── video-player.js   — Видео на главной: video-config.json, local/embed/stream, плейлист
│   ├── moex-rates.js     — Курсы валют с MOEX ISS CETS board (USD/EUR/CNY/GOLD)
│   ├── trading-hours.js  — Торговые сессии, клиринги, живые часы МСК
│   └── moex-news.js      — Топ-5 новостей с MOEX ISS sitenews.json
├── posts/
│   ├── index.json        — [{id, title, date, tags, excerpt, file}]
│   └── YYYY-MM-DD-slug.json — Полный пост {id, title, date, tags, excerpt, content, file}
├── audio/                — Аудиофайлы (MP3/WAV/OGG), загружаются через admin
├── audio-config.json     — Конфиг плеера: localTracks[], yandexPlaylists[], activeSource
├── video/                — Видеофайлы (MP4/WebM/…), загрузка через admin → GitHub Contents API
├── video-config.json     — Плейлист: [{ id, title, enabled, source, filename | embedUrl | streamUrl, provider? }]
├── sitemap.xml           — Авто-обновляется при каждом посте через admin.js
├── user-pages-github-io-root/ — шаблон index.html + robots.txt для репо username.github.io (Яндекс, корень хоста, Sitemap блога)
├── robots.txt            — Allow: /, Disallow: /admin.html
├── _config.yml           — GitHub Pages Jekyll config
├── README.md
└── PROJECT_MAP.md        — этот файл
```

## Компоненты

### Three.js сцена (three-scene.js)
- **NeonGrid:** GridHelper 80x80 с 40 ячейками + custom LineSegments с перспективой
- **Particles:** 800 точек (cyan/magenta/green), AdditiveBlending, вращение
- **Rings:** 3 тора разного радиуса, пульсирующая opacity
- **Icosahedron:** wireframe геометрия, постоянное вращение
- **DataBars:** 16 wireframe boxes — визуализация OI-гистограммы
- **Mouse parallax:** камера следует за мышью (±3 по X, ±2 по Y)
- **Fog:** FogExp2 для глубины сцены

### Blog system (blog.js)
- `fetchPostsIndex()` — fetch `posts/index.json` с cache-bust
- `fetchPostContent(file)` — fetch конкретного JSON поста
- `initIndexPage()` — 6 последних постов в grid
- `initBlogPage()` — все посты с фильтрацией по тегам + пагинация (10/страница)
- `initPostPage()` — рендер markdown через marked.js, SEO meta, prev/next навигация, Giscus
- `loadGiscus()` — динамическое подключение Giscus (**⚠️ нужно настроить repo-id**)

### Admin system (admin.js)
- Auth: GitHub API `/user` → проверка login === 'antonovvladimirchebara-debug'
- PAT хранится в `localStorage` → auto-login при следующем визите
- `publishPost()` → коммит JSON поста + обновление index.json + sitemap.xml
- `deletePost()` → DELETE запрос к GitHub API + обновление index.json
- `generateTagsFromText()` → словарь 35+ категорий, 120+ паттернов MOEX-терминов
- `triggerAutoTags()` → кнопка ⚡ АВТОТЕГИ + debounced re-run при изменении текста
- EasyMDE редактор с автосохранением черновика
- **Audio Admin:** плейлист как у видео (`normalizeAudioPlaylistTracks`, `parseAudioStreamUrl`, ЭФИР, URL, drag), Яндекс OAuth
- **Video Admin:** `initVideoTab()`, `uploadVideoFile()`, `saveVideoConfig()`, `parseVideoUrl()` — YouTube/Vimeo/Rutube/VK/прямой MP4

### Видеоплеер (video-player.js + css/video-player.css)

**Размещение:** правая колонка hero — `#hero-video-mount` внутри `.hero-right-column` под `#title-3d-container` (`index.html`, стили `style.css`).

**UI:** метка VIDEO 3D, перспектива CSS (`perspective` + `rotateY` / `rotateX`), неоновая рамка и углы; область **16:9**; внутри — `<iframe>` (embed) или `<video controls>` (файл из `/video/` или прямой URL). Кнопки ⏮ ⏭, чипы плейлиста.

**Источники `source`:**
- `local` — `video/{filename}` в репозитории
- `embed` — `embedUrl` (YouTube, Vimeo, Rutube, VK video_ext, Dailymotion, произвольный embed)
- `stream` — `streamUrl` для прямого MP4/WebM

**Фильтр:** в ротации только элементы с `enabled !== false`.

**Публичный API:** `window.videoPlayer.reload()` — перечитать конфиг (после сохранения в админке на той же вкладке вызывается автоматически).

### Аудиоплеер (audio-player.js + css/audio-player.css)

**Размещение:** hero-секция `index.html`, после `.hero-cta` — инжектируется через JS.

**Компоненты UI:**
- Tabs: LOCAL / ЯНДЕКС ♫ (переключение источника)
- Canvas-визуализатор: Web Audio API AnalyserNode → FFT 256 → 48 bars, gradient cyan→magenta
- Track info: scrolling-title при длинном названии, artist
- Progress bar: seek by click/drag, neon fill gradient
- Controls: ⏮ ▶/⏸ ⏭ + volume + shuffle + repeat (off/all/one)

**LOCAL + URL плейлист (как видеоплеер):**
- `localTracks[]`: каждый элемент — `source: "local" | "stream"`, `enabled` (в эфире), `title`, `artist`
- **local:** `filename` → URL `audio/{filename}`
- **stream:** `streamUrl` (https) — HTML5 Audio; без CORS у внешнего URL FFT может не работать
- Воспроизводятся только треки с `enabled !== false`; порядок в JSON = порядок next/prev
- Autoplay запрещён — старт по клику; AudioContext — на первый play

**ЯНДЕКС режим:**
- OAuth implicit flow через Яндекс ID (redirect → token в hash)
- Если плейлисты настроены: iframe embed `music.yandex.ru/iframe/#playlist/{uid}/{kind}/`
- Если нет: инструкция "настройте в admin"

**audio-config.json:**
```json
{
  "localTracks": [
    { "id": "...", "title": "...", "artist": "...", "filename": "track.mp3", "source": "local", "enabled": true },
    { "id": "...", "title": "...", "artist": "...", "source": "stream", "streamUrl": "https://...", "enabled": true }
  ],
  "yandexPlaylists": [{ "kind": 1234, "uid": "login", "title": "..." }],
  "yandexClientId": "...",
  "activeSource": "local"
}
```
OAuth-токен Яндекса хранится в `localStorage['moex_oi_yandex_token']` (не в репо).

### Admin — таб ВИДЕОПЛЕЕР (admin.html + admin.js)

- Зона загрузки видео с ПК → коммит в `video/`, запись в плейлист (`source: local`)
- Поле URL + заголовок → `parseVideoUrl()` → embed или stream
- Список: чекбокс **ЭФИР**, редактирование заголовка, drag-сортировка, удаление
- **Сохранить** — коммит `video-config.json`

### Admin — таб АУДИОПЛЕЕР (admin.html + admin.js)

**Секция 1 — ПЛЕЙЛИСТ (аналог ВИДЕОПЛЕЕР):**
- Загрузка файлов с ПК → `/audio/` (max 50 MB)
- Блок **по ссылке:** https URL потока → `parseAudioStreamUrl()` → запись `source: stream`, `streamUrl`
- Список: чекбокс **ЭФИР** (`enabled`), поля название + исполнитель, бейдж FILE/URL, drag-сортировка, удаление
- **СОХРАНИТЬ ПЛЕЙЛИСТ** → `audio-config.json`; вызывается `audioPlayer.reload()`

**Секция 2 — ЯНДЕКС МУЗЫКА:**
- Поле Client ID Яндекс OAuth приложения
- "ПОДКЛЮЧИТЬ АККАУНТ" → `oauth.yandex.ru/authorize?response_type=token`
- После возврата: список плейлистов аккаунта через `api.music.yandex.net`
- Если CORS блокирует API — fallback на ручной ввод URL плейлиста
- Чекбоксы выбора / удаление → "СОХРАНИТЬ НАСТРОЙКИ ЯНДЕКС"

### Курсы валют (moex-rates.js)
- **Endpoint:** `https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities.json`
- **Инструменты:** USD000UTSTOM, EUR_RUB__TOM, CNYRUB_TOM, GLDRUB_TOM
- **Колонки:** SECID, WAPRICE/LAST/MARKETPRICE (fallback chain), OPEN, HIGH, LOW, LASTTOPREVPRICE
- **Обновление:** каждые 30 сек в торговое время, 5 мин — вне сессии
- **Nav тикер:** обновляется реальными ценами с ▲▼

### Торговые сессии (trading-hours.js)
- Живые часы МСК (обновление каждую секунду)
- Расписание акций (TQBR): 09:50 аукцион открытия → 10:00 основная → 18:40 аукцион закрытия → 18:50 постторговый → 19:05 вечерняя → 23:50
- Расписание фьючерсов (FORTS): 09:00 → дневной клиринг 14:00–14:05 → 14:05 → вечерний клиринг 18:45–19:00 → 19:00 вечерняя → 23:50
- Прогресс-бар сессии + обратный отсчёт до следующего события
- Учитывает выходные дни (сб/вс → ЗАКРЫТО)
- Раскрывающееся полное расписание (кнопка РАСПИСАНИЕ ▼)

### Новости MOEX (moex-news.js)
- **Endpoint:** `https://iss.moex.com/iss/sitenews.json?lang=ru`
- Топ-5 последних новостей с датой, тегом, заголовком, превью
- Время в формате "14 мин назад" / "Сегодня, 14:32"
- Ссылки на moex.com, обновление каждые 30 мин
- Кнопка ⟳ ОБНОВИТЬ для ручного рефреша

### SEO
- JSON-LD Schema.org: Blog (главная), BlogPosting (посты)
- Open Graph + Twitter Cards на всех страницах
- Canonical URL, meta description на каждой странице
- robots.txt с Disallow: /admin.html
- sitemap.xml — обновляется при каждом посте через admin.js

## Хронология

| Дата | Коммит | Описание |
|------|--------|----------|
| 2026-03-29 | 044c00a | feat: initial launch — полный сайт-блог, Three.js, admin, Giscus, SEO |
| 2026-03-29 | 07c27ad | docs: add PROJECT_MAP.md |
| 2026-03-29 | b45304f | feat: auto-hashtag engine — словарь 35+ категорий, 120+ паттернов MOEX |
| 2026-03-29 | 424f7d2 | feat: live MOEX ISS currency rates board (USD/EUR/CNY/GOLD) |
| 2026-03-29 | 13fbc59 | feat: trading hours widget — часы МСК, сессии, клиринги, расписание |
| 2026-03-29 | 5079971 | feat: top-5 MOEX daily news from ISS API |
| 2026-03-29 | 4d74e6a | fix: rewrite moex-rates.js для реальных колонок CETS board API |
| 2026-03-29 | 8a7c0e7 | feat: полная мобильная оптимизация — гамбургер-меню, responsive CSS, Three.js mobile mode |
| 2026-03-31 | —       | feat: аудиоплеер — neon cyberpunk, FFT visualizer, Яндекс OAuth, admin upload |
| 2026-03-31 | 4aacbe8 | feat: SEO — статические HTML постов, GitHub Actions pre-render, evergreen контент |
| 2026-04-01 | 79d0865 | chore: метатег Яндекс Вебмастер `yandex-verification` (index, blog, post) |
| 2026-04-01 | 61db118 | docs: шаблон `user-pages-github-io-root/` для подтверждения Яндекса на корне github.io |
| 2026-04-01 | f4d81d6 | docs: ссылка на созданный репозиторий `antonovvladimirchebara-debug.github.io` |
| 2026-04-01 | a7152e1 | chore: `user-pages-github-io-root/robots.txt` — Sitemap на `/moex-oi-analyst/sitemap.xml` |
| 2026-04-01 | 4df343a | feat: видеоплеер на главной (3D рамка 16:9), `video-config.json`, admin ВИДЕОПЛЕЕР |
| 2026-04-01 | —       | feat: аудио-плейлист как у видео — ЭФИР, URL-поток, `enabled`/`source` в `localTracks` |

## Текущее состояние

- ✅ Сайт задеплоен на GitHub Pages, статус `built`
- ✅ URL: https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/
- ✅ Первый тестовый пост опубликован (2026-03-29, OI фьючерсы MOEX)
- ✅ Курсы валют USD/EUR/CNY/GOLD с MOEX ISS (исправлен маппинг колонок)
- ✅ Живые часы МСК + расписание торговых сессий
- ✅ Топ-5 новостей MOEX с автообновлением
- ✅ Автогенерация хештегов в admin-панели
- ✅ **Мобильная оптимизация:** гамбургер-меню, responsive layout, Three.js mobile mode (30fps, 200 частиц, gyro)
- ✅ **Аудиоплеер:** neon cyberpunk, FFT; плейлист LOCAL + **URL-поток**; только треки с **ЭФИР**; ЯНДЕКС (OAuth embed)
- ✅ **Admin — АУДИОПЛЕЕР:** тот же UX что видео (ЭФИР, ссылка, порядок drag), плюс Яндекс
- ✅ **Видеоплеер:** hero справа, плейлист local + embed (YouTube/Vimeo/Rutube/VK и др.) + прямые URL; вкладка **ВИДЕОПЛЕЕР** в admin
- ✅ **SEO pre-render:** `scripts/build-posts.js` генерирует `posts/<slug>/index.html` со всеми мета, JSON-LD; GitHub Actions автозапуск при каждом пуше в `posts/**`
- ✅ **sitemap.xml:** обновлён на статические URL `posts/<slug>/`
- ✅ **index.html:** секция #methodology (~900 слов), расширенный блок автора с методологией и контактами
- ⚠️ **Giscus комментарии:** нужно настроить `data-repo-id` и `data-category-id` через https://giscus.app → обновить `js/blog.js` функция `loadGiscus()`
- ⚠️ **OG-image:** файл `og-image.png` (1200×630px) не создан — нет превью при шеринге
- **Audio player:** для Яндекс Музыки нужно зарегистрировать приложение на oauth.yandex.ru → Веб-сервис → Callback URI = URL admin.html

## Важные замечания

### Почему репо публичное
GitHub Pages на бесплатном аккаунте работает **только с публичными** репозиториями.
Варианты если нужна приватность кода:
1. GitHub Pro (~$4/мес) — Pages на приватных репо
2. Перенос на Vercel (бесплатно + приватное репо)

### Правильный URL сайта
```
https://antonovvladimirchebara-debug.github.io/moex-oi-analyst/
```
Корень `antonovvladimirchebara-debug.github.io` — 404, нужен полный путь с `/moex-oi-analyst/`

### Яндекс Вебмастер и корень github.io
Если в Вебмастере сайт добавлен как `https://antonovvladimirchebara-debug.github.io` (без пути), робот проверяет **главную страницу хоста** — она отдаёт 404, метатег из репо `moex-oi-analyst` там не появится. Яндекс при добавлении URL с `/moex-oi-analyst/` сводит ресурс к корню хоста. **Решение:** отдельный репозиторий `antonovvladimirchebara-debug.github.io` с `index.html` в корне (метатег + редирект на блог) — репозиторий создан и задеплоен: <https://github.com/antonovvladimirchebara-debug/antonovvladimirchebara-debug.github.io> (шаблон также в `user-pages-github-io-root/` в репо блога).

## Команды

```bash
# Локальная разработка
cd /home/vladi/projects/moex-oi-analyst
python3 -m http.server 8080  # open http://localhost:8080

# Пуш изменений
cd /home/vladi/projects/moex-oi-analyst
git add -A && git commit -m "fix: ..." && git push

# Проверить статус GitHub Pages
curl -s -H "Authorization: token TOKEN" \
  https://api.github.com/repos/antonovvladimirchebara-debug/moex-oi-analyst/pages \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status'), d.get('html_url'))"
```

## Паттерны и антипаттерны

### Добавление нового виджета
1. Создать `js/widget-name.js` с `initWidgetName()` и `document.addEventListener('DOMContentLoaded', init...)`
2. Добавить HTML-секцию в `index.html` с уникальным `id`
3. Добавить CSS в `style.css` с чётким блочным комментарием
4. Подключить `<script src="js/widget-name.js" defer>` в конце `index.html`

### MOEX ISS API — известные особенности
- `/statistics/engines/currency/markets/selt/rates.json` — только USD, CNY, GOLD (без EUR!)
- `/engines/currency/markets/selt/boards/CETS/securities.json` — все валюты, правильный endpoint
- Колонки реального ответа: `SECID, WAPRICE, LAST, MARKETPRICE, OPEN, HIGH, LOW, LASTTOPREVPRICE`
- EUR вне торгов: WAPRICE=null, LAST=null, MARKETPRICE=95.xx (использовать MARKETPRICE как fallback)
- GBP (GBPRUB_TOM) — данных нет, используем GOLD (GLDRUB_TOM)

## Словарь

- **OI** — Open Interest, открытый интерес на фьючерсах
- **SI** — Фьючерс на доллар/рубль (USD000UTSTOM)
- **RI** — Фьючерс на индекс РТС
- **GAZR** — Фьючерс на акции Газпрома
- **TQBR** — Режим торгов акциями на Московской бирже
- **FORTS** — Срочный рынок Московской биржи (фьючерсы и опционы)
- **CETS** — Валютный рынок MOEX (Currency Exchange Trading System)
- **WAP** — Weighted Average Price, средневзвешенная цена
- **PAT** — Personal Access Token GitHub
- **Giscus** — Система комментариев на базе GitHub Discussions
- **ISS** — Informational & Statistical Server MOEX (публичный API)
