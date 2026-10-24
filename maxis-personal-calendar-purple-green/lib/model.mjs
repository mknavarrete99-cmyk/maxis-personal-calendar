export const TIME_ZONE = 'America/New_York';
export const CATEGORIES = ['appointments', 'groups', 'meetings', 'learning', 'personal'];
export const CATEGORY_INFO = {
  appointments: {label:'Appointments', icon:'📅'},
  groups: {label:'Groups & communities', icon:'🌿'},
  meetings: {label:'Meetings & events', icon:'🗓️'},
  learning: {label:'Classes & learning', icon:'📚'},
  personal: {label:'Personal', icon:'💜'}
};
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (v, limit) => String(v ?? '').trim().slice(0,limit);
export function dateValid(s) {
  if (!dateRe.test(String(s))) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s && s >= '2020-01-01' && s <= '2100-12-31';
}
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
export function shiftMonth(date, months) {
  const [y,m,d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y,m-1+months,1,12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth()+1,0,12)).getUTCDate();
  // Monthly recurring events on the 31st skip months without a 31st.
  if (d>last) return null;
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function todayEastern(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:TIME_ZONE, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const obj = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}
export function normaliseEvent(v) {
  if (!v || typeof v!=='object' || Array.isArray(v)) throw new Error('Invalid appointment.');
  const title = clean(v.title,110), category = clean(v.category,24), date=clean(v.date,10), time=clean(v.time,5);
  const recurrence = clean(v.recurrence || 'none', 12);
  const until = clean(v.until,10);
  const duration = Number(v.duration ?? 60);
  if (!title) throw new Error('Please add an event name.');
  if (!CATEGORIES.includes(category)) throw new Error('Choose an event category.');
  if (!dateValid(date)) throw new Error('Choose a valid event date.');
  if (time && !timeRe.test(time)) throw new Error('Choose a valid time or leave it blank for Time TBD.');
  if (!Number.isInteger(duration)||duration<15||duration>720) throw new Error('Duration must be between 15 and 720 minutes.');
  if (!['none','weekly','monthly'].includes(recurrence)) throw new Error('Invalid repeat option.');
  if (until && (!dateValid(until)||until<date)) throw new Error('The repeat end date must be after the start date.');
  return {
    title, category, date, time, duration, recurrence,
    until: recurrence==='none'?'':until,
    location:clean(v.location,160), notes:clean(v.notes,1200),
    share: v.share === true
  };
}
export function expandEvents(events, from, through) {
  const result=[];
  if (!dateValid(from)||!dateValid(through)||through<from) return result;
  for (const e of events) {
    if (!dateValid(e.date)) continue;
    const put = (date) => {if (date>=from && date<=through && (!e.until || date<=e.until)) result.push({...e, occurrenceDate:date});};
    if (e.recurrence==='weekly') {
      // Skip occurrences before the window, so old repeating events are cheap to expand.
      const diff = Math.floor((new Date(`${from}T12:00:00Z`)-new Date(`${e.date}T12:00:00Z`))/86400000);
      let count=Math.max(0,Math.floor(diff/7));
      for (let i=0;i<500;i++,count++) {const date=addDays(e.date,count*7); if(date>through || (e.until && date>e.until))break; put(date);}
    } else if (e.recurrence==='monthly') {
      const [sy,sm] = e.date.split('-').map(Number), [fy,fm] = from.split('-').map(Number);
      let count=Math.max(0,(fy-sy)*12+fm-sm-1);
      for(let i=0;i<1200;i++,count++) {
        const first = new Date(Date.UTC(sy,sm-1+count,1));
        const monthKey = first.toISOString().slice(0,7);
        if(monthKey>through.slice(0,7) || (e.until && monthKey>e.until.slice(0,7)))break;
        const date=shiftMonth(e.date,count); if(date)put(date);
      }
    } else put(e.date);
  }
  return result.sort((a,b)=> (a.occurrenceDate+(a.time || '99:99')+a.title).localeCompare(b.occurrenceDate+(b.time || '99:99')+b.title));
}
export function readableDate(date, opts={weekday:'long', month:'short', day:'numeric'}) {
  return new Intl.DateTimeFormat('en-US',{...opts,timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
}
export function readableTime(t) {
  if (!t) return 'Time TBD';
  const [h,m]=t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
}
export function safeDiscord(s, limit=115) {
  return String(s).replace(/[\r\n\t]+/g,' ').replace(/@/g,'＠').replace(/([\\*_~`|>])/g,'\\$1').slice(0,limit);
}
export function discordPayload(events, now = new Date()) {
  const start=todayEastern(now), end=addDays(start,44);
  const visible=expandEvents(events,start,end).filter(e=>e.share);
  let text='', shown=0, previousDay='';
  for (const e of visible) {
    const category=CATEGORY_INFO[e.category] || CATEGORY_INFO.personal;
    const label=e.category==='appointments'?'Appointment':e.title;
    const head=e.occurrenceDate===previousDay?'':`\n**${readableDate(e.occurrenceDate)}**\n`;
    const location=`   📍 ${e.location ? safeDiscord(e.location,160) : 'Location TBD'}\n`;
    const line=`${head}${category.icon} ${readableTime(e.time)} — ${safeDiscord(label)}${e.recurrence!=='none'?' ↻':''}\n${location}`;
    if (shown>=55 || text.length+line.length>3550) break;
    text+=line;shown++;previousDay=e.occurrenceDate;
  }
  if (!text) text='Nothing shared on the calendar for the next 45 days. 💚';
  if (shown<visible.length) text+=`\n_+${visible.length-shown} more events. Open the private calendar for the full schedule._`;
  return {
    username: 'Maxi’s Calendar',
    allowed_mentions: {parse:[]},
    embeds: [{
      title: '💜💚 Maxi’s Schedule · Upcoming Plans',
      description: text,
      color: 8146144,
      footer: {text:`Eastern Time (EST/EDT)  •  Next 45 days  •  ${shown} events shown`},
      timestamp: now.toISOString()
    }]
  };
}
