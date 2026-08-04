# Journal Book - TradingView Sync Extension

Chrome extension that scrapes TradingView Strategy Tester **List of Trades** and syncs them to journal-book.

## Setup

1. Start journal-book locally (`npm run dev`) or use your deployed URL.
2. In journal-book, open **Profile** → **TradingView Sync** → **Generate key**.
3. Load this extension in Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the `extension/` folder
4. Open extension **Options** and paste:
   - API URL (e.g. `http://localhost:3000`)
   - Sync API key
5. Open TradingView, run your strategy backtest, and open **Strategy Tester → List of Trades**.

## Usage

- **Refresh — add new trades** (popup): checks your journal for existing trades, syncs only new ones (old data stays).
- **Import all (full backtest)** (popup): scrolls the full table and syncs/updates every trade.
- **Live Sync dashboard**: open `/live-sync` and click **Refresh** after syncing from the extension.

## Troubleshooting

### "Could not establish connection. Receiving end does not exist."
1. **Refresh TradingView** (F5) after installing or updating the extension.
2. Open **Strategy Tester → List of Trades** on the chart page.
3. Reload the extension on `chrome://extensions` (click the refresh icon on the extension card).

### "Unauthorized" heartbeat
1. In journal-book **Profile → TradingView Sync**, click **Regenerate key**.
2. Copy the new key into extension **Options → Sync API Key → Save settings**.
3. Make sure `npm run dev` is running and the API URL is exactly `http://localhost:3000`.

## Notes

- Keep the TradingView tab open with Strategy Tester visible while syncing.
- TradingView DOM changes may require scraper updates (`src/content/scraper.js`, `SCRAPER_VERSION`).
- The extension sends a heartbeat when you click Refresh so the dashboard can show connection status.
