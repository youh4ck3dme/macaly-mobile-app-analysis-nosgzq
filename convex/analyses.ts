import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";

type ListResult =
  | { ok: true; analyses: Doc<"analyses">[] }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type GetResult =
  | { ok: true; analysis: Doc<"analyses"> }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };

type RemoveResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID"; message: string };

export const listMyAnalyses = query({
  args: {},
  handler: async (ctx): Promise<ListResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
    return { ok: true, analyses };
  },
});

export const getMyAnalysis = query({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args): Promise<GetResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const analysis = await ctx.db.get(args.analysisId);
    if (!analysis || analysis.ownerId !== userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K tejto analýze nemáte prístup.",
      };
    }
    return { ok: true, analysis };
  },
});

export const remove = mutation({
  args: { analysisId: v.id("analyses") },
  handler: async (ctx, args): Promise<RemoveResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const existing = await ctx.db.get(args.analysisId);
    if (!existing || existing.ownerId !== userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K tejto analýze nemáte prístup.",
      };
    }
    if (existing.status === "analyzing") {
      return {
        ok: false,
        code: "INVALID",
        message: "Prebiehajúcu analýzu nie je možné odstrániť.",
      };
    }
    await ctx.db.delete(args.analysisId);
    return { ok: true };
  },
});

// Interné helpery volané z node action (action nemá priamy db prístup).
export const insertAnalysis = internalMutation({
  args: {
    ownerId: v.id("users"),
    fileIds: v.array(v.id("files")),
    name: v.string(),
    data: v.any(),
    status: v.union(v.literal("analyzing"), v.literal("ready"), v.literal("error")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("analyses", {
      ownerId: args.ownerId,
      fileIds: args.fileIds,
      name: args.name,
      data: args.data,
      status: args.status,
      errorMessage: args.errorMessage,
      progress: 0,
      progressLabel: "Pripravuje sa analýza",
      createdAt: now,
      updatedAt: now,
    });
    return { analysisId: id };
  },
});

// Interná mutácia na sledovanie priebehu: percentá + krátky slovenský popis fázy.
export const updateAnalysisProgress = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    progress: v.number(),
    progressLabel: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db.get(args.analysisId);
    if (!existing) return null;
    await ctx.db.patch(args.analysisId, {
      progress: Math.max(0, Math.min(100, Math.round(args.progress))),
      progressLabel: args.progressLabel,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateAnalysis = internalMutation({
  args: {
    analysisId: v.id("analyses"),
    // Všetky polia sú voliteľné, aby akcia mohla aktualizovať len to, čo mení,
    // a neprepísala existujúce dáta alebo chybové hlásenie zbytočne.
    data: v.optional(v.any()),
    status: v.optional(
      v.union(v.literal("analyzing"), v.literal("ready"), v.literal("error")),
    ),
    errorMessage: v.optional(v.string()),
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.data !== undefined) patch.data = args.data;
    if (args.status !== undefined) patch.status = args.status;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    if (args.progress !== undefined) {
      patch.progress = Math.max(0, Math.min(100, Math.round(args.progress)));
    }
    if (args.progressLabel !== undefined) patch.progressLabel = args.progressLabel;
    const existing = await ctx.db.get(args.analysisId);
    if (!existing) return null;
    await ctx.db.patch(args.analysisId, patch);
    return null;
  },
});
