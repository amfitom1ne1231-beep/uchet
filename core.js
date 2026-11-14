// Учёт 2.0 — ядро: база, Telegram, время, расчет, загрузка и офлайн-очередь. Интерфейс — в app.js.
'use strict';
/* ======================= НАСТРОЙКИ ======================= */
const SUPABASE_URL = 'https://hhpccssygoptrlipdjnx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wwqsa5n-i8kZL5_uaCr6QA_UW53PtS6';

const mem={};
const safeStorage={
  getItem:k=>{ try{ return localStorage.getItem(k); }catch(e){ return k in mem?mem[k]:null; } },
  setItem:(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){ mem[k]=v; } },
  removeItem:k=>{ try{ localStorage.removeItem(k); }catch(e){ delete mem[k]; } }
};
const sb = window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,storage:safeStorage}
});

/* ======================= TELEGRAM ======================= */
// Внутри Telegram есть initData; в обычном браузере его нет — тогда работаем как сайт.
const TG = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) ? Telegram.WebApp : null;
const tgv = v => !!TG && TG.isVersionAtLeast(v);
const tgTry = f => { try{ f(); }catch(e){} };
if(TG){
  TG.ready(); TG.expand();
  if(tgv('6.9')) tgTry(()=>TG.setHeaderColor('#000000'));
  if(tgv('6.1')) tgTry(()=>TG.setBackgroundColor('#000000'));
  if(tgv('7.10')) tgTry(()=>TG.setBottomBarColor('#000000'));
  // смахивания в панелях и по карточкам не должны сворачивать приложение
  if(tgv('7.7')) tgTry(()=>TG.disableVerticalSwipes());
}
// Отклик пальцу. Звуков нет — только вибрация.
//   tap — нажатие, pick — щелчок барабана/листание, soft — сел/встал, hard — пауза,
//   double — ползунок дошел до конца, ok / err / warn — итог действия
function haptic(kind){
  try{
    if(tgv('6.1')){
      const H=TG.HapticFeedback;
      if(kind==='ok') H.notificationOccurred('success');
      else if(kind==='err') H.notificationOccurred('error');
      else if(kind==='warn') H.notificationOccurred('warning');
      else if(kind==='pick') H.selectionChanged();
      else if(kind==='double'){ H.impactOccurred('rigid'); setTimeout(()=>tgTry(()=>H.impactOccurred('heavy')),90); }
      else H.impactOccurred(kind==='hard'?'rigid':kind==='soft'?'medium':'light');
      return;
    }
    if(navigator.vibrate) navigator.vibrate(kind==='ok'?[8,40,14]:kind==='err'?[30,40,30]:kind==='double'?[12,60,18]:kind==='hard'?16:kind==='pick'?4:8);
  }catch(e){}
}
// confirm() в разных клиентах Telegram ведет себя по-разному — берем родное окно Telegram
function ask(msg){
  return new Promise(function(res){
    if(tgv('6.2')){ try{ TG.showConfirm(msg,ok=>res(!!ok)); return; }catch(e){} }
    res(confirm(msg));
  });
}

/* ======================= СОСТОЯНИЕ ======================= */
let S={workers:[],customers:[],shifts:[],ops:[],live:[],payments:[]};
let user=null, isOwner=false, canWrite=false, locked=true, booting=true;
/* ======================= РАСЧЕТ ======================= */
// С 16 августа 2026 бесплатного 4-го часа больше нет: после 3 часов сразу по 50.
// Смены с более ранней датой считаются по старому тарифу — уже посчитанное не меняется.
const FREE_HOUR_UNTIL='2026-08-16';
const hasFreeHour=d=> !d || String(d) < FREE_HOUR_UNTIL;
const totalFor=(h,d)=> h<=0 ? 0
  : h<=3 ? 100*h
  : (hasFreeHour(d) ? 300+50*(h-4) : 300+50*(h-3));
const priceOfHour=(i,d)=> i<=3 ? 100 : (hasFreeHour(d) && i===4 ? 0 : 50);
// Скидка в $ вычитается из суммы по тарифу, и уже остаток делится на кассу, операторов и игроков.
// Пауза не оплачивается: часы — это только игра, тариф идет сквозной.
function calc(h,nw,nc,d,discount){
  const full=totalFor(h,d), disc=Math.min(Math.max(Number(discount)||0,0),full);
  const total=full-disc, kassa=total/2, pool=total/2;
  return {full,discount:disc,total,kassa,perWorker:nw?pool/nw:0,perCustomer:nc?total/nc:0};
}
// Отыгранное время → часы к оплате: остаток 30 минут и больше — вверх, меньше — вниз.
// Меньше 30 минут за всю смену — 0 часов, такую смену не записываем.
function paidHours(sec){
  const min=Math.floor(Math.max(0,sec)/60);
  return Math.floor(min/60)+(min%60>=30?1:0);
}
function pauseText(min){
  const h=Math.floor(min/60), m=min%60;
  return (h?h+' ч':'')+(h&&m?' ':'')+(m?m+' мин':'');
}
function money(v){
  const r=Math.round(Number(v)*100)/100;
  const s=String(Math.abs(r)).replace('.',',').split(',');
  return (r<0?'−':'')+s[0].replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0')+(s[1]?','+s[1]:'')+'\u00a0$';
}
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function hourWord(n){const a=n%10,b=n%100;
  if(a===1&&b!==11)return 'час'; if(a>=2&&a<=4&&(b<12||b>14))return 'часа'; return 'часов';}
