const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass~crawler-google-places';
const SEARCH_ACTOR_ID = 'apify~google-search-scraper';
const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'tiktok.com'];

const state = {
  runId: null,
  datasetId: null,
  pollTimer: null,
  results: [],
  location: ''
};

// --- DOM refs ---
const form = document.getElementById('lead-form');
const submitBtn = document.getElementById('submit-btn');
const statusBar = document.getElementById('status-bar');
const statusMsg = document.getElementById('status-message');
const resultsSection = document.getElementById('results-section');
const resultsBody = document.getElementById('results-body');
const resultsCount = document.getElementById('results-count');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const infoBanner = document.getElementById('info-banner');
const infoMessage = document.getElementById('info-message');
const apiKeyBanner = document.getElementById('api-key-banner');
const sectorInput = document.getElementById('sector');
const locationInput = document.getElementById('location');
const maxResultsInput = document.getElementById('max-results');
const sectorError = document.getElementById('sector-error');
const locationError = document.getElementById('location-error');
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportJsonBtn = document.getElementById('export-json-btn');

// --- Init ---
function init() {
  const apiKey = getApiKey();
  if (!apiKey) {
    apiKeyBanner.classList.remove('hidden');
    submitBtn.disabled = true;
  }
  form.addEventListener('submit', handleSubmit);
  exportCsvBtn.addEventListener('click', exportCSV);
  exportJsonBtn.addEventListener('click', exportJSON);
}

function getApiKey() {
  return (window.APIFY_CONFIG && window.APIFY_CONFIG.apiKey) ? window.APIFY_CONFIG.apiKey.trim() : '';
}

// --- Form handling ---
function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  hideError();
  hideInfo();
  hideResults();
  clearPoll();

  const apiKey = getApiKey();
  const sector = sectorInput.value.trim();
  const location = locationInput.value.trim();
  const maxResults = parseInt(maxResultsInput.value, 10) || 50;

  state.location = location;

  const actorInput = {
    searchStringsArray: [sector],
    locationQuery: location,
    maxCrawledPlacesPerSearch: maxResults,
    language: 'en',
    skipClosedPlaces: true
  };

  startRun(apiKey, actorInput);
}

function validateForm() {
  let valid = true;

  if (!sectorInput.value.trim()) {
    sectorError.classList.remove('hidden');
    sectorInput.classList.add('input--error');
    valid = false;
  } else {
    sectorError.classList.add('hidden');
    sectorInput.classList.remove('input--error');
  }

  if (!locationInput.value.trim()) {
    locationError.classList.remove('hidden');
    locationInput.classList.add('input--error');
    valid = false;
  } else {
    locationError.classList.add('hidden');
    locationInput.classList.remove('input--error');
  }

  return valid;
}

// --- Apify API ---
async function startRun(apiKey, actorInput) {
  setLoading(true, 'Starting scraping run...');

  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput)
    });
  } catch (_) {
    setLoading(false);
    showError('Could not reach Apify API. Check your internet connection.');
    return;
  }

  if (response.status === 401 || response.status === 403) {
    setLoading(false);
    showError('Invalid API key. Check your config.js.');
    return;
  }

  if (!response.ok) {
    setLoading(false);
    showError(`Failed to start run (HTTP ${response.status}). Check your input and try again.`);
    return;
  }

  const data = await response.json();
  state.runId = data.data.id;
  state.datasetId = data.data.defaultDatasetId;

  updateStatus('Run started — waiting for results...');
  state.pollTimer = setInterval(() => pollRunStatus(apiKey), POLL_INTERVAL_MS);
}

async function pollRunStatus(apiKey) {
  const url = `${APIFY_BASE}/actor-runs/${state.runId}?token=${apiKey}`;

  let response;
  try {
    response = await fetch(url);
  } catch (_) {
    clearPoll();
    setLoading(false);
    showError('Lost connection while polling. Please try again.');
    return;
  }

  if (!response.ok) {
    clearPoll();
    setLoading(false);
    showError(`Error checking run status (HTTP ${response.status}).`);
    return;
  }

  const data = await response.json();
  const { status, defaultDatasetId } = data.data;

  if (status === 'SUCCEEDED') {
    clearPoll();
    updateStatus('Fetching results...');
    await fetchResults(apiKey, defaultDatasetId);
  } else if (TERMINAL_STATUSES.includes(status)) {
    clearPoll();
    setLoading(false);
    const messages = {
      'FAILED': 'The scraping run failed. This may be a temporary Apify issue — please try again.',
      'ABORTED': 'The run was aborted.',
      'TIMED-OUT': 'Run timed out. Try reducing the Max Results number.'
    };
    showError(messages[status] || `Run ended with status: ${status}`);
  } else {
    updateStatus(`Status: ${status}...`);
  }
}

