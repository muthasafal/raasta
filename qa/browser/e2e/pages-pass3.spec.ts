import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TARGET_PAGES = [
  "/",
  "/help",
  "/privacy",
  "/offices/pune",
  "/legal-aid",
  "/emergency",
  "/mr/",
  "/ur/",
];

const VIEWPORTS = [320, 360, 375, 414, 768, 1024, 1280, 1440];

test.describe("Horizontal Scroll & Console Errors Audit", () => {
  let resultPageUrl = "";

  test.beforeAll(async ({ browser }) => {
    // Generate one valid result page
    const page = await browser.newPage();
    await page.goto("http://localhost:4173/");
    await page.locator("#ask-text").fill("Landlord not returning deposit in Pune Rs 30000");
    await page.locator('button[type="submit"].ask-send').click();
    await page.waitForURL(/\/r\/(ask|route)/, { timeout: 60000 });
    if (page.url().includes("/r/ask")) {
      const submitBtn = page.locator('form[action="/r/ask"] button[type="submit"]:has-text("Show me the door")');
      if (await submitBtn.count()) await submitBtn.click();
    }
    await page.waitForURL(/\/r\/route\//, { timeout: 60000 });
    resultPageUrl = page.url();
    console.log("Generated result page for audit:", resultPageUrl);
    await page.close();
  });

  for (const vpWidth of VIEWPORTS) {
    test.describe(`Viewport ${vpWidth}px`, () => {
      for (const p of TARGET_PAGES) {
        test(`Page ${p} at ${vpWidth}px: no horizontal scroll`, async ({ page }) => {
          await page.setViewportSize({ width: vpWidth, height: 800 });
          await page.goto(p, { waitUntil: "load" });
          await page.waitForTimeout(400);

          const dims = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));

          expect(
            dims.scrollWidth,
            `Horizontal overflow on ${p} at ${vpWidth}px: scrollWidth ${dims.scrollWidth} > clientWidth ${dims.clientWidth}`
          ).toBeLessThanOrEqual(dims.clientWidth);
        });
      }

      test(`Result page at ${vpWidth}px: no horizontal scroll`, async ({ page }) => {
        expect(resultPageUrl).toBeTruthy();
        await page.setViewportSize({ width: vpWidth, height: 800 });
        await page.goto(resultPageUrl, { waitUntil: "load" });
        await page.waitForTimeout(400);

        const dims = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));

        expect(
          dims.scrollWidth,
          `Horizontal overflow on result page at ${vpWidth}px: scrollWidth ${dims.scrollWidth} > clientWidth ${dims.clientWidth}`
        ).toBeLessThanOrEqual(dims.clientWidth);
      });
    });
  }

  test("Console errors (CSP, hydration, uncaught exceptions) audit across all pages", async ({ page }) => {
    const allPages = [...TARGET_PAGES, resultPageUrl];
    const reportedErrors: { page: string; errors: string[] }[] = [];

    for (const p of allPages) {
      const consoleErrors: string[] = [];
      const listener = (msg: any) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      };
      page.on("console", listener);
      const pageErrorListener = (err: any) => {
        consoleErrors.push(err.message || String(err));
      };
      page.on("pageerror", pageErrorListener);

      await page.goto(p, { waitUntil: "load" });
      await page.waitForTimeout(500);

      page.off("console", listener);
      page.off("pageerror", pageErrorListener);

      if (consoleErrors.length > 0) {
        reportedErrors.push({ page: p, errors: consoleErrors });
      }
    }

    console.log("Console errors found:", JSON.stringify(reportedErrors, null, 2));
    expect(reportedErrors).toEqual([]);
  });

  test("Language switch to mr and ur (dir=rtl) and back to en", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("h1");

    // Open language menu
    const langChip = page.locator("details.sh-lang summary");
    await expect(langChip).toBeVisible();
    await langChip.click();

    // Switch to Marathi
    const mrOption = page.locator('details.sh-lang a:has-text("मराठी"), details.sh-lang a[href*="/mr/"]');
    await expect(mrOption.first()).toBeVisible();
    await mrOption.first().click();

    await page.waitForURL(/\/mr\//);
    const htmlLangMr = await page.locator("html").getAttribute("lang");
    expect(htmlLangMr).toBe("mr");

    // Switch to Urdu
    await page.locator("details.sh-lang summary").click();
    const urOption = page.locator('details.sh-lang a:has-text("اردو"), details.sh-lang a[href*="/ur/"]');
    await expect(urOption.first()).toBeVisible();
    await urOption.first().click();

    await page.waitForURL(/\/ur\//);
    const htmlDirUr = await page.locator("html").getAttribute("dir");
    const htmlLangUr = await page.locator("html").getAttribute("lang");
    expect(htmlDirUr).toBe("rtl");
    expect(htmlLangUr).toBe("ur");

    // Switch back to English
    await page.locator("details.sh-lang summary").click();
    const enOption = page.locator('details.sh-lang a:has-text("English"), details.sh-lang a[href="/"]');
    await expect(enOption.first()).toBeVisible();
    await enOption.first().click();

    await page.waitForURL(/localhost:4173\/($|\?)/);
    const htmlDirEn = await page.locator("html").getAttribute("dir");
    const htmlLangEn = await page.locator("html").getAttribute("lang");
    expect(htmlDirEn ?? "ltr").toBe("ltr");
    expect(htmlLangEn ?? "en").toBe("en");
  });

  test("axe-core accessibility on target pages", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const allPages = [...TARGET_PAGES, resultPageUrl];
    const a11yViolations: { page: string; violations: any[] }[] = [];

    for (const p of allPages) {
      await page.goto(p, { waitUntil: "load" });
      await page.waitForTimeout(600); // allow animations/colors to settle

      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );

      if (serious.length > 0) {
        a11yViolations.push({
          page: p,
          violations: serious.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.map((n) => ({ html: n.html, failureSummary: n.failureSummary })),
          })),
        });
      }
    }

    console.log("axe-core violations found:", JSON.stringify(a11yViolations, null, 2));
    expect(a11yViolations).toEqual([]);
  });
});
