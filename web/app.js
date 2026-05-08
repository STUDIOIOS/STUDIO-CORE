// Studio IOS — mini-CRM app

const DATA_BASE = './data/';
const REPO = 'studioios/studio-core';

const LS = {
  pat: 'studio.pat',
  pushover_user: 'studio.pushover_user',
  activity: 'studio.activity',
  pending_dispatch: 'studio.pending_dispatch',
  boosted: 'studio.boosted',
  theme: 'studio.theme',
  copy_status: 'studio.copy_status',
  copy_notes: 'studio.copy_notes',
};

function getTheme() {
  return localStorage.getItem(LS.theme) === 'light' ? 'light' : 'dark';
}
function setTheme(theme) {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem(LS.theme, 'light');
  } else {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem(LS.theme);
  }
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', theme === 'light' ? '#fafafa' : '#0a0a0a');
}

// ───────── data layer ─────────
const _cache = {};
async function loadJSON(name) {
  if (_cache[name]) return _cache[name];
  const r = await fetch(`${DATA_BASE}${name}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
  _cache[name] = await r.json();
  return _cache[name];
}

async function loadAll() {
  const [config, leads, sequences, schedule, activity] = await Promise.all([
    loadJSON('config'),
    loadJSON('leads'),
    loadJSON('sequences'),
    loadJSON('schedule'),
    loadJSON('activity'),
  ]);
  return { config, leads, sequences, schedule, activity };
}

// ───────── activity ─────────
function localActivity() {
  try { return JSON.parse(localStorage.getItem(LS.activity) || '[]'); }
  catch { return []; }
}
function saveLocalActivity(list) {
  localStorage.setItem(LS.activity, JSON.stringify(list));
}
function mergedActivity(serverActivity) {
  const events = [
    ...(serverActivity?.events || []),
    ...localActivity(),
  ];
  // dedupe by lead_id+step
  const seen = new Set();
  return events.filter(e => {
    const k = `${e.lead_id}::${e.step}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function isSent(activity, leadId, step) {
  return mergedActivity(activity).some(e => e.lead_id === leadId && e.step === step);
}

async function markSent(leadId, step) {
  const event = { lead_id: leadId, step, sent_at: new Date().toISOString() };

  // optimistic local write
  const local = localActivity();
  local.push(event);
  saveLocalActivity(local);

  // try GitHub repo_dispatch
  const pat = localStorage.getItem(LS.pat);
  if (!pat) {
    queueDispatch(event);
    return { synced: false, reason: 'no PAT' };
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'lead_sent',
        client_payload: event,
      }),
    });
    if (!r.ok) throw new Error(`dispatch ${r.status}`);
    return { synced: true };
  } catch (e) {
    queueDispatch(event);
    return { synced: false, reason: e.message };
  }
}

function queueDispatch(event) {
  const q = JSON.parse(localStorage.getItem(LS.pending_dispatch) || '[]');
  q.push(event);
  localStorage.setItem(LS.pending_dispatch, JSON.stringify(q));
}

async function flushPendingDispatches() {
  const pat = localStorage.getItem(LS.pat);
  if (!pat) return;
  const q = JSON.parse(localStorage.getItem(LS.pending_dispatch) || '[]');
  if (!q.length) return;
  const remaining = [];
  for (const event of q) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_type: 'lead_sent', client_payload: event }),
      });
      if (!r.ok) remaining.push(event);
    } catch { remaining.push(event); }
  }
  localStorage.setItem(LS.pending_dispatch, JSON.stringify(remaining));
}

// ───────── boosts (local manual additions to the day) ─────────
function getBoosted() {
  try { return JSON.parse(localStorage.getItem(LS.boosted) || '{}'); }
  catch { return {}; }
}
function saveBoosted(b) { localStorage.setItem(LS.boosted, JSON.stringify(b)); }

function holidaysFromConfig(config) {
  return [
    ...(config.uk_bank_holidays_2026 || []),
    ...(config.uk_bank_holidays_2027 || []),
  ];
}

