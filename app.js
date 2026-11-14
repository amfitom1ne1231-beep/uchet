// Учёт 2.0 — интерфейс. Данные и расчет — в core.js.
'use strict';
/* ======================= МЕЛОЧИ ======================= */
const $=s=>document.querySelector(s);
const reduce=()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches;
const r2=v=>Math.round(v*100)/100;
// деньги крупно: тонкие цифры, копейки мельче и выше, без «,00»
function moneyHTML(v){
  const r=r2(Number(v)||0), a=Math.abs(r), int=Math.floor(a+1e-9), c=Math.round((a-int)*100);
  return '<span class="num">'+(r<0?'−':'')+String(int).replace(/\B(?=(\d{3})+(?!\d))/g,' ')+
    (c?'<span class="cents">,'+z2(c)+'</span>':'')+'<span class="cur">$</span></span>';
}
const m$=v=>money(r2(Number(v)||0)).replace(',00 $',' $');   // мелкие суммы текстом
function initials(name){
  const w=String(name||'?').trim().split(/\s+/).filter(Boolean);
  // как в «Контактах»: два слова — две буквы, одно — первая заглавная и вторая строчная (Sa, Ор, 00)
  if(w.length>1) return (w[0][0]+w[1][0]).toUpperCase();
  const x=w[0]||'?'; return x[0].toUpperCase()+(x[1]||'').toLowerCase();
}
const WD=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const MONFULL=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONGEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function dayLabel(ds){
  const t=today(), diff=Math.round((Date.parse(t+'T00:00Z')-Date.parse(ds+'T00:00Z'))/864e5);
  if(diff===0) return 'Сегодня'; if(diff===1) return 'Вчера';
  const d=new Date(ds+'T00:00Z'); return WD[d.getUTCDay()]+' '+dayText(ds);
}
const tHM=ms=>khParts(ms).t;
const dur=ms=>{ const m=Math.round(ms/60000), h=Math.floor(m/60); return h+':'+z2(m%60); };
const attendanceDuration=ms=>ms==null?'нет точного итога':ms===0?'0 мин':pauseText(Math.floor(ms/60000))||'меньше минуты';
function attendanceText(data){
  const date=khParts(data.start).d;
  const at=ms=>{ const p=khParts(ms); return (p.d===date?'':dayText(p.d)+', ')+p.t; };
  const timing=p=>data.unknownTimes?'':at(p.s)+'–'+(p.e==null?'сейчас':at(p.e));
  const total=ms=>(data.estimated&&ms!=null?'≈ ':'')+attendanceDuration(ms);
  const heading=(data.unknownTimes?'':timing({s:data.start,e:data.open?null:data.end})+' · ')+total(data.ms)+' без пауз';
  const groups=data.groups.filter(g=>g.rows.length).map(g=>({title:g.title,rows:g.rows.map(r=>{
    const intervals=r.intervals.map(p=>({time:timing(p),duration:total(p.ms)}));
    const range=intervals.length===1?intervals[0].time:'';
    return {name:r.name,duration:(range?range+' · ':'')+total(r.ms),intervals:intervals.length>1?intervals:[]};
  })}));
  return {heading,groups};
}
function attendanceHTML(data){
  const {heading,groups}=attendanceText(data);
  return '<div class="kv attendance-summary"><span>Вся смена</span><b>'+esc(heading)+'</b></div>'+
    groups.map(g=>'<span class="cap">'+g.title+'</span><div class="card attendance">'+
      g.rows.map(r=>'<div class="attendance-person"><div class="kv"><span>'+esc(r.name)+'</span><b>'+esc(r.duration)+'</b></div>'+
        r.intervals.map(p=>'<div class="kv attendance-interval"><span>'+esc(p.time)+'</span><b>'+esc(p.duration)+'</b></div>').join('')+
      '</div>').join('')+'</div>').join('');
}
async function copyAttendance(data){
  const {heading,groups}=attendanceText(data);
  const txt=dayText(khParts(data.start).d)+' · '+heading+'\n'+groups.map(g=>g.title+'\n'+
    g.rows.map(r=>r.name+' · '+r.duration+r.intervals.map(p=>'\n  '+p.time+' · '+p.duration).join('')).join('\n')).join('\n');
  try{ await navigator.clipboard.writeText(txt.trim()); toast('Время скопировано'); }
  catch(_){ toast('Не скопировалось',true); }
}
function liveAttendanceSheet(id){
  const get=()=>(S.live||[]).find(l=>l.id===id);
  const sh=openSheet({detent:'full'});
  sh.push({title:'Время по людям',live:true,render(b){
    if(!get()){ sh.close(); return; }
    b.innerHTML='<div data-attendance-live></div><button class="btn sec" data-copy-time style="margin-top:12px">Скопировать время</button>';
    paintLiveAttendance(b.querySelector('[data-attendance-live]'),get());
    b.querySelector('[data-copy-time]').onclick=()=>{ const l=get(); if(l) copyAttendance(liveAttendance(l,nowMs())); };
  }});
  sh.el.dataset.attendanceShift=id;
}
function paintLiveAttendance(el,l){
  const html=attendanceHTML(liveAttendance(l,nowMs()));
  if(el.attendanceHTML!==html){ el.innerHTML=html; el.attendanceHTML=html; }
}
function plural(n,a,b,c){ const x=n%10,y=n%100; return x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c); }
const freq=(kind)=>{   // кого чаще звали в последние 60 дней — наверх
  const from=new Date(Date.parse(today()+'T00:00Z')-60*864e5).toISOString().slice(0,10), n={};
  S.shifts.filter(s=>s.work_date>=from).forEach(s=>(kind==='w'?s.workerIds:s.customerIds).forEach(id=>n[id]=(n[id]||0)+1));
  return (kind==='w'?S.workers:S.customers).filter(x=>x.active!==false).slice().sort((a,b)=>(n[b.id]||0)-(n[a.id]||0)||String(a.name).localeCompare(b.name));
};

/* ======================= ЖИВОЙ ФОН ======================= */
// Под всеми экранами — переливающийся фон. Цвет рассказывает о состоянии раньше цифр:
// идёт смена — красный пульс, есть долги — янтарь, все рассчитаны — спокойный зелёно-синий.
// Ночью глубже и прохладнее, днём теплее; на «Сейчас» теплеет от заработанного за день.
// Двигаются только слои (transform/opacity): учёт свернут — фон стоит, «Уменьшить движение» — неподвижен.
const BG={live:'#ff3b30',live2:'#ff7a45',debt:'#d9a441',debt2:'#9a5d1e',calm:'#2f8f6a',calm2:'#1f5f8b',night:'#2a2f6b',warm:'#ffb35c'};
function todaySum(){ const t=today(); return S.shifts.filter(s=>s.work_date===t).reduce((a,s)=>a+(Number(s.total)||0),0); }
function updateBg(){
  const bg=$('#bg'); if(!bg) return;
  const live=(S.live||[]).some(l=>!l.finished_at), debt=debts().length>0, h=Number(khParts(nowMs()).t.slice(0,2)), night=h>=23||h<6;
  const c1=live?BG.live:debt?BG.debt:BG.calm, c2=live?(debt?BG.debt:BG.live2):debt?BG.debt2:BG.calm2, c3=night?BG.night:(debt&&live?BG.debt2:BG.calm2);
  bg.style.setProperty('--c1',c1); bg.style.setProperty('--c2',c2); bg.style.setProperty('--c3',c3);
  const warm=Math.min(1,todaySum()/1500);
  bg.style.setProperty('--warm',(tab==='now'?.12+.38*warm:.08).toFixed(2));
  bg.style.setProperty('--glow',(night?.55:.8)*(tab==='now'?1:.6)+'');
  bg.classList.toggle('pulse',live);
}
// волна света от пальца: старт смены — красная, сохранение — белая, расчёт — зелёная
let lastTap={x:innerWidth/2,y:innerHeight/2};
document.addEventListener('pointerdown',e=>{ lastTap={x:e.clientX,y:e.clientY}; },true);
function wave(color,x,y){
  if(reduce()) return;
  const bg=$('#bg'); if(!bg) return;
  const w=document.createElement('i'); w.className='wave';
  w.style.left=(x==null?lastTap.x:x)+'px'; w.style.top=(y==null?lastTap.y:y)+'px'; w.style.setProperty('--wc',color);
  bg.appendChild(w);
  w.animate([{transform:'translate(-50%,-50%) scale(.1)',opacity:.75},{transform:'translate(-50%,-50%) scale(9)',opacity:0}],{duration:1400,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>w.remove();
}
// глубина: фон уезжает медленнее карточек
function bgParallax(y){ const bg=$('#bg'); if(bg&&!reduce()) bg.style.setProperty('--py',(-Math.min(y,800)*.12).toFixed(1)+'px'); }
document.addEventListener('visibilitychange',()=>{ const bg=$('#bg'); if(bg) bg.classList.toggle('still',document.hidden); });

/* ======================= ЦВЕТ ЧЕЛОВЕКА ======================= */
// у каждого свой постоянный приглушённый оттенок — из имени
const PALETTE=['#8fb3ff','#a7d88b','#e8c07d','#f29bab','#c4a6f5','#8fd6f0','#86d8c4','#f5a97f','#b9c3ef','#9ee6df','#e6cf9a','#d2a8e8'];
function personColor(name){ let h=0; const s=String(name||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; }
const avHTML=(name,cls)=>{ const c=personColor(name); return '<div class="av '+(cls||'')+'" style="--pc:'+c+'">'+esc(initials(name))+'</div>'; };

/* ======================= СТЕКЛО ПЛИТОК: БЛИК И СВЕТ ПОД ПАЛЬЦЕМ ======================= */
// раз в несколько секунд по стеклу пробегает блик — у каждой плитки в своё время
function sheenDelay(){ return '--d:'+(-Math.random()*9).toFixed(1)+'s'; }
document.addEventListener('pointerdown',e=>{
  const t=e.target.closest('.sheen'); if(!t||reduce()) return;
  const r=t.getBoundingClientRect(); t.style.setProperty('--mx',(e.clientX-r.left)+'px'); t.style.setProperty('--my',(e.clientY-r.top)+'px');
  t.classList.add('lit'); const off=()=>{ setTimeout(()=>t.classList.remove('lit'),180); document.removeEventListener('pointerup',off,true); document.removeEventListener('pointercancel',off,true); };
  document.addEventListener('pointerup',off,true); document.addEventListener('pointercancel',off,true);
},true);

/* ======================= «СЕЙЧАС»: ВНИМАНИЕ, СЕГОДНЯ, МОИ ДЕНЬГИ, ЗА ЭТИМ СТОЛОМ ======================= */
// то, что нельзя упустить: появляется, только когда есть
function attentionItems(){
  const out=[];
  (S.live||[]).filter(l=>l.finished_at&&!hiddenIds.has(l.id)).forEach(l=>out.push({k:'fin',id:l.id,t:'Смена закончена, но не сохранена',s:tHM(Date.parse(l.started_at))+'–'+tHM(Date.parse(l.finished_at))}));
  const td=Date.parse(today()+'T00:00Z');
  debts().filter(d=>(td-Date.parse(d.oldest+'T00:00Z'))/864e5>7).slice(0,2).forEach(d=>out.push({k:'debt',id:d.id,
    t:cName(d.id)+' должен '+m$(d.total),s:'уже '+Math.round((td-Date.parse(d.oldest+'T00:00Z'))/864e5)+' дн.'}));
  const nc=S.shifts.filter(s=>!s.pending&&shiftStatus(s)==='none');
  if(nc.length) out.push({k:'nocust',id:nc.length===1?nc[0].id:null,t:nc.length===1?'Смена '+dayText(nc[0].work_date)+' без кастомеров':nc.length+' '+plural(nc.length,'смена','смены','смен')+' без кастомеров',s:'впиши, кто был'});
  const bad=queue.filter(q=>q.failed); if(bad.length) out.push({k:'queue',t:'Не записалось: '+bad.length,s:'разобраться'});
  if(isOwner){ const p=M.filter(m=>m.status==='pending'); if(p.length) out.push({k:'acc',t:'Запрос доступа: '+(p[0].name||'id '+p[0].tg_id)+(p.length>1?' и ещё '+(p.length-1):''),s:'решить'}); }
  return out;
}
function attentionHTML(){
  const it=attentionItems(); if(!it.length) return '';
  return '<div class="attn">'+it.map((x,i)=>'<button class="arow sheen tone-debt" data-attn="'+i+'" style="'+sheenDelay()+'"><span class="adot"></span><div class="mid"><div class="nm">'+esc(x.t)+'</div><div class="sm">'+esc(x.s)+'</div></div><span class="chev">›</span></button>').join('')+'</div>';
}
function bindAttention(sc){
  const it=attentionItems();
  sc.querySelectorAll('[data-attn]').forEach(b=>b.onclick=()=>{ const x=it[Number(b.dataset.attn)]; if(!x) return; haptic('tap');
    if(x.k==='fin'){ const l=S.live.find(z=>z.id===x.id); if(l) finishSheet(draftFromLive(l)); }
    else if(x.k==='debt') settleSheet(x.id);
    else if(x.k==='queue') $('#offbar').click();
    else if(x.k==='nocust'){ if(x.id) editShift(x.id); else { histSeg='shifts'; histChip='none'; histPer='a'; histQ=''; goTab('hist'); renderHist(); } }
    else if(x.k==='acc'){ const s=settingsSheet(); accessLevel(s); } });
}
// «Сегодня» — одной живой строкой
function todayHTML(){
  const t=today(), sh=S.shifts.filter(s=>s.work_date===t), sum=sh.reduce((a,s)=>a+(Number(s.total)||0),0), h=sh.reduce((a,s)=>a+s.hours,0);
  const live=(S.live||[]).filter(l=>!l.finished_at);
  return '<div class="todayln sheen tone-money" style="'+sheenDelay()+'"><span class="lb">Сегодня</span><b data-count="'+sum+'">'+moneyHTML(sum)+'</b><span class="t2">'+
    (sh.length?sh.length+' '+plural(sh.length,'смена','смены','смен')+' · '+h+' ч':'смен ещё не было')+(live.length?' · <span style="color:var(--live)">идёт '+live.length+'</span>':'')+'</span></div>';
}
// оператору — его деньги (узнаём по его Telegram)
function myWorker(){
  if(isOwner || !TG || !TG.initDataUnsafe || !TG.initDataUnsafe.user) return null;
  const me=String(TG.initDataUnsafe.user.id); return S.workers.find(w=>String(w.tg_id||'')===me)||null;
}
function myMoneyHTML(){
  const w=myWorker(); if(!w) return '';
  const wk=weekStart(), t=today(), all=personSessions('w',w.id);
  const week=all.filter(x=>x.s.work_date>=wk), day=all.filter(x=>x.s.work_date===t);
  return '<span class="cap">Мои деньги</span><div class="card sheen tone-ok mymoney" style="'+sheenDelay()+'">'+avHTML(w.name,'')+
    '<div class="mid"><div class="t2" style="font-size:13px">'+esc(w.name)+' · эта неделя</div><div class="v" data-count="'+week.reduce((a,x)=>a+x.amount,0)+'">'+moneyHTML(week.reduce((a,x)=>a+x.amount,0))+'</div>'+
    '<div class="t2" style="font-size:13px">'+Math.round(week.reduce((a,x)=>a+x.ms,0)/36e5*10)/10+' ч · сегодня '+m$(day.reduce((a,x)=>a+x.amount,0))+'</div></div></div>';
}
// «За этим столом»: старые долги тех, кто сейчас сидит
function tableDebtsHTML(){
  const ids=new Set(); (S.live||[]).forEach(l=>(l.customer_ids||[]).forEach(id=>ids.add(id)));
  const dl=debts().filter(d=>ids.has(d.id)); if(!dl.length) return '';
  return '<span class="cap">За этим столом</span>'+dl.map(d=>'<button class="arow sheen tone-debt" data-settle-c="'+d.id+'" style="'+sheenDelay()+'">'+avHTML(cName(d.id),'s')+
    '<div class="mid"><div class="nm">'+esc(cName(d.id))+' ещё должен</div><div class="sm">'+d.items.length+' '+plural(d.items.length,'смена','смены','смен')+' · с '+dayText(d.oldest)+'</div></div><b class="num" style="color:var(--debt)">'+m$(d.total)+'</b></button>').join('');
}

/* ======================= СООБЩЕНИЯ, «ОТМЕНИТЬ», ГАЛОЧКА ======================= */
let toastT;
function toast(text,err){
  const t=$('#toast'); t.textContent=text; t.classList.toggle('err',!!err); t.classList.add('on');
  if(err) haptic('err');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),err?3800:2400);
}
async function fail(error,what){
  const m=error&&error.message?error.message:String(error||'');
  const human=/[а-яё]/i.test(m) && !/[a-z_]{6,}/.test(m.replace(/[^\x00-\x7f]/g,' ').replace(/https?:\S+/g,''));
  toast(/row-level security|permission/i.test(m) ? 'Нет прав на запись' : human ? m.charAt(0).toUpperCase()+m.slice(1) : (what||'Не получилось')+(m&&isOwner?': '+m:''), true);
}
// Действие делается сразу, 5 секунд висит «Отменить». Новое «Отменить» закрепляет прежнее.
let undoCur=null, undoT=null;
function offerUndo(text,o){
  if(undoCur) finishUndo(true);
  undoCur=o;
  const u=$('#undo'), rg=u.querySelector('.rg');
  u.querySelector('.tx').textContent=text;
  rg.style.transition='none'; rg.style.strokeDashoffset='0'; void rg.getBoundingClientRect();
  rg.style.transition='stroke-dashoffset 5s linear'; rg.style.strokeDashoffset='56.55';
  u.classList.add('on');
  clearTimeout(undoT); undoT=setTimeout(()=>finishUndo(true),5000);
  syncSheets();
}
function finishUndo(commit,leaving){
  const o=undoCur; undoCur=null; clearTimeout(undoT);
  $('#undo').classList.remove('on');
  if(!o) return;
  try{ if(commit){ o.onCommit&&o.onCommit(leaving); } else { o.onUndo&&o.onUndo(); } }catch(e){}
  syncSheets();
}
$('#undo button').onclick=()=>{ haptic('ok'); finishUndo(false); };
(function(){   // смахнул плашку вниз — спряталась, действие осталось
  let y0=null; const u=$('#undo');
  u.addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; y0=e.clientY; });
  u.addEventListener('pointerup',e=>{ if(y0!=null && e.clientY-y0>20) finishUndo(true); y0=null; });
})();
document.addEventListener('visibilitychange',()=>{ if(document.hidden && undoCur) finishUndo(true,true); });
function showDone(){
  const d=$('#done'); d.classList.add('on'); haptic('ok'); wave('rgba(255,255,255,.5)',innerWidth/2,innerHeight/2); setTimeout(()=>sparkle(innerWidth/2,innerHeight/2,26),120);
  setTimeout(()=>d.classList.remove('on'),1200);
}
// число докручивается к новому значению
function rollTo(el,to,fmt,D0){
  if(!el) return;
  const from=Number(el.dataset.v||to); el.dataset.v=to;
  if(reduce()||Math.abs(from-to)<0.005){ el.innerHTML=fmt(to); return; }
  const t0=performance.now(), D=D0||450;
  (function step(t){ const k=Math.min(1,(t-t0)/D), e=1-Math.pow(1-k,3);
    el.innerHTML=fmt(from+(to-from)*e); if(k<1) requestAnimationFrame(step); })(t0);
}

