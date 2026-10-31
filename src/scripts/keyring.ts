import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Charm = { title: string; year: number; href: string; color: string; shape: string };

type Pendulum = {
  charm: Charm;
  pivot: THREE.Group;     // positioned on the ring, swings
  spinner: THREE.Group;   // twists around the chain axis
  meshes: THREE.Mesh[];
  materials: THREE.MeshPhysicalMaterial[];
  L: number;
  tx: number; vx: number; // swing towards/away from camera
  tz: number; vz: number; // swing left/right
  phi: number; vphi: number; // twist
  phase: number;
};

const G = 30;
const DAMP = 0.9;
const TWIST_K = 4;
const TWIST_DAMP = 1.2;

const metal = () =>
  new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.22 });

function charmGeometry(shape: string): { geo: THREE.BufferGeometry; half: number; face: number | null } {
  switch (shape) {
    case 'diamond': {
      const g = new THREE.OctahedronGeometry(0.62, 0);
      g.scale(0.9, 1.3, 0.55);
      return { geo: g, half: 0.8, face: null };
    }
    case 'capsule': {
      const g = new THREE.CapsuleGeometry(0.3, 0.62, 10, 28);
      return { geo: g, half: 0.62, face: null };
    }
    case 'tag': {
      const w = 0.82, h = 1.15, r = 0.18;
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -h / 2);
      s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const hole = new THREE.Path(); hole.absarc(0, h / 2 - 0.16, 0.07, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
      g.translate(0, 0, -0.03);
      return { geo: g, half: h / 2 - 0.16, face: 0.055 };
    }
    case 'hex': {
      const s = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const p = [Math.cos(a) * 0.6, Math.sin(a) * 0.6] as const;
        i === 0 ? s.moveTo(...p) : s.lineTo(...p);
      }
      const hole = new THREE.Path(); hole.absarc(0, 0.38, 0.07, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3 });
      g.translate(0, 0, -0.07);
      return { geo: g, half: 0.38, face: 0.1 };
    }
    case 'coin':
    default: {
      const g = new THREE.CylinderGeometry(0.56, 0.56, 0.09, 72);
      g.rotateX(Math.PI / 2);
      return { geo: g, half: 0.56, face: 0.05 };
    }
  }
}