const hhmm=t=> t?String(t).slice(0,5):'';
// конец смены: начало + часы игры + пауза (минутами)
function endTime(t,h,pauseMin){
  if(!t) return '';
  const p=hhmm(t).split(':'), m=(+p[0])*60+(+p[1])+h*60+(pauseMin||0);
  const d=Math.floor(m/1440), mm=((m%1440)+1440)%1440;
  return String(Math.floor(mm/60)).padStart(2,'0')+':'+String(mm%60).padStart(2,'0')+(d?' +'+d+'д':'');
}
const shiftEnd=s=> endTime(s.start_time,s.hours,s.pause_min);
const MON=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const dayText=ds=>{ const p=String(ds).split('-'); return Number(p[2])+' '+MON[Number(p[1])-1]; };

// Время учета — по Камбодже (Asia/Phnom_Penh, UTC+7 круглый год, без перевода часов),
// как бы ни был настроен телефон. Часы сверяем с сервером, чтобы таймеры шли одинаково.
let clockOff=0;
const nowMs=()=>Date.now()+clockOff;
const KH_OFF=7*3600e3;
const z2=n=>String(n).padStart(2,'0');
function khParts(ms){
  const d=new Date(ms+KH_OFF);
  return { d:d.getUTCFullYear()+'-'+z2(d.getUTCMonth()+1)+'-'+z2(d.getUTCDate()),
           t:z2(d.getUTCHours())+':'+z2(d.getUTCMinutes()) };
}
const khToMs=(d,t)=> Date.parse(d+'T'+(t||'00:00')+':00Z')-KH_OFF;
const today=()=>khParts(nowMs()).d;
function inPeriod(ds){
  if(period==='a') return true;
  return (Date.parse(today()+'T00:00Z')-Date.parse(ds+'T00:00Z'))/86400000 < (period==='w'?7:30);
}

// Живая смена: отыграно (сек) = от старта до конца/сейчас минус все паузы, включая идущую
function livePlayed(l,now){
  const end=l.finished_at ? Date.parse(l.finished_at) : now;
  const cur=(l.paused_at && !l.finished_at) ? Math.max(0,now-Date.parse(l.paused_at)) : 0;
  return Math.max(0,(end-Date.parse(l.started_at)-cur)/1000-(l.pause_sec||0));
}
const clock=sec=>{ sec=Math.floor(sec); return Math.floor(sec/3600)+':'+z2(Math.floor(sec%3600/60))+':'+z2(sec%60); };
const clockHM=sec=>{ const m=Math.floor(sec/60); return Math.floor(m/60)+':'+z2(m%60); };
// Журнал пауз: [{s,e}] — когда началась и когда кончилась каждая пауза (e пусто — идет сейчас)
const pauseSpans=log=>(Array.isArray(log)?log:[])
  .map(p=>({s:Date.parse(p.s), e:p.e?Date.parse(p.e):null})).filter(p=>p.s);
const spanSec=(p,now)=>Math.max(0,((p.e||now)-p.s)/1000);
function spanText(p,now){
  const d=pauseText(Math.round(spanSec(p,now)/60))||'меньше минуты';
  return khParts(p.s).t+'–'+(p.e?khParts(p.e).t+' · '+d:'… · идёт '+d);
}
const spansLine=(log,now)=>pauseSpans(log).map(p=>spanText(p,now)).join(', ');
// ч:мм по Камбодже → момент, ближайший к ref: пауза через полночь не съезжает на сутки
function khNear(t,ref){
  let ms=khToMs(khParts(ref).d,t);
  if(ms-ref>12*3600e3) ms-=86400e3; else if(ref-ms>12*3600e3) ms+=86400e3;
  return ms;
}
// паузы из формы (ч:мм) → отрезки. Пауза раньше начала смены — уже следующие сутки,
// конец раньше начала паузы — пауза через полночь. Незаполненные строки не считаем.
function spansFromTimes(d,t,rows){
  if(!d) return [];
  const st=khToMs(d,t||'00:00');
  return rows.filter(p=>p.s&&p.e).map(function(p){
    let s=khToMs(d,p.s); if(s<st) s+=864e5;
    let e=khToMs(d,p.e); if(e<s) e+=864e5;
    return {s:s,e:e};
  });
}
/* ---- игроки: кто сколько сидел и кто за кого платит ---- */
// отрезки времени [{s,e}] в мс: длина, обрезка по смене, вычитание пауз, пересечение
const spanLen=list=>list.reduce((a,p)=>a+Math.max(0,p.e-p.s),0);
const spanCut=(list,a,b)=>list.map(p=>({s:Math.max(p.s,a),e:Math.min(p.e,b)})).filter(p=>p.e>p.s)
  .sort((x,y)=>x.s-y.s).reduce((o,p)=>{ const l=o[o.length-1]; if(l&&p.s<=l.e) l.e=Math.max(l.e,p.e); else o.push(p); return o; },[]);
