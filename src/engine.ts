// 推进与快照
import { BASE_GUARD, BAND_KINDS, COLORS, STEP_SEC, TUNE, TEAM, baseCorner, boardArea, boardHeight, boardWidth, clamp, randomFloat } from './domain.ts';
import { buildCounter, retireDead, stepCounter } from './Count/model.ts';
import { checkEnd, recount, reapBalls, resetTerritory, stepBalls, stepCannons, stepFiring } from './Board/model.ts';
import { stepEffects } from './effect.ts';
import type { Base, Snapshot, World } from './domain.ts';
// 新建世界
export function createWorld(seed: number): World {
  const seedHost = { seed };
  const ammo = Math.max(0, Math.round(TUNE.initialAmmo));
  const bases: Base[] = COLORS.map((color) => {
    const base: Base = {
      color,
      label: TEAM[color].label,
      guard: BASE_GUARD,
      alive: true,
      pixels: 0,
      score: 0,
      fired: 0,
      captured: 0,
      lost: 0,
      orders: [],
      pending: 0,
    };
    const each = Math.floor(ammo / BAND_KINDS.length);
    let left = ammo - each * BAND_KINDS.length;
    for (const kind of BAND_KINDS) {
      const give = each + (left > 0 ? 1 : 0);
      if (left > 0) left--;
      if (give > 0) {
        base.orders.push({ kind, value: give });
        base.pending += give;
      }
    }
    return base;
  });
  const world: World = {
    seed,
    time: 0,
    stepCount: 0,
    frameRate: 0,
    drawMillis: 0,
    bases,
    counter: buildCounter(seed),
    baseBalls: [],
    territory: { owner: new Uint8Array(boardArea), buffer: new Uint8ClampedArray(boardArea * 4), counts: new Int32Array(4), width: boardWidth, height: boardHeight, minY: boardHeight, maxY: -1 },
    cannons: COLORS.map((unused, index) => {
      const corner = baseCorner(index);
      return {
        angle: Math.atan2(boardHeight / 2 - corner.posY, boardWidth / 2 - corner.posX) + (randomFloat(seedHost) - 0.5) * 0.08,
        direction: index % 2 ? -1 : 1,
        flash: 0,
        cooldown: 0,
      };
    }),
    boardEffects: { particles: [], rings: [], capacity: 600 },
    counterEffects: { particles: [], rings: [], capacity: 600 },
    winner: -1,
    flash: 0,
    flashTeam: 0,
    captures: 0,
    // 开局也计生成
    ammo: bases.length * ammo,
    firedUnits: 0,
    dropped: 0,
    spawned: 0,
    nextId: 1,
  };
  resetTerritory(world);
  return world;
}
// 定步长推进
export function stepWorld(world: World, stepSec: number): void {
  world.time += stepSec;
  world.stepCount++;
  world.flash = Math.max(0, world.flash - stepSec * 2.1);
  stepCannons(world, stepSec);
  stepEffects(world.boardEffects, stepSec, 1100);
  stepEffects(world.counterEffects, stepSec, 900);
  stepCounter(world, stepSec);
  stepFiring(world);
  stepBalls(world, stepSec);
  reapBalls(world);
  retireDead(world);
  if (world.stepCount % 240 === 0) {
    recount(world);
    checkEnd(world);
  }
}
// 时钟累加
export interface Clock {
  accumulator: number;
}
// 不设补帧上限
export function stepFrame(world: World, clock: Clock, frameSec: number): number {
  clock.accumulator += clamp(frameSec, 0, 0.25);
  let alpha = 0;
  while (clock.accumulator >= STEP_SEC) {
    stepWorld(world, STEP_SEC);
    clock.accumulator -= STEP_SEC;
    alpha = clock.accumulator / STEP_SEC;
  }
  return alpha;
}
// 世界快照
export function readSnapshot(world: World): Snapshot {
  const territory = world.territory;
  let used = 0;
  for (let team = 0; team < 4; team++) used += territory.counts[team];
  return {
    time: world.time,
    frameRate: world.frameRate,
    baseBalls: world.baseBalls.length,
    particles: world.boardEffects.particles.length + world.counterEffects.particles.length,
    free: boardArea - used,
    captures: world.captures,
    ammo: world.ammo,
    firedUnits: world.firedUnits,
    spawned: world.spawned,
    bases: world.bases.map((base) => ({
      color: base.color,
      label: base.label,
      guard: Math.max(0, Math.round(base.guard)),
      maxGuard: BASE_GUARD,
      pixels: base.pixels,
      share: base.pixels / boardArea,
      score: base.score,
      alive: base.alive,
      fired: base.fired,
      captured: base.captured,
      lost: base.lost,
      pending: base.pending,
    })),
  };
}
