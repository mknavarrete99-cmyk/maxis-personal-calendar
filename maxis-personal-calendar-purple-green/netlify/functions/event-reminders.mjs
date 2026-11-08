import {sendStartReminders} from '../../lib/backend.mjs';
// Runs every minute; short lookback covers small scheduler delays.
export default async ()=>{
 const result=await sendStartReminders();
 if(!result.ok)console.warn('Discord start reminders:',result.errors||result.error);
 if(result.sent)console.log('Sent scheduled start reminders:',result.sent);
 return new Response(null,{status:204});
};
export const config={schedule:'* * * * *'};
