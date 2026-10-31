/* Halftone object: a constantly turning chrome lens, lit by a bank of strip
   lights, drawn as a grid of round dots whose size follows its brightness.
   Moving the pointer stirs a wake through the dots that drifts and fades.
   Rendered in fragment shaders so the dots stay crisp at any resolution. */

type Opts = { reduced: boolean };

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;      // canvas size, device px
uniform float uTime;
uniform float uCell;    // dot pitch, device px
uniform vec2 uTilt;     // smoothed pointer, -1..1
uniform vec3 uShape;    // centre x (of width), centre y (of height), radius (of height)
uniform vec4 uMask;     // left, top, right, bottom edges (fractions) the object fades out at
uniform sampler2D uTrail; // pointer wake, red channel 0..1

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }

// Strip softbox: bright along u, thin across it. Its reflection is a curved band.
float strip(vec3 r, vec3 l, vec3 u, float width, float len) {
  vec3 v = normalize(cross(l, u));
  float across = dot(r, v), along = dot(r, u);
  return exp(-across * across / (width * width))
       * smoothstep(len, len * 0.3, abs(along))
       * smoothstep(0.0, 0.3, dot(r, l));
}

// Studio rig: a bank of parallel strips plus a broad soft key. The rig keeps
// turning on three overlapping cycles, so the bands are always sweeping.
float env(vec3 r) {
  float t = uTime;
  mat3 rig = rotZ(0.55 * sin(t * 0.31)) * rotX(0.32 * sin(t * 0.23 + 1.0)) * rotY(0.4 * sin(t * 0.17 + 2.0));
  r = rig * r;
  vec3 l = normalize(vec3(-0.12, 0.95, 0.3));
  vec3 u = normalize(vec3(1.0, 0.08, 0.1));
  vec3 v = normalize(cross(l, u));
  float bank = 0.0;
  bank += strip(r, normalize(l - v * 0.34), u, 0.075, 1.15) * 1.1;
  bank += strip(r, normalize(l - v * 0.14), u, 0.032, 1.05) * 0.95;
  bank += strip(r, normalize(l + v * 0.04), u, 0.020, 0.95) * 0.75;
  bank += strip(r, normalize(l + v * 0.22), u, 0.045, 0.85) * 0.6;
  bank += strip(r, normalize(l + v * 0.48), u, 0.110, 0.70) * 0.4;
  vec3 k = normalize(vec3(0.55, 0.6, 0.6));
  float key = pow(max(dot(r, k), 0.0), 220.0) * 1.4 + pow(max(dot(r, k), 0.0), 8.0) * 0.18;
  // A dimmer bounce bank low on the left gives the underside some form
  vec3 l2 = normalize(vec3(-0.75, -0.35, 0.55));
  vec3 u2 = normalize(vec3(0.35, -0.9, 0.2));
  vec3 v2 = normalize(cross(l2, u2));
  float bounce = strip(r, l2, u2, 0.09, 0.9) * 0.7 + strip(r, normalize(l2 + v2 * 0.22), u2, 0.035, 0.8) * 0.5;
  float wash = smoothstep(-0.2, 1.0, dot(r, l)) * 0.07;
  return bank + bounce + key + wash;
}

