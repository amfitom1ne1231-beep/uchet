'use strict';

const statusLine = document.querySelector('#status');
const controls = document.querySelector('#controls');
const periodSelect = document.querySelector('#period');
const liveSection = document.querySelector('#live');
const historySection = document.querySelector('#history');
const token = location.hash.slice(1);
let loading = false;

function linksByShift(rows, key) {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row.shift_id)) result.set(row.shift_id, []);
    result.get(row.shift_id).push({id: row[key], spans: row.spans});
  }
  return result;
}

function updateData(data) {
  S.workers = data.workers;
  S.customers = data.customers;
  S.live = data.live_shifts;
  const workers = linksByShift(data.shift_workers, 'worker_id');
  const customers = linksByShift(data.shift_customers, 'customer_id');
  S.shifts = data.shifts.map(shift => {
    const workerLinks = workers.get(shift.id) || [];
    const custLinks = customers.get(shift.id) || [];
    return {...shift, workerLinks, custLinks,
      workerIds: workerLinks.map(link => link.id),
      customerIds: custLinks.map(link => link.id)};
  }).sort((a, b) => b.work_date.localeCompare(a.work_date) ||
    String(b.start_time || '').localeCompare(String(a.start_time || '')));
}

function sharedTime(data) {
  const [customers, workers] = data.groups.map(group => group.rows);
  const pairs = [];
  workers.forEach((worker, i) => {
    for (const person of [...workers.slice(i + 1), ...customers]) {
      const shared = spanLen(spanAnd(worker.activeSpans, person.activeSpans));
      if (!shared) continue;
      const total = data.unknownPause ? (worker.full ? person.ms : person.full ? worker.ms : null) : shared;
      pairs.push('<div class="kv"><span>' + esc(worker.name + ' · ' + person.name) +
        '</span><b>' + (data.estimated && total != null ? '≈ ' : '') + attendanceDuration(total) + '</b></div>');
    }
  });
  return pairs.length ? '<span class="cap">Время вместе</span>' + pairs.join('') : '';
}

function renderShifts(section, title, shifts, getAttendance, isLive) {
  const opened = new Set([...section.querySelectorAll('details[open]')].map(node => node.dataset.id));
  section.innerHTML = shifts.length ? '<h2>' + title + '</h2>' + shifts.map(shift => {
    const data = getAttendance(shift);
    const date = shift.work_date || khParts(data.start).d;
    const day = date.split('-').reverse().join('.');
    const names = data.groups[1].rows.map(person => person.name).join(', ');
    const state = isLive ? (shift.finished_at ? 'Завершена' : shift.paused_at ? 'На паузе' : 'Идёт') : '';
    const summary = [day, data.unknownTimes ? '' : khParts(data.start).t, state, names].filter(Boolean).join(' · ');
    return '<details data-id="' + esc(shift.id) + '"' + (opened.has(shift.id) ? ' open' : '') +
      '><summary>' + esc(summary) + '<small>' + (data.estimated ? '≈ ' : '') + attendanceDuration(data.ms) +
      '</small></summary><div class="detail">' + attendanceHTML(data) + sharedTime(data) + '</div></details>';
  }).join('') : '';
}

function render() {
  const days = periodSelect.value;
  const since = days === 'all' ? '' : khParts(nowMs() - (Number(days) - 1) * 864e5).d;
  const shifts = S.shifts.filter(shift => shift.work_date >= since);
  renderShifts(liveSection, 'Текущие смены', S.live, shift => liveAttendance(shift, nowMs()), true);
  renderShifts(historySection, 'История смен', shifts, savedAttendance, false);
  statusLine.textContent = shifts.length || S.live.length ? '' : 'За этот период смен нет.';
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch(SUPABASE_URL + '/functions/v1/shift-hours', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token}),
      cache: 'no-store',
    });
    if (response.status === 403) {
      controls.hidden = true;
      liveSection.replaceChildren();
      historySection.replaceChildren();
      statusLine.textContent = 'Доступ по этой ссылке закрыт.';
      return;
    }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const {data, now} = await response.json();
    clockOff = Date.parse(now) - Date.now();
    updateData(data);
    controls.hidden = false;
    render();
  } catch {
    statusLine.textContent = 'Не удалось обновить смены. Попробуйте ещё раз.';
    controls.hidden = false;
  } finally {
    loading = false;
  }
}

document.querySelector('#refresh').onclick = refresh;
periodSelect.onchange = render;
if (/^[a-f0-9]{64}$/.test(token)) {
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 30000);
} else {
  statusLine.textContent = 'Откройте полную ссылку на часы смен.';
}
