/* MEETUPS FROM NOSTR
   Shows upcoming calendar events (NIP-52) published by the accounts listed
   on the Meetups page.

   To add or remove a meetup group, edit the data-npubs list in meetups.html.
   Nothing here needs to change.

   How it works: the page asks a few public relays for calendar events
   written by those accounts, checks every event's signature (so a relay
   cannot invent events), and lists the ones that have not happened yet. */

import { verifyEvent } from "./vendor/nostr-verify.js";

const KIND_DATE = 31922;   // all-day event
const KIND_TIME = 31923;   // event with a start time
const KIND_PROFILE = 0;    // the account's name
const WAIT_MS = 8000;      // give up on slow relays after this long
const MAX_EVENTS = 20;

/* ---- bech32 (npub… and naddr… text formats) ---- */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
    }
    return chk;
}

function hrpExpand(hrp) {
    const out = [];
    for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
    out.push(0);
    for (const c of hrp) out.push(c.charCodeAt(0) & 31);
    return out;
}

function convertBits(data, from, to, pad) {
    let acc = 0, bits = 0;
    const out = [];
    const maxv = (1 << to) - 1;
    for (const value of data) {
        acc = (acc << from) | value;
        bits += from;
        while (bits >= to) {
            bits -= to;
            out.push((acc >> bits) & maxv);
        }
        acc &= (1 << bits) - 1;
    }
    if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
    return out;
}

