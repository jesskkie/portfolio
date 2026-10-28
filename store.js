import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
export const dataDir = path.resolve(process.env.DATA_DIR || "./data");
fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true, mode: 0o700 });
export const db = new Database(path.join(dataDir, "portfolio.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(
  `CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), draft TEXT NOT NULL, published TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL);`,
);
if (!db.pragma("table_info(admin)").some((c) => c.name === "totp"))
  db.exec("ALTER TABLE admin ADD COLUMN totp TEXT");
const seed = {
  name: "Jesse George",
  role: "Automation & Controls Technologist",
  intro:
    "With a degree in Automation and Control Technology, I’m building a career around connected systems and purposeful automation.",
  about:
    "I hold a degree in Automation and Control Technology from Linn State Tech in Missouri.\n\n[Add your experience, interests, and the types of automation you work with here.]",
  skills: ["Add your skills", "Add your tools"],
  email: "",
  linkedin: "",
  github: "",
  resume: "",
  projects: [],
  certifications: [],
};
db.prepare(
  "INSERT OR IGNORE INTO content(id,draft,published) VALUES(1,?,?)",
).run(JSON.stringify(seed), JSON.stringify(seed));
export const content = () =>
  db.prepare("SELECT * FROM content WHERE id=1").get();
