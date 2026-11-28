'use strict';
const $ = id => document.getElementById(id);
const REST = 'https://data-api.binance.vision/api/v3/klines';
const WS = 'wss://data-stream.binance.vision/stream?streams=';
const CRYPTO = ['BTCUSDT', 'ETHUSDT'];
const SYMBOLS = [...CRYPTO, 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURJPY', 'GBPJPY'];
// label: [Binance interval, TradingView interval, seconds]
const TF = {'1m':['1m','1',60],'5m':['5m','5',300],'15m':['15m','15',900],'30m':['30m','30',1800],'1H':['1h','60',3600],'4H':['4h','240',14400],'1D':['1d','D',86400],'1W':['1w','W',604800]};
const IND = ['EMA 20','SMA 50','Bollinger','RSI','MACD','ATR','Volume','VWAP'];
const EAT = 10800; // chart times are shifted to UTC+3

const load = (k, d) => { try { return JSON.parse(localStorage.getItem('mc.' + k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem('mc.' + k, JSON.stringify(v)); } catch {} };

let sym = load('sym', 'BTCUSDT'), tf = load('tf', '1H');
let favs = load('favs', []), on = load('ind', ['Volume']), drawings = load('draw', {}), alerts = load('alerts', []);
let bars = [], chart, main, series = {}, ws, retry = 0, timer, lastMsg = 0, gen = 0, pending = null, audio, dirty = false;
const last = {};
const isCrypto = () => CRYPTO.includes(sym);

function status(text, cls = '') { $('status').textContent = text; $('status').className = cls; }

/* ---------- indicators ---------- */
const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, v) => s + v, 0) / n);
function ema(a, n, k = 2 / (n + 1)) { // seeded with the simple average
  let p = null, s = 0, c = 0;
  return a.map(v => {
    if (v == null) return null;
    if (p == null) { s += v; if (++c === n) p = s / n; }
    else p = v * k + p * (1 - k);
    return p;
  });
}
const rma = (a, n) => ema(a, n, 1 / n); // Wilder smoothing
function rsi(c) {
  const d = c.map((v, i) => i ? v - c[i - 1] : null);
  const g = rma(d.map(v => v == null ? null : Math.max(v, 0)), 14);
  const l = rma(d.map(v => v == null ? null : Math.max(-v, 0)), 14);
  return g.map((v, i) => v == null ? null : v + l[i] === 0 ? 50 : 100 * v / (v + l[i]));
}
function vwap() { // resets at 00:00 UTC (03:00 EAT); skips an incomplete first day
  let day, pv = 0, v = 0, skip = bars[0].t % 86400 ? Math.floor(bars[0].t / 86400) : -1;
  return bars.map(b => {
    const d = Math.floor(b.t / 86400);
    if (d !== day) { day = d; pv = v = 0; }
    pv += (b.high + b.low + b.close) / 3 * b.volume; v += b.volume;
    return d === skip || !v ? null : pv / v;
  });
}

/* ---------- own chart (crypto) ---------- */
const points = a => bars.map((b, i) => a[i] == null ? { time: b.t + EAT } : { time: b.t + EAT, value: a[i] });

