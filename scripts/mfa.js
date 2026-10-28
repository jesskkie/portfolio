import { db, dataDir } from "../store.js";
import { TOTP, Secret } from "otpauth";
import { createInterface } from "node:readline/promises";
import Database from "better-sqlite3";
import path from "node:path";
if (!process.stdin.isTTY) {
  console.error("Run in a private interactive terminal.");
  process.exit(1);
}
if (!db.prepare("SELECT id FROM admin").get()) {
  console.error("Set a password first.");
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout });
if (process.argv.includes("--disable")) {
  if ((await rl.question("Disable MFA? Type DISABLE: ")) === "DISABLE")
    db.prepare("UPDATE admin SET totp=NULL WHERE id=1").run();
} else {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: "Portfolio Studio",
    label: "jesskkie",
    secret,
  });
  console.log(
    "Privately add this setup key to your authenticator app. Do not share or save it in source code.",
  );
  console.log(secret.base32);
  const token = await rl.question("Enter the six-digit code to verify: ");
  if (totp.validate({ token, window: 1 }) === null) {
    console.error("Code incorrect. Nothing changed.");
    process.exit(1);
  }
  db.prepare("UPDATE admin SET totp=? WHERE id=1").run(secret.base32);
  console.log(
    "MFA enabled. Your private host terminal is the recovery method.",
  );
}
try {
  new Database(path.join(dataDir, "sessions.sqlite")).exec(
    "DELETE FROM sessions",
  );
} catch {}
rl.close();
process.exit(0);