/* ======================= ПАНЕЛИ СНИЗУ ======================= */
// Панель: половина экрана или весь; тянется за край, смах вниз закрывает, фон уходит вглубь.
// Внутри — уровни: следующий выезжает справа, назад — «‹» или смах от левого края.
const sheets=[];
function syncSheets(){
  document.body.classList.toggle('sheeted',sheets.length>0);
  sheets.forEach((s,i)=>s.el.classList.toggle('top',i===sheets.length-1));
  if(tgv('6.1')){ if(sheets.length) TG.BackButton.show(); else TG.BackButton.hide(); }
  // открыт черновик или ждет «Отменить» — Telegram переспросит перед закрытием
  if(tgv('6.2')) tgTry(()=> (sheets.some(x=>x.guard&&x.guard())||undoCur||queue.some(q=>!q.failed)) ? TG.enableClosingConfirmation() : TG.disableClosingConfirmation());
}
if(TG && tgv('6.1')) TG.BackButton.onClick(()=>{ const s=sheets[sheets.length-1]; if(!s) return; if(s.levels.length>1) s.pop(); else s.close(); });
$('#scrim').onclick=()=>{ const s=sheets[sheets.length-1]; if(s) s.close(); };
function openSheet(o){
  o=o||{};
  const el=document.createElement('div'); el.className='sheet';
  el.innerHTML='<div class="grab"></div><div class="levels"></div>';
  $('#sheets').appendChild(el);
  const H=()=>el.getBoundingClientRect().height;
  const sh={el:el, levels:[], detent:o.detent||'full', onClose:o.onClose};
  // карточка вырастает в панель и при закрытии сжимается обратно в неё
  const card=o.from&&!reduce()?o.from:null, r0=card?card.getBoundingClientRect():null;
  const clipOf=()=>{ const R=el.getBoundingClientRect(); return 'inset('+Math.max(0,r0.top-R.top)+'px '+Math.max(0,R.right-r0.right)+'px '+Math.max(0,R.bottom-r0.bottom)+'px '+Math.max(0,r0.left-R.left)+'px round 22px)'; };
  const posOf=d=> d==='half' ? H()*0.42 : 0;
  sh.set=function(d){ sh.detent=d; el.style.transform='translateY('+posOf(d)+'px)'; };
  sh.close=function(force){
    if(sh.closed) return;
    if(!force && sh.guard && sh.guard()){
      sh.set(sh.detent);
      ask('Закрыть без сохранения? Изменения пропадут.').then(ok=>{ if(ok) sh.close(true); });
      return;
    }
    sh.closed=true;
    const i=sheets.indexOf(sh); if(i>=0) sheets.splice(i,1);
    // карточку могли перерисовать — ищем её двойника; удалили — панель просто уезжает вниз
    const tgt=card&&(card.isConnected?card:card.dataset.shift?document.querySelector('#scrHist [data-shift="'+card.dataset.shift+'"]'):null);
    if(tgt && /translateY\(0(px)?\)/.test(el.style.transform) && !el.classList.contains('drag')){
      tgt.style.visibility='hidden';
      el.classList.add('morph'); const lv=el.querySelector('.levels');
      el.animate([{clipPath:'inset(0px 0px 0px 0px round 22px)'},{clipPath:clipOf()}],{duration:380,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'});
      lv.animate([{opacity:1},{opacity:0,offset:.5},{opacity:0}],{duration:380,fill:'forwards'});
      syncSheets(); setTimeout(()=>{ el.remove(); card.style.visibility=''; tgt.style.visibility=''; },370);
    } else {
      el.classList.add('closing'); el.style.transform='translateY(100%)';
      syncSheets(); setTimeout(()=>el.remove(),320);
      if(card) card.style.visibility='';
    }
    if(sh.onClose) sh.onClose();
  };
  sh.push=function(lv){
    const L=document.createElement('div'); L.className='level';
    const first=!sh.levels.length;
    L.innerHTML='<div class="lh">'+(first?'':'<button class="back">‹ Назад</button>')+'<h2></h2>'+(first?'<button class="x" aria-label="Закрыть">✕</button>':'')+'</div><div class="lc"></div>';
    L.querySelector('h2').textContent=lv.title||'';
    el.querySelector('.levels').appendChild(L);
    const prev=sh.levels[sh.levels.length-1];
    const lvl={el:L, body:L.querySelector('.lc'), spec:lv, render:()=>{ lv.render(lvl.body,lvl,sh); }};
    sh.levels.push(lvl);
    lvl.setTitle=t=>L.querySelector('h2').textContent=t;
    if(!first && sh.detent==='half') sh.set('full');
    if(!first){ L.classList.add('enter'); requestAnimationFrame(()=>requestAnimationFrame(()=>{ L.classList.remove('enter'); prev.el.classList.add('under'); })); }
    const b=L.querySelector('.back'); if(b) b.onclick=()=>sh.pop();
    const x=L.querySelector('.x'); if(x) x.onclick=()=>sh.close();
    edgeBack(L,sh);
    lvl.render();
    return lvl;
  };
  sh.pop=function(){
    if(sh.levels.length<2){ sh.close(); return; }
    const cur=sh.levels.pop(), prev=sh.levels[sh.levels.length-1];
    cur.el.classList.add('enter'); prev.el.classList.remove('under');
    setTimeout(()=>cur.el.remove(),420);
    if(cur.spec.onPop) cur.spec.onPop();
    if(prev.spec.onBack) prev.spec.onBack(); else prev.render();
  };
  sh.top=()=>sh.levels[sh.levels.length-1];
  sheets.push(sh); syncSheets();
  if(card){
    el.classList.add('morph'); el.style.transform='translateY(0px)';
    const from=clipOf(); card.style.visibility='hidden';
    el.animate([{clipPath:from},{clipPath:'inset(0px 0px 0px 0px round 22px)'}],{duration:480,easing:'cubic-bezier(.32,.72,0,1)'}).onfinish=()=>el.classList.remove('morph');
    el.querySelector('.levels').animate([{opacity:0,transform:'translateY('+Math.round(r0.top-el.getBoundingClientRect().top)*0.25+'px)'},{opacity:0,offset:.25},{opacity:1,transform:'none'}],{duration:480,easing:'cubic-bezier(.32,.72,0,1)'});
  } else {
    el.style.transform='translateY(100%)';
    requestAnimationFrame(()=>requestAnimationFrame(()=>sh.set(sh.detent)));
  }
  sheetDrag(sh);
  haptic('tap');
  return sh;
}
// тянуть панель: за ручку и шапку всегда, за содержимое — когда оно прокручено до верха
function sheetDrag(sh){
  const el=sh.el; let y0=null, t0=0, base=0, last=0, lastT=0, vy=0, fromContent=false, startScroll=0;
  const start=(y,content,lc)=>{ y0=y; t0=lastT=performance.now(); last=y; vy=0; fromContent=content;
    const m=/translateY\(([-\d.]+)px\)/.exec(el.style.transform); base=m?Number(m[1]):0; startScroll=lc?lc.scrollTop:0; };
  el.addEventListener('pointerdown',e=>{
    if(e.target.closest('.grab,.lh') && !e.target.closest('button')){ start(e.clientY,false); el.classList.add('drag'); el.setPointerCapture(e.pointerId); }
  });
  el.addEventListener('pointermove',e=>{
    if(y0==null||fromContent) return;
    move(e.clientY);
  });
  const move=y=>{
    let dy=y-y0; const t=performance.now(); vy=(y-last)/Math.max(1,t-lastT); last=y; lastT=t;
    let p=base+dy; if(p<0) p=p/3;   // выше верха — тугая резинка
    el.style.transform='translateY('+p+'px)';
  };
  const end=()=>{
    if(y0==null) return;
    el.classList.remove('drag');
    const H=el.getBoundingClientRect().height, m=/translateY\(([-\d.]+)px\)/.exec(el.style.transform), p=m?Number(m[1]):0;
    y0=null;
    if(vy>0.9 || p>H*0.62) return sh.close();
    if(vy<-0.6) return sh.set('full');
    sh.set(p>H*0.21 ? 'half' : 'full');
  };
  el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
  // содержимое: тянем вниз от верха — панель едет
  el.addEventListener('touchstart',e=>{
    const lc=e.target.closest('.level'); if(!lc || e.target.closest('.wheel,.slider,.days,.pills,.people,input,textarea')) return;
    if(lc.scrollTop<=0){ start(e.touches[0].clientY,true,lc); }
  },{passive:true});
  el.addEventListener('touchmove',e=>{
    if(y0==null||!fromContent) return;
    const dy=e.touches[0].clientY-y0;
    if(dy>6){ el.classList.add('drag'); if(e.cancelable) e.preventDefault(); move(e.touches[0].clientY); }
    else if(dy<-4){ y0=null; }
  },{passive:false});
  el.addEventListener('touchend',()=>{ if(fromContent&&y0!=null){ if(el.classList.contains('drag')) end(); else y0=null; } });
}
// смах от левого края — на уровень назад
function edgeBack(L,sh){
  let x0=null,y0=0;
  L.addEventListener('touchstart',e=>{ const t=e.touches[0]; if(t.clientX<24 && sh.levels.length>1){ x0=t.clientX; y0=t.clientY; } },{passive:true});
  L.addEventListener('touchmove',e=>{ if(x0==null) return; const t=e.touches[0], dx=t.clientX-x0;
    if(Math.abs(t.clientY-y0)>Math.abs(dx)){ x0=null; L.style.transform=''; return; }
    if(dx>0){ L.style.transition='none'; L.style.transform='translateX('+dx+'px)'; } },{passive:true});
  L.addEventListener('touchend',e=>{ if(x0==null) return; const dx=e.changedTouches[0].clientX-x0; x0=null;
    L.style.transition=''; L.style.transform='';
    if(dx>L.clientWidth*0.33) sh.pop(); });
}

/* ======================= ЖЕСТЫ ======================= */
// Смах карточки: вправо — главное действие (полоса за пальцем, на 40% ширины — сработало),
// влево — открываются кнопки. Долгое нажатие — меню.
let openSwipe=null;
function swipeable(wrap,o){
  const face=wrap.querySelector('.face'); let x0=null,y0=0,dx=0,horiz=null,startX=0,armed=false;
  const W=()=>wrap.clientWidth, LW=()=>{ const l=wrap.querySelector('.under .l'); return l?l.scrollWidth+22:0; };
  const set=(x,anim)=>{ face.style.transition=anim?'transform .4s var(--spring)':'none'; face.style.transform=x?'translateX('+x+'px)':'';
    wrap.classList.toggle('r-on',x>0); wrap.classList.toggle('l-on',x<0); };
  face.addEventListener('pointerdown',e=>{
    if(openSwipe && openSwipe!==wrap){ openSwipe._close(); }
    x0=e.clientX; y0=e.clientY; horiz=null; armed=false;
    const m=/translateX\(([-\d.]+)px/.exec(face.style.transform); startX=m?Number(m[1]):0;
  });
  face.addEventListener('pointermove',e=>{
    if(x0==null) return;
    const ddx=e.clientX-x0, ddy=e.clientY-y0;
    if(horiz==null){ if(Math.abs(ddx)>10||Math.abs(ddy)>8){ horiz=Math.abs(ddx)>Math.abs(ddy)*1.6; if(horiz) face.setPointerCapture(e.pointerId); else { x0=null; return; } } else return; }
    if(!horiz) return;
    dx=startX+ddx;
    if(dx>0 && !o.right) dx=0;
    if(dx<0 && !o.left) dx=0;
    if(dx<-LW()) dx=-LW()+(dx+LW())/4;
    set(dx,false);
    const on=dx>W()*0.4;
    if(on!==armed){ armed=on; haptic(on?'soft':'pick'); }
  });
  const up=()=>{
    if(x0==null) return; x0=null;
    if(!horiz){ return; }
    if(dx>W()*0.4 && o.right){ set(W(),true); setTimeout(()=>{ o.right(); },220); dx=0; return; }
    if(dx<-50 && o.left){ set(-LW(),true); openSwipe=wrap; dx=-LW(); return; }
    set(0,true); dx=0;
  };
  face.addEventListener('pointerup',up); face.addEventListener('pointercancel',up);
  face.addEventListener('click',e=>{ if(Math.abs(dx)>4 || horiz){ e.stopPropagation(); e.preventDefault(); if(dx<0){ wrap._close(); } horiz=null; return; } },true);
  wrap._close=()=>{ set(0,true); dx=0; if(openSwipe===wrap) openSwipe=null; };
  wrap._reset=()=>{ face.style.transition='none'; face.style.transform=''; wrap.classList.remove('r-on','l-on'); dx=0; };
}
document.addEventListener('pointerdown',e=>{ if(openSwipe && !openSwipe.contains(e.target)) openSwipe._close(); },true);
function longPress(el,fn){
  let t=null,x=0,y=0;
  el.addEventListener('pointerdown',e=>{ x=e.clientX;y=e.clientY; t=setTimeout(()=>{ t=null; el._lp=true; haptic('hard'); fn(e); },460); });
  const cancel=()=>{ if(t){ clearTimeout(t); t=null; } };
  el.addEventListener('pointermove',e=>{ if(Math.abs(e.clientX-x)>8||Math.abs(e.clientY-y)>8) cancel(); });
  el.addEventListener('pointerup',cancel); el.addEventListener('pointercancel',cancel);
  el.addEventListener('click',e=>{ if(el._lp){ el._lp=false; e.stopPropagation(); e.preventDefault(); } },true);
  el.addEventListener('contextmenu',e=>e.preventDefault());
}
// меню с размытием фона: карточка приподнимается, рядом действия
function contextMenu(card,acts){
  const m=$('#menu'), r=card.getBoundingClientRect();
  const clone=card.cloneNode(true); clone.classList.add('lift'); clone.style.top=r.top+'px'; clone.style.height=r.height+'px';
  const box=document.createElement('div'); box.className='acts glass';
  const below=r.bottom+12+acts.length*50<innerHeight-40;
  box.style.top=(below?r.bottom+10:Math.max(20,r.top-10-acts.length*50))+'px';
  acts.forEach(a=>{ const b=document.createElement('button'); b.innerHTML=esc(a.label)+'<span>'+(a.icon||'')+'</span>'; if(a.danger) b.className='del';
    b.onclick=ev=>{ ev.stopPropagation(); close(); haptic('tap'); a.fn(); }; box.appendChild(b); });
  m.innerHTML=''; m.appendChild(clone); m.appendChild(box); m.classList.add('on');
  const close=()=>{ m.classList.remove('on'); m.innerHTML=''; };
  m.onclick=close;
}

/* ======================= ПОЛЗУНОК «ПРОТЯНИ» ======================= */
// Тянешь кружок вправо — текст тает, полоса светлеет. Дотянул — двойная вибрация и действие.
function sliderHTML(label,attr){ return '<div class="slider" '+(attr||'')+'><div class="fill"></div><div class="lbl">'+esc(label)+'</div>'+
  '<div class="knob"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div></div>'; }
function bindSlider(sl,fn){
  const knob=sl.querySelector('.knob'), fill=sl.querySelector('.fill'), lbl=sl.querySelector('.lbl');
  let x0=null, max=0, x=0;
  const set=v=>{ x=v; knob.style.transform='translateX('+v+'px)'; fill.style.width=(v+56)+'px'; lbl.style.opacity=String(1-v/max*1.3); };
  let busy=false;
  knob.addEventListener('pointerdown',e=>{ if(busy) return; x0=e.clientX; max=sl.clientWidth-60; sl.classList.remove('go'); try{ knob.setPointerCapture(e.pointerId); }catch(_){} haptic('tap'); });
  knob.addEventListener('pointermove',e=>{ if(x0==null) return; set(Math.max(0,Math.min(max,e.clientX-x0))); });
  const up=()=>{ if(x0==null) return; x0=null; sl.classList.add('go');
    if(x>=max*0.88){ set(max); haptic('double'); busy=true; sl.classList.add('busy');
      setTimeout(async()=>{ try{ await fn(); }finally{ busy=false; sl.classList.remove('busy'); if(sl.isConnected){ set(0); lbl.style.opacity=''; } } },120); }
    else { set(0); lbl.style.opacity=''; } };
  knob.addEventListener('pointerup',up); knob.addEventListener('pointercancel',up);
}

/* ======================= БАРАБАНЫ ВРЕМЕНИ И КЛАВИАТУРА ======================= */
function wheelHTML(n,step,val,attr){
  let h='<div class="pad"></div><div class="pad"></div>';
  for(let i=0;i<n;i+=step) h+='<div data-v="'+i+'">'+z2(i)+'</div>';
  return '<div class="wheel" '+attr+'>'+h+'<div class="pad"></div><div class="pad"></div></div>';
}
function bindWheel(w,val,onChange){
  const items=[...w.querySelectorAll('[data-v]')];
  let idx=Math.max(0,items.findIndex(x=>Number(x.dataset.v)===val)); if(idx<0) idx=0;
  requestAnimationFrame(()=>{ w.scrollTop=idx*44; });
  let tm=null;
  w.addEventListener('scroll',()=>{
    const i=Math.round(w.scrollTop/44);
    if(i!==idx && i>=0 && i<items.length){ idx=i; haptic('pick'); }
    clearTimeout(tm); tm=setTimeout(()=>onChange(Number(items[Math.min(items.length-1,Math.max(0,idx))].dataset.v)),90);
  },{passive:true});
}
// закрыть уровень выбора и отдать значение; если следом не открылся новый уровень — перерисовать тот, куда вернулись
function afterPick(sh,fn){ sh.pop(); const n=sh.levels.length; fn(); if(sh.levels.length===n){ const t=sh.top(); if(t) t.render(); } }
// уровень «время»: барабаны ч:мм (+ дни, если нужно); результат — момент по Камбодже
function pickTime(sh,o){
  sh.push({title:o.title, render(b){
    const p=khParts(o.value); let day=p.d, hh=Number(p.t.slice(0,2)), mm=Number(p.t.slice(3,5));
    let daysHtml='';
    if(o.days){ const t=Date.parse(today()+'T00:00Z'); daysHtml='<div class="days">'+
      Array.from({length:21},(_,i)=>new Date(t-(20-i)*864e5).toISOString().slice(0,10)).map(d=>{ const dd=new Date(d+'T00:00Z');
        return '<button data-d="'+d+'" aria-pressed="'+(d===day)+'"><span>'+WD[dd.getUTCDay()]+'</span><b>'+dd.getUTCDate()+'</b></button>'; }).join('')+'</div>'; }
    b.innerHTML=(o.lead?'<div class="lead">'+o.lead+'</div>':'')+daysHtml+
      '<div class="wheels">'+wheelHTML(24,1,hh,'data-h')+'<div class="sep">:</div>'+wheelHTML(60,1,mm,'data-m')+'</div>'+
      '<button class="btn" data-ok>Готово</button>';
    bindWheel(b.querySelector('[data-h]'),hh,v=>hh=v);
    bindWheel(b.querySelector('[data-m]'),mm,v=>mm=v);
    const dz=b.querySelector('.days'); if(dz){ requestAnimationFrame(()=>dz.scrollLeft=dz.scrollWidth);
      dz.onclick=e=>{ const x=e.target.closest('[data-d]'); if(!x) return; day=x.dataset.d; haptic('pick');
        dz.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===x)); }; }
    b.querySelector('[data-ok]').onclick=()=>{
      const at=w=>{ const it=w.querySelectorAll('[data-v]'); return Number(it[Math.max(0,Math.min(it.length-1,Math.round(w.scrollTop/44)))].dataset.v); };
      hh=at(b.querySelector('[data-h]')); mm=at(b.querySelector('[data-m]'));
      const t=z2(hh)+':'+z2(mm);
      const ms=o.days ? khToMs(day,t) : khNear(t,o.ref||o.value);
      haptic('tap'); afterPick(sh,()=>o.onPick(ms));
    };
  }});
}
// уровень «сумма»: большая цифра и своя клавиатура
function pickAmount(sh,o){
  sh.push({title:o.title, render(b){
    let s=o.value>0?String(r2(o.value)).replace('.',','):'';
    b.innerHTML=(o.lead?'<div class="lead">'+o.lead+'</div>':'')+'<div class="amtbig" data-v></div>'+
      '<div class="quick">'+(o.quick||[]).map(q=>'<button data-q="'+q.v+'">'+esc(q.l)+'</button>').join('')+'</div>'+
      '<div class="keypad">'+['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(k=>'<button data-k="'+k+'">'+k+'</button>').join('')+'</div>'+
      '<button class="btn" data-ok style="margin-top:14px">Готово</button>';
    const show=()=>{ const v=parseAmt(s); b.querySelector('[data-v]').innerHTML=moneyHTML(v); b.querySelector('[data-ok]').disabled=!(v>0||o.allowZero); };
    show();
    b.querySelector('.keypad').onclick=e=>{ const k=e.target.closest('[data-k]'); if(!k) return; haptic('pick');
      const x=k.dataset.k;
      if(x==='⌫') s=s.slice(0,-1); else if(x===','){ if(!s.includes(',')) s=(s||'0')+','; }
      else { if(/,\d\d$/.test(s)) return; s=(s==='0'?'':s)+x; }
      show(); };
    b.querySelector('.quick').onclick=e=>{ const q=e.target.closest('[data-q]'); if(!q) return; haptic('pick'); s=String(r2(Number(q.dataset.q))).replace('.',','); show(); };
    b.querySelector('[data-ok]').onclick=()=>{ let v=parseAmt(s); if(o.max!=null) v=Math.min(v,o.max); haptic('tap'); afterPick(sh,()=>o.onPick(r2(v))); };
  }});
}

/* ======================= ВКЛАДКИ И ПРОКРУТКА ======================= */
let tab='now';
function goTab(name){
  if(name===tab) { const sc=name==='now'?$('#scrNow'):$('#scrHist'); sc.scrollTo({top:0,behavior:reduce()?'auto':'smooth'}); return; }
  haptic('pick'); tab=name;
  $('#scrNow').classList.toggle('off-l',name!=='now');
  $('#scrHist').classList.toggle('off-r',name!=='hist');
  document.querySelectorAll('#nav .nt').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===name));
  syncMini();
  if(dirtyScr[name]){ dirtyScr[name]=false; name==='now'?renderNow():renderHist(); }
  moveInd(); renderDrawer(); updateBg(); bgParallax((name==='now'?$('#scrNow'):$('#scrHist')).scrollTop);
  rise(name==='now'?$('#scrNow'):$('#scrHist'));
}
document.querySelectorAll('#nav .nt').forEach(b=>b.onclick=()=>goTab(b.dataset.tab));
$('#gear').onclick=()=>settingsSheet();
function syncMini(){
  const sc=tab==='now'?$('#scrNow'):$('#scrHist');
  $('#mini').textContent=tab==='now'?'Учёт':'История';
  $('#mini').classList.toggle('on',sc.scrollTop>44);
}
['#scrNow','#scrHist'].forEach(function(id){
  const sc=$(id); let last=0;
  sc.addEventListener('scroll',()=>{
    const y=sc.scrollTop; syncMini(); bgParallax(y);
    if(id==='#scrNow' && !reduce()){ const au=sc.querySelector('.aurora'), he=sc.querySelector('.hero');
      if(au) au.style.transform='translateY('+(y*.45)+'px)'; if(he){ he.style.opacity=String(Math.max(0,1-y/220)); he.style.transform='scale('+Math.max(.9,1-y/1400)+')'; } }
    if(y>80 && y-last>6) $('#nav').classList.add('slim'); else if(last-y>6 || y<40) $('#nav').classList.remove('slim');
    last=y;
  },{passive:true});
});

/* ======================= СЕЙЧАС ======================= */
const liveRows=()=>(S.live||[]).slice().sort((a,b)=>(!!b.finished_at-!!a.finished_at)||(Date.parse(a.started_at)-Date.parse(b.started_at)));
const lLog=l=>Array.isArray(l.customer_log)?l.customer_log:[];
const wLogOf=l=>Array.isArray(l.worker_log)?l.worker_log:[];
const seated=(l,id)=>lLog(l).some(x=>x.id===id&&!x.e) || (!l.finished_at && (l.customer_ids||[]).includes(id) && !lLog(l).some(x=>x.id===id));
const working=(l,id)=>wLogOf(l).some(x=>x.id===id&&!x.e) || (!l.finished_at && (l.worker_ids||[]).includes(id) && !wLogOf(l).some(x=>x.id===id));
const RC=2*Math.PI*120;
let liveIdx=0;
function renderNow(){
  const sc=$('#scrNow');
  // шапка говорит о том, что сейчас происходит: без смены здоровается, на смене — её состояние (paintHead)
  const head='<div class="big"><div class="nowwrap"><h1 class="nowhead" data-nowhead></h1><div class="sub" data-day></div></div></div>';
  if(booting && !S.shifts.length && !S.live.length){ sc.innerHTML=head+'<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; paintHead(); return; }
  const lives=liveRows();
  if(lives.length){
    if(liveIdx>=lives.length) liveIdx=0;
    const dl=debts(), tot=dl.reduce((a,x)=>a+x.total,0);
    sc.innerHTML=head+'<div class="carousel" id="car">'+lives.map(liveCardHTML).join('')+'</div>'+
      (lives.length>1?'<div class="dots">'+lives.map((_,i)=>'<i class="'+(i===liveIdx?'on':'')+'"></i>').join('')+'</div>':'');
    const car=$('#car');
    requestAnimationFrame(()=>{ car.scrollLeft=liveIdx*car.clientWidth; });
    car.addEventListener('scroll',()=>{ const i=Math.round(car.scrollLeft/Math.max(1,car.clientWidth)); if(i!==liveIdx){ liveIdx=i; haptic('pick');
      document.querySelectorAll('.dots i').forEach((d,k)=>d.classList.toggle('on',k===i)); paintHead(); } },{passive:true});
    car.querySelectorAll('.lcard').forEach(bindLiveCard);
    tickLive(); paintHead(); renderDrawer(); syncDock();
    return;
  }
  sc.innerHTML=head+dashboardHTML();
  bindDashboard(sc); paintHead(); renderDrawer(); syncDock();
}
// кто открыл учёт: владелец — оператор «это я», остальные — оператор, к которому привязан их Telegram, иначе имя из Telegram
function myName(){
  if(isOwner){ const w=S.workers.find(w=>w.is_me&&w.active!==false); return w?w.name:''; }
  const tu=TG&&TG.initDataUnsafe&&TG.initDataUnsafe.user, id=String((tu&&tu.id)||(user&&user.app_metadata&&user.app_metadata.tg_id)||'');
  const w=id&&S.workers.find(w=>String(w.tg_id||'')===id&&w.active!==false);
  return w?w.name:((tu&&tu.first_name)||'');
}
// что сказать в шапке «Сейчас»: смены нет — приветствие по времени суток, смена на экране — её состояние
function headState(){
  const lives=liveRows(), l=lives.length?lives[Math.min(liveIdx,lives.length-1)]:null, day=longDate();
  if(l){
    const from=tHM(Date.parse(l.started_at));
    if(l.finished_at) return {t:'Смена закончена',dot:'debt',sub:day+' · '+from+'–'+tHM(Date.parse(l.finished_at))+' · ждёт сохранения'};
    return l.paused_at?{t:'Пауза',dot:'debt',sub:day+' · с '+from}:{t:'Идёт смена',dot:'live',sub:day+' · с '+from};
  }
  if(booting && !S.workers.length) return {t:'',dot:'',sub:day};   // пока данные не пришли — молчим, чтобы не здороваться дважды (сначала без имени, потом с именем)
  const h=Number(khParts(nowMs()).t.slice(0,2)), nm=myName();
  return {t:(h>=5&&h<12?'Доброе утро':h>=12&&h<18?'Добрый день':h>=18&&h<23?'Добрый вечер':'Доброй ночи')+(nm?', '+nm:''),dot:'',sub:day};
}
// фраза меняется перекатом (старая уходит вверх, новая поднимается), в остальное время стоит неподвижно
let headLast=null;
function paintHead(){
  const h=document.querySelector('#scrNow [data-nowhead]'); if(!h) return;
  const st=headState(), key=st.dot+'|'+st.t, html=(st.dot?'<span class="dot '+st.dot+'"></span>':'')+'<span class="tx">'+esc(st.t)+'</span>';
  const day=document.querySelector('#scrNow [data-day]'); if(day && day.textContent!==st.sub) day.textContent=st.sub;
  const cur=h.querySelector('.ph:not(.out)');
  if(!st.t || (cur && cur.dataset.k===key)) return;
  // длинное имя не переносим: сначала чуть уменьшаем шрифт, не помогло — оставляем от имени первое слово
  const fit=el=>{ const tx=el.querySelector('.tx'), over=()=>{ const r=document.createRange(); r.selectNodeContents(tx); return r.getBoundingClientRect().width>tx.getBoundingClientRect().width+.3; };
    const shrink=()=>{ let fs=34; el.style.fontSize=''; while(over() && fs>25){ fs-=1; el.style.fontSize=fs+'px'; } };
    shrink(); const m=over()&&st.t.match(/^(.+?, \S+)\s/); if(m){ tx.textContent=m[1]; shrink(); } };
  const ph=document.createElement('span'); ph.className='ph'; ph.dataset.k=key; ph.innerHTML=html;
  // движение — только когда фраза правда сменилась (а не при первой отрисовке и не при уменьшенном движении)
  const anim=headLast!==key && !reduce() && !document.hidden;
  if(cur){ if(anim){ cur.classList.add('out'); setTimeout(()=>cur.remove(),420); } else cur.remove(); }
  else h.querySelectorAll('.ph').forEach(x=>x.remove());
  h.appendChild(ph); fit(ph); if(anim) ph.classList.add('in');
  headLast=key;
}
function longDate(){ const t=today(), d=new Date(t+'T00:00Z');
  return ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][d.getUTCDay()]+', '+d.getUTCDate()+' '+MONGEN[d.getUTCMonth()]; }

function personHTML(l,id,kind){
  const on=kind==='c'?seated(l,id):working(l,id), nm=kind==='c'?cName(id):wName(id);
  return '<button class="pp '+(on?'on':'off')+'" data-p="'+kind+'|'+id+'" aria-label="'+esc(nm)+(kind==='c'?(on?', за столом':', встал'):(on?', на смене':', сменился'))+'"><div class="av" style="--pc:'+personColor(nm)+'">'+esc(initials(nm))+
    (kind==='c'&&l.payer_id===id?'<i class="coin">$</i>':'')+'</div><div class="pn">'+esc(nm)+'</div><div class="tm num" data-ptm="'+kind+'|'+id+'">'+pTime(l,id,kind)+'</div></button>';
}
// под кружком: сколько насидел и сколько это стоит к этой минуте
function pTime(l,id,kind){
  const now=nowMs(), on=kind==='c'?seated(l,id):working(l,id);
  const sp=(kind==='c'?livePlayerSpans(l,now):liveWorkerSpans(l,now)).find(z=>z.id===id);
  const ms=sp?spanLen(spanMinus(sp.spans,livePauseSpans(l,now))):0;
  if(!on && ms<=60e3) return '—';
  const x=liveSummary(l,now), r=(kind==='c'?liveSplit(l,x.c.total,now):liveWorkerSplit(l,x.c.total/2,now)).res.find(z=>z.id===id);
  return dur(ms)+(r&&r.amount>0.004?'<em>'+m$(r.amount)+'</em>':'');
}
const pauseBtnHTML=paused=>'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+
  (paused?'<path d="M7 4.5v15l13-7.5z"/>':'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>')+
  '</svg>'+(paused?'Продолжить':'Пауза');
// Обновляем карточку на месте, чтобы часы и фокус кнопки не сбрасывались.
function paintPause(card,l){
  const p=!!l.paused_at;
  card.classList.toggle('paused',p);
  const pb=card.querySelector('[data-pause]'); if(pb) pb.innerHTML=pauseBtnHTML(p);
  tickLive(); paintHead(); syncDock(); tellNative(true);
}
const pauseQ={};   // ответы сервера по паузе: по одной очереди на смену
function liveCardHTML(l){
  const fin=!!l.finished_at, paused=!!l.paused_at&&!fin, x=liveSummary(l,nowMs());
  if(fin){
    return '<div class="card lcard fin sheen tone-debt" data-live="'+l.id+'">'+
      '<div class="hero" style="text-align:center;padding:18px 0 8px"><div class="v">'+moneyHTML(x.c.total)+'</div>'+
      '<div class="s">'+x.h+' '+hourWord(x.h)+' · '+tHM(x.s)+'–'+tHM(x.e)+' · '+esc((l.worker_ids||[]).map(wName).join(', '))+'</div></div>'+
      '<button class="moneyline" data-attendance style="width:100%"><span>Время по людям</span><span class="chev" aria-hidden="true">›</span></button>'+
      (locked?'':'<button class="btn" data-open-fin style="margin-top:12px">Открыть итог</button>')+'</div>';
  }
  const ring='<svg viewBox="0 0 260 260" aria-hidden="true"><circle class="tr" cx="130" cy="130" r="120" fill="none" stroke-width="5"/>'+
    '<circle class="pg zero" data-ring cx="130" cy="130" r="120" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="'+RC.toFixed(2)+'" stroke-dashoffset="'+RC.toFixed(2)+'"/>'+
    '<line stroke-linecap="round" class="notch" x1="244" y1="130" x2="247" y2="130" stroke-width="2" transform="rotate(180 130 130)"/></svg>';
  const ws=l.worker_ids||[], cs=l.customer_ids||[];
  return '<div class="card lcard '+(paused?'paused':'')+'" data-live="'+l.id+'">'+
    '<div class="ringbox">'+ring+'<div class="ringin"><div class="clock num" data-clock>0:00:00</div>'+
      '<div class="k">к оплате <b data-due></b></div><div class="pz num" data-pz></div></div></div>'+
    (locked?'':'<button class="pausebtn" data-pause>'+pauseBtnHTML(paused)+'</button>')+
    '<span class="cap">Кастомеры</span><div class="people">'+cs.map(id=>personHTML(l,id,'c')).join('')+
      (locked?'':'<button class="pp add" data-add="c"><div class="av">+</div><div class="tm"></div></button>')+'</div>'+
    '<span class="cap">Операторы</span><div class="people">'+ws.map(id=>{ const lg=wLogOf(l), me=lg.filter(x=>x.id===id&&x.e).pop();
      const by=me&&lg.find(x=>x.id!==id&&Math.abs(Date.parse(x.s)-Date.parse(me.e))<5*60e3);
      return personHTML(l,id,'w')+(by&&!working(l,id)?'<span class="swap" title="сменил">→</span>':''); }).join('')+
      (locked?'':'<button class="pp add" data-add="w"><div class="av">+</div><div class="tm"></div></button>')+'</div>'+
    '<button class="moneyline" data-attendance style="width:100%"><span>Время по людям</span><span class="chev" aria-hidden="true">›</span></button>'+
    '<button class="moneyline" data-money aria-expanded="false" style="width:100%"><span>Разбивка оплаты</span><span class="chev" aria-hidden="true">⌄</span></button>'+
    '<div class="mdet"><div data-mdet></div></div>'+
    (locked?'':sliderHTML('закончить смену','data-finish'))+
  '</div>';
}
function liveMoneyHTML(l){
  const now=nowMs(), x=liveSummary(l,now), sp=liveSplit(l,x.c.total,now), ws=liveWorkerSplit(l,x.c.total/2,now);
  const pauseSec=(Number(l.pause_sec)||0)+(l.paused_at?Math.max(0,now-Date.parse(l.paused_at))/1000:0);
  return '<div style="padding:4px 0 6px">'+sp.res.map(r=>'<div class="kv"><span>'+esc(cName(r.id))+(l.payer_id===r.id?' · платит за всех':'')+'</span><b>'+m$(r.amount)+'</b></div>').join('')+
    '<div class="kv"><span>Касса</span><b>'+m$(x.c.kassa)+'</b></div>'+
    ws.res.map(r=>'<div class="kv"><span>'+esc(wName(r.id))+'</span><b>'+m$(r.amount)+'</b></div>').join('')+
    (x.c.discount?'<div class="kv"><span>Скидка</span><b>−'+m$(x.c.discount)+'</b></div>':'')+
    (pauseSec>=60?'<div class="kv"><span>Всего пауз</span><b>'+clockHM(pauseSec)+'</b></div>':'')+'</div>';
}
// раз в секунду: часы, кольцо, сумма. Кольцо — час; на 30-й минуте час уже в оплате (засечка).
const lastHalf={};
function tickLive(){
  const sh=sheets[sheets.length-1];
  if(sh?.el.dataset.attendanceShift){
    const l=(S.live||[]).find(x=>x.id===sh.el.dataset.attendanceShift);
    const el=sh.top().body.querySelector('[data-attendance-live]');
    if(l&&el) paintLiveAttendance(el,l);
  }
  document.querySelectorAll('.lcard[data-live]').forEach(function(card){
    const l=(S.live||[]).find(x=>x.id===card.dataset.live); if(!l||l.finished_at) return;
    const now=nowMs(), played=livePlayed(l,now), x=liveSummary(l,now);
    odo(card.querySelector('[data-clock]'),clock(played));
    const ring=card.querySelector('[data-ring]'), progress=(played%3600)/3600;
    if(ring){ ring.classList.toggle('zero',progress===0); ring.style.strokeDashoffset=String(RC*(1-progress)); }
    const dueT=x.h+' ч · '+m$(x.c.total);
    const d1=card.querySelector('[data-due]'); if(d1 && d1.textContent!==dueT) d1.textContent=dueT;
    const md=card.querySelector('.mdet.open [data-mdet]'); if(md && now%5000<1000) md.innerHTML=liveMoneyHTML(l);
    const pz=card.querySelector('[data-pz]');
    const pauseText=l.paused_at?'Перерыв · '+clock(Math.max(0,now-Date.parse(l.paused_at))/1000):'';
    if(pz && pz.textContent!==pauseText) pz.textContent=pauseText;
    const half=Math.floor((played+1800)/3600);
    const vis=liveRows()[liveIdx]&&liveRows()[liveIdx].id===l.id;
    if(lastHalf[l.id]!=null && half>lastHalf[l.id] && !document.hidden && vis && tab==='now'){ haptic('soft'); if(d1){ d1.animate&&d1.animate([{opacity:.2},{opacity:1}],{duration:500}); } }
    lastHalf[l.id]=half;
    card.querySelectorAll('[data-ptm]').forEach(function(t){
      const [k,id]=t.dataset.ptm.split('|'); const v=pTime(l,id,k); if(t.innerHTML!==v) t.innerHTML=v;
    });
  });
}
setInterval(()=>{ if(!document.hidden){ tickLive(); paintHead(); } },1000);
// ширина окна поменялась — фразу в шапке подгоняем заново (без движения)
window.addEventListener('resize',()=>{ const h=document.querySelector('#scrNow [data-nowhead]'); if(h){ h.innerHTML=''; paintHead(); } });
function putLive(row){
  if(!row||!row.id) return;
  const i=(S.live||[]).findIndex(x=>x.id===row.id);
  const r=Object.assign({},row,{discount:Number(row.discount)||0});
  if(i>=0) S.live[i]=r; else S.live.push(r);
}
function bindLiveCard(card){
  const id=card.dataset.live, L=()=>(S.live||[]).find(x=>x.id===id);
  card.querySelector('[data-attendance]').onclick=()=>liveAttendanceSheet(id);
  const of=card.querySelector('[data-open-fin]'); if(of) of.onclick=()=>{ const l=L(); if(l) finishSheet(draftFromLive(l)); };
  const pb=card.querySelector('[data-pause]');
  // пауза ставится на экране сразу, сервер догоняет в фоне; не получилось — возвращаем как в базе и говорим об этом
  if(pb) pb.onclick=()=>{
    const l=L(); if(!l||l.finished_at||!liveReady()) return; haptic('hard');
    const act=l.paused_at?'resume':'pause', t=nowMs(), at=new Date(t).toISOString(), log=(l.pause_log||[]).slice(), o=Object.assign({},l);
    if(act==='pause'){ o.paused_at=at; o.pause_log=log.concat([{s:at}]); }
    else { o.pause_sec=(Number(l.pause_sec)||0)+Math.max(0,(t-Date.parse(l.paused_at))/1000); o.paused_at=null;
      o.pause_log=log.map((p,i)=>i===log.length-1&&!p.e?Object.assign({},p,{e:at}):p); }
    putLive(o); paintPause(card,o);
    const q=pauseQ[id]=(pauseQ[id]||Promise.resolve()).then(()=>sb.rpc('live_action',{p_id:id,p_action:act})).catch(e=>({error:e})).then(async r=>{
      if(pauseQ[id]!==q) return;          // нажали ещё раз — решает последний ответ
      delete pauseQ[id];
      if(r.error||!(r.data&&r.data.id)){ try{ await loadAll(); }catch(_){ putLive(l); } renderNow(); if(r.error) fail(r.error); return; }
      const cur=L(), same=cur&&!cur.finished_at&&!r.data.finished_at&&!!cur.paused_at===!!r.data.paused_at;
      putLive(r.data);
      if(same&&card.isConnected){ tickLive(); tellNative(); } else renderNow();
    });
  };
  const ml=card.querySelector('[data-money]');
  if(ml) ml.onclick=()=>{ haptic('tap'); const det=ml.nextElementSibling, open=!det.classList.contains('open');
    if(open) det.querySelector('[data-mdet]').innerHTML=liveMoneyHTML(L());
    det.classList.toggle('open',open); ml.classList.toggle('open',open); ml.setAttribute('aria-expanded',String(open)); };
  const sl=card.querySelector('[data-finish]');
  if(sl) bindSlider(sl,async()=>{
    if(!liveReady()) return;
    const {data,error}=await sb.rpc('live_action',{p_id:id,p_action:'finish'});
    if(error) return fail(error);
    if(data&&data.id) putLive(data); else await loadAll();
    const l=L(); if(!l) return renderNow();
    // кольцо сжимается и уходит вверх — выезжает итог
    const rb=card.querySelector('.ringbox'); if(rb&&!reduce()) rb.animate([{transform:'none',opacity:1},{transform:'translateY(-40px) scale(.4)',opacity:0}],{duration:380,easing:'cubic-bezier(.32,.72,0,1)',fill:'forwards'});
    setTimeout(()=>{ renderNow(); finishSheet(draftFromLive(l)); },reduce()?0:260);
  });
  card.querySelectorAll('[data-p]').forEach(function(b){
    const [k,pid]=b.dataset.p.split('|');
    if(locked) return;
    b.onclick=()=>togglePerson(id,k,pid,b);
    longPress(b,()=>personInShiftSheet(id,k,pid));
  });
  card.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>pickPeople(b.dataset.add, L(), async pid=>{
    const {data,error}=await sb.rpc(b.dataset.add==='c'?'live_player':'live_worker',
      b.dataset.add==='c'?{p_id:id,p_customer:pid,p_action:'sit'}:{p_id:id,p_worker:pid,p_action:'on'});
    if(error) return fail(error);
    if(data&&data.id) putLive(data); haptic('soft'); renderNow();
  }));
}
const liveReady=()=>{ if(locked){ toast(ROMSG); return false; } if(!online()){ toast('Нет сети — это действие нужно делать со связью',true); return false; } return true; };
// снимок людей смены — чтобы «Отменить» вернул ровно как было
const liveSnap=l=>({customer_log:l.customer_log||[],worker_log:l.worker_log||[],customer_ids:l.customer_ids||[],worker_ids:l.worker_ids||[],payer_id:l.payer_id||null});
function undoLive(lid,snap,text){
  offerUndo(text,{onUndo:async()=>{ const {data,error}=await sb.from('live_shifts').update(snap).eq('id',lid).select().single();
    if(error) return fail(error,'Не вернулось'); putLive(data); renderNow(); }});
}
async function togglePerson(lid,k,pid,b){
  const l=(S.live||[]).find(x=>x.id===lid); if(!l||!liveReady()) return;
  const on=k==='c'?seated(l,pid):working(l,pid), snap=liveSnap(l);
  if(k==='w' && on && (l.worker_ids||[]).filter(x=>working(l,x)).length<2 && !await ask('Убрать последнего оператора со смены?')) return;
  haptic('soft'); b.classList.toggle('on',!on); b.classList.toggle('off',on);
  const {data,error}=await sb.rpc(k==='c'?'live_player':'live_worker',
    k==='c'?{p_id:lid,p_customer:pid,p_action:on?'leave':'sit'}:{p_id:lid,p_worker:pid,p_action:on?'off':'on'});
  if(error){ b.classList.toggle('on',on); b.classList.toggle('off',!on); return fail(error); }
  if(data&&data.id) putLive(data); tickLive();
  const nm=k==='c'?cName(pid):wName(pid);
  undoLive(lid,snap,k==='c'?(on?nm+' встал':nm+' сел'):(on?nm+' ушёл со смены':nm+' на смене'));
}

