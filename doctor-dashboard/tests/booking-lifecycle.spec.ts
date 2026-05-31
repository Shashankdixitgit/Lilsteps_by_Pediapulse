import { expect, test } from '@playwright/test';
import { signInAsDoctor } from './_helpers';
import {
  admin,
  bookTestAppointment,
  cleanupTestData,
  createTestChild,
  createTestParent,
  createTestSlot,
  DOCTOR_ID,
  isoOffsetDays,
  TEST_TAG,
} from './setup';

test.describe('Booking → queue → consultation lifecycle', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('booked appointment appears in queue + opens consultation detail', async ({ page }) => {
    // 1. Seed: parent + child + slot + booking.
    const parent = await createTestParent();
    const childId = await createTestChild(parent.userId);

    const date = isoOffsetDays(1);
    const time = '11:30:00';
    await createTestSlot(date, time);
    const appointmentId = await bookTestAppointment({
      parentId: parent.userId,
      childId,
      date,
      time,
    });

    // 2. UI: doctor logs in, sees the row in the queue.
    await signInAsDoctor(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/consultations/i);
    await expect(page.locator(`text=${TEST_TAG}-child`)).toBeVisible({ timeout: 10_000 });

    // 3. Drill into the consultation detail page.
    await page.locator(`text=${TEST_TAG}-child`).first().click();
    await expect(page).toHaveURL(new RegExp(`/consultations/${appointmentId}`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(new RegExp(`${TEST_TAG}-child`));
    // Vitals / Immunisation / Clinical flags sections render
    await expect(page.getByRole('heading', { name: /vitals/i, level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /immunisation/i, level: 2 })).toBeVisible();
  });

  test('start video falls back to default link when no per-appointment link', async ({ page }) => {
    const parent = await createTestParent();
    const childId = await createTestChild(parent.userId);
    const date = isoOffsetDays(1);
    const time = '12:00:00';
    await createTestSlot(date, time);
    const apptId = await bookTestAppointment({
      parentId: parent.userId,
      childId,
      date,
      time,
    });

    // Ensure the doctor has a default_meet_link set.
    const sb = admin();
    await sb
      .from('doctors')
      .update({ default_meet_link: 'https://meet.google.com/test-fallback-link' })
      .eq('id', DOCTOR_ID);

    await signInAsDoctor(page);
    await page.goto(`/consultations/${apptId}`);

    const startVideo = page.getByRole('link', { name: /^start video$/i });
    await expect(startVideo).toBeVisible();
    await expect(startVideo).toHaveAttribute('href', /meet\.google\.com\/test-fallback-link/);
  });
});
