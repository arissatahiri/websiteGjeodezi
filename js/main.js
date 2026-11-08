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

  const applyCmsServices = () => {
    const list = readCms(CMS.services, null);
    const wrap = document.querySelector(".services__pills");
    if (!wrap || !Array.isArray(list) || !list.length) return;
    wrap.innerHTML = list
      .map((name) => {
        const href = /legalizim/i.test(name) ? "#legalizimi" : "#kontakti";
        return `<a class="svc-pill reveal is-visible" href="${href}">${String(name)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</a>`;
      })
      .join("");
  };

  const applyCmsGallery = () => {
    if (!galleryTrack) return;
    const list = readCms(CMS.gallery, null);
    if (!Array.isArray(list) || !list.length) return;
    const active = list.filter((x) => x && x.active !== false && x.src);
    if (!active.length) return;
    galleryTrack.innerHTML = active
      .map(
        (item) =>
          `<figure class="gallery__item is-visible"><img src="${item.src}" alt="${String(
            item.alt || ""
          )
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")}" loading="lazy" /></figure>`
      )
      .join("");
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
    document.querySelectorAll(".legal-card__phone, a.legal-card__tel").forEach((el) => {
      if (el.tagName === "A") {
        el.href = `https://wa.me/${wa}`;
        el.textContent = phone;
      }
    });
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
        const wrap = document.querySelector(".services__pills");
        if (wrap) {
          wrap.innerHTML = servicesRes
            .map((s) => {
              const name = s.title || s.name || "";
              const href = /legalizim/i.test(name) ? "#legalizimi" : "#kontakti";
              return `<a class="svc-pill reveal is-visible" href="${href}">${String(name)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")}</a>`;
            })
            .join("");
        }
      }
      if (Array.isArray(galleryRes) && galleryRes.length && galleryTrack) {
        galleryTrack.innerHTML = galleryRes
          .map((item) => {
            const src = `/${String(item.image_path).replace(/^\/+/, "")}`;
            const alt = String(item.alt_text || "")
              .replace(/&/g, "&amp;")
              .replace(/"/g, "&quot;");
            return `<figure class="gallery__item is-visible"><img src="${src}" alt="${alt}" loading="lazy" /></figure>`;
          })
          .join("");
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
  document.querySelectorAll(".svc-pill.reveal").forEach((pill, i) => {
    pill.classList.add("reveal--up");
    pill.style.transitionDelay = `${i * 0.04}s`;
  });
  document.querySelectorAll(".value.reveal").forEach((el, i) => {
    el.classList.add("reveal--up");
    el.style.transitionDelay = `${i * 0.1}s`;
  });
  document.querySelectorAll(".gallery__item.reveal").forEach((el) => {
    el.classList.add("is-visible");
    el.classList.remove("reveal");
  });
  document.querySelectorAll(".legal .reveal, .cta .reveal, .contact .reveal").forEach((el, i) => {
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
    reveals.forEach((el) => {
      if (!el.closest(".hero")) io.observe(el);
      else el.classList.add("is-visible");
    });
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  /* Gallery — autoplay only, no drag / manual controls */
  if (galleryTrack) {
    const originals = [...galleryTrack.querySelectorAll(".gallery__item")];
    const n = originals.length;
    let galleryIndex = 0;
    let galleryTimer = null;
    let wrapping = false;
    const AUTO_MS = 3000;

    originals.forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.remove("reveal");
      clone.classList.add("is-visible");
      galleryTrack.appendChild(clone);
    });

    const stepWidth = () => {
      if (!originals[0]) return 0;
      const styles = window.getComputedStyle(galleryTrack);
      const gap = parseFloat(styles.columnGap || styles.gap) || 16;
      return originals[0].getBoundingClientRect().width + gap;
    };

    const setTransform = (index, instant) => {
      if (instant) galleryTrack.classList.add("is-instant");
      galleryTrack.style.transform = `translate3d(-${index * stepWidth()}px, 0, 0)`;
      if (instant) {
        void galleryTrack.offsetWidth;
        galleryTrack.classList.remove("is-instant");
      }
    };

    const finishWrap = () => {
      if (!wrapping) return;
      wrapping = false;
      galleryIndex = galleryIndex % n;
      setTransform(galleryIndex, true);
    };

    const advance = () => {
      if (!n || wrapping) return;
      galleryIndex += 1;
      setTransform(galleryIndex, false);
      if (galleryIndex >= n) {
        wrapping = true;
        let wrapFallback = 0;
        const onEnd = (e) => {
          if (e.propertyName && e.propertyName !== "transform") return;
          galleryTrack.removeEventListener("transitionend", onEnd);
          window.clearTimeout(wrapFallback);
          finishWrap();
        };
        galleryTrack.addEventListener("transitionend", onEnd);
        wrapFallback = window.setTimeout(() => {
          galleryTrack.removeEventListener("transitionend", onEnd);
          finishWrap();
        }, 700);
      }
    };

    const stopAuto = () => {
      if (galleryTimer) {
        clearInterval(galleryTimer);
        galleryTimer = null;
      }
    };

    const startAuto = () => {
      stopAuto();
      if (n < 2) return;
      galleryTimer = window.setInterval(advance, AUTO_MS);
    };

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (galleryIndex >= n) galleryIndex = galleryIndex % n;
        setTransform(galleryIndex, true);
      }, 120);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAuto();
      else startAuto();
    });

    setTransform(0, true);
    startAuto();
  }

  /* Legal flyer slider */
  const legalSlides = [...document.querySelectorAll("[data-legal-slide]")];
  const legalDots = document.getElementById("legalDots");
  const legalPrev = document.getElementById("legalPrev");
  const legalNext = document.getElementById("legalNext");
  let legalIndex = 0;
  let legalTimer;

  function showLegalSlide(i) {
    if (!legalSlides.length) return;
    legalIndex = (i + legalSlides.length) % legalSlides.length;
    legalSlides.forEach((slide, idx) => {
      const on = idx === legalIndex;
      slide.hidden = !on;
      slide.classList.toggle("is-active", on);
    });
    legalDots?.querySelectorAll("button").forEach((dot, idx) => {
      dot.classList.toggle("is-active", idx === legalIndex);
    });
  }

  function startLegalAuto() {
    clearInterval(legalTimer);
    if (legalSlides.length < 2) return;
    legalTimer = setInterval(() => showLegalSlide(legalIndex + 1), 5500);
  }

  if (legalSlides.length && legalDots) {
    legalSlides.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Legal slide ${i + 1}`);
      if (i === 0) dot.classList.add("is-active");
      dot.addEventListener("click", () => {
        showLegalSlide(i);
        startLegalAuto();
      });
      legalDots.appendChild(dot);
    });
    legalPrev?.addEventListener("click", () => {
      showLegalSlide(legalIndex - 1);
      startLegalAuto();
    });
    legalNext?.addEventListener("click", () => {
      showLegalSlide(legalIndex + 1);
      startLegalAuto();
    });
    showLegalSlide(0);
    startLegalAuto();
  }

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

    try {
      /* Save to admin dashboard database (when Node + MySQL are running) */
      try {
        const saveRes = await fetch("/api/public/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ name, email, phone, message }),
        });
        if (!saveRes.ok) {
          console.warn("Mesazhi nuk u ruajt në admin (API).", saveRes.status);
        }
      } catch {
        /* static-only / Netlify: localStorage already saved */
      }

      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
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
      });

      if (!res.ok) throw new Error("send failed");

      openWhatsApp(name, email, phone, message);
      form.reset();
      if (formOk) {
        formOk.hidden = false;
        formOk.textContent = "Faleminderit! Mesazhi u dërgua me email dhe WhatsApp.";
      }
    } catch {
      /* Fallback: mailto + WhatsApp */
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