function spanMinus(list,holes){
  let out=list.slice();
  (holes||[]).forEach(function(h){
    const next=[];
    out.forEach(function(p){
      if(h.e<=p.s||h.s>=p.e){ next.push(p); return; }
      if(h.s>p.s) next.push({s:p.s,e:h.s});
      if(h.e<p.e) next.push({s:h.e,e:p.e});
    });
    out=next;
  });
  return out;
}
function spanAnd(a,b){
  const out=[];
  a.forEach(p=>b.forEach(function(q){ const s=Math.max(p.s,q.s), e=Math.min(p.e,q.e); if(e>s) out.push({s:s,e:e}); }));
  return out;
}
// ч:мм в смене на дату d: раньше ref — уже следующие сутки
function khAfter(d,t,ref){ let ms=khToMs(d,t); if(ms<ref) ms+=864e5; return ms; }
// Счет игроков: сумма смены делится пропорционально времени за столом, паузы не считаются.
// Кто платит за всех (payer) — берет на себя долю каждого за то время, что тот сидел вместе с ним;
// кто подсел уже после его ухода, платит за себя сам. Если времени ни у кого нет — поровну.
// players: [{id, spans:[{s,e}]}] → [{id, ms, share, amount, covered}], суммы в центах сходятся с total.
function splitPlayers(total,players,pauses,payer){
  if(!players.length) return [];
  const own=players.map(p=>spanMinus(p.spans||[],pauses));
  let t=own.map(spanLen), T=t.reduce((a,x)=>a+x,0);
  const flat=!(T>0);
  if(flat){ t=players.map(()=>1); T=players.length; }
  const pi=players.findIndex(p=>p.id===payer);
  const res=players.map((p,i)=>({id:p.id, ms:flat?0:t[i], share:total*t[i]/T, amount:total*t[i]/T, covered:0}));
  if(pi>=0) res.forEach(function(r,i){
    if(i===pi) return;
    const moved=total*(flat?1:spanLen(spanAnd(own[i],own[pi])))/T;
    r.amount-=moved; r.covered=moved; res[pi].amount+=moved;
  });
  const cents=v=>Math.round(v*100)/100;
  res.forEach(r=>{ r.share=cents(r.share); r.amount=cents(r.amount); r.covered=cents(r.covered); });
  const diff=cents(total-res.reduce((a,r)=>a+r.amount,0));
  if(diff){ const big=res.reduce((a,r)=>r.amount>a.amount?r:a,res[0]); big.amount=cents(big.amount+diff); }
  return res;
}
// живая смена: отрезки каждого игрока из журнала; кого добавили без времени — вся смена
function livePlayerSpans(l,now){
  const end=l.finished_at?Date.parse(l.finished_at):now, start=Date.parse(l.started_at), log=Array.isArray(l.customer_log)?l.customer_log:[];
  return (l.customer_ids||[]).map(function(id){
    const mine=log.filter(x=>x.id===id).map(x=>({s:Date.parse(x.s), e:x.e?Date.parse(x.e):end}));
    return {id:id, spans:spanCut(mine.length?mine:[{s:start,e:end}],start,end)};
  });
}
const livePauseSpans=(l,now)=>pauseSpans(l.pause_log).map(p=>({s:p.s,e:p.e||(l.finished_at?Date.parse(l.finished_at):now)}));
// Операторы тоже могут меняться по ходу смены: их половина делится по времени работы (паузы не считаются).
// Кто без отметок «заступил / сменился» — работал всю смену.
function liveWorkerSpans(l,now){
  const end=l.finished_at?Date.parse(l.finished_at):now, start=Date.parse(l.started_at), log=Array.isArray(l.worker_log)?l.worker_log:[];
  return (l.worker_ids||[]).map(function(id){
    const mine=log.filter(x=>x.id===id).map(x=>({s:Date.parse(x.s), e:x.e?Date.parse(x.e):end}));
    return {id:id, spans:spanCut(mine.length?mine:[{s:start,e:end}],start,end)};
  });
}
// доли операторов: операторская половина по времени работы, копейки сходятся
const splitWorkers=(pool,workers,pauses)=>splitPlayers(pool,workers,pauses,null);
// поля пауз на экране итога → новый журнал; дату каждой границы берем ближайшую к прежней
function pausesFromInputs(vals,oldLog,startMs){
  const old=pauseSpans(oldLog);
  return vals.map(function(v,i){
    const o=old[i]||{s:startMs,e:startMs};
    const s=khNear(v.s,o.s);
    return {s:s, e:v.e?khNear(v.e,o.e||s):null};
  });
}
// итог живой смены: часы к оплате, дата по Камбодже и суммы после скидки
function liveSummary(l,now){
  const s=Date.parse(l.started_at), e=l.finished_at ? Date.parse(l.finished_at) : now;
  const played=livePlayed(l,now), h=paidHours(played), d=khParts(s).d;
  const c=calc(h,(l.worker_ids||[]).length,(l.customer_ids||[]).length,d,l.discount);
  return {s,e,played,h,d,c,pauseMin:Math.round((l.pause_sec||0)/60)};
}
const parseAmt=v=>{const n=Number(String(v).replace(',','.').replace(/\s/g,''));return isFinite(n)?n:0;};


