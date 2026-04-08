/**
 * market-map.js — MOEX IMOEX heatmap (squarified treemap)
 *
 * Data: MOEX ISS public API (CORS-friendly)
 *   1) IMOEX index composition + weights
 *   2) TQBR board marketdata (prices, % change)
 */

(function () {
  'use strict';

  var ANALYTICS_URL =
    'https://iss.moex.com/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json' +
    '?iss.meta=off&limit=100&analytics.columns=ticker,shortnames,weight';

  var MARKETDATA_URL =
    'https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json' +
    '?iss.meta=off&iss.only=securities,marketdata' +
    '&securities.columns=SECID,SHORTNAME' +
    '&marketdata.columns=SECID,LAST,LASTTOPREVPRICE,VALTODAY';

  var SECTORS = {
    'Нефть и газ':       ['LKOH','ROSN','GAZP','NVTK','TATN','TATNP','SNGS','SNGSP','TRNFP'],
    'Банки и финансы':   ['SBER','SBERP','VTBR','CBOM','BSPB','SVCB','MOEX','RENI','DOMRF'],
    'Металлы и добыча':  ['GMKN','NLMK','CHMF','MAGN','RUAL','ALRS','PLZL','UGLD','ENPG'],
    'Технологии':        ['YDEX','OZON','HEAD','VKCO','POSI','CNRU','T'],
    'Потребительский':   ['X5','LENT','PIKK','MDMG'],
    'Инфраструктура':    ['MTSS','RTKM','IRAO','MSNG','AFLT','FLOT','AFKS','PHOR']
  };

  var mmTimer   = null;
  var lastData  = null;
  var container = null;
  var statusEl  = null;
  var tooltip   = null;

  // ── MSK helpers (same logic as moex-rates.js) ──────────────────
  function getMsk() {
    var now = new Date();
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 3 * 3600000);
  }
  function isTradingHours() {
    var m = getMsk(), t = m.getHours() * 60 + m.getMinutes();
    return t >= 600 && t < 1430;
  }
  function mskTimeStr() {
    return getMsk().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }

  function fetchTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Timeout')); }, ms);
      fetch(url)
        .then(function (r) { clearTimeout(timer); resolve(r); })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  // ── Color scale ────────────────────────────────────────────────
  var STOPS = [
    { pct: -5, r: 183, g: 28,  b: 28  },
    { pct: -3, r: 229, g: 57,  b: 53  },
    { pct: -1, r: 239, g: 83,  b: 80  },
    { pct:  0, r: 55,  g: 71,  b: 79  },
    { pct:  1, r: 102, g: 187, b: 106 },
    { pct:  3, r: 67,  g: 160, b: 71  },
    { pct:  5, r: 46,  g: 125, b: 50  }
  ];

  function getChangeColor(pct) {
    if (pct == null || isNaN(pct)) return 'rgb(55,71,79)';
    if (pct <= STOPS[0].pct) return 'rgb(' + STOPS[0].r + ',' + STOPS[0].g + ',' + STOPS[0].b + ')';
    if (pct >= STOPS[STOPS.length - 1].pct) {
      var s = STOPS[STOPS.length - 1];
      return 'rgb(' + s.r + ',' + s.g + ',' + s.b + ')';
    }
    for (var i = 0; i < STOPS.length - 1; i++) {
      var a = STOPS[i], b = STOPS[i + 1];
      if (pct >= a.pct && pct <= b.pct) {
        var t = (pct - a.pct) / (b.pct - a.pct);
        var r = Math.round(a.r + (b.r - a.r) * t);
        var g = Math.round(a.g + (b.g - a.g) * t);
        var bl = Math.round(a.b + (b.b - a.b) * t);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
      }
    }
    return 'rgb(55,71,79)';
  }

  // ── Squarified treemap ─────────────────────────────────────────
  function squarify(items, rect) {
    if (!items.length) return [];
    var result = [];
    layoutStrip(items.slice().sort(function (a, b) { return b.weight - a.weight; }),
                rect, result);
    return result;
  }

  function layoutStrip(items, rect, out) {
    if (items.length === 0) return;
    if (items.length === 1) {
      items[0].x = rect.x; items[0].y = rect.y;
      items[0].w = rect.w; items[0].h = rect.h;
      out.push(items[0]);
      return;
    }

    var totalWeight = 0;
    for (var i = 0; i < items.length; i++) totalWeight += items[i].weight;

    var shorter = Math.min(rect.w, rect.h);
    var strip = [items[0]];
    var stripWeight = items[0].weight;
    var bestRatio = worstRatio(strip, stripWeight, totalWeight, shorter);

    for (var j = 1; j < items.length; j++) {
      var nextStrip = strip.concat(items[j]);
      var nextStripWeight = stripWeight + items[j].weight;
      var nextRatio = worstRatio(nextStrip, nextStripWeight, totalWeight, shorter);
      if (nextRatio >= bestRatio) break;
      strip = nextStrip;
      stripWeight = nextStripWeight;
      bestRatio = nextRatio;
    }

    var frac = stripWeight / totalWeight;
    var stripRect, remaining;

    if (rect.w >= rect.h) {
      var sw = rect.w * frac;
      stripRect = { x: rect.x, y: rect.y, w: sw, h: rect.h };
      remaining = { x: rect.x + sw, y: rect.y, w: rect.w - sw, h: rect.h };
    } else {
      var sh = rect.h * frac;
      stripRect = { x: rect.x, y: rect.y, w: rect.w, h: sh };
      remaining = { x: rect.x, y: rect.y + sh, w: rect.w, h: rect.h - sh };
    }

    placeStrip(strip, stripRect, out);
    layoutStrip(items.slice(strip.length), remaining, out);
  }

  function placeStrip(strip, rect, out) {
    var total = 0;
    for (var i = 0; i < strip.length; i++) total += strip[i].weight;
    var offset = 0;

    for (var j = 0; j < strip.length; j++) {
      var frac = strip[j].weight / total;
      if (rect.w >= rect.h) {
        strip[j].x = rect.x;
        strip[j].y = rect.y + offset;
        strip[j].w = rect.w;
        strip[j].h = rect.h * frac;
        offset += strip[j].h;
      } else {
        strip[j].x = rect.x + offset;
        strip[j].y = rect.y;
        strip[j].w = rect.w * frac;
        strip[j].h = rect.h;
        offset += strip[j].w;
      }
      out.push(strip[j]);
    }
  }

  function worstRatio(strip, stripWeight, totalWeight, shorter) {
    var area = shorter * shorter * (stripWeight / totalWeight);
    var worst = 0;
    for (var i = 0; i < strip.length; i++) {
      var itemArea = area * (strip[i].weight / stripWeight);
      var side = Math.sqrt(itemArea);
      var other = itemArea / side;
      var ratio = Math.max(side / other, other / side);
      if (ratio > worst) worst = ratio;
    }
    return worst;
  }

  // ── Sector lookup ──────────────────────────────────────────────
  function getSector(ticker) {
    for (var name in SECTORS) {
      if (SECTORS[name].indexOf(ticker) !== -1) return name;
    }
    return 'Прочее';
  }

  // ── Fetch & merge ──────────────────────────────────────────────
  async function fetchMapData() {
    var responses = await Promise.all([
      fetchTimeout(ANALYTICS_URL + '&_=' + Date.now(), 10000).then(function (r) { return r.json(); }),
      fetchTimeout(MARKETDATA_URL + '&_=' + Date.now(), 10000).then(function (r) { return r.json(); })
    ]);

    var analytics = responses[0].analytics.data;
    var securities = responses[1].securities.data;
    var secCols = responses[1].securities.columns;
    var marketdata = responses[1].marketdata.data;
    var mdCols = responses[1].marketdata.columns;

    var nameMap = {};
    var iSec0 = secCols.indexOf('SECID');
    var iName = secCols.indexOf('SHORTNAME');
    for (var s = 0; s < securities.length; s++) {
      nameMap[securities[s][iSec0]] = securities[s][iName];
    }

    var priceMap = {};
    var iSec1 = mdCols.indexOf('SECID');
    var iLast = mdCols.indexOf('LAST');
    var iChg  = mdCols.indexOf('LASTTOPREVPRICE');
    var iVol  = mdCols.indexOf('VALTODAY');
    for (var m = 0; m < marketdata.length; m++) {
      var row = marketdata[m];
      priceMap[row[iSec1]] = {
        last:   row[iLast],
        change: row[iChg],
        volume: row[iVol]
      };
    }

    var items = [];
    for (var a = 0; a < analytics.length; a++) {
      var ticker = analytics[a][0];
      var shortname = analytics[a][1];
      var weight = analytics[a][2];
      var md = priceMap[ticker] || {};
      items.push({
        ticker:    ticker,
        name:      nameMap[ticker] || shortname,
        weight:    weight,
        last:      md.last,
        change:    md.change,
        volume:    md.volume,
        sector:    getSector(ticker)
      });
    }

    return items;
  }

  // ── Format helpers ─────────────────────────────────────────────
  function fmtPrice(v) {
    if (v == null || v === 0) return '—';
    return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }
  function fmtVolume(v) {
    if (!v) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + ' млрд ₽';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + ' млн ₽';
    return Number(v).toLocaleString('ru-RU') + ' ₽';
  }
  function fmtChange(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  }

  // ── Render ─────────────────────────────────────────────────────
  function renderMap(items) {
    if (!container) return;

    var cw = container.clientWidth;
    var ch = container.clientHeight;
    if (!cw || !ch) return;

    container.innerHTML = '';

    var sectorGroups = {};
    var sectorOrder = Object.keys(SECTORS).concat(['Прочее']);
    for (var i = 0; i < items.length; i++) {
      var sec = items[i].sector;
      if (!sectorGroups[sec]) sectorGroups[sec] = { weight: 0, items: [] };
      sectorGroups[sec].weight += items[i].weight;
      sectorGroups[sec].items.push(items[i]);
    }

    var sectorList = [];
    for (var k = 0; k < sectorOrder.length; k++) {
      var sn = sectorOrder[k];
      if (sectorGroups[sn]) {
        sectorList.push({ name: sn, weight: sectorGroups[sn].weight, items: sectorGroups[sn].items });
      }
    }

    var sectorRects = squarify(sectorList, { x: 0, y: 0, w: cw, h: ch });

    for (var si = 0; si < sectorRects.length; si++) {
      var sr = sectorRects[si];
      var sectorDiv = document.createElement('div');
      sectorDiv.className = 'mm-sector';
      sectorDiv.style.cssText =
        'position:absolute;left:' + sr.x + 'px;top:' + sr.y + 'px;' +
        'width:' + sr.w + 'px;height:' + sr.h + 'px;';

      var label = document.createElement('span');
      label.className = 'mm-sector-label';
      label.textContent = sr.name;
      if (sr.w < 100 || sr.h < 40) label.style.display = 'none';
      sectorDiv.appendChild(label);

      var pad = 1;
      var innerRect = { x: 0, y: 0, w: sr.w - pad * 2, h: sr.h - pad * 2 };
      var cellRects = squarify(sr.items, innerRect);

      for (var ci = 0; ci < cellRects.length; ci++) {
        var cr = cellRects[ci];
        var cell = document.createElement('a');
        cell.className = 'mm-cell';
        cell.href = 'https://www.moex.com/ru/issue.aspx?board=TQBR&code=' + cr.ticker;
        cell.target = '_blank';
        cell.rel = 'noopener';
        cell.style.cssText =
          'left:' + (cr.x + pad) + 'px;top:' + (cr.y + pad) + 'px;' +
          'width:' + (cr.w - 1) + 'px;height:' + (cr.h - 1) + 'px;' +
          'background:' + getChangeColor(cr.change) + ';';

        cell.dataset.ticker = cr.ticker;
        cell.dataset.name = cr.name;
        cell.dataset.last = cr.last || '';
        cell.dataset.change = cr.change != null ? cr.change : '';
        cell.dataset.volume = cr.volume || '';
        cell.dataset.sector = cr.sector;

        var cellW = cr.w - 1;
        var cellH = cr.h - 1;
        var html = '';

        if (cellW > 35 && cellH > 20) {
          var fontSize = Math.min(Math.max(cellW / 6, 9), 18);
          html += '<span class="mm-ticker" style="font-size:' + fontSize + 'px">' + cr.ticker + '</span>';
        }
        if (cellW > 60 && cellH > 35) {
          html += '<span class="mm-change">' + fmtChange(cr.change) + '</span>';
        }
        if (cellW > 90 && cellH > 50) {
          html += '<span class="mm-name">' + cr.name + '</span>';
        }

        cell.innerHTML = html;
        sectorDiv.appendChild(cell);
      }

      container.appendChild(sectorDiv);
    }
  }

  // ── Tooltip ────────────────────────────────────────────────────
  function showTooltip(e) {
    var cell = e.target.closest('.mm-cell');
    if (!cell || !tooltip) return;

    var d = cell.dataset;
    tooltip.innerHTML =
      '<div class="mm-tt-head">' +
        '<strong>' + d.ticker + '</strong>' +
        '<span class="mm-tt-sector">' + d.sector + '</span>' +
      '</div>' +
      '<div class="mm-tt-name">' + d.name + '</div>' +
      '<div class="mm-tt-row"><span>Цена</span><span>' + fmtPrice(d.last) + '</span></div>' +
      '<div class="mm-tt-row"><span>Изм.</span><span class="' +
        (Number(d.change) > 0 ? 'mm-up' : Number(d.change) < 0 ? 'mm-down' : '') + '">' +
        fmtChange(Number(d.change)) + '</span></div>' +
      '<div class="mm-tt-row"><span>Объём</span><span>' + fmtVolume(Number(d.volume)) + '</span></div>';

    tooltip.classList.add('mm-tt-visible');
    positionTooltip(e);
  }

  function positionTooltip(e) {
    if (!tooltip) return;
    var cx = container.getBoundingClientRect();
    var tx = e.clientX - cx.left + 12;
    var ty = e.clientY - cx.top + 12;
    var tw = tooltip.offsetWidth;
    var th = tooltip.offsetHeight;
    if (tx + tw > cx.width - 4) tx = e.clientX - cx.left - tw - 8;
    if (ty + th > cx.height - 4) ty = e.clientY - cx.top - th - 8;
    tooltip.style.left = tx + 'px';
    tooltip.style.top  = ty + 'px';
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove('mm-tt-visible');
  }

  // ── Status ─────────────────────────────────────────────────────
  function setStatus(text, live) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'rates-status ' + (live ? 'live' : 'closed');
  }

  // ── Update cycle ───────────────────────────────────────────────
  async function updateMap() {
    var trading = isTradingHours();
    try {
      var items = await fetchMapData();
      lastData = items;
      renderMap(items);
      setStatus(
        (trading ? '● ОБНОВЛЕНО ' : '○ БИРЖА ЗАКРЫТА · ') + mskTimeStr() + ' МСК',
        trading
      );
    } catch (err) {
      console.warn('[Market Map] error:', err.message);
      if (lastData) {
        renderMap(lastData);
        setStatus('⚠ УСТАРЕВШИЕ ДАННЫЕ · ' + mskTimeStr() + ' МСК', false);
      } else {
        if (container) container.innerHTML = '<div class="mm-no-data">⚠ MOEX ISS временно недоступен</div>';
        setStatus('НАРУШЕНИЕ СВЯЗИ', false);
      }
    }
  }

  function scheduleMapUpdate() {
    var delay = isTradingHours() ? 30000 : 300000;
    mmTimer = setTimeout(function () {
      updateMap().then(scheduleMapUpdate);
    }, delay);
  }

  // ── Resize handling ────────────────────────────────────────────
  var resizeTimeout;
  function onResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function () {
      if (lastData) renderMap(lastData);
    }, 200);
  }

  // ── Init ───────────────────────────────────────────────────────
  function initMarketMap() {
    container = document.getElementById('mm-container');
    statusEl  = document.getElementById('mm-status');
    if (!container) return;

    tooltip = document.createElement('div');
    tooltip.className = 'mm-tooltip';
    container.appendChild(tooltip);

    container.addEventListener('mousemove', function (e) {
      if (e.target.closest('.mm-cell')) { showTooltip(e); }
      else { hideTooltip(); }
    });
    container.addEventListener('mouseleave', hideTooltip);

    window.addEventListener('resize', onResize);
    updateMap().then(scheduleMapUpdate);
  }

  document.addEventListener('DOMContentLoaded', initMarketMap);
})();
