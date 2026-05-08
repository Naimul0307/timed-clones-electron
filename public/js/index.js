// index.js

let visualSettings = {
  leapCloneBoost: 1,
  leapMaxClones: 1,
  leapDriftBoost: 1,
  leapColorBoost: false,

  cloneInterval: 60,
  maxClones: 1,
  motionThreshold: 35,

  snapshotMotionLimit: 25,
  maxSnapshots: 5
};

let leapCloneBoost = visualSettings.leapCloneBoost;
let leapMaxClones = visualSettings.leapMaxClones;
let leapDriftBoost = visualSettings.leapDriftBoost;
let leapColorBoost = visualSettings.leapColorBoost;

let MAX_CLONES = visualSettings.maxClones;
let cloneTimer = null;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const clones = [];
const snapshots = [];

let cloneTimerStarted = false;
let previousFrame = null;
let latestBodyFrame = null;

let lastSnapshotTime = 0;
let lastLeapX = 0;
let lastLeapY = 0;
let lastLeapZ = 0;

/* ---------------- CSS HELPERS ---------------- */

function getCssValue(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function getCssColors() {
  return [
    getCssValue("--glow-white"),
    getCssValue("--glow-blue"),
    getCssValue("--glow-purple"),
    getCssValue("--glow-cyan")
  ];
}

/* ---------------- VISUAL SETTINGS ---------------- */

async function loadVisualSettings() {
  if (!window.electron) return;

  const result = await window.electron.invoke("get-visual-settings");

  if (!result?.success) return;

  applyVisualSettings(result.settings);
}

function applyVisualSettings(settings) {
  visualSettings = {
    ...visualSettings,
    ...settings
  };

  leapCloneBoost = Number(visualSettings.leapCloneBoost);
  leapMaxClones = Number(visualSettings.leapMaxClones);
  leapDriftBoost = Number(visualSettings.leapDriftBoost);
  leapColorBoost = Boolean(visualSettings.leapColorBoost);

  MAX_CLONES = Number(visualSettings.maxClones);
}

window.electron?.on("visual-settings-updated", (settings) => {
  applyVisualSettings(settings);

  if (cloneTimer) {
    clearInterval(cloneTimer);

    cloneTimer = setInterval(
      captureClone,
      Number(visualSettings.cloneInterval)
    );
  }
});

window.electron?.on("reload-css", () => {
  document
    .querySelectorAll('link[rel="stylesheet"]')
    .forEach((link) => {
      const href = link.getAttribute("href").split("?")[0];
      link.setAttribute("href", `${href}?v=${Date.now()}`);
    });
});

loadVisualSettings();

/* ---------------- CANVAS ---------------- */

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resize();

window.addEventListener("resize", resize);

/* ---------------- CAMERA ---------------- */

navigator.mediaDevices
  .getUserMedia({
    video: {
      width: 1280,
      height: 720,
      frameRate: 60,
      facingMode: "user"
    },
    audio: false
  })
  .then((stream) => {
    video.srcObject = stream;
    video.play();
  })
  .catch((err) => {
    alert("Camera permission denied or webcam not found.");
    console.error(err);
  });

/* ---------------- SELFIE SEGMENTATION ---------------- */

const segmentation = new SelfieSegmentation({
  locateFile: (file) => `../js/${file}`
});

segmentation.setOptions({
  modelSelection: 1,
  selfieMode: true
});

segmentation.onResults((results) => {
  const bodyCanvas = document.createElement("canvas");

  bodyCanvas.width = canvas.width;
  bodyCanvas.height = canvas.height;

  const bctx = bodyCanvas.getContext("2d");

  bctx.save();
  bctx.translate(canvas.width, 0);
  bctx.scale(-1, 1);

  bctx.drawImage(
    results.segmentationMask,
    0,
    0,
    canvas.width,
    canvas.height
  );

  bctx.globalCompositeOperation = "source-in";

  bctx.drawImage(
    results.image,
    0,
    0,
    canvas.width,
    canvas.height
  );

  bctx.restore();

  latestBodyFrame = bodyCanvas;
});

/* ---------------- MOTION CLONE ---------------- */

function createMotionClone(frameCanvas, color) {
  const w = canvas.width;
  const h = canvas.height;

  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;

  const tctx = temp.getContext("2d", {
    willReadFrequently: true
  });

  tctx.drawImage(frameCanvas, 0, 0);

  const current = tctx.getImageData(0, 0, w, h);

  if (!previousFrame) {
    previousFrame = current;
    return null;
  }

  const output = tctx.createImageData(w, h);

  for (let i = 0; i < current.data.length; i += 4) {
    const a1 = current.data[i + 3];
    const a2 = previousFrame.data[i + 3];

    const r1 = current.data[i];
    const g1 = current.data[i + 1];
    const b1 = current.data[i + 2];

    const r2 = previousFrame.data[i];
    const g2 = previousFrame.data[i + 1];
    const b2 = previousFrame.data[i + 2];

    const diff =
      Math.abs(r1 - r2) +
      Math.abs(g1 - g2) +
      Math.abs(b1 - b2) +
      Math.abs(a1 - a2) * 2;

    if (
      a1 > 20 &&
      diff > Number(visualSettings.motionThreshold)
    ) {
      output.data[i] = color.r;
      output.data[i + 1] = color.g;
      output.data[i + 2] = color.b;
      output.data[i + 3] = 230;
    } else {
      output.data[i + 3] = 0;
    }
  }

  previousFrame = current;

  tctx.clearRect(0, 0, w, h);
  tctx.putImageData(output, 0, 0);

  return temp;
}

function captureClone() {
  if (!latestBodyFrame) return;

  const cssColors = getCssColors();

  const randomColor =
    cssColors[Math.floor(Math.random() * cssColors.length)];

  const [r, g, b] = randomColor
    .split(",")
    .map((value) => Number(value.trim()));

  const cloneImage = createMotionClone(latestBodyFrame, {
    r,
    g,
    b
  });

  if (!cloneImage) return;

  clones.push({
    image: cloneImage,
    age: 0,
    direction: Math.random() > 0.5 ? 1 : -1,
    offsetY: Math.random() * 45 - 22,
    offsetX: Math.random() * 60 - 30,
    rotation: Math.random() * 0.08 - 0.04,
    depth: Math.random()
  });

  while (clones.length > MAX_CLONES) {
    clones.shift();
  }
}

/* ---------------- SNAPSHOT ---------------- */

function getBodyCenter(frameCanvas) {
  const w = frameCanvas.width;
  const h = frameCanvas.height;

  const tempCtx = frameCanvas.getContext("2d", {
    willReadFrequently: true
  });

  const data = tempCtx.getImageData(0, 0, w, h).data;

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3];

      if (alpha > 40) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        found = true;
      }
    }
  }

  if (!found) {
    return {
      x: canvas.width / 2,
      y: canvas.height / 2
    };
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
}