function faceTexture(c: Charm, shape: string) {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(246,246,243,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = c.title.toLowerCase();
  const words = title.split(' ');
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 9) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  const maxW = shape === 'coin' ? 340 : 380;
  let fs = 80;
  ctx.font = `${fs}px Michroma, sans-serif`;
  const widest = () => Math.max(...lines.map((l) => ctx.measureText(l).width));
  while (widest() > maxW && fs > 34) { fs -= 2; ctx.font = `${fs}px Michroma, sans-serif`; }
  const lh = fs * 1.15;
  const cy = size / 2 + (shape === 'tag' ? 20 : shape === 'hex' ? -10 : 0);
  lines.forEach((l, i) => ctx.fillText(l, size / 2, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.font = `36px "Instrument Sans", sans-serif`;
  ctx.fillStyle = 'rgba(246,246,243,0.65)';
  ctx.fillText(String(c.year), size / 2, cy + ((lines.length + 1) / 2) * lh + 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function mountKeyring(
  canvas: HTMLCanvasElement,
  charms: Charm[],
  opts: { onHover?: (c: Charm | null) => void; reduced?: boolean } = {}
) {
  try { await document.fonts.load('40px Michroma'); } catch {}

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.6, 16);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 8);
  scene.add(key);

  const rig = new THREE.Group();
  scene.add(rig);
  const RING_Y = 2.8;
  const R = 2.0;
  const TILT = -1.18;

  // Ring
  const ringMat = metal();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.075, 28, 160), ringMat);
  ring.rotation.x = TILT;
  ring.position.y = RING_Y;
  rig.add(ring);

  const ringPoint = (deg: number) => {
    const a = THREE.MathUtils.degToRad(deg);
    const v = new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0);
    v.applyAxisAngle(new THREE.Vector3(1, 0, 0), TILT);
    v.y += RING_Y;
    return v;
  };

  // Chain helper
  const linkGeo = new THREE.TorusGeometry(0.075, 0.019, 10, 24);
  linkGeo.scale(1, 1.45, 1);
  const linkMat = metal();
  const chain = (parent: THREE.Object3D, from: number, to: number, step = 0.15) => {
    let i = 0;
    for (let y = from; y > to; y -= step, i++) {
      const l = new THREE.Mesh(linkGeo, linkMat);
      l.position.y = y - step / 2;
      l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      parent.add(l);
    }
  };

  // Lanyard chain from the back of the ring up out of frame
  const top = ringPoint(90);
  const lanyard = new THREE.Group();
  lanyard.position.copy(top);
  chain(lanyard, 9, 0, 0.17);
  rig.add(lanyard);

  // Charms
  const lengths = [1.1, 1.9, 1.4, 2.15, 1.25, 1.75, 1.55, 2.0];
  const pendulums: Pendulum[] = [];
  const hitTargets: THREE.Mesh[] = [];
  const n = charms.length;

  charms.forEach((c, i) => {
    // offset the spacing so front and back charms never line up vertically
    const step = 360 / (n + 1);
    const deg = 90 + (i + 1) * step + step * 0.3;
    const pivot = new THREE.Group();
    pivot.position.copy(ringPoint(deg));
    rig.add(pivot);

    // back charms hang lower so front chains don't cross their faces
    const depth = (R - pivot.position.z) / (2 * R); // 0 front … 1 back
    const L = 1.15 + depth * 0.7 + (lengths[i % lengths.length] - 1.6) * 0.35;
    chain(pivot, 0, -L);

    const { geo, half, face } = charmGeometry(c.shape);
    const spinner = new THREE.Group();
    spinner.position.y = -L - 0.08;
    pivot.add(spinner);

    const jump = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 28), linkMat);
    jump.rotation.y = Math.PI / 2;
    spinner.add(jump);

    const color = new THREE.Color(c.color || '#2f3cff');
    const mat = new THREE.MeshPhysicalMaterial({
      color, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12,
      emissive: color, emissiveIntensity: 0,
    });
    const body = new THREE.Mesh(geo, mat);
    body.position.y = -half;
    body.userData.index = i;
    spinner.add(body);
    const meshes = [body];
    const materials = [mat];

    if (face !== null) {
      const tex = faceTexture(c, c.shape);
      const fm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const s = c.shape === 'tag' ? 0.8 : 1.0;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(s, s), fm);
      front.position.set(0, c.shape === 'hex' ? -half + 0.02 : -half, face + 0.012);
      const back = front.clone();
      back.rotation.y = Math.PI;
      back.position.z = -front.position.z;
      front.userData.index = back.userData.index = i;
      spinner.add(front, back);
      meshes.push(front, back);
    }

    hitTargets.push(...meshes);
    pendulums.push({
      charm: c, pivot, spinner, meshes, materials, L,
      tx: 0, vx: 0, tz: (Math.random() - 0.5) * 0.4, vz: 0,
      phi: (Math.random() - 0.5) * 1.2, vphi: 0, phase: Math.random() * Math.PI * 2,
    });
  });

  // ── Sizing
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = camera.aspect < 0.8 ? 16 / Math.max(camera.aspect * 1.5, 0.72) : 16;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ── Pointer
  const ndc = new THREE.Vector2(9, 9);
  const world = new THREE.Vector3();
  const prevWorld = new THREE.Vector3();
  const mouseVel = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ray = new THREE.Raycaster();
  let hovered: Pendulum | null = null;
  let targetRotY = 0, targetRotX = 0, pointerActive = false;

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    targetRotY = ndc.x * 0.5;
    targetRotX = -ndc.y * 0.12;
    pointerActive = true;
  };
  const onLeave = () => { ndc.set(9, 9); pointerActive = false; setHover(null); };
  const onClick = () => { if (hovered) window.location.href = hovered.charm.href; };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  const setHover = (p: Pendulum | null) => {
    if (p === hovered) return;
    hovered = p;
    canvas.style.cursor = p ? 'pointer' : '';
    if (p) p.vphi += 3;
    opts.onHover?.(p ? p.charm : null);
  };

  /** Nudge a charm from outside, e.g. when its link in the list gets focus. */
  const poke = (index: number) => {
    const p = pendulums[index];
    if (!p) return;
    p.vz += 1.6; p.vphi += 5;
    pendulums.forEach((q) => q.materials.forEach((m) => (m.emissiveIntensity = q === p ? 0.35 : 0)));
  };

  // ── Loop
  let scrollProgress = 0;
  let running = true;
  let raf = 0;
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let idleSpin = 0;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;

    // pointer in world space (z = 0 plane)
    ray.setFromCamera(ndc, camera);
    if (pointerActive && ray.ray.intersectPlane(plane, world)) {
      mouseVel.subVectors(world, prevWorld).divideScalar(Math.max(dt, 1e-3));
      prevWorld.copy(world);
    } else mouseVel.set(0, 0, 0);

    // rig follows pointer + scroll
    if (!opts.reduced) idleSpin += dt * 0.08;
    const prevRotY = rig.rotation.y;
    const goalY = (pointerActive ? targetRotY : Math.sin(idleSpin) * 0.35) + scrollProgress * 1.6;
    rig.rotation.y += (goalY - rig.rotation.y) * Math.min(1, dt * 3);
    rig.rotation.x += (targetRotX - rig.rotation.x) * Math.min(1, dt * 3);
    rig.position.y = scrollProgress * 4.5;
    const rigVel = (rig.rotation.y - prevRotY) / Math.max(dt, 1e-3);

    // hover via raycast
    const hit = ray.intersectObjects(hitTargets, false)[0];
    setHover(hit ? pendulums[hit.object.userData.index] : null);

    for (const p of pendulums) {
      const w2 = G / p.L;
      // inertial kick from the rig turning
      p.vz += -rigVel * 0.6 * dt * 10;
      // breeze
      if (!opts.reduced) {
        p.vz += Math.sin(t * 0.7 + p.phase) * 0.08 * dt;
        p.vx += Math.cos(t * 0.5 + p.phase) * 0.05 * dt;
      }
      // pointer push
      p.spinner.getWorldPosition(tmp);
      tmp.y -= 0.5;
      const d = Math.hypot(tmp.x - world.x, tmp.y - world.y);
      if (pointerActive && d < 1.1) {
        const f = (1 - d / 1.1) * dt;
        p.vz += -mouseVel.x * 0.9 * f / p.L;
        p.vx += mouseVel.y * 0.5 * f / p.L;
        p.vphi += mouseVel.x * 1.2 * f;
      }
      p.vz += (-w2 * Math.sin(p.tz) - DAMP * p.vz) * dt;
      p.vx += (-w2 * Math.sin(p.tx) - DAMP * p.vx) * dt;
      p.vphi += (-TWIST_K * p.phi - TWIST_DAMP * p.vphi) * dt;
      p.tz += p.vz * dt; p.tx += p.vx * dt; p.phi += p.vphi * dt;
      p.tz = THREE.MathUtils.clamp(p.tz, -1.2, 1.2);
      p.tx = THREE.MathUtils.clamp(p.tx, -1.0, 1.0);

      // undo the rig's own y-rotation so charms keep facing the viewer
      p.pivot.rotation.set(p.tx, 0, p.tz);
      p.spinner.rotation.y = p.phi - rig.rotation.y;

      const glow = hovered === p ? 0.35 : 0;
      p.materials.forEach((m) => (m.emissiveIntensity += (glow - m.emissiveIntensity) * Math.min(1, dt * 8)));
    }

    renderer.render(scene, camera);
  };
  frame();

  return {
    setScroll: (v: number) => (scrollProgress = v),
    setRunning: (v: boolean) => { running = v; if (v) clock.getDelta(); },
    poke,
    destroy: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
      renderer.dispose();
    },
  };
}
