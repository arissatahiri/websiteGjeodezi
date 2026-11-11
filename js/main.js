(() => {
  const header = document.getElementById("header");
  const burger = document.getElementById("burger");
  const nav = document.getElementById("nav");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel = document.getElementById("settingsPanel");
  const langPill = document.getElementById("langPill");
  const yearEl = document.getElementById("year");
  const form = document.getElementById("contactForm");
  const formOk = document.getElementById("formOk");
  const galleryTrack = document.getElementById("galleryTrack");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* CMS from admin (localStorage) */
  const CMS = {
    gallery: "gjeodeti-gallery",
    messages: "gjeodeti-messages",
    content: "gjeodeti-content",
    services: "gjeodeti-services",
  };
  const readCms = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const cmsContent = {
    phone: "+383 49 719 253",
    wa: "38349719253",
    email: "tahiriibrahim97@gmail.com",
    hours: "Hën – Prem · 08:00 – 17:00",
    ...readCms(CMS.content, {}),
  };

  const SVC_ICONS = [
    '<path d="M8 4h8l2 4H6l2-4z"/><path d="M6 8h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z"/><path d="M9 12h6M9 15h4"/>',
    '<path d="M7 7h4v4H7zM13 13h4v4h-4z"/><path d="M11 9h2v6h-2z"/>',
    '<path d="M4 19V5l8-2 8 2v14l-8 2-8-2z"/><path d="M12 3v18M4 12h16"/>',
    '<path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    '<path d="M4 19h16"/><path d="M7 19V9l5-3 5 3v10"/><path d="M9 12h2M13 12h2M9 15h2M13 15h2"/>',
  ];
  const escHtml = (v) =>
    String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const renderServicesGrid = (list) => {
    const wrap = document.querySelector(".services__grid");
    if (!wrap || !Array.isArray(list) || !list.length) return;
    wrap.innerHTML = list
      .map((item, i) => {
        const title = typeof item === "string" ? item : item.title || item.name || "";
        const desc = typeof item === "string" ? "" : item.description || item.desc || "";
        const icon = SVC_ICONS[i % SVC_ICONS.length];
        return `<a class="svc-tile reveal" href="#kontakti">
          <span class="svc-tile__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">${icon}</svg>
          </span>
          <h3 class="svc-tile__title">${escHtml(title)}</h3>
          ${desc ? `<p class="svc-tile__text">${escHtml(desc)}</p>` : ""}
        </a>`;
      })
      .join("");
    if (typeof window.__armSvcTiles === "function") window.__armSvcTiles();
    if (typeof window.__observeSvcTiles === "function") window.__observeSvcTiles();
  };
  const withoutLegalization = (list) =>
    (Array.isArray(list) ? list : []).filter(
      (item) => !/legaliz/i.test(typeof item === "string" ? item : item.title || item.name || "")
    );
  const applyCmsServices = () => {
    const list = withoutLegalization(readCms(CMS.services, null));
    if (!list.length) return;
    renderServicesGrid(list);
  };

  const galleryMarquee = document.querySelector(".gallery__marquee");
  const galleryLightbox = document.getElementById("galleryLightbox");
  const galleryLightboxImg = document.getElementById("galleryLightboxImg");
  const galleryLightboxClose = document.getElementById("galleryLightboxClose");
  const galleryLightboxPrev = document.getElementById("galleryLightboxPrev");
  const galleryLightboxNext = document.getElementById("galleryLightboxNext");
  let galleryIndex = 0;

  const normalizeGallerySrc = (src) => {
    const s = String(src || "").trim();
    if (!s) return "";
    if (/^(https?:|assets\/|\.\/)/i.test(s)) return s;
    return `/${s.replace(/^\/+/, "")}`;
  };
  const originalGalleryItems = () =>
    [...(galleryTrack?.querySelectorAll(".gallery__item:not([data-clone='1'])") || [])];
  const gallerySources = () =>
    originalGalleryItems().map((item) => {
      const img = item.querySelector("img");
      return { src: img?.getAttribute("src") || img?.src || "", alt: img?.alt || "" };
    });

  const setupGalleryMarquee = () => {
    if (!galleryTrack) return;
    galleryTrack.querySelectorAll(".gallery__item[data-clone='1']").forEach((el) => el.remove());
    originalGalleryItems().forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute("data-clone", "1");
      clone.setAttribute("aria-hidden", "true");
      clone.tabIndex = -1;
      galleryTrack.appendChild(clone);
    });
  };

  const openLightbox = (index) => {
    const list = gallerySources();
    if (!galleryLightbox || !galleryLightboxImg || !list.length) return;
    galleryIndex = ((index % list.length) + list.length) % list.length;
    const current = list[galleryIndex];
    galleryLightboxImg.src = current.src;
    galleryLightboxImg.alt = current.alt;
    galleryLightbox.hidden = false;
    document.body.style.overflow = "hidden";
    galleryMarquee?.classList.add("is-paused");
  };

  const closeLightbox = () => {
    if (!galleryLightbox) return;
    galleryLightbox.hidden = true;
    galleryLightboxImg?.removeAttribute("src");
    document.body.style.overflow = "";
    galleryMarquee?.classList.remove("is-paused");
  };

  const stepLightbox = (dir) => openLightbox(galleryIndex + dir);

  let galleryCenterRaf = 0;
  const updateGalleryCenter = () => {
    if (!galleryMarquee || !galleryTrack) return;
    const mid = galleryMarquee.getBoundingClientRect().left + galleryMarquee.clientWidth / 2;
    let best = null;
    let bestDist = Infinity;
    galleryTrack.querySelectorAll(".gallery__item").forEach((item) => {
      const rect = item.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    });
    galleryTrack.querySelectorAll(".gallery__item.is-center").forEach((el) => {
      if (el !== best) el.classList.remove("is-center");
    });
    best?.classList.add("is-center");
  };
  const startGalleryCenterWatch = () => {
    if (galleryCenterRaf) cancelAnimationFrame(galleryCenterRaf);
    const tick = () => {
      updateGalleryCenter();
      galleryCenterRaf = requestAnimationFrame(tick);
    };
    galleryCenterRaf = requestAnimationFrame(tick);
  };

  const bindGalleryInteractions = () => {
    setupGalleryMarquee();
    galleryTrack?.querySelectorAll(".gallery__item").forEach((item) => {
      const isClone = item.getAttribute("data-clone") === "1";
      const index = Number(item.dataset.galleryIndex || 0);
      item.onclick = () => openLightbox(index);
      if (isClone) item.tabIndex = -1;
    });
    startGalleryCenterWatch();
  };

  const renderGalleryItems = (list) => {
    if (!galleryTrack || !Array.isArray(list) || !list.length) return;
    galleryTrack.innerHTML = list
      .map((item, index) => {
        const raw = typeof item === "string" ? item : item.src || item.image_path || "";
        const src = normalizeGallerySrc(raw);
        const alt = String((typeof item === "object" && (item.alt || item.alt_text)) || "")
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;");
        return `<button type="button" class="gallery__item" data-gallery-index="${index}"><img src="${src}" alt="${alt}" loading="lazy" /></button>`;
      })
      .join("");
    bindGalleryInteractions();
  };
  const applyCmsGallery = () => {
    const list = readCms(CMS.gallery, null);
    if (!Array.isArray(list) || !list.length) return;
    const active = list.filter((x) => {
      if (!x || x.active === false) return false;
      const src = typeof x === "string" ? x : x.src || "";
      if (!src) return false;
      return !/teren-09/i.test(src);
    });
    if (!active.length) return;
    renderGalleryItems(active);
  };

  const applyCmsContent = () => {
    const { phone, wa, email, hours } = cmsContent;
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach((a) => {
      a.href = `https://wa.me/${wa}`;
      if (/WhatsApp ·/.test(a.textContent || "")) {
        a.innerHTML = a.innerHTML.replace(/\+[\d\s]+/, phone);
      } else if ((a.textContent || "").includes("+383") || (a.textContent || "").includes("49 719")) {
        a.textContent = phone;
      }
    });
    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      a.href = `mailto:${email}`;
      if (/Email ·/.test(a.textContent || "")) {
        a.innerHTML = a.innerHTML.replace(/[\w.+-]+@[\w.-]+/, email);
      } else if ((a.textContent || "").includes("@")) {
        a.textContent = email;
      }
    });
    const hoursEl = document.querySelector('[data-i18n="contact.hoursVal"]');
    if (hoursEl && hours) hoursEl.textContent = hours;
  };

  applyCmsServices();
  applyCmsGallery();
  applyCmsContent();

  /* Prefer live API content when Node admin server is running */
  (async () => {
    try {
      const [contentRes, servicesRes, galleryRes] = await Promise.all([
        fetch("/api/public/content").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/public/services").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/public/gallery").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (contentRes) {
        Object.assign(cmsContent, contentRes);
        applyCmsContent();
        if (contentRes.hero_eyebrow) {
          const el = document.querySelector('[data-i18n="hero.eyebrow"]');
          if (el) el.textContent = contentRes.hero_eyebrow;
        }
        if (contentRes.hero_desc) {
          const el = document.querySelector('[data-i18n="hero.desc"]');
          if (el) el.textContent = contentRes.hero_desc;
        }
        if (contentRes.about_lead) {
          const el = document.querySelector('[data-i18n="about.lead"]');
          if (el) el.textContent = contentRes.about_lead;
        }
      }
      if (Array.isArray(servicesRes) && servicesRes.length) {
        renderServicesGrid(withoutLegalization(servicesRes));
      }
      if (Array.isArray(galleryRes) && galleryRes.length && galleryTrack) {
        renderGalleryItems(
          galleryRes
            .filter((item) => !/teren-09/i.test(String(item.image_path || "")))
            .map((item) => ({
              src: `/${String(item.image_path).replace(/^\/+/, "")}`,
              alt: item.alt_text || "",
            }))
        );
      }
    } catch {
      /* static fallback already applied */
    }
  })();

  /* Theme */
  const savedTheme = localStorage.getItem("gjeodeti-theme") || "blue-dark";
  setTheme(savedTheme);

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) setTheme(input.value);
    });
  });

  function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem("gjeodeti-theme", theme);
    const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
    if (radio) radio.checked = true;
  }

  /* Language */
  const savedLang = localStorage.getItem("gjeodeti-lang") || "sq";
  const langSwitch = document.getElementById("langSwitch");
  const langMenu = document.getElementById("langMenu");

  function syncLangUI(lang) {
    applyLanguage(lang);
    langMenu?.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.setAttribute("aria-selected", String(opt.dataset.lang === lang));
    });
    const radio = document.querySelector(`input[name="lang"][value="${lang}"]`);
    if (radio) radio.checked = true;
  }

  function setLangMenuOpen(open) {
    if (!langMenu || !langPill || !langSwitch) return;
    langMenu.hidden = !open;
    langPill.setAttribute("aria-expanded", String(open));
    langSwitch.classList.toggle("is-open", open);
  }

  syncLangUI(savedLang);

  document.querySelectorAll('input[name="lang"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) syncLangUI(input.value);
    });
  });

  langPill?.addEventListener("click", (e) => {
    e.stopPropagation();
    setLangMenuOpen(langMenu.hidden);
  });

  langMenu?.querySelectorAll('[role="option"]').forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const lang = opt.dataset.lang;
      if (lang) syncLangUI(lang);
      setLangMenuOpen(false);
    });
  });

  document.addEventListener("click", (e) => {
    if (langSwitch && !langSwitch.contains(e.target)) setLangMenuOpen(false);
  });

  /* Settings panel */
  settingsToggle?.addEventListener("click", () => {
    const open = settingsPanel.hidden;
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (e) => {
    const settings = document.getElementById("settings");
    if (!settings.contains(e.target) && !settingsPanel.hidden) {
      settingsPanel.hidden = true;
      settingsToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* Mobile nav */
  const navBackdrop = document.getElementById("navBackdrop");

  function setNavOpen(open) {
    nav?.classList.toggle("is-open", open);
    burger?.classList.toggle("is-open", open);
    burger?.setAttribute("aria-expanded", String(open));
    navBackdrop?.classList.toggle("is-open", open);
    if (navBackdrop) navBackdrop.hidden = !open;
    document.body.classList.toggle("nav-open", open);
  }

  burger?.addEventListener("click", () => {
    setNavOpen(!nav.classList.contains("is-open"));
  });

  navBackdrop?.addEventListener("click", () => setNavOpen(false));

  nav?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => setNavOpen(false));
  });

  /* Header scroll + active nav + WhatsApp after hero */
  const sections = [...document.querySelectorAll("main section[id]")];
  const floatWa = document.querySelector(".float-wa");
  const hero = document.getElementById("kryefaqja");

  function onScroll() {
    const y = window.scrollY;
    header?.classList.toggle("is-scrolled", y > 40);

    let current = sections[0]?.id;
    for (const section of sections) {
      if (section.offsetTop - 120 <= y) current = section.id;
    }
    nav?.querySelectorAll(".nav__link").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${current}`);
    });

    // Show floating WhatsApp only after leaving the first (hero) page
    const heroH = hero ? hero.offsetHeight : window.innerHeight;
    floatWa?.classList.toggle("is-visible", y > heroH * 0.55);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* Reveal on scroll — fade / slide in as you go down */
  const reveals = [...document.querySelectorAll(".reveal")];

  /* Direction variants for variety */
  document.querySelectorAll(".about__text .reveal").forEach((el, i) => {
    el.classList.add("reveal--left");
    el.style.transitionDelay = `${i * 0.1}s`;
  });
  document.querySelector(".about__media.reveal")?.classList.add("reveal--right");
  document.querySelector(".owner__slide.reveal")?.classList.add("reveal--zoom");
  document.querySelectorAll(".owner__info .reveal").forEach((el, i) => {
    el.classList.add("reveal--right");
    el.style.transitionDelay = `${0.15 + i * 0.1}s`;
  });
  document.querySelectorAll(".services__intro .reveal").forEach((el, i) => {
    el.classList.add("reveal--left");
    el.style.transitionDelay = `${i * 0.1}s`;
  });
  const armSvcTiles = (root = document) => {
    const dirs = ["reveal--slide-up", "reveal--slide-left", "reveal--slide-right"];
    root.querySelectorAll(".svc-tile.reveal").forEach((tile, i) => {
      tile.classList.remove("reveal--up", "reveal--left", "reveal--right", ...dirs);
      tile.classList.add(dirs[i % dirs.length]);
      tile.style.transitionDelay = `${0.08 + i * 0.1}s`;
    });
  };
  armSvcTiles();
  window.__armSvcTiles = armSvcTiles;
  document.querySelectorAll(".value.reveal").forEach((el, i) => {
    el.classList.add("reveal--up");
    el.style.transitionDelay = `${i * 0.1}s`;
  });
  document.querySelectorAll(".gallery__item.reveal").forEach((el) => {
    el.classList.add("is-visible");
    el.classList.remove("reveal");
  });
  document.querySelectorAll(".cta .reveal, .contact .reveal").forEach((el, i) => {
    if (!el.classList.contains("reveal--left") && !el.classList.contains("reveal--right")) {
      el.classList.add(i % 2 === 0 ? "reveal--up" : "reveal--left");
    }
    el.style.transitionDelay = `${(i % 5) * 0.08}s`;
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    window.__observeSvcTiles = () => {
      document.querySelectorAll(".svc-tile.reveal:not(.is-visible)").forEach((el) => io.observe(el));
    };
    reveals.forEach((el) => {
      if (!el.closest(".hero")) io.observe(el);
      else el.classList.add("is-visible");
    });
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  bindGalleryInteractions();
  galleryLightboxClose?.addEventListener("click", closeLightbox);
  galleryLightboxPrev?.addEventListener("click", () => stepLightbox(-1));
  galleryLightboxNext?.addEventListener("click", () => stepLightbox(1));
  galleryLightbox?.addEventListener("click", (e) => {
    if (e.target === galleryLightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (!galleryLightbox || galleryLightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  /* Contact form → email + WhatsApp + admin inbox */
  const CONTACT_EMAIL = cmsContent.email || "tahiriibrahim97@gmail.com";
  const CONTACT_WA = cmsContent.wa || "38349719253";
  const submitBtn = form?.querySelector('button[type="submit"]');

  const saveAdminMessage = (name, email, phone, message) => {
    const list = readCms(CMS.messages, []);
    list.push({
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      email,
      phone,
      message,
      ts: Date.now(),
      read: false,
    });
    localStorage.setItem(CMS.messages, JSON.stringify(list));
  };

  const openWhatsApp = (name, email, phone, message) => {
    const text =
      `*Kontakt nga website — Gjeodeti I.T*\n\n` +
      `Emri: ${name}\n` +
      `Email: ${email}\n` +
      `Telefon: ${phone}\n\n` +
      `Mesazhi:\n${message}`;
    window.open(
      `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener"
    );
  };

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim() || "—";
    const message = String(data.get("message") || "").trim();
    const body = `Emri: ${name}\nEmail: ${email}\nTelefon: ${phone}\n\nMesazhi:\n${message}`;

    saveAdminMessage(name, email, phone, message);

    const prevLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Duke dërguar…";
    }
    if (formOk) formOk.hidden = true;

    const fetchWithTimeout = async (url, options, ms = 4000) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        return await fetch(url, { ...options, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      /* 1) Ruaj në dashboard + njoftim (shpejt) */
      let savedAdmin = false;
      try {
        const saveRes = await fetchWithTimeout(
          "/api/public/contact",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ name, email, phone, message }),
          },
          5000
        );
        savedAdmin = saveRes.ok;
        if (!saveRes.ok) {
          console.warn("Mesazhi nuk u ruajt në admin (API).", saveRes.status);
        }
      } catch {
        /* static-only / Netlify: localStorage already saved */
      }

      /* 2) Email opsional — mos e blloko formën nëse formsubmit vonon */
      let emailed = false;
      try {
        const res = await fetchWithTimeout(
          `https://formsubmit.co/ajax/${CONTACT_EMAIL}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              name,
              email,
              phone,
              message,
              _subject: `Kontakt nga website — ${name}`,
              _template: "table",
              _replyto: email,
            }),
          },
          3500
        );
        emailed = res.ok;
      } catch {
        /* email i jashtëm dështoi / timeout — dashboard + WA mjafton */
      }

      openWhatsApp(name, email, phone, message);
      form.reset();
      if (formOk) {
        formOk.hidden = false;
        formOk.textContent = savedAdmin
          ? "Faleminderit! Mesazhi u dërgua (dashboard + WhatsApp)."
          : emailed
            ? "Faleminderit! Mesazhi u dërgua me email dhe WhatsApp."
            : "Faleminderit! Hap WhatsApp për ta dërguar mesazhin.";
      }

      if (!savedAdmin && !emailed) {
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
          `Kontakt nga website — ${name}`
        )}&body=${encodeURIComponent(body)}`;
      }
    } catch {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
        `Kontakt nga website — ${name}`
      )}&body=${encodeURIComponent(body)}`;
      setTimeout(() => openWhatsApp(name, email, phone, message), 350);
      if (formOk) {
        formOk.hidden = false;
        formOk.textContent =
          "Hape emailin dhe WhatsApp për ta dërguar mesazhin.";
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel || "Dërgo";
      }
    }
  });

})();
