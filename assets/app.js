const eventsEl = document.querySelector('#events');
const emptyStateEl = document.querySelector('#empty-state');
const descriptionEl = document.querySelector('#site-description');
const showPastButton = document.querySelector('#show-past');
const downloadEventsButton = document.querySelector('#download-events');

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

async function loadEvents() {
  try {
    const response = await fetch('events.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load events.json: ${response.status}`);
    const data = await response.json();
    descriptionEl.textContent = data.description || 'Upcoming Warlord CCG/TCG events in South Denver.';
    allEvents = (data.events || []).map(event => ({ ...event, timezone: data.timezone || event.timezone || 'America/Denver' }));
    renderEvents();
  } catch (error) {
    descriptionEl.textContent = 'Could not load site data. Check events.json.';
    emptyStateEl.hidden = false;
    emptyStateEl.textContent = error.message;
  }
}

showPastButton.addEventListener('click', () => {
  showPast = !showPast;
  showPastButton.textContent = showPast ? 'Hide past events' : 'Show past events';
  renderEvents();
});

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

loadEvents();
