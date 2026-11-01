// Unit tests for the prescription form's safety helpers (PR #23 review 1-4).
// Run: npm run test:unit   (node --experimental-strip-types --test)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { allergyCheckText, findAllergyClashes } from './allergy-clash.ts';
import { doseHint, doseMg } from './dose-hint.ts';
import { rxUpper } from './prescription-limits.ts';

describe('doseMg / doseHint (review 2 + 3)', () => {
  const SYRUP = '250 mg/5 ml';
  const cases = [
    // [dose, strength, expected mg or null, why]
    ['5 ml', SYRUP, 250, 'ml × mg/ml'],
    ['0.5 ml', SYRUP, 25, 'explicit leading zero'],
    ['.5 ml', SYRUP, null, 'leading point is ambiguous → no hint'],
    ['2,5 ml', SYRUP, null, 'decimal comma → no hint'],
    ['15 mg/kg', '', null, 'already per kg, not a flat mg dose'],
    ['15 mg/kg', SYRUP, null, 'already per kg, even with a strength'],
    ['5 ml', '100 mg/ml', 500, 'concentration without a volume number'],
    ['5 ml', 'Amoxicillin 400 mg + Clavulanate 57 mg/5 ml', null, 'combination product'],
    ['250 mg', 'Amoxicillin 400 mg + Clavulanate 57 mg/5 ml', null, 'mg dose of a combination'],
    ['5 ml', 'Amoxicillin 400 mg, Clavulanate 57 mg/5 ml', null, 'two mg values without "+"'],
    ['250 mg', '', 250, 'flat mg dose'],
    ['Syrup 7.5 ml', 'Dry syrup 125 mg/5 ml', 187.5, 'words before the number'],
    ['2.5-5 ml', SYRUP, null, 'range'],
    ['5 ml (250 mg)', SYRUP, null, 'two numbers'],
    ['1 tab', '500 mg', null, 'not mg or ml'],
    ['5 ml', 'Tab 500 mg', null, 'ml dose without a liquid concentration'],
    ['5. ml', SYRUP, null, 'trailing point'],
    ['5 ml', '2,5 mg/ml', null, 'decimal comma in strength'],
    ['0 ml', SYRUP, null, 'zero'],
    ['', SYRUP, null, 'empty'],
  ];
  for (const [dose, strength, want, why] of cases) {
    test(`${JSON.stringify(dose)} + ${JSON.stringify(strength)} → ${want} (${why})`, () => {
      const got = doseMg(dose, strength);
      if (want === null) assert.equal(got, null);
      else assert.ok(got !== null && Math.abs(got - want) < 1e-9, `got ${got}`);
    });
  }

  test('hint text and rounding', () => {
    assert.equal(doseHint('5 ml', SYRUP, 9.6), '≈ 26 mg/kg per dose at 9.6 kg');
    assert.equal(doseHint('0.5 ml', SYRUP, 10), '≈ 2.5 mg/kg per dose at 10 kg');
  });
  test('no hint without a usable weight', () => {
    assert.equal(doseHint('5 ml', SYRUP, null), null);
    assert.equal(doseHint('5 ml', SYRUP, 0), null);
    assert.equal(doseHint('5 ml', SYRUP, Number.NaN), null);
  });
  test('no hint when unsure', () => {
    assert.equal(doseHint('.5 ml', SYRUP, 10), null);
    assert.equal(doseHint('15 mg/kg', '', 10), null);
    assert.equal(doseHint('5 ml', 'Amoxicillin 400 mg + Clavulanate 57 mg/5 ml', 10), null);
  });
});

describe('allergy check includes the brand (review 1)', () => {
  const penicillin = [{ name: 'Penicillin', severity: 'severe', type: 'drug' }];
  test('brand-only match is caught', () => {
    assert.equal(findAllergyClashes('CLAVULANIC ACID', penicillin).length, 0);
    const clashes = findAllergyClashes(allergyCheckText('CLAVULANIC ACID', 'Augmentin'), penicillin);
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].allergy, 'Penicillin');
  });
  test('allergy recorded as a brand name', () => {
    const augmentin = [{ name: 'Augmentin', severity: null, type: 'drug' }];
    assert.equal(findAllergyClashes(allergyCheckText('AMOXICILLIN', 'Augmentin'), augmentin).length, 1);
  });
  test('text shape', () => {
    assert.equal(allergyCheckText(' PARACETAMOL ', ' Calpol '), 'PARACETAMOL (Calpol)');
    assert.equal(allergyCheckText('PARACETAMOL', ''), 'PARACETAMOL');
    assert.equal(allergyCheckText('PARACETAMOL', null), 'PARACETAMOL');
  });
  test('no false clash from an unrelated brand', () => {
    assert.equal(findAllergyClashes(allergyCheckText('PARACETAMOL', 'Calpol'), penicillin).length, 0);
  });
});

describe('rxUpper keeps micro readable (review 4)', () => {
  test('µg (micro sign U+00B5) → MCG, never Greek ΜG', () => {
    assert.equal(rxUpper('Vitamin D3 400 µg'), 'VITAMIN D3 400 MCG');
  });
  test('μg (Greek mu U+03BC) → MCG', () => {
    assert.equal(rxUpper('salbutamol 100 μg'), 'SALBUTAMOL 100 MCG');
  });
  test('µ g with a space, and a lone µ', () => {
    assert.equal(rxUpper('x 5 µ g'), 'X 5 MCG');
    assert.equal(rxUpper('x µ'), 'X MC');
  });
  test('ordinary names are just capitalised and trimmed', () => {
    assert.equal(rxUpper('  paracetamol '), 'PARACETAMOL');
    assert.equal(rxUpper('Co-amoxiclav'), 'CO-AMOXICLAV');
  });
  test('no Greek capital mu left', () => {
    assert.ok(!/[Μµμ]/.test(rxUpper('a µg b μg c µ')));
  });
});
