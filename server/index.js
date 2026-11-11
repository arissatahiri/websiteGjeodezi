const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const cookieSession = require("cookie-session");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const multer = require("multer");
const { initDb, db, uploadsDir, getDriver } = require("./db");
const { requireAuth, getAdmin, login, changePassword } = require("./auth");
const { todayStr, nowLabel, partsInTz } = require("./time");
const { seedIfNeeded } = require("./bootstrap");
const {
  ensureVapid,
  createNotification,
  saveSubscription,
  hasWebPush,
} = require("./notify");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, "..");
const IS_NETLIFY = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (IS_NETLIFY ? "gjeodeti-netlify-dev-secret-change-me" : "gjeodeti-local-dev-secret");

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = req.uploadFolder || "gallery";
    cb(null, path.join(uploadsDir, folder));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error("Vetëm imazhe lejohen."));
    }
    cb(null, true);
  },
});

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function createApp(options = {}) {
  const apiOnly = !!options.apiOnly;
  await initDb();
  await seedIfNeeded();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  /* Netlify function path → /api/... */
  app.use((req, res, next) => {
    const markers = ["/.netlify/functions/api", "/.netlify/functions/server"];
    for (const marker of markers) {
      if (req.url.startsWith(marker)) {
        req.url = req.url.slice(marker.length) || "/";
        if (!req.url.startsWith("/api")) {
          req.url = "/api" + (req.url === "/" ? "" : req.url);
        }
        break;
      }
    }
    next();
  });

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  if (IS_NETLIFY) {
    app.use(
      cookieSession({
        name: "gjeodeti",
        keys: [SESSION_SECRET],
        maxAge: 1000 * 60 * 60 * 12,
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      })
    );
  } else {
    app.use(
      session({
        name: "gjeodeti.sid",
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          maxAge: 1000 * 60 * 60 * 12,
        },
      })
    );
  }

  app.use("/uploads", express.static(uploadsDir));

  /* ---------- Health (për admin: a është API aktiv) ---------- */
  app.get("/api/health", async (req, res) => {
    try {
      await db.get("SELECT 1 AS ok");
      res.json({
        ok: true,
        service: "gjeodeti-api",
        db: getDriver(),
        netlify: IS_NETLIFY,
        time: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        error: IS_NETLIFY
          ? "Databaza cloud nuk u inicializua."
          : "Databaza nuk lidhet. Nis MySQL në XAMPP.",
        detail: err.message,
      });
    }
  });

  /* ---------- Auth ---------- */
  app.get("/api/auth/me", async (req, res) => {
    try {
      const admin = await getAdmin(req);
      if (!admin) return res.status(401).json({ authenticated: false });
      res.json({ authenticated: true, admin });
    } catch (err) {
      console.error("AUTH ME ERROR:", err);
      res.status(500).json({ authenticated: false, error: "Gabim i databazës." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email dhe fjalëkalimi janë të detyrueshëm." });
      }
      const result = await login(email, password);
      if (!result.ok) return res.status(401).json({ error: result.error });
      req.session.adminId = result.admin.id;
      req.session.adminName = result.admin.name;
      res.json({ ok: true, admin: result.admin, message: "Kyçja u krye me sukses." });
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      res.status(500).json({
        error: "Gabim i databazës. Nis MySQL në XAMPP dhe provo përsëri.",
      });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    if (typeof req.session?.destroy === "function") {
      req.session.destroy(() => {
        res.clearCookie("gjeodeti.sid");
        res.json({ ok: true });
      });
      return;
    }
    req.session = null;
    res.clearCookie("gjeodeti");
    res.clearCookie("gjeodeti.sid");
    res.json({ ok: true });
  });

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const result = await changePassword(req.session.adminId, currentPassword, newPassword);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true, message: "Fjalëkalimi u ndryshua." });
  });

  /* ---------- Public contact → messages + klient ---------- */
  app.post("/api/public/contact", async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const message = String(req.body?.message || "").trim();
    const service_interest = String(req.body?.service || "").trim();
    if (!name || !message) {
      return res.status(400).json({ error: "Emri dhe mesazhi janë të detyrueshëm." });
    }
    await db.run(
      `INSERT INTO messages (name, email, phone, service_interest, message, is_read)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [name, email, phone, service_interest, message]
    );

    /* Regjistro / përditëso klientin (si mesazhet) */
    let client = null;
    if (email) {
      client = await db.get("SELECT * FROM clients WHERE email = ? LIMIT 1", [email]);
    }
    if (!client && phone && phone !== "—") {
      client = await db.get("SELECT * FROM clients WHERE phone = ? LIMIT 1", [phone]);
    }
    const noteBits = [
      service_interest ? `Interes: ${service_interest}` : "",
      message.length > 180 ? `${message.slice(0, 177)}…` : message,
    ].filter(Boolean);
    const noteLine = noteBits.join(" · ");
    if (client) {
      const mergedNotes = [client.notes || "", noteLine].filter(Boolean).join("\n").slice(0, 2000);
      await db.run(
        `UPDATE clients SET
          full_name = ?,
          phone = COALESCE(NULLIF(?, ''), phone),
          email = COALESCE(NULLIF(?, ''), email),
          notes = ?,
          is_new = 1
         WHERE id = ?`,
        [name, phone === "—" ? "" : phone, email, mergedNotes, client.id]
      );
    } else {
      await db.run(
        `INSERT INTO clients (full_name, phone, email, address, notes, is_new) VALUES (?,?,?,?,?,1)`,
        [name, phone === "—" ? "" : phone, email, "", noteLine]
      );
    }

    const preview = message.length > 120 ? `${message.slice(0, 117)}…` : message;
    await createNotification({
      type: "contact",
      title: `Kontakt i ri: ${name}`,
      body: [phone, email, preview].filter(Boolean).join(" · "),
      link: "/admin/#messages",
    });
    res.json({ ok: true, notified: true, clientSaved: true });
  });

  app.get("/api/public/services", async (req, res) => {
    res.json(
      await db.all(
        "SELECT id, title, description, category, sort_order FROM services WHERE is_active = 1 ORDER BY sort_order, id"
      )
    );
  });

  app.get("/api/public/gallery", async (req, res) => {
    res.json(
      await db.all(
        "SELECT id, image_path, alt_text FROM gallery WHERE is_active = 1 ORDER BY sort_order, id"
      )
    );
  });

  app.get("/api/public/content", async (req, res) => {
    const rows = await db.all("SELECT `key`, value FROM site_content");
    const out = {};
    rows.forEach((r) => {
      out[r.key] = r.value;
    });
    res.json(out);
  });

  /* ---------- Dashboard stats ---------- */
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const today = todayStr();
    const in7 = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return todayStr(d);
    })();
    const stats = {
      clientsTotal: Number((await db.get("SELECT COUNT(*) AS c FROM clients"))?.c || 0),
      clientsNew: Number((await db.get("SELECT COUNT(*) AS c FROM clients WHERE is_new = 1"))?.c || 0),
      messagesTotal: Number((await db.get("SELECT COUNT(*) AS c FROM messages"))?.c || 0),
      messagesUnread: Number((await db.get("SELECT COUNT(*) AS c FROM messages WHERE is_read = 0"))?.c || 0),
      quotesNew: Number((await db.get("SELECT COUNT(*) AS c FROM quote_requests WHERE status = 'e_re'"))?.c || 0),
      projectsActive: Number((await db.get(
        "SELECT COUNT(*) AS c FROM projects WHERE status IN ('i_ri','ne_proces','ne_pritje')"
      ))?.c || 0),
      projectsDone: Number((await db.get("SELECT COUNT(*) AS c FROM projects WHERE status = 'i_perfunday'"))?.c || 0),
      servicesCount: Number((await db.get("SELECT COUNT(*) AS c FROM services WHERE is_active = 1"))?.c || 0),
      tasksToday: Number((await db.get("SELECT COUNT(*) AS c FROM tasks WHERE task_date = ?", [today]))?.c || 0),
      tasksDoneToday: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND status = 'done'",
        [today]
      ))?.c || 0),
      tasksRemainingToday: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND status != 'done'",
        [today]
      ))?.c || 0),
      tasksUrgent: Number((await db.get(
        `SELECT COUNT(*) AS c FROM tasks
         WHERE priority = 'urgent' AND status != 'done'`
      ))?.c || 0),
      tasksOverdue: Number((await db.get(
        `SELECT COUNT(*) AS c FROM tasks
         WHERE status != 'done' AND task_date < ?`,
        [today]
      ))?.c || 0),
      galleryCount: Number((await db.get(
        "SELECT COUNT(*) AS c FROM gallery WHERE is_active = 1"
      ))?.c || 0),
      projectsTotal: Number((await db.get("SELECT COUNT(*) AS c FROM projects"))?.c || 0),
    };

    const notifications = [];
    if (stats.clientsNew) {
      notifications.push({
        type: "client",
        text: `${stats.clientsNew} klientë të rinj`,
      });
    }
    if (stats.messagesUnread) {
      notifications.push({
        type: "message",
        text: `${stats.messagesUnread} mesazhe të palexuara`,
      });
    }
    if (stats.quotesNew) {
      notifications.push({
        type: "quote",
        text: `${stats.quotesNew} kërkesa të reja për oferta`,
      });
    }
    if (stats.tasksUrgent) {
      notifications.push({
        type: "urgent",
        text: `${stats.tasksUrgent} detyra urgjente`,
      });
    }
    if (stats.tasksOverdue) {
      notifications.push({
        type: "overdue",
        text: `${stats.tasksOverdue} detyra të vonuara`,
      });
    }

    const appNotes = await db.all(
      "SELECT * FROM app_notifications WHERE is_read = 0 ORDER BY id DESC LIMIT 25"
    );
    for (const n of appNotes) {
      notifications.unshift({
        type: n.type || "info",
        text: n.body ? `${n.title}: ${n.body}` : n.title,
        id: n.id,
        link: n.link || "",
      });
    }

    res.json({
      now: nowLabel(),
      stats,
      notifications,
      appNotifications: appNotes,
      todayTasks: await db.all(
        `SELECT * FROM tasks WHERE task_date = ? ORDER BY COALESCE(start_time,'99:99'), id`,
        [today]
      ),
      recentMessages: await db.all(
        "SELECT * FROM messages ORDER BY created_at DESC LIMIT 5"
      ),
      recentQuotes: await db.all(
        "SELECT * FROM quote_requests ORDER BY created_at DESC LIMIT 5"
      ),
      activeProjects: await db.all(
        `SELECT * FROM projects
         WHERE status IN ('i_ri','ne_proces','ne_pritje')
         ORDER BY updated_at DESC LIMIT 5`
      ),
      dueSoonProjects: await db.all(
        `SELECT * FROM projects
         WHERE due_date IS NOT NULL AND due_date != ''
           AND due_date >= ? AND due_date <= ?
           AND status NOT IN ('i_perfunday','i_anuluar')
         ORDER BY due_date LIMIT 5`,
        [today, in7]
      ),
      upcomingTasks: await db.all(
        `SELECT * FROM tasks
         WHERE status != 'done' AND task_date >= ?
         ORDER BY task_date, COALESCE(start_time,'99:99')
         LIMIT 8`,
        [today]
      ),
      monthly: await monthlyStats(),
    });
  });

  async function monthlyStats() {
    const months = {};
    (await db.all(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS c FROM messages
       GROUP BY m ORDER BY m DESC LIMIT 6`
    )).forEach((r) => {
      months[r.m] = months[r.m] || { messages: 0, quotes: 0, tasks: 0 };
      months[r.m].messages = Number(r.c || 0);
    });
    (await db.all(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS c FROM quote_requests
       GROUP BY m ORDER BY m DESC LIMIT 6`
    )).forEach((r) => {
      months[r.m] = months[r.m] || { messages: 0, quotes: 0, tasks: 0 };
      months[r.m].quotes = Number(r.c || 0);
    });
    (await db.all(
      `SELECT DATE_FORMAT(task_date, '%Y-%m') AS m, COUNT(*) AS c FROM tasks
       GROUP BY m ORDER BY m DESC LIMIT 6`
    )).forEach((r) => {
      months[r.m] = months[r.m] || { messages: 0, quotes: 0, tasks: 0 };
      months[r.m].tasks = Number(r.c || 0);
    });
    return Object.keys(months)
      .sort()
      .map((m) => ({ month: m, ...months[m] }));
  }

  /* ---------- Tasks / Daily planner ---------- */
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const { date, from, to, status, priority, q } = req.query;
    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params = [];
    if (date) {
      sql += " AND task_date = ?";
      params.push(date);
    }
    if (from) {
      sql += " AND task_date >= ?";
      params.push(from);
    }
    if (to) {
      sql += " AND task_date <= ?";
      params.push(to);
    }
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (priority) {
      sql += " AND priority = ?";
      params.push(priority);
    }
    if (q) {
      sql += " AND (title LIKE ? OR client_name LIKE ? OR location LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY task_date, COALESCE(start_time,'99:99'), id";
    res.json(await db.all(sql, params));
  });

  app.get("/api/tasks/summary", requireAuth, async (req, res) => {
    const date = String(req.query.date || todayStr());
    res.json({
      date,
      now: nowLabel(),
      total: Number((await db.get("SELECT COUNT(*) AS c FROM tasks WHERE task_date = ?", [date]))?.c || 0),
      done: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND status = 'done'",
        [date]
      ))?.c || 0),
      inProgress: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND status = 'doing'",
        [date]
      ))?.c || 0),
      todo: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND status = 'todo'",
        [date]
      ))?.c || 0),
      urgent: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE task_date = ? AND priority = 'urgent' AND status != 'done'",
        [date]
      ))?.c || 0),
      overdue: Number((await db.get(
        "SELECT COUNT(*) AS c FROM tasks WHERE status != 'done' AND task_date < ?",
        [date]
      ))?.c || 0),
      tasks: await db.all(
        `SELECT * FROM tasks WHERE task_date = ? ORDER BY COALESCE(start_time,'99:99'), id`,
        [date]
      ),
    });
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.title || !b.task_date) {
      return res.status(400).json({ error: "Titulli dhe data janë të detyrueshme." });
    }
    await db.run(
      `INSERT INTO tasks (
        title, description, task_date, start_time, end_time, priority, status,
        location, client_name, client_phone, client_id, project_id, notes,
        is_recurring, recur_rule
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        String(b.title).trim(),
        b.description || "",
        b.task_date,
        b.start_time || null,
        b.end_time || null,
        b.priority || "normal",
        b.status || "todo",
        b.location || "",
        b.client_name || "",
        b.client_phone || "",
        b.client_id || null,
        b.project_id || null,
        b.notes || "",
        b.is_recurring ? 1 : 0,
        b.recur_rule || null,
      ]
    );
    const row = await db.get("SELECT * FROM tasks ORDER BY id DESC LIMIT 1");
    res.status(201).json(row);
  });

  app.put("/api/tasks/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const existing = await db.get("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Detyra nuk u gjet." });
    const b = { ...existing, ...req.body, id };
    const timeChanged =
      String(existing.task_date) !== String(b.task_date) ||
      String(existing.start_time || "") !== String(b.start_time || "");
    await db.run(
      `UPDATE tasks SET
        title=?, description=?, task_date=?, start_time=?, end_time=?,
        priority=?, status=?, location=?, client_name=?, client_phone=?,
        client_id=?, project_id=?, notes=?, is_recurring=?, recur_rule=?,
        reminded_at=${timeChanged ? "NULL" : "reminded_at"},
        updated_at=datetime('now')
       WHERE id=?`,
      [
        b.title,
        b.description || "",
        b.task_date,
        b.start_time || null,
        b.end_time || null,
        b.priority || "normal",
        b.status || "todo",
        b.location || "",
        b.client_name || "",
        b.client_phone || "",
        b.client_id || null,
        b.project_id || null,
        b.notes || "",
        b.is_recurring ? 1 : 0,
        b.recur_rule || null,
        id,
      ]
    );
    res.json(await db.get("SELECT * FROM tasks WHERE id = ?", [id]));
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM tasks WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Push + njoftime (telefon) ---------- */
  app.get("/api/push/vapid-public", requireAuth, async (req, res) => {
    if (!hasWebPush()) {
      return res.status(503).json({ error: "web-push nuk është instaluar në server." });
    }
    const keys = await ensureVapid();
    res.json({ publicKey: keys.publicKey });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    const id = await saveSubscription(req.body?.subscription, req.headers["user-agent"] || "");
    res.json({ ok: true, id });
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    const sinceId = num(req.query.since, 0);
    const unreadOnly = String(req.query.unread || "") === "1";
    let sql = "SELECT * FROM app_notifications WHERE 1=1";
    const params = [];
    if (sinceId) {
      sql += " AND id > ?";
      params.push(sinceId);
    }
    if (unreadOnly) sql += " AND is_read = 0";
    sql += " ORDER BY id DESC LIMIT 40";
    res.json(await db.all(sql, params));
  });

  app.post("/api/notifications/read", requireAuth, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(num) : [];
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      await db.run(`UPDATE app_notifications SET is_read = 1 WHERE id IN (${ph})`, ids);
    } else {
      await db.run("UPDATE app_notifications SET is_read = 1 WHERE is_read = 0");
    }
    res.json({ ok: true });
  });

  app.get("/api/tasks/week", requireAuth, async (req, res) => {
    const start = String(req.query.start || todayStr());
    const d0 = new Date(`${start}T12:00:00`);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(d0);
      d.setDate(d0.getDate() + i);
      days.push(todayStr(d));
    }
    const tasks = await db.all(
      `SELECT * FROM tasks WHERE task_date >= ? AND task_date <= ? ORDER BY task_date, COALESCE(start_time,'99:99'), id`,
      [days[0], days[6]]
    );
    res.json({ start: days[0], end: days[6], days, tasks });
  });

  async function processDueTaskReminders() {
    const today = todayStr();
    const p = partsInTz();
    const nowHm = `${p.hour}:${p.minute}`;
    const tasks = await db.all(
      `SELECT * FROM tasks
       WHERE task_date = ? AND status != 'done'
         AND start_time IS NOT NULL AND start_time != ''
         AND reminded_at IS NULL`,
      [today]
    );
    const fired = [];
    for (const t of tasks) {
      const start = String(t.start_time || "").slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(start)) continue;
      /* njoftim ~10 min para, ose deri 30 min pasi ka filluar */
      const [sh, sm] = start.split(":").map(Number);
      const startMins = sh * 60 + sm;
      const [nh, nm] = nowHm.split(":").map(Number);
      const nowMins = nh * 60 + nm;
      const diff = startMins - nowMins;
      if (diff > 10 || diff < -30) continue;
      await db.run("UPDATE tasks SET reminded_at = datetime('now') WHERE id = ?", [t.id]);
      await createNotification({
        type: "task",
        title: `Plani: ${t.title}`,
        body: `${start}${t.location ? ` · ${t.location}` : ""}${t.client_name ? ` · ${t.client_name}` : ""}`,
        link: "/admin/#week",
      });
      fired.push(t.id);
    }
    return fired;
  }

  app.post("/api/tasks/check-reminders", requireAuth, async (req, res) => {
    const fired = await processDueTaskReminders();
    res.json({ ok: true, fired: fired.length, ids: fired });
  });

  /* ---------- Messages ---------- */
  app.get("/api/messages", requireAuth, async (req, res) => {
    const { status, q } = req.query;
    let sql = "SELECT * FROM messages WHERE 1=1";
    const params = [];
    if (status === "unread") sql += " AND is_read = 0";
    if (status === "read") sql += " AND is_read = 1";
    if (q) {
      sql += " AND (name LIKE ? OR email LIKE ? OR message LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY created_at DESC";
    res.json(await db.all(sql, params));
  });

  app.patch("/api/messages/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    if (typeof req.body?.is_read !== "undefined") {
      await db.run("UPDATE messages SET is_read = ? WHERE id = ?", [
        req.body.is_read ? 1 : 0,
        id,
      ]);
    }
    res.json(await db.get("SELECT * FROM messages WHERE id = ?", [id]));
  });

  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM messages WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Clients ---------- */
  app.get("/api/clients", requireAuth, async (req, res) => {
    const q = req.query.q;
    let sql = "SELECT * FROM clients";
    const params = [];
    if (q) {
      sql += " WHERE full_name LIKE ? OR phone LIKE ? OR email LIKE ?";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY is_new DESC, created_at DESC";
    res.json(await db.all(sql, params));
  });

  app.post("/api/clients/mark-seen", requireAuth, async (req, res) => {
    const id = num(req.body?.id, 0);
    if (id) {
      await db.run("UPDATE clients SET is_new = 0 WHERE id = ?", [id]);
    } else {
      await db.run("UPDATE clients SET is_new = 0 WHERE is_new = 1");
    }
    res.json({ ok: true });
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const client = await db.get("SELECT * FROM clients WHERE id = ?", [id]);
    if (!client) return res.status(404).json({ error: "Klienti nuk u gjet." });
    if (Number(client.is_new)) {
      await db.run("UPDATE clients SET is_new = 0 WHERE id = ?", [id]);
      client.is_new = 0;
    }
    res.json({
      client,
      projects: await db.all("SELECT * FROM projects WHERE client_id = ? ORDER BY id DESC", [id]),
      quotes: await db.all("SELECT * FROM quote_requests WHERE client_id = ? ORDER BY id DESC", [id]),
      tasks: await db.all("SELECT * FROM tasks WHERE client_id = ? ORDER BY task_date DESC", [id]),
    });
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.full_name) return res.status(400).json({ error: "Emri është i detyrueshëm." });
    await db.run(
      `INSERT INTO clients (full_name, phone, email, address, notes, is_new) VALUES (?,?,?,?,?,0)`,
      [b.full_name.trim(), b.phone || "", b.email || "", b.address || "", b.notes || ""]
    );
    res.status(201).json(await db.get("SELECT * FROM clients ORDER BY id DESC LIMIT 1"));
  });

  app.put("/api/clients/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const b = req.body || {};
    await db.run(
      `UPDATE clients SET full_name=?, phone=?, email=?, address=?, notes=? WHERE id=?`,
      [b.full_name, b.phone || "", b.email || "", b.address || "", b.notes || "", id]
    );
    res.json(await db.get("SELECT * FROM clients WHERE id = ?", [id]));
  });

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM clients WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Services ---------- */
  app.get("/api/services", requireAuth, async (req, res) => {
    res.json(await db.all("SELECT * FROM services ORDER BY sort_order, id"));
  });

  app.post("/api/services", requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: "Titulli është i detyrueshëm." });
    await db.run(
      `INSERT INTO services (title, description, icon, category, image_path, sort_order, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [
        b.title.trim(),
        b.description || "",
        b.icon || "",
        b.category || "",
        b.image_path || "",
        num(b.sort_order, 0),
        b.is_active === 0 || b.is_active === false ? 0 : 1,
      ]
    );
    res.status(201).json(await db.get("SELECT * FROM services ORDER BY id DESC LIMIT 1"));
  });

  app.put("/api/services/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const cur = await db.get("SELECT * FROM services WHERE id = ?", [id]);
    if (!cur) return res.status(404).json({ error: "Shërbimi nuk u gjet." });
    const b = { ...cur, ...req.body };
    await db.run(
      `UPDATE services SET title=?, description=?, icon=?, category=?, image_path=?,
        sort_order=?, is_active=?, updated_at=datetime('now') WHERE id=?`,
      [
        b.title,
        b.description || "",
        b.icon || "",
        b.category || "",
        b.image_path || "",
        num(b.sort_order, 0),
        b.is_active === 0 || b.is_active === false ? 0 : 1,
        id,
      ]
    );
    res.json(await db.get("SELECT * FROM services WHERE id = ?", [id]));
  });

  app.delete("/api/services/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM services WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Projects ---------- */
  app.get("/api/projects", requireAuth, async (req, res) => {
    const { status, q } = req.query;
    let sql = `SELECT p.*, c.full_name AS client_name
               FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE 1=1`;
    const params = [];
    if (status) {
      sql += " AND p.status = ?";
      params.push(status);
    }
    if (q) {
      sql += " AND (p.title LIKE ? OR c.full_name LIKE ? OR p.location LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY p.created_at DESC";
    res.json(await db.all(sql, params));
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: "Titulli është i detyrueshëm." });
    await db.run(
      `INSERT INTO projects (title, description, client_id, location, start_date, due_date, status, notes, show_on_site)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        b.title.trim(),
        b.description || "",
        b.client_id || null,
        b.location || "",
        b.start_date || null,
        b.due_date || null,
        b.status || "i_ri",
        b.notes || "",
        b.show_on_site ? 1 : 0,
      ]
    );
    res.status(201).json(await db.get("SELECT * FROM projects ORDER BY id DESC LIMIT 1"));
  });

  app.put("/api/projects/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const cur = await db.get("SELECT * FROM projects WHERE id = ?", [id]);
    if (!cur) return res.status(404).json({ error: "Projekti nuk u gjet." });
    const b = { ...cur, ...req.body };
    await db.run(
      `UPDATE projects SET title=?, description=?, client_id=?, location=?, start_date=?,
        due_date=?, status=?, notes=?, show_on_site=?, updated_at=datetime('now') WHERE id=?`,
      [
        b.title,
        b.description || "",
        b.client_id || null,
        b.location || "",
        b.start_date || null,
        b.due_date || null,
        b.status || "i_ri",
        b.notes || "",
        b.show_on_site ? 1 : 0,
        id,
      ]
    );
    res.json(await db.get("SELECT * FROM projects WHERE id = ?", [id]));
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    await db.run("DELETE FROM project_images WHERE project_id = ?", [id]);
    await db.run("DELETE FROM projects WHERE id = ?", [id]);
    res.json({ ok: true });
  });

  /* ---------- Quote requests ---------- */
  app.get("/api/quotes", requireAuth, async (req, res) => {
    const { status, q } = req.query;
    let sql = "SELECT * FROM quote_requests WHERE 1=1";
    const params = [];
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (q) {
      sql += " AND (client_name LIKE ? OR phone LIKE ? OR email LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += " ORDER BY created_at DESC";
    res.json(await db.all(sql, params));
  });

  app.post("/api/quotes", requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.client_name) return res.status(400).json({ error: "Emri i klientit është i detyrueshëm." });
    await db.run(
      `INSERT INTO quote_requests
        (client_id, client_name, phone, email, service_type, description, location, offer_value, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        b.client_id || null,
        b.client_name.trim(),
        b.phone || "",
        b.email || "",
        b.service_type || "",
        b.description || "",
        b.location || "",
        b.offer_value != null ? Number(b.offer_value) : null,
        b.status || "e_re",
        b.notes || "",
      ]
    );
    res.status(201).json(await db.get("SELECT * FROM quote_requests ORDER BY id DESC LIMIT 1"));
  });

  app.put("/api/quotes/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const cur = await db.get("SELECT * FROM quote_requests WHERE id = ?", [id]);
    if (!cur) return res.status(404).json({ error: "Kërkesa nuk u gjet." });
    const b = { ...cur, ...req.body };
    await db.run(
      `UPDATE quote_requests SET client_id=?, client_name=?, phone=?, email=?, service_type=?,
        description=?, location=?, offer_value=?, status=?, notes=?, updated_at=datetime('now')
       WHERE id=?`,
      [
        b.client_id || null,
        b.client_name,
        b.phone || "",
        b.email || "",
        b.service_type || "",
        b.description || "",
        b.location || "",
        b.offer_value != null ? Number(b.offer_value) : null,
        b.status || "e_re",
        b.notes || "",
        id,
      ]
    );
    res.json(await db.get("SELECT * FROM quote_requests WHERE id = ?", [id]));
  });

  app.delete("/api/quotes/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM quote_requests WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Gallery ---------- */
  app.get("/api/gallery", requireAuth, async (req, res) => {
    res.json(await db.all("SELECT * FROM gallery ORDER BY sort_order, id"));
  });

  app.post("/api/gallery", requireAuth, (req, res, next) => {
    req.uploadFolder = "gallery";
    next();
  }, upload.single("image"), async (req, res) => {
    const imagePath = req.file
      ? `uploads/gallery/${req.file.filename}`
      : String(req.body?.image_path || "").trim();
    if (!imagePath) return res.status(400).json({ error: "Imazhi është i detyrueshëm." });
    await db.run(
      `INSERT INTO gallery (image_path, alt_text, sort_order, is_active) VALUES (?,?,?,?)`,
      [
        imagePath,
        req.body?.alt_text || "",
        num(req.body?.sort_order, 0),
        req.body?.is_active === "0" || req.body?.is_active === 0 ? 0 : 1,
      ]
    );
    res.status(201).json(await db.get("SELECT * FROM gallery ORDER BY id DESC LIMIT 1"));
  });

  app.put("/api/gallery/:id", requireAuth, async (req, res) => {
    const id = num(req.params.id);
    const cur = await db.get("SELECT * FROM gallery WHERE id = ?", [id]);
    if (!cur) return res.status(404).json({ error: "Fotoja nuk u gjet." });
    const b = { ...cur, ...req.body };
    await db.run(
      `UPDATE gallery SET alt_text=?, sort_order=?, is_active=? WHERE id=?`,
      [b.alt_text || "", num(b.sort_order, 0), b.is_active ? 1 : 0, id]
    );
    res.json(await db.get("SELECT * FROM gallery WHERE id = ?", [id]));
  });

  app.delete("/api/gallery/:id", requireAuth, async (req, res) => {
    await db.run("DELETE FROM gallery WHERE id = ?", [num(req.params.id)]);
    res.json({ ok: true });
  });

  /* ---------- Content / settings ---------- */
  app.get("/api/content", requireAuth, async (req, res) => {
    const rows = await db.all("SELECT `key`, value FROM site_content");
    const out = {};
    rows.forEach((r) => {
      out[r.key] = r.value;
    });
    res.json(out);
  });

  app.put("/api/content", requireAuth, async (req, res) => {
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      const exists = await db.get("SELECT `key` FROM site_content WHERE `key` = ?", [key]);
      if (exists) {
        await db.run(
          "UPDATE site_content SET value=?, updated_at=NOW() WHERE `key`=?",
          [String(value), key]
        );
      } else {
        await db.run("INSERT INTO site_content (`key`, value) VALUES (?, ?)", [
          key,
          String(value),
        ]);
      }
    }
    res.json({ ok: true });
  });

  if (!apiOnly) {
    /* ---------- Static site + admin (vetëm serveri lokal) ---------- */
    app.get(["/admin", "/admin/"], (req, res) => {
      res.sendFile(path.join(ROOT, "admin", "index.html"));
    });
    app.use(
      "/admin",
      express.static(path.join(ROOT, "admin"), {
        setHeaders(res, filePath) {
          if (filePath.endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Service-Worker-Allowed", "/admin/");
          }
          if (filePath.endsWith(".webmanifest")) {
            res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
          }
        },
      })
    );
    app.get(/^\/admin\/.*/, (req, res, next) => {
      if (req.path.includes(".")) return next();
      res.sendFile(path.join(ROOT, "admin", "index.html"));
    });
    app.use(express.static(ROOT));
  }

  /* Çdo /api i panjohur → JSON (jo HTML), që admini të kuptojë gabimin */
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API endpoint nuk u gjet.", path: req.path });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    if (req.path.startsWith("/api") || apiOnly) {
      return res.status(500).json({ error: err.message || "Gabim i brendshëm." });
    }
    res.status(500).send("Gabim i brendshëm.");
  });

  if (!IS_NETLIFY) {
    setInterval(() => {
      processDueTaskReminders().catch((err) => {
        console.warn("reminder check:", err.message);
      });
    }, 60 * 1000);
  }

  return app;
}

async function main() {
  const app = await createApp();
  const HOST = process.env.HOST || "0.0.0.0";
  const os = require("os");
  function lanIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal && net.address.startsWith("192.168.")) {
          return net.address;
        }
      }
    }
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) return net.address;
      }
    }
    return null;
  }
  app.listen(PORT, HOST, () => {
    const ip = lanIp();
    console.log(`Gjeodeti I.T → http://127.0.0.1:${PORT}/`);
    if (ip) console.log(`Në telefon/LAN → http://${ip}:${PORT}/  (i njëjti WiFi)`);
    console.log(`Admin         → http://127.0.0.1:${PORT}/admin/`);
    console.log("Njoftimet e planit kontrollohen çdo 60s.");
  });
}

module.exports = { createApp };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
