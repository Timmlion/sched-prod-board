import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const build = document.querySelector('meta[name="build"]')?.content ?? 'dev';
document.querySelector('[data-testid="build-sha"]').textContent = build;

const locale = navigator.language || 'en-GB';
const EU = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '),
);
const dayFirst = (() => {
  const region = new Intl.Locale(locale).region ?? '';
  if (EU.has(region) || region === 'GB') return true;
  const parts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).formatToParts(
    new Date(2026, 0, 12),
  );
  return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
})();

/** Local wall-clock time, dd/mm for EU locales, mm/dd elsewhere; the full UTC value stays in datetime. */
function localTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${dayFirst ? `${day}/${month}` : `${month}/${day}`} ${hm}`;
}

const incidents = new Map();
const ackedIds = new Set();

function render() {
  const rows = [...incidents.values()].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt));
  empty.hidden = rows.length > 0;
  list.innerHTML = rows
    .map((i) => {
      const isAcked = ackedIds.has(i.id);
      return `<li data-testid="incident-row" data-id="${i.id}" class="row ${i.severity}">
        <span class="id">${i.id}</span>
        <span class="sev">${i.severity}</span>
        <span class="what">${i.service} · ${i.region} · ${i.summary}</span>
        <time datetime="${i.openedAt}">${localTime(i.openedAt)}</time>
        ${isAcked ? '<span data-testid="acked" class="asked">acked</span>' : `<button data-testid="ack" data-id="${i.id}">Ack</button>`}
      </li>`;
    })
    .join('');
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  button.disabled = true;
  try {
    const reply = await ack(button.dataset.id);
    ackedIds.add(reply.id);
    render();
  } catch (error) {
    button.disabled = false;
    console.error('ack failed', error);
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const incident of page.incidents) incidents.set(incident.id, incident);
    loader?.remove();
    render();
  } catch (error) {
    console.error('refresh failed', error);
  }
}

await refresh();
setInterval(refresh, 2000);
