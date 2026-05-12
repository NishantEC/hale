import {
  addDaysToDateKey,
  calendarDayBounds,
  calendarDayKey,
  clockMinutesInTimeZone,
  resolveCalendarDate,
  resolveTimeZone,
  selectCalendarDayItem,
} from './calendar';

describe('calendar timezone helpers', () => {
  it('resolves an Asia/Kolkata calendar day to the correct UTC bounds', () => {
    const bounds = calendarDayBounds('2026-05-12', 'Asia/Kolkata');

    expect(bounds.start.toISOString()).toBe('2026-05-11T18:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-05-12T18:30:00.000Z');
  });

  it('keys instants by the requested timezone instead of the server timezone', () => {
    const instant = new Date('2026-05-11T23:57:01.024Z');

    expect(calendarDayKey(instant, 'UTC')).toBe('2026-05-11');
    expect(calendarDayKey(instant, 'Asia/Kolkata')).toBe('2026-05-12');
  });

  it('uses the device timezone when resolving an omitted date', () => {
    const resolved = resolveCalendarDate(
      undefined,
      'Asia/Kolkata',
      new Date('2026-05-11T20:00:00.000Z'),
    );

    expect(resolved.selectedKey).toBe('2026-05-12');
    expect(resolved.selectedDate.toISOString()).toBe('2026-05-12T06:30:00.000Z');
  });

  it('does not fall back to stale sleep for today when no exact day exists', () => {
    const items = [{ nightDate: new Date('2026-05-10T00:00:00.000Z') }];

    const selected = selectCalendarDayItem(
      items,
      'nightDate',
      '2026-05-12',
      'Asia/Kolkata',
      { allowAdjacentDay: false },
    );

    expect(selected).toBeNull();
  });

  it('falls back to UTC for invalid timezone input', () => {
    expect(resolveTimeZone('not-a-zone')).toBe('UTC');
  });

  describe('DST transitions', () => {
    it('produces a 23-hour day on US spring-forward', () => {
      const bounds = calendarDayBounds('2026-03-08', 'America/New_York');
      // 2026-03-08 in America/New_York skips 02:00→03:00 local
      expect(bounds.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
      expect(bounds.end.getTime() - bounds.start.getTime()).toBe(23 * 60 * 60 * 1000);
    });

    it('produces a 25-hour day on US fall-back', () => {
      const bounds = calendarDayBounds('2026-11-01', 'America/New_York');
      // 2026-11-01 repeats 01:00→02:00 local
      expect(bounds.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
      expect(bounds.end.getTime() - bounds.start.getTime()).toBe(25 * 60 * 60 * 1000);
    });

    it('steps date keys across DST without losing an hour', () => {
      // Naive Date arithmetic across spring-forward would drift by an hour;
      // addDaysToDateKey operates on the calendar and is DST-immune.
      expect(addDaysToDateKey('2026-03-10', -7)).toBe('2026-03-03');
      expect(addDaysToDateKey('2026-11-03', -7)).toBe('2026-10-27');
      expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31');
      expect(addDaysToDateKey('2025-12-31', 1)).toBe('2026-01-01');
      expect(addDaysToDateKey('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
      expect(addDaysToDateKey('2028-02-28', 1)).toBe('2028-02-29'); // leap
    });

    it('clockMinutesInTimeZone returns local wall-clock minutes regardless of UTC offset', () => {
      const instant = new Date('2026-05-12T03:30:00.000Z');
      // UTC 03:30 → 09:00 in Kolkata (+05:30)
      expect(clockMinutesInTimeZone(instant, 'Asia/Kolkata')).toBe(9 * 60);
      // UTC 03:30 → 23:30 the previous day in Los Angeles (-07 DST)
      expect(clockMinutesInTimeZone(instant, 'America/Los_Angeles')).toBe(20 * 60 + 30);
    });
  });

  describe('parseDateKey input validation', () => {
    it('rejects malformed calendar keys instead of silently producing NaN', () => {
      expect(() => calendarDayBounds('2026-13-40', 'UTC')).toThrow(RangeError);
      expect(() => calendarDayBounds('not-a-date', 'UTC')).toThrow(RangeError);
      expect(() => calendarDayBounds('2026-1-1', 'UTC')).toThrow(RangeError); // requires zero-pad
    });
  });
});