function isWeekendIso(iso) {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

function nextBusinessDayIso(iso, holidays) {
  let d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  while (true) {
    const s = d.toISOString().slice(0, 10);
    if (!isWeekendIso(s) && !holidays.includes(s)) return s;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function addBusinessDaysIso(startIso, n, holidays) {
  let d = new Date(startIso + 'T00:00:00Z');
  // anchor on a business day
  while (true) {
    const s = d.toISOString().slice(0, 10);
    if (!isWeekendIso(s) && !holidays.includes(s)) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (!isWeekendIso(s) && !holidays.includes(s)) added++;
  }
  return d.toISOString().slice(0, 10);
}

function nextBusinessDays(fromIso, count, holidays) {
  const out = [];
  let cur = fromIso;
  if (isWeekendIso(cur) || holidays.includes(cur)) cur = nextBusinessDayIso(cur, holidays);
  while (out.length < count) {
    out.push(cur);
    cur = nextBusinessDayIso(cur, holidays);
  }
  return out;
}

// Add a lead to today + auto-schedule the rest of its sequence on the tier cadence.
function boostLead(leadId, leads, config, fromIso) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  const cadence = config.cadence_business_days?.[lead.tier] || [0, 3, 7, 12, 18];
  const holidays = holidaysFromConfig(config);
  const boosted = getBoosted();
  cadence.forEach((offset, i) => {
    const date = addBusinessDaysIso(fromIso, offset, holidays);
    boosted[date] = boosted[date] || [];
    if (!boosted[date].some(b => b.lead_id === leadId && b.step === i + 1)) {
      boosted[date].push({
        lead_id: leadId,
        step: i + 1,
        tier: lead.tier,
        boosted_at: new Date().toISOString(),
      });
    }
  });
  saveBoosted(boosted);
}

function unboostLead(leadId) {
  const boosted = getBoosted();
  for (const date of Object.keys(boosted)) {
    boosted[date] = boosted[date].filter(b => b.lead_id !== leadId);
    if (boosted[date].length === 0) delete boosted[date];
  }
  saveBoosted(boosted);
}

function isBoosted(leadId) {
  const boosted = getBoosted();
  return Object.values(boosted).some(arr => arr.some(b => b.lead_id === leadId));
}

// Combine server schedule + local boosts for a given date, deduped.
function combinedScheduleFor(date, schedule) {
  const scheduled = (schedule[date] || []).map(s => ({ ...s, source: 'scheduled' }));
  const boosted = (getBoosted()[date] || []).map(b => ({ ...b, source: 'boosted' }));
  const seen = new Set(scheduled.map(s => `${s.lead_id}::${s.step}`));
  const extras = boosted.filter(b => !seen.has(`${b.lead_id}::${b.step}`));
  return [...scheduled, ...extras];
}

// ───────── mail compose URL ─────────
// Builds the right "open in mail" URL based on config.mail_compose.provider:
//   - 'mailto' → standard mailto: handed to the system default mail app
//     (on iOS that's Apple Mail; the FROM account is whatever you've set
//     under Settings → Mail → Default Account).
//   - 'gmail'  → Gmail web compose URL with authuser= forcing the studio
//     account regardless of which Google accounts you're signed into.
//   - 'outlook'→ Outlook web compose URL.
function composeUrl(config, to, subject, body) {
  const provider = config.mail_compose?.provider || 'mailto';
  const fromAccount = config.mail_compose?.from_account || config.sender?.email || '';
  const subj = encodeURIComponent(subject || '');
  const bod = encodeURIComponent((body || '').slice(0, 4000));
  const recipient = encodeURIComponent(to || '');
  if (provider === 'gmail') {
    const auth = fromAccount ? `&authuser=${encodeURIComponent(fromAccount)}` : '';
    return `https://mail.google.com/mail/?view=cm&fs=1${auth}&to=${recipient}&su=${subj}&body=${bod}`;
  }
  if (provider === 'outlook') {
    return `https://outlook.office.com/mail/deeplink/compose?to=${recipient}&subject=${subj}&body=${bod}`;
  }
  return `mailto:${recipient}?subject=${subj}&body=${bod}`;
}

// ───────── email rendering ─────────
function renderEmail(lead, sequences, config, step) {
  const tier = lead.tier;
  const tpl = sequences[tier]?.steps?.find(s => s.step === step);
  if (!tpl) return null;

  const tokens = {
    first_name: lead.first_name || lead.name?.split(' ')[0] || 'there',
    company: lead.company || 'your company',
    custom_hook: lead.custom_hook || '',
    signal_phrase: lead.signal_phrase || '',
    tier_proof: config.tier_proof?.[tier] || '',
    gdrive_link: config.gdrive_links?.[tier] || '',
    sender_name: config.sender?.name || '',
    signature: config.sender?.signature || '',
  };

  const sub = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => tokens[k] ?? `{{${k}}}`);
  return {
    subject: sub(tpl.subject),
    body: sub(tpl.body),
    name: tpl.name,
    step,
  };
}

// ───────── date utils ─────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
function isoOffset(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ───────── DOM helpers ─────────
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) {
    if (k == null) continue;
    e.append(k.nodeType ? k : document.createTextNode(k));
  }
  return e;
};

function toast(msg, ms = 1800) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => t.classList.remove('show'), ms);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    // fallback
    const ta = el('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied');
  }
}

// ───────── progress ring ─────────
function progressRing(done, total) {
  const r = 36, c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const wrap = el('div', { class: 'progress-ring' });
  wrap.innerHTML = `
    <svg width="92" height="92" viewBox="0 0 92 92">
      <circle class="track" cx="46" cy="46" r="${r}"/>
      <circle class="fill" cx="46" cy="46" r="${r}"
        stroke-dasharray="${c * pct} ${c}"
        stroke-dashoffset="0"/>
    </svg>
    <div class="label">${done}/${total}</div>`;
  return wrap;
}

// ───────── routes ─────────
const routes = {
  today: renderToday,
  lead: renderLead,
  all: renderAll,
  copy: renderCopy,
  settings: renderSettings,
};

async function boot() {
  flushPendingDispatches();
  const route = document.body.dataset.route;
  const fn = routes[route];
  if (fn) {
    try {
      const data = await loadAll();
      await fn(data);
    } catch (e) {
      document.querySelector('main').innerHTML =
        `<div class="empty">Couldn't load data.<br><small style="font-family:var(--font-mono)">${e.message}</small></div>`;
      console.error(e);
    }
  }
}

