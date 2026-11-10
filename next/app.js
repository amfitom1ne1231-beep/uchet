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
const avHTML=(name,cls)=>'<div class="av '+(cls||'')+'">'+esc(initials(name))+'</div>';
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
function plural(n,a,b,c){ const x=n%10,y=n%100; return x===1&&y!==11?a:(x>=2&&x<=4&&(y<12||y>14)?b:c); }
const freq=(kind)=>{   // кого чаще звали в последние 60 дней — наверх
  const from=new Date(Date.parse(today()+'T00:00Z')-60*864e5).toISOString().slice(0,10), n={};
  S.shifts.filter(s=>s.work_date>=from).forEach(s=>(kind==='w'?s.workerIds:s.customerIds).forEach(id=>n[id]=(n[id]||0)+1));
  return (kind==='w'?S.workers:S.customers).filter(x=>x.active!==false).slice().sort((a,b)=>(n[b.id]||0)-(n[a.id]||0)||String(a.name).localeCompare(b.name));
};

/* ======================= СООБЩЕНИЯ, «ОТМЕНИТЬ», ГАЛОЧКА ======================= */
let toastT;
function toast(text,err){
  const t=$('#toast'); t.textContent=text; t.classList.toggle('err',!!err); t.classList.add('on');
  if(err) haptic('err');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),err?3800:2400);
}
async function fail(error,what){
  const m=error&&error.message?error.message:String(error||'');
  toast(/row-level security|permission/i.test(m) ? 'Нет прав на запись' : (what||'Не получилось')+(m&&isOwner?': '+m:''), true);
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
}
function finishUndo(commit){
  const o=undoCur; undoCur=null; clearTimeout(undoT);
  $('#undo').classList.remove('on');
  if(!o) return;
  try{ if(commit){ o.onCommit&&o.onCommit(); } else { o.onUndo&&o.onUndo(); } }catch(e){}
}
$('#undo button').onclick=()=>{ haptic('ok'); finishUndo(false); };
(function(){   // смахнул плашку вниз — спряталась, действие осталось
  let y0=null; const u=$('#undo');
  u.addEventListener('pointerdown',e=>{ if(e.target.closest('button')) return; y0=e.clientY; });
  u.addEventListener('pointerup',e=>{ if(y0!=null && e.clientY-y0>20) finishUndo(true); y0=null; });
})();
document.addEventListener('visibilitychange',()=>{ if(document.hidden && undoCur) finishUndo(true); });
function showDone(){
  const d=$('#done'); d.classList.add('on'); haptic('ok');
  setTimeout(()=>d.classList.remove('on'),1200);
}
// число докручивается к новому значению
function rollTo(el,to,fmt){
  if(!el) return;
  const from=Number(el.dataset.v||to); el.dataset.v=to;
  if(reduce()||Math.abs(from-to)<0.005){ el.innerHTML=fmt(to); return; }
  const t0=performance.now(), D=450;
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
  const posOf=d=> d==='half' ? H()*0.42 : 0;
  sh.set=function(d){ sh.detent=d; el.style.transform='translateY('+posOf(d)+'px)'; };
  sh.close=function(){
    if(sh.closed) return; sh.closed=true;
    el.classList.add('closing'); el.style.transform='translateY(100%)';
    const i=sheets.indexOf(sh); if(i>=0) sheets.splice(i,1); syncSheets();
    setTimeout(()=>el.remove(),320);
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
  el.style.transform='translateY(100%)';
  requestAnimationFrame(()=>requestAnimationFrame(()=>sh.set(sh.detent)));
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
    if(horiz==null){ if(Math.abs(ddx)>8||Math.abs(ddy)>8){ horiz=Math.abs(ddx)>Math.abs(ddy); if(horiz) face.setPointerCapture(e.pointerId); else { x0=null; return; } } else return; }
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
  knob.addEventListener('pointerdown',e=>{ x0=e.clientX; max=sl.clientWidth-60; sl.classList.remove('go'); knob.setPointerCapture(e.pointerId); haptic('tap'); });
  knob.addEventListener('pointermove',e=>{ if(x0==null) return; set(Math.max(0,Math.min(max,e.clientX-x0))); });
  const up=()=>{ if(x0==null) return; x0=null; sl.classList.add('go');
    if(x>=max*0.88){ set(max); haptic('double'); setTimeout(()=>{ fn(); setTimeout(()=>{ set(0); lbl.style.opacity=''; },500); },120); }
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
    const show=()=>{ const v=parseAmt(s); b.querySelector('[data-v]').innerHTML=moneyHTML(v); };
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
}
document.querySelectorAll('#nav .nt').forEach(b=>b.onclick=()=>goTab(b.dataset.tab));
$('#plus').onclick=()=>{ if(locked) return toast('Записи ведет владелец'); plusSheet(); };
$('#gear').onclick=()=>settingsSheet();
function syncMini(){
  const sc=tab==='now'?$('#scrNow'):$('#scrHist');
  $('#mini').textContent=tab==='now'?'Учёт':'История';
  $('#mini').classList.toggle('on',sc.scrollTop>44);
}
['#scrNow','#scrHist'].forEach(function(id){
  const sc=$(id); let last=0;
  sc.addEventListener('scroll',()=>{
    const y=sc.scrollTop; syncMini();
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
  const head='<div class="big"><div><h1>Учёт</h1><div class="sub">'+esc(longDate())+'</div></div></div>';
  if(booting && !S.shifts.length && !S.live.length){ sc.innerHTML=head+'<div class="sk"></div><div class="sk"></div><div class="sk"></div>'; return; }
  const lives=liveRows();
  if(lives.length){
    if(liveIdx>=lives.length) liveIdx=0;
    const dl=debts(), tot=dl.reduce((a,x)=>a+x.total,0);
    sc.innerHTML=head+'<div class="carousel" id="car">'+lives.map(liveCardHTML).join('')+'</div>'+
      (lives.length>1?'<div class="dots">'+lives.map((_,i)=>'<i class="'+(i===liveIdx?'on':'')+'"></i>').join('')+'</div>':'')+
      (tot>0.004?'<div class="list" style="margin-top:14px"><button class="row" data-go="debts" style="width:100%;text-align:left"><div class="mid"><div class="nm">Должны</div><div class="sm">'+dl.length+' '+plural(dl.length,'человек','человека','человек')+'</div></div><div class="amt">'+moneyHTML(tot)+'</div><div class="chev">›</div></button></div>':'');
    const car=$('#car');
    requestAnimationFrame(()=>{ car.scrollLeft=liveIdx*car.clientWidth; });
    car.addEventListener('scroll',()=>{ const i=Math.round(car.scrollLeft/Math.max(1,car.clientWidth)); if(i!==liveIdx){ liveIdx=i; haptic('pick');
      document.querySelectorAll('.dots i').forEach((d,k)=>d.classList.toggle('on',k===i)); } },{passive:true});
    car.querySelectorAll('.lcard').forEach(bindLiveCard);
    const go=sc.querySelector('[data-go]'); if(go) go.onclick=()=>debtsSheet();
    tickLive();
    return;
  }
  sc.innerHTML=head+dashboardHTML();
  bindDashboard(sc);
}
function longDate(){ const t=today(), d=new Date(t+'T00:00Z');
  return ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][d.getUTCDay()]+', '+d.getUTCDate()+' '+MONGEN[d.getUTCMonth()]; }

function personHTML(l,id,kind){
  const on=kind==='c'?seated(l,id):working(l,id), nm=kind==='c'?cName(id):wName(id);
  const spans=(kind==='c'?livePlayerSpans(l,nowMs()):liveWorkerSpans(l,nowMs())).find(x=>x.id===id);
  const ms=spans?spanLen(spanMinus(spans.spans,livePauseSpans(l,nowMs()))):0;
  return '<button class="pp '+(on?'on':'off')+'" data-p="'+kind+'|'+id+'"><div class="av">'+esc(initials(nm))+
    (kind==='c'&&l.payer_id===id?'<i class="coin">$</i>':'')+'</div><div class="tm num" data-ptm="'+kind+'|'+id+'">'+(on||ms>60e3?dur(ms):'—')+'</div></button>';
}
function liveCardHTML(l){
  const fin=!!l.finished_at, paused=!!l.paused_at&&!fin, x=liveSummary(l,nowMs());
  if(fin){
    return '<div class="card lcard fin" data-live="'+l.id+'">'+
      '<div class="lstat"><span class="dot debt"></span>Смена закончена · ждёт сохранения</div>'+
      '<div class="hero" style="text-align:center;padding:18px 0 8px"><div class="v">'+moneyHTML(x.c.total)+'</div>'+
      '<div class="s">'+x.h+' '+hourWord(x.h)+' · '+tHM(x.s)+'–'+tHM(x.e)+' · '+esc((l.worker_ids||[]).map(wName).join(', '))+'</div></div>'+
      (locked?'':'<button class="btn" data-open-fin style="margin-top:12px">Открыть итог</button>')+'</div>';
  }
  const ring='<svg width="260" height="260" viewBox="0 0 260 260"><circle class="tr" cx="130" cy="130" r="120" fill="none" stroke-width="5"/>'+
    '<circle class="pg" data-ring cx="130" cy="130" r="120" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="'+RC.toFixed(2)+'" stroke-dashoffset="'+RC.toFixed(2)+'"/>'+
    '<line class="notch" x1="250" y1="130" x2="258" y2="130" stroke-width="2" transform="rotate(180 130 130)"/></svg>';
  const ws=l.worker_ids||[], cs=l.customer_ids||[];
  return '<div class="card lcard'+(paused?' paused':'')+'" data-live="'+l.id+'">'+
    '<div class="lstat">'+(paused?'<span class="dot debt"></span>Пауза':'<span class="dot live"></span>Идёт смена')+' · с '+tHM(Date.parse(l.started_at))+'</div>'+
    '<div class="ringbox">'+ring+'<div class="ringin"><div class="clock num" data-clock>0:00:00</div>'+
      '<div class="k">к оплате <b data-due></b></div><div class="pz num" data-pz></div></div></div>'+
    (locked?'':'<button class="pausebtn" data-pause>'+(paused?'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>Продолжить':
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>')+'</button>')+
    '<span class="cap">Кастомеры</span><div class="people">'+cs.map(id=>personHTML(l,id,'c')).join('')+
      (locked?'':'<button class="pp add" data-add="c"><div class="av">+</div><div class="tm"></div></button>')+'</div>'+
    '<span class="cap">Операторы</span><div class="people">'+ws.map(id=>personHTML(l,id,'w')).join('')+
      (locked?'':'<button class="pp add" data-add="w"><div class="av">+</div><div class="tm"></div></button>')+'</div>'+
    '<button class="moneyline" data-money style="width:100%"><span>к оплате <b data-due2></b></span><span class="chev">˄</span></button>'+
    '<div class="mdet"><div data-mdet></div></div>'+
    (locked?'':sliderHTML('закончить смену','data-finish'))+
  '</div>';
}
function liveMoneyHTML(l){
  const now=nowMs(), x=liveSummary(l,now), sp=liveSplit(l,x.c.total,now), ws=liveWorkerSplit(l,x.c.total/2,now);
  return '<div style="padding:4px 0 6px">'+sp.res.map(r=>'<div class="kv"><span>'+esc(cName(r.id))+(l.payer_id===r.id?' · платит за всех':'')+'</span><b>'+m$(r.amount)+'</b></div>').join('')+
    '<div class="kv"><span>Касса</span><b>'+m$(x.c.kassa)+'</b></div>'+
    ws.res.map(r=>'<div class="kv"><span>'+esc(wName(r.id))+'</span><b>'+m$(r.amount)+'</b></div>').join('')+
    (x.c.discount?'<div class="kv"><span>Скидка</span><b>−'+m$(x.c.discount)+'</b></div>':'')+'</div>';
}
// раз в секунду: часы, кольцо, сумма. Кольцо — час; на 30-й минуте час уже в оплате (засечка).
const lastHalf={};
function tickLive(){
  document.querySelectorAll('.lcard[data-live]').forEach(function(card){
    const l=(S.live||[]).find(x=>x.id===card.dataset.live); if(!l||l.finished_at) return;
    const now=nowMs(), played=livePlayed(l,now), x=liveSummary(l,now);
    const c=card.querySelector('[data-clock]'); if(c) c.textContent=clock(played);
    const ring=card.querySelector('[data-ring]'); if(ring) ring.style.strokeDashoffset=String(RC*(1-(played%3600)/3600));
    const dueT=x.h+' ч · '+m$(x.c.total);
    const d1=card.querySelector('[data-due]'); if(d1 && d1.textContent!==dueT) d1.textContent=dueT;
    const d2=card.querySelector('[data-due2]'); if(d2) d2.textContent=m$(x.c.total);
    const pz=card.querySelector('[data-pz]');
    if(pz) pz.textContent=l.paused_at?'пауза '+clockHM(Math.max(0,now-Date.parse(l.paused_at))/1000+59)+'':((l.pause_sec||0)>59?'паузы '+clockHM(l.pause_sec):'');
    const half=Math.floor((played+1800)/3600);
    if(lastHalf[l.id]!=null && half>lastHalf[l.id] && !document.hidden){ haptic('soft'); if(d1){ d1.animate&&d1.animate([{opacity:.2},{opacity:1}],{duration:500}); } }
    lastHalf[l.id]=half;
    card.querySelectorAll('[data-ptm]').forEach(function(t){
      const [k,id]=t.dataset.ptm.split('|'); const on=k==='c'?seated(l,id):working(l,id);
      const sp=(k==='c'?livePlayerSpans(l,now):liveWorkerSpans(l,now)).find(z=>z.id===id);
      const ms=sp?spanLen(spanMinus(sp.spans,livePauseSpans(l,now))):0;
      t.textContent=on||ms>60e3?dur(ms):'—';
    });
  });
}
setInterval(()=>{ if(!document.hidden) tickLive(); },1000);
function putLive(row){
  if(!row||!row.id) return;
  const i=(S.live||[]).findIndex(x=>x.id===row.id);
  const r=Object.assign({},row,{discount:Number(row.discount)||0});
  if(i>=0) S.live[i]=r; else S.live.push(r);
}
function bindLiveCard(card){
  const id=card.dataset.live, L=()=>(S.live||[]).find(x=>x.id===id);
  const of=card.querySelector('[data-open-fin]'); if(of) of.onclick=()=>{ const l=L(); if(l) finishSheet(draftFromLive(l)); };
  const pb=card.querySelector('[data-pause]');
  if(pb) pb.onclick=async()=>{
    const l=L(); if(!l||!liveReady()) return; haptic('hard');
    pb.disabled=true;
    const {data,error}=await sb.rpc('live_action',{p_id:id,p_action:l.paused_at?'resume':'pause'});
    pb.disabled=false;
    if(error) return fail(error);
    if(data&&data.id) putLive(data); else await loadAll();
    renderNow();
  };
  const ml=card.querySelector('[data-money]');
  if(ml) ml.onclick=()=>{ haptic('tap'); const det=ml.nextElementSibling, open=!det.classList.contains('open');
    if(open) det.querySelector('[data-mdet]').innerHTML=liveMoneyHTML(L());
    det.classList.toggle('open',open); ml.classList.toggle('open',open); };
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
const liveReady=()=>{ if(locked){ toast('Записи ведет владелец'); return false; } if(!online()){ toast('Нет сети — таймер живет в базе',true); return false; } return true; };
async function togglePerson(lid,k,pid,b){
  const l=(S.live||[]).find(x=>x.id===lid); if(!l||!liveReady()) return;
  const on=k==='c'?seated(l,pid):working(l,pid);
  if(k==='w' && on && (l.worker_ids||[]).filter(x=>working(l,x)).length<2 && !await ask('Убрать последнего оператора со смены?')) return;
  haptic('soft'); b.classList.toggle('on',!on); b.classList.toggle('off',on);
  const {data,error}=await sb.rpc(k==='c'?'live_player':'live_worker',
    k==='c'?{p_id:lid,p_customer:pid,p_action:on?'leave':'sit'}:{p_id:lid,p_worker:pid,p_action:on?'off':'on'});
  if(error){ b.classList.toggle('on',on); b.classList.toggle('off',!on); return fail(error); }
  if(data&&data.id) putLive(data); tickLive();
}

/* ======================= СЕЙЧАС: смены нет ======================= */
function dashboardHTML(){
  const dl=debts(), tot=dl.reduce((a,x)=>a+x.total,0), hd=handDue(), wk=weekStats();
  const oldest=dl.length?Math.round((Date.parse(today()+'T00:00Z')-Date.parse(dl.map(x=>x.oldest).sort()[0]+'T00:00Z'))/864e5):0;
  let h='';
  if(tot>0.004){
    h+='<div class="hero"><div class="lbl">Должны</div><div class="v" data-roll="'+tot+'">'+moneyHTML(tot)+'</div>'+
      '<div class="s">'+dl.length+' '+plural(dl.length,'человек','человека','человек')+(oldest>0?' · самый старый долг '+oldest+' '+plural(oldest,'день','дня','дней'):'')+'</div></div>';
    h+='<div style="margin-top:14px">'+dl.map(d=>{
      const old=Math.round((Date.parse(today()+'T00:00Z')-Date.parse(d.oldest+'T00:00Z'))/864e5);
      return '<div class="swipe" data-debtor="'+d.id+'"><div class="under"><span class="r">Заплатил всё</span><span class="l"><button data-prof>Профиль</button></span></div>'+
        '<div class="face"><div class="debtor">'+avHTML(cName(d.id))+'<div class="mid"><div class="nm">'+esc(cName(d.id))+(old>7?' <span class="dot debt" style="margin-left:4px"></span>':'')+'</div>'+
        '<div class="sm">'+d.items.length+' '+plural(d.items.length,'смена','смены','смен')+' · с '+dayText(d.oldest)+'</div></div><div class="amt">'+moneyHTML(d.total)+'</div></div></div></div>';
    }).join('')+'</div>';
  } else {
    h+='<div class="hero calm"><div class="lbl">Должны</div><div class="v">Все рассчитаны <span style="color:var(--ok)">✓</span></div></div>';
  }
  if(hd.any){
    const parts=['касса '+m$(hd.kassa)].concat(Object.keys(hd.w).filter(k=>Math.abs(hd.w[k])>0.004).map(k=>wName(k)+' '+m$(hd.w[k])));
    h+='<span class="cap">Не роздано</span><div class="list"><button class="row" data-hand style="width:100%;text-align:left"><span class="dot none"></span><div class="mid">'+
      '<div class="nm">'+esc(parts.join(' · '))+'</div><div class="sm">смены без кастомеров и старые записи — выдать вручную</div></div><div class="chev">›</div></button></div>';
  }
  const mx=Math.max(1,...wk.days), td=Math.round((Date.parse(today()+'T00:00Z')-Date.parse(wk.from+'T00:00Z'))/864e5);
  h+='<span class="cap">Эта неделя</span><div class="card week">'+
    '<div style="display:flex;align-items:baseline;justify-content:space-between"><div class="tot">'+moneyHTML(wk.sum)+'</div>'+
    '<div class="t2" style="font-size:14px">'+wk.n+' '+plural(wk.n,'смена','смены','смен')+' · '+wk.h+' ч</div></div>'+
    (wk.n?'<div class="ws"><span>касса <b>'+m$(wk.kassa)+'</b></span>'+Object.keys(wk.w).map(k=>'<span>'+esc(wName(k))+' <b>'+m$(wk.w[k])+'</b></span>').join('')+'</div>':'')+
    '<div class="bars">'+wk.days.map((v,i)=>{ const d=new Date(Date.parse(wk.from+'T00:00Z')+i*864e5).toISOString().slice(0,10);
      return '<button data-day="'+d+'" class="'+(i===td?'today':'')+'"><i style="height:'+Math.max(4,Math.round(v/mx*48))+'px;opacity:'+(v?1:.5)+'"></i><span>'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]+'</span></button>'; }).join('')+'</div></div>';
  return h;
}
function bindDashboard(sc){
  sc.querySelectorAll('[data-debtor]').forEach(function(w){
    const cid=w.dataset.debtor;
    w.querySelector('.face').onclick=()=>settleSheet(cid);
    w.querySelector('[data-prof]').onclick=e=>{ e.stopPropagation(); w._close(); profileSheet('c',cid); };
    swipeable(w,{ right:locked?null:()=>settleAll(cid,w), left:true });
  });
  const hd=sc.querySelector('[data-hand]'); if(hd) hd.onclick=()=>{ const s=settingsSheet(); manualIssueLevel(s); };
  sc.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{ goTab('hist'); setTimeout(()=>{ const a=document.getElementById('d-'+b.dataset.day);
    if(a) $('#scrHist').scrollTo({top:a.offsetTop-70,behavior:reduce()?'auto':'smooth'}); else toast('В этот день смен нет'); },120); });
}
// смахнул должника — заплатил всё (сразу, с «Отменить»)
async function settleAll(cid,wrap){
  if(!liveReady()){ wrap&&wrap._close(); return; }
  const d=debts().find(x=>x.id===cid); if(!d){ wrap&&wrap._close(); return; }
  const {data,error}=await sb.rpc('settle',{p_customer:cid,p_amount:d.total});
  if(error){ wrap&&wrap._close(); return fail(error); }
  haptic('ok'); await reload();
  offerUndo(cName(cid)+' заплатил '+m$(d.total),{onUndo:async()=>{ const r=await sb.rpc('unsettle',{p_payment:data.id}); if(r.error) return fail(r.error); await reload(); toast('Расчёт отменён'); }});
}

/* ======================= ИСТОРИЯ ======================= */
let histQ='', histChip='', searchOpen=false;
function entries(){
  const a=S.shifts.map(s=>({kind:'shift',date:s.work_date,at:s.start_time?shiftStart(s):Date.parse(s.created_at||s.work_date),s:s}));
  S.ops.forEach(o=>a.push({kind:'op',date:o.op_date,at:Date.parse(o.created_at||o.op_date),o:o}));
  (S.payments||[]).filter(p=>!p.undone_at && p.note!=='при сохранении смены').forEach(p=>a.push({kind:'pay',date:khParts(Date.parse(p.created_at)).d,at:Date.parse(p.created_at),p:p}));
  return a.sort((x,y)=>(y.date>x.date?1:y.date<x.date?-1:0)||(y.at-x.at));
}
function histMatch(e){
  if(histChip==='debt' && !(e.kind==='shift' && shiftStatus(e.s)==='debt')) return false;
  if(histChip==='none' && !(e.kind==='shift' && shiftStatus(e.s)==='none')) return false;
  if(histChip==='shifts' && e.kind!=='shift') return false;
  if(histChip==='money' && e.kind==='shift') return false;
  if(histChip.startsWith('p:')){ const id=histChip.slice(2);
    if(e.kind==='shift') { if(!e.s.workerIds.includes(id)&&!e.s.customerIds.includes(id)) return false; }
    else if(e.kind==='op'){ if(e.o.worker_id!==id) return false; } else if(e.p.customer_id!==id) return false; }
  const q=histQ.trim().toLowerCase(); if(!q) return true;
  const words=[dayLabel(e.date),dayText(e.date),e.date];
  if(e.kind==='shift') words.push(...e.s.workerIds.map(wName),...e.s.customerIds.map(cName),String(e.s.total),e.s.note||'');
  if(e.kind==='op') words.push(wName(e.o.worker_id),String(e.o.amount),e.o.note||'');
  if(e.kind==='pay') words.push(cName(e.p.customer_id),String(e.p.amount));
  return words.join(' ').toLowerCase().includes(q);
}
function miniBar(s){
  const a=shiftStart(s), b=shiftEndMs(s), W=Math.max(1,b-a);
  return '<div class="mini">'+pauseSpans(s.pause_log).filter(p=>p.e).map(p=>'<i style="left:'+((p.s-a)/W*100).toFixed(1)+'%;width:'+Math.max(1,(p.e-p.s)/W*100).toFixed(1)+'%"></i>').join('')+'</div>';
}
function shiftCardHTML(s){
  const st=shiftStatus(s), ppl=s.customerIds.concat(s.workerIds);
  return '<div class="swipe" data-shift="'+s.id+'"><div class="under"><span class="r">Рассчитать</span><span class="l">'+
      (locked?'':'<button data-edit>Изменить</button><button class="del" data-del>Удалить</button>')+'</span></div>'+
    '<div class="face"><div class="hc"><div class="l1"><span class="tm num">'+(s.start_time?hhmm(s.start_time)+'–'+tHM(shiftEndMs(s)):'без времени')+'</span>'+
    '<span class="hrs">'+s.hours+' ч</span><span class="sum">'+moneyHTML(s.total)+'</span><span class="dot '+st+'"></span></div>'+
    '<div class="l2">'+miniBar(s)+'<div class="avs">'+ppl.slice(0,5).map((id,i)=>avHTML(i<s.customerIds.length?cName(id):wName(id),'xs')).join('')+'</div></div>'+
    (s.pending?'<div class="sm t3" style="margin-top:6px;font-size:12px">ещё не отправлено</div>':'')+'</div></div></div>';
}
function moneyRowHTML(e){
  if(e.kind==='pay') return '<div class="hm" data-pay="'+e.p.id+'"><span class="ic">$</span>'+esc(cName(e.p.customer_id))+' заплатил<b>'+m$(e.p.amount)+'</b></div>';
  const o=e.o, t=o.kind==='payout'?'Выплата · '+wName(o.worker_id):o.kind==='expense'?'Выдача кассы':o.kind==='income'?'Оплата от кастомеров (старая запись)':'Долг до начала учёта';
  return '<div class="hm" data-op="'+o.id+'"><span class="ic">'+(o.kind==='payout'||o.kind==='expense'?'↗':'↙')+'</span>'+esc(t)+(o.note?' · '+esc(o.note):'')+'<b>'+(o.kind==='payout'||o.kind==='expense'?'−':'')+m$(o.amount)+'</b></div>';
}
function renderHist(){
  const sc=$('#scrHist'), keep=sc.scrollTop;
  const ppl=freq('c').slice(0,6).map(c=>({id:c.id,name:c.name})).concat(freq('w').slice(0,3).map(w=>({id:w.id,name:w.name})));
  const chips=[['debt','Долги'],['none','Без кастомеров'],['shifts','Смены'],['money','Деньги']].map(c=>'<button class="pill" data-chip="'+c[0]+'" aria-pressed="'+(histChip===c[0])+'">'+c[1]+'</button>').join('')+
    ppl.map(p=>'<button class="pill" data-chip="p:'+p.id+'" aria-pressed="'+(histChip==='p:'+p.id)+'">'+esc(p.name)+'</button>').join('');
  let h='<div class="big"><div><h1>История</h1></div><button class="pill" data-srch style="margin-bottom:6px">Поиск</button></div>'+
    '<div class="search'+(searchOpen?' open':'')+'"><div><input id="hq" type="search" placeholder="Имя, дата, сумма" value="'+esc(histQ)+'"><div class="pills" style="margin-bottom:6px">'+chips+'</div></div></div>';
  const list=entries().filter(histMatch);
  if(!list.length) h+='<div class="empty">'+(histQ||histChip?'Ничего не нашлось':'Записей пока нет')+'</div>';
  let curM='', curD='';
  const monthTot={};
  list.forEach(e=>{ if(e.kind!=='shift') return; const m=e.date.slice(0,7); const t=monthTot[m]||(monthTot[m]={n:0,sum:0}); t.n++; t.sum+=e.s.total; });
  list.forEach(function(e){
    const m=e.date.slice(0,7);
    if(m!==curM){ curM=m; curD=''; const p=m.split('-'), t=monthTot[m]||{n:0,sum:0};
      h+='<div class="month"><b>'+MONFULL[Number(p[1])-1]+(p[0]!==today().slice(0,4)?' '+p[0]:'')+'</b><span>'+t.n+' '+plural(t.n,'смена','смены','смен')+' · '+m$(t.sum)+'</span></div>'; }
    if(e.date!==curD){ curD=e.date; h+='<div class="day" id="d-'+e.date+'">'+dayLabel(e.date)+'</div>'; }
    h+= e.kind==='shift' ? shiftCardHTML(e.s) : '<div class="list plain" style="margin-top:6px">'+moneyRowHTML(e)+'</div>';
  });
  sc.innerHTML=h; sc.scrollTop=keep;
  sc.querySelector('[data-srch]').onclick=()=>{ searchOpen=!searchOpen; haptic('tap'); sc.querySelector('.search').classList.toggle('open',searchOpen); if(searchOpen) setTimeout(()=>$('#hq').focus(),250); };
  const hq=$('#hq'); hq.oninput=()=>{ histQ=hq.value; clearTimeout(hq._t); hq._t=setTimeout(()=>{ renderHist(); const n=$('#hq'); n.focus(); n.setSelectionRange(n.value.length,n.value.length); },250); };
  sc.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{ histChip=histChip===b.dataset.chip?'':b.dataset.chip; haptic('pick'); renderHist(); });
  sc.querySelectorAll('[data-shift]').forEach(function(w){
    const sid=w.dataset.shift, s=()=>S.shifts.find(x=>x.id===sid);
    const face=w.querySelector('.face');
    face.onclick=()=>shiftSheet(sid,face);
    const ed=w.querySelector('[data-edit]'); if(ed) ed.onclick=e=>{ e.stopPropagation(); w._close(); editShift(sid); };
    const dl=w.querySelector('[data-del]'); if(dl) dl.onclick=e=>{ e.stopPropagation(); deleteShift(sid); };
    swipeable(w,{ right:(locked||shiftStatus(s())!=='debt')?null:()=>{ w._reset(); settleShiftSheet(sid); }, left:!locked });
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
function deleteShift(sid){
  const s=S.shifts.find(x=>x.id===sid); if(!s||!liveReady()) return;
  S.shifts=S.shifts.filter(x=>x.id!==sid); renderAll(); haptic('warn');
  sheets.slice().forEach(x=>x.close());
  offerUndo('Смена '+dayText(s.work_date)+' удалена',{
    onUndo:()=>{ S.shifts.push(s); renderAll(); toast('Смена возвращена'); },
    onCommit:async()=>{   // сообщение об отмене — пока смена еще в базе
      try{ await sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:'cancel'}}); }catch(_){}
      const {error}=await sb.from('shifts').delete().eq('id',sid); if(error){ S.shifts.push(s); renderAll(); return fail(error,'Не удалилась'); } }
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
  const list=freq(kind).slice(0,limit||40);
  return list.map(p=>'<button class="pp '+(sel.includes(p.id)?'on':'off')+'" data-pk="'+p.id+'" style="opacity:'+(sel.includes(p.id)?1:.55)+'"><div class="av">'+esc(initials(p.name))+'</div><div class="tm" style="color:var(--t1)">'+esc(p.name.slice(0,8))+'</div></button>').join('');
}
function plusSheet(){
  const sh=openSheet({detent:'half'});
  let selW=lastCrew(), selC=[];
  sh.push({title:'Новая смена', render(b){
    b.innerHTML='<span class="cap" style="margin-top:4px">Операторы</span><div class="people" data-kw>'+chipsPeople('w',selW)+'</div>'+
      '<span class="cap">Кастомеры — можно добавить по ходу</span><div class="people" data-kc>'+chipsPeople('c',selC,14)+
        '<button class="pp add" data-more><div class="av">+</div><div class="tm">ещё</div></button></div>'+
      '<button class="btn" data-start style="margin-top:22px"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>Начать <span class="num" data-now></span></button>'+
      '<button class="btn ghost" data-manual style="margin-top:6px">Записать прошедшую смену ›</button>';
    const now=b.querySelector('[data-now]'); const tk=()=>{ now.textContent=tHM(nowMs()); }; tk(); const iv=setInterval(()=>{ if(!b.isConnected) return clearInterval(iv); tk(); },5000);
    const tog=(arr,id)=>arr.includes(id)?arr.filter(x=>x!==id):arr.concat(id);
    b.querySelector('[data-kw]').onclick=e=>{ const p=e.target.closest('[data-pk]'); if(!p) return; haptic('soft'); selW=tog(selW,p.dataset.pk); sh.top().render(); };
    b.querySelector('[data-kc]').onclick=e=>{ const p=e.target.closest('[data-pk]'); if(p){ haptic('soft'); selC=tog(selC,p.dataset.pk); sh.top().render(); return; }
      if(e.target.closest('[data-more]')) pickPeople('c',null,id=>{ if(!selC.includes(id)) selC.push(id); },sh); };
    b.querySelector('[data-start]').disabled=!selW.length;
    b.querySelector('[data-start]').onclick=async function(){
      if(!liveReady()) return;
      this.disabled=true;
      const {data,error}=await sb.from('live_shifts').insert({worker_ids:selW}).select().single();
      if(error){ this.disabled=false; return fail(error,'Смена не началась'); }
      putLive(data);
      for(const cid of selC){ const r=await sb.rpc('live_player',{p_id:data.id,p_customer:cid,p_action:'sit'}); if(r.data&&r.data.id) putLive(r.data); }
      haptic('ok'); sh.close(); goTab('now'); liveIdx=liveRows().findIndex(x=>x.id===data.id); renderNow();
      const rb=document.querySelector('.lcard[data-live="'+data.id+'"] .ringbox');
      if(rb&&!reduce()) rb.animate([{transform:'scale(.3)',opacity:0},{transform:'scale(1.03)',opacity:1,offset:.7},{transform:'none',opacity:1}],{duration:520,easing:'cubic-bezier(.32,.72,0,1)'});
    };
    b.querySelector('[data-manual]').onclick=()=>{ sh.set('full'); manualLevel(sh,selW,selC); };
  }});
}
// выбор человека из списка с поиском; «Новый …» — сразу создать
function pickPeople(kind,l,onPick,host){
  const sh=host||openSheet({detent:'full'});
  const lv={title:kind==='c'?'Кастомеры':'Операторы', render(b){
    const have=l?(kind==='c'?l.customer_ids:l.worker_ids)||[]:[];
    b.innerHTML='<input type="search" data-q placeholder="Найти или вписать нового" style="margin-bottom:12px"><div class="list" data-l></div>';
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
      '<button class="btn sec" data-time>Поправить время</button>'+
      '<button class="btn red" data-rm style="margin-top:8px">Убрать из смены</button>';
    const pb=b.querySelector('[data-payer]');
    if(pb) pb.onclick=async()=>{ const {data,error}=await sb.from('live_shifts').update({payer_id:l.payer_id===pid?null:pid}).eq('id',lid).select().single();
      if(error) return fail(error); putLive(data); haptic('ok'); sh.close(); renderNow(); };
    b.querySelector('[data-time]').onclick=()=>{
      const log=(k==='c'?lLog(l):wLogOf(l)).filter(x=>x.id===pid);
      const cur=log[log.length-1];
      const s0=cur?Date.parse(cur.s):Date.parse(l.started_at);
      pickTime(sh,{title:'Сел / заступил в',value:s0,ref:s0,onPick:async ms=>{
        const all=(k==='c'?lLog(l):wLogOf(l)).slice();
        if(cur){ const i=all.lastIndexOf(cur); all[i]=Object.assign({},cur,{s:new Date(ms).toISOString()}); }
        else all.push({id:pid,s:new Date(ms).toISOString(),e:null});
        const {data,error}=await sb.from('live_shifts').update(k==='c'?{customer_log:all}:{worker_log:all}).eq('id',lid).select().single();
        if(error) return fail(error); putLive(data); haptic('ok'); sh.close(); renderNow(); }});
    };
    b.querySelector('[data-rm]').onclick=async()=>{
      const {data,error}=await sb.rpc(k==='c'?'live_player':'live_worker',k==='c'?{p_id:lid,p_customer:pid,p_action:'remove'}:{p_id:lid,p_worker:pid,p_action:'remove'});
      if(error) return fail(error); if(data&&data.id) putLive(data); haptic('warn'); sh.close(); renderNow(); };
  }});
}

/* ======================= ИТОГ СМЕНЫ ======================= */
// Один экран для конца живой смены, ручной записи прошедшей и правки записанной.
function manualLevel(sh,selW,selC){
  const end=Math.floor(nowMs()/300000)*300000, start=end-6*3600e3;
  const d={mode:'manual', start:start, end:end, pauses:[], discount:0, note:'',
    workers:selW.map(id=>({id:id,spans:null})), customers:selC.map(id=>({id:id,spans:null,paid:0})), payer:null};
  finishLevel(sh,d,'Прошедшая смена');
}
function finishSheet(d){ const sh=openSheet({detent:'full'}); finishLevel(sh,d); return sh; }
function editShift(sid){ const s=S.shifts.find(x=>x.id===sid); if(!s||!liveReady()) return; sheets.slice().forEach(x=>x.close()); setTimeout(()=>finishSheet(draftFromShift(s)),sheets.length?300:0); }
function finishLevel(sh,d,title){
  const lv={title:title||'Итог', render(b,me){
    const x=draftCalc(d), live=d.mode==='live', edit=d.mode==='edit';
    me.setTitle((title?'':'Смена · ')+x.h+' ч · '+m$(x.c.total));
    const tl=timelineHTML({start:d.start,end:d.end,pauses:x.pauses,
      rows:d.customers.map(p=>({name:cName(p.id),spans:p.spans||[{s:d.start,e:d.end}]})).concat(d.workers.map(p=>({name:wName(p.id),spans:p.spans||[{s:d.start,e:d.end}],w:1})))});
    const crow=cr=>{ const src=d.customers.find(p=>p.id===cr.customer_id), paidAll=cr.paid_amount>=cr.amount-0.004&&cr.amount>0.004, part=cr.paid_amount>0.004&&!paidAll;
      const covered=cr.paid_by&&cr.amount<=0.004;
      return '<div class="crow" data-c="'+cr.customer_id+'">'+avHTML(cName(cr.customer_id),'s')+'<div class="mid"><div class="nm">'+esc(cName(cr.customer_id))+(d.payer===cr.customer_id?' · за всех':'')+'</div>'+
        '<div class="sm">'+(covered?'платит '+esc(cName(cr.paid_by)):part?'заплатил '+m$(cr.paid_amount)+', долг '+m$(cr.amount-cr.paid_amount):(cr.covered>0.004?'свои '+m$(cr.share):''))+'</div></div>'+
        (covered?'':'<button class="a num" data-amt>'+m$(cr.amount)+'</button><div class="seg'+(paidAll||part?'':' debt')+'"><button data-paid aria-pressed="'+(paidAll||part)+'">'+(part?'Часть':'Заплатил')+'</button><button data-debt aria-pressed="'+!(paidAll||part)+'">Долг</button></div>')+'</div>'; };
    const paidNow=x.crows.reduce((a,c)=>a+c.paid_amount,0), debtNow=x.crows.reduce((a,c)=>a+Math.max(0,c.amount-c.paid_amount),0);
    b.innerHTML=
      '<div class="tl" style="margin-top:4px">'+tl+'</div>'+
      '<div class="timepair" style="margin-top:14px"><button data-t="s"><span>Начало</span><b class="num">'+tHM(d.start)+'</b> <span style="display:inline">'+dayText(khParts(d.start).d)+'</span></button>'+
        '<button data-t="e"><span>Конец</span><b class="num">'+tHM(d.end)+'</b> <span style="display:inline">'+dayText(khParts(d.end).d)+'</span></button></div>'+
      '<div class="note" style="text-align:center">отсижено '+clockHM(x.played)+' → к оплате '+x.h+' '+hourWord(x.h)+'</div>'+
      '<span class="cap">Паузы — не оплачиваются</span><div class="card" style="padding:4px 14px">'+
        (d.pauses.length?d.pauses.map((p,i)=>'<div class="prow"><button class="w num" data-ps="'+i+'" style="text-align:left">'+tHM(p.s)+' – '+(p.e?tHM(p.e):'…')+'</button><span class="d">'+(p.e?pauseText(Math.round((p.e-p.s)/60000))||'<1 мин':'')+'</span><button class="del" data-pd="'+i+'">✕</button></div>').join(''):'<div class="prow"><span class="w t3">Пауз не было</span></div>')+
        '<div class="prow"><button class="w t2" data-padd style="text-align:left">+ Пауза</button></div></div>'+
      '<span class="cap">Кастомеры</span><div class="card" style="padding:2px 14px">'+
        (x.crows.length?x.crows.map(crow).join(''):'<div class="prow"><span class="w t3">Впиши, кто сидел — без этого не рассчитаться</span></div>')+
        '<div class="prow"><button class="w t2" data-cadd style="text-align:left">+ Кастомер</button>'+(x.crows.length>1?'<button class="pill" data-allpaid>Все заплатили</button>':'')+'</div></div>'+
      (d.customers.length>1?'<span class="cap">Один платит за всех, кто сидел с ним</span><div class="pills">'+
        '<button class="pill" data-payer="" aria-pressed="'+!d.payer+'">Никто</button>'+d.customers.map(p=>'<button class="pill" data-payer="'+p.id+'" aria-pressed="'+(d.payer===p.id)+'">'+esc(cName(p.id))+'</button>').join('')+'</div>':'')+
      '<span class="cap">Операторы</span><div class="card" style="padding:2px 14px">'+
        x.wrows.map(w=>{ const sp=(d.workers.find(p=>p.id===w.worker_id)||{}).spans;
          return '<div class="crow">'+avHTML(wName(w.worker_id),'s')+'<div class="mid"><div class="nm">'+esc(wName(w.worker_id))+'</div><div class="sm">'+(sp?sp.map(p=>tHM(p.s)+'–'+tHM(p.e)).join(', '):'вся смена')+'</div></div><b class="num" style="font-weight:500">'+m$(w.share)+'</b></div>'; }).join('')+
        '<div class="prow"><button class="w t2" data-wadd style="text-align:left">+ Оператор</button></div></div>'+
      '<span class="cap">Скидка и заметка</span>'+
      '<div style="display:flex;gap:10px"><input data-disc inputmode="decimal" placeholder="Скидка, $" value="'+(d.discount?String(d.discount).replace('.',','):'')+'" style="flex:0 0 120px"><input data-note placeholder="Заметка" value="'+esc(d.note)+'"></div>'+
      '<div class="flowline">'+(paidNow>0.004?'Заплатили '+m$(paidNow)+' → <b>кассе '+m$(x.now.kassa)+'</b>'+Object.keys(x.now.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(x.now.w[k])+'</b>').join(''):'')+
        (debtNow>0.004?(paidNow>0.004?'<br>':'')+'В долг: <b style="color:var(--debt)">'+m$(debtNow)+'</b>':'')+'</div>'+
      '<button class="btn" data-save style="margin-top:14px">'+(edit?'Сохранить изменения':'Сохранить')+'</button>'+
      (live?'<button class="btn ghost" data-back>Вернуться к смене</button><button class="btn red" data-drop>Отменить смену без записи</button>':'')+
      (edit?'<button class="btn red" data-delsh>Удалить смену</button>':'');
    // время смены
    b.querySelectorAll('[data-t]').forEach(t=>t.onclick=()=>{
      const k=t.dataset.t; pickTime(sh,{title:k==='s'?'Начало':'Конец',value:k==='s'?d.start:d.end,ref:k==='s'?d.start:d.end,days:d.mode!=='live',
        onPick:ms=>{ const old=k==='s'?d.start:d.end;
          if(k==='s'){ if(ms>=d.end) return toast('Начало позже конца',true); d.start=ms; } else { if(ms<=d.start) return toast('Конец раньше начала',true); d.end=ms; }
          // кто был до конца — и дальше до конца; кто пришел с начала — с нового начала
          [...d.workers,...d.customers].forEach(p=>{ if(!p.spans) return; p.spans=p.spans.map(z=>({s:z.s===old&&k==='s'?ms:z.s, e:z.e===old&&k==='e'?ms:z.e})); });
        }});
    });
    b.querySelectorAll('[data-ps]').forEach(t=>t.onclick=()=>{
      const i=Number(t.dataset.ps), p=d.pauses[i];
      pickTime(sh,{title:'Пауза — начало',value:p.s,ref:p.s,onPick:s=>pickTime(sh,{title:'Пауза — конец',value:p.e||s+15*60e3,ref:p.e||s,onPick:e=>{
        if(e<=s) return toast('Конец паузы раньше начала',true); d.pauses[i]={s:s,e:e}; }})});
    });
    b.querySelectorAll('[data-pd]').forEach(t=>t.onclick=()=>{ haptic('warn'); d.pauses.splice(Number(t.dataset.pd),1); me.render(); });
    b.querySelector('[data-padd]').onclick=()=>{ const e=d.end, s=Math.max(d.start,e-15*60e3); d.pauses.push({s:s,e:e}); haptic('tap'); me.render(); };
    // кастомеры: заплатил / долг / часть
    b.querySelectorAll('[data-c]').forEach(function(r){
      const id=r.dataset.c, src=d.customers.find(p=>p.id===id), cr=x.crows.find(c=>c.customer_id===id);
      const pd=r.querySelector('[data-paid]'), db=r.querySelector('[data-debt]'), am=r.querySelector('[data-amt]');
      if(pd) pd.onclick=()=>{ haptic('soft'); src.paid='all'; me.render(); };
      if(db) db.onclick=()=>{ haptic('soft'); src.paid=0; me.render(); };
      if(am) am.onclick=()=>pickAmount(sh,{title:cName(id)+' заплатил',lead:'По смене '+m$(cr.amount)+'. Впиши, сколько отдал сейчас — остаток уйдет в долг.',
        value:cr.paid_amount||cr.amount,max:cr.amount,quick:[{l:'½',v:cr.amount/2},{l:'всё',v:cr.amount},{l:'0',v:0}],onPick:v=>{ src.paid=v>=cr.amount-0.004?'all':v; }});
      longPress(r,()=>{ d.customers=d.customers.filter(p=>p.id!==id); if(d.payer===id) d.payer=null; me.render(); toast(cName(id)+' убран'); });
    });
    const ap=b.querySelector('[data-allpaid]'); if(ap) ap.onclick=()=>{ haptic('ok'); d.customers.forEach(p=>p.paid='all'); me.render(); };
    b.querySelector('[data-cadd]').onclick=()=>pickPeople('c',{customer_ids:d.customers.map(p=>p.id)},id=>{ d.customers.push({id:id,spans:null,paid:0}); },sh);
    b.querySelector('[data-wadd]').onclick=()=>pickPeople('w',{worker_ids:d.workers.map(p=>p.id)},id=>{ d.workers.push({id:id,spans:null}); },sh);
    b.querySelectorAll('[data-payer]').forEach(p=>p.onclick=()=>{ haptic('pick'); d.payer=p.dataset.payer||null; me.render(); });
    const disc=b.querySelector('[data-disc]'); disc.onchange=()=>{ d.discount=Math.max(0,parseAmt(disc.value)); me.render(); };
    const note=b.querySelector('[data-note]'); note.oninput=()=>{ d.note=note.value; };
    b.querySelector('[data-save]').onclick=function(){ d.note=note.value; d.discount=Math.max(0,parseAmt(disc.value)); saveDraft(sh,d,this); };
    const bk=b.querySelector('[data-back]'); if(bk) bk.onclick=async()=>{
      const l=(S.live||[]).find(z=>z.id===d.liveId);
      if(l&&l.finished_at && !await ask('Смена продолжится. Время с '+tHM(Date.parse(l.finished_at))+' до сейчас тоже пойдёт в оплату. Вернуться к смене?')) return;
      const {data,error}=await sb.rpc('live_action',{p_id:d.liveId,p_action:'unfinish'}); if(error) return fail(error);
      if(data&&data.id) putLive(data); haptic('ok'); sh.close(); renderNow(); };
    const dr=b.querySelector('[data-drop]'); if(dr) dr.onclick=()=>{
      const l=(S.live||[]).find(z=>z.id===d.liveId); if(!l) return;
      S.live=S.live.filter(z=>z.id!==d.liveId); sh.close(); renderNow(); haptic('warn');
      offerUndo('Смена отменена без записи',{onUndo:()=>{ S.live.push(l); renderNow(); },
        onCommit:async()=>{ const {error}=await sb.from('live_shifts').delete().eq('id',l.id); if(error){ S.live.push(l); renderNow(); fail(error,'Не удалилась'); } }});
    };
    const ds=b.querySelector('[data-delsh]'); if(ds) ds.onclick=()=>deleteShift(d.shiftId);
  }, onBack(){ lv._lvl&&lv._lvl.render(); }};
  lv._lvl=sh.push(lv);
}
async function saveDraft(sh,d,btn){
  const x=draftCalc(d);
  if(x.h<1) return toast('Меньше 30 минут — записывать нечего',true);
  if(!d.workers.length) return toast('Нужен хотя бы один оператор',true);
  if(!d.customers.length) return toast('Впиши кастомеров — без них не рассчитаться',true);
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
      const u=await sb.from('live_shifts').update(patch).eq('id',d.liveId);
      if(u.error) return fail(u.error,'Не сохранилось');
      const {data:sid,error}=await sb.rpc('save_live_shift',{p_live:d.liveId,p_shift:x.row,
        p_workers:x.wrows.map(w=>({id:w.worker_id,share:w.share,spans:w.spans})),
        p_customers:x.crows.map(c=>({id:c.customer_id,amount:c.amount,share:c.share,spans:c.spans,paid_by:c.paid_by,paid_amount:c.paid_amount}))});
      if(error) return fail(error,'Не записалось');
      sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:'new'}}).catch(function(){});
    } else {
      const edit=d.mode==='edit', sid=edit?d.shiftId:newId();
      const crows=x.crows.map(c=>({customer_id:c.customer_id,amount:c.amount,share:c.share,spans:c.spans,paid_by:c.paid_by,paid_amount:c.paid_amount}));
      if(!online()){
        if(edit) return toast('Правка — только со связью',true);
        enqueue({t:'shift',sid:sid,row:x.row,wrows:x.wrows,crows:crows}); applyPending(); renderAll(); sh.close(); showDone(); toast('Нет сети — смена уйдёт, когда связь появится'); return;
      }
      const {error}=await sb.rpc('save_shift',{p_id:sid,p_shift:x.row,p_workers:x.wrows,p_customers:crows,p_edit:edit});
      if(error) return fail(error,edit?'Изменения не сохранены':'Смена не записана');
      if(!edit){ const pays=crows.filter(c=>c.paid_amount>0.004).map(c=>({customer_id:c.customer_id,amount:c.paid_amount,alloc:[{shift_id:sid,amount:c.paid_amount}],note:'при сохранении смены'}));
        if(pays.length) sb.from('payments').insert(pays).then(function(){}); }
      sb.functions.invoke('notify-shift',{body:{shift_id:sid,mode:edit?'edit':'new'}}).catch(function(){});
    }
    sh.close(); showDone(); await reload(); goTab('now');
  } finally { btn.disabled=false; }
}
// лента времени: шкала часов, паузы, полоски людей
function timelineHTML(o){
  const W=Math.max(1,o.end-o.start), pc=v=>Math.max(0,Math.min(100,(v-o.start)/W*100)).toFixed(2);
  const bars=(spans,cls)=>(spans||[]).map(z=>'<i class="'+(cls||'')+'" style="left:'+pc(z.s)+'%;width:'+Math.max(.8,pc(z.e)-pc(z.s)).toFixed(2)+'%"></i>').join('');
  const holes=(o.pauses||[]).map(p=>'<i class="p" style="left:'+pc(p.s)+'%;width:'+Math.max(.6,pc(p.e)-pc(p.s)).toFixed(2)+'%"></i>').join('');
  const ticks=[0,.25,.5,.75,1].map(k=>tHM(o.start+W*k));
  return '<div class="ax">'+ticks.map(t=>'<span class="num">'+t+'</span>').join('')+'</div>'+
    '<div class="ln main"><span>смена</span><div class="tr">'+bars([{s:o.start,e:o.end}])+holes+'</div></div>'+
    (o.rows||[]).map(r=>'<div class="ln"><span>'+esc(r.name)+'</span><div class="tr">'+bars(r.spans,r.w?'w':'')+holes+'</div></div>').join('');
}

