import test from 'node:test';import assert from 'node:assert/strict';
import {normaliseEvent,expandEvents,addDays,shiftMonth,todayEastern,discordPayload,discordChangePayload,discordDailyPayload,isDailyPostHour,dateValid} from '../lib/model.mjs';
const base={id:'x',title:'Team meetup',category:'groups',date:'2026-10-26',time:'19:00',duration:60,recurrence:'none',until:'',share:true,notes:'PRIVATE'};
test('date verification and rollover',()=>{assert.equal(dateValid('2026-02-29'),false);assert.equal(dateValid('2028-02-29'),true);assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(shiftMonth('2026-01-31',1),null);});
test('weekly repeats across daylight savings keep their eastern wall time',()=>{const e={...base,recurrence:'weekly',date:'2026-10-26',until:'2026-11-16'};assert.deepEqual(expandEvents([e],'2026-10-26','2026-11-16').map(x=>[x.occurrenceDate,x.time]),[['2026-10-26','19:00'],['2026-11-02','19:00'],['2026-11-09','19:00'],['2026-11-16','19:00']]);});
test('monthly repeats skip short months',()=>{const e={...base,recurrence:'monthly',date:'2026-01-31'};assert.deepEqual(expandEvents([e],'2026-01-01','2026-04-30').map(x=>x.occurrenceDate),['2026-01-31','2026-03-31']);});
test('validates event, notes and length',()=>{assert.equal(normaliseEvent(base).title,'Team meetup');assert.throws(()=>normaliseEvent({...base,time:'25:88'}));assert.throws(()=>normaliseEvent({...base,category:'unknown'}));});
test('eastern date follows daylight savings with known UTC samples',()=>{assert.equal(todayEastern(new Date('2026-01-02T03:10:00Z')),'2026-01-01');assert.equal(todayEastern(new Date('2026-07-02T03:10:00Z')),'2026-07-01');});
test('Discord summary hides appointment title and all private notes, permits no mentions',()=>{
  const now=new Date('2026-10-25T12:00:00Z');const events=[base,{...base,id:'z',category:'appointments',title:'Patient Jane Medical Appointment',notes:'super secret',time:'11:00'},{...base,id:'q',title:'@everyone secret plan',share:false}];const msg=discordPayload(events,now);const raw=JSON.stringify(msg);
  assert.match(raw,/Team meetup/);assert.match(raw,/Appointment/);assert.doesNotMatch(raw,/Clinic appointment|Vespertine/);assert.doesNotMatch(raw,/Patient Jane|super secret|PRIVATE|@everyone/);assert.deepEqual(msg.allowed_mentions,{parse:[]});
});

test('accepts an event with no time and rejects invalid non-empty times',()=>{
  const event=normaliseEvent({...base,time:'',location:'Discord voice lounge'});
  assert.equal(event.time,'');
  assert.equal(event.location,'Discord voice lounge');
  assert.throws(()=>normaliseEvent({...base,time:'24:00'}));
  assert.throws(()=>normaliseEvent({...base,time:'not sure'}));
});
test('Discord shows location and Time TBD, but never private notes, and updates when time is assigned',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const draft=normaliseEvent({...base,time:'',location:'Second Life · Green River',notes:'Private reminder',share:true});
  const initial=discordPayload([{...draft,id:'a'}],now);
  assert.match(initial.embeds[0].description,/Time TBD — Team meetup/);
  assert.match(initial.embeds[0].description,/📍 Second Life · Green River/);
  assert.doesNotMatch(JSON.stringify(initial),/Private reminder/);
  const edited=normaliseEvent({...draft,time:'19:45',location:'Discord VC',share:true});
  const updated=discordPayload([{...edited,id:'a'}],now);
  assert.match(updated.embeds[0].description,/7:45 PM — Team meetup/);
  assert.match(updated.embeds[0].description,/📍 Discord VC/);
  assert.doesNotMatch(updated.embeds[0].description,/Time TBD/);
});
test('untimed events sort after timed events on a day',()=>{
  const a={...base,id:'a',time:'',title:'Unknown time'};
  const b={...base,id:'b',time:'08:15',title:'Early event'};
  const events=expandEvents([a,b],'2026-10-26','2026-10-26');
  assert.deepEqual(events.map(e=>e.title),['Early event','Unknown time']);
});
test('Discord generalizes appointment title but shows explicitly shared location safely',()=>{
  const event={...base,category:'appointments',title:'Private patient full name',location:'@everyone\nPrivate room',time:'',notes:'do not share'};
  const result=discordPayload([event],new Date('2026-10-25T12:00:00Z'));
  const out=JSON.stringify(result);
  assert.match(out,/Time TBD — Appointment/);
  assert.match(out,/📍 ＠everyone Private room/);
  assert.doesNotMatch(out,/Private patient full name|do not share/);
  assert.deepEqual(result.allowed_mentions,{parse:[]});
});

test('Discord shows location pending when none entered',()=>{
  const result=discordPayload([{...base,location:''}],new Date('2026-10-25T12:00:00Z'));
  assert.match(result.embeds[0].description,/📍 Location TBD/);
});

