import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

type EnqueueResult =
  | { ok: true; analysisId: string; deduplicated: boolean }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID"; message: string };

// Rovnaký súborový set od rovnakého vlastníka sa v tomto okne neplánuje znova.
const DEDUP_WINDOW_MS = 15 * 60 * 1000;

/**
 * Publikácia analýzy do frontu: overí prihlásenie a vlastníctvo súborov,
 * deduplikuje čerstvé duplicitné požiadavky a naplánuje spracovanie.
 *
 * Musí zostať v predvolenom Convex runtime. `analyze.ts` má `"use node"`
 * a v Node.js runtime Convex dovolí iba actions — mutácia v tom súbore
 * zhodí celý `npx convex dev` push, vrátane auth.
 */
export const enqueue = mutation({
  args: { fileIds: v.array(v.id("files")) },
  handler: async (ctx, args): Promise<EnqueueResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { ok: false, code: "UNAUTHENTICATED", message: "Musíte byť prihlásený." };
    }
    if (!args.fileIds || args.fileIds.length === 0) {
      return { ok: false, code: "INVALID", message: "Vyberte aspoň jeden súbor na analýzu." };
    }

    // Overenie vlastníctva všetkých súborov (priama čítacia kontrola v mutácii).
    for (const fileId of args.fileIds) {
      const file = await ctx.db.get(fileId);
      if (!file || file.ownerId !== userId) {
        return { ok: false, code: "FORBIDDEN", message: "K niektorému súboru nemáte prístup." };
      }
    }

    // Deduplikácia: rovnaký súborový set od rovnakého vlastníka vo fronte
    // alebo v spracovaní a mladší ako 15 minút sa neplánuje znova.
    const signature = [...args.fileIds].sort().join("|");
    const now = Date.now();
    for (const status of ["queued", "processing"] as const) {
      const recent = await ctx.db
        .query("analyses")
        .withIndex("by_status", (q) => q.eq("ownerId", userId).eq("status", status))
        .order("desc")
        .take(20);
      for (const row of recent) {
        if (now - row.createdAt >= DEDUP_WINDOW_MS) continue;
        if ([...row.fileIds].sort().join("|") === signature) {
          return { ok: true, analysisId: row._id, deduplicated: true };
        }
      }
    }

    const name = `Analýza ${new Date().toLocaleDateString("sk-SK")}`;
    const insertResult = await ctx.runMutation(internal.analyses.insertAnalysis, {
      ownerId: userId,
      fileIds: args.fileIds,
      name,
      data: null,
      status: "queued",
      attempts: 1,
    });
    await ctx.runMutation(internal.analyses.updateAnalysisProgress, {
      analysisId: insertResult.analysisId,
      progress: 0,
      progressLabel: "Analýza je vo fronte",
    });
    const scheduled: Promise<string> = ctx.scheduler.runAfter(0, internal.analyze.runAnalysis, {
      analysisId: insertResult.analysisId,
      attempt: 1,
    });
    void scheduled;
    return { ok: true, analysisId: insertResult.analysisId, deduplicated: false };
  },
});
