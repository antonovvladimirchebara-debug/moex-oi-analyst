/**
 * moex-rates.js — Live MOEX ISS currency rates widget
 *
 * Endpoint: CETS board securities marketdata (batch)
 * Columns actually returned: SECID, WAPRICE, LAST, MARKETPRICE,
 *   OPEN, HIGH, LOW, BID, OFFER, LASTTOPREVPRICE
 *
 * Price priority: WAPRICE → LAST → MARKETPRICE
 * Updates every 30 sec during trading hours (10:00–23:50 MSK).
 */

const CETS_URL =
  'https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities.json' +
  '?iss.meta=off&iss.only=marketdata' +
  '&securities=USD000UTSTOM,EUR_RUB__TOM,CNYRUB_TOM,GLDRUB_TOM';

const WANTED = [
  { secid: 'USD000UTSTOM', label: 'USD/₽', flag: '🇺🇸', name: 'Доллар' },
  { secid: 'EUR_RUB__TOM', label: 'EUR/₽', flag: '🇪🇺', name: 'Евро'   },
  { secid: 'CNYRUB_TOM',   label: 'CNY/₽', flag: '🇨🇳', name: 'Юань'   },
  { secid: 'GLDRUB_TOM',   label: 'XAU/₽', flag: '🥇', name: 'Золото' },
];

let lastRates = {};

