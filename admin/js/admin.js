(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const titles = {
    dashboard: "Përmbledhje",
    planner: "Plani ditor",
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
        `Serveri nuk është aktiv. Hap HAP-SERVER.bat pastaj ${LOCAL_ADMIN}`
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
    if (on) {
      $("#apiDownCard").hidden = true;
      $("#loginForm").hidden = false;
    }
  }

  async function enterApp(user) {
    admin = user;
    $("#adminName").textContent = admin.name || "Admin";
    showLogin(false);
    try {
      await setView("dashboard");
      refreshBadge();
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
    view = name;
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
      const b = $("#badgeMsg");
      const bq = $("#badgeQuote");
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
      const notes = data.notifications || [];
      const wrap = $("#notifyWrap");
      const badgeN = $("#badgeNotify");
      const panel = $("#notifyPanel");
      if (wrap && badgeN && panel) {
        if (notes.length) {
          wrap.hidden = false;
          badgeN.textContent = String(notes.length);
          panel.innerHTML = notes
            .map((x) => `<div class="notify__item">${esc(x.text)}</div>`)
            .join("");
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

  /* -------- Dashboard -------- */
  async function renderDashboard(main) {
    const d = await api("/api/dashboard");
    $("#pageSub").textContent = `${d.now.weekday} · ${d.now.date} · ${d.now.timezone}`;
    const s = d.stats;
    const maxBar = Math.max(
      1,
      ...(d.monthly.length ? d.monthly.map((m) => m.messages + m.quotes + m.tasks) : [1])
    );
    main.innerHTML = `
      <div class="stats">
        <article class="stat"><p class="stat__label">Klientë</p><p class="stat__value">${s.clientsTotal || 0}</p></article>
        <article class="stat"><p class="stat__label">Projekte aktive</p><p class="stat__value">${s.projectsActive}</p></article>
        <article class="stat stat--ok"><p class="stat__label">Projekte të përfunduara</p><p class="stat__value">${s.projectsDone}</p></article>
        <article class="stat ${s.messagesUnread ? "stat--warn" : ""}"><p class="stat__label">Mesazhe të palexuara</p><p class="stat__value">${s.messagesUnread}</p></article>
        <article class="stat"><p class="stat__label">Oferta të reja</p><p class="stat__value">${s.quotesNew}</p></article>
        <article class="stat"><p class="stat__label">Detyra sot</p><p class="stat__value">${s.tasksToday}</p></article>
        <article class="stat stat--ok"><p class="stat__label">Përfunduara sot</p><p class="stat__value">${s.tasksDoneToday}</p></article>
        <article class="stat"><p class="stat__label">Të mbetura sot</p><p class="stat__value">${s.tasksRemainingToday || 0}</p></article>
        <article class="stat stat--danger"><p class="stat__label">Urgjente</p><p class="stat__value">${s.tasksUrgent}</p></article>
        <article class="stat stat--warn"><p class="stat__label">Të vonuara</p><p class="stat__value">${s.tasksOverdue}</p></article>
      </div>
      ${
        (d.notifications || []).length
          ? `<section class="panel"><h3>Njoftime</h3><div class="task-list">${d.notifications
              .map((n) => `<article class="task-card">${esc(n.text)}</article>`)
              .join("")}</div></section>`
          : ""
      }
      <div class="grid-2">
        <section class="panel">
          <div class="panel__head"><h3>Sot</h3><button class="btn btn--ghost" data-go="planner">Shiko</button></div>
          ${taskListHtml(d.todayTasks)}
        </section>
        <section class="panel">
          <div class="panel__head"><h3>Mesazhet e fundit</h3><button class="btn btn--ghost" data-go="messages">Shiko</button></div>
          ${listSimple(d.recentMessages, (m) => `<strong>${esc(m.name)}</strong><div class="task-card__meta">${esc(m.email || "")} · ${esc(m.created_at)}</div><div>${esc(m.message).slice(0, 120)}</div>`)}
        </section>
      </div>
      <div class="grid-2">
        <section class="panel">
          <h3>Kërkesat e fundit për oferta</h3>
          ${listSimple(d.recentQuotes, (q) => `<strong>${esc(q.client_name)}</strong><div class="task-card__meta">${esc(q.service_type || "—")} · ${esc(QSTATUS[q.status] || q.status)}</div>`)}
        </section>
        <section class="panel">
          <h3>Projekte në proces</h3>
          ${listSimple(d.activeProjects || [], (p) => `<strong>${esc(p.title)}</strong><div class="task-card__meta">${esc(PSTATUS[p.status] || p.status)} · ${esc(p.location || "")}</div>`)}
        </section>
      </div>
      <div class="grid-2">
        <section class="panel">
          <h3>Afate që po afrohen</h3>
          ${listSimple(d.dueSoonProjects || [], (p) => `<strong>${esc(p.title)}</strong><div class="task-card__meta">Afati: ${esc(p.due_date || "—")}</div>`)}
        </section>
        <section class="panel">
          <div class="panel__head"><h3>Detyrat e ardhshme</h3><button class="btn btn--ghost" data-go="calendar">Kalendari</button></div>
          ${taskListHtml(d.upcomingTasks)}
        </section>
      </div>
      <section class="panel">
        <h3>Statistika mujore</h3>
        ${
          d.monthly.length
            ? `<div class="chart">${d.monthly
                .map((m) => {
                  const total = m.messages + m.quotes + m.tasks;
                  const h = Math.max(8, Math.round((total / maxBar) * 120));
                  return `<div class="chart__bar-wrap"><div class="chart__bar" style="height:${h}px" title="Mesazhe ${m.messages}, Oferta ${m.quotes}, Detyra ${m.tasks}"></div><div class="chart__label">${esc(m.month.slice(5))}</div></div>`;
                })
                .join("")}</div>`
            : `<p class="empty">Nuk ka ende të dhëna për grafik.</p>`
        }
      </section>`;
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
    main.innerHTML = `
      <div class="panel__head" style="margin-bottom:1rem">
        <div class="toolbar" style="margin:0;flex:1"><input id="clientQ" placeholder="Kërko klient" /></div>
        <button class="btn btn--primary" id="addClient">+ Shto klient</button>
      </div>
      <div class="panel table-wrap"><table>
        <thead><tr><th>Emri</th><th>Telefon</th><th>Email</th><th></th></tr></thead>
        <tbody>${
          rows.length
            ? rows
                .map(
                  (c) => `<tr>
              <td><strong>${esc(c.full_name)}</strong></td>
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
    $("#pageSub").textContent = "Siguria e llogarisë";
    main.innerHTML = `
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

  $("#notifyBtn")?.addEventListener("click", () => {
    const panel = $("#notifyPanel");
    if (panel) panel.hidden = !panel.hidden;
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
