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
- **BTC, ETH:** Binance data, indicators, saved drawings, price alerts, status, SATS.
- **Gold:** the same tools, using the Hyperliquid xyz:GOLD perpetual. It may differ from broker XAUUSD.
- **Forex:** TradingView widget with its own tools. Site alerts and SATS do not apply.

## SATS indicator (BTC, ETH, gold)
Partial port of "Self-Aware Trend System" v1.17.3 by Willy | WillyAlgoTrader, default settings: presets, quality-adaptive bands, character flips, scored Buy/Sell labels, entry/SL/TP1-3 and a panel. Closed candles only, about 1,000 loaded. Not included: input editing beyond preset, grades, dynamic TP, breakeven, re-entry, self-learning, fees/slippage, next-bar entry, trader card, webhooks. Results can differ from TradingView. Not available on forex widgets.

## Limits
- Alerts sound only while the page is open and awake. Tap the page once after reloading to enable sound. Phones may pause background pages.
- Crypto trades all week, so "Market closed" does not apply; the widget handles forex market hours.
- Drawings, favourites and alerts are stored only in your browser.

## Test after publishing
Open each symbol and timeframe; try each chart type, indicator, drawing, alert, search, star and full screen; switch internet off and on.
