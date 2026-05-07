// index.js
let leapCloneBoost = 1;
let leapMaxClones = 1;
let leapDriftBoost = 1;
let leapColorBoost = false;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const css = getComputedStyle(document.documentElement);

const CSS_COLORS = [
  css.getPropertyValue("--glow-white").trim(),
  css.getPropertyValue("--glow-blue").trim(),
  css.getPropertyValue("--glow-purple").trim(),
  css.getPropertyValue("--glow-cyan").trim()
];

const SCANLINE_COLOR =
  css.getPropertyValue("--scanline-color").trim();

const SHADOW_COLOR =
  css.getPropertyValue("--shadow-color").trim();

const CENTER_LIGHT =
  css.getPropertyValue("--center-light").trim();

const MIDDLE_LIGHT =
  css.getPropertyValue("--middle-light").trim();

const OUTER_LIGHT =
  css.getPropertyValue("--outer-light").trim();

const clones = [];

const CLONE_INTERVAL = 60;
let MAX_CLONES = 1;
const MOTION_THRESHOLD = 35;

let cloneTimerStarted = false;
let previousFrame = null;
let latestBodyFrame = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resize();

window.addEventListener("resize", resize);

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

function createMotionClone(frameCanvas, color) {

  const w = canvas.width;
  const h = canvas.height;

  const temp = document.createElement("canvas");

  temp.width = w;
  temp.height = h;

  const tctx =
    temp.getContext("2d", { willReadFrequently: true });

  tctx.drawImage(frameCanvas, 0, 0);

  const current =
    tctx.getImageData(0, 0, w, h);

  if (!previousFrame) {
    previousFrame = current;
    return null;
  }

  const output =
    tctx.createImageData(w, h);

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

    if (a1 > 20 && diff > MOTION_THRESHOLD) {

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

  const randomColor =
    CSS_COLORS[
      Math.floor(Math.random() * CSS_COLORS.length)
    ];

  const [r, g, b] =
    randomColor.split(",").map(Number);

  const cloneImage =
    createMotionClone(
      latestBodyFrame,
      { r, g, b }
    );

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

async function segmentationLoop() {

  if (video.readyState >= 2) {
    await segmentation.send({ image: video });
  }

  requestAnimationFrame(segmentationLoop);
}

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

  glow.addColorStop(0, CENTER_LIGHT);
  glow.addColorStop(0.35, MIDDLE_LIGHT);
  glow.addColorStop(1, OUTER_LIGHT);

  ctx.fillStyle = glow;

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.restore();
}

function drawScanlines() {

  ctx.save();

  ctx.fillStyle = SCANLINE_COLOR;

  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  ctx.restore();
}

function render() {

  // transparent canvas
  // css background visible
  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  draw3DLight();

  for (let i = clones.length - 1; i >= 0; i--) {

    const clone = clones[i];

    clone.age += 0.03;

    if (clone.age >= 1) {
      clones.splice(i, 1);
      continue;
    }

    const alpha =
      Math.pow(1 - clone.age, 2.1);

    const depthScale =
      0.9 + clone.depth * 0.35;

    const spacing =
      i * 18 * clone.direction;

  const drift =
    clone.age * 320 * clone.direction * leapDriftBoost;

    ctx.save();

    ctx.globalCompositeOperation = "lighter";

    ctx.globalAlpha = alpha;

    ctx.translate(
      canvas.width / 2,
      canvas.height / 2
    );

    ctx.rotate(
      clone.rotation * clone.age * 3
    );

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
      drop-shadow(0 0 24px ${SHADOW_COLOR})
    `;

    ctx.drawImage(clone.image, 0, 0);

    ctx.restore();
  }

  drawScanlines();

  requestAnimationFrame(render);
}

video.addEventListener("playing", () => {

  if (!cloneTimerStarted) {

    cloneTimerStarted = true;

    segmentationLoop();

    setInterval(
      captureClone,
      CLONE_INTERVAL
    );

    render();
  }
});

const box = document.getElementById("box");

if (window.leapMotion) {
  window.leapMotion.start((hand) => {
    // Hand higher = more clones
    leapMaxClones = Math.min(
      8,
      Math.max(1, Math.floor((hand.palmY - 100) / 35))
    );

    MAX_CLONES = leapMaxClones;

    // Hand closer/farther controls clone interval feel
    leapCloneBoost = Math.max(
      0.4,
      Math.min(2.5, hand.palmZ / 80)
    );

    // Pinch = stronger clone movement
    leapDriftBoost = hand.pinch > 0.7 ? 2.2 : 1;

    // Grab = intense mode
    leapColorBoost = hand.grab > 0.7;

    console.log({
      clones: MAX_CLONES,
      drift: leapDriftBoost,
      intense: leapColorBoost
    });
  });
}