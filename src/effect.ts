// 特效池调参
import type { Effects, Particle } from './domain.ts';
const TAU = Math.PI * 2;
const PHASE: Record<Particle['kind'], { radius: number; life: number; gravity: number; drag: number }> = {
  spark: { radius: 2.1, life: 0.4, gravity: 1.1, drag: 1.6 },
  glow: { radius: 9, life: 0.6, gravity: -0.12, drag: 2.4 },
  debris: { radius: 4.4, life: 1, gravity: 1, drag: 0.7 },
  paint: { radius: 2.2, life: 0.5, gravity: 0.35, drag: 1.2 },
  shard: { radius: 5.2, life: 0.95, gravity: 1.15, drag: 0.62 },
  sparkle: { radius: 5.6, life: 0.55, gravity: -0.05, drag: 1.5 },
  ember: { radius: 2.6, life: 1.7, gravity: -0.42, drag: 0.55 },
};
// 撒相粒子
export function burst(pool: Effects, kind: Particle['kind'], posX: number, posY: number, team: number, count: number, speed: number, radius?: number, life?: number): void {
  const phase = PHASE[kind];
  const baseRadius = radius ?? phase.radius;
  const fieldSpan = life ?? phase.life;
  for (let index = 0; index < count; index++) {
    if (pool.particles.length >= pool.capacity) return;
    const angle = Math.random() * TAU;
    const particleSpeed = speed * (0.55 + Math.random() * 0.75);
    const live = fieldSpan * (0.75 + Math.random() * 0.5);
    pool.particles.push({
      posX,
      posY,
      velX: Math.cos(angle) * particleSpeed,
      velY: Math.sin(angle) * particleSpeed,
      radius: baseRadius * (0.6 + Math.random() * 0.8),
      life: live,
      maxLife: live,
      team,
      kind,
      gravity: phase.gravity,
      drag: phase.drag,
      rotation: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 16,
    });
  }
}
// 环池封顶
export function addRing(pool: Effects, posX: number, posY: number, team: number, growth: number, width: number, life = 0.5): void {
  if (pool.rings.length > 140) pool.rings.shift();
  pool.rings.push({ posX, posY, radius: width * 0.6, growth, life, maxLife: life, team, width });
}
// 特效推进
export function stepEffects(pool: Effects, stepSec: number, gravity: number): void {
  const parts = pool.particles;
  for (let index = parts.length - 1; index >= 0; index--) {
    const particle = parts[index];
    particle.life -= stepSec;
    if (particle.life <= 0) {
      parts[index] = parts[parts.length - 1];
      parts.pop();
      continue;
    }
    particle.velY += gravity * particle.gravity * stepSec;
    const damping = 1 - particle.drag * stepSec;
    particle.velX *= damping;
    particle.velY *= damping;
    particle.posX += particle.velX * stepSec;
    particle.posY += particle.velY * stepSec;
    particle.rotation += particle.spin * stepSec;
  }
  for (let index = pool.rings.length - 1; index >= 0; index--) {
    const ringItem = pool.rings[index];
    ringItem.life -= stepSec;
    if (ringItem.life <= 0) {
      pool.rings.splice(index, 1);
      continue;
    }
    ringItem.radius += ringItem.growth * stepSec;
    ringItem.growth *= 1 - 1.6 * stepSec;
  }
}
