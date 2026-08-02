const form = document.querySelector('#deck-form');
const deckListInput = document.querySelector('#deck-list');
const resultEl = document.querySelector('#estimate-result');
const sampleOneButton = document.querySelector('#load-sample-1');
const sampleTwoButton = document.querySelector('#load-sample-2');

let priceMap = new Map();

const sampleDeckOne = `Starting Army
2 'Mad' Pat Carrik
1 Warboss Azh'kal
2 Ac'Vuk
1 Bear Legion Recruit

Characters
2 Nog, Pog, and Snivels
2 Doo'run
2 Muddflek
2 Catapult Crew
1 The Mighty Mugg

Items
3 Deverenus' Axe
1 Storm Shard
3 Steelforge Regalia
2 Griffon of Andover
2 Myerdeth Mare
1 Ardian Greathawk
1 Eager Blade

Actions
2 Press the Attack
2 Epic Donnybrook
2 Pack Tactics
3 Noble Sacrifice
1 Final Farewell
3 Heroic Confrontation
3 Prime Positioning
2 Cleave
3 Arcane Approach
2 Midnight Madness`;

const sampleDeckTwo = `//play-1
1 'Mad' Pat Carrik
3 Bear Legion Recruit
1 Greenflower Warden
1 Vactus, Spirit's Champion

//deck-1
3 Arcane Approach
2 Ardian Greathawk
2 Berserk
1 Bruntor's Helm
2 Crush
3 Deverenus' Axe
3 Epic Donnybrook
1 Havat-lahn Stance
3 Heroic Confrontation
3 Lights of Revealing Sword
3 Master Dresden
2 Myerdeth Mare
3 Noble Sacrifice
3 Nog, Pog, and Snivels
1 Rockarm
3 Shadow Bolts
2 Shambling Horror
3 Steelforge Regalia
1 Storm Shard`;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function normalizeCardName(value) {
  return String(value || '')
    .trim()
    .replace(/^\d+\s*/, '')
    .replace(/^[\-–:]+\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\(.*\)$/, '')
    .trim();
}

function parseDeckList(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const ignoredLabels = new Set([
    'starting army',
    'characters',
    'items',
    'actions',
    'play',
    'deck',
    'main deck',
    'sideboard',
    'maybeboard'
  ]);

  const parsed = [];

  lines.forEach(line => {
    if (line.startsWith('//')) {
      return;
    }

    const lowered = line.toLowerCase();
    if (ignoredLabels.has(lowered)) {
      return;
    }

    const matched = line.match(/^(\d+)\s+(.+)$/);
    const quantity = matched ? Number.parseInt(matched[1], 10) : 1;
    const name = normalizeCardName(matched ? matched[2] : line);

    if (!Number.isFinite(quantity) || quantity <= 0 || !name) {
      return;
    }

    parsed.push({ quantity, name });
  });

  return parsed;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function isPreferredPriceEntry(entry) {
  const artType = String(entry.art_type || '').trim().toLowerCase();
  const listingTitle = String(entry.listing_title || '').trim().toLowerCase();
  const printing = String(entry.printing || '').trim().toLowerCase();
  const hasFoilHint = /foil|foilized|extended art|extended/.test(listingTitle) || /foil/.test(printing);
  return !hasFoilHint && (artType === 'standard' || artType === '');
}

function selectPriceEntry(entries) {
  const preferred = entries.filter(isPreferredPriceEntry);
  const candidates = preferred.length ? preferred : entries;
  return candidates.reduce((best, current) => {
    const bestPrice = Number(best.price_usd || 0);
    const currentPrice = Number(current.price_usd || 0);
    return currentPrice < bestPrice ? current : best;
  }, candidates[0]);
}

function buildPriceMap(prices) {
  const grouped = new Map();

  prices.forEach(entry => {
    const name = String(entry.card || '').trim();
    if (!name) return;
    if (!grouped.has(name)) {
      grouped.set(name, []);
    }
    grouped.get(name).push(entry);
  });

  const map = new Map();
  grouped.forEach((entries, name) => {
    const selected = selectPriceEntry(entries);
    if (selected) {
      map.set(name, Number(selected.price_usd || 0));
    }
  });

  return map;
}

function estimateDeckCost(entries) {
  let total = 0;
  const missing = [];

  entries.forEach(entry => {
    const price = priceMap.get(entry.name);
    if (typeof price === 'number') {
      total += price * entry.quantity;
    } else {
      missing.push(entry.name);
    }
  });

  return { total, missing };
}

function renderResult(entries, estimate) {
  const summary = [];
  summary.push(`<h3>Estimated total: ${formatCurrency(estimate.total)}</h3>`);
  summary.push('<p class="muted">Using non-foil, near-mint-style pricing from the local card list.</p>');
  summary.push(`<p class="muted">Parsed ${entries.length} card entr${entries.length === 1 ? 'y' : 'ies'} from your list.</p>`);

  if (estimate.missing.length) {
    summary.push(`<p class="muted">Could not find these card names in the price list: ${escapeHtml(estimate.missing.slice(0, 10).join(', '))}${estimate.missing.length > 10 ? '…' : ''}</p>`);
  } else {
    summary.push('<p class="muted">Every card in the list matched the local pricing data.</p>');
  }

  resultEl.innerHTML = summary.join('');
}

async function loadPrices() {
  try {
    const response = await fetch('../warlord_tcg_prices.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load pricing data: ${response.status}`);
    const data = await response.json();
    priceMap = buildPriceMap(data);
  } catch (error) {
    resultEl.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const entries = parseDeckList(deckListInput.value);

  if (!entries.length) {
    resultEl.innerHTML = '<p class="muted">Paste a deck list with quantities and card names to estimate it.</p>';
    return;
  }

  const estimate = estimateDeckCost(entries);
  renderResult(entries, estimate);
});

sampleOneButton.addEventListener('click', () => {
  deckListInput.value = sampleDeckOne;
  deckListInput.focus();
});

sampleTwoButton.addEventListener('click', () => {
  deckListInput.value = sampleDeckTwo;
  deckListInput.focus();
});

loadPrices();