/* ======================= СЕЙЧАС: смены нет ======================= */
// прошлая неделя — для сравнения
function prevWeekSum(){
  const from=weekStart(), p=new Date(Date.parse(from+'T00:00Z')-7*864e5).toISOString().slice(0,10);
  const pe=new Date(Date.parse(today()+'T00:00Z')-7*864e5).toISOString().slice(0,10);   // те же дни, что прошли на этой неделе
  return S.shifts.filter(s=>s.work_date>=p&&s.work_date<=pe).reduce((a,s)=>a+(Number(s.total)||0),0);
}
const agoText=ms=>{ const m=Math.max(0,Math.round((nowMs()-ms)/60000)); if(m<1) return 'только что'; if(m<60) return m+' мин назад'; const h=Math.round(m/60); if(h<24) return h+' '+plural(h,'час','часа','часов')+' назад'; const d=Math.round(h/24); return d+' '+plural(d,'день','дня','дней')+' назад'; };
const stPill=s=>{ const st=shiftStatus(s), d=(s.custLinks||[]).reduce((a,l)=>a+due(l),0);
  return '<span class="st '+st+'">'+(st==='ok'?'рассчитано':st==='debt'?'долг '+m$(d):'без кастомеров')+'</span>'; };
let prevDebt={};
function dashboardHTML(inDrawer){
  const dl=debts(), tot=dl.reduce((a,x)=>a+x.total,0), hd=handDue(), wk=weekStats(), prev=prevWeekSum();
  const oldest=dl.length?Math.round((Date.parse(today()+'T00:00Z')-Date.parse(dl.map(x=>x.oldest).sort()[0]+'T00:00Z'))/864e5):0;
  const last=S.shifts.find(s=>!s.pending);
  let h=inDrawer?'':'<div class="aurora '+(tot>0.004?'warm':'calm')+'"><i></i><i></i><i></i></div>';
  // главное — долги
  if(tot>0.004){
    h+='<div class="hero"><div class="lbl">Должны</div><div class="v" data-count="'+tot+'">'+moneyHTML(tot)+'</div>'+
      '<div class="s">'+dl.length+' '+plural(dl.length,'человек','человека','человек')+(oldest>0?' · самый старый долг '+oldest+' '+plural(oldest,'день','дня','дней'):'')+'</div></div>';
  } else {
    h+='<div class="hero calm"><div class="lbl">Должны</div><div class="v ok"><svg class="chk" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> Все рассчитаны</div></div>';
  }
  if(!inDrawer) h+='<div class="ticker" data-ticker></div>'+attentionHTML();
  else h=tableDebtsHTML()+h;
  if(!inDrawer) h+=myMoneyHTML();
  if(tot>0.004){
    h+='<span class="cap">Кто должен</span>'+dl.map(d=>{
      const old=Math.round((Date.parse(today()+'T00:00Z')-Date.parse(d.oldest+'T00:00Z'))/864e5);
      const fresh=prevDebt[d.id]!=null && d.total>prevDebt[d.id]+0.004 || (prevDebt.__ready && prevDebt[d.id]==null);
      return '<div class="swipe sheen tone-debt'+(fresh?' fresh':'')+'" data-debtor="'+d.id+'" style="'+sheenDelay()+'"><div class="under"><span class="r">Заплатил всё</span><span class="l"><button data-prof>Профиль</button></span></div>'+
        '<div class="face"><div class="debtor">'+avHTML(cName(d.id))+'<div class="mid"><div class="nm">'+esc(cName(d.id))+'</div>'+
        '<div class="sm">'+d.items.length+' '+plural(d.items.length,'смена','смены','смен')+' · с '+dayText(d.oldest)+(old>7?' · <span style="color:var(--debt)">'+old+' дн.</span>':'')+'</div></div>'+
        '<div class="amt" data-count="'+d.total+'">'+moneyHTML(d.total)+'</div></div></div></div>';
    }).join('');
  }
  // неделя: живой график
  const mx=Math.max(1,...wk.days), td=Math.round((Date.parse(today()+'T00:00Z')-Date.parse(wk.from+'T00:00Z'))/864e5);
  const delta=prev>0?Math.round((wk.sum-prev)/prev*100):null;
  const wmax=Math.max(1,...Object.values(wk.w));
  h+=todayHTML()+'<span class="cap">Эта неделя</span><div class="card week sheen tone-money" style="'+sheenDelay()+'">'+
    '<div class="wh"><div><div class="tot" data-count="'+wk.sum+'">'+moneyHTML(wk.sum)+'</div><div class="t2" style="font-size:13.5px;margin-top:2px">'+wk.n+' '+plural(wk.n,'смена','смены','смен')+' · '+wk.h+' ч</div></div>'+
      (delta!=null?'<div class="delta '+(delta>=0?'up':'down')+'">'+(delta>=0?'↑':'↓')+' '+Math.abs(delta)+'%<span>к тем же дням</span></div>':'')+'</div>'+
    '<div class="chart" data-chart>'+wk.days.map((v,i)=>{ const d=new Date(Date.parse(wk.from+'T00:00Z')+i*864e5).toISOString().slice(0,10);
      return '<button class="col'+(i===td?' today':'')+(v?'':' zero')+(i>td?' future':'')+'" data-day="'+d+'" style="--i:'+i+';--h:'+(v?Math.max(8,v/mx*100):0)+'%">'+
        '<span class="val">'+(v?r2(v).toLocaleString('ru-RU'):'')+'</span><i></i><span class="d">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]+'</span></button>'; }).join('')+
      '<div class="tip" data-tip></div></div>'+
    (wk.n?'<div class="ops"><div class="op"><span>Касса</span><div class="bar"><i style="--w:100%"></i></div><b>'+m$(wk.kassa)+'</b></div>'+
      Object.keys(wk.w).sort((a,b)=>wk.w[b]-wk.w[a]).map((k,i)=>'<div class="op"><span>'+esc(wName(k))+'</span><div class="bar"><i style="--w:'+Math.round(wk.w[k]/Math.max(wmax,wk.kassa)*100)+'%;--i:'+(i+1)+'"></i></div><b>'+m$(wk.w[k])+'</b></div>').join('')+'</div>':'')+
  '</div>';
  if(!inDrawer){ prevDebt={__ready:true}; dl.forEach(x=>prevDebt[x.id]=x.total); }
  if(last){
    h+='<span class="cap">Последняя смена</span><button class="lastsh sheen tone-'+({ok:'ok',debt:'debt',none:'money'})[shiftStatus(last)]+'" style="'+sheenDelay()+'" data-last="'+last.id+'"><div class="mid"><div class="nm">'+dayLabel(last.work_date)+
      (last.start_time?', '+hhmm(last.start_time)+'–'+tHM(shiftEndMs(last)):'')+'</div><div class="sm" data-ago="'+shiftEndMs(last)+'">закончилась '+agoText(shiftEndMs(last))+'</div>'+miniBar(last)+'</div>'+
      '<div class="rt"><div class="sum">'+moneyHTML(last.total)+'</div>'+stPill(last)+'</div></button>';
  }
  return h;
}
function bindDashboard(sc){
  sc.querySelectorAll('[data-debtor]').forEach(function(w){
    const cid=w.dataset.debtor;
    w.querySelector('.face').onclick=()=>settleSheet(cid);
    w.querySelector('[data-prof]').onclick=e=>{ e.stopPropagation(); w._close(); profileSheet('c',cid); };
    swipeable(w,{ right:locked?null:()=>settleAll(cid,w), left:true });
  });
  sc.querySelectorAll('[data-settle-c]').forEach(b=>b.onclick=()=>settleSheet(b.dataset.settleC));
  bindAttention(sc);
  startTicker(sc);
  const ls=sc.querySelector('[data-last]'); if(ls) ls.onclick=()=>shiftSheet(ls.dataset.last,ls);
  // график: нажал на день — всплыла подсказка; второй раз — история этого дня
  const ch=sc.querySelector('[data-chart]'), tip=ch&&ch.querySelector('[data-tip]'); let cur=null;
  if(ch) ch.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{
    const d=b.dataset.day;
    if(cur===d){ histJump(d); return; }
    cur=d; haptic('pick');
    const sh=S.shifts.filter(s=>s.work_date===d), sum=sh.reduce((a,s)=>a+(Number(s.total)||0),0);
    ch.querySelectorAll('.col').forEach(x=>x.classList.toggle('sel',x===b));
    tip.innerHTML='<b>'+dayLabel(d)+'</b>'+(sh.length?sh.length+' '+plural(sh.length,'смена','смены','смен')+' · '+m$(sum)+'<em>ещё раз — открыть</em>':'смен не было');
    const r=b.getBoundingClientRect(), R=ch.getBoundingClientRect();
    tip.style.left=Math.min(R.width-150,Math.max(0,r.left-R.left+r.width/2-75))+'px';
    const bar=b.querySelector('i').getBoundingClientRect();   // подсказка — прямо над столбиком
    tip.style.top=Math.max(-30,bar.top-R.top-tip.offsetHeight-10)+'px';
    tip.classList.remove('on'); void tip.offsetWidth; tip.classList.add('on');
  });
}
// живые «… назад» на главной
setInterval(()=>{ document.querySelectorAll('[data-ago]').forEach(e=>e.textContent='закончилась '+agoText(Number(e.dataset.ago))); },30000);
// появление: блоки по очереди всплывают, цифры набегают — при открытии экрана, не при каждом обновлении.
// Когда всплыли — снимаем класс: элементы снова обычные (Safari иначе иногда их не дорисовывает).
function rise(sc){
  if(reduce()) return;
  const els=[...sc.children].filter(el=>!el.classList.contains('aurora'));
  els.forEach((el,i)=>{ el.style.setProperty('--i',Math.min(i,10)); el.classList.remove('rise'); void el.offsetWidth; el.classList.add('rise'); });
  clearTimeout(sc._rise); sc._rise=setTimeout(()=>els.forEach(el=>el.classList.remove('rise')),1900);
  sc.querySelectorAll('[data-count]').forEach(el=>{ const v=Number(el.dataset.count); el.dataset.v=0; rollTo(el,v,x=>moneyHTML(x),900); });
}
// искры: кто-то рассчитался полностью, смена сохранена
function sparkle(x,y,n){
  if(reduce()) return;
  x=x==null?innerWidth/2:x; y=y==null?innerHeight/2:y;
  for(let i=0;i<(n||22);i++){
    const p=document.createElement('i'); p.className='spark'+(i%3===0?' gold':'');
    p.style.left=x+'px'; p.style.top=y+'px'; document.body.appendChild(p);
    const a=Math.random()*Math.PI*2, d=60+Math.random()*110, s=.5+Math.random()*.9;
    p.animate([{transform:'translate(-50%,-50%) scale('+s+')',opacity:1},
      {transform:'translate(calc(-50% + '+Math.cos(a)*d+'px),calc(-50% + '+(Math.sin(a)*d+40)+'px)) scale(0)',opacity:0}],
      {duration:700+Math.random()*500,easing:'cubic-bezier(.2,.8,.3,1)'}).onfinish=()=>p.remove();
  }
}
// подсказки под суммой — сменяют друг друга
function insights(){
  const out=[];
  const last=S.shifts.find(s=>!s.pending); if(last) out.push('Последняя смена закончилась '+agoText(shiftEndMs(last)));
  const wk=weekStats(), prev=prevWeekSum();
  if(wk.n) out.push('За неделю '+m$(wk.sum)+(prev>0?' · '+(wk.sum>=prev?'+':'−')+Math.abs(Math.round((wk.sum-prev)/prev*100))+'% к прошлой':''));
  const from=today().slice(0,7)+'-01', mon=S.shifts.filter(s=>s.work_date>=from), cnt={};
  mon.forEach(s=>s.customerIds.forEach(id=>cnt[id]=(cnt[id]||0)+1));
  const top=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  if(top) out.push('Чаще всех в этом месяце — '+cName(top)+' · '+cnt[top]+' '+plural(cnt[top],'смена','смены','смен'));
  if(mon.length) out.push('Средняя смена — '+Math.round(mon.reduce((a,s)=>a+s.hours,0)/mon.length)+' ч · '+m$(mon.reduce((a,s)=>a+s.total,0)/mon.length));
  const dl=debts(); if(dl.length) out.push('Больше всех должен '+cName(dl[0].id)+' · '+m$(dl[0].total));
  return out;
}
let tickerT=null;
function startTicker(sc){
  const t=sc.querySelector('[data-ticker]'); if(!t) return;
  const list=insights(); let i=0; if(!list.length) return;
  const show=()=>{ const span=document.createElement('span'); span.textContent=list[i%list.length]; i++;
    const old=t.querySelector('span'); if(old){ old.classList.add('out'); setTimeout(()=>old.remove(),450); } t.appendChild(span); };
  show(); clearInterval(tickerT); tickerT=setInterval(()=>{ if(!document.hidden && t.isConnected) show(); },4200);
}
// потянул «Сейчас» вниз — обновить
(function(){
  const sc=$('#scrNow'), ind=document.createElement('div'); ind.id='ptr'; ind.innerHTML='<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2.4"/><circle class="a" cx="14" cy="14" r="11" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="69.1" stroke-dashoffset="69.1"/></svg>';
  document.body.appendChild(ind);
  let y0=null, d=0, armed=false, busy=false;
  sc.addEventListener('touchstart',e=>{ if(sc.scrollTop<=0&&!busy&&!sheets.length){ y0=e.touches[0].clientY; d=0; armed=false; } },{passive:true});
  sc.addEventListener('touchmove',e=>{ if(y0==null) return; d=Math.max(0,e.touches[0].clientY-y0); if(d<=0) return;
    const k=Math.min(1,d/90); ind.style.opacity=String(Math.min(1,d/40)); ind.style.transform='translate(-50%,'+(Math.min(d,110)*.6)+'px) rotate('+(k*270)+'deg)';
    ind.querySelector('.a').style.strokeDashoffset=String(69.1*(1-k));
    if(k>=1 && !armed){ armed=true; haptic('soft'); } else if(k<1 && armed){ armed=false; } },{passive:true});
  sc.addEventListener('touchend',async()=>{
    if(y0==null) return; y0=null;
    if(!armed){ ind.style.opacity='0'; ind.style.transform='translate(-50%,0)'; return; }
    busy=true; ind.classList.add('spin');
    await reload(); haptic('tap');
    ind.classList.remove('spin'); ind.style.opacity='0'; ind.style.transform='translate(-50%,0)'; busy=false;
    rise($('#scrNow'));
  });
})();
// смахнул должника — заплатил всё (сразу, с «Отменить»)
async function settleAll(cid,wrap){
  if(!liveReady()){ wrap&&wrap._close(); return; }
  const d=debts().find(x=>x.id===cid); if(!d){ wrap&&wrap._close(); return; }
  if(d.pendingOnly){ wrap&&wrap._close(); return toast('Смена ещё не отправлена — рассчитать можно, когда появится связь',true); }
  const {data,error}=await sb.rpc('settle',{p_customer:cid,p_amount:d.payable});
  if(error){ wrap&&wrap._close(); return fail(error); }
  haptic('ok'); const r0=wrap&&wrap.getBoundingClientRect(); if(r0){ sparkle(r0.left+r0.width*.7,r0.top+r0.height/2); wave('rgba(78,166,114,.65)',r0.left+r0.width/2,r0.top+r0.height/2); } await reload();
  offerUndo(cName(cid)+' заплатил '+m$(d.payable),{onUndo:async()=>{ const r=await sb.rpc('unsettle',{p_payment:data.id}); if(r.error) return fail(r.error); await reload(); toast('Расчёт отменён'); }});
}

/* ======================= ИСТОРИЯ ======================= */
// Один период на все разделы. Открывается со «Смен», период — месяц.
let histQ='', histChip='', searchOpen=false, histSeg='shifts', histLimit=60, histPer='m', histFrom='', histTo='';
function histRange(){
  const t=today();
  if(histPer==='w') return {from:weekStart(),to:t,name:'эта неделя'};
  if(histPer==='m') return {from:t.slice(0,7)+'-01',to:t,name:MONFULL[Number(t.slice(5,7))-1].toLowerCase()};
  if(histPer==='c' && histFrom) return {from:histFrom,to:histTo||histFrom,name:dayText(histFrom)+(histTo&&histTo!==histFrom?' – '+dayText(histTo):'')};
  return {from:'',to:'9999-12-31',name:'всё время'};
}
const inRange=(ds,R)=>ds>=R.from && ds<=R.to;
// для профиля и «Людей»
const perFrom=p=>p==='w'?weekStart():p==='m'?today().slice(0,7)+'-01':'';
const perName=p=>p==='w'?'за неделю':p==='m'?'за месяц':'за всё время';
function lastSeen(ds){ if(!ds) return 'не был'; const n=Math.round((Date.parse(today()+'T00:00Z')-Date.parse(ds+'T00:00Z'))/864e5);
  return n===0?'сегодня':n===1?'вчера':n+' '+plural(n,'день','дня','дней')+' назад'; }
function activityStrip(sess){
  const t=Date.parse(today()+'T00:00Z'), by={};
  sess.forEach(x=>{ const d=x.s.work_date; by[d]=(by[d]||0)+x.ms; });
  let h='<div class="strip">';
  for(let i=13;i>=0;i--){ const d=new Date(t-i*864e5).toISOString().slice(0,10), ms=by[d]||0;
    h+='<i style="--h:'+(ms?Math.max(25,Math.min(100,ms/36e3/8*100)):0)+'%"'+(i===0?' class="td"':'')+'></i>'; }
  return h+'</div>';
}
const chipPerson=()=>histChip.startsWith('p:')?histChip.slice(2):null;
const isWorker=id=>S.workers.some(w=>w.id===id);
const payDay=p=>khParts(Date.parse(p.created_at)).d;
function periodShifts(R){
  const pid=chipPerson();
  return S.shifts.filter(s=>inRange(s.work_date,R) && (!pid || s.workerIds.includes(pid) || s.customerIds.includes(pid)));
}
function periodPays(R){
  const pid=chipPerson();
  return (S.payments||[]).filter(p=>!p.undone_at && inRange(payDay(p),R) && (!pid || p.customer_id===pid));
}
// сводка за период: смены, часы, сумма, получено, висит долгом; выбран человек — его цифры
function summaryHTML(R){
  const pid=chipPerson(), sh=periodShifts(R), pays=periodPays(R);
  let a,b,c,d,e,title;
  if(pid){
    const w=isWorker(pid), ses=personSessions(w?'w':'c',pid).filter(x=>inRange(x.s.work_date,R));
    title=(w?wName(pid):cName(pid))+' · '+R.name;
    a=ses.length+' '+plural(ses.length,'смена','смены','смен'); b=String(Math.round(ses.reduce((q,x)=>q+x.ms,0)/36e5*10)/10).replace('.',',')+' ч';
    c=ses.reduce((q,x)=>q+x.amount,0); d=w?null:pays.reduce((q,p)=>q+p.amount,0); e=w?0:ses.reduce((q,x)=>q+x.due,0);
  } else {
    title=R.name.charAt(0).toUpperCase()+R.name.slice(1);
    a=sh.length+' '+plural(sh.length,'смена','смены','смен'); b=sh.reduce((q,s)=>q+s.hours,0)+' ч';
    c=sh.reduce((q,s)=>q+(Number(s.total)||0),0); d=pays.reduce((q,p)=>q+p.amount,0);
    e=sh.reduce((q,s)=>q+(s.custLinks||[]).reduce((z,l)=>z+due(l),0),0);
  }
  return '<div class="card hsum sheen '+(e>0.004?'tone-debt':'tone-money')+'" style="'+sheenDelay()+'">'+
    '<div class="hst"><span>'+esc(title)+'</span><button class="pill" data-report>Отчёт</button></div>'+
    '<div class="hsv" data-count="'+c+'">'+moneyHTML(c)+'</div><div class="t2" style="font-size:13.5px">'+a+' · '+b+(pid&&isWorker(pid)?' · заработал':pid?' · принёс':'')+'</div>'+
    '<div class="hsr">'+(d!=null?'<div><span>получено</span><b style="color:var(--ok)">'+m$(d)+'</b></div>':'')+
      '<div><span>висит долгом</span><b style="color:'+(e>0.004?'var(--debt)':'var(--t2)')+'">'+m$(e)+'</b></div></div></div>';
}
// лента дней: столбик дня по сумме смен (в «Расчётах» — по полученному)
function dayStripHTML(R){
  const end=R.to>'9000'?today():R.to;
  const start=R.from||new Date(Date.parse(end+'T00:00Z')-59*864e5).toISOString().slice(0,10);
  const days=[]; for(let t=Date.parse(start+'T00:00Z');t<=Date.parse(end+'T00:00Z');t+=864e5) days.push(new Date(t).toISOString().slice(0,10));
  const v={};
  if(histSeg==='money') periodPays(R).forEach(p=>{ const d=payDay(p); v[d]=(v[d]||0)+p.amount; });
  else periodShifts(R).forEach(s=>{ v[s.work_date]=(v[s.work_date]||0)+(Number(s.total)||0); });
  const mx=Math.max(1,...Object.values(v));
  return '<div class="dstrip" data-dstrip>'+days.map(d=>{ const x=v[d]||0, dd=new Date(d+'T00:00Z');
    return '<button class="dd'+(x?'':' z')+(d===today()?' td':'')+(dd.getUTCDay()===1?' mon':'')+'" data-jump="'+d+'"><i style="--h:'+(x?Math.max(12,x/mx*100):0)+'%"></i><span>'+dd.getUTCDate()+'</span></button>'; }).join('')+'</div>';
}
// полоса фильтров: периоды, долги, люди цветными кружками, поиск
function filterBarHTML(){
  const ppl=freq('c').slice(0,8).concat(freq('w').slice(0,4));
  return '<div class="hfil">'+
    '<div class="segmini">'+[['w','Неделя'],['m','Месяц'],['a','Всё'],['c',histPer==='c'&&histFrom?dayText(histFrom)+(histTo&&histTo!==histFrom?'–'+dayText(histTo):''):'Период']]
      .map(p=>'<button data-per="'+p[0]+'" aria-pressed="'+(histPer===p[0])+'">'+p[1]+'</button>').join('')+'</div>'+
    '<div class="fchips">'+
      '<button class="srch" data-srch aria-label="Поиск"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5.5"/><path d="M11 11l3.5 3.5"/></svg></button>'+
      (histSeg==='shifts'?'<button class="pill" data-chip="debt" aria-pressed="'+(histChip==='debt')+'">Долги</button><button class="pill" data-chip="none" aria-pressed="'+(histChip==='none')+'">Без кастомеров</button>':'')+
      (histSeg!=='people'?ppl.map(p=>'<button class="fav'+(histChip==='p:'+p.id?' on':'')+'" data-chip="p:'+p.id+'" style="--pc:'+personColor(p.name)+'" aria-label="'+esc(p.name)+'">'+esc(initials(p.name))+'</button>').join(''):'')+
    '</div></div>';
}
function histMatch(e){
  if(histChip==='debt' && !(e.kind==='shift' && shiftStatus(e.s)==='debt')) return false;
  if(histChip==='none' && !(e.kind==='shift' && shiftStatus(e.s)==='none')) return false;
  const pid=chipPerson();
  if(pid){ if(e.kind==='shift'){ if(!e.s.workerIds.includes(pid)&&!e.s.customerIds.includes(pid)) return false; }
    else if(e.kind==='op'){ if(e.o.worker_id!==pid) return false; } else if(e.p.customer_id!==pid) return false; }
  const q=histQ.trim().toLowerCase(); if(!q) return true;
  const words=[dayLabel(e.date),dayText(e.date),e.date];
  if(e.kind==='shift') words.push(...e.s.workerIds.map(wName),...e.s.customerIds.map(cName),String(e.s.total),e.s.note||'');
  if(e.kind==='op') words.push(wName(e.o.worker_id),String(e.o.amount),e.o.note||'');
  if(e.kind==='pay') words.push(cName(e.p.customer_id),String(e.p.amount));
  return words.join(' ').toLowerCase().includes(q);
}
function entries(R){
  if(histSeg==='shifts') return S.shifts.filter(s=>inRange(s.work_date,R)).map(s=>({kind:'shift',date:s.work_date,at:s.start_time?shiftStart(s):Date.parse(s.created_at||s.work_date),s:s}))
    .sort((x,y)=>(y.date>x.date?1:y.date<x.date?-1:0)||(y.at-x.at));
  const a=[];
  S.ops.filter(o=>inRange(o.op_date,R)).forEach(o=>a.push({kind:'op',date:o.op_date,at:Date.parse(o.created_at||o.op_date),o:o}));
  (S.payments||[]).filter(p=>!p.undone_at && inRange(payDay(p),R)).forEach(p=>a.push({kind:'pay',date:payDay(p),at:Date.parse(p.created_at),p:p}));
  return a.sort((x,y)=>(y.date>x.date?1:y.date<x.date?-1:0)||(y.at-x.at));
}
// смена через полночь: «22:00–03:00 +1»
const plus1=s=>s.start_time&&khParts(shiftEndMs(s)).d>s.work_date?'<em class="p1">+1</em>':'';
// кто записал: Telegram-редактор — по имени, вход по почте — владелец
function whoName(uid){
  if(!uid) return '';
  if(user&&uid===user.id) return 'ты';
  const m=M.find(x=>x.auth_uid===uid); if(m) return m.name||'редактор';
  return isOwner?'владелец':'';
}
function miniBar(s){
  const a=shiftStart(s), b=shiftEndMs(s), W=Math.max(1,b-a);
  return '<div class="mini">'+pauseSpans(s.pause_log).filter(p=>p.e).map(p=>'<i style="left:'+((p.s-a)/W*100).toFixed(1)+'%;width:'+Math.max(1,(p.e-p.s)/W*100).toFixed(1)+'%"></i>').join('')+'</div>';
}
// кружки людей: кастомеры, тонкая черта, операторы
function crewHTML(s){
  const c=s.customerIds, w=s.workerIds, max=5, cs=c.slice(0,max), more=c.length-cs.length;
  return '<div class="crew">'+cs.map(id=>avHTML(cName(id),'xs')).join('')+(more>0?'<span class="more">+'+more+'</span>':'')+
    (c.length?'<i class="bar"></i>':'')+w.slice(0,3).map(id=>avHTML(wName(id),'xs')).join('')+'</div>';
}
function shiftCardHTML(s){
  const d=new Date(s.work_date+'T00:00Z'), lbl=dayLabel(s.work_date);
  const tn=({ok:' tone-ok',debt:' tone-debt',none:''})[shiftStatus(s)];
  return '<div class="swipe sheen'+tn+'" data-shift="'+s.id+'" style="'+sheenDelay()+'"><div class="under"><span class="r">Рассчитать</span><span class="l">'+
      (locked?'':'<button data-edit>Изменить</button><button class="del" data-del>Удалить</button>')+'</span></div>'+
    '<div class="face"><div class="hc2">'+
      '<div class="dt'+(lbl==='Сегодня'?' now':'')+'"><b>'+d.getUTCDate()+'</b><span>'+(lbl==='Сегодня'?'сегодня':lbl==='Вчера'?'вчера':WD[d.getUTCDay()].toLowerCase())+'</span></div>'+
      '<div class="mid"><div class="r1"><span class="tm num">'+(s.start_time?hhmm(s.start_time)+'–'+tHM(shiftEndMs(s))+plus1(s):'без времени')+'</span><span class="hrs">'+s.hours+' ч</span></div>'+
        miniBar(s)+crewHTML(s)+'</div>'+
      '<div class="rt"><div class="sum">'+moneyHTML(s.total)+'</div>'+stPill(s)+'</div>'+
    (s.pending?'<div class="pend">ещё не отправлено</div>':'')+'</div></div></div>';
}
function moneyRowHTML(e){
  if(e.kind==='pay'){ const p=e.p, sh=(p.alloc||[]).map(a=>S.shifts.find(x=>x.id===a.shift_id)).filter(Boolean), atShift=p.note==='при сохранении смены';
    const tag=atShift?'при смене':p.note==='при правке смены'?'при правке':p.note==='перенос при правке смены'?'перенос':'';
    return '<button class="mrow sheen" data-pay="'+p.id+'" style="'+sheenDelay()+'">'+avHTML(cName(p.customer_id),'s')+'<div class="mid"><div class="nm">'+esc(cName(p.customer_id))+' заплатил'+(tag?' <span class="tagp">'+tag+'</span>':'')+'</div>'+
      '<div class="sm">'+(sh.length?'за '+sh.map(s=>dayText(s.work_date)).join(', '):'')+' · '+tHM(Date.parse(p.created_at))+(p.adjusted>0.004?' · поправка −'+m$(p.adjusted):'')+'</div></div><b class="plus">+'+m$(p.amount)+'</b></button>'; }
  const o=e.o, t=o.kind==='payout'?'Выплата · '+wName(o.worker_id):o.kind==='expense'?'Выдача кассы':o.kind==='income'?'Оплата от кастомеров (старая запись)':'Долг до начала учёта';
  return '<button class="mrow" data-op="'+o.id+'"><div class="av s">'+(o.kind==='payout'||o.kind==='expense'?'↗':'↙')+'</div><div class="mid"><div class="nm">'+esc(t)+'</div><div class="sm">'+(o.note?esc(o.note):'вручную')+'</div></div>'+
    '<b>'+(o.kind==='payout'||o.kind==='expense'?'−':'')+m$(o.amount)+'</b></button>';
}
// прокрутить историю к дню: под прилипшими разделами и заголовком недели
function scrollToDay(d){
  const sc=$('#scrHist'), a=document.getElementById('d-'+d); if(!a) return false;
  const hs=sc.querySelector('.hsticky'), off=(hs?hs.offsetHeight:0)+(histSeg==='shifts'?96:56);
  sc.scrollTo({top:Math.max(0,a.offsetTop-off),behavior:reduce()?'auto':'smooth'}); return true;
}
// с «Сейчас»: открыть день в истории — период расширится, если день за его краем
function histJump(d){
  histSeg='shifts'; histQ=''; if(histChip!=='debt') histChip='';
  const R=histRange(); if(!inRange(d,R)) histPer='a';
  goTab('hist'); renderHist();
  const n=S.shifts.filter(s=>inRange(s.work_date,histRange())).filter(s=>s.work_date>=d).length; if(n>histLimit){ histLimit=n+10; renderHist(); }
  setTimeout(()=>scrollToDay(d),160);
}
const wkStart=ds=>{ const t=Date.parse(ds+'T00:00Z'), wd=(new Date(t).getUTCDay()+6)%7; return new Date(t-wd*864e5).toISOString().slice(0,10); };
function renderHist(){
  const sc=$('#scrHist'), keep=sc.scrollTop, R=histRange();
  let h='<div class="big"><div><h1>История</h1></div></div>'+
    '<div class="hsticky"><div class="segbig s3" data-at="'+histSeg+'"><button data-seg="shifts" aria-pressed="'+(histSeg==='shifts')+'">Смены</button><button data-seg="people" aria-pressed="'+(histSeg==='people')+'">Люди</button><button data-seg="money" aria-pressed="'+(histSeg==='money')+'">Расчёты</button><i></i></div>'+
    filterBarHTML()+'<div class="search'+(searchOpen?' open':'')+'"><div><input id="hq" type="search" placeholder="Имя, дата, сумма" value="'+esc(histQ)+'"></div></div></div>';
  if(histSeg==='people'){ h+=peopleHTML(R); }
  else {
    h+=summaryHTML(R)+dayStripHTML(R);
    const list=entries(R).filter(histMatch);
    if(!list.length) h+='<div class="empty">'+(histQ||histChip?'Ничего не нашлось':histSeg==='shifts'?'Смен за этот период нет':'Расчётов за этот период нет')+'</div>';
    if(histSeg==='shifts'){
      // по неделям: «3–9 ноя · 4 смены · 2 150 $ · долг 175 $»
      const wk={}, pid=chipPerson(); list.forEach(e=>{ const k=wkStart(e.date), t=wk[k]||(wk[k]={n:0,sum:0,debt:0}); t.n++; t.sum+=e.s.total; t.debt+=(e.s.custLinks||[]).filter(l=>!pid||l.id===pid).reduce((a,l)=>a+due(l),0); });
      let cur='', curD='';
      list.slice(0,histLimit).forEach(e=>{
        const k=wkStart(e.date);
        if(k!==cur){ cur=k; const t=wk[k], end=new Date(Date.parse(k+'T00:00Z')+6*864e5).toISOString().slice(0,10);
          const lbl=k===weekStart()?'Эта неделя':(k.slice(5,7)===end.slice(5,7)?Number(k.slice(8))+'–'+dayText(end):dayText(k)+' – '+dayText(end));
          h+='<div class="wkh"><b>'+lbl+'</b><span>'+t.n+' '+plural(t.n,'смена','смены','смен')+' · '+m$(t.sum)+(t.debt>0.004?' · <em>долг '+m$(t.debt)+'</em>':'')+'</span></div>'; }
        if(e.date!==curD){ curD=e.date; h+='<a id="d-'+e.date+'" class="anch"></a>'; }
        h+=shiftCardHTML(e.s);
      });
      if(list.length>histLimit) h+='<button class="btn sec" data-more style="margin-top:14px">Показать ещё '+Math.min(60,list.length-histLimit)+'</button>';
    } else {
      // книга денег: по дням с итогом «получено за день»
      const byDay={}; list.forEach(e=>{ if(e.kind==='pay') byDay[e.date]=(byDay[e.date]||0)+e.p.amount; });
      let curD='';
      list.slice(0,histLimit).forEach(e=>{
        if(e.date!==curD){ curD=e.date; h+='<div class="day" id="d-'+e.date+'"><span>'+dayLabel(e.date)+'</span>'+(byDay[e.date]?'<b>получено '+m$(byDay[e.date])+'</b>':'')+'</div>'; }
        h+=moneyRowHTML(e);
      });
      if(list.length>histLimit) h+='<button class="btn sec" data-more style="margin-top:14px">Показать ещё '+Math.min(60,list.length-histLimit)+'</button>';
    }
  }
  sc.innerHTML=h; sc.scrollTop=keep;
  // прилипающий заголовок недели — сразу под разделами и фильтрами
  const hs=sc.querySelector('.hsticky'); if(hs) sc.style.setProperty('--hst',hs.offsetHeight+'px');
  const more=sc.querySelector('[data-more]'); if(more) more.onclick=()=>{ histLimit+=60; haptic('tap'); renderHist(); };
  sc.querySelector('[data-srch]').onclick=()=>{ searchOpen=!searchOpen; haptic('tap'); sc.querySelector('.search').classList.toggle('open',searchOpen);
    setTimeout(()=>{ sc.style.setProperty('--hst',sc.querySelector('.hsticky').offsetHeight+'px'); if(searchOpen) $('#hq').focus(); },360); };
  sc.querySelectorAll('[data-seg]').forEach(b=>b.onclick=()=>{ if(histSeg===b.dataset.seg) return; histSeg=b.dataset.seg; if(histSeg==='people'&&histChip.startsWith('p:')) histChip=''; if(histChip==='debt'||histChip==='none') histChip=histSeg==='shifts'?histChip:''; haptic('pick'); sc.scrollTop=0; renderHist(); rise(sc); });
  sc.querySelectorAll('[data-per]').forEach(b=>b.onclick=()=>{ haptic('pick');
    if(b.dataset.per==='c'){ periodPicker(); return; }
    histPer=b.dataset.per; histLimit=60; renderHist(); rise(sc); });
  const hq=$('#hq'); hq.oninput=()=>{ histQ=hq.value; clearTimeout(hq._t); hq._t=setTimeout(()=>{ renderHist(); const n=$('#hq'); n.focus(); n.setSelectionRange(n.value.length,n.value.length); },250); };
  sc.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{ histChip=histChip===b.dataset.chip?'':b.dataset.chip; haptic('pick'); renderHist(); });
  const rp=sc.querySelector('[data-report]'); if(rp) rp.onclick=()=>sendReport(R);
  sc.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{ haptic('pick'); if(!scrollToDay(b.dataset.jump)) toast('В этот день пусто'); });
  const ds=sc.querySelector('[data-dstrip]'); if(ds) requestAnimationFrame(()=>{ ds.scrollLeft=ds.scrollWidth; });
  sc.querySelectorAll('[data-shift]').forEach(function(w){
    const sid=w.dataset.shift, s=()=>S.shifts.find(x=>x.id===sid);
    const face=w.querySelector('.face');
    face.onclick=()=>shiftSheet(sid,w);
    const ed=w.querySelector('[data-edit]'); if(ed) ed.onclick=e=>{ e.stopPropagation(); w._close(); editShift(sid); };
    const dl=w.querySelector('[data-del]'); if(dl) dl.onclick=e=>{ e.stopPropagation(); deleteShift(sid); };
    swipeable(w,{ right:(locked||s().pending||shiftStatus(s())!=='debt')?null:()=>{ w._reset(); settleShiftSheet(sid); }, left:!locked });
    longPress(face,()=>{
      const acts=[]; const x=s(); if(!x) return;
      if(!locked && shiftStatus(x)==='debt') acts.push({label:'Рассчитать',icon:'$',fn:()=>settleShiftSheet(sid)});
      if(!locked && !x.pending) acts.push({label:'Изменить',icon:'✎',fn:()=>editShift(sid)});
      acts.push({label:'Скопировать текст',icon:'⧉',fn:()=>copyShift(x)});
      if(!locked) acts.push({label:'Удалить',icon:'✕',danger:true,fn:()=>deleteShift(sid)});
      contextMenu(face,acts);
    });
  });
  sc.querySelectorAll('[data-pay]').forEach(r=>r.onclick=()=>paymentSheet(r.dataset.pay));
  sc.querySelectorAll('[data-op]').forEach(r=>r.onclick=()=>opSheet(r.dataset.op));
  if(histSeg==='people') bindPeople(sc);
}
// «Свой период»: календарь — день начала, день конца; быстрые «прошлая неделя / прошлый месяц»
function periodPicker(){
  const sh=openSheet({detent:'full'}); let a=histPer==='c'?histFrom:'', b=histPer==='c'?histTo:'', ym=(a||today()).slice(0,7);
  sh.push({title:'Свой период', render(bd){
    const p=ym.split('-').map(Number), first=new Date(Date.UTC(p[0],p[1]-1,1)), days=new Date(Date.UTC(p[0],p[1],0)).getUTCDate(), lead=(first.getUTCDay()+6)%7;
    const lw=new Date(Date.parse(weekStart()+'T00:00Z')-7*864e5).toISOString().slice(0,10), lwe=new Date(Date.parse(weekStart()+'T00:00Z')-864e5).toISOString().slice(0,10);
    const pm=new Date(Date.UTC(Number(today().slice(0,4)),Number(today().slice(5,7))-2,1)).toISOString().slice(0,10), pme=new Date(Date.parse(today().slice(0,7)+'-01T00:00Z')-864e5).toISOString().slice(0,10);
    bd.innerHTML='<div class="qpills" style="margin-top:0"><button class="pill" data-q="'+lw+'|'+lwe+'">Прошлая неделя</button><button class="pill" data-q="'+pm+'|'+pme+'">Прошлый месяц</button></div>'+
      '<div class="lead" style="margin-top:12px">'+(a?(b?'С '+dayText(a)+' по '+dayText(b):'Теперь выбери день конца'):'Выбери день начала')+'</div>'+
      '<div class="calhead"><button data-m="-1">‹</button><b>'+MONFULL[p[1]-1]+' '+p[0]+'</b><button data-m="1"'+(ym>=today().slice(0,7)?' disabled':'')+'>›</button></div>'+
      '<div class="cal">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span class="wd">'+x+'</span>').join('')+'<span></span>'.repeat(lead)+
      Array.from({length:days},(_,i)=>{ const ds=ym+'-'+z2(i+1), inr=a&&b&&ds>=a&&ds<=b, edge=ds===a||ds===b;
        return '<button class="cd'+(inr?' rng':'')+(edge?' edge':'')+(ds===today()?' td':'')+'" data-day="'+ds+'"'+(ds>today()?' disabled':'')+'>'+(i+1)+'</button>'; }).join('')+'</div>'+
      '<button class="btn" data-ok style="margin-top:16px"'+(a?'':' disabled')+'>Показать</button>';
    bd.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{ const q=ym.split('-').map(Number); ym=new Date(Date.UTC(q[0],q[1]-1+Number(x.dataset.m),1)).toISOString().slice(0,7); sh.top().render(); });
    bd.querySelectorAll('[data-day]').forEach(x=>x.onclick=()=>{ haptic('pick'); const d=x.dataset.day; if(!a||b){ a=d; b=''; } else if(d<a){ b=a; a=d; } else b=d; sh.top().render(); });
    bd.querySelectorAll('[data-q]').forEach(x=>x.onclick=()=>{ const q=x.dataset.q.split('|'); a=q[0]; b=q[1]; haptic('pick'); finish(); });
    const finish=()=>{ histPer='c'; histFrom=a; histTo=b||a; histLimit=60; sh.close(true); renderHist(); rise($('#scrHist')); };
    bd.querySelector('[data-ok]').onclick=finish;
  }});
}
// отчёт за период: текст и таблица — ботом в личку
function sendReport(R){
  const sh=periodShifts(R), pays=periodPays(R), pid=chipPerson();
  const total=sh.reduce((a,s)=>a+(Number(s.total)||0),0), kassa=sh.reduce((a,s)=>a+(Number(s.kassa)||0),0), w={};
  sh.forEach(s=>s.workerIds.forEach(id=>w[id]=(w[id]||0)+(Number(workerShare(s,id))||0)));
  const owe={}; sh.forEach(s=>(s.custLinks||[]).forEach(l=>{ const d=due(l); if(d>0.004) owe[l.id]=(owe[l.id]||0)+d; }));
  const lines=['Учёт — '+R.name+(pid?' · '+(isWorker(pid)?wName(pid):cName(pid)):''),'',
    'Смен: '+sh.length+' · часов: '+sh.reduce((a,s)=>a+s.hours,0),'Сумма: '+money(total),'Касса: '+money(kassa)].concat(
    Object.keys(w).map(id=>wName(id)+': '+money(w[id])),['Получено: '+money(pays.reduce((a,p)=>a+p.amount,0))],
    Object.keys(owe).length?['','Должны:'].concat(Object.keys(owe).sort((a,b)=>owe[b]-owe[a]).map(id=>'· '+cName(id)+' — '+money(owe[id]))):['','Долгов за период нет']);
  const q=v=>{ let t=String(v==null?'':v); if(typeof v==='string' && /^[=+\-@\t\r]/.test(t)) t="'"+t; return '"'+t.replace(/"/g,'""')+'"'; };
  const rows=[['Дата','Начало','Конец','Часы','Операторы','Кастомеры','Сумма','Касса','Долг']].concat(sh.slice().sort(byOld).map(s=>[s.work_date,hhmm(s.start_time),s.start_time?tHM(shiftEndMs(s)):'',s.hours,
    s.workerIds.map(id=>wName(id)+' '+r2(Number(workerShare(s,id))||0)).join(' / '),(s.custLinks||[]).map(l=>cName(l.id)+' '+r2(l.amount)).join(' + '),s.total,s.kassa,
    r2((s.custLinks||[]).reduce((a,l)=>a+due(l),0))]));
  const csv='﻿'+rows.map(r=>r.map(q).join(';')).join('\r\n');
  const text=lines.join('\n');
  try{ navigator.clipboard.writeText(text).catch(()=>{}); }catch(_){}
  if(!TG) toast('Таблица сохранена, текст сводки скопирован');
  download('uchet-'+(R.from?R.from+'-':'')+(R.to>'9000'?today():R.to)+'.csv',csv,'text/csv',text);
}

/* «Люди» — рабочая сводка по каждому за общий период */
let pplSort='debt', pplOpen=null;
function peopleRows(R){
  const dl=debts(), rows=[];
  S.customers.forEach(function(c){
    const all=personSessions('c',c.id), inP=all.filter(x=>inRange(x.s.work_date,R)), d=dl.find(x=>x.id===c.id);
    if(c.active===false && !d) return;
    rows.push({id:c.id,name:c.name,all:all,sess:inP,ms:inP.reduce((a,x)=>a+x.ms,0),n:inP.length,brought:inP.reduce((a,x)=>a+x.amount,0),
      last:all.length?all[0].s.work_date:null, debt:d?d.total:0, items:d?d.items:[], oldest:d?d.oldest:null});
  });
  const q=histQ.trim().toLowerCase();
  const r=q?rows.filter(x=>x.name.toLowerCase().includes(q)):rows;
  const cmp={debt:(a,b)=>b.debt-a.debt||b.ms-a.ms, hours:(a,b)=>b.ms-a.ms, brought:(a,b)=>b.brought-a.brought,
    away:(a,b)=>(a.last||'0')<(b.last||'0')?-1:(a.last||'0')>(b.last||'0')?1:0, name:(a,b)=>String(a.name).localeCompare(b.name)}[pplSort];
  return r.sort(cmp);
}
function peopleHTML(R){
  const rows=peopleRows(R), owe=rows.filter(x=>x.debt>0.004), tot=owe.reduce((a,x)=>a+x.debt,0), hrs=rows.reduce((a,x)=>a+x.ms,0);
  let h='<div class="card hsum sheen '+(tot>0.004?'tone-debt':'tone-ok')+'" style="'+sheenDelay()+'"><div class="hst"><span>'+(tot>0.004?'Должны':'Долгов нет')+'</span></div>'+
    '<div class="hsv">'+(tot>0.004?moneyHTML(tot):'<span style="color:var(--ok)">✓</span>')+'</div>'+
    '<div class="t2" style="font-size:13.5px">'+owe.length+' из '+rows.length+' должны · '+Math.round(hrs/36e5)+' ч за '+R.name+'</div></div>'+
    '<div class="pills" style="margin:12px 0 10px">'+[['debt','Долг'],['hours','Больше сидел'],['brought','Больше принёс'],['away','Давно не был'],['name','А–Я']]
      .map(c=>'<button class="pill" data-sort="'+c[0]+'" aria-pressed="'+(pplSort===c[0])+'">'+c[1]+'</button>').join('')+'</div>';
  if(!rows.length) return h+'<div class="empty">Никого не нашлось</div>';
  return h+rows.map(x=>{
    const debt=x.debt>0.004, old=debt?Math.round((Date.parse(today()+'T00:00Z')-Date.parse(x.oldest+'T00:00Z'))/864e5):0;
    return '<div class="swipe sheen'+(debt?' tone-debt':'')+'" data-pp="'+x.id+'" style="'+sheenDelay()+'"><div class="under"><span class="r">Заплатил всё</span><span class="l"><button data-prof>Профиль</button></span></div>'+
      '<div class="face"><div class="debtor">'+avHTML(x.name)+'<div class="mid"><div class="nm">'+esc(x.name)+'</div>'+
        '<div class="sm">'+(x.n?Math.round(x.ms/36e5*10)/10+' ч · '+x.n+' '+plural(x.n,'смена','смены','смен'):'не сидел')+' · '+lastSeen(x.last)+'</div>'+
        activityStrip(x.all).replace('class="strip"','class="strip" style="--pc:'+personColor(x.name)+'"')+'</div>'+
        '<div class="rt">'+(debt?'<div class="sum" style="color:var(--debt)">'+moneyHTML(x.debt)+'</div><span class="st debt">'+(old>7?old+' дн.':'долг')+'</span>'
          :'<div class="sum">'+moneyHTML(x.brought)+'</div><span class="st none">принёс</span>')+'</div></div>'+
      '<div class="pdet'+(pplOpen===x.id?' open':'')+'"><div>'+
        (debt?x.items.map(it=>'<button class="kv" data-sh="'+it.s.id+'" style="width:100%"><span>'+dayLabel(it.s.work_date)+' · смена '+m$(it.s.total)+'</span><b>'+m$(it.due)+'</b></button>').join(''):'')+
        '<div style="display:flex;gap:8px;margin-top:8px">'+(debt&&!locked?'<button class="btn" data-settle style="height:44px;flex:1">Рассчитать</button>':'')+
        '<button class="btn sec" data-prof2 style="height:44px;flex:1;margin-top:0">Профиль ›</button></div></div></div>'+
      '</div></div>';
  }).join('');
}
function bindPeople(sc){
  sc.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{ pplSort=b.dataset.sort; haptic('pick'); renderHist(); rise(sc); });
  sc.querySelectorAll('[data-pp]').forEach(function(w){
    const id=w.dataset.pp, x=()=>debts().find(d=>d.id===id);
    const face=w.querySelector('.face');
    face.onclick=e=>{
      const sh=e.target.closest('[data-sh]'); if(sh){ shiftSheet(sh.dataset.sh); return; }
      if(e.target.closest('[data-settle]')){ settleSheet(id); return; }
      if(e.target.closest('[data-prof2]')){ profileSheet('c',id); return; }
      haptic('tap'); pplOpen=pplOpen===id?null:id;
      sc.querySelectorAll('.pdet').forEach(p=>p.classList.toggle('open',p.closest('[data-pp]').dataset.pp===pplOpen));
    };
    w.querySelector('[data-prof]').onclick=e=>{ e.stopPropagation(); w._close(); profileSheet('c',id); };
    swipeable(w,{ right:(locked||!x())?null:()=>settleAll(id,w), left:true });
  });
}


// потянул список вниз от верха — открылся поиск
(function(){
  const sc=$('#scrHist'); let y0=null;
  sc.addEventListener('touchstart',e=>{ y0=sc.scrollTop<=0?e.touches[0].clientY:null; },{passive:true});
  sc.addEventListener('touchmove',e=>{ if(y0==null||searchOpen) return; if(e.touches[0].clientY-y0>70){ y0=null; searchOpen=true; haptic('pick');
    const s=sc.querySelector('.search'); if(s) s.classList.add('open'); } },{passive:true});
})();
async function copyShift(s){
  const txt=dayLabel(s.work_date)+(s.start_time?', '+hhmm(s.start_time)+'–'+tHM(shiftEndMs(s)):'')+' · '+s.hours+' ч · '+money(s.total)+
    '\nОператоры: '+s.workerIds.map(wName).join(', ')+(s.customerIds.length?'\nКастомеры: '+(s.custLinks||[]).map(l=>cName(l.id)+' '+money(l.amount)+(due(l)>0.004?' (долг '+money(due(l))+')':'')).join(', '):'')+(s.note?'\n'+s.note:'');
  try{ await navigator.clipboard.writeText(txt); toast('Скопировано'); }catch(e){ toast('Не скопировалось',true); }
}
// удалить смену: сразу пропадает, через 5 секунд — из базы (если не отменили)
const hiddenIds=new Set();   // удалено, но 5 секунд можно вернуть — при обновлении не показываем
async function deleteShift(sid){
  const s=S.shifts.find(x=>x.id===sid); if(!s) return;
  if(s.pending){   // ещё не отправлена — убираем из очереди, 5 секунд можно вернуть
    const q=queue.find(x=>x.sid===sid);
    queue=queue.filter(x=>x.sid!==sid); saveQueue(); S.shifts=S.shifts.filter(x=>x.id!==sid); renderAll(); sheets.slice().forEach(x=>x.close(true)); haptic('warn');
    offerUndo('Неотправленная смена убрана',{onUndo:()=>{ if(q){ queue.push(q); saveQueue(); applyPending(); } renderAll(); }}); return; }
  if(!liveReady()) return;
  const paid=(s.custLinks||[]).reduce((a,l)=>a+(l.paidAmt||0),0);
  if(paid>0.004 && !await ask('По этой смене уже заплатили '+m$(paid)+' — эти расчёты тоже отменятся. Удалить смену?')) return;
  hiddenIds.add(sid); S.shifts=S.shifts.filter(x=>x.id!==sid); renderAll(); haptic('warn');
  sheets.slice().forEach(x=>x.close(true));
  offerUndo('Смена '+dayText(s.work_date)+' удалена',{
    onUndo:()=>{ hiddenIds.delete(sid); if(!S.shifts.some(x=>x.id===sid)) S.shifts.push(s); renderAll(); toast('Смена возвращена'); },
    onCommit:async(leaving)=>{
      // сообщение в чаты собирается из базы — отправляем, даем ему прочитать смену, потом удаляем вместе с её оплатами;
      // если учет закрывают прямо сейчас — удаляем сразу, без сообщения
      if(!leaving){ sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:'cancel'}}).catch(function(){}); await new Promise(r=>setTimeout(r,900)); }
      const {error}=await sb.rpc('delete_shift',{p_id:sid});
      hiddenIds.delete(sid);
      if(error){ if(!S.shifts.some(x=>x.id===sid)) S.shifts.push(s); renderAll(); return fail(error,'Не удалилась'); }
      scheduleReload(); }
  });
}

