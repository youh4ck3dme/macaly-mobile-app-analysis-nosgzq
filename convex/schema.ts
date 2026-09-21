import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(v.string()),
  }).index("email", ["email"]),
  cases: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    priority: v.string(),
    createdAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  files: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
    // Normalizovaný formát dokumentu (pdf, docx, txt, md, csv, json). Voliteľné kvôli starším záznamom.
    format: v.optional(v.string()),
    sha256: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),
  analyses: defineTable({
    ownerId: v.id("users"),
    fileIds: v.array(v.id("files")),
    name: v.string(),
    data: v.optional(v.any()),
    // Legacy stavy (analyzing/ready/error) ostanú platné, nový stavový automat
    // pridáva frontu (queued/processing) a výsledky (succeeded/failed).
    status: v.union(
      v.literal("analyzing"),
      v.literal("ready"),
      v.literal("error"),
      v.literal("queued"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
    // Priebeh analýzy v percentách (0-100) a krátky popis aktuálnej fázy.
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
    // Predĺžené polia pre stavový automat analýzy (opakovania, časové značky, kvalita).
    attempts: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    partial: v.optional(v.boolean()),
    warnings: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["ownerId", "status"]),
  userSettings: defineTable({
    userId: v.id("users"),
    notificationEmail: v.boolean(),
    theme: v.union(
      v.literal("system"),
      v.literal("light"),
      v.literal("dark"),
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
})
