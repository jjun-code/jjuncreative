/* WebGL renderer for the home page. Two layouts share it: the project row
   (cards are curved planes on a large cylinder seen from outside) and the
   photo field (flat cards placed anywhere, given as screen rectangles). Cards
   are drawn into an offscreen buffer; a Gaussian blur, run across then down,
   adds a lens-like warp, chromatic aberration and soft blur that grow toward
   the screen edges (and with scroll speed): along the sides for the row, all
   round like a fisheye for the field. The DOM keeps the details panel and
   links; this only draws pixels. */

export type View = {
  W: number; H: number; // viewport, CSS px
  R: number; // cylinder radius
  cw: number; ch: number; // card width; card height at the front (portrait)
  P: number; // perspective distance
  horizon: number; // how far above the row the vanishing point sits
  cy: number; // row centre, from the top
};
// A row card (angle/arc on the cylinder), or a flat card when rect is given
// ([x, y, w, h] in CSS px, before the lens)
export type CardDraw = { tex: number; angle: number; arc: number; cw: number; ch: number; rect?: [number, number, number, number] };

// ── The field's fisheye, mirrored in JS so labels and hover line up with it ──
export const FIELD_LENS = 0.2;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Screen point → the point of the undistorted scene drawn there. */
export function lensSource(x: number, y: number, W: number, H: number): [number, number] {
  const a = W / H, ux = x / W - 0.5, uy = y / H - 0.5;
  const r = Math.hypot(ux * a, uy) / Math.hypot(a * 0.5, 0.5);
  const l = smooth(0.2, 1, r), k = 1 / (1 + FIELD_LENS * l * l);
  return [W * (0.5 + ux * k), H * (0.5 + uy * k)];
}
/** Undistorted scene point → where it appears on screen (inverse, by iteration). */
export function lensScreen(x: number, y: number, W: number, H: number): [number, number] {
  let dx = x, dy = y;
  for (let i = 0; i < 8; i++) {
    const [sx, sy] = lensSource(dx, dy, W, H);
    dx += x - sx; dy += y - sy;
  }
  return [dx, dy];
}

// Screen position (CSS px) of a point on a card: u/v 0–1 across/down the card.
// Cards hang from a common top line, so a taller card only extends further down.
export function project(v: View, angle: number, arc: number, u: number, vv: number, ch = v.ch): [number, number] {
  const a = angle + (u - 0.5) * arc;
  const x = v.R * Math.sin(a), z = v.R * Math.cos(a) - v.R;
  const y = -v.ch / 2 + vv * ch;
  const s = v.P / (v.P - z);
  return [v.W / 2 + x * s, v.cy - v.horizon + (y + v.horizon) * s];
}

const CARD_VS = `#version 300 es
in vec2 aUv;
uniform float uAngle, uArc, uR, uCh, uTop, uP, uHorizon, uCy, uFlat;
uniform vec2 uRes;
uniform vec4 uRect; // flat cards: x, y, w, h in px
out vec2 vUv;
void main() {
  vUv = aUv;
  vec2 px;
  if (uFlat > 0.5) {
    px = uRect.xy + aUv * uRect.zw;
  } else {
    float a = uAngle + (aUv.x - 0.5) * uArc;
    float x = uR * sin(a), z = uR * cos(a) - uR;
    float y = uTop + aUv.y * uCh;
    float s = uP / (uP - z);
    px = vec2(uRes.x * 0.5 + x * s, uCy - uHorizon + (y + uHorizon) * s);
  }
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const CARD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uCover, uSize;
uniform vec3 uTint;
uniform float uLoaded, uRadius;
out vec4 o;
float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  float d = box((vUv - 0.5) * uSize, uSize * 0.5, uRadius);
  float aa = max(fwidth(d), 0.5);
  float m = 1.0 - smoothstep(-aa, aa, d);
  vec3 c = mix(uTint, texture(uTex, (vUv - 0.5) * uCover + 0.5).rgb, uLoaded);
  o = vec4(c * m, m); // premultiplied
}`;

