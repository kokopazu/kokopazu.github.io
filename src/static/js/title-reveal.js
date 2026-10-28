/* kokopazu.com — title-reveal.js (no dependencies)
   히어로 타이틀 로고 인트로. 금가루가 화면 왼쪽 밖에서 날아와 로고 모양으로 모이고, 진짜 로고 이미지가 나타난 뒤 빛 띠가 한 번 지나간다.
   움직임·색·블룸은 RemotionMotionTest 의 TitleReveal(GoldDust · shaders · BloomComposer)을 WebGL2 로 옮긴 것이다.
   실행 여부(데스크톱 · 움직임 줄이기 아님 · 느린 연결 아님)는 index.html head 의 인라인 스크립트가 정해 html.tr-pending 을 붙인다.
   준비에 실패하거나 늦으면 정지 로고로 돌아간다 (site.css 의 1.5초 폴백). */
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('tr-pending')) return;

  /* ---- 설정: TitleReveal 기본값. 시간(초)만 홈페이지용으로 줄였다 ---- */
  var P = {
    seed: 1, alphaThreshold: 200,
    spawnXMin: -0.4, spawnXMax: -0.05, spawnYSpread: 0.2, spawnZ: 300,
    turbulence: 1, updraft: 1, brighten: 0.6,
    enterStart: 0, enterEnd: 0.35, convergeStart: 0.35, convergeEnd: 2.1,
    crossfadeStart: 1.95, crossfadeEnd: 2.5,   /* site.css .tr-run .logo-title transition(.55s)과 맞춘다 */
    glintAt: 2.6,                              /* site.css tr-glint(.8s) */
    motesOutStart: 3.4, motesOutEnd: 4.8, end: 4.9,
    sizeMin: 1.5, sizeMax: 3, glintRatio: 0.005, moteCount: 300,
    bloomIntensity: 1.2, bloomThreshold: 0.6, bloomSmoothing: 0.25, bloomRadius: 0.7, bloomLevels: 6,
    startBudgetMs: 1400,                       /* site.css 폴백(1.5s)보다 늦게 시작하지 않는다 */
    maxDpr: 2
  };

  var hero = document.getElementById('hero');
  var logo = hero && hero.querySelector('.logo-title');
  var canvas = null, gl = null, glint = null, raf = 0, done = false, budgetFrom = 0;

  function cleanup() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (gl) { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); gl = null; }
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    if (glint && glint.parentNode) glint.parentNode.removeChild(glint);
    canvas = glint = null;
  }
  function giveUp() { done = true; cleanup(); html.classList.remove('tr-pending', 'tr-wait', 'tr-run', 'tr-in'); }
  function finish() { done = true; cleanup(); html.classList.remove('tr-run', 'tr-in'); }
  if (!hero || !logo) { giveUp(); return; }

  /* ---- 셰이더: Ashima 3D simplex noise (MIT) + curl noise, TitleReveal/shaders.ts 와 같은 식 ---- */
  var NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
vec3 curl(vec3 p) {
  const float e = 0.05;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 o1 = vec3(31.4, 17.2, 5.9);
  vec3 o2 = vec3(-12.7, 44.1, 23.3);
  float p_x0 = snoise(p - dx), p_x1 = snoise(p + dx);
  float p_y0 = snoise(p - dy), p_y1 = snoise(p + dy);
  float p_z0 = snoise(p - dz), p_z1 = snoise(p + dz);
  float q_x0 = snoise(p - dx + o1), q_x1 = snoise(p + dx + o1);
  float q_y0 = snoise(p - dy + o1), q_y1 = snoise(p + dy + o1);
  float q_z0 = snoise(p - dz + o1), q_z1 = snoise(p + dz + o1);
  float r_x0 = snoise(p - dx + o2), r_x1 = snoise(p + dx + o2);
  float r_y0 = snoise(p - dy + o2), r_y1 = snoise(p + dy + o2);
  float r_z0 = snoise(p - dz + o2), r_z1 = snoise(p + dz + o2);
  float x = (r_y1 - r_y0) - (q_z1 - q_z0);
  float y = (p_z1 - p_z0) - (r_x1 - r_x0);
  float z = (q_x1 - q_x0) - (p_y1 - p_y0);
  return vec3(x, y, z) / (2.0 * e);
}`;

  /* 좌표: 캔버스(히어로) 중앙이 원점, y 위 방향, 단위 CSS px. 로고 픽셀 위치는 uLogo(히어로 기준 left/top/width/height)로 매 프레임 계산한다 */
  var DUST_VS = `precision highp float;
