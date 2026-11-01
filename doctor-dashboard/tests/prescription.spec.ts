import { expect, test } from '@playwright/test';
import { signInAsDoctor } from './_helpers';
import {
  ADMIN_SKIP_REASON,
  admin,
  bookTestAppointment,
  cleanupTestData,
  createTestChild,
  createTestParent,
  createTestSlot,
  isoOffsetDays,
} from './setup';

test.describe('Issue prescription', () => {
  test.skip(!!ADMIN_SKIP_REASON, ADMIN_SKIP_REASON ?? '');

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
    await page.goto(`./prescriptions/new?child=${childId}`);

    // Diagnosis is required (Telemedicine Practice Guidelines 2020).
    await page.getByLabel(/diagnosis/i).fill('Acute pharyngitis (provisional)');

    // First medicine row
    await page.locator('#rx-0-medicine').fill('Paracetamol');
    await page.locator('#rx-0-dose').fill('5ml');
    await page.locator('#rx-0-frequency').fill('3 times a day');
    await page.locator('#rx-0-duration').fill('5 days');

    // Add a second
    await page.getByRole('button', { name: /add another medicine/i }).click();
    await page.locator('#rx-1-medicine').fill('Ibuprofen');
    await page.locator('#rx-1-dose').fill('2.5ml');
    await page.locator('#rx-1-frequency').fill('twice a day');
    await page.locator('#rx-1-duration').fill('3 days');

    await page.getByRole('button', { name: /issue prescription/i }).click();

    // Redirected to / (queue) after success. Verify the row was created.
    await page.waitForURL(/\/doctor\/?(\?|$)/, { timeout: 15_000 });

    const sb = admin();
    const { data: rx } = await sb
      .from('prescriptions')
      .select('id, diagnosis, prescription_items(medicine)')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; diagnosis: string | null; prescription_items: { medicine: string }[] }>();

    expect(rx?.prescription_items?.map((i) => i.medicine).sort()).toEqual(['IBUPROFEN', 'PARACETAMOL']);
    expect(rx?.diagnosis).toBe('Acute pharyngitis (provisional)');
  });
});
