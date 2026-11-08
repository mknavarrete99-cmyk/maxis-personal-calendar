import {getStore} from '@netlify/blobs';
import {discordPayload,discordChangePayloads,discordDailyPayloads,todayEastern,dueEventStarts,discordStartPayload} from './model.mjs';

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
async function requestDiscord(url,method,body){
 for(let attempt=0;attempt<5;attempt++){
  const hasBody=body!==undefined;
  const response=await fetch(url,{method,headers:hasBody?{'Content-Type':'application/json'}:{},
    body:hasBody?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
  if(response.status===429&&attempt<4){
   const data=await response.json().catch(()=>({retry_after:1}));
   await new Promise(resolve=>setTimeout(resolve,Math.min(5000,Math.max(500,Math.ceil(Number(data.retry_after||1)*1000)))));
   continue;
  }
  if(!response.ok){const e=new Error('Discord returned '+response.status+': '+(await response.text()).slice(0,180));e.status=response.status;throw e;}
  if(response.status===204)return null;
  const text=await response.text();return text?JSON.parse(text):null;
 }
 throw new Error('Discord rate limit did not clear.');
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
    const changePayloads=discordChangePayloads(change,now);
    let notice={sent:false};
    if(changePayloads.length){
      try {
        for(const message of changePayloads)await requestDiscord(url+'?wait=true','POST',message);
        notice={sent:true,parts:changePayloads.length};
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


export async function postDailyAgenda(now=new Date(),{create=true,events=null}={}){
 const url=webhook(),date=todayEastern(now);
 if(!url)return {ok:false,date,error:'Discord webhook is not configured.'};
 if(!validWebhook(url))return {ok:false,date,error:'Discord webhook URL is invalid.'};
 try{
  const bucket=store(),prior=await bucket.get(DAILY_KEY,{type:'json',consistency:'strong'});
  const old=prior?.date===date?[prior.id,...(prior.extraIds||[])].filter(Boolean):[];
  if(!create&&!old.length)return {ok:true,skipped:true,date};
  const pages=discordDailyPayloads(events??(await getCalendar()).events,now),ids=[];
  let posted=false;
  for(let i=0;i<pages.length;i++){
   let id=old[i]||null;
   if(id){try{await requestDiscord(url+'/messages/'+id,'PATCH',pages[i]);}catch(e){if(e.status!==404&&e.status!==10008)throw e;id=null;}}
   if(!id){
    const message=await requestDiscord(url+'?wait=true','POST',pages[i]);
    if(!/^\d+$/.test(String(message?.id||'')))throw new Error('Discord did not return a message ID.');
    id=message.id;posted=true;
   }
   ids.push(id);
  }
  for(const id of old.slice(pages.length)){
   try{await requestDiscord(url+'/messages/'+id,'DELETE');}
   catch(e){if(e.status!==404&&e.status!==10008)console.warn('Cannot remove old daily message:',e);}
  }
  await bucket.setJSON(DAILY_KEY,{date,id:ids[0],extraIds:ids.slice(1),updatedAt:now.toISOString()});
  return {ok:true,date,posted,updated:!posted,pages:pages.length};
 }catch(e){return {ok:false,date,error:'Daily agenda could not be posted: '+String(e.message||e).slice(0,200)};}
}


export async function sendStartReminders(now=new Date()){
 const url=webhook();
 if(!url||!validWebhook(url))return {ok:false,sent:0,error:'Discord webhook not configured.'};
 const calendar=await getCalendar(),bucket=store();
 const due=dueEventStarts(calendar.events,now,9);
 let sent=0,skipped=0;const errors=[];
 for(const e of due){
  const key='start-alert/'+e.id+'/'+e.occurrenceDate+'-'+e.time;
  try{
   const claim=await bucket.setJSON(key,{status:'sending',at:now.toISOString()},{onlyIfNew:true});
   if(!claim.modified){skipped++;continue;}
   try{
    await requestDiscord(url+'?wait=true','POST',discordStartPayload(e,now));
    await bucket.setJSON(key,{status:'sent',at:now.toISOString()});
    sent++;
   }catch(err){
    try{await bucket.delete(key);}catch(cleanErr){console.warn('Unable to release reminder claim:',cleanErr);}
    errors.push(String(err.message||err).slice(0,160));
   }
  }catch(err){errors.push(String(err.message||err).slice(0,160));}
 }
 return {ok:errors.length===0,sent,skipped,due:due.length,errors};
}
