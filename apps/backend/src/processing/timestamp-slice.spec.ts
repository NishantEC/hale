import { sliceByTimestamp, sumByTimestamp, averageByTimestamp } from './timestamp-slice';

type Point = { timestamp: Date; value: number };

function pts(...specs: Array<[string, number]>): Point[] {
  return specs.map(([iso, v]) => ({ timestamp: new Date(iso), value: v }));
}

describe('sliceByTimestamp', () => {
  test('returns empty for empty input', () => {
    expect(sliceByTimestamp([], new Date(0), new Date(1000))).toEqual([]);
  });

  test('returns empty when window is entirely before all data', () => {
    const arr = pts(['2026-05-17T10:00:00Z', 1], ['2026-05-17T11:00:00Z', 2]);
    const out = sliceByTimestamp(arr, new Date('2026-05-17T00:00:00Z'), new Date('2026-05-17T09:00:00Z'));
    expect(out).toEqual([]);
  });

  test('returns empty when window is entirely after all data', () => {
    const arr = pts(['2026-05-17T10:00:00Z', 1], ['2026-05-17T11:00:00Z', 2]);
    const out = sliceByTimestamp(arr, new Date('2026-05-17T12:00:00Z'), new Date('2026-05-17T13:00:00Z'));
    expect(out).toEqual([]);
  });

  test('returns all when window covers everything', () => {
    const arr = pts(['2026-05-17T10:00:00Z', 1], ['2026-05-17T11:00:00Z', 2], ['2026-05-17T12:00:00Z', 3]);
    const out = sliceByTimestamp(arr, new Date('2026-05-17T00:00:00Z'), new Date('2026-05-18T00:00:00Z'));
    expect(out).toHaveLength(3);
  });

  test('half-open window: includes start, excludes end', () => {
    const arr = pts(
      ['2026-05-17T10:00:00Z', 1],
      ['2026-05-17T11:00:00Z', 2],
      ['2026-05-17T12:00:00Z', 3],
    );
    const out = sliceByTimestamp(
      arr,
      new Date('2026-05-17T11:00:00Z'),
      new Date('2026-05-17T12:00:00Z'),
    );
    expect(out.map((p) => p.value)).toEqual([2]);
  });

  test('boundary timestamps land on the correct side', () => {
    const arr = pts(
      ['2026-05-17T10:00:00Z', 1],
      ['2026-05-17T11:00:00Z', 2],
      ['2026-05-17T12:00:00Z', 3],
    );
    // Range [10:00, 12:00) → includes points at 10:00 and 11:00, excludes 12:00
    const out = sliceByTimestamp(
      arr,
      new Date('2026-05-17T10:00:00Z'),
      new Date('2026-05-17T12:00:00Z'),
    );
    expect(out.map((p) => p.value)).toEqual([1, 2]);
  });

  test('partial overlap returns only the overlapping subset', () => {
    const arr = pts(
      ['2026-05-17T09:00:00Z', 1],
      ['2026-05-17T10:00:00Z', 2],
      ['2026-05-17T11:00:00Z', 3],
      ['2026-05-17T12:00:00Z', 4],
      ['2026-05-17T13:00:00Z', 5],
    );
    const out = sliceByTimestamp(
      arr,
      new Date('2026-05-17T10:30:00Z'),
      new Date('2026-05-17T12:30:00Z'),
    );
    expect(out.map((p) => p.value)).toEqual([3, 4]);
  });
});

describe('averageByTimestamp', () => {
  test('returns null when slice is empty', () => {
    const arr = pts(['2026-05-17T10:00:00Z', 1]);
    expect(
      averageByTimestamp(arr, new Date('2026-05-17T20:00:00Z'), new Date('2026-05-17T21:00:00Z')),
    ).toBeNull();
  });

  test('returns the average of values in window', () => {
    const arr = pts(
      ['2026-05-17T10:00:00Z', 2],
      ['2026-05-17T11:00:00Z', 4],
      ['2026-05-17T12:00:00Z', 6],
    );
    expect(
      averageByTimestamp(arr, new Date('2026-05-17T10:00:00Z'), new Date('2026-05-17T13:00:00Z')),
    ).toBe(4);
  });
});

describe('sumByTimestamp', () => {
  test('returns 0 for empty slice', () => {
    expect(
      sumByTimestamp([], new Date('2026-05-17T10:00:00Z'), new Date('2026-05-17T11:00:00Z')),
    ).toBe(0);
  });

  test('sums values inside window only', () => {
    const arr = pts(
      ['2026-05-17T09:00:00Z', 100],
      ['2026-05-17T10:00:00Z', 1],
      ['2026-05-17T11:00:00Z', 2],
      ['2026-05-17T12:00:00Z', 99],
    );
    expect(
      sumByTimestamp(arr, new Date('2026-05-17T10:00:00Z'), new Date('2026-05-17T12:00:00Z')),
    ).toBe(3);
  });
});
