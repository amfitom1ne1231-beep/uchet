'use strict';

const statusLine = document.querySelector('#status');
const controls = document.querySelector('#controls');
const liveSection = document.querySelector('#live');
const historySection = document.querySelector('#history');
const connectForm = document.querySelector('#connect');
const codeInput = document.querySelector('#code');
const detail = document.querySelector('#shift-detail');
const detailBody = document.querySelector('#shift-body');
const closeButton = detail.querySelector('.x');
const app = document.querySelector('#app');
const background = document.querySelector('#bg');
const credentialKey = 'uchet-hours-device';
const pendingKey = 'uchet-hours-pending';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const shiftViews = new Map();
let token = safeStorage.getItem(credentialKey);
let loading = false;
let connecting = false;
let viewMode = 'pending';
let activeCard = null;
let closeTimer;

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

function duration(data, ms) {
  return (data.estimated && ms != null ? '≈ ' : '') + attendanceDuration(ms);
}

function operatorTeam(shift, data, isLive) {
  const people = isLive ? liveWorkerSpans(shift, data.end) : shift.workerLinks.map(link => {
    const recorded = pauseSpans(link.spans).filter(span => span.e);
    return {id:link.id, spans:spanCut(recorded.length ? recorded : [{s:data.start,e:data.end}],data.start,data.end)};
  });
  const names = ids => ids.map(wName).join(' + ');
  if (data.unknownTimes) return {name:names(people.map(person => person.id)), segments:[], changes:[]};
  const boundaries = [...new Set([data.start, data.end, ...people.flatMap(person =>
    person.spans.flatMap(span => [span.s, span.e]))])].sort((a,b) => a-b);
  const segments = [];
  for (let i=0;i<boundaries.length-1;i++) {
    const s = boundaries[i], e = boundaries[i+1];
    const ids = people.filter(person => person.spans.some(span => span.s <= s && span.e >= e)).map(person => person.id);
    const previous = segments.at(-1);
    if (previous && previous.ids.join() === ids.join()) previous.e = e;
    else segments.push({s,e,ids});
  }
  const changes = segments.slice(1).map((segment,i) => {
    const before = segments[i].ids;
    const out = before.filter(id => !segment.ids.includes(id));
    const incoming = segment.ids.filter(id => !before.includes(id));
    return {at:segment.s,label:out.length && incoming.length ? names(out)+' → '+names(incoming) :
      incoming.length ? 'Заступили: '+names(incoming) : 'Ушли: '+names(out)};
  });
  const initial = segments.find(segment => segment.ids.length)?.ids ?? [];
  if (data.open) {
    const active = people.filter(person => {
      const entries = (shift.worker_log || []).filter(entry => entry.id === person.id);
      return !entries.length || entries.some(entry => !entry.e);
    }).map(person => person.id);
    return {name:names(active),segments,changes};
  }
  return {name:names(initial),segments,changes};
}

function changesHTML(team, data) {
  return team.changes.map(change => {
    const at = khParts(change.at);
    const date = at.d === khParts(data.start).d ? '' : dayText(at.d)+' · ';
    return '<span class="shift-change"><span class="num">'+date+at.t+'</span><span>'+esc(change.label)+'</span></span>';
  }).join('');
}

function playersHTML(data) {
  const players = data.groups[0].rows;
  if (!players.length) return '';
  return '<span class="shift-players"><span class="group-label">Игроки</span>' + players.map(player =>
    '<span class="player-chip"><span class="av xs" aria-hidden="true" style="--pc:'+personColor(player.name)+'">'+
    esc(initials(player.name))+'</span><span>'+esc(player.name)+'</span><b class="num">'+duration(data,player.ms)+'</b></span>'
  ).join('')+'</span>';
}

function extrasHTML(shift) {
  const discount = Number(shift.discount);
  const note = String(shift.note ?? '').trim();
  if (!(discount > 0) && !note) return '';
  return '<span class="shift-extra">' +
    (discount > 0 ? '<span class="shift-discount">Скидка ' + money(discount) + '</span>' : '') +
    (note ? '<span class="shift-note">' + esc(note) + '</span>' : '') + '</span>';
}

