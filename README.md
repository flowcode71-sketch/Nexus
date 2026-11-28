# My Charts
Free dark charting site for crypto, gold and forex. No server, no payment, no API key.

## Publish
1. Create a free account at github.com.
2. New repository, name it `my-charts`, choose **Public**.
3. **Add file > Upload files**, upload every file (not the folder), then **Commit changes**.
4. **Settings > Pages > Deploy from a branch > main, / (root) > Save**.
5. After a few minutes open `https://YOUR-USERNAME.github.io/my-charts/`

## Install
Android/desktop Chrome: menu > Install app (or Add to Home screen). iPhone Safari: Share > Add to Home Screen.

## What works where
- **BTC, ETH:** Binance data, indicators, saved drawings, price alerts, status.
- **Gold and forex:** TradingView widget with its own indicators and drawing tools. Widget drawings may not be saved, and site alerts do not apply.
- **Why no Twelve Data key:** its free Basic plan is listed as "internal non-display usage" (twelvedata.com/pricing, checked 27 Nov 2026), so it is not used to draw charts.

## SATS indicator (BTC, ETH)
Partial port of "Self-Aware Trend System" v1.17.3 by Willy | WillyAlgoTrader, default settings: presets, quality-adaptive bands, character flips, scored Buy/Sell labels, entry/SL/TP1-3 and a panel. Closed candles only, about 1,000 loaded. Not included: input editing beyond preset, grades, dynamic TP, breakeven, re-entry, self-learning, fees/slippage, next-bar entry, trader card, webhooks. Results can differ from TradingView. Not available on gold or forex widgets.

## Limits
- Alerts sound only while the page is open and awake. Tap the page once after reloading to enable sound. Phones may pause background pages.
- Crypto trades all week, so "Market closed" does not apply; the widget handles market hours for gold and forex.
- Drawings, favourites and alerts are stored only in your browser.

## Test after publishing
Open each symbol and timeframe; try each chart type, indicator, drawing, alert, search, star and full screen; switch internet off and on.