// ───────── Today ─────────
function renderToday(data) {
  const { config, leads, sequences, schedule, activity } = data;
  const params = new URLSearchParams(location.search);
  const date = params.get('d') || todayISO();

  document.querySelector('.date').textContent = fmtDateLong(date);

  const combined = combinedScheduleFor(date, schedule);
  const todayItems = combined
    .map(s => ({ ...s, lead: leads.find(l => l.id === s.lead_id) }))
    .filter(s => s.lead)
    .sort((a, b) => (b.lead.priority || 0) - (a.lead.priority || 0));

  const sentCount = todayItems.filter(s => isSent(activity, s.lead_id, s.step)).length;
  const total = todayItems.length;
  const boostedCount = todayItems.filter(s => s.source === 'boosted').length;

  // tier breakdown
  const tierCount = { T1: 0, T2: 0, T3: 0 };
  todayItems.forEach(s => { tierCount[s.lead.tier] = (tierCount[s.lead.tier] || 0) + 1; });

  const main = document.querySelector('main');
  main.innerHTML = '';

  // progress card
  const card = el('div', { class: 'progress-card' });
  card.appendChild(progressRing(sentCount, total));
  const meta = total === 0
    ? 'Enjoy the day off.'
    : `${sentCount} sent · ${total - sentCount} to go${boostedCount ? ` · ${boostedCount} boosted` : ''}`;
  card.appendChild(el('div', { class: 'progress-summary' },
    el('div', { class: 'count' }, total === 0 ? 'No touches today' : `${total} ${total === 1 ? 'touch' : 'touches'}`),
    el('div', { class: 'meta' }, meta),
    el('div', { class: 'breakdown' },
      tierCount.T1 ? el('span', {}, `T1·${tierCount.T1}`) : null,
      tierCount.T2 ? el('span', {}, `T2·${tierCount.T2}`) : null,
      tierCount.T3 ? el('span', {}, `T3·${tierCount.T3}`) : null,
    )));
  main.appendChild(card);

  // today's leads
  const sec = el('section');
  sec.appendChild(el('h2', {}, 'Today'));
  if (todayItems.length === 0) {
    sec.appendChild(el('div', { class: 'empty' },
      'Nothing scheduled. ',
      el('a', { href: 'all.html' }, 'Boost a lead from the pipeline.'),
    ));
  } else {
    const list = el('div', { class: 'lead-list' });
    todayItems.forEach(item =>
      list.appendChild(leadRow(item.lead, item.step, isSent(activity, item.lead_id, item.step), { boosted: item.source === 'boosted' }))
    );
    sec.appendChild(list);
  }
  main.appendChild(sec);

  // Week ahead — next 5 weekdays after today
  const weekSec = el('section');
  weekSec.appendChild(el('h2', {}, 'Week ahead'));
  weekSec.appendChild(renderWeekAhead(date, leads, schedule, activity, holidaysFromConfig(config)));
  main.appendChild(weekSec);

  // Compact bar chart at bottom for at-a-glance volume
  const chartSec = el('section');
  chartSec.appendChild(el('h2', {}, 'Volume — this week'));
  chartSec.appendChild(weekChart(date, schedule, activity));
  main.appendChild(chartSec);
}

// Render next 5 weekdays as expandable cards.
function renderWeekAhead(fromIso, leads, schedule, activity, holidays) {
  const wrap = el('div', { class: 'week-ahead' });
  const startNext = nextBusinessDayIso(fromIso, holidays);
  const days = nextBusinessDays(startNext, 5, holidays);
  days.forEach(iso => {
    const items = combinedScheduleFor(iso, schedule)
      .map(s => ({ ...s, lead: leads.find(l => l.id === s.lead_id) }))
      .filter(s => s.lead)
      .sort((a, b) => (b.lead.priority || 0) - (a.lead.priority || 0));

    const tier = { T1: 0, T2: 0, T3: 0 };
    items.forEach(i => { tier[i.lead.tier] = (tier[i.lead.tier] || 0) + 1; });
    const boostedN = items.filter(i => i.source === 'boosted').length;

    const card = el('div', { class: 'day-card' });
    const tierBadges = el('span', { class: 'day-tiers' },
      tier.T1 ? el('span', { class: 'tier-mini t1' }, `T1·${tier.T1}`) : null,
      tier.T2 ? el('span', { class: 'tier-mini t2' }, `T2·${tier.T2}`) : null,
      tier.T3 ? el('span', { class: 'tier-mini t3' }, `T3·${tier.T3}`) : null,
    );
    const header = el('div', { class: 'day-card-header' },
      el('div', { class: 'day-card-left' },
        el('div', { class: 'day-card-date' }, fmtDateShort(iso)),
        el('div', { class: 'day-card-count' },
          items.length === 0 ? 'no touches' : `${items.length} ${items.length === 1 ? 'touch' : 'touches'}${boostedN ? ` · ${boostedN} boosted` : ''}`),
      ),
      el('div', { class: 'day-card-right' },
        tierBadges,
        items.length ? el('span', { class: 'day-card-toggle' }, '▾') : null,
      ),
    );
    card.appendChild(header);

    if (items.length) {
      const body = el('div', { class: 'day-card-leads' });
      items.forEach(item =>
        body.appendChild(leadRow(item.lead, item.step, isSent(activity, item.lead_id, item.step), { boosted: item.source === 'boosted', compact: true }))
      );
      card.appendChild(body);
      header.addEventListener('click', () => card.classList.toggle('expanded'));
    }
    wrap.appendChild(card);
  });
  return wrap;
}

