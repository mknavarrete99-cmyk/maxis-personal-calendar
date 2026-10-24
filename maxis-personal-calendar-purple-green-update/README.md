# Maxi's Calendar — private purple & green planner with Discord sync

A fresh purple-and-green personal calendar for **appointments, groups, meetings, learning, and personal plans**. Everything is shown and entered in **America/New_York** time (EST in winter, EDT in summer).

It is a **separate project** from the old Discord slash-command bot. You do **not** need to install a Discord bot, purchase Supabase, or keep a PC running. It runs on Netlify and posts through a **Discord channel webhook**.

## What it does

- Password-protected personal calendar with **Month / Week / Agenda** views and category filters.
- Create, edit and delete events, including entries without a confirmed time. Untimed events show as **Time TBD** until you edit in a time later. Set a location, duration, and private notes.
- Optional **weekly / monthly repeats** (editing or deleting an event edits its entire series; there are no one-off exceptions yet).
- Toggle **Show on Discord** for each event.
- Every save/delete updates **the same webhook message** in your Discord channel rather than posting duplicates. You may pin that message in Discord once it appears. It shows shared events in the **next 45 days**, up to Discord's message length limit.
- **Automatic daily refresh** of that message so the date range keeps rolling even when nothing gets edited. It runs around **7:20 AM EST / 8:20 AM EDT**; it is a refresh, not a notification ping.
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
- **Pin the message** in the channel yourself if you want to keep it easy to find. Discord webhooks don't pin messages on their own.
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
- The webhook message is *edited*, so editing the calendar does **not** send a new Discord notification or ping every time. It keeps the channel clean.
- The calendar's dates and optional clock times are entered as **Eastern wall time**. Weekly repeats keep their local time across daylight-saving transitions.
- Netlify scheduled refresh uses UTC and thus changes its local time between EST and EDT; this is harmless because it's not a user-facing appointment.
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
