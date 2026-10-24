const API='/.netlify/functions/api';
const TZ='America/New_York';
const cats={appointments:{label:'Appointments',icon:'📅',color:'#8055d8'},groups:{label:'Groups & communities',icon:'🌿',color:'#29ae80'},meetings:{label:'Meetings & events',icon:'🗓️',color:'#ac85ed'},learning:{label:'Classes & learning',icon:'📚',color:'#56be9c'},personal:{label:'Personal',icon:'💜',color:'#6543b5'}};
const $=sel=>document.querySelector(sel);
const $$=sel=>[...document.querySelectorAll(sel)];
const todayEastern=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`};
const day=(s)=>new Date(`${s}T12:00:00Z`);
const iso=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{let d=day(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const firstOfMonth=s=>s.slice(0,7)+'-01';
const shiftMonth=(s,n)=>{const d=day(firstOfMonth(s));d.setUTCMonth(d.getUTCMonth()+n);return iso(d)};
const weekdays=(s)=>day(s).getUTCDay();
const readableDate=(s,options={weekday:'long',month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(day(s));
const readableTime=(t)=>{let [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`};
const state={events:[],focus:todayEastern(),view:'month',filters:new Set(Object.keys(cats)),sync:null};

function occurrenceList(from,to){const result=[];for(const event of state.events){let dates=[];
  if(event.recurrence==='weekly'){
    const offset=Math.floor((day(from)-day(event.date))/86400000);let i=Math.max(0,Math.floor(offset/7));
    for(let j=0;j<500;j++,i++){let d=addDays(event.date,i*7);if(d>to||(event.until&&d>event.until))break;if(d>=from)dates.push(d)}
  }else if(event.recurrence==='monthly'){
    const [sy,sm,sd]=event.date.split('-').map(Number),[fy,fm]=from.split('-').map(Number);
    let i=Math.max(0,(fy-sy)*12+fm-sm-1);
    for(let j=0;j<1200;j++,i++){
      let d=new Date(Date.UTC(sy,sm-1+i,1,12));if(iso(d).slice(0,7)>to.slice(0,7))break;
      let md=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),sd,12));
      if(md.getUTCMonth()!==d.getUTCMonth())continue;
      const dt=iso(md);if(dt>=from&&(!event.until||dt<=event.until))dates.push(dt);
    }
  } else if(event.date>=from)dates=[event.date];
  for(const date of dates){if(date<=to&&date>=from&&(!event.until||date<=event.until))result.push({...event,occurrenceDate:date});}
}return result.sort((a,b)=>(a.occurrenceDate+a.time+a.title).localeCompare(b.occurrenceDate+b.time+b.title));}
function visibleEvents(from,to){return occurrenceList(from,to).filter(e=>state.filters.has(e.category));}
async function api(action,{method='GET',body}={}){const res=await fetch(`${API}?action=${encodeURIComponent(action)}`,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await res.json().catch(()=>({}));if(!res.ok){if(res.status===401 && action!=='login'){showLogin();}throw new Error(data.error||`Error ${res.status}`)}return data;}
function showLogin(message=''){ $('#app').hidden=true;$('#login').hidden=false;$('#login-error').textContent=message;$('#password').focus();}
function showApp(){$('#login').hidden=true;$('#app').hidden=false;render();}
function flash(message,error=false){const el=$('#feedback');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>el.hidden=true,6500);}
async function reload(){const data=await api('events');state.events=data.events||[];state.sync=data.sync;render();}
function render(){renderFilters();renderSidebar();renderStats();renderCalendar();renderUpNext();}
function renderFilters(){const target=$('#category-filters');target.replaceChildren();for(const [id,item] of Object.entries(cats)){
  const btn=document.createElement('button');btn.type='button';btn.className=`filter ${state.filters.has(id)?'':'off'}`;btn.setAttribute('aria-pressed',String(state.filters.has(id)));
  const dot=document.createElement('span');dot.className='category-color';dot.style.background=item.color;
  const name=document.createElement('span');name.textContent=item.label;
  const check=document.createElement('span');check.className='check';check.textContent=state.filters.has(id)?'✓':'+';
  btn.append(dot,name,check);btn.addEventListener('click',()=>{if(state.filters.has(id))state.filters.delete(id);else state.filters.add(id);render();});target.append(btn);
}}
function renderSidebar(){for(const b of $$('.nav-item'))b.classList.toggle('selected',b.dataset.nav===state.view);
  for(const b of $$('.tab'))b.classList.toggle('active',b.dataset.tab===state.view);
  $('#breadcrumb-label').textContent=({month:'Calendar',week:'This week',agenda:'All upcoming'})[state.view];
  const sync=state.sync;
  $('#sidebar-sync-status').textContent=sync?.ok?'Schedule message is up to date':sync?.configured?'Needs another sync':'Connect your Discord webhook';
  $('#sync-label').textContent=sync?.ok?'Synced ✓':sync?.configured?'Sync failed':'Not connected';
  $('#sync-small').textContent=sync?.ok?`Updated ${new Date(sync.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`:sync?.configured?'Check your webhook':'Add webhook to Netlify';
}
function renderStats(){const today=todayEastern(), weekEnd=addDays(today,6), all=occurrenceList(today,weekEnd), next=occurrenceList(today,addDays(today,365))[0];
  $('#week-count').textContent=all.length;
  $('#next-date').textContent=next?readableDate(next.occurrenceDate,{month:'short',day:'numeric'}):'—';
  $('#next-title').textContent=next?next.title:'A little breathing room';
}
function renderCalendar(){const view=state.view;$('#month-view').hidden=view!=='month';$('#list-view').hidden=view==='month';
  const focus=state.focus;
  $('#calendar-heading').textContent=view==='month'?readableDate(firstOfMonth(focus),{month:'long',year:'numeric'}):view==='week'?`Week of ${readableDate(addDays(focus,-weekdays(focus)),{month:'short',day:'numeric'})}`:'Your upcoming events';
  if(view==='month')renderMonth();else renderList();
}
function renderMonth(){const first=firstOfMonth(state.focus),gridStart=addDays(first,-weekdays(first));const month=first.slice(0,7);
  const end=addDays(gridStart,41),byDate=new Map();for(const e of visibleEvents(gridStart,end)){if(!byDate.has(e.occurrenceDate))byDate.set(e.occurrenceDate,[]);byDate.get(e.occurrenceDate).push(e)}
  const grid=$('#month-grid');grid.replaceChildren();for(let i=0;i<42;i++){const date=addDays(gridStart,i),d=day(date);const cell=document.createElement('div');cell.className=`day-cell${date.slice(0,7)!==month?' faded':''}${date===todayEastern()?' today':''}`;
    const header=document.createElement('div');header.className='day-header';const num=document.createElement('button');num.type='button';num.className='day-number';num.textContent=d.getUTCDate();num.title=`Add event on ${readableDate(date)}`;num.addEventListener('click',()=>openEvent(null,date));
    const add=document.createElement('button');add.type='button';add.className='day-add';add.textContent='+';add.title='Add an event';add.addEventListener('click',()=>openEvent(null,date));header.append(num,add);cell.append(header);
    const items=byDate.get(date)||[];
    for(const e of items.slice(0,3)){const pill=document.createElement('button');pill.type='button';pill.className=`event-pill ${e.category}`;pill.textContent=`${readableTime(e.time)} ${e.title}`;pill.title=`${readableTime(e.time)} · ${e.title}`;pill.addEventListener('click',()=>openEvent(e));cell.append(pill)}
    if(items.length>3){const extra=document.createElement('span');extra.className='more-events';extra.textContent=`+${items.length-3} more`;cell.append(extra)}grid.append(cell);
  }
}
function renderList(){const today=todayEastern(),isWeek=state.view==='week',start=isWeek?addDays(state.focus,-weekdays(state.focus)):today,end=addDays(start,isWeek?6:89),list=$('#list-view'),entries=visibleEvents(start,end);list.replaceChildren();
  if(!entries.length){const empty=document.createElement('div');empty.className='empty-all';const moon=document.createElement('div');moon.className='empty-icon';moon.textContent='✦';const title=document.createElement('h3');title.textContent='A little room to breathe';const p=document.createElement('p');p.textContent='No events in this view yet. Add something when you’re ready.';empty.append(moon,title,p);list.append(empty);return;}
  let prev='';for(const e of entries){if(e.occurrenceDate!==prev){const h=document.createElement('div');h.className='day-list-header';h.textContent=readableDate(e.occurrenceDate);list.append(h);prev=e.occurrenceDate;}
    const b=document.createElement('button');b.className='agenda-event';b.type='button';const t=document.createElement('span');t.className='agenda-time';t.textContent=readableTime(e.time);const ic=document.createElement('span');ic.className='agenda-symbol';ic.textContent=cats[e.category].icon;const desc=document.createElement('span');desc.className='agenda-name';desc.textContent=e.title;const ct=document.createElement('span');ct.className='agenda-category';ct.textContent=`${cats[e.category].label}${e.recurrence!=='none'?' · Repeats':''}${e.share?' · Shared to Discord':''}`;desc.append(ct);b.append(t,ic,desc);b.addEventListener('click',()=>openEvent(e));list.append(b);}
}
function renderUpNext(){const items=visibleEvents(todayEastern(),addDays(todayEastern(),90)).slice(0,6),target=$('#up-next');target.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='empty-small';p.textContent='Nothing coming up yet. Your next event will appear here.';target.append(p);return;}
  for(const e of items){const b=document.createElement('button');b.className='upcoming-item';b.type='button';const ic=document.createElement('span');ic.className='upcoming-icon';ic.textContent=cats[e.category].icon;const content=document.createElement('span');const title=document.createElement('div');title.className='upcoming-title';title.textContent=e.title;const meta=document.createElement('div');meta.className='upcoming-meta';meta.textContent=`${readableDate(e.occurrenceDate,{month:'short',day:'numeric'})} · ${readableTime(e.time)} ET`;content.append(title,meta);b.append(ic,content);b.addEventListener('click',()=>openEvent(e));target.append(b)}
}
function updateSharingDescription(){const isAppointment=$('#event-category').value==='appointments';$('#share-description').textContent=isAppointment?'Discord will show only “Appointment” and its time, not the private event title.':'Discord will show this event’s name and time. Notes and location stay private.';}
function openEvent(event=null,date=null){const form=$('#event-form');form.reset();$('#event-error').textContent='';$('#event-id').value=event?.id||'';$('#event-title').value=event?.title||'';$('#event-category').value=event?.category||'appointments';$('#event-date').value=event?.date||date||todayEastern();$('#event-time').value=event?.time||'11:00';$('#event-duration').value=String(event?.duration||60);$('#event-recurrence').value=event?.recurrence||'none';$('#event-until').value=event?.until||'';$('#event-location').value=event?.location||'';$('#event-notes').value=event?.notes||'';$('#event-share').checked=event?.share??true;$('#until-holder').hidden=$('#event-recurrence').value==='none';$('#modal-title').textContent=event?'Edit your event':'Add a new event';$('#delete-event').hidden=!event;updateSharingDescription();$('#event-dialog').showModal();$('#event-title').focus();}
function closeEvent(){$('#event-dialog').close()}
async function saveEvent(ev){ev.preventDefault();const btn=$('#save-event');btn.disabled=true;$('#event-error').textContent='';try{
  const form=new FormData($('#event-form'));
  const body={id:form.get('id')||undefined,title:form.get('title'),category:form.get('category'),date:form.get('date'),time:form.get('time'),duration:Number(form.get('duration')),recurrence:form.get('recurrence'),until:form.get('until'),location:form.get('location'),notes:form.get('notes'),share:$('#event-share').checked};
  const res=await api('save',{method:'POST',body});state.events=res.events;state.sync=res.sync;state.focus=body.date;closeEvent();render();flash(res.sync?.ok?'Event saved and Discord schedule updated! ✨':`Event saved. Discord: ${res.sync?.error||'not connected yet.'}`,!res.sync?.ok);
}catch(error){$('#event-error').textContent=error.message}finally{btn.disabled=false}}
async function deleteEvent(){const id=$('#event-id').value;if(!id||!confirm('Remove this event (including all its repeated dates)?'))return;const btn=$('#delete-event');btn.disabled=true;try{const res=await api('delete',{method:'POST',body:{id}});state.events=res.events;state.sync=res.sync;closeEvent();render();flash(res.sync?.ok?'Event removed. Discord updated.':'Event removed. Discord needs a refresh.',!res.sync?.ok)}catch(err){$('#event-error').textContent=err.message}finally{btn.disabled=false}}
async function syncNow(){const btn=$('#sync-btn');btn.disabled=true;try{const res=await api('sync',{method:'POST',body:{}});state.sync=res.sync;render();flash(res.sync.ok?'Discord schedule is up to date!':res.sync.error,!res.sync.ok)}catch(e){flash(e.message,true)}finally{btn.disabled=false}}
function setView(view){state.view=view;render();$('#sidebar').classList.remove('show')}
function navigate(direction){if(state.view==='month')state.focus=shiftMonth(state.focus,direction);else if(state.view==='week')state.focus=addDays(state.focus,direction*7);else state.focus=addDays(state.focus,direction*30);render()}
function attach(){
  $('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();const button=$('#login-form button');button.disabled=true;$('#login-error').textContent='';try{await api('login',{method:'POST',body:{password:$('#password').value}});$('#password').value='';await reload();showApp()}catch(err){showLogin(err.message)}finally{button.disabled=false}});
  $('#logout-btn').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:{}})}catch{}showLogin()});
  $$('[data-open-add]').forEach(b=>b.addEventListener('click',()=>openEvent()));
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
  $$('.tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.tab)));
  $('#today-btn').addEventListener('click',()=>{state.focus=todayEastern();render()});
  $('#prev-btn').addEventListener('click',()=>navigate(-1));$('#next-btn').addEventListener('click',()=>navigate(1));
  $('#menu-btn').addEventListener('click',()=>$('#sidebar').classList.toggle('show'));
  $$('[data-agenda]').forEach(b=>b.addEventListener('click',()=>setView('agenda')));
  $('#event-form').addEventListener('submit',saveEvent);$('#close-modal').addEventListener('click',closeEvent);$('#cancel-event').addEventListener('click',closeEvent);$('#delete-event').addEventListener('click',deleteEvent);
  $('#event-recurrence').addEventListener('change',()=>{$('#until-holder').hidden=$('#event-recurrence').value==='none'});
  $('#event-category').addEventListener('change',updateSharingDescription);$('#sync-btn').addEventListener('click',syncNow);
}
async function start(){attach();try{const res=await api('session');if(res.authenticated){await reload();showApp()}else showLogin()}catch(e){showLogin(e.message)}}
start();
