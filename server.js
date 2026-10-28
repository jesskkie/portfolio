import express from "express";
import session from "express-session";
import { SessionStore } from "./session-store.js";
import { TOTP, Secret } from "otpauth";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db, dataDir, content } from "./store.js";
const app = express(),
  production = process.env.NODE_ENV === "production";
if (production && !process.env.SESSION_SECRET)
  throw new Error("SESSION_SECRET is required in production");
if (production && (!process.env.PUBLIC_ORIGIN || !process.env.ADMIN_ORIGIN))
  throw new Error("PUBLIC_ORIGIN and ADMIN_ORIGIN are required in production");
if (production) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { imgSrc: ["'self'", "data:", "https:"] },
    },
  }),
);
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    store: new SessionStore(),
    name: "portfolio.sid",
    secret: process.env.SESSION_SECRET || randomBytes(48).toString("hex"),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: 4 * 60 * 60 * 1000,
    },
  }),
);
const adminHost = (req, res, next) => {
  if (production && req.hostname !== new URL(process.env.ADMIN_ORIGIN).hostname)
    return res.sendStatus(404);
  next();
};
app.use(["/admin", "/preview", "/api/admin"], adminHost, (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});
const auth = (req, res, next) =>
  req.session.admin
    ? next()
    : res.status(401).json({ error: "Sign in required." });
app.use("/api/admin", (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = randomBytes(32).toString("hex");
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.get("origin");
    const expected =
      process.env.ADMIN_ORIGIN || `${req.protocol}://${req.get("host")}`;
    if (origin !== expected || req.get("x-csrf-token") !== req.session.csrf)
      return res
        .status(403)
        .json({ error: "Invalid request. Refresh and try again." });
  }
  next();
});
app.get("/api/admin/session", (req, res) =>
  res.json({
    authenticated: !!req.session.admin,
    csrf: req.session.csrf,
    configured: !!db.prepare("SELECT id FROM admin").get(),
  }),
);
app.post(
  "/api/admin/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) => {
    const { username, password, otp } = req.body;
    const admin = db.prepare("SELECT hash,totp FROM admin WHERE id=1").get();
    if (
      typeof password !== "string" ||
      Buffer.byteLength(password) > 72 ||
      username !== "jesskkie" ||
      !admin ||
      !(await bcrypt.compare(password, admin.hash)) ||
      (admin.totp &&
        (typeof otp !== "string" ||
          !/^\d{6}$/.test(otp) ||
          new TOTP({ secret: Secret.fromBase32(admin.totp) }).validate({
            token: otp,
            window: 1,
          }) === null))
    )
      return res.status(401).json({
        error:
          "Sign-in failed. Check credentials or complete private password setup.",
      });
    req.session.regenerate((err) => {
      if (err) return res.sendStatus(500);
      req.session.admin = true;
      req.session.csrf = randomBytes(32).toString("hex");
      res.json({ csrf: req.session.csrf });
    });
  },
);
app.post("/api/admin/logout", auth, (req, res) =>
  req.session.destroy(() => {
    res.clearCookie("portfolio.sid");
    res.sendStatus(204);
  }),
);
const text = z.string().max(12000),
  short = z.string().max(250),
  url = z
    .string()
    .max(2048)
    .refine(
      (v) => !v || /^https:\/\//.test(v) || /^\/media\/[a-f0-9-]+$/.test(v),
      "Use an HTTPS link or an uploaded asset.",
    );
const project = z
  .object({
    id: z.string().uuid(),
    title: short,
    description: text,
    problem: text,
    tools: short,
    results: text,
    images: z.array(url).max(20).default([]),
    image: url,
    link: url,
    published: z.boolean(),
  })
  .strict();
const cert = z
  .object({
    id: z.string().uuid(),
    title: short,
    issuer: short,
    date: short,
    image: url,
    link: url,
    published: z.boolean(),
  })
  .strict();
const schema = z
  .object({
    name: short,
    role: short,
    intro: text,
    about: text,
    skills: z.array(short).max(100),
    email: z.union([z.literal(""), z.email()]),
    linkedin: url,
    github: url,
    resume: url,
    projects: z.array(project).max(100),
    certifications: z.array(cert).max(100),
  })
  .strict();