test('Posts separate change alerts with date, time and location, but never notes',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const event={...base,share:true,location:'Discord lounge',time:'',notes:'private medical information'};
  for(const action of ['added','updated','removed']){
    const alert=discordChangePayload({action,event},now);
    const raw=JSON.stringify(alert);
    assert.match(raw,/Team meetup|Time TBD|Discord lounge/);
    assert.match(raw,/Time TBD/);
    assert.match(raw,/Discord lounge/);
    assert.doesNotMatch(raw,/private medical information/);
    assert.deepEqual(alert.allowed_mentions,{parse:[]});
  }
});
test('Private events never generate change alerts, and unshared events remain anonymous',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  assert.equal(discordChangePayload({action:'added',event:{...base,share:false}},now),null);
  assert.equal(discordChangePayload(null,now),null);
  const alert=JSON.stringify(discordChangePayload({action:'unshared'},now));
  assert.match(alert,/no longer shared/);
  assert.doesNotMatch(alert,/Team meetup/);
});
test('Announcement hides medical appointment name and safely prevents mass mentions',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const medical=JSON.stringify(discordChangePayload({action:'updated',event:{...base,title:'Private Jane Patient',category:'appointments',location:'',notes:'private patient record',share:true}},now));
  assert.match(medical,/Appointment|Location TBD/);
  assert.doesNotMatch(medical,/Private Jane Patient|private patient record/);
  const others=JSON.stringify(discordChangePayload({action:'added',event:{...base,title:'@everyone',location:'@here meeting',share:true}},now));
  assert.doesNotMatch(others,/@everyone|@here/);
  assert.match(others,/＠everyone/);
});

test('public event description is saved separately from private notes',()=>{
  const x=normaliseEvent({...base,description:'Come hang out! 💚',notes:'Do not share'});
  assert.equal(x.description,'Come hang out! 💚');
  assert.equal(x.notes,'Do not share');
  assert.equal(normaliseEvent({...base}).description,'');
  assert.equal(normaliseEvent({...base,description:'x'.repeat(999)}).description.length,400);
});
test('public description appears in schedule and add/edit notifications',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const x=normaliseEvent({...base,description:'Bring snacks for movie night 💜',location:'Discord VC',notes:'PRIVATE REMINDER',share:true});
  const schedule=JSON.stringify(discordPayload([x],now));
  assert.match(schedule,/📝 Bring snacks for movie night 💜/);
  assert.match(schedule,/📍 Discord VC/);
  assert.doesNotMatch(schedule,/PRIVATE REMINDER/);
  for(const action of ['added','updated','removed']){
    const notification=JSON.stringify(discordChangePayload({action,event:x},now));
    assert.match(notification,/📝 Bring snacks for movie night 💜/);
    assert.doesNotMatch(notification,/PRIVATE REMINDER/);
  }
});
test('private descriptions are not shared and special mentions are escaped',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const draft=normaliseEvent({...base,description:'@everyone Be there at *nine*',share:true});
  const safe=JSON.stringify(discordPayload([draft],now));
  assert.doesNotMatch(safe,/@everyone/);
  assert.match(safe,/＠everyone/);
  assert.match(safe,/\\\\\*nine\\\\\*/);
  const privateDraft={...draft,share:false};
  assert.doesNotMatch(JSON.stringify(discordPayload([privateDraft],now)),/＠everyone/);
  assert.equal(discordChangePayload({action:'added',event:privateDraft},now),null);
});


test('daily post time stays at 8 AM Eastern across daylight-saving time',()=>{
  assert.equal(isDailyPostHour(new Date('2026-01-02T13:00:00Z')),true);
  assert.equal(isDailyPostHour(new Date('2026-01-02T12:00:00Z')),false);
  assert.equal(isDailyPostHour(new Date('2026-07-02T12:00:00Z')),true);
  assert.equal(isDailyPostHour(new Date('2026-07-02T13:00:00Z')),false);
  assert.equal(isDailyPostHour(new Date('2026-11-01T13:00:00Z')),true);
});
test('daily digest includes upcoming shared events and location/description, never private fields',()=>{
  const now=new Date('2026-10-25T12:00:00Z');
  const entries=[
    {...base,date:'2026-10-25',time:'',location:'Discord voice',description:'Bring snacks 💜',notes:'SECRET'},
    {...base,id:'c',date:'2026-10-31',category:'appointments',title:'Patient Jane',description:'Arrive early'},
    {...base,id:'d',date:'2026-11-01',title:'Not in seven days'},
    {...base,id:'e',date:'2026-10-27',title:'Hidden event',share:false}
  ];
  const payload=discordDailyPayload(entries,now);
  const output=JSON.stringify(payload);
  assert.match(output,/Time TBD/);
  assert.match(output,/Discord voice/);
  assert.match(output,/Bring snacks 💜/);
  assert.match(output,/Arrive early/);
  assert.match(output,/Appointment/);
  assert.doesNotMatch(output,/Patient Jane|SECRET|Not in seven days|Hidden event/);
  assert.deepEqual(payload.allowed_mentions,{parse:[]});
});
test('daily digest displays empty upcoming weeks and repeating events',()=>{
  const now=new Date('2026-11-03T13:00:00Z');
  assert.match(discordDailyPayload([],now).embeds[0].description,/No events shared/);
  const repeating={...base,date:'2026-10-20',recurrence:'weekly',time:'',description:'Weekly note'};
  const payload=discordDailyPayload([repeating],now);
  assert.match(payload.embeds[0].description,/Weekly note|Time TBD/);
});
