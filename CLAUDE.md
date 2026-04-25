# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is no build step, package manager, or test suite. Open `index.html` directly in a browser (file:// is fine) — `config.js` and `app.js` are loaded as plain `<script>` tags. After editing any source file, hard-refresh (Ctrl+Shift+R) to bypass the browser cache.

## Architecture

A single-page client-side lead generation tool that calls the Apify REST API directly from the browser. No server, no framework, no bundler.

### Two-stage Apify pipeline

1. **Google Maps scrape** (`compass~crawler-google-places`) — primary lead source. Input shape:
   - `searchStringsArray`: `[sector]` (the business type alone — do **not** concatenate the location into the search string; the actor ignores it)
   - `locationQuery`: location string (this is what actually constrains results geographically)
   - `maxCrawledPlacesPerSearch`: result cap (`maxCrawledPlaces` is **not** the right field for this actor and silently disables the cap)
   - The flow is async: POST `/runs` → poll `/actor-runs/{runId}` every 3s → GET `/datasets/{datasetId}/items`.

2. **Social fallback** (`apify~google-search-scraper`) — runs after the Maps scrape returns. For any lead missing a website, it Google-searches `"{name}" {location} (site:facebook.com OR site:instagram.com OR site:tiktok.com)` and writes the first matching social URL back onto `item.website` so `renderTable` picks it up. Uses the **synchronous** `run-sync-get-dataset-items` endpoint (no polling). Best-effort — failures are swallowed so the table still renders. Multi-line `queries` string is used (one query per line); results are matched back to leads by `searchQuery.term`, with positional fallback.

### API key handling

`config.js` assigns `window.APIFY_CONFIG.apiKey` and is git-ignored — it's the only source of the key. Never inline the key in `index.html` (it would be committed to history).

### Field normalization

Apify actor outputs vary across versions. `normalizeItem()` in `app.js` is the single source of truth that maps raw items → `{name, category, address, phone, website, rating, reviews}`. Both `renderTable()` and the export functions go through it. Add new output fields here, not at call sites.

### State and rendering

A single global `state` object holds `runId`, `datasetId`, `pollTimer`, `results`, and the last `location` (needed by the social-fallback step after the form is gone from focus). `setLoading()` toggles the spinner and submit button; `showError`/`showInfo` use distinct banners (red vs. yellow). All HTML insertion goes through `esc()` — never interpolate raw strings into `innerHTML`.

### CSS

Design tokens are CSS custom properties on `:root` in `style.css`. The spinner is a pure-CSS `@keyframes spin` rotation on a bordered circle — no images, no libraries.
