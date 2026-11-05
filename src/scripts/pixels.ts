/* Pixel field: slow value noise, ordered-dithered into a grid of tiny square
   pixels, grouped into chunky 8×8 blocks. Brighter toward the top, faded at
   the edges. A click sends a ripple out through the field.
   Same look as the hero on the Framer version of jjuncreative.com. It sits
   fixed behind every page; the dot colour follows the light/dark theme. */

type Opts = { reduced: boolean };

const PIXEL = 2;          // css px per pixel
const DENSITY = 2;        // higher fills more pixels
const SCALE = 1;          // noise feature size
const SPEED = 0.6;        // noise drift
const MAX_CLICKS = 10;
const RIPPLE_LIFE = 3;    // in shader time units

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPx;
uniform vec3 uInk;      // dot colour
uniform vec2 uClick[${MAX_CLICKS}];
uniform float uClickT[${MAX_CLICKS}];

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Ordered dither threshold, built up from the 2×2 matrix
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  float aspect = uRes.x / uRes.y;

  // Noise is sampled once per 8×8 block, which gives the chunky look
  float block = 8.0 * uPx;
  vec2 blockUv = floor(fc / block) * block / uRes * vec2(aspect, 1.0);
  float feed = vnoise(blockUv * ${SCALE.toFixed(1)} * 8.0 + uTime * 0.05) * 0.5 - 0.65 + (${DENSITY.toFixed(1)} - 0.5) * 0.3;

  for (int i = 0; i < ${MAX_CLICKS}; i++) {
    if (uClick[i].x < 0.0) continue;
    float t = uTime - uClickT[i];
    if (t < 0.0 || t > ${RIPPLE_LIFE.toFixed(1)}) continue;
    float r = distance(blockUv, uClick[i] / uRes * vec2(aspect, 1.0));
    float ring = exp(-pow((r - 0.4 * t) / 0.12, 2.0));
    feed = max(feed, ring * exp(-2.5 * t) * exp(-10.0 * r));
  }

  float on = step(0.5, feed + bayer8(fc / uPx) - 0.5);
  float alpha = on * mix(0.25, 0.5, uv.y);
  alpha *= 1.0 - smoothstep(0.3, 0.8, length(uv - 0.5));
  gl_FragColor = vec4(uInk * alpha, alpha);
}
`;

export function mountPixels(canvas: HTMLCanvasElement, { reduced }: Opts) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) throw new Error('WebGL unavailable');

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const u = (n: string) => gl.getUniformLocation(prog, n);
  const uRes = u('uRes'), uTime = u('uTime'), uPx = u('uPx'), uClick = u('uClick'), uClickT = u('uClickT'), uInk = u('uInk');
  gl.uniform3f(uInk, 1, 1, 1);

  // Ring buffer of recent clicks, in canvas device px (y up)
  const clicks = new Float32Array(MAX_CLICKS * 2).fill(-1);
  const clickT = new Float32Array(MAX_CLICKS);
  let next = 0, raf = 0, running = false, time = 0, last = performance.now();

  // Phones: drawn at 1× (the pixels are chunky blocks anyway) and at about
  // 30 fps (the field drifts slowly), a fraction of the GPU work
  const phone = matchMedia('(pointer: coarse)').matches;
  const resize = () => {
    const dpr = phone ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uPx, PIXEL * dpr);
    if (!running) draw();
  };

  const onDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom) return;
    clicks[next * 2] = (e.clientX - r.left) * (canvas.width / r.width);
    clicks[next * 2 + 1] = (r.bottom - e.clientY) * (canvas.height / r.height);
    clickT[next] = time;
    next = (next + 1) % MAX_CLICKS;
  };

  function draw() {
    gl!.uniform1f(uTime, time);
    gl!.uniform2fv(uClick, clicks);
    gl!.uniform1fv(uClickT, clickT);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (phone && now - last < 30) return;
    time += Math.min(0.1, (now - last) / 1000) * SPEED * 5;
    last = now;
    draw();
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  if (!reduced) window.addEventListener('pointerdown', onDown, { passive: true });

  return {
    /** Dot colour as 0..1 rgb */
    setInk(r: number, g: number, b: number) {
      gl.uniform3f(uInk, r, g, b);
      if (!running) draw();
    },
    setRunning(on: boolean) {
      if (reduced || on === running) return;
      running = on;
      if (on) { last = performance.now(); raf = requestAnimationFrame(loop); }
      else cancelAnimationFrame(raf);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerdown', onDown);
    },
  };
}
