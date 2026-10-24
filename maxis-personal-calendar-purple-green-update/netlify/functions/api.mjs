import {createHmac,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {getCalendar,updateCalendar,getSyncState,syncDiscord} from '../../lib/backend.mjs';
import {normaliseEvent} from '../../lib/model.mjs';

const noStore={ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
function respond(data,status=200,extra={}) {return new Response(JSON.stringify(data),{status,headers:{...noStore,...extra}});}
function secret() {return process.env.SESSION_SECRET||'';}
function pass() {return process.env.ADMIN_PASSWORD||'';}
function equal(a,b) {const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
function sign(payload) {return createHmac('sha256',secret()).update(payload).digest('base64url');}
function sessionOK(req) {
  if (!secret()) return false;
  const cookie=req.headers.get('cookie')||'';
  const encoded=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('maxi_session='))?.split('=').slice(1).join('=');
  if(!encoded) return false;
  const [timestamp,mac]=encoded.split('.');
  if (!/^\d{10,13}$/.test(timestamp||'')||!mac)return false;
  const expected=sign(timestamp);
  if(!equal(mac,expected))return false;
  const age=Date.now()-Number(timestamp);
  return age>=0 && age<7*86400000;
}
function tokenCookie(req, val,clear=false) {
  const local = new URL(req.url).hostname==='localhost';
  return `maxi_session=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:604800}${local?'':'; Secure'}`;
}
function isValidOrigin(req) {
  const origin=req.headers.get('origin');
  if(!origin)return true; // Non-browser API clients still need valid signed session
  try{return new URL(origin).host===new URL(req.url).host && new URL(origin).protocol===new URL(req.url).protocol;}catch{return false;}
}
async function readBody(req){
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw new Error('Please send JSON.');
  const text=await req.text();if(text.length>16000)throw new Error('Request is too long.');
  return JSON.parse(text || '{}');
}
export default async (req) => {
  if(['deploy-preview','branch-deploy'].includes(process.env.CONTEXT||''))return respond({error:'For safety, manage your real calendar on your published production website.'},503);
  if(!pass()||secret().length<32)return respond({error:'Calendar setup incomplete. Set ADMIN_PASSWORD and a SESSION_SECRET of 32+ characters in Netlify.'},503);
  const action=new URL(req.url).searchParams.get('action')||'events';
  if(!['GET','POST'].includes(req.method))return respond({error:'Method not allowed.'},405);
  if(req.method==='POST' && !isValidOrigin(req))return respond({error:'Invalid request origin.'},403);
  try {
    if(action==='session' && req.method==='GET')return respond({authenticated:sessionOK(req)});
    if(action==='login'&&req.method==='POST') {
      const body=await readBody(req);
      if(typeof body.password!=='string'||!equal(body.password,pass()))return respond({error:'Incorrect password.'},401);
      const timestamp=String(Date.now());
      return respond({ok:true},200,{'Set-Cookie':tokenCookie(req,`${timestamp}.${sign(timestamp)}`)});
    }
    if(action==='logout'&&req.method==='POST')return respond({ok:true},200,{'Set-Cookie':tokenCookie(req,'',true)});
    if(!sessionOK(req))return respond({error:'Please sign in again.'},401);
    if(action==='events'&&req.method==='GET') {
      const [{events,revision},sync]=await Promise.all([getCalendar(),getSyncState()]);
      return respond({events,revision,sync});
    }
    if(action==='save'&&req.method==='POST') {
      const body=await readBody(req), event=normaliseEvent(body);
      const id=body.id ? String(body.id) : randomUUID();
      if(!/^[0-9a-f-]{36}$/i.test(id))return respond({error:'Invalid appointment ID.'},400);
      let updated=false;
      const result=await updateCalendar((events)=>{
        const current=events.find(e=>e.id===id);
        if(body.id && !current)throw new Error('Appointment not found.');
        updated=Boolean(current);
        return [...events.filter(e=>e.id!==id),{...event,id,createdAt:current?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}];
      });
      const sync=await syncDiscord();
      return respond({ok:true,updated,eventId:id,events:result.events,sync});
    }
    if(action==='delete'&&req.method==='POST') {
      const {id}=await readBody(req);
      if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return respond({error:'Invalid appointment ID.'},400);
      const result=await updateCalendar((events)=>{
        if(!events.some(e=>e.id===id))throw new Error('Appointment not found.');
        return events.filter(e=>e.id!==id);
      });
      const sync=await syncDiscord();
      return respond({ok:true,events:result.events,sync});
    }
    if(action==='sync'&&req.method==='POST') {await readBody(req);return respond({sync:await syncDiscord()});}
    return respond({error:'Unknown action.'},404);
  }catch(error) {
    console.error('Calendar API:',error);
    if(error instanceof SyntaxError)return respond({error:'Invalid JSON.'},400);
    if(/^(Invalid|Please|Choose|Duration|Appointment|The repeat|Calendar was updated)/.test(error.message))return respond({error:error.message},400);
    return respond({error:'Something went wrong. Please retry or check Netlify function logs.'},500);
  }
};

export const config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:40}};
