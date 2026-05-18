import { ACCESSORY_METADATA, AccessoryState } from "./states"

export type ReducerState = {
  displayed: AccessoryState
  enteredAt: number
  prevDisplayed: AccessoryState | null
  prevLeftAt: number | null
}

export type ReducerAction =
  | { type: "CANDIDATE"; candidate: AccessoryState; now: number }
  | { type: "SYNCED_OK"; now: number }

export const initialReducerState: ReducerState = {
  displayed: "idle",
  enteredAt: 0,
  prevDisplayed: null,
  prevLeftAt: null,
}

const PING_PONG_WINDOW_MS = 2000
const ERROR_DISPLAY_CAP_MS = 12_000

function priority(state: AccessoryState): number {
  if (state === "idle") return 0
  return ACCESSORY_METADATA[state].priority
}

function holdFor(state: AccessoryState): number {
  if (state === "idle") return 0
  return ACCESSORY_METADATA[state].minHoldMs
}

function transition(state: ReducerState, next: AccessoryState, now: number): ReducerState {
  if (next === state.displayed) return state
  return {
    displayed: next,
    enteredAt: now,
    prevDisplayed: state.displayed,
    prevLeftAt: now,
  }
}

export function accessoryReducer(state: ReducerState, action: ReducerAction): ReducerState {
  if (action.type === "SYNCED_OK") {
    if (priority("synced_confirm") < priority(state.displayed)) return state
    return transition(state, "synced_confirm", action.now)
  }

  const { candidate, now } = action
  const elapsed = now - state.enteredAt
  const candPrio = priority(candidate)
  const dispPrio = priority(state.displayed)

  const isErrorDisplayed = state.displayed === "ble_error" || state.displayed === "sync_error"
  if (isErrorDisplayed && candidate !== state.displayed && elapsed >= ERROR_DISPLAY_CAP_MS) {
    return transition(state, candidate, now)
  }

  if (candPrio > dispPrio) {
    return transition(state, candidate, now)
  }

  if (candidate === state.displayed) return state

  if (elapsed < holdFor(state.displayed)) return state

  if (
    state.prevDisplayed === candidate &&
    state.prevLeftAt != null &&
    now - state.prevLeftAt < PING_PONG_WINDOW_MS
  ) {
    return state
  }

  return transition(state, candidate, now)
}
