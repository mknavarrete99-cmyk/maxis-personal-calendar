# Maxi's Calendar — private purple & green planner with Discord sync

A fresh purple-and-green personal calendar for **appointments, groups, meetings, learning, and personal plans**. Everything is shown and entered in **America/New_York** time (EST in winter, EDT in summer).

It is a **separate project** from the old Discord slash-command bot. You do **not** need to install a Discord bot, purchase Supabase, or keep a PC running. It runs on Netlify and posts through a **Discord channel webhook**.

## What it does

- Password-protected personal calendar with **Month / Week / Agenda** views and category filters.
- Create, edit and delete events, including entries without a confirmed time. Untimed events show as **Time TBD** until you edit in a time later. Set a location, duration, and private notes.
- Optional **weekly / monthly repeats** (editing or deleting an event edits its entire series; there are no one-off exceptions yet).
- Toggle **Show on Discord** for each event.
- Every save/delete updates **the same webhook message** in your Discord channel rather than posting duplicates. You may pin that message in Discord once it appears. It shows shared events in the **next 45 days**, up to Discord's message length limit.
- **Daily Discord message at 8:00 AM Eastern** shows the upcoming seven days with locations and descriptions. The main 45-day schedule also refreshes daily. Scheduled functions run at 12:00 and 13:00 UTC, but a New York timezone check makes the daily post happen at **8:00 AM Eastern** in either season.
- Events with **Show on Discord** enabled display their **date, time (or Time TBD), and location** if provided. Appointments are deliberately generalized to **“Appointment”** (the event title is hidden), and private notes are never sent. Do not put patient-identifying details in location text.
- Calendar data is stored in site-scoped **Netlify Blobs**, not a Supabase database.

**Important:** The project does not automatically pull appointments from any existing calendar. Add those to this private planner manually for now. A later integration could sync them, but that requires knowing how the original calendar stores its events.

## Setup — Netlify + Discord (Git-based deploy)

### 1. Make your Discord webhook

