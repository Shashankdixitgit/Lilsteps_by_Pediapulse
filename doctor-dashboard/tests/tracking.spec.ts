/**
 * Tracking flow — vaccinations + growth.
 *
 * Test fixture creates a 2-year-old child (the schedule generator fills 38
 * IAP rows automatically) and verifies the doctor's consultation detail
 * surfaces the immunisation summary with overdue + upcoming counts.
 */

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

test.describe('Tracking — vaccines auto-generate + growth measurements', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('new child gets full IAP schedule generated', async () => {
    const parent = await createTestParent();
    const childId = await createTestChild(parent.userId, '2023-01-01');

    const sb = admin();
    const { data, count } = await sb
      .from('vaccinations')
      .select('id', { count: 'exact', head: true })
      .eq('child_id', childId);
    expect(data).toBeDefined();
    expect(count ?? 0).toBeGreaterThanOrEqual(30);
  });

  test('consultation detail shows immunisation counts + growth section', async ({ page }) => {
    const parent = await createTestParent();
    const childId = await createTestChild(parent.userId, '2023-01-01');

    // Add a growth row so the vitals card has data.
    const sb = admin();
    await sb.from('growth_measurements').insert({
      child_id: childId,
      weight: 12.4,
      height: 86,
      measured_at: isoOffsetDays(-7),
    });
    await sb
      .from('children')
      .update({ weight: 12.4, height: 86, weight_updated_at: new Date().toISOString(), height_updated_at: new Date().toISOString() })
      .eq('id', childId);

    const date = isoOffsetDays(1);
    await createTestSlot(date, '15:00:00');
    const apptId = await bookTestAppointment({
      parentId: parent.userId,
      childId,
      date,
      time: '15:00:00',
    });

    await signInAsDoctor(page);
    await page.goto(`/consultations/${apptId}`);

    await expect(page.getByRole('heading', { name: /immunisation/i })).toBeVisible();
    await expect(page.locator('text=/done/i')).toBeVisible();
    await expect(page.locator('text=/overdue/i')).toBeVisible();
    await expect(page.locator('text=/upcoming/i')).toBeVisible();

    await expect(page.getByRole('heading', { name: /vitals/i })).toBeVisible();
    await expect(page.locator('text=12.4')).toBeVisible(); // weight value
    await expect(page.locator('text=86')).toBeVisible();   // height value
  });
});