function renderShifts(section, title, shifts, getAttendance, isLive) {
  const html = shifts.length ? '<h2 class="cap">' + title + '</h2><div class="shift-list">' + shifts.map((shift, i) => {
    const data = getAttendance(shift);
    const date = shift.work_date || khParts(data.start).d;
    const [, month, day] = date.split('-').map(Number);
    const state = isLive ? (shift.finished_at ? 'Завершена' : shift.paused_at ? 'На паузе' : 'Идёт') : '';
    const end = khParts(data.end);
    const range = data.unknownTimes ? 'Время начала не записано' : khParts(data.start).t + '–' +
      (data.open ? 'сейчас' : end.t + (end.d === date ? '' : ' · ' + dayText(end.d)));
    const key = (isLive ? 'live-' : 'saved-') + shift.id;
    const team = operatorTeam(shift,data,isLive);
    shiftViews.set(key, {shift, data, date, isLive, team});
    return '<button class="shift-card card sheen ' + (data.open ? 'tone-live' : '') + '" data-shift="' + esc(key) +
      '" style="--d:' + -(i % 9) + 's" type="button" aria-haspopup="dialog"><span class="shift-head">' +
      '<span class="shift-day"><b class="num">' + day + '</b><small>' + monthNames[month - 1] + '</small></span>' +
      '<span class="shift-range"><b class="num">' + range + '</b>' + (state ? '<small>' + state + '</small>' : '') + '</span>' +
      '<span class="shift-hours num">' + duration(data, data.ms) + '<span class="chev">›</span></span></span>' +
      (team.name ? '<span class="operator-line"><span class="group-label">Операторы</span><b>'+esc(team.name)+'</b></span>' : '') +
      changesHTML(team,data) + extrasHTML(shift) + playersHTML(data) + '</button>';
  }).join('') + '</div>' : '';
  if (section.rendered === html) return;
  const focused = document.activeElement?.dataset.shift;
  section.innerHTML = section.rendered = html;
  if (focused) section.querySelector('[data-shift="' + CSS.escape(focused) + '"]')?.focus({preventScroll:true});
}

function teamTime(ms,data) {
  const at = khParts(ms);
  return (at.d === khParts(data.start).d ? '' : dayText(at.d)+' ') + at.t;
}

function renderDetail() {
  const view = shiftViews.get(activeCard);
  if (!view) return closeDetail(false);
  const {data, shift, date, isLive, team} = view;
  detail.querySelector('#shift-title').textContent = 'Смена · ' + dayText(date);
  const pauses = isLive ? livePauseSpans(shift, data.end) : pauseSpans(shift.pause_log).filter(p => p.e);
  if (isLive && data.open && shift.paused_at) pauses.push({s:Date.parse(shift.paused_at),e:data.end});
  const players = data.groups[0];
  const rows = players.rows.map(person => ({
    name:person.name, spans:person.intervals.map(p => ({s:p.s,e:p.e ?? data.end}))
  }));
  if (team.segments.length) rows.unshift({name:'Операторы', w:true, spans:team.segments.filter(segment => segment.ids.length)});
  const timeline = data.unknownTimes ? '' : '<span class="cap">Лента смены</span><div class="tl">' +
    timelineHTML({start:data.start,end:data.end,pauses,rows}) + '</div>';
  const lineup = team.segments.length > 1 ? team.segments.map(segment =>
    '<div class="kv"><span class="num">'+teamTime(segment.s,data)+'–'+
    (data.open && segment.e === data.end ? 'сейчас' : teamTime(segment.e,data))+'</span><b>'+
    esc(segment.ids.map(wName).join(' + ') || 'Без операторов')+'</b></div>').join('') :
    (team.name ? '<div class="kv"><b>'+esc(team.name)+'</b></div>' : '');
  const html = (lineup ? '<span class="cap">Команда операторов</span><div class="card lineup">'+lineup+
    changesHTML(team,data)+'</div>' : '') + timeline +
    attendanceHTML({...data,groups:[{...players,title:'Игроки'}]}) + extrasHTML(shift);
  if (detailBody.rendered !== html) detailBody.innerHTML = detailBody.rendered = html;
}

