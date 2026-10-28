import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
const dir = mkdtempSync(path.join(os.tmpdir(), "portfolio-test-"));
const port = 3800 + Math.floor(Math.random() * 1000),
  base = `http://127.0.0.1:${port}`;
let child,
  cookie = "",
  csrf = "";
async function start() {
  child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      DATA_DIR: dir,
      PORT: String(port),
      SESSION_SECRET: "integration-only-secret-not-for-deployment",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => {
      if (d.toString().includes("listening")) resolve();
    });
    child.stderr.on("data", (d) => reject(new Error(d.toString())));
    child.on("exit", (code) => reject(new Error("Exited " + code)));
  });
}
async function stop() {
  const done = once(child, "exit");
  child.kill();
  await done;
}
async function req(
  route,
  method = "GET",
  body,
  { anonymous = false, token = true, origin = base } = {},
) {
  const headers = {};
  if (!anonymous && cookie) headers.Cookie = cookie;
  if (token) headers["X-CSRF-Token"] = csrf;
  if (method !== "GET") headers.Origin = origin;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const r = await fetch(base + route, { method, headers, body });
  if (!anonymous && r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie").split(";")[0];
  return r;
}
async function json(r) {
  return (await r).json();
}
test("portfolio authentication, drafts, uploads, publishing, persistence and logout", async (t) => {
  try {
    await start();
    const db = new Database(path.join(dir, "portfolio.sqlite"));
    const password = "A long test password 123!";
    db.prepare("INSERT INTO admin(id,hash) VALUES(1,?)").run(
      await bcrypt.hash(password, 12),
    );
    await t.test(
      "visitors cannot edit, publish, preview or list files",
      async () => {
        for (const [route, method] of [
          ["/api/admin/content", "GET"],
          ["/api/admin/content", "PUT"],
          ["/api/admin/publish", "POST"],
          ["/api/admin/assets", "GET"],
          ["/api/admin/assets", "POST"],
          ["/api/admin/assets/any", "DELETE"],
          ["/preview", "GET"],
        ]) {
          const r = await req(
            route,
            method,
            method === "GET" ? undefined : {},
            { anonymous: true },
          );
          assert.ok([401, 403].includes(r.status), route);
        }
      },
    );
    await t.test(
      "login requires CSRF, correct credentials and optional MFA",
      async () => {
        csrf = (await json(req("/api/admin/session"))).csrf;
        assert.equal(
          (
            await req(
              "/api/admin/login",
              "POST",
              { username: "jesskkie", password },
              { token: false },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await req("/api/admin/login", "POST", {
              username: "jesskkie",
              password: "wrong",
            })
          ).status,
          401,
        );
        const secret = new Secret({ size: 20 });
        db.prepare("UPDATE admin SET totp=?").run(secret.base32);
        assert.equal(
          (
            await req("/api/admin/login", "POST", {
              username: "jesskkie",
              password,
            })
          ).status,
          401,
        );
        const r = await req("/api/admin/login", "POST", {
          username: "jesskkie",
          password,
          otp: new TOTP({ secret }).generate(),
        });
        assert.equal(r.status, 200);
        csrf = (await r.json()).csrf;
        db.prepare("UPDATE admin SET totp=NULL").run();
      },
    );
    let draft, version, asset;
    await t.test(
      "draft saves stay private and stale or cross-origin writes fail",
      async () => {
        ({ content: draft, version } = await json(req("/api/admin/content")));
        draft.name = "Integration Test";
        draft.projects = [
          {
            id: crypto.randomUUID(),
            title: "Draft project",
            description: "Description",
            problem: "Problem",
            tools: "Tools",
            results: "Results",
            image: "",
            link: "",
            published: true,
          },
        ];
        assert.equal(
          (
            await req(
              "/api/admin/content",
              "PUT",
              { content: draft, version },
              { origin: "https://evil.example" },
            )
          ).status,
          403,
        );
        let r = await req("/api/admin/content", "PUT", {
          content: draft,
          version,
        });
        assert.equal(r.status, 200);
        version = (await r.json()).version;
        assert.equal(
          (
            await req("/api/admin/content", "PUT", {
              content: draft,
              version: version - 1,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await json(
              req("/api/content", "GET", undefined, { anonymous: true }),
            )
          ).name,
          "Jesse George",
        );
        assert.equal((await req("/preview")).status, 200);
      },
    );
    await t.test(
      "uploads validate type and stay private until published",
      async () => {
        let form = new FormData();
        form.append(
          "file",
          new Blob(["<script>alert(1)</script>"], { type: "image/png" }),
          "fake.png",
        );
        assert.equal(
          (await req("/api/admin/assets", "POST", form)).status,
          400,
        );
        form = new FormData();
        form.append(
          "file",
          new Blob([
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=",
              "base64",
            ),
          ]),
          "test.png",
        );
        const r = await req("/api/admin/assets", "POST", form);
        assert.equal(r.status, 200);
        asset = await r.json();
        assert.equal(
          (await req(asset.url, "GET", undefined, { anonymous: true })).status,
          404,
        );
        assert.equal((await req(asset.url)).status, 200);
        draft.projects[0].image = asset.url;
        const saved = await json(
          req("/api/admin/content", "PUT", { content: draft, version }),
        );
        version = saved.version;
      },
    );
    await t.test(
      "publishing exposes only enabled items and referenced files",
      async () => {
        draft.certifications = [
          {
            id: crypto.randomUUID(),
            title: "Private certification",
            issuer: "Issuer",
            date: "",
            image: "",
            link: "",
            published: false,
          },
        ];
        version = (
          await json(
            req("/api/admin/content", "PUT", { content: draft, version }),
          )
        ).version;
        assert.equal(
          (await req("/api/admin/publish", "POST", { version })).status,
          200,
        );
        const published = await json(
          req("/api/content", "GET", undefined, { anonymous: true }),
        );
        assert.equal(published.name, "Integration Test");
        assert.equal(published.projects.length, 1);
        assert.equal(published.certifications.length, 0);
        assert.equal(
          (await req(asset.url, "GET", undefined, { anonymous: true })).status,
          200,
        );
        assert.equal(
          (await req("/api/admin/assets/" + asset.id, "DELETE")).status,
          409,
        );
      },
    );
    await t.test(
      "persistent content and sessions survive restart; logout revokes session",
      async () => {
        await stop();
        await start();
        assert.equal(
          (await json(req("/api/content"))).name,
          "Integration Test",
        );
        assert.equal((await req("/api/admin/content")).status, 200);
        const oldCookie = cookie;
        assert.equal((await req("/api/admin/logout", "POST", {})).status, 204);
        cookie = oldCookie;
        assert.equal((await req("/api/admin/content")).status, 401);
      },
    );
    await t.test("login rate limit rejects repeated attempts", async () => {
      csrf = (await json(req("/api/admin/session"))).csrf;
      let status;
      for (let i = 0; i < 9; i++)
        status = (
          await req("/api/admin/login", "POST", {
            username: "x",
            password: "x",
          })
        ).status;
      assert.equal(status, 429);
    });
    db.close();
  } finally {
    if (child?.exitCode === null) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