/* ======================= «+»: НОВАЯ СМЕНА ======================= */
// Операторы — как в прошлый раз, кастомеры — частые сверху. «Начать» — одно нажатие.
function lastCrew(){
  const l=(S.live||[]).slice().sort((a,b)=>Date.parse(b.started_at)-Date.parse(a.started_at))[0];
  const s=S.shifts.filter(x=>!x.pending)[0];
  const ids=(l&&l.worker_ids&&l.worker_ids.length)?l.worker_ids:(s?s.workerIds:[]);
  const act=ids.filter(id=>(S.workers.find(w=>w.id===id)||{}).active!==false);
  if(act.length) return act;
  const me=S.workers.find(w=>w.is_me&&w.active!==false); return me?[me.id]:[];
}
function chipsPeople(kind,sel,limit){
  // выбранные — всегда на виду, даже если их нет среди частых
  const fr=freq(kind), top=fr.slice(0,limit||40), extra=sel.filter(id=>!top.some(p=>p.id===id)).map(id=>fr.find(p=>p.id===id)||{id:id,name:kind==='c'?cName(id):wName(id)});
  return extra.concat(top).map(p=>{ const on=sel.includes(p.id), nm=p.name;
    return '<button class="pp '+(on?'on':'off')+'" data-pk="'+p.id+'" aria-pressed="'+on+'"><div class="av" style="--pc:'+personColor(nm)+'">'+esc(initials(nm))+'</div><div class="tm nm1">'+esc(nm)+'</div></button>'; }).join('');
}
const runningLive=()=>(S.live||[]).filter(l=>!l.finished_at);
const finishedLive=()=>(S.live||[]).filter(l=>l.finished_at&&!hiddenIds.has(l.id));
// смена, в которую «+» сажает людей: та, что на экране (на «Истории» — последняя открытая)
function curLive(){ const lr=liveRows(); const l=lr[Math.min(liveIdx,lr.length-1)]; return l&&!l.finished_at?l:runningLive()[0]; }
const ROMSG='Записи ведут владелец и те, у кого есть правка';
// «+»: нажал — новая смена (а во время смены — посадить кастомера); держишь — веер
function plusTap(){
  if(locked) return toast(ROMSG);
  const l=curLive();
  if(l) return seatSheet(l);
  plusSheet();
}
function seatSheet(l){
  const sh=openSheet({detent:'full',from:$('#plus'),onClose:()=>$('#plus').classList.remove('open')}); $('#plus').classList.add('open');
  pickPeople('c',l,async pid=>{
    const {data,error}=await sb.rpc('live_player',{p_id:l.id,p_customer:pid,p_action:'sit'});
    if(error) return fail(error);
    if(data&&data.id) putLive(data); haptic('soft'); sh.close(true); toast(cName(pid)+' сел за стол'); renderNow();
  },sh,'в смену '+(l.worker_ids||[]).map(wName).join(', ')+' · с '+tHM(Date.parse(l.started_at)));
}
// сразу начать с теми же операторами — 5 секунд можно передумать без следа
async function quickStart(){
  if(locked) return toast(ROMSG);
  const crew=lastCrew(); if(!crew.length) return plusSheet();
  if(!liveReady()) return;
  const {data,error}=await sb.from('live_shifts').insert({worker_ids:crew}).select().single();
  if(error) return fail(error,'Смена не началась');
  putLive(data); afterStart(data);
  offerUndo('Смена началась · '+crew.map(wName).join(', '),{
    onUndo:async()=>{ hiddenIds.add(data.id); S.live=S.live.filter(z=>z.id!==data.id); renderNow();
      const {error}=await sb.from('live_shifts').delete().eq('id',data.id); hiddenIds.delete(data.id);
      if(error){ putLive(data); renderNow(); return fail(error,'Не отменилась'); } toast('Смена отменена'); } });
}
function afterStart(data){
  haptic('ok'); goTab('now'); liveIdx=liveRows().findIndex(x=>x.id===data.id); renderNow(); renderAll();
  const rb=document.querySelector('.lcard[data-live="'+data.id+'"] .ringbox');
  if(rb){ const q=rb.getBoundingClientRect(); wave('rgba(255,69,58,.6)',q.left+q.width/2,q.top+q.height/2); }
  if(rb&&!reduce()) rb.animate([{transform:'scale(.3)',opacity:0},{transform:'scale(1.03)',opacity:1,offset:.7},{transform:'none',opacity:1}],{duration:520,easing:'cubic-bezier(.32,.72,0,1)'});
}
// веер над «+»: держишь — всплывают три кружка, отпускаешь палец на нужном
function fanItems(){
  const live=!!curLive();
  return [live?{k:'more',ic:'✚',t:'Ещё смена',fn:()=>plusSheet()}:{k:'quick',ic:'▶',t:'Как в прошлый раз',fn:quickStart},
    {k:'past',ic:'↺',t:'Прошедшая',fn:()=>plusSheet('past')},
    {k:'settle',ic:'$',t:'Рассчитать',fn:()=>{ if(!debts().length) return toast('Долгов нет — все рассчитаны'); debtsSheet(); }}];
}
(function(){
  const p=$('#plus'); let t=null, fan=null, items=[], cur=-1, x0=0, y0=0, fired=false;
  const close=run=>{ if(!fan) return; const it=items[cur]; fan.classList.remove('on'); const f=fan; setTimeout(()=>f.remove(),250); fan=null; p.classList.remove('held');
    if(run&&it){ haptic('ok'); it.fn(); } cur=-1; };
  const open=()=>{
    if(locked){ toast(ROMSG); return; }
    fired=true; items=fanItems(); haptic('hard'); p.classList.add('held');
    const r=p.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    fan=document.createElement('div'); fan.id='fan';
    fan.innerHTML=items.map((it,i)=>{ const ang=(-150+i*60)*Math.PI/180, R=92, x=cx+R*Math.cos(ang), y=cy+R*Math.sin(ang);
      return '<div class="fi" data-i="'+i+'" style="left:'+x+'px;top:'+y+'px;--d:'+(i*40)+'ms"><i>'+it.ic+'</i><span>'+esc(it.t)+'</span></div>'; }).join('');
    document.body.appendChild(fan); requestAnimationFrame(()=>fan&&fan.classList.add('on'));
  };
  const hover=(x,y)=>{ if(!fan) return; let best=-1, bd=1e9;
    fan.querySelectorAll('.fi').forEach((el,i)=>{ const r=el.getBoundingClientRect(), d=Math.hypot(r.left+r.width/2-x,r.top+r.height/2-y); if(d<52&&d<bd){ bd=d; best=i; } });
    if(best!==cur){ cur=best; if(best>=0) haptic('pick'); fan.querySelectorAll('.fi').forEach((el,i)=>el.classList.toggle('hot',i===best)); } };
  p.addEventListener('pointerdown',e=>{ fired=false; x0=e.clientX; y0=e.clientY; try{ p.setPointerCapture(e.pointerId); }catch(_){} t=setTimeout(()=>{ t=null; open(); },380); });
  p.addEventListener('pointermove',e=>{ if(t&&Math.hypot(e.clientX-x0,e.clientY-y0)>12){ clearTimeout(t); t=null; } if(fan) hover(e.clientX,e.clientY); });
  p.addEventListener('pointerup',()=>{ if(t){ clearTimeout(t); t=null; } if(fan) close(true); });
  p.addEventListener('pointercancel',()=>{ if(t){ clearTimeout(t); t=null; } close(false); });
  p.addEventListener('contextmenu',e=>e.preventDefault());
  p.onclick=e=>{ if(fired){ fired=false; e.preventDefault(); return; } plusTap(); };
})();
// «Новая смена»: люди выбираются один раз, а «Сейчас / Прошедшая» решает, что дальше
function plusSheet(mode0){
  const fin=finishedLive()[0];
  let mode=mode0||(fin?'past':'now'), selW=lastCrew(), selC=[], day=today(), ts=null, te=null, autoT=false;
  const sh=openSheet({detent:mode==='past'?'full':'half',from:$('#plus'),onClose:()=>$('#plus').classList.remove('open')}); $('#plus').classList.add('open');
  sh.push({title:'Новая смена', render(b){
    const past=mode==='past';
    b.innerHTML='<div class="segmini seg2" style="margin:2px 0 4px"><button data-mode="now" aria-pressed="'+!past+'">Сейчас</button><button data-mode="past" aria-pressed="'+past+'">Прошедшая</button></div>'+
      (past&&fin?'<button class="arow sheen tone-debt" data-fin style="margin-top:10px"><span class="adot"></span><div class="mid"><div class="nm">Смена '+tHM(Date.parse(fin.started_at))+'–'+tHM(Date.parse(fin.finished_at))+' ждёт сохранения</div><div class="sm">открыть её итог</div></div><span class="chev">›</span></button>':'')+
      '<span class="cap" style="margin-top:14px">Операторы</span><div class="people" data-kw>'+chipsPeople('w',selW)+'</div>'+
      '<span class="cap">Кастомеры'+(past?'':' — можно добавить по ходу')+'</span><div class="people" data-kc>'+chipsPeople('c',selC,14)+
        '<button class="pp add" data-more><div class="av">+</div><div class="tm">ещё</div></button></div>'+
      (past?'<span class="cap">Когда</span><div class="timepair three"><button data-day><span>День</span><b>'+(day===today()?'сегодня':dayText(day))+'</b></button>'+
          '<button data-t="s"><span>Начало</span><b class="num">'+(ts!=null?tHM(ts):'—')+'</b></button><button data-t="e"><span>Конец</span><b class="num">'+(te!=null?tHM(te)+(khParts(te).d!==day?' <em>+1</em>':''):'—')+'</b></button></div>'+
          '<button class="btn" data-next style="margin-top:18px">Дальше к итогу ›</button>'
        :'<button class="btn" data-start style="margin-top:22px"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>Начать <span class="num" data-now></span></button>');
    b.querySelectorAll('[data-mode]').forEach(x=>x.onclick=()=>{ if(mode===x.dataset.mode) return; mode=x.dataset.mode; haptic('pick'); if(mode==='past') sh.set('full'); sh.top().render(); });
    const fb=b.querySelector('[data-fin]'); if(fb) fb.onclick=()=>{ sh.close(true); finishSheet(draftFromLive(fin)); };
    const tog=(arr,id)=>arr.includes(id)?arr.filter(x=>x!==id):arr.concat(id);
    b.querySelector('[data-kw]').onclick=e=>{ const p=e.target.closest('[data-pk]'); if(!p) return; haptic('soft'); selW=tog(selW,p.dataset.pk); sh.top().render(); };
    b.querySelector('[data-kc]').onclick=e=>{ const p=e.target.closest('[data-pk]'); if(p){ haptic('soft'); selC=tog(selC,p.dataset.pk); sh.top().render(); return; }
      if(e.target.closest('[data-more]')) pickPeople('c',{customer_ids:selC},id=>{ if(!selC.includes(id)) selC.push(id); },sh); };
    if(!past){
      const now=b.querySelector('[data-now]'); const tk=()=>{ now.textContent=tHM(nowMs()); }; tk(); const iv=setInterval(()=>{ if(!b.isConnected) return clearInterval(iv); tk(); },5000);
      const st=b.querySelector('[data-start]'); st.disabled=!selW.length;
      st.onclick=async function(){
        if(!liveReady()) return;
        if(runningLive().length && !await ask('Уже идёт смена. Начать ещё одну параллельно?')) return;
        this.disabled=true;
        const {data,error}=await sb.from('live_shifts').insert({worker_ids:selW}).select().single();
        if(error){ this.disabled=false; return fail(error,'Смена не началась'); }
        putLive(data);
        for(const cid of selC){ const r=await sb.rpc('live_player',{p_id:data.id,p_customer:cid,p_action:'sit'}); if(r.data&&r.data.id) putLive(r.data); }
        sh.close(true); afterStart(data);
      };
      return;
    }
    // прошедшая: день календарём, начало и конец — барабанами; пока не выбрано, дальше нельзя
    b.querySelector('[data-day]').onclick=()=>pickDate(sh,{value:day,onPick:d=>{ const dl=(Date.parse(d+'T00:00Z')-Date.parse(day+'T00:00Z')); day=d; if(ts!=null){ ts+=dl; te+=dl; } }});
    b.querySelectorAll('[data-t]').forEach(t=>t.onclick=()=>{
      const k=t.dataset.t, base=k==='s'?(ts!=null?ts:khToMs(day,'18:00')):(te!=null?te:(ts!=null?ts+3*3600e3:khToMs(day,'21:00')));
      pickTime(sh,{title:k==='s'?'Начало':'Конец',value:base,ref:base,onPick:ms=>{
        if(k==='s'){ ms=khToMs(day,khParts(ms).t); ts=ms; if(te!=null&&te<=ts) te=null; }
        else { let v=khToMs(day,khParts(ms).t); if(ts!=null&&v<=ts) v+=864e5; te=v; }
      }});
    });
    const nx=b.querySelector('[data-next]'); nx.disabled=!(selW.length&&ts!=null&&te!=null);
    nx.onclick=()=>{ if(te-ts<30*60e3) return toast('Меньше 30 минут — записывать нечего',true);
      if(te>nowMs()+60e3) return toast('Конец ещё не наступил — идущую смену начни через «Сейчас»',true);
      manualLevel(sh,selW,selC,ts,te); };
    // начало открывается само один раз — дальше только по нажатию (иначе выбор людей и «Назад» снова открывали барабаны)
    if(ts==null&&!autoT){ autoT=true; setTimeout(()=>{ if(b.isConnected&&ts==null&&sh.levels.length===1&&mode==='past'){ const x=sh.top().body.querySelector('[data-t="s"]'); if(x) x.click(); } },mode0==='past'?520:120); }
  }});
  return sh;
}
// календарь: один день (будущее — нельзя)
function pickDate(sh,o){
  let ym=(o.value||today()).slice(0,7);
  sh.push({title:o.title||'День', render(b){
    const p=ym.split('-').map(Number), first=new Date(Date.UTC(p[0],p[1]-1,1)), days=new Date(Date.UTC(p[0],p[1],0)).getUTCDate(), lead=(first.getUTCDay()+6)%7;
    b.innerHTML='<div class="calhead" style="margin-top:4px"><button data-m="-1">‹</button><b>'+MONFULL[p[1]-1]+' '+p[0]+'</b><button data-m="1"'+(ym>=today().slice(0,7)?' disabled':'')+'>›</button></div>'+
      '<div class="cal">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span class="wd">'+x+'</span>').join('')+'<span></span>'.repeat(lead)+
      Array.from({length:days},(_,i)=>{ const ds=ym+'-'+z2(i+1);
        return '<button class="cd'+(ds===o.value?' edge':'')+(ds===today()?' td':'')+'" data-day="'+ds+'"'+(ds>today()?' disabled':'')+'>'+(i+1)+'</button>'; }).join('')+'</div>';
    b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{ const q=ym.split('-').map(Number); ym=new Date(Date.UTC(q[0],q[1]-1+Number(x.dataset.m),1)).toISOString().slice(0,7); sh.top().render(); });
    b.querySelectorAll('[data-day]').forEach(x=>x.onclick=()=>{ haptic('tap'); afterPick(sh,()=>o.onPick(x.dataset.day)); });
  }});
}
// выбор человека из списка с поиском; «Новый …» — сразу создать
function pickPeople(kind,l,onPick,host,lead){
  const sh=host||openSheet({detent:'full'});
  const lv={title:kind==='c'?'Кастомеры':'Операторы', render(b){
    const have=l?(kind==='c'?l.customer_ids:l.worker_ids)||[]:[];
    b.innerHTML=(lead?'<div class="lead" style="margin-top:-4px">'+esc(lead)+'</div>':'')+'<input type="search" data-q placeholder="Найти или вписать нового" style="margin-bottom:12px"><div class="list" data-l></div>';
    const q=b.querySelector('[data-q]'), L=b.querySelector('[data-l]');
    const draw=()=>{ const t=q.value.trim().toLowerCase();
      const list=freq(kind).filter(p=>!have.includes(p.id)&&(!t||p.name.toLowerCase().includes(t)));
      L.innerHTML=list.map(p=>'<button class="row" data-id="'+p.id+'" style="width:100%;text-align:left">'+avHTML(p.name,'s')+'<div class="mid"><div class="nm">'+esc(p.name)+'</div></div></button>').join('')+
        (t&&!freq(kind).some(p=>p.name.toLowerCase()===t)?'<button class="row" data-new style="width:100%;text-align:left"><div class="av s">+</div><div class="mid"><div class="nm">Новый: «'+esc(q.value.trim())+'»</div></div></button>':'')+
        (!list.length&&!t?'<div class="empty">Все уже в смене</div>':''); };
    draw(); q.oninput=draw;
    L.onclick=async e=>{
      const r=e.target.closest('[data-id]');
      if(r){ haptic('soft'); if(host) afterPick(sh,()=>onPick(r.dataset.id)); else { sh.close(); onPick(r.dataset.id); } return; }
      if(e.target.closest('[data-new]')){
        if(locked) return; const name=q.value.trim();
        const {data,error}=await sb.from(kind==='c'?'customers':'workers').insert({name:name}).select().single();
        if(error) return fail(error,'Не добавился');
        (kind==='c'?S.customers:S.workers).push(data); haptic('ok'); if(host) afterPick(sh,()=>onPick(data.id)); else { sh.close(); onPick(data.id); }
      }
    };
  }};
  sh.push(lv);
}
// человек в идущей смене: время, «платит за всех», убрать
function personInShiftSheet(lid,k,pid){
  const sh=openSheet({detent:'half'});
  sh.push({title:k==='c'?cName(pid):wName(pid), render(b){
    const l=(S.live||[]).find(x=>x.id===lid); if(!l){ sh.close(); return; }
    const sp=(k==='c'?livePlayerSpans(l,nowMs()):liveWorkerSpans(l,nowMs())).find(x=>x.id===pid);
    b.innerHTML='<div class="lead">'+(sp?sp.spans.map(p=>tHM(p.s)+'–'+(p.e>=nowMs()-1000&&!l.finished_at?'сейчас':tHM(p.e))).join(', '):'')+'</div>'+
      (k==='c'?'<button class="btn sec" data-payer>'+(l.payer_id===pid?'Не платит за всех':'Платит за всех, кто сидел с ним')+'</button>':'')+
      (()=>{ const lg=(k==='c'?lLog(l):wLogOf(l)).filter(x=>x.id===pid), c=lg[lg.length-1];
        return '<button class="btn sec" data-time>'+(k==='c'?'Сел в ':'Заступил в ')+tHM(c?Date.parse(c.s):Date.parse(l.started_at))+' — поправить</button>'+
          (c&&c.e?'<button class="btn sec" data-time-e style="margin-top:8px">'+(k==='c'?'Встал в ':'Ушёл в ')+tHM(Date.parse(c.e))+' — поправить</button>':''); })()+
      '<button class="btn red" data-rm style="margin-top:8px">Убрать из смены</button>';
    const pb=b.querySelector('[data-payer]');
    if(pb) pb.onclick=async()=>{ const {data,error}=await sb.from('live_shifts').update({payer_id:l.payer_id===pid?null:pid}).eq('id',lid).select().single();
      if(error) return fail(error); putLive(data); haptic('ok'); sh.close(); renderNow(); };
    const log=(k==='c'?lLog(l):wLogOf(l)).filter(x=>x.id===pid), cur=log[log.length-1];
    // поправить, когда сел и когда встал (последний отрезок)
    const fix=(field,title,ms0)=>pickTime(sh,{title:title,value:ms0,ref:ms0,onPick:async ms=>{
      if(field==='e'&&cur&&ms<=Date.parse(cur.s)) return toast('Встал раньше, чем сел',true);
      if(field==='s'&&cur&&cur.e&&ms>=Date.parse(cur.e)) return toast('Сел позже, чем встал',true);
      const all=(k==='c'?lLog(l):wLogOf(l)).slice(), snap=liveSnap(l);
      if(cur){ const i=all.lastIndexOf(cur); all[i]=Object.assign({},cur,{[field]:new Date(ms).toISOString()}); }
      else all.push({id:pid,s:new Date(ms).toISOString(),e:null});
      const {data,error}=await sb.from('live_shifts').update(k==='c'?{customer_log:all}:{worker_log:all}).eq('id',lid).select().single();
      if(error) return fail(error); putLive(data); haptic('ok'); sh.close(); renderNow(); undoLive(lid,snap,'Время '+(k==='c'?cName(pid):wName(pid))+' поправлено'); }});
    const s0=cur?Date.parse(cur.s):Date.parse(l.started_at);
    b.querySelector('[data-time]').onclick=()=>fix('s',k==='c'?'Сел в':'Заступил в',s0);
    const te=b.querySelector('[data-time-e]'); if(te) te.onclick=()=>fix('e',k==='c'?'Встал в':'Ушёл в',Date.parse(cur.e));
    b.querySelector('[data-rm]').onclick=async()=>{
      const snap=liveSnap(l);
      if(k==='w'&&(l.worker_ids||[]).length<2) return toast('В смене должен быть хотя бы один оператор',true);
      const {data,error}=await sb.rpc(k==='c'?'live_player':'live_worker',k==='c'?{p_id:lid,p_customer:pid,p_action:'remove'}:{p_id:lid,p_worker:pid,p_action:'remove'});
      if(error) return fail(error); if(data&&data.id) putLive(data); haptic('warn'); sh.close(); renderNow();
      undoLive(lid,snap,(k==='c'?cName(pid):wName(pid))+' убран из смены'); };
  }});
}

