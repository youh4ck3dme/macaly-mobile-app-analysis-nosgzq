import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

const themeValidator = v.union(
  v.literal("system"),
  v.literal("light"),
  v.literal("dark"),
);

type GetMySettingsResult =
  | {
      ok: true;
      profile: { displayName: string; email: string };
      settings: { notificationEmail: boolean; theme: "system" | "light" | "dark" };
    }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type UpdateProfileResult =
  | { ok: true; profile: { displayName: string; email: string } }
  | {
      ok: false;
      code: "UNAUTHENTICATED" | "INVALID_DISPLAY_NAME";
      message: string;
    };

type SavePreferencesResult =
  | {
      ok: true;
      settings: { notificationEmail: boolean; theme: "system" | "light" | "dark" };
    }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

const UNAUTHENTICATED = {
  ok: false as const,
  code: "UNAUTHENTICATED" as const,
  message: "Musíte byť prihlásený.",
};

async function getSettingsDoc(
  ctx: QueryCtx,
  userId: Doc<"users">["_id"],
): Promise<Doc<"userSettings"> | null> {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export const getMySettings = query({
  args: {},
  returns: v.union(
    v.object({
      ok: v.literal(true),
      profile: v.object({
        displayName: v.string(),
        email: v.string(),
      }),
      settings: v.object({
        notificationEmail: v.boolean(),
        theme: themeValidator,
      }),
    }),
    v.object({
      ok: v.literal(false),
      code: v.literal("UNAUTHENTICATED"),
      message: v.string(),
    }),
  ),
  handler: async (ctx): Promise<GetMySettingsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return UNAUTHENTICATED;

    const user = await ctx.db.get(userId);
    if (!user) return UNAUTHENTICATED;

    const stored = await getSettingsDoc(ctx, userId);

    return {
      ok: true,
      profile: {
        displayName: user.name ?? "",
        email: user.email ?? "",
      },
      settings: {
        notificationEmail: stored?.notificationEmail ?? false,
        theme: stored?.theme ?? "system",
      },
    };
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      profile: v.object({
        displayName: v.string(),
        email: v.string(),
      }),
    }),
    v.object({
      ok: v.literal(false),
      code: v.union(
        v.literal("UNAUTHENTICATED"),
        v.literal("INVALID_DISPLAY_NAME"),
      ),
      message: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<UpdateProfileResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return UNAUTHENTICATED;

    const user = await ctx.db.get(userId);
    if (!user) return UNAUTHENTICATED;

    const displayName = args.displayName.trim();
    if (displayName.length < 1 || displayName.length > 80) {
      return {
        ok: false,
        code: "INVALID_DISPLAY_NAME",
        message: "Zobrazované meno musí mať 1 až 80 znakov.",
      };
    }

    // Meno je voľné pole profilu; e-mail zostáva nedotknutý (OTP identita).
    await ctx.db.patch(userId, { name: displayName });

    return {
      ok: true,
      profile: {
        displayName,
        email: user.email ?? "",
      },
    };
  },
});

export const savePreferences = mutation({
  args: {
    notificationEmail: v.boolean(),
    theme: themeValidator,
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      settings: v.object({
        notificationEmail: v.boolean(),
        theme: themeValidator,
      }),
    }),
    v.object({
      ok: v.literal(false),
      code: v.literal("UNAUTHENTICATED"),
      message: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<SavePreferencesResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return UNAUTHENTICATED;

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const saved = { notificationEmail: args.notificationEmail, theme: args.theme };

    if (
      existing &&
      existing.notificationEmail === saved.notificationEmail &&
      existing.theme === saved.theme
    ) {
      return { ok: true, settings: saved };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { ...saved, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...saved,
        updatedAt: Date.now(),
      });
    }

    return { ok: true, settings: saved };
  },
});
