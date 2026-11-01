// Vaccines with an age limit (constants/vaccineQuestions.ts VACCINE_MAX_AGE).
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
//
// Rotavirus: no dose after 8 months 0 days (IAP; confirm with Dr Madhav).
// A child of 7 months 30 days with a dose not given is still "overdue" (it
// can still be given); at 8 months 1 day it is "missed — ask your doctor".
import { assertEquals } from 'jsr:@std/assert@1';
import {
  isPastMaxAge,
  onboardingVaccinePlan,
  VACCINE_MAX_AGE,
} from '../../constants/vaccineQuestions.ts';

const DOB = '2026-01-10';

Deno.test('only Rotavirus has an age limit for now (8 months)', () => {
  assertEquals(VACCINE_MAX_AGE, { Rotavirus: { months: 8 } });
});

Deno.test('Rotavirus: 7m30d still in time (overdue → due); 8m0d still in time; 8m1d missed', () => {
  assertEquals(isPastMaxAge('Rotavirus', DOB, '2026-09-09'), false); // 7 months 30 days
  assertEquals(isPastMaxAge('Rotavirus', DOB, '2026-09-10'), false); // 8 months 0 days: last day
  assertEquals(isPastMaxAge('Rotavirus', DOB, '2026-09-11'), true); // 8 months 1 day
  assertEquals(isPastMaxAge('Rotavirus', DOB, '2030-01-01'), true);
});

Deno.test('no limit: other vaccines, or no date of birth', () => {
  assertEquals(isPastMaxAge('PCV', DOB, '2030-01-01'), false);
  assertEquals(isPastMaxAge('Rotavirus', null, '2030-01-01'), false);
});

Deno.test('month-end birthdays clamp like the schedule (31 Jan + 8 months = 30 Sep)', () => {
  assertEquals(isPastMaxAge('Rotavirus', '2026-01-31', '2026-09-30'), false);
  assertEquals(isPastMaxAge('Rotavirus', '2026-01-31', '2026-10-01'), true);
});

Deno.test('onboarding: Rotavirus doses not given past the limit are "to discuss", given ones are not', () => {
  const now = new Date(2026, 9, 1); // 1 Oct 2026: DOB 10 Jan → 8 months 21 days
  const missed = onboardingVaccinePlan('A', { a_rota: 'Missed' }, '', DOB, now);
  assertEquals(
    missed.missedAgeLimit.map((r) => `${r.vaccine_name}#${r.dose_number}`),
    ['Rotavirus#1', 'Rotavirus#2', 'Rotavirus#3'],
  );
  const given = onboardingVaccinePlan('A', { a_rota: 'Given' }, '', DOB, now);
  assertEquals(given.missedAgeLimit, []);
  // Before the limit (7 months 30 days) nothing is "missed" yet.
  const early = onboardingVaccinePlan('A', { a_rota: 'Missed' }, '', DOB, new Date(2026, 8, 9));
  assertEquals(early.missedAgeLimit, []);
});
