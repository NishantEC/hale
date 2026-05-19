import { bleManager } from "./ble-manager"
import { PacketType, CMD_FROM_STRAP_UUID, WhoopPacket } from "./packet-types"

export interface AwaitableResponse {
  promise: Promise<{ bytes: number[]; hex: string }>
  // No-op if the response already arrived or already aborted. Always safe
  // to call in a finally block — releases the `bleManager.onPacket`
  // subscription and the timeout handle.
  abort: () => void
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
  uuid: string = CMD_FROM_STRAP_UUID,
): AwaitableResponse {
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
      cleanup()
      const bytes = Array.from(packet.data)
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")
      resolve({ bytes, hex })
    })
  })

  return { promise, abort: cleanup }
}
