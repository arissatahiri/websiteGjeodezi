const { db, getDriver } = require("./db");

let webpush = null;
try {
  webpush = require("web-push");
} catch {
  webpush = null;
}

const DEFAULT_SUBJECT = "mailto:tahiriibrahim97@gmail.com";

async function getSetting(key) {
  const row = await db.get("SELECT value FROM settings WHERE `key` = ?", [key]);
  return row?.value || null;
}

async function setSetting(key, value) {
  if (getDriver() === "mysql") {
    await db.run(
      "INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [key, value]
    );
  } else {
    await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  }
}

async function ensureVapid() {
  if (!webpush) return null;
  let publicKey = await getSetting("vapid_public");
  let privateKey = await getSetting("vapid_private");
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting("vapid_public", publicKey);
    await setSetting("vapid_private", privateKey);
  }
  webpush.setVapidDetails(DEFAULT_SUBJECT, publicKey, privateKey);
  return { publicKey, privateKey };
}

async function createNotification({ type, title, body, link }) {
  await db.run(
    `INSERT INTO app_notifications (type, title, body, link, is_read)
     VALUES (?, ?, ?, ?, 0)`,
    [type || "info", title || "Njoftim", body || "", link || ""]
  );
  const row = await db.get("SELECT * FROM app_notifications ORDER BY id DESC LIMIT 1");
  /* Push në background — mos e blloko përgjigjen e API (p.sh. forma e kontaktit) */
  Promise.resolve(
    broadcastPush({
      title: row.title,
      body: row.body,
      url: row.link || "/admin/",
      tag: `${row.type}-${row.id}`,
    })
  ).catch(() => {});
  return row;
}

async function broadcastPush(payload) {
  if (!webpush) return { sent: 0, skipped: true };
  await ensureVapid();
  const subs = await db.all("SELECT * FROM push_subscriptions");
  if (!subs.length) return { sent: 0 };
  let sent = 0;
  for (const row of subs) {
    try {
      const sub = JSON.parse(row.subscription_json);
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.run("DELETE FROM push_subscriptions WHERE id = ?", [row.id]);
      }
    }
  }
  return { sent };
}

async function saveSubscription(subscription, userAgent) {
  const endpoint = subscription?.endpoint;
  if (!endpoint) throw new Error("Subscription e pavlefshme");
  const json = JSON.stringify(subscription);
  const existing = await db.get(
    "SELECT id FROM push_subscriptions WHERE endpoint = ?",
    [endpoint]
  );
  if (existing) {
    await db.run(
      "UPDATE push_subscriptions SET subscription_json = ?, user_agent = ? WHERE id = ?",
      [json, userAgent || "", existing.id]
    );
    return existing.id;
  }
  await db.run(
    "INSERT INTO push_subscriptions (endpoint, subscription_json, user_agent) VALUES (?, ?, ?)",
    [endpoint, json, userAgent || ""]
  );
  const row = await db.get("SELECT id FROM push_subscriptions ORDER BY id DESC LIMIT 1");
  return row?.id;
}

module.exports = {
  ensureVapid,
  createNotification,
  broadcastPush,
  saveSubscription,
  hasWebPush: () => !!webpush,
};