uniform float uTime, uSeed, uEnterStart, uEnterEnd, uConvergeStart, uConvergeEnd, uCrossfadeStart, uCrossfadeEnd;
uniform float uSpawnXMin, uSpawnXMax, uSpawnYSpread, uSpawnZ, uTurbulence, uUpdraft, uBrighten;
uniform float uSizeMin, uSizeMax, uGlintRatio, uDpr;
uniform vec2 uView;
uniform vec4 uLogo;
attribute vec2 aUv;
attribute vec3 aColor;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vGlint;
${NOISE}
float easeInOutCubic(float p) { return p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; }
void main() {
  vec3 target = vec3(uLogo.x + aUv.x * uLogo.z - uView.x * 0.5, uView.y * 0.5 - (uLogo.y + aUv.y * uLogo.w), 0.0);
  float ts = mix(uEnterStart, uEnterEnd, aRand.x);
  float jitter = (aRand.y - 0.5) * 0.6;
  float ta = max(mix(uConvergeStart, uConvergeEnd - 0.3, aUv.x) + jitter, ts + 0.6);
  float e = easeInOutCubic(clamp((uTime - ts) / (ta - ts), 0.0, 1.0));
  vec3 spawn = vec3(
    mix(uSpawnXMin, uSpawnXMax, aRand.z),
    target.y + (aRand.w - 0.5) * 2.0 * uSpawnYSpread,
    (fract(aRand.x * 7.31 + aRand.z * 3.17) - 0.5) * 2.0 * uSpawnZ);
  vec3 pos = mix(spawn, target, e);
  float amp = sin(3.14159265 * e);
  if (amp > 0.001) {
    float timeFlow = uTime * 0.35;
    vec3 flow = curl(pos * 0.0032 + vec3(timeFlow, uSeed * 0.013, 0.0)) * 150.0
              + curl(pos * 0.011 + vec3(-timeFlow * 0.6, 0.0, uSeed * 0.007)) * 45.0;
    pos += flow * amp * uTurbulence;
    pos.y += uUpdraft * 110.0 * amp * (0.5 + 0.5 * aRand.y);
    pos.x += sin(uTime * 2.3 + aRand.x * 6.2831) * 18.0 * amp;
  }
  float alpha = smoothstep(ts, ts + 0.2, uTime) * (1.0 - smoothstep(uCrossfadeStart, uCrossfadeEnd, uTime));
  float glint = step(fract(aRand.w * 13.7 + aRand.y * 5.3), uGlintRatio);
  alpha *= mix(1.0, 0.55 + 0.45 * sin(uTime * (3.0 + 4.0 * aRand.y) + aRand.z * 6.2831), glint);
  vec3 gold = vec3(1.0, 0.72, 0.30) * 1.8;
  vColor = mix(aColor, gold, uBrighten * (1.0 - e) * (0.6 + 0.4 * aRand.w));
  vAlpha = alpha;
  vGlint = glint;
  float depth = clamp(pos.z / max(uSpawnZ, 1.0), -1.0, 1.0);
  gl_PointSize = mix(uSizeMin, uSizeMax, aRand.w) * (1.0 + 0.45 * depth) * mix(1.0, 2.6, glint) * uDpr;
  gl_Position = vec4(pos.xy / (uView * 0.5), 0.0, 1.0);
}`;

  var MOTE_VS = `precision highp float;
uniform float uTime, uSeed, uTurbulence, uSizeMin, uSizeMax, uDpr, uFade;
uniform vec2 uView;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;
varying float vGlint;
${NOISE}
void main() {
  float span = uView.x + 400.0;
  float x = mod(aRand.x * span + uTime * (40.0 + 60.0 * aRand.y), span) - span * 0.5;
  float y = (aRand.z - 0.5) * uView.y * 1.1 + sin(uTime * (0.4 + aRand.w) + aRand.x * 6.2831) * 40.0;
  vec3 pos = vec3(x, y, (aRand.w - 0.5) * 400.0);
  pos += curl(pos * 0.002 + vec3(uTime * 0.1, uSeed * 0.013, 0.0)) * 60.0 * uTurbulence;
  float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + 2.0 * aRand.y) + aRand.z * 6.2831);
  vAlpha = 0.35 * smoothstep(0.0, 1.0, uTime) * twinkle * uFade;
  vColor = vec3(1.0, 0.78, 0.40) * 1.3;
  vGlint = step(aRand.x, 0.15);
  float depth = clamp(pos.z / 300.0, -1.0, 1.0);
  gl_PointSize = mix(uSizeMin, uSizeMax, aRand.w) * (1.1 + 0.4 * depth) * mix(1.0, 2.2, vGlint) * uDpr;
  gl_Position = vec4(pos.xy / (uView * 0.5), 0.0, 1.0);
}`;

  var FS_HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  /* 둥근 부드러운 점, 반짝임 입자는 4방향 별. 선형 색의 premultiplied alpha */
  var POINT_FS = FS_HEAD + `varying vec3 vColor;
