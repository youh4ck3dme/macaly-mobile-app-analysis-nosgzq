import { convexTest } from "convex-test"
import { describe, it, expect, beforeAll } from "vitest"
import { convexToJson } from "convex/values"
import schema from "../../convex/schema"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

function makeT() {
  const t = convexTest(schema, import.meta.glob("../../convex/**/*.*s"))
  installStorageGetMetadataShim()
  return t
}

// convex-test (as of 0.0.58) does not implement the "1.0/storageGetMetadata"
// syscall that `ctx.storage.getMetadata` performs. Install a faithful shim in
// tests only: resolve the real stored blob via the supported storage/getBlob
// JS syscall and report its actual size, or null when nothing is stored.
// The production code path under test is unchanged.
let shimInstalled = false
function installStorageGetMetadataShim() {
  if (shimInstalled) return
  shimInstalled = true
  const convexGlobal = (globalThis as any).Convex
  const asyncDesc = Object.getOwnPropertyDescriptor(
    convexGlobal,
    "asyncSyscall",
  )
  if (!asyncDesc || !asyncDesc.get) return
  Object.defineProperty(convexGlobal, "asyncSyscall", {
    configurable: true,
    get() {
      const impl = asyncDesc.get!.call(convexGlobal)
      return async (op: string, jsonArgs: string) => {
        if (op !== "1.0/storageGetMetadata") {
          return impl(op, jsonArgs)
        }
        const { storageId } = JSON.parse(jsonArgs)
        let blob: Blob | null = null
        try {
          blob = await convexGlobal.jsSyscall("storage/getBlob", { storageId })
        } catch {
          blob = null
        }
        if (!blob) {
          return JSON.stringify(convexToJson(null))
        }
        const metadata = {
          _id: storageId,
          size: blob.size,
          contentType: blob.type,
          sha256: "",
        }
        return JSON.stringify(convexToJson(metadata))
      }
    },
  })
}

// Must match the server-side limit in convex/files.ts.
const MAX_FILE_SIZE = 200 * 1024 * 1024

async function seedUser(t: ReturnType<typeof makeT>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {})
  })
}

// Seed a valid storage record so storageId references resolve in the test DB.
// The stored blob's real size is what the server must trust.
async function seedStorageId(
  t: ReturnType<typeof makeT>,
  contentSizeBytes = 1024,
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const content = "a".repeat(contentSizeBytes)
    const blob = new Blob([content], { type: "application/pdf" })
    const storageId = await (ctx as any).storage.store(blob)
    return storageId as Id<"_storage">
  })
}

describe("files.saveFileMetadata - server-side validation", () => {
  beforeAll(() => {
    makeT()
  })

  it("rejects a filename with an unsupported extension", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "document.exe",
        contentType: "application/octet-stream",
        size: 1024,
      })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("INVALID")
      expect(result.message).toMatch(/Nepodporovaný typ súboru/i)
    }
  })

  it("rejects a stored blob larger than the server size limit", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    // Real blob above the limit; the client also reports a large size.
    const storageId = await seedStorageId(t, MAX_FILE_SIZE + 1)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "big.pdf",
        contentType: "application/pdf",
        size: MAX_FILE_SIZE + 1,
      })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("INVALID")
      expect(result.message).toMatch(/príliš veľký/i)
    }
  })

  it("rejects an oversized blob even when the client reports a small size", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    // Attack: upload a blob above the limit, then claim a small size.
    const storageId = await seedStorageId(t, MAX_FILE_SIZE + 1)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "sneaky.pdf",
        contentType: "application/pdf",
        size: 1024,
      })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("INVALID")
      expect(result.message).toMatch(/príliš veľký/i)
    }

    // The oversized blob must not linger in storage once rejected.
    const stillStored = await t.run(async (ctx) => {
      return (await ctx.db.get(storageId as any)) ?? null
    })
    expect(stillStored).toBeNull()
  })

  it("stores the server-verified size, not the client-reported size", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t, 2048)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "mismatch.pdf",
        contentType: "application/pdf",
        size: 10,
      })

    // Accepted, but the stored record must use the real (server-verified) size.
    expect(result.ok).toBe(true)
    if (result.ok) {
      const record = await t.run(async (ctx) => {
        return await ctx.db.get(result.fileId as Id<"files">)
      })
      expect(record?.size).toBe(2048)
    }
  })

  it("rejects a storageId with no stored blob", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t)
    // Delete the blob so getMetadata returns null.
    await t.run(async (ctx) => {
      await (ctx as any).storage.delete(storageId)
    })

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "ghost.pdf",
        contentType: "application/pdf",
        size: 1024,
      })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("INVALID")
      expect(result.message).toMatch(/nepodarilo overiť/i)
    }
  })

  it("accepts a valid PDF and stores the server-verified size", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t, 5 * 1024)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "report.pdf",
        contentType: "application/pdf",
        size: 5 * 1024,
      })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.fileId).toBeTruthy()
      const record = await t.run(async (ctx) => {
        return await ctx.db.get(result.fileId as Id<"files">)
      })
      expect(record?.size).toBe(5 * 1024)
    }
  })

  it("accepts a PDF detected only by .pdf extension", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "scan.PDF",
        contentType: "",
        size: 1024,
      })

    expect(result.ok).toBe(true)
  })

  it("rejects unauthenticated requests", async () => {
    const t = makeT()
    const storageId = await seedStorageId(t)

    const result = await t.mutation(api.files.saveFileMetadata, {
      storageId,
      filename: "report.pdf",
      contentType: "application/pdf",
      size: 1024,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHENTICATED")
    }
  })

  it("rejects an empty filename", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const storageId = await seedStorageId(t)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.files.saveFileMetadata, {
        storageId,
        filename: "   ",
        contentType: "application/pdf",
        size: 1024,
      })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe("INVALID")
    }
  })
})
