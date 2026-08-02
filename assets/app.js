const eventsEl = document.querySelector('#events');
const emptyStateEl = document.querySelector('#empty-state');
const descriptionEl = document.querySelector('#site-description');
const showPastButton = document.querySelector('#show-past');
const downloadEventsButton = document.querySelector('#download-events');
const leaderboardListEl = document.querySelector('#leaderboard-list');

let allEvents = [];
let showPast = false;

const dateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit' });

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function compactGoogleDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function googleCalendarUrl(event) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactGoogleDate(event.start)}/${compactGoogleDate(event.end)}`,
    details: event.description || '',
    location: event.location || '',
    ctz: event.timezone || 'America/Denver'
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getLocationSummary(location = '') {
  const value = String(location || '').trim();
  if (!value) return '';

  const cityStateMatch = value.match(/,\s*([^,]+),\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (cityStateMatch) {
    return `${cityStateMatch[1].trim()}, ${cityStateMatch[2].toUpperCase()}`;
  }

  const fallbackMatch = value.match(/,\s*([^,]+)\s+([A-Za-z]{2})\s+\d{5}(?:-\d{4})?$/);
  if (fallbackMatch) {
    return `${fallbackMatch[1].trim()}, ${fallbackMatch[2].toUpperCase()}`;
  }

  return value;
}

function icsContent(event) {
  const uid = `${crypto.randomUUID()}@sodenwarlord.com`;
  const now = compactGoogleDate(new Date());
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//South Denver Warlord//Events//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${compactGoogleDate(event.start)}`,
    `DTEND:${compactGoogleDate(event.end)}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.location || ''}`,
    `DESCRIPTION:${event.description || ''}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function downloadIcs(event) {
  const blob = new Blob([icsContent(event)], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeTitle || 'warlord-event'}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function renderEvents() {
  if (!eventsEl || !emptyStateEl) return;

  const now = new Date();
  const filtered = allEvents
    .filter(event => showPast || new Date(event.end) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  eventsEl.innerHTML = '';
  emptyStateEl.hidden = filtered.length !== 0;

  filtered.forEach((event, index) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const detailsId = `event-details-${index}`;
    const locationSummary = getLocationSummary(event.location);
    const article = document.createElement('article');
    article.className = 'event';
    article.innerHTML = `
      <button class="event__summary" type="button" aria-expanded="false" aria-controls="${detailsId}">
        <span class="date-tile" aria-hidden="true">
          <span class="date-tile__month">${monthFormatter.format(start).toUpperCase()}</span>
          <span class="date-tile__day">${dayFormatter.format(start)}</span>
        </span>
        <span class="event__content">
          <span class="event__title">${escapeHtml(event.title)}</span>
          <span class="event__meta">
            <span class="event__meta-row">${dateFormatter.format(start)} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}</span>
            ${locationSummary ? `<span class="event__meta-row event__meta-row--location">${escapeHtml(locationSummary)}</span>` : ''}
          </span>
        </span>
        <span class="event__chevron">⌄</span>
      </button>
      <div id="${detailsId}" class="event__details" hidden>
        <p>${escapeHtml(event.description || 'No description provided.')}</p>
        ${event.location ? `<p class="event__details-location"><strong>Address:</strong> ${escapeHtml(event.location)}</p>` : ''}
        <div class="button-row">
          <a class="button" href="${googleCalendarUrl(event)}" target="_blank" rel="noopener">Add to Google Calendar</a>
          <button class="button button--ghost" type="button" data-ics="${index}">Download .ics</button>
        </div>
      </div>
    `;

    const summary = article.querySelector('.event__summary');
    const details = article.querySelector('.event__details');
    summary.addEventListener('click', () => {
      const expanded = summary.getAttribute('aria-expanded') === 'true';
      summary.setAttribute('aria-expanded', String(!expanded));
      details.hidden = expanded;
      article.toggleAttribute('open', !expanded);
    });

    article.querySelector('[data-ics]').addEventListener('click', () => downloadIcs(event));
    eventsEl.appendChild(article);
  });
}

function parseLeaderboardPayload(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    const entries = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let currentEntry = null;
    let collectingDeck = false;
    let deckLines = [];

    const finalizeEntry = () => {
      if (!currentEntry) return;
      if (collectingDeck) {
        currentEntry.Deck = deckLines.join('\n').trim();
      }
      entries.push(currentEntry);
      currentEntry = null;
      collectingDeck = false;
      deckLines = [];
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        if (collectingDeck) {
          deckLines.push('');
        }
        continue;
      }

      if (trimmed === '}' || trimmed === '},') {
        finalizeEntry();
        continue;
      }

      if (collectingDeck) {
        if (/^"[^"]+"\s*:/.test(trimmed)) {
          currentEntry.Deck = deckLines.join('\n').trim();
          collectingDeck = false;
          deckLines = [];
        } else {
          deckLines.push(rawLine.replace(/^\s{8}/, '').replace(/^\s{4}/, ''));
          continue;
        }
      }

      if (trimmed === '{' || trimmed === '[') {
        currentEntry = {};
        continue;
      }

      const propertyMatch = trimmed.match(/^"([^"]+)"\s*:\s*(.*)$/);
      if (!propertyMatch) continue;

      const key = propertyMatch[1];
      const value = propertyMatch[2].trim();

      if (!currentEntry) {
        currentEntry = {};
      }

      if (key === 'Deck') {
        if (value.startsWith('"') && value.endsWith('"')) {
          currentEntry.Deck = value.slice(1, -1).replace(/\\n/g, '\n');
        } else {
          collectingDeck = true;
          deckLines = [];
        }
        continue;
      }

      if (value.startsWith('"') && value.endsWith('"')) {
        currentEntry[key] = value.slice(1, -1);
      } else if (value !== '') {
        currentEntry[key] = value;
      }
    }

    if (currentEntry) {
      finalizeEntry();
    }

    return entries;
  }
}

function renderLeaderboard(entries = []) {
  if (!leaderboardListEl) return;

  leaderboardListEl.innerHTML = '';

  if (!entries.length) {
    leaderboardListEl.innerHTML = '<p class="empty-state">No leaderboard results yet. Add entries to leaderboard.json.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  entries.forEach((entry, index) => {
    const detailsId = `leaderboard-details-${index}`;
    const playerName = String(entry.player || entry.Player || 'Unnamed player');
    const placement = String(entry.tournamentPlacement || entry['Tournament Placement'] || 'Placement pending');
    const dateValue = entry.date || entry.Date || '';
    const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date pending';
    const deckValue = entry.deck ?? entry.Deck ?? '';
    const deckText = typeof deckValue === 'string'
      ? deckValue.trim()
      : Array.isArray(deckValue)
        ? deckValue.filter(Boolean).join('\n')
        : '';
    const warlordDbUrl = entry.warlordDbUrl || entry.warlordDBUrl || entry.warlordDBLink || entry.warlordDbLink || '';
    const article = document.createElement('article');
    article.className = 'leaderboard-card';
    article.innerHTML = `
      <button class="leaderboard-card__toggle" type="button" aria-expanded="false" aria-controls="${detailsId}">
        <span>
          <span class="leaderboard-card__player">${escapeHtml(playerName)}</span>
          <span class="leaderboard-card__meta">${escapeHtml(placement)} • ${escapeHtml(dateLabel)}</span>
        </span>
        <span class="leaderboard-card__chevron">⌄</span>
      </button>
      <div id="${detailsId}" class="leaderboard-card__details" hidden>
        ${deckText ? `<pre class="leaderboard-card__deck-text">${escapeHtml(deckText)}</pre>` : '<p class="muted">Deck details coming soon.</p>'}
        ${warlordDbUrl ? `<p><a class="button button--ghost leaderboard-card__link" href="${escapeHtml(warlordDbUrl)}" target="_blank" rel="noopener noreferrer">View on warlordDB</a></p>` : ''}
      </div>
    `;

    const toggle = article.querySelector('.leaderboard-card__toggle');
    const details = article.querySelector('.leaderboard-card__details');
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      details.hidden = expanded;
      article.toggleAttribute('open', !expanded);
    });

    fragment.appendChild(article);
  });

  leaderboardListEl.appendChild(fragment);
}

async function loadEvents() {
  try {
    const response = await fetch('events.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load events.json: ${response.status}`);
    const data = await response.json();
    descriptionEl.textContent = data.description || 'Upcoming Warlord CCG/TCG events in South Denver.';
    allEvents = (data.events || []).map(event => ({ ...event, timezone: data.timezone || event.timezone || 'America/Denver' }));
    renderEvents();
  } catch (error) {
    if (descriptionEl) {
      descriptionEl.textContent = 'Could not load site data. Check events.json.';
    }
    if (emptyStateEl) {
      emptyStateEl.hidden = false;
      emptyStateEl.textContent = error.message;
    }
  }
}

if (showPastButton) {
  showPastButton.addEventListener('click', () => {
    showPast = !showPast;
    showPastButton.textContent = showPast ? 'Hide past events' : 'Show past events';
    renderEvents();
  });
}

if (downloadEventsButton) {
  downloadEventsButton.addEventListener('click', async () => {
    try {
      const response = await fetch('events.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not download events.json: ${response.status}`);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'events.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      window.alert(error.message);
    }
  });
}

async function loadLeaderboard() {
  try {
    const response = await fetch('leaderboard.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load leaderboard.json: ${response.status}`);
    const text = await response.text();
    const data = parseLeaderboardPayload(text);
    renderLeaderboard(Array.isArray(data) ? data : data.entries || []);
  } catch (error) {
    if (leaderboardListEl) {
      leaderboardListEl.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    }
  }
}

if (eventsEl && emptyStateEl && descriptionEl) {
  loadEvents();
}
loadLeaderboard();
