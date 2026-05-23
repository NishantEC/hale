import { create } from "zustand"
import type { DrainLoopOutcome } from "@/services/sync/uplinkDrainer"

interface DrainTelemetryState {
  lastDrainOutcome: DrainLoopOutcome | null
  lastDrainAt: number | null
}

export const useDrainTelemetryStore = create<DrainTelemetryState>(() => ({
  lastDrainOutcome: null,
  lastDrainAt: null,
}))

export const setLastDrainOutcome = (outcome: DrainLoopOutcome | null): void => {
  useDrainTelemetryStore.setState({ lastDrainOutcome: outcome })
}
export const setLastDrainAt = (at: number | null): void => {
  useDrainTelemetryStore.setState({ lastDrainAt: at })
}

export const useLastDrainOutcome = (): DrainLoopOutcome | null =>
  useDrainTelemetryStore((s) => s.lastDrainOutcome)
export const useLastDrainAt = (): number | null =>
  useDrainTelemetryStore((s) => s.lastDrainAt)
