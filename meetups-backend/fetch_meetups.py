#!/usr/bin/env python3
"""Fetch upcoming events for the Meetup.com groups in groups.txt.

Run by .github/workflows/meetups.yml. Writes <out>/meetups.json, which the
Meetups page (docs/js/meetups.js) reads:

    { "updated": "...", "events": [ { group, title, start, end, url, where, about }, ... ] }

Browsers cannot ask Meetup.com directly, so this runs on GitHub instead and
the page reads the saved result. If a group cannot be fetched, its events
from the previous run are kept.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://api.meetup.com/gql-ext"
HERE = os.path.dirname(os.path.abspath(__file__))
QUERY = """
query ($urlname: String!) {
  groupByUrlname(urlname: $urlname) {
    name
    link
    events(first: 10, filter: { status: [ACTIVE] }, sort: ASC) {
      edges { node {
        title description dateTime endTime eventUrl
        venues { name address city state }
      } }
    }
  }
}
"""


def read_groups():
    with open(os.path.join(HERE, "groups.txt")) as f:
        lines = [line.split("#")[0].strip() for line in f]
    return [g for g in lines if re.fullmatch(r"[A-Za-z0-9_-]+", g)]


def plain(text, limit=600):
    """Meetup descriptions are Markdown; keep the words, drop the markup."""
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text or "")
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`#>\\]", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def fetch_group(urlname):
    body = json.dumps({"query": QUERY, "variables": {"urlname": urlname}}).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; limestonecitybitcoin.com meetup list)",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8", "replace"))
    group = (data.get("data") or {}).get("groupByUrlname")
    if not group:
        raise RuntimeError(f"no such group, or no data: {data.get('errors')}")
    events = []
    for edge in group["events"]["edges"]:
        n = edge["node"]
        venue = (n.get("venues") or [{}])[0] or {}
        where = ", ".join(p for p in (venue.get("name"), venue.get("address"), venue.get("city")) if p)
        if not n.get("dateTime") or not str(n.get("eventUrl", "")).startswith("https://www.meetup.com/"):
            continue
        events.append({
            "source": urlname,
            "group": group.get("name") or urlname,
            "title": (n.get("title") or "Bitcoin meetup").strip(),
            "start": n["dateTime"],
            "end": n.get("endTime") or "",
            "url": n["eventUrl"],
            "where": where,
            "about": plain(n.get("description")),
        })
    return events


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "meetups.json")
    previous = []
    if os.path.exists(path):
        try:
            with open(path) as f:
                previous = json.load(f).get("events", [])
        except (ValueError, OSError):
            previous = []

    events, failed = [], []
    for urlname in read_groups():
        try:
            found = fetch_group(urlname)
            print(f"{urlname}: {len(found)} upcoming")
            events += found
        except Exception as err:  # keep the last good copy for this group
            print(f"{urlname}: FAILED ({err}); keeping the previous events", file=sys.stderr)
            failed.append(urlname)
            events += [e for e in previous if e.get("source") == urlname]

    events.sort(key=lambda e: e["start"])
    with open(path, "w") as f:
        json.dump({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "events": events}, f, ensure_ascii=False, indent=1)
    print(f"wrote {len(events)} events to {path}")
    # Fail the run only if nothing at all could be fetched.
    if failed and len(failed) == len(read_groups()):
        sys.exit(1)


if __name__ == "__main__":
    main()