/* ======================= ИТОГ СМЕНЫ ======================= */
// Один экран для конца живой смены, ручной записи прошедшей и правки записанной.
function manualLevel(sh,selW,selC,start,end){
  const d={mode:'manual', start:start, end:end, pauses:[], discount:0, note:'',
    workers:selW.map(id=>({id:id,spans:null})), customers:selC.map(id=>({id:id,spans:null,paid:null})), payer:null};
  finishLevel(sh,d,'Прошедшая смена');
}
function finishSheet(d){ const sh=openSheet({detent:'full'}); finishLevel(sh,d); return sh; }
function editShift(sid){ const s=S.shifts.find(x=>x.id===sid); if(!s||s.pending||!liveReady()) return; const had=sheets.length; sheets.slice().forEach(x=>x.close(true)); setTimeout(()=>finishSheet(draftFromShift(s)),had?300:0); }
function finishLevel(sh,d,title){
  const lv={title:title||'Итог', render(b,me){
    const x=draftCalc(d), live=d.mode==='live', edit=d.mode==='edit';
    const T=()=>{ d.dirty=true; d.touched=true; };   // поменяли то, от чего зависят суммы
    sh.guard=()=>!!d.dirty;
    me.setTitle((title?'':'Смена · ')+x.h+' ч · '+m$(x.c.total));
    const tl=timelineHTML({start:d.start,end:d.end,pauses:x.pauses,
      rows:d.customers.map(p=>({name:cName(p.id),spans:p.spans||[{s:d.start,e:d.end}]})).concat(d.workers.map(p=>({name:wName(p.id),spans:p.spans||[{s:d.start,e:d.end}],w:1})))});
    const isNew=id=>!edit||!((d.orig&&d.orig.custLinks)||[]).some(l=>l.id===id);
    const crow=cr=>{ const src=d.customers.find(p=>p.id===cr.customer_id), paidAll=cr.paid_amount>=cr.amount-0.004&&cr.amount>0.004, part=cr.paid_amount>0.004&&!paidAll;
      const covered=cr.paid_by&&cr.amount<=0.004, unset=src&&src.paid==null&&!covered, ask_=!edit||isNew(cr.customer_id);
      return rowWrap('<div class="crow'+(unset?' unset':'')+'" data-c="'+cr.customer_id+'">'+avHTML(cName(cr.customer_id),'s')+'<div class="mid" data-time role="button"><div class="nm">'+esc(cName(cr.customer_id))+(d.payer===cr.customer_id?' · за всех':'')+'</div>'+
        '<div class="sm">'+(covered?'платит '+esc(cName(cr.paid_by)):edit?'':part?'заплатил '+m$(cr.paid_amount)+', долг '+m$(cr.amount-cr.paid_amount):(cr.covered>0.004?'свои '+m$(cr.share):''))+'</div></div>'+
        (covered?'':!ask_?'<b class="num" style="font-weight:500">'+m$(cr.amount)+'</b><span class="st '+(paidAll?'ok':'debt')+'">'+(paidAll?'оплачено':'долг '+m$(cr.amount-cr.paid_amount))+'</span>'
          :'<button class="a num" data-amt>'+m$(cr.amount)+'</button><div class="seg'+(unset?' unset':paidAll||part?'':' debt')+'"><button data-paid aria-pressed="'+(!unset&&(paidAll||part))+'">'+(part?'Часть':'Заплатил')+'</button><button data-debt aria-pressed="'+(!unset&&!(paidAll||part))+'">Долг</button></div>')+'</div>','c',cr.customer_id); };
    // кто ещё не отмечен — «Сохранить» ждёт
    const unsetN=x.crows.filter(c=>{ const p=d.customers.find(z=>z.id===c.customer_id); return p&&p.paid==null&&!(c.paid_by&&c.amount<=0.004)&&(!edit||isNew(c.customer_id)); }).length;
    const paidNow=x.crows.reduce((a,c)=>a+c.paid_amount,0), debtNow=x.crows.reduce((a,c)=>a+Math.max(0,c.amount-c.paid_amount),0);
    b.innerHTML=
      '<div class="tl" style="margin-top:4px">'+tl+'</div>'+
      '<div class="timepair" style="margin-top:14px"><button data-t="s"><span>Начало</span><b class="num">'+tHM(d.start)+'</b> <span style="display:inline">'+dayText(khParts(d.start).d)+'</span></button>'+
        '<button data-t="e"><span>Конец</span><b class="num">'+tHM(d.end)+'</b> <span style="display:inline">'+dayText(khParts(d.end).d)+'</span></button></div>'+
      '<div class="note" style="text-align:center">'+(x.orig?'суммы как записаны — поменяй время, людей или паузы, чтобы пересчитать':'отсижено '+clockHM(x.played)+' → к оплате '+x.h+' '+hourWord(x.h))+'</div>'+
      '<span class="cap">Паузы — не оплачиваются</span><div class="card" style="padding:4px 14px">'+
        (d.pauses.length?d.pauses.map((p,i)=>'<div class="prow"><button class="w num" data-ps="'+i+'" style="text-align:left">'+tHM(p.s)+' – '+(p.e?tHM(p.e):'…')+'</button><span class="d">'+(p.e?pauseText(Math.round((p.e-p.s)/60000))||'<1 мин':'')+'</span><button class="del" data-pd="'+i+'">✕</button></div>').join(''):'<div class="prow"><span class="w t3">Пауз не было</span></div>')+
        '<div class="prow"><button class="w t2" data-padd style="text-align:left">+ Пауза</button></div></div>'+
      '<span class="cap">Кастомеры</span><div class="card" style="padding:2px 14px">'+
        (x.crows.length?x.crows.map(crow).join(''):'<div class="prow"><span class="w t3">Впиши, кто сидел — без этого не рассчитаться</span></div>')+
        '<div class="prow"><button class="w t2" data-cadd style="text-align:left">+ Кастомер</button>'+(x.crows.some(c=>!edit||isNew(c.customer_id))?'<button class="pill" data-allpaid>Все заплатили</button>':'')+'</div></div>'+
        (x.crows.length?'<div class="note" style="margin:6px 4px 0">Смахни строку влево, чтобы убрать человека</div>':'')+
      (d.customers.length>1?'<span class="cap">Один платит за всех, кто сидел с ним</span><div class="pills">'+
        '<button class="pill" data-payer="" aria-pressed="'+!d.payer+'">Никто</button>'+d.customers.map(p=>'<button class="pill" data-payer="'+p.id+'" aria-pressed="'+(d.payer===p.id)+'">'+esc(cName(p.id))+'</button>').join('')+'</div>':'')+
      '<span class="cap">Операторы</span><div class="card" style="padding:2px 14px">'+
        x.wrows.map(w=>{ const sp=(d.workers.find(p=>p.id===w.worker_id)||{}).spans;
          return rowWrap('<div class="crow" data-w="'+w.worker_id+'">'+avHTML(wName(w.worker_id),'s')+'<div class="mid" data-time role="button"><div class="nm">'+esc(wName(w.worker_id))+'</div><div class="sm">'+(sp?sp.map(p=>tHM(p.s)+'–'+tHM(p.e)).join(', '):'вся смена')+' ›</div></div><b class="num" style="font-weight:500">'+m$(w.share)+'</b></div>','w',w.worker_id); }).join('')+
        '<div class="prow"><button class="w t2" data-wadd style="text-align:left">+ Оператор</button></div></div>'+
      '<span class="cap">Скидка и заметка</span>'+
      '<div style="display:flex;gap:10px"><input data-disc inputmode="decimal" placeholder="Скидка, $" value="'+(d.discount?String(d.discount).replace('.',','):'')+'" style="flex:0 0 120px"><input data-note placeholder="Заметка" value="'+esc(d.note)+'"></div>'+
      '<div class="flowline">'+(paidNow>0.004?'Заплатили '+m$(paidNow)+' → <b>кассе '+m$(x.now.kassa)+'</b>'+Object.keys(x.now.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(x.now.w[k])+'</b>').join(''):'')+
        (debtNow>0.004?(paidNow>0.004?'<br>':'')+'В долг: <b style="color:var(--debt)">'+m$(debtNow)+'</b>':'')+'</div>'+
      '<button class="btn" data-save style="margin-top:14px"'+(unsetN?' disabled':'')+'>'+(edit?'Сохранить изменения':'Сохранить')+'</button>'+
      (unsetN?'<div class="note" style="text-align:center;margin-top:6px">Отметь у '+(unsetN===1?'кастомера':'каждого кастомера')+': заплатил или долг</div>':'')+
      (live?'<button class="btn ghost" data-back>Вернуться к смене</button><button class="btn red" data-drop>Отменить смену без записи</button>':'')+
      (edit?'<button class="btn red" data-delsh>Удалить смену</button>':'');
    // время смены
    b.querySelectorAll('[data-t]').forEach(t=>t.onclick=()=>{
      const k=t.dataset.t; pickTime(sh,{title:k==='s'?'Начало':'Конец',value:k==='s'?d.start:d.end,ref:k==='s'?d.start:d.end,days:d.mode!=='live',
        onPick:ms=>{ const old=k==='s'?d.start:d.end;
          if(k==='s' && d.mode==='manual'){ const dl=ms-d.start; d.start=ms; d.end+=dl; d.pauses=d.pauses.map(p=>({s:p.s+dl,e:p.e&&p.e+dl}));
            [...d.workers,...d.customers].forEach(p=>{ if(p.spans) p.spans=p.spans.map(z=>({s:z.s+dl,e:z.e+dl})); }); T(); return; }
          if(k==='s'){ if(ms>=d.end) return toast('Начало позже конца',true); d.start=ms; } else { if(ms<=d.start) return toast('Конец раньше начала',true); d.end=ms; }
          T();
          // кто был до конца — и дальше до конца; кто пришел с начала — с нового начала
          [...d.workers,...d.customers].forEach(p=>{ if(!p.spans) return; p.spans=p.spans.map(z=>({s:z.s===old&&k==='s'?ms:z.s, e:z.e===old&&k==='e'?ms:z.e})); });
        }});
    });
    b.querySelectorAll('[data-ps]').forEach(t=>t.onclick=()=>{
      const i=Number(t.dataset.ps), p=d.pauses[i];
      pickTime(sh,{title:'Пауза — начало',value:p.s,ref:p.s,onPick:s=>pickTime(sh,{title:'Пауза — конец',value:p.e||s+15*60e3,ref:p.e||s,onPick:e=>{
        if(e<=s) return toast('Конец паузы раньше начала',true); d.pauses[i]={s:s,e:e}; T(); }})});
    });
    b.querySelectorAll('[data-pd]').forEach(t=>t.onclick=()=>{ haptic('warn'); d.pauses.splice(Number(t.dataset.pd),1); T(); me.render(); });
    // новая пауза — сначала выбрать время, добавится по «Готово»
    b.querySelector('[data-padd]').onclick=()=>{ const s0=Math.max(d.start,d.end-15*60e3);
      pickTime(sh,{title:'Пауза — начало',value:s0,ref:s0,onPick:s=>pickTime(sh,{title:'Пауза — конец',value:Math.min(d.end,s+15*60e3),ref:s+15*60e3,onPick:e=>{
        if(e<=s) return toast('Конец паузы раньше начала',true); d.pauses.push({s:s,e:e}); d.pauses.sort((a,z)=>a.s-z.s); T(); }})}); };
    // кастомеры: заплатил / долг / часть
    b.querySelectorAll('[data-c]').forEach(function(r){
      const id=r.dataset.c, src=d.customers.find(p=>p.id===id), cr=x.crows.find(c=>c.customer_id===id);
      const pd=r.querySelector('[data-paid]'), db=r.querySelector('[data-debt]'), am=r.querySelector('[data-amt]');
      if(pd) pd.onclick=()=>{ haptic('soft'); src.paid='all'; d.dirty=true; me.render(); };
      if(db) db.onclick=()=>{ haptic('soft'); src.paid=0; d.dirty=true; me.render(); };
      if(am) am.onclick=()=>pickAmount(sh,{title:cName(id)+' заплатил',lead:'По смене '+m$(cr.amount)+'. Впиши, сколько отдал сейчас — остаток уйдет в долг.',
        value:cr.paid_amount||cr.amount,max:cr.amount,allowZero:true,quick:[{l:'½',v:cr.amount/2},{l:'всё',v:cr.amount},{l:'0',v:0}],onPick:v=>{ src.paid=v>=cr.amount-0.004?'all':v; d.dirty=true; }});
    });
    // убрать человека: смах строки влево → «Убрать» (или долгое нажатие на имя); 5 секунд можно вернуть
    const removeP=(k,id)=>{
      const list=k==='c'?d.customers:d.workers, i=list.findIndex(p=>p.id===id); if(i<0) return;
      if(k==='w'&&d.workers.length<2) return toast('В смене должен быть хотя бы один оператор',true);
      const was=list[i], payer=d.payer; list.splice(i,1); if(k==='c'&&d.payer===id) d.payer=null; T(); haptic('warn'); me.render();
      offerUndo((k==='c'?cName(id):wName(id))+' убран из смены',{onUndo:()=>{ if(!list.some(p=>p.id===id)) list.splice(Math.min(i,list.length),0,was); d.payer=payer; T(); if(me.el.isConnected) me.render(); }});
    };
    b.querySelectorAll('.rsw').forEach(function(w){
      const k=w.dataset.k, id=w.dataset.id;
      swipeable(w,{left:true});
      w.querySelector('[data-rm]').onclick=e=>{ e.stopPropagation(); removeP(k,id); };
      const who=w.querySelector('.av'); if(who) longPress(who,()=>removeP(k,id));
    });
    // нажал на человека — его время в смене (отрезков может быть несколько)
    b.querySelectorAll('[data-time]').forEach(m=>m.onclick=()=>{ const r=m.closest('[data-c],[data-w]'), isC=!!r.dataset.c, id=r.dataset.c||r.dataset.w;
      const p=(isC?d.customers:d.workers).find(z=>z.id===id); if(p) spansLevel(sh,d,p,isC?cName(id):wName(id),T); });
    const ap=b.querySelector('[data-allpaid]'); if(ap) ap.onclick=()=>{ haptic('ok'); d.customers.forEach(p=>{ if(!edit||isNew(p.id)) p.paid='all'; }); d.dirty=true; me.render(); };
    b.querySelector('[data-cadd]').onclick=()=>pickPeople('c',{customer_ids:d.customers.map(p=>p.id)},id=>{ d.customers.push({id:id,spans:null,paid:null}); T(); },sh);
    b.querySelector('[data-wadd]').onclick=()=>pickPeople('w',{worker_ids:d.workers.map(p=>p.id)},id=>{ d.workers.push({id:id,spans:null}); T(); },sh);
    b.querySelectorAll('[data-payer]').forEach(p=>p.onclick=()=>{ haptic('pick'); d.payer=p.dataset.payer||null; T(); me.render(); });
    // скидка: пересчет чуть позже — чтобы нажатие, ради которого ушли из поля, не потерялось
    const disc=b.querySelector('[data-disc]'); disc.onchange=()=>{ const v=Math.max(0,parseAmt(disc.value)); if(v!==d.discount){
      if(v>x.c.full+0.004) toast('Скидка больше суммы смены ('+m$(x.c.full)+') — смена выйдет бесплатной',true);
      d.discount=v; T(); setTimeout(()=>{ if(me.el.isConnected) me.render(); },320); } };
    const note=b.querySelector('[data-note]'); note.oninput=()=>{ d.note=note.value; d.dirty=true; };
    b.querySelector('[data-save]').onclick=function(){ d.note=note.value; const v=Math.max(0,parseAmt(disc.value)); if(v!==d.discount){ d.discount=v; d.touched=true; } saveDraft(sh,d,this); };
    const bk=b.querySelector('[data-back]'); if(bk) bk.onclick=async()=>{
      const l=(S.live||[]).find(z=>z.id===d.liveId);
      if(l&&l.finished_at && !await ask('Смена продолжится. Время с '+tHM(Date.parse(l.finished_at))+' до сейчас тоже пойдёт в оплату. Вернуться к смене?')) return;
      const {data,error}=await sb.rpc('live_action',{p_id:d.liveId,p_action:'unfinish'}); if(error) return fail(error);
      if(data&&data.id) putLive(data); haptic('ok'); sh.close(true); renderNow(); };
    const dr=b.querySelector('[data-drop]'); if(dr) dr.onclick=()=>{
      const l=(S.live||[]).find(z=>z.id===d.liveId); if(!l) return;
      hiddenIds.add(l.id); S.live=S.live.filter(z=>z.id!==d.liveId); sh.close(true); renderNow(); haptic('warn');
      offerUndo('Смена отменена без записи',{onUndo:()=>{ hiddenIds.delete(l.id); if(!S.live.some(z=>z.id===l.id)) S.live.push(l); renderNow(); },
        onCommit:async()=>{ const {error}=await sb.from('live_shifts').delete().eq('id',l.id); hiddenIds.delete(l.id); if(error){ if(!S.live.some(z=>z.id===l.id)) S.live.push(l); renderNow(); fail(error,'Не удалилась'); } }});
    };
    const ds=b.querySelector('[data-delsh]'); if(ds) ds.onclick=()=>deleteShift(d.shiftId);
  }, onBack(){ lv._lvl&&lv._lvl.render(); }};
  lv._lvl=sh.push(lv);
}
const rowWrap=(html,k,id)=>'<div class="swipe rsw" data-k="'+k+'" data-id="'+id+'"><div class="under"><span class="l"><button class="del" data-rm>Убрать</button></span></div><div class="face">'+html+'</div></div>';
// время человека в смене: каждый отрезок «с — до» правится, лишний убирается, можно добавить
function spansLevel(sh,d,p,name,T){
  sh.push({title:name, render(b,me){
    const list=p.spans&&p.spans.length?p.spans:[{s:d.start,e:d.end}];
    b.innerHTML='<div class="lead">Когда '+esc(name)+' был в смене. Паузы вычитаются сами.</div><div class="card" style="padding:4px 14px">'+
      list.map((z,i)=>'<div class="prow"><button class="w num" data-i="'+i+'" style="text-align:left">'+tHM(z.s)+' – '+tHM(z.e)+'</button><span class="d">'+dur(z.e-z.s)+'</span>'+
        (list.length>1?'<button class="del" data-rm="'+i+'" aria-label="Убрать отрезок">✕</button>':'')+'</div>').join('')+
      '<div class="prow"><button class="w t2" data-add style="text-align:left">+ Ещё отрезок</button></div></div>'+
      (p.spans?'<button class="btn sec" data-all style="margin-top:14px">Был всю смену</button>':'')+
      '<button class="btn" data-ok style="margin-top:10px">Готово</button>';
    const put=v=>{ p.spans=v; T(); me.render(); };
    b.querySelectorAll('[data-i]').forEach(x=>x.onclick=()=>{ const i=Number(x.dataset.i), z=list[i];
      pickTime(sh,{title:'С',value:z.s,ref:z.s,onPick:s=>pickTime(sh,{title:'До',value:Math.max(z.e,s+60e3),ref:z.e,onPick:e=>{
        if(e<=s) return toast('Конец раньше начала',true);
        const nl=list.slice(); nl[i]={s:Math.max(d.start,s),e:Math.min(d.end,e)}; p.spans=nl.sort((a,c)=>a.s-c.s); T(); }})}); });
    b.querySelectorAll('[data-rm]').forEach(x=>x.onclick=()=>{ haptic('warn'); put(list.filter((_,i)=>i!==Number(x.dataset.rm))); });
    b.querySelector('[data-add]').onclick=()=>{ const last=list[list.length-1], s0=Math.min(d.end-60e3,last.e+15*60e3);
      pickTime(sh,{title:'С',value:s0,ref:s0,onPick:s=>pickTime(sh,{title:'До',value:d.end,ref:d.end,onPick:e=>{
        if(e<=s) return toast('Конец раньше начала',true);
        p.spans=list.concat([{s:Math.max(d.start,s),e:Math.min(d.end,e)}]).sort((a,c)=>a.s-c.s); T(); }})}); };
    const all=b.querySelector('[data-all]'); if(all) all.onclick=()=>{ haptic('tap'); put(null); };
    b.querySelector('[data-ok]').onclick=()=>sh.pop();
  }});
}
async function saveDraft(sh,d,btn){
  const x=draftCalc(d);
  if(x.h<1) return toast('Меньше 30 минут — записывать нечего',true);
  if(!d.workers.length) return toast('Нужен хотя бы один оператор',true);
  if(!d.customers.length && !(d.mode==='edit' && !(d.orig.custLinks||[]).length)) return toast('Впиши кастомеров — без них не рассчитаться',true);
  btn.disabled=true;
  try{
    if(d.mode==='live'){
      if(!liveReady()) return;
      const iso=v=>new Date(v).toISOString();
      const logOf=list=>[].concat(...list.filter(p=>p.spans).map(p=>p.spans.map(z=>({id:p.id,s:iso(z.s),e:iso(z.e)}))));
      const patch={started_at:iso(d.start),finished_at:iso(d.end),discount:x.c.discount,note:x.row.note,payer_id:d.payer||null,
        pause_log:d.pauses.filter(p=>p.e).map(p=>({s:iso(p.s),e:iso(p.e)})), pause_sec:Math.round(spanLen(x.pauses)/1000), paused_at:null,
        customer_log:logOf(d.customers), worker_log:logOf(d.workers),
        customer_ids:d.customers.map(p=>p.id), worker_ids:d.workers.map(p=>p.id)};
      const u=await sb.from('live_shifts').update(patch).eq('id',d.liveId).not('finished_at','is',null).select('id');
      if(u.error) return fail(u.error,'Не сохранилось');
      if(!u.data||!u.data.length){ sh.close(true); await reload(); return toast('Смену уже вернули к игре или сохранили на другом телефоне',true); }
      const {data:sid,error}=await sb.rpc('save_live_shift',{p_live:d.liveId,p_shift:x.row,
        p_workers:x.wrows.map(w=>({id:w.worker_id,share:w.share,spans:w.spans})),
        p_customers:x.crows.map(c=>({id:c.customer_id,amount:c.amount,share:c.share,spans:c.spans,paid_by:c.paid_by,paid_amount:c.paid_amount}))});
      if(error) return fail(error,'Не записалось');
      sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:'new'}}).catch(function(){});
    } else {
      const edit=d.mode==='edit', sid=edit?d.shiftId:newId();
      const was=id=>edit&&((d.orig&&d.orig.custLinks)||[]).find(l=>l.id===id);
      const crows=x.crows.map(c=>Object.assign({customer_id:c.customer_id,amount:c.amount,share:c.share,spans:c.spans,paid_by:c.paid_by},was(c.customer_id)?{}:{paid_amount:c.paid_amount}));
      if(edit){ const ex=excessOf(d,x); if(ex.length){ const ch=await askExcess(sh,ex); if(!ch) return; x.row.excess=ch; } }
      if(!online()){
        if(edit) return toast('Правка — только со связью',true);
        enqueue({t:'shift',sid:sid,row:x.row,wrows:x.wrows,crows:crows}); applyPending(); renderAll(); sh.close(true); showDone(); toast('Нет сети — смена уйдёт, когда связь появится'); return;
      }
      const {error}=await sb.rpc('save_shift',{p_id:sid,p_shift:x.row,p_workers:x.wrows,p_customers:crows,p_edit:edit});
      if(error) return fail(error,edit?'Изменения не сохранены':'Смена не записана');
      sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:edit?'edit':'new'}}).catch(function(){});
    }
    sh.close(true); showDone(); await reload(); if(d.mode!=='edit') goTab('now');
  } finally { btn.disabled=false; }
}
// правка ниже уже заплаченного: сколько лишнего у кого
function excessOf(d,x){
  return ((d.orig&&d.orig.custLinks)||[]).map(l=>{ const n=x.crows.find(c=>c.customer_id===l.id), amt=n?n.amount:0, paid=l.paidAmt||0;
    if(paid<=amt+0.004) return null;
    const other=debts().filter(z=>z.id===l.id).reduce((a,z)=>a+z.items.filter(it=>it.s.id!==d.shiftId).reduce((q,it)=>q+it.due,0),0);
    return {id:l.id,paid:paid,amt:amt,extra:r2(paid-amt),other:r2(other)}; }).filter(Boolean);
}
// «Lee уже заплатил 200 $, по новой сумме — 150 $. Лишние 50 $: Вернули / Переложить»
function askExcess(sh,ex){
  return new Promise(res=>{
    const ch={}; ex.forEach(e=>ch[e.id]=e.other>0.004?'move':'refund');
    let done=false;
    sh.push({title:'Лишние деньги', onPop:()=>{ if(!done){ done=true; res(null); } }, render(b){
      b.innerHTML='<div class="lead">По этой смене уже заплатили больше, чем выходит теперь.</div>'+ex.map(e=>
        '<div class="card" style="margin-top:10px"><div class="nm" style="font-size:16px">'+esc(cName(e.id))+' уже заплатил '+m$(e.paid)+'</div>'+
        '<div class="t2" style="font-size:13.5px;margin:3px 0 10px">'+(e.amt>0.004?'по новой сумме — '+m$(e.amt):'его больше нет в смене')+'. Лишние <b style="color:var(--t1)">'+m$(e.extra)+'</b>:</div>'+
        '<div class="segmini"><button data-x="'+e.id+'|refund" aria-pressed="'+(ch[e.id]==='refund')+'">Вернули</button>'+
          (e.other>0.004?'<button data-x="'+e.id+'|move" aria-pressed="'+(ch[e.id]==='move')+'">В счёт долга '+m$(Math.min(e.other,e.extra))+'</button>':'')+'</div>'+
        (e.other>0.004&&e.extra>e.other+0.004?'<div class="note" style="margin-top:6px">Долгов у него на '+m$(e.other)+' — остальное считается возвращённым</div>':'')+'</div>').join('')+
        '<button class="btn" data-ok style="margin-top:16px">Сохранить</button>';
      b.querySelectorAll('[data-x]').forEach(x=>x.onclick=()=>{ const [id,v]=x.dataset.x.split('|'); ch[id]=v; haptic('pick'); sh.top().render(); });
      b.querySelector('[data-ok]').onclick=()=>{ done=true; sh.pop(); res(ch); };
    }});
  });
}
// лента времени: шкала часов, паузы, полоски людей
function timelineHTML(o){
  const W=Math.max(1,o.end-o.start), pc=v=>Math.max(0,Math.min(100,(v-o.start)/W*100)).toFixed(2);
  const bars=(spans,cls)=>(spans||[]).map(z=>'<i class="'+(cls||'')+'" style="left:'+pc(z.s)+'%;width:'+Math.max(.8,pc(z.e)-pc(z.s)).toFixed(2)+'%"></i>').join('');
  const holes=(o.pauses||[]).map(p=>'<i class="p" style="left:'+pc(p.s)+'%;width:'+Math.max(.6,pc(p.e)-pc(p.s)).toFixed(2)+'%"></i>').join('');
  const ticks=[0,.25,.5,.75,1].map(k=>tHM(o.start+W*k));
  return '<div class="ax">'+ticks.map(t=>'<span class="num">'+t+'</span>').join('')+'</div>'+
    '<div class="ln main"><span>смена</span><div class="tr">'+bars([{s:o.start,e:o.end}])+holes+'</div></div>'+
    (o.rows||[]).map(r=>'<div class="ln" style="--pc:'+personColor(r.name)+'"><span>'+esc(r.name)+'</span><div class="tr">'+bars(r.spans,r.w?'w':'')+holes+'</div></div>').join('');
}

