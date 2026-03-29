/**
 * Three.js 3D Scene — MOEX/OI Analyst
 * Neon grid + floating particles + animated logo geometry
 */
import * as THREE from 'three';

const canvas = document.getElementById('bg-canvas');
if (!canvas) throw new Error('Canvas not found');

// ── Mobile detection ─────────────────────────────────────────
const IS_MOBILE = window.innerWidth <= 768 ||
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// On low-end mobile — skip Three.js entirely to preserve battery/perf
const IS_LOW_END = IS_MOBILE && (
  navigator.hardwareConcurrency <= 4 ||
  // Devices with < 4GB RAM via navigator.deviceMemory (if available)
  (navigator.deviceMemory && navigator.deviceMemory < 4)
);

if (IS_LOW_END) {
  // Just hide canvas and stop — CSS background handles the dark BG
  canvas.style.display = 'none';
  throw new Error('Low-end mobile: Three.js skipped');
}

// ── Renderer ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !IS_MOBILE,
  alpha: true,
  powerPreference: IS_MOBILE ? 'low-power' : 'high-performance',
});
renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

// ── Scene & Camera ────────────────────────────────────────────
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 25);
camera.lookAt(0, 0, 0);

// ── Colors ────────────────────────────────────────────────────
const C_CYAN    = new THREE.Color(0x00ffff);
const C_MAGENTA = new THREE.Color(0xff00ff);
const C_BLUE    = new THREE.Color(0x0033aa);
const C_GREEN   = new THREE.Color(0x00ff88);

// ── NEON GRID ─────────────────────────────────────────────────
function createNeonGrid() {
  const group = new THREE.Group();

  const gridDiv  = IS_MOBILE ? 20 : 40;
  const gridSize = IS_MOBILE ? 60 : 80;

  const gridHelper = new THREE.GridHelper(gridSize, gridDiv, C_CYAN, C_BLUE);
  gridHelper.position.y = -8;
  const gridMat = gridHelper.material;
  if (Array.isArray(gridMat)) {
    gridMat.forEach(m => { m.transparent = true; m.opacity = IS_MOBILE ? 0.25 : 0.4; });
  } else {
    gridMat.transparent = true;
    gridMat.opacity = IS_MOBILE ? 0.25 : 0.4;
  }
  group.add(gridHelper);

  if (!IS_MOBILE) {
    // Perspective grid lines (converging to horizon) — skip on mobile
    const lineGeo = new THREE.BufferGeometry();
    const vertices = [];
    const lineCount = 20;
    for (let i = 0; i <= lineCount; i++) {
      const x = (i / lineCount - 0.5) * 80;
      vertices.push(x, -8, -60,  x, -8, 20);
    }
    for (let j = 0; j <= 15; j++) {
      const z = -60 + (j / 15) * 80;
      vertices.push(-40, -8, z,  40, -8, z);
    }
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: C_CYAN,
      transparent: true,
      opacity: 0.15,
    });
    group.add(new THREE.LineSegments(lineGeo, lineMat));
  }

  return group;
}

const neonGrid = createNeonGrid();
scene.add(neonGrid);

// ── FLOATING PARTICLES ────────────────────────────────────────
function createParticles() {
  const count = IS_MOBILE ? 200 : 800;
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * (IS_MOBILE ? 50 : 80);
    positions[i * 3 + 1] = (Math.random() - 0.5) * (IS_MOBILE ? 30 : 50);
    positions[i * 3 + 2] = (Math.random() - 0.5) * (IS_MOBILE ? 40 : 60);

    const r = Math.random();
    const col = r < 0.5 ? C_CYAN : r < 0.8 ? C_MAGENTA : C_GREEN;
    colors[i * 3]     = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    sizes[i] = Math.random() * 2 + 0.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: IS_MOBILE ? 0.2 : 0.15,
    vertexColors: true,
    transparent: true,
    opacity: IS_MOBILE ? 0.5 : 0.7,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}

const particles = createParticles();
scene.add(particles);

// ── FLOATING RINGS (OI indicator) ────────────────────────────
function createRings() {
  const group = new THREE.Group();

  const ringConfigs = IS_MOBILE
    ? [
        { radius: 5, tube: 0.04, color: C_CYAN, pos: [4, 2, -5], rot: [0.5, 0, 0.3] },
      ]
    : [
        { radius: 5, tube: 0.04, color: C_CYAN,    pos: [4, 2, -5],  rot: [0.5, 0, 0.3] },
        { radius: 3, tube: 0.03, color: C_MAGENTA, pos: [-6, 0, -8], rot: [1.2, 0.5, 0] },
        { radius: 4, tube: 0.035, color: C_GREEN,  pos: [8, -3, -6], rot: [0.3, 1, 0.2] },
      ];

  const segDetail = IS_MOBILE ? 16 : 32;
  const tubeSeg   = IS_MOBILE ? 64 : 128;

  ringConfigs.forEach(cfg => {
    const geo = new THREE.TorusGeometry(cfg.radius, cfg.tube, segDetail, tubeSeg);
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...cfg.pos);
    mesh.rotation.set(...cfg.rot);
    group.add(mesh);
  });

  return group;
}

