(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var TYPES = {
    indoor: {
      key: "indoor",
      accent: 0x4fd3ff,
      accentCss: "#4fd3ff",
      cols: 8,
      rows: 5,
      panelW: 4.6,
      panelH: 2.7,
      bezel: 0.02,
      curveDeg: 0,
      mount: "wall",
      hueBase: 200,
      hueSpread: 45,
      specs: [
        ["픽셀 피치", "P1.2 ~ P2.5 mm"],
        ["밝기", "600 ~ 800 nit"],
        ["시야각", "160°"],
        ["방수등급", "IP30 (실내용)"]
      ]
    },
    outdoor: {
      key: "outdoor",
      accent: 0xffa94d,
      accentCss: "#ffa94d",
      cols: 6,
      rows: 4,
      panelW: 5.6,
      panelH: 3.2,
      bezel: 0.05,
      curveDeg: 0,
      mount: "pole",
      hueBase: 25,
      hueSpread: 40,
      specs: [
        ["픽셀 피치", "P3 ~ P6 mm"],
        ["밝기", "5,000 ~ 7,000 nit"],
        ["방수등급", "IP65"],
        ["사용 온도", "-20°C ~ 50°C"]
      ]
    },
    curved: {
      key: "curved",
      accent: 0xc792ff,
      accentCss: "#c792ff",
      cols: 10,
      rows: 6,
      panelW: 3.4,
      panelH: 2.4,
      bezel: 0.02,
      curveDeg: 55,
      mount: "stage",
      hueBase: 280,
      hueSpread: 60,
      specs: [
        ["픽셀 피치", "P1.8 ~ P3 mm"],
        ["최소 곡률 반경", "500 mm"],
        ["모듈 연결", "무결절"],
        ["방수등급", "IP31"]
      ]
    }
  };

  var canvas = document.getElementById("stage-canvas");
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  var scene = new THREE.Scene();
  var bgColor = new THREE.Color(0x0a0c10);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(0x0a0c10, 0.028);

  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  // ---- lighting ----
  scene.add(new THREE.AmbientLight(0x8fa2c2, 0.55));
  var key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(6, 9, 7);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x6fb7ff, 0.5);
  rim.position.set(-8, 4, -6);
  scene.add(rim);

  // ---- floor ----
  var floorTex = makeGridTexture();
  var floorGeo = new THREE.PlaneGeometry(60, 60);
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d1016,
    roughness: 0.92,
    metalness: 0.05,
    map: floorTex,
    transparent: true
  });
  var floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.6;
  scene.add(floor);

  function makeGridTexture() {
    var size = 512;
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d");
    g.clearRect(0, 0, size, size);
    g.strokeStyle = "rgba(140,165,200,0.35)";
    g.lineWidth = 1;
    var step = size / 24;
    for (var i = 0; i <= 24; i++) {
      var p = i * step;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }

  // ---- content texture (animated "screen content") ----
  function makeContentTexture(hueBase, hueSpread) {
    var w = 256, h = 144;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d");
    var texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    function draw(t) {
      ctx.fillStyle = "hsl(" + hueBase + ", 55%, 16%)";
      ctx.fillRect(0, 0, w, h);

      var bands = 5;
      for (var i = 0; i < bands; i++) {
        var phase = t * 0.00022 + i * 1.7;
        var x = (Math.sin(phase) * 0.5 + 0.5) * w;
        var y = ((i + 0.5) / bands) * h + Math.sin(t * 0.0006 + i) * 6;
        var r = w * 0.3;
        var hue = hueBase + Math.sin(t * 0.0003 + i * 2.1) * hueSpread;
        var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "hsla(" + hue + ", 95%, 68%, 1)");
        grad.addColorStop(0.6, "hsla(" + hue + ", 95%, 55%, 0.75)");
        grad.addColorStop(1, "hsla(" + hue + ", 95%, 55%, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // diagonal sweep highlight
      var sweepX = ((t * 0.05) % (w + 120)) - 60;
      var sg = ctx.createLinearGradient(sweepX, 0, sweepX + 90, 0);
      sg.addColorStop(0, "hsla(" + hueBase + ",90%,85%,0)");
      sg.addColorStop(0.5, "hsla(" + hueBase + ",90%,85%,0.28)");
      sg.addColorStop(1, "hsla(" + hueBase + ",90%,85%,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);

      // subtle pixel-grid structure
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      var cell = 4;
      for (var gx = 0; gx <= w; gx += cell) {
        ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      texture.needsUpdate = true;
    }

    return { texture: texture, draw: draw };
  }

  // ---- bend helper: displaces a plane geometry into a cylindrical arc ----
  function bendGeometry(geo, halfWidth, curveDeg) {
    if (!curveDeg) return geo;
    var maxAngle = THREE.MathUtils.degToRad(curveDeg) / 2;
    var radius = halfWidth / Math.sin(maxAngle);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var theta = (x / halfWidth) * maxAngle;
      var nx = radius * Math.sin(theta);
      var nz = radius * (1 - Math.cos(theta));
      pos.setX(i, nx);
      pos.setZ(i, nz);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function buildSeamLines(cfg) {
    var group = new THREE.Group();
    var mat = new THREE.LineBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.55 });
    var halfW = (cfg.panelW * cfg.cols) / 2;
    var halfH = (cfg.panelH * cfg.rows) / 2;
    var curveDeg = cfg.curveDeg;
    var maxAngle = curveDeg ? THREE.MathUtils.degToRad(curveDeg) / 2 : 0;
    var radius = curveDeg ? halfW / Math.sin(maxAngle) : 0;

    function bendPoint(x, y) {
      if (!curveDeg) return new THREE.Vector3(x, y, 0.02);
      var theta = (x / halfW) * maxAngle;
      return new THREE.Vector3(radius * Math.sin(theta), y, radius * (1 - Math.cos(theta)) + 0.02);
    }

    var segs = curveDeg ? 24 : 1;
    for (var c = 0; c <= cfg.cols; c++) {
      var x = -halfW + c * cfg.panelW;
      var pts = [];
      for (var s = 0; s <= segs; s++) {
        var y = -halfH + (s / segs) * (halfH * 2);
        pts.push(bendPoint(x, y));
      }
      var g = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(g, mat));
    }
    for (var r = 0; r <= cfg.rows; r++) {
      var y2 = -halfH + r * cfg.panelH;
      var pts2 = [];
      var xsegs = curveDeg ? 48 : 1;
      for (var s2 = 0; s2 <= xsegs; s2++) {
        var x2 = -halfW + (s2 / xsegs) * (halfW * 2);
        pts2.push(bendPoint(x2, y2));
      }
      var g2 = new THREE.BufferGeometry().setFromPoints(pts2);
      group.add(new THREE.Line(g2, mat));
    }
    return group;
  }

  function buildMount(cfg, halfW, halfH) {
    var group = new THREE.Group();
    var metalMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.45, metalness: 0.75 });

    if (cfg.mount === "wall") {
      for (var i = -1; i <= 1; i += 2) {
        var bracket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.35), metalMat);
        bracket.position.set(i * halfW * 0.6, 0, -0.3);
        group.add(bracket);
      }
    } else if (cfg.mount === "pole") {
      var poleHeight = halfH * 2 + 3.2;
      var poleGeo = new THREE.CylinderGeometry(0.16, 0.18, poleHeight, 16);
      for (var j = -1; j <= 1; j += 2) {
        var pole = new THREE.Mesh(poleGeo, metalMat);
        pole.position.set(j * halfW * 0.82, floor.position.y + poleHeight / 2, -0.4);
        group.add(pole);
        var base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 20), metalMat);
        base.position.set(j * halfW * 0.82, floor.position.y + 0.09, -0.4);
        group.add(base);
      }
      var backFrame = new THREE.Mesh(
        new THREE.BoxGeometry(halfW * 2 + 0.3, halfH * 2 + 0.3, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: 0.6, metalness: 0.5 })
      );
      backFrame.position.z = -0.35;
      group.add(backFrame);
    } else if (cfg.mount === "stage") {
      var arcTex = floorTex;
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(halfW * 0.98, halfW * 1.05, 48, 1, Math.PI / 2 - THREE.MathUtils.degToRad(cfg.curveDeg) / 2, THREE.MathUtils.degToRad(cfg.curveDeg))
      );
      ring.material = new THREE.MeshBasicMaterial({ color: cfg.accent, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = floor.position.y + 0.01;
      group.add(ring);
    }
    return group;
  }

  var stageGroup = new THREE.Group();
  scene.add(stageGroup);
  var currentContent = null;
  var current = null;

  function buildType(cfg) {
    var group = new THREE.Group();
    var halfW = (cfg.panelW * cfg.cols) / 2;
    var halfH = (cfg.panelH * cfg.rows) / 2;

    var screenGeo = new THREE.PlaneGeometry(halfW * 2, halfH * 2, cfg.cols * 2, cfg.rows * 2);
    bendGeometry(screenGeo, halfW, cfg.curveDeg);
    var content = makeContentTexture(cfg.hueBase, cfg.hueSpread);
    var screenMat = new THREE.MeshBasicMaterial({ map: content.texture, toneMapped: false });
    screenMat.fog = false;
    var screen = new THREE.Mesh(screenGeo, screenMat);
    group.add(screen);

    group.add(buildSeamLines(cfg));

    var bezelDepth = 0.5 + cfg.bezel * 4;
    var bezelGeo = new THREE.PlaneGeometry(halfW * 2 + 0.12, halfH * 2 + 0.12, cfg.curveDeg ? cfg.cols * 2 : 1, 1);
    bendGeometry(bezelGeo, halfW, cfg.curveDeg);
    var bezelMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.55, metalness: 0.4 });
    var bezel = new THREE.Mesh(bezelGeo, bezelMat);
    bezel.position.z = -0.06;
    group.add(bezel);

    group.add(buildMount(cfg, halfW, halfH));

    group.position.y = 0.2;

    return { group: group, content: content, halfW: halfW, halfH: halfH };
  }

  function fitDistance(sphereRadius) {
    var vFov = THREE.MathUtils.degToRad(camera.fov);
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    var limitingFov = Math.min(vFov, hFov);
    return (sphereRadius / Math.sin(limitingFov / 2)) * 1.18;
  }

  function setType(key) {
    var cfg = TYPES[key];
    if (current) {
      stageGroup.remove(current.group);
    }
    current = buildType(cfg);
    stageGroup.add(current.group);
    currentContent = current.content;

    current.group.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(current.group);
    var sphere = box.getBoundingSphere(new THREE.Sphere());
    current.sphere = sphere;
    target.copy(sphere.center);

    var dist = fitDistance(sphere.radius);
    targetSpherical.radius = dist;
    minRadius = dist * 0.4;
    maxRadius = dist * 2.4;

    updateSpecPanel(cfg);
    document.querySelectorAll(".type-card").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-type") === key);
    });
    document.documentElement.style.setProperty("--accent", cfg.accentCss);
  }

  function updateSpecPanel(cfg) {
    var wrap = document.getElementById("spec-grid");
    wrap.innerHTML = "";
    cfg.specs.forEach(function (pair) {
      var dt = document.createElement("div");
      dt.className = "spec-label";
      dt.textContent = pair[0];
      var dd = document.createElement("div");
      dd.className = "spec-value";
      dd.textContent = pair[1];
      wrap.appendChild(dt);
      wrap.appendChild(dd);
    });
  }

  // ---- custom orbit controls ----
  var target = new THREE.Vector3(0, 0.2, 0);
  var spherical = new THREE.Spherical(9, THREE.MathUtils.degToRad(80), THREE.MathUtils.degToRad(24));
  var targetSpherical = spherical.clone();
  var minRadius = 4, maxRadius = 30;
  var autoRotate = !reduceMotion;
  var dragging = false;
  var lastX = 0, lastY = 0;
  var pinchDist = null;

  function clampSpherical(s) {
    s.phi = THREE.MathUtils.clamp(s.phi, THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(92));
    s.radius = THREE.MathUtils.clamp(s.radius, minRadius, maxRadius);
    return s;
  }

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", function (e) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX;
    var dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    targetSpherical.theta -= dx * 0.0065;
    targetSpherical.phi -= dy * 0.0065;
    clampSpherical(targetSpherical);
  });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    targetSpherical.radius += e.deltaY * 0.01 * (targetSpherical.radius * 0.05 + 0.3);
    clampSpherical(targetSpherical);
  }, { passive: false });

  document.getElementById("btn-autorotate").addEventListener("click", function () {
    autoRotate = !autoRotate;
    this.classList.toggle("is-on", autoRotate);
  });
  document.getElementById("btn-reset").addEventListener("click", function () {
    targetSpherical.theta = THREE.MathUtils.degToRad(24);
    targetSpherical.phi = THREE.MathUtils.degToRad(80);
    if (current && current.sphere) targetSpherical.radius = fitDistance(current.sphere.radius);
  });

  document.querySelectorAll(".type-card").forEach(function (el) {
    el.addEventListener("click", function () {
      setType(el.getAttribute("data-type"));
    });
  });

  function resize() {
    var wrap = document.getElementById("stage");
    var w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  var clock = new THREE.Clock();
  var visible = true;
  document.addEventListener("visibilitychange", function () {
    visible = document.visibilityState === "visible";
  });

  function animate() {
    requestAnimationFrame(animate);
    if (!visible) return;
    var dt = clock.getDelta();
    var t = clock.elapsedTime * 1000;

    if (autoRotate && !dragging) {
      targetSpherical.theta += dt * 0.12;
    }

    spherical.theta += (targetSpherical.theta - spherical.theta) * Math.min(1, dt * 5);
    spherical.phi += (targetSpherical.phi - spherical.phi) * Math.min(1, dt * 5);
    spherical.radius += (targetSpherical.radius - spherical.radius) * Math.min(1, dt * 5);

    var pos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    camera.position.copy(pos);
    camera.lookAt(target);

    if (currentContent && !reduceMotion) currentContent.draw(t);
    else if (currentContent && !currentContent.__drawnOnce) {
      currentContent.draw(0);
      currentContent.__drawnOnce = true;
    }

    renderer.render(scene, camera);
  }

  resize();
  setType("indoor");
  animate();
})();
