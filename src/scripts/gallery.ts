/* WebGL renderer for the home page project row. Cards are curved planes on a
   large cylinder seen from outside, drawn into an offscreen buffer; a second
   pass adds a lens-like chromatic aberration and horizontal smear that grow
   toward the screen edges (and with scroll speed). The DOM keeps the labels,
   details panel and links; this only draws pixels. */

export type View = {
  W: number; H: number; // viewport, CSS px
  R: number; // cylinder radius
  cw: number; ch: number; // card width; card height at the front (portrait)
  P: number; // perspective distance
  horizon: number; // how far above the row the vanishing point sits
  cy: number; // row centre, from the top
};
export type CardDraw = { tex: number; angle: number; arc: number; cw: number; ch: number }; // this card's size

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
uniform float uAngle, uArc, uR, uCh, uTop, uP, uHorizon, uCy;
uniform vec2 uRes;
out vec2 vUv;
void main() {
  vUv = aUv;
  float a = uAngle + (aUv.x - 0.5) * uArc;
  float x = uR * sin(a), z = uR * cos(a) - uR;
  float y = uTop + aUv.y * uCh;
  float s = uP / (uP - z);
  vec2 px = vec2(uRes.x * 0.5 + x * s, uCy - uHorizon + (y + uHorizon) * s);
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
uniform vec2 uRes;
uniform float uCA, uVel;
out vec4 o;
const int N = 16;
void main() {
  float dx = vUv.x - 0.5;
  // 0 across the middle, easing in toward the left and right edges
  float e = smoothstep(0.22, 0.5, abs(dx));
  e *= e;
  // Turning fast adds to it, mostly at the sides so the middle stays readable
  float v = uVel * (0.25 + 0.75 * e);
  float k = e * uCA + v; // colour spread, in uv
  float blurPx = e * 12.0 + v * 500.0; // soft blur radius, in px
  // The middle stays sharp (and cheap)
  if (k < 0.0002 && blurPx < 0.3) { o = texture(uScene, vUv); return; }
  vec2 dir = vec2(sign(dx) * k, 0.0);
  vec2 blur = vec2(blurPx / uRes.x, blurPx * 0.4 / uRes.y);
  // Samples spread along the split, each tinted by where it falls on a
  // red → green → blue spectrum, so the fringe is a smooth gradient rather than
  // three hard copies; they also scatter over a small disc for the blur
  vec3 rgb = vec3(0.0), alpha = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    vec3 w = max(vec3(0.0), 1.0 - abs(vec3(t) - vec3(0.15, 0.5, 0.85)) / vec3(0.45, 0.38, 0.45));
    float ang = float(i) * 2.39996; // golden angle
    vec2 disc = vec2(cos(ang), sin(ang)) * sqrt(t) * blur;
    vec4 s = texture(uScene, vUv + dir * (t - 0.5) * 2.0 + disc);
    rgb += s.rgb * w;
    alpha += s.a * w;
    wsum += w;
  }
  rgb /= wsum;
  alpha /= wsum;
  o = vec4(rgb, max(max(alpha.r, alpha.g), alpha.b)); // still premultiplied
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

  // Project images, loaded in the background; cards show their tint until then
  const tex = sources.map((s) => {
    const t = { tex: gl.createTexture()!, tint: hex(s.tint), aspect: 1, loaded: 0 };
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
    };
    if (s.src) img.src = s.src;
    return t;
  });

  // Offscreen buffer the cards are drawn into before the lens pass
  const fbo = gl.createFramebuffer()!;
  const sceneTex = gl.createTexture()!;
  let w = 0, h = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.round(canvas.clientWidth * dpr); h = Math.round(canvas.clientHeight * dpr);
    canvas.width = w; canvas.height = h;
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  resize();

  /** Cards must come back to front. vel: scroll speed, adds to the effect. */
  const draw = (v: View, cards: CardDraw[], vel: number) => {
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
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
    for (const c of cards) {
      const t = tex[c.tex];
      const cardAspect = c.cw / c.ch;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(post);
    gl.bindVertexArray(empty);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(pu('uScene'), 0);
    gl.uniform2f(pu('uRes'), w, h);
    gl.uniform1f(pu('uCA'), 0.016);
    gl.uniform1f(pu('uVel'), vel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const destroy = () => gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { draw, resize, destroy };
}
