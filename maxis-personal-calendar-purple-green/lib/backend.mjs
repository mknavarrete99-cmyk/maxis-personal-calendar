import {getStore} from '@netlify/blobs';
import {discordPayload,discordChangePayload,discordDailyPayload,todayEastern} from './model.mjs';

const store = () => getStore({name:'maxi-private-calendar-v1',consistency:'strong'});
const KEY='calendar', MSG_KEY='discord-message', DAILY_KEY='discord-daily-agenda';
const webhook=()=> process.env.DISCORD_WEBHOOK_URL?.trim() || '';
export function validWebhook(url) {
  try {const u = new URL(url); return u.protocol==='https:' && ['discord.com','discordapp.com'].includes(u.hostname) && /^\/api\/webhooks\/\d{12,25}\/[\w-]{20,}$/.test(u.pathname) && !u.search && !u.hash;} catch {return false;}
}
export async function getCalendar() {
  const value = await store().get(KEY,{type:'json',consistency:'strong'});
  return {events:Array.isArray(value?.events)?value.events:[], revision:Number(value?.revision||0)};
}
export async function updateCalendar(operation) {
  const bucket=store();
  for (let attempt=0;attempt<5;attempt++) {
    const current=await bucket.getWithMetadata(KEY,{type:'json',consistency:'strong'});
    const data=current?.data && Array.isArray(current.data.events)?current.data:{events:[],revision:0};
    const nextEvents=operation(data.events);
    const result=await bucket.setJSON(KEY,{events:nextEvents,revision:data.revision+1},current?.etag?{onlyIfMatch:current.etag}:{onlyIfNew:true});
    if (result.modified) return {events:nextEvents,revision:data.revision+1};
  }
  throw new Error('Calendar was updated elsewhere. Please try again.');
}
export async function getSyncState() {return await store().get('discord-sync',{type:'json'}) || {ok:false,updatedAt:null,error:null};}
async function requestDiscord(url, method, body) {
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  if(!response.ok) {const info=(await response.text()).slice(0,180); const error=new Error(`Discord returned ${response.status}: ${info}`);error.status=response.status;throw error;}
  return await response.json();
}
export async function syncDiscord(now=new Date(), change=null) {
  const url=webhook();
  if(!url) {const outcome={ok:false,configured:false,error:'Add DISCORD_WEBHOOK_URL to Netlify to connect your Discord channel.',updatedAt:null};await store().setJSON('discord-sync',outcome);return outcome;}
  if(!validWebhook(url)) {const outcome={ok:false,configured:false,error:'Your Discord webhook URL is not valid.',updatedAt:null};await store().setJSON('discord-sync',outcome);return outcome;}
  try {
    const calendar=await getCalendar(), payload=discordPayload(calendar.events,now);
    const bucket=store();
    const prior=await bucket.get(MSG_KEY,{type:'json',consistency:'strong'});
    let messageId=prior?.id;
    if(messageId) {
      try {await requestDiscord(`${url}/messages/${messageId}`,'PATCH',payload);}
      catch (err) {if(err.status!==404 && err.status!==10008)throw err;messageId=null;}
    }
    if(!messageId) {
      const message=await requestDiscord(`${url}?wait=true`,'POST',payload);
      if(!/^\d+$/.test(String(message.id||'')))throw new Error('Discord did not return a message ID.');
      messageId=message.id;
      await bucket.setJSON(MSG_KEY,{id:messageId});
    }
    // Updates made from the calendar create a new notification; manual/daily refresh does not.
    const changePayload=discordChangePayload(change,now);
    let notice={sent:false};
    if(changePayload){
      try {
        await requestDiscord(`${url}?wait=true`,'POST',changePayload);
        notice={sent:true};
      } catch(err){
        console.error('Calendar change alert failed:',err);
        notice={sent:false,error:`Discord announcement failed: ${String(err.message||err).slice(0,160)}`};
      }
    }
    const daily=await postDailyAgenda(now,{create:false,events:calendar.events});
    if(!daily.ok)console.warn('Today’s daily agenda could not be refreshed:',daily.error);
    const state={ok:true,configured:true,error:null,updatedAt:now.toISOString(),revision:calendar.revision,notice};
    await bucket.setJSON('discord-sync',state);
    return state;
  } catch(error) {
    const state={ok:false,configured:true,error:`Discord could not be updated: ${String(error.message||error).slice(0,230)}`,updatedAt:null};
    await store().setJSON('discord-sync',state);
    return state;
  }
}


export async function postDailyAgenda(now=new Date(),{create=true,events=null}={}) {
  const url=webhook(), date=todayEastern(now);
  if(!url)return {ok:false,date,error:'Discord webhook is not configured.'};
  if(!validWebhook(url))return {ok:false,date,error:'Discord webhook URL is invalid.'};
  try{
    const bucket=store();
    const prior=await bucket.get(DAILY_KEY,{type:'json',consistency:'strong'});
    let messageId=prior?.date===date?prior?.id:null;
    if(!create&&!messageId)return {ok:true,skipped:true,date};
    const source=events??(await getCalendar()).events;
    const payload=discordDailyPayload(source,now);
    let posted=false;
    if(messageId){
      try{await requestDiscord(url+'/messages/'+messageId,'PATCH',payload);}
      catch(err){if(err.status!==404&&err.status!==10008)throw err;messageId=null;}
    }
    if(!messageId){
      if(!create)return {ok:true,skipped:true,date};
      const sent=await requestDiscord(url+'?wait=true','POST',payload);
      if(!/^\d+$/.test(String(sent.id||'')))throw new Error('Discord did not return the daily post ID.');
      messageId=sent.id;posted=true;
    }
    await bucket.setJSON(DAILY_KEY,{date,id:messageId,updatedAt:now.toISOString()});
    return {ok:true,date,posted,updated:!posted};
  }catch(error){
    return {ok:false,date,error:'Daily agenda could not be posted: '+String(error.message||error).slice(0,200)};
  }
}