/* ======================= ДЕНЬГИ 2.0 ======================= */
// У кастомера в смене: amount — сколько должен по смене, paidAmt — сколько уже отдал.
// Деньги делят сразу на месте: что заплачено — уже у кассы и операторов. Висит только долг.
let period='w';
const due=l=>Math.max(0,Math.round(((Number(l.amount)||0)-(Number(l.paidAmt)||0))*100)/100);
const workerShare=(s,id)=>{ const wl=(s.workerLinks||[]).find(x=>x.id===id); return wl&&wl.share!=null?wl.share:s.per_worker; };
// статус смены: ok — все рассчитались, debt — кто-то должен, none — кастомеры не вписаны
function shiftStatus(s){
  const ls=s.custLinks||[];
  if(!ls.length) return 'none';
  return ls.some(l=>due(l)>0.004) ? 'debt' : 'ok';
}
const shiftStart=s=>{ const t=String(s.start_time||'12:00:00'); return Date.parse(s.work_date+'T'+(t.length>=8?t.slice(0,8):t.slice(0,5)+':00')+'Z')-KH_OFF; };
const khTimeSec=ms=>{ const d=new Date(ms+KH_OFF); return z2(d.getUTCHours())+':'+z2(d.getUTCMinutes())+':'+z2(d.getUTCSeconds()); };
const shiftEndMs=s=>s.ended_at ? Date.parse(s.ended_at) : shiftStart(s)+(s.hours*60+(s.pause_min||0))*60e3;
function attendanceRow(name,spans,pauses,start,end,open=false,unknownPause=0){
  const full=spans.length===1&&spans[0].s===start&&spans[0].e===end;
  const intervals=spans.map((p,i)=>({
    s:p.s, e:open&&i===spans.length-1?null:p.e,
    ms:unknownPause&&!full?null:Math.max(0,spanLen(spanMinus([p],pauses))-unknownPause),
  }));
  const ms=intervals.some(p=>p.ms==null)?null:intervals.reduce((sum,p)=>sum+p.ms,0);
  return {name,intervals,ms,full,activeSpans:spanMinus(spans,pauses)};
}
function liveAttendance(l,now){
  const start=Date.parse(l.started_at), end=l.finished_at?Date.parse(l.finished_at):now;
  const pauses=livePauseSpans(l,now);
  if(l.paused_at&&!l.finished_at) pauses.push({s:Date.parse(l.paused_at),e:end});
  const merged=spanCut(pauses,start,end);
  const ms=livePlayed(l,now)*1000, extra=end-start-ms-spanLen(merged);
  const row=(p,name,log)=>{
    const entries=(Array.isArray(log)?log:[]).filter(x=>x.id===p.id);
    const openEntry=entries.find(x=>!x.e);
    const openStart=openEntry?Math.max(start,Date.parse(openEntry.s)):entries.length?NaN:start;
    const open=!l.finished_at&&openStart<=end;
    const spans=open&&openStart===end&&p.spans.at(-1)?.e!==end?p.spans.concat({s:end,e:end}):p.spans;
    return attendanceRow(name(p.id),spans,merged,start,end,open,extra>=1000?extra:0);
  };
  return {
    start,end,ms,unknownPause:extra>=1000,
    groups:[
      {title:'Кастомеры',rows:livePlayerSpans(l,now).map(p=>row(p,cName,l.customer_log))},
      {title:'Операторы',rows:liveWorkerSpans(l,now).map(p=>row(p,wName,l.worker_log))},
    ],
    open:!l.finished_at,
  };
}
function savedAttendance(s){
  const start=shiftStart(s), end=shiftEndMs(s);
  const pauses=spanCut(pauseSpans(s.pause_log).filter(p=>p.e),start,end);
  const pauseMs=spanLen(pauses), unknownPause=Math.round(pauseMs/60000)<s.pause_min?s.pause_min*60000-pauseMs:0;
  const row=(id,links,name)=>{
    const recorded=pauseSpans(links?.find(l=>l.id===id)?.spans).filter(p=>p.e);
    const spans=spanCut(recorded.length?recorded:[{s:start,e:end}],start,end);
    return attendanceRow(name(id),spans,pauses,start,end,false,unknownPause);
  };
  return {
    start,end,ms:Math.max(0,end-start-pauseMs-unknownPause),estimated:!s.ended_at,
    unknownTimes:!s.start_time&&!s.ended_at,unknownPause:unknownPause>0,
    groups:[
      {title:'Кастомеры',rows:s.customerIds.map(id=>row(id,s.custLinks,cName))},
      {title:'Операторы',rows:s.workerIds.map(id=>row(id,s.workerLinks,wName))},
    ],
  };
}
// хронология для расчета: от старых смен к новым — как в базе (settle)
const byOld=(a,b)=> (a.work_date<b.work_date?-1:a.work_date>b.work_date?1:0) ||
  String(hhmm(a.start_time)||'').localeCompare(String(hhmm(b.start_time)||'')) || String(a.created_at||'').localeCompare(String(b.created_at||''));
