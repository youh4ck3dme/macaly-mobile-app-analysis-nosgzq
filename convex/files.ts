import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type GenerateResult =
  | { ok: true; uploadUrl: string }
  | { ok: false; code: "UNAUTHENTICATED"; message: string };

type SaveResult =
  | { ok: true; fileId: string }
  | { ok: false; code: "UNAUTHENTICATED" | "INVALID"; message: string };

// Server-side file upload constraints. Mirrored from the client so the limits
// cannot be bypassed by calling the Convex mutation directly.
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
// OCR-obrázkový limit (PNG/JPG nad tento limit nie je možné spoľahlivo rozpoznať).
const IMAGE_OCR_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
// Povolené prípony mapované na normalizovaný formát uložený v databáze.
const ALLOWED_EXTENSIONS: Record<string, string> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
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

async function validateAndInsertFile(
  ctx: MutationCtx,
  args: { ownerId: Id<"users">; storageId: Id<"_storage">; filename: string; contentType: string },
): Promise<SaveResult> {
  const filename = args.filename.trim();
  if (!filename) return { ok: false, code: "INVALID", message: "Názov súboru je povinný." };
  const format = getFormatFromFilename(filename);
  if (!format) return { ok: false, code: "INVALID", message: "Nepodporovaný typ súboru. Povolené sú iba súbory PDF, DOCX, PNG, JPG, TXT, MD, CSV a JSON." };
  const metadata = await ctx.storage.getMetadata(args.storageId);
  if (!metadata) return { ok: false, code: "INVALID", message: "Nahraný súbor sa nepodarilo overiť. Skúste ho nahrať znova." };
  const actualSize = metadata.size;
  if (typeof actualSize !== "number" || !Number.isFinite(actualSize) || actualSize <= 0) {
    return { ok: false, code: "INVALID", message: "Veľkosť súboru nie je platná." };
  }
  if (actualSize > MAX_FILE_SIZE) {
    await ctx.storage.delete(args.storageId);
    return { ok: false, code: "INVALID", message: `Súbor je príliš veľký. Maximálna veľkosť je 200 MB (tento má ${formatBytes(actualSize)}).` };
  }
  const fileId = await ctx.db.insert("files", {
    ownerId: args.ownerId, storageId: args.storageId, filename, contentType: args.contentType,
    size: actualSize, uploadedAt: Date.now(), format,
    ...(metadata.sha256 ? { sha256: metadata.sha256 } : {}),
  });
  return { ok: true, fileId };
}

export const insertFileRecord = internalMutation({
  args: { ownerId: v.id("users"), storageId: v.id("_storage"), filename: v.string(), contentType: v.string() },
  handler: async (ctx, args): Promise<SaveResult> => validateAndInsertFile(ctx, args),
});

/** @deprecated use finalizeUpload */
export const saveFileMetadata = mutation({
  args: { storageId: v.id("_storage"), filename: v.string(), contentType: v.string(), size: v.number() },
  handler: async (ctx, args): Promise<SaveResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Musíte byť prihlásený." };
    return validateAndInsertFile(ctx, { ...args, ownerId: userId });
  },
});

type FinalizeUploadResult = SaveResult;

export const finalizeUpload = action({
  args: { storageId: v.id("_storage"), filename: v.string(), contentType: v.string(), size: v.number() },
  handler: async (ctx, args): Promise<FinalizeUploadResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, code: "UNAUTHENTICATED", message: "Musíte byť prihlásený." };
    const filename = args.filename.trim();
    if (!filename) return { ok: false, code: "INVALID", message: "Názov súboru je povinný." };
    const format = getFormatFromFilename(filename);
    if (!format) return { ok: false, code: "INVALID", message: "Nepodporovaný typ súboru. Povolené sú iba súbory PDF, DOCX, PNG, JPG, TXT, MD, CSV a JSON." };
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return { ok: false, code: "INVALID", message: "Nahraný súbor sa nepodarilo overiť. Skúste ho nahrať znova." };
    const firstBytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const startsWith = (signature: number[]) => signature.every((byte, index) => firstBytes[index] === byte);
    const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d];
    const zipSignature = [0x50, 0x4b, 0x03, 0x04];
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const jpgSignature = [0xff, 0xd8, 0xff];
    // Binárne podpisy odmietané v textových formátoch (PNG/JPEG ostávajú v tomto zozname).
    const binarySignatures = [pdfSignature, zipSignature, pngSignature, jpgSignature, [0x7f, 0x45, 0x4c, 0x46], [0x47, 0x49, 0x46, 0x38], [0x1f, 0x8b]];
    const isImage = format === "png" || format === "jpg";
    const isContentValid = format === "pdf" ? startsWith(pdfSignature) : format === "docx" ? startsWith(zipSignature) : isImage ? (format === "png" ? startsWith(pngSignature) : startsWith(jpgSignature)) : !binarySignatures.some(startsWith);
    if (!isContentValid) {
      await ctx.storage.delete(args.storageId);
      return { ok: false, code: "INVALID", message: "Obsah súboru nezodpovedá jeho prípone." };
    }
    // OCR-obrázky nad 20 MB neprejdú rozpoznávaním textu; odmietnuť ich rovno pri zbere.
    if (isImage && blob.size > IMAGE_OCR_MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      return { ok: false, code: "INVALID", message: `Obrázok je príliš veľký pre rozpoznávanie textu. Maximum je 20 MB (tento má ${formatBytes(blob.size)}).` };
    }
    if (["txt", "md", "csv", "json"].includes(format) && blob.size <= 1_000_000 && !(await blob.text()).trim()) {
      await ctx.storage.delete(args.storageId);
      return { ok: false, code: "INVALID", message: "Textový súbor nesmie byť prázdny alebo obsahovať iba medzery." };
    }
    return await ctx.runMutation(internal.files.insertFileRecord, { ownerId: userId, storageId: args.storageId, filename, contentType: args.contentType });
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