function captureSnapshot() {
  if (!latestBodyFrame) return;

  const center = getBodyCenter(latestBodyFrame);

  const shot = document.createElement("canvas");
  shot.width = canvas.width;
  shot.height = canvas.height;

  const sctx = shot.getContext("2d");

  sctx.drawImage(latestBodyFrame, 0, 0);

  snapshots.push({
    image: shot,
    age: 0,

    x: center.x,
    y: center.y,

    driftX: Math.random() * 40 - 20,
    driftY: -80 - Math.random() * 80,

    scale: 1,
    rotation: Math.random() * 0.08 - 0.04,
    depth: Math.random() * 0.35
  });

  while (
    snapshots.length >
    Number(visualSettings.maxSnapshots)
  ) {
    snapshots.shift();
  }
}

/* ---------------- LOOP ---------------- */

async function segmentationLoop() {
  if (video.readyState >= 2) {
    await segmentation.send({
      image: video
    });
  }

  requestAnimationFrame(segmentationLoop);
}

/* ---------------- DRAWING ---------------- */

function draw3DLight() {
  ctx.save();

  ctx.globalCompositeOperation = "screen";

  const glow = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    50,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.65
  );

  glow.addColorStop(0, getCssValue("--center-light"));
  glow.addColorStop(0.35, getCssValue("--middle-light"));
  glow.addColorStop(1, getCssValue("--outer-light"));

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.restore();
}