function cardClip(card) {
  const from = card.getBoundingClientRect();
  const to = detail.getBoundingClientRect();
  const inset = [from.top - to.top, to.right - from.right, to.bottom - from.bottom, from.left - to.left];
  return 'inset(' + inset.map(px => Math.max(0,px) + 'px').join(' ') + ' round 22px)';
}

const openClip = 'inset(0px 0px 0px 0px round 22px)';
function openDetail(card) {
  if (activeCard || closeTimer) return;
  activeCard = card.dataset.shift;
  renderDetail();
  detail.querySelector('.level').scrollTop = 0;
  detail.inert = false;
  document.body.classList.add('sheeted');
  if (reduceMotion.matches) {
    detail.classList.add('top');
  } else {
    detail.classList.add('morph','top');
    detail.animate([{clipPath:cardClip(card)},{clipPath:openClip}], {duration:480,easing:'cubic-bezier(.32,.72,0,1)'})
      .onfinish = () => { if (activeCard) detail.classList.remove('morph'); };
    detailBody.animate([{opacity:0},{opacity:0,offset:.25},{opacity:1}], {duration:440});
  }
  closeButton.focus({preventScroll:true});
  app.inert = true;
}

function closeDetail(restoreFocus = true) {
  if (!activeCard) return;
  const card = app.querySelector('[data-shift="' + CSS.escape(activeCard) + '"]');
  activeCard = null;
  detail.inert = true;
  app.inert = false;
  document.body.classList.remove('sheeted');
  detail.classList.add('closing');
  if (card && !reduceMotion.matches && restoreFocus) {
    detail.classList.add('morph');
    detail.animate([{clipPath:openClip},{clipPath:cardClip(card)}],
      {duration:380,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'});
    detailBody.animate([{opacity:1},{opacity:0,offset:.65},{opacity:0}], {duration:380,fill:'forwards'});
  } else detail.classList.remove('top','morph');
  closeTimer = setTimeout(() => {
    detail.classList.remove('top','closing','morph');
    [...detail.getAnimations(), ...detailBody.getAnimations()].forEach(animation => animation.cancel());
    closeTimer = null;
  },380);
  if (restoreFocus) card?.focus({preventScroll:true});
}

function render() {
  const archived = viewMode === 'archive';
  const shifts = S.shifts.filter(shift => Boolean(shift.archived) === archived);
  if (!archived) shifts.reverse();
  shiftViews.clear();
  const liveShifts = archived ? [] : S.live;
  renderShifts(liveSection, 'Сейчас', liveShifts, shift => liveAttendance(shift, nowMs()), true);
  renderShifts(historySection, archived ? 'Оплаченные смены' : 'Завершённые смены', shifts, savedAttendance, false);
  const summary = document.querySelector('#queue-summary');
  summary.hidden = archived || !shifts.length;
  summary.innerHTML = summary.hidden ? '' : '<div><span class="group-label">К расчёту</span><b class="num">'+shifts.length+
    '</b></div><span class="t2">Самая ранняя · '+dayText(shifts[0].work_date)+'</span>';
  if (activeCard) renderDetail();
  const live = S.live.some(shift => !shift.finished_at);
  background.classList.toggle('pulse', live);
  background.style.setProperty('--c1', live ? '#ff3b30' : '#2f8f6a');
  background.style.setProperty('--c2', live ? '#ff7a45' : '#1f5f8b');
  statusLine.textContent = shifts.length || liveShifts.length ? '' : archived ? 'Оплаченных смен пока нет.' : 'Все смены разобраны.';
}

function requestHours(body) {
  return fetch(SUPABASE_URL + '/functions/v1/shift-hours', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), cache:'no-store'
  });
}

function showConnect(message) {
  closeDetail(false);
  token = null;
  safeStorage.removeItem(credentialKey);
  S.shifts = [];
  S.live = [];
  render();
  controls.hidden = true;
  connectForm.hidden = false;
  document.querySelector('#install-hint').hidden = !!standalone;
  statusLine.textContent = message;
}

