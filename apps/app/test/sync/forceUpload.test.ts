import { FORCE_UPLOAD_BATCH_SIZE, runForceUpload } from "../../app/services/sync/forceUpload"

function makeBatch(size: number, tableName = "raw_sensor_records", offset = 0) {
  return Array.from({ length: size }, (_, i) => ({
    id: `q-${offset + i}`,
    tableName,
    rowId: `r-${offset + i}`,
    payload: { id: `r-${offset + i}`, timestamp: 1_800_000_000_000 + offset + i },
  }))
}

function makeDeps(overrides: Partial<Parameters<typeof runForceUpload>[1]["deps"]> = {}) {
  return {
    backfillUnsyncedRawSensorRecords: jest.fn().mockResolvedValue(0),
    claimOutboundBatch: jest.fn().mockResolvedValue([]),
    listDeadLetters: jest.fn().mockResolvedValue([]),
    markOutboundSynced: jest.fn().mockResolvedValue(undefined),
    markRawSensorRecordsSynced: jest.fn().mockResolvedValue(undefined),
    queueDepth: jest.fn().mockResolvedValue(0),
    recordOutboundFailure: jest.fn().mockResolvedValue(undefined),
    recordOutboundFailureBatch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any
}

describe("runForceUpload", () => {
  it("uses small batches and records failures without marking rows synced", async () => {
    const db = {}
    const batch = makeBatch(FORCE_UPLOAD_BATCH_SIZE)
    const deps = makeDeps({
      claimOutboundBatch: jest.fn().mockResolvedValue(batch),
      queueDepth: jest.fn().mockResolvedValueOnce(2204).mockResolvedValueOnce(2204),
    })
    const post = jest.fn().mockRejectedValue(new Error("Request timed out after 20s"))
    const progress: string[] = []

    const result = await runForceUpload(db as never, {
      deps,
      post,
      onProgress: (next) => progress.push(`${next.uploaded}/${next.total}`),
    })

    expect(deps.claimOutboundBatch).toHaveBeenCalledWith(
      db,
      FORCE_UPLOAD_BATCH_SIZE,
      expect.any(Number),
      "force-upload",
    )
    expect(post).toHaveBeenCalledWith(
      "raw_sensor_records",
      batch.map((row: any) => row.payload),
    )
    // Was per-row; now ONE batched call with all FORCE_UPLOAD_BATCH_SIZE ids.
    expect(deps.recordOutboundFailureBatch).toHaveBeenCalledTimes(1)
    expect(deps.recordOutboundFailureBatch.mock.calls[0][1]).toHaveLength(
      FORCE_UPLOAD_BATCH_SIZE,
    )
    expect(deps.markOutboundSynced).not.toHaveBeenCalled()
    expect(deps.markRawSensorRecordsSynced).not.toHaveBeenCalled()
    expect(progress).toContain("0/2204")
    expect(result).toEqual({
      deadCount: 0,
      depthAfter: 2204,
      error: "Request timed out after 20s",
      uploaded: 0,
    })
  })

  it("drains across multiple batches on the happy path", async () => {
    const db = {}
    const batch1 = makeBatch(FORCE_UPLOAD_BATCH_SIZE, "raw_sensor_records", 0)
    const batch2 = makeBatch(FORCE_UPLOAD_BATCH_SIZE, "raw_sensor_records", FORCE_UPLOAD_BATCH_SIZE)
    const claim = jest
      .fn()
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([])
    const deps = makeDeps({
      claimOutboundBatch: claim,
      queueDepth: jest.fn().mockResolvedValueOnce(FORCE_UPLOAD_BATCH_SIZE * 2).mockResolvedValueOnce(0),
    })
    const post = jest.fn().mockResolvedValue({ ok: true })
    const now = jest.fn().mockReturnValue(123_456_789)

    const result = await runForceUpload(db as never, { deps, post, now })

    expect(claim).toHaveBeenCalledTimes(3)
    expect(post).toHaveBeenCalledTimes(2)
    expect(deps.markOutboundSynced).toHaveBeenCalledTimes(2)
    expect(deps.markRawSensorRecordsSynced).toHaveBeenCalledTimes(2)
    expect(deps.markRawSensorRecordsSynced).toHaveBeenLastCalledWith(
      db,
      batch2.map((r: any) => r.rowId),
      123_456_789,
    )
    expect(deps.recordOutboundFailure).not.toHaveBeenCalled()
    expect(result).toEqual({
      uploaded: FORCE_UPLOAD_BATCH_SIZE * 2,
      depthAfter: 0,
      deadCount: 0,
      error: null,
    })
  })

  it("attempts every group in the current claim even after one fails", async () => {
    const db = {}
    // Mixed-table batch: raw_sensor_records fails, but signal_samples should
    // still be attempted before the outer loop exits.
    const batch = [
      ...makeBatch(3, "raw_sensor_records", 0),
      ...makeBatch(2, "signal_samples", 100),
    ]
    const deps = makeDeps({
      claimOutboundBatch: jest.fn().mockResolvedValue(batch),
      queueDepth: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
    })
    const post = jest.fn(async (tableName: string) => {
      if (tableName === "raw_sensor_records") throw new Error("boom")
      return { ok: true }
    })

    const result = await runForceUpload(db as never, { deps, post })

    // Both groups attempted: the failing one records failures, the other
    // marks synced.
    const tablesPosted = post.mock.calls.map((c) => c[0])
    expect(tablesPosted.sort()).toEqual(["raw_sensor_records", "signal_samples"])
    expect(deps.markOutboundSynced).toHaveBeenCalledTimes(1) // only signal_samples
    // Was per-row; now ONE batched call with 3 raw_sensor_records rows.
    expect(deps.recordOutboundFailureBatch).toHaveBeenCalledTimes(1)
    expect(deps.recordOutboundFailureBatch.mock.calls[0][1]).toHaveLength(3)
    expect(result.error).toBe("boom")
    expect(result.uploaded).toBe(2)
  })

  it("returns immediately when the queue is empty after backfill", async () => {
    const db = {}
    const deps = makeDeps({
      queueDepth: jest.fn().mockResolvedValue(0),
    })
    const post = jest.fn()

    const result = await runForceUpload(db as never, { deps, post })

    expect(post).not.toHaveBeenCalled()
    expect(deps.claimOutboundBatch).not.toHaveBeenCalled()
    expect(result).toEqual({ uploaded: 0, depthAfter: 0, deadCount: 0, error: null })
  })
})
