export type RecoveryVerdict = {
  verdict: string
  detail: string
}

const HIGH: RecoveryVerdict = {
  verdict: "Push hard.",
  detail: "Body is primed. HRV trending up.",
}
const MODERATE: RecoveryVerdict = {
  verdict: "Train moderately.",
  detail: "Yellow zone — listen to your body.",
}
const LOW: RecoveryVerdict = {
  verdict: "Take it easy.",
  detail: "Recovery is low. Consider rest or active recovery.",
}
const NONE: RecoveryVerdict = {
  verdict: "Awaiting data.",
  detail: "Sync your strap to see today's recovery.",
}

export function recoveryVerdict(value: number | null | undefined): RecoveryVerdict {
  if (value == null || !Number.isFinite(value)) return NONE
  if (value >= 67) return HIGH
  if (value >= 34) return MODERATE
  return LOW
}
