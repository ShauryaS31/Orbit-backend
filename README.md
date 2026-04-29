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
