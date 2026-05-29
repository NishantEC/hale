// Read a little-endian uint32 starting at `offset`. JS's `|` is signed —
// masking only the high byte and letting the OR chain coerce the result
// back to int32 produces -1 on 0xFFFFFFFF and other negatives on any
// value >= 2^31. Apply `>>> 0` to the whole result so we stay in uint32.
export function readUint32LE(bytes: ArrayLike<number>, offset: number): number {
  const b0 = bytes[offset] ?? 0
  const b1 = bytes[offset + 1] ?? 0
  const b2 = bytes[offset + 2] ?? 0
  const b3 = bytes[offset + 3] ?? 0
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0
}

// 0xFFFFFFFF is the strap's "no advance" sentinel — emitted on HistoryEnd
// when there's nothing new since the last successful trim. ACKing this
// value back tells the strap "everything is delivered, drop your buffer"
// → mid-window data loss. Callers must detect and skip the ack.
export const SENTINEL_NO_ADVANCE_TRIM = 0xffffffff
