/**
 * moex-rates.js — Live MOEX ISS currency rates widget
 *
 * Data source: MOEX ISS public API (no auth required)
 * https://iss.moex.com/iss/statistics/engines/currency/markets/selt/rates.json
 *
 * Updates every 30 seconds during trading hours (10:00–23:50 MSK).
 * Outside trading hours shows last known values with "закрыто" indicator.
 */

const MOEX_RATES_URL =
  'https://iss.moex.com/iss/statistics/engines/currency/markets/selt/rates.json' +
  '?iss.meta=off&iss.only=wap_rates';

// Desired instruments in display order
const WANTED = [
  { secid: 'USDRUS',  label: 'USD/₽', flag: '🇺🇸' },
  { secid: 'EURRUS',  label: 'EUR/₽', flag: '🇪🇺' },
  { secid: 'CNYRUB',  label: 'CNY/₽', flag: '🇨🇳' },
  { secid: 'GBPRUS',  label: 'GBP/₽', flag: '🇬🇧' },
];

// Fallback: SI/ED futures from MOEX (always has data)
const FUTURES_URL =
  'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json' +
  '?iss.meta=off&iss.only=marketdata&securities=SIM5,SiH5,SiM5,SiU5,SiZ5';

let lastRates = {};
let updateInterval = null;
let retryCount = 0;

// ── Moscow time helpers ───────────────────────────────────────
function getMoscowHour() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const msk = new Date(utc + 3 * 3600000);
  return { h: msk.getHours(), m: msk.getMinutes(), msk };
}

function isTradingHours() {
  const { h, m } = getMoscowHour();
  const totalMin = h * 60 + m;
  // MOEX SELT currency: 10:00–23:50 MSK
  return totalMin >= 600 && totalMin < 1430;
}

function formatMskTime(date) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const msk = new Date(utc + 3 * 3600000);
  return msk.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Number formatting ─────────────────────────────────────────