/* ======================= РАСЧЁТ ======================= */
// Кастомер платит: по умолчанию весь долг; можно вписать свою сумму. Видно, что закроется и кому сколько.
function settleSheet(cid){
  const d=debts().find(x=>x.id===cid); if(!d) return toast(cName(cid)+' ничего не должен');
  const sh=openSheet({detent:'full'}); let amt=d.total;
  sh.push({title:cName(cid)+' платит', render(b){
    const pv=allocPreview(cid,amt);
    b.innerHTML='<button class="amtbig edit" data-amt style="width:100%">'+moneyHTML(amt)+'</button>'+
      '<div class="quick"><button data-q="100">100</button><button data-q="200">200</button><button data-q="'+r2(d.total/2)+'">½</button><button data-q="'+d.total+'">всё</button></div>'+
      '<div class="card alloc">'+pv.items.map(it=>'<div class="kv"><span>'+(it.rest>0.004?'◐ ':'✓ ')+dayText(it.s.work_date)+' · '+m$(it.due)+'</span><b>'+(it.rest>0.004?'останется '+m$(it.rest):'закрыта')+'</b></div>').join('')+'</div>'+
      '<div class="flowline">→ <b>кассе '+m$(pv.split.kassa)+'</b>'+Object.keys(pv.split.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(pv.split.w[k])+'</b>').join('')+'</div>'+
      (locked?'':sliderHTML('протяни — получил '+m$(amt),'data-go'))+
      '<button class="btn ghost" data-prof style="margin-top:8px">Профиль ›</button>';
    b.querySelector('[data-amt]').onclick=()=>pickAmount(sh,{title:'Сколько отдал',value:amt,max:d.total,quick:[{l:'100',v:100},{l:'200',v:200},{l:'½',v:d.total/2},{l:'всё',v:d.total}],onPick:v=>{ amt=v>0?v:d.total; }});
    b.querySelector('.quick').onclick=e=>{ const q=e.target.closest('[data-q]'); if(!q) return; haptic('pick'); amt=Math.min(d.total,Number(q.dataset.q)); sh.top().render(); };
    b.querySelector('[data-prof]').onclick=()=>{ sh.close(); setTimeout(()=>profileSheet('c',cid),200); };
    const sl=b.querySelector('[data-go]'); if(sl) bindSlider(sl,async()=>{
      if(!liveReady()) return;
      const {data,error}=await sb.rpc('settle',{p_customer:cid,p_amount:amt}); if(error) return fail(error,'Не рассчиталось');
      sh.close(); showDone(); await reload();
      offerUndo('Рассчитали '+cName(cid)+' · '+m$(amt),{onUndo:async()=>{ const r=await sb.rpc('unsettle',{p_payment:data.id}); if(r.error) return fail(r.error); await reload(); toast('Расчёт отменён'); }});
    });
  }, onBack(){ sh.top().render(); }});
}
// расчёт одной смены: все, кто по ней должен
function settleShiftSheet(sid){
  const s=S.shifts.find(x=>x.id===sid); if(!s) return;
  const owing=(s.custLinks||[]).filter(l=>due(l)>0.004); if(!owing.length) return toast('По смене всё рассчитано');
  if(owing.length===1){ return settleOneInShift(s,owing[0]); }
  const sh=openSheet({detent:'half'}); const pick={}; owing.forEach(l=>pick[l.id]=true);
  sh.push({title:'Расчёт · '+dayText(s.work_date), render(b){
    const sum=owing.filter(l=>pick[l.id]).reduce((a,l)=>a+due(l),0), sp=owing.filter(l=>pick[l.id]).reduce((acc,l)=>addSplit(acc,chunkSplit(s,due(l))),{kassa:0,w:{}});
    b.innerHTML='<div class="card" style="padding:2px 14px">'+owing.map(l=>'<div class="crow">'+avHTML(cName(l.id),'s')+'<div class="mid"><div class="nm">'+esc(cName(l.id))+'</div></div><b class="num">'+m$(due(l))+'</b>'+
      '<div class="seg"><button data-on="'+l.id+'" aria-pressed="'+!!pick[l.id]+'">Заплатил</button></div></div>').join('')+'</div>'+
      '<div class="flowline">'+m$(sum)+' → <b>кассе '+m$(sp.kassa)+'</b>'+Object.keys(sp.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(sp.w[k])+'</b>').join('')+'</div>'+
      sliderHTML('протяни — получил '+m$(sum),'data-go');
    b.querySelectorAll('[data-on]').forEach(x=>x.onclick=()=>{ haptic('soft'); pick[x.dataset.on]=!pick[x.dataset.on]; sh.top().render(); });
    bindSlider(b.querySelector('[data-go]'),async()=>{
      if(!liveReady()) return; const ids=owing.filter(l=>pick[l.id]); if(!ids.length) return;
      const done=[];
      for(const l of ids){ const {data,error}=await sb.rpc('settle',{p_customer:l.id,p_amount:due(l),p_shift:s.id}); if(error){ fail(error); break; } done.push(data.id); }
      sh.close(); showDone(); await reload();
      if(done.length) offerUndo('Смена '+dayText(s.work_date)+' рассчитана',{onUndo:async()=>{ for(const p of done) await sb.rpc('unsettle',{p_payment:p}); await reload(); toast('Расчёт отменён'); }});
    });
  }});
}
function settleOneInShift(s,l){
  const sh=openSheet({detent:'half'}); let amt=due(l);
  sh.push({title:cName(l.id)+' · '+dayText(s.work_date), render(b){
    const sp=chunkSplit(s,amt);
    b.innerHTML='<button class="amtbig edit" data-amt style="width:100%">'+moneyHTML(amt)+'</button>'+
      '<div class="flowline">→ <b>кассе '+m$(sp.kassa)+'</b>'+Object.keys(sp.w).map(k=>' · <b>'+esc(wName(k))+' '+m$(sp.w[k])+'</b>').join('')+'</div>'+
      sliderHTML('протяни — получил','data-go');
    b.querySelector('[data-amt]').onclick=()=>pickAmount(sh,{title:'Сколько отдал',value:amt,max:due(l),quick:[{l:'½',v:due(l)/2},{l:'всё',v:due(l)}],onPick:v=>{ amt=v>0?v:due(l); }});
    bindSlider(b.querySelector('[data-go]'),async()=>{
      if(!liveReady()) return;
      const {data,error}=await sb.rpc('settle',{p_customer:l.id,p_amount:amt,p_shift:s.id}); if(error) return fail(error);
      sh.close(); showDone(); await reload();
      offerUndo('Рассчитали '+cName(l.id)+' · '+m$(amt),{onUndo:async()=>{ await sb.rpc('unsettle',{p_payment:data.id}); await reload(); toast('Расчёт отменён'); }});
    });
  }, onBack(){ sh.top().render(); }});
}
function debtsSheet(){
  const sh=openSheet({detent:'half'});
  sh.push({title:'Должны', render(b){
    const dl=debts();
    b.innerHTML=dl.length?'<div class="list">'+dl.map(d=>'<button class="row" data-c="'+d.id+'" style="width:100%;text-align:left">'+avHTML(cName(d.id),'s')+'<div class="mid"><div class="nm">'+esc(cName(d.id))+'</div><div class="sm">'+d.items.length+' '+plural(d.items.length,'смена','смены','смен')+'</div></div><div class="amt">'+moneyHTML(d.total)+'</div></button>').join('')+'</div>':'<div class="empty">Все рассчитаны ✓</div>';
    b.querySelectorAll('[data-c]').forEach(r=>r.onclick=()=>{ sh.close(); setTimeout(()=>settleSheet(r.dataset.c),220); });
  }});
}
function paymentSheet(pid){
  const p=(S.payments||[]).find(x=>x.id===pid); if(!p) return;
  const sh=openSheet({detent:'half'});
  sh.push({title:cName(p.customer_id)+' заплатил', render(b){
    b.innerHTML='<div class="amtbig">'+moneyHTML(p.amount)+'</div><div class="note" style="text-align:center">'+dayLabel(khParts(Date.parse(p.created_at)).d)+', '+tHM(Date.parse(p.created_at))+'</div>'+
      '<div class="card alloc">'+(p.alloc||[]).map(a=>{ const s=S.shifts.find(x=>x.id===a.shift_id); return '<div class="kv"><span>'+(s?dayText(s.work_date)+' · смена '+m$(s.total):'смена удалена')+'</span><b>'+m$(a.amount)+'</b></div>'; }).join('')+'</div>'+
      (locked?'':'<button class="btn red" data-un style="margin-top:12px">Отменить этот расчёт</button>');
    const un=b.querySelector('[data-un]'); if(un) un.onclick=async()=>{ if(!await ask('Отменить расчёт '+m$(p.amount)+'? Долг вернётся.')) return;
      const {error}=await sb.rpc('unsettle',{p_payment:p.id}); if(error) return fail(error); sh.close(); haptic('ok'); await reload(); toast('Расчёт отменён'); };
  }});
}

