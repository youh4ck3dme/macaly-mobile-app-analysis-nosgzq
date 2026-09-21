# Plán: Přímá integrace Mistral API pro Sherlock AI

## Cíl
Nahradit současný platformový LLM gateway v Sherlock AI Analyzeru přímým serverovým voláním Mistral API. PDF dokumenty zůstanou soukromé a zpracování poběží výhradně v Convex Node Action.

## Bezpečnostní upozornění
- API klíč byl vložen do chatu. **Je potřeba jej po uložení v tajných proměnných v Mistral Console zneplatnit a vytvořit nový.**
- Klíč se nikdy nevloží do zdrojového kódu, frontendového bundlu ani do proměnných `VITE_*` / `NEXT_PUBLIC_*`.
- Do logů se nesmí zapisovat hlavičky, API klíče, celý obsah dokumentu ani osobní údaje.

## Implementační kroky

### 1. Bezpečně uložit konfiguraci
- Uložit `MISTRAL_API_KEY` přes spravované Macaly Secrets / env-vars rozhraní. Hodnota se synchronizuje do Convex prostředí.
- Přidat ne-tajnou konfigurační proměnnou `MISTRAL_MODEL`, aby šel model změnit bez úpravy kódu.
- Nechat použití přímého Mistral API pouze v Convex Node Action.

### 2. Vytvořit Mistral klienta v Convex
- Přidat například `convex/mistral.ts` s direktivou `"use node"`.
- Implementovat interní helper pro POST na oficiální Mistral chat endpoint:
  - autorizace jen přes `process.env.MISTRAL_API_KEY`,
  - nízká teplota pro konzistentní forenzní výstupy,
  - omezený počet výstupních tokenů,
  - timeout přes `AbortSignal.timeout`,
  - bezpečné chybové zprávy bez úniku odpovědi poskytovatele a bez tajných dat.
- Vynutit strukturovaný JSON výstup, pokud jej aktuální zvolený Mistral model podporuje. Jinak ponechat existující JSON validaci jako ochrannou vrstvu.

### 3. Napojit Sherlock analýzu
- V `convex/analyze.ts` nahradit `callMacalyJson(...)` voláním nového interního Mistral helperu.
- Zachovat současné bezpečnostní hranice:
  - přihlášení je povinné,
  - ověření vlastnictví každého vybraného souboru,
  - PDF text se načítá pouze z Convex Storage,
  - výsledek se ukládá pouze pod `ownerId` přihlášeného uživatele.
- Zachovat validaci povinných sekcí: `metadata`, `persons`, `evidence`, `relationships`, `timeline`.
- Při chybě označit uloženou analýzu jako `error` a uložit pouze stručnou bezpečnou hlášku do `errorMessage`.

### 4. Upravit uživatelské stavy
- V Sherlock UI zobrazit srozumitelné chyby pro:
  - chybějící konfiguraci Mistral API,
  - nedostupnost poskytovatele nebo timeout,
  - PDF bez extrahovatelného textu,
  - nevalidní AI JSON výstup.
- Zachovat současný průběh: nahrát/vybrat PDF → spustit analýzu → uložit a zobrazit timeline, osoby, důkazy a vztahy.

### 5. Ověření
- Nastavit nový klíč pouze přes Secrets, ne přes kód.
- Nasadit Convex funkce.
- Ověřit na testovacím textovém PDF kompletní tok: výběr souboru, analýza, validní uložený JSON, timeline, vyhledávání a opětovné otevření výsledku.
- Spustit `.sandbox/check-errors` a jeden browser průchod přihlášeného uživatele.

## Co se nebude dělat
- Žádné API volání z prohlížeče.
- Žádný klíč ve zdrojových souborech, commitu, logu ani UI.
- Žádné oslabení owner-scoped přístupu k souborům nebo analýzám.
- Žádný Express, Next.js ani samostatný backend. Zůstává TanStack Start + Convex.
- Žádné použití původního klíče z chatu po jeho rotaci.

## Todo
- [ ] Uložit nový Mistral klíč přes Secrets / env-vars
- [ ] Vytvořit bezpečný Mistral helper v Convex Node runtime
- [ ] Nahradit platformový LLM gateway v `convex/analyze.ts`
- [ ] Doplnit bezpečné chybové stavy Sherlock UI
- [ ] Nasadit Convex a provést end-to-end ověření
