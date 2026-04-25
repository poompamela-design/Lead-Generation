# Lead Generation

A browser-based lead generation tool that turns a business type and location into a clean table of business contacts. Enter something like "law firms" + "Singapore", and the app calls Apify's Google Maps scraper to return names, addresses, phone numbers, websites, ratings, and review counts. For any lead missing a website, a second Apify run searches Google for the business's Facebook, Instagram, or TikTok page and fills it in automatically.

Built for solo operators and small teams who want a fast, no-signup lead list they can export to CSV or JSON.

## Features

- Business-type + location form with input validation
- Live status updates while the Apify run is in progress
- Results table with name, category, address, phone, website, rating, review count
- Click-to-call phone numbers and click-through website links
- Automatic social-profile fallback (Facebook / Instagram / TikTok) when a business has no website listed
- One-click CSV export and JSON export
- Friendly error states for missing API key, network errors, invalid keys, failed runs, zero results

## Tech Stack

- HTML, CSS, JavaScript — no framework, no build step
- Apify REST API v2
  - Actor `compass~crawler-google-places` (Google Maps lead source)
  - Actor `apify~google-search-scraper` (social profile fallback)
- GitHub Actions + GitHub Pages for hosting

## Setup

1. Clone the repo:
   ```
   git clone https://github.com/poompamela-design/Lead-Generation.git
   cd Lead-Generation
   ```
2. Get an Apify API token from [apify.com](https://apify.com/) (free tier works for small runs).
3. Create `config.js` in the project root (this file is git-ignored):
   ```js
   const APIFY_CONFIG = {
     apiKey: 'apify_api_YOUR_TOKEN_HERE'
   };
   ```
4. Open `index.html` directly in your browser (`file://` works) — no server required.
5. Hard-refresh (Ctrl+Shift+R) after editing any source file to bypass the browser cache.

## Screenshots

Drop screenshots into `docs/screenshots/` and they will appear here.

![Main view](docs/screenshots/main.png)
![Results table](docs/screenshots/results.png)

## Live Demo

https://poompamela-design.github.io/Lead-Generation/

> Note: the live demo requires you to add your own Apify API key — open the browser DevTools console and run `window.APIFY_CONFIG = { apiKey: 'apify_api_...' }` before clicking *Generate Leads*. The hosted site does not ship a key.
