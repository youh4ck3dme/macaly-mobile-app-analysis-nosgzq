# macaly-mobile-app-analysis-nosgzq
Macaly chat https://www.macaly.com/chat/nosgzqflza19pn0bs55f4iba

## Lokálny beh

1. `npm install`
2. `npx convex dev` — nechaj bežať. V logu sa objaví deployment URL a CLI ju zvyčajne zapíše do `.env.local` ako `VITE_CONVEX_URL`.
3. Ak sa `.env.local` nevytvorí, skopíruj `.env.example` a vlož URL:

   ```
   VITE_CONVEX_URL=https://<deployment>.convex.cloud
   ```

4. `npm run dev` a otvor http://localhost:3000.

`.env.local` necommituj. Bez `VITE_CONVEX_URL` dev server nespadne na 500 — zobrazí sa obrazovka „Chýba CONVEX_URL — spusti convex dev“.