// долги по кастомерам: [{id, total, items:[{s, l, due}], oldest}] — самые большие сверху
// неотправленные смены тоже в долгах (с пометкой), но рассчитать по ним можно только после отправки
function debts(){
  const by={};
  S.shifts.slice().sort(byOld).forEach(s=>(s.custLinks||[]).forEach(function(l){
    const d=due(l); if(d<=0.004) return;
    const x=by[l.id]||(by[l.id]={id:l.id,total:0,payable:0,pend:0,items:[],oldest:s.work_date});
    x.total+=d; if(s.pending) x.pend+=d; else x.payable+=d; x.items.push({s:s,l:l,due:d,pending:!!s.pending});
  }));
  const r=v=>Math.round(v*100)/100;
  return Object.values(by).map(x=>Object.assign(x,{total:r(x.total),payable:r(x.payable),pend:r(x.pend),pendingOnly:x.payable<=0.004})).sort((a,b)=>b.total-a.total);
}
// посиделки человека: когда сидел/работал (его отрезки, без пауз), сколько это стоило, сколько должен
function personSessions(kind,id){
  return S.shifts.filter(s=>(kind==='c'?s.customerIds:s.workerIds).includes(id)).map(function(s){
    const a=shiftStart(s), b=shiftEndMs(s), pz=pauseSpans(s.pause_log).filter(p=>p.e);
    const link=kind==='c'?(s.custLinks||[]).find(l=>l.id===id):(s.workerLinks||[]).find(l=>l.id===id);
    let sp=pauseSpans(link&&link.spans).filter(p=>p.e).map(p=>({s:p.s,e:p.e}));
    if(!sp.length) sp=[{s:a,e:b}];
    sp=spanCut(sp,a,b); if(!sp.length) sp=[{s:a,e:b}];
    return {s:s, spans:sp, ms:spanLen(spanMinus(sp,pz)),
      amount:kind==='c'?(link?(link.share!=null?link.share:link.amount):0):(Number(workerShare(s,id))||0),
      due:kind==='c'&&link?due(link):0};
  }).sort((x,y)=>(y.s.work_date>x.s.work_date?1:y.s.work_date<x.s.work_date?-1:0)||(y.spans[0].s-x.spans[0].s));
}
// раскладка денег: кусок оплаты по смене делится так же, как сама смена — касса и операторы
function chunkSplit(s,chunk){
  const T=Number(s.total)||0, out={kassa:0, w:{}};
  if(T<=0) return out;
  out.kassa=chunk*(Number(s.kassa)||0)/T;
  s.workerIds.forEach(id=>{ out.w[id]=(out.w[id]||0)+chunk*(Number(workerShare(s,id))||0)/T; });
  return out;
}
function addSplit(acc,x){ acc.kassa+=x.kassa; Object.keys(x.w).forEach(k=>acc.w[k]=(acc.w[k]||0)+x.w[k]); return acc; }
// что закроет оплата amount: от старых долгов к новым (как settle в базе); onlyShift — только эта смена
function allocPreview(cid,amount,onlyShift){
  let left=Math.round(amount*100)/100; const items=[], split={kassa:0,w:{}};
  const d=debts().find(x=>x.id===cid);
  (d?d.items:[]).filter(it=>!it.pending&&(!onlyShift||it.s.id===onlyShift)).forEach(function(it){
    if(left<=0.004) return;
    const take=Math.min(left,it.due);
    items.push({s:it.s,due:it.due,take:take,rest:Math.round((it.due-take)*100)/100});
    addSplit(split,chunkSplit(it.s,take)); left=Math.round((left-take)*100)/100;
  });
  return {items:items, split:split, over:left>0.004?left:0};
}
// Что лежит «к выдаче» руками: смены без кастомеров и общие суммы из старых записей,
// минус ручные выдачи и выплаты. В норме ноль — тогда ничего не показываем.
function handDue(){
  let kassa=0; const w={}; S.workers.forEach(x=>w[x.id]=0);
  const earned={};
  S.shifts.forEach(function(s){
    s.workerIds.forEach(id=>earned[id]=(earned[id]||0)+(Number(workerShare(s,id))||0));
    if((s.custLinks||[]).length) return;
    kassa+=Number(s.kassa)||0;
    s.workerIds.forEach(id=>w[id]=(w[id]||0)+(Number(workerShare(s,id))||0));
  });
  let common=0;
  S.ops.forEach(function(o){
    if(o.kind==='expense') kassa-=o.amount;
    else if(o.kind==='payout') w[o.worker_id]=(w[o.worker_id]||0)-o.amount;
    else if(o.kind==='carry') common+=o.amount;
    else if(o.kind==='income') common-=o.amount;
  });
  kassa+=common/2;
  const ids=Object.keys(earned), base=ids.reduce((a,id)=>a+earned[id],0);
  ids.forEach(id=>{ w[id]=(w[id]||0)+common/2*(base>0?earned[id]/base:0); });
  const r=v=>Math.round(v*100)/100;
  Object.keys(w).forEach(k=>w[k]=r(w[k]));
  return {kassa:r(kassa), w:w, any:Math.abs(r(kassa))>0.004||Object.values(w).some(v=>Math.abs(v)>0.004)};
}
// неделя: с понедельника по Камбодже
function weekStart(){ const t=Date.parse(today()+'T00:00Z'), wd=(new Date(t).getUTCDay()+6)%7; return new Date(t-wd*864e5).toISOString().slice(0,10); }
function weekStats(){
  const from=weekStart(), days=[0,0,0,0,0,0,0];
  const sh=S.shifts.filter(s=>s.work_date>=from);
  const w={}; let kassa=0;
  sh.forEach(function(s){
    const i=Math.round((Date.parse(s.work_date+'T00:00Z')-Date.parse(from+'T00:00Z'))/864e5);
    if(i>=0&&i<7) days[i]+=Number(s.total)||0;
    kassa+=Number(s.kassa)||0;
    s.workerIds.forEach(id=>w[id]=(w[id]||0)+(Number(workerShare(s,id))||0));
  });
  return {from:from, n:sh.length, h:sh.reduce((a,s)=>a+s.hours,0), sum:sh.reduce((a,s)=>a+(Number(s.total)||0),0), kassa:kassa, w:w, days:days};
}

// идущая смена: счет кастомеров по времени за столом (и кто платит за всех), доли операторов по времени работы
function liveSplit(l,total,now){
  const players=livePlayerSpans(l,now);
  return {w:{s:Date.parse(l.started_at), e:l.finished_at?Date.parse(l.finished_at):now}, players:players,
          res:splitPlayers(total,players,livePauseSpans(l,now),l.payer_id)};
}
function liveWorkerSplit(l,pool,now){
  const workers=liveWorkerSpans(l,now);
  return {w:{s:Date.parse(l.started_at), e:l.finished_at?Date.parse(l.finished_at):now}, workers:workers,
          res:splitWorkers(pool,workers,livePauseSpans(l,now))};
}

