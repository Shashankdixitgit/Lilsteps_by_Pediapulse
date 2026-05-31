import { test, expect } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '.env') });

const EMAIL = process.env.DOCTOR_EMAIL!;
const PASSWORD = process.env.DOCTOR_PASSWORD!;

test.describe('Doctor auth', () => {
  test('rejects bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('not-a-doctor@example.com');
    await page.getByLabel(/password/i).fill('wrong-password');
    await page.getByRole('button', { name: /enter/i }).click();

    // Either Supabase "invalid login" or our "not authorised" message
    await expect(
      page.locator('text=/invalid|not authorised|credentials/i'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('signs in a real doctor and lands on the queue', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /enter/i }).click();

    // Editorial hero on the queue page
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /consultations/i,
      { timeout: 15_000 },
    );
    await expect(page.locator('nav')).toContainText(/queue/i);
    await expect(page.locator('nav')).toContainText(/messages/i);
    await expect(page.locator('nav')).toContainText(/prescriptions/i);
  });

  test('sign-out returns to /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
