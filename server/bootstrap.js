const bcrypt = require("bcryptjs");
const { db } = require("./db");

const ADMIN_NAME = process.env.ADMIN_NAME || "Ibrahim Tahiri";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "tahiriibrahim97@gmail.com").toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || "gjeodeti1";

const DEFAULT_SERVICES = [
  { title: "Ndarja e parcelës", description: "Ndarje profesionale e parcelave kadastrale.", category: "Kadastër", sort_order: 1 },
  { title: "Bashkim i parcelave", description: "Bashkim i parcelave sipas procedurave ligjore.", category: "Kadastër", sort_order: 2 },
  { title: "Ri-rregullim i kufirit", description: "Rregullim dhe verifikim i kufijve të pronës.", category: "Matje", sort_order: 3 },
  { title: "Caktim i kufijve", description: "Përcaktim i saktë i kufijve në terren.", category: "Matje", sort_order: 4 },
  { title: "Matje ndërtesash", description: "Matje teknike të ndërtesave dhe objekteve.", category: "Matje", sort_order: 5 },
  { title: "Legalizim", description: "Mbështetje e plotë për legalizimin e ndërtimeve.", category: "Legalizim", sort_order: 6 },
  { title: "Projektim & mbikëqyrje", description: "Projektim gjeodezik dhe mbikëqyrje profesionale.", category: "Projektim", sort_order: 7 },
];

const DEFAULT_GALLERY = [
  "assets/gallery/teren-01.jpg",
  "assets/gallery/teren-02.jpg",
  "assets/gallery/teren-03.jpg",
  "assets/gallery/teren-04.jpg",
  "assets/gallery/teren-05.jpg",
  "assets/gallery/teren-06.jpg",
  "assets/gallery/teren-07.jpg",
  "assets/gallery/teren-08.jpg",
  "assets/gallery/teren-09.jpg",
];

const DEFAULT_CONTENT = {
  phone: "+383 49 719 253",
  wa: "38349719253",
  email: "tahiriibrahim97@gmail.com",
  hours: "Hën – Prem · 08:00 – 17:00",
  company_name: "Gjeodeti I.T",
  timezone: "Europe/Belgrade",
};

async function seedIfNeeded() {
  const existing = await db.get("SELECT id FROM admins WHERE email = ?", [ADMIN_EMAIL]);
  if (!existing) {
    const hash = bcrypt.hashSync(ADMIN_PASS, 12);
    await db.run("INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)", [
      ADMIN_NAME,
      ADMIN_EMAIL,
      hash,
    ]);
    console.log(`Admin u krijua: ${ADMIN_EMAIL}`);
  }

  const svcCount = await db.get("SELECT COUNT(*) AS c FROM services");
  if (!Number(svcCount?.c || 0)) {
    for (const r of DEFAULT_SERVICES) {
      await db.run(
        `INSERT INTO services (title, description, category, sort_order, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [r.title, r.description, r.category, r.sort_order]
      );
    }
  }

  const galCount = await db.get("SELECT COUNT(*) AS c FROM gallery");
  if (!Number(galCount?.c || 0)) {
    for (let i = 0; i < DEFAULT_GALLERY.length; i++) {
      const src = DEFAULT_GALLERY[i];
      await db.run(
        "INSERT INTO gallery (image_path, alt_text, sort_order, is_active) VALUES (?, ?, ?, 1)",
        [src, `Foto terreni ${i + 1}`, i + 1]
      );
    }
  }

  for (const [k, v] of Object.entries(DEFAULT_CONTENT)) {
    const row = await db.get("SELECT `key` FROM site_content WHERE `key` = ?", [k]);
    if (!row) {
      await db.run("INSERT INTO site_content (`key`, value) VALUES (?, ?)", [k, v]);
    }
  }
}

module.exports = { seedIfNeeded };
