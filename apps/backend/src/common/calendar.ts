const DEFAULT_TIME_ZONE = 'UTC';
const DAY_MS = 24 * 60 * 60 * 1000;

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ResolvedCalendarDate = {
  timeZone: string;
  selectedKey: string;
  selectedDate: Date;
};

export function resolveTimeZone(input?: string | null): string {
  if (!input) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input }).format(new Date());
    return input;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function calendarDayKey(date: Date, timeZoneInput?: string | null): string {
  const timeZone = resolveTimeZone(timeZoneInput);
  const parts = getPartsInTimeZone(date, timeZone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

export function calendarDayBounds(
  dateKey: string,
  timeZoneInput?: string | null,
): { start: Date; end: Date } {
  const timeZone = resolveTimeZone(timeZoneInput);
  const [year, month, day] = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0, 0));
  const start = zonedDateTimeToUtc(year, month, day, 0, 0, 0, 0, timeZone);
  const end = zonedDateTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    0,
    timeZone,
  );
  return { start, end };
}

export function calendarDayStart(
  date: Date,
  timeZoneInput?: string | null,
): Date {
  return calendarDayBounds(calendarDayKey(date, timeZoneInput), timeZoneInput).start;
}

// Steps a YYYY-MM-DD date key by `days` (negative goes back). Operates on the
// calendar — DST-agnostic. Use this when computing "N days before" a key
// rather than subtracting milliseconds from a Date, which is off by an hour
// twice a year.
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = parseDateKey(dateKey);
  // Anchor at UTC noon so the resulting calendar date is unambiguous in any
  // timezone (every IANA zone is on the intended date at 12:00 UTC).
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return formatDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function shiftCalendarDay(
  dateKey: string,
  deltaDays: number,
  _timeZone?: string | null,
): string {
  return addDaysToDateKey(dateKey, deltaDays);
}

// Wall-clock minutes since local midnight, evaluated in the given timezone.
export function clockMinutesInTimeZone(
  date: Date,
  timeZoneInput?: string | null,
): number {
  const timeZone = resolveTimeZone(timeZoneInput);
  const parts = getPartsInTimeZone(date, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function resolveCalendarDate(
  dateInput?: string,
  timeZoneInput?: string | null,
  now = new Date(),
): ResolvedCalendarDate {
  const timeZone = resolveTimeZone(timeZoneInput);
  const selectedKey =
    dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
      ? dateInput
      : calendarDayKey(now, timeZone);
  const [year, month, day] = parseDateKey(selectedKey);
  return {
    timeZone,
    selectedKey,
    selectedDate: zonedDateTimeToUtc(year, month, day, 12, 0, 0, 0, timeZone),
  };
}

export function selectCalendarDayItem<T extends Record<string, any>>(
  items: T[],
  key: keyof T,
  selectedKey: string,
  timeZoneInput?: string | null,
  options: { allowAdjacentDay?: boolean; maxAdjacentDays?: number } = {},
): T | null {
  const timeZone = resolveTimeZone(timeZoneInput);
  const exact =
    items.find((item) => calendarDayKey(item[key] as Date, timeZone) === selectedKey) ??
    null;
  if (exact || !options.allowAdjacentDay) return exact;

  const maxDistance = (options.maxAdjacentDays ?? 1) * DAY_MS;
  const selectedMidpoint = dayMidpoint(selectedKey, timeZone);
  let closest: T | null = null;
  let closestDistance = Infinity;
  for (const item of items) {
    const itemKey = calendarDayKey(item[key] as Date, timeZone);
    const distance = Math.abs(dayMidpoint(itemKey, timeZone) - selectedMidpoint);
    if (distance <= maxDistance && distance < closestDistance) {
      closest = item;
      closestDistance = distance;
    }
  }
  return closest;
}

function dayMidpoint(dateKey: string, timeZone: string): number {
  const { start, end } = calendarDayBounds(dateKey, timeZone);
  return start.getTime() + (end.getTime() - start.getTime()) / 2;
}

function parseDateKey(dateKey: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new RangeError(`Invalid calendar date key: "${dateKey}" (expected YYYY-MM-DD)`);
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError(`Invalid calendar date key: "${dateKey}"`);
  }
  return [year, month, day];
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getPartsInTimeZone(date: Date, timeZone: string): CalendarParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getPartsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  const localAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  let utc = localAsUtc;
  for (let i = 0; i < 3; i += 1) {
    utc = localAsUtc - timeZoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}
