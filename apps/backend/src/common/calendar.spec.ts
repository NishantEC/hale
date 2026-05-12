import {
  calendarDayBounds,
  calendarDayKey,
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
});
