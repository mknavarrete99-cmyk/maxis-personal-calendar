import {syncDiscord,postDailyAgenda} from '../../lib/backend.mjs';
import {isDailyPostHour} from '../../lib/model.mjs';
// Netlify is UTC; 12:00 UTC = 8 AM EDT and 13:00 UTC = 8 AM EST.
export default async () => {
  const now=new Date();
  if(!isDailyPostHour(now))return new Response(null,{status:204});
  const summary=await syncDiscord(now);
  if(!summary.ok)console.warn('Scheduled calendar refresh:',summary.error);
  const agenda=await postDailyAgenda(now);
  if(!agenda.ok)console.warn('Scheduled daily upcoming events:',agenda.error);
  return new Response(null,{status:204});
};
export const config={schedule:'0 12,13 * * *'};
