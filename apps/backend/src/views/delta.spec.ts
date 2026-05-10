import { deltaVsWeek } from './delta';

describe('deltaVsWeek', () => {
  it('returns null when fewer than 3 prior samples', () => {
    expect(deltaVsWeek(70, [])).toBeNull();
    expect(deltaVsWeek(70, [60, 65])).toBeNull();
  });

  it('returns current minus mean of prior week (excluding current)', () => {
    expect(deltaVsWeek(70, [60, 60, 60, 60, 60, 60, 60])).toBe(10);
  });

  it('ignores null/undefined values in the prior list', () => {
    expect(deltaVsWeek(70, [60, null as any, 60, undefined as any, 60])).toBe(10);
  });

  it('returns null when current is null', () => {
    expect(deltaVsWeek(null, [60, 60, 60])).toBeNull();
  });

  it('returns null when no finite priors after filtering', () => {
    expect(deltaVsWeek(70, [null, undefined, NaN] as any)).toBeNull();
  });
});