/* ======================= РАСЧЁТ ======================= */
// Кастомер платит: по умолчанию весь долг; можно вписать свою сумму. Видно, что закроется и кому сколько.
function settleSheet(cid){
  let d=debts().find(x=>x.id===cid); if(!d) return toast(cName(cid)+' ничего не должен');
  if(d.pendingOnly && !locked) return toast('Смена ещё не отправлена — рассчитать можно, когда появится связь',true);
  const sh=openSheet({detent:'full'}); let amt=d.payable;
  sh.push({title:cName(cid)+' платит', live:true, render(b){
    d=debts().find(x=>x.id===cid);
    if(!d){ b.innerHTML='<div class="empty">'+esc(cName(cid))+' уже всё заплатил ✓</div>'; return; }
    const T=d.payable; amt=Math.min(amt,T);
    const pv=allocPreview(cid,locked?T:amt);
    b.innerHTML=(locked?'<div class="amtbig">'+moneyHTML(d.total)+'</div><div class="note" style="text-align:center">должен</div>':
      '<button class="amtbig edit" data-amt style="width:100%">'+moneyHTML(amt)+'</button>'+
      '<div class="quick"><button data-q="100">100</button><button data-q="200">200</button><button data-q="'+r2(T/2)+'">½</button><button data-q="'+T+'">всё</button></div>')+
      (d.pend>0.004?'<div class="note" style="text-align:center;color:var(--debt)">ещё '+m$(d.pend)+' — по неотправленной смене, рассчитать после отправки</div>':'')+
      '<div class="card alloc">'+pv.items.map(it=>'<div class="kv"><span>'+(it.rest>0.004?'◐ ':'✓ ')+dayText(it.s.work_date)+' · '+m$(it.due)+'</span><b>'+(it.rest>0.004?'останется '+m$(it.rest):'закрыта')+'</b></div>').join('')+'</div>'+
      (locked?'':'<div class="flowline">→ <b>кассе '+m$(pv.split.kassa)+'</b>'+Object.keys(pv.split.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(pv.split.w[k])+'</b>').join('')+'</div>'+
      sliderHTML('протяни — получил '+m$(amt),'data-go'))+
      '<button class="btn ghost" data-prof style="margin-top:8px">Профиль ›</button>';
    const ab=b.querySelector('[data-amt]'); if(ab) ab.onclick=()=>pickAmount(sh,{title:'Сколько отдал',lead:'Не больше долга — '+m$(T)+'. Отдал больше — запиши остаток в заметку.',value:amt,max:T,quick:[{l:'100',v:100},{l:'200',v:200},{l:'½',v:T/2},{l:'всё',v:T}],onPick:v=>{ if(v>0) amt=v; }});
    const qk=b.querySelector('.quick'); if(qk) qk.onclick=e=>{ const q=e.target.closest('[data-q]'); if(!q) return; haptic('pick'); amt=Math.min(T,Number(q.dataset.q)); sh.top().render(); };
    b.querySelector('[data-prof]').onclick=()=>{ sh.close(); setTimeout(()=>profileSheet('c',cid),200); };
    const sl=b.querySelector('[data-go]'); if(sl) bindSlider(sl,async()=>{
      if(!liveReady()) return;
      const {data,error}=await sb.rpc('settle',{p_customer:cid,p_amount:amt}); if(error) return fail(error,'Не рассчиталось');
      sh.close(); showDone(); wave('rgba(78,166,114,.65)'); await reload();
      offerUndo('Рассчитали '+cName(cid)+' · '+m$(amt),{onUndo:async()=>{ const r=await sb.rpc('unsettle',{p_payment:data.id}); if(r.error) return fail(r.error); await reload(); toast('Расчёт отменён'); }});
    });
  }, onBack(){ sh.top().render(); }});
}
// расчёт одной смены: все, кто по ней должен
function settleShiftSheet(sid){
  const s=S.shifts.find(x=>x.id===sid); if(!s) return;
  if(s.pending) return toast('Смена ещё не отправлена — рассчитать можно, когда появится связь',true);
  const owing=(s.custLinks||[]).filter(l=>due(l)>0.004); if(!owing.length) return toast('По смене всё рассчитано');
  if(owing.length===1){ return settleOneInShift(s,owing[0]); }
  const sh=openSheet({detent:'half'}); const pick={}; owing.forEach(l=>pick[l.id]=due(l));
  sh.push({title:'Расчёт · '+dayText(s.work_date), render(b){
    const sum=owing.reduce((a,l)=>a+(pick[l.id]||0),0), sp=owing.reduce((acc,l)=>addSplit(acc,chunkSplit(s,pick[l.id]||0)),{kassa:0,w:{}});
    b.innerHTML='<div class="card" style="padding:2px 14px">'+owing.map(l=>{ const v=pick[l.id]||0, on=v>0.004, part=on&&v<due(l)-0.004;
      return '<div class="crow">'+avHTML(cName(l.id),'s')+'<div class="mid"><div class="nm">'+esc(cName(l.id))+'</div><div class="sm">долг '+m$(due(l))+'</div></div>'+
        '<button class="a num" data-amt="'+l.id+'">'+m$(on?v:due(l))+'</button>'+
        '<div class="seg'+(on?'':' debt')+'"><button data-on="'+l.id+'" aria-pressed="'+on+'">'+(part?'Часть':'Заплатил')+'</button><button data-off="'+l.id+'" aria-pressed="'+!on+'">Долг</button></div></div>'; }).join('')+'</div>'+
      '<div class="flowline">'+(sum>0.004?m$(sum)+' → <b>кассе '+m$(sp.kassa)+'</b>'+Object.keys(sp.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(sp.w[k])+'</b>').join(''):'Отметь, кто заплатил')+'</div>'+
      sliderHTML(sum>0.004?'протяни — получил '+m$(sum):'никто не отмечен','data-go');
    b.querySelectorAll('[data-on]').forEach(x=>x.onclick=()=>{ haptic('soft'); const l=owing.find(z=>z.id===x.dataset.on); pick[l.id]=due(l); sh.top().render(); });
    b.querySelectorAll('[data-off]').forEach(x=>x.onclick=()=>{ haptic('soft'); pick[x.dataset.off]=0; sh.top().render(); });
    b.querySelectorAll('[data-amt]').forEach(x=>x.onclick=()=>{ const l=owing.find(z=>z.id===x.dataset.amt);
      pickAmount(sh,{title:cName(l.id)+' отдал',lead:'Долг по смене — '+m$(due(l))+'. Остаток останется долгом.',value:pick[l.id]||due(l),max:due(l),allowZero:true,quick:[{l:'½',v:due(l)/2},{l:'всё',v:due(l)},{l:'0',v:0}],onPick:v=>{ pick[l.id]=v; }}); });
    const sl=b.querySelector('[data-go]'); if(sum<=0.004) sl.classList.add('off');
    bindSlider(sl,async()=>{
      if(!liveReady()) return; const ids=owing.filter(l=>(pick[l.id]||0)>0.004); if(!ids.length) return toast('Отметь, кто заплатил',true);
      const done=[];
      let bad=null;
      for(const l of ids){ const {data,error}=await sb.rpc('settle',{p_customer:l.id,p_amount:r2(pick[l.id]),p_shift:s.id}); if(error){ bad=error; break; } done.push(data.id); }
      sh.close(); if(bad) fail(bad); else showDone(); await reload();
      if(done.length) offerUndo('Смена '+dayText(s.work_date)+' рассчитана',{onUndo:async()=>{ let e=null; for(const p of done){ const r=await sb.rpc('unsettle',{p_payment:p}); if(r.error) e=r.error; } await reload(); e?fail(e):toast('Расчёт отменён'); }});
    });
  }, onBack(){ sh.top().render(); }});
}
function settleOneInShift(s,l){
  const sh=openSheet({detent:'half'}); let amt=due(l);
  sh.push({title:cName(l.id)+' · '+dayText(s.work_date), render(b){
    const sp=chunkSplit(s,amt);
    b.innerHTML='<button class="amtbig edit" data-amt style="width:100%">'+moneyHTML(amt)+'</button>'+
      '<div class="flowline">→ <b>кассе '+m$(sp.kassa)+'</b>'+Object.keys(sp.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(sp.w[k])+'</b>').join('')+'</div>'+
      sliderHTML('протяни — получил','data-go');
    b.querySelector('[data-amt]').onclick=()=>pickAmount(sh,{title:'Сколько отдал',value:amt,max:due(l),quick:[{l:'½',v:due(l)/2},{l:'всё',v:due(l)}],onPick:v=>{ if(v>0) amt=v; }});
    bindSlider(b.querySelector('[data-go]'),async()=>{
      if(!liveReady()) return;
      const {data,error}=await sb.rpc('settle',{p_customer:l.id,p_amount:amt,p_shift:s.id}); if(error) return fail(error);
      sh.close(); showDone(); await reload();
      offerUndo('Рассчитали '+cName(l.id)+' · '+m$(amt),{onUndo:async()=>{ const r=await sb.rpc('unsettle',{p_payment:data.id}); await reload(); r.error?fail(r.error):toast('Расчёт отменён'); }});
    });
  }, onBack(){ sh.top().render(); }});
}
function debtsSheet(){
  const sh=openSheet({detent:'half'});
  sh.push({title:'Должны', live:true, render(b){
    const dl=debts();
    b.innerHTML=dl.length?'<div class="list">'+dl.map(d=>'<button class="row" data-c="'+d.id+'" style="width:100%;text-align:left">'+avHTML(cName(d.id),'s')+'<div class="mid"><div class="nm">'+esc(cName(d.id))+'</div><div class="sm">'+d.items.length+' '+plural(d.items.length,'смена','смены','смен')+'</div></div><div class="amt">'+moneyHTML(d.total)+'</div></button>').join('')+'</div>':'<div class="empty">Все рассчитаны ✓</div>';
    b.querySelectorAll('[data-c]').forEach(r=>r.onclick=()=>{ sh.close(); setTimeout(()=>settleSheet(r.dataset.c),220); });
  }});
}
function paymentSheet(pid){
  let p=(S.payments||[]).find(x=>x.id===pid); if(!p) return;
  const sh=openSheet({detent:'half'});
  sh.push({title:cName(p.customer_id)+' заплатил', live:true, render(b){
    p=(S.payments||[]).find(x=>x.id===pid)||p;
    if(p.undone_at){ b.innerHTML='<div class="empty">Этот расчёт отменён</div>'; return; }
    b.innerHTML='<div class="amtbig">'+moneyHTML(p.amount)+'</div><div class="note" style="text-align:center">'+dayLabel(khParts(Date.parse(p.created_at)).d)+', '+tHM(Date.parse(p.created_at))+(p.note?' · '+esc(p.note):'')+'</div>'+
      (p.adjusted>0.004?'<div class="note" style="text-align:center;color:var(--debt)">поправка при правке смены: −'+m$(p.adjusted)+' (было '+m$(Number(p.amount)+Number(p.adjusted))+')</div>':'')+
      '<div class="card alloc">'+(p.alloc||[]).map(a=>{ const s=S.shifts.find(x=>x.id===a.shift_id); return '<div class="kv"><span>'+(s?dayText(s.work_date)+' · смена '+m$(s.total):'смена удалена')+'</span><b>'+m$(a.amount)+'</b></div>'; }).join('')+'</div>'+
      (locked?'':'<button class="btn red" data-un style="margin-top:12px">Отменить этот расчёт</button>');
    const un=b.querySelector('[data-un]'); if(un) un.onclick=()=>{ if(!liveReady()) return;
      sh.close(true); haptic('warn');
      offerUndo('Расчёт '+m$(p.amount)+' отменён — долг вернулся',{onCommit:async()=>{ const {error}=await sb.rpc('unsettle',{p_payment:p.id}); if(error) return fail(error); await reload(); }}); };
  }});
}

