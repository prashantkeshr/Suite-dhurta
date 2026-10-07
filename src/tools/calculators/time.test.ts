import { describe, expect, it } from 'vitest';
import { parseDuration, formatHms, formatWords, parseClock, formatClock, timeBetween, addToClock, zoneOffset, zonedToInstant, formatOffset } from './time';

describe('durations', () => {
  it('parses what people type', () => {
    expect(parseDuration('1:30')).toBe(5400);
    expect(parseDuration('1:30:15')).toBe(5415);
    expect(parseDuration('1h 30m')).toBe(5400);
    expect(parseDuration('2 hours 5 min')).toBe(7500);
    expect(parseDuration('1.5h')).toBe(5400);
    expect(parseDuration('90m')).toBe(5400);
    expect(parseDuration('45')).toBe(2700);
    expect(parseDuration('1d 2h')).toBe(93600);
    expect(parseDuration('-0:15')).toBe(-900);
    expect(parseDuration('1:75')).toBeNaN();
    expect(parseDuration('abc')).toBeNaN();
    expect(parseDuration('2h xyz')).toBeNaN();
  });
  it('formats totals', () => {
    expect(formatHms(5415)).toBe('1:30:15');
    expect(formatHms(93600)).toBe('26:00:00');
    expect(formatHms(-900)).toBe('−0:15:00');
    expect(formatWords(93615)).toBe('1 d 2 h 15 s');
    expect(formatWords(0)).toBe('0 min');
  });
});

describe('clock times', () => {
  it('parses 12- and 24-hour times', () => {
    expect(parseClock('09:30')).toBe(34200);
    expect(parseClock('9:30 pm')).toBe(77400);
    expect(parseClock('12 am')).toBe(0);
    expect(parseClock('12:15 PM')).toBe(44100);
    expect(parseClock('930')).toBe(34200);
    expect(parseClock('24:00')).toBe(0);
    expect(parseClock('13 pm')).toBeNaN();
    expect(parseClock('10:61')).toBeNaN();
    expect(formatClock(77400, true)).toBe('9:30 PM');
    expect(formatClock(34215)).toBe('09:30:15');
  });
  it('handles shifts across midnight and breaks', () => {
    expect(timeBetween(parseClock('9:00'), parseClock('17:30'), 1800)).toEqual({ secs: 28800, overnight: false });
    expect(timeBetween(parseClock('22:00'), parseClock('6:00'))).toEqual({ secs: 28800, overnight: true });
  });
  it('adds durations to a clock with day changes', () => {
    expect(addToClock(parseClock('22:00'), 5 * 3600)).toEqual({ clock: 3 * 3600, dayOffset: 1 });
    expect(addToClock(parseClock('01:00'), -2 * 3600)).toEqual({ clock: 23 * 3600, dayOffset: -1 });
  });
});

describe('time zones', () => {
  it('knows fixed and daylight-saving offsets', () => {
    expect(zoneOffset(Date.UTC(2026, 0, 15), 'Asia/Kolkata')).toBe(330);
    expect(zoneOffset(Date.UTC(2026, 0, 15), 'America/New_York')).toBe(-300);
    expect(zoneOffset(Date.UTC(2026, 6, 15), 'America/New_York')).toBe(-240);
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(-240)).toBe('UTC−4');
  });
  it('converts a wall-clock time to an instant', () => {
    // 9:00 IST on 1 Oct 2026 = 03:30 UTC
    expect(new Date(zonedToInstant(2026, 10, 1, 9, 0, 'Asia/Kolkata')).toISOString()).toBe('2026-10-01T03:30:00.000Z');
    // 9:00 in New York in July (EDT, UTC−4) = 13:00 UTC
    expect(new Date(zonedToInstant(2026, 7, 1, 9, 0, 'America/New_York')).toISOString()).toBe('2026-07-01T13:00:00.000Z');
  });
});
