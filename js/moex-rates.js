/**
 * moex-rates.js — Live MOEX ISS currency rates widget
 *
 * Endpoint: CETS board securities marketdata (batch, public CORS)
 * Confirmed CORS: Access-Control-Allow-Origin: * from MOEX ISS
 */

const CETS_URL =
  'https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities.json' +
  '?iss.meta=off&iss.only=marketdata' +
  '&securities=USD000UTSTOM,EUR_RUB__TOM,CNYRUB_TOM,GLDRUB_TOM';

const WANTED = [
  { secid: 'USD000UTSTOM', label: 'USD/₽', flag: '🇺🇸', dec: 4 },
  { secid: 'EUR_RUB__TOM', label: 'EUR/₽', flag: '🇪🇺', dec: 4 },
  { secid: 'CNYRUB_TOM',   label: 'CNY/₽', flag: '🇨🇳', dec: 4 },
  { secid: 'GLDRUB_TOM',   label: 'XAU/₽', flag: '🥇', dec: 2 },
];

let lastRates  = {};
let ratesTimer = null;

// ── MSK helpers ───────────────────────────────────────────────
function getMsk() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000);
}
function isTradingHours() {
  const m = getMsk(), t = m.getHours() * 60 + m.getMinutes();
  return t >= 600 && t < 1430;
}
function mskTimeStr() {
  return getMsk().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Safe fetch with timeout (works everywhere) ────────────────
function fetchWithTimeout(url, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + ms + 'ms')), ms);
    fetch(url)
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// ── Number fmt ────────────────────────────────────────────────
function fmt(val, dec) {
  if (val == null || val === 0 || isNaN(val)) return '—';
  return Number(val).toLocaleString('ru-RU', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// ── Fetch rates ───────────────────────────────────────────────
async function fetchRates() {
  const res = await fetchWithTimeout(CETS_URL + '&_=' + Date.now(), 10000);
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const json = await res.json();
  const md   = json && json.marketdata;
  if (!md || !md.columns || !md.data) throw new Error('Нет данных marketdata');

  const cols = md.columns;
  const data = md.data;

  // Safe column index getter
  const col = name => cols.indexOf(name);

  const iSecid = col('SECID');
  const iWap   = col('WAPRICE');
  const iLast  = col('LAST');
  const iMp    = col('MARKETPRICE');
  const iOpen  = col('OPEN');
  const iHigh  = col('HIGH');
  const iLow   = col('LOW');
  const iBid   = col('BID');
  const iOffer = col('OFFER');
  const iLtp   = col('LASTTOPREVPRICE');   // абс. изм. к пред. закрытию
  const iWatp  = col('WAPTOPREVWAPRICE');  // абс. изм. WAP

  const rates = {};
  data.forEach(function(row) {
    const secid = iSecid >= 0 ? row[iSecid] : null;
    if (!secid) return;

    // Price: prefer WAPRICE, then LAST, then MARKETPRICE
    const price = (iWap >= 0 && row[iWap])
      ? row[iWap]
      : (iLast >= 0 && row[iLast])
        ? row[iLast]
        : (iMp >= 0 && row[iMp])
          ? row[iMp]
          : null;

    // Change vs prev close: prefer LASTTOPREVPRICE, then WAPTOPREVWAPRICE
    const change = (iLtp >= 0 && row[iLtp] != null && row[iLtp] !== 0)
      ? row[iLtp]
      : (iWatp >= 0 && row[iWatp] != null && row[iWatp] !== 0)
        ? row[iWatp]
        : null;

    rates[secid] = {
      secid,
      price,
      open:   iOpen  >= 0 ? row[iOpen]  : null,
      high:   iHigh  >= 0 ? row[iHigh]  : null,
      low:    iLow   >= 0 ? row[iLow]   : null,
      bid:    iBid   >= 0 ? row[iBid]   : null,
      offer:  iOffer >= 0 ? row[iOffer] : null,
      change,
    };
  });

  return rates;
}

// ── Render ────────────────────────────────────────────────────
function renderWidget(rates, trading) {
  const board    = document.getElementById('rates-board');
  const statusEl = document.getElementById('rates-status');
  if (!board) return;

  if (statusEl) {
    if (trading) {
      statusEl.textContent = '● ОБНОВЛЕНО ' + mskTimeStr() + ' МСК';
      statusEl.className   = 'rates-status live';
    } else {
      statusEl.textContent = '○ БИРЖА ЗАКРЫТА · ДАННЫЕ НА ' + mskTimeStr() + ' МСК';
      statusEl.className   = 'rates-status closed';
    }
  }

  board.innerHTML = '';

  WANTED.forEach(function(w, i) {
    const r = rates[w.secid];

    // No data card
    if (!r || !r.price) {
      const empty = document.createElement('div');
      empty.className = 'rate-card rate-flat';
      empty.innerHTML =
        '<div class="rate-header">' +
          '<span class="rate-flag">' + w.flag + '</span>' +
          '<span class="rate-label">' + w.label + '</span>' +
        '</div>' +
        '<div class="rate-price" style="color:var(--text-muted)">—</div>' +
        '<div class="rate-change flat"><span class="rate-pct" style="font-size:0.6rem;color:var(--text-muted)">НЕТ ДАННЫХ</span></div>';
      board.appendChild(empty);
      return;
    }

    const dec = w.dec;
    const ch  = r.change;
    const dir = ch == null ? 'flat' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat';
    const icon = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●';

    // % change
    let pctStr = '—', absStr = '';
    if (ch != null && r.price) {
      const prevClose = r.price - ch;
      if (prevClose && prevClose !== 0) {
        const pct = (ch / prevClose) * 100;
        pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        absStr = (ch >= 0 ? '+' : '') + Number(ch).toFixed(dec);
      }
    }

    const card = document.createElement('div');
    card.className = 'rate-card rate-' + dir;
    card.style.animationDelay = (i * 0.08) + 's';

    var details = '';
    if (r.bid)   details += '<span class="rate-detail"><span class="rd-label">BID</span><span class="rd-val">' + fmt(r.bid, dec) + '</span></span>';
    if (r.offer) details += '<span class="rate-detail"><span class="rd-label">ASK</span><span class="rd-val">' + fmt(r.offer, dec) + '</span></span>';
    if (r.low)   details += '<span class="rate-detail"><span class="rd-label">LOW</span><span class="rd-val">' + fmt(r.low, dec) + '</span></span>';
    if (r.high)  details += '<span class="rate-detail"><span class="rd-label">HIGH</span><span class="rd-val">' + fmt(r.high, dec) + '</span></span>';

    card.innerHTML =
      '<div class="rate-header">' +
        '<span class="rate-flag">' + w.flag + '</span>' +
        '<span class="rate-label">' + w.label + '</span>' +
        '<span class="rate-dir-icon">' + icon + '</span>' +
      '</div>' +
      '<div class="rate-price">' + fmt(r.price, dec) + '</div>' +
      '<div class="rate-change ' + dir + '">' +
        '<span class="rate-pct">' + pctStr + '</span>' +
        '<span class="rate-abs">' + absStr + '</span>' +
      '</div>' +
      '<div class="rate-details">' + details + '</div>';

    board.appendChild(card);
  });

  if (board.children.length === 0) {
    board.innerHTML = '<div class="rates-no-data">Данные временно недоступны (рынок закрыт или нет связи).</div>';
  }
}

function updateNavTicker(rates) {
  const ticker = document.getElementById('market-ticker');
  if (!ticker) return;
  var parts = [];
  WANTED.forEach(function(w) {
    var r = rates[w.secid];
    if (!r || !r.price) return;
    var dir = !r.change ? '●' : r.change > 0 ? '▲' : '▼';
    parts.push(w.label + ' ' + fmt(r.price, w.dec) + ' ' + dir);
  });
  if (parts.length) {
    var text = parts.join('  ⬥  ') + '  ⬥  MOEX';
    ticker.textContent = text + '  ⬥  ' + text + '  ⬥  ';
  }
}

// ── Update cycle ──────────────────────────────────────────────
var retryCount = 0;

async function updateRates() {
  var trading = isTradingHours();
  try {
    var rates = await fetchRates();
    renderWidget(rates, trading);
    updateNavTicker(rates);
    // merge into lastRates
    for (var k in rates) lastRates[k] = rates[k];
    retryCount = 0;
  } catch (err) {
    retryCount++;
    console.warn('[MOEX rates] error:', err.message);
    var board    = document.getElementById('rates-board');
    var statusEl = document.getElementById('rates-status');
    if (Object.keys(lastRates).length > 0) {
      // Show stale data with closed indicator
      renderWidget(lastRates, false);
      if (statusEl) {
        statusEl.textContent = '⚠ УСТАРЕВШИЕ ДАННЫЕ · ' + mskTimeStr() + ' МСК';
        statusEl.className = 'rates-status closed';
      }
    } else {
      if (board)    board.innerHTML = '<div class="rates-no-data">⚠ MOEX ISS временно недоступен. Страница обновится автоматически.</div>';
      if (statusEl) { statusEl.textContent = 'НАРУШЕНИЕ СВЯЗИ'; statusEl.className = 'rates-status closed'; }
    }
  }
}

function scheduleUpdate() {
  var delay = isTradingHours() ? 30000 : 300000;
  ratesTimer = setTimeout(function() {
    updateRates().then(scheduleUpdate);
  }, delay);
}

function initRates() {
  if (!document.getElementById('rates-widget')) return;
  updateRates().then(scheduleUpdate);
}

document.addEventListener('DOMContentLoaded', initRates);
