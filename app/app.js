import { fetchIncidents, ack } from './api.js';

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelId = panel.querySelector('.panel-id');
const panelWhat = panel.querySelector('.panel-what');
const panelWhen = panel.querySelector('.panel-when');
const panelAck = panel.querySelector('[data-testid="panel-ack"]');

const build = document.querySelector('meta[name="build"]')?.content ?? 'dev';
document.querySelector('[data-testid="build-sha"]').textContent = build;

const locale = navigator.language || 'en-GB';
const EU = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
const dayFirst = (() => {
  const region = new Intl.Locale(locale).region ?? '';
  if (EU.has(region) || region === 'GB') return true;
  const parts = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).formatToParts(new Date(2026, 0, 12));
  return parts.findIndex((p) => p.type === 'day') < parts.findIndex((p) => p.type === 'month');
})();

/** Local wall-clock time, dd/mm for EU locales, mm/dd elsewhere; the full UTC value stays in datetime. */
function localTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  return `${dayFirst ? `${day}/${month}` : `${month}/${day}`} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const incidents = new Map(); // id -> incident
const rows = new Map(); // id -> <li>
const opened = new Map(); // id -> openedAt ms, for placement
const ackedIds = new Set();
let openId = null;

function cell(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function rowNode(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  li.append(cell('id', i.id), cell('sev', i.severity), cell('what', `${i.service} · ${i.region} · ${i.summary}`));
  const time = document.createElement('time');
  time.dateTime = i.openedAt;
  time.textContent = localTime(i.openedAt);
  li.append(time, cell('status', ackedIds.has(i.id) ? 'acked' : ''));
  if (ackedIds.has(i.id)) li.querySelector('.status').dataset.testid = 'acked';
  return li;
}

// New incidents go in at their place in the order; a row already on the board never moves, so a
// pointer that is over a row stays over that row (SCHED-4515).
function insertRow(i) {
  const at = Date.parse(i.openedAt);
  opened.set(i.id, at);
  const before = [...list.children].find((c) => opened.get(c.dataset.id) < at);
  const li = rowNode(i);
  list.insertBefore(li, before ?? null);
  rows.set(i.id, li);
}

function markAcked(id) {
  ackedIds.add(id);
  const status = rows.get(id)?.querySelector('.status');
  if (!status) return;
  status.textContent = 'acked';
  status.dataset.testid = 'acked';
}

function openPanel(id) {
  const i = incidents.get(id);
  if (!i) return;
  openId = id;
  panelId.textContent = i.id;
  panelWhat.textContent = `${i.service} · ${i.region} · ${i.summary} · ${i.severity}`;
  panelWhen.textContent = `${localTime(i.openedAt)} local · ${i.openedAt}`;
  panelAck.disabled = ackedIds.has(id);
  panelAck.textContent = ackedIds.has(id) ? 'Acked' : 'Ack';
  panel.hidden = false;
}

function closePanel() {
  openId = null;
  panel.hidden = true;
}

list.addEventListener('click', (event) => {
  const row = event.target.closest('[data-testid="incident-row"]');
  if (row) openPanel(row.dataset.id);
});

panel.querySelector('[data-testid="panel-close"]').addEventListener('click', closePanel);

panelAck.addEventListener('click', async () => {
  const id = openId;
  if (!id || panelAck.disabled) return;
  panelAck.disabled = true;
  try {
    const reply = await ack(id);
    markAcked(reply.id);
    closePanel();
  } catch (error) {
    panelAck.disabled = false;
    console.error('ack failed', error);
  }
});

async function refresh() {
  const page = await fetchIncidents();
  for (const incident of [...page.incidents].reverse()) {
    incidents.set(incident.id, incident);
    if (!rows.has(incident.id)) insertRow(incident);
  }
  loader.hidden = true;
  empty.hidden = list.children.length > 0;
}

try {
  await refresh();
} catch (error) {
  console.error('first load failed', error);
}
setInterval(refresh, 2000);
