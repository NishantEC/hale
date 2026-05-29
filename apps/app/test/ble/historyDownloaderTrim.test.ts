import { readUint32LE, SENTINEL_NO_ADVANCE_TRIM } from "../../app/services/ble/uint32"

describe("readUint32LE", () => {
  it("reads a small positive value", () => {
    const bytes = [0xff, 0x42, 0x00, 0x00, 0x00, 0xff]
    expect(readUint32LE(bytes, 1)).toBe(0x42)
  })

  it("returns uint32 for 0xFFFFFFFF (the strap's no-advance sentinel) instead of -1", () => {
    const bytes = [0x00, 0xff, 0xff, 0xff, 0xff]
    expect(readUint32LE(bytes, 1)).toBe(0xffffffff)
    expect(readUint32LE(bytes, 1)).toBeGreaterThanOrEqual(0)
  })

  it("returns uint32 for values >= 2^31 instead of signed-truncating to negative", () => {
    const bytes = [0x00, 0x00, 0x00, 0x00, 0x80]
    expect(readUint32LE(bytes, 1)).toBe(0x80000000)
    expect(readUint32LE(bytes, 1)).toBeGreaterThan(0)
  })

  it("treats missing high bytes as 0 instead of throwing", () => {
    const bytes = [0x42]
    expect(readUint32LE(bytes, 0)).toBe(0x42)
  })

  it("handles little-endian byte order correctly", () => {
    const bytes = [0x78, 0x56, 0x34, 0x12]
    expect(readUint32LE(bytes, 0)).toBe(0x12345678)
  })

  it("SENTINEL_NO_ADVANCE_TRIM matches the value the strap emits for 'no advance'", () => {
    expect(SENTINEL_NO_ADVANCE_TRIM).toBe(0xffffffff)
  })
})