app.get("/api/content", (req, res) => {
  const c = JSON.parse(content().published);
  c.projects = c.projects.filter((x) => x.published);
  c.certifications = c.certifications.filter((x) => x.published);
  res.set("Cache-Control", "no-cache").json(c);
});
app.get("/api/admin/content", auth, (req, res) => {
  const c = content();
  res.json({ content: JSON.parse(c.draft), version: c.version });
});
app.put("/api/admin/content", auth, (req, res) => {
  const parsed = schema.safeParse(req.body.content);
  if (!parsed.success)
    return res.status(400).json({
      error: "Invalid content. Check email, HTTPS links, and field lengths.",
    });
  const result = db
    .prepare(
      "UPDATE content SET draft=?,version=version+1 WHERE id=1 AND version=?",
    )
    .run(JSON.stringify(parsed.data), req.body.version);
  if (!result.changes)
    return res.status(409).json({
      error: "Another editor saved changes. Reload before editing again.",
    });
  res.json({ version: content().version });
});
app.post("/api/admin/publish", auth, (req, res) => {
  if (req.body.version !== content().version)
    return res
      .status(409)
      .json({ error: "Save the latest draft before publishing." });
  db.prepare("UPDATE content SET published=draft WHERE id=1").run();
  res.json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
app.get("/api/admin/assets", auth, (req, res) =>
  res.json(db.prepare("SELECT * FROM assets").all()),
);
app.post("/api/admin/assets", auth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a file." });
  const type = await fileTypeFromBuffer(req.file.buffer);
  if (
    !type ||
    !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
      type.mime,
    )
  )
    return res
      .status(400)
      .json({ error: "Upload a PNG, JPEG, WebP, or PDF (8 MB maximum)." });
  const id = randomUUID();
  fs.writeFileSync(path.join(dataDir, "uploads", id), req.file.buffer, {
    mode: 0o600,
  });
  db.prepare("INSERT INTO assets VALUES(?,?,?)").run(
    id,
    path.basename(req.file.originalname).slice(0, 200),
    type.mime,
  );
  res.json({ id, url: `/media/${id}` });
});
function refs(c) {
  return [
    c.resume,
    ...c.projects.flatMap((p) => [p.image, p.link, ...(p.images || [])]),
    ...c.certifications.flatMap((p) => [p.image, p.link, ...(p.images || [])]),
  ];
}
function publicRefs() {
  const c = JSON.parse(content().published);
  c.projects = c.projects.filter((p) => p.published);
  c.certifications = c.certifications.filter((p) => p.published);
  return refs(c);
}
app.delete("/api/admin/assets/:id", auth, (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success)
    return res.sendStatus(400);
  const ref = `/media/${req.params.id}`;
  if (
    [
      ...refs(JSON.parse(content().draft)),
      ...refs(JSON.parse(content().published)),
    ].includes(ref)
  )
    return res.status(409).json({
      error:
        "Remove this file from draft and published content before deleting it.",
    });
  db.prepare("DELETE FROM assets WHERE id=?").run(req.params.id);
  fs.rmSync(path.join(dataDir, "uploads", req.params.id), { force: true });
  res.sendStatus(204);
});
app.get("/media/:id", (req, res) => {
  const asset = db
    .prepare("SELECT * FROM assets WHERE id=?")
    .get(req.params.id);
  if (
    !asset ||
    (!req.session.admin && !publicRefs().includes(`/media/${asset.id}`))
  )
    return res.sendStatus(404);
  res.set("Cache-Control", "private, no-store");
  res.type(asset.mime);
  if (asset.mime === "application/pdf")
    res.attachment(asset.name.replace(/[\r\n"\\]/g, "_"));
  res.sendFile(path.join(dataDir, "uploads", asset.id));
});
app.get("/admin.html", adminHost, (req, res) => res.redirect("/admin"));
app.get("/admin", (req, res) =>
  res.sendFile(path.resolve("public/admin.html")),
);
app.get("/preview", auth, (req, res) =>
  res.sendFile(path.resolve("public/index.html")),
);
app.get("/", (req, res, next) => {
  if (production && req.hostname === new URL(process.env.ADMIN_ORIGIN).hostname)
    return res.redirect("/admin");
  next();
});
app.use(express.static("public", { index: "index.html", dotfiles: "deny" }));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({
    error:
      err.code === "LIMIT_FILE_SIZE"
        ? "File exceeds 8 MB."
        : "Request could not be processed.",
  });
});
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () =>
  console.log(`Portfolio listening on port ${port}`),
);
