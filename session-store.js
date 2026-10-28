import session from "express-session";
import Database from "better-sqlite3";
import path from "node:path";
import { dataDir } from "./store.js";
export class SessionStore extends session.Store {
  constructor() {
    super();
    this.db = new Database(path.join(dataDir, "sessions.sqlite"));
    this.db.pragma("journal_mode=WAL");
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL)",
    );
    this.timer = setInterval(
      () =>
        this.db
          .prepare("DELETE FROM sessions WHERE expires < ?")
          .run(Date.now()),
      60000,
    );
    this.timer.unref();
  }
  get(sid, cb) {
    try {
      const row = this.db
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, data, cb = () => {}) {
    try {
      this.db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET expires=excluded.expires,data=excluded.data",
        )
        .run(
          sid,
          new Date(data.cookie.expires).getTime() || Date.now() + 14400000,
          JSON.stringify(data),
        );
      cb();
    } catch (e) {
      cb(e);
    }
  }
  destroy(sid, cb = () => {}) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, data, cb) {
    this.set(sid, data, cb);
  }
}
