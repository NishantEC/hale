import { coverageFromMinutes, MIN_MINUTES_FOR_DATA, FULL_DAY_MINUTES_THRESHOLD } from './coverage';

describe('coverageFromMinutes', () => {
  test('0 minutes is none', () => {
    expect(coverageFromMinutes(0)).toBe('none');
  });
  test('just under MIN_MINUTES_FOR_DATA is none', () => {
    expect(coverageFromMinutes(MIN_MINUTES_FOR_DATA - 1)).toBe('none');
  });
  test('exactly MIN_MINUTES_FOR_DATA is partial', () => {
    expect(coverageFromMinutes(MIN_MINUTES_FOR_DATA)).toBe('partial');
  });
  test('just below full threshold is partial', () => {
    expect(coverageFromMinutes(FULL_DAY_MINUTES_THRESHOLD - 1)).toBe('partial');
  });
  test('exactly full threshold is full', () => {
    expect(coverageFromMinutes(FULL_DAY_MINUTES_THRESHOLD)).toBe('full');
  });
  test('1440 (whole day) is full', () => {
    expect(coverageFromMinutes(1440)).toBe('full');
  });
});
