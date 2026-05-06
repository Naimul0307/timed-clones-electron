const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const clones = [];

const CLONE_INTERVAL = 300;
const MAX_CLONES = 1;
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
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

segmentation.setOptions({
  modelSelection: 1
});

segmentation.onResults((results) => {
  const bodyCanvas = document.createElement("canvas");
  bodyCanvas.width = canvas.width;
  bodyCanvas.height = canvas.height;

  const bctx = bodyCanvas.getContext("2d");

  bctx.save();
  bctx.translate(canvas.width, 0);
  bctx.scale(-1, 1);

  bctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

  bctx.globalCompositeOperation = "source-in";
  bctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  bctx.restore();

  latestBodyFrame = bodyCanvas;
});

function createMotionClone(frameCanvas, color) {
  const w = canvas.width;
  const h = canvas.height;

  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;

  const tctx = temp.getContext("2d", { willReadFrequently: true });
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

  const colors = [
    { r: 255, g: 0, b: 0 },
    { r: 255, g: 40, b: 80 },
    { r: 130, g: 70, b: 255 },
    { r: 255, g: 120, b: 170 }
  ];

  const cloneImage = createMotionClone(
    latestBodyFrame,
    colors[Math.floor(Math.random() * colors.length)]
  );

  if (!cloneImage) return;

  clones.push({
    image: cloneImage,
    age: 0,
    direction: Math.random() > 0.5 ? 1 : -1,
    offsetY: Math.random() * 30 - 15,
    rotation: Math.random() * 0.04 - 0.02
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

function drawScanlines() {
  ctx.fillStyle = "rgba(255,255,255,0.03)";

  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // hide camera view
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // smooth motion clones
  for (let i = clones.length - 1; i >= 0; i--) {
    const clone = clones[i];

    clone.age += 0.018;

    if (clone.age >= 1) {
      clones.splice(i, 1);
      continue;
    }

    const alpha = Math.pow(1 - clone.age, 2.2);
    const spacing = i * 22 * clone.direction;
    const drift = clone.age * 130 * clone.direction;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(clone.rotation * clone.age);
    ctx.scale(1 + clone.age * 0.05, 1 + clone.age * 0.05);

    ctx.translate(
      -canvas.width / 2 + spacing + drift,
      -canvas.height / 2 + clone.offsetY
    );

    ctx.filter = `blur(${clone.age * 1.2}px) saturate(160%)`;
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
    setInterval(captureClone, CLONE_INTERVAL);
    render();
  }
});