float scene(vec2 px) {
  vec2 uv = px / uRes.y;
  float aspect = uRes.x / uRes.y;
  // Backdrop: flat tone with a faint sweep
  float bg = 0.05 + 0.04 * smoothstep(1.2, 0.0, length(uv - vec2(aspect * 0.75, 0.1)));
  vec2 c = vec2(uShape.x * aspect, uShape.y);
  // A slightly squashed, tilted lens rather than a perfect ball
  vec2 d = (uv - c) / uShape.z;
  float ca = cos(-0.35), sa = sin(-0.35);
  d = vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y) * vec2(1.0, 1.28);
  float r2 = dot(d, d);
  if (r2 > 1.0) return bg;
  vec3 n = normalize(vec3(d.x, -d.y * 1.28, sqrt(1.0 - r2)));
  n = rotY(uTilt.x * 0.25 + sin(uTime * 0.21) * 0.18) * rotX(-uTilt.y * 0.18) * n;
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float lum = env(r) + pow(1.0 - n.z, 5.0) * 0.1;
  // Fade the object out toward the copy and the wordmark
  vec2 f = vec2(px.x / uRes.x, px.y / uRes.y);
  float m = smoothstep(uMask.x, uMask.x + 0.12, f.x) * smoothstep(uMask.z, uMask.z - 0.12, f.x)
          * smoothstep(uMask.y, uMask.y + 0.1, f.y) * smoothstep(uMask.w, uMask.w - 0.14, f.y);
  return mix(bg, max(bg, lum), smoothstep(1.0, 0.97, r2) * m);
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 ctr = (floor(fc / uCell) + 0.5) * uCell;
  float wake = texture2D(uTrail, vec2(ctr.x / uRes.x, 1.0 - ctr.y / uRes.y)).r;
  float l = clamp(scene(ctr) + wake * 0.6, 0.0, 1.0);
  float rad = uCell * mix(0.1, 0.64, pow(l, 0.85));
  float aa = max(0.75, uCell * 0.06);
  float a = 1.0 - smoothstep(rad - aa, rad + aa, length(fc - ctr));
  a *= mix(0.3, 1.0, smoothstep(0.0, 0.55, l));
  gl_FragColor = vec4(vec3(a), a);
}
`;

// Pointer wake: each frame the previous wake drifts along a slow flow field,
// blurs a little and fades, and the latest pointer segment is painted in.
const TRAIL = `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uSize;     // trail texture size
uniform vec2 uA;        // pointer segment start, uv (y up)
uniform vec2 uB;        // pointer segment end
uniform float uStrength;
uniform float uTime;

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float aspect = uSize.x / uSize.y;
  vec2 q = uv * vec2(aspect, 1.0);
  vec2 flow = vec2(
    sin(q.y * 7.0 + uTime * 0.8) + 0.5 * sin(q.y * 13.0 - uTime * 0.6),
    cos(q.x * 6.0 - uTime * 0.7) + 0.5 * cos(q.x * 11.0 + uTime * 0.5)
  ) * 0.0012 + vec2(0.0, 0.0008);
  vec2 src = uv - flow;
  vec2 px = 1.0 / uSize;
  float c = texture2D(uPrev, src).r;
  float blur = (texture2D(uPrev, src + vec2(px.x, 0.0)).r + texture2D(uPrev, src - vec2(px.x, 0.0)).r
              + texture2D(uPrev, src + vec2(0.0, px.y)).r + texture2D(uPrev, src - vec2(0.0, px.y)).r) * 0.25;
  float prev = mix(c, blur, 0.5) * 0.94;
  float d = seg(q, uA * vec2(aspect, 1.0), uB * vec2(aspect, 1.0));
  float paint = exp(-d * d / 0.0005) * uStrength;
  gl_FragColor = vec4(min(1.0, prev + paint), 0.0, 0.0, 1.0);
}
`;

export function mountHalftone(canvas: HTMLCanvasElement, { reduced }: Opts) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) throw new Error('WebGL unavailable');

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const link = (frag: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    return { p, u: (n: string) => gl.getUniformLocation(p, n) };
  };
  const dots = link(FRAG);
  const trail = link(TRAIL);
  const D = {
    res: dots.u('uRes'), time: dots.u('uTime'), cell: dots.u('uCell'), tilt: dots.u('uTilt'),
    shape: dots.u('uShape'), mask: dots.u('uMask'), trail: dots.u('uTrail'),
  };
  const T = {
    prev: trail.u('uPrev'), size: trail.u('uSize'), a: trail.u('uA'), b: trail.u('uB'),
    strength: trail.u('uStrength'), time: trail.u('uTime'),
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Two low-res targets the wake ping-pongs between
  const TRAIL_SCALE = 6; // css px per trail texel
  let targets: { tex: WebGLTexture; fb: WebGLFramebuffer }[] = [];
  let tw = 1, th = 1;
  const makeTargets = (w: number, h: number) => {
    targets.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); });
    tw = Math.max(1, Math.ceil(w / TRAIL_SCALE));
    th = Math.max(1, Math.ceil(h / TRAIL_SCALE));
    targets = [0, 1].map(() => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  let dpr = 1, raf = 0, running = false;
  const t0 = performance.now();
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  // Pointer in canvas uv (y up); lx/ly is where the previous frame painted to
  const ptr = { x: -1, y: -1, lx: -1, ly: -1, in: false };
  let shape: [number, number, number] = [0.31, 0.42, 0.52];
  let mask: [number, number, number, number] = [0.03, 0, 0.55, 0.7];

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Wide: a compact object in the upper middle, clear of the copy on the right
    // and the wordmark below. Narrow: centred between headline and buttons.
    const wide = w / h > 1.1;
    shape = wide ? [0.31, 0.42, 0.52] : [0.5, 0.47, 0.32];
    mask = wide ? [0.03, 0, 0.55, 0.7] : [-0.2, 0.2, 1.2, 0.7];
    makeTargets(w, h);
    if (!running) draw(performance.now());
  };

  const onMove = (e: PointerEvent) => {
    tilt.tx = (e.clientX / window.innerWidth) * 2 - 1;
    tilt.ty = (e.clientY / window.innerHeight) * 2 - 1;
    if (e.pointerType === 'touch') return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    ptr.in = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    if (ptr.lx < 0) { ptr.lx = x; ptr.ly = y; }
    ptr.x = x;
    ptr.y = y;
  };
  const onLeave = () => { ptr.in = false; ptr.lx = -1; };

  function draw(now: number) {
    const time = reduced ? 8 : (now - t0) / 1000 + 8;
    tilt.x += (tilt.tx - tilt.x) * 0.04;
    tilt.y += (tilt.ty - tilt.y) * 0.04;

    // 1. Advance the wake; faster strokes paint brighter
    const moved = ptr.in && ptr.lx >= 0 ? Math.hypot((ptr.x - ptr.lx) * (tw / th), ptr.y - ptr.ly) : 0;
    const [src, dst] = targets;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, dst.fb);
    gl!.viewport(0, 0, tw, th);
    gl!.useProgram(trail.p);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, src.tex);
    gl!.uniform1i(T.prev, 0);
    gl!.uniform2f(T.size, tw, th);
    gl!.uniform2f(T.a, ptr.lx, ptr.ly);
    gl!.uniform2f(T.b, ptr.x, ptr.y);
    gl!.uniform1f(T.strength, Math.min(0.4, moved * 14));
    gl!.uniform1f(T.time, time);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    targets = [dst, src];
    if (ptr.in) { ptr.lx = ptr.x; ptr.ly = ptr.y; }

    // 2. Draw the dots, reading the fresh wake
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.useProgram(dots.p);
    gl!.bindTexture(gl!.TEXTURE_2D, dst.tex);
    gl!.uniform1i(D.trail, 0);
    gl!.uniform2f(D.res, canvas.width, canvas.height);
    gl!.uniform1f(D.cell, (canvas.clientWidth < 700 ? 5 : 6) * dpr);
    gl!.uniform3f(D.shape, ...shape);
    gl!.uniform4f(D.mask, ...mask);
    gl!.uniform1f(D.time, time);
    gl!.uniform2f(D.tilt, tilt.x, tilt.y);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  const loop = (now: number) => {
    draw(now);
    raf = requestAnimationFrame(loop);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  if (!reduced) {
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
  }

  return {
    setRunning(on: boolean) {
      if (reduced || on === running) return;
      running = on;
      if (on) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    },
  };
}
