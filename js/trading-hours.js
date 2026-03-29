/**
 * trading-hours.js — MOEX trading schedule widget
 *
 * Live MSK clock + session status for Equities (TQBR) and Futures (FORTS)
 * with countdown to next event, clearing indicators, progress bar.
 *
 * All times in MSK (UTC+3). Schedule as of 2026.
 */

// ─────────────────────────────────────────────────────────────
// SCHEDULE DEFINITIONS
// Each segment: { name, start, end, type }
// start/end in minutes from midnight MSK
// type: 'open' | 'preopen' | 'postclose' | 'clearing' | 'closed'
// ─────────────────────────────────────────────────────────────

const SEGMENTS_EQUITIES = [
  // 00:00–09:49  closed (night)
  { name: 'Закрыто',              start:    0, end:  589, type: 'closed'   },
  // 09:50–09:59  pre-trading (аукцион открытия)
  { name: 'Аукцион открытия',     start:  590, end:  599, type: 'preopen'  },
  // 10:00–18:39  main session
  { name: 'Основная сессия',      start:  600, end: 1119, type: 'open'     },
  // 18:40–18:49  post-trading (аукцион закрытия)
  { name: 'Аукцион закрытия',     start: 1120, end: 1129, type: 'clearing' },
  // 18:50–19:04  after-market
  { name: 'Послеторговый период', start: 1130, end: 1144, type: 'postclose'},
  // 19:05–23:49  evening session
  { name: 'Вечерняя сессия',      start: 1145, end: 1429, type: 'open'     },
  // 23:50–23:59  closed
  { name: 'Закрыто',              start: 1430, end: 1439, type: 'closed'   },
];

const SEGMENTS_FUTURES = [
  // 00:00–08:59  closed
  { name: 'Закрыто',              start:    0, end:  539, type: 'closed'   },
  // 09:00–13:59  morning/main session
  { name: 'Основная сессия',      start:  540, end:  839, type: 'open'     },
  // 14:00–14:04  day clearing (промежуточный клиринг)
  { name: 'Дневной клиринг',      start:  840, end:  844, type: 'clearing' },
  // 14:05–18:44  afternoon session
  { name: 'Дневная сессия',       start:  845, end: 1124, type: 'open'     },
  // 18:45–18:59  evening clearing (вечерний клиринг)
  { name: 'Вечерний клиринг',     start: 1125, end: 1139, type: 'clearing' },
  // 19:00–23:49  evening session
  { name: 'Вечерняя сессия',      start: 1140, end: 1429, type: 'open'     },
  // 23:50–23:59  closed
  { name: 'Закрыто',              start: 1430, end: 1439, type: 'closed'   },
];

