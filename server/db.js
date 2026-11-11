const fs = require("fs");
const path = require("path");

const IS_CLOUD = !!(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.DB_MODE === "sqlite" && /[/\\]var[/\\]task\b/i.test(__dirname)
);
/* Në Netlify/Lambda filesystem është read-only — vetëm /tmp shkruhet */
const dataDir = IS_CLOUD
  ? path.join("/tmp", "gjeodeti-data")
  : path.join(__dirname, "..", "data");
const uploadsDir = IS_CLOUD
  ? path.join("/tmp", "gjeodeti-uploads")
  : path.join(__dirname, "..", "uploads");
const sqliteFile = path.join(IS_CLOUD ? "/tmp" : dataDir, "gjeodeti.db");

function ensureDir(p) {
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  } catch (err) {
    console.warn("mkdir failed:", p, err.message);
  }
}
ensureDir(dataDir);
ensureDir(uploadsDir);
["gallery", "services", "projects"].forEach((d) => ensureDir(path.join(uploadsDir, d)));

const DB_CONFIG = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "gjeodeti",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  dateStrings: true,
};

/** mysql | sqlite */
let driver = "mysql";
let pool = null;
let raw = null;
let SQL = null;
let blobStore = null;

function useSqlite() {
  const mode = String(process.env.DB_MODE || "").toLowerCase();
  if (mode === "sqlite" || mode === "sqljs") return true;
  if (mode === "mysql") return false;
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  return false;
}