varying float vAlpha;
varying float vGlint;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  float a = 1.0 - smoothstep(0.55, 1.0, d);
  if (vGlint > 0.5) {
    float arms = max(1.0 - smoothstep(0.0, 0.14, abs(uv.x)), 1.0 - smoothstep(0.0, 0.14, abs(uv.y)));
    a = max(a * 0.55, arms * (1.0 - smoothstep(0.15, 1.0, d)));
  }
  a *= vAlpha;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(vColor * a, a);
}`;

  /* ---- 블룸: postprocessing BloomEffect(mipmapBlur)와 같은 구성. 밝기 추출 → 13탭 다운샘플 → 텐트 업샘플 → SCREEN 합성 → sRGB ---- */
  var QUAD_VS = 'attribute vec2 aPos;\nvarying vec2 vUv;\nvoid main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';

  var LUM_FS = FS_HEAD + `uniform sampler2D uTex;
uniform float uThreshold, uSmoothing;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = c * smoothstep(uThreshold, uThreshold + uSmoothing, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
}`;

  var DOWN_FS = FS_HEAD + `uniform sampler2D uTex;
uniform vec2 uTexel;
varying vec2 vUv;
vec4 s(vec2 o) { return texture2D(uTex, vUv + o * uTexel); }
void main() {
  vec4 c = s(vec2(0.0)) * 0.125;
  c += (s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0)) + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0))) * 0.125;
  c += (s(vec2(-2.0, 2.0)) + s(vec2(2.0, 2.0)) + s(vec2(-2.0, -2.0)) + s(vec2(2.0, -2.0))) * 0.03125;
  c += (s(vec2(0.0, 2.0)) + s(vec2(-2.0, 0.0)) + s(vec2(2.0, 0.0)) + s(vec2(0.0, -2.0))) * 0.0625;
  gl_FragColor = c;
}`;

  var UP_FS = FS_HEAD + `uniform sampler2D uTex;
