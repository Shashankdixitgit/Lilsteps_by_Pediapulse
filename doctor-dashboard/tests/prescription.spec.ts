import { expect, test } from '@playwright/test';
import { signInAsDoctor } from './_helpers';
import {
  admin,
  bookTestAppointment,
  cleanupTestData,
  createTestChild,
  createTestParent,
  createTestSlot,
  isoOffsetDays,
} from './setup';

test.describe('Issue prescription', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('doctor issues a prescription with two medicines', async ({ page }) => {
    const parent = await createTestParent();
    const childId = await createTestChild(parent.userId);
    const date = isoOffsetDays(1);
    await createTestSlot(date, '14:00:00');
    await bookTestAppointment({
      parentId: parent.userId,
      childId,
      date,
      time: '14:00:00',
    });

    await signInAsDoctor(page);
    await page.goto(`/prescriptions/new?child=${childId}`);

    // First medicine prefilled fieldset
    await page.locator('input[placeholder*="Paracetamol"]').first().fill('Paracetamol');
    await page.locator('input[placeholder*="Dose"]').first().fill('5ml');
    await page.locator('input[placeholder*="times a day"]').first().fill('3 times a day');
    await page.locator('input[placeholder*="days"]').first().fill('5 days');

    // Add a second
    await page.getByRole('button', { name: /add another medicine/i }).click();
    await page.locator('input[placeholder*="Paracetamol"]').nth(1).fill('Ibuprofen');
    await page.locator('input[placeholder*="Dose"]').nth(1).fill('2.5ml');
    await page.locator('input[placeholder*="times a day"]').nth(1).fill('twice a day');

    await page.getByRole('button', { name: /issue prescription/i }).click();

    // Redirected to / (queue) after success. Verify the row was created.
    await page.waitForURL(/\/(\?|$)/, { timeout: 15_000 });

    const sb = admin();
    const { data: rx } = await sb
      .from('prescriptions')
      .select('id, prescription_items(medicine)')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; prescription_items: { medicine: string }[] }>();

    expect(rx?.prescription_items?.map((i) => i.medicine).sort()).toEqual(['Ibuprofen', 'Paracetamol']);
  });
});
