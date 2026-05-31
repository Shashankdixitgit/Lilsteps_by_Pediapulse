import { expect, type Page } from '@playwright/test';

export async function signInAsDoctor(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(process.env.DOCTOR_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.DOCTOR_PASSWORD!);
  await page.getByRole('button', { name: /enter/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
}