function buildChart() {
  if (chart) chart.remove();
  const L = LightweightCharts;
  chart = L.createChart($('chart'), { autoSize: true,
    layout: { background: { color: '#0f1620' }, textColor: '#8a9bb0', attributionLogo: true },
    grid: { vertLines: { color: '#1b2736' }, horzLines: { color: '#1b2736' } },
    crosshair: { mode: 0 }, timeScale: { timeVisible: TF[tf][2] < 86400 } });
  const type = $('type').value;
  main = chart.addSeries(type === 'candle' ? L.CandlestickSeries : type === 'line' ? L.LineSeries : L.AreaSeries,
    type === 'candle' ? { upColor: '#2bb3a3', downColor: '#ef6461', wickUpColor: '#2bb3a3', wickDownColor: '#ef6461', borderVisible: false }
      : { color: '#e0a93b', lineColor: '#e0a93b', topColor: '#e0a93b55', bottomColor: '#e0a93b00' });
  series = {};
  let pane = 0;
  const add = (key, color, p = 0, kind = L.LineSeries, extra = {}) =>
    series[key] = chart.addSeries(kind, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: p > 0, title: p ? key : '', ...extra }, p);
  if (on.includes('EMA 20')) add('ema', '#5aa9ff');
  if (on.includes('SMA 50')) add('sma', '#c58cff');
  if (on.includes('Bollinger')) ['bu', 'bm', 'bl'].forEach(k => add(k, '#6f879f'));
  if (on.includes('VWAP') && TF[tf][2] < 86400) add('vwap', '#ffffff');
  if (on.includes('Volume')) {
    add('vol', '#456', 0, L.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' } });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  }
  if (on.includes('RSI')) add('RSI', '#c58cff', ++pane);
  if (on.includes('MACD')) { pane++; add('Hist', '#456', pane, L.HistogramSeries); add('MACD', '#5aa9ff', pane); add('Signal', '#e0a93b', pane); }
  if (on.includes('ATR')) add('ATR', '#2bb3a3', ++pane);
  chart.panes().forEach((p, i) => p.setStretchFactor(i ? 1 : 3));
  chart.subscribeClick(onClick);
  paint(true);
}
const priceRow = b => $('type').value === 'candle' ? { time: b.t + EAT, open: b.open, high: b.high, low: b.low, close: b.close } : { time: b.t + EAT, value: b.close };

function paint(all) {
  if (!chart || !bars.length) return;
  if (all) main.setData(bars.map(priceRow));
  const c = bars.map(b => b.close), set = (k, a) => series[k] && series[k].setData(points(a));
  set('ema', ema(c, 20)); set('sma', sma(c, 50));
  if (series.bm) {
    const m = sma(c, 20);
    const sd = m.map((v, i) => v == null ? null : Math.sqrt(c.slice(i - 19, i + 1).reduce((s, x) => s + (x - v) ** 2, 0) / 20));
    set('bm', m); set('bu', m.map((v, i) => v == null ? null : v + 2 * sd[i])); set('bl', m.map((v, i) => v == null ? null : v - 2 * sd[i]));
  }
  if (series.vwap) set('vwap', vwap());
  if (series.vol) series.vol.setData(bars.map(b => ({ time: b.t + EAT, value: b.volume, color: b.close >= b.open ? '#2bb3a366' : '#ef646166' })));
  if (series.RSI) set('RSI', rsi(c));
  if (series.MACD) {
    const f = ema(c, 12), s = ema(c, 26), m = f.map((v, i) => s[i] == null ? null : v - s[i]), g = ema(m, 9);
    set('MACD', m); set('Signal', g); set('Hist', m.map((v, i) => g[i] == null ? null : v - g[i]));
  }
  if (series.ATR) set('ATR', rma(bars.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - c[i - 1]), Math.abs(b.low - c[i - 1])) : b.high - b.low), 14));
}

/* ---------- data ---------- */
const toBar = (t, o, h, l, c, v) => ({ t: t / 1000, open: +o, high: +h, low: +l, close: +c, volume: +v });

