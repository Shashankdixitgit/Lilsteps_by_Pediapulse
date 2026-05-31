import { expect, test } from '@playwright/test';
import { signInAsDoctor } from './_helpers';
import { admin, cleanupTestData, DOCTOR_ID } from './setup';

test.describe('Availability flow', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('doctor sees the availability page', async ({ page }) => {
    await signInAsDoctor(page);
    await page.getByRole('link', { name: /^availability$/i }).click();
    await expect(page).toHaveURL(/\/availability/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/availability/i);
    await expect(page.getByRole('heading', { name: /generate/i, level: 2 })).toBeVisible();
  });

  test('generate window creates slots and they show in the list', async ({ page }) => {
    await signInAsDoctor(page);
    await page.goto('/availability');

    // Fields don't have htmlFor/id, so position rather than label.
    const numbers = page.locator('input[type=number]');
    await page.locator('input[type=date]').fill('2099-01-01');
    await numbers.nth(0).fill('1');   // days
    await numbers.nth(1).fill('10');  // start hour
    await numbers.nth(2).fill('12');  // end hour
    await page.getByRole('button', { name: /generate slots/i }).click();

    await expect(page.locator('text=/Generated \\d+ new slot/i')).toBeVisible({ timeout: 10_000 });

    // Verify via Supabase that the slots actually landed on the right date.
    const sb = admin();
    const { data } = await sb
      .from('time_slots')
      .select('time')
      .eq('doctor_id', DOCTOR_ID)
      .eq('date', '2099-01-01');
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });
});
