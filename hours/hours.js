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
let refreshAgain = false;
let refreshTimer;
let channel;
let channelTopic;
let channelReady = false;
let receivedSnapshot = false;
let viewerName = '';
let playerView;
let playerPeriod = 30;
let playerTrigger;
const realtimeClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'shift-hours-realtime'},
});
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

function playersHTML(data, shift, key) {
  const players = data.groups[0].rows;
  if (!players.length) return '';
  const ids = shift.customerIds || shift.customer_ids || [];
  return '<span class="shift-players"><span class="group-label">Игроки</span>' + players.map((player,i) =>
    '<button type="button" class="player-chip" data-player="'+esc(ids[i])+'" data-source="'+esc(key)+'"><span class="av xs" aria-hidden="true" style="--pc:'+personColor(player.name)+'">'+
    esc(initials(player.name))+'</span><span>'+esc(player.name)+'</span><b class="num">'+duration(data,player.ms)+'</b></button>'
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

function miniTimeline(shift,data,team) {
  const pauses = livePauseSpans(shift,data.end);
  if (shift.paused_at && !shift.finished_at && !pauses.some(p => p.s === Date.parse(shift.paused_at))) {
    pauses.push({s:Date.parse(shift.paused_at),e:data.end});
  }
  const events = pauses.map(p => {
    const ongoing = data.open && p.s === Date.parse(shift.paused_at);
    return {at:p.s,label:ongoing ? 'Пауза идёт' : 'Пауза до '+teamTime(p.e,data),kind:'pause'};
  }).concat(team.changes.map(change => ({...change,kind:'swap'}))).sort((a,b) => a.at-b.at);
  const point = (at,kind) => '<i class="mini-point '+kind+'" data-at="'+at+'"></i>';
  return '<span class="mini-timeline"><span class="mini-track" aria-hidden="true">'+
    point(data.start,'start') + pauses.map(p => '<i class="mini-pause" data-at="'+p.s+'" data-until="'+
      (data.open && p.s === Date.parse(shift.paused_at) ? '' : p.e)+'"></i>').join('') +
    events.filter(event => event.kind === 'swap').map(event => point(event.at,'swap')).join('')+
    '</span><span class="mini-times num"><span>Старт '+teamTime(data.start,data)+'</span><span>'+
    (data.open ? 'Сейчас' : teamTime(data.end,data))+'</span></span>'+
    events.map(event => '<span class="mini-event '+event.kind+'"><time class="num">'+teamTime(event.at,data)+
      '</time><span>'+esc(event.label)+'</span></span>').join('')+'</span>';
}

function renderShifts(section, title, shifts, getAttendance, isLive) {
  if (!shifts.length) {
    if (section.firstChild) section.replaceChildren();
    return;
  }
  if (!section.firstChild) section.innerHTML = '<h2 class="cap"></h2><div class="shift-list"></div>';
  section.firstChild.textContent = title;
  const list = section.lastChild;
  const previous = new Map([...list.children].map(card => [card.dataset.shift,card]));
  const cards = shifts.map((shift, i) => {
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
    const html = '<span class="shift-head">' +
      '<span class="shift-day"><b class="num">' + day + '</b><small>' + monthNames[month - 1] + '</small></span>' +
      '<span class="shift-range"><b class="num">' + range + '</b>' + (state ? '<small>' + state + '</small>' : '') + '</span>' +
      '<span class="shift-hours num">' + (data.open ? '<span class="live-clock" data-clock></span>' : duration(data,data.ms)) + '<span class="chev">›</span></span></span>' +
      (team.name ? '<span class="operator-line"><span class="group-label">Операторы</span><b>'+esc(team.name)+'</b></span>' : '') +
      (isLive ? miniTimeline(shift,data,team) : changesHTML(team,data)) + extrasHTML(shift);
    let card = previous.get(key);
    if (!card) {
      card = document.createElement('article');
      card.className = 'shift-card card sheen';
      card.dataset.shift = key;
      card.style.setProperty('--d',-(i % 9)+'s');
      if (receivedSnapshot && data.open) card.classList.add('shift-arrived');
    }
    previous.delete(key);
    card.classList.toggle('tone-live',data.open);
    card.classList.toggle('shift-paused',data.open && !!shift.paused_at);
    const content = '<button type="button" class="shift-open" aria-haspopup="dialog" aria-label="Подробности смены">'+html+
      '</button>'+playersHTML(data,shift,key);
    if (card.rendered !== content) card.innerHTML = card.rendered = content;
    return card;
  });
  for (const card of previous.values()) card.remove();
  cards.forEach((card,i) => { if (list.children[i] !== card) list.insertBefore(card,list.children[i] || null); });
  if (isLive) paintClocks();
}

function paintClocks() {
  for (const card of liveSection.querySelectorAll('[data-shift]')) {
    const time = card.querySelector('[data-clock]');
    const shift = shiftViews.get(card.dataset.shift)?.shift;
    if (!shift) continue;
    paintTrack(card,shift,nowMs());
    if (time) {
      const value = clock(livePlayed(shift,nowMs()));
      if (time.textContent !== value) time.textContent = value;
    }
  }
}

function paintTrack(card,shift,now) {
    const start = Date.parse(shift.started_at);
    const end = shift.finished_at ? Date.parse(shift.finished_at) : now;
    const position = at => Math.min(100,Math.max(0,(at-start)/Math.max(1,end-start)*100));
    for (const mark of card.querySelectorAll('[data-at]')) {
      const left = position(Number(mark.dataset.at));
      mark.style.left = left+'%';
      if ('until' in mark.dataset) mark.style.width = Math.max(0,position(Number(mark.dataset.until) || end)-left)+'%';
    }
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

function playerRecord(shift,id,live,now) {
  const ids = live ? shift.customer_ids || [] : shift.customerIds;
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const data = live ? liveAttendance(shift,now) : savedAttendance(shift);
  const row = data.groups[0].rows[index];
  const team = live && data.open ? operatorTeam(shift,data,true).name :
    (live ? shift.worker_ids || [] : shift.workerIds).map(wName).join(' + ');
  return {data,row,team,date:shift.work_date || khParts(data.start).d};
}

function renderPlayer() {
  const {id,source} = playerView;
  const now = nowMs();
  const view = shiftViews.get(source);
  const sourceId = source.slice(source.indexOf('-')+1);
  const selected = view?.shift || (source.startsWith('live-') ? S.live : S.shifts).find(shift => shift.id === sourceId);
  const current = (selected && playerRecord(selected,id,source.startsWith('live-'),now)) ||
    S.live.filter(shift=>!shift.finished_at).map(shift=>playerRecord(shift,id,true,now)).find(Boolean);
  const since = playerPeriod ? khParts(now-(playerPeriod-1)*864e5).d : '';
  const records = S.shifts.filter(shift=>shift.work_date>=since).map(shift=>playerRecord(shift,id,false,now))
    .concat(S.live.map(shift=>playerRecord(shift,id,true,now)).filter(record=>record && record.date>=since))
    .filter(Boolean).sort((a,b)=>b.data.start-a.data.start);
  const known = records.filter(record=>record.row.ms!=null);
  const sum = totalDuration(known.map(({data,row})=>({ms:row.ms,estimated:data.estimated})));
  detail.querySelector('#shift-title').textContent = cName(id);
  const header = current ? '<span class="cap">В этой смене'+
    '</span><div class="card player-summary">'+attendanceHTML({...current.data,groups:[{title:'Интервалы игрока',rows:[current.row]}]})+'</div>' : '';
  const periods = '<div class="seg player-period" role="group" aria-label="Период">'+[[7,'7 дней'],[30,'30 дней'],[0,'Всё время']].map(([days,label])=>
    '<button type="button" data-player-period="'+days+'" aria-pressed="'+(playerPeriod===days)+'">'+label+'</button>').join('')+'</div>';
  const html = header+'<span class="cap">Сводка</span>'+periods+
    '<div class="card player-summary"><strong>'+ (known.length || !records.length ? sum : 'Нет точного итога')+
    '</strong><p>Смен · '+records.length+(known.length && known.length!==records.length ? ' · есть неполные записи' : '')+'</p></div>'+
    records.map(({data,row,team,date})=>'<div class="card player-record"><div><b>'+dayText(date)+'</b><span>'+esc(team)+
      '</span></div><b class="num">'+duration(data,row.ms)+'</b></div>').join('');
  if (detailBody.rendered !== html) {
    const focus = document.activeElement?.dataset.playerPeriod;
    detailBody.innerHTML = detailBody.rendered = html;
    if(focus!=null) detailBody.querySelector('[data-player-period="'+focus+'"]')?.focus({preventScroll:true});
  }
}

function openPlayer(button) {
  if (closeTimer) return;
  playerTrigger = button;
  playerView = {id:button.dataset.player,source:button.dataset.source};
  playerPeriod = 30;
  renderPlayer();
  detail.querySelector('.level').scrollTop = 0;
  detail.inert = false;
  detail.classList.add('top');
  document.body.classList.add('sheeted');
  closeButton.focus({preventScroll:true});
  app.inert = true;
}

function cardClip(card) {
  const from = card.getBoundingClientRect();
  const to = detail.getBoundingClientRect();
  const inset = [from.top - to.top, to.right - from.right, to.bottom - from.bottom, from.left - to.left];
  return 'inset(' + inset.map(px => Math.max(0,px) + 'px').join(' ') + ' round 22px)';
}

const openClip = 'inset(0px 0px 0px 0px round 22px)';
function openDetail(card,key=card.dataset.shift) {
  if (activeCard || closeTimer) return;
  activeCard = key;
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
  if (!activeCard && !playerView) return;
  const card = playerView ? (playerTrigger?.isConnected ? playerTrigger : app.querySelector('[data-player="'+CSS.escape(playerView.id)+'"]')) :
    app.querySelector('[data-shift="' + CSS.escape(activeCard) + '"]');
  playerView = playerTrigger = null;
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
  if (restoreFocus) (card?.querySelector('.shift-open') || card || billboard.querySelector('.is-current [data-live-detail]'))?.focus({preventScroll:true});
}

function totalDuration(records) {
  return duration({estimated:records.some(record => record.estimated)},records.reduce((sum,record) => sum+record.ms,0));
}

function renderHistory(shifts) {
  const days = new Map();
  for (const shift of shifts) {
    if (!days.has(shift.work_date)) days.set(shift.work_date,[]);
    days.get(shift.work_date).push(shift);
  }
  const previous = new Map([...historySection.children].map(group => [group.dataset.day,group]));
  const groups = [...days].map(([date,entries]) => {
    const group = previous.get(date) ?? document.createElement('section');
    previous.delete(date);
    group.dataset.day = date;
    group.className = 'hours-day';
    const records = new Map(entries.map(shift => [shift.id,savedAttendance(shift)]));
    const heading = date === today() ? 'Сегодня' : dayText(date)+' '+date.slice(0,4);
    renderShifts(group,heading,entries,shift => records.get(shift.id),false);
    const total = document.createElement('span');
    total.className = 'day-total num';
    total.textContent = totalDuration([...records.values()]);
    group.firstChild.append(total);
    return group;
  });
  for (const group of previous.values()) group.remove();
  groups.forEach((group,i) => {
    if (historySection.children[i] !== group) historySection.insertBefore(group,historySection.children[i] || null);
  });
}

const billboard = document.querySelector('#billboard');
const billboardScenes = billboard.querySelector('.billboard-scenes');
const billboardDots = billboard.querySelector('.billboard-dots');
const billboardToggle = billboard.querySelector('.billboard-toggle');
let scene = 'queue';
let sceneTimer;
let billboardPaused = false;
let runningIds = [];
let previousRunning = new Map();
let finishedScene;
let greetingUntil = 0;
const sceneTitle = key => key === 'queue' ? 'К расчёту' : 'Текущая смена';

function scheduleScene() {
  clearTimeout(sceneTimer);
  if (billboard.hidden || billboardPaused || document.hidden) return;
  if (scene !== 'hello' && scene !== 'finished') return;
  const until = scene === 'hello' ? greetingUntil : finishedScene?.until || 0;
  sceneTimer = setTimeout(() => {
    greetingUntil = 0;
    finishedScene = null;
    selectScene(runningIds.at(-1) || 'queue');
    renderBillboard();
  },Math.max(0,until-Date.now()));
}

function selectScene(key) {
  if (!billboardScenes.querySelector('[data-scene="'+CSS.escape(key)+'"]')) return;
  scene = key;
  for (const node of billboardScenes.children) {
    const active = node.dataset.scene === key;
    node.classList.toggle('is-current',active);
    node.inert = !active;
    node.setAttribute('aria-hidden',String(!active));
  }
  for (const button of billboardDots.children) {
    button.setAttribute('aria-pressed',String(button.dataset.scene === key));
  }
  scheduleScene();
}

function chooseScene(key) {
  greetingUntil = 0;
  finishedScene = null;
  selectScene(key);
  renderBillboard();
}
billboardDots.addEventListener('click',event => {
  const button = event.target.closest('button');
  if (button) chooseScene(button.dataset.scene);
});
let touchStart;
billboard.addEventListener('touchstart',event=>{
  const t=event.changedTouches[0];
  touchStart={x:t.clientX,y:t.clientY};
},{passive:true});
billboard.addEventListener('touchend',event=>{
  if(!touchStart) return;
  const t=event.changedTouches[0], dx=t.clientX-touchStart.x, dy=t.clientY-touchStart.y;
  touchStart=null;
  if(Math.abs(dx)<42 || Math.abs(dx)<Math.abs(dy)*1.3) return;
  const keys=[...runningIds,'queue'];
  if (keys.length < 2) return;
  const index=keys.indexOf(scene);
  chooseScene(keys[(index<0 ? 0 : index+(dx<0?1:-1)+keys.length)%keys.length]);
},{passive:true});
billboardToggle.onclick = () => {
  billboardPaused = !billboardPaused;
  billboard.classList.toggle('motion-paused',billboardPaused);
  billboardToggle.setAttribute('aria-pressed',String(billboardPaused));
  billboardToggle.setAttribute('aria-label',billboardPaused ? 'Возобновить анимацию' : 'Остановить анимацию');
  billboardToggle.textContent = billboardPaused ? '▶' : 'Ⅱ';
  scheduleScene();
};
reduceMotion.addEventListener('change',scheduleScene);

function greeting() {
  const hour = Number(khParts(nowMs()).t.slice(0,2));
  const text = hour>=5 && hour<12 ? 'Доброе утро' : hour>=12 && hour<18 ? 'Добрый день' :
    hour>=18 && hour<23 ? 'Добрый вечер' : 'Доброй ночи';
  return text + (viewerName ? ', '+viewerName : '');
}

function captureLiveChange() {
  const next = new Map(S.live.filter(shift=>!shift.finished_at).map(shift=>[shift.id,shift]));
  const started = [...next.keys()].filter(id=>!previousRunning.has(id)).at(-1);
  const ended = [...previousRunning.keys()].filter(id=>!next.has(id)).at(-1);
  if (started && !greetingUntil) {
    finishedScene = null;
    scene = 'live-'+started;
  } else if (ended && !greetingUntil) {
    const finished = S.live.find(shift=>shift.id===ended && shift.finished_at);
    const before = previousRunning.get(ended);
    const start = Date.parse(before.started_at);
    const saved = S.shifts.find(shift=>Math.abs(shiftStart(shift)-start)<60000 &&
      shift.workerIds.some(id=>(before.worker_ids || []).includes(id)));
    const data = finished ? liveAttendance(finished,nowMs()) : saved ? savedAttendance(saved) : null;
    if (data) {
      const shift = finished || saved;
      finishedScene = {data,team:operatorTeam(shift,data,!!finished),until:Date.now()+4500};
      scene = 'finished';
    }
  }
  previousRunning = next;
  runningIds = [...next.keys()].map(id=>'live-'+id);
}

function renderBillboard() {
  billboard.hidden = !receivedSnapshot;
  if (billboard.hidden) { clearTimeout(sceneTimer); billboard.sceneKeys=''; billboardScenes.replaceChildren(); return; }
  const now = nowMs();
  const date = khParts(now).d;
  const pending = S.shifts.filter(shift=>!shift.archived);
  const oldest = pending.at(-1);
  const values = new Map();
  if (greetingUntil) values.set('hello','<span class="scene-label">'+dayText(date)+'</span><strong class="scene-greeting">'+esc(greeting())+'</strong>');
  if (finishedScene) values.set('finished','<span class="scene-label">Смена завершена</span><strong class="scene-value num">'+
    duration(finishedScene.data,finishedScene.data.ms)+'</strong><span class="scene-caption">'+esc(finishedScene.team.name)+'</span>');
  for (const [id,shift] of previousRunning) {
    const key = 'live-'+id;
    const data = liveAttendance(shift,now);
    const team = operatorTeam(shift,data,true);
    shiftViews.set(key,{shift,data,date:khParts(data.start).d,isLive:true,team});
    values.set(key,'<div class="live-board-head"><div class="live-dial" data-live-dial="'+esc(id)+'">'+
      '<span class="live-dial-center"><b class="num" data-billboard-clock></b><small>без пауз</small></span></div>'+
      '<div class="live-board-meta"><span class="live-board-status'+(shift.paused_at?' paused':'')+'">'+
      (shift.paused_at?'Пауза':'Смена идёт')+'</span>'+
      (shift.paused_at?'<span class="num" data-pause-clock></span>':'')+
      (team.name?'<span class="group-label">Операторы</span><b>'+esc(team.name)+'</b>':'')+
      '<button type="button" class="billboard-detail" data-live-detail="'+esc(key)+'">Подробности ›</button></div></div>'+
      miniTimeline(shift,data,team)+extrasHTML(shift)+playersHTML(data,shift,key));
  }
  values.set('queue','<span class="scene-label">К расчёту</span><strong class="scene-value num">'+pending.length+
    '</strong><span class="scene-caption">'+(oldest?'Самая ранняя · '+dayText(oldest.work_date):'Очередь пуста')+'</span>');
  const keys = [...values.keys()].join(',');
  const target = values.has(scene) ? scene : runningIds.at(-1) || 'queue';
  for (const node of [...billboardScenes.children]) {
    if (values.has(node.dataset.scene)) { node.retiring = false; continue; }
    if (node.retiring) continue;
    node.retiring = true;
    setTimeout(()=>{if(node.retiring) node.remove();},750);
  }
  for (const [key,html] of values) {
    let node = billboardScenes.querySelector('[data-scene="'+CSS.escape(key)+'"]');
    if (!node) {
      node = document.createElement('div');
      node.className='billboard-scene';
      node.dataset.scene=key;
      node.inert=true;
      billboardScenes.append(node);
    }
    if (node.rendered !== html) node.innerHTML=node.rendered=html;
  }
  if (billboard.sceneKeys !== keys) {
    const focusedScene=billboardDots.contains(document.activeElement) ? document.activeElement.dataset.scene : null;
    billboard.sceneKeys=keys;
    billboardDots.hidden = !runningIds.length;
    billboardDots.innerHTML=(runningIds.length ? [...runningIds,'queue'] : []).map((key,i)=>'<button type="button" data-scene="'+esc(key)+
      '" aria-label="'+sceneTitle(key)+(key.startsWith('live-') && runningIds.length>1?' '+(i+1):'')+'"></button>').join('');
    selectScene(target);
    if(focusedScene) billboardDots.querySelector('[data-scene="'+CSS.escape(focusedScene)+'"]')?.focus({preventScroll:true});
  } else if (billboardScenes.querySelector('.is-current')?.dataset.scene !== target) selectScene(target);
  paintBillboardClock();
}

function paintBillboardClock() {
  for (const dial of billboard.querySelectorAll('[data-live-dial]')) {
    const shift=previousRunning.get(dial.dataset.liveDial);
    if(!shift) continue;
    const now=nowMs();
    const seconds=livePlayed(shift,now);
    const time=dial.querySelector('[data-billboard-clock]');
    const value=clock(seconds);
    if(time.textContent!==value) time.textContent=value;
    dial.style.setProperty('--turn',(seconds%3600)/36+'%');
    const pause=dial.closest('.billboard-scene').querySelector('[data-pause-clock]');
    if(pause) pause.textContent=clock(Math.max(0,now-Date.parse(shift.paused_at))/1000);
    paintTrack(dial.closest('.billboard-scene'),shift,now);
  }
}

function render(onlyLive = false) {
  const archived = viewMode === 'archive';
  const shifts = S.shifts.filter(shift => Boolean(shift.archived) === archived);
  if (!archived) shifts.reverse();
  if (!onlyLive) shiftViews.clear();
  const liveShifts = archived ? [] : S.live.filter(shift=>shift.finished_at);
  renderShifts(liveSection, 'Сейчас', liveShifts, shift => liveAttendance(shift, nowMs()), true);
  if (!onlyLive) renderHistory(shifts);
  renderBillboard();
  if (playerView) renderPlayer();
  if (onlyLive) { if (!playerView && activeCard?.startsWith('live-')) renderDetail(); return; }
  if (activeCard && !playerView) renderDetail();
  const live = S.live.some(shift => !shift.finished_at);
  background.style.setProperty('--c1', live ? '#237c77' : '#2f8f6a');
  background.style.setProperty('--c2', live ? '#384e93' : '#1f5f8b');
  statusLine.textContent = shifts.length || (!archived && S.live.length) ? '' : archived ? 'Оплаченных смен пока нет.' : 'Все смены разобраны.';
}

function requestHours(body) {
  return fetch(SUPABASE_URL + '/functions/v1/shift-hours', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), cache:'no-store'
  });
}

function showConnect(message) {
  closeDetail(false);
  token = null;
  receivedSnapshot = false;
  greetingUntil=0;
  finishedScene=null;
  previousRunning.clear();
  runningIds=[];
  stopRealtime();
  safeStorage.removeItem(credentialKey);
  S.shifts = [];
  S.live = [];
  render();
  controls.hidden = true;
  connectForm.hidden = false;
  document.querySelector('#install-hint').hidden = !!standalone;
  statusLine.textContent = message;
}

function sendPresence(visible) {
  if (!token) return;
  fetch(SUPABASE_URL+'/functions/v1/shift-hours',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'presence',token,visible}),keepalive:true,
  }).catch(()=>{});
}

