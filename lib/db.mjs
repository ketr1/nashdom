import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const schema = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL UNIQUE CHECK(role IN ('child','mother')), password TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('shopping','tasks','important')), title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0, assignee TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dinner (day TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, arrival TEXT NOT NULL DEFAULT '', PRIMARY KEY(day,user_id))`,
  `CREATE TABLE IF NOT EXISTS bills (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, amount INTEGER NOT NULL, due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31))`,
  `CREATE TABLE IF NOT EXISTS bill_payments (bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE, month TEXT NOT NULL, paid_at TEXT NOT NULL, PRIMARY KEY(bill_id,month))`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires TEXT NOT NULL)`
];
let connection;
let ready;
async function connect() {
  if (connection) return connection;
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    connection = {
      query: (text, params = []) => sql.query(text, params),
      batch: statements => sql.transaction(statements.map(([q, p = []]) => sql.query(q, p)))
    };
  } else if (process.env.LOCAL_DB === '1' && !process.env.VERCEL) {
    const { DatabaseSync } = await import('node:sqlite');
    const file = process.env.DB_PATH || resolve('.data/home.sqlite');
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const run = (text, params = []) => {
      const stmt = db.prepare(text.replace(/\$\d+/g, '?'));
      return stmt.columns().length ? stmt.all(...params) : (stmt.run(...params), []);
    };
    connection = { query: async (q, p) => run(q, p), batch: async statements => {
      db.exec('BEGIN IMMEDIATE');
      try { const result = statements.map(([q, p]) => run(q, p)); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } };
  } else throw Object.assign(new Error('Подключи Neon в Vercel: нужна переменная DATABASE_URL.'), { status: 503 });
  return connection;
}
export async function database() {
  const db = await connect();
  if (!ready) ready = db.batch(schema.map(q => [q])).catch(error => { ready = undefined; throw error; });
  await ready;
  return db;
}