/* ======================= ИТОГ СМЕНЫ (черновик) ======================= */
// Один расчет на все пути: живая смена, ручная запись прошедшей и правка записанной.
// Черновик: {start,end, pauses:[{s,e}], discount, note, workers:[{id,spans|null}], customers:[{id,spans|null,paid}], payer}
// spans=null — человек был всю смену.
function spansToSave(spans,w){
  if(!w || !spans.length || (spans.length===1 && spans[0].s===w.s && spans[0].e===w.e)) return [];
  return spans.map(p=>({s:new Date(p.s).toISOString(), e:new Date(p.e).toISOString()}));
}
function draftCalc(d){
  if(d.orig && !d.touched) return origCalc(d);
  const w={s:d.start,e:d.end}, pauses=spanCut(d.pauses||[],d.start,d.end);
  const played=Math.max(0,(d.end-d.start-spanLen(pauses))/1000), h=paidHours(played), date=khParts(d.start).d;
  const c=calc(h,d.workers.length,d.customers.length,date,d.discount);
  const cut=p=>spanCut(p.spans&&p.spans.length?p.spans:[{s:d.start,e:d.end}],d.start,d.end);
  const workers=d.workers.map(p=>({id:p.id,spans:cut(p)}));
  const players=d.customers.map(p=>({id:p.id,spans:cut(p)}));
  const wres=splitWorkers(c.total/2,workers,pauses);
  const cres=splitPlayers(c.total,players,pauses,d.payer||null);
  const wrows=wres.map(r=>({worker_id:r.id, share:r.amount, spans:spansToSave(workers.find(p=>p.id===r.id).spans,w)}));
  const crows=cres.map(function(r){
    const src=d.customers.find(p=>p.id===r.id)||{};
    const paid=src.paid==='all'?r.amount:Math.min(Math.max(Number(src.paid)||0,0),r.amount);
    return {customer_id:r.id, amount:r.amount, share:r.share, spans:spansToSave(players.find(p=>p.id===r.id).spans,w),
            paid_by:(d.payer && r.id!==d.payer && r.covered>0.004)?d.payer:null, paid_amount:Math.round(paid*100)/100, covered:r.covered};
  });
  const row={ work_date:date, start_time:khTimeSec(d.start), hours:h, total:c.total, kassa:c.kassa,
    per_worker:c.perWorker, per_customer:c.perCustomer, note:(d.note||'').trim()||null,
    pause_min:Math.round(spanLen(pauses)/60000), discount:c.discount, ended_at:new Date(d.end).toISOString(),
    pause_log:(d.pauses||[]).filter(p=>p.e).map(p=>({s:new Date(p.s).toISOString(), e:new Date(p.e).toISOString()})) };
  // кому что уйдет из того, что заплатили прямо сейчас
  const now={kassa:0,w:{}};
  crows.forEach(cr=>addSplit(now,chunkSplit({total:c.total,kassa:c.kassa,workerIds:wrows.map(x=>x.worker_id),
    workerLinks:wrows.map(x=>({id:x.worker_id,share:x.share}))},cr.paid_amount)));
  return {w,pauses,played,h,date,c,wres,cres,wrows,crows,row,now};
}
function origCalc(d){
  const s=d.orig, w={s:d.start,e:d.end}, pauses=spanCut(d.pauses||[],d.start,d.end);
  const wrows=s.workerIds.map(id=>{ const wl=(s.workerLinks||[]).find(x=>x.id===id)||{};
    return {worker_id:id, share:Number(workerShare(s,id))||0, spans:wl.spans||[]}; });
  const crows=(s.custLinks||[]).map(l=>({customer_id:l.id, amount:l.amount, share:l.share!=null?l.share:l.amount, spans:l.spans||[],
    paid_by:l.paid_by||null, paid_amount:Math.min(l.paidAmt||0,l.amount), covered:0}));
  const c={full:s.total+(s.discount||0), discount:s.discount||0, total:s.total, kassa:s.kassa, perWorker:s.per_worker, perCustomer:s.per_customer};
  const row={ work_date:s.work_date, start_time:s.start_time, hours:s.hours, total:s.total, kassa:s.kassa, per_worker:s.per_worker,
    per_customer:s.per_customer, note:(d.note||'').trim()||null, pause_min:s.pause_min||0, discount:s.discount||0,
    ended_at:s.ended_at||new Date(d.end).toISOString(), pause_log:s.pause_log||[] };
  return {w,pauses,played:Math.max(0,(d.end-d.start-spanLen(pauses))/1000),h:s.hours,date:s.work_date,c,wres:[],cres:[],wrows,crows,row,now:{kassa:0,w:{}},orig:true};
}
const draftFromLive=l=>{
  const now=nowMs(), end=l.finished_at?Date.parse(l.finished_at):now;
  return { mode:'live', liveId:l.id, start:Date.parse(l.started_at), end:end,
    pauses:livePauseSpans(l,end), discount:Number(l.discount)||0, note:l.note||'',
    workers:liveWorkerSpans(l,end).map(x=>({id:x.id,spans:x.spans})),
    customers:livePlayerSpans(l,end).map(x=>({id:x.id,spans:x.spans,paid:null})),
    payer:l.payer_id||null };
};
function draftFromShift(s){
  const start=shiftStart(s), end=shiftEndMs(s);
  let pauses=pauseSpans(s.pause_log).filter(p=>p.e).map(p=>({s:p.s,e:p.e}));
  const known=Math.round(spanLen(pauses)/60000), extra=(s.pause_min||0)-known;
  if(extra>0) pauses.push({s:end-extra*60e3,e:end});   // пауза без времени — ставим в конец
  const sp=list=>{ const x=pauseSpans(list).filter(p=>p.e).map(p=>({s:p.s,e:p.e})); return x.length?x:null; };
  return { mode:'edit', shiftId:s.id, orig:s, touched:false, start:start, end:end, pauses:pauses,
    discount:Number(s.discount)||0, note:s.note||'',
    workers:(s.workerLinks&&s.workerLinks.length?s.workerLinks:s.workerIds.map(id=>({id:id,spans:[]}))).map(w=>({id:w.id,spans:sp(w.spans)})),
    customers:(s.custLinks||[]).map(l=>({id:l.id,spans:sp(l.spans),paid:l.paidAmt||0})),
    payer:((s.custLinks||[]).find(l=>l.paid_by)||{}).paid_by||null };
}

