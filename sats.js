'use strict';
/* Partial JavaScript port of "Self-Aware Trend System" v1.17.3 by Willy | WillyAlgoTrader,
   using the script's default settings. Signals use closed candles only. */
const PRESETS = { Scalping: [10, 1.5, 14, 9, 1], Default: [14, 2, 20, 14, 1.5], Swing: [21, 2.5, 30, 21, 2], 'Crypto 24/7': [14, 2.8, 20, 14, 2.5] };
const cfg = { on: true, preset: 'Auto', dash: innerWidth > 760, sound: true, ...load('sats', {}) };

function satsCalc(B, tfSec, presetName, tick = 0.01) {
  const name = presetName !== 'Auto' ? presetName : tfSec <= 300 ? 'Scalping' : tfSec <= 14400 ? 'Default' : 'Swing';
  const [atrLen, base, erLen, rsiLen, slMult] = PRESETS[name];
  const clip = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const map = (v, a, b, c, d) => c + clip((v - a) / (b - a)) * (d - c);
  const sum = (a, i, n) => { let s = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++) s += a[j]; return s; };
  const C = B.map(b => b.close), diff = C.map((v, i) => i ? v - C[i - 1] : 0);
  const ATR = rma(B.map((b, i) => i ? Math.max(b.high - b.low, Math.abs(b.high - C[i - 1]), Math.abs(b.low - C[i - 1])) : b.high - b.low), atrLen);
  const gain = rma(diff.map((d, i) => i ? Math.max(d, 0) : null), rsiLen), loss = rma(diff.map((d, i) => i ? Math.max(-d, 0) : null), rsiLen);
  const abs = diff.map(Math.abs), ups = diff.map(d => d > 0 ? 1 : 0), downs = diff.map(d => d < 0 ? 1 : 0);
  const path = []; abs.reduce((s, v, i) => path[i] = s + v, 0);
  const warm = Math.max(50, atrLen + 98, rsiLen + 1, erLen, 20);
  const out = [], closed = []; let trade = null, last = null, pH, pL, start = 0, aM, pM, p = { trend: 1 }, p2 = { trend: 1 };
  for (let i = 0; i < B.length; i++) {
    const b = B[i], c = b.close, atr = ATR[i];
    const vol = sum(abs, i, erLen), er = i >= erLen && vol ? clip(Math.abs(c - C[i - erLen]) / vol) : 0;
    const baseAtr = i >= atrLen + 98 ? sum(ATR, i, 100) / 100 : null, ratio = baseAtr ? atr / baseAtr : 1;
    const tVol = ratio < 1 ? map(ratio, 0.5, 1, 0, 1) : map(ratio, 1.3, 2.2, 1, 0);
    let hi = -Infinity, lo = Infinity;
    for (let j = Math.max(0, i - 19); j <= i; j++) { hi = Math.max(hi, B[j].high); lo = Math.min(lo, B[j].low); }
    const pos = hi > lo ? (c - lo) / (hi - lo) : 0.5, up = sum(ups, i, 10) / 10, dn = sum(downs, i, 10) / 10;
    const change = i >= 10 ? c - C[i - 10] : 0, mom = change > 0 ? up : change < 0 ? dn : 0;
    const tqi = clip(er * 0.35 + tVol * 0.2 + clip(Math.abs(pos - 0.5) * 2) * 0.25 + mom * 0.2);
    const upPart = pos * 0.25 + up * 0.2, dnPart = (1 - pos) * 0.25 + dn * 0.2, net = i >= erLen ? c - C[i - erLen] : 0;
    const upQ = clip(((net > 0 ? er : 0) * 0.35 + upPart) / 0.8), dnQ = clip(((net < 0 ? er : 0) * 0.35 + dnPart) / 0.8);
    const sym0 = base * (0.6 + 0.4 * (0.6 + 0.8 * (1 - tqi) ** 1.5));
    const aRaw = sym0 * (1 - 0.15 * tqi), pRaw = sym0 * (1 + 0.2 * tqi);
    aM = aM == null ? aRaw : aM * 0.85 + aRaw * 0.15; pM = pM == null ? pRaw : pM * 0.85 + pRaw * 0.15;
    const prev = p.trend, o = { t: b.t, tqi, er, trend: prev };
    if (atr != null) {
      for (const [k, s, mult] of [['lo', 1, prev === 1 ? aM : pM], ['up', -1, prev === 1 ? pM : aM]]) {
        const width = mult * atr, raw = c - s * width, live = p.trend === s && p2.trend === s;
        const hold = p[k] != null && (C[i - 1] - p[k]) * s > 0 && (raw - p[k + 'Core']) * s <= 0;
        const core = hold ? p[k + 'Core'] : raw, anchor = hold && live ? p[k + 'W'] : width;
        const relax = live ? 0.5 * Math.max(0, width - anchor) : 0;
        o[k + 'Core'] = core; o[k + 'W'] = anchor;
        o[k] = s === 1 ? Math.max(raw, core - relax) : Math.min(raw, core + relax);
      }
    }
    const pUp = prev === -1 && p.up != null && c > p.up, pDn = prev === 1 && p.lo != null && c < p.lo;
    const side = prev === 1 ? upQ : dnQ, counter = prev === 1 ? dnQ : upQ;
    const cf = i - start >= 5 && counter > 0.55 && side < 0.25;
    const fUp = pUp || (cf && prev === -1 && c > C[i - 5]), fDn = pDn || (cf && prev === 1 && c < C[i - 5]);
    o.trend = i === 0 ? 1 : fUp ? 1 : fDn ? -1 : prev;
    const flip = o.trend !== prev; if (flip) start = i;
    const j = i - 3;
    if (j >= 3) {
      const near = B.slice(j - 3, i + 1);
      if (near.every((x, k) => k === 3 || x.high < B[j].high)) pH = { v: B[j].high, i: j };
      if (near.every((x, k) => k === 3 || x.low > B[j].low)) pL = { v: B[j].low, i: j };
    }
    const d = o.trend;
    // settle the open model trade first; the stop wins if one candle touches both
    if (trade && i > trade.i) {
      const t = trade, take = (price, f) => { t.r += f * t.side * (price - t.entry) / t.risk; t.left -= f; };
      const reach = n => t.side === 1 ? b.high >= t.tp[n] : b.low <= t.tp[n];
      let why = '';
      if (t.side === 1 ? b.low <= t.sl : b.high >= t.sl) { take(t.side === 1 ? Math.min(b.open, t.sl) : Math.max(b.open, t.sl), t.left); why = 'SL'; }
      else {
        for (const n of [0, 1]) if (!t.hit[n] && reach(n)) { t.hit[n] = true; take(t.tp[n], 1 / 3); t.event = { t: b.t, text: `TP${n + 1} hit` }; }
        if (reach(2)) { t.hit[2] = true; take(t.tp[2], t.left); why = 'TP3'; }
        else if (t.side !== d || i - t.i >= 100) { why = t.side !== d ? 'FLIP' : 'TIMEOUT'; take(c, t.left); }
      }
      if (why) { t.exit = why; t.event = { t: b.t, text: `${why} exit ${t.r.toFixed(2)}R` }; closed.push(t); trade = null; }
    }
    if (flip && i >= warm && i >= erLen) {
      const buy = d === 1, piv = buy ? pL : pH, ok = !!piv && i - piv.i <= 100 && (c - piv.v) * d > 0;
      const volumes = B.slice(i - 19, i + 1).map(x => x.volume), mean = volumes.reduce((a, v) => a + v, 0) / 20;
      const sd = Math.sqrt(volumes.reduce((a, v) => a + (v - mean) ** 2, 0) / 20);
      const rsiRaw = gain[i] + loss[i] ? 100 * gain[i] / (gain[i] + loss[i]) : 50, rs = buy ? rsiRaw : 100 - rsiRaw;
      const line = buy ? p.up : p.lo;
      const parts = map((c - C[i - 3]) * d / atr, 0.2, 1.5, 0, 17) + map(er, 0.1, 0.5, 0, 17) + (sd ? map((b.volume - mean) / sd, 0, 2, 0, 17) : 0)
        + map(rs, 45, 60, 0, 17) * map(rs, 65, 70, 1, 0) + (ok ? map(Math.abs(c - piv.v) / atr, 0, 1.5, 16, 6) : 0) + map(Math.max(0, (c - line) * d) / atr, 0, 1, 0, 16);
      o.signal = { side: d, score: 100 * parts / (67 + (sd ? 17 : 0) + (ok ? 16 : 0)) };
      if (!trade) {
        const from = ok ? piv.v : buy ? b.low : b.high, buf = slMult * atr, cap = Math.max(4, slMult) * atr;
        const stop = buy ? Math.max(Math.min(from - buf, c - buf), c - cap) : Math.min(Math.max(from + buf, c + buf), c + cap);
        const sl = (buy ? Math.floor(stop / tick) : Math.ceil(stop / tick)) * tick, risk = d * (c - sl);
        if (risk >= 2 * tick) last = trade = { i, t: b.t, side: d, entry: c, sl, risk, tp: [1, 2, 3].map(n => c + d * Math.floor(risk * n / tick) * tick), hit: [false, false, false], r: 0, left: 1 };
      }
    }
    out.push(o); p2 = p; p = o;
  }
  const recent = closed.slice(-20), n = recent.length;
  return { name, out, last, active: !!trade, ready: B.length > warm, n,
    win: n ? recent.filter(t => t.hit[0] || t.r > 1e-8).length / n : 0, avg: n ? recent.reduce((s, t) => s + t.r, 0) / n : 0 };
}