// Schedule for the "расписание" table
const SCHEDULE_TABLE = [
  {
    market: 'АКЦИИ',
    subtitle: 'Московская биржа — рынок акций (ТQBR)',
    rows: [
      { session: 'Аукцион открытия',     time: '09:50–10:00', type: 'preopen',  note: 'Формирование цены открытия' },
      { session: 'Основная сессия',       time: '10:00–18:40', type: 'open',     note: 'Непрерывный двойной аукцион' },
      { session: 'Аукцион закрытия',      time: '18:40–18:50', type: 'clearing', note: 'Формирование цены закрытия' },
      { session: 'Послеторговый период',  time: '18:50–19:05', type: 'postclose',note: 'Сделки по цене закрытия' },
      { session: 'Вечерняя сессия',       time: '19:05–23:50', type: 'open',     note: 'Только ОФЗ, некоторые акции' },
    ],
  },
  {
    market: 'ФЬЮЧЕРСЫ',
    subtitle: 'Срочный рынок FORTS — фьючерсы и опционы',
    rows: [
      { session: 'Утренняя / основная сессия', time: '09:00–14:00', type: 'open',     note: 'SI, RI, GAZR, BR и все фьючерсы' },
      { session: 'Дневной клиринг',            time: '14:00–14:05', type: 'clearing', note: '⚡ Вариационная маржа ежедневно' },
      { session: 'Дневная сессия',             time: '14:05–18:45', type: 'open',     note: 'Продолжение торгов' },
      { session: 'Вечерний клиринг',           time: '18:45–19:00', type: 'clearing', note: '⚡ Вариационная маржа + экспирация' },
      { session: 'Вечерняя сессия',            time: '19:00–23:50', type: 'open',     note: 'Торги до конца дня' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// MSK TIME UTILS
// ─────────────────────────────────────────────────────────────
function getMsk() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 3 * 3600000);
}

function mskMinutes() {
  const m = getMsk();
  return m.getHours() * 60 + m.getMinutes();
}

function mskTimeStr() {
  const m = getMsk();
  return m.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function mskDateStr() {
  const m = getMsk();
  return m.toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function isWeekend() {
  const day = getMsk().getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

function minToHHMM(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function secondsToCountdown(sec) {
  if (sec <= 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ─────────────────────────────────────────────────────────────
// SEGMENT LOOKUP
// ─────────────────────────────────────────────────────────────
function currentSegment(segments, nowMin) {
  return segments.find(s => nowMin >= s.start && nowMin <= s.end) || segments[0];
}

function nextSegmentChange(segments, nowMin) {
  const cur = currentSegment(segments, nowMin);
  if (!cur) return null;
  // Seconds remaining until current segment ends
  const endMin = cur.end + 1;
  const secLeft = (endMin - nowMin) * 60 - getMsk().getSeconds();
  const nextSeg = segments.find(s => s.start === endMin) || null;
  return { current: cur, next: nextSeg, secLeft: Math.max(0, secLeft) };
}

function sessionProgress(seg, nowMin) {
  const total = seg.end - seg.start + 1;
  const elapsed = nowMin - seg.start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

// ─────────────────────────────────────────────────────────────
// TYPE → UI MAPPING
// ─────────────────────────────────────────────────────────────
const TYPE_META = {
  open:      { color: 'green',   icon: '▶', badge: 'ОТКРЫТО'   },
  preopen:   { color: 'yellow',  icon: '◐', badge: 'ПРЕ-МАРКЕТ' },
  postclose: { color: 'yellow',  icon: '◑', badge: 'ПОСТ-МАРКЕТ' },
  clearing:  { color: 'orange',  icon: '⚡', badge: 'КЛИРИНГ'   },
  closed:    { color: 'red',     icon: '■', badge: 'ЗАКРЫТО'    },
};

// ─────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────
function renderClock() {
  const el = document.getElementById('th-clock');
  const de = document.getElementById('th-date');
  if (el) el.textContent = mskTimeStr();
  if (de) de.textContent = mskDateStr().toUpperCase();
}

function renderMarketCard(cardId, segments, nowMin, weekend) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const info = nextSegmentChange(segments, nowMin);
  if (!info) return;

  const { current, next, secLeft } = info;
  const effectiveSeg = weekend
    ? { ...current, type: 'closed', name: 'Выходной' }
    : current;

  const meta    = TYPE_META[effectiveSeg.type] || TYPE_META.closed;
  const pct     = weekend ? 0 : sessionProgress(current, nowMin);
  const nextName = weekend ? 'Открытие в пн 09:00' : (next ? next.name : '—');
  const countdown = weekend ? '' : secondsToCountdown(secLeft);

  card.className = `th-market-card th-${meta.color}`;
  card.innerHTML = `
    <div class="th-card-header">
      <div class="th-card-meta">
        <span class="th-card-icon">${meta.icon}</span>
        <span class="th-card-badge th-badge-${meta.color}">${meta.badge}</span>
      </div>
      <div class="th-card-session">${effectiveSeg.name}</div>
    </div>
    <div class="th-progress-wrap" aria-label="Прогресс сессии ${Math.round(pct)}%">
      <div class="th-progress-bar">
        <div class="th-progress-fill th-fill-${meta.color}" style="width:${pct}%"></div>
      </div>
      <span class="th-progress-pct">${Math.round(pct)}%</span>
    </div>
    <div class="th-card-footer">
      <div class="th-next-label">СЛЕДУЮЩЕЕ:</div>
      <div class="th-next-name">${nextName}</div>
      ${countdown ? `<div class="th-countdown" aria-label="Обратный отсчёт">${countdown}</div>` : ''}
    </div>
  `;
}

function renderScheduleTable() {
  const container = document.getElementById('th-schedule');
  if (!container) return;

  container.innerHTML = SCHEDULE_TABLE.map(market => `
    <div class="th-schedule-block">
      <div class="th-schedule-market">${market.market}</div>
      <div class="th-schedule-subtitle">${market.subtitle}</div>
      <div class="th-schedule-rows">
        ${market.rows.map(row => {
          const m = TYPE_META[row.type] || TYPE_META.closed;
          return `
            <div class="th-schedule-row">
              <span class="th-row-dot th-dot-${m.color}">${m.icon}</span>
              <span class="th-row-time">${row.time}</span>
              <span class="th-row-name">${row.session}</span>
              <span class="th-row-note">${row.note}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────
// TICK — runs every second
// ─────────────────────────────────────────────────────────────
function tick() {
  const nowMin = mskMinutes();
  const weekend = isWeekend();

  renderClock();
  renderMarketCard('th-equities-card', SEGMENTS_EQUITIES, nowMin, weekend);
  renderMarketCard('th-futures-card',  SEGMENTS_FUTURES,  nowMin, weekend);
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
function initTradingHours() {
  const widget = document.getElementById('trading-hours-widget');
  if (!widget) return;

  renderScheduleTable();
  tick();
  setInterval(tick, 1000);

  // Toggle schedule table visibility
  const toggleBtn = document.getElementById('th-toggle-schedule');
  const scheduleEl = document.getElementById('th-schedule');
  if (toggleBtn && scheduleEl) {
    toggleBtn.addEventListener('click', () => {
      const hidden = scheduleEl.hidden;
      scheduleEl.hidden = !hidden;
      toggleBtn.textContent = hidden ? 'СКРЫТЬ РАСПИСАНИЕ ▲' : 'РАСПИСАНИЕ ▼';
      toggleBtn.setAttribute('aria-expanded', String(hidden));
    });
  }
}

document.addEventListener('DOMContentLoaded', initTradingHours);
