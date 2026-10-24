import {syncDiscord} from '../../lib/backend.mjs';
// A daily refresh keeps the rolling 45-day Discord agenda current even if nothing is edited.
// Runs at 12:20 UTC (7:20 AM EST or 8:20 AM EDT).
export default async () => {
  const result=await syncDiscord();
  if(!result.ok)console.warn('Scheduled Discord refresh:',result.error);
  return new Response(null,{status:204});
};
export const config={schedule:'20 12 * * *'};
