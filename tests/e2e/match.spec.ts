import { expect, test } from '@playwright/test';
import { closeContext, createLoggedInPage, resetApp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

test('lets two authenticated players create, join, and finish a realtime public match', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  const playerTwo = await createLoggedInPage(browser, 'player2@example.com');

  try {
    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.locator('div.cursor-pointer').filter({ hasText: /free public/i }).click();
    await playerOne.page.locator('div.cursor-pointer').filter({ hasText: /^Create Match$/ }).click();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect(playerOne.page.getByText(/waiting for p2/i)).toBeVisible();

    await playerTwo.page.goto('/play');
    await expect(playerTwo.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await expect(playerTwo.page.getByText(/player-one/i)).toBeVisible();
    await playerTwo.page.getByRole('button', { name: /join for free/i }).click();
    await playerTwo.page.getByRole('button', { name: /join match/i }).click();

    await expect(playerTwo.page).toHaveURL(/\/game\//);
    await expect(playerTwo.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });
    await playerOne.page.reload();
    await expect(playerOne.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });

    const boardOne = playerOne.page.locator('canvas[aria-label^="Connect board"]');
    const boardTwo = playerTwo.page.locator('canvas[aria-label^="Connect board"]');

    await boardOne.focus();
    await boardOne.press('1');
    await expect(playerOne.page.getByText(/move 1/i)).toBeVisible();

    await boardTwo.focus();
    await boardTwo.press('7');
    await expect(playerTwo.page.getByText(/move 2/i)).toBeVisible();

    await boardOne.press('1');
    await expect(playerOne.page.getByText(/move 3/i)).toBeVisible();

    await boardTwo.press('7');
    await expect(playerTwo.page.getByText(/move 4/i)).toBeVisible();

    await boardOne.press('1');
    await expect(playerOne.page.getByText(/move 5/i)).toBeVisible();

    await boardTwo.press('7');
    await expect(playerTwo.page.getByText(/move 6/i)).toBeVisible();

    await boardOne.press('1');
    await expect(playerOne.page.getByText(/you are victorious/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/you were defeated/i)).toBeVisible();
  } finally {
    await closeContext(playerOne.context);
    await closeContext(playerTwo.context);
  }
});
