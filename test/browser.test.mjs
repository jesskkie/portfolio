import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import Database from "better-sqlite3";
test("browser: responsive public site and full dashboard publishing flow", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "portfolio-browser-"));
  const port = 4900 + Math.floor(Math.random() * 500),
    base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, DATA_DIR: dir, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on("data", (d) => {
        if (d.toString().includes("listening")) resolve();
      });
      server.stderr.on("data", (d) => reject(Error(d.toString())));
    });
    const db = new Database(path.join(dir, "portfolio.sqlite"));
    const password = crypto.randomUUID() + "A!";
    db.prepare("INSERT INTO admin(id,hash) VALUES(1,?)").run(
      await bcrypt.hash(password, 12),
    );
    db.close();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    async function accessible() {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(
        results.violations.map((v) => v.id),
        [],
      );
    }
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    mkdirSync("test-results", { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 768, 1024],
      ["phone", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(base);
      await page.getByText("Jesse George", { exact: true }).first().waitFor();
      await page.getByText("Real equipment. Real problem-solving.").waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name + " overflow",
      );
      await accessible();
      await page.screenshot({
        path: `test-results/${name}.png`,
        fullPage: true,
      });
    }
    await page.goto(base + "/admin");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in →", exact: true }).click();
    await page
      .getByRole("button", { name: "Save draft", exact: true })
      .waitFor();
    await page
      .getByLabel("Introduction", { exact: true })
      .fill("Browser-verified private draft");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page
      .getByText("Draft saved. The public site has not changed.", {
        exact: true,
      })
      .waitFor();
    const visitor = await browser.newPage();
    await visitor.goto(base);
    assert.equal(
      await visitor.getByText("Browser-verified private draft").count(),
      0,
    );
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() => document.activeElement.tagName !== "BODY"),
    );
    await page
      .getByRole("button", { name: "Certifications", exact: true })
      .click();
    await page
      .getByRole("button", { name: "＋ Add certification", exact: true })
      .click();
    await page
      .getByLabel("Certification name", { exact: true })
      .fill("Test certificate A");
    await page
      .getByLabel("Issuing organization", { exact: true })
      .fill("Test issuer");
    await page
      .getByRole("button", { name: "＋ Add certification", exact: true })
      .click();
    await page
      .getByLabel("Certification name", { exact: true })
      .nth(1)
      .fill("Test certificate B");
    await page
      .getByRole("button", { name: "↑ Move up", exact: true })
      .nth(1)
      .click();
    assert.equal(
      await page
        .getByLabel("Certification name", { exact: true })
        .first()
        .inputValue(),
      "Test certificate B",
    );
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Remove", exact: true })
      .first()
      .click();
    assert.equal(
      await page.getByLabel("Certification name", { exact: true }).count(),
      1,
    );
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page
      .getByRole("button", { name: "＋ Add project", exact: true })
      .click();
    await page
      .getByLabel("Project title", { exact: true })
      .fill("Browser test project");
    await page
      .getByLabel("Description", { exact: true })
      .fill("A clearly labeled test entry");
    await page.getByLabel("Include on public site").check();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page
      .getByText("Draft saved. The public site has not changed.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Media library", exact: true })
      .click();
    await page.getByLabel("Choose image or document").setInputFiles({
      name: "test.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await page
      .getByRole("button", { name: "Upload file", exact: true })
      .click();
    await page.getByText("test.png", { exact: true }).waitFor();
    const preview = await page.context().newPage();
    await preview.goto(base + "/preview");
    await preview.getByText("Browser-verified private draft").waitFor();
    await preview.close();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Publish changes", exact: true })
      .click();
    await page
      .getByText(
        "Published successfully. Visitors now see the latest content.",
        { exact: true },
      )
      .waitFor();
    await visitor.reload();
    await visitor.getByText("Browser-verified private draft").waitFor();
    await visitor.getByRole("button", { name: "View case study →" }).click();
    await visitor.getByRole("dialog").waitFor();
    await visitor
      .getByRole("button", { name: "Close project details" })
      .click();
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 768, 1024],
      ["phone", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: "Projects", exact: true }).click();
      await accessible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        name + " dashboard overflow",
      );
      await page.screenshot({
        path: `test-results/dashboard-${name}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page
      .getByRole("button", { name: "Sign in →", exact: true })
      .waitFor();
    await page.screenshot({ path: "test-results/login.png", fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    const done = once(server, "exit");
    server.kill();
    await done;
    rmSync(dir, { recursive: true, force: true });
  }
});
