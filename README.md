# macaly-mobile-app-analysis-nosgzq
Macaly chat https://www.macaly.com/chat/nosgzqflza19pn0bs55f4iba

## Produkcia

Convex deployment: `prod:decisive-terrier-395`

- Cloud: `https://decisive-terrier-395.eu-west-1.convex.cloud`
- Site: `https://decisive-terrier-395.eu-west-1.convex.site`
- Verejný web (`SITE_URL`): `https://forenx.bizagent.sk` (https, bez koncového lomítka)

Hosting frontu má mať `VITE_CONVEX_URL` a `VITE_CONVEX_SITE_URL` z `.env.example`. `npm run build` ich berie z `.env.production` (verejné URL, žiadne tajomstvá). Funkcie sa na produkciu zapisujú výhradne `npx convex deploy` (nie `npx convex dev`).

Convex env na tomto deploymente (iba mená, hodnoty cez `npx convex env set` alebo Macaly Secrets):

- `SITE_URL`
- `OTP_ENDPOINT`, `CHAT_ID`, `SECRET_KEY` (voliteľne `APP_NAME`) — bez nich auth deploy nespúšťaj
- `MISTRAL_API_KEY` alebo `MISTRAL_KEY` — len Convex env, nikdy `VITE_*`

Na `prod:decisive-terrier-395` nesmie byť `AUTH_DEV_OTP`. Chýbajúci `OTP_ENDPOINT` na hosted produkcii kód do logu nezapíše.

## Prihlásenie (OTP)

Produkcia volá `OTP_ENDPOINT` s poľami `email`, `token`, `chatId`, `appName` a `secretKey`. Provider `resend-otp` bez `OTP_ENDPOINT`, `CHAT_ID` alebo `SECRET_KEY` na hosted / `prod:` deploymente požiadavku neodošle a kód neloguje.

Lokálny backend (`npx convex dev`, deployment `anonymous:` / `local:`, alebo loopback `127.0.0.1`) bez týchto premenných remote endpoint nevolá. Kód sa vypíše do Convex server logu ako `[DEV OTP] email=… code=…` a UI prejde na zadanie kódu. Rovnaký fallback zapne `AUTH_DEV_OTP=1` na local/dev deploymente. Na `prod:` a na `decisive-terrier-395` sa tento flag ignoruje.

`.env.local` ani tajomstvá (`CONVEX_DEPLOY_KEY`, `SECRET_KEY`, `MISTRAL_KEY`, `MISTRAL_API_KEY`, OTP tokeny) nepatria do gitu. Vzor mien je v `.env.example`.

## Lokálny beh

1. `npm install`
2. `npx convex dev` — nechaj bežať. V logu sa objaví deployment URL a CLI ju zvyčajne zapíše do `.env.local` ako `VITE_CONVEX_URL`. Nespúšťaj ho proti `prod:decisive-terrier-395`.
3. Ak sa `.env.local` nevytvorí, skopíruj `.env.example` a pre lokálny backend prepíš `VITE_CONVEX_URL` na adresu z kroku 2. Hodnoty v `.env.example` sú verejné URL produkčného deploymentu.

4. `npm run dev` a otvor http://localhost:3000.

`.env.local` necommituj. Bez `VITE_CONVEX_URL` dev server nespadne na 500 — zobrazí sa obrazovka „Chýba VITE_CONVEX_URL — spusti convex dev“.