// "npub1…" -> 64-character hex public key, or null if it is not valid
function npubToHex(npub) {
    const text = npub.trim().toLowerCase();
    const pos = text.lastIndexOf("1");
    if (!text.startsWith("npub1") || pos !== 4) return null;
    const words = [];
    for (const c of text.slice(pos + 1)) {
        const v = CHARSET.indexOf(c);
        if (v === -1) return null;
        words.push(v);
    }
    if (polymod([...hrpExpand("npub"), ...words]) !== 1) return null;
    const bytes = convertBits(words.slice(0, -6), 5, 8, false);
    if (bytes.length !== 32) return null;
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Builds the "naddr1…" link code for an event, so it opens in Nostr apps
function naddr(event, dTag) {
    const enc = new TextEncoder();
    const hexBytes = (h) => h.match(/.{2}/g).map((x) => parseInt(x, 16));
    const d = [...enc.encode(dTag)];
    const kind = [(event.kind >>> 24) & 255, (event.kind >>> 16) & 255, (event.kind >>> 8) & 255, event.kind & 255];
    const tlv = [0, d.length, ...d, 2, 32, ...hexBytes(event.pubkey), 3, 4, ...kind];
    const words = convertBits(tlv, 8, 5, true);
    const mod = polymod([...hrpExpand("naddr"), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
    const check = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
    return "naddr1" + [...words, ...check].map((w) => CHARSET[w]).join("");
}

/* ---- reading events ---- */
const tag = (event, name) => {
    const found = event.tags.find((t) => Array.isArray(t) && t[0] === name && typeof t[1] === "string");
    return found ? found[1].trim() : "";
};

// Turns a raw Nostr event into the few fields the page shows, or null
function toMeetup(event) {
    const d = tag(event, "d");
    const startRaw = tag(event, "start");
    if (!d || !startRaw) return null;

    let start, end, allDay = false;
    if (event.kind === KIND_TIME) {
        start = Number(startRaw) * 1000;
        end = Number(tag(event, "end")) * 1000 || start + 3 * 3600 * 1000;
    } else {
        // All-day: "2026-12-05". The end date, if given, is the day after the last day.
        const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; };
        allDay = true;
        start = day(startRaw);
        end = day(tag(event, "end")) || start + 24 * 3600 * 1000;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    return {
        key: `${event.kind}:${event.pubkey}:${d}`,
        created: event.created_at,
        pubkey: event.pubkey,
        title: tag(event, "title") || tag(event, "name") || "Bitcoin meetup",
        where: tag(event, "location"),
        about: tag(event, "summary") || (event.content || "").trim(),
        zone: tag(event, "start_tzid"),
        start, end, allDay,
        link: "https://njump.me/" + naddr(event, d),
    };
}

function formatWhen(m) {
    const dateOpts = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
    if (m.allDay) return new Date(m.start).toLocaleDateString("en-CA", dateOpts);
    const opts = { ...dateOpts, hour: "numeric", minute: "2-digit", timeZoneName: "short" };
    try {
        // Show the time where the meetup happens, when the event says where that is
        return new Date(m.start).toLocaleString("en-CA", m.zone ? { ...opts, timeZone: m.zone } : opts);
    } catch {
        return new Date(m.start).toLocaleString("en-CA", opts);
    }
}

/* ---- the page ---- */
function start(root) {
    const list = root.querySelector("[data-events]");
    const fallback = root.querySelector("[data-fallback]");
    const status = root.querySelector("[data-status]");

    const authors = (root.dataset.npubs || "").split(/\s+/).filter(Boolean).map(npubToHex).filter(Boolean);
    const relays = (root.dataset.relays || "").split(/\s+/).filter(Boolean);
    if (!authors.length || !relays.length || !("WebSocket" in window)) return;

    const meetups = new Map();   // newest version of each event
    const names = new Map();     // pubkey -> { name, created }
    const seen = new Set();
    let pending = relays.length;

    function el(name, cls, text) {
        const node = document.createElement(name);
        if (cls) node.className = cls;
        if (text) node.textContent = text;
        return node;
    }

    function render(done) {
        const now = Date.now();
        const upcoming = [...meetups.values()].filter((m) => m.end >= now).sort((a, b) => a.start - b.start).slice(0, MAX_EVENTS);

        list.replaceChildren(...upcoming.map((m) => {
            const item = el("article", "entry event");
            item.append(el("p", "event-when", formatWhen(m)));
            item.append(el("h3", "entry-title", m.title));
            if (m.where) item.append(el("p", "event-where", m.where));
            if (m.about) item.append(el("p", "entry-desc", m.about.length > 420 ? m.about.slice(0, 400).trimEnd() + "…" : m.about));
            const host = names.get(m.pubkey);
            if (host && host.name) item.append(el("p", "event-host", "Hosted by " + host.name));
            const link = el("a", "entry-link", "View on Nostr →");
            link.href = m.link;
            link.target = "_blank";
            link.rel = "noopener";
            item.append(link);
            return item;
        }));

        fallback.hidden = upcoming.length > 0;
        if (status) status.hidden = done || upcoming.length > 0;
    }

    function accept(event) {
        if (!event || seen.has(event.id) || !authors.includes(event.pubkey)) return;
        if (![KIND_DATE, KIND_TIME, KIND_PROFILE].includes(event.kind) || !Array.isArray(event.tags)) return;
        if (!verifyEvent(event)) return;
        seen.add(event.id);

        if (event.kind === KIND_PROFILE) {
            const old = names.get(event.pubkey);
            if (old && old.created >= event.created_at) return;
            try {
                const profile = JSON.parse(event.content);
                const name = String(profile.display_name || profile.name || "").trim().slice(0, 60);
                names.set(event.pubkey, { name, created: event.created_at });
            } catch { /* not a readable profile */ }
            return;
        }

        const meetup = toMeetup(event);
        if (!meetup) return;
        const old = meetups.get(meetup.key);
        if (!old || old.created < meetup.created) meetups.set(meetup.key, meetup);
    }

    function finishOne() {
        pending -= 1;
        render(pending <= 0);
    }

    if (status) status.hidden = false;

    for (const url of relays) {
        let closed = false;
        let socket;
        const finish = () => {
            if (closed) return;
            closed = true;
            try { socket.close(); } catch { /* already closed */ }
            finishOne();
        };
        try {
            socket = new WebSocket(url);
        } catch {
            closed = true;
            finishOne();
            continue;
        }
        const timer = setTimeout(finish, WAIT_MS);
        let waiting = 2;   // two questions: events, then names
        socket.onopen = () => {
            socket.send(JSON.stringify(["REQ", "events", { kinds: [KIND_DATE, KIND_TIME], authors, limit: 200 }]));
            socket.send(JSON.stringify(["REQ", "names", { kinds: [KIND_PROFILE], authors }]));
        };
        socket.onmessage = (message) => {
            let data;
            try { data = JSON.parse(message.data); } catch { return; }
            if (!Array.isArray(data)) return;
            if (data[0] === "EVENT") accept(data[2]);
            if (data[0] === "EOSE" || data[0] === "CLOSED") {
                waiting -= 1;
                if (waiting <= 0) { clearTimeout(timer); finish(); }
            }
        };
        socket.onerror = () => { clearTimeout(timer); finish(); };
        socket.onclose = () => { clearTimeout(timer); finish(); };
    }
}

const root = document.getElementById("nostr-events");
if (root) start(root);
