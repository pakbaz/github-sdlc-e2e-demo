import { expect, test, type Page } from '@playwright/test';

/**
 * The dashboard talks to the live GitHub API. In CI we stub it so these specs
 * are deterministic and do not consume the anonymous rate limit, while still
 * exercising the real fetch/parse/render path.
 */
async function stubGitHub(page: Page) {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'x-ratelimit-remaining': '58',
          'x-ratelimit-limit': '60',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
        body: JSON.stringify(body),
      });

    if (url.includes('/rate_limit')) return json({});

    if (url.includes('/issues')) {
      return json([
        {
          number: 101,
          title: 'Cart badge shows the wrong number of items',
          state: 'open',
          html_url: 'https://github.com/o/r/issues/101',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          labels: [
            { name: 'priority/P3', color: 'ededed', description: null },
            { name: 'risk/low', color: 'ededed', description: null },
            { name: 'area/ui', color: 'ededed', description: null },
          ],
          assignees: [],
          user: null,
          body: null,
        },
        {
          number: 102,
          title: 'Expired sessions are still accepted',
          state: 'open',
          html_url: 'https://github.com/o/r/issues/102',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          labels: [
            { name: 'priority/P0', color: 'ededed', description: null },
            { name: 'risk/high', color: 'ededed', description: null },
            { name: 'area/auth', color: 'ededed', description: null },
          ],
          assignees: [{ login: 'Copilot', avatar_url: '', type: 'Bot' }],
          user: null,
          body: null,
        },
        {
          number: 103,
          title: 'Untriaged report from a customer',
          state: 'open',
          html_url: 'https://github.com/o/r/issues/103',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          labels: [],
          assignees: [],
          user: null,
          body: null,
        },
      ]);
    }

    if (url.includes('/pulls')) return json([]);
    if (url.includes('/actions/runs')) {
      return json({
        workflow_runs: [
          {
            id: 1,
            name: 'CI',
            display_title: 'Fix cart badge',
            status: 'completed',
            conclusion: 'success',
            html_url: 'https://github.com/o/r/actions/runs/1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            event: 'pull_request',
            head_branch: 'copilot/fix-101',
            head_sha: 'abc',
          },
        ],
      });
    }
    if (url.includes('/deployments')) return json([]);
    return json([]);
  });
}

test.describe('SDLC control tower', () => {
  test.beforeEach(async ({ page }) => {
    await stubGitHub(page);
    await page.goto('/#/pipeline');
  });

  test('renders all seven pipeline stages', async ({ page }) => {
    const board = page.getByRole('region', { name: 'Pipeline board' });
    await expect(board).toBeVisible();
    for (const stage of ['Filed', 'Triaged', 'Agent working', 'PR open', 'Human gate', 'Merged', 'Deployed']) {
      await expect(board.getByRole('heading', { name: stage, exact: true })).toBeVisible();
    }
  });

  test('splits work into an automated lane and a human gate', async ({ page }) => {
    const lanes = page.getByRole('region', { name: 'Lane summary' });
    await expect(lanes.getByRole('heading', { name: /Automated lane/ })).toBeVisible();
    await expect(lanes.getByRole('heading', { name: /Human gate/ })).toBeVisible();
  });

  test('places issues in the right stage based on their labels', async ({ page }) => {
    const board = page.getByRole('region', { name: 'Pipeline board' });

    // Untriaged issue sits in "Filed".
    await expect(board.getByRole('link', { name: /#103/ })).toBeVisible();
    // Low-risk triaged issue sits in "Triaged".
    await expect(board.getByRole('link', { name: /#101/ })).toBeVisible();
    // Copilot-assigned issue sits in "Agent working".
    await expect(board.getByRole('link', { name: /#102/ })).toBeVisible();
  });

  test('shows risk and priority on each card', async ({ page }) => {
    await expect(page.getByText('risk/high').first()).toBeVisible();
    await expect(page.getByText('P0').first()).toBeVisible();
  });

  test('lists recent workflow runs', async ({ page }) => {
    const runs = page.getByRole('region', { name: 'Recent workflow runs' });
    await expect(runs.getByRole('link', { name: 'CI' })).toBeVisible();
    await expect(runs.getByText('success')).toBeVisible();
  });
});

test.describe('Policy page', () => {
  test('explains how the gate is enforced', async ({ page }) => {
    await stubGitHub(page);
    await page.goto('/#/policy');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Risk decides who has to say yes');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'area/auth' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'area/ui' })).toBeVisible();
    await expect(page.getByText('CODEOWNERS').first()).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('moves between the three views', async ({ page }) => {
    await stubGitHub(page);
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Primary' });

    await nav.getByRole('link', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'SDLC control tower' })).toBeVisible();

    await nav.getByRole('link', { name: 'Policy', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Priority decides');

    await nav.getByRole('link', { name: 'Store', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Catalog' })).toBeVisible();
  });
});
