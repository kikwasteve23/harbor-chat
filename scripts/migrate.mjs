import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("No DATABASE_URL — skipping Postgres migrate (local file store).");
  process.exit(0);
}

const local = url.includes("localhost") || url.includes("127.0.0.1");
const ssl = process.env.DATABASE_SSL === "false" || local ? false : { rejectUnauthorized: false };
const pool = new pg.Pool({ connectionString: url, ssl });
const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
await pool.query(sql);
await pool.end();
console.log("Postgres schema ready.");