function drawSnapshots() {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snap = snapshots[i];

    snap.age += 0.018;

    if (snap.age >= 1) {
      snapshots.splice(i, 1);
      continue;
    }

    const smoke = snap.age;
    const alpha = Math.pow(1 - smoke, 2);

    const smokeX = snap.driftX * smoke;
    const smokeY = snap.driftY * smoke;

    const depthScale =
      0.85 + snap.depth + smoke * 0.25;

    ctx.save();

    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "screen";

    ctx.translate(
      snap.x + smokeX,
      snap.y + smokeY
    );

    ctx.rotate(snap.rotation * smoke * 8);
    ctx.scale(depthScale, depthScale);

    ctx.filter = `
      blur(${smoke * 18}px)
      brightness(${leapColorBoost ? 3.2 : 2})
      contrast(${1.2 + smoke * 0.5})
      saturate(${170 + smoke * 120}%)
      drop-shadow(0 0 ${40 + smoke * 80}px ${getCssValue("--shadow-color")})
    `;

    ctx.drawImage(
      snap.image,
      -snap.x,
      -snap.y
    );

    ctx.restore();
  }
}

function drawScanlines() {
  ctx.save();

  ctx.fillStyle = getCssValue("--scanline-color");

  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  draw3DLight();
  drawSnapshots();

  for (let i = clones.length - 1; i >= 0; i--) {
    const clone = clones[i];

    clone.age += 0.03;

    if (clone.age >= 1) {
      clones.splice(i, 1);
      continue;
    }

    const alpha = Math.pow(1 - clone.age, 2.1);
    const depthScale = 0.9 + clone.depth * 0.35;
    const spacing = i * 18 * clone.direction;

    const drift =
      clone.age *
      320 *
      clone.direction *
      leapDriftBoost;

    ctx.save();

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;

    ctx.translate(
      canvas.width / 2,
      canvas.height / 2
    );

    ctx.rotate(clone.rotation * clone.age * 3);

    ctx.scale(
      depthScale + clone.age * 0.35,
      depthScale + clone.age * 0.35
    );

    ctx.translate(
      -canvas.width / 2 +
        spacing +
        drift +
        clone.offsetX,
      -canvas.height / 2 +
        clone.offsetY -
        clone.age * 45
    );

    ctx.filter = `
      blur(${clone.age * 5}px)
      brightness(${leapColorBoost ? 3.5 : 2})
      contrast(1.3)
      saturate(190%)
      drop-shadow(0 0 24px ${getCssValue("--shadow-color")})
    `;

    ctx.drawImage(clone.image, 0, 0);

    ctx.restore();
  }

  drawScanlines();

  requestAnimationFrame(render);
}

/* ---------------- START ---------------- */

video.addEventListener("playing", () => {
  if (!cloneTimerStarted) {
    cloneTimerStarted = true;

    segmentationLoop();

    cloneTimer = setInterval(
      captureClone,
      Number(visualSettings.cloneInterval)
    );

    render();
  }
});

/* ---------------- LEAP MOTION ---------------- */

if (window.leapMotion) {
  window.leapMotion.start((hand) => {
    const handCloneCount = Math.min(
      Number(visualSettings.maxClones),
      Math.max(1, Math.floor((hand.palmY - 100) / 35))
    );

    leapMaxClones = handCloneCount;

    MAX_CLONES = handCloneCount;

    leapCloneBoost =
      Math.max(
        0.4,
        Math.min(2.5, Math.abs(hand.palmZ) / 80)
      ) * Number(visualSettings.leapCloneBoost);

    leapDriftBoost =
      (hand.pinch > 0.7 ? 2.2 : 1) *
      Number(visualSettings.leapDriftBoost);

    leapColorBoost =
      Boolean(visualSettings.leapColorBoost) ||
      hand.grab > 0.7;

    const movement =
      Math.abs(hand.palmX - lastLeapX) +
      Math.abs(hand.palmY - lastLeapY) +
      Math.abs(hand.palmZ - lastLeapZ);

    const now = Date.now();

    if (
      movement >
        Number(visualSettings.snapshotMotionLimit) &&
      now - lastSnapshotTime > 120
    ) {
      captureSnapshot();
      lastSnapshotTime = now;
    }

    lastLeapX = hand.palmX;
    lastLeapY = hand.palmY;
    lastLeapZ = hand.palmZ;
  });
} else {
  console.error(
    "Leap Motion API not loaded. Check preload.js."
  );
}