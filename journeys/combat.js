// Adapted from the user-supplied source for Astra. Three.js is provided by the host (r128).
window.AstraCombat=(function(){
// Deterministic combat rules shared by the live game and the simulation check.
const ARENA_RADIUS = 14.4;
const BOSS_HEALTH = 700;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const notify = (s, type, data = {}) => s.events.push({ type, ...data });
const confine = a => {
  const d = Math.hypot(a.x, a.z);
  if (d > ARENA_RADIUS) { a.x *= ARENA_RADIUS / d; a.z *= ARENA_RADIUS / d; }
};

function createGame() {
  return {
    mode: 'playing', time: 0, events: [], waves: [], hits: 0, dodges: 0,
    player: { x: 0, z: 8, face: Math.PI, hp: 100, stamina: 100, gourds: 3,
      action: 'idle', actionTime: 0, duration: 0, combo: 0, lastStrike: -9,
      hitDone: false, hurt: 0, bindCooldown: 0, regenDelay: 0, moving: 0,
      dodgeX: 0, dodgeZ: 1, queued: null, invulnerable: 0 },
    boss: { x: 0, z: -4, face: 0, hp: BOSS_HEALTH, phase: 1,
      action: 'approach', timer: 1.3, actionTime: 0, duration: 0,
      stun: 0, hurt: 0, attackCount: 0, hitDone: false, moving: 0,
      aimX: 0, aimZ: 8 }
  };
}

function command(s, action, movement = { x: 0, z: 0 }) {
  if (s.mode !== 'playing') return false;
  const p = s.player, b = s.boss;
  if (action === 'bind') {
    if (p.bindCooldown > 0 || p.action === 'heal' || distance(p, b) > 13) {
      notify(s, 'hint', { text: p.bindCooldown > 0 ? 'Binding is still recharging.' : 'Move closer to bind the Warden.' });
      return false;
    }
    p.bindCooldown = 12; b.stun = 2.25;
    notify(s, 'bind', { x: b.x, z: b.z });
    return true;
  }
  if (p.action !== 'idle') {
    if ((action === 'attack' || action === 'heavy') && p.action === 'attack' && p.actionTime > .13) p.queued = action;
    if (action !== 'dodge' || p.action === 'dodge' || p.actionTime < .2) return false;
  }
  const cost = { attack: 12, heavy: 30, dodge: 22, heal: 0 }[action];
  if (cost === undefined) return false;
  if (p.stamina < cost) { notify(s, 'hint', { text: 'Let your stamina recover.' }); return false; }
  if (action === 'heal' && (p.gourds === 0 || p.hp >= 100)) {
    notify(s, 'hint', { text: p.gourds === 0 ? 'The gourd is empty.' : 'Your health is full.' }); return false;
  }
  p.stamina -= cost; p.regenDelay = .6; p.action = action; p.actionTime = 0; p.hitDone = false; p.queued = null;
  if (action === 'attack') {
    p.combo = s.time - p.lastStrike < 1.1 ? p.combo % 3 + 1 : 1;
    p.lastStrike = s.time; p.duration = p.combo === 3 ? .6 : .43;
    if (distance(p, b) < 5.5) p.face = angleTo(p, b);
    notify(s, 'swing', { heavy: false, combo: p.combo });
  }
  if (action === 'heavy') {
    p.duration = .96; p.combo = 0; p.face = angleTo(p, b);
    notify(s, 'swing', { heavy: true });
  }
  if (action === 'dodge') {
    p.duration = .52; p.invulnerable = .43; s.dodges++;
    const l = Math.hypot(movement.x, movement.z);
    p.dodgeX = l > .1 ? movement.x / l : -Math.sin(p.face);
    p.dodgeZ = l > .1 ? movement.z / l : -Math.cos(p.face);
    notify(s, 'dodge', { x: p.x, z: p.z });
  }
  if (action === 'heal') { p.duration = 1; notify(s, 'drink'); }
  return true;
}

function hitPlayer(s, damage, origin) {
  const p = s.player;
  if (p.invulnerable > 0 || p.hurt > 0 || s.mode !== 'playing') return;
  p.hp = Math.max(0, p.hp - damage); p.hurt = .68; p.queued = null;
  const d = distance(origin, p) || 1;
  p.x += (p.x - origin.x) / d * .65; p.z += (p.z - origin.z) / d * .65;
  notify(s, 'player-hit', { damage });
  if (p.hp === 0) { s.mode = 'lost'; notify(s, 'lost'); }
}

function hitBoss(s, damage) {
  const b = s.boss;
  b.hp = Math.max(0, b.hp - damage); b.hurt = .2; s.hits++;
  notify(s, 'boss-hit', { x: b.x, z: b.z, damage, heavy: s.player.action === 'heavy' });
  if (b.hp === 0) { s.mode = 'won'; b.action = 'fallen'; notify(s, 'won'); }
  else if (b.hp <= BOSS_HEALTH * .48 && b.phase === 1) {
    b.phase = 2; notify(s, 'phase', { text: 'The mountain awakens.' });
  }
}

function beginBossAttack(s) {
  const b = s.boss;
  b.attackCount++;
  b.action = b.attackCount % 3 === 0 ? 'slam' : 'sweep';
  b.actionTime = 0; b.hitDone = false;
  b.duration = b.action === 'slam' ? 1.35 : (b.phase === 2 ? .86 : 1.12);
  b.aimX = s.player.x; b.aimZ = s.player.z; b.face = angleTo(b, s.player);
  notify(s, 'windup', { slam: b.action === 'slam' });
}

function stepGame(s, dt, movement = { x: 0, z: 0 }) {
  if (s.mode !== 'playing') return;
  dt = clamp(dt, 0, .05); s.time += dt;
  const p = s.player, b = s.boss;
  p.hurt = Math.max(0, p.hurt - dt); p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.bindCooldown = Math.max(0, p.bindCooldown - dt); p.regenDelay = Math.max(0, p.regenDelay - dt);
  b.hurt = Math.max(0, b.hurt - dt);
  if (p.regenDelay === 0 && p.action !== 'dodge') p.stamina = Math.min(100, p.stamina + dt * 24);
  p.moving = 0;
  if (p.action === 'dodge') {
    p.x += p.dodgeX * 10.5 * dt; p.z += p.dodgeZ * 10.5 * dt;
  } else {
    const length = Math.hypot(movement.x, movement.z);
    if (length > .03) {
      const speed = p.action === 'idle' ? 5.3 : p.action === 'heal' ? 1.8 : 2.1;
      const mag = Math.min(length, 1), nx = movement.x / length, nz = movement.z / length;
      p.x += nx * speed * dt * mag; p.z += nz * speed * dt * mag;
      p.moving = mag;
      if (p.action === 'idle') p.face = Math.atan2(nx, nz);
    }
  }
  if (p.action !== 'idle') {
    p.actionTime += dt;
    const fraction = p.actionTime / p.duration;
    if ((p.action === 'attack' || p.action === 'heavy') && !p.hitDone && fraction >= (p.action === 'heavy' ? .57 : .36)) {
      p.hitDone = true;
      const range = p.action === 'heavy' ? 4.1 : 3.5;
      const delta = Math.atan2(Math.sin(angleTo(p, b) - p.face), Math.cos(angleTo(p, b) - p.face));
      if (distance(p, b) < range && Math.abs(delta) < 1.4) hitBoss(s, p.action === 'heavy' ? 61 : p.combo === 3 ? 33 : 22);
    }
    if (p.action === 'heal' && !p.hitDone && fraction >= .6) {
      p.hitDone = true; p.gourds--; p.hp = Math.min(100, p.hp + 44); notify(s, 'heal', { x: p.x, z: p.z });
    }
    if (fraction >= 1) {
      const queued = p.queued; p.action = 'idle'; p.queued = null;
      if (queued) command(s, queued, movement);
    }
  }
  if (s.mode !== 'playing') return;
  b.moving = 0;
  if (b.stun > 0) { b.stun = Math.max(0, b.stun - dt); }
  else if (b.action === 'approach') {
    b.timer -= dt; const d = distance(p, b); b.face = angleTo(b, p);
    if (d > 3.05) {
      const speed = b.phase === 2 ? 2.5 : 1.95;
      b.x += Math.sin(b.face) * speed * dt; b.z += Math.cos(b.face) * speed * dt; b.moving = 1;
    }
    if (d < 4 && b.timer <= 0) beginBossAttack(s);
  } else if (b.action === 'recover') {
    b.timer -= dt;
    if (b.timer <= 0) { b.action = 'approach'; b.timer = .35; }
  } else if (b.action === 'sweep' || b.action === 'slam') {
    b.actionTime += dt;
    const fraction = b.actionTime / b.duration;
    if (!b.hitDone && fraction > .73) {
      b.hitDone = true;
      if (b.action === 'slam') {
        if (distance(p, b) < 3.9) hitPlayer(s, 27, b);
        s.waves.push({ x: b.x, z: b.z, radius: .8, age: 0, hit: false });
        notify(s, 'slam', { x: b.x, z: b.z });
        if (b.phase === 2) s.waves.push({ x: b.x, z: b.z, radius: .1, age: -.35, hit: false });
      } else {
        const delta = Math.atan2(Math.sin(angleTo(b, p) - b.face), Math.cos(angleTo(b, p) - b.face));
        if (distance(p, b) < 4.9 && Math.abs(delta) < 2.1) hitPlayer(s, b.phase === 2 ? 23 : 19, b);
        notify(s, 'boss-swing', { x: b.x, z: b.z });
      }
    }
    if (fraction >= 1) { b.action = 'recover'; b.timer = b.phase === 2 ? .78 : 1.18; }
  }
  for (const w of s.waves) {
    w.age += dt;
    if (w.age < 0) continue;
    w.radius += dt * 7.5;
    if (!w.hit && Math.abs(distance(p, w) - w.radius) < .65) {
      w.hit = true; hitPlayer(s, 17, w);
    }
  }
  s.waves = s.waves.filter(w => w.radius < 23);
  const separation = distance(p, b);
  if (separation < 1.48) {
    const nx = separation > .001 ? (p.x - b.x) / separation : 0;
    const nz = separation > .001 ? (p.z - b.z) / separation : 1;
    p.x = b.x + nx * 1.48; p.z = b.z + nz * 1.48;
  }
  confine(p); confine(b);
}

return {createGame,command,stepGame,BOSS_HEALTH,ARENA_RADIUS};
})();