async function refresh() {
  if (!token || loading) return;
  loading = true;
  try {
    const response = await requestHours({token});
    if (response.status === 403) {
      showConnect('Доступ закрыт. Попросите новое приглашение.');
      return;
    }
    if (!response.ok) throw new Error('Unavailable');
    const {data, now} = await response.json();
    clockOff = Date.parse(now) - Date.now();
    updateData(data);
    controls.hidden = false;
    render();
  } catch {
    controls.hidden = false;
    statusLine.textContent = 'Не удалось обновить смены. Попробуйте ещё раз.';
  } finally {
    loading = false;
  }
}

connectForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (connecting) return;
  const code = codeInput.value.trim().toLowerCase().replace(/[\s-]/g,'');
  if (!/^[a-f0-9]{24}$/.test(code)) {
    statusLine.textContent = 'Введите код из приглашения.';
    return;
  }
  connecting = true;
  const button = connectForm.querySelector('button');
  button.disabled = true;
  try {
    const pending = safeStorage.getItem(pendingKey)?.split(':');
    const device = pending?.[0] === code && /^[a-f0-9]{64}$/.test(pending[1]) ? pending[1] :
      Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2,'0')).join('');
    safeStorage.setItem(pendingKey, code + ':' + device);
    const response = await requestHours({action:'connect',code,token:device});
    if (response.status === 403) {
      statusLine.textContent = 'Приглашение использовано или истекло. Попросите новое.';
      return;
    }
    if (!response.ok) throw new Error('Unavailable');
    safeStorage.setItem(credentialKey, device);
    safeStorage.removeItem(pendingKey);
    token = device;
    codeInput.value = '';
    history.replaceState(null,'',location.pathname);
    connectForm.hidden = true;
    await refresh();
  } catch {
    statusLine.textContent = 'Не удалось подключиться. Попробуйте ещё раз.';
  } finally {
    connecting = false;
    button.disabled = false;
  }
});

app.addEventListener('click', event => {
  const card = event.target.closest('[data-shift]');
  if (card) openDetail(card);
  const tab = event.target.closest('[data-view]');
  if (!tab) return;
  viewMode = tab.dataset.view;
  controls.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed',button === tab));
  render();
});
app.addEventListener('pointerdown', event => {
  const card = event.target.closest('.shift-card');
  if (!card || reduceMotion.matches) return;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--mx',event.clientX-box.left+'px');
  card.style.setProperty('--my',event.clientY-box.top+'px');
  card.classList.add('lit');
  setTimeout(() => card.classList.remove('lit'),250);
});
app.querySelector('.screen').addEventListener('scroll', event => {
  if (!reduceMotion.matches) background.style.setProperty('--py',-Math.min(event.target.scrollTop,800)*.12+'px');
},{passive:true});
closeButton.onclick = () => closeDetail();
document.querySelector('#scrim').onclick = () => closeDetail();
document.addEventListener('keydown',event => {
  if (!activeCard) return;
  if (event.key === 'Escape') closeDetail();
  if (event.key === 'Tab') { event.preventDefault(); closeButton.focus(); }
});
const grab = detail.querySelector('.grab');
let grabStart = 0;
grab.onpointerdown = event => {
  grabStart = event.clientY;
  grab.setPointerCapture(event.pointerId);
};
grab.onpointerup = event => { if (event.clientY - grabStart > 35) closeDetail(); };
document.querySelector('#refresh').onclick = refresh;
document.addEventListener('visibilitychange',() => {
  background.classList.toggle('still',document.hidden);
  if (!document.hidden) refresh();
});
setInterval(() => { if (!document.hidden) refresh(); },30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

const invite = location.hash.slice(1);
if (token) {
  if (invite) history.replaceState(null,'',location.pathname);
  refresh();
} else {
  showConnect('');
  if (/^[a-f0-9]{24}$/.test(invite)) codeInput.value = invite;
}
