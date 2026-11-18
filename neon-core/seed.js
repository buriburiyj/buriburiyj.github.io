/* NEON CORE — seed.js
 *
 * 오늘의 시드를 정한다.
 *   1) 사이트에 발행된 daily.json (strawberry-runner → strawberry-server D1 → 여기) 을 먼저 읽는다
 *   2) 못 읽거나 다른 날짜면 브라우저에서 같은 알고리즘으로 계산한다 (seed-tables.js = 파이썬과 같은 테이블)
 *
 * 파이썬(scripts/daily_seed.py)과의 약속
 *   - 난수: sha256("neon-core|1|" + date + "|" + n) 의 첫 4바이트 (big-endian uint32)
 *   - 호출 순서가 곧 시드. 여기서 순서를 바꾸면 그날의 시드가 달라진다.
 */

const T = window.NEON_TABLES;
const SALT = 'neon-core|1|';
const enc = new TextEncoder();

function pyRound(value) {
  // 파이썬 round(): 정확히 .5 는 짝수로 (banker's rounding)
  const floor = Math.floor(value);
  const diff = value - floor;
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(value);
}

async function sha256Bytes(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return new Uint8Array(buf);
}

function toHex(bytes, length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

class Stream {
  constructor(dateKey) { this.dateKey = dateKey; this.calls = 0; }
  async u32() {
    const bytes = await sha256Bytes(SALT + this.dateKey + '|' + this.calls);
    this.calls += 1;
    return ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  }
  async index(size) { return (await this.u32()) % size; }
  async pick(seq) { return seq[await this.index(seq.length)]; }
  async between(low, high) { return low + ((await this.u32()) % (high - low + 1)); }
  async shuffle(seq) {
    const items = seq.slice();
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = (await this.u32()) % (i + 1);
      const tmp = items[i]; items[i] = items[j]; items[j] = tmp;
    }
    return items;
  }
}

export function kstDateKey(now) {
  const d = now instanceof Date ? now : new Date();
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

function weekdayKr(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return WEEK[(dow + 6) % 7];
}

function tagOf(hex) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let n = parseInt(hex.slice(0, 8), 16);
  let out = '';
  for (let i = 0; i < 4; i += 1) { out += alphabet[n % alphabet.length]; n = Math.floor(n / alphabet.length); }
  return out;
}

export async function generateSeed(dateKey) {
  const key = dateKey;
  const rng = new Stream(key);
  const hx = toHex(await sha256Bytes(SALT + key + '|seed'), 8);
  // 64비트 값이라 Number 로는 정확도가 없다 → 나머지 계산은 BigInt 로 한다.
  const seedIntBig = BigInt('0x' + hx);
  const seedInt = Number(seedIntBig);

  const theme = Object.assign({}, await rng.pick(T.themes));
  const arena = Object.assign({}, await rng.pick(T.arenas));
  const bossBase = await rng.pick(T.bosses);
  const epithet = await rng.pick(T.epithets);

  const waves = await rng.between(5, 7);
  const modCount = 2 + ((await rng.index(2)) === 1 ? 1 : 0);
  const noMirror = (await rng.index(3)) === 0;
  const pool = noMirror ? T.modifiers.filter((m) => m.id !== 'mirror') : T.modifiers.slice();
  const modifiers = (await rng.shuffle(pool)).slice(0, modCount);

  const spawn = {
    enemy_hp: 1.0, enemy_speed: 1.0, enemy_fire: 1.0,
    player_hp: 1.0, player_bullet_speed: 1.0, dash_cd: 1.0,
    score_mul: 1.0, spawn_mul: 1.0, elite_add: 0.0,
    gravity: 0.0, meteor: 0.0, bounce: 0, boss_regen: 0.0,
  };
  modifiers.forEach((mod) => {
    Object.keys(mod.effects || {}).forEach((name) => {
      const value = mod.effects[name];
      if (name === 'elite_add' || name === 'gravity' || name === 'meteor' || name === 'boss_regen') {
        spawn[name] = pyRound((spawn[name] + value) * 1000) / 1000;
      } else if (name === 'bounce') {
        spawn.bounce += value;
      } else {
        spawn[name] = pyRound(spawn[name] * value * 10000) / 10000;
      }
    });
  });

  const bossHp = pyRound((620 + waves * 90 + (await rng.between(0, 260))) / 10) * 10;
  let target = 8000 + waves * 900 + (await rng.between(0, 2400));
  target = pyRound((target * spawn.score_mul) / 100) * 100;

  const scale = await rng.pick(T.scales);
  const music = {
    scale: scale.id, scaleName: scale.name, steps: scale.steps,
    root: await rng.between(92, 146),
    tempo: await rng.between(112, 140),
    mode: scale.id === 'pentatonic' ? 'major' : 'dark',
  };

  const quote = await rng.pick(T.quotes);
  const bossName = epithet + ' ' + bossBase.codename;

  return {
    schema: 1,
    version: '1.0.0',
    engine: 'neon-core/game.js (local mirror of scripts/daily_seed.py)',
    date_kst: key,
    weekday_kr: weekdayKr(key),
    seed_hex: hx,
    seed_int: seedInt,
    tag: tagOf(hx),
    generated_utc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    title: 'NEON CORE — ' + key,
    theme,
    arena,
    boss: {
      codename: bossBase.codename,
      name: bossName,
      behavior: bossBase.behavior,
      behaviorName: T.behaviorNames[bossBase.behavior],
      desc: bossBase.desc,
      hp: bossHp,
      phases: 3,
      color: theme.boss,
      scale: 1 + Number(seedIntBig % 5n) / 20,
    },
    modifiers: modifiers.map((m) => ({ id: m.id, name: m.name, desc: m.desc, effects: m.effects })),
    waves,
    target_score: target,
    boss_hp: bossHp,
    spawn,
    music,
    quote,
    rules: {
      control: 'WASD/방향키 이동 · Space 대시 · 자동 사격',
      touch: '왼쪽 드래그 이동 · 오른쪽 대시 버튼 · 자동 사격',
      goal: '웨이브를 버티고 ' + bossName + '를 쓰러뜨린다',
    },
  };
}

/**
 * 오늘의 시드. 서버 발행본(daily.json)을 우선 쓰고, 실패하면 로컬 계산.
 * @returns {Promise<{seed:object, source:'server'|'local', stale:boolean, error:string|null, fetchedAt:string|null}>}
 */
export async function loadToday() {
  const today = kstDateKey();
  let remote = null;
  let error = null;
  try {
    const res = await fetch('./daily.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    remote = await res.json();
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }

  if (remote && remote.seed_hex && remote.theme && remote.boss) {
    const stale = remote.date_kst !== today;
    if (!stale) return { seed: remote, source: 'server', stale: false, error, fetchedAt: remote.server && remote.server.published_kst };
    // 발행본이 지난 날짜면 오늘 것을 로컬 계산하되, 서버 증거는 남겨 둔다
    const local = await generateSeed(today);
    local.previous = { date_kst: remote.date_kst, tag: remote.tag, boss: remote.boss && remote.boss.name };
    return { seed: local, source: 'local', stale: true, error, fetchedAt: remote.server && remote.server.published_kst };
  }

  const local = await generateSeed(today);
  return { seed: local, source: 'local', stale: false, error, fetchedAt: null };
}
