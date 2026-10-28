import { db } from "../store.js";
import bcrypt from "bcryptjs";
import readline from "node:readline";
if (!process.stdin.isTTY) {
  console.error(
    "Run this command in an interactive terminal. Passwords are never accepted as arguments.",
  );
  process.exit(1);
}
async function secret(prompt) {
  process.stdout.write(prompt);
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  return new Promise((resolve) => {
    let value = "";
    const handler = (s, k) => {
      if (k?.ctrl && k.name === "c") process.exit(1);
      if (k?.name === "return") {
        process.stdin.off("keypress", handler);
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        resolve(value);
      } else if (k?.name === "backspace") value = value.slice(0, -1);
      else if (s && !k?.ctrl) value += s;
    };
    process.stdin.on("keypress", handler);
    process.stdin.resume();
  });
}
const password = await secret(
  "New password for jesskkie (at least 14 characters): ",
);
if (password.length < 14 || Buffer.byteLength(password) > 72) {
  console.error("Use 14–72 bytes.");
  process.exit(1);
}
if (password !== (await secret("Confirm password: "))) {
  console.error("Passwords did not match.");
  process.exit(1);
}
db.prepare(
  "INSERT INTO admin(id,hash) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash",
).run(await bcrypt.hash(password, 12));
// Invalidate existing sessions when rotating a password.
try {
  const { default: Database } = await import("better-sqlite3");
  const sessions = new Database(
    (await import("node:path")).join(
      (await import("../store.js")).dataDir,
      "sessions.sqlite",
    ),
  );
  sessions.exec("DELETE FROM sessions");
  sessions.close();
} catch {}
console.log("Password saved. Existing sessions revoked.");
process.exit(0);