let sats, satsKey = '', satsSeen = '';
function satsUpdate() {
  const show = cfg.on && isCrypto() && bars.length > 1;
  $('satsdash').hidden = !show || !cfg.dash;
  if (!show) { sats = null; satsKey = ''; return; }
  const closed = bars.slice(0, -1), id = `${sym}|${tf}|${cfg.preset}`, key = `${id}|${closed.at(-1).t}`;
  if (key === satsKey) return;
  satsKey = key; sats = satsCalc(closed, TF[tf][2], cfg.preset);
  const end = sats.out.at(-1), t = sats.last;
  const mark = [end.signal ? `${end.t}s` : '', t?.event?.t === end.t ? t.event.text : ''].join();
  if (cfg.sound && satsSeen.startsWith(id + '#') && satsSeen !== `${id}#${mark}` && mark !== ',') beep();
  satsSeen = `${id}#${mark}`;
  const rows = [['SATS', sats.name], ['Status', sats.ready ? 'Ready' : 'Warming up'], ['Trend', end.trend === 1 ? 'Bullish ▲' : 'Bearish ▼'],
    ['TQI', end.tqi.toFixed(2)], ['Regime', end.er >= 0.5 ? 'Trending' : end.er >= 0.25 ? 'Mixed' : 'Choppy'],
    ['Trade', !t ? 'None' : `${t.side === 1 ? 'BUY' : 'SELL'} ${sats.active ? 'open' : t.exit}`], ['Last event', t?.event?.text || '—'],
    [`Win rate (${sats.n})`, sats.n ? (sats.win * 100).toFixed(1) + '%' : '—'], ['Avg R, no fees', sats.n ? sats.avg.toFixed(2) : '—']];
  $('satsdash').replaceChildren(...rows.flat().map(v => Object.assign(document.createElement('span'), { textContent: v })));
}