async function fetchResults(apiKey, datasetId) {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${apiKey}&format=json&limit=1000`;

  let response;
  try {
    response = await fetch(url);
  } catch (_) {
    setLoading(false);
    showError('Could not fetch results. Check your internet connection.');
    return;
  }

  if (!response.ok) {
    setLoading(false);
    showError(`Failed to fetch results (HTTP ${response.status}).`);
    return;
  }

  const items = await response.json();
  state.results = items;

  if (!items.length) {
    setLoading(false);
    showInfo('No leads found for this search. Try broader terms or a different location.');
    return;
  }

  try {
    await enrichWithSocials(apiKey, items, state.location);
  } catch (_) {
    // best-effort; render whatever we have
  }

  setLoading(false);
  renderTable(items);
  showResults(items.length);
}

// --- Social fallback ---
// For any lead with no website, search Google for its facebook/instagram/tiktok page
// and write the first matching URL back onto the lead so renderTable picks it up.
async function enrichWithSocials(apiKey, items, location) {
  const missing = [];
  items.forEach((item, i) => {
    const d = normalizeItem(item);
    if (!d.website && d.name) {
      missing.push({ index: i, name: d.name });
    }
  });

  if (!missing.length) return;

  updateStatus(`Searching socials for ${missing.length} lead${missing.length !== 1 ? 's' : ''} without a website...`);

  const buildQuery = (name) =>
    `"${name}" ${location} (site:facebook.com OR site:instagram.com OR site:tiktok.com)`;

  const queries = missing.map(m => buildQuery(m.name)).join('\n');

  const url = `${APIFY_BASE}/acts/${SEARCH_ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&timeout=300`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        languageCode: 'en',
        mobileResults: false,
        saveHtml: false,
        saveHtmlToKeyValueStore: false,
        includeUnfilteredResults: false
      })
    });
  } catch (_) {
    return;
  }

  if (!response.ok) return;

  let searchResults;
  try {
    searchResults = await response.json();
  } catch (_) {
    return;
  }

  // Match results back to leads by the original query string (more robust than index).
  const resultByQuery = new Map();
  for (const r of searchResults) {
    const term = r?.searchQuery?.term;
    if (term) resultByQuery.set(term, r);
  }

  for (const m of missing) {
    const result = resultByQuery.get(buildQuery(m.name)) ?? searchResults[missing.indexOf(m)];
    if (!result?.organicResults?.length) continue;

    const socialUrl = findSocialUrl(result.organicResults);
    if (socialUrl) {
      items[m.index].website = socialUrl;
    }
  }
}

function findSocialUrl(organicResults) {
  for (const r of organicResults) {
    if (!r?.url) continue;
    try {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (SOCIAL_HOSTS.some(d => host === d || host.endsWith('.' + d))) {
        return r.url;
      }
    } catch (_) {}
  }
  return null;
}

// --- Rendering ---
function normalizeItem(item) {
  return {
    name: item.title ?? item.name ?? '',
    category: item.categoryName ?? item.category ?? '',
    address: item.address ?? item.street ?? '',
    phone: item.phone ?? item.phoneUnformatted ?? '',
    website: item.website ?? item.url ?? '',
    rating: item.totalScore != null ? item.totalScore : (item.rating ?? ''),
    reviews: item.reviewsCount ?? item.reviews ?? ''
  };
}

function renderTable(items) {
  resultsBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const d = normalizeItem(item);
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${esc(d.name)}</td>
      <td>${esc(d.category)}</td>
      <td>${esc(d.address)}</td>
      <td>${d.phone ? `<a href="tel:${esc(d.phone)}">${esc(d.phone)}</a>` : ''}</td>
      <td>${d.website ? `<a href="${esc(d.website)}" target="_blank" rel="noopener">${esc(shortenUrl(d.website))}</a>` : ''}</td>
      <td>${d.rating ? `<span class="rating"><span class="rating-star">★</span>${esc(String(d.rating))}</span>` : ''}</td>
      <td>${d.reviews ? esc(String(d.reviews)) : ''}</td>
    `;

    fragment.appendChild(tr);
  }

  resultsBody.appendChild(fragment);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (SOCIAL_HOSTS.some(d => host === d || host.endsWith('.' + d))) {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg ? `${host}/${seg}` : host;
    }
    return host;
  } catch (_) {
    return url;
  }
}

// --- Export ---
function exportCSV() {
  if (!state.results.length) return;

  const headers = ['Name', 'Category', 'Address', 'Phone', 'Website', 'Rating', 'Reviews'];
  const keys = ['name', 'category', 'address', 'phone', 'website', 'rating', 'reviews'];

  const rows = state.results.map(item => {
    const d = normalizeItem(item);
    return keys.map(k => `"${String(d[k] ?? '').replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\r\n');
  downloadFile(csv, 'leads.csv', 'text/csv;charset=utf-8;');
}

function exportJSON() {
  if (!state.results.length) return;
  const json = JSON.stringify(state.results.map(normalizeItem), null, 2);
  downloadFile(json, 'leads.json', 'application/json');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- UI state helpers ---
function setLoading(on, message) {
  submitBtn.disabled = on;
  if (on) {
    statusBar.classList.remove('hidden');
    updateStatus(message || 'Loading...');
  } else {
    statusBar.classList.add('hidden');
    // re-enable only if api key is present
    if (getApiKey()) submitBtn.disabled = false;
  }
}

function updateStatus(msg) {
  statusMsg.textContent = msg;
}

function showResults(count) {
  resultsCount.textContent = `${count} lead${count !== 1 ? 's' : ''} found`;
  resultsSection.classList.remove('hidden');
}

function hideResults() {
  resultsSection.classList.add('hidden');
  resultsBody.innerHTML = '';
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function showInfo(msg) {
  infoMessage.textContent = msg;
  infoBanner.classList.remove('hidden');
}

function hideInfo() {
  infoBanner.classList.add('hidden');
}

function clearPoll() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

// --- Start ---
init();