async function history() {
  const g = ++gen, s = sym;
  status('Loading', 'warn');
  try {
    const r = await fetch(`${REST}?symbol=${s}&interval=${TF[tf][0]}&limit=1000`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Binance returned HTTP ' + r.status);
    const rows = await r.json();
    if (g !== gen) return;
    bars = rows.map(k => toBar(k[0], k[1], k[2], k[3], k[4], k[5]));
    buildChart();
  } catch (e) {
    if (g !== gen) return;
    status('Error: ' + e.message + '. Retrying.', 'err');
    setTimeout(() => g === gen && isCrypto() && history(), 5000);
  }
}

function connect() {
  clearTimeout(timer);
  if (ws) { ws.onclose = null; ws.close(); }
  const streams = CRYPTO.map(s => s.toLowerCase() + '@miniTicker');
  if (isCrypto()) streams.push(`${sym.toLowerCase()}@kline_${TF[tf][0]}`);
  ws = new WebSocket(WS + streams.join('/'));
  lastMsg = Date.now();
  ws.onopen = () => { if (retry && isCrypto()) history(); retry = 0; };
  ws.onmessage = e => {
    const d = JSON.parse(e.data).data;
    lastMsg = Date.now();
    if (d.e === '24hrMiniTicker') {
      last[d.s] = +d.c; checkAlerts(d.s, +d.c);
      const el = document.querySelector(`[data-price="${d.s}"]`);
      if (el) el.textContent = (+d.c).toLocaleString('en', { maximumFractionDigits: 2 });
    } else if (d.e === 'kline' && d.s === sym && d.k.i === TF[tf][0] && chart && bars.length) {
      const k = d.k, b = toBar(k.t, k.o, k.h, k.l, k.c, k.v), end = bars[bars.length - 1];
      if (b.t < end.t) return;
      if (b.t - end.t > TF[tf][2]) return history(); // gap: reload
      b.t === end.t ? bars[bars.length - 1] = b : bars.push(b);
      main.update(priceRow(b)); dirty = true;
    }
  };
  ws.onclose = () => {
    const wait = Math.min(30, 2 ** retry++);
    if (isCrypto()) status(`Error: connection lost. Retrying in ${wait}s`, 'err');
    timer = setTimeout(connect, wait * 1000);
  };
}

setInterval(() => {
  if (dirty) { dirty = false; paint(false); }
  const age = (Date.now() - lastMsg) / 1000;
  if (age > 60 && ws && ws.readyState < 2) { retry = retry || 1; ws.close(); }
  if (!isCrypto() || !bars.length || !ws || ws.readyState !== 1) return;
  age < 15 ? status('Live', 'live') : status(`Delayed: no update for ${Math.round(age)}s`, 'warn');
}, 1000);

/* ---------- drawings ---------- */
function toLogical(t) {
  const n = bars.length, step = TF[tf][2];
  if (t <= bars[0].t) return (t - bars[0].t) / step;
  if (t >= bars[n - 1].t) return n - 1 + (t - bars[n - 1].t) / step;
  let i = 0; while (bars[i + 1].t <= t) i++;
  return i + (t - bars[i].t) / (bars[i + 1].t - bars[i].t);
}
function toTime(x) {
  const n = bars.length, i = Math.floor(x), step = TF[tf][2];
  if (x <= 0) return bars[0].t + x * step;
  if (x >= n - 1) return bars[n - 1].t + (x - n + 1) * step;
  return bars[i].t + (x - i) * (bars[i + 1].t - bars[i].t);
}
function xOf(t) {
  const ts = chart.timeScale(), l = toLogical(t), i = Math.floor(l);
  const a = ts.logicalToCoordinate(i), b = ts.logicalToCoordinate(i + 1);
  return a == null || b == null ? null : a + (l - i) * (b - a);
}
function onClick(p) {
  const kind = $('draw').value;
  if (!kind || !p.point || (p.paneIndex || 0) !== 0) return;
  const l = chart.timeScale().coordinateToLogical(p.point.x), price = main.coordinateToPrice(p.point.y);
  if (l == null || price == null) return;
  const pt = { t: toTime(l), p: price };
  if (kind !== 'h' && !pending) { pending = pt; status('Tap the second point', 'warn'); return; }
  (drawings[sym] ||= []).push({ kind, a: pending || pt, b: pt });
  pending = null; save('draw', drawings);
}
function overlay() {
  requestAnimationFrame(overlay);
  const cv = $('layer'), r = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
  const x = cv.getContext('2d');
  x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
  if (!chart || !bars.length || !isCrypto()) return;
  const W = chart.timeScale().width(), H = chart.panes()[0].getHeight();
  x.save(); x.beginPath(); x.rect(0, 0, W, H); x.clip();
  window.drawSats?.(x, W);
  x.strokeStyle = x.fillStyle = '#e0a93b'; x.font = '11px system-ui';
  const line = (a, b, c, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
  for (const d of drawings[sym] || []) {
    const y1 = main.priceToCoordinate(d.a.p), y2 = main.priceToCoordinate(d.b.p);
    if (y1 == null || y2 == null) continue;
    if (d.kind === 'h') { line(0, y1, W, y1); x.fillText(d.a.p.toFixed(2), 4, y1 - 3); continue; }
    const x1 = xOf(d.a.t), x2 = xOf(d.b.t);
    if (x1 == null || x2 == null) continue;
    if (d.kind === 't') line(x1, y1, x2, y2);
    if (d.kind === 'r') { x.strokeRect(x1, y1, x2 - x1, y2 - y1); x.globalAlpha = 0.12; x.fillRect(x1, y1, x2 - x1, y2 - y1); x.globalAlpha = 1; }
    if (d.kind === 'f') for (const f of [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]) {
      const price = d.b.p + (d.a.p - d.b.p) * f, y = main.priceToCoordinate(price);
      line(Math.min(x1, x2), y, Math.max(x1, x2), y); x.fillText(`${f}  ${price.toFixed(2)}`, Math.min(x1, x2) + 2, y - 2);
    }
  }
  x.restore();
}

/* ---------- alerts ---------- */
function unlockAudio() { try { audio ||= new AudioContext(); audio.resume(); } catch {} }
function beep() {
  if (!audio) return;
  [0, 0.35, 0.7].forEach(d => { const o = audio.createOscillator(); o.frequency.value = 880; o.connect(audio.destination); o.start(audio.currentTime + d); o.stop(audio.currentTime + d + 0.2); });
}
function checkAlerts(s, price) {
  const hit = alerts.filter(a => !a.done && a.sym === s && (a.up ? price >= a.price : price <= a.price));
  if (!hit.length) return;
  hit.forEach(a => a.done = true); save('alerts', alerts); showAlerts(); beep();
}
function showAlerts() {
  $('alerts').replaceChildren(...alerts.map(a => {
    const b = document.createElement('button');
    b.textContent = `${a.done ? 'Triggered: ' : 'Alert: '}${a.sym} ${a.up ? 'above' : 'below'} ${a.price} ✕`;
    if (a.done) b.className = 'on';
    b.onclick = () => { alerts = alerts.filter(x => x !== a); save('alerts', alerts); showAlerts(); };
    return b;
  }));
}

/* ---------- interface ---------- */
function showWidget() {
  const box = document.createElement('div');
  box.className = 'tradingview-widget-container'; box.style.cssText = 'height:100%;width:100%';
  box.innerHTML = `<div class="tradingview-widget-container__widget" style="height:calc(100% - 22px);width:100%"></div><div class="tradingview-widget-copyright" style="font-size:12px;height:22px;padding:2px 8px"><a href="https://www.tradingview.com/symbols/${sym}/" rel="noopener nofollow" target="_blank">${sym} chart by TradingView</a></div>`;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; s.async = true;
  s.textContent = JSON.stringify({ autosize: true, symbol: 'OANDA:' + sym, interval: TF[tf][1], timezone: 'Africa/Nairobi', theme: 'dark', style: '1', locale: 'en', hide_side_toolbar: false, allow_symbol_change: false, withdateranges: true });
  s.onerror = () => status('Error: TradingView widget did not load. Check internet or ad blocker.', 'err');
  box.append(s); $('tv').replaceChildren(box);
}
function show() {
  save('sym', sym); save('tf', tf); pending = null; gen++; bars = [];
  if (chart) { chart.remove(); chart = null; }
  const own = isCrypto();
  ['chart', 'layer', 'tools', 'alerts', 'credit'].forEach(id => $(id).hidden = !own);
  $('tv').hidden = own; $('tv').replaceChildren();
  $('name').textContent = sym + ' ' + tf;
  [...$('tfs').children].forEach(b => b.classList.toggle('on', b.textContent === tf));
  list();
  if (own) {
    if (window.LightweightCharts) history(); else status('Error: chart library did not load. Reload the page.', 'err');
  } else { status('Status shown by TradingView'); showWidget(); }
  retry = 0; connect();
}
function button(text, cls, click) { const b = document.createElement('button'); b.textContent = text; b.className = cls; b.onclick = click; return b; }
function list() {
  const q = $('search').value.toUpperCase().replace(/[^A-Z]/g, '');
  const shown = SYMBOLS.filter(s => s.includes(q)).sort((a, b) => favs.includes(b) - favs.includes(a));
  $('list').replaceChildren(...shown.map(s => {
    const li = document.createElement('li');
    const star = button(favs.includes(s) ? '★' : '☆', 'star', () => { favs = favs.includes(s) ? favs.filter(x => x !== s) : [...favs, s]; save('favs', favs); list(); });
    star.setAttribute('aria-label', 'Favourite ' + s);
    const pick = button(s, s === sym ? 'sym on' : 'sym', () => { sym = s; $('side').classList.remove('open'); show(); });
    const price = document.createElement('small'); price.dataset.price = s; price.textContent = last[s]?.toLocaleString('en') || '';
    pick.append(price); li.append(star, pick); return li;
  }));
}
Object.keys(TF).forEach(k => $('tfs').append(button(k, '', () => { tf = k; show(); })));
IND.forEach(n => {
  const b = button(n, on.includes(n) ? 'on' : '', () => {
    on = on.includes(n) ? on.filter(x => x !== n) : [...on, n]; save('ind', on); b.classList.toggle('on'); if (bars.length) buildChart();
  });
  $('inds').append(b);
});
$('type').onchange = () => bars.length && buildChart();
$('draw').onchange = () => pending = null;
$('undo').onclick = () => { drawings[sym]?.pop(); save('draw', drawings); };
$('clear').onclick = () => { if (confirm('Clear all drawings for ' + sym + '?')) { delete drawings[sym]; save('draw', drawings); } };
$('alert').onclick = () => {
  unlockAudio();
  const now = last[sym];
  if (!now) return status('Wait for a live price, then add the alert', 'warn');
  const price = Number(prompt(`Alert price for ${sym} (now ${now})`)?.replace(/,/g, ''));
  if (!(price > 0)) return;
  alerts.push({ sym, price, up: price > now }); save('alerts', alerts); showAlerts();
};
$('search').oninput = list;
$('menu').onclick = () => $('side').classList.add('open');
$('side').onclick = e => { if (e.target.tagName === 'H1') $('side').classList.remove('open'); };
$('full').onclick = () => {
  const m = $('main'), big = m.classList.toggle('max');
  $('full').textContent = big ? 'Exit full screen' : 'Full screen';
  if (big) m.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen();
};
document.onfullscreenchange = () => { if (!document.fullscreenElement) { $('main').classList.remove('max'); $('full').textContent = 'Full screen'; } };
document.addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('online', () => show());
addEventListener('offline', () => status('Error: you are offline', 'err'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastMsg > 15000) { retry = 1; connect(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (!SYMBOLS.includes(sym)) sym = 'BTCUSDT';
if (!TF[tf]) tf = '1H';
showAlerts(); show(); overlay();