1. In Discord, open **Server Settings → Integrations → Webhooks** (or the target channel's integrations).
2. Choose **New Webhook**. Name it `Maxi’s Calendar` and select the channel where Livy should see your schedule, for example `#maxis-schedule`.
3. Choose **Copy Webhook URL**. Treat the URL like a password: **never paste it into code or public messages**. Anyone who has that URL can post to that channel.

No bot token, Discord Developer Portal app, or slash commands are needed.

### 2. Put the code in a GitHub repo

1. Extract the ZIP on your computer.
2. Create a new **private** GitHub repository. (You can use a public one if you want, since no real secrets are included, but private is preferable.)
3. Upload **the extracted folder's contents** to the root of the repository: `public`, `lib`, `netlify`, `package.json`, `netlify.toml`, etc.
4. Do **not** upload `.env` files containing passwords or webhook URLs. `.env.example` is safe, as it contains placeholder values only.

### 3. Import to Netlify

1. Go to [Netlify](https://app.netlify.com/) → **Add new project → Import an existing project**.
2. Connect your GitHub account and select your new repository.
3. The included `netlify.toml` specifies build command **`npm run build`** and publish directory **`public`**. Your dependencies and Functions will deploy automatically.
4. Deploy. Then set the environment variables below, and redeploy so the Functions see them.

**A Git-based Netlify deployment is required.** Drag-and-dropping the static `public` folder alone does not deploy the server functions or save your appointments.

### 4. Add your three environment variables

In Netlify, go to **Project configuration → Environment variables → Add a variable** (look for a similar label if the UI has changed). Add these three keys, one by one:

| Key | Value |
| --- | --- |
| `ADMIN_PASSWORD` | Your own strong, unique calendar password (use at least 16 characters). |
| `SESSION_SECRET` | A separate long random secret string **at least 32 characters**, ideally 64 random hex characters. |
| `DISCORD_WEBHOOK_URL` | The Discord webhook URL copied from the channel. |

Use **Functions** runtime scope (or all scopes), and do not commit these to GitHub. To generate a random session secret on a machine with Node installed, run:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

After setting them, **trigger a new Netlify deploy** if the application was already deployed. Never share these values with anyone.

### 5. Open your new calendar

Open your new `https://your-project.netlify.app` address. Enter your `ADMIN_PASSWORD`.

- Press **Add event**, name it, choose one of the five calendars, add a date and optionally a time **in Eastern Time**, then save. Leave the time empty if undecided: the calendar and Discord will show **Time TBD**, and you can click the event to edit it later.
- Leave **Show on Discord** checked if Livy should see the entry. For an Appointments event, Discord only receives the generic title **Appointment**, plus its date, time (or Time TBD), and location if entered.
- The first save creates the webhook message; later edits update that same message. Alternatively, press **Refresh Discord** to create an initial “no appointments” message.
- **Pin the main schedule message** in the channel yourself if you want to keep it easy to find. Discord webhooks don't pin messages on their own.
- Click **☀ Post today's upcoming events** in the calendar sidebar to send or refresh today's daily summary immediately. The same day's post gets edited when appointments change.
- Want an event just for you? Uncheck **Show on Discord**. It stays in the private planner but isn't sent to the channel.

If Discord fails during a save, the calendar **still saves** the appointment and shows a warning. Check your `DISCORD_WEBHOOK_URL` and press **Refresh Discord** to retry.

## Example shared Discord message (sample only)

> **💜💚 Maxi's Schedule · Upcoming Plans**  
> **Monday, October 26**  
> 📅 11:00 AM — Appointment  
> &nbsp;&nbsp; 📍 Second Life  
> 🌿 Time TBD — Group catch-up  
> &nbsp;&nbsp; 📍 Discord voice chat  
> **Tuesday, October 27**  
> 🗓️ 8:00 PM — Team meeting  
>
> *Eastern Time (EST/EDT) · Next 45 days*

The starter calendar is **empty**, with no fabricated events.

## Privacy and practical limits

- This is a **single-owner**, shared-password application, with an HTTP-only, signed, same-site session cookie that expires after seven days. It is suitable for general schedule details, **not confidential medical records or HIPAA-protected patient information**.
- Do not enter patient names, medical details, or identifying information in event titles/notes. The cloud storage is for general appointments, not medical data.
- All cloud-stored appointment data resides in **Netlify Blobs**. Blobs has usage limits and is not a relational database. It is appropriate for a small personal calendar with infrequent updates; it is not intended as a multi-user scheduling platform.
- Appointments are **not yet imported or synchronized** from another calendar. No external calendar provider is connected.
- The Discord message displays the **upcoming 45 days**, not a full multi-year history, and long schedules may be truncated by Discord's embed limits.
- Only shared events are sent to Discord. **Locations are shown** for shared events if entered; private notes are never sent. Appointments entries are generalized by design.
- The main 45-day schedule is edited in place, and changing a shared event posts a separate event-change notification. Each morning creates one fresh seven-day agenda message, updated in place during the rest of that day. Discord does not automatically notify Livy when an existing message is edited.
- The calendar's dates and optional clock times are entered as **Eastern wall time**. Weekly repeats keep their local time across daylight-saving transitions.
- Netlify scheduled functions use UTC, so the refresh function runs at 12:00 and 13:00 UTC but acts only when local New York time is 8:00 AM, supporting both EST and EDT.
- If your webhook is deleted or the Discord message is removed, clicking **Refresh Discord** creates a new message.
- Be careful with GitHub pull-request **Deploy Previews** and Netlify Blobs (site-scoped Blobs are shared between deploys). The application blocks access via its API on branch deploys and deploy previews to protect production events. Use your published production address for the real calendar.
- You can change `ADMIN_PASSWORD` or `SESSION_SECRET` in Netlify to revoke existing sessions (changing the password alone does not revoke an already-issued session until the cookie expires; rotate **both** to revoke sessions immediately).

## Updating your existing live calendar

If you already deployed the purple-and-green version to Netlify from GitHub, **do not make a new Netlify site**. Extract this updated ZIP, upload/replace the code files **in the same GitHub repository** (commit the changes), and Netlify should deploy the update to the same URL. **Do not delete the existing Netlify site**, since its site-scoped Netlify Blobs store your saved events and Discord message ID. Keep your existing three Netlify environment variables: `ADMIN_PASSWORD`, `SESSION_SECRET`, and `DISCORD_WEBHOOK_URL`.

After the deploy, open the calendar, add an event with a date but no time and a location, keep **Show on Discord** on, and save. Discord should display **Time TBD** and **📍 location**. Click that event to edit its time later. The same Discord message should update.

## Testing and troubleshooting

For JavaScript logic unit tests, run:

```bash
npm install
npm test
```

For local Netlify development, use the Netlify CLI (`npx netlify dev`), with local environment variables provided. Netlify Dev uses sandboxed local Blobs, not production data.

**If the page says “Calendar setup incomplete”:** check both `ADMIN_PASSWORD` and `SESSION_SECRET` and redeploy.

**If the page loads but appointments don't save:** open Netlify's **Functions logs**; make sure the deploy includes the `api` function and you created the site via Git import, not static drag-and-drop.

**If Discord doesn't update:** verify that the webhook URL is from a Discord channel you can access, that it's correctly set in Netlify, and then press **Refresh Discord**. A missing webhook leaves calendar editing functional.

**If you see a time conversion concern:** All calendar inputs are Eastern wall-clock times; the app never assumes your computer's timezone when storing an event.

## Longer public descriptions

The description box now supports up to **12,000 characters**, rather than 400. Longer descriptions are sent in additional Discord notification messages and extra pages of the daily seven-day agenda so Livy can read the complete description. The pinned 45-day overview shows a shorter preview to avoid filling the whole channel. Truly unlimited text is not possible because Discord and Netlify have request and message limits. Keep patient-identifying information out of shared descriptions.


## Reminder when an event starts

A Netlify scheduled function checks every minute for events whose confirmed Eastern Time start time has arrived. It posts a fresh Discord webhook message showing the shared title, date, time, location and a short public description. **Show on Discord** and **Notify Discord when event starts** must both be checked. Existing shared events default to alerts enabled. Unconfirmed times are skipped. Weekly and monthly repeats are handled, and a persisted per-occurrence marker prevents duplicate alerts. A ten-minute lookback handles minor scheduler delays. Your Discord app's channel notification settings control push alerts; a webhook does not automatically ping members. One-minute polling adds Netlify Functions usage and is subject to plan limits.