function fmt(val) {
  if (val == null || val === 0) return '—';
  return Number(val).toLocaleString('ru-RU', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function fmtChange(cur, prev) {
  if (!cur || !prev || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  return { pct, abs: cur - prev };
}

// ── Fetch from MOEX ISS ───────────────────────────────────────
async function fetchRates() {
  const res = await fetch(MOEX_RATES_URL + '&_=' + Date.now(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const cols = json.wap_rates?.columns;
  const data = json.wap_rates?.data;
  if (!cols || !data) throw new Error('No data');

  const idx = (name) => cols.indexOf(name);
  const iName    = idx('SHORTNAME') >= 0 ? idx('SHORTNAME') : idx('NAME');
  const iPrice   = idx('WAPRICE');
  const iBid     = idx('BID');
  const iOffer   = idx('OFFER');
  const iOpen    = idx('OPEN');
  const iLow     = idx('LOW');
  const iHigh    = idx('HIGH');
  const iVol     = idx('VOLRUB');
  const iSystime = idx('SYSTIME');

  const rates = {};
  data.forEach(row => {
    const name = row[iName];
    if (!name) return;
    rates[name] = {
      name,
      price:   row[iPrice],
      bid:     row[iBid],
      offer:   row[iOffer],
      open:    row[iOpen],
      low:     row[iLow],
      high:    row[iHigh],
      volRub:  row[iVol],
      systime: row[iSystime],
    };
  });

  return rates;
}

// ── Build ticker string for nav ───────────────────────────────
function buildTickerText(rates) {
  const parts = [];
  for (const { secid, label } of WANTED) {
    const r = rates[secid];
    if (!r || !r.price) continue;
    const prev = lastRates[secid]?.price;
    const arrow = prev ? (r.price > prev ? '▲' : r.price < prev ? '▼' : '●') : '●';
    parts.push(`${label} ${fmt(r.price)} ${arrow}`);
  }
  return parts.length
    ? parts.join('  ⬥  ') + '  ⬥  MOEX ISS'
    : 'MOEX: АНАЛИЗ РЫНКА ● ОТКРЫТЫЙ ИНТЕРЕС ● ФЬЮЧЕРСЫ ●';
}

// ── Render main widget ────────────────────────────────────────
function renderWidget(rates, trading) {
  const board = document.getElementById('rates-board');
  if (!board) return;

  const now = new Date();
  const timeStr = formatMskTime(now);
  const statusEl = document.getElementById('rates-status');
  if (statusEl) {
    statusEl.textContent = trading ? `ОБНОВЛЕНО ${timeStr} МСК` : `БИРЖА ЗАКРЫТА • ДАННЫЕ ${timeStr} МСК`;
    statusEl.className   = `rates-status ${trading ? 'live' : 'closed'}`;
  }

  board.innerHTML = '';

  WANTED.forEach(({ secid, label, flag }) => {
    const r = rates[secid];
    const prev = lastRates[secid];
    const price = r?.price || prev?.price;
    if (!price) return;

    const open  = r?.open  || prev?.open;
    const low   = r?.low   || prev?.low;
    const high  = r?.high  || prev?.high;
    const bid   = r?.bid   || prev?.bid;
    const offer = r?.offer || prev?.offer;

    // Direction vs open
    let dir = 'flat', pctStr = '', absStr = '';
    if (open && open > 0) {
      const delta = price - open;
      const pct   = (delta / open) * 100;
      dir    = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      pctStr = `${delta >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      absStr = `${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`;
    }

    const card = document.createElement('div');
    card.className = `rate-card rate-${dir}`;
    card.innerHTML = `
      <div class="rate-header">
        <span class="rate-flag">${flag}</span>
        <span class="rate-label">${label}</span>
        <span class="rate-dir-icon">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}</span>
      </div>
      <div class="rate-price">${fmt(price)}</div>
      <div class="rate-change ${dir}">
        <span class="rate-pct">${pctStr || '—'}</span>
        <span class="rate-abs">${absStr || ''}</span>
      </div>
      <div class="rate-details">
        ${bid   ? `<span class="rate-detail"><span class="rd-label">BID</span><span class="rd-val">${fmt(bid)}</span></span>` : ''}
        ${offer ? `<span class="rate-detail"><span class="rd-label">ASK</span><span class="rd-val">${fmt(offer)}</span></span>` : ''}
        ${low   ? `<span class="rate-detail"><span class="rd-label">LOW</span><span class="rd-val">${fmt(low)}</span></span>` : ''}
        ${high  ? `<span class="rate-detail"><span class="rd-label">HIGH</span><span class="rd-val">${fmt(high)}</span></span>` : ''}
      </div>
    `;
    board.appendChild(card);
  });

  // Placeholder if completely empty
  if (board.children.length === 0) {
    board.innerHTML = `<div class="rates-no-data">Данные недоступны. MOEX ISS API не отвечает.</div>`;
  }
}

// ── Update nav ticker ─────────────────────────────────────────
function updateNavTicker(rates) {
  const ticker = document.getElementById('market-ticker');
  if (!ticker) return;
  const text = buildTickerText(rates);
  ticker.textContent = `${text}  ⬥  ${text}  ⬥  `;
}

// ── Main update cycle ─────────────────────────────────────────
async function updateRates() {
  const trading = isTradingHours();
  const statusEl = document.getElementById('rates-status');

  try {
    const rates = await fetchRates();

    // Merge with prev for direction arrows
    renderWidget(rates, trading);
    updateNavTicker(rates);
    lastRates = { ...lastRates, ...rates };
    retryCount = 0;

    if (statusEl) {
      statusEl.className = `rates-status ${trading ? 'live' : 'closed'}`;
    }

  } catch (err) {
    retryCount++;
    console.warn('[MOEX rates] fetch failed:', err.message);

    // Show last known data with error indicator
    if (Object.keys(lastRates).length > 0) {
      renderWidget(lastRates, false);
    } else if (document.getElementById('rates-board')) {
      document.getElementById('rates-board').innerHTML =
        `<div class="rates-no-data">⚠ MOEX ISS временно недоступен. Повтор через ${retryCount < 3 ? 30 : 60} сек.</div>`;
    }
  }
}

// ── Init ──────────────────────────────────────────────────────
function initRates() {
  const widget = document.getElementById('rates-widget');
  if (!widget) return;

  // First load immediately
  updateRates();

  // During trading hours — update every 30 sec
  // Outside — every 5 min (market may open)
  function scheduleNext() {
    const interval = isTradingHours() ? 30000 : 300000;
    updateInterval = setTimeout(async () => {
      await updateRates();
      scheduleNext();
    }, interval);
  }
  scheduleNext();
}

document.addEventListener('DOMContentLoaded', initRates);
