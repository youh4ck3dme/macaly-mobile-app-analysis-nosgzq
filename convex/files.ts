import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";

type GenerateResult =
  | { ok: true; uploadUrl: string }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type SaveResult =
  | { ok: true; fileId: string }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID"; message: string };

// Server-side file upload constraints. Mirrored from the client so the limits
// cannot be bypassed by calling the Convex mutation directly.
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
// Povolené prípony mapované na normalizovaný formát uložený v databáze.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "md",
  ".csv": "csv",
  ".json": "json",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "kB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Odvodí normalizovaný formát dokumentu z prípony názvu súboru.
 * Neverí obsahu typu od prehliadača. Vráti null pre nepodporované súbory.
 */
function getFormatFromFilename(filename: string): string | null {
  const lowered = filename.toLowerCase();
  const dot = lowered.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = lowered.slice(dot);
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

type ListResult =
  | { ok: true; files: Doc<"files">[] }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type RemoveResult =
  | { ok: true }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };

type DownloadUrlResult =
  | { ok: true; url: string }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; message: string };

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx): Promise<GenerateResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { ok: true, uploadUrl };
  },
});

export const saveFileMetadata = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args): Promise<SaveResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const filename = args.filename.trim();
    if (!filename) {
      return {
        ok: false,
        code: "INVALID",
        message: "Názov súboru je povinný.",
      };
    }
    // Enforce the extension allow-list on the server so the client-side
    // checks cannot be bypassed via a direct mutation call. The browser
    // content type is never trusted; the format is derived from the filename.
    const format = getFormatFromFilename(filename);
    if (!format) {
      return {
        ok: false,
        code: "INVALID",
        message:
          "Nepodporovaný typ súboru. Povolené sú iba súbory PDF, DOCX, TXT, MD, CSV a JSON.",
      };
    }
    // Never trust the client-reported size: the upload goes directly to file
    // storage before this mutation runs, so the only reliable gate is the
    // actual blob size from Convex storage metadata. Oversized or
    // unverifiable blobs are rejected and the stored object is deleted.
    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata) {
      return {
        ok: false,
        code: "INVALID",
        message: "Nahraný súbor sa nepodarilo overiť. Skúste ho nahrať znova.",
      };
    }
    const actualSize = metadata.size;
    if (
      typeof actualSize !== "number" ||
      !Number.isFinite(actualSize) ||
      actualSize <= 0
    ) {
      return {
        ok: false,
        code: "INVALID",
        message: "Veľkosť súboru nie je platná.",
      };
    }
    if (actualSize > MAX_FILE_SIZE) {
      await ctx.storage.delete(args.storageId);
      return {
        ok: false,
        code: "INVALID",
        message: `Súbor je príliš veľký. Maximálna veľkosť je 200 MB (tento má ${formatBytes(actualSize)}).`,
      };
    }
    const fileId = await ctx.db.insert("files", {
      ownerId: userId,
      storageId: args.storageId,
      filename,
      contentType: args.contentType,
      size: actualSize,
      uploadedAt: Date.now(),
      format,
    });
    return { ok: true, fileId };
  },
});

export const listMyFiles = query({
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
    const files = await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
    return { ok: true, files };
  },
});

export const remove = mutation({
  args: { id: v.id("files") },
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
        message: "K tomuto súboru nemáte prístup.",
      };
    }
    await ctx.storage.delete(existing.storageId);
    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const getDownloadUrl = query({
  args: { fileId: v.id("files") },
  handler: async (ctx, args): Promise<DownloadUrlResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        message: "Musíte byť prihlásený.",
      };
    }
    const existing = await ctx.db.get(args.fileId);
    if (!existing || existing.ownerId !== userId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "K tomuto súboru nemáte prístup.",
      };
    }
    const url = await ctx.storage.getUrl(existing.storageId);
    if (!url) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Súbor nie je dostupný.",
      };
    }
    return { ok: true, url };
  },
});

/**
 * Internal helper for node actions: verify ownership of a list of file IDs and
 * return their storage metadata. Only callable from other Convex functions.
 */
export const getFilesForOwner = internalQuery({
  args: { fileIds: v.array(v.id("files")), ownerId: v.id("users") },
  handler: async (ctx, args): Promise<Doc<"files">[]> => {
    const result: Doc<"files">[] = [];
    for (const fileId of args.fileIds) {
      const file = await ctx.db.get(fileId);
      if (file && file.ownerId === args.ownerId) {
        result.push(file);
      }
    }
    return result;
  },
});
