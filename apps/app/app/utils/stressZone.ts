export type StressZone = "Calm" | "Moderate" | "High"

export function scoreToZone(score: number | null): StressZone | null {
  if (score == null) return null
  if (score < 1) return "Calm"
  if (score < 2) return "Moderate"
  return "High"
}

export function zoneColorToken(
  zone: StressZone | null,
): "ringHrv" | "statusAmber" | "statusRed" | "statusStale" {
  if (zone === "Calm") return "ringHrv"
  if (zone === "Moderate") return "statusAmber"
  if (zone === "High") return "statusRed"
  return "statusStale"
}