function persist() {
  if (driver !== "sqlite" || !raw) return;
  try {
    const data = Buffer.from(raw.export());
    fs.writeFileSync(sqliteFile, data);
    if (blobStore) {
      Promise.resolve(blobStore.set("gjeodeti.db", data)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

function normalizeSql(sql) {
  let s = String(sql);
  if (driver === "mysql") {
    s = s.replace(/datetime\('now'\)/gi, "NOW()");
  } else {
    s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
    s = s.replace(/DATE_FORMAT\(([^,]+),\s*'%Y-%m'\)/gi, "substr($1, 1, 7)");
    s = s.replace(/`key`/g, "key");
  }
  return s;
}

function mapRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}

async function run(sql, params = []) {
  if (driver === "mysql") {
    const [result] = await pool.execute(normalizeSql(sql), params);
    return result;
  }
  raw.run(normalizeSql(sql), params);
  persist();
  return { affectedRows: raw.getRowsModified() };
}

async function get(sql, params = []) {
  if (driver === "mysql") {
    const [rows] = await pool.execute(normalizeSql(sql), params);
    return rows[0] ? mapRow(rows[0]) : null;
  }
  const stmt = raw.prepare(normalizeSql(sql));
  stmt.bind(params);
  if (stmt.step()) {
    const row = mapRow(stmt.getAsObject());
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

async function all(sql, params = []) {
  if (driver === "mysql") {
    const [rows] = await pool.execute(normalizeSql(sql), params);
    return rows.map(mapRow);
  }
  const stmt = raw.prepare(normalizeSql(sql));
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(mapRow(stmt.getAsObject()));
  stmt.free();
  return rows;
}

async function exec(sql) {
  const statements = String(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    if (driver === "mysql") {
      await pool.query(normalizeSql(statement));
    } else {
      raw.run(normalizeSql(statement));
    }
  }
  if (driver === "sqlite") persist();
}

const db = {
  run,
  get,
  all,
  exec,
  prepare(sql) {
    return {
      async run(...params) {
        const result = await run(sql, params);
        return { changes: result.affectedRows || 0 };
      },
      async get(...params) {
        return get(sql, params);
      },
      async all(...params) {
        return all(sql, params);
      },
    };
  },
};

const MYSQL_SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(191) NULL,
  address TEXT NULL,
  notes TEXT NULL,
  is_new TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  icon VARCHAR(64) NULL,
  category VARCHAR(128) NULL,
  image_path VARCHAR(512) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  client_id INT NULL,
  location VARCHAR(255) NULL,
  start_date VARCHAR(32) NULL,
  due_date VARCHAR(32) NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'i_ri',
  notes TEXT NULL,
  show_on_site TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS project_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  image_path VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(191) NULL,
  phone VARCHAR(64) NULL,
  service_interest VARCHAR(255) NULL,
  message TEXT NOT NULL,
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quote_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  client_name VARCHAR(255) NOT NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(191) NULL,
  service_type VARCHAR(255) NULL,
  description TEXT NULL,
  location VARCHAR(255) NULL,
  offer_value DOUBLE NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'e_re',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  task_date VARCHAR(32) NOT NULL,
  start_time VARCHAR(32) NULL,
  end_time VARCHAR(32) NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'normal',
  status VARCHAR(32) NOT NULL DEFAULT 'todo',
  location VARCHAR(255) NULL,
  client_name VARCHAR(255) NULL,
  client_phone VARCHAR(64) NULL,
  client_id INT NULL,
  project_id INT NULL,
  notes TEXT NULL,
  is_recurring TINYINT NOT NULL DEFAULT 0,
  recur_rule VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS gallery (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_path VARCHAR(512) NOT NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_content (
  \`key\` VARCHAR(191) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  \`key\` VARCHAR(191) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(64) NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  link VARCHAR(512) NULL,
  is_read TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(768) NOT NULL,
  subscription_json TEXT NOT NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint(191))
);
`;

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_new INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  image_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  client_id INTEGER,
  location TEXT,
  start_date TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'i_ri',
  notes TEXT,
  show_on_site INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  service_interest TEXT,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  client_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  service_type TEXT,
  description TEXT,
  location TEXT,
  offer_value REAL,
  status TEXT NOT NULL DEFAULT 'e_re',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  task_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'todo',
  location TEXT,
  client_name TEXT,
  client_phone TEXT,
  client_id INTEGER,
  project_id INTEGER,
  notes TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recur_rule TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS app_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function ensureTaskRemindedColumn() {
  try {
    if (driver === "mysql") {
      const cols = await all("SHOW COLUMNS FROM tasks LIKE 'reminded_at'");
      if (!cols.length) {
        await run("ALTER TABLE tasks ADD COLUMN reminded_at DATETIME NULL");
      }
    } else {
      const cols = await all("PRAGMA table_info(tasks)");
      if (!cols.some((c) => c.name === "reminded_at")) {
        await run("ALTER TABLE tasks ADD COLUMN reminded_at TEXT");
      }
    }
  } catch (err) {
    console.warn("reminded_at column:", err.message);
  }
}

async function ensureClientsNewColumn() {
  try {
    if (driver === "mysql") {
      const cols = await all("SHOW COLUMNS FROM clients LIKE 'is_new'");
      if (!cols.length) {
        await run("ALTER TABLE clients ADD COLUMN is_new TINYINT NOT NULL DEFAULT 0");
      }
    } else {
      const cols = await all("PRAGMA table_info(clients)");
      if (!cols.some((c) => c.name === "is_new")) {
        await run("ALTER TABLE clients ADD COLUMN is_new INTEGER NOT NULL DEFAULT 0");
      }
    }
  } catch (err) {
    console.warn("clients.is_new column:", err.message);
  }
}

async function initSqlite() {
  driver = "sqlite";
  const initSqlJs = require("sql.js");
  SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });

  try {
    const { getStore } = require("@netlify/blobs");
    blobStore = getStore("gjeodeti-db");
    const buf = await blobStore.get("gjeodeti.db", { type: "arrayBuffer" });
    if (buf) {
      raw = new SQL.Database(new Uint8Array(buf));
      console.log("SQLite ← Netlify Blobs");
    }
  } catch {
    blobStore = null;
  }

  if (!raw) {
    if (fs.existsSync(sqliteFile)) {
      raw = new SQL.Database(fs.readFileSync(sqliteFile));
      console.log(`SQLite ← ${sqliteFile}`);
    } else {
      raw = new SQL.Database();
      console.log("SQLite ← new database");
    }
  }

  await exec(SQLITE_SCHEMA);
  await ensureTaskRemindedColumn();
  await ensureClientsNewColumn();
  persist();
  return db;
}

async function initMysql() {
  driver = "mysql";
  const mysql = require("mysql2/promise");
  const { database, ...serverConfig } = DB_CONFIG;
  const boot = await mysql.createConnection(serverConfig);
  await boot.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await boot.end();
  pool = mysql.createPool(DB_CONFIG);
  await exec(MYSQL_SCHEMA);
  await ensureTaskRemindedColumn();
  await ensureClientsNewColumn();
  console.log(
    `MySQL → ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`
  );
  return db;
}

async function initDb() {
  if (useSqlite()) {
    return initSqlite();
  }
  try {
    return await initMysql();
  } catch (err) {
    console.warn("MySQL dështoi, duke kaluar në SQLite:", err.message);
    return initSqlite();
  }
}

module.exports = {
  initDb,
  db,
  dbPath: sqliteFile,
  uploadsDir,
  dataDir,
  persist,
  DB_CONFIG,
  getDriver: () => driver,
};
