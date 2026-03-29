/**
 * Three.js 3D Scene — MOEX/OI Analyst
 * Neon grid + floating particles + animated logo geometry
 */
import * as THREE from 'three';

const canvas = document.getElementById('bg-canvas');
if (!canvas) throw new Error('Canvas not found');

// ── Renderer ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  // Main horizontal grid
  const gridHelper = new THREE.GridHelper(80, 40, C_CYAN, C_BLUE);
  gridHelper.position.y = -8;
  const gridMat = gridHelper.material;
  if (Array.isArray(gridMat)) {
    gridMat.forEach(m => { m.transparent = true; m.opacity = 0.4; });
  } else {
    gridMat.transparent = true;
    gridMat.opacity = 0.4;
  }
  group.add(gridHelper);

  // Perspective grid lines (converging to horizon)
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

  return group;
}

const neonGrid = createNeonGrid();
scene.add(neonGrid);

// ── FLOATING PARTICLES ────────────────────────────────────────
function createParticles() {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 80;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

    // Mix cyan / magenta / green
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
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
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

  const ringConfigs = [
    { radius: 5, tube: 0.04, color: C_CYAN,    pos: [4, 2, -5],  rot: [0.5, 0, 0.3] },
    { radius: 3, tube: 0.03, color: C_MAGENTA, pos: [-6, 0, -8], rot: [1.2, 0.5, 0] },
    { radius: 4, tube: 0.035, color: C_GREEN,  pos: [8, -3, -6], rot: [0.3, 1, 0.2] },
  ];

  ringConfigs.forEach(cfg => {
    const geo = new THREE.TorusGeometry(cfg.radius, cfg.tube, 32, 128);
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
const icoGeo = new THREE.IcosahedronGeometry(3, 1);
const icoMat = new THREE.MeshBasicMaterial({
  color: C_CYAN,
  wireframe: true,
  transparent: true,
  opacity: 0.15,
});
const icosahedron = new THREE.Mesh(icoGeo, icoMat);
icosahedron.position.set(-12, 3, -10);
scene.add(icosahedron);

// ── DATA BARS (OI histogram visualization) ────────────────────
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

const dataBars = createDataBars();
scene.add(dataBars);

// ── AMBIENT & FOG ─────────────────────────────────────────────
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

// ── MOUSE PARALLAX ────────────────────────────────────────────
const mouse = new THREE.Vector2(0, 0);
const targetMouse = new THREE.Vector2(0, 0);

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
}, { passive: true });

// ── RESIZE ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}, { passive: true });

// ── ANIMATION LOOP ────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Smooth mouse follow
  targetMouse.x += (mouse.x - targetMouse.x) * 0.05;
  targetMouse.y += (mouse.y - targetMouse.y) * 0.05;

  // Camera gentle drift
  camera.position.x = targetMouse.x * 3;
  camera.position.y = 8 + targetMouse.y * 2;
  camera.lookAt(0, 0, 0);

  // Grid slow scroll (moving forward effect)
  neonGrid.position.z = (t * 2) % 2;

  // Particle drift
  particles.rotation.y = t * 0.02;
  particles.rotation.x = Math.sin(t * 0.01) * 0.05;

  // Rings rotation
  rings.children.forEach((ring, i) => {
    ring.rotation.x += 0.003 * (i % 2 === 0 ? 1 : -1);
    ring.rotation.y += 0.005 * (i + 1);
    ring.rotation.z += 0.002;
    // Pulse opacity
    ring.material.opacity = 0.4 + Math.sin(t * 1.5 + i) * 0.2;
  });

  // Icosahedron rotation
  icosahedron.rotation.x = t * 0.2;
  icosahedron.rotation.y = t * 0.3;

  // Data bars pulse
  dataBars.children.forEach((bar, i) => {
    const scale = 1 + Math.sin(t * 2 + i * 0.5) * 0.3;
    bar.scale.y = scale;
    bar.position.y = -8 + (bar.geometry.parameters.height * scale) / 2;
  });

  renderer.render(scene, camera);
}

animate();
