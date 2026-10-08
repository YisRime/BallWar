// 领地区模型
import { BAND_KINDS, COLORS, KIND_INFO, KINDS, ORB_RADIUS_MAX, ORB_RADIUS_MIN, TEAM, TUNE, baseCorner, boardArea, boardHeight, boardWidth, clamp, shieldReach } from '../domain.ts';
import { burst, addRing } from '../effect.ts';
import type { Base, BaseBall, Kind, Territory, World } from '../domain.ts';
// 线段物理半径
const SEGMENT_RADIUS = 3;
// 球速只跟数值
const BALL_POSE = { radius: 0, speed: 0 };
function ballPose(value: number): typeof BALL_POSE {
  const ratio = Math.min(1, Math.sqrt(Math.max(1, value)) / Math.sqrt(4096));
  BALL_POSE.radius = ORB_RADIUS_MIN + (ORB_RADIUS_MAX - ORB_RADIUS_MIN) * ratio;
  BALL_POSE.speed = 300 * (0.42 + (1 - 0.42) * (1 - ratio));
  return BALL_POSE;
}
// 信用耗尽即死
function outOfCredit(baseBall: BaseBall): boolean {
  return baseBall.value * TUNE.unitPixels < 1;
}
// 色板带灰幕
function paletteOf(grey: [number, number, number]): Array<[number, number, number]> {
  return [
    [0, 0, 0],
    ...COLORS.map((color) => TEAM[color].channels.map((channel, index) => Math.round(channel * 0.9 + grey[index] * 0.1)) as [number, number, number]),
  ];
}
let PALETTE = paletteOf([110, 112, 120]);
// 重涂灰幕
export function recolor(territory: Territory, grey: [number, number, number]): void {
  PALETTE = paletteOf(grey);
  const owner = territory.owner;
  for (let pixelIndex = 0; pixelIndex < owner.length; pixelIndex++) if (owner[pixelIndex]) setPixel(territory, pixelIndex, owner[pixelIndex]);
}
// 写入像素
function setPixel(territory: Territory, pixelIndex: number, ownerCode: number): void {
  territory.owner[pixelIndex] = ownerCode;
  const channel = PALETTE[ownerCode];
  // 斜织暗纹
  const weave = ((pixelIndex % boardWidth) + ((pixelIndex / boardWidth) | 0)) % 4 === 0 ? 0.88 : 1;
  const channelStart = pixelIndex << 2;
  territory.buffer[channelStart] = channel[0] * weave;
  territory.buffer[channelStart + 1] = channel[1] * weave;
  territory.buffer[channelStart + 2] = channel[2] * weave;
  territory.buffer[channelStart + 3] = ownerCode ? 255 : 0;
  const rowIndex = (pixelIndex / boardWidth) | 0;
  if (rowIndex < territory.minY) territory.minY = rowIndex;
  if (rowIndex > territory.maxY) territory.maxY = rowIndex;
}
// 开局零地
export function resetTerritory(world: World): void {
  const territory = world.territory;
  territory.owner.fill(0);
  territory.buffer.fill(0);
  territory.counts.fill(0);
  for (let team = 0; team < 4; team++) world.bases[team].pixels = 0;
  territory.minY = 0;
  territory.maxY = boardHeight - 1;
}
// 整段搬旧图
export function resizeTerritory(world: World): void {
  const territory = world.territory;
  const oldWidth = territory.width;
  const oldHeight = territory.height;
  const copyW = Math.min(oldWidth, boardWidth);
  const copyH = Math.min(oldHeight, boardHeight);
  const owner = new Uint8Array(boardArea);
  const buffer = new Uint8ClampedArray(boardArea * 4);
  for (let row = 0; row < copyH; row++) {
    const sourceRow = row * oldWidth;
    const targetRow = row * boardWidth;
    owner.set(territory.owner.subarray(sourceRow, sourceRow + copyW), targetRow);
    for (let column = 0; column < copyW; column++) {
      const sourceStart = (sourceRow + column) << 2;
      const targetStart = (targetRow + column) << 2;
      buffer[targetStart] = territory.buffer[sourceStart];
      buffer[targetStart + 1] = territory.buffer[sourceStart + 1];
      buffer[targetStart + 2] = territory.buffer[sourceStart + 2];
      buffer[targetStart + 3] = territory.buffer[sourceStart + 3];
    }
  }
  territory.owner = owner;
  territory.buffer = buffer;
  territory.width = boardWidth;
  territory.height = boardHeight;
  territory.counts = new Int32Array(4);
  // 整盘重传
  territory.minY = 0;
  territory.maxY = boardHeight - 1;
  for (const baseBall of world.baseBalls) {
    if (baseBall.posX < 0 || baseBall.posX > boardWidth || baseBall.posY < 0 || baseBall.posY > boardHeight) {
      baseBall.dead = true;
      continue;
    }
    baseBall.posX = clamp(baseBall.posX, baseBall.radius, boardWidth - baseBall.radius);
    baseBall.posY = clamp(baseBall.posY, baseBall.radius, boardHeight - baseBall.radius);
    baseBall.prevX = baseBall.posX;
    baseBall.prevY = baseBall.posY;
  }
  recount(world);
}
// 入列一批
function enqueue(base: Base, kind: Kind, value: number): void {
  if (value <= 0) return;
  base.orders.push({ kind, value });
}
// 按差额加减
export function applySeed(world: World, value: number, applied: number): void {
  const want = Math.max(0, Math.round(value));
  const diff = want - applied;
  if (diff === 0) return;
  const each = diff / BAND_KINDS.length;
  for (const base of world.bases) {
    if (!base.alive) continue;
    if (diff > 0) {
      let given = 0;
      // 摊给开局线段
      for (const kind of BAND_KINDS) {
        const allotment = Math.round(each);
        enqueue(base, kind, allotment);
        given += allotment;
      }
      if (given !== diff) enqueue(base, BAND_KINDS[0], diff - given);
      base.pending += diff;
    } else {
      let left = -diff;
      while (left > 0 && base.orders.length > 0) {
        const tail = base.orders[base.orders.length - 1];
        const take = Math.min(tail.value, left);
        tail.value -= take;
        left -= take;
        if (tail.value <= 1e-9) base.orders.pop();
      }
      base.pending = Math.max(0, base.pending + diff);
    }
  }
  world.ammo = Math.max(0, world.ammo + diff * 4);
}
// 全量重算占地
export function recount(world: World): void {
  const territory = world.territory;
  territory.counts.fill(0);
  const owner = territory.owner;
  for (let pixelIndex = 0; pixelIndex < owner.length; pixelIndex++) {
    if (owner[pixelIndex]) territory.counts[owner[pixelIndex] - 1]++;
  }
  for (let team = 0; team < 4; team++) world.bases[team].pixels = territory.counts[team];
}
// 涂改扣值
function convert(world: World, baseBall: BaseBall, posX: number, posY: number, radius: number): number {
  const territory = world.territory;
  const team = baseBall.team;
  const ownerCode = team + 1;
  const radiusSquared = radius * radius;
  const left = Math.max(0, (posX - radius) | 0);
  const right = Math.min(boardWidth - 1, (posX + radius + 1) | 0);
  const top = Math.max(0, (posY - radius) | 0);
  const bottom = Math.min(boardHeight - 1, (posY + radius + 1) | 0);
  const owner = territory.owner;
  // 十点早退
  const midX = (left + right) >> 1;
  const midY = (top + bottom) >> 1;
  const topRow = top * boardWidth;
  const middleRow = midY * boardWidth;
  const bottomRow = bottom * boardWidth;
  if (
    owner[topRow + left] === ownerCode &&
    owner[topRow + midX] === ownerCode &&
    owner[topRow + right] === ownerCode &&
    owner[middleRow + left] === ownerCode &&
    owner[middleRow + midX] === ownerCode &&
    owner[middleRow + right] === ownerCode &&
    owner[bottomRow + left] === ownerCode &&
    owner[bottomRow + midX] === ownerCode &&
    owner[bottomRow + right] === ownerCode &&
    owner[clamp(posY | 0, top, bottom) * boardWidth + clamp(posX | 0, left, right)] === ownerCode
  ) {
    return 0;
  }
  // 每像素都花值
  let budget = Math.max(0, Math.floor(baseBall.value * TUNE.unitPixels));
  let gained = 0;
  let enemy = 0;
  for (let pixelY = top; pixelY <= bottom; pixelY++) {
    const deltaY = pixelY + 0.5 - posY;
    const remain = radiusSquared - deltaY * deltaY;
    if (remain <= 0) continue;
    const halfSpan = Math.sqrt(remain);
    // 只扫圆内
    let rowLeft = (posX - halfSpan) | 0;
    let rowRight = (posX + halfSpan + 1) | 0;
    if (rowLeft < left) rowLeft = left;
    if (rowRight > right) rowRight = right;
    const rowStart = pixelY * boardWidth;
    for (let pixelX = rowLeft; pixelX <= rowRight; pixelX++) {
      const deltaX = pixelX + 0.5 - posX;
      if (deltaX * deltaX + deltaY * deltaY > radiusSquared) continue;
      const pixelIndex = rowStart + pixelX;
      const previous = owner[pixelIndex];
      if (previous === ownerCode) continue;
      if (budget <= 0) continue;
      // 空地异色同价
      setPixel(territory, pixelIndex, ownerCode);
      if (previous !== 0) {
        const victim = world.bases[previous - 1];
        territory.counts[previous - 1]--;
        victim.pixels--;
        victim.lost++;
        enemy++;
      }
      budget--;
      gained++;
    }
  }
  if (gained > 0) {
    // 循环外一次写
    territory.counts[team] += gained;
    const base = world.bases[team];
    base.pixels += gained;
    base.score += gained + enemy * 4;
    base.captured += gained;
    world.captures += gained;
    baseBall.value = Math.max(0, baseBall.value - gained / TUNE.unitPixels);
    if (enemy > 0 && Math.random() < 0.05) burst(world.boardEffects, 'paint', posX, posY, team, 2, 130);
  }
  return gained;
}
// 炮口恒速旋转
export function stepCannons(world: World, stepSec: number): void {
  for (let team = 0; team < 4; team++) {
    const cannon = world.cannons[team];
    cannon.flash = Math.max(0, cannon.flash - stepSec * 5);
    const base = world.bases[team];
    if (!base.alive) continue;
    // 连射锁角
    const kindIndex = nextKind(world, team);
    const hold = kindIndex >= 0 && KIND_INFO[KINDS[kindIndex]].pause;
    if (!hold) cannon.angle += cannon.direction * 0.55 * stepSec;
    if (cannon.angle > Math.PI) cannon.angle -= 2 * Math.PI;
    else if (cannon.angle < -Math.PI) cannon.angle += 2 * Math.PI;
  }
}
// 队首弹种
export function nextKind(world: World, team: number): number {
  const base = world.bases[team];
  if (!base.alive || base.orders.length === 0) return -1;
  return KINDS.indexOf(base.orders[0].kind);
}
// 画撞同一角
export function aim(world: World, team: number): number {
  return world.cannons[team].angle;
}
// 弹药恒等式
export function deliver(world: World, team: number, kind: Kind, count: number): void {
  if (count <= 0) return;
  const base = world.bases[team];
  world.ammo += count;
  if (!base.alive) {
    world.dropped += count;
    return;
  }
  enqueue(base, kind, count);
  base.pending += count;
}
// 统一节拍出膛
export function stepFiring(world: World): void {
  for (let team = 0; team < 4; team++) {
    const cannon = world.cannons[team];
    cannon.cooldown -= 1;
    if (cannon.cooldown > 0) continue;
    const base = world.bases[team];
    const order = base.orders[0];
    if (!base.alive || !order) {
      cannon.cooldown = 4;
      continue;
    }
    const kindInfo = KIND_INFO[order.kind];
    cannon.cooldown = Math.max(1, kindInfo.cycle);
    if (kindInfo.spend === 'guard') {
      const units = order.value;
      base.orders.shift();
      if (units > 0) {
        base.pending -= units;
        world.firedUnits += units;
        base.fired++;
        base.guard += units;
        cannon.flash = 1;
        const corner = baseCorner(team);
        addRing(world.boardEffects, corner.posX, corner.posY, team, 260, 6, 0.42);
        burst(world.boardEffects, 'glow', corner.posX, corner.posY, team, 2, 110, 10, 0.34);
        burst(world.boardEffects, 'sparkle', corner.posX, corner.posY, team, 4, 70, 6, 0.6);
      }
      continue;
    }
    // 逐发或整批
    const value = kindInfo.spend === 'all' ? order.value : Math.min(kindInfo.units, order.value);
    if (value <= 0) {
      base.orders.shift();
      continue;
    }
    const corner = baseCorner(team);
    const isBall = kindInfo.form === 'ball';
    const pose = isBall ? ballPose(value) : null;
    const ang = aim(world, team);
    const speed = pose ? pose.speed : kindInfo.speed;
    world.spawned++;
    world.baseBalls.push({
      id: world.nextId++,
      team,
      kind: order.kind,
      form: kindInfo.form,
      posX: corner.posX,
      posY: corner.posY,
      prevX: corner.posX,
      prevY: corner.posY,
      velX: Math.cos(ang) * speed,
      velY: Math.sin(ang) * speed,
      radius: pose ? pose.radius : SEGMENT_RADIUS,
      value,
      dead: false,
    });
    cannon.flash = 1;
    burst(world.boardEffects, 'glow', corner.posX, corner.posY, team, 1, 80, 6, 0.2);
    addRing(world.boardEffects, corner.posX, corner.posY, team, 46, 1.6, 0.2);
    burst(world.boardEffects, 'sparkle', corner.posX, corner.posY, team, 1, 60, 5, 0.4);
    order.value -= value;
    base.pending -= value;
    world.firedUnits += value;
    base.fired++;
    if (order.value <= 1e-9) base.orders.shift();
  }
}
// 撞盾统一反弹
function strike(world: World, baseBall: BaseBall): boolean {
  for (let team = 0; team < 4; team++) {
    if (team === baseBall.team || !world.bases[team].alive) continue;
    const base = world.bases[team];
    const corner = baseCorner(team);
    const deltaX = baseBall.posX - corner.posX;
    const deltaY = baseBall.posY - corner.posY;
    const reach = shieldReach(base.guard) + baseBall.radius;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared > reach * reach) continue;
    const distance = Math.max(1e-3, Math.sqrt(distanceSquared));
    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    const bite = Math.min(base.guard, baseBall.value);
    base.guard -= bite;
    baseBall.value = Math.max(0, baseBall.value - bite);
    const normalSpeed = baseBall.velX * normalX + baseBall.velY * normalY;
    if (normalSpeed < 0) {
      baseBall.velX -= 2 * normalSpeed * normalX;
      baseBall.velY -= 2 * normalSpeed * normalY;
    }
    baseBall.posX = corner.posX + normalX * (reach + 0.5);
    baseBall.posY = corner.posY + normalY * (reach + 0.5);
    baseBall.prevX = baseBall.posX;
    baseBall.prevY = baseBall.posY;
    addRing(world.boardEffects, baseBall.posX, baseBall.posY, team, 360, 5, 0.3);
    burst(world.boardEffects, 'spark', baseBall.posX, baseBall.posY, team, 2, 240);
    burst(world.boardEffects, 'shard', baseBall.posX, baseBall.posY, team, 2, 220);
    if (base.guard <= 0) collapse(world, team);
    return true;
  }
  return false;
}
// 沿折线盖章
function stampPath(world: World, baseBall: BaseBall, ax: number, ay: number, bx: number, by: number): void {
  const radius = baseBall.form === 'ball' ? baseBall.radius : KIND_INFO[baseBall.kind].reach;
  const span = Math.hypot(bx - ax, by - ay);
  const stamps = Math.max(1, Math.ceil(span / Math.max(2, radius * 0.9)));
  for (let stampIndex = 1; stampIndex <= stamps; stampIndex++) {
    const ratio = stampIndex / stamps;
    convert(world, baseBall, ax + (bx - ax) * ratio, ay + (by - ay) * ratio, radius);
    if (outOfCredit(baseBall)) return;
  }
}
// 异色互削
const COLLIDE_CELL = 36;
function collideBalls(world: World): void {
  const balls = world.baseBalls;
  const cells = new Map<number, BaseBall[]>();
  for (const baseBall of balls) {
    if (baseBall.dead) continue;
    const key = (((baseBall.posX / COLLIDE_CELL) | 0) * 100003) + ((baseBall.posY / COLLIDE_CELL) | 0);
    const bucket = cells.get(key);
    if (bucket) bucket.push(baseBall);
    else cells.set(key, [baseBall]);
  }
  for (const baseBall of balls) {
    if (baseBall.dead) continue;
    const cellX = (baseBall.posX / COLLIDE_CELL) | 0;
    const cellY = (baseBall.posY / COLLIDE_CELL) | 0;
    for (let gridX = cellX - 1; gridX <= cellX + 1; gridX++) {
      for (let gridY = cellY - 1; gridY <= cellY + 1; gridY++) {
        const bucket = cells.get(gridX * 100003 + gridY);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.dead || other === baseBall || other.team === baseBall.team || other.id < baseBall.id) continue;
          const deltaX = baseBall.posX - other.posX;
          const deltaY = baseBall.posY - other.posY;
          const reach = baseBall.radius + other.radius + 2;
          if (deltaX * deltaX + deltaY * deltaY > reach * reach) continue;
          const bite = Math.min(baseBall.value, other.value);
          baseBall.value = Math.max(0, baseBall.value - bite);
          other.value = Math.max(0, other.value - bite);
          burst(world.boardEffects, 'spark', (baseBall.posX + other.posX) / 2, (baseBall.posY + other.posY) / 2, baseBall.team, 2, 200);
          if (outOfCredit(baseBall)) break;
        }
        if (outOfCredit(baseBall)) break;
      }
      if (outOfCredit(baseBall)) break;
    }
  }
  for (const baseBall of balls) if (!baseBall.dead && outOfCredit(baseBall)) baseBall.dead = true;
}
// 线段与球同律
export function stepBalls(world: World, stepSec: number): void {
  for (const baseBall of world.baseBalls) {
    if (baseBall.dead) continue;
    // 先定半径
    if (baseBall.form === 'ball') baseBall.radius = ballPose(baseBall.value).radius;
    else baseBall.radius = SEGMENT_RADIUS;
    const radius = baseBall.radius;
    baseBall.prevX = baseBall.posX;
    baseBall.prevY = baseBall.posY;
    const p0x = baseBall.prevX;
    const p0y = baseBall.prevY;
    let ex = baseBall.posX + baseBall.velX * stepSec;
    let ey = baseBall.posY + baseBall.velY * stepSec;
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) {
      baseBall.dead = true;
      continue;
    }
    // 本帧折线
    let j1x = 0;
    let j1y = 0;
    let j2x = 0;
    let j2y = 0;
    let joints = 0;
    if (ex < radius) {
      const wall = radius;
      const delta = ex - p0x;
      const cross = delta !== 0 ? (wall - p0x) / delta : 0;
      j1x = wall;
      j1y = p0y + (ey - p0y) * cross;
      joints = 1;
      ex = wall + (wall - ex);
      baseBall.velX = -baseBall.velX;
    } else if (ex > boardWidth - radius) {
      const wall = boardWidth - radius;
      const delta = ex - p0x;
      const cross = delta !== 0 ? (wall - p0x) / delta : 0;
      j1x = wall;
      j1y = p0y + (ey - p0y) * cross;
      joints = 1;
      ex = wall - (ex - wall);
      baseBall.velX = -baseBall.velX;
    }
    if (ey < radius) {
      const wall = radius;
      const lx = joints ? j1x : p0x;
      const ly = joints ? j1y : p0y;
      const delta = ey - ly;
      const cross = delta !== 0 ? (wall - ly) / delta : 0;
      const cx = lx + (ex - lx) * cross;
      if (joints) {
        j2x = cx;
        j2y = wall;
        joints = 2;
      } else {
        j1x = cx;
        j1y = wall;
        joints = 1;
      }
      ey = wall + (wall - ey);
      baseBall.velY = -baseBall.velY;
    } else if (ey > boardHeight - radius) {
      const wall = boardHeight - radius;
      const lx = joints ? j1x : p0x;
      const ly = joints ? j1y : p0y;
      const delta = ey - ly;
      const cross = delta !== 0 ? (wall - ly) / delta : 0;
      const cx = lx + (ex - lx) * cross;
      if (joints) {
        j2x = cx;
        j2y = wall;
        joints = 2;
      } else {
        j1x = cx;
        j1y = wall;
        joints = 1;
      }
      ey = wall - (ey - wall);
      baseBall.velY = -baseBall.velY;
    }
    baseBall.posX = ex;
    baseBall.posY = ey;
    if (baseBall.form === 'ball') {
      // 向球速松弛
      const pose = ballPose(baseBall.value);
      const speed = Math.hypot(baseBall.velX, baseBall.velY);
      if (speed > 1e-3) {
        const damping = 1 + (pose.speed / speed - 1) * Math.min(1, stepSec * 8);
        baseBall.velX *= damping;
        baseBall.velY *= damping;
      }
    }
    // 黑洞拉球
    const pull = KIND_INFO[baseBall.kind].pull;
    if (pull > 0) {
      const reach = 40 + pull * Math.sqrt(Math.max(0, baseBall.value * TUNE.unitPixels));
      const reachSquared = reach * reach;
      for (const other of world.baseBalls) {
        if (other === baseBall || other.dead || other.team === baseBall.team) continue;
        const pullX = baseBall.posX - other.posX;
        const pullY = baseBall.posY - other.posY;
        const distanceSquared = pullX * pullX + pullY * pullY;
        if (distanceSquared > reachSquared) continue;
        const distance = Math.max(1e-3, Math.sqrt(distanceSquared));
        other.velX += (pullX / distance) * 2600 * stepSec;
        other.velY += (pullY / distance) * 2600 * stepSec;
      }
    }
    // 沿折线盖章
    if (joints === 0) {
      stampPath(world, baseBall, p0x, p0y, ex, ey);
    } else if (joints === 1) {
      stampPath(world, baseBall, p0x, p0y, j1x, j1y);
      stampPath(world, baseBall, j1x, j1y, ex, ey);
    } else {
      stampPath(world, baseBall, p0x, p0y, j1x, j1y);
      stampPath(world, baseBall, j1x, j1y, j2x, j2y);
      stampPath(world, baseBall, j2x, j2y, ex, ey);
    }
    strike(world, baseBall);
    if (outOfCredit(baseBall)) {
      baseBall.dead = true;
      if (world.boardEffects.particles.length < world.boardEffects.capacity * 0.5) burst(world.boardEffects, 'glow', baseBall.posX, baseBall.posY, baseBall.team, 2, 80, baseBall.radius * 2.4, 0.24);
    }
  }
  collideBalls(world);
}
// 就地压缩
export function reapBalls(world: World): void {
  let count = 0;
  for (const baseBall of world.baseBalls) if (!baseBall.dead) world.baseBalls[count++] = baseBall;
  world.baseBalls.length = count;
}
// 死色不擦地
function collapse(world: World, team: number): void {
  const base = world.bases[team];
  if (!base.alive) return;
  base.alive = false;
  base.guard = 0;
  world.dropped += base.pending;
  base.pending = 0;
  base.orders.length = 0;
  const corner = baseCorner(team);
  addRing(world.boardEffects, corner.posX, corner.posY, team, 1200, 14, 1.1);
  addRing(world.boardEffects, corner.posX, corner.posY, team, 680, 30, 0.7);
  burst(world.boardEffects, 'spark', corner.posX, corner.posY, team, 16, 720);
  burst(world.boardEffects, 'glow', corner.posX, corner.posY, team, 8, 300, 26, 1.0);
  burst(world.boardEffects, 'debris', corner.posX, corner.posY, team, 8, 400);
  burst(world.boardEffects, 'shard', corner.posX, corner.posY, team, 10, 520);
  burst(world.boardEffects, 'sparkle', corner.posX, corner.posY, team, 12, 260, 8, 0.8);
  world.flash = 0.8;
  world.flashTeam = team;
  for (const baseBall of world.baseBalls) {
    if (baseBall.team === team) baseBall.dead = true;
  }
  checkEnd(world);
}
// 只剩一家即胜
export function checkEnd(world: World): void {
  if (world.winner >= 0) return;
  let alive = 0;
  let last = -1;
  for (let team = 0; team < 4; team++) {
    if (world.bases[team].alive) {
      alive++;
      last = team;
    }
  }
  if (alive === 1) {
    world.winner = last;
    const corner = baseCorner(last);
    addRing(world.boardEffects, corner.posX, corner.posY, last, 820, 13, 1.3);
    burst(world.boardEffects, 'glow', boardWidth / 2, boardHeight / 2, last, 18, 240, 26, 1.1);
    burst(world.boardEffects, 'sparkle', boardWidth / 2, boardHeight / 2, last, 16, 200, 10, 1.2);
    burst(world.boardEffects, 'shard', boardWidth / 2, boardHeight / 2, last, 12, 360);
    world.flash = 0.6;
    world.flashTeam = last;
  } else if (alive === 0) {
    world.winner = 4;
  }
}
