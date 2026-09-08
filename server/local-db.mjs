import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
export function openLocalDatabase(filename, migrations) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS _atlas_migrations (name TEXT PRIMARY KEY)",
  );
  for (const name of fs
    .readdirSync(migrations)
    .filter((x) => x.endsWith(".sql"))
    .sort())
    if (
      !db.prepare("SELECT name FROM _atlas_migrations WHERE name=?").get(name)
    ) {
      db.exec("BEGIN");
      try {
        db.exec(fs.readFileSync(path.join(migrations, name), "utf8"));
        db.prepare("INSERT INTO _atlas_migrations (name) VALUES (?)").run(name);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              return { results: db.prepare(sql).all(...args) };
            },
            async first() {
              return db.prepare(sql).get(...args) || null;
            },
            async run() {
              return db.prepare(sql).run(...args);
            },
          };
        },
      };
    },
    close() {
      db.close();
    },
  };
}