const rings = createRings();
scene.add(rings);

// ── WIREFRAME ICOSAHEDRON (финансовый глобус) ─────────────────
const icoGeo = new THREE.IcosahedronGeometry(3, IS_MOBILE ? 0 : 1);
const icoMat = new THREE.MeshBasicMaterial({
  color: C_CYAN,
  wireframe: true,
  transparent: true,
  opacity: IS_MOBILE ? 0.1 : 0.15,
});
const icosahedron = new THREE.Mesh(icoGeo, icoMat);
icosahedron.position.set(-12, 3, -10);
scene.add(icosahedron);

// ── DATA BARS (OI histogram) — desktop only ───────────────────
let dataBars = null;
if (!IS_MOBILE) {
  function createDataBars() {
    const group = new THREE.Group();
    const barCount = 16;
    for (let i = 0; i < barCount; i++) {
      const height = Math.random() * 4 + 0.5;
      const geo = new THREE.BoxGeometry(0.3, height, 0.3);
      const hue = i / barCount;
      const col = new THREE.Color().setHSL(0.5 + hue * 0.15, 1, 0.5);
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        wireframe: true,
      });
      const bar = new THREE.Mesh(geo, mat);
      bar.position.set((i - barCount / 2) * 0.8, -8 + height / 2, -15);
      group.add(bar);
    }
    return group;
  }
  dataBars = createDataBars();
  scene.add(dataBars);
}

// ── AMBIENT & FOG ─────────────────────────────────────────────
scene.fog = new THREE.FogExp2(0x0a0a1a, IS_MOBILE ? 0.02 : 0.015);

// ── MOUSE / GYRO PARALLAX ─────────────────────────────────────
const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);

if (!IS_MOBILE) {
  window.addEventListener('mousemove', e => {
    mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
} else {
  // Light gyro parallax on mobile
  window.addEventListener('deviceorientation', e => {
    if (e.beta !== null && e.gamma !== null) {
      mouse.x = Math.max(-1, Math.min(1, e.gamma / 30));
      mouse.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }
  }, { passive: true });
}

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}, { passive: true });

// ── ANIMATION LOOP ────────────────────────────────────────────
const clock = new THREE.Clock();

// Throttle to ~30fps on mobile to save battery
let lastTime = 0;
const FPS_LIMIT = IS_MOBILE ? 1000 / 30 : 0;

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (IS_MOBILE && now - lastTime < FPS_LIMIT) return;
  lastTime = now;

  const t = clock.getElapsedTime();

  // Smooth mouse follow
  targetMouse.x += (mouse.x - targetMouse.x) * 0.05;
  targetMouse.y += (mouse.y - targetMouse.y) * 0.05;

  // Camera gentle drift
  camera.position.x = targetMouse.x * (IS_MOBILE ? 1.5 : 3);
  camera.position.y = 8 + targetMouse.y * 2;
  camera.lookAt(0, 0, 0);

  // Grid slow scroll
  neonGrid.position.z = (t * 2) % 2;

  // Particle drift
  particles.rotation.y = t * (IS_MOBILE ? 0.01 : 0.02);
  particles.rotation.x = Math.sin(t * 0.01) * 0.05;

  // Rings rotation
  rings.children.forEach((ring, i) => {
    ring.rotation.x += 0.003 * (i % 2 === 0 ? 1 : -1);
    ring.rotation.y += IS_MOBILE ? 0.003 * (i + 1) : 0.005 * (i + 1);
    ring.rotation.z += 0.002;
    ring.material.opacity = 0.4 + Math.sin(t * 1.5 + i) * 0.2;
  });

  // Icosahedron rotation
  icosahedron.rotation.x = t * 0.2;
  icosahedron.rotation.y = t * 0.3;

  // Data bars pulse (desktop only)
  if (dataBars) {
    dataBars.children.forEach((bar, i) => {
      const scale = 1 + Math.sin(t * 2 + i * 0.5) * 0.3;
      bar.scale.y = scale;
      bar.position.y = -8 + (bar.geometry.parameters.height * scale) / 2;
    });
  }

  renderer.render(scene, camera);
}

animate();