/* ======================= ОФЛАЙН: КЭШ И ОЧЕРЕДЬ ======================= */
const QKEY='uchet2-queue', CKEY='uchet2-cache';
let queue=[], flushing=false, offlineData=false, cachedAt=null;
function loadQueue(){ try{ queue=JSON.parse(safeStorage.getItem(QKEY)||'[]'); }catch(e){ queue=[]; } }
function saveQueue(){ try{ safeStorage.setItem(QKEY,JSON.stringify(queue)); }catch(e){} }
// в кэш — только то, что пришло из базы (без неотправленного): иначе после перезапуска оно задвоится
function saveCache(){
  try{
    const clean=Object.assign({},S,{shifts:S.shifts.filter(x=>!x.pending)});
    safeStorage.setItem(CKEY,JSON.stringify({at:new Date().toISOString(),S:clean}));
  }catch(e){}
}
function loadCache(){
  try{
    const c=JSON.parse(safeStorage.getItem(CKEY)||'null');
    if(!c||!c.S) return false;
    S=Object.assign({workers:[],customers:[],shifts:[],ops:[],live:[],payments:[]},c.S); cachedAt=c.at; offlineData=true; return true;
  }catch(e){ return false; }
}
const online=()=> navigator.onLine!==false;
const newId=()=>crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
function enqueue(item){
  item.id='q'+Date.now()+Math.floor(Math.random()*1000); item.at=new Date().toISOString();
  queue.push(item); saveQueue();
}
// неотправленные смены видны сразу и учитываются в долгах
function applyPending(){
  queue.forEach(function(q){
    if(q.t!=='shift' || S.shifts.some(s=>s.id===q.sid)) return;
    S.shifts.unshift(normShift(Object.assign({id:q.sid,pending:true,created_at:q.at},q.row),
      q.wrows.map(w=>Object.assign({shift_id:q.sid},w)), q.crows.map(c=>Object.assign({shift_id:q.sid},c))));
  });
}
async function flushQueue(){
  if(flushing || !queue.length || locked || !online()) return false;
  flushing=true;
  let sent=false;
  for(const q of queue.filter(x=>!x.failed)){
    try{
      if(q.t==='shift'){
        const {error}=await sb.rpc('save_shift',{p_id:q.sid,p_shift:q.row,p_workers:q.wrows,p_customers:q.crows});
        if(error){ q.failed=error.message||'ошибка'; saveQueue(); continue; }   // база отказала — не повторяем вслепую
        const pays=(q.crows||[]).filter(c=>c.paid_amount>0.004).map(c=>({customer_id:c.customer_id,amount:c.paid_amount,alloc:[{shift_id:q.sid,amount:c.paid_amount}],note:'при сохранении смены'}));
        if(pays.length) sb.from('payments').insert(pays).then(function(){});
        sb.functions.invoke('notify-shift',{body:{shift_id:q.sid}}).catch(function(){});
      }
      queue=queue.filter(x=>x.id!==q.id); saveQueue(); sent=true;
    }catch(e){ break; }   // нет связи — попробуем позже
  }
  flushing=false;
  return sent;
}

