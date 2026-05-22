import { bleManager } from "./ble-manager"
import { PacketType, CMD_FROM_STRAP_UUID, WhoopPacket } from "./packet-types"

export interface AwaitableResponse {
  promise: Promise<{ bytes: number[]; hex: string }>
  // No-op if the response already arrived or already aborted. Always safe
  // to call in a finally block — releases the `bleManager.onPacket`
  // subscription and the timeout handle.
  abort: () => void
}

export interface AwaitCommandResponseOptions {
  // When provided, only resolve on a CommandResponse whose payload[0]
  // (originSeq — the sequence of the command being acked) matches.
  // Required when multiple in-flight commands of the same cmd number
  // could have overlapping response windows (e.g. concurrent
  // HistoricalDataAcks); otherwise one waiter would steal another's
  // response, producing the noisy 0/N reading Codex flagged.
  originSeq?: number
  uuid?: string
}

// Subscribe for a single CommandResponse to `cmd` and resolve with its
// bytes. Times out after `timeoutMs` if nothing matching arrives.
//
// Callers MUST guarantee `abort()` runs even when something between
// "start the wait" and "await the promise" throws. Otherwise the
// `onPacket` subscription leaks for the full timeout window (the
// listener accumulates one entry per failed probe).
export function awaitCommandResponse(
  cmd: number,
  timeoutMs: number,
  optionsOrUuid?: AwaitCommandResponseOptions | string,
): AwaitableResponse {
  // Backwards-compat: the original signature accepted a UUID string as
  // the third arg. Keep that shape working so legacy probe code paths
  // (rewind diagnostics, GetDataRange) don't have to be edited in lock-
  // step with this change.
  const options: AwaitCommandResponseOptions =
    typeof optionsOrUuid === "string"
      ? { uuid: optionsOrUuid }
      : (optionsOrUuid ?? {})
  const uuid = options.uuid ?? CMD_FROM_STRAP_UUID
  const expectedOriginSeq = options.originSeq

  let settled = false
  let unsubFn: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    timer = null
    unsubFn?.()
    unsubFn = null
  }

  const promise = new Promise<{ bytes: number[]; hex: string }>((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return
      cleanup()
      reject(new Error(`No response for cmd ${cmd} within ${timeoutMs}ms`))
    }, timeoutMs)
    unsubFn = bleManager.onPacket(uuid, (packet: WhoopPacket) => {
      if (settled) return
      if (packet.type !== PacketType.CommandResponse || packet.command !== cmd) return
      if (expectedOriginSeq != null) {
        const originSeq = packet.data.length > 0 ? packet.data[0] : null
        if (originSeq !== expectedOriginSeq) return
      }
      cleanup()
      const bytes = Array.from(packet.data)
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
      resolve({ bytes, hex })
    })
  })

  return { promise, abort: cleanup }
}
