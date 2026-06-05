import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeContext, createLoggedInPage, expireAccessCookie, resetApp } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetApp(request);
});

async function playMoveAndWaitForSync({
  actorPage,
  observerPage,
  board,
  key,
  moveNumber,
}: {
  actorPage: Page;
  observerPage: Page;
  board: Locator;
  key: string;
  moveNumber: number;
}) {
  const moveLabel = new RegExp(`move ${moveNumber}\\b`, 'i');
  await board.focus();
  await board.press(key);
  await expect(actorPage.getByText(moveLabel)).toBeVisible();
  await expect(observerPage.getByText(moveLabel)).toBeVisible();
}

test('lets two authenticated players create, join, and finish a realtime public match', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  const playerTwo = await createLoggedInPage(browser, 'player2@example.com');

  try {
    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.getByRole('radio', { name: /free public/i }).click();
    await playerOne.page.getByRole('button', { name: /^create match$/i }).click();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect(playerOne.page.getByText(/waiting for opponent/i).first()).toBeVisible();

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

    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 1 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 2 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 3 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 4 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 5 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 6 });

    await boardOne.focus();
    await boardOne.press('1');
    await expect(playerOne.page.getByText(/you are victorious/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/you lost this match/i)).toBeVisible();
  } finally {
    await closeContext(playerOne.context);
    await closeContext(playerTwo.context);
  }
});

test('verdict modal only appears after a match is completed, not during waiting or active states', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  const playerTwo = await createLoggedInPage(browser, 'player2@example.com');

  try {
    // --- Waiting state: create match, verify NO verdict ---
    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.getByRole('radio', { name: /free public/i }).click();
    await playerOne.page.getByRole('button', { name: /^create match$/i }).click();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect(playerOne.page.getByText(/waiting for opponent/i).first()).toBeVisible();
    // Verdict modal must NOT be visible during waiting state
    await expect(playerOne.page.getByText(/you lost this match/i)).not.toBeVisible();
    await expect(playerOne.page.getByText(/you are victorious/i)).not.toBeVisible();
    await expect(playerOne.page.getByText(/this match is a draw/i)).not.toBeVisible();

    // --- Active state: opponent joins, verify NO verdict ---
    await playerTwo.page.goto('/play');
    await expect(playerTwo.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerTwo.page.getByRole('button', { name: /join for free/i }).click();
    await playerTwo.page.getByRole('button', { name: /join match/i }).click();

    await expect(playerTwo.page).toHaveURL(/\/game\//);
    await expect(playerTwo.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });
    await playerOne.page.reload();
    await expect(playerOne.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });

    // Verdict modal must NOT be visible during active state
    await expect(playerOne.page.getByText(/you lost this match/i)).not.toBeVisible();
    await expect(playerOne.page.getByText(/you are victorious/i)).not.toBeVisible();
    await expect(playerTwo.page.getByText(/you lost this match/i)).not.toBeVisible();
    await expect(playerTwo.page.getByText(/you are victorious/i)).not.toBeVisible();

    // --- Completed state: play to win, verify verdict appears for both ---
    const boardOne = playerOne.page.locator('canvas[aria-label^="Connect board"]');
    const boardTwo = playerTwo.page.locator('canvas[aria-label^="Connect board"]');

    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 1 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 2 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 3 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 4 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 5 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 6 });

    await boardOne.focus();
    await boardOne.press('1');
    // NOW verdict should appear
    await expect(playerOne.page.getByText(/you are victorious/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/you lost this match/i)).toBeVisible();
  } finally {
    await closeContext(playerOne.context);
    await closeContext(playerTwo.context);
  }
});

test('keeps both players signed in when access cookies expire before a winning move', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  const playerTwo = await createLoggedInPage(browser, 'player2@example.com');

  try {
    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.getByRole('radio', { name: /free public/i }).click();
    await playerOne.page.getByRole('button', { name: /^create match$/i }).click();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect(playerOne.page.getByText(/waiting for opponent/i).first()).toBeVisible();

    await playerTwo.page.goto('/play');
    await expect(playerTwo.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerTwo.page.getByRole('button', { name: /join for free/i }).click();
    await playerTwo.page.getByRole('button', { name: /join match/i }).click();

    await expect(playerTwo.page).toHaveURL(/\/game\//);
    await expect(playerTwo.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });
    await playerOne.page.reload();
    await expect(playerOne.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });

    const boardOne = playerOne.page.locator('canvas[aria-label^="Connect board"]');
    const boardTwo = playerTwo.page.locator('canvas[aria-label^="Connect board"]');

    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 1 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 2 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 3 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 4 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 5 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 6 });

    await expireAccessCookie(playerOne.page);
    await expireAccessCookie(playerTwo.page);

    await boardOne.focus();
    await boardOne.press('1');
    await expect(playerOne.page.getByText(/you are victorious/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/you lost this match/i)).toBeVisible();

    await playerOne.page.getByRole('button', { name: /return to lobby/i }).click();
    await playerTwo.page.getByRole('button', { name: /return to lobby/i }).click();

    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await expect(playerTwo.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await expect(playerOne.page).not.toHaveURL(/\/auth\/login/);
    await expect(playerTwo.page).not.toHaveURL(/\/auth\/login/);
  } finally {
    await closeContext(playerOne.context);
    await closeContext(playerTwo.context);
  }
});