// ручная запись (выплата, выдача кассы, старая): поправить сумму или удалить — с «Отменить»
function opSheet(oid){
  const o=S.ops.find(x=>x.id===oid); if(!o) return;
  const t=o.kind==='payout'?'Выплата · '+wName(o.worker_id):o.kind==='expense'?'Выдача кассы':o.kind==='income'?'Оплата (старая запись)':'Долг до начала учёта';
  const sh=openSheet({detent:'half'});
  sh.push({title:t, live:true, render(b){
    const x=S.ops.find(z=>z.id===oid); if(!x){ b.innerHTML='<div class="empty">Запись удалена</div>'; return; }
    b.innerHTML='<div class="amtbig">'+moneyHTML(x.amount)+'</div><div class="note" style="text-align:center">'+dayLabel(x.op_date)+(x.note?' · '+esc(x.note):'')+'</div>'+
      (locked?'':'<button class="btn sec" data-amt style="margin-top:16px">Изменить сумму</button><button class="btn red" data-del style="margin-top:8px">Удалить запись</button>');
    if(locked) return;
    b.querySelector('[data-amt]').onclick=()=>pickAmount(sh,{title:'Сумма',value:x.amount,onPick:async v=>{
      if(!(v>0)) return; const {error}=await sb.from('ops').update({amount:v}).eq('id',oid); if(error) return fail(error,'Не сохранилось');
      x.amount=v; haptic('ok'); toast('Сумма исправлена'); renderAll(); scheduleReload(); }});
    b.querySelector('[data-del]').onclick=()=>{
      S.ops=S.ops.filter(z=>z.id!==oid); sh.close(true); renderAll(); haptic('warn');
      offerUndo('Запись удалена',{onUndo:()=>{ if(!S.ops.some(z=>z.id===oid)) S.ops.push(x); renderAll(); },
        onCommit:async()=>{ const {error}=await sb.from('ops').delete().eq('id',oid); if(error){ if(!S.ops.some(z=>z.id===oid)) S.ops.push(x); renderAll(); fail(error,'Не удалилась'); } }});
    };
  }});
}

/* ======================= СМЕНА ПОДРОБНО ======================= */
function shiftSheet(sid,fromEl){
  let s=S.shifts.find(x=>x.id===sid); if(!s) return;
  const sh=openSheet({detent:'full', from:fromEl&&fromEl.isConnected?fromEl:null});
  sh.push({title:dayLabel(s.work_date)+(s.start_time?', '+hhmm(s.start_time)+'–'+tHM(shiftEndMs(s))+(plus1(s)?' (+1)':''):''), live:true, render(b,level){
    s=S.shifts.find(x=>x.id===sid)||s;
    const st=shiftStatus(s), ls=s.custLinks||[], dsum=ls.reduce((a,l)=>a+due(l),0);
    const flow='<div class="flow" data-flow><div class="col">'+(ls.length?ls.map(l=>'<div class="nd'+(due(l)>0.004?' debt':'')+'"><b class="num">'+m$(l.amount)+'</b>'+esc(cName(l.id))+(l.paid_by&&l.amount<=0.004?' · платит '+esc(cName(l.paid_by)):due(l)>0.004?(l.paidAmt>0.004?' · долг '+m$(due(l)):' · долг'):'')+'</div>').join(''):'<div class="nd">без кастомеров</div>')+'</div><div></div>'+
      '<div class="col r"><div class="nd"><b class="num">'+m$(s.kassa)+'</b>касса</div>'+s.workerIds.map(id=>'<div class="nd"><b class="num">'+m$(workerShare(s,id))+'</b>'+esc(wName(id))+'</div>').join('')+'</div><svg></svg></div>';
    // кто когда платил за эту смену: оплаты из книги, разложенные на неё
    const pays=(S.payments||[]).filter(p=>!p.undone_at&&(p.alloc||[]).some(x=>x.shift_id===s.id)).sort((x,y)=>Date.parse(x.created_at)-Date.parse(y.created_at));
    const payHTML=pays.length?'<span class="cap">Кто когда платил</span><div class="card" style="padding:4px 14px">'+pays.map(p=>{ const part=(p.alloc||[]).filter(x=>x.shift_id===s.id).reduce((q,x)=>q+(Number(x.amount)||0),0), d=khParts(Date.parse(p.created_at));
        return '<button class="kv pay" data-pay="'+p.id+'">'+avHTML(cName(p.customer_id),'xs')+'<span>'+esc(cName(p.customer_id))+'<em>'+(p.note==='при сохранении смены'?'при смене':(d.d===s.work_date?'в тот же день':dayText(d.d)))+', '+d.t+'</em></span><b style="color:var(--ok)">+'+m$(part)+'</b></button>'; }).join('')+'</div>':'';
    const acts=[];
    if(st==='debt'&&!locked&&!s.pending) acts.push('<button data-settle class="pri"><i>$</i>Рассчитать</button>');
    if(!locked&&!s.pending) acts.push('<button data-edit><i>✎</i>Изменить</button>');
    acts.push('<button data-copy><i>⧉</i>Скопировать</button>');
    if(!locked) acts.push('<button data-del class="dang"><i>✕</i>Удалить</button>');
    b.innerHTML='<div class="hero" style="text-align:center"><div class="v">'+moneyHTML(s.total)+'</div><div class="s"><span class="dot '+st+'"></span> '+
        (st==='ok'?'рассчитано':st==='debt'?'долг '+m$(dsum):'без кастомеров')+' · '+s.hours+' '+hourWord(s.hours)+(s.discount?' · скидка '+m$(s.discount):'')+'</div></div>'+
      '<div class="acts">'+acts.join('')+'</div>'+
      '<span class="cap">Куда ушли деньги</span>'+flow+payHTML+
      (s.start_time?'<span class="cap">Лента · удержи для подробностей</span><div class="tl" data-hold-timeline role="button" tabindex="0" aria-label="Время по людям">'+timelineHTML({start:shiftStart(s),end:shiftEndMs(s),pauses:pauseSpans(s.pause_log).filter(p=>p.e),
        rows:ls.map(l=>({name:cName(l.id),spans:pauseSpans(l.spans).filter(p=>p.e).length?pauseSpans(l.spans).filter(p=>p.e):[{s:shiftStart(s),e:shiftEndMs(s)}]}))
          .concat((s.workerLinks&&s.workerLinks.length?s.workerLinks:s.workerIds.map(id=>({id:id,spans:[]}))).map(w=>({name:wName(w.id),w:1,spans:pauseSpans(w.spans).filter(p=>p.e).length?pauseSpans(w.spans).filter(p=>p.e):[{s:shiftStart(s),e:shiftEndMs(s)}]})))})+'</div>':'')+
      (s.start_time?'':'<button class="moneyline" data-open-attendance style="width:100%"><span>Время по людям</span><span class="chev" aria-hidden="true">›</span></button>')+
      '<span class="cap">Подробности</span><div class="card" style="padding:6px 14px">'+
        (s.pause_min?'<div class="kv"><span>Паузы</span><b>'+pauseText(s.pause_min)+'</b></div>'+(pauseSpans(s.pause_log).filter(p=>p.e).length?'<div class="note" style="margin:0 4px 6px">'+pauseSpans(s.pause_log).filter(p=>p.e).map(p=>tHM(p.s)+'–'+tHM(p.e)).join(', ')+'</div>':''):'')+
        (s.discount?'<div class="kv"><span>Скидка</span><b>'+m$(s.discount)+'</b></div>':'')+
        (s.note?'<div class="kv"><span>Заметка</span><b style="text-align:right;max-width:70%">'+esc(s.note)+'</b></div>':'')+
        '<div class="kv"><span>Записано</span><b>'+(s.created_at?dayText(khParts(Date.parse(s.created_at)).d)+', '+tHM(Date.parse(s.created_at)):'—')+(whoName(s.created_by)?' · '+esc(whoName(s.created_by)):'')+'</b></div></div>';
    const se=b.querySelector('[data-settle]'); if(se) se.onclick=()=>{ sh.close(); setTimeout(()=>settleShiftSheet(sid),220); };
    const ed=b.querySelector('[data-edit]'); if(ed) ed.onclick=()=>editShift(sid);
    b.querySelector('[data-copy]').onclick=()=>copyShift(s);
    const openAttendance=()=>{
      if(sh.closed||sh.top()!==level) return;
      sh.push({title:'Время по людям',live:true,render(body){
        const data=savedAttendance(S.shifts.find(x=>x.id===sid)||s);
        body.innerHTML=attendanceHTML(data)+'<button class="btn sec" data-copy-time style="margin-top:12px">Скопировать время</button>';
        body.querySelector('[data-copy-time]').onclick=()=>copyAttendance(data);
      }});
    };
    const timeline=b.querySelector('[data-hold-timeline]');
    if(timeline){
      longPress(timeline,()=>{ if(timeline.isConnected) openAttendance(); });
      timeline.onclick=e=>{ if(e.detail===0) openAttendance(); };
      timeline.onkeydown=e=>{
        if(e.key!=='Enter'&&e.key!==' ') return;
        e.preventDefault();
        openAttendance();
      };
    } else b.querySelector('[data-open-attendance]').onclick=openAttendance;
    const dl=b.querySelector('[data-del]'); if(dl) dl.onclick=()=>deleteShift(sid);
    b.querySelectorAll('[data-pay]').forEach(x=>x.onclick=()=>paymentSheet(x.dataset.pay));
    requestAnimationFrame(()=>drawFlow(b.querySelector('[data-flow]')));
  }});
}
// линии схемы: от каждого кастомера к центру, от центра к кассе и операторам
function drawFlow(f){
  if(!f) return; const svg=f.querySelector('svg'), R=f.getBoundingClientRect();
  const L=[...f.querySelectorAll('.col:not(.r) .nd')], Rr=[...f.querySelectorAll('.col.r .nd')];
  const cx=R.width/2, cy=R.height/2; let d='';
  L.forEach(n=>{ const r=n.getBoundingClientRect(), x=r.right-R.left, y=r.top-R.top+r.height/2; d+='M'+x+' '+y+' C'+(x+20)+' '+y+' '+(cx-20)+' '+cy+' '+cx+' '+cy+' '; });
  Rr.forEach(n=>{ const r=n.getBoundingClientRect(), x=r.left-R.left, y=r.top-R.top+r.height/2; d+='M'+cx+' '+cy+' C'+(cx+20)+' '+cy+' '+(x-20)+' '+y+' '+x+' '+y+' '; });
  svg.setAttribute('viewBox','0 0 '+R.width+' '+R.height);
  svg.innerHTML='<path d="'+d+'" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.2"/><circle cx="'+cx+'" cy="'+cy+'" r="3.5" fill="#fff"/>';
}

/* ======================= ПРОФИЛЬ ЧЕЛОВЕКА ======================= */
// Профиль: сколько сидел/работал и когда — плитки, календарь месяца, все посиделки со временем
function profileSheet(k,id){
  const sh=openSheet({detent:'full'}); let per='m', ym=today().slice(0,7), pick=null;
  sh.push({title:k==='c'?cName(id):wName(id), live:true, render(b){
    const all=personSessions(k,id), from=perFrom(per), inP=all.filter(x=>x.s.work_date>=from);
    const d=k==='c'?debts().find(x=>x.id===id):null, w=k==='w'?(S.workers.find(x=>x.id===id)||{}):null;
    const hrs=inP.reduce((a,x)=>a+x.ms,0), money=inP.reduce((a,x)=>a+x.amount,0);
    const tile=(v,l,cls)=>'<div class="tile'+(cls?' '+cls:'')+'"><b>'+v+'</b><span>'+l+'</span></div>';
    let h='<div class="phead">'+avHTML(k==='c'?cName(id):wName(id),'xl')+'<div><div class="t2" style="font-size:13.5px">'+(k==='c'?'кастомер':'оператор')+' · был '+lastSeen(all.length?all[0].s.work_date:null)+'</div>'+
        (d?'<div class="pdebt">должен <b>'+m$(d.total)+'</b></div>':k==='c'?'<div class="pdebt ok">долгов нет ✓</div>':'<div class="pdebt ok">'+(w.tg_id?'Telegram привязан':'Telegram не привязан')+'</div>')+'</div></div>'+
      '<div class="segmini" style="margin-top:14px">'+[['w','Неделя'],['m','Месяц'],['a','Всё']].map(p=>'<button data-per="'+p[0]+'" aria-pressed="'+(per===p[0])+'">'+p[1]+'</button>').join('')+'</div>'+
      '<div class="tiles">'+tile(Math.round(hrs/36e5*10)/10,'часов')+tile(inP.length,plural(inP.length,'смена','смены','смен'))+
        tile(m$(money),k==='c'?'принёс':'заработал')+(k==='c'?tile(d?m$(d.total):'0 $','долг',d?'warn':''):tile(inP.length?Math.round(hrs/36e5/inP.length*10)/10:0,'ч в среднем'))+'</div>'+
      (d&&!locked?'<button class="btn" data-settle style="margin-top:12px">Рассчитать · '+m$(d.total)+'</button>':'');
    // с кем обычно сидит / работает
    const mates={}; all.forEach(x=>(k==='c'?x.s.customerIds:x.s.workerIds).forEach(o=>{ if(o!==id) mates[o]=(mates[o]||0)+1; }));
    const top=Object.keys(mates).sort((p,q)=>mates[q]-mates[p]).slice(0,5);
    if(top.length) h+='<span class="cap">'+(k==='c'?'Обычно сидит с':'Обычно работает с')+'</span><div class="mates">'+top.map(o=>{ const nm=k==='c'?cName(o):wName(o);
      return '<button class="mate" data-mate="'+o+'">'+avHTML(nm,'s')+'<span>'+esc(nm)+'</span><em>'+mates[o]+'</em></button>'; }).join('')+'</div>';
    // календарь месяца: день светится по часам
    const p=ym.split('-').map(Number), first=new Date(Date.UTC(p[0],p[1]-1,1)), days=new Date(Date.UTC(p[0],p[1],0)).getUTCDate(), lead=(first.getUTCDay()+6)%7;
    const byDay={}; all.filter(x=>x.s.work_date.slice(0,7)===ym).forEach(x=>{ byDay[x.s.work_date]=(byDay[x.s.work_date]||0)+x.ms; });
    const mx=Math.max(1,...Object.values(byDay));
    h+='<div class="calhead"><button data-m="-1">‹</button><b>'+MONFULL[p[1]-1]+(p[0]!==Number(today().slice(0,4))?' '+p[0]:'')+'</b><button data-m="1"'+(ym>=today().slice(0,7)?' disabled':'')+'>›</button></div>'+
      '<div class="cal">'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>'<span class="wd">'+x+'</span>').join('')+'<span></span>'.repeat(lead)+
      Array.from({length:days},(_,i)=>{ const ds=ym+'-'+z2(i+1), ms=byDay[ds]||0;
        return '<button class="cd'+(ms?' on':'')+(ds===today()?' td':'')+(pick===ds?' sel':'')+'" data-day="'+ds+'" style="--a:'+(ms?(.25+.75*ms/mx).toFixed(2):0)+'">'+(i+1)+(ms?'<em>'+Math.round(ms/36e5)+'ч</em>':'')+'</button>'; }).join('')+'</div>';
    // посиделки: когда, сколько, сумма, статус
    const list=all.filter(x=>pick?x.s.work_date===pick:x.s.work_date>=from);
    h+='<span class="cap">'+(pick?dayLabel(pick):(k==='c'?'Когда сидел':'Когда работал')+' '+perName(per))+(pick?' <button class="pill" data-unpick style="margin-left:6px;height:26px;font-size:12px">все</button>':'')+'</span>'+
      (list.length?'<div class="list">'+list.slice(0,60).map(x=>'<button class="row sess" data-sh="'+x.s.id+'" style="width:100%;text-align:left">'+
        '<div class="sd"><b>'+new Date(x.s.work_date+'T00:00Z').getUTCDate()+'</b><span>'+MON[Number(x.s.work_date.slice(5,7))-1]+'</span></div>'+
        '<div class="mid"><div class="nm num">'+x.spans.map(z=>tHM(z.s)+'–'+tHM(z.e)).join(', ')+'</div><div class="sm">'+dur(x.ms)+' ч'+(k==='c'&&x.s.custLinks.length>1?' · с '+esc(x.s.customerIds.filter(o=>o!==id).map(cName).slice(0,3).join(', ')):'')+'</div></div>'+
        '<div class="rt"><div class="sum">'+moneyHTML(x.amount)+'</div>'+(k==='c'?'<span class="st '+(x.due>0.004?'debt':'ok')+'">'+(x.due>0.004?'долг '+m$(x.due):'оплачено')+'</span>':'')+'</div></button>').join('')+'</div>'
        :'<div class="empty">'+(pick?'В этот день не было':'Пусто')+'</div>')+
      '<button class="btn sec" data-hist style="margin-top:14px">Все записи в истории ›</button>';
    b.innerHTML=h;
    b.querySelectorAll('[data-per]').forEach(x=>x.onclick=()=>{ per=x.dataset.per; pick=null; haptic('pick'); sh.top().render(); });
    b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>{ const q=ym.split('-').map(Number), t=new Date(Date.UTC(q[0],q[1]-1+Number(x.dataset.m),1)); ym=t.toISOString().slice(0,7); pick=null; haptic('pick'); sh.top().render(); });
    b.querySelectorAll('[data-day]').forEach(x=>x.onclick=()=>{ if(!x.classList.contains('on')) return; pick=pick===x.dataset.day?null:x.dataset.day; haptic('pick'); sh.top().render(); });
    const un=b.querySelector('[data-unpick]'); if(un) un.onclick=()=>{ pick=null; sh.top().render(); };
    b.querySelectorAll('[data-sh]').forEach(x=>x.onclick=()=>shiftSheet(x.dataset.sh));
    const se=b.querySelector('[data-settle]'); if(se) se.onclick=()=>{ sh.close(); setTimeout(()=>settleSheet(id),220); };
    b.querySelector('[data-hist]').onclick=()=>{ sh.close(); histSeg='shifts'; histChip='p:'+id; histPer='a'; histQ=''; searchOpen=false; histLimit=60; goTab('hist'); renderHist(); };
    b.querySelectorAll('[data-mate]').forEach(x=>x.onclick=()=>{ sh.close(true); setTimeout(()=>profileSheet(k,x.dataset.mate),240); });
  }});
}

