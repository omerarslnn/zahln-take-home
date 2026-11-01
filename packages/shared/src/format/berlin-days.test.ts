import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  addCalendarDays,
  berlinDayRange,
  berlinDayStart,
  formatCalendarDay,
  parseCalendarDay,
  toBerlinIso,
} from './berlin-days';

const HOUR = 3_600_000;
const hoursIn = (day: string) =>
  (berlinDayStart(addCalendarDays(day, 1)) - berlinDayStart(day)) / HOUR;

describe('berlinDayRange', () => {
  it('spans 23 hours on 29 March 2026, when the clocks skip 02:00 to 03:00', () => {
    assert.deepEqual(berlinDayRange('2026-03-29', '2026-03-29'), {
      from: '2026-03-29T00:00:00+01:00',
      to: '2026-03-30T00:00:00+02:00',
    });
    assert.equal(hoursIn('2026-03-29'), 23);
  });

  it('spans 25 hours on 25 October 2026, when the clocks fall back 03:00 to 02:00', () => {
    assert.deepEqual(berlinDayRange('2026-10-25', '2026-10-25'), {
      from: '2026-10-25T00:00:00+02:00',
      to: '2026-10-26T00:00:00+01:00',
    });
    assert.equal(hoursIn('2026-10-25'), 25);
  });

  it('covers several days, inclusive of the last, across a year end', () => {
    assert.deepEqual(berlinDayRange('2026-12-30', '2027-01-01'), {
      from: '2026-12-30T00:00:00+01:00',
      to: '2027-01-02T00:00:00+01:00',
    });
  });

  it('gives the same instants and day names whatever time zone the host runs in', () => {
    // A fresh process per zone: a formatter made at module load keeps the zone it was made in, so
    // changing TZ inside this process would prove nothing.
    const module = JSON.stringify(new URL('./berlin-days.ts', import.meta.url).href);
    const script = `const m = await import(${module});
      console.log(JSON.stringify([m.berlinDayRange('2026-03-29', '2026-03-29'),
        m.berlinDayRange('2026-10-25', '2026-10-25'), m.formatCalendarDay('2026-10-25', 'de')]));`;
    for (const zone of ['America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati', 'UTC']) {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', script],
        { env: { ...process.env, TZ: zone }, encoding: 'utf8' },
      );
      assert.deepEqual(
        JSON.parse(output),
        [
          { from: '2026-03-29T00:00:00+01:00', to: '2026-03-30T00:00:00+02:00' },
          { from: '2026-10-25T00:00:00+02:00', to: '2026-10-26T00:00:00+01:00' },
          'Sonntag, 25. Oktober 2026',
        ],
        zone,
      );
    }
  });
});

describe('berlinDayStart and toBerlinIso', () => {
  it('are exact instants, not wall-clock guesses', () => {
    assert.equal(berlinDayStart('2026-03-29'), Date.UTC(2026, 2, 28, 23));
    assert.equal(berlinDayStart('2026-10-26'), Date.UTC(2026, 9, 25, 23));
    assert.equal(toBerlinIso(Date.UTC(2026, 9, 25, 0, 59, 59)), '2026-10-25T02:59:59+02:00');
    assert.equal(toBerlinIso(Date.UTC(2026, 9, 25, 1, 0, 0)), '2026-10-25T02:00:00+01:00');
  });
});

describe('calendar days', () => {
  it('accepts only real dates as YYYY-MM-DD', () => {
    assert.deepEqual(parseCalendarDay('2028-02-29'), { year: 2028, month: 2, day: 29 });
    for (const text of [
      '2026-02-29',
      '2026-13-01',
      '2026-1-01',
      '01.11.2026',
      '',
      '2026-11-01T00:00',
    ]) {
      assert.equal(parseCalendarDay(text), null, text);
    }
    assert.throws(() => berlinDayStart('2026-02-30'), RangeError);
  });

  it('adds days across month and year ends', () => {
    assert.equal(addCalendarDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addCalendarDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addCalendarDays('2026-10-25', 1), '2026-10-26');
  });
});

describe('formatCalendarDay', () => {
  it('names the calendar day itself in both languages', () => {
    assert.equal(formatCalendarDay('2026-10-25', 'de'), 'Sonntag, 25. Oktober 2026');
    assert.match(formatCalendarDay('2026-10-25', 'en'), /^Sunday,? 25 October 2026$/);
  });
});