const POST_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes, uDir; // uDir: (1, 0) across, (0, 1) down
uniform float uCA, uVel, uSplit; // uSplit: 1 on the pass that also splits colour
uniform float uLens, uCenterY; // edge lens bulge, and the height (uv) it centres on
uniform float uRadial, uFieldLens; // 1: the photo field's all-round fisheye
out vec4 o;
void main() {
  float dx = vUv.x - 0.5;
  vec2 src = vUv;
  vec2 dir = vec2(sign(dx), 0.0); // which way the colour splits
  float e;
  if (uRadial > 0.5) {
    // Fisheye: magnified toward every edge, strongest in the corners
    // (mirrored by lensSource in JS)
    float aspect = uRes.x / uRes.y;
    vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
    float r = length(q) / length(vec2(aspect, 1.0) * 0.5);
    if (uSplit > 0.5) {
      float l = smoothstep(0.2, 1.0, r);
      src = 0.5 + (vUv - 0.5) / (1.0 + uFieldLens * l * l);
    }
    e = smoothstep(0.35, 1.0, r);
    dir = normalize(vUv - 0.5 + 1e-5);
  } else {
    // Lens distortion (first pass only): toward the left and right edges the
    // image is magnified vertically about the row, so cards there grow taller
    // and their top and bottom edges bow outward, like a wide-angle lens
    if (uSplit > 0.5) {
      float l = smoothstep(0.12, 0.5, abs(dx));
      src.y = uCenterY + (vUv.y - uCenterY) / (1.0 + uLens * l * l);
    }
    // 0 across the middle, easing in toward the left and right edges
    e = smoothstep(0.2, 0.5, abs(dx));
  }
  e *= e;
  // Turning fast adds to it, mostly at the sides so the middle stays readable
  float v = uVel * (0.25 + 0.75 * e);
  float reach = e * 18.0 + v * 600.0; // blur reach in px (about 3 sigma)
  float k = (e * uCA + v * 0.4) * uSplit; // colour split, in uv (gentle; the blur does most of the work)
  // The middle stays sharp (and cheap)
  if (reach < 0.5 && k < 0.0002) { o = texture(uScene, src); return; }
  vec2 stepUv = uDir * (reach / 6.0) / uRes;
  vec2 off = dir * k;
  // 13 taps with Gaussian weights (sigma = 2 taps). On the colour pass each tap
  // reads red, green and blue from slightly different places; the blur then
  // smears those apart into a soft gradient rather than hard copies
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 8.0);
    vec2 uv = src + stepUv * float(i);
    vec4 c;
    if (uSplit > 0.5) {
      vec4 r = texture(uScene, uv - off), g = texture(uScene, uv), bl = texture(uScene, uv + off);
      c = vec4(r.r, g.g, bl.b, max(max(r.a, g.a), bl.a)); // still premultiplied
    } else {
      c = texture(uScene, uv);
    }
    acc += c * w;
    wsum += w;
  }
  o = acc / wsum;
}`;

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

const hex = (h: string) => {
  const m = h.trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [0.15, 0.15, 0.15];
};

export function createGallery(canvas: HTMLCanvasElement, sources: { src: string; tint: string }[]) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  let card: WebGLProgram, post: WebGLProgram;
  try {
    card = program(gl, CARD_VS, CARD_FS);
    post = program(gl, POST_VS, POST_FS);
  } catch (e) {
    console.warn('Project gallery unavailable', e);
    return null;
  }
  const cu = (n: string) => gl.getUniformLocation(card, n);
  const pu = (n: string) => gl.getUniformLocation(post, n);

  // A strip of quads across the card, so it bends with the cylinder
  const SEG = 32;
  const uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= SEG; i++) uv.push(i / SEG, 0, i / SEG, 1);
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(card, 'aUv');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const empty = gl.createVertexArray()!;

  // Card images, loaded in the background; cards show their tint until then.
  // Animated GIFs play: their frames are decoded one at a time and swapped
  // into the texture on each frame's own timing. Browsers with ImageDecoder
  // (Chrome, Edge, Firefox) decode natively; the rest (Safari, so iPhones)
  // decode in script with gifuct-js, loaded only when needed. Only GIFs that
  // were on screen recently are advanced, to spare phones the work.
  type Frame = { source: TexImageSource; ms: number; done: () => void };
  type Gif = { count: number; i: number; next: number; busy: boolean; frame: (i: number) => Promise<Frame>; close: () => void };
  type Tex = { tex: WebGLTexture; tint: number[]; aspect: number; loaded: number; gif?: Gif; dead?: boolean; seen?: number };
  const Decoder = (window as any).ImageDecoder;
  // Native: the browser decodes each frame on request
  const nativeGif = async (src: string): Promise<Gif | null> => {
    const res = await fetch(src);
    const dec = new Decoder({ data: res.body, type: 'image/gif' });
    await dec.completed; // the frame count is only known once it's all read
    const count = dec.tracks.selectedTrack?.frameCount ?? 1;
    if (count < 2) { dec.close(); return null; }
    return {
      count, i: 1, next: 0, busy: false,
      frame: (i) => dec.decode({ frameIndex: i }).then(({ image }: { image: VideoFrame }) => ({
        source: image, ms: (image.duration ?? 0) / 1000, done: () => image.close(),
      })),
      close: () => dec.close(),
    };
  };
  // In script: frames are patches over the previous picture, so they're
  // painted in order onto a canvas the size of the GIF, honouring "clear this
  // area afterwards" (disposal 2)
  const scriptGif = async (src: string): Promise<Gif | null> => {
    const [{ parseGIF, decompressFrame }, buf] = await Promise.all([
      import('gifuct-js'),
      fetch(src).then((r) => r.arrayBuffer()),
    ]);
    const gif: any = parseGIF(buf);
    const frames = gif.frames.filter((f: any) => f.image);
    if (frames.length < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = gif.lsd.width; canvas.height = gif.lsd.height;
    const ctx = canvas.getContext('2d')!;
    const patch = document.createElement('canvas');
    const pctx = patch.getContext('2d')!;
    let clearAfter: { left: number; top: number; width: number; height: number } | null = null;
    return {
      count: frames.length, i: 1, next: 0, busy: false,
      frame: async (i) => {
        if (i === 0) ctx.clearRect(0, 0, canvas.width, canvas.height);
        else if (clearAfter) ctx.clearRect(clearAfter.left, clearAfter.top, clearAfter.width, clearAfter.height);
        const f = decompressFrame(frames[i], gif.gct, true) as any;
        const { width, height, left, top } = f.dims;
        patch.width = width; patch.height = height;
        pctx.putImageData(new ImageData(f.patch, width, height), 0, 0);
        ctx.drawImage(patch, left, top);
        clearAfter = f.disposalType === 2 ? f.dims : null;
        return { source: canvas, ms: f.delay ?? 0, done: () => {} };
      },
      close: () => {},
    };
  };
  const playGif = async (t: Tex, src: string) => {
    try {
      const native = Decoder && (await Decoder.isTypeSupported?.('image/gif'));
      const g = await (native ? nativeGif(src) : scriptGif(src));
      if (g && !t.dead) t.gif = g; else g?.close();
    } catch {}
  };
  const upload = (t: Tex, source: TexImageSource) => {
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  const stepGifs = () => {
    const now = performance.now();
    for (const t of tex) {
      const g = t.gif;
      if (!g || g.busy || now < g.next || now - (t.seen ?? -1e9) > 500) continue;
      g.busy = true;
      g.frame(g.i).then((f) => {
        if (!t.dead) {
          upload(t, f.source);
          // very short delays play at ~10 fps, as browsers do
          g.next = performance.now() + (f.ms >= 20 ? f.ms : 100);
          g.i = (g.i + 1) % g.count;
        }
        f.done();
        g.busy = false;
      }).catch(() => { t.gif = undefined; });
    }
  };
  const load = (s: { src: string; tint: string }): Tex => {
    const t: Tex = { tex: gl.createTexture()!, tint: hex(s.tint), aspect: 1, loaded: 0 };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      t.aspect = img.naturalWidth / img.naturalHeight;
      t.loaded = 1;
      if (/\.gif(\?|$)/i.test(s.src)) playGif(t, s.src);
    };
    if (s.src) img.src = s.src;
    return t;
  };
  let tex = sources.map(load);
  /** Swap in a different set of card images (the home page's tabs). */
  const setSources = (next: { src: string; tint: string }[]) => {
    tex.forEach((t) => { t.dead = true; t.gif?.close(); gl.deleteTexture(t.tex); });
    tex = next.map(load);
  };

  // Offscreen buffers: the cards are drawn into the first, blurred across
  // (with the colour split) into the second, then blurred down onto the screen
  const targets = [0, 1].map(() => ({ fbo: gl.createFramebuffer()!, tex: gl.createTexture()! }));
  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.round(canvas.clientWidth * dpr); h = Math.round(canvas.clientHeight * dpr);
    canvas.width = w; canvas.height = h;
    for (const t of targets) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  resize();

  /** Cards must come back to front. vel: scroll speed, adds to the effect.
      radial: the photo field's fisheye instead of the row's side lens. */
  const draw = (v: View, cards: CardDraw[], vel: number, radial = false) => {
    stepGifs();
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(card);
    gl.bindVertexArray(vao);
    gl.uniform2f(cu('uRes'), v.W, v.H);
    gl.uniform1f(cu('uR'), v.R);
    gl.uniform1f(cu('uTop'), -v.ch / 2);
    gl.uniform1f(cu('uP'), v.P);
    gl.uniform1f(cu('uHorizon'), v.horizon);
    gl.uniform1f(cu('uCy'), v.cy);
    gl.uniform1f(cu('uRadius'), 6);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(cu('uTex'), 0);
    const drawnAt = performance.now();
    for (const c of cards) {
      const t = tex[c.tex];
      if (!t) continue;
      t.seen = drawnAt;
      const cardAspect = c.cw / c.ch;
      gl.uniform1f(cu('uFlat'), c.rect ? 1 : 0);
      if (c.rect) gl.uniform4f(cu('uRect'), c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
      gl.uniform1f(cu('uCh'), c.ch);
      gl.uniform2f(cu('uSize'), c.cw, c.ch);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      // object-fit: cover
      gl.uniform2f(cu('uCover'), t.aspect > cardAspect ? cardAspect / t.aspect : 1, t.aspect > cardAspect ? 1 : t.aspect / cardAspect);
      gl.uniform3f(cu('uTint'), t.tint[0], t.tint[1], t.tint[2]);
      gl.uniform1f(cu('uLoaded'), t.loaded);
      gl.uniform1f(cu('uAngle'), c.angle);
      gl.uniform1f(cu('uArc'), c.arc);
      gl.drawElements(gl.TRIANGLES, SEG * 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.disable(gl.BLEND);
    gl.useProgram(post);
    gl.bindVertexArray(empty);
    gl.uniform1i(pu('uScene'), 0);
    gl.uniform2f(pu('uRes'), w, h);
    gl.uniform1f(pu('uCA'), 0.006); // colour split at the very edge, in uv
    gl.uniform1f(pu('uVel'), vel);
    gl.uniform1f(pu('uLens'), 0.24);
    gl.uniform1f(pu('uRadial'), radial ? 1 : 0);
    gl.uniform1f(pu('uFieldLens'), FIELD_LENS);
    // Centre the bulge on the side cards (squares hanging from the row's top)
    gl.uniform1f(pu('uCenterY'), 1 - (v.cy - v.ch / 2 + v.cw / 2) / v.H);
    // Across, with the colour split, into the second buffer…
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1].fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, targets[0].tex);
    gl.uniform2f(pu('uDir'), 1, 0);
    gl.uniform1f(pu('uSplit'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // …then down, onto the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, targets[1].tex);
    gl.uniform2f(pu('uDir'), 0, 1);
    gl.uniform1f(pu('uSplit'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** A card image's width/height, once loaded (null before). */
  const aspectOf = (i: number) => (tex[i]?.loaded ? tex[i].aspect : null);

  const destroy = () => {
    tex.forEach((t) => { t.dead = true; t.gif?.close(); });
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  return { draw, resize, setSources, aspectOf, destroy };
}