function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function leadRow(lead, step, sent, opts = {}) {
  const { boosted = false, compact = false } = opts;
  const cls = ['lead-row'];
  if (sent) cls.push('sent');
  if (boosted) cls.push('boosted');
  if (compact) cls.push('compact');
  const a = el('a', {
    class: cls.join(' '),
    href: `lead.html?id=${encodeURIComponent(lead.id)}&step=${step}`,
  });
  a.appendChild(el('div', { class: `tier-bar ${lead.tier.toLowerCase()}` }));
  const content = el('div', { class: 'lead-content' });
  const nameStr = (lead.first_name || '') + (lead.last_name ? ' ' + lead.last_name : '');
  content.appendChild(el('div', { class: 'lead-name' },
    nameStr.trim() || lead.company,
    nameStr.trim() ? el('span', { class: 'lead-company' }, lead.company) : null,
  ));
  const meta = el('div', { class: 'lead-meta' });
  meta.appendChild(document.createTextNode(lead.title || ''));
  if (lead.signal_phrase) {
    meta.appendChild(el('span', { class: `signal-pill priority-${lead.priority || 0}` }, signalLabel(lead)));
  }
  content.appendChild(meta);
  a.appendChild(content);
  const pillText = boosted ? `boost · ${step}` : `step ${step}`;
  a.appendChild(el('span', { class: `step-pill${boosted ? ' boost-pill' : ''}` }, pillText));
  return a;
}

function signalLabel(lead) {
  const s = lead.signals || {};
  if (s.funding) return 'funded';
  if (s.leadership_change) return 'new lead';
  if (s.rebrand) return 'rebrand';
  if (s.season_launch) return 'season';
  if (s.category_expansion) return 'expand';
  if (s.job_postings) return 'hiring';
  return 'signal';
}

function weekChart(centerDate, schedule, activity) {
  const card = el('div', { class: 'week-chart' });
  const bars = el('div', { class: 'bars' });
  const center = new Date(centerDate + 'T00:00:00');
  const monday = new Date(center);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const merged = mergedActivity(activity);
  const todayStr = todayISO();

  let max = 1;
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const scheduled = (schedule[iso] || []).length;
    const sent = merged.filter(e => e.sent_at?.slice(0, 10) === iso).length;
    max = Math.max(max, scheduled, sent);
    days.push({ iso, scheduled, sent, dow: d.toLocaleDateString('en-GB', { weekday: 'narrow' }) });
  }
  days.forEach(d => {
    const col = el('div', { class: 'bar-col' });
    col.appendChild(el('div', { class: 'bar-num' }, d.scheduled ? `${d.sent}/${d.scheduled}` : ''));
    const isFuture = d.iso > todayStr;
    const isToday = d.iso === todayStr;
    const h = max > 0 ? Math.round((d.scheduled / max) * 64) + 2 : 2;
    const bar = el('div', { class: `bar${isFuture ? ' future' : ''}${isToday ? ' today' : ''}` });
    bar.style.height = h + 'px';
    col.appendChild(bar);
    col.appendChild(el('div', { class: 'bar-label' }, d.dow));
    bars.appendChild(col);
  });
  card.appendChild(bars);
  return card;
}

