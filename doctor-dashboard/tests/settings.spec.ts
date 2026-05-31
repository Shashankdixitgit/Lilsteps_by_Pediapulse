import { expect, test } from '@playwright/test';
import { signInAsDoctor } from './_helpers';
import { admin, DOCTOR_ID } from './setup';

test.describe('Settings — fallback meet link', () => {
  const TEST_LINK = 'https://meet.google.com/zzz-test-zzz';

  test.afterAll(async () => {
    // Restore: nuke the test link.
    const sb = admin();
    await sb.from('doctors').update({ default_meet_link: null }).eq('id', DOCTOR_ID);
  });

  test('doctor can save a fallback meet link', async ({ page }) => {
    await signInAsDoctor(page);
    await page.getByRole('link', { name: /^settings$/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: /fallback/i, level: 2 })).toBeVisible();

    const input = page.locator('input[type=url]');
    await input.fill(TEST_LINK);
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.locator('text=/Saved|Cleared/i')).toBeVisible({ timeout: 10_000 });

    // Verify in DB
    const sb = admin();
    const { data } = await sb
      .from('doctors')
      .select('default_meet_link')
      .eq('id', DOCTOR_ID)
      .maybeSingle<{ default_meet_link: string }>();
    expect(data?.default_meet_link).toBe(TEST_LINK);
  });
});
