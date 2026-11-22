import { test, expect, Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 375, height: 667, name: "375px" },
  { width: 768, height: 1024, name: "768px" },
  { width: 1280, height: 800, name: "1280px" },
];

async function completeJourneyPostResult(page: Page) {
  await page.waitForURL(/\/r\/route\//, { timeout: 60000 });
  const routeUrl = page.url();
  const tokenMatch = routeUrl.match(/\/r\/route\/([^?#]+)/);
  const token = tokenMatch ? tokenMatch[1] : "";
  expect(token).toBeTruthy();

  // 1. Open letter (/r/doc/...)
  const docLink = page.locator('a[href*="/r/doc/"]').first();
  await expect(docLink).toBeVisible({ timeout: 15000 });
  await docLink.click();
  await page.waitForURL(/\/r\/doc\//, { timeout: 30000 });

  // 2. Download PDF
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
  const submitDocBtn = page.locator('form[action*="/r/doc/"] button[type="submit"]').first();
  await expect(submitDocBtn).toBeVisible({ timeout: 15000 });
  await submitDocBtn.click();
  const download = await downloadPromise;
  if (download) {
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  } else {
    const contentType = await page.evaluate(() => document.contentType);
    expect(contentType).toMatch(/application\/pdf|text\/html/);
  }

  // 3. Open postal label
  await page.goto(`/r/label?t=${encodeURIComponent(token)}`);
  await page.waitForSelector('form[action*="/r/label"]', { timeout: 15000 });
  await expect(page.locator("h1")).toBeVisible();

  // 4. Open Ask chat and send one message
  await page.goto(`/r/chat?t=${encodeURIComponent(token)}`);
  await page.waitForSelector("#chat-q", { timeout: 15000 });
  await page.locator("#chat-q").fill("How do I proceed with this?");
  await page.locator('.chat-input button[type="submit"]').click();
  await page.waitForSelector(".bubble-me", { timeout: 60000 });
}

for (const vp of VIEWPORTS) {
  test.describe(`Journeys at ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.setTimeout(180000);

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
    });

    test("(1) typed deposit problem in Pune", async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("My landlord in Pune has not returned my Rs 40,000 deposit for 2 months");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      if (page.url().includes("/r/ask")) {
        const btn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
        if (await btn.count()) await btn.click();
      }
      await completeJourneyPostResult(page);
    });

    test("(2) pothole tile", async ({ page }) => {
      await page.goto("/");
      const tile = page.locator('a.lp-tile[href*="civic_failure"]').first();
      await expect(tile).toBeVisible();
      await tile.click();

      for (let i = 0; i < 6 && !page.url().includes("/r/route/"); i++) {
        await page.waitForSelector('form[action*="/r/flow/"]', { timeout: 15000 });
        const no = page.locator("label").filter({ hasText: /^No$/ });
        if (await no.count()) await no.first().click();
        await Promise.all([
          page.waitForLoadState("load"),
          page.locator('form[action*="/r/flow/"] button.btn-primary').click(),
        ]);
      }
      await completeJourneyPostResult(page);
    });

    test('(3) "Rs 20000 was taken by UPI fraud just now" (must show 1930 without follow-up questions)', async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("Rs 20000 was taken by UPI fraud just now");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      expect(page.url()).toContain("/r/route/");
      expect(page.url()).not.toContain("/r/ask");

      const top1930 = page.locator('.alert a[href*="1930"], .res-hero a[href*="1930"]');
      await expect(top1930.first()).toBeVisible();

      await completeJourneyPostResult(page);
    });

    test('(4) "I was sexually assaulted" (no money questions, safety first)', async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("I was sexually assaulted");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      expect(page.url()).toContain("/r/route/");
      expect(page.url()).not.toContain("/r/ask");

      const link112 = page.locator('a[href*="112"]');
      await expect(link112.first()).toBeVisible();

      await completeJourneyPostResult(page);
    });

    test("(5) online bullying", async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("I am facing online bullying and harassment with abusive messages on Instagram");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      if (page.url().includes("/r/ask")) {
        const btn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
        if (await btn.count()) await btn.click();
      }
      await completeJourneyPostResult(page);
    });

    test("(6) lost mobile", async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("I lost my mobile phone yesterday on the bus in Pune");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      if (page.url().includes("/r/ask")) {
        const btn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
        if (await btn.count()) await btn.click();
      }
      await completeJourneyPostResult(page);
    });

    test("(7) unpaid salary", async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("My employer has not paid my salary of Rs 45,000 for 2 months");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      if (page.url().includes("/r/ask")) {
        const btn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
        if (await btn.count()) await btn.click();
      }
      await completeJourneyPostResult(page);
    });

    test("(8) faulty product", async ({ page }) => {
      await page.goto("/");
      await page.locator("#ask-text").fill("I bought a faulty smartphone and the seller refuses to repair or refund");
      await page.locator('button[type="submit"].ask-send').click();

      await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
      if (page.url().includes("/r/ask")) {
        const btn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
        if (await btn.count()) await btn.click();
      }
      await completeJourneyPostResult(page);
    });
  });
}
