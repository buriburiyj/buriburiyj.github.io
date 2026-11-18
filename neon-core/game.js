/* NEON CORE — game.js
 * 오늘의 시드로 열리는 3D 네온 아레나. three.js(로컬 번들) + Web Audio 합성.
 *
 * 구조
 *   boot → lobby → playing(wave → boss) → over
 *   - 시드: seed.js (daily.json 우선, 실패 시 파이썬과 같은 알고리즘으로 로컬 계산)
 *   - 렌더: 바닥 셰이더 그리드 + 경계 에너지월 + 파티클 + 인스턴스 탄환
 *   - 조작: 키보드(WASD/방향키, Space 대시) · 터치(왼쪽 드래그, DASH 버튼) · 자동 사격
 */

import * as THREE from './vendor/three.module.min.js';
import { loadToday, kstDateKey } from './seed.js';

/* ------------------------------------------------------------------ helpers */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  },
};

/* --------------------------------------------------------------- audio */
class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = store.get('nc.muted', false) === true;
    this.ambient = null;
    this.ambTimer = null;
    this.steps = [0, 2, 3, 5, 7, 8, 10];
    this.root = 110;
    this.tempo = 124;
    this.ready = false;
  }

  init(seed) {
    if (seed && seed.music) {
      this.steps = seed.music.steps || this.steps;
      this.root = seed.music.root || this.root;
      this.tempo = seed.music.tempo || this.tempo;
    }
    if (this.ctx) { this.applyMute(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.ready = true;
    } catch (e) { this.ctx = null; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  applyMute() {
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  toggle() {
    this.muted = !this.muted;
    store.set('nc.muted', this.muted);
    this.applyMute();
    return this.muted;
  }

  tone({ type = 'sine', from = 440, to = 440, dur = 0.12, gain = 0.08, delay = 0 }) {
    if (!this.ready || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.12, from = 1800, to = 120, q = 1 }) {
    if (!this.ready || this.muted) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.6;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = q;
    filt.frequency.setValueAtTime(from, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0);
  }

  shoot() { this.tone({ type: 'square', from: 900, to: 420, dur: 0.05, gain: 0.018 }); }
  hit() { this.tone({ type: 'triangle', from: 320, to: 180, dur: 0.06, gain: 0.03 }); }
  explode(big = false) {
    this.noise({ dur: big ? 0.5 : 0.22, gain: big ? 0.22 : 0.10, from: big ? 1400 : 2400, to: 70 });
    this.tone({ type: 'sine', from: big ? 160 : 240, to: 40, dur: big ? 0.4 : 0.18, gain: big ? 0.12 : 0.05 });
  }
  hurt() {
    this.tone({ type: 'sawtooth', from: 220, to: 70, dur: 0.28, gain: 0.09 });
    this.noise({ dur: 0.18, gain: 0.07, from: 900, to: 120 });
  }
  dash() { this.tone({ type: 'sawtooth', from: 260, to: 1100, dur: 0.16, gain: 0.045 }); }
  pickup() {
    [0, 4, 7].forEach((n, i) => this.tone({
      type: 'triangle', from: this.freq(n), to: this.freq(n), dur: 0.12, gain: 0.05, delay: i * 0.06,
    }));
  }
  waveClear() {
    [0, 4, 7, 12].forEach((n, i) => this.tone({
      type: 'sine', from: this.freq(n), to: this.freq(n), dur: 0.3, gain: 0.05, delay: i * 0.08,
    }));
  }
  bossWarn() {
    [0, 6].forEach((n, i) => this.tone({
      type: 'square', from: this.freq(n) / 2, to: this.freq(n) / 2, dur: 0.5, gain: 0.05, delay: i * 0.5,
    }));
  }
  win() {
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone({
      type: 'triangle', from: this.freq(n), to: this.freq(n), dur: 0.45, gain: 0.06, delay: i * 0.12,
    }));
  }
  lose() {
    [12, 7, 3, 0].forEach((n, i) => this.tone({
      type: 'sawtooth', from: this.freq(n), to: this.freq(n) * 0.98, dur: 0.5, gain: 0.05, delay: i * 0.18,
    }));
  }

  freq(semitone) {
    const steps = this.steps;
    const octave = Math.floor(semitone / 12);
    const idx = ((semitone % 12) + 12) % 12;
    // 음계 안에서 가장 가까운 계단으로 (없으면 그대로 반음)
    let note = idx;
    if (!steps.includes(idx)) note = steps.reduce((best, s) => (Math.abs(s - idx) < Math.abs(best - idx) ? s : best), 0);
    return this.root * 2 ** ((note + octave * 12) / 12);
  }

  startAmbient() {
    if (!this.ready || this.ambTimer) return;
    const beat = 60 / this.tempo;
    const play = () => {
      if (this.muted) return;
      const n = pick(this.steps) + (Math.random() < 0.3 ? 12 : 0);
      this.tone({ type: 'sine', from: this.freq(n), to: this.freq(n), dur: beat * 1.6, gain: 0.022 });
      if (Math.random() < 0.5) {
        this.tone({ type: 'triangle', from: this.freq(n) / 2, to: this.freq(n) / 2, dur: beat * 2.4, gain: 0.016 });
      }
    };
    play();
    this.ambTimer = setInterval(play, beat * 2000);
  }

  stopAmbient() {
    if (this.ambTimer) { clearInterval(this.ambTimer); this.ambTimer = null; }
  }
}

/* --------------------------------------------------------------- textures */
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ---------------------------------------------------------------- constants */
const PLAYER = {
  radius: 0.85,
  speed: 17.5,
  fireInterval: 0.155,
  bulletSpeed: 36,
  bulletDamage: 26,
  dashSpeed: 48,
  dashTime: 0.2,
  dashCooldown: 1.5,
  iframeAfterHit: 1.05,
};

const ENEMY_TYPES = {
  drifter: { hp: 22, speed: 6.2, radius: 1.0, score: 100, contact: 13, color: 'secondary' },
  orbiter: { hp: 34, speed: 4.6, radius: 1.1, score: 160, contact: 11, color: 'accent', fireEvery: 2.4 },
  sniper: { hp: 30, speed: 3.4, radius: 1.0, score: 210, contact: 10, color: 'secondary', fireEvery: 3.0 },
  splitter: { hp: 64, speed: 3.8, radius: 1.45, score: 280, contact: 16, color: 'accent' },
  drone: { hp: 16, speed: 8.2, radius: 0.8, score: 90, contact: 9, color: 'boss' },
};

/* ------------------------------------------------------------------ engine */
class Game {
  constructor(seed) {
    this.seed = seed;
    this.theme = seed.theme;
    this.R = seed.arena.radius || 27;
    this.spawn = seed.spawn || {};
    this.state = 'lobby';
    this.synth = new Synth();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.shake = 0;
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.particles = [];
    this.pickups = [];
    this.meteors = [];
    this.boss = null;
    this.run = null;
    this.cameraTarget = new THREE.Vector3();
    this.vec = new THREE.Vector3();
    this.input = { x: 0, z: 0, dash: false };
    this.keys = new Set();
    this.joystick = { active: false, id: null, ox: 0, oy: 0, x: 0, z: 0 };
    this.lastHud = {};
    this.build();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.renderLoop();
  }

  /* --------------------------------------------------------------- build */
  build() {
    const canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.sky || '#04010a');
    this.scene.fog = new THREE.FogExp2(new THREE.Color(this.theme.fog || '#07030f'), 0.016);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);
    this.camera.position.set(0, 36, 26);
    this.camera.lookAt(0, 0, 0);

    this.buildFloor();
    this.buildWall();
    this.buildCore();
    this.buildStars();
    this.buildPlayer();
    this.buildPools();
  }

  color(name) { return new THREE.Color(this.theme[name] || '#ffffff'); }

  buildFloor() {
    const R = this.R;
    const geo = new THREE.CircleGeometry(R * 1.34, 128);
    this.floorUniforms = {
      uTime: { value: 0 },
      uA: { value: new THREE.Color(this.theme.floor || '#120a22') },
      uB: { value: this.color('primary') },
      uC: { value: this.color('secondary') },
      uR: { value: R },
      uGrid: { value: this.seed.arena.grid || 2 },
      uPlayer: { value: new THREE.Vector2(0, 0) },
      uPulse: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.floorUniforms,
      transparent: false,
      vertexShader: `
        varying vec2 vXZ;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vXZ;
        uniform float uTime, uR, uGrid, uPulse;
        uniform vec3 uA, uB, uC;
        uniform vec2 uPlayer;
        void main() {
          float r = length(vXZ);
          vec2 cell = vXZ / uGrid;
          vec2 g = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(0.0001));
          float line = 1.0 - min(min(g.x, g.y), 1.0);
          vec2 cell5 = vXZ / (uGrid * 5.0);
          vec2 g5 = abs(fract(cell5 - 0.5) - 0.5) / max(fwidth(cell5), vec2(0.0001));
          float line5 = 1.0 - min(min(g5.x, g5.y), 1.0);
          float fade = exp(-r * 0.05);
          vec3 col = uA * 0.55;
          col += mix(uB, uC, 0.3) * line * fade * 0.26;
          col += uC * line5 * fade * 0.30;
          float ring = sin(r * 1.15 - uTime * 1.8) * 0.5 + 0.5;
          ring = pow(ring, 8.0) * exp(-r * 0.06) * (0.18 + uPulse);
          col += uC * ring * 0.30;
          float core = exp(-r * 0.3) * (0.5 + 0.5 * sin(uTime * 1.4));
          col += mix(uB, uC, 0.5) * core * 0.14;
          float edge = smoothstep(uR - 4.0, uR - 0.3, r);
          col += uC * edge * 0.55;
          float halo = exp(-length(vXZ - uPlayer) * 1.05) * 0.42;
          col += uB * halo;
          col *= 1.0 - smoothstep(uR * 1.06, uR * 1.28, r);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.floor = new THREE.Mesh(geo, mat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = 0;
    this.scene.add(this.floor);
  }

  buildWall() {
    const R = this.R;
    const geo = new THREE.CylinderGeometry(R, R, 7, 96, 1, true);
    const uniforms = {
      uTime: { value: 0 },
      uA: { value: this.color('secondary') },
      uB: { value: this.color('accent') },
      uPlayer: { value: new THREE.Vector2(0, 0) },
    };
    this.wallUniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec2 vUv; varying vec3 vPos;
        void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv; varying vec3 vPos;
        uniform float uTime; uniform vec3 uA, uB; uniform vec2 uPlayer;
        void main(){
          float y = vUv.y;
          float fade = pow(1.0 - y, 2.2);
          float stripes = 0.5 + 0.5 * sin(vUv.x * 180.0 + uTime * 1.2);
          float h = 0.55 + 0.45 * sin(uUv(vPos) * 3.0 + uTime * 2.0);
          float scan = smoothstep(0.0, 0.06, abs(fract(y * 2.0 - uTime * 0.35) - 0.5));
          vec3 col = mix(uA, uB, stripes);
          float a = fade * (0.09 + 0.12 * stripes) + fade * (1.0 - scan) * 0.04;
          gl_FragColor = vec4(col, a);
        }`,
    });
    // uUv(vPos) 는 GLSL 에 없는 임시 표현 → 단순화한 식으로 교체
    mat.fragmentShader = mat.fragmentShader
      .replace('float h = 0.55 + 0.45 * sin(uUv(vPos) * 3.0 + uTime * 2.0);',
        'float h = 0.55 + 0.45 * sin(vPos.y * 3.0 + uTime * 2.0);');
    const wall = new THREE.Mesh(geo, mat);
    wall.position.y = 3.5;
    this.scene.add(wall);

    const ringGeo = new THREE.TorusGeometry(R, 0.055, 6, 160);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.color('secondary'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.boundary = new THREE.Mesh(ringGeo, ringMat);
    this.boundary.rotation.x = -Math.PI / 2;
    this.boundary.position.y = 0.06;
    this.scene.add(this.boundary);
  }

  buildCore() {
    // 아레나 한가운데의 '코어 오벨리스크'. 지켜야 할 구조물처럼 보이게 지면에서 솟는다.
    const group = new THREE.Group();
    group.position.set(0, 0, 0);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 1.25, 7.4, 6, 1, false),
      new THREE.MeshBasicMaterial({ color: this.color('primary'), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    shaft.position.y = 3.7;
    const cage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 1.32, 7.4, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: this.color('secondary'), wireframe: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    cage.position.y = 3.7;
    const tip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({ color: this.color('accent'), wireframe: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    tip.position.y = 7.9;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: this.color('accent'), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(7);
    glow.position.y = 7.9;
    group.add(shaft, cage, tip, glow);
    this.coreWire = tip;
    this.coreSolid = shaft;
    this.coreGlow = glow;

    const ringMat = new THREE.MeshBasicMaterial({
      color: this.color('accent'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.coreRings = [];
    for (let i = 0; i < 2; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6 + i * 1.3, 0.028, 4, 96), ringMat.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 2.2 + i * 1.5;
      group.add(ring);
      this.coreRings.push(ring);
    }

    // 위로 이어지는 빛기둥
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 18, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.color('accent'), transparent: true, opacity: 0.045, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    beam.position.y = 16.5;
    group.add(beam);
    this.coreBeam = beam;

    // 바닥의 코어 패드
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(2.9, 3.35, 64),
      new THREE.MeshBasicMaterial({ color: this.color('accent'), transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.09;
    group.add(pad);
    this.corePad = pad;

    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(2.9, 48),
      new THREE.MeshBasicMaterial({ color: this.color('primary'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.07;
    group.add(pool);

    // 장식 기둥 (시드의 cover 수)
    const count = clamp(this.seed.arena.cover | 0, 0, 6);
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU + 0.4;
      const dist = this.R * 1.12;
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.7, 9 + (i % 3) * 3, 6),
        new THREE.MeshBasicMaterial({ color: this.color(i % 2 ? 'accent' : 'secondary'), wireframe: true, transparent: true, opacity: 0.35 }),
      );
      pylon.position.set(Math.cos(angle) * dist, 4.5, Math.sin(angle) * dist);
      this.scene.add(pylon);
    }
    this.scene.add(group);
    this.coreGroup = group;
  }

  buildStars() {
    const count = 900;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c1 = this.color('secondary');
    const c2 = this.color('primary');
    for (let i = 0; i < count; i += 1) {
      const r = rnd(190, 60);
      const theta = rnd(TAU);
      const phi = Math.acos(rnd(1, -0.3));
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.abs(Math.cos(phi)) * r * 0.6 + 4;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      const c = Math.random() < 0.5 ? c1 : c2;
      const k = rnd(1, 0.35);
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9, map: glowTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.8,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  buildPlayer() {
    const group = new THREE.Group();
    const bodyGeo = new THREE.ConeGeometry(0.85, 2.6, 4);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: this.color('primary') }));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.5;
    const cage = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({
      color: this.color('secondary'), wireframe: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    cage.rotation.x = Math.PI / 2;
    cage.position.y = 0.5;
    cage.scale.setScalar(1.12);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: this.color('primary'), transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(7);
    halo.position.y = 0.6;
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.72, 40),
      new THREE.MeshBasicMaterial({
        color: this.color('accent'), transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.06;
    this.playerMark = mark;
    group.add(body, cage, halo, mark);
    group.position.set(0, 0, 8);
    group.scale.setScalar(1.15);
    this.playerMesh = group;
    this.playerHalo = halo;
    this.scene.add(group);

    // 엔진 트레일 (파티클로 처리)
  }

  buildPools() {
    // 플레이어 탄환
    const bulletGeo = new THREE.SphereGeometry(0.16, 6, 6);
    const bulletMat = new THREE.MeshBasicMaterial({
      color: this.color('secondary'), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.bulletMesh = new THREE.InstancedMesh(bulletGeo, bulletMat, 220);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.frustumCulled = false;
    this.scene.add(this.bulletMesh);

    const eGeo = new THREE.SphereGeometry(0.3, 6, 6);
    const eMat = new THREE.MeshBasicMaterial({
      color: this.color('accent'), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ebulletMesh = new THREE.InstancedMesh(eGeo, eMat, 360);
    this.ebulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ebulletMesh.frustumCulled = false;
    this.scene.add(this.ebulletMesh);

    // 파티클 (한 번에 900개)
    this.PMAX = 900;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.PMAX * 3);
    this.pCol = new Float32Array(this.PMAX * 3);
    this.pSize = new Float32Array(this.PMAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vC;
        void main(){
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.02, length(d));
          gl_FragColor = vec4(vC, a);
        }`,
    });
    this.pointCloud = new THREE.Points(geo, mat);
    this.pointCloud.frustumCulled = false;
    this.scene.add(this.pointCloud);
    this.pGeo = geo;

    // 팡 터지는 링 (폭발)
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 40);
    for (let i = 0; i < 10; i += 1) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: this.color('accent'), transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 0.6, scale: 1 });
    }
  }

  /* --------------------------------------------------------------- input */
  bindInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === ' ' && this.state === 'playing') this.doDash();
      if (k === 'escape' || k === 'p') this.togglePause();
      if (k === 'm') this.toggleSound();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    const canvas = $('scene');
    const joyBase = $('joyBase');
    const joyKnob = $('joyKnob');
    this.joyBaseEl = joyBase;
    this.joyKnobEl = joyKnob;

    const startJoy = (e) => {
      if (this.state !== 'playing') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.clientX > window.innerWidth * 0.62) return;
      this.joystick.active = true;
      this.joystick.id = e.pointerId;
      this.joystick.ox = e.clientX;
      this.joystick.oy = e.clientY;
      joyBase.style.left = e.clientX + 'px';
      joyBase.style.top = e.clientY + 'px';
      joyBase.classList.add('on');
      moveJoy(e);
    };
    const moveJoy = (e) => {
      if (!this.joystick.active || e.pointerId !== this.joystick.id) return;
      const dx = e.clientX - this.joystick.ox;
      const dy = e.clientY - this.joystick.oy;
      const max = 52;
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      const nx = dx * k;
      const ny = dy * k;
      joyKnob.style.transform = `translate(${nx}px, ${ny}px)`;
      const strength = Math.min(len / max, 1);
      const ang = Math.atan2(dy, dx);
      const dead = 0.12;
      if (strength < dead) { this.joystick.x = 0; this.joystick.z = 0; return; }
      this.joystick.x = Math.cos(ang) * strength;
      this.joystick.z = Math.sin(ang) * strength;
    };
    const endJoy = (e) => {
      if (!this.joystick.active || (e && e.pointerId !== this.joystick.id)) return;
      this.joystick.active = false;
      this.joystick.x = 0; this.joystick.z = 0;
      joyBase.classList.remove('on');
      joyKnob.style.transform = 'translate(0,0)';
    };
    canvas.addEventListener('pointerdown', startJoy);
    window.addEventListener('pointermove', (e) => { moveJoy(e); });
    window.addEventListener('pointerup', endJoy);
    window.addEventListener('pointercancel', endJoy);

    const dashBtn = $('btnDash');
    dashBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.doDash(); });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  doDash() {
    if (this.state !== 'playing' || !this.run) return;
    const run = this.run;
    if (run.dashCd > 0 || run.dead) return;
    run.dashCd = PLAYER.dashCooldown * (this.spawn.dash_cd || 1);
    run.dashT = PLAYER.dashTime;
    run.iframe = Math.max(run.iframe, PLAYER.dashTime + 0.12);
    this.synth.dash();
    this.burst(this.playerMesh.position, this.color('secondary'), 16, 10, 0.9);
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.synth.stopAmbient();
    $('pause').classList.remove('hidden');
    $('pauseInfo').textContent = this.run
      ? `점수 ${fmt(this.run.score)} · 웨이브 ${this.run.wave}/${this.seed.waves}${this.boss ? ' · 보스전' : ''}`
      : '';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    $('pause').classList.add('hidden');
    this.synth.resume();
    this.synth.startAmbient();
    this.clock.getDelta();
  }

  toggleSound() {
    this.synth.init(this.seed);
    const muted = this.synth.toggle();
    $('btnSound').textContent = muted ? '✕' : '♪';
    $('btnSound').style.opacity = muted ? 0.5 : 1;
  }

  /* --------------------------------------------------------------- loop */
  renderLoop() {
    const step = () => {
      requestAnimationFrame(step);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.state === 'playing') this.update(dt);
      this.animateScene(dt);
      this.renderer.render(this.scene, this.camera);
    };
    step();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w;
    this.fitCamera(true);
  }

  /** 시야 폭을 화면 비율에 맞춰 계산한다. 세로 화면은 아레나를 다 담으면 너무 작아져서
   *  플레이어를 따라가며 일부만 보여준다(경계는 바닥 광으로 확인). */
  fitCamera(force) {
    const portrait = this.portrait;
    const fov = portrait ? 60 : 56;
    this.camera.fov = fov;
    const aspect = this.camera.aspect || 1;
    const fitWidth = portrait ? Math.min(this.R * 2, 37) : Math.min(this.R * 2.1, 60);
    const hFov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    this.camDist = (fitWidth / 2) / Math.tan(hFov / 2);
    this.camTilt = portrait ? (68 * Math.PI) / 180 : (54 * Math.PI) / 180;
    this.camOffY = Math.sin(this.camTilt) * this.camDist;
    this.camOffZ = Math.cos(this.camTilt) * this.camDist;
    this.camera.updateProjectionMatrix();
  }

  animateScene(dt) {
    this.time += dt;
    const t = this.time;
    if (this.floorUniforms) {
      this.floorUniforms.uTime.value = t;
      this.floorUniforms.uPulse.value = this.boss ? 0.35 : 0.1;
      this.floorUniforms.uPlayer.value.set(this.playerMesh.position.x, this.playerMesh.position.z);
    }
    if (this.wallUniforms) this.wallUniforms.uTime.value = t;
    if (this.coreGroup) {
      this.coreWire.rotation.y = t * 0.9;
      this.coreWire.position.y = 7.9 + Math.sin(t * 1.6) * 0.16;
      this.coreRings[0].rotation.z = t * 0.45;
      this.coreRings[1].rotation.z = -t * 0.3;
      this.coreGlow.material.opacity = 0.4 + Math.sin(t * 1.6) * 0.14;
      this.corePad.rotation.z = t * 0.12;
    }
    if (this.stars) this.stars.rotation.y = t * 0.004;
    if (this.playerHalo) this.playerHalo.material.opacity = 0.6 + Math.sin(t * 6) * 0.08;
    if (this.boundary) this.boundary.material.opacity = 0.55 + Math.sin(t * 2.2) * 0.12;

    // 파티클 렌더
    this.flushParticles();
    this.flushRings(dt);
    this.flushBullets();

    // 카메라 추적
    const p = this.playerMesh.position;
    const portrait = this.portrait;
    const shake = this.shake;
    const limit = Math.max(0, this.R - 11);
    const tx = portrait ? clamp(p.x, -limit, limit) : p.x * 0.32;
    const tz = portrait ? clamp(p.z, -limit, limit) : p.z * 0.32;
    const k = 1 - Math.exp(-dt * (portrait ? 9 : 6));
    this.camera.position.x = lerp(this.camera.position.x, tx + rnd(shake, -shake), k);
    this.camera.position.z = lerp(this.camera.position.z, tz + this.camOffZ + rnd(shake, -shake), k);
    this.camera.position.y = lerp(this.camera.position.y, this.camOffY + rnd(shake, -shake), k);
    this.camera.lookAt(tx, 0, tz);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  /* --------------------------------------------------------------- run */
  start() {
    this.synth.init(this.seed);
    this.synth.resume();
    this.clearEntities();
    const maxHp = Math.round(100 * (this.spawn.player_hp || 1));
    this.run = {
      score: 0, kills: 0, combo: 0, comboT: 0, hp: maxHp, maxHp,
      wave: 1, waveT: 0, gapT: 0, spawnT: 0, elapsed: 0,
      dashCd: 0, dashT: 0, iframe: 1.2, fireT: 0, overdrive: 0,
      phase: 'wave', dead: false, meteorT: 3, bossRegenT: 8,
    };
    this.boss = null;
    this.state = 'playing';
    document.body.classList.add('playing');
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups = [];
    this.meteors = [];
    this.playerMesh.position.set(0, 0, this.R * 0.55);
    this.playerMesh.visible = true;
    this.playerMesh.scale.setScalar(1);
    $('lobby').classList.add('hidden');
    $('over').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.add('on');
    $('touch').classList.remove('hidden');
    $('bossBar').classList.remove('on');
    for (let i = 0; i < 3; i += 1) this.spawnEnemy(1);
    this.toast(`WAVE 1 / ${this.seed.waves}`, 1200);
    this.synth.startAmbient();
    this.lastHud = {};
    this.updateHud(true);
  }

  clearEntities() {
    this.enemies.forEach((e) => this.scene.remove(e.mesh));
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.pickups.forEach((p) => this.scene.remove(p.mesh));
    this.pickups = [];
    this.meteors.forEach((m) => { this.scene.remove(m.warn); });
    this.meteors = [];
    if (this.boss) {
      (this.boss.beams || []).forEach((beam) => this.scene.remove(beam));
      this.scene.remove(this.boss.mesh);
      this.boss = null;
    }
    this.particles.length = 0;
  }

  /* --------------------------------------------------------------- update */
  update(dt) {
    const run = this.run;
    if (!run || run.dead) return;
    run.elapsed += dt;
    run.dashCd = Math.max(0, run.dashCd - dt);
    run.dashT = Math.max(0, run.dashT - dt);
    run.iframe = Math.max(0, run.iframe - dt);
    run.overdrive = Math.max(0, run.overdrive - dt);
    run.comboT = Math.max(0, run.comboT - dt);
    if (run.comboT === 0 && run.combo > 0) run.combo = 0;

    this.updatePlayer(dt);
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateBoss(dt);
    this.updateMeteors(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateHud();
  }

  updatePlayer(dt) {
    const run = this.run;
    const p = this.playerMesh;
    let ix = 0; let iz = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) iz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) iz += 1;
    if (this.joystick.active) { ix = this.joystick.x; iz = this.joystick.z; }
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }

    // 중력 우물
    const gravity = this.spawn.gravity || 0;
    if (gravity > 0) {
      const d = Math.hypot(p.position.x, p.position.z) || 1;
      p.position.x -= (p.position.x / d) * gravity * dt;
      p.position.z -= (p.position.z / d) * gravity * dt;
    }

    const speed = run.dashT > 0 ? PLAYER.dashSpeed : PLAYER.speed;
    p.position.x += ix * speed * dt;
    p.position.z += iz * speed * dt;

    // 아레나 경계
    const rr = Math.hypot(p.position.x, p.position.z);
    const max = this.R - 1.2;
    if (rr > max) {
      p.position.x = (p.position.x / rr) * max;
      p.position.z = (p.position.z / rr) * max;
    }

    // 기체 회전 & 기울기
    const targetYaw = ix || iz ? Math.atan2(ix, iz) : p.rotation.y;
    p.rotation.y = lerp(p.rotation.y, targetYaw, 0.2);
    p.rotation.z = lerp(p.rotation.z, -ix * 0.18, 0.15);
    p.position.y = 0.15 + Math.sin(this.time * 3) * 0.08;

    // 피격 무적 깜빡임
    p.visible = run.iframe > 0 ? Math.floor(this.time * 20) % 2 === 0 : true;
    if (run.dashT > 0) {
      p.scale.setScalar(1 + Math.sin(run.dashT * 40) * 0.1);
      if (Math.random() < 0.6) this.burst(p.position, this.color('secondary'), 1, 3, 0.35);
    } else {
      p.scale.setScalar(1);
    }

    // 자동 사격
    run.fireT -= dt;
    const interval = PLAYER.fireInterval * (run.overdrive > 0 ? 0.55 : 1);
    if (run.fireT <= 0) {
      const target = this.nearestTarget(p.position, 34);
      if (target) {
        run.fireT = interval;
        const dir = this.vec.copy(target.position).sub(p.position);
        dir.y = 0;
        dir.normalize();
        const angle = Math.atan2(dir.x, dir.z);
        p.rotation.y = lerp(p.rotation.y, angle, 0.5);
        this.fireBullet(p.position, dir, PLAYER.bulletSpeed * (this.spawn.player_bullet_speed || 1), PLAYER.bulletDamage);
        this.synth.shoot();
      } else {
        run.fireT = 0.05;
      }
    }
    $('btnDash').classList.toggle('cool', run.dashCd > 0);
  }

  nearestTarget(pos, range) {
    let best = null;
    let bestD = range * range;
    this.enemies.forEach((e) => {
      const d = e.position.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = e; }
    });
    if (this.boss && this.boss.alive) {
      const d = this.boss.mesh.position.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = this.boss.mesh; }
    }
    return best;
  }

  /* --------------------------------------------------------------- waves */
  updateWaves(dt) {
    const run = this.run;
    if (run.phase === 'wave') {
      run.waveT += dt;
      run.spawnT -= dt;
      const cap = 22 + run.wave * 3;
      const duration = 15;
      if (run.spawnT <= 0 && this.enemies.length < cap) {
        this.spawnEnemy(run.wave);
        if (run.wave >= 3 && this.enemies.length < cap) this.spawnEnemy(run.wave);
        if (this.spawn.spawn_mul > 1.2 && Math.random() < 0.5) this.spawnEnemy(run.wave);
        run.spawnT = Math.max(0.42, 1.15 - run.wave * 0.07) * (this.spawn.spawn_mul > 1 ? 0.85 : 1);
      }
      if (run.waveT >= duration) {
        if (run.wave < this.seed.waves) {
          run.phase = 'gap';
          run.gapT = 2.4;
          this.addScore(400 * run.wave, true);
          this.toast(`WAVE ${run.wave} CLEAR\n+${fmt(400 * run.wave)}`, 1500);
          this.synth.waveClear();
          this.ringBurst(this.playerMesh.position, this.color('secondary'), 3);
        } else {
          this.startBoss();
        }
      }
    } else if (run.phase === 'gap') {
      run.gapT -= dt;
      if (run.gapT <= 0) {
        run.wave += 1;
        run.waveT = 0;
        run.spawnT = 0.4;
        run.phase = 'wave';
        this.toast(`WAVE ${run.wave} / ${this.seed.waves}`, 1200);
      }
    }
  }

  spawnEnemy(wave, forcedType) {
    const roll = Math.random();
    let type = forcedType;
    if (!type) {
      if (wave <= 1) type = 'drifter';
      else if (wave === 2) type = roll < 0.62 ? 'drifter' : 'orbiter';
      else if (wave === 3) type = roll < 0.5 ? 'drifter' : roll < 0.78 ? 'orbiter' : 'sniper';
      else if (wave === 4) type = roll < 0.4 ? 'drifter' : roll < 0.62 ? 'orbiter' : roll < 0.82 ? 'sniper' : 'splitter';
      else type = roll < 0.36 ? 'drifter' : roll < 0.6 ? 'orbiter' : roll < 0.78 ? 'sniper' : 'splitter';
    }
    const base = ENEMY_TYPES[type];
    const custom = type === 'drone';
    const hpMul = (1 + wave * 0.1) * (this.spawn.enemy_hp || 1);
    const angle = rnd(TAU);
    const dist = this.R - rnd(3.5, 1.2);
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0.6, Math.sin(angle) * dist);

    const enemy = {
      type, position: pos, hp: (custom ? base.hp : base.hp * hpMul),
      maxHp: custom ? base.hp : base.hp * hpMul,
      speed: base.speed * (this.spawn.enemy_speed || 1) * (1 + wave * 0.02),
      radius: base.radius, score: base.score, contact: base.contact,
      fireT: rnd(2.2, 0.6), charge: 0, phase: rnd(TAU), dead: false,
    };
    enemy.mesh = this.makeEnemyMesh(type, enemy);
    enemy.mesh.position.copy(pos);
    this.scene.add(enemy.mesh);
    this.enemies.push(enemy);
    return enemy;
  }

  makeEnemyMesh(type, enemy) {
    const group = new THREE.Group();
    let geo;
    if (type === 'drifter') geo = new THREE.OctahedronGeometry(1.15, 0);
    else if (type === 'orbiter') geo = new THREE.IcosahedronGeometry(1.0, 0);
    else if (type === 'sniper') geo = new THREE.TetrahedronGeometry(1.15, 0);
    else if (type === 'splitter') geo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    else geo = new THREE.OctahedronGeometry(0.7, 0);
    const col = this.color(ENEMY_TYPES[type].color === 'boss' ? 'boss' : ENEMY_TYPES[type].color);
    const solid = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: col, wireframe: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    wire.scale.setScalar(1.06);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: col, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(type === 'splitter' ? 8.4 : 6.2);
    group.add(solid, wire, halo);
    group.userData.spin = rnd(1.6, 0.5);
    return group;
  }

  updateEnemies(dt) {
    const p = this.playerMesh.position;
    const run = this.run;
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (e.dead) continue;
      const dx = p.x - e.position.x;
      const dz = p.z - e.position.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;

      if (e.type === 'orbiter') {
        // 플레이어 주위를 돌며 사격
        const desired = 11;
        const tangential = dist > desired ? 1 : -0.85;
        e.position.x += nx * e.speed * dt * 0.75 + -nz * e.speed * dt * tangential * 0.85;
        e.position.z += nz * e.speed * dt * 0.75 + nx * e.speed * dt * tangential * 0.85;
        e.fireT -= dt;
        if (e.fireT <= 0 && dist < 26) {
          e.fireT = ENEMY_TYPES.orbiter.fireEvery / (this.spawn.enemy_fire || 1);
          this.fireEnemyBullet(e.position, new THREE.Vector3(nx, 0, nz), 13);
        }
      } else if (e.type === 'sniper') {
        if (dist > 17) {
          e.position.x += nx * e.speed * dt;
          e.position.z += nz * e.speed * dt;
        }
        e.fireT -= dt;
        if (e.fireT <= 0) {
          e.charge += dt;
          if (e.charge > 0.9) {
            e.charge = 0;
            e.fireT = ENEMY_TYPES.sniper.fireEvery / (this.spawn.enemy_fire || 1);
            for (let k = -1; k <= 1; k += 1) {
              const a = Math.atan2(nx, nz) + k * 0.12;
              this.fireEnemyBullet(e.position, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 21);
            }
            this.burst(e.position, this.color('accent'), 5, 6, 0.5);
          }
        }
      } else {
        e.position.x += nx * e.speed * dt;
        e.position.z += nz * e.speed * dt;
      }

      // 아레나 안으로
      const rr = Math.hypot(e.position.x, e.position.z);
      if (rr > this.R - 0.8) {
        e.position.x = (e.position.x / rr) * (this.R - 0.8);
        e.position.z = (e.position.z / rr) * (this.R - 0.8);
      }

      e.mesh.position.copy(e.position);
      e.mesh.position.y = 0.7 + Math.sin(this.time * 2.4 + e.phase) * 0.25;
      e.mesh.rotation.x += dt * e.mesh.userData.spin;
      e.mesh.rotation.y += dt * e.mesh.userData.spin * 1.4;

      // 접촉 피해
      if (dist < e.radius + PLAYER.radius && run.iframe <= 0) {
        this.damagePlayer(e.contact);
        // 밀어내기
        e.position.x -= nx * 2.6;
        e.position.z -= nz * 2.6;
      }
    }
  }

  /* --------------------------------------------------------------- bullets */
  fireBullet(pos, dir, speed, damage, bounce) {
    if (this.bullets.length > 200) this.bullets.shift();
    const origin = pos.clone();
    origin.y = 0.7;
    this.bullets.push({
      pos: origin,
      vel: dir.clone().multiplyScalar(speed),
      damage,
      life: 1.8,
      bounced: bounce ? 0 : 1,
      color: this.color('secondary'),
    });
  }

  fireEnemyBullet(pos, dir, speed, color) {
    if (this.ebullets.length > 330) this.ebullets.shift();
    const origin = pos.clone();
    origin.y = 0.75;
    this.ebullets.push({
      pos: origin,
      vel: dir.clone().multiplyScalar(speed * (this.spawn.enemy_fire || 1)),
      life: 6,
      color: color || this.color('accent'),
    });
  }

  updateBullets(dt) {
    const R = this.R;
    const p = this.playerMesh.position;
    const run = this.run;

    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      const rr = Math.hypot(b.pos.x, b.pos.z);
      if (rr > R - 0.6) {
        if ((this.spawn.bounce || 0) > 0 && b.bounced === 0) {
          const nx = b.pos.x / rr;
          const nz = b.pos.z / rr;
          const dot = b.vel.x * nx + b.vel.z * nz;
          b.vel.x -= 2 * dot * nx;
          b.vel.z -= 2 * dot * nz;
          b.bounced = 1;
          b.pos.x = nx * (R - 1.2);
          b.pos.z = nz * (R - 1.2);
        } else {
          this.bullets.splice(i, 1);
          continue;
        }
      }
      if (b.life <= 0) { this.bullets.splice(i, 1); continue; }

      // 명중 판정
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (b.pos.distanceToSquared(e.position) < (e.radius + 0.4) ** 2) {
          this.damageEnemy(e, b.damage);
          hit = true;
          break;
        }
      }
      if (!hit && this.boss && this.boss.alive) {
        const bp = this.boss.mesh.position;
        const dxz = Math.hypot(b.pos.x - bp.x, b.pos.z - bp.z);
        if (dxz < this.boss.radius + 0.7) {
          this.damageBoss(b.damage);
          hit = true;
        }
      }
      if (hit) {
        this.burst(b.pos, this.color('secondary'), 3, 5, 0.4);
        this.bullets.splice(i, 1);
      }
    }

    for (let i = this.ebullets.length - 1; i >= 0; i -= 1) {
      const b = this.ebullets[i];
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.pos.x, b.pos.z) > R + 3) { this.ebullets.splice(i, 1); continue; }
      if (run.iframe <= 0 && b.pos.distanceToSquared(p) < (PLAYER.radius + 0.45) ** 2) {
        this.damagePlayer(9);
        this.ebullets.splice(i, 1);
      }
    }
  }

  flushBullets() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    const scale = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.bullets.forEach((b, i) => {
      dir.copy(b.vel).normalize();
      q.setFromUnitVectors(up, dir);
      scale.set(1, 1, 3.0);
      m.compose(b.pos, q, scale);
      this.bulletMesh.setMatrixAt(i, m);
    });
    this.bulletMesh.count = this.bullets.length;
    this.bulletMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.ebullets.length; i += 1) {
      const b = this.ebullets[i];
      scale.set(1, 1, 1);
      m.compose(b.pos, new THREE.Quaternion(), scale);
      this.ebulletMesh.setMatrixAt(i, m);
    }
    this.ebulletMesh.count = this.ebullets.length;
    this.ebulletMesh.instanceMatrix.needsUpdate = true;
  }

  /* --------------------------------------------------------------- damage */
  damageEnemy(enemy, amount) {
    enemy.hp -= amount;
    this.synth.hit();
    if (enemy.hp <= 0) this.killEnemy(enemy);
    else {
      const s = enemy.mesh.children[1];
      if (s) s.material.opacity = 1;
    }
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
    this.scene.remove(enemy.mesh);
    const run = this.run;
    run.kills += 1;
    run.combo = Math.min(run.combo + 1, 40);
    run.comboT = 2.6;
    const mult = 1 + run.combo * 0.04;
    this.addScore(enemy.score * mult);
    this.burst(enemy.position, enemy.mesh.children[0].material.color, 16, 13, 0.9);
    this.ringBurst(enemy.position, enemy.mesh.children[0].material.color, 1);
    this.synth.explode(enemy.type === 'splitter');
    if (enemy.type === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const child = this.spawnEnemy(1, 'drifter');
        child.position.copy(enemy.position);
        child.position.x += rnd(2.4, -2.4);
        child.position.z += rnd(2.4, -2.4);
        child.hp = child.maxHp = 14;
      }
    }
    // 드롭
    if (Math.random() < (enemy.type === 'splitter' ? 0.5 : 0.09)) this.spawnPickup(enemy.position);
  }

  damagePlayer(amount) {
    const run = this.run;
    if (run.iframe > 0 || run.dead) return;
    run.hp -= amount;
    run.iframe = PLAYER.iframeAfterHit;
    run.combo = 0;
    this.shake = 0.7;
    const hitEl = $('hitfx');
    hitEl.classList.add('on');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => hitEl.classList.remove('on'), 90);
    this.synth.hurt();
    this.burst(this.playerMesh.position, this.color('accent'), 14, 10, 0.7);
    if (run.hp <= 0) { run.hp = 0; this.endRun(false); }
  }

  addScore(amount, silent) {
    const run = this.run;
    const value = amount * (this.spawn.score_mul || 1);
    run.score += value;
    if (!silent) this.updateHud();
  }

  /* --------------------------------------------------------------- boss */
  startBoss() {
    const run = this.run;
    run.phase = 'boss';
    const b = this.seed.boss;
    const group = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(3.2, 1);
    const solid = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: this.color('boss'), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: this.color('boss'), wireframe: true, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    wire.scale.setScalar(1.05);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: this.color('boss'), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(22);
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(3.7, 4.35, 48),
      new THREE.MeshBasicMaterial({
        color: this.color('boss'), transparent: true, opacity: 0.42, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = -2.75;
    group.add(solid, wire, halo, pad);
    group.scale.setScalar(b.scale || 1);
    group.position.set(0, 2.8, -this.R * 0.35);
    this.scene.add(group);

    const boss = {
      mesh: group, wire, solid, pad, hp: b.hp, maxHp: b.hp, radius: 3.2 * (b.scale || 1),
      behavior: b.behavior, phase: 1, alive: true, angle: 0, attackT: 1.6,
      spiralAngle: 0, mode: 'idle', modeT: 0, target: new THREE.Vector3(),
      beams: [], charging: 0, hitFlash: 0, entering: 1.4, regenT: 8,
    };
    this.boss = boss;
    this.toast(`BOSS\n${b.name}`, 2200);
    this.synth.bossWarn();
    $('bossBar').classList.add('on');
    $('bossName').textContent = b.name;
    this.shake = 0.9;
  }

  updateBoss(dt) {
    const boss = this.boss;
    const run = this.run;
    if (!boss || !boss.alive) return;
    if (run.phase !== 'boss') return;
    boss.angle += dt * 0.35;
    const radius = this.R * 0.32;
    if (boss.entering > 0) {
      boss.entering -= dt;
      boss.mesh.position.y = lerp(boss.mesh.position.y, 2.8, 0.08);
      boss.mesh.rotation.y += dt * 1.2;
      return;
    }
    boss.mesh.position.x = Math.cos(boss.angle) * radius;
    boss.mesh.position.z = Math.sin(boss.angle) * radius;
    boss.mesh.position.y = 2.8 + Math.sin(this.time * 1.2) * 0.35;
    boss.mesh.rotation.y += dt * 0.6;
    boss.wire.rotation.x += dt * 0.4;
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
    boss.solid.material.opacity = 0.26 + boss.hitFlash * 0.5;

    // 페이즈 전환
    const ratio = boss.hp / boss.maxHp;
    const nextPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (nextPhase !== boss.phase) {
      boss.phase = nextPhase;
      boss.attackT = 0.6;
      this.shake = 1;
      this.toast(`PHASE ${nextPhase}`, 1200);
      this.synth.bossWarn();
      this.ringBurst(boss.mesh.position, this.color('boss'), 3);
      this.burst(boss.mesh.position, this.color('boss'), 30, 18, 1.2);
      $('bossPhase').children[2 - nextPhase].classList.add('on');
    }

    // 재생 모디파이어
    if ((this.spawn.boss_regen || 0) > 0) {
      boss.regenT -= dt;
      if (boss.regenT <= 0) {
        boss.regenT = 8;
        boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * this.spawn.boss_regen);
        this.burst(boss.mesh.position, this.color('secondary'), 8, 4, 0.6);
      }
    }

    if (boss.behavior === 'spiral') this.bossSpiral(dt, boss);
    else if (boss.behavior === 'radial') this.bossRadial(dt, boss);
    else if (boss.behavior === 'sweep') this.bossSweep(dt, boss);
    else if (boss.behavior === 'summon') this.bossSummon(dt, boss);
    else this.bossHunter(dt, boss);

    // 접촉 (보스는 지면 위에 떠 있으니 XZ 거리로 판정)
    const dxz = Math.hypot(boss.mesh.position.x - this.playerMesh.position.x,
      boss.mesh.position.z - this.playerMesh.position.z);
    if (dxz < boss.radius + PLAYER.radius && run.iframe <= 0) this.damagePlayer(20);

    // 플레이어 탄 충돌 (탄환 쪽에서 처리하지만 근접 보정)
    if (boss.charging > 0) boss.charging -= dt;
  }

  bossSpiral(dt, boss) {
    boss.attackT -= dt;
    const rate = boss.phase === 1 ? 0.1 : boss.phase === 2 ? 0.075 : 0.055;
    if (boss.attackT <= 0) {
      boss.attackT = rate;
      boss.spiralAngle += 0.42 + boss.phase * 0.05;
      const arms = boss.phase >= 2 ? 3 : 2;
      for (let i = 0; i < arms; i += 1) {
        const a = boss.spiralAngle + (i / arms) * TAU;
        this.fireEnemyBullet(boss.mesh.position, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 13.5);
      }
    }
  }

  bossRadial(dt, boss) {
    boss.attackT -= dt;
    if (boss.attackT <= 0) {
      boss.attackT = boss.phase === 1 ? 1.7 : boss.phase === 2 ? 1.35 : 1.05;
      const count = 14 + boss.phase * 4;
      const offset = rnd(TAU);
      for (let i = 0; i < count; i += 1) {
        const a = offset + (i / count) * TAU;
        this.fireEnemyBullet(boss.mesh.position, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 12.5);
      }
      this.ringBurst(boss.mesh.position, this.color('boss'), 2);
      // 조준 사격
      const p = this.playerMesh.position;
      const dir = this.vec.copy(p).sub(boss.mesh.position);
      dir.y = 0; dir.normalize();
      for (let k = -1; k <= 1; k += 1) {
        const a = Math.atan2(dir.x, dir.z) + k * 0.18;
        this.fireEnemyBullet(boss.mesh.position, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 17);
      }
    }
  }

  bossSweep(dt, boss) {
    boss.attackT -= dt;
    if (!boss.beams.length) {
      for (let i = 0; i < 2; i += 1) {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: this.color('boss'), transparent: true, opacity: 0.18,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        mesh.position.y = 0.12;
        mesh.visible = false;
        this.scene.add(mesh);
        boss.beams.push(mesh);
      }
    }
    if (boss.mode === 'idle' && boss.attackT <= 0) {
      boss.mode = 'warn';
      boss.modeT = 1.05;
      boss.beamAngle = Math.atan2(
        this.playerMesh.position.z - boss.mesh.position.z,
        this.playerMesh.position.x - boss.mesh.position.x,
      );
      boss.beamCount = boss.phase >= 2 ? 2 : 1;
      boss.beams.forEach((beam, i) => {
        beam.visible = i < boss.beamCount;
        if (i === 0) beam.rotation.y = -boss.beamAngle;
        if (i === 1) beam.rotation.y = -(boss.beamAngle + 1.15);
        beam.scale.set(this.R * 2.2, 1, 1.5);
        beam.position.set(0, 0.12, 0);
      });
    } else if (boss.mode === 'warn') {
      boss.modeT -= dt;
      const k = 0.12 + Math.abs(Math.sin(this.time * 16)) * 0.26;
      boss.beams.forEach((beam, i) => { if (i < boss.beamCount) beam.material.opacity = k; });
      if (boss.modeT <= 0) {
        boss.mode = 'fire';
        boss.modeT = 0.42;
        this.synth.explode(false);
        this.shake = 0.5;
      }
    } else if (boss.mode === 'fire') {
      boss.modeT -= dt;
      boss.beams.forEach((beam, i) => { if (i < boss.beamCount) beam.material.opacity = 0.85; });
      const px = this.playerMesh.position.x;
      const pz = this.playerMesh.position.z;
      const angles = [boss.beamAngle, boss.beamAngle + 1.15];
      for (let i = 0; i < boss.beamCount; i += 1) {
        const a = angles[i];
        const distToLine = Math.abs(px * Math.sin(a) - pz * Math.cos(a));
        if (distToLine < 1.6 && this.run.iframe <= 0) this.damagePlayer(i === 0 ? 22 : 16);
      }
      if (boss.modeT <= 0) {
        boss.mode = 'idle';
        boss.attackT = boss.phase === 1 ? 1.6 : boss.phase === 2 ? 1.2 : 0.9;
        boss.beams.forEach((beam) => { beam.visible = false; });
      }
    }
  }

  bossSummon(dt, boss) {
    boss.attackT -= dt;
    if (boss.attackT <= 0) {
      boss.attackT = boss.phase === 1 ? 3.0 : boss.phase === 2 ? 2.4 : 1.9;
      const n = 2 + boss.phase;
      for (let i = 0; i < n; i += 1) {
        const drone = this.spawnEnemy(1, 'drone');
        const a = rnd(TAU);
        drone.position.set(
          boss.mesh.position.x + Math.cos(a) * 4,
          0.7,
          boss.mesh.position.z + Math.sin(a) * 4,
        );
      }
      this.burst(boss.mesh.position, this.color('boss'), 12, 8, 0.8);
      // 가끔 방사
      if (Math.random() < 0.5) {
        const count = 10;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * TAU;
          this.fireEnemyBullet(boss.mesh.position, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 11);
        }
      }
    }
  }

  bossHunter(dt, boss) {
    boss.modeT -= dt;
    if (boss.mode === 'idle') {
      if (boss.modeT <= 0) {
        boss.mode = 'aim';
        boss.modeT = 0.75;
        boss.target.copy(this.playerMesh.position);
        this.burst(boss.mesh.position, this.color('accent'), 10, 6, 0.5);
      }
    } else if (boss.mode === 'aim') {
      if (boss.modeT <= 0) { boss.mode = 'dash'; boss.modeT = 0.55; this.synth.dash(); }
    } else if (boss.mode === 'dash') {
      const dir = this.vec.copy(boss.target).sub(boss.mesh.position);
      dir.y = 0;
      const len = dir.length() || 1;
      dir.divideScalar(len);
      boss.mesh.position.addScaledVector(dir, 40 * dt);
      if (Math.random() < 0.7) this.burst(boss.mesh.position, this.color('boss'), 2, 4, 0.5);
      if (boss.modeT <= 0) {
        boss.mode = 'idle';
        boss.modeT = boss.phase === 1 ? 1.5 : 1.0;
        this.ringBurst(boss.mesh.position, this.color('boss'), 1);
      }
    }
    if (boss.mode === 'aim') {
      const p = this.playerMesh.position;
      if (Math.random() < 0.4) this.fireEnemyBullet(boss.mesh.position, this.vec.copy(p).sub(boss.mesh.position).setY(0).normalize(), 15);
    }
  }

  damageBoss(amount) {
    const boss = this.boss;
    if (!boss || !boss.alive) return;
    boss.hp -= amount;
    boss.hitFlash = 0.16;
    this.synth.hit();
    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.alive = false;
      this.scene.remove(boss.mesh);
      this.burst(boss.mesh.position, this.color('boss'), 70, 26, 1.8);
      this.ringBurst(boss.mesh.position, this.color('boss'), 6);
      this.synth.explode(true);
      this.shake = 1.4;
      this.addScore(3200, true);
      this.endRun(true);
    }
    this.updateHud();
  }

  /* --------------------------------------------------------------- misc */
  spawnPickup(pos) {
    const type = Math.random() < 0.5 ? 'heal' : 'overdrive';
    const geo = new THREE.OctahedronGeometry(0.55, 0);
    const color = type === 'heal' ? this.color('secondary') : this.color('accent');
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true }));
    mesh.position.copy(pos);
    mesh.position.y = 1.2;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(5);
    mesh.add(halo);
    this.scene.add(mesh);
    this.pickups.push({ mesh, type, life: 14, color });
  }

  updatePickups(dt) {
    const p = this.playerMesh.position;
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const it = this.pickups[i];
      it.life -= dt;
      it.mesh.rotation.y += dt * 2.4;
      it.mesh.position.y = 1.2 + Math.sin(this.time * 2.5) * 0.2;
      const d = it.mesh.position.distanceTo(p);
      if (d < 2.4) {
        // 끌려온다
        it.mesh.position.lerp(p, 0.15);
      }
      if (d < 1.6) {
        if (it.type === 'heal') {
          this.run.hp = Math.min(this.run.maxHp, this.run.hp + 22);
          this.toast('+22 HP', 700);
        } else {
          this.run.overdrive = 6;
          this.toast('OVERDRIVE 6s', 700);
        }
        this.addScore(150, true);
        this.synth.pickup();
        this.burst(it.mesh.position, it.color, 10, 7, 0.6);
        this.scene.remove(it.mesh);
        this.pickups.splice(i, 1);
        continue;
      }
      if (it.life <= 0) {
        this.scene.remove(it.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  updateMeteors(dt) {
    const run = this.run;
    if ((this.spawn.meteor || 0) > 0) {
      run.meteorT -= dt;
      if (run.meteorT <= 0) {
        run.meteorT = 2.6;
        const a = rnd(TAU);
        const r = rnd(this.R - 4, 3);
        const pos = new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(4.0, 4.4, 40),
          new THREE.MeshBasicMaterial({ color: this.color('accent'), transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(pos);
        this.scene.add(ring);
        this.meteors.push({ pos, warn: ring, t: 1.2, done: false, radius: 4.2 });
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i -= 1) {
      const m = this.meteors[i];
      m.t -= dt;
      m.warn.material.opacity = 0.25 + Math.abs(Math.sin(this.time * 10)) * 0.45;
      m.warn.scale.setScalar(1 + (1.2 - m.t) * 0.1);
      if (m.t <= 0 && !m.done) {
        m.done = true;
        this.scene.remove(m.warn);
        this.burst(new THREE.Vector3(m.pos.x, 0.6, m.pos.z), this.color('accent'), 26, 16, 1.1);
        this.ringBurst(m.pos, this.color('accent'), 2);
        this.synth.explode(false);
        if (this.playerMesh.position.distanceTo(m.pos) < m.radius && this.run.iframe <= 0) this.damagePlayer(18);
        this.enemies.forEach((e) => {
          if (e.position.distanceTo(m.pos) < m.radius) this.damageEnemy(e, 30);
        });
        this.meteors.splice(i, 1);
      }
    }
  }

  /* --------------------------------------------------------------- particles */
  burst(pos, color, count = 12, speed = 8, life = 0.7) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= this.PMAX) this.particles.shift();
      const a = rnd(TAU);
      const up = rnd(1, -0.25);
      const s = rnd(speed, speed * 0.25);
      this.particles.push({
        x: pos.x, y: Math.max(0.3, pos.y), z: pos.z,
        vx: Math.cos(a) * s, vy: up * s * 0.7, vz: Math.sin(a) * s,
        life: rnd(life, life * 0.4), max: life, size: rnd(1.1, 0.35),
        r: c.r, g: c.g, b: c.b, gravity: 6,
      });
    }
  }

  ringBurst(pos, color, count = 1) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      const slot = this.rings.find((r) => r.life <= 0);
      if (!slot) return;
      slot.life = 0.55 + i * 0.06;
      slot.max = slot.life;
      slot.mesh.position.set(pos.x, 0.15, pos.z);
      slot.mesh.material.color.copy(c);
      slot.mesh.visible = true;
      slot.mesh.scale.setScalar(0.6 + i * 0.5);
    }
  }

  flushRings(dt) {
    this.rings.forEach((r) => {
      if (r.life <= 0) { r.mesh.visible = false; return; }
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.6 + k * 7);
      r.mesh.material.opacity = (1 - k) * 0.7;
      if (r.life <= 0) r.mesh.visible = false;
    });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= p.gravity * dt;
      if (p.y < 0.15) { p.y = 0.15; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
      p.vx *= 0.985; p.vz *= 0.985;
    }
  }

  flushParticles() {
    const pos = this.pPos;
    const col = this.pCol;
    const size = this.pSize;
    const n = Math.min(this.particles.length, this.PMAX);
    for (let i = 0; i < n; i += 1) {
      const p = this.particles[i];
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const k = clamp(p.life / p.max, 0, 1);
      col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
      size[i] = p.size * (0.4 + k * 0.9);
    }
    this.pGeo.setDrawRange(0, n);
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
    this.pGeo.attributes.size.needsUpdate = true;
  }

  /* --------------------------------------------------------------- hud */
  updateHud(force) {
    const run = this.run;
    if (!run) return;
    const scoreText = fmt(run.score);
    if (force || this.lastHud.score !== scoreText) {
      $('hScore').textContent = scoreText;
      this.lastHud.score = scoreText;
    }
    const combo = run.combo > 1 ? `x${(1 + run.combo * 0.04).toFixed(2)}` : '';
    if (this.lastHud.combo !== combo) {
      $('hCombo').textContent = combo;
      $('hCombo').classList.toggle('on', combo !== '');
      this.lastHud.combo = combo;
    }
    const hpPct = (run.hp / run.maxHp) * 100;
    $('hHp').style.width = hpPct + '%';
    $('hpBox').classList.toggle('low', hpPct < 35);
    $('hHpText').textContent = Math.ceil(run.hp);

    let progress;
    if (run.phase === 'boss' && this.boss) progress = clamp(1 - this.boss.hp / this.boss.maxHp, 0, 1);
    else progress = clamp(((run.wave - 1) + clamp(run.waveT / 15, 0, 1)) / this.seed.waves, 0, 1);
    $('hProgress').style.width = (progress * 100).toFixed(1) + '%';

    const waveText = run.phase === 'boss' ? 'BOSS' : `WAVE ${run.wave}/${this.seed.waves}`;
    if (this.lastHud.wave !== waveText) { $('hWave').textContent = waveText; this.lastHud.wave = waveText; }

    if (this.boss && this.boss.alive) {
      $('bossHp').style.width = (clamp(this.boss.hp / this.boss.maxHp, 0, 1) * 100).toFixed(1) + '%';
    }
  }

  toast(text, ms = 1200) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }

  /* --------------------------------------------------------------- end */
  endRun(victory) {
    const run = this.run;
    if (!run || run.dead) return;
    run.dead = true;
    this.state = 'over';
    document.body.classList.remove('playing');
    this.synth.stopAmbient();
    if (victory) this.synth.win(); else this.synth.lose();
    this.playerMesh.visible = false;

    const date = this.seed.date_kst;
    const bestKey = 'nc.best.v1';
    const todayKey = 'nc.today.' + date;
    const bestBefore = store.get(bestKey, 0) || 0;
    const best = Math.max(bestBefore, Math.round(run.score));
    store.set(bestKey, best);
    const today = Math.max(store.get(todayKey, 0) || 0, Math.round(run.score));
    store.set(todayKey, today);

    const ratio = run.score / this.seed.target_score;
    const rank = ratio >= 1.2 ? 'S' : ratio >= 1 ? 'A' : ratio >= 0.7 ? 'B' : ratio >= 0.4 ? 'C' : 'D';
    $('overKicker').innerHTML = `<span class="dot"></span> ${victory ? 'CORE CLEARED' : 'CORE LOST'}`;
    $('overTitle').textContent = victory ? '코어 격파' : '생존 실패';
    $('overTitle').className = 'over-title ' + (victory ? 'win' : 'lose');
    $('overRank').textContent = rank;
    $('overScore').textContent = fmt(run.score);
    $('overTarget').innerHTML = fmt(this.seed.target_score) + ` <small>${Math.round(ratio * 100)}%</small>`;
    $('overTime').textContent = Math.floor(run.elapsed) + 's';
    $('overBest').textContent = fmt(best);
    $('overShare').textContent = `NEON CORE ${date} · ${this.seed.tag}\n${this.seed.boss.name} · ${fmt(run.score)}점 (${rank})\nburiburiyj.github.io/neon-core/`;
    $('over').classList.remove('hidden');
    $('hud').classList.remove('on');
    $('touch').classList.add('hidden');
    $('bossBar').classList.remove('on');
    this.lastHud = {};
  }
}

/* ---------------------------------------------------------------- UI wiring */
function renderLobby(seed, info) {
  $('lobbyDate').textContent = `${seed.date_kst} (${seed.weekday_kr})`;
  $('lobbyTag').textContent = seed.tag;
  $('lobbyTheme').textContent = seed.theme.name;
  $('lobbyArena').textContent = seed.arena.name;
  $('lobbyBoss').textContent = seed.boss.name;
  $('lobbyBehavior').textContent = seed.boss.behaviorName + ' · ' + fmt(seed.boss.hp) + ' HP';
  $('lobbyBossDesc').textContent = seed.boss.desc;
  $('lobbyTarget').textContent = fmt(seed.target_score);
  $('lobbyWaves').innerHTML = `${seed.waves} <small>waves</small>`;
  $('lobbyMods').innerHTML = seed.modifiers
    .map((m, i) => `<span class="chip${i % 2 ? ' alt' : ''}" title="${m.desc}">${m.name}</span>`)
    .join('');
  $('lobbyBoss').style.color = seed.theme.boss;
  $('lobbyTag').style.color = seed.theme.secondary;

  const src = $('lobbySrc');
  const server = seed.server || {};
  if (info.source === 'server' && server.run_url) {
    const when = server.published_kst || seed.generated_utc;
    src.innerHTML = `<span class="badge-ok"><span class="dot"></span> 시드 엔진</span>` +
      `<span>strawberry-runner → D1</span>` +
      `<a href="${server.run_url}" target="_blank" rel="noopener">run #${server.run_id || ''} ↗</a>` +
      `<span>${when}</span>`;
  } else if (info.source === 'server') {
    src.innerHTML = `<span class="badge-ok"><span class="dot"></span> 발행된 시드</span><span>${server.published_kst || ''}</span>` +
      `<span style="color:var(--warn)">러너 기록 없음</span>`;
  } else {
    src.innerHTML = `<span class="badge-ok" style="color:var(--warn)"><span class="dot" style="background:var(--warn);box-shadow:0 0 10px var(--warn)"></span> 로컬 계산 시드</span>` +
      `<span>daily.json ${info.stale ? '지난 날짜' : '없음'} · 같은 알고리즘</span>`;
  }

  const hist = seed.history || [];
  $('lobbyHist').innerHTML = hist.map((d) => `<span class="${d === seed.date_kst ? 'now' : ''}">${d.slice(5)}</span>`).join('');

  const best = store.get('nc.best.v1', 0) || 0;
  const today = store.get('nc.today.' + seed.date_kst, 0) || 0;
  $('lobbyBest').textContent = fmt(best);
  $('lobbyToday').textContent = fmt(today);
  updateCountdown(seed.date_kst);

  document.documentElement.style.setProperty('--p', seed.theme.primary);
  document.documentElement.style.setProperty('--s', seed.theme.secondary);
  document.documentElement.style.setProperty('--a', seed.theme.accent);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', seed.theme.sky || '#05030a');
}

function updateCountdown(dateKey) {
  const el = $('lobbyCount');
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const nextMidnight = Date.UTC(y, m, d + 1, 0, 0, 0) - 9 * 3600 * 1000;
  const diff = Math.max(0, nextMidnight - now.getTime());
  const h = Math.floor(diff / 3600000);
  const mi = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const sameDay = dateKey === kstDateKey(now);
  el.textContent = sameDay
    ? `· 다음 시드 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : '· 새 시드 발행 대기';
}

/* ------------------------------------------------------------------ boot */
(async function boot() {
  let info;
  try {
    info = await loadToday();
  } catch (err) {
    document.documentElement.dataset.jsError = 'seed: ' + err.message;
    $('loader').innerHTML = '<div style="text-align:center;line-height:2">시드를 불러오지 못했습니다.<br><button onclick="location.reload()" style="color:#22e3ff;font:600 11px ui-monospace">다시 시도</button></div>';
    return;
  }
  const seed = info.seed;
  const game = new Game(seed);
  window.__nc = {
    game, seed, info,
    get state() { return game.state; },
    stats: () => ({
      score: game.run ? Math.round(game.run.score) : 0,
      hp: game.run ? Math.round(game.run.hp) : 0,
      wave: game.run ? game.run.wave : 0,
      kills: game.run ? game.run.kills : 0,
      enemies: game.enemies.length,
      bullets: game.bullets.length,
      ebullets: game.ebullets.length,
      bossHp: game.boss ? Math.round(game.boss.hp) : null,
      particles: game.particles.length,
      elapsed: game.run ? game.run.elapsed : 0,
    }),
    start: () => game.start(),
    pause: () => game.pause(),
    resume: () => game.resume(),
    dash: () => game.doDash(),
    setInput: (x, z) => { game.joystick.active = true; game.joystick.x = x; game.joystick.z = z; },
    clearInput: () => { game.joystick.active = false; game.joystick.x = 0; game.joystick.z = 0; },
    damageBoss: (n) => game.damageBoss(n),
    spawnEnemy: (t) => game.spawnEnemy(1, t),
  };

  // three.js 세이프가드: WebGL 이 없으면 안내
  if (!game.renderer || !game.renderer.getContext || !game.renderer.getContext()) {
    $('loader').textContent = '이 브라우저에서 WebGL 을 사용할 수 없습니다.';
    return;
  }

  renderLobby(seed, info);
  $('loader').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  game.state = 'lobby';

  // 로비는 살아 있는 아레나 위에 얹는다 (뒤에서 코어가 돌아간다)
  game.playerMesh.position.set(0, 0, 10);
  game.playerMesh.rotation.y = Math.PI;
  game.playerMesh.visible = true;

  setInterval(() => updateCountdown(seed.date_kst), 1000);

  const start = () => {
    game.synth.init(seed);
    game.synth.resume();
    game.start();
  };
  $('btnStart').addEventListener('click', start);
  $('btnRetry').addEventListener('click', () => { $('over').classList.add('hidden'); start(); });
  $('btnLobby').addEventListener('click', () => {
    $('over').classList.add('hidden');
    $('hud').classList.remove('on');
    $('lobby').classList.remove('hidden');
    document.body.classList.remove('playing');
    game.state = 'lobby';
    game.playerMesh.visible = true;
    game.playerMesh.position.set(0, 0, 10);
    renderLobby(seed, info);
  });
  $('btnResume').addEventListener('click', () => game.resume());
  $('btnQuit').addEventListener('click', () => {
    $('pause').classList.add('hidden');
    $('hud').classList.remove('on');
    $('lobby').classList.remove('hidden');
    game.clearEntities();
    game.state = 'lobby';
    game.playerMesh.visible = true;
    game.playerMesh.position.set(0, 0, 10);
    renderLobby(seed, info);
  });
  $('btnPause').addEventListener('click', () => game.togglePause());
  $('btnSound').addEventListener('click', () => game.toggleSound());
  $('btnSound').textContent = game.synth.muted ? '✕' : '♪';

  // 자동 시작 (?play=1) — 검증용
  if (new URLSearchParams(location.search).get('play') === '1') start();
})();
