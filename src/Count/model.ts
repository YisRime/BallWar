// 弹珠高塔
import { KINDS, SLOT_FLOOR, SLOT_LIP, SLOT_WALL, TUNE, clamp, randomFloat } from '../domain.ts';
import { deliver } from '../Board/model.ts';
import { burst, addRing } from '../effect.ts';
import type { CounterBall, Counter, Peg, TypeSlot, World } from '../domain.ts';
// 物理常量
const GRAVITY = 900;
const SPEED_CAP = 485;
// 平滑游走
const WANDER_RATE = 1.5;
const WANDER_NOISE = 43;
const REST_WALL = 0.5;
const REST_BALL = 0.5;
const TANGENT_FRICTION = 0.07;
// 半径重力同尺
const BALL_RADIUS_MIN = 8;
const BALL_RADIUS_MAX = 19;
const FLAT_LOG = 30;
// 压扁量一档
const SQUASH_SCALE = 2400;
// 尾迹点数
const TRAIL_MAX = 16;
// 褪光速率
const FLASH_FADE = 2.2;
// 投球孔位
export const COUNTER_BASE_WIDTH = 560;
export const COUNTER_BASE_HEIGHT = 1024;
export let counterWidth = COUNTER_BASE_WIDTH;
export let counterHeight = COUNTER_BASE_HEIGHT;
// 竖直预留
const FIELD_TOP = 92;
const FIELD_FOOT = 96;
const ROW_STEP_MIN = 51;
// 塔的竖直下限
function towerMinHeight(): number {
  return FIELD_TOP + (PEG_ROWS - 1) * ROW_STEP_MIN + FIELD_FOOT + SLOT_FLOOR + 12;
}
// 重排栏尺寸
export function resizeCounter(aspect: number): boolean {
  const clamped = Math.max(0.05, Math.min(20, aspect || COUNTER_BASE_WIDTH / COUNTER_BASE_HEIGHT));
  const width = Math.max(COUNTER_BASE_WIDTH, Math.round(towerMinHeight() * clamped));
  const height = Math.max(towerMinHeight(), Math.round(width / clamped));
  if (width === counterWidth && height === counterHeight) return false;
  counterWidth = width;
  counterHeight = height;
  return true;
}
// 孔位导出给画
export const HOLE_Y = 22;
export const HOLE_RADIUS = 11;
export function holeX(side: 0 | 1): number {
  return side === 1 ? counterWidth / 2 + 120 : counterWidth / 2 - 120;
}
// 钉阵排布
const PEG_RADIUS = 7;
// 两道下限
const ROW_PITCH_MIN = 80;
const PEG_ROWS = 17;
// 一侧几列
function rowAt(row: number): number[] {
  const pitch = Math.max(ROW_PITCH_MIN, Math.round(counterWidth / 7 / 20) * 20);
  const center = counterWidth / 2;
  const halfColumns = Math.max(3, Math.floor((center - ROW_PITCH_MIN) / pitch + 0.5));
  const out: number[] = [];
  if (row % 2 === 0) for (let columnIndex = -halfColumns; columnIndex <= halfColumns; columnIndex++) out.push(center + columnIndex * pitch);
  else for (let columnIndex = -halfColumns; columnIndex < halfColumns; columnIndex++) out.push(center + (columnIndex + 0.5) * pitch);
  return out.filter((posX) => posX >= PEG_RADIUS && posX <= counterWidth - PEG_RADIUS);
}
const MIRROR_ROW = (PEG_ROWS - 1) / 2;
// 四枚自闭合
type TagGroup = { row: number; offsetX: number; multiplier: number };
// 大档点位
function tierOf(pair: number, bandIndex: number): number {
  if (pair === 0 && bandIndex === 0) return 8;
  if (pair === 4 && bandIndex === 0) return 4;
  return 2;
}
// 结账先于弹散
function buildPegs(): Peg[] {
  const rounds: TagGroup[][] = [];
  for (let pass = 0; pass < 3; pass++) {
    for (let pair = 0; pair < MIRROR_ROW; pair++) {
      const center = counterWidth / 2;
      const offsetList = rowAt(pair).filter((posX) => posX < center).map((posX) => center - posX);
      const bandIndex = (pair + pass) % 3;
      const offsetX = offsetList[bandIndex];
      rounds.push([
        { row: pair, offsetX, multiplier: tierOf(pair, bandIndex) },
        { row: 2 * MIRROR_ROW - pair, offsetX, multiplier: tierOf(pair, bandIndex) },
      ]);
    }
  }
  const major = rounds.filter((group) => group[0].multiplier > 2).sort((first, second) => second[0].multiplier - first[0].multiplier);
  const queue = [...major, ...rounds.filter((group) => group[0].multiplier === 2)];
  const tagMap = new Map<string, number>();
  const want = Math.round(TUNE.tagCount);
  const put = (row: number, deltaX: number, multiplier: number): void => {
    for (const posX of deltaX === 0 ? [counterWidth / 2] : [counterWidth / 2 - deltaX, counterWidth / 2 + deltaX]) tagMap.set(row + ':' + posX, multiplier);
  };
  put(MIRROR_ROW, 0, 16);
  for (const group of queue) {
    if (tagMap.size + group.length * 2 > want) break;
    for (const entry of group) put(entry.row, entry.offsetX, entry.multiplier);
  }
  const fieldSpan = counterHeight - SLOT_FLOOR - 12 - FIELD_FOOT - FIELD_TOP;
  const step = Math.max(ROW_STEP_MIN, Math.floor(fieldSpan / (PEG_ROWS - 1)));
  const top = FIELD_TOP + Math.floor(Math.max(0, fieldSpan - step * (PEG_ROWS - 1)) / 2);
  const tagged: Peg[] = [];
  const plain: Peg[] = [];
  for (let row = 0; row < PEG_ROWS; row++) {
    const posY = top + row * step;
    for (const posX of rowAt(row)) {
      const peg = { posX, posY, radius: PEG_RADIUS, multiplier: 0, hits: 0, flash: 0, lastTeam: -1 };
      const multiplier = tagMap.get(row + ':' + posX);
      if (multiplier === undefined) plain.push(peg);
      else {
        peg.multiplier = multiplier;
        tagged.push(peg);
      }
    }
    if (row % 2 === 1) plain.push(...[0, counterWidth].map((posX) => ({ posX, posY, radius: PEG_RADIUS, multiplier: 0, hits: 0, flash: 0, lastTeam: -1 })));
  }
  return [...tagged, ...plain];
}
// 重排钉表
export function retagPegs(counter: Counter): void {
  counter.pegs = buildPegs();
}
// 类型槽体
const SLOT_DEPTH = 12;
// 贴边不挤边
const SLOT_INSET = 4;
// 撞击点就地传
const IMPACT = { posX: 0, posY: 0, speed: 0 };
function massOf(ball: CounterBall): number {
  return 1 + ball.carry / 48;
}
// 同一把尺
const POSE = { radius: 0, gravity: 0 };
// 一次算全
function pose(value: number): typeof POSE {
  const magnitude = Math.log2(Math.max(1, value));
  const ratio = Math.min(magnitude, FLAT_LOG) / FLAT_LOG;
  POSE.radius = BALL_RADIUS_MIN + (BALL_RADIUS_MAX - BALL_RADIUS_MIN) * ratio;
  POSE.gravity = GRAVITY * (1 + 0.8 * ratio);
  return POSE;
}
// 冲量解算
function resolve(ball: CounterBall, normalX: number, normalY: number, penetration: number, restitution: number, friction: number, contactX: number, contactY: number): void {
  ball.posX += normalX * penetration;
  ball.posY += normalY * penetration;
  const normalSpeed = ball.velX * normalX + ball.velY * normalY;
  let impactSpeed = 0;
  if (normalSpeed < 0) {
    impactSpeed = -normalSpeed;
    ball.velX -= (1 + restitution) * normalSpeed * normalX;
    ball.velY -= (1 + restitution) * normalSpeed * normalY;
  }
  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentSpeed = ball.velX * tangentX + ball.velY * tangentY;
  ball.velX -= tangentX * tangentSpeed * friction;
  ball.velY -= tangentY * tangentSpeed * friction;
  ball.squash = Math.min(0.45, impactSpeed / SQUASH_SCALE);
  IMPACT.posX = contactX;
  IMPACT.posY = contactY;
  IMPACT.speed = impactSpeed;
}
// 槽壁与底板
export const wallFits = (posX: number): boolean => posX > SLOT_WALL && posX < counterWidth - SLOT_WALL;
// 壁顶斜面
export const RAMP_EXTEND = 2;
export const RAMP_RISE = 5;
// 球群生成
function makeBall(seedHost: { seed: number }, team: number, ballIndex: number): CounterBall {
  const ball: CounterBall = {
    team,
    posX: 0,
    posY: 0,
    prevX: 0,
    prevY: 0,
    velX: 0,
    velY: 0,
    radius: pose(TUNE.initialCarry).radius,
    carry: TUNE.initialCarry,
    cooldown: ballIndex * 0.18,
    driftX: 0,
    driftY: 0,
    launches: ballIndex,
    settledPegs: [],
    squash: 0,
    trail: [],
  };
  launch(seedHost, ball);
  return ball;
}
// 当场补摘球
export function resizeBalls(world: World): void {
  const counter = world.counter;
  const want = Math.round(TUNE.ballCount);
  for (let team = 0; team < 4; team++) {
    if (!world.bases[team].alive) continue;
    let ownCount = 0;
    for (const ball of counter.balls) if (ball.team === team) ownCount++;
    for (let ballIndex = ownCount; ballIndex < want; ballIndex++) counter.balls.push(makeBall(world, team, ballIndex));
    for (let toDrop = ownCount - want, dropIndex = counter.balls.length - 1; toDrop > 0 && dropIndex >= 0; dropIndex--) {
      if (counter.balls[dropIndex].team !== team) continue;
      burst(world.counterEffects, 'spark', counter.balls[dropIndex].posX, counter.balls[dropIndex].posY, team, 8, 200);
      counter.balls.splice(dropIndex, 1);
      toDrop--;
    }
  }
}
// 投放归初值
function launch(seedHost: { seed: number }, ball: CounterBall): void {
  const right = (ball.launches & 1) === 1;
  ball.launches++;
  const ang = (randomFloat(seedHost) * 2 - 1) * (Math.PI / 2);
  const speed = Math.min(SPEED_CAP, 250 + randomFloat(seedHost) * (SPEED_CAP - 250));
  const posX = holeX(right ? 1 : 0);
  ball.posX = posX;
  ball.posY = HOLE_Y;
  ball.prevX = posX;
  ball.prevY = HOLE_Y;
  ball.velX = Math.sin(ang) * speed;
  ball.velY = Math.cos(ang) * speed;
  ball.squash = 0;
  ball.carry = TUNE.initialCarry;
  ball.settledPegs.length = 0;
  ball.trail.length = 0;
}
// 计数区建形
export function buildCounter(seed: number): Counter {
  const seedHost = { seed };
  const balls: CounterBall[] = [];
  for (let team = 0; team < 4; team++) {
    for (let ballIndex = 0; ballIndex < TUNE.ballCount; ballIndex++) balls.push(makeBall(seedHost, team, ballIndex));
  }
  const counter: Counter = { balls, boxes: [], ramps: [], pegs: [], slots: [] };
  relayoutCounter(counter);
  return counter;
}
// 重排静态几何
export function relayoutCounter(counter: Counter): void {
  const previousSlots = counter.slots;
  const top = counterHeight - SLOT_FLOOR - SLOT_DEPTH;
  const lip = top - SLOT_LIP;
  const triggerY = top + SLOT_DEPTH - 3;
  const span = (counterWidth - SLOT_INSET * 2) / KINDS.length;
  const types = Array.from({ length: KINDS.length }, (unused, index): TypeSlot => ({ left: SLOT_INSET + index * span, width: span, top, lip, bottom: top + SLOT_DEPTH, triggerY, kind: KINDS[index], hits: 0, flash: 0, lastTeam: -1 }));
  for (const slot of types) {
    for (const previous of previousSlots) {
      if (previous.kind !== slot.kind) continue;
      if (slot.left <= previous.left && previous.left <= slot.left + slot.width) {
        slot.hits = previous.hits;
        slot.flash = previous.flash;
        slot.lastTeam = previous.lastTeam;
        break;
      }
    }
  }
  const half = SLOT_WALL / 2;
  const boxes: number[] = [];
  for (const slot of types) {
    const bottom = slot.bottom + SLOT_FLOOR;
    const boxTop = slot.lip + RAMP_RISE;
    const leftWall = wallFits(slot.left);
    const rightWall = wallFits(slot.left + slot.width);
    if (leftWall) boxes.push(slot.left - half, boxTop, slot.left + half, bottom);
    if (rightWall) boxes.push(slot.left + slot.width - half, boxTop, slot.left + slot.width + half, bottom);
    boxes.push(leftWall ? slot.left + half : 0, slot.bottom, rightWall ? slot.left + slot.width - half : counterWidth, bottom);
  }
  const rampX = SLOT_WALL + RAMP_EXTEND * 2;
  const rampY = RAMP_RISE;
  const slope = Math.hypot(rampX, rampY);
  const ramps: number[] = [];
  for (const slot of types) {
    for (const wallX of [wallFits(slot.left) ? slot.left : -1, wallFits(slot.left + slot.width) ? slot.left + slot.width : -1]) {
      if (wallX < 0) continue;
      ramps.push(wallX - half - RAMP_EXTEND, slot.lip, wallX + half + RAMP_EXTEND, slot.lip + RAMP_RISE, rampY / slope, -rampX / slope);
    }
  }
  counter.boxes = boxes;
  counter.ramps = ramps;
  counter.pegs = buildPegs();
  counter.slots = types;
  for (const ball of counter.balls) {
    ball.posX = clamp(ball.posX, ball.radius, counterWidth - ball.radius);
    ball.posY = clamp(ball.posY, ball.radius, counterHeight - ball.radius);
    ball.prevX = ball.posX;
    ball.prevY = ball.posY;
  }
}
// 摘除死色
export function retireDead(world: World): void {
  const counter = world.counter;
  if (world.bases.every((base) => base.alive)) return;
  const kept: CounterBall[] = [];
  for (const ball of counter.balls) {
    if (world.bases[ball.team].alive) {
      kept.push(ball);
      continue;
    }
    burst(world.counterEffects, 'spark', ball.posX, ball.posY, ball.team, 8, 200);
    addRing(world.counterEffects, ball.posX, ball.posY, ball.team, 80, 1.8, 0.3);
  }
  counter.balls = kept;
}
// 高速擦碰
function scrape(world: World, ball: CounterBall): void {
  if (IMPACT.speed > 60) burst(world.counterEffects, 'spark', IMPACT.posX, IMPACT.posY, ball.team, 1, 60 + IMPACT.speed * 0.2);
}
// 纯重力推进
export function stepCounter(world: World, stepSec: number): void {
  const counter = world.counter;
  for (const shape of counter.pegs) shape.flash = Math.max(0, shape.flash - stepSec * FLASH_FADE);
  for (const slot of counter.slots) slot.flash = Math.max(0, slot.flash - stepSec * FLASH_FADE);
  // 氛围余烬
  if (world.stepCount % 46 === 0) {
    burst(world.counterEffects, 'ember', Math.random() * counterWidth, counterHeight * (0.35 + Math.random() * 0.6), Math.floor(Math.random() * 4), 1, 18, 3, 1.7);
  }
  const boxList = counter.boxes;
  const rampList = counter.ramps;
  for (const ball of counter.balls) {
    ball.cooldown = Math.max(0, ball.cooldown - stepSec);
    const shape = pose(ball.carry);
    ball.radius = shape.radius;
    ball.prevX = ball.posX;
    ball.prevY = ball.posY;
    ball.velY += shape.gravity * stepSec;
    const damping = 1 - (GRAVITY / SPEED_CAP) * stepSec;
    ball.velX *= damping;
    ball.velY *= damping;
    const speed = Math.hypot(ball.velX, ball.velY);
    if (speed > SPEED_CAP) {
      ball.velX = (ball.velX / speed) * SPEED_CAP;
      ball.velY = (ball.velY / speed) * SPEED_CAP;
    }
    if (!Number.isFinite(ball.posX) || !Number.isFinite(ball.posY) || !Number.isFinite(ball.velX) || !Number.isFinite(ball.velY)) {
      ball.posX = ball.prevX;
      ball.posY = ball.prevY;
      ball.velX = 0;
      ball.velY = 0;
    }
    ball.posX += ball.velX * stepSec;
    ball.posY += ball.velY * stepSec;
    ball.squash += (0 - ball.squash) * Math.min(1, stepSec * 12);
    ball.driftX += -WANDER_RATE * ball.driftX * stepSec + WANDER_NOISE * Math.sqrt(stepSec) * (randomFloat(world) - 0.5) * 3.464;
    ball.driftY += -WANDER_RATE * ball.driftY * stepSec + WANDER_NOISE * Math.sqrt(stepSec) * (randomFloat(world) - 0.5) * 3.464;
    ball.velX += ball.driftX * stepSec;
    ball.velY += ball.driftY * stepSec;
    // 从头撞到尾
    for (const peg of counter.pegs) {
      if (Math.abs(ball.posY - peg.posY) > peg.radius + ball.radius) continue;
      const pegX = ball.posX - peg.posX;
      const pegY = ball.posY - peg.posY;
      const pegReach = ball.radius + peg.radius;
      const pegDistance = pegX * pegX + pegY * pegY;
      if (pegDistance >= pegReach * pegReach) continue;
      const pegLength = Math.max(1e-4, Math.sqrt(pegDistance));
      const pegNormalX = pegX / pegLength;
      const pegNormalY = pegY / pegLength;
      resolve(ball, pegNormalX, pegNormalY, pegReach - pegLength, 0.6, TANGENT_FRICTION, peg.posX + pegNormalX * peg.radius, peg.posY + pegNormalY * peg.radius);
      scrape(world, ball);
      const twistAngle = (randomFloat(world) - 0.5) * 2 * TUNE.jitter * (Math.PI / 180);
      if (twistAngle) {
        const cosine = Math.cos(twistAngle), sine = Math.sin(twistAngle);
        const beforeX = ball.velX;
        ball.velX = beforeX * cosine - ball.velY * sine;
        ball.velY = beforeX * sine + ball.velY * cosine;
      }
      if (peg.multiplier && !ball.settledPegs.includes(peg)) {
        peg.hits++;
        peg.flash = 1;
        peg.lastTeam = ball.team;
        ball.settledPegs.push(peg);
        ball.carry = ball.carry * peg.multiplier;
        burst(world.counterEffects, 'spark', peg.posX, peg.posY, ball.team, 6, 190);
        burst(world.counterEffects, 'sparkle', peg.posX, peg.posY, ball.team, 3, 70, 6, 0.5);
        addRing(world.counterEffects, peg.posX, peg.posY, ball.team, 110, 2.2, 0.26);
      }
    }
    for (let index = 0; index < boxList.length; index += 4) {
      const boxLeft = boxList[index];
      const boxTop = boxList[index + 1];
      const boxRight = boxList[index + 2];
      const boxBottom = boxList[index + 3];
      const nearX = clamp(ball.posX, boxLeft, boxRight);
      const nearY = clamp(ball.posY, boxTop, boxBottom);
      const boxDX = ball.posX - nearX;
      const boxDY = ball.posY - nearY;
      const boxDistance = boxDX * boxDX + boxDY * boxDY;
      if (boxDistance >= ball.radius * ball.radius) continue;
      if (boxDistance > 1e-8) {
        const boxLength = Math.sqrt(boxDistance);
        resolve(ball, boxDX / boxLength, boxDY / boxLength, ball.radius - boxLength, REST_WALL, TANGENT_FRICTION, nearX, nearY);
      } else {
        const depthLeft = ball.posX - boxLeft + ball.radius;
        const depthRight = boxRight - ball.posX + ball.radius;
        const depthUp = ball.posY - boxTop + ball.radius;
        const depthDown = boxBottom - ball.posY + ball.radius;
        const penetration = Math.min(depthLeft, depthRight, depthUp, depthDown);
        const horiz = penetration === depthLeft || penetration === depthRight;
        resolve(ball, horiz ? (penetration === depthLeft ? -1 : 1) : 0, horiz ? 0 : penetration === depthUp ? -1 : 1, penetration, REST_WALL, TANGENT_FRICTION, ball.posX, ball.posY);
      }
      scrape(world, ball);
    }
    for (let index = 0; index < rampList.length; index += 6) {
      const rampLeft = rampList[index];
      const rampTop = rampList[index + 1];
      const rampRight = rampList[index + 2];
      const rampBottom = rampList[index + 3];
      const outsideX = rampList[index + 4];
      const outsideY = rampList[index + 5];
      const edgeX = rampRight - rampLeft;
      const edgeY = rampBottom - rampTop;
      const lengthSquared = edgeX * edgeX + edgeY * edgeY;
      const fraction = lengthSquared > 0 ? clamp(((ball.posX - rampLeft) * edgeX + (ball.posY - rampTop) * edgeY) / lengthSquared, 0, 1) : 0;
      const nearestX = rampLeft + edgeX * fraction;
      const nearestY = rampTop + edgeY * fraction;
      const rampDX = ball.posX - nearestX;
      const rampDY = ball.posY - nearestY;
      if (rampDX * outsideX + rampDY * outsideY <= 0) continue;
      const rampDistance = rampDX * rampDX + rampDY * rampDY;
      if (rampDistance >= ball.radius * ball.radius) continue;
      const rampLength = Math.max(1e-4, Math.sqrt(rampDistance));
      resolve(ball, rampDX / rampLength, rampDY / rampLength, ball.radius - rampLength, REST_WALL, 0.008, nearestX, nearestY);
      scrape(world, ball);
    }
  }
  // 推挤先于收框
  const balls = counter.balls;
  for (let firstIndex = 0; firstIndex < balls.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < balls.length; secondIndex++) {
      const first = balls[firstIndex];
      const second = balls[secondIndex];
      const deltaX = second.posX - first.posX;
      const deltaY = second.posY - first.posY;
      const radiusSum = first.radius + second.radius;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= radiusSum * radiusSum || distanceSquared <= 1e-8) continue;
      const distance = Math.sqrt(distanceSquared);
      const normalX = deltaX / distance;
      const normalY = deltaY / distance;
      const firstMass = massOf(first);
      const secondMass = massOf(second);
      const penetration = radiusSum - distance;
      first.posX -= normalX * penetration * (secondMass / (firstMass + secondMass));
      first.posY -= normalY * penetration * (secondMass / (firstMass + secondMass));
      second.posX += normalX * penetration * (firstMass / (firstMass + secondMass));
      second.posY += normalY * penetration * (firstMass / (firstMass + secondMass));
      const closingSpeed = (second.velX - first.velX) * normalX + (second.velY - first.velY) * normalY;
      if (closingSpeed >= 0) continue;
      const impulse = (-(1 + REST_BALL) * closingSpeed) / (1 / firstMass + 1 / secondMass);
      first.velX -= (impulse / firstMass) * normalX;
      first.velY -= (impulse / firstMass) * normalY;
      second.velX += (impulse / secondMass) * normalX;
      second.velY += (impulse / secondMass) * normalY;
      first.squash = Math.min(0.45, -closingSpeed / SQUASH_SCALE);
      second.squash = first.squash;
      burst(world.counterEffects, 'spark', (first.posX + second.posX) / 2, (first.posY + second.posY) / 2, first.team, 2, 120);
    }
  }
  for (const ball of counter.balls) {
    if (ball.posX - ball.radius < 0) {
      ball.posX = ball.radius;
      if (ball.velX < 0) ball.velX = -ball.velX * REST_WALL;
    } else if (ball.posX + ball.radius > counterWidth) {
      ball.posX = counterWidth - ball.radius;
      if (ball.velX > 0) ball.velX = -ball.velX * REST_WALL;
    }
    if (ball.posY - ball.radius < 0) {
      ball.posY = ball.radius;
      if (ball.velY < 0) ball.velY = -ball.velY * REST_WALL;
    } else if (ball.posY + ball.radius > counterHeight) {
      ball.posY = counterHeight - ball.radius;
      if (ball.velY > 0) ball.velY = -ball.velY * REST_WALL;
    }
  }
  for (const ball of counter.balls) {
    if (ball.cooldown <= 0) {
      for (const slot of counter.slots) {
        if (!(ball.posX >= slot.left && ball.posX <= slot.left + slot.width && Math.abs(ball.posY - slot.triggerY) <= ball.radius)) continue;
        slot.hits++;
        slot.flash = 1;
        slot.lastTeam = ball.team;
        deliver(world, ball.team, slot.kind, ball.carry);
        const landY = ball.posY + ball.radius;
        burst(world.counterEffects, 'spark', ball.posX, landY, ball.team, 9, 210);
        burst(world.counterEffects, 'glow', ball.posX, landY, ball.team, 4, 110, 10, 0.34);
        burst(world.counterEffects, 'sparkle', ball.posX, landY, ball.team, 5, 90, 7, 0.55);
        burst(world.counterEffects, 'shard', ball.posX, landY, ball.team, 3, 150);
        addRing(world.counterEffects, ball.posX, landY, ball.team, 170, 3, 0.32);
        launch(world, ball);
        burst(world.counterEffects, 'glow', ball.posX, ball.posY + 8, ball.team, 3, 130, 8, 0.3);
        addRing(world.counterEffects, ball.posX, ball.posY, ball.team, 60, 1.6, 0.22);
        ball.cooldown = 0.2;
        break;
      }
    }
    ball.trail.push(ball.posX, ball.posY);
    if (ball.trail.length > TRAIL_MAX * 2) ball.trail.splice(0, ball.trail.length - TRAIL_MAX * 2);
  }
}
