#!/usr/bin/env python3
"""Fetch five years of daily prices for the site's ticker universe.

Run nightly by .github/workflows/prices.yml. Writes one compact JSON file per
symbol to <out>/<SYMBOL>.json plus <out>/_index.json, in exactly the shape
docs/debt-clock/js/truereturn.js expects:

    { symbol, name, currency, exchange, firstTradeDate, updated,
      points: [ { d: "YYYY-MM-DD", c: <adjusted close> }, ... ] }

`c` is Yahoo's adjusted close (split + dividend adjusted), i.e. a total-return
series, falling back to the raw close when no adjusted series exists.

Universe = S&P/TSX Composite + S&P 500 (both read from Wikipedia, so they
track index changes) + debt-clock-backend/data/tickers-extra.txt. If Wikipedia can't be read,
debt-clock-backend/data/tickers-seed.txt stands in so the job never publishes an empty set.
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

UA = {"User-Agent": "Mozilla/5.0 (compatible; limestonecitybitcoin.com debt clock price fetcher)",
      "Accept": "application/json,text/html;q=0.9"}
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=5y&interval=1d&events=div%2Csplit&includeAdjustedClose=true"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


TABLE_IDS = {"constituents", "components"}  # S&P 500 page vs TSX Composite page


class ConstituentTable(HTMLParser):
    """Collects the first cell of every row in the index's constituent table."""

    def __init__(self):
        super().__init__()
        self.in_table = self.in_row = self.in_cell = False
        self.cell_index = -1
        self.buf = ""
        self.rows = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table" and a.get("id") in TABLE_IDS:
            self.in_table = True
        elif self.in_table and tag == "tr":
            self.in_row, self.cell_index = True, -1
        elif self.in_row and tag in ("td", "th"):
            self.in_cell, self.cell_index, self.buf = True, self.cell_index + 1, ""

    def handle_endtag(self, tag):
        if tag == "table" and self.in_table:
            self.in_table = False
        elif tag == "tr" and self.in_row:
            self.in_row = False
        elif tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            if self.cell_index == 0:
                self.rows.append(self.buf.strip())

    def handle_data(self, data):
        if self.in_cell:
            self.buf += data


def wikipedia_first_column(url):
    p = ConstituentTable()
    p.feed(get(url))
    return [r for r in p.rows if r and not r.lower().startswith(("symbol", "ticker"))]


def yahoo_symbol(raw, tsx):
    s = raw.strip().upper().replace(".", "-")  # BRK.B → BRK-B, REI.UN → REI-UN
    return f"{s}.TO" if tsx else s


def read_list(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [ln.split("#")[0].strip().upper() for ln in f if ln.split("#")[0].strip()]


def universe():
    syms = set(read_list(os.path.join(ROOT, "data", "tickers-extra.txt")))
    try:
        tsx = wikipedia_first_column("https://en.wikipedia.org/wiki/S%26P/TSX_Composite_Index")
        spx = wikipedia_first_column("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")
        if len(tsx) < 150 or len(spx) < 400:
            raise RuntimeError(f"suspiciously short lists: tsx={len(tsx)} spx={len(spx)}")
        syms.update(yahoo_symbol(t, True) for t in tsx)
        syms.update(yahoo_symbol(t, False) for t in spx)
        print(f"universe: {len(tsx)} TSX + {len(spx)} S&P 500 + extras = {len(syms)}")
    except Exception as e:  # noqa: BLE001
        seed = read_list(os.path.join(ROOT, "data", "tickers-seed.txt"))
        syms.update(seed)
        print(f"WARNING: Wikipedia unavailable ({e}); using seed list, universe = {len(syms)}")
    return sorted(s for s in syms if re.fullmatch(r"[A-Z0-9][A-Z0-9.\-=^]{0,14}", s))


def normalize(data, sym):
    result = (data.get("chart") or {}).get("result") or []
    if not result or not isinstance(result[0].get("timestamp"), list):
        return None
    r, meta = result[0], result[0].get("meta") or {}
    close = ((r.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    adj = ((r.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
    points = []
    for i, t in enumerate(r["timestamp"]):
        c = adj[i] if i < len(adj) and adj[i] is not None else (close[i] if i < len(close) else None)
        if c is None:
            continue
        points.append({"d": datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d"), "c": round(float(c), 4)})
    if len(points) < 2:
        return None
    day = lambda s: datetime.fromtimestamp(s, tz=timezone.utc).strftime("%Y-%m-%d") if s else None  # noqa: E731
    return {
        "symbol": meta.get("symbol") or sym,
        "name": meta.get("longName") or meta.get("shortName") or meta.get("symbol") or sym,
        "currency": meta.get("currency"),
        "exchange": meta.get("exchangeName"),
        "firstTradeDate": day(meta.get("firstTradeDate")),
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "points": points,
    }


def fetch(sym):
    backoff = (2, 5, 10)
    for attempt in range(len(backoff) + 1):
        try:
            return normalize(json.loads(get(YAHOO.format(sym=urllib.request.quote(sym)))), sym)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == len(backoff):
                raise
        except Exception:  # noqa: BLE001
            if attempt == len(backoff):
                raise
        time.sleep(backoff[attempt])


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "prices"
    only = sys.argv[2:]  # optional: a few symbols for a quick local run
    os.makedirs(out, exist_ok=True)
    syms = [s.upper() for s in only] if only else universe()
    ok, missing, failed = [], [], []
    for i, sym in enumerate(syms, 1):
        try:
            data = fetch(sym)
        except Exception as e:  # noqa: BLE001
            failed.append(sym)
            print(f"[{i}/{len(syms)}] {sym}: FAILED {e}")
            continue
        if not data:
            missing.append(sym)
            continue
        with open(os.path.join(out, f"{sym}.json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
        ok.append(sym)
        if i % 50 == 0:
            print(f"[{i}/{len(syms)}] ok={len(ok)} missing={len(missing)} failed={len(failed)}")
        time.sleep(0.15)  # be polite to Yahoo

    # A failed symbol keeps its previous file (the workflow seeds the output
    # dir from the last publish); only symbols that left the universe go.
    kept = []
    if not only:
        wanted = set(syms)
        for name in os.listdir(out):
            if not name.endswith(".json") or name == "_index.json":
                continue
            sym = name[:-5]
            if sym in wanted:
                if sym in failed:
                    kept.append(sym)
            else:
                os.remove(os.path.join(out, name))
    published = sorted(set(ok) | set(kept))

    index = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(published),
        "symbols": published,
        "missing": missing,
        "failed": failed,
        "stale": kept,  # failed this run, serving the previous publish
    }
    with open(os.path.join(out, "_index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    print(f"done: ok={len(ok)} missing={len(missing)} failed={len(failed)}")

    # Never publish a gutted data set (e.g. Yahoo blocking the runner).
    if not only and (len(ok) < 50 or len(failed) > len(syms) * 0.2):
        print("too many failures; refusing to publish")
        sys.exit(1)


if __name__ == "__main__":
    main()
