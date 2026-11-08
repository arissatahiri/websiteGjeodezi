(() => {
  const SESSION_KEY = "gjeodeti-intro-seen";
  const DURATION = 7.5;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = (() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  })();

  const root = document.getElementById("siteIntro");
  if (!root) return;

  const finish = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    document.documentElement.classList.remove("intro-pending");
    document.body.classList.remove("intro-active");
    root.classList.add("is-done");
    root.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      root.remove();
      window.dispatchEvent(new CustomEvent("gjeodeti:intro-done"));
    }, 900);
  };

  if (seen || reduceMotion || document.documentElement.classList.contains("intro-skip")) {
    document.documentElement.classList.remove("intro-pending");
    root.remove();
    return;
  }

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(src));
      document.head.appendChild(s);
    });

  document.body.classList.add("intro-active");

  Promise.all([
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"),
    loadScript("https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"),
  ])
    .then(() => startIntro())
    .catch(() => finish());

  function startIntro() {
    if (typeof THREE === "undefined" || typeof gsap === "undefined") {
      finish();
      return;
    }

    const canvas = document.getElementById("introCanvas");
    const skipBtn = document.getElementById("introSkip");
    const lines = [...root.querySelectorAll("[data-intro-line]")];
    const coordsEl = document.getElementById("introCoords");

    const isMobile = window.matchMedia("(max-width: 768px)").matches || navigator.maxTouchPoints > 1;
    const dprCap = isMobile ? 1.25 : 1.75;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isMobile,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x050d1a, 1);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050d1a, 0.045);

    const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 7.2, 11.5);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.AmbientLight(0x1a3358, 0.55));
    const key = new THREE.DirectionalLight(0x6eb6ff, 1.15);
    key.position.set(4, 10, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x1e5fbf, 0.55);
    rim.position.set(-6, 4, -4);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x3b82c4, 0x081425, 0.35));

    const SEG = isMobile ? 64 : 96;
    const SIZE = 18;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h =
        Math.sin(x * 0.55) * Math.cos(z * 0.48) * 0.85 +
        Math.sin(x * 1.25 + z * 0.7) * 0.35 +
        Math.cos(z * 1.1 - x * 0.4) * 0.28 +
        Math.sin((x * x + z * z) * 0.045) * 0.55;
      pos.setY(i, h);
      const t = THREE.MathUtils.clamp((h + 1.2) / 2.6, 0, 1);
      colors[i * 3] = 0.04 + t * 0.08;
      colors[i * 3 + 1] = 0.12 + t * 0.22;
      colors[i * 3 + 2] = 0.28 + t * 0.45;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.18,
    });
    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.scale.y = 0.001;
    scene.add(terrain);

    const wireGeo = geo.clone();
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x3b9eff,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.scale.y = 0.001;
    wire.position.y = 0.02;
    scene.add(wire);

    const contourGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const r = 1.4 + i * 1.15;
      const curve = new THREE.EllipseCurve(0, 0, r, r * (0.78 + (i % 3) * 0.05), 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(isMobile ? 48 : 80);
      const cGeo = new THREE.BufferGeometry().setFromPoints(
        pts.map((p) => new THREE.Vector3(p.x, 0.05 + i * 0.02, p.y))
      );
      const line = new THREE.LineLoop(
        cGeo,
        new THREE.LineBasicMaterial({
          color: 0x4aa3ff,
          transparent: true,
          opacity: 0.18 + i * 0.04,
        })
      );
      line.scale.setScalar(0.01);
      contourGroup.add(line);
    }
    scene.add(contourGroup);

    const pointsGroup = new THREE.Group();
    const pointPositions = [
      [-2.4, 0, -1.2],
      [1.8, 0, -2.1],
      [0.3, 0, 1.6],
      [-1.1, 0, 2.4],
      [2.6, 0, 0.8],
      [-3.2, 0, 0.4],
      [0.8, 0, -3.0],
    ];
    const pointMeshes = pointPositions.map(([x, , z]) => {
      const y =
        Math.sin(x * 0.55) * Math.cos(z * 0.48) * 0.85 +
        Math.sin(x * 1.25 + z * 0.7) * 0.35 +
        0.15;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x6ec1ff, transparent: true, opacity: 0 })
      );
      mesh.position.set(x, y + 0.12, z);
      pointsGroup.add(mesh);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.12, 0.18, 24),
        new THREE.MeshBasicMaterial({
          color: 0x3b9eff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.04, z);
      pointsGroup.add(ring);
      return { mesh, ring };
    });
    scene.add(pointsGroup);

    const instrument = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xc5d0dc, metalness: 0.75, roughness: 0.28 });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x1e5fbf,
      metalness: 0.4,
      roughness: 0.35,
      emissive: 0x0a2a66,
      emissiveIntensity: 0.4,
    });
    const legMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.35, roughness: 0.45 });

    [
      [-0.22, 0.35],
      [0.22, 0.35],
      [0, -0.38],
    ].forEach(([lx, lz], idx) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.35, 8), legMat);
      leg.position.set(lx * 0.9, 0.55, lz * 0.9);
      leg.rotation.z = idx === 2 ? 0.18 : idx === 0 ? -0.16 : 0.16;
      leg.rotation.x = idx === 2 ? -0.12 : 0.08;
      instrument.add(leg);
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 20), metal);
    base.position.y = 1.2;
    instrument.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.32), accent);
    body.position.y = 1.42;
    instrument.add(body);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 14), metal);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0.05, 1.48, 0);
    instrument.add(scope);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 16),
      new THREE.MeshBasicMaterial({ color: 0x3b9eff })
    );
    lens.position.set(0.27, 1.48, 0);
    lens.rotation.y = Math.PI / 2;
    instrument.add(lens);
    instrument.position.set(2.4, 0, 1.8);
    instrument.scale.setScalar(0.001);
    scene.add(instrument);

    const beams = [];
    const beamTargets = [
      new THREE.Vector3(-3.2, 0.2, -2.4),
      new THREE.Vector3(2.8, 0.3, -3.1),
      new THREE.Vector3(-1.5, 0.15, 3.2),
      new THREE.Vector3(3.5, 0.25, 1.4),
    ];
    const placeBeam = (beam, from, to) => {
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const dir = to.clone().sub(from);
      const len = Math.max(dir.length(), 0.01);
      beam.scale.set(1, len, 1);
      beam.position.copy(mid);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    };
    beamTargets.forEach((target) => {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.008, 1, 6, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x3b9eff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      beam.userData.target = target.clone();
      scene.add(beam);
      beams.push(beam);
    });

    const pCount = isMobile ? 80 : 160;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 16;
      pPos[i * 3 + 1] = Math.random() * 6 + 0.2;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0x6eb6ff,
        size: isMobile ? 0.035 : 0.045,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    scene.add(particles);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x1e5fbf,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    scene.add(glow);

    let raf = 0;
    let running = true;
    let disposed = false;
    const clock = new THREE.Clock();

    const onResize = () => {
      if (disposed) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    const renderLoop = () => {
      if (!running) return;
      raf = requestAnimationFrame(renderLoop);
      const t = clock.getElapsedTime();
      particles.rotation.y = t * 0.04;
      const arr = particles.geometry.attributes.position.array;
      for (let i = 0; i < pCount; i++) {
        arr[i * 3 + 1] += Math.sin(t + i) * 0.0015;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    renderLoop();

    const camProxy = { x: camera.position.x, y: camera.position.y, z: camera.position.z, lx: 0, ly: 0.4, lz: 0 };
    const updateCam = () => {
      camera.position.set(camProxy.x, camProxy.y, camProxy.z);
      camera.lookAt(camProxy.lx, camProxy.ly, camProxy.lz);
    };

    const showLine = (el, dur = 0.55) =>
      gsap.fromTo(
        el,
        { opacity: 0, filter: "blur(10px)", y: 18 },
        { opacity: 1, filter: "blur(0px)", y: 0, duration: dur, ease: "power2.out" }
      );
    const hideLine = (el, dur = 0.35) =>
      gsap.to(el, { opacity: 0, filter: "blur(8px)", y: -12, duration: dur, ease: "power1.in" });

    const tl = gsap.timeline({
      defaults: { ease: "power2.inOut" },
      onComplete: () => {
        running = false;
        cancelAnimationFrame(raf);
        dispose();
        finish();
      },
    });

    tl.to([terrain.scale, wire.scale], { y: 1, duration: 1.4, ease: "power3.out" }, 0);
    contourGroup.children.forEach((c, i) => {
      tl.to(c.scale, { x: 1, y: 1, z: 1, duration: 1.15, ease: "power2.out" }, 0.25 + i * 0.08);
    });

    tl.to(
      camProxy,
      { x: 4.2, y: 5.8, z: 9.2, duration: 2.4, ease: "sine.inOut", onUpdate: updateCam },
      0.15
    );

    tl.to(instrument.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: "back.out(1.4)" }, 0.85);

    beams.forEach((beam, i) => {
      const from = new THREE.Vector3(2.4, 1.48, 1.8);
      const to = beam.userData.target;
      const sweep = to.clone();
      placeBeam(beam, from, to);
      tl.to(beam.material, { opacity: 0.65, duration: 0.2 }, 1.05 + i * 0.1);
      tl.to(
        sweep,
        {
          x: to.x + Math.sin(i + 1) * 1.4,
          z: to.z + Math.cos(i + 1) * 1.4,
          duration: 1.5,
          ease: "sine.inOut",
          onUpdate: () => placeBeam(beam, from, sweep),
        },
        1.05 + i * 0.1
      );
      tl.to(beam.material, { opacity: 0, duration: 0.35 }, 2.55 + i * 0.08);
    });

    pointMeshes.forEach((p, i) => {
      tl.to(p.mesh.material, { opacity: 1, duration: 0.3 }, 1.4 + i * 0.08);
      tl.to(p.ring.material, { opacity: 0.7, duration: 0.3 }, 1.4 + i * 0.08);
      tl.to(p.ring.scale, { x: 1.8, y: 1.8, z: 1.8, duration: 0.6 }, 1.45 + i * 0.08);
    });

    if (coordsEl) {
      const samples = [
        "N 42°22′14.2″  E 21°09′08.7″",
        "H = 578.42 m  ·  RMS ±0.012",
        "STN-07  ·  GNSS FIX",
      ];
      tl.to(coordsEl, { opacity: 1, duration: 0.4 }, 1.5);
      tl.call(
        () => {
          let i = 0;
          coordsEl.textContent = samples[0];
          coordsEl._iv = setInterval(() => {
            i = (i + 1) % samples.length;
            coordsEl.textContent = samples[i];
          }, 700);
        },
        null,
        1.5
      );
    }

    const [brand, sub, tag, finalLine] = lines;
    if (brand) {
      tl.add(showLine(brand, 0.7), 1.0);
      tl.add(hideLine(brand), 2.5);
    }
    if (sub) {
      tl.add(showLine(sub, 0.6), 2.65);
      tl.add(hideLine(sub), 3.85);
    }
    if (tag) {
      tl.add(showLine(tag, 0.6), 4.0);
      tl.add(hideLine(tag), 5.2);
    }
    if (finalLine) tl.add(showLine(finalLine, 0.65), 5.4);

    tl.to(
      camProxy,
      {
        x: 0.2,
        y: 2.4,
        z: 3.2,
        ly: 0.9,
        duration: 1.15,
        ease: "power3.in",
        onUpdate: updateCam,
      },
      DURATION - 1.25
    );
    tl.to(wire.material, { opacity: 0.05, duration: 0.8 }, DURATION - 1.1);
    tl.to(root, { opacity: 0, duration: 0.75, ease: "power2.in" }, DURATION - 0.85);
    if (coordsEl) tl.to(coordsEl, { opacity: 0, duration: 0.4 }, DURATION - 1.0);
    if (finalLine) tl.add(hideLine(finalLine, 0.4), DURATION - 0.9);

    function dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("resize", onResize);
      if (coordsEl && coordsEl._iv) clearInterval(coordsEl._iv);
      cancelAnimationFrame(raf);
      tl.kill();
      geo.dispose();
      wireGeo.dispose();
      terrainMat.dispose();
      wireMat.dispose();
      renderer.dispose();
    }

    const skip = () => {
      if (disposed) return;
      running = false;
      tl.kill();
      gsap.to(root, {
        opacity: 0,
        duration: 0.45,
        ease: "power2.in",
        onComplete: () => {
          dispose();
          finish();
        },
      });
    };

    skipBtn?.addEventListener("click", skip);
  }
})();