// ── Moscow time ───────────────────────────────────────────────
function getMsk() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000);
}
function isTradingHours() {
  const m = getMsk();
  const t = m.getHours() * 60 + m.getMinutes();
  return t >= 600 && t < 1430; // 10:00–23:50
}
function mskTimeStr() {
  return getMsk().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Number formatting ─────────────────────────────────────────
function fmt(val, decimals = 4) {
  if (val == null || val === 0) return '—';
  return Number(val).toLocaleString('ru-RU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Fetch from MOEX CETS board ────────────────────────────────
async function fetchRates() {
  const res = await fetch(CETS_URL + '&_=' + Date.now(), {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();

  const cols = json.marketdata?.columns;
  const data = json.marketdata?.data;
  if (!cols || !data) throw new Error('No marketdata');

  const col = name => cols.indexOf(name);
  const iSecid  = col('SECID');
  const iWap    = col('WAPRICE');
  const iLast   = col('LAST');
  const iMp     = col('MARKETPRICE');
  const iOpen   = col('OPEN');
  const iHigh   = col('HIGH');
  const iLow    = col('LOW');
  const iBid    = col('BID');
  const iOffer  = col('OFFER');
  const iLtp    = col('LASTTOPREVPRICE');  // абс. изм. к пред. закрытию
  const iLtpPct = col('WAPTOPREVWAPRICEPRCNT'); // % изм. WAP

  const rates = {};
  data.forEach(row => {
    const secid = row[iSecid];
    if (!secid) return;
    const price = row[iWap] || row[iLast] || row[iMp] || null;
    rates[secid] = {
      secid,
      price,
      open:    row[iOpen],
      high:    row[iHigh],
      low:     row[iLow],
      bid:     row[iBid],
      offer:   row[iOffer],
      ltp:     row[iLtp],    // изменение к пред. закрытию (абс.)
      ltpPct:  row[iLtpPct], // % к пред. WAP
    };
  });
  return rates;
}

// ── Direction helpers ─────────────────────────────────────────
function getDir(ltp) {
  if (ltp == null) return 'flat';
  if (ltp > 0)  return 'up';
  if (ltp < 0)  return 'down';
  return 'flat';
}
function getDirIcon(dir) {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●';
}

// Вычисляем % изменение от открытия (если есть open)
function calcPct(price, open) {
  if (!price || !open || open === 0) return null;
  return ((price - open) / open) * 100;
}

// ── Build nav ticker text ─────────────────────────────────────
function updateNavTicker(rates) {
  const ticker = document.getElementById('market-ticker');
  if (!ticker) return;
  const parts = WANTED
    .filter(w => rates[w.secid]?.price)
    .map(w => {
      const r   = rates[w.secid];
      const dir = getDir(r.ltp);
      const decimals = w.secid === 'GLDRUB_TOM' ? 2 : 4;
      return `${w.label} ${fmt(r.price, decimals)} ${getDirIcon(dir)}`;
    });
  const text = parts.length
    ? parts.join('  ⬥  ') + '  ⬥  MOEX'
    : 'MOEX: АНАЛИЗ РЫНКА ● ОТКРЫТЫЙ ИНТЕРЕС ● ФЬЮЧЕРСЫ ●';
  ticker.textContent = `${text}  ⬥  ${text}  ⬥  `;
}

// ── Render widget cards ───────────────────────────────────────
function renderWidget(rates, trading) {
  const board    = document.getElementById('rates-board');
  const statusEl = document.getElementById('rates-status');
  if (!board) return;

  if (statusEl) {
    statusEl.textContent = trading
      ? `● ОБНОВЛЕНО ${mskTimeStr()} МСК`
      : `○ БИРЖА ЗАКРЫТА • ПОСЛЕДНИЕ ${mskTimeStr()} МСК`;
    statusEl.className = `rates-status ${trading ? 'live' : 'closed'}`;
  }

  board.innerHTML = '';

  WANTED.forEach((w, i) => {
    const r = rates[w.secid];
    if (!r || !r.price) {
      // Заглушка если данных нет
      const empty = document.createElement('div');
      empty.className = 'rate-card rate-flat';
      empty.innerHTML = `
        <div class="rate-header">
          <span class="rate-flag">${w.flag}</span>
          <span class="rate-label">${w.label}</span>
        </div>
        <div class="rate-price" style="color:var(--text-muted)">—</div>
        <div class="rate-change flat"><span class="rate-pct" style="color:var(--text-muted)">НЕТ ДАННЫХ</span></div>
      `;
      board.appendChild(empty);
      return;
    }

    const decimals  = w.secid === 'GLDRUB_TOM' ? 2 : 4;
    const dir       = getDir(r.ltp);
    const icon      = getDirIcon(dir);

    // Изменение: используем ltp (абс. к пред. закрытию) если есть,
    // иначе считаем от open
    let absChange = r.ltp;
    let pctChange = null;
    if (absChange != null && r.price) {
      const prevClose = r.price - absChange;
      pctChange = prevClose !== 0 ? (absChange / prevClose) * 100 : null;
    } else if (r.open && r.price) {
      absChange = r.price - r.open;
      pctChange = calcPct(r.price, r.open);
    }

    const pctStr = pctChange != null
      ? `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`
      : '—';
    const absStr = absChange != null
      ? `${absChange >= 0 ? '+' : ''}${Number(absChange).toFixed(decimals)}`
      : '';

    const card = document.createElement('div');
    card.className = `rate-card rate-${dir}`;
    card.style.animationDelay = `${i * 0.08}s`;
    card.innerHTML = `
      <div class="rate-header">
        <span class="rate-flag">${w.flag}</span>
        <span class="rate-label">${w.label}</span>
        <span class="rate-dir-icon">${icon}</span>
      </div>
      <div class="rate-price">${fmt(r.price, decimals)}</div>
      <div class="rate-change ${dir}">
        <span class="rate-pct">${pctStr}</span>
        <span class="rate-abs">${absStr}</span>
      </div>
      <div class="rate-details">
        ${r.bid   ? `<span class="rate-detail"><span class="rd-label">BID</span><span class="rd-val">${fmt(r.bid, decimals)}</span></span>` : ''}
        ${r.offer ? `<span class="rate-detail"><span class="rd-label">ASK</span><span class="rd-val">${fmt(r.offer, decimals)}</span></span>` : ''}
        ${r.low   ? `<span class="rate-detail"><span class="rd-label">LOW</span><span class="rd-val">${fmt(r.low, decimals)}</span></span>` : ''}
        ${r.high  ? `<span class="rate-detail"><span class="rd-label">HIGH</span><span class="rd-val">${fmt(r.high, decimals)}</span></span>` : ''}
      </div>
    `;
    board.appendChild(card);
  });

  if (board.children.length === 0) {
    board.innerHTML = `<div class="rates-no-data">Данные временно недоступны (рынок закрыт или нет связи с MOEX ISS).</div>`;
  }
}

// ── Update cycle ──────────────────────────────────────────────
let retryCount = 0;

async function updateRates() {
  const trading = isTradingHours();
  try {
    const rates = await fetchRates();
    renderWidget(rates, trading);
    updateNavTicker(rates);
    lastRates = { ...lastRates, ...rates };
    retryCount = 0;
  } catch (err) {
    retryCount++;
    console.warn('[MOEX rates] fetch error:', err.message);
    if (Object.keys(lastRates).length > 0) {
      renderWidget(lastRates, false);
    } else {
      const board    = document.getElementById('rates-board');
      const statusEl = document.getElementById('rates-status');
      if (board)    board.innerHTML = `<div class="rates-no-data">⚠ MOEX ISS временно недоступен. Повтор через ${retryCount < 3 ? 30 : 60} сек.</div>`;
      if (statusEl) { statusEl.textContent = 'ОШИБКА СОЕДИНЕНИЯ'; statusEl.className = 'rates-status closed'; }
    }
  }
}

// ── Init ──────────────────────────────────────────────────────
function initRates() {
  if (!document.getElementById('rates-widget')) return;

  updateRates();

  function scheduleNext() {
    const delay = isTradingHours() ? 30000 : 300000;
    setTimeout(async () => { await updateRates(); scheduleNext(); }, delay);
  }
  scheduleNext();
}

document.addEventListener('DOMContentLoaded', initRates);
