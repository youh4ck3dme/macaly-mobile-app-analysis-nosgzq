# macaly-mobile-app-analysis-nosgzq
Macaly chat https://www.macaly.com/chat/nosgzqflza19pn0bs55f4iba

## Prihlásenie (OTP)

Produkcia a akýkoľvek hosted Convex deployment (`*.convex.cloud`, `CONVEX_DEPLOYMENT=prod:`) potrebuje `OTP_ENDPOINT`, `CHAT_ID` a `SECRET_KEY` (voliteľne `APP_NAME`). Provider `resend-otp` nimi odošle 6-miestny kód. Bez endpointu sa kód do logu nezapíše.

Lokálny backend (`npx convex dev`, deployment `anonymous:` / `local:`, alebo loopback `127.0.0.1`) bez týchto premenných remote endpoint nevolá. Kód sa vypíše do Convex server logu ako `[DEV OTP] email=… code=…` a UI prejde na zadanie kódu. Rovnaký fallback zapne `AUTH_DEV_OTP=1` na local/dev deploymente. Na `prod:` sa tento flag ignoruje.

`.env.local` ani tajomstvá (`CONVEX_DEPLOY_KEY`, `SECRET_KEY`, `MISTRAL_KEY`) nepatria do gitu. Vzor mien je v `.env.example`.

## Lokálny beh

1. `npm install`
2. `npx convex dev` — nechaj bežať. V logu sa objaví deployment URL a CLI ju zvyčajne zapíše do `.env.local` ako `VITE_CONVEX_URL`.
3. Ak sa `.env.local` nevytvorí, skopíruj `.env.example` a vlož URL:

   ```
   VITE_CONVEX_URL=https://<deployment>.convex.cloud
   ```

4. `npm run dev` a otvor http://localhost:3000.

`.env.local` necommituj. Bez `VITE_CONVEX_URL` dev server nespadne na 500 — zobrazí sa obrazovka „Chýba VITE_CONVEX_URL — spusti convex dev“.