// ───────── Lead detail ─────────
function renderLead(data) {
  const { config, leads, sequences, activity } = data;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const step = parseInt(params.get('step') || '1', 10);
  const lead = leads.find(l => l.id === id);
  const main = document.querySelector('main');
  if (!lead) {
    main.innerHTML = `<div class="empty">Lead not found.</div>`;
    return;
  }
  const seq = sequences[lead.tier];
  const totalSteps = seq?.steps?.length || 5;
  const rendered = renderEmail(lead, sequences, config, step);
  if (!rendered) {
    main.innerHTML = `<div class="empty">Step ${step} not defined for ${lead.tier}.</div>`;
    return;
  }
  const sent = isSent(activity, id, step);

  main.innerHTML = '';
  main.classList.add('lead-detail');

  // summary
  const summary = el('div', { class: `summary ${lead.tier.toLowerCase()}` });
  summary.appendChild(el('div', {},
    el('span', { class: `tier-badge ${lead.tier.toLowerCase()}` }, `${lead.tier} · ${seq.label}`)
  ));
  const displayName = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.company;
  summary.appendChild(el('div', { class: 'name' }, displayName));
  summary.appendChild(el('div', { class: 'title' }, lead.title || ''));
  summary.appendChild(el('div', { class: 'company' }, `${lead.company}${lead.domain ? ' · ' + lead.domain : ''}`));
  if (lead.email) summary.appendChild(el('div', { class: 'company' }, lead.email));

  if (lead.signals && Object.keys(lead.signals).some(k => lead.signals[k])) {
    const sig = el('div', { class: 'signals' });
    Object.entries(lead.signals).filter(([_, v]) => v).forEach(([k]) =>
      sig.appendChild(el('span', { class: 'signal-pill' }, k.replace(/_/g, ' '))));
    summary.appendChild(sig);
  }
  if (lead.custom_hook) {
    summary.appendChild(el('div', { class: 'hook' }, lead.custom_hook));
  }
  main.appendChild(summary);

  // step indicator
  const indicator = el('div', { class: 'step-indicator' });
  indicator.appendChild(document.createTextNode(`Step ${step} of ${totalSteps} — ${rendered.name}  `));
  const dots = el('span', { class: 'step-dots' });
  for (let i = 1; i <= totalSteps; i++) {
    const cls = i < step ? 'done' : i === step ? 'active' : '';
    dots.appendChild(el('span', { class: `step-dot ${cls}` }));
  }
  indicator.appendChild(dots);
  main.appendChild(indicator);

  // step nav
  const stepNav = el('div', { style: 'display:flex; gap:6px; margin-bottom:14px;' });
  for (let i = 1; i <= totalSteps; i++) {
    stepNav.appendChild(el('a', {
      class: 'chip' + (i === step ? ' active' : ''),
      href: `lead.html?id=${encodeURIComponent(id)}&step=${i}`,
    }, `${i}`));
  }
  main.appendChild(stepNav);

  // email card
  const emailCard = el('div', { class: 'email-card' });
  const meta = el('div', { class: 'email-meta' });
  meta.appendChild(el('div', { class: 'row' }, el('span', { class: 'label' }, 'To:'), el('span', { class: 'val' }, lead.email || '—')));
  meta.appendChild(el('div', { class: 'row' }, el('span', { class: 'label' }, 'Subject:'), el('span', { class: 'val' }, rendered.subject)));
  emailCard.appendChild(meta);
  emailCard.appendChild(el('pre', { class: 'email-body' }, rendered.body));
  main.appendChild(emailCard);

  // no-email warning
  if (!lead.email) {
    main.appendChild(el('div', { class: 'notice' },
      el('strong', {}, 'No email address. '),
      'Enrich via Hunter or Apollo, then update leads.json. "Open in Mail" will open a blank To: field — paste the address manually.',
    ));
  }

  // actions
  const actions = el('div', { class: 'actions' });
  actions.appendChild(el('button', {
    class: 'btn btn-primary',
    onclick: () => copy(rendered.body),
  }, 'Copy email body'));

  if (config.gdrive_links?.[lead.tier]) {
    actions.appendChild(el('button', {
      class: 'btn',
      onclick: () => copy(config.gdrive_links[lead.tier]),
    }, 'Copy G-drive link'));
  }

  const composeHref = composeUrl(config, lead.email, rendered.subject, rendered.body);
  const provider = config.mail_compose?.provider || 'mailto';
  const composeLabel = provider === 'gmail' ? 'Open in Gmail (Studio IOS)'
    : provider === 'outlook' ? 'Open in Outlook (Studio IOS)'
    : 'Open in Mail';
  actions.appendChild(el('a', {
    class: 'btn',
    href: composeHref,
    target: provider === 'mailto' ? '_self' : '_blank',
    rel: 'noopener',
  }, composeLabel));

  if (sent) {
    actions.appendChild(el('div', {
      class: 'btn btn-success',
      style: 'cursor:default;',
    }, '✓ Sent'));
  } else {
    actions.appendChild(el('button', {
      class: 'btn btn-success',
      onclick: async (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Saving…';
        const r = await markSent(id, step);
        toast(r.synced ? 'Marked sent ✓' : 'Saved locally — will sync');
        setTimeout(() => location.reload(), 600);
      },
    }, 'Mark as sent'));
  }

  if (lead.linkedin) {
    actions.appendChild(el('a', {
      class: 'btn btn-ghost',
      href: lead.linkedin,
      target: '_blank',
      rel: 'noopener',
    }, 'Open LinkedIn'));
  }

  main.appendChild(actions);
}