function stopRealtime() {
  const previous = channel;
  channel = channelTopic = null;
  channelReady = false;
  clearTimeout(refreshTimer);
  if (previous) realtimeClient.removeChannel(previous);
}

function subscribe(topic) {
  if (!topic || !realtimeClient || channelTopic === topic) return;
  stopRealtime();
  channelTopic = topic;
  const current = realtimeClient.channel(topic);
  channel = current;
  current.on('broadcast',{event:'refresh'},() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh,120);
  }).subscribe(status => {
    if (channel !== current) return;
    channelReady = status === 'SUBSCRIBED';
    if (channelReady) refresh();
  });
}

async function refresh() {
  if (!token) return;
  if (loading) { refreshAgain = true; return; }
  loading = true;
  try {
    const response = await requestHours({token});
    if (response.status === 403) {
      showConnect('Доступ закрыт. Попросите новое приглашение.');
      return;
    }
    if (!response.ok) throw new Error('Unavailable');
    const {data, now, topic, name} = await response.json();
    viewerName=name || '';
    clockOff = Date.parse(now) - Date.now();
    updateData(data);
    controls.hidden = false;
    if (!receivedSnapshot) {
      greetingUntil=Date.now()+2600;
      scene='hello';
      sendPresence(!document.hidden);
    }
    captureLiveChange();
    receivedSnapshot = true;
    render();
    subscribe(topic);
  } catch {
    controls.hidden = false;
    statusLine.textContent = 'Не удалось обновить смены. Пробуем восстановить связь.';
  } finally {
    loading = false;
    if (refreshAgain) { refreshAgain = false; refresh(); }
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
  const liveDetail=event.target.closest('[data-live-detail]');
  if(liveDetail){openDetail(liveDetail.closest('.billboard-scene'),liveDetail.dataset.liveDetail);return;}
  const player = event.target.closest('[data-player]');
  if (player) { openPlayer(player); return; }
  const card = event.target.closest('.shift-open');
  if (card) openDetail(card.closest('[data-shift]'));
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
detailBody.addEventListener('click',event => {
  const period=event.target.closest('[data-player-period]');
  if (period && playerView) { playerPeriod=Number(period.dataset.playerPeriod);renderPlayer(); }
});
closeButton.onclick = () => closeDetail();
document.querySelector('#scrim').onclick = () => closeDetail();
document.addEventListener('keydown',event => {
  if (!activeCard && !playerView) return;
  if (event.key === 'Escape') closeDetail();
  if (event.key === 'Tab') {
    const buttons=[...detail.querySelectorAll('button')];
    const index=buttons.indexOf(document.activeElement);
    event.preventDefault();
    buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
  }
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
  billboard.classList.toggle('document-hidden',document.hidden);
  scheduleScene();
  sendPresence(!document.hidden);
  if (!document.hidden) refresh();
});
window.addEventListener('online',refresh);
window.addEventListener('offline',() => { if(token) statusLine.textContent='Нет сети. Показаны последние данные.'; });
window.addEventListener('pagehide',()=>sendPresence(false));
window.addEventListener('pageshow',event=>{if(event.persisted){sendPresence(!document.hidden);refresh();}});
setInterval(()=>{if(!document.hidden && receivedSnapshot) sendPresence(true);},15000);
let lastMinute;
setInterval(() => {
  if (document.hidden || !receivedSnapshot) return;
  paintClocks();
  paintBillboardClock();
  const minute = Math.floor(nowMs()/60000);
  if (lastMinute !== minute) { lastMinute = minute; render(true); }
},1000);
setInterval(() => { if (!document.hidden && !channelReady) refresh(); },5000);
setInterval(() => { if (!document.hidden && channelReady) refresh(); },60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

if (location.hash) history.replaceState(null,'',location.pathname);
if (token) refresh();
else showConnect('');