test('create match submits only one room when the create control is activated twice', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  let createRequests = 0;

  try {
    await playerOne.page.route('**/api/matches', async (route) => {
      if (route.request().method() === 'POST') {
        createRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      await route.continue();
    });

    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.getByRole('radio', { name: /free public/i }).click();
    await playerOne.page.getByRole('button', { name: /^create match$/i }).dblclick();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect.poll(() => createRequests).toBe(1);

    const activeMatchesResponse = await playerOne.page.request.get('/api/matches/active');
    expect(activeMatchesResponse.ok()).toBeTruthy();
    const activeMatches = await activeMatchesResponse.json();
    expect(activeMatches).toHaveLength(1);
  } finally {
    await closeContext(playerOne.context);
  }
});

test('settles a paid public match with merchant commission end to end', async ({ browser }) => {
  const playerOne = await createLoggedInPage(browser, 'player1@example.com');
  const playerTwo = await createLoggedInPage(browser, 'player2@example.com');
  const admin = await createLoggedInPage(browser, 'admin@example.com');

  try {
    await playerOne.page.goto('/play');
    await expect(playerOne.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await playerOne.page.getByRole('button', { name: /new draft/i }).click();
    await playerOne.page.getByRole('radio', { name: /paid public/i }).click();
    await playerOne.page.getByRole('button', { name: /next step/i }).click();
    await playerOne.page.getByLabel(/wager amount/i).fill('10');
    await playerOne.page.getByRole('button', { name: /^create match$/i }).click();

    await expect(playerOne.page).toHaveURL(/\/game\//);
    await expect(playerOne.page.getByText(/waiting for opponent/i).first()).toBeVisible();
    await expect(playerOne.page.getByText('$18', { exact: true })).toBeVisible();
    await expect(playerOne.page.getByText(/platform fee.*10%/i)).toBeVisible();
    await expect(playerOne.page.getByText('$32.5', { exact: true })).toBeVisible();

    await playerTwo.page.goto('/play');
    await expect(playerTwo.page.getByRole('heading', { name: /central lobby/i })).toBeVisible();
    await expect(playerTwo.page.getByText(/player-one/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/10(?:\.0+)? usdt/i)).toBeVisible();
    await playerTwo.page.getByRole('button', { name: /join & wager/i }).click();
    await expect(playerTwo.page.getByText(/wager: 10(?:\.0+)? usdt/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/payout: 18(?:\.0+)? usdt/i)).toBeVisible();
    await playerTwo.page.getByRole('button', { name: /join match/i }).click();

    await expect(playerTwo.page).toHaveURL(/\/game\//);
    await expect(playerTwo.page.getByText('$8', { exact: true })).toBeVisible();
    await expect(playerTwo.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });
    await playerOne.page.reload();
    await expect(playerOne.page.getByText(/live/i)).toBeVisible({ timeout: 10000 });

    const boardOne = playerOne.page.locator('canvas[aria-label^="Connect board"]');
    const boardTwo = playerTwo.page.locator('canvas[aria-label^="Connect board"]');

    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 1 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 2 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 3 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 4 });
    await playMoveAndWaitForSync({ actorPage: playerOne.page, observerPage: playerTwo.page, board: boardOne, key: '1', moveNumber: 5 });
    await playMoveAndWaitForSync({ actorPage: playerTwo.page, observerPage: playerOne.page, board: boardTwo, key: '7', moveNumber: 6 });

    await boardOne.focus();
    await boardOne.press('1');
    await expect(playerOne.page.getByText(/you are victorious/i)).toBeVisible();
    await expect(playerTwo.page.getByText(/you lost this match/i)).toBeVisible();
    await expect(playerOne.page.getByText('$50.5', { exact: true })).toBeVisible();
    await expect(playerTwo.page.getByText('$8', { exact: true })).toBeVisible();

    await playerOne.page.goto('/bank');
    await expect(playerOne.page.getByText(/match wager/i).first()).toBeVisible();
    await expect(playerOne.page.getByText('-10', { exact: true }).first()).toBeVisible();
    await expect(playerOne.page.getByText(/match win/i).first()).toBeVisible();
    await expect(playerOne.page.getByText('+18', { exact: true }).first()).toBeVisible();

    await admin.page.goto('/merchant/liquidity');
    await expect(admin.page.getByRole('heading', { name: /liquidity & wallets/i })).toBeVisible();
    await expect(admin.page.getByText('Platform Commission', { exact: true })).toBeVisible();
    await expect(admin.page.getByText('13.5')).toBeVisible();
  } finally {
    await closeContext(playerOne.context);
    await closeContext(playerTwo.context);
    await closeContext(admin.context);
  }
});
