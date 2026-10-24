import {getStore} from '@netlify/blobs';
import {discordPayload} from './model.mjs';

const store = () => getStore({name:'maxi-private-calendar-v1',consistency:'strong'});
const KEY='calendar', MSG_KEY='discord-message';
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
export async function syncDiscord(now=new Date()) {
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
    const state={ok:true,configured:true,error:null,updatedAt:now.toISOString(),revision:calendar.revision};
    await bucket.setJSON('discord-sync',state);
    return state;
  } catch(error) {
    const state={ok:false,configured:true,error:`Discord could not be updated: ${String(error.message||error).slice(0,230)}`,updatedAt:null};
    await store().setJSON('discord-sync',state);
    return state;
  }
}
