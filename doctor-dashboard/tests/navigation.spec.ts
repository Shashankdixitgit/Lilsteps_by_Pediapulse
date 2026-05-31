import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '.env') });

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(process.env.DOCTOR_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.DOCTOR_PASSWORD!);
  await page.getByRole('button', { name: /enter/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('Dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('queue → conversations → prescriptions via nav', async ({ page }) => {
    await page.getByRole('link', { name: /^messages$/i }).click();
    await expect(page).toHaveURL(/\/conversations/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /conversations/i,
    );

    await page.getByRole('link', { name: /^prescriptions$/i }).click();
    await expect(page).toHaveURL(/\/prescriptions/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /prescriptions/i,
    );

    await page.getByRole('link', { name: /^queue$/i }).click();
    await expect(page).toHaveURL(/\/(\?|$)/);
  });

  test('unauthenticated visit to a protected route redirects to /login', async ({ browser }) => {
    // Fresh context — no cookies
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/conversations');
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