// ───────── All / pipeline ─────────
function renderAll(data) {
  const { config, leads, schedule, activity } = data;
  const main = document.querySelector('main');
  main.innerHTML = '';

  let filterTier = 'all';
  let filterStatus = 'all';
  let q = '';

  // filter bar
  const fb = el('div', { class: 'filter-bar' });
  const tierChips = ['all', 'T1', 'T2', 'T3'];
  tierChips.forEach(t => {
    const c = el('button', {
      class: `chip ${t.toLowerCase()}` + (filterTier === t ? ' active' : ''),
      onclick: () => { filterTier = t; redraw(); },
    }, t === 'all' ? 'All tiers' : t);
    c.dataset.tier = t;
    fb.appendChild(c);
  });
  ['all', 'pending', 'sent', 'boosted'].forEach(s => {
    const c = el('button', {
      class: 'chip' + (filterStatus === s ? ' active' : ''),
      onclick: () => { filterStatus = s; redraw(); },
    }, s);
    c.dataset.status = s;
    fb.appendChild(c);
  });
  main.appendChild(fb);

  const search = el('input', {
    class: 'search-input',
    placeholder: 'Search name, company, title…',
    type: 'search',
  });
  search.addEventListener('input', e => { q = e.target.value.toLowerCase(); redraw(); });
  main.appendChild(search);

  const helpBar = el('div', { class: 'list-meta', style: 'margin-bottom:10px' },
    'Tap ', el('span', { class: 'kbd' }, '+'), ' to add a lead to today and auto-schedule its 5-step sequence on the tier cadence. Tap ', el('span', { class: 'kbd' }, '✓'), ' to remove.'
  );
  main.appendChild(helpBar);

  const meta = el('div', { class: 'list-meta' });
  main.appendChild(meta);
  const listWrap = el('div', { class: 'lead-list' });
  main.appendChild(listWrap);

  function redraw() {
    fb.querySelectorAll('.chip').forEach(c => {
      if (c.dataset.tier) c.classList.toggle('active', c.dataset.tier === filterTier);
      if (c.dataset.status) c.classList.toggle('active', c.dataset.status === filterStatus);
    });
    const merged = mergedActivity(activity);
    const sentSet = new Set(merged.map(e => e.lead_id));
    const filtered = leads.filter(l => {
      if (filterTier !== 'all' && l.tier !== filterTier) return false;
      const isSentAny = sentSet.has(l.id);
      const isBoostedLead = isBoosted(l.id);
      if (filterStatus === 'pending' && isSentAny) return false;
      if (filterStatus === 'sent' && !isSentAny) return false;
      if (filterStatus === 'boosted' && !isBoostedLead) return false;
      if (q) {
        const hay = `${l.first_name} ${l.last_name} ${l.company} ${l.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    meta.textContent = `${filtered.length} of ${leads.length}`;
    listWrap.innerHTML = '';
    filtered.slice(0, 200).forEach(l => listWrap.appendChild(boostableRow(l, sentSet.has(l.id), config, leads, redraw)));
    if (filtered.length > 200) {
      listWrap.appendChild(el('div', { class: 'list-meta', style: 'text-align:center;padding:14px;' }, `… ${filtered.length - 200} more`));
    }
  }
  redraw();
}

// Pipeline row = lead-row link + boost toggle button (button can't sit inside <a>).
function boostableRow(lead, sent, config, leads, onChange) {
  const wrap = el('div', { class: 'lead-row-wrap' });
  const inner = leadRow(lead, 1, sent);
  inner.classList.add('flush-right');
  wrap.appendChild(inner);
  const active = isBoosted(lead.id);
  const btn = el('button', {
    class: 'boost-btn' + (active ? ' active' : ''),
    title: active ? 'Remove from today' : 'Add to today + auto-schedule sequence',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active) {
        unboostLead(lead.id);
        toast(`${lead.company} removed`);
      } else {
        boostLead(lead.id, leads, config, todayISO());
        toast(`${lead.company} added to today + sequence scheduled`);
      }
      onChange();
    },
  }, active ? '✓' : '+');
  wrap.appendChild(btn);
  return wrap;
}

// ───────── Copy review ─────────
const COPY_STATUSES = ['draft', 'review', 'approved'];

function getCopyState() {
  try { return JSON.parse(localStorage.getItem(LS.copy_status) || '{}'); } catch { return {}; }
}
function setCopyStatus(key, status) {
  const state = getCopyState();
  state[key] = status;
  localStorage.setItem(LS.copy_status, JSON.stringify(state));
}
function getCopyNotes() {
  try { return JSON.parse(localStorage.getItem(LS.copy_notes) || '{}'); } catch { return {}; }
}
function setCopyNote(key, text) {
  const notes = getCopyNotes();
  if (text) notes[key] = text; else delete notes[key];
  localStorage.setItem(LS.copy_notes, JSON.stringify(notes));
}

function tokensIn(text) {
  const found = new Set();
  (text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => { found.add(k); return _; });
  return [...found];
}

function exportCopyCsv(sequences) {
  const headers = ['tier', 'tier_label', 'tier_tone', 'step', 'name', 'subject', 'body', 'tokens', 'char_count', 'status', 'notes'];
  const state = getCopyState();
  const notes = getCopyNotes();
  const rows = [headers];
  for (const tier of ['T1', 'T2', 'T3']) {
    const seq = sequences[tier];
    if (!seq) continue;
    for (const s of seq.steps) {
      const key = `${tier}.${s.step}`;
      const tokens = [...new Set([...tokensIn(s.subject), ...tokensIn(s.body)])].join(' ');
      rows.push([
        tier,
        seq.label || '',
        seq.tone || '',
        s.step,
        s.name || '',
        s.subject || '',
        s.body || '',
        tokens,
        (s.body || '').length,
        state[key] || 'draft',
        notes[key] || '',
      ]);
    }
  }
  const escape = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `studio-ios-copy-review-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderCopy(data) {
  const { sequences } = data;
  const main = document.querySelector('main');
  main.innerHTML = '';

  const stateInit = getCopyState();
  const notesInit = getCopyNotes();

  // tally
  const tiers = ['T1', 'T2', 'T3'];
  let totalSteps = 0, draft = 0, review = 0, approved = 0;
  tiers.forEach(t => {
    const seq = sequences[t];
    if (!seq) return;
    seq.steps.forEach(s => {
      totalSteps++;
      const key = `${t}.${s.step}`;
      const st = stateInit[key] || 'draft';
      if (st === 'approved') approved++;
      else if (st === 'review') review++;
      else draft++;
    });
  });

  // header card with progress + export
  const header = el('div', { class: 'progress-card', style: 'gap:18px;align-items:flex-start;' });
  header.appendChild(el('div', { style: 'flex:1;' },
    el('div', { class: 'count', style: 'font-size:24px;' }, `${approved}/${totalSteps} approved`),
    el('div', { class: 'meta' }, `${draft} draft · ${review} in review`),
    el('div', { class: 'breakdown', style: 'margin-top:10px;' },
      el('span', { class: 'tier-mini t1' }, `T1·${sequences.T1?.steps.length || 0}`),
      el('span', { class: 'tier-mini t2' }, `T2·${sequences.T2?.steps.length || 0}`),
      el('span', { class: 'tier-mini t3' }, `T3·${sequences.T3?.steps.length || 0}`),
    ),
  ));
  header.appendChild(el('button', {
    class: 'btn',
    style: 'flex-shrink:0;',
    onclick: () => exportCopyCsv(sequences),
  }, 'Export CSV'));
  main.appendChild(header);

  // tier filter
  let activeTier = 'all';
  const filterBar = el('div', { class: 'filter-bar' });
  ['all', 'T1', 'T2', 'T3'].forEach(t => {
    const c = el('button', {
      class: `chip ${t.toLowerCase()}` + (activeTier === t ? ' active' : ''),
      onclick: () => { activeTier = t; redraw(); },
    }, t === 'all' ? 'All tiers' : t);
    c.dataset.t = t;
    filterBar.appendChild(c);
  });
  main.appendChild(filterBar);

  // status filter
  let activeStatus = 'all';
  const statusBar = el('div', { class: 'filter-bar' });
  ['all', 'draft', 'review', 'approved'].forEach(s => {
    const c = el('button', {
      class: 'chip' + (activeStatus === s ? ' active' : ''),
      onclick: () => { activeStatus = s; redraw(); },
    }, s);
    c.dataset.s = s;
    statusBar.appendChild(c);
  });
  main.appendChild(statusBar);

  const list = el('div', { class: 'copy-list' });
  main.appendChild(list);

  function redraw() {
    filterBar.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.t === activeTier));
    statusBar.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.s === activeStatus));
    list.innerHTML = '';
    tiers.forEach(t => {
      if (activeTier !== 'all' && activeTier !== t) return;
      const seq = sequences[t];
      if (!seq) return;
      const tierHeader = el('div', { class: 'copy-tier-header' },
        el('span', { class: `tier-badge ${t.toLowerCase()}` }, `${t} · ${seq.label}`),
        el('div', { class: 'copy-tier-tone' }, seq.tone || ''),
      );
      list.appendChild(tierHeader);
      seq.steps.forEach(s => {
        const key = `${t}.${s.step}`;
        const status = stateInit[key] || 'draft';
        if (activeStatus !== 'all' && activeStatus !== status) return;
        list.appendChild(buildCopyCard(t, seq, s, key, status, notesInit[key] || ''));
      });
    });
    if (!list.childElementCount) {
      list.appendChild(el('div', { class: 'empty' }, 'No emails match these filters.'));
    }
  }

  redraw();
}

function buildCopyCard(tier, seq, step, key, status, notes) {
  const tokens = [...new Set([...tokensIn(step.subject), ...tokensIn(step.body)])];
  const card = el('div', { class: `copy-card status-${status}` });

  const top = el('div', { class: 'copy-card-top' },
    el('div', {},
      el('div', { class: 'copy-card-id' }, `${tier} · STEP ${step.step}`),
      el('div', { class: 'copy-card-name' }, step.name || ''),
    ),
    el('div', { class: 'copy-card-meta' },
      el('span', { class: 'mono-mini' }, `${(step.body || '').length} ch`),
      el('span', { class: 'mono-mini' }, `${tokens.length} tok`),
    ),
  );
  card.appendChild(top);

  card.appendChild(el('div', { class: 'copy-row' },
    el('span', { class: 'copy-label' }, 'Subject'),
    el('span', { class: 'copy-val' }, step.subject || ''),
  ));

  if (tokens.length) {
    const tokenWrap = el('div', { class: 'copy-tokens' });
    tokens.forEach(t => tokenWrap.appendChild(el('span', { class: 'token-pill' }, `{{${t}}}`)));
    card.appendChild(tokenWrap);
  }

  card.appendChild(el('pre', { class: 'copy-body' }, step.body || ''));

  // notes textarea
  const note = el('textarea', {
    class: 'copy-notes',
    placeholder: 'Notes / what to change…',
    rows: '2',
  });
  note.value = notes;
  note.addEventListener('change', () => setCopyNote(key, note.value.trim()));
  card.appendChild(note);

  // status row
  const statusRow = el('div', { class: 'copy-status-row' });
  COPY_STATUSES.forEach(s => {
    const b = el('button', {
      class: 'chip status-chip' + (status === s ? ` active status-${s}` : ''),
      onclick: () => {
        setCopyStatus(key, s);
        // refresh just this card
        const newCard = buildCopyCard(tier, seq, step, key, s, getCopyNotes()[key] || '');
        card.replaceWith(newCard);
      },
    }, s);
    statusRow.appendChild(b);
  });
  statusRow.appendChild(el('button', {
    class: 'chip',
    style: 'margin-left:auto;',
    onclick: () => copy(`Subject: ${step.subject}\n\n${step.body}`),
  }, 'Copy text'));
  card.appendChild(statusRow);

  return card;
}

// ───────── Settings ─────────
function renderSettings(data) {
  const { leads } = data;
  const main = document.querySelector('main');
  main.innerHTML = '';

  // appearance
  const aSec = el('section', {});
  aSec.appendChild(el('h2', {}, 'Appearance'));
  const themeRow = el('div', { class: 'setting-row', style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;' });
  themeRow.appendChild(el('div', {},
    el('div', { style: 'font-size:14px;font-weight:600;' }, 'Theme'),
    el('div', { style: 'font-size:12px;color:var(--text-dim);margin-top:2px;' }, 'Switch between light and dark.'),
  ));
  const themeToggle = el('div', { class: 'theme-toggle' });
  const darkBtn = el('button', { class: 'chip' + (getTheme() === 'dark' ? ' active' : '') }, 'Dark');
  const lightBtn = el('button', { class: 'chip' + (getTheme() === 'light' ? ' active' : '') }, 'Light');
  darkBtn.addEventListener('click', () => { setTheme('dark'); darkBtn.classList.add('active'); lightBtn.classList.remove('active'); });
  lightBtn.addEventListener('click', () => { setTheme('light'); lightBtn.classList.add('active'); darkBtn.classList.remove('active'); });
  themeToggle.appendChild(darkBtn);
  themeToggle.appendChild(lightBtn);
  themeRow.appendChild(themeToggle);
  aSec.appendChild(themeRow);
  main.appendChild(aSec);

  // lead quality summary
  const noEmail = leads.filter(l => !l.email).length;
  const noName = leads.filter(l => !l.first_name).length;
  const noHook = leads.filter(l => !l.custom_hook).length;
  const qSec = el('section', {});
  qSec.appendChild(el('h2', {}, 'Lead data quality'));
  const qRows = [
    { label: 'Total leads', val: leads.length, ok: true },
    { label: 'Missing email', val: noEmail, ok: noEmail === 0 },
    { label: 'Missing first name', val: noName, ok: noName === 0 },
    { label: 'Missing custom hook', val: noHook, ok: noHook === 0 },
  ];
  const qGrid = el('div', { style: 'display:grid;gap:6px;' });
  qRows.forEach(({ label, val, ok }) => {
    const color = ok ? 'var(--success)' : (val > 0 ? 'var(--warning)' : 'var(--text-dim)');
    qGrid.appendChild(el('div', { class: 'setting-row', style: 'display:flex;justify-content:space-between;align-items:center;' },
      el('span', { style: 'font-size:13px;color:var(--text-dim);' }, label),
      el('span', { style: `font-family:var(--font-mono);font-size:14px;color:${color};font-weight:600;` }, String(val)),
    ));
  });
  qSec.appendChild(qGrid);
  if (noEmail > 0) {
    qSec.appendChild(el('div', { class: 'notice', style: 'margin-top:10px;' },
      `${noEmail} lead${noEmail === 1 ? '' : 's'} need email addresses. Enrich via Hunter.io or Apollo before sending.`
    ));
  }
  main.appendChild(qSec);

  const intro = el('section', {});
  intro.appendChild(el('h2', {}, 'About'));
  intro.appendChild(el('div', { class: 'empty', style: 'text-align:left;' },
    el('p', {}, 'These secrets stay on this device only. Nothing is uploaded.'),
    el('p', { style: 'margin-top:8px;color:var(--text-faint);' }, 'GitHub PAT lets the "Mark sent" button log activity back to the repo via repo_dispatch.'),
  ));
  main.appendChild(intro);

  const sec = el('section', {});
  sec.appendChild(el('h2', {}, 'Local secrets'));

  const patRow = el('div', { class: 'setting-row' });
  patRow.appendChild(el('label', {}, 'GitHub PAT (fine-grained, repo dispatch)'));
  const patInput = el('input', {
    type: 'password',
    placeholder: 'github_pat_…',
    value: localStorage.getItem(LS.pat) || '',
  });
  patRow.appendChild(patInput);
  sec.appendChild(patRow);

  const pushRow = el('div', { class: 'setting-row' });
  pushRow.appendChild(el('label', {}, 'Pushover user key (display only)'));
  const pushInput = el('input', {
    type: 'text',
    placeholder: 'u…',
    value: localStorage.getItem(LS.pushover_user) || '',
  });
  pushRow.appendChild(pushInput);
  sec.appendChild(pushRow);

  const acts = el('div', { class: 'section-actions' });
  acts.appendChild(el('button', {
    class: 'btn btn-primary',
    onclick: () => {
      if (patInput.value.trim()) localStorage.setItem(LS.pat, patInput.value.trim());
      else localStorage.removeItem(LS.pat);
      if (pushInput.value.trim()) localStorage.setItem(LS.pushover_user, pushInput.value.trim());
      else localStorage.removeItem(LS.pushover_user);
      toast('Saved');
    },
  }, 'Save'));

  acts.appendChild(el('button', {
    class: 'btn',
    onclick: async () => {
      await flushPendingDispatches();
      toast('Flushed pending');
    },
  }, 'Flush pending sends'));

  acts.appendChild(el('button', {
    class: 'btn btn-ghost',
    onclick: () => {
      if (confirm('Clear local activity cache?')) {
        localStorage.removeItem(LS.activity);
        localStorage.removeItem(LS.pending_dispatch);
        toast('Cleared');
      }
    },
  }, 'Clear local cache'));

  acts.appendChild(el('button', {
    class: 'btn btn-ghost',
    onclick: () => {
      if (confirm('Remove all boosts? This also clears the locally-scheduled future steps.')) {
        localStorage.removeItem(LS.boosted);
        toast('Boosts cleared');
      }
    },
  }, 'Clear boosts'));

  sec.appendChild(acts);
  main.appendChild(sec);
}

// ───────── service worker ─────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', boot);