window.drawSats = (x, W) => {
  if (!sats) return;
  const ts = chart.timeScale(), X = t => ts.timeToCoordinate(t + EAT), Y = v => main.priceToCoordinate(v);
  x.save(); x.lineWidth = 2; x.textAlign = 'center';
  let from = null;
  sats.out.forEach((o, i) => {
    if (!sats.ready) return;
    const px = X(o.t), v = o.trend === 1 ? o.lo : o.up, py = v == null ? null : Y(v);
    const color = o.trend === 1 ? '#00e676' : '#ff5252';
    if (from && from.trend === o.trend && px != null && py != null) {
      x.strokeStyle = color; x.globalAlpha = 0.3 + 0.7 * Math.min(1, Math.max(0, (o.tqi - 0.1) / 0.8));
      x.beginPath(); x.moveTo(from.x, from.y); x.lineTo(px, py); x.stroke();
    }
    from = px == null || py == null ? null : { x: px, y: py, trend: o.trend };
    if (o.signal && px != null) {
      const buy = o.signal.side === 1, y = Y(buy ? bars[i].low : bars[i].high);
      x.globalAlpha = 1; x.fillStyle = color; x.fillText(`${buy ? '▲ BUY' : '▼ SELL'} ${o.signal.score.toFixed(0)}`, px, y + (buy ? 16 : -8));
    }
  });
  const t = sats.last;
  if (sats.active) {
    const start = Math.max(0, X(t.t) ?? 0);
    x.textAlign = 'right'; x.globalAlpha = 1; x.lineWidth = 1;
    [['ENTRY', t.entry, '#aaa'], ['SL', t.sl, '#ff1744'], ...t.tp.map((v, n) => [`TP${n + 1}${t.hit[n] ? ' HIT' : ''}`, v, t.hit[n] ? '#40e0d0' : '#00e676'])].forEach(([label, v, color]) => {
      const y = Y(v); x.strokeStyle = x.fillStyle = color;
      x.beginPath(); x.moveTo(start, y); x.lineTo(W, y); x.stroke(); x.fillText(`${label} ${v.toFixed(2)}`, W - 4, y - 3);
    });
  }
  x.restore();
};

function satsSave() { save('sats', cfg); satsKey = ''; satsSeen = ''; ['on', 'dash', 'sound'].forEach(k => $('sats-' + k).classList.toggle('on', cfg[k])); satsUpdate(); }
['on', 'dash', 'sound'].forEach(k => $('sats-' + k).onclick = () => { cfg[k] = !cfg[k]; satsSave(); });
$('sats-preset').value = cfg.preset;
$('sats-preset').onchange = e => { cfg.preset = e.target.value; satsSave(); };
satsSave(); setInterval(satsUpdate, 500);
