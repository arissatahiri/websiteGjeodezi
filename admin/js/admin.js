(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const titles = {
    dashboard: "Dashboard",
    planner: "Plani ditor",
    week: "Plani javor",
    calendar: "Kalendari",
    messages: "Mesazhet",
    clients: "Klientët",
    services: "Shërbimet",
    projects: "Projektet",
    quotes: "Ofertat",
    content: "Përmbajtja",
    gallery: "Galeria",
    settings: "Cilësimet",
  };
  const MONTHS_SQ = [
    "janar", "shkurt", "mars", "prill", "maj", "qershor",
    "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor",
  ];

  const PRIORITY = {
    low: "I ulët",
    normal: "Normal",
    high: "I lartë",
    urgent: "Urgjent",
  };
  const TSTATUS = {
    todo: "Për t'u bërë",
    doing: "Në proces",
    done: "Përfunduar",
    delayed: "Shtyrë",
  };
  const PSTATUS = {
    i_ri: "I ri",
    ne_proces: "Në proces",
    ne_pritje: "Në pritje",
    i_perfunday: "I përfunduar",
    i_anuluar: "I anuluar",
  };
  const QSTATUS = {
    e_re: "E re",
    ne_shqyrtim: "Në shqyrtim",
    dërguar: "Ofertë dërguar",
    pranuar: "Pranuar",
    refuzuar: "Refuzuar",
  };

  let admin = null;
  let view = "dashboard";
  let plannerDate = todayISO();
  let calMonth = new Date();
  let weekStart = mondayOf(todayISO());
  let lastNotifyId = Number(localStorage.getItem("gjeodeti-last-notify") || 0);
  let notifyTimer = null;
  let deferredInstallPrompt = null;

  function isStandaloneApp() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  async function ensureAdminServiceWorker() {
    if (!("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/" });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function installAdminApp() {
    if (isStandaloneApp()) {
      return { ok: true, message: "Aplikacioni është tashmë i instaluar." };
    }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice.outcome === "accepted") {
        return { ok: true, message: "U instalua në telefon." };
      }
      return { ok: false, message: "Instalimi u anulua." };
    }
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      return {
        ok: false,
        message: "Në iPhone: Share → “Add to Home Screen” / “Shto në Ekranin Bazë”.",
      };
    }
    return {
      ok: false,
      message: "Hape adminin në Chrome/Edge (HTTPS ose localhost), pastaj provo përsëri.",
    };
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = $("#installAppBtn");
    if (btn) btn.hidden = false;
  });

  function mondayOf(iso) {
    const d = new Date(`${iso}T12:00:00`);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function enablePhoneNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      throw new Error("Ky telefon/shfletues nuk mbështet njoftime.");
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Leja për njoftime u refuzua.");
    const reg = await ensureAdminServiceWorker();
    if (!reg) throw new Error("Service worker nuk u regjistrua.");
    const { publicKey } = await api("/api/push/vapid-public");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api("/api/push/subscribe", {
      method: "POST",
      body: { subscription: sub.toJSON() },
    });
    localStorage.setItem("gjeodeti-push-on", "1");
    return true;
  }

  async function pollNotifications() {
    try {
      await api("/api/tasks/check-reminders", { method: "POST" });
      const rows = await api(`/api/notifications?since=${lastNotifyId}`);
      if (!Array.isArray(rows) || !rows.length) return;
      const newest = rows[0];
      if (newest.id > lastNotifyId) {
        lastNotifyId = newest.id;
        localStorage.setItem("gjeodeti-last-notify", String(lastNotifyId));
      }
      for (const n of [...rows].reverse()) {
        if (Notification.permission === "granted") {
          try {
            new Notification(n.title || "Njoftim", {
              body: n.body || "",
              tag: `n-${n.id}`,
              icon: "/assets/logo.png",
            });
          } catch {
            /* ignore */
          }
        }
      }
      refreshBadge();
    } catch {
      /* ignore while offline */
    }
  }

  function startNotifyLoop() {
    if (notifyTimer) clearInterval(notifyTimer);
    pollNotifications();
    notifyTimer = setInterval(pollNotifications, 25000);
  }

  function todayISO() {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Belgrade",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return f.format(new Date());
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const LOCAL_ADMIN = "http://127.0.0.1:3000/admin/";

  function isLocalHost() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function isWrongLocalAdmin() {
    if (location.protocol === "file:") return true;
    if (!isLocalHost()) return false;
    const port = location.port || (location.protocol === "https:" ? "443" : "80");
    return port !== "3000";
  }

  /* Live Server / file:// s’kanë API — dërgo te serveri lokal */
  if (isWrongLocalAdmin()) {
    location.replace(LOCAL_ADMIN + location.hash);
  }

  function isHostedStatic() {
    const h = location.hostname;
    return (
      /\.netlify\.app$/i.test(h) ||
      h === "ibrahimtahiri.netlify.app" ||
      location.protocol === "file:"
    );
  }

  function apiMissingMessage(status) {
    if (isHostedStatic()) {
      return `API ende nuk u ngarkua në Netlify (${status || "?"}). Prit 30s dhe rifresko, ose kontrollo deploy-in.`;
    }
    return `API nuk u gjet (${status || "?"}). Hap HAP-SERVER.bat dhe shko te ${LOCAL_ADMIN}`;
  }

  async function api(url, opts = {}) {
    const method = opts.method || "GET";
    const headers = { ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers,
        body,
      });
    } catch {
      throw new Error(
        isHostedStatic()
          ? "API nuk lidhet në Netlify. Prit deploy-in ose rifresko pas 30s."
          : `Serveri nuk është aktiv. Hap HAP-SERVER.bat pastaj ${LOCAL_ADMIN}`
      );
    }
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      // 404 HTML nga Netlify = Function nuk është deploy-uar
      throw new Error(apiMissingMessage(res.status));
    }
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(
          data.error ||
            apiMissingMessage(404) ||
            "API 404 — bëj deploy të ri në Netlify."
        );
      }
      throw new Error(
        data.error || data.hint || `Gabim në server (${res.status})`
      );
    }
    return data;
  }

  async function checkApi() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch("/api/health", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return { ok: false, error: apiMissingMessage(res.status) };
      }
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || "API / databaza nuk është gati.",
        };
      }
      return { ok: true, data };
    } catch (err) {
      if (err && err.name === "AbortError") {
        return {
          ok: false,
          error: `API nuk u përgjigj (timeout). Hap HAP-SERVER.bat → ${LOCAL_ADMIN}`,
        };
      }
      return {
        ok: false,
        error: `Nuk lidhet me API. Hap HAP-SERVER.bat → ${LOCAL_ADMIN}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function showApiDown(message) {
    $("#loginView").hidden = false;
    $("#appView").hidden = true;
    $("#apiDownCard").hidden = false;
    $("#loginForm").hidden = true;
    const err = $("#apiDownError");
    if (message) {
      err.hidden = false;
      err.textContent = message;
    } else {
      err.hidden = true;
    }
  }

  function showLoginForm() {
    $("#loginView").hidden = false;
    $("#appView").hidden = true;
    $("#apiDownCard").hidden = true;
    $("#loginForm").hidden = false;
    const ready = $("#apiReady");
    if (ready) {
      ready.hidden = false;
      ready.textContent = "API aktiv · mund të kyçesh";
    }
  }

  function showLogin(on) {
    $("#loginView").hidden = !on;
    $("#appView").hidden = on;
    document.body.classList.toggle("is-app", !on);
    if (on) {
      $("#apiDownCard").hidden = true;
      $("#loginForm").hidden = false;
    }
  }

  function playDashIntro() {
    return new Promise((resolve) => {
      const root = $("#dashIntro");
      if (!root) {
        resolve();
        return;
      }
      const slides = $$("[data-intro-slide]", root);
      const skipBtn = $("#dashIntroSkip");
      let step = 0;
      let done = false;
      let t1 = 0;
      let t2 = 0;
      const show = (i) => {
        step = i;
        slides.forEach((s, idx) => s.classList.toggle("is-active", idx === i));
      };
      const onClick = (e) => {
        if (e.target.closest("#dashIntroSkip")) return;
        if (step < slides.length - 1) show(step + 1);
        else finish();
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t1);
        clearTimeout(t2);
        root.removeEventListener("click", onClick);
        skipBtn?.removeEventListener("click", finish);
        root.classList.add("is-leaving");
        setTimeout(() => {
          root.hidden = true;
          root.classList.remove("is-leaving");
          slides.forEach((s, i) => s.classList.toggle("is-active", i === 0));
          resolve();
        }, 520);
      };
      const nameEl = $("#introWelcomeName");
      if (nameEl) {
        nameEl.textContent = String(admin?.name || "Ibrahim").split(/\s+/)[0] || "Ibrahim";
      }
      root.hidden = false;
      root.classList.remove("is-leaving");
      show(0);
      /* restart welcome animations */
      const welcome = root.querySelector(".dash-intro__welcome");
      if (welcome) {
        welcome.classList.remove("is-playing");
        void welcome.offsetWidth;
        welcome.classList.add("is-playing");
      }
      skipBtn?.addEventListener("click", finish);
      root.addEventListener("click", onClick);
      t1 = setTimeout(() => {
        if (!done) finish();
      }, 3400);
    });
  }

  async function enterApp(user) {
    admin = user;
    const fullName = admin.name || "Admin";
    $("#adminName").textContent = fullName;
    const av = $("#adminAvatar");
    if (av) av.textContent = String(fullName).trim().charAt(0).toUpperCase() || "A";
    showLogin(false);
    startNotifyLoop();
    const hashView = (location.hash || "").replace(/^#/, "");
    const initial =
      hashView && titles[hashView] ? hashView : "dashboard";
    try {
      if (initial === "dashboard") {
        await playDashIntro();
      }
      await setView(initial);
      refreshBadge();
      if (localStorage.getItem("gjeodeti-push-on") === "1") {
        enablePhoneNotifications().catch(() => {});
      }
    } catch (dashErr) {
      const main = $("#main");
      if (main) {
        main.innerHTML = `<p class="empty">${esc(
          dashErr.message || "Dashboard nuk u ngarkua."
        )}</p>`;
      }
    }
  }

  function openModal(html) {
    $("#modalCard").innerHTML = html;
    $("#modal").hidden = false;
  }
  function closeModal() {
    $("#modal").hidden = true;
    $("#modalCard").innerHTML = "";
  }

  function chipPriority(p) {
    return `<span class="chip chip--${esc(p)}">${esc(PRIORITY[p] || p)}</span>`;
  }
  function chipStatus(s) {
    return `<span class="chip chip--${esc(s)}">${esc(TSTATUS[s] || s)}</span>`;
  }

  async function setView(name) {
    if (titles[name]) {
      try {
        history.replaceState(null, "", `#${name}`);
      } catch {
        /* ignore */
      }
    }
    view = name;
    document.body.classList.toggle("view-dashboard", name === "dashboard");
    $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
    $("#pageTitle").textContent = titles[name] || name;
    $("#sidebar").classList.remove("is-open");
    await render();
  }

  async function render() {
    const main = $("#main");
    main.innerHTML = `<p class="empty">Duke ngarkuar…</p>`;
    try {
      if (view === "dashboard") await renderDashboard(main);
      else if (view === "planner") await renderPlanner(main);
      else if (view === "week") await renderWeek(main);
      else if (view === "calendar") await renderCalendar(main);
      else if (view === "messages") await renderMessages(main);
      else if (view === "clients") await renderClients(main);
      else if (view === "services") await renderServices(main);
      else if (view === "projects") await renderProjects(main);
      else if (view === "quotes") await renderQuotes(main);
      else if (view === "content") await renderContent(main);
      else if (view === "gallery") await renderGallery(main);
      else if (view === "settings") await renderSettings(main);
    } catch (err) {
      main.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  }

  async function refreshBadge() {
    try {
      const data = await api("/api/dashboard");
      const n = data.stats.messagesUnread;
      const q = data.stats.quotesNew;
      const cn = data.stats.clientsNew || 0;
      const b = $("#badgeMsg");
      const bq = $("#badgeQuote");
      const bc = $("#badgeClients");
      if (n > 0) {
        b.hidden = false;
        b.textContent = String(n);
      } else b.hidden = true;
      if (bq) {
        if (q > 0) {
          bq.hidden = false;
          bq.textContent = String(q);
        } else bq.hidden = true;
      }
      if (bc) {
        if (cn > 0) {
          bc.hidden = false;
          bc.textContent = String(cn);
        } else bc.hidden = true;
      }
      const notes = data.notifications || [];
      const wrap = $("#notifyWrap");
      const badgeN = $("#badgeNotify");
      const panel = $("#notifyPanel");
      if (wrap && badgeN && panel) {
        if (notes.length) {
          wrap.hidden = false;
          badgeN.hidden = false;
          badgeN.textContent = String(notes.length);
          panel.innerHTML = notes
            .map((x) => {
              const link = x.link
                ? ` data-link="${esc(x.link)}"`
                : x.type === "message"
                  ? ` data-view="messages"`
                  : x.type === "client"
                    ? ` data-view="clients"`
                  : x.type === "quote"
                    ? ` data-view="quotes"`
                    : x.type === "task" || x.type === "urgent" || x.type === "overdue"
                      ? ` data-view="week"`
                      : "";
              return `<button type="button" class="notify__item"${link}>${esc(x.text)}</button>`;
            })
            .join("");
          panel.querySelectorAll(".notify__item").forEach((el) => {
            el.onclick = () => {
              panel.hidden = true;
              if (el.dataset.link) {
                const hash = String(el.dataset.link).split("#")[1];
                if (hash && titles[hash]) setView(hash);
                else if (hash === "messages") setView("messages");
              } else if (el.dataset.view) setView(el.dataset.view);
            };
          });
        } else {
          wrap.hidden = true;
          panel.hidden = true;
        }
      }
      const td = $("#topbarDate");
      if (td && data.now) {
        td.textContent = `${data.now.date} · ${data.now.time}`;
      }
    } catch {
      /* ignore */
    }
  }

  function formatSqDateLabel(isoDate) {
    const [y, m, d] = String(isoDate || "").split("-").map(Number);
    if (!y || !m || !d) return isoDate || "";
    return `Sot, ${d} ${MONTHS_SQ[m - 1]} ${y}`;
  }

  function weekActivitySvg(week) {
    const dayNames = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"];
    const days = week.days?.length ? week.days : Array.from({ length: 7 }, (_, i) => String(i));
    const counts = days.map(
      (day) => (week.tasks || []).filter((t) => t.task_date === day).length
    );
    const max = Math.max(1, ...counts, 1);
    const w = 560;
    const h = 180;
    const padX = 28;
    const padY = 24;
    const pts = counts.map((c, i) => {
      const x = padX + (i * (w - padX * 2)) / Math.max(1, counts.length - 1);
      const y = h - padY - (c / max) * (h - padY * 2);
      return { x, y, c, label: dayNames[i] || "" };
    });
    if (!pts.length) return `<p class="empty">Nuk ka të dhëna.</p>`;
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x},${h - padY} L${padX},${h - padY} Z`;
    return `<svg class="dash-linechart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Veprimtaria javore">
      <defs>
        <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2f6fed" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#2f6fed" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#dashArea)"/>
      <path d="${line}" fill="none" stroke="#2f6fed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts
        .map(
          (p) =>
            `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#fff" stroke="#2f6fed" stroke-width="2.5"/>
             <text x="${p.x}" y="${h - 6}" text-anchor="middle" class="dash-linechart__label">${p.label}</text>`
        )
        .join("")}
    </svg>`;
  }

  /* -------- Dashboard -------- */
  async function renderDashboard(main) {
    const d = await api("/api/dashboard");
    $("#pageTitle").textContent = "Dashboard";
    $("#pageSub").textContent = "";
    document.body.classList.add("view-dashboard");
    const s = d.stats;
    const firstName = String(admin?.name || "Admin").split(/\s+/)[0];
    const week = await api(`/api/tasks/week?start=${encodeURIComponent(mondayOf(todayISO()))}`);
    const dayNames = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"];
    const byDay = {};
    (week.days || []).forEach((day) => {
      byDay[day] = [];
    });
    (week.tasks || []).forEach((t) => {
      if (!byDay[t.task_date]) byDay[t.task_date] = [];
      byDay[t.task_date].push(t);
    });
    const msgs = d.recentMessages || [];
    main.innerHTML = `
      <section class="dash-banner">
        <div class="dash-banner__text">
          <h3>Mirë se vini, ${esc(firstName)}!</h3>
          <p>Këtu mund të menaxhosh gjithë përmbajtjen e faqes suaj.</p>
        </div>
        <div class="dash-banner__date">${esc(formatSqDateLabel(d.now?.date || todayISO()))}</div>
      </section>

      <div class="dash-kpis">
        <button type="button" class="dash-kpi" data-go="messages">
          <span class="dash-kpi__icon dash-kpi__icon--blue">✉</span>
          <span class="dash-kpi__body"><strong>${s.messagesUnread || 0}</strong><em>Mesazhe të reja</em></span>
          <span class="dash-kpi__arrow">›</span>
        </button>
        <button type="button" class="dash-kpi" data-go="projects">
          <span class="dash-kpi__icon dash-kpi__icon--green">📁</span>
          <span class="dash-kpi__body"><strong>${s.projectsTotal || s.projectsActive || 0}</strong><em>Projekte gjithsej</em></span>
          <span class="dash-kpi__arrow">›</span>
        </button>
        <button type="button" class="dash-kpi" data-go="gallery">
          <span class="dash-kpi__icon dash-kpi__icon--purple">🖼</span>
          <span class="dash-kpi__body"><strong>${s.galleryCount || 0}</strong><em>Foto në galeri</em></span>
          <span class="dash-kpi__arrow">›</span>
        </button>
        <button type="button" class="dash-kpi" data-go="clients">
          <span class="dash-kpi__icon dash-kpi__icon--teal">👤</span>
          <span class="dash-kpi__body"><strong>${s.clientsTotal || 0}</strong><em>Klientë</em></span>
          <span class="dash-kpi__arrow">›</span>
        </button>
      </div>

      <div class="dash-split">
        <section class="dash-card">
          <div class="panel__head">
            <h3>Veprimtaria e fundit</h3>
            <span class="dash-chip">7 ditët e fundit</span>
          </div>
          ${weekActivitySvg(week)}
        </section>
        <section class="dash-card">
          <div class="panel__head">
            <h3>Mesazhet e fundit</h3>
            <button type="button" class="btn-link" data-go="messages">Shiko të gjitha</button>
          </div>
          <div class="dash-msgs">
            ${
              msgs.length
                ? msgs
                    .slice(0, 4)
                    .map((m) => {
                      const unread = !Number(m.is_read);
                      return `<article class="dash-msg">
                        <span class="dash-msg__avatar">${esc(String(m.name || "?").charAt(0).toUpperCase())}</span>
                        <div>
                          <strong>${esc(m.name)}</strong>
                          <p>${esc(String(m.message || "").slice(0, 90))}</p>
                        </div>
                        <span class="dash-msg__tag ${unread ? "is-new" : ""}">${unread ? "E re" : "Lexuar"}</span>
                      </article>`;
                    })
                    .join("")
                : `<p class="empty">Nuk ka mesazhe.</p>`
            }
          </div>
        </section>
      </div>

      <section class="dash-card">
        <div class="panel__head">
          <div>
            <h3>Plani javor</h3>
            <p class="cal-intro">${esc(week.start || "")} — ${esc(week.end || "")}</p>
          </div>
          <button type="button" class="btn btn--primary" data-go="week">Hap planin</button>
        </div>
        <div class="dash-week-mini">
          ${(week.days || [])
            .map((day, i) => {
              const list = byDay[day] || [];
              return `<article class="dash-week-day ${day === todayISO() ? "is-today" : ""}">
                <strong>${dayNames[i]}</strong>
                <span>${esc(String(day).slice(5))}</span>
                ${
                  list.length
                    ? `<ul>${list
                        .slice(0, 3)
                        .map(
                          (t) =>
                            `<li>${esc(t.start_time ? String(t.start_time).slice(0, 5) + " · " : "")}${esc(t.title)}</li>`
                        )
                        .join("")}${list.length > 3 ? `<li>+${list.length - 3}</li>` : ""}</ul>`
                    : `<p class="empty-mini">Pa detyra</p>`
                }
              </article>`;
            })
            .join("")}
        </div>
      </section>

      <div class="dash-actions">
        <button type="button" class="dash-action dash-action--blue" data-go="projects"><span>＋</span> Shto Projekt</button>
        <button type="button" class="dash-action dash-action--green" data-go="gallery"><span>＋</span> Shto Foto</button>
        <button type="button" class="dash-action dash-action--purple" data-go="messages"><span>✉</span> Shiko Mesazhet</button>
        <button type="button" class="dash-action dash-action--teal" data-go="settings"><span>⚙</span> Cilësimet</button>
      </div>`;
    $$("[data-go]", main).forEach((b) => b.addEventListener("click", () => setView(b.dataset.go)));
  }

  function listSimple(rows, fn) {
    if (!rows?.length) return `<p class="empty">Nuk ka të dhëna.</p>`;
    return `<div class="task-list">${rows.map((r) => `<article class="task-card">${fn(r)}</article>`).join("")}</div>`;
  }

  function taskListHtml(tasks) {
    if (!tasks?.length) return `<p class="empty">Nuk ka detyra.</p>`;
    const today = todayISO();
    return `<div class="task-list">${tasks
      .map((t) => {
        const overdue = t.status !== "done" && t.task_date < today;
        const urgent = t.priority === "urgent" && t.status !== "done";
        return `<article class="task-card ${urgent ? "is-urgent" : ""} ${overdue ? "is-overdue" : ""}">
          <div class="task-card__top">
            <strong>${esc(t.title)}</strong>
            <div>${chipPriority(t.priority)} ${chipStatus(t.status)}</div>
          </div>
          <div class="task-card__meta">${esc(t.task_date)} ${esc(t.start_time || "")}${t.end_time ? "–" + esc(t.end_time) : ""} · ${esc(t.location || "—")} · ${esc(t.client_name || "")}</div>
        </article>`;
      })
      .join("")}</div>`;
  }

  function monthMeta(dateObj) {
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    return {
      y,
      m,
      label: `${MONTHS_SQ[m]} ${y}`,
      from: `${y}-${String(m + 1).padStart(2, "0")}-01`,
      to: `${y}-${String(m + 1).padStart(2, "0")}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}`,
      startPad: (new Date(y, m, 1).getDay() + 6) % 7,
      daysInMonth: new Date(y, m + 1, 0).getDate(),
    };
  }

  function buildCalCells(monthTasks, selectedDate) {
    const { y, m, startPad, daysInMonth } = monthMeta(calMonth);
    const byDay = {};
    monthTasks.forEach((t) => {
      if (!byDay[t.task_date]) byDay[t.task_date] = [];
      byDay[t.task_date].push(t);
    });
    const today = todayISO();
    const cells = [];
    const prevDays = new Date(y, m, 0).getDate();
    for (let i = 0; i < startPad; i++) {
      const d = prevDays - startPad + i + 1;
      cells.push(`<div class="cal-cell is-outside"><div class="cal-cell__n">${d}</div></div>`);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const list = byDay[iso] || [];
      const dots = list
        .slice(0, 4)
        .map((t) => {
          if (t.status === "done") return `<span class="cal-dot cal-dot--done"></span>`;
          if (t.priority === "urgent") return `<span class="cal-dot cal-dot--urgent"></span>`;
          if (t.priority === "high") return `<span class="cal-dot cal-dot--high"></span>`;
          return `<span class="cal-dot"></span>`;
        })
        .join("");
      const cls = [
        "cal-cell",
        list.length ? "has-tasks" : "",
        iso === today ? "is-today" : "",
        iso === selectedDate ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        `<button type="button" class="${cls}" data-day="${iso}"><div class="cal-cell__n">${d}</div><div class="cal-cell__dots">${dots}</div></button>`
      );
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length % 7;
      cells.push(`<div class="cal-cell is-outside"><div class="cal-cell__n">${d + 1}</div></div>`);
    }
    return cells.join("");
  }

  /* -------- Weekly plan -------- */
  async function renderWeek(main) {
    $("#pageSub").textContent = "Plani i javës për pronarin";
    const data = await api(`/api/tasks/week?start=${encodeURIComponent(weekStart)}`);
    weekStart = data.start;
    const byDay = {};
    data.days.forEach((d) => {
      byDay[d] = [];
    });
    data.tasks.forEach((t) => {
      if (!byDay[t.task_date]) byDay[t.task_date] = [];
      byDay[t.task_date].push(t);
    });
    const dayNames = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"];
    main.innerHTML = `
      <section class="panel">
        <div class="panel__head">
          <div>
            <h3>Plani javor</h3>
            <p class="cal-intro">${esc(data.start)} — ${esc(data.end)}. Kur vjen ora e detyrës, merr njoftim në telefon.</p>
          </div>
          <div class="calendar-bar">
            <button class="btn btn--ghost" id="weekPrev">←</button>
            <button class="btn btn--ghost" id="weekToday">Kjo javë</button>
            <button class="btn btn--ghost" id="weekNext">→</button>
            <button class="btn btn--primary" id="addTaskWeek">+ Detyrë</button>
          </div>
        </div>
        <div class="week-grid">
          ${data.days
            .map((d, i) => {
              const list = byDay[d] || [];
              return `<article class="week-day ${d === todayISO() ? "is-today" : ""}">
                <header><strong>${dayNames[i]}</strong><span>${esc(d.slice(5))}</span>
                  <button type="button" class="btn btn--ghost" data-add-day="${esc(d)}">+</button>
                </header>
                <div class="week-day__list">
                  ${
                    list.length
                      ? list
                          .map(
                            (t) => `<button type="button" class="week-task" data-edit-task="${t.id}">
                      <span class="week-task__time">${esc(t.start_time || "—")}</span>
                      <span class="week-task__title">${esc(t.title)}</span>
                      <span class="week-task__meta">${esc(PRIORITY[t.priority] || t.priority)} · ${esc(TSTATUS[t.status] || t.status)}</span>
                    </button>`
                          )
                          .join("")
                      : `<p class="week-empty">Pa detyra</p>`
                  }
                </div>
              </article>`;
            })
            .join("")}
        </div>
      </section>`;
    $("#weekPrev").onclick = () => {
      const d = new Date(`${weekStart}T12:00:00`);
      d.setDate(d.getDate() - 7);
      weekStart = d.toISOString().slice(0, 10);
      render();
    };
    $("#weekNext").onclick = () => {
      const d = new Date(`${weekStart}T12:00:00`);
      d.setDate(d.getDate() + 7);
      weekStart = d.toISOString().slice(0, 10);
      render();
    };
    $("#weekToday").onclick = () => {
      weekStart = mondayOf(todayISO());
      render();
    };
    $("#addTaskWeek").onclick = () => {
      plannerDate = todayISO();
      openTaskModal();
    };
    $$("[data-add-day]").forEach((b) => {
      b.onclick = () => {
        plannerDate = b.dataset.addDay;
        openTaskModal();
      };
    });
    const flat = data.tasks;
    $$("[data-edit-task]").forEach((b) => {
      b.onclick = () => {
        const t = flat.find((x) => String(x.id) === b.dataset.editTask);
        if (t) openTaskModal(t);
      };
    });
  }

  /* -------- Planner (list focus) -------- */
  async function renderPlanner(main) {
    $("#pageSub").textContent = plannerDate;
    const summary = await api(`/api/tasks/summary?date=${encodeURIComponent(plannerDate)}`);
    const nextUp = summary.tasks.find((t) => t.status !== "done");
    main.innerHTML = `
      <div class="stats">
        <article class="stat"><p class="stat__label">Detyra</p><p class="stat__value">${summary.total}</p></article>
        <article class="stat stat--ok"><p class="stat__label">Përfunduara</p><p class="stat__value">${summary.done}</p></article>
        <article class="stat"><p class="stat__label">Të mbetura</p><p class="stat__value">${summary.total - summary.done}</p></article>
        <article class="stat"><p class="stat__label">Në proces</p><p class="stat__value">${summary.inProgress}</p></article>
        <article class="stat stat--danger"><p class="stat__label">Urgjente</p><p class="stat__value">${summary.urgent}</p></article>
        <article class="stat stat--warn"><p class="stat__label">Të vonuara</p><p class="stat__value">${summary.overdue}</p></article>
      </div>
      <section class="panel">
        <div class="panel__head">
          <div>
            <h3>Detyrat për ${esc(plannerDate)}</h3>
            <p class="cal-intro">${nextUp ? `E ardhshmja: ${esc(nextUp.start_time || "")} ${esc(nextUp.title)}` : "Nuk ka detyrë të ardhshme për sot."}</p>
          </div>
          <div class="calendar-bar">
            <input type="date" id="plannerDatePick" value="${esc(plannerDate)}" />
            <button class="btn btn--ghost" id="plannerToday">Sot</button>
            <button class="btn btn--ghost" data-go="calendar">Kalendari</button>
            <button class="btn btn--primary" id="addTask">+ Detyrë</button>
          </div>
        </div>
        <div class="toolbar">
          <input id="taskSearch" placeholder="Kërko titull / klient" />
          <select id="taskFilterStatus">
            <option value="">Të gjitha statuset</option>
            ${Object.entries(TSTATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
          <select id="taskFilterPriority">
            <option value="">Të gjitha prioritetet</option>
            ${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}
          </select>
        </div>
        <div id="dayTasks">${dayTasksHtml(summary.tasks)}</div>
      </section>`;
    $("#addTask").onclick = () => openTaskModal();
    $("#plannerToday").onclick = () => {
      plannerDate = todayISO();
      render();
    };
    $("#plannerDatePick").onchange = (e) => {
      plannerDate = e.target.value || todayISO();
      render();
    };
    main.querySelector("[data-go]")?.addEventListener("click", () => setView("calendar"));
    bindTaskActions(main, summary.tasks);
    const applyFilter = () => {
      const q = $("#taskSearch").value.toLowerCase();
      const st = $("#taskFilterStatus").value;
      const pr = $("#taskFilterPriority").value;
      const filtered = summary.tasks.filter((t) => {
        const okQ =
          !q ||
          (t.title || "").toLowerCase().includes(q) ||
          (t.client_name || "").toLowerCase().includes(q);
        return okQ && (!st || t.status === st) && (!pr || t.priority === pr);
      });
      $("#dayTasks").innerHTML = dayTasksHtml(filtered);
      bindTaskActions(main, filtered);
    };
    $("#taskSearch").oninput = $("#taskFilterStatus").onchange = $("#taskFilterPriority").onchange = applyFilter;
  }

  /* -------- Calendar (month grid) -------- */
  async function renderCalendar(main) {
    $("#pageSub").textContent = "Sipas datës";
    const meta = monthMeta(calMonth);
    const monthTasks = await api(`/api/tasks?from=${meta.from}&to=${meta.to}`);
    const summary = await api(`/api/tasks/summary?date=${encodeURIComponent(plannerDate)}`);
    main.innerHTML = `
      <section class="panel">
        <div class="panel__head">
          <div>
            <h3>Kalendari</h3>
            <p class="cal-intro">Punët sipas datës</p>
          </div>
          <div class="calendar-bar">
            <button class="btn btn--ghost" id="calPrev" aria-label="Muaji i kaluar">←</button>
            <span class="cal-month-label">${esc(meta.label)}</span>
            <button class="btn btn--ghost" id="calNext" aria-label="Muaji i ardhshëm">→</button>
            <button class="btn btn--ghost" id="calToday">Sot</button>
            <button class="btn btn--primary" id="addTask">+ Detyrë</button>
          </div>
        </div>
        <div class="cal-head"><span>Hën</span><span>Mar</span><span>Mër</span><span>Enj</span><span>Pre</span><span>Sht</span><span>Die</span></div>
        <div class="cal-grid">${buildCalCells(monthTasks, plannerDate)}</div>
        <div class="cal-legend">
          <span><i class="cal-dot"></i> Me detyra</span>
          <span><i class="cal-dot cal-dot--done"></i> Përfunduar</span>
          <span><i class="cal-dot cal-dot--high"></i> Prioritet i lartë</span>
          <span><i class="cal-dot cal-dot--urgent"></i> Urgjent</span>
          <span>Sot = kufi blu · Zgjedhur = sfond blu</span>
        </div>
      </section>
      <section class="panel">
        <div class="panel__head">
          <h3>Detyrat për ${esc(plannerDate)}</h3>
          <button class="btn btn--primary" id="addTaskDay">+ Detyrë</button>
        </div>
        <div id="dayTasks">${
          summary.tasks.length
            ? dayTasksHtml(summary.tasks)
            : `<p class="empty">Nuk ka detyra për këtë ditë</p>`
        }</div>
      </section>`;
    $("#calPrev").onclick = () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
      render();
    };
    $("#calNext").onclick = () => {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
      render();
    };
    $("#calToday").onclick = () => {
      plannerDate = todayISO();
      calMonth = new Date();
      render();
    };
    $$("[data-day]", main).forEach((btn) => {
      btn.onclick = () => {
        plannerDate = btn.dataset.day;
        render();
      };
    });
    $("#addTask").onclick = $("#addTaskDay").onclick = () => openTaskModal();
    bindTaskActions(main, summary.tasks);
  }

  function dayTasksHtml(tasks) {
    if (!tasks.length) return `<p class="empty">Nuk ka detyra për këtë ditë.</p>`;
    const today = todayISO();
    return `<div class="task-list">${tasks
      .map((t) => {
        const overdue = t.status !== "done" && t.task_date < today;
        return `<article class="task-card ${t.priority === "urgent" && t.status !== "done" ? "is-urgent" : ""} ${overdue ? "is-overdue" : ""}">
          <div class="task-card__top">
            <label style="display:flex;gap:.5rem;align-items:flex-start">
              <input type="checkbox" data-done="${t.id}" ${t.status === "done" ? "checked" : ""} />
              <span><strong>${esc(t.title)}</strong><div class="task-card__meta">${esc(t.start_time || "")}${t.end_time ? "–" + esc(t.end_time) : ""} · ${esc(t.location || "—")} · ${esc(t.client_name || "")}</div></span>
            </label>
            <div>${chipPriority(t.priority)} ${chipStatus(t.status)}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn--ghost" data-edit-task="${t.id}">Ndrysho</button>
            <button class="btn btn--danger" data-del-task="${t.id}">Fshi</button>
          </div>
        </article>`;
      })
      .join("")}</div>`;
  }

  function bindTaskActions(root, tasks) {
    $$("[data-done]", root).forEach((cb) => {
      cb.onchange = async () => {
        const id = cb.dataset.done;
        await api(`/api/tasks/${id}`, {
          method: "PUT",
          body: { status: cb.checked ? "done" : "todo" },
        });
        render();
      };
    });
    $$("[data-edit-task]", root).forEach((btn) => {
      btn.onclick = () => {
        const t = tasks.find((x) => String(x.id) === btn.dataset.editTask);
        if (t) openTaskModal(t);
      };
    });
    $$("[data-del-task]", root).forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("Të fshihet detyra?")) return;
        await api(`/api/tasks/${btn.dataset.delTask}`, { method: "DELETE" });
        render();
      };
    });
  }

  async function openTaskModal(task = null) {
    const clients = await api("/api/clients");
    const projects = await api("/api/projects");
    const t = task || {
      title: "",
      description: "",
      task_date: plannerDate,
      start_time: "",
      end_time: "",
      priority: "normal",
      status: "todo",
      location: "",
      client_name: "",
      client_phone: "",
      client_id: "",
      project_id: "",
      notes: "",
      is_recurring: 0,
      recur_rule: "",
    };
    const presets = [
      "Matje në terren",
      "Matje kadastrale",
      "Përcaktim i kufijve",
      "Takim me klient",
      "Vizita në lokacion",
      "Përgatitje dokumentacioni",
      "Përgatitje oferte",
      "Takim në institucione",
      "Dorëzim projekti",
      "Kontroll / përpunim matjesh",
    ];
    openModal(`
      <h3>${task ? "Ndrysho detyrën" : "Detyrë e re"}</h3>
      <form class="form-grid form-grid--2" id="taskForm">
        <label class="full"><span>Lloji i shpejtë (gjeodezi)</span>
          <select id="taskPreset"><option value="">— Zgjidh —</option>${presets.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}</select>
        </label>
        <label class="full"><span>Titulli</span><input name="title" id="taskTitle" required value="${esc(t.title)}" /></label>
        <label class="full"><span>Përshkrimi</span><textarea name="description" rows="3">${esc(t.description || "")}</textarea></label>
        <label><span>Data</span><input type="date" name="task_date" required value="${esc(t.task_date)}" /></label>
        <label><span>Prioriteti</span><select name="priority">${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${t.priority === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label><span>Ora fillimit</span><input type="time" name="start_time" value="${esc(t.start_time || "")}" /></label>
        <label><span>Ora e përfundimit</span><input type="time" name="end_time" value="${esc(t.end_time || "")}" /></label>
        <label><span>Statusi</span><select name="status">${Object.entries(TSTATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label><span>Lokacioni</span><input name="location" value="${esc(t.location || "")}" /></label>
        <label><span>Emri i klientit</span><input name="client_name" value="${esc(t.client_name || "")}" /></label>
        <label><span>Telefoni i klientit</span><input name="client_phone" value="${esc(t.client_phone || "")}" /></label>
        <label><span>Klienti ekzistues</span><select name="client_id"><option value="">—</option>${clients.map((c) => `<option value="${c.id}" ${String(t.client_id) === String(c.id) ? "selected" : ""}>${esc(c.full_name)}</option>`).join("")}</select></label>
        <label><span>Projekti</span><select name="project_id"><option value="">—</option>${projects.map((p) => `<option value="${p.id}" ${String(t.project_id) === String(p.id) ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label>
        <label class="full"><span>Shënime private</span><textarea name="notes" rows="2">${esc(t.notes || "")}</textarea></label>
        <label><span>E përsëritshme</span><select name="is_recurring"><option value="0" ${!t.is_recurring ? "selected" : ""}>Jo</option><option value="1" ${t.is_recurring ? "selected" : ""}>Po</option></select></label>
        <label><span>Rregulli (p.sh. weekly)</span><input name="recur_rule" value="${esc(t.recur_rule || "")}" /></label>
        <div class="full row-actions">
          <button type="submit" class="btn btn--primary">Ruaj</button>
          <button type="button" class="btn btn--ghost" data-close>Anulo</button>
        </div>
      </form>`);
    $("#taskPreset")?.addEventListener("change", (e) => {
      if (e.target.value) $("#taskTitle").value = e.target.value;
    });
    $("#taskForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      delete body.taskPreset;
      body.client_id = body.client_id ? Number(body.client_id) : null;
      body.project_id = body.project_id ? Number(body.project_id) : null;
      body.is_recurring = body.is_recurring === "1";
      if (task) await api(`/api/tasks/${task.id}`, { method: "PUT", body });
      else await api("/api/tasks", { method: "POST", body });
      closeModal();
      render();
    };
  }

  /* -------- Messages -------- */
  async function renderMessages(main) {
    $("#pageSub").textContent = "Mesazhet nga forma e kontaktit";
    const rows = await api("/api/messages");
    main.innerHTML = `
      <div class="toolbar">
        <input id="msgQ" placeholder="Kërko emër / email" />
        <select id="msgStatus"><option value="">Të gjitha</option><option value="unread">Të palexuara</option><option value="read">Të lexuara</option></select>
      </div>
      <div class="panel table-wrap">
        <table>
          <thead><tr><th>Klienti</th><th>Kontakt</th><th>Mesazhi</th><th>Data</th><th></th></tr></thead>
          <tbody id="msgBody"></tbody>
        </table>
      </div>`;
    const paint = async () => {
      const q = $("#msgQ").value;
      const status = $("#msgStatus").value;
      const list = await api(
        `/api/messages?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`
      );
      $("#msgBody").innerHTML = list.length
        ? list
            .map(
              (m) => `<tr style="${m.is_read ? "" : "background:rgba(47,111,237,.08)"}">
            <td><strong>${esc(m.name)}</strong><div class="task-card__meta">${esc(m.service_interest || "")}</div></td>
            <td>${esc(m.email || "")}<br>${esc(m.phone || "")}</td>
            <td>${esc(m.message).slice(0, 160)}</td>
            <td>${esc(m.created_at)}</td>
            <td class="row-actions">
              <button class="btn btn--ghost" data-toggle-read="${m.id}" data-read="${m.is_read}">${m.is_read ? "Palexuar" : "Lexuar"}</button>
              ${m.email ? `<a class="btn btn--ghost" href="mailto:${esc(m.email)}">Përgjigju</a>` : ""}
              <button class="btn btn--danger" data-del-msg="${m.id}">Fshi</button>
            </td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="5"><p class="empty">Nuk ka mesazhe.</p></td></tr>`;
      $$("[data-toggle-read]").forEach((b) => {
        b.onclick = async () => {
          await api(`/api/messages/${b.dataset.toggleRead}`, {
            method: "PATCH",
            body: { is_read: b.dataset.read === "1" ? 0 : 1 },
          });
          paint();
          refreshBadge();
        };
      });
      $$("[data-del-msg]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Të fshihet mesazhi?")) return;
          await api(`/api/messages/${b.dataset.delMsg}`, { method: "DELETE" });
          paint();
          refreshBadge();
        };
      });
    };
    $("#msgQ").oninput = $("#msgStatus").onchange = paint;
    await paint();
  }

  /* -------- Clients -------- */
  async function renderClients(main) {
    $("#pageSub").textContent = "Menaxhimi i klientëve";
    const rows = await api("/api/clients");
    const newCount = rows.filter((c) => Number(c.is_new)).length;
    main.innerHTML = `
      <div class="panel__head" style="margin-bottom:1rem">
        <div class="toolbar" style="margin:0;flex:1"><input id="clientQ" placeholder="Kërko klient" /></div>
        ${newCount ? `<button class="btn btn--ghost" id="markClientsSeen">Shëno si të lexuar (${newCount})</button>` : ""}
        <button class="btn btn--primary" id="addClient">+ Shto klient</button>
      </div>
      <div class="panel table-wrap"><table>
        <thead><tr><th>Emri</th><th>Telefon</th><th>Email</th><th></th></tr></thead>
        <tbody>${
          rows.length
            ? rows
                .map(
                  (c) => `<tr class="${Number(c.is_new) ? "is-new-client" : ""}">
              <td><strong>${esc(c.full_name)}</strong>${Number(c.is_new) ? ` <span class="chip chip--urgent">I ri</span>` : ""}</td>
              <td>${esc(c.phone || "")}</td>
              <td>${esc(c.email || "")}</td>
              <td class="row-actions">
                <button class="btn btn--ghost" data-view-client="${c.id}">Detaje</button>
                <button class="btn btn--ghost" data-edit-client='${esc(JSON.stringify(c))}'>Ndrysho</button>
                <button class="btn btn--danger" data-del-client="${c.id}">Fshi</button>
              </td>
            </tr>`
                )
                .join("")
            : `<tr><td colspan="4"><p class="empty">Nuk ka klientë.</p></td></tr>`
        }
      </tbody></table></div>`;
    $("#addClient").onclick = () => openClientModal();
    $("#markClientsSeen")?.addEventListener("click", async () => {
      await api("/api/clients/mark-seen", { method: "POST", body: {} });
      refreshBadge();
      render();
    });
    $$("[data-edit-client]").forEach((b) => {
      b.onclick = () => openClientModal(JSON.parse(b.dataset.editClient));
    });
    $$("[data-del-client]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Të fshihet klienti?")) return;
        await api(`/api/clients/${b.dataset.delClient}`, { method: "DELETE" });
        render();
      };
    });
    $$("[data-view-client]").forEach((b) => {
      b.onclick = async () => {
        const data = await api(`/api/clients/${b.dataset.viewClient}`);
        refreshBadge();
        openModal(`
          <h3>${esc(data.client.full_name)}</h3>
          <p class="task-card__meta">${esc(data.client.phone || "")} · ${esc(data.client.email || "")}</p>
          <p>${esc(data.client.notes || "")}</p>
          <h4>Projekte (${data.projects.length})</h4>
          ${listSimple(data.projects, (p) => esc(p.title))}
          <h4>Oferta (${data.quotes.length})</h4>
          ${listSimple(data.quotes, (q) => esc(q.service_type || q.description || "Ofertë"))}
          <h4>Detyra (${data.tasks.length})</h4>
          ${listSimple(data.tasks, (t) => `${esc(t.task_date)} — ${esc(t.title)}`)}
          <button class="btn btn--ghost" data-close>Mbyll</button>`);
      };
    });
    $("#clientQ").oninput = () => {
      const q = $("#clientQ").value.toLowerCase();
      $$("tbody tr", main).forEach((tr) => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    };
  }

  function openClientModal(c = null) {
    const x = c || { full_name: "", phone: "", email: "", address: "", notes: "" };
    openModal(`
      <h3>${c ? "Ndrysho klientin" : "Klient i ri"}</h3>
      <form class="form-grid" id="clientForm">
        <label><span>Emri i plotë</span><input name="full_name" required value="${esc(x.full_name)}" /></label>
        <label><span>Telefoni</span><input name="phone" value="${esc(x.phone || "")}" /></label>
        <label><span>Email</span><input type="email" name="email" value="${esc(x.email || "")}" /></label>
        <label><span>Adresa</span><input name="address" value="${esc(x.address || "")}" /></label>
        <label><span>Shënime</span><textarea name="notes" rows="3">${esc(x.notes || "")}</textarea></label>
        <div class="row-actions"><button class="btn btn--primary">Ruaj</button><button type="button" class="btn btn--ghost" data-close>Anulo</button></div>
      </form>`);
    $("#clientForm").onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      if (c) await api(`/api/clients/${c.id}`, { method: "PUT", body });
      else await api("/api/clients", { method: "POST", body });
      closeModal();
      render();
    };
  }

  /* -------- Services -------- */
  async function renderServices(main) {
    $("#pageSub").textContent = "Shërbimet e website-it";
    const rows = await api("/api/services");
    main.innerHTML = `
      <div class="panel__head"><h3>Lista e shërbimeve</h3><button class="btn btn--primary" id="addSvc">+ Shto</button></div>
      <div class="panel table-wrap"><table>
        <thead><tr><th>Titulli</th><th>Kategoria</th><th>Renditja</th><th>Statusi</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (s) => `<tr>
            <td><strong>${esc(s.title)}</strong><div class="task-card__meta">${esc(s.description || "")}</div></td>
            <td>${esc(s.category || "")}</td>
            <td>${s.sort_order}</td>
            <td>${s.is_active ? "Aktiv" : "Joaktiv"}</td>
            <td class="row-actions">
              <button class="btn btn--ghost" data-edit-svc='${esc(JSON.stringify(s))}'>Ndrysho</button>
              <button class="btn btn--danger" data-del-svc="${s.id}">Fshi</button>
            </td>
          </tr>`
          )
          .join("")}</tbody></table></div>`;
    $("#addSvc").onclick = () => openServiceModal();
    $$("[data-edit-svc]").forEach((b) => (b.onclick = () => openServiceModal(JSON.parse(b.dataset.editSvc))));
    $$("[data-del-svc]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Të fshihet shërbimi?")) return;
        await api(`/api/services/${b.dataset.delSvc}`, { method: "DELETE" });
        render();
      };
    });
  }

  function openServiceModal(s = null) {
    const x = s || { title: "", description: "", category: "", icon: "", sort_order: 0, is_active: 1 };
    openModal(`
      <h3>${s ? "Ndrysho shërbimin" : "Shërbim i ri"}</h3>
      <form class="form-grid form-grid--2" id="svcForm">
        <label class="full"><span>Titulli</span><input name="title" required value="${esc(x.title)}" /></label>
        <label class="full"><span>Përshkrimi</span><textarea name="description" rows="3">${esc(x.description || "")}</textarea></label>
        <label><span>Kategoria</span><input name="category" value="${esc(x.category || "")}" /></label>
        <label><span>Ikona</span><input name="icon" value="${esc(x.icon || "")}" /></label>
        <label><span>Renditja</span><input type="number" name="sort_order" value="${esc(x.sort_order)}" /></label>
        <label><span>Statusi</span><select name="is_active"><option value="1" ${x.is_active ? "selected" : ""}>Aktiv</option><option value="0" ${!x.is_active ? "selected" : ""}>Joaktiv</option></select></label>
        <div class="full row-actions"><button class="btn btn--primary">Ruaj</button><button type="button" class="btn btn--ghost" data-close>Anulo</button></div>
      </form>`);
    $("#svcForm").onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      body.sort_order = Number(body.sort_order || 0);
      body.is_active = body.is_active === "1";
      if (s) await api(`/api/services/${s.id}`, { method: "PUT", body });
      else await api("/api/services", { method: "POST", body });
      closeModal();
      render();
    };
  }

  /* -------- Projects -------- */
  async function renderProjects(main) {
    $("#pageSub").textContent = "Projektet e kompanisë";
    const rows = await api("/api/projects");
    main.innerHTML = `
      <div class="panel__head">
        <div class="toolbar" style="margin:0;flex:1">
          <input id="projQ" placeholder="Kërko" />
          <select id="projStatus"><option value="">Të gjitha</option>${Object.entries(PSTATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        </div>
        <button class="btn btn--primary" id="addProj">+ Projekt</button>
      </div>
      <div class="panel table-wrap" id="projTable"></div>`;
    const paint = async () => {
      const q = $("#projQ").value;
      const status = $("#projStatus").value;
      const list = await api(
        `/api/projects?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`
      );
      $("#projTable").innerHTML = `<table><thead><tr><th>Titulli</th><th>Klienti</th><th>Statusi</th><th>Lokacioni</th><th></th></tr></thead><tbody>${
        list.length
          ? list
              .map(
                (p) => `<tr>
              <td><strong>${esc(p.title)}</strong></td>
              <td>${esc(p.client_name || "—")}</td>
              <td>${esc(PSTATUS[p.status] || p.status)}</td>
              <td>${esc(p.location || "")}</td>
              <td class="row-actions">
                <button class="btn btn--ghost" data-edit-proj='${esc(JSON.stringify(p))}'>Ndrysho</button>
                <button class="btn btn--danger" data-del-proj="${p.id}">Fshi</button>
              </td>
            </tr>`
              )
              .join("")
          : `<tr><td colspan="5"><p class="empty">Nuk ka projekte.</p></td></tr>`
      }</tbody></table>`;
      $$("[data-edit-proj]").forEach((b) => (b.onclick = () => openProjectModal(JSON.parse(b.dataset.editProj))));
      $$("[data-del-proj]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Të fshihet projekti?")) return;
          await api(`/api/projects/${b.dataset.delProj}`, { method: "DELETE" });
          paint();
        };
      });
    };
    $("#addProj").onclick = () => openProjectModal();
    $("#projQ").oninput = $("#projStatus").onchange = paint;
    await paint();
  }

  async function openProjectModal(p = null) {
    const clients = await api("/api/clients");
    const x = p || {
      title: "",
      description: "",
      client_id: "",
      location: "",
      start_date: "",
      due_date: "",
      status: "i_ri",
      notes: "",
      show_on_site: 0,
    };
    openModal(`
      <h3>${p ? "Ndrysho projektin" : "Projekt i ri"}</h3>
      <form class="form-grid form-grid--2" id="projForm">
        <label class="full"><span>Titulli</span><input name="title" required value="${esc(x.title)}" /></label>
        <label class="full"><span>Përshkrimi</span><textarea name="description" rows="3">${esc(x.description || "")}</textarea></label>
        <label><span>Klienti</span><select name="client_id"><option value="">—</option>${clients.map((c) => `<option value="${c.id}" ${String(x.client_id) === String(c.id) ? "selected" : ""}>${esc(c.full_name)}</option>`).join("")}</select></label>
        <label><span>Statusi</span><select name="status">${Object.entries(PSTATUS).map(([k, v]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label><span>Lokacioni</span><input name="location" value="${esc(x.location || "")}" /></label>
        <label><span>Në website</span><select name="show_on_site"><option value="0" ${!x.show_on_site ? "selected" : ""}>Jo</option><option value="1" ${x.show_on_site ? "selected" : ""}>Po</option></select></label>
        <label><span>Fillimi</span><input type="date" name="start_date" value="${esc(x.start_date || "")}" /></label>
        <label><span>Afati</span><input type="date" name="due_date" value="${esc(x.due_date || "")}" /></label>
        <label class="full"><span>Shënime</span><textarea name="notes" rows="2">${esc(x.notes || "")}</textarea></label>
        <div class="full row-actions"><button class="btn btn--primary">Ruaj</button><button type="button" class="btn btn--ghost" data-close>Anulo</button></div>
      </form>`);
    $("#projForm").onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      body.client_id = body.client_id ? Number(body.client_id) : null;
      body.show_on_site = body.show_on_site === "1";
      if (p) await api(`/api/projects/${p.id}`, { method: "PUT", body });
      else await api("/api/projects", { method: "POST", body });
      closeModal();
      render();
    };
  }

  /* -------- Quotes -------- */
  async function renderQuotes(main) {
    $("#pageSub").textContent = "Kërkesat për oferta";
    main.innerHTML = `
      <div class="panel__head">
        <div class="toolbar" style="margin:0;flex:1">
          <input id="quoteQ" placeholder="Kërko" />
          <select id="quoteStatus"><option value="">Të gjitha</option>${Object.entries(QSTATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        </div>
        <button class="btn btn--primary" id="addQuote">+ Kërkesë</button>
      </div>
      <div class="panel table-wrap" id="quoteTable"></div>`;
    const paint = async () => {
      const q = $("#quoteQ").value;
      const status = $("#quoteStatus").value;
      const list = await api(
        `/api/quotes?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`
      );
      $("#quoteTable").innerHTML = `<table><thead><tr><th>Klienti</th><th>Shërbimi</th><th>Statusi</th><th>Vlera</th><th></th></tr></thead><tbody>${
        list.length
          ? list
              .map(
                (r) => `<tr>
              <td><strong>${esc(r.client_name)}</strong><div class="task-card__meta">${esc(r.phone || "")} · ${esc(r.email || "")}</div></td>
              <td>${esc(r.service_type || "")}<div class="task-card__meta">${esc((r.description || "").slice(0, 80))}</div></td>
              <td>${esc(QSTATUS[r.status] || r.status)}</td>
              <td>${r.offer_value != null ? esc(r.offer_value) + " €" : "—"}</td>
              <td class="row-actions">
                <button class="btn btn--ghost" data-edit-quote='${esc(JSON.stringify(r))}'>Ndrysho</button>
                <button class="btn btn--danger" data-del-quote="${r.id}">Fshi</button>
              </td>
            </tr>`
              )
              .join("")
          : `<tr><td colspan="5"><p class="empty">Nuk ka kërkesa.</p></td></tr>`
      }</tbody></table>`;
      $$("[data-edit-quote]").forEach((b) => (b.onclick = () => openQuoteModal(JSON.parse(b.dataset.editQuote))));
      $$("[data-del-quote]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm("Të fshihet kërkesa?")) return;
          await api(`/api/quotes/${b.dataset.delQuote}`, { method: "DELETE" });
          paint();
        };
      });
    };
    $("#addQuote").onclick = () => openQuoteModal();
    $("#quoteQ").oninput = $("#quoteStatus").onchange = paint;
    await paint();
  }

  async function openQuoteModal(r = null) {
    const clients = await api("/api/clients");
    const x = r || {
      client_name: "",
      phone: "",
      email: "",
      service_type: "",
      description: "",
      location: "",
      offer_value: "",
      status: "e_re",
      notes: "",
      client_id: "",
    };
    openModal(`
      <h3>${r ? "Ndrysho kërkesën" : "Kërkesë e re për ofertë"}</h3>
      <form class="form-grid form-grid--2" id="quoteForm">
        <label><span>Emri i klientit</span><input name="client_name" required value="${esc(x.client_name)}" /></label>
        <label><span>Klienti ekzistues</span><select name="client_id"><option value="">—</option>${clients.map((c) => `<option value="${c.id}" ${String(x.client_id) === String(c.id) ? "selected" : ""}>${esc(c.full_name)}</option>`).join("")}</select></label>
        <label><span>Telefoni</span><input name="phone" value="${esc(x.phone || "")}" /></label>
        <label><span>Email</span><input name="email" value="${esc(x.email || "")}" /></label>
        <label><span>Lloji i shërbimit</span><input name="service_type" value="${esc(x.service_type || "")}" /></label>
        <label><span>Lokacioni</span><input name="location" value="${esc(x.location || "")}" /></label>
        <label><span>Vlera e ofertës (€)</span><input type="number" step="0.01" name="offer_value" value="${esc(x.offer_value ?? "")}" /></label>
        <label><span>Statusi</span><select name="status">${Object.entries(QSTATUS).map(([k, v]) => `<option value="${k}" ${x.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="full"><span>Përshkrimi i punës</span><textarea name="description" rows="3">${esc(x.description || "")}</textarea></label>
        <label class="full"><span>Shënime</span><textarea name="notes" rows="2">${esc(x.notes || "")}</textarea></label>
        <div class="full row-actions"><button class="btn btn--primary">Ruaj</button><button type="button" class="btn btn--ghost" data-close>Anulo</button></div>
      </form>`);
    $("#quoteForm").onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      body.client_id = body.client_id ? Number(body.client_id) : null;
      body.offer_value = body.offer_value === "" ? null : Number(body.offer_value);
      if (r) await api(`/api/quotes/${r.id}`, { method: "PUT", body });
      else await api("/api/quotes", { method: "POST", body });
      closeModal();
      render();
    };
  }

  /* -------- Content -------- */
  async function renderContent(main) {
    $("#pageSub").textContent = "Ndrysho tekstet e website-it pa prekur kodin";
    const c = await api("/api/content");
    main.innerHTML = `
      <form class="panel form-grid" id="contentForm" style="max-width:640px">
        <h3>Home & kompania</h3>
        <label><span>Emri i kompanisë</span><input name="company_name" value="${esc(c.company_name || "")}" /></label>
        <label><span>Titulli / eyebrow i Hero</span><input name="hero_eyebrow" value="${esc(c.hero_eyebrow || "")}" /></label>
        <label><span>Përshkrimi i Hero</span><textarea name="hero_desc" rows="2">${esc(c.hero_desc || "")}</textarea></label>
        <label><span>Rreth nesh</span><textarea name="about_lead" rows="3">${esc(c.about_lead || "")}</textarea></label>
        <h3>Kontakti publik</h3>
        <label><span>Telefon / WhatsApp (tekst)</span><input name="phone" value="${esc(c.phone || "")}" /></label>
        <label><span>WhatsApp (vetëm numra)</span><input name="wa" value="${esc(c.wa || "")}" /></label>
        <label><span>Email</span><input name="email" value="${esc(c.email || "")}" /></label>
        <label><span>Adresa</span><input name="address" value="${esc(c.address || "")}" /></label>
        <label><span>Orari</span><input name="hours" value="${esc(c.hours || "")}" /></label>
        <label><span>Facebook</span><input name="social_facebook" value="${esc(c.social_facebook || "")}" /></label>
        <label><span>Instagram</span><input name="social_instagram" value="${esc(c.social_instagram || "")}" /></label>
        <div class="row-actions">
          <button class="btn btn--primary">Ruaj Ndryshimet</button>
          <button type="button" class="btn btn--ghost" id="contentCancel">Anulo</button>
        </div>
        <p class="login__ok" id="contentOk" hidden>U ruajt.</p>
      </form>`;
    $("#contentCancel").onclick = () => render();
    $("#contentForm").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"], .btn--primary');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Duke ruajtur…";
      }
      try {
        const body = Object.fromEntries(new FormData(e.target).entries());
        body.wa = String(body.wa || "").replace(/\D/g, "");
        await api("/api/content", { method: "PUT", body });
        $("#contentOk").hidden = false;
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Ruaj Ndryshimet";
        }
      }
    };
  }

  /* -------- Gallery -------- */
  async function renderGallery(main) {
    $("#pageSub").textContent = "Fotot e galerisë publike";
    const rows = await api("/api/gallery");
    main.innerHTML = `
      <div class="panel__head">
        <h3>Galeria</h3>
        <form id="upGal" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <input type="file" name="image" accept="image/*" required />
          <button class="btn btn--primary">Ngarko foto</button>
        </form>
      </div>
      <div class="gallery-admin">${rows
        .map(
          (g) => `<article class="g-card ${g.is_active ? "" : "is-off"}">
          <img src="/${esc(g.image_path)}" alt="${esc(g.alt_text || "")}" />
          <div class="g-card__body">
            <label><input type="checkbox" data-gal-active="${g.id}" ${g.is_active ? "checked" : ""} /> Aktive</label>
            <button class="btn btn--danger" data-del-gal="${g.id}">Fshi</button>
          </div>
        </article>`
        )
        .join("")}</div>`;
    $("#upGal").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await api("/api/gallery", { method: "POST", body: fd });
      render();
    };
    $$("[data-gal-active]").forEach((cb) => {
      cb.onchange = async () => {
        await api(`/api/gallery/${cb.dataset.galActive}`, {
          method: "PUT",
          body: { is_active: cb.checked },
        });
        render();
      };
    });
    $$("[data-del-gal]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Të fshihet fotoja?")) return;
        await api(`/api/gallery/${b.dataset.delGal}`, { method: "DELETE" });
        render();
      };
    });
  }

  /* -------- Settings -------- */
  async function renderSettings(main) {
    $("#pageSub").textContent = "Siguria dhe njoftimet";
    const pushOn = localStorage.getItem("gjeodeti-push-on") === "1";
    const installed = isStandaloneApp();
    main.innerHTML = `
      <div class="panel" style="max-width:520px;margin-bottom:1rem">
        <h3>Aplikacioni në telefon</h3>
        <p class="cal-intro">Instalo panelin si app në ekranin e telefonit — hapet pa browser.</p>
        <p class="task-card__meta">Statusi: ${installed ? "I instaluar" : "Nuk është instaluar ende"}</p>
        <button type="button" class="btn btn--primary" id="installAppBtn" ${installed ? "hidden" : ""}>Instalo në telefon</button>
        <p id="installMsg" class="cal-intro" style="margin-top:0.65rem" ${installed ? "" : "hidden"}>${installed ? "Po hapet si aplikacion (standalone)." : ""}</p>
      </div>
      <div class="panel" style="max-width:520px;margin-bottom:1rem">
        <h3>Njoftime në telefon</h3>
        <p class="cal-intro">Aktivizo njoftimet në këtë telefon që të marrësh alert kur klienti kontakton ose kur vjen ora e planit javor.</p>
        <p class="task-card__meta">Statusi: ${pushOn ? "Aktiv" : "Jo aktiv"}</p>
        <button type="button" class="btn btn--primary" id="enablePushBtn">Aktivizo njoftimet</button>
        <p id="pushMsg" hidden></p>
      </div>
      <form class="panel form-grid" id="passForm" style="max-width:480px">
        <h3>Ndrysho fjalëkalimin</h3>
        <label><span>Fjalëkalimi aktual</span><input type="password" name="currentPassword" required /></label>
        <label><span>Fjalëkalimi i ri</span><input type="password" name="newPassword" minlength="6" required /></label>
        <label><span>Përsërit</span><input type="password" name="newPassword2" minlength="6" required /></label>
        <button class="btn btn--primary">Ndrysho</button>
        <p id="passMsg" hidden></p>
      </form>
      <div class="panel">
        <h3>Admin</h3>
        <p class="task-card__meta">${esc(admin?.name || "")} · ${esc(admin?.email || "")}</p>
        <p>Fjalëkalimet ruhen të hashuara në databazë (bcrypt). Sesioni mbrohet me cookie httpOnly.</p>
      </div>`;
    $("#installAppBtn")?.addEventListener("click", async () => {
      const msg = $("#installMsg");
      const result = await installAdminApp();
      if (msg) {
        msg.hidden = false;
        msg.style.color = result.ok ? "var(--ok)" : "var(--danger)";
        msg.textContent = result.message;
      }
      if (result.ok && isStandaloneApp()) {
        const btn = $("#installAppBtn");
        if (btn) btn.hidden = true;
      }
    });
    if (deferredInstallPrompt) {
      const btn = $("#installAppBtn");
      if (btn) btn.hidden = false;
    }
    $("#enablePushBtn").onclick = async () => {
      const msg = $("#pushMsg");
      try {
        await enablePhoneNotifications();
        msg.hidden = false;
        msg.style.color = "var(--ok)";
        msg.textContent = "Njoftimet u aktivizuan në këtë telefon.";
      } catch (err) {
        msg.hidden = false;
        msg.style.color = "var(--danger)";
        msg.textContent = err.message;
      }
    };
    $("#passForm").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = $("#passMsg");
      if (fd.get("newPassword") !== fd.get("newPassword2")) {
        msg.hidden = false;
        msg.style.color = "var(--danger)";
        msg.textContent = "Fjalëkalimet nuk përputhen.";
        return;
      }
      try {
        await api("/api/auth/password", {
          method: "POST",
          body: {
            currentPassword: fd.get("currentPassword"),
            newPassword: fd.get("newPassword"),
          },
        });
        msg.hidden = false;
        msg.style.color = "var(--ok)";
        msg.textContent = "Fjalëkalimi u ndryshua.";
        e.target.reset();
      } catch (err) {
        msg.hidden = false;
        msg.style.color = "var(--danger)";
        msg.textContent = err.message;
      }
    };
  }

  /* -------- Password eye toggle -------- */
  $("#passToggle")?.addEventListener("click", () => {
    const input = $("#loginPass");
    const btn = $("#passToggle");
    const icon = $("#passEyeIcon");
    if (!input || !btn) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("is-on", show);
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", show ? "Fshih fjalëkalimin" : "Shfaq fjalëkalimin");
    if (icon) {
      icon.innerHTML = show
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22"/>`
        : `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`;
    }
    input.focus();
  });

  /* -------- Auth / boot -------- */
  async function bootAdmin() {
    ensureAdminServiceWorker().catch(() => {});
    const health = await checkApi();
    if (!health.ok) {
      showApiDown(health.error);
      return false;
    }
    showLoginForm();
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const me = await res.json().catch(() => ({}));
      if (res.ok && me.authenticated && me.admin) {
        await enterApp(me.admin);
        return true;
      }
    } catch {
      /* session e skaduar → forma e login */
    }
    showLoginForm();
    $("#loginPass")?.focus();
    return false;
  }

  $("#apiRetryBtn")?.addEventListener("click", async () => {
    const btn = $("#apiRetryBtn");
    btn.disabled = true;
    btn.textContent = "Duke kontrolluar…";
    try {
      await bootAdmin();
    } finally {
      btn.disabled = false;
      btn.textContent = "Provo përsëri";
    }
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginError");
    const ok = $("#loginOk");
    const btn = $("#loginBtn");
    err.hidden = true;
    ok.hidden = true;
    btn.disabled = true;

    const health = await checkApi();
    if (!health.ok) {
      showApiDown(health.error);
      btn.disabled = false;
      return;
    }

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: {
          email: $("#loginEmail").value.trim(),
          password: String($("#loginPass").value || "").trim(),
        },
      });
      ok.hidden = false;
      ok.textContent = data.message || "Kyçja u krye me sukses.";
      await enterApp(data.admin);
    } catch (ex) {
      showLoginForm();
      err.hidden = false;
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    admin = null;
    showLoginForm();
  });

  $("#notifyBtn")?.addEventListener("click", async () => {
    const panel = $("#notifyPanel");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      try {
        await api("/api/notifications/read", { method: "POST", body: {} });
        refreshBadge();
      } catch {
        /* ignore */
      }
    }
  });
  document.addEventListener("click", (e) => {
    const wrap = $("#notifyWrap");
    const panel = $("#notifyPanel");
    if (!wrap || !panel || wrap.hidden) return;
    if (!wrap.contains(e.target)) panel.hidden = true;
  });

  $$(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#menuToggle")?.addEventListener("click", () =>
    $("#sidebar").classList.toggle("is-open")
  );
  $("#modal")?.addEventListener("click", (e) => {
    if (e.target.matches("[data-close], .modal__backdrop")) closeModal();
  });

  bootAdmin();
})();
