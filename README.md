# Orbit Backend

This folder contains the Next.js Orbit backend for the current demo.

## Run locally

```bash
# from C:\Users\User\Desktop\projects\Orbit\backend
cd backend
npm install
npm run build
npm run dev
```

## Local Instagram OAuth tunnel

Instagram Business Login will not save a plain `http://localhost:3000/...` redirect URL. For local Instagram OAuth testing, run the backend on port `3000` and expose it with a Cloudflare quick tunnel.

In a second terminal:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will print a temporary URL like:

```text
https://club-florist-edt-attempted.trycloudflare.com
```

Add the callback URL to `Orbit-backend/.env.local`:

```env
INSTAGRAM_REDIRECT_URI=https://YOUR-TUNNEL.trycloudflare.com/api/integrations/instagram/callback
```

Then restart the backend so Next.js reloads `.env.local`.

In Meta Developer Dashboard, go to:

```text
Instagram API -> API setup with Instagram login -> Set up Instagram business login
```

Paste the same callback URL exactly:

```text
https://YOUR-TUNNEL.trycloudflare.com/api/integrations/instagram/callback
```

Important:

- Keep the `cloudflared` terminal running while testing Instagram OAuth.
- If the tunnel is restarted, Cloudflare usually gives a new URL. Update both `.env.local` and Meta with the new callback URL.
- Tunnel port `3000`, not the Vite frontend port. The OAuth callback route lives in this Next backend.
- Do not use the webhook callback field for this. The OAuth redirect belongs under **Set up Instagram business login**.

After a production build, you can also run:

```bash
npx next start -p 3000
```

## Notes

- The frontend should proxy `/api` requests to the backend target.
- Default local backend target: `http://localhost:3000`
- Existing `.env` files were moved with the backend because they are used by the Next.js app.
- `studio_react_export` must not be evaluated, compiled, or executed in the browser. Frontend can show it as static text only.

## Publish approval behavior

- Non-sandbox (`SOCIAL_SANDBOX=false`): publish requires draft-level approval.
- Sandbox (`SOCIAL_SANDBOX=true`): publish allows a provided `draft_id` without draft-level approve for demo reliability.

## Workflow persistence

- Workflow state is in-memory only.
- Workflow data is lost on backend restart.
- `next dev` hot reload can clear in-memory workflow state.
- For stable demos use:

```bash
npm run clean
npm run build
# ensure SOCIAL_SANDBOX=true in .env
npx next start -p 3000
```
