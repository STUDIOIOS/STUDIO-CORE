// Studio IOS — mini-CRM app

const DATA_BASE = './data/';
const REPO = 'studioios/studio-core';

const LS = {
  pat: 'studio.pat',
  pushover_user: 'studio.pushover_user',
  activity: 'studio.activity',
  pending_dispatch: 'studio.pending_dispatch',
};

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

  const todayItems = (schedule[date] || [])
    .map(s => ({ ...s, lead: leads.find(l => l.id === s.lead_id) }))
    .filter(s => s.lead)
    .sort((a, b) => (b.lead.priority || 0) - (a.lead.priority || 0));

  const sentCount = todayItems.filter(s => isSent(activity, s.lead_id, s.step)).length;
  const total = todayItems.length;

  // tier breakdown
  const tierCount = { T1: 0, T2: 0, T3: 0 };
  todayItems.forEach(s => { tierCount[s.lead.tier] = (tierCount[s.lead.tier] || 0) + 1; });

  const main = document.querySelector('main');
  main.innerHTML = '';

  // progress card
  const card = el('div', { class: 'progress-card' });
  card.appendChild(progressRing(sentCount, total));
  card.appendChild(el('div', { class: 'progress-summary' },
    el('div', { class: 'count' }, total === 0 ? 'No touches today' : `${total} ${total === 1 ? 'touch' : 'touches'}`),
    el('div', { class: 'meta' }, total === 0 ? 'Enjoy the day off.' : `${sentCount} sent · ${total - sentCount} to go`),
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
    sec.appendChild(el('div', { class: 'empty' }, 'Nothing scheduled. The campaign starts on weekdays.'));
  } else {
    const list = el('div', { class: 'lead-list' });
    todayItems.forEach(item => list.appendChild(leadRow(item.lead, item.step, isSent(activity, item.lead_id, item.step))));
    sec.appendChild(list);
  }
  main.appendChild(sec);

  // week chart
  const weekSec = el('section');
  weekSec.appendChild(el('h2', {}, 'This week'));
  weekSec.appendChild(weekChart(date, schedule, activity));
  main.appendChild(weekSec);
}

function leadRow(lead, step, sent) {
  const a = el('a', {
    class: `lead-row${sent ? ' sent' : ''}`,
    href: `lead.html?id=${encodeURIComponent(lead.id)}&step=${step}`,
  });
  a.appendChild(el('div', { class: `tier-bar ${lead.tier.toLowerCase()}` }));
  const content = el('div', { class: 'lead-content' });
  content.appendChild(el('div', { class: 'lead-name' },
    lead.first_name + ' ' + (lead.last_name || ''),
    el('span', { class: 'lead-company' }, lead.company)
  ));
  const meta = el('div', { class: 'lead-meta' });
  meta.appendChild(document.createTextNode(lead.title || ''));
  if (lead.signal_phrase) {
    meta.appendChild(el('span', { class: `signal-pill priority-${lead.priority || 0}` }, signalLabel(lead)));
  }
  content.appendChild(meta);
  a.appendChild(content);
  a.appendChild(el('span', { class: 'step-pill' }, `step ${step}`));
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
  summary.appendChild(el('div', { class: 'name' }, `${lead.first_name} ${lead.last_name || ''}`));
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

  const mailto = `mailto:${encodeURIComponent(lead.email || '')}` +
    `?subject=${encodeURIComponent(rendered.subject)}` +
    `&body=${encodeURIComponent(rendered.body.slice(0, 1500))}`;
  actions.appendChild(el('a', {
    class: 'btn',
    href: mailto,
  }, 'Open in Apple Mail'));

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
  const { leads, schedule, activity } = data;
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
  ['all', 'pending', 'sent'].forEach(s => {
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
      if (filterStatus === 'pending' && isSentAny) return false;
      if (filterStatus === 'sent' && !isSentAny) return false;
      if (q) {
        const hay = `${l.first_name} ${l.last_name} ${l.company} ${l.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    meta.textContent = `${filtered.length} of ${leads.length}`;
    listWrap.innerHTML = '';
    filtered.slice(0, 200).forEach(l => {
      listWrap.appendChild(leadRow(l, 1, sentSet.has(l.id)));
    });
    if (filtered.length > 200) {
      listWrap.appendChild(el('div', { class: 'list-meta', style: 'text-align:center;padding:14px;' }, `… ${filtered.length - 200} more`));
    }
  }
  redraw();
}

// ───────── Settings ─────────
function renderSettings() {
  const main = document.querySelector('main');
  main.innerHTML = '';

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
