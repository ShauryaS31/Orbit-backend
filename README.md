# Orbit Backend

This folder contains the Next.js Orbit backend for the current demo.

## Run locally

```bash
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
