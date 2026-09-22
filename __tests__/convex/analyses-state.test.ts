import { describe, expect, it } from "vitest"
import { convexTest } from "convex-test"
import schema from "../../convex/schema"
import { api, internal } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"

function makeT() {
  return convexTest(schema, import.meta.glob("../../convex/**/*.*s"))
}

function seedUser(t: ReturnType<typeof makeT>): Promise<Id<"users">> {
  return t.run(async (ctx) => (await ctx.db.insert("users", {})) as Id<"users">)
}

function seedFile(t: ReturnType<typeof makeT>, ownerId: Id<"users">, filename = "evidence.pdf") {
  return t.run(async (ctx) => {
    const storageId = await (ctx as any).storage.store(
      new Blob(["%PDF-1.7 storrecords"], { type: "application/pdf" }),
    )
    return (await ctx.db.insert("files", {
      ownerId,
      storageId,
      filename,
      contentType: "application/pdf",
      size: 19,
      uploadedAt: Date.now(),
      format: "pdf",
    })) as Id<"files">
  })
}

function listAnalyses(t: ReturnType<typeof makeT>) {
  return t.run(async (ctx) => (await ctx.db.query("analyses").collect()) as any[])
}

describe("analyses state machine", () => {
  it("enqueue creates exactly one row with status queued", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const fileId = await seedFile(t, userId)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyze.enqueue, { fileIds: [fileId] })

    expect(result.ok).toBe(true)
    const rows = await listAnalyses(t)
    expect(rows.length).toBe(1)
    expect(rows[0]._id).toBe((result as { analysisId: string }).analysisId)
    expect(rows[0].status).toBe("queued")
    expect(rows[0].attempts).toBe(1)
    expect(rows[0].progress).toBe(0)
    expect(rows[0].progressLabel).toBe("Analýza je vo fronte")
  })

  it("enqueue twice with the same fileIds deduplicates into one row", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const fileId = await seedFile(t, userId)

    const first = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyze.enqueue, { fileIds: [fileId] })
    const second = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyze.enqueue, { fileIds: [fileId] })

    if (!first.ok || !second.ok) throw new Error("enqueue should succeed")
    expect(second.analysisId).toBe(first.analysisId)
    expect(second.deduplicated).toBe(true)
    // Žiadne duplicitné riadky => žiadna duplicitná AI práca.
    expect((await listAnalyses(t)).length).toBe(1)
  })

  it("enqueue is forbidden for a file owned by another user", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const otherUserId = await seedUser(t)
    const foreignFile = await seedFile(t, otherUserId)

    const result = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyze.enqueue, { fileIds: [foreignFile] })

    if (result.ok) throw new Error("enqueue should fail")
    expect(result.code).toBe("FORBIDDEN")
    expect((await listAnalyses(t)).length).toBe(0)
  })

  it("remove refuses queued and processing rows and deletes a failed row", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const fileId = await seedFile(t, userId)
    const insert = (status: "queued" | "processing" | "failed") =>
      t.mutation(internal.analyses.insertAnalysis, {
        ownerId: userId,
        fileIds: [fileId],
        name: "Analýza",
        data: null,
        status,
        attempts: 1,
      })

    const queuedId = (await insert("queued")).analysisId
    const queuedResult = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyses.remove, { analysisId: queuedId })
    if (queuedResult.ok) throw new Error("remove should refuse queued")
    expect(queuedResult.code).toBe("INVALID")
    expect(await t.run(async (ctx) => ctx.db.get(queuedId))).not.toBeNull()

    const processingId = (await insert("processing")).analysisId
    const processingResult = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyses.remove, { analysisId: processingId })
    if (processingResult.ok) throw new Error("remove should refuse processing")
    expect(processingResult.code).toBe("INVALID")
    expect(await t.run(async (ctx) => ctx.db.get(processingId))).not.toBeNull()

    const failedId = (await insert("failed")).analysisId
    const failedResult = await t
      .withIdentity({ subject: userId })
      .mutation(api.analyses.remove, { analysisId: failedId })
    expect(failedResult.ok).toBe(true)
    expect(await t.run(async (ctx) => ctx.db.get(failedId))).toBeNull()
  })

  it("updateAnalysis with a stale expectedAttempt does not overwrite a newer row", async () => {
    const t = makeT()
    const userId = await seedUser(t)
    const fileId = await seedFile(t, userId)
    const analysisId = (await t.mutation(internal.analyses.insertAnalysis, {
      ownerId: userId,
      fileIds: [fileId],
      name: "Analýza",
      data: null,
      status: "queued",
      attempts: 2,
    })).analysisId

    // Zastaraný beh (pokus 1) nesmie prepísať riadok pokusu 2.
    await t.mutation(internal.analyses.updateAnalysis, {
      analysisId,
      data: { marker: "old-attempt-result" },
      status: "succeeded",
      progress: 100,
      progressLabel: "hotovo",
      expectedAttempt: 1,
    })
    const stale = await t.run(async (ctx) => ctx.db.get(analysisId))
    expect(stale?.status).toBe("queued")
    expect(stale?.data).toBeNull()
    expect(stale?.progress).toBe(0)

    // Aktuálny beh (pokus 2) môže riadok prepísať.
    await t.mutation(internal.analyses.updateAnalysis, {
      analysisId,
      data: { marker: "new-attempt-result" },
      status: "succeeded",
      progress: 100,
      progressLabel: "hotovo",
      expectedAttempt: 2,
    })
    const fresh = await t.run(async (ctx) => ctx.db.get(analysisId))
    expect(fresh?.status).toBe("succeeded")
    expect(fresh?.data).toEqual({ marker: "new-attempt-result" })
  })
})
