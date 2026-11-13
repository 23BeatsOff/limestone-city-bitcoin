# Debt clock back end

The Canadian Debt Clock page lives in `docs/debt-clock/`. This folder holds
the parts that run behind it.

- `scripts/fetch_prices.py` fetches five years of daily stock prices for
  "The True Return" section. `.github/workflows/prices.yml` runs it on
  weeknights and publishes the results to this repo's `data` branch, which
  the page reads directly.
- `data/` lists extra tickers to include, and a fallback list.
- `worker/` is an optional Cloudflare Worker for live stock data. It is not
  deployed; the page uses the nightly files.
