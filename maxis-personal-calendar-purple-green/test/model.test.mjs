import test from 'node:test';import assert from 'node:assert/strict';
import {normaliseEvent,expandEvents,addDays,shiftMonth,todayEastern,discordPayload,dateValid} from '../lib/model.mjs';
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