/* ======================= ЗАГРУЗКА ======================= */
// Учет закрыт от посторонних: база отдает данные владельцу (вход по почте) и тем, кому он дал правку;
// остальным, кого он пустил через Telegram, — функция tg-access по подписи Telegram.
const gateErr=st=>Object.assign(new Error('gate'),{gate:st});
const syncClock=(serverIso,t0,t1)=>{ const s=Date.parse(serverIso); if(s) clockOff=s-(t0+t1)/2; };
const tgAccount=u=>!!(u && u.app_metadata && u.app_metadata.tg_id);
async function fetchAll(){
  if(canWrite){
    const t0=Date.now();
    sb.rpc('live_now').then(r=>{ if(r.data) syncClock(r.data,t0,Date.now()); }).catch(function(){});
    // база отдаёт не больше 1000 строк за раз — берём страницами, чтобы ничего не терялось
    const all=async mk=>{ let out=[]; for(let from=0;;from+=1000){ const r=await mk().range(from,from+999); if(r.error) return r; out=out.concat(r.data||[]); if(!r.data||r.data.length<1000) return {data:out}; } };
    const q=[
      all(()=>sb.from('workers').select('*').order('created_at')),
      all(()=>sb.from('customers').select('*').order('created_at')),
      all(()=>sb.from('shifts').select('*').order('work_date',{ascending:false}).order('created_at',{ascending:false}).order('id')),
      all(()=>sb.from('shift_workers').select('*').order('shift_id').order('worker_id')),
      all(()=>sb.from('shift_customers').select('*').order('shift_id').order('customer_id')),
      all(()=>sb.from('ops').select('*').order('op_date',{ascending:false}).order('id')),
      sb.from('live_shifts').select('*').order('started_at'),
      all(()=>sb.from('payments').select('*').order('created_at',{ascending:false}).order('id'))
    ];
    const r=await Promise.all(q);
    const err=r.slice(0,7).find(x=>x.error);
    if(err) throw err.error;
    return r.map(x=>x.data||[]);
  }
  if(!TG) throw gateErr({status:'closed'});
  const t0=Date.now();
  const {data,error}=await sb.functions.invoke('tg-access',{body:{initData:TG.initData}});
  if(error) throw error;
  if(data && data.now) syncClock(data.now,t0,Date.now());
  if(!data || data.status==='error') throw new Error((data&&data.error)||'tg-access');
  if(!data.ok) throw gateErr(data);
  // правку дали, но вход для неё не создался — сказать, а не молча оставить «только просмотр»
  if(data.can_edit && !data.session && !window.__editWarned){ window.__editWarned=true; setTimeout(()=>typeof toast==='function'&&toast('Правка не включилась — закрой учёт и открой заново',true),1500); }
  // владелец дал правку — входим под учеткой этого Telegram и читаем базу напрямую
  if(data.session){
    try{ await sb.auth.setSession(data.session); await refreshAuth(); }catch(_){}
    if(canWrite) return fetchAll();
  } else if(tgAccount(user)){
    try{ await sb.auth.signOut({scope:'local'}); }catch(_){}
    await refreshAuth();
  }
  const d=data.data;
  return [d.workers,d.customers,d.shifts,d.shift_workers,d.shift_customers,d.ops,d.live_shifts||[],d.payments||[]];
}
function normShift(x,sw,sc){
  return Object.assign({},x,{
    total:Number(x.total), kassa:Number(x.kassa), hours:Number(x.hours),
    per_worker:Number(x.per_worker), per_customer:Number(x.per_customer),
    pause_min:Number(x.pause_min)||0, discount:Number(x.discount)||0,
    workerIds:sw.map(r=>r.worker_id),
    workerLinks:sw.map(r=>({id:r.worker_id, share:r.share!=null?Number(r.share):null, spans:r.spans||[]})),
    custLinks:sc.map(function(r){
      const amount=r.amount!=null?Number(r.amount):Number(x.per_customer);
      const paidAmt=r.paid_amount!=null?Number(r.paid_amount):(r.paid?amount:0);
      return {id:r.customer_id, amount:amount, paidAmt:paidAmt, paid:amount-paidAmt<0.005&&amount>0.004, paid_at:r.paid_at||null,
              share:r.share!=null?Number(r.share):null, spans:r.spans||[], paid_by:r.paid_by||null};
    }),
    customerIds:sc.map(r=>r.customer_id)
  });
}
async function loadAll(){
  const [w,c,s,sw,sc,o,lv,pay]=await fetchAll();
  const swBy={}, scBy={};
  sw.forEach(r=>(swBy[r.shift_id]=swBy[r.shift_id]||[]).push(r));
  sc.forEach(r=>(scBy[r.shift_id]=scBy[r.shift_id]||[]).push(r));
  S={ workers:w, customers:c,
    live:(lv||[]).map(x=>Object.assign({},x,{discount:Number(x.discount)||0})),
    ops:o.map(x=>Object.assign({},x,{amount:Number(x.amount)})),
    payments:(pay||[]).map(x=>Object.assign({},x,{amount:Number(x.amount)})),
    shifts:s.map(x=>normShift(x,swBy[x.id]||[],scBy[x.id]||[])) };
  offlineData=false;
  applyPending();
}
async function refreshAuth(){
  const {data}=await sb.auth.getSession();
  user=data&&data.session?data.session.user:null;
  isOwner=false; canWrite=false;
  if(user){
    const {data:rows}=await sb.from('owners').select('email');
    isOwner=!!(rows&&rows.some(r=>String(r.email).toLowerCase()===String(user.email).toLowerCase()));
    canWrite = isOwner || (await sb.rpc('can_write')).data===true;
  }
  locked=!canWrite;
}
const wName=id=>{const w=S.workers.find(x=>x.id===id);return w?w.name:'—';};
const cName=id=>{const c=S.customers.find(x=>x.id===id);return c?c.name:'—';};

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

function initials(name){
  const w=String(name||'?').trim().split(/\s+/).filter(Boolean);
  // как в «Контактах»: два слова — две буквы, одно — первая заглавная и вторая строчная (Sa, Ор, 00)
  if(w.length>1) return (w[0][0]+w[1][0]).toUpperCase();
  const x=w[0]||'?'; return x[0].toUpperCase()+(x[1]||'').toLowerCase();
}
const PALETTE=['#8fb3ff','#a7d88b','#e8c07d','#f29bab','#c4a6f5','#8fd6f0','#86d8c4','#f5a97f','#b9c3ef','#9ee6df','#e6cf9a','#d2a8e8'];
function personColor(name){ let h=0; const s=String(name||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; }
const avHTML=(name,cls)=>{ const c=personColor(name); return '<div class="av '+(cls||'')+'" style="--pc:'+c+'">'+esc(initials(name))+'</div>'; };

function timelineHTML(o){
  const W=Math.max(1,o.end-o.start), pc=v=>Math.max(0,Math.min(100,(v-o.start)/W*100)).toFixed(2);
  const bars=(spans,cls)=>(spans||[]).map(z=>'<i class="'+(cls||'')+'" style="left:'+pc(z.s)+'%;width:'+Math.max(.8,pc(z.e)-pc(z.s)).toFixed(2)+'%"></i>').join('');
  const holes=(o.pauses||[]).map(p=>'<i class="p" style="left:'+pc(p.s)+'%;width:'+Math.max(.6,pc(p.e)-pc(p.s)).toFixed(2)+'%"></i>').join('');
  const ticks=[0,.25,.5,.75,1].map(k=>khParts(o.start+W*k).t);
  return '<div class="ax">'+ticks.map(t=>'<span class="num">'+t+'</span>').join('')+'</div>'+
    '<div class="ln main"><span>смена</span><div class="tr">'+bars([{s:o.start,e:o.end}])+holes+'</div></div>'+
    (o.rows||[]).map(r=>'<div class="ln" style="--pc:'+personColor(r.name)+'"><span>'+esc(r.name)+'</span><div class="tr">'+bars(r.spans,r.w?'w':'')+holes+'</div></div>').join('');
}