uniform sampler2D uSupport;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
vec4 s(vec2 o) { return texture2D(uTex, vUv + o * uTexel); }
void main() {
  vec4 c = s(vec2(0.0)) * 4.0;
  c += (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0;
  c += s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
  gl_FragColor = mix(texture2D(uSupport, vUv), c / 16.0, uRadius);
}`;

  /* 캔버스는 불투명 검정 + CSS mix-blend-mode:screen 이라 검정은 사라지고 빛만 영상 위에 더해진다 */
  var OUT_FS = FS_HEAD + `uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(uScene, vUv).rgb;
  vec3 b = texture2D(uBloom, vUv).rgb * uIntensity;
  vec3 c = max(s + b - min(s * b, 1.0), 0.0);
  gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0);
}`;

  /* ---- 로고 픽셀 샘플링: 화면에 보이는 크기 그대로, CSS 1px 마다 입자 1개 ---- */
  var SRGB = new Float32Array(256);
  for (var k = 0; k < 256; k++) { var c = k / 255; SRGB[k] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sampleLogo() {
    var r = logo.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(logo, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h).data;
    var count = 0, i, x, y, o, n = 0;
    for (i = 3; i < data.length; i += 4) if (data[i] >= P.alphaThreshold) count++;
    var uv = new Float32Array(count * 2), color = new Float32Array(count * 3), rand = new Float32Array(count * 4);
    var next = mulberry32(P.seed * 7919 + 17);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        o = (y * w + x) * 4;
        if (data[o + 3] < P.alphaThreshold) continue;
        uv[n * 2] = (x + 0.5) / w; uv[n * 2 + 1] = (y + 0.5) / h;
        color[n * 3] = SRGB[data[o]]; color[n * 3 + 1] = SRGB[data[o + 1]]; color[n * 3 + 2] = SRGB[data[o + 2]];
        rand[n * 4] = next(); rand[n * 4 + 1] = next(); rand[n * 4 + 2] = next(); rand[n * 4 + 3] = next();
        n++;
      }
    }
    return { count: count, uv: uv, color: color, rand: rand };
  }

  /* ---- WebGL 준비 ---- */
  var progDust, progMote, progLum, progDown, progUp, progOut, vaoDust, vaoMote, vaoQuad, dustCount, fmt, T = null;

  function program(vs, fs, attribs) {
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    attribs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  /* 숫자 → float, [a,b] → vec2, [a,b,c,d] → vec4 */
  function set(prog, vals) {
    gl.useProgram(prog.p);
    for (var name in vals) {
      var loc = prog.u[name], v = vals[name];
      if (!loc) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    }
  }
  function samplers(prog, names) {
    gl.useProgram(prog.p);
    names.forEach(function (name, i) { if (prog.u[name]) gl.uniform1i(prog.u[name], i); });
  }

  function vao(buffers) {
    var a = gl.createVertexArray();
    gl.bindVertexArray(a);
    buffers.forEach(function (b, loc) {
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, b.size, gl.FLOAT, false, 0, 0);
    });
    gl.bindVertexArray(null);
    return a;
  }

  function initGL(s) {
    progDust = program(DUST_VS, POINT_FS, ['aUv', 'aColor', 'aRand']);
    progMote = program(MOTE_VS, POINT_FS, ['aRand']);
    progLum = program(QUAD_VS, LUM_FS, ['aPos']);
    progDown = program(QUAD_VS, DOWN_FS, ['aPos']);
    progUp = program(QUAD_VS, UP_FS, ['aPos']);
    progOut = program(QUAD_VS, OUT_FS, ['aPos']);

    dustCount = s.count;
    vaoDust = vao([{ data: s.uv, size: 2 }, { data: s.color, size: 3 }, { data: s.rand, size: 4 }]);
    var next = mulberry32(P.seed * 31 + 7), moteRand = new Float32Array(P.moteCount * 4);
    for (var i = 0; i < moteRand.length; i++) moteRand[i] = next();
    vaoMote = vao([{ data: moteRand, size: 4 }]);
    vaoQuad = vao([{ data: new Float32Array([-1, -1, 3, -1, -1, 3]), size: 2 }]);

    set(progDust, {
      uSeed: P.seed, uEnterStart: P.enterStart, uEnterEnd: P.enterEnd, uConvergeStart: P.convergeStart, uConvergeEnd: P.convergeEnd,
      uCrossfadeStart: P.crossfadeStart, uCrossfadeEnd: P.crossfadeEnd, uSpawnZ: P.spawnZ, uTurbulence: P.turbulence,
      uUpdraft: P.updraft, uBrighten: P.brighten, uSizeMin: P.sizeMin, uSizeMax: P.sizeMax, uGlintRatio: P.glintRatio
    });
    set(progMote, { uSeed: P.seed, uTurbulence: P.turbulence, uSizeMin: P.sizeMin, uSizeMax: P.sizeMax });
    set(progLum, { uThreshold: P.bloomThreshold, uSmoothing: P.bloomSmoothing });
    set(progUp, { uRadius: P.bloomRadius });
    set(progOut, { uIntensity: P.bloomIntensity });
    samplers(progLum, ['uTex']);
    samplers(progDown, ['uTex']);
    samplers(progUp, ['uTex', 'uSupport']);
    samplers(progOut, ['uScene', 'uBloom']);

    /* 1을 넘는 금색이 블룸까지 살아 있도록 half float. 렌더 타깃으로 못 쓰는 환경은 8bit */
    fmt = gl.getExtension('EXT_color_buffer_float')
      ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
  }

  function target(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: tex, fb: fb, w: w, h: h, ok: ok };
  }
  function freeTargets() {
    if (!T) return;
    [T.scene].concat(T.down, T.up).forEach(function (t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } });
    T = null;
  }
  function buildTargets(w, h) {
    freeTargets();
    T = { w: w, h: h, scene: target(w, h), down: [], up: [] };
    var lw = w, lh = h, ok = T.scene.ok;
    for (var i = 0; i < P.bloomLevels; i++) {
      lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1);
      T.down.push(target(lw, lh));
      T.up.push(i < P.bloomLevels - 1 ? target(lw, lh) : null);
    }
    if (ok || fmt.type === gl.UNSIGNED_BYTE) return;
    fmt = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    buildTargets(w, h);
  }

  var view = [1, 1], dpr = 1;
  function resize() {
    var cw = hero.clientWidth, ch = hero.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, P.maxDpr);
    view = [cw, ch];
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (T && T.w === w && T.h === h) return;
    canvas.width = w; canvas.height = h;
    buildTargets(w, h);
  }

  /* ---- 그리기 ---- */
  function bindTarget(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(0, 0, t ? t.w : T.w, t ? t.h : T.h);
  }
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); }
  function quad() { gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function draw(t) {
    var hr = hero.getBoundingClientRect(), lr = logo.getBoundingClientRect(), L = P.bloomLevels, i, src;

    bindTarget(T.scene);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (t < P.crossfadeEnd) {
      set(progDust, {
        uTime: t, uDpr: dpr, uView: view, uLogo: [lr.left - hr.left, lr.top - hr.top, lr.width, lr.height],
        uSpawnXMin: -view[0] / 2 + P.spawnXMin * view[0], uSpawnXMax: -view[0] / 2 + P.spawnXMax * view[0], uSpawnYSpread: P.spawnYSpread * view[1]
      });
      gl.bindVertexArray(vaoDust);
      gl.drawArrays(gl.POINTS, 0, dustCount);
    }
    set(progMote, { uTime: t, uDpr: dpr, uView: view, uFade: 1 - smoothstep(P.motesOutStart, P.motesOutEnd, t) });
    gl.bindVertexArray(vaoMote);
    gl.drawArrays(gl.POINTS, 0, P.moteCount);
    gl.disable(gl.BLEND);

    bindTarget(T.down[0]);
    gl.useProgram(progLum.p);
    bindTex(0, T.scene);
    quad();
    gl.useProgram(progDown.p);
    for (i = 1; i < L; i++) {
      bindTarget(T.down[i]);
      bindTex(0, T.down[i - 1]);
      gl.uniform2f(progDown.u.uTexel, 1 / T.down[i - 1].w, 1 / T.down[i - 1].h);
      quad();
    }
    gl.useProgram(progUp.p);
    for (i = L - 2; i >= 0; i--) {
      src = i === L - 2 ? T.down[L - 1] : T.up[i + 1];
      bindTarget(T.up[i]);
      bindTex(0, src);
      bindTex(1, T.down[i]);
      gl.uniform2f(progUp.u.uTexel, 1 / src.w, 1 / src.h);
      quad();
    }

    bindTarget(null);
    gl.useProgram(progOut.p);
    bindTex(0, T.scene);
    bindTex(1, T.up[0]);
    quad();
  }
  function smoothstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /* ---- 진행: 한 프레임에 최대 0.1초만 흐른다. 탭이 가려져 rAF 가 멈췄다 돌아와도 이어서 재생하고, 느린 기기(10fps 이상)는 실제 시간대로 재생된다 ---- */
  var time = 0, last = 0, logoShown = false, glintShown = false;

  function addGlint() {
    glint = document.createElement('span');
    glint.className = 'tr-glint';
    glint.setAttribute('aria-hidden', 'true');
    var mask = 'url("' + (logo.currentSrc || logo.src) + '")';
    glint.style.webkitMaskImage = mask;
    glint.style.maskImage = mask;
    glint.style.left = logo.offsetLeft + 'px';
    glint.style.top = logo.offsetTop + 'px';
    glint.style.width = logo.offsetWidth + 'px';
    glint.style.height = logo.offsetHeight + 'px';
    logo.closest('h1').appendChild(glint);
  }

  function frame(now) {
    raf = 0;
    if (done) return;
    var dt = (now - last) / 1000;
    last = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    if (!logoShown && time >= P.crossfadeStart) { logoShown = true; html.classList.add('tr-in'); }
    if (!glintShown && time >= P.glintAt) { glintShown = true; addGlint(); }
    if (time >= P.end) { finish(); return; }
    try { resize(); draw(time); } catch (e) { giveUp(); return; }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (done || performance.now() - budgetFrom > P.startBudgetMs) { giveUp(); return; }
    var hr = hero.getBoundingClientRect();
    if (hr.bottom <= 0 || hr.top >= window.innerHeight) { giveUp(); return; }
    canvas = document.createElement('canvas');
    canvas.className = 'tr-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true,
      preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true
    });
    if (!gl) { giveUp(); return; }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); giveUp(); });
    var s = sampleLogo();
    if (!s.count) { giveUp(); return; }
    initGL(s);
    if (performance.now() - budgetFrom > P.startBudgetMs) { giveUp(); return; }
    hero.appendChild(canvas);
    resize();
    html.classList.add('tr-run');
    html.classList.remove('tr-pending', 'tr-wait');
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function whenVisible(fn) {
    if (!document.hidden) { fn(); return; }
    document.addEventListener('visibilitychange', function onVisible() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onVisible);
      budgetFrom = performance.now();
      fn();
    });
  }
  function whenLogoReady(fn) {
    if (logo.complete && logo.naturalWidth) { fn(); return; }
    logo.addEventListener('load', fn, { once: true });
    logo.addEventListener('error', giveUp, { once: true });
  }

  whenVisible(function () {
    whenLogoReady(function () {
      try { start(); } catch (e) { giveUp(); }
    });
  });
})();
