import { FORCE_UPLOAD_BATCH_SIZE, runForceUpload } from "../../app/services/sync/forceUpload"

describe("runForceUpload", () => {
  it("uses small batches and records failures without marking rows synced", async () => {
    const db = {}
    const batch = Array.from({ length: FORCE_UPLOAD_BATCH_SIZE }, (_, index) => ({
      id: `q-${index}`,
      tableName: "raw_sensor_records",
      rowId: `r-${index}`,
      payload: { id: `r-${index}`, timestamp: 1_800_000_000_000 + index },
    }))
    const deps = {
      backfillUnsyncedRawSensorRecords: jest.fn().mockResolvedValue(0),
      claimOutboundBatch: jest.fn().mockResolvedValue(batch),
      listDeadLetters: jest.fn().mockResolvedValue([]),
      markOutboundSynced: jest.fn().mockResolvedValue(undefined),
      markRawSensorRecordsSynced: jest.fn().mockResolvedValue(undefined),
      queueDepth: jest.fn().mockResolvedValueOnce(2204).mockResolvedValueOnce(2204),
      recordOutboundFailure: jest.fn().mockResolvedValue(undefined),
    }
    const post = jest.fn().mockRejectedValue(new Error("Request timed out after 20s"))
    const progress: string[] = []

    const result = await runForceUpload(db as never, {
      deps,
      post,
      onProgress: (next) => progress.push(`${next.uploaded}/${next.total}`),
    })

    expect(deps.claimOutboundBatch).toHaveBeenCalledWith(db, FORCE_UPLOAD_BATCH_SIZE)
    expect(post).toHaveBeenCalledWith(
      "raw_sensor_records",
      batch.map((row) => row.payload),
    )
    expect(deps.recordOutboundFailure).toHaveBeenCalledTimes(FORCE_UPLOAD_BATCH_SIZE)
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
})