/* ======================= СМЕНА ПОДРОБНО ======================= */
function shiftSheet(sid,fromEl){
  const s=S.shifts.find(x=>x.id===sid); if(!s) return;
  if(fromEl && !reduce()){   // карточка вырастает в панель
    const r=fromEl.getBoundingClientRect(), g=fromEl.cloneNode(true);
    Object.assign(g.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',zIndex:45,borderRadius:'22px',background:'var(--card)',pointerEvents:'none'});
    document.body.appendChild(g);
    g.animate([{transform:'none',opacity:1},{transform:'translateY('+(innerHeight*0.12-r.top)+'px) scale(1.04)',opacity:0}],{duration:360,easing:'cubic-bezier(.32,.72,0,1)'}).onfinish=()=>g.remove();
  }
  const sh=openSheet({detent:'full'});
  sh.push({title:dayLabel(s.work_date)+(s.start_time?', '+hhmm(s.start_time)+'–'+tHM(shiftEndMs(s)):''), render(b){
    const st=shiftStatus(s), ls=s.custLinks||[], dsum=ls.reduce((a,l)=>a+due(l),0);
    const flow='<div class="flow" data-flow><div class="col">'+(ls.length?ls.map(l=>'<div class="nd'+(due(l)>0.004?' debt':'')+'"><b class="num">'+m$(l.amount)+'</b>'+esc(cName(l.id))+(l.paid_by&&l.amount<=0.004?' · платит '+esc(cName(l.paid_by)):due(l)>0.004?(l.paidAmt>0.004?' · долг '+m$(due(l)):' · долг'):'')+'</div>').join(''):'<div class="nd">без кастомеров</div>')+'</div><div></div>'+
      '<div class="col r"><div class="nd"><b class="num">'+m$(s.kassa)+'</b>касса</div>'+s.workerIds.map(id=>'<div class="nd"><b class="num">'+m$(workerShare(s,id))+'</b>'+esc(wName(id))+'</div>').join('')+'</div><svg></svg></div>';
    b.innerHTML='<div class="hero" style="text-align:center"><div class="v">'+moneyHTML(s.total)+'</div><div class="s"><span class="dot '+st+'"></span> '+
        (st==='ok'?'рассчитано':st==='debt'?'долг '+m$(dsum):'кастомеры не вписаны')+' · '+s.hours+' '+hourWord(s.hours)+(s.discount?' · скидка '+m$(s.discount):'')+'</div></div>'+
      (st==='debt'&&!locked?'<button class="btn" data-settle style="margin-top:14px">Рассчитать</button>':'')+
      '<span class="cap">Куда ушли деньги</span>'+flow+
      (s.start_time?'<span class="cap">Лента</span><div class="tl">'+timelineHTML({start:shiftStart(s),end:shiftEndMs(s),pauses:pauseSpans(s.pause_log).filter(p=>p.e),
        rows:ls.map(l=>({name:cName(l.id),spans:pauseSpans(l.spans).filter(p=>p.e).length?pauseSpans(l.spans).filter(p=>p.e):[{s:shiftStart(s),e:shiftEndMs(s)}]}))
          .concat((s.workerLinks&&s.workerLinks.length?s.workerLinks:s.workerIds.map(id=>({id:id,spans:[]}))).map(w=>({name:wName(w.id),w:1,spans:pauseSpans(w.spans).filter(p=>p.e).length?pauseSpans(w.spans).filter(p=>p.e):[{s:shiftStart(s),e:shiftEndMs(s)}]})))})+'</div>':'')+
      '<span class="cap">Подробности</span><div class="card" style="padding:6px 14px">'+
        (s.pause_min?'<div class="kv"><span>Паузы</span><b>'+pauseText(s.pause_min)+'</b></div>'+(pauseSpans(s.pause_log).filter(p=>p.e).length?'<div class="note" style="margin:0 4px 6px">'+pauseSpans(s.pause_log).filter(p=>p.e).map(p=>tHM(p.s)+'–'+tHM(p.e)).join(', ')+'</div>':''):'')+
        (s.discount?'<div class="kv"><span>Скидка</span><b>'+m$(s.discount)+'</b></div>':'')+
        (s.note?'<div class="kv"><span>Заметка</span><b style="text-align:right;max-width:70%">'+esc(s.note)+'</b></div>':'')+
        '<div class="kv"><span>Записано</span><b>'+(s.created_at?dayText(khParts(Date.parse(s.created_at)).d)+', '+tHM(Date.parse(s.created_at)):'—')+'</b></div></div>'+
      (locked||s.pending?'':'<button class="btn sec" data-edit style="margin-top:16px">Изменить</button>')+
      '<button class="btn ghost" data-copy>Скопировать текст</button>';
    const se=b.querySelector('[data-settle]'); if(se) se.onclick=()=>{ sh.close(); setTimeout(()=>settleShiftSheet(sid),220); };
    const ed=b.querySelector('[data-edit]'); if(ed) ed.onclick=()=>editShift(sid);
    b.querySelector('[data-copy]').onclick=()=>copyShift(s);
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
function profileSheet(k,id){
  const sh=openSheet({detent:'full'});
  sh.push({title:k==='c'?cName(id):wName(id), render(b){
    const from=today().slice(0,7)+'-01';
    const mine=S.shifts.filter(s=>(k==='c'?s.customerIds:s.workerIds).includes(id));
    const month=mine.filter(s=>s.work_date>=from);
    let h='<div style="display:flex;justify-content:center;margin:6px 0 10px">'+avHTML(k==='c'?cName(id):wName(id)).replace('class="av ','class="av " style="width:72px;height:72px;font-size:24px" ')+'</div>';
    if(k==='c'){
      const d=debts().find(x=>x.id===id);
      const brought=month.reduce((a,s)=>{ const l=(s.custLinks||[]).find(x=>x.id===id); return a+(l?(l.share!=null?l.share:l.amount):0); },0);
      const co={}; mine.forEach(s=>s.customerIds.forEach(o=>{ if(o!==id) co[o]=(co[o]||0)+1; }));
      const top=Object.keys(co).sort((a,b)=>co[b]-co[a]).slice(0,3);
      h+='<div class="hero" style="text-align:center"><div class="lbl">'+(d?'Должен':'Долгов нет ✓')+'</div>'+(d?'<div class="v">'+moneyHTML(d.total)+'</div>':'')+'</div>'+
        (d&&!locked?'<button class="btn" data-settle style="margin-top:12px">Рассчитать</button>':'')+
        '<span class="cap">Этот месяц</span><div class="card"><div class="kv"><span>Смен</span><b>'+month.length+'</b></div><div class="kv"><span>Часов</span><b>'+month.reduce((a,s)=>a+s.hours,0)+'</b></div><div class="kv"><span>Принёс</span><b>'+m$(brought)+'</b></div>'+
        (top.length?'<div class="kv"><span>Обычно с</span><b>'+top.map(cName).map(esc).join(', ')+'</b></div>':'')+'</div>';
    } else {
      const wk=weekStart(), earnW=mine.filter(s=>s.work_date>=wk).reduce((a,s)=>a+(Number(workerShare(s,id))||0),0), earnM=month.reduce((a,s)=>a+(Number(workerShare(s,id))||0),0);
      const w=S.workers.find(x=>x.id===id)||{};
      h+='<span class="cap">Заработано</span><div class="card"><div class="kv"><span>Эта неделя</span><b>'+m$(earnW)+'</b></div><div class="kv"><span>Этот месяц</span><b>'+m$(earnM)+'</b></div><div class="kv"><span>Часов за месяц</span><b>'+month.reduce((a,s)=>a+s.hours,0)+'</b></div>'+
        '<div class="kv"><span>Telegram</span><b>'+(w.tg_id?'привязан':'не привязан')+'</b></div></div>';
    }
    h+='<span class="cap">Смены</span>'+(mine.length?mine.slice(0,30).map(shiftCardHTML).join(''):'<div class="empty">Смен пока нет</div>');
    b.innerHTML=h;
    const se=b.querySelector('[data-settle]'); if(se) se.onclick=()=>{ sh.close(); setTimeout(()=>settleSheet(id),220); };
    b.querySelectorAll('[data-shift]').forEach(w=>{ w.querySelector('.face').onclick=()=>{ sh.close(); setTimeout(()=>shiftSheet(w.dataset.shift),220); }; });
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
      '<div class="list plain" style="margin-top:14px">'+row('tariff','Тариф','100 × 3, дальше 50')+(locked?'':row('hand','Ручная выдача',''))+row('exp','Выгрузка','')+'</div>'+
      '<div class="list plain" style="margin-top:14px">'+row('me',user?(isOwner?'Владелец':'Можно править'):'Вход владельца',user&&!tgAccount(user)?esc(user.email||''):'')+row('about','О версии',APP_VERSION)+'</div>';
    b.querySelectorAll('[data-lv]').forEach(r=>r.onclick=()=>{ haptic('tap'); ({w:()=>peopleLevel(sh,'w'),c:()=>peopleLevel(sh,'c'),acc:()=>accessLevel(sh),chats:()=>chatsLevel(sh),
      tariff:()=>tariffLevel(sh),hand:()=>manualIssueLevel(sh),exp:()=>exportLevel(sh),me:()=>meLevel(sh),about:()=>aboutLevel(sh)})[r.dataset.lv](); });
  }});
  return sh;
}
function peopleLevel(sh,k){
  sh.push({title:k==='w'?'Операторы':'Кастомеры', render(b){
    const list=(k==='w'?S.workers:S.customers).slice().sort((a,b)=>(b.active!==false)-(a.active!==false)||String(a.name).localeCompare(b.name));
    b.innerHTML=(locked?'':'<div style="display:flex;gap:8px;margin-bottom:12px"><input data-new placeholder="'+(k==='w'?'Новый оператор':'Новый кастомер')+'"><button class="pill" data-add style="height:48px">Добавить</button></div>')+
      '<div class="list">'+list.map(p=>'<div class="row" data-id="'+p.id+'" style="opacity:'+(p.active===false?.45:1)+'">'+avHTML(p.name,'s')+'<div class="mid"><div class="nm">'+esc(p.name)+(p.is_me?' · это я':'')+'</div>'+
        (p.active===false?'<div class="sm">в архиве</div>':'')+'</div>'+
        (locked?'':(k==='w'&&isOwner?'<button class="pill" data-tg aria-pressed="'+!!p.tg_id+'">TG</button>':'')+'<button class="pill" data-ren>✎</button><button class="pill" data-arc>'+(p.active===false?'вернуть':'в архив')+'</button>')+'</div>').join('')+'</div>'+
      '<div class="note">Архив прячет человека из выбора, старые смены остаются как были.</div>';
    const T=k==='w'?'workers':'customers';
    const add=b.querySelector('[data-add]'); if(add) add.onclick=async()=>{ const n=b.querySelector('[data-new]').value.trim(); if(!n) return;
      const {error}=await sb.from(T).insert({name:n}); if(error) return fail(error); haptic('ok'); await reload(); sh.top().render(); };
    b.querySelectorAll('[data-id]').forEach(r=>{ const id=r.dataset.id, p=list.find(x=>x.id===id);
      const rn=r.querySelector('[data-ren]'); if(rn) rn.onclick=async()=>{ const n=prompt('Новое имя',p.name); if(!n||!n.trim()) return;
        const {error}=await sb.from(T).update({name:n.trim()}).eq('id',id); if(error) return fail(error); haptic('ok'); await reload(); sh.top().render(); };
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
      (error?'<div class="empty">Не удалось загрузить</div>':(data||[]).length?'<div class="list">'+data.map(c=>'<div class="row"><div class="mid"><div class="nm">'+esc(c.title||('чат '+c.chat_id))+'</div><div class="sm">'+esc(String(c.chat_id))+'</div></div></div>').join('')+'</div>':'<div class="empty">Чатов нет</div>');
  }});
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
  sh.push({title:'Ручная выдача', render(b){
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
async function download(name,text,mime){
  if(TG){
    toast('Отправляю файл в чат с ботом…');
    try{ const {data,error}=await sb.functions.invoke('send-file',{body:{initData:TG.initData,name:name,text:text}});
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
      '<div class="note">Это новая версия учёта. Прежняя по-прежнему открывается и работает с теми же данными.</div>'+
      '<a class="btn sec" href="../'+location.hash+'" style="margin-top:14px;text-decoration:none">Открыть прежнюю версию</a>';
  }});
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
  el.querySelector('[data-login]').onclick=()=>{ el.classList.remove('on'); meLevel(openSheet({detent:'half'})); };
}

/* ======================= ЗАПУСК ======================= */
function renderOffbar(){
  const el=$('#offbar'), n=queue.length;
  if(online() && !n && !offlineData){ el.classList.remove('on'); return; }
  el.textContent=!online()?'Нет сети — запишется, когда появится'+(n?' · в очереди '+n:''):n?'Отправляю '+n+'…':'Показаны данные из памяти';
  el.classList.add('on');
}
window.addEventListener('online',async()=>{ renderOffbar(); if(await flushQueue()) await reload(); });
window.addEventListener('offline',renderOffbar);
function renderAll(){
  document.body.classList.toggle('ro',locked);
  renderNow(); renderHist(); renderOffbar();
  const live=(S.live||[]).some(l=>!l.finished_at);
  document.querySelector('#nav .nt[data-tab="now"]').classList.toggle('live',live);
}
let reloadT=null;
async function reload(){
  try{ await loadAll(); saveCache(); }catch(e){ if(e&&e.gate) return closeGate(e.gate); }
  renderAll();
  sheets.forEach(s=>{ const t=s.top(); if(t&&t.spec.live) t.render(); });
}
function scheduleReload(){ clearTimeout(reloadT); reloadT=setTimeout(reload,500); }
let started=false;
async function boot(){
  loadQueue();
  if(!S.shifts.length && loadCache()){ booting=false; renderAll(); }   // сразу из памяти — без заставки
  try{
    try{ await refreshAuth(); }catch(_){}
    await loadAll(); saveCache();
  }catch(e){
    if(e && e.gate){ closeGate(e.gate); return; }
    if(!loadCache()){ booting=false; $('#scrNow').innerHTML='<div class="empty" style="margin-top:40vh">Не удалось связаться с базой.<br>Проверь интернет и открой заново.</div>'; return; }
    applyPending();
  }
  $('#gate').classList.remove('on');
  booting=false; renderAll();
  if(await flushQueue()) await reload();
  if(!started){
    started=true;
    // кто смотрит без правки, не подписан на изменения базы — освежаем раз в минуту
    setInterval(()=>{ if(!document.hidden && !canWrite && TG) scheduleReload(); },60000);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleReload(); });
    try{ if(canWrite) sb.channel('uchet2').on('postgres_changes',{event:'*',schema:'public'},scheduleReload).subscribe(); }catch(_){}
  }
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
