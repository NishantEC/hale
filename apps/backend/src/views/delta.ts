const MIN_PRIORS = 3;

export function deltaVsWeek(
  current: number | null | undefined,
  prior: Array<number | null | undefined>,
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  const finite = prior.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (finite.length < MIN_PRIORS) return null;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  return Math.round((current - mean) * 10) / 10;
}
