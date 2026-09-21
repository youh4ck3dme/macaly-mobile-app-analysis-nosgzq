import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";

type ListResult =
  | { ok: true; cases: Doc<"cases">[] }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type CreateResult =
  | { ok: true; caseId: string }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID"; message: string };

type UpdateResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID"; message: string };

type RemoveResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };

export const list = query({
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
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
    return { ok: true, cases };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    priority: v.string(),
  },
  handler: async (ctx, args): Promise<CreateResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const title = args.title.trim();
    if (!title) {
      return {
        ok: false,
        code: "INVALID",
        message: "Názov prípadu je povinný.",
      };
    }
    const caseId = await ctx.db.insert("cases", {
      ownerId: userId,
      title,
      description: args.description?.trim() || undefined,
      status: args.status,
      priority: args.priority,
      createdAt: Date.now(),
    });
    return { ok: true, caseId };
  },
});

export const update = mutation({
  args: {
    id: v.id("cases"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<UpdateResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.ownerId !== userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K tomuto prípadu nemáte prístup.",
      };
    }
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) {
      const trimmed = args.title.trim();
      if (!trimmed) {
        return {
          ok: false,
          code: "INVALID",
          message: "Názov prípadu nemôže byť prázdny.",
        };
      }
      patch.title = trimmed;
    }
    if (args.description !== undefined) {
      const desc = args.description.trim();
      patch.description = desc || undefined;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.priority !== undefined) patch.priority = args.priority;
    await ctx.db.patch(args.id, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("cases") },
  handler: async (ctx, args): Promise<RemoveResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.ownerId !== userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K tomuto prípadu nemáte prístup.",
      };
    }
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});