/* ======================= НАСТРОЙКИ ======================= */
let M=[];
function settingsSheet(){
  const sh=openSheet({detent:'full'});
  sh.push({title:'Настройки', render(b){
    const pend=M.filter(m=>m.status==='pending').length;
    const row=(k,t,v)=>'<button class="row" data-lv="'+k+'" style="width:100%;text-align:left"><div class="mid"><div class="nm">'+t+'</div></div><span class="t2">'+(v==null?'':v)+'</span><span class="chev">›</span></button>';
    b.innerHTML=
      '<div class="list plain">'+row('w','Операторы',S.workers.filter(w=>w.active!==false).length)+row('c','Кастомеры',S.customers.filter(c=>c.active!==false).length)+'</div>'+
      (isOwner?'<div class="list plain" style="margin-top:14px">'+row('acc','Доступ',pend?'<span class="dot live"></span> '+pend+' '+plural(pend,'запрос','запроса','запросов'):'')+row('chats','Чаты бота','')+'</div>':'')+
      '<div class="list plain" style="margin-top:14px">'+row('tariff','Тариф','100 × 3, дальше 50')+(locked?'':row('hand','Не роздано и ручная выдача',(()=>{ const hd=handDue(), t=hd.kassa+Object.values(hd.w).reduce((q,v)=>q+v,0); return hd.any?m$(t):'0 $'; })()))+row('exp','Выгрузка','')+'</div>'+
      (TG&&canWrite?'<div class="list plain" style="margin-top:14px">'+row('iph','Подключить iPhone','')+'</div>':'')+
      '<div class="list plain" style="margin-top:14px">'+row('me',user?(isOwner?'Владелец':'Можно править'):'Вход владельца',user&&!tgAccount(user)?esc(user.email||''):'')+row('about','О версии',APP_VERSION)+'</div>';
    b.querySelectorAll('[data-lv]').forEach(r=>r.onclick=()=>{ haptic('tap'); ({w:()=>peopleLevel(sh,'w'),c:()=>peopleLevel(sh,'c'),acc:()=>accessLevel(sh),chats:()=>chatsLevel(sh),
      tariff:()=>tariffLevel(sh),hand:()=>manualIssueLevel(sh),iph:()=>iphoneLevel(sh),exp:()=>exportLevel(sh),me:()=>meLevel(sh),about:()=>aboutLevel(sh)})[r.dataset.lv](); });
  }});
  return sh;
}
function peopleLevel(sh,k){
  sh.push({title:k==='w'?'Операторы':'Кастомеры', render(b){
    const list=(k==='w'?S.workers:S.customers).slice().sort((a,b)=>(b.active!==false)-(a.active!==false)||String(a.name).localeCompare(b.name));
    b.innerHTML='<div style="display:flex;gap:8px;margin-bottom:12px"><input data-new type="search" placeholder="'+(locked?'Найти':'Найти или вписать нового')+'">'+(locked?'':'<button class="pill" data-add style="height:48px">Добавить</button>')+'</div>'+
      '<div class="list">'+list.map(p=>'<div class="row" data-id="'+p.id+'" style="opacity:'+(p.active===false?.45:1)+'">'+avHTML(p.name,'s')+'<div class="mid"><div class="nm">'+esc(p.name)+(p.is_me?' · это я':'')+'</div>'+
        (p.active===false?'<div class="sm">в архиве</div>':'')+'</div>'+
        (locked?'':(k==='w'&&isOwner?'<button class="pill" data-tg aria-pressed="'+!!p.tg_id+'">TG</button>':'')+'<button class="pill" data-ren>✎</button><button class="pill" data-arc>'+(p.active===false?'вернуть':'в архив')+'</button>')+'</div>').join('')+'</div>'+
      '<div class="note">Архив прячет человека из выбора, старые смены остаются как были.</div>';
    const T=k==='w'?'workers':'customers', all=k==='w'?S.workers:S.customers;
    const same=(n,skip)=>all.find(x=>x.id!==skip&&String(x.name).trim().toLowerCase()===n.toLowerCase());
    // поле сверху — и поиск, и новое имя
    const nq=b.querySelector('[data-new]'); nq.oninput=()=>{ const t=nq.value.trim().toLowerCase();
      b.querySelectorAll('.list [data-id]').forEach(r=>{ const p=list.find(x=>x.id===r.dataset.id); r.style.display=!t||String(p.name).toLowerCase().includes(t)?'':'none'; }); };
    const add=b.querySelector('[data-add]'); if(add) add.onclick=async()=>{ const n=nq.value.trim(); if(!n) return toast('Впиши имя',true);
      const dup=same(n); if(dup && !await ask('«'+dup.name+'» уже есть'+(dup.active===false?' (в архиве)':'')+'. Всё равно добавить ещё одного?')) return;
      const {error}=await sb.from(T).insert({name:n}); if(error) return fail(error); haptic('ok'); await reload(); sh.top().render(); };
    b.querySelectorAll('[data-id]').forEach(r=>{ const id=r.dataset.id, p=list.find(x=>x.id===id);
      const rn=r.querySelector('[data-ren]'); if(rn) rn.onclick=()=>sh.push({title:'Имя', render(b2){
        b2.innerHTML='<input data-n value="'+esc(p.name)+'"><button class="btn" data-ok style="margin-top:14px">Сохранить</button>';
        const inp=b2.querySelector('[data-n]'); setTimeout(()=>{ inp.focus(); inp.select(); },350);
        b2.querySelector('[data-ok]').onclick=async()=>{ const n=inp.value.trim(); if(!n) return;
          const dup=same(n,id); if(dup && !await ask('«'+dup.name+'» уже есть. Всё равно назвать так же?')) return;
          const {error}=await sb.from(T).update({name:n}).eq('id',id); if(error) return fail(error); haptic('ok'); await reload(); sh.pop(); };
      }});
      const ar=r.querySelector('[data-arc]'); if(ar) ar.onclick=async()=>{ const {error}=await sb.from(T).update({active:p.active===false}).eq('id',id); if(error) return fail(error); haptic('tap'); await reload(); sh.top().render(); };
      const tg=r.querySelector('[data-tg]'); if(tg) tg.onclick=()=>tgLinkLevel(sh,p);
      r.onclick=e=>{ if(e.target.closest('button')) return; sh.close(); setTimeout(()=>profileSheet(k,id),220); };
    });
  }});
}
// оператор ↔ его Telegram: сторож смены пишет ему (пауза больше часа, смена не сохранена)
function tgLinkLevel(sh,w){
  sh.push({title:'Telegram · '+w.name, render(b){
    const act=M.filter(m=>m.status==='active');
    b.innerHTML='<div class="lead">Кому из пущенных в учёт писать, когда '+esc(w.name)+' на смене: забытая пауза, несохранённая смена.</div>'+
      (act.length?'':'<div class="empty">Пока некого привязать. Пусть '+esc(w.name)+' откроет учёт через бота — запрос появится в «Доступе», после подтверждения он будет здесь.</div>')+
      '<div class="list">'+act.map(m=>'<button class="row" data-m="'+m.tg_id+'" style="width:100%;text-align:left">'+avHTML(m.name||'?','s')+'<div class="mid"><div class="nm">'+esc(m.name||('id '+m.tg_id))+'</div>'+
        (m.username?'<div class="sm">@'+esc(m.username)+'</div>':'')+'</div>'+(String(w.tg_id)===String(m.tg_id)?'<span>✓</span>':'')+'</button>').join('')+'</div>'+
      (w.tg_id?'<button class="btn red" data-off style="margin-top:12px">Отвязать</button>':'');
    const set=async v=>{ const {error}=await sb.from('workers').update({tg_id:v}).eq('id',w.id); if(error) return fail(error); haptic('ok'); await reload(); sh.pop(); };
    b.querySelectorAll('[data-m]').forEach(x=>x.onclick=()=>set(Number(x.dataset.m)));
    const off=b.querySelector('[data-off]'); if(off) off.onclick=()=>set(null);
  }});
}
async function loadMembers(){
  if(!isOwner){ M=[]; return; }
  const {data,error}=await sb.from('members').select('*').order('created_at');
  if(!error) M=data||[];
  $('#gear').classList.toggle('dot',M.some(m=>m.status==='pending'));
}
function accessLevel(sh){
  sh.push({title:'Доступ', render(b){
    const st=m=> m.owner_tg ? 'владелец' : m.status==='pending' ? 'ждёт' : m.status==='blocked' ? 'закрыт' : m.can_edit ? 'правит' : 'смотрит';
    b.innerHTML='<div class="lead">Учёт открывается только через бота и только тем, кого вы пустили.</div>'+
      (M.length?'<div class="list">'+M.map(m=>'<div class="row" style="opacity:'+(m.status==='blocked'?.5:1)+'">'+avHTML(m.name||'?','s')+'<div class="mid"><div class="nm">'+esc(m.name||('id '+m.tg_id))+'</div><div class="sm">'+(m.username?'@'+esc(m.username)+' · ':'')+st(m)+'</div></div>'+
        (m.owner_tg?'':m.status==='pending'?'<button class="pill" aria-pressed="true" data-ok="'+m.tg_id+'">Пустить</button><button class="pill" data-no="'+m.tg_id+'">Нет</button>'
          :m.status==='active'?'<button class="pill" aria-pressed="'+!!m.can_edit+'" data-ed="'+m.tg_id+'">Правка</button><button class="pill" data-no="'+m.tg_id+'">Закрыть</button>'
          :'<button class="pill" data-ok="'+m.tg_id+'">Вернуть</button>')+'</div>').join('')+'</div>':'<div class="empty">Запросов нет. Человек открывает учёт в боте — и появляется здесь.</div>');
    b.onclick=async e=>{
      const ok=e.target.closest('[data-ok]'), no=e.target.closest('[data-no]'), ed=e.target.closest('[data-ed]'); if(!ok&&!no&&!ed) return;
      const id=(ok||no||ed).dataset.ok||(ok||no||ed).dataset.no||(ok||no||ed).dataset.ed, m=M.find(x=>String(x.tg_id)===String(id));
      if(ed){ const on=!(m&&m.can_edit);
        if(on && !await ask('Разрешить '+((m&&m.name)||id)+' записывать и править смены и расчёты?')) return;
        const {error}=await sb.from('members').update({can_edit:on}).eq('tg_id',id); if(error) return fail(error);
        if(on) sb.functions.invoke('tg-access',{body:{notify:id,what:'edit'}}).catch(function(){});
        haptic('ok'); await loadMembers(); sh.top().render(); return; }
      if(no && m && m.status==='active' && !await ask('Закрыть доступ: '+(m.name||id)+'?')) return;
      const {error}=await sb.from('members').update({status:ok?'active':'blocked',decided_at:new Date().toISOString()}).eq('tg_id',id);
      if(error) return fail(error);
      if(ok) sb.functions.invoke('tg-access',{body:{notify:id}}).catch(function(){});
      haptic('ok'); await loadMembers(); sh.top().render();
    };
  }});
}
function chatsLevel(sh){
  sh.push({title:'Чаты бота', render:async function(b){
    b.innerHTML='<div class="sk"></div>';
    const {data,error}=await sb.from('tg_chats').select('*');
    b.innerHTML='<div class="lead">Сюда бот присылает сводку о каждой смене — без сумм. Привязать чат: написать в нём боту <b>/privyazat</b>, отвязать — <b>/otvyazat</b>.</div>'+
      (error?'<div class="empty">Не удалось загрузить</div>':(data||[]).length?'<div class="list">'+data.map(c=>'<div class="row"><div class="mid"><div class="nm">'+esc(c.title||('чат '+c.chat_id))+'</div>'+
        '<div class="sm">'+(c.added_by_name?'привязал '+esc(c.added_by_name):'кто привязал — неизвестно')+(c.added_at?' · '+dayText(khParts(Date.parse(c.added_at)).d):'')+'</div></div>'+
        '<button class="pill" data-un="'+c.chat_id+'">Отвязать</button></div>').join('')+'</div>':'<div class="empty">Чатов нет</div>');
    b.querySelectorAll('[data-un]').forEach(x=>x.onclick=async()=>{ if(!await ask('Отвязать этот чат? Смены туда больше не придут.')) return;
      const {error}=await sb.from('tg_chats').delete().eq('chat_id',x.dataset.un); if(error) return fail(error,'Не отвязался'); haptic('ok'); toast('Чат отвязан'); sh.top().render(); });
  }});
}
// iPhone-приложение «Учёт»: одноразовый код на 5 минут и ссылка, которая открывает приложение на этом же телефоне
function iphoneLevel(sh){
  let code=null, link=null, exp=0, devs=null, err=null;
  const call=body=>sb.functions.invoke('pair',{body:Object.assign({initData:TG.initData},body)}).then(r=>r.data||{ok:false,error:'нет связи'});
  const load=async()=>{ const r=await call({action:'list'}); devs=r.ok?r.devices:[]; if(sh.top()===lv) lv.render(); };
  const lv=sh.push({title:'iPhone', render(b){
    const left=Math.max(0,Math.round((exp-Date.now())/1000));
    b.innerHTML='<div class="lead">Приложение «Учёт» на iPhone: смена на экране блокировки и в Dynamic Island, начать и закончить — не открывая Telegram. Права — те же, что у тебя здесь.</div>'+
      (code&&left>0?'<div class="card" style="text-align:center;padding:20px 16px"><div class="t2" style="font-size:13px">код на '+Math.floor(left/60)+':'+z2(left%60)+'</div>'+
          '<div class="num" style="font-size:44px;font-weight:200;letter-spacing:.12em;margin:6px 0 14px">'+code.slice(0,3)+' '+code.slice(3)+'</div>'+
          '<button class="btn" data-open>Открыть в приложении</button><div class="note" style="margin-top:8px">Не открылось — впиши код в приложении вручную</div></div>'
        :'<button class="btn" data-new>'+(code?'Новый код':'Подключить этот или другой iPhone')+'</button>')+
      (err?'<div class="note" style="color:var(--live)">'+esc(err)+'</div>':'')+
      '<span class="cap">Подключённые телефоны</span>'+(devs==null?'<div class="sk"></div>':devs.length?'<div class="list">'+devs.map(d=>'<div class="row"><div class="mid"><div class="nm">'+esc(d.device||'iPhone')+'</div><div class="sm">с '+dayText(khParts(Date.parse(d.claimed_at)).d)+'</div></div><button class="pill" data-off="'+d.id+'">Отключить</button></div>').join('')+'</div>'
        :'<div class="empty">Пока ни одного</div>')+
      '<div class="note">Отключить телефон — он сразу выйдет из учёта.</div>';
    const nb=b.querySelector('[data-new]'); if(nb) nb.onclick=async()=>{ nb.disabled=true; err=null; const r=await call({action:'start'});
      if(!r.ok){ err=r.error||'не получилось'; nb.disabled=false; return lv.render(); } code=r.code; link=r.link; exp=Date.parse(r.expires); haptic('ok'); lv.render();
      const iv=setInterval(()=>{ if(!b.isConnected||sh.top()!==lv) return clearInterval(iv); lv.render(); if(Date.now()>exp) clearInterval(iv); },1000); };
    // Telegram открывает только обычные ссылки — страница на сайте перекидывает в приложение
    const ob=b.querySelector('[data-open]'); if(ob) ob.onclick=()=>{ const u=location.origin+location.pathname.replace(/[^/]*$/,'')+'pair/?c='+code; tgTry(()=>TG.openLink(u)); };
    b.querySelectorAll('[data-off]').forEach(x=>x.onclick=async()=>{ if(!await ask('Отключить этот телефон? Приложение на нём выйдет из учёта.')) return;
      const r=await call({action:'revoke',id:x.dataset.off}); if(!r.ok) return toast(r.error||'Не отключился',true); haptic('ok'); toast('Телефон отключён'); load(); });
  }});
  load();
}
function tariffLevel(sh){
  sh.push({title:'Тариф', render(b){
    b.innerHTML='<div class="card"><div class="kv"><span>1–3 час</span><b>100 $ / час</b></div><div class="kv"><span>с 4-го часа</span><b>50 $ / час</b></div>'+
      '<div class="kv"><span>до 16.08.2026</span><b>4-й час бесплатно</b></div></div>'+
      '<div class="note">Пауза не оплачивается. Остаток 30 минут и больше — час вверх, меньше — вниз. Половина — кассе, половина — операторам по времени работы. Кастомеры делят сумму по времени за столом.</div>';
  }});
}
// ручная выдача — редкий случай: аванс оператору или расход из кассы
function manualIssueLevel(sh){
  sh.push({title:'Не роздано', render(b){
    const hd=handDue(); let kind='expense', wid=null;
    b.innerHTML='<div class="lead">Обычно не нужна: когда кастомер платит, деньги уже розданы. Здесь — аванс оператору или расход из кассы.</div>'+
      '<div class="card" style="margin-bottom:12px"><div class="kv"><span>Касса к выдаче</span><b>'+m$(hd.kassa)+'</b></div>'+Object.keys(hd.w).filter(k=>Math.abs(hd.w[k])>0.004).map(k=>'<div class="kv"><span>'+esc(wName(k))+'</span><b>'+m$(hd.w[k])+'</b></div>').join('')+'</div>'+
      '<div class="pills" data-who><button class="pill" data-k="expense" aria-pressed="true">Из кассы</button>'+S.workers.filter(w=>w.active!==false).map(w=>'<button class="pill" data-k="payout" data-w="'+w.id+'">'+esc(w.name)+'</button>').join('')+'</div>'+
      '<input data-amt inputmode="decimal" placeholder="Сумма, $" style="margin-top:12px"><input data-note placeholder="Кому / за что" style="margin-top:10px">'+
      '<button class="btn" data-go style="margin-top:14px">Записать</button>';
    b.querySelector('[data-who]').onclick=e=>{ const p=e.target.closest('[data-k]'); if(!p) return; kind=p.dataset.k; wid=p.dataset.w||null; haptic('pick');
      b.querySelectorAll('[data-who] .pill').forEach(x=>x.setAttribute('aria-pressed',x===p)); };
    b.querySelector('[data-go]').onclick=async function(){
      const amt=parseAmt(b.querySelector('[data-amt]').value); if(!(amt>0)) return toast('Впиши сумму',true);
      const due0=kind==='expense'?hd.kassa:(hd.w[wid]||0);
      if(amt>due0+0.004 && !await ask('Это больше, чем к выдаче ('+m$(Math.max(0,due0))+'). Деньги за смены, которые кастомеры оплатили, уже розданы.\n\nВсё равно записать '+m$(amt)+'?')) return;
      this.disabled=true;
      const {error}=await sb.from('ops').insert({kind:kind,worker_id:wid,amount:amt,op_date:today(),note:b.querySelector('[data-note]').value.trim()||null});
      this.disabled=false; if(error) return fail(error);
      haptic('ok'); await reload(); sh.pop(); toast('Записано');
    };
  }});
}
function exportLevel(sh){
  sh.push({title:'Выгрузка', render(b){
    b.innerHTML='<div class="lead">'+(TG?'Файл пришлёт бот в личку.':'Файл сохранится на устройство.')+'</div>'+
      '<button class="btn sec" data-csv>Таблица (.csv)</button><button class="btn sec" data-json>Резервная копия (.json)</button>';
    b.querySelector('[data-csv]').onclick=()=>download('uchet-'+today()+'.csv',csvText(),'text/csv');
    b.querySelector('[data-json]').onclick=()=>download('uchet-'+today()+'.json',JSON.stringify({app:'uchet',savedAt:new Date().toISOString(),data:S},null,2),'application/json');
  }});
}
async function download(name,text,mime,caption){
  if(TG){
    toast('Отправляю файл в чат с ботом…');
    try{ const {data,error}=await sb.functions.invoke('send-file',{body:{initData:TG.initData,name:name,text:text,caption:caption||undefined}});
      if(!error&&data&&data.ok){ haptic('ok'); return toast('Файл '+name+' в чате с ботом'); }
      const m=(data&&data.error)||''; toast(/initiate|blocked/i.test(m)?'Сначала напиши боту /start':'Не отправилось',true);
    }catch(e){ toast('Не отправилось — нет связи',true); }
    return;
  }
  const blob=new Blob([text],{type:mime+';charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },1000);
}
function csvText(){
  const q=v=>{ let t=String(v==null?'':v); if(typeof v==='string' && /^[=+\-@\t\r]/.test(t)) t="'"+t; return '"'+t.replace(/"/g,'""')+'"'; };
  const rows=[['Тип','Дата','Начало','Конец','Часы','Операторы','Кастомеры','Сумма','Касса','Скидка','Расчёт','Заметка']];
  S.shifts.slice().sort(byOld).forEach(s=>rows.push(['Смена',s.work_date,hhmm(s.start_time),s.start_time?tHM(shiftEndMs(s)):'',s.hours,
    s.workerIds.map(id=>wName(id)+' '+r2(Number(workerShare(s,id))||0)).join(' / '),(s.custLinks||[]).map(l=>cName(l.id)+' '+r2(l.amount)).join(' + '),
    s.total,s.kassa,s.discount||0,(s.custLinks||[]).map(l=>cName(l.id)+': '+(due(l)>0.004?'долг '+r2(due(l)):'рассчитан')).join('; '),s.note||'']));
  (S.payments||[]).filter(p=>!p.undone_at).forEach(p=>rows.push(['Расчёт',khParts(Date.parse(p.created_at)).d,'','','','',cName(p.customer_id),p.amount,'','','',p.note||'']));
  S.ops.forEach(o=>rows.push([o.kind==='payout'?'Выплата':o.kind==='expense'?'Выдача кассы':o.kind==='income'?'Оплата (старая)':'Долг до учёта',o.op_date,'','','',wName(o.worker_id),'',o.amount,'','','',o.note||'']));
  return '﻿'+rows.map(r=>r.map(q).join(';')).join('\r\n');
}
function meLevel(sh){
  sh.push({title:user?'Учётная запись':'Вход владельца', render(b){
    if(user){
      b.innerHTML='<div class="card"><div class="kv"><span>Права</span><b>'+(isOwner?'владелец':canWrite?'можно править':'просмотр')+'</b></div>'+(user.email&&!tgAccount(user)?'<div class="kv"><span>Почта</span><b>'+esc(user.email)+'</b></div>':'')+'</div>'+
        (tgAccount(user)?'':'<button class="btn sec" data-out style="margin-top:14px">Выйти</button>');
      const o=b.querySelector('[data-out]'); if(o) o.onclick=async()=>{ await sb.auth.signOut(); await refreshAuth(); sh.close(); boot(); };
      return;
    }
    b.innerHTML='<div class="lead">Для работы с компьютера. В Telegram вход не нужен.</div><input data-e type="email" placeholder="Почта" autocomplete="username"><input data-p type="password" placeholder="Пароль" style="margin-top:10px" autocomplete="current-password"><button class="btn" data-go style="margin-top:14px">Войти</button>';
    b.querySelector('[data-go]').onclick=async()=>{
      const {error}=await sb.auth.signInWithPassword({email:b.querySelector('[data-e]').value.trim(),password:b.querySelector('[data-p]').value});
      if(error) return toast(/invalid/i.test(error.message)?'Почта или пароль не подходят':error.message,true);
      sh.close(); boot();
    };
  }});
}
function aboutLevel(sh){
  sh.push({title:'О версии', render(b){
    b.innerHTML='<div class="card"><div class="kv"><span>Версия</span><b>'+APP_VERSION+'</b></div><div class="kv"><span>Обновлено</span><b>'+(cachedAt&&offlineData?'из памяти':'сейчас')+'</b></div></div>'+
      '<div class="note">Прежняя версия учёта осталась запасной и работает с теми же данными.</div>'+
      '<a class="btn sec" href="old/'+location.hash+'" style="margin-top:14px;text-decoration:none">Открыть прежнюю версию</a>';
  }});
}

/* ======================= ШТОРКА «УЧЁТ» ВО ВРЕМЯ СМЕНЫ ======================= */
// Таймер главный, а учёт выглядывает снизу: потянул вверх или нажал — развернулся; вниз — свернулся.
let drawerUp=false;
function renderDrawer(){
  const dr=$('#drawer'), on=tab==='now' && (S.live||[]).length>0 && !booting;
  dr.classList.toggle('show',on); $('#scrNow').classList.toggle('withdrawer',on);
  if(!on){ setDrawer(false,true); return; }
  const dl=debts(), tot=dl.reduce((a,x)=>a+x.total,0), wk=weekStats();
  dr.querySelector('.dhead').innerHTML='<div class="dt">Учёт</div><div class="dchips">'+
    '<span class="'+(tot>0.004?'w':'ok')+'">'+(tot>0.004?'Должны '+m$(tot):'Все рассчитаны ✓')+'</span><span>Неделя '+m$(wk.sum)+'</span></div><div class="dchev">˄</div>';
  const body=dr.querySelector('.dbody'), keep=body.scrollTop;
  body.innerHTML=dashboardHTML(true); body.scrollTop=keep;
  bindDashboard(body);
}
function setDrawer(up,silent){
  drawerUp=up; const dr=$('#drawer');
  dr.classList.toggle('up',up); document.body.classList.toggle('drawered',up);
  dr.style.transform='';
  if(!silent){ haptic(up?'soft':'tap'); if(up) rise(dr.querySelector('.dbody')); }
}
(function(){
  const dr=$('#drawer'), head=dr.querySelector('.dhead'), grab=dr.querySelector('.dgrab'), body=dr.querySelector('.dbody');
  let y0=null, base=0, last=0, lt=0, vy=0, moved=false;
  const H=()=>dr.getBoundingClientRect().height, PEEK=()=>parseFloat(getComputedStyle(dr).getPropertyValue('--peekpx'))||150;
  const start=y=>{ y0=y; last=y; lt=performance.now(); vy=0; moved=false; base=drawerUp?0:H()-PEEK(); dr.classList.add('drag'); };
  const move=y=>{ const t=performance.now(); vy=(y-last)/Math.max(1,t-lt); last=y; lt=t; const dy=y-y0; if(Math.abs(dy)>4) moved=true;
    let p=base+dy; if(p<0) p=p/3; dr.style.transform='translateY('+p+'px)'; };
  const end=()=>{ if(y0==null) return; y0=null; dr.classList.remove('drag');
    if(!moved){ setDrawer(!drawerUp); return; }
    const m=/translateY\(([-\d.]+)px\)/.exec(dr.style.transform), p=m?Number(m[1]):0;
    setDrawer(vy<-0.4 ? true : vy>0.4 ? false : p<H()*0.45); };
  [head,grab].forEach(el=>{
    el.addEventListener('pointerdown',e=>{ start(e.clientY); try{ el.setPointerCapture(e.pointerId); }catch(_){} });
    el.addEventListener('pointermove',e=>{ if(y0!=null) move(e.clientY); });
    el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
  });
  // развернутый учёт: тянешь вниз от верха списка — сворачивается
  body.addEventListener('touchstart',e=>{ if(drawerUp && body.scrollTop<=0 && !e.target.closest('.swipe,.chart')) { y0=null; body._y=e.touches[0].clientY; } else body._y=null; },{passive:true});
  body.addEventListener('touchmove',e=>{ if(body._y==null) return; const dy=e.touches[0].clientY-body._y;
    if(dy>8 && y0==null){ start(body._y); } if(y0!=null){ if(e.cancelable) e.preventDefault(); move(e.touches[0].clientY); } },{passive:false});
  body.addEventListener('touchend',()=>{ if(y0!=null) end(); body._y=null; });
})();

/* ======================= ЖИВЫЕ МЕЛОЧИ ======================= */
// капля на нижней панели: подложка перетекает к выбранной вкладке, по пути растягиваясь
function moveInd(){
  const ind=$('#nav .ind'), b=document.querySelector('#nav .nt[aria-selected="true"]'); if(!ind||!b) return;
  const n=$('#nav').getBoundingClientRect(), r=b.getBoundingClientRect(), x=r.left-n.left+r.width/2-ind.offsetWidth/2;
  const was=Number(ind.dataset.x||x); ind.dataset.x=x;
  if(reduce()||Math.abs(was-x)<1){ ind.style.transform='translateX('+x+'px)'; return; }
  ind.animate([{transform:'translateX('+was+'px) scaleX(1)'},{transform:'translateX('+((was+x)/2)+'px) scaleX(1.9)',offset:.45},{transform:'translateX('+x+'px) scaleX(1)'}],
    {duration:520,easing:'cubic-bezier(.32,.72,0,1)'});
  ind.style.transform='translateX('+x+'px)';
}
window.addEventListener('resize',moveInd);
// часы таймера — барабаном: меняющаяся цифра въезжает снизу
function odo(el,text){
  if(!el) return;
  if(el.dataset.t===text) return;
  const old=el.dataset.t||''; el.dataset.t=text;
  if(old.length!==text.length || reduce()){ el.innerHTML=[...text].map(ch=>'<span class="dg'+(ch===':'?' sep':'')+'">'+ch+'</span>').join(''); return; }
  const kids=el.children;
  [...text].forEach((ch,i)=>{ if(old[i]===ch) return; const k=kids[i]; if(!k) return; k.textContent=ch; k.classList.remove('roll'); void k.offsetWidth; k.classList.add('roll'); });
}

/* ======================= ЗАКРЫТЫЙ ВХОД ======================= */
const GATE={pending:['Доступ запрошен','Владелец учёта получил запрос. Как подтвердит — нажми «Проверить».'],
  blocked:['Нет доступа','Владелец закрыл тебе доступ к учёту.'],
  notg:['Открой заново','Закрой учёт и открой его снова кнопкой в боте.'],
  closed:['Учёт закрыт','Учёт открывается через Telegram-бота, для тех, кого пустил владелец.']};
function closeGate(st){
  S={workers:[],customers:[],shifts:[],ops:[],live:[],payments:[]}; safeStorage.removeItem(CKEY); renderAll();
  const g=GATE[st.status]||GATE.closed, el=$('#gate');
  el.innerHTML='<div class="ic">🔒</div><h2>'+g[0]+'</h2><p>'+g[1]+(st.status==='pending'&&st.id?'<br><span class="num t3">'+esc(st.name||'')+' · id '+esc(st.id)+'</span>':'')+'</p>'+
    (st.status==='pending'?'<button class="btn" data-retry>Проверить</button>':'')+'<button class="btn ghost" data-login>Я владелец — войти по почте</button>';
  el.classList.add('on');
  const r=el.querySelector('[data-retry]'); if(r) r.onclick=()=>{ r.textContent='…'; boot(); };
  // закрыл вход, не войдя, — снова экран входа, а не пустой учёт
  el.querySelector('[data-login]').onclick=()=>{ el.classList.remove('on'); meLevel(openSheet({detent:'half',onClose:()=>{ if(!user) el.classList.add('on'); }})); };
}

/* ======================= ЗАПУСК ======================= */
let syncedAt=Date.now(), syncErr=false;
function renderOffbar(){
  const el=$('#offbar'), n=queue.length, bad=queue.filter(q=>q.failed);
  if(online() && !n && !offlineData && !syncErr){ el.classList.remove('on'); return; }
  el.textContent=bad.length?'Не записалось: '+bad.length+' — нажми, чтобы разобраться'
    :!online()?'Нет сети — запишется, когда появится'+(n?' · в очереди '+n:''):n?'Отправляю '+n+'…'
    :syncErr?'Не обновилось — показано на '+tHM(syncedAt)+' · нажми, чтобы повторить':'Показаны данные из памяти';
  el.classList.add('on');
  el.onclick=bad.length?()=>failedSheet(bad[0]):syncErr?()=>{ el.textContent='Обновляю…'; reload(); }:null;
}
// застрявшая смена: повторить или убрать (с «Отменить»); подробная ошибка — только владельцу
function failedSheet(q){
  const sh=openSheet({detent:'half'});
  sh.push({title:'Не записалось', render(b){
    b.innerHTML='<div class="lead">Смена '+dayText(q.row.work_date)+' · '+m$(q.row.total)+' не записалась в базу.'+(isOwner&&q.failed?'<br><span class="t3" style="font-size:13px">'+esc(q.failed)+'</span>':'')+'</div>'+
      '<button class="btn" data-retry>Повторить</button><button class="btn red" data-drop style="margin-top:8px">Убрать смену</button>';
    b.querySelector('[data-retry]').onclick=async function(){ if(!online()) return toast('Нет сети',true); this.disabled=true; delete q.failed; saveQueue();
      const sent=await flushQueue(); sh.close(true); if(sent) await reload(); renderAll(); const still=queue.find(x=>x.id===q.id);
      toast(still&&still.failed?'Снова не записалась':'Записано',!!(still&&still.failed)); };
    b.querySelector('[data-drop]').onclick=()=>{ sh.close(true);
      queue=queue.filter(x=>x.id!==q.id); saveQueue(); S.shifts=S.shifts.filter(x=>x.id!==q.sid); renderAll(); haptic('warn');
      offerUndo('Смена убрана из очереди',{onUndo:()=>{ queue.push(q); saveQueue(); applyPending(); renderAll(); }}); };
  }});
}
window.addEventListener('online',async()=>{ renderOffbar(); if(await flushQueue()) await reload(); });
window.addEventListener('offline',renderOffbar);
let dirtyScr={now:false,hist:false};
function renderAll(){
  document.body.classList.toggle('ro',locked);
  // удаленное, которое еще можно вернуть, при обновлении не всплывает
  if(hiddenIds.size){ S.shifts=S.shifts.filter(x=>!hiddenIds.has(x.id)); S.live=(S.live||[]).filter(x=>!hiddenIds.has(x.id)); }
  if(tab==='now'){ renderNow(); dirtyScr.hist=true; }
  else { const q=$('#hq'); if(q && document.activeElement===q) dirtyScr.hist=true; else renderHist(); dirtyScr.now=true; }
  renderOffbar(); updateBg();
  syncDock(); tellNative();
}
// внутри iPhone-приложения: сообщаем, что данные поменялись — оно обновит экран блокировки и виджеты
let nativeT=null;
// вместе с сигналом отдаём идущие смены — экран блокировки и Dynamic Island меняются сразу, не дожидаясь сети
function tellNative(now){ const h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.uchet; if(!h) return;
  const send=()=>{ try{ h.postMessage(JSON.stringify({live:S.live||[]})); }catch(_){} };
  clearTimeout(nativeT); if(now) send(); else nativeT=setTimeout(send,400); }
// iPhone-приложение открыло учёт по ссылке: #fin=ID — итог закончившейся смены, #past — записать прошедшую
function openFromHash(){
  const h=location.hash.slice(1); if(!h) return;
  history.replaceState(null,'',location.pathname+location.search);
  if(h.startsWith('fin=')){ const l=(S.live||[]).find(x=>x.id===h.slice(4)); if(l&&l.finished_at&&!locked) setTimeout(()=>finishSheet(draftFromLive(l)),350); }
  else if(h==='past'&&!locked) setTimeout(()=>plusSheet('past'),350);
}
// док: на смене — красная точка у «Сейчас», «+» в дышащем кольце и сажает людей; долг старше недели — янтарная точка у «Истории»
function syncDock(){
  const live=(S.live||[]).some(l=>!l.finished_at), td=Date.parse(today()+'T00:00Z');
  const old=debts().some(d=>!d.pendingOnly && (td-Date.parse(d.oldest+'T00:00Z'))/864e5>7);
  document.querySelector('#nav .nt[data-tab="now"]').classList.toggle('live',live);
  document.querySelector('#nav .nt[data-tab="hist"]').classList.toggle('warn',old);
  const p=$('#plus'); p.classList.toggle('live',live); p.setAttribute('aria-label',live?'Посадить кастомера':'Новая смена');
}
let reloadT=null;
async function reload(){
  document.body.classList.add('refreshing');
  try{ await loadAll(); saveCache(); syncedAt=Date.now(); syncErr=false; }catch(e){ document.body.classList.remove('refreshing'); if(e&&e.gate) return closeGate(e.gate); syncErr=true; renderOffbar(); return; }
  document.body.classList.remove('refreshing');
  renderAll();
  sheets.forEach(s=>{ const t=s.top(); if(t&&t.spec.live) t.render(); });
}
function scheduleReload(){ clearTimeout(reloadT); reloadT=setTimeout(reload,500); }
let started=false, subscribed=false;
function subscribeOnce(){
  if(subscribed || !canWrite) return; subscribed=true;
  try{ let ch=sb.channel('uchet2');
    ['shifts','shift_customers','shift_workers','live_shifts','payments','ops','workers','customers'].forEach(t=>{ ch=ch.on('postgres_changes',{event:'*',schema:'public',table:t},scheduleReload); });
    ch.subscribe(); }catch(_){}
}
async function boot(){
  loadQueue();
  if(!S.shifts.length && loadCache()){ booting=false; renderAll(); rise(tab==='now'?$('#scrNow'):$('#scrHist')); }   // сразу из памяти — без заставки
  try{
    try{ await refreshAuth(); }catch(_){}
    await loadAll(); saveCache();
  }catch(e){
    if(e && e.gate){ closeGate(e.gate); return; }
    if(!loadCache()){ booting=false; $('#scrNow').innerHTML='<div class="empty" style="margin-top:40vh">Не удалось связаться с базой.<br>Проверь интернет и открой заново.</div>'; return; }
    applyPending();
  }
  $('#gate').classList.remove('on');
  const first=booting; booting=false; renderAll(); moveInd(); if(first) rise(tab==='now'?$('#scrNow'):$('#scrHist'));
  openFromHash();
  if(await flushQueue()) await reload();
  if(!started){
    started=true;
    // кто смотрит без правки, не подписан на изменения базы — освежаем раз в минуту
    setInterval(()=>{ if(!document.hidden && !canWrite && TG) scheduleReload(); },60000);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleReload(); });
  }
  subscribeOnce();
  if(isOwner){ if(TG) sb.functions.invoke('tg-access',{body:{initData:TG.initData,owner:true}}).then(loadMembers).catch(function(){}); await loadMembers(); }
}
// GitHub Pages держит страницу в кэше до 10 минут, а Telegram на iPhone без сервис-воркера — проверяем версию сами
async function checkUpdate(){
  try{
    const r=await fetch('index.html?nc='+Date.now(),{cache:'no-store'});
    const m=(await r.text()).match(/APP_VERSION='([0-9a-z.-]+)'/);
    if(!m || m[1]===APP_VERSION) return;
    const key='uchet2-upd-'+m[1]; if(sessionStorage.getItem(key)) return; sessionStorage.setItem(key,'1');
    location.replace(location.pathname+'?v='+encodeURIComponent(m[1])+location.hash);
  }catch(e){}
}
renderAll(); boot(); checkUpdate();
