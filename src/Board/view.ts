// 领地区绘制
import { BASE_GUARD, BASE_RADIUS, SHIELD_GAP, TEAM, baseCorner, boardHeight, boardWidth, formatCount, shieldReach } from '../domain.ts';
import type { Kind, World } from '../domain.ts';
import { aim, nextKind } from './model.ts';
import { FONT, INK, KIND_ACCENT, PALETTE, RAISE, TAU, TINT, clearSurface, drawEffects, interpolateX, interpolateY, mixInk, withAlpha } from '../canvas.ts';
import type { View } from '../canvas.ts';
type Triple = [number, number, number];
// 两支色线性混
function mix(source: Triple, target: Triple, ratio: number): Triple {
  return [Math.round(source[0] + (target[0] - source[0]) * ratio), Math.round(source[1] + (target[1] - source[1]) * ratio), Math.round(source[2] + (target[2] - source[2]) * ratio)];
}
// 图标加数
function drawReadout(brush: CanvasRenderingContext2D, kind: 'pending' | 'guard', value: number, centerX: number, centerY: number, channels: Triple): void {
  const label = formatCount(value);
  brush.font = `800 17px ${FONT}`;
  brush.textAlign = 'left';
  brush.lineWidth = 3;
  brush.strokeStyle = PALETTE.halo;
  const iconWidth = 11;
  const originX = centerX - (iconWidth + 5 + brush.measureText(label).width) / 2;
  brush.strokeText(label, originX + iconWidth + 5, centerY);
  brush.fillStyle = mixInk(channels);
  brush.fillText(label, originX + iconWidth + 5, centerY);
  const iconX = originX + iconWidth / 2;
  const iconY = centerY - 5;
  if (kind === 'pending') {
    // 待发小球
    brush.beginPath();
    brush.arc(iconX, iconY, iconWidth / 2, 0, TAU);
    brush.fillStyle = withAlpha(channels, 0.95);
    brush.fill();
    brush.lineWidth = 1.2;
    brush.strokeStyle = withAlpha(INK, 0.7);
    brush.stroke();
    brush.beginPath();
    brush.arc(iconX, iconY, iconWidth / 2 - 1.6, Math.PI + 0.5, TAU - 0.5);
    brush.strokeStyle = withAlpha(RAISE, 0.85);
    brush.stroke();
    return;
  }
  // 护盾小盾
  brush.beginPath();
  brush.moveTo(iconX - 5.2, iconY - 5.4);
  brush.lineTo(iconX + 5.2, iconY - 5.4);
  brush.lineTo(iconX + 5.2, iconY - 0.6);
  brush.quadraticCurveTo(iconX + 5.2, iconY + 3.8, iconX, iconY + 5.6);
  brush.quadraticCurveTo(iconX - 5.2, iconY + 3.8, iconX - 5.2, iconY - 0.6);
  brush.closePath();
  brush.fillStyle = withAlpha(mix(channels, INK, 0.34), 0.95);
  brush.fill();
  brush.lineWidth = 1.2;
  brush.strokeStyle = withAlpha(INK, 0.7);
  brush.stroke();
  brush.beginPath();
  brush.moveTo(iconX - 3.1, iconY - 3.4);
  brush.lineTo(iconX + 3.1, iconY - 3.4);
  brush.lineWidth = 1.1;
  brush.strokeStyle = withAlpha(RAISE, 0.72);
  brush.stroke();
}
// 护盾泡与能量弧
function drawShield(brush: CanvasRenderingContext2D, world: World, team: number, corner: { posX: number; posY: number }): void {
  const base = world.bases[team];
  if (!base.alive || base.guard <= 0) return;
  const radius = shieldReach(base.guard);
  const full = Math.min(1, base.guard / BASE_GUARD);
  // 慢呼吸错峰
  const breathe = 0.86 + 0.14 * Math.sin(world.time * 1.9 + team * 1.7);
  brush.lineCap = 'round';
  // 球形护盾
  const sphere = brush.createRadialGradient(corner.posX - radius * 0.28, corner.posY - radius * 0.32, radius * 0.04, corner.posX, corner.posY, radius);
  sphere.addColorStop(0, withAlpha(mix(RAISE, TINT[team], 0.08), 0.14 + full * 0.05));
  sphere.addColorStop(0.72, withAlpha(TINT[team], 0.055 + full * 0.035));
  sphere.addColorStop(1, withAlpha(TINT[team], 0.015));
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, radius, 0, TAU);
  brush.fillStyle = sphere;
  brush.fill();
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, radius, 0, TAU);
  brush.lineWidth = 4.5 + 2 * full;
  brush.strokeStyle = withAlpha(TINT[team], (0.15 + 0.14 * full) * breathe);
  brush.stroke();
  brush.lineWidth = 1.8 + 1 * full;
  brush.strokeStyle = withAlpha(TINT[team], (0.54 + 0.3 * full) * breathe);
  brush.stroke();
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, radius - 4.2, 0, TAU);
  brush.lineWidth = 0.9;
  brush.strokeStyle = withAlpha(RAISE, 0.42 * breathe);
  brush.stroke();
  // 旋转虚线环
  brush.setLineDash([10, 9]);
  brush.lineDashOffset = -world.time * 42;
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, radius - 1.6, 0, TAU);
  brush.lineWidth = 1.3;
  brush.strokeStyle = withAlpha(RAISE, 0.34 * breathe);
  brush.stroke();
  brush.setLineDash([]);
  // 错峰能量弧
  for (let arcIndex = 0; arcIndex < 3; arcIndex++) {
    const start = world.time * 1.3 + team * 2.1 + arcIndex * 2.6;
    brush.beginPath();
    brush.arc(corner.posX, corner.posY, radius * 0.965, start, start + 0.5);
    brush.lineWidth = 2.2;
    brush.strokeStyle = withAlpha(RAISE, 0.42 * breathe);
    brush.stroke();
  }
  brush.lineCap = 'butt';
}
// 弹群分桶
function drawProjectiles(brush: CanvasRenderingContext2D, view: View, world: World, alpha: number): void {
  const orbs = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const rims = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const specs = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const halos = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const tails = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const cores = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const disks = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const live = [0, 0, 0, 0];
  const segmentOrbs: { team: number; kind: Kind; posX: number; posY: number }[] = [];
  for (const baseBall of world.baseBalls) {
    if (baseBall.dead || !world.bases[baseBall.team].alive) continue;
    const posX = interpolateX(baseBall, alpha);
    const posY = interpolateY(baseBall, alpha);
    const team = baseBall.team;
    live[team] = 1;
    const speed = Math.hypot(baseBall.velX, baseBall.velY) || 1;
    const dirX = baseBall.velX / speed;
    const dirY = baseBall.velY / speed;
    const normalX = -dirY;
    const normalY = dirX;
    if (baseBall.form === 'segment') {
      // 发光半透明小球
      segmentOrbs.push({ team, kind: baseBall.kind, posX, posY });
      continue;
    }
    // 球形体
    const radius = baseBall.radius;
    halos[team].moveTo(posX + radius + 6, posY);
    halos[team].arc(posX, posY, radius + 6, 0, TAU);
    const tailLength = radius * 2.6;
    const tailWidth = radius * 0.78;
    tails[team].moveTo(posX + normalX * tailWidth, posY + normalY * tailWidth);
    tails[team].lineTo(posX - dirX * tailLength, posY - dirY * tailLength);
    tails[team].lineTo(posX - normalX * tailWidth, posY - normalY * tailWidth);
    tails[team].closePath();
    if (baseBall.kind === 'eater') {
      // 黑洞：暗核加吸积盘
      const coreRadius = Math.max(2, radius * 0.6);
      cores[team].moveTo(posX + coreRadius, posY);
      cores[team].arc(posX, posY, coreRadius, 0, TAU);
      const spin = world.time * 2.6 + baseBall.id;
      for (let band = 0; band < 3; band++) {
        const bandRadius = radius * (0.82 + band * 0.16);
        const start = spin * (band % 2 === 0 ? 1 : -1.4) + band * 2.1;
        disks[team].moveTo(posX + Math.cos(start) * bandRadius, posY + Math.sin(start) * bandRadius);
        disks[team].arc(posX, posY, bandRadius, start, start + 1.5 + band * 0.5);
      }
    } else {
      orbs[team].moveTo(posX + radius, posY);
      orbs[team].arc(posX, posY, radius, 0, TAU);
      rims[team].moveTo(posX + radius - 2.6, posY);
      rims[team].arc(posX, posY, radius - 2.6, 0, TAU);
      const specRadius = Math.max(1.4, radius * 0.3);
      specs[team].moveTo(posX - radius * 0.3 + specRadius, posY - radius * 0.34);
      specs[team].arc(posX - radius * 0.3, posY - radius * 0.34, specRadius, 0, TAU);
    }
  }
  brush.save();
  brush.globalCompositeOperation = 'source-over';
  brush.lineCap = 'round';
  brush.lineJoin = 'round';
  // 线段柔光球
  for (const orb of segmentOrbs) {
    const bodySize = orb.kind === 'spin' ? 30 : 28;
    brush.globalAlpha = 0.82;
    brush.drawImage(view.glow[orb.team], orb.posX - bodySize / 2, orb.posY - bodySize / 2, bodySize, bodySize);
    const coreSize = orb.kind === 'spin' ? 15 : 12;
    brush.globalAlpha = 0.9;
    brush.drawImage(view.kindGlow[orb.kind], orb.posX - coreSize / 2, orb.posY - coreSize / 2, coreSize, coreSize);
  }
  brush.globalAlpha = 1;
  // 拖尾
  for (let team = 0; team < 4; team++) {
    if (!live[team]) continue;
    brush.fillStyle = withAlpha(TINT[team], 0.2);
    brush.fill(tails[team]);
  }
  // 球晕
  for (let team = 0; team < 4; team++) {
    if (!live[team]) continue;
    brush.fillStyle = withAlpha(TINT[team], 0.16);
    brush.fill(halos[team]);
  }
  // 球体
  for (let team = 0; team < 4; team++) {
    if (!live[team]) continue;
    brush.lineWidth = 5;
    brush.strokeStyle = withAlpha(INK, 0.85);
    brush.stroke(orbs[team]);
    brush.fillStyle = withAlpha(TINT[team], 0.97);
    brush.fill(orbs[team]);
    brush.lineWidth = 1.6;
    brush.strokeStyle = withAlpha(RAISE, 0.8);
    brush.stroke(rims[team]);
    brush.fillStyle = withAlpha(RAISE, 0.7);
    brush.fill(specs[team]);
  }
  // 黑洞
  for (let team = 0; team < 4; team++) {
    if (!live[team]) continue;
    brush.fillStyle = 'rgba(6,6,10,0.95)';
    brush.fill(cores[team]);
    brush.lineWidth = 1.4;
    brush.strokeStyle = withAlpha(TINT[team], 0.9);
    brush.stroke(cores[team]);
    brush.lineWidth = 2;
    brush.strokeStyle = withAlpha(KIND_ACCENT.eater, 0.6);
    brush.stroke(disks[team]);
    brush.lineWidth = 1;
    brush.strokeStyle = withAlpha(RAISE, 0.35);
    brush.stroke(disks[team]);
  }
  brush.restore();
}
// 基地与炮塔
function drawBase(brush: CanvasRenderingContext2D, world: World, team: number): void {
  const base = world.bases[team];
  const corner = baseCorner(team);
  const channels = TEAM[base.color].channels;
  const cannon = world.cannons[team];
  brush.save();
  brush.lineCap = 'butt';
  if (!base.alive) {
    brush.strokeStyle = PALETTE.faint;
    brush.lineWidth = 4;
    const index = BASE_RADIUS * 0.9;
    brush.beginPath();
    brush.moveTo(corner.posX - index, corner.posY - index);
    brush.lineTo(corner.posX + index, corner.posY + index);
    brush.moveTo(corner.posX + index, corner.posY - index);
    brush.lineTo(corner.posX - index, corner.posY + index);
    brush.stroke();
    brush.restore();
    return;
  }
  const kindIndex = nextKind(world, team);
  const muzzleAng = kindIndex >= 0 ? aim(world, team) : cannon.angle;
  const flash = cannon.flash;
  // 脉动光环
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 3 + team);
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, BASE_RADIUS + 7 + pulse * 2, 0, TAU);
  brush.strokeStyle = withAlpha(channels, 0.28 * pulse);
  brush.lineWidth = 2;
  brush.stroke();
  // 核心球体
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, BASE_RADIUS, 0, TAU);
  brush.fillStyle = withAlpha(channels, 1);
  brush.fill();
  brush.strokeStyle = withAlpha(INK, 0.72);
  brush.lineWidth = 1.5;
  brush.stroke();
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, BASE_RADIUS - 2.2, Math.PI + 0.5, TAU - 0.5);
  brush.strokeStyle = withAlpha(RAISE, 0.8);
  brush.lineWidth = 1.2;
  brush.stroke();
  // 旋转照准标
  brush.setLineDash([3, 6]);
  brush.lineDashOffset = -world.time * 30;
  brush.beginPath();
  brush.arc(corner.posX, corner.posY, BASE_RADIUS - 4.4, 0, TAU);
  brush.strokeStyle = withAlpha(RAISE, 0.5);
  brush.lineWidth = 1;
  brush.stroke();
  brush.setLineDash([]);
  const muzzle = BASE_RADIUS + 8 - flash * 3;
  const brkLen = 5;
  const breech = BASE_RADIUS - 8;
  const halfBar = 3.2;
  const halfBrake = 4.4;
  const hull: [number, number, number, number, number] = [-11, -8.5, 22, 17, 5];
  const turret = (shadow: boolean): void => {
    brush.save();
    brush.translate(corner.posX + (shadow ? 1.6 : 0), corner.posY + (shadow ? 2.2 : 0));
    brush.rotate(muzzleAng);
    brush.beginPath();
    brush.roundRect(breech, -halfBrake, muzzle - breech, halfBrake * 2, 2);
    brush.roundRect(hull[0], hull[1], hull[2], hull[3], hull[4]);
    if (shadow) {
      brush.fillStyle = withAlpha(INK, 0.17);
      brush.fill();
      brush.restore();
      return;
    }
    brush.lineWidth = 1.35;
    brush.strokeStyle = withAlpha(INK, 0.72);
    // 炮身暗一档
    brush.beginPath();
    brush.roundRect(breech, -halfBar, muzzle - brkLen - breech, halfBar * 2, 1.6);
    brush.fillStyle = withAlpha(mix(channels, INK, 0.42), 1);
    brush.fill();
    brush.stroke();
    // 炮口罩亮一档
    brush.beginPath();
    brush.roundRect(muzzle - brkLen, -halfBrake, brkLen, halfBrake * 2, 1.8);
    brush.fillStyle = withAlpha(mix(channels, RAISE, 0.3), 1);
    brush.fill();
    brush.stroke();
    // 膛口内凹
    brush.beginPath();
    brush.ellipse(muzzle - 1.2, 0, 1.2, halfBar - 0.4, 0, 0, TAU);
    brush.fillStyle = withAlpha(INK, 0.92);
    brush.fill();
    // 舱体随炮口转
    brush.beginPath();
    brush.roundRect(hull[0], hull[1], hull[2], hull[3], hull[4]);
    const armor = brush.createLinearGradient(-10, -8, 10, 8);
    armor.addColorStop(0, withAlpha(mix(channels, RAISE, 0.32), 1));
    armor.addColorStop(0.52, withAlpha(channels, 1));
    armor.addColorStop(1, withAlpha(mix(channels, INK, 0.18), 1));
    brush.fillStyle = armor;
    brush.fill();
    brush.lineWidth = 1.4;
    brush.stroke();
    brush.beginPath();
    brush.roundRect(-6.5, -5.5, 13, 11, 3);
    brush.strokeStyle = withAlpha(RAISE, 0.48);
    brush.lineWidth = 1;
    brush.stroke();
    if (flash > 0.05) {
      // 出膛焰瓣
      const flame = 4 + 9 * flash;
      brush.beginPath();
      brush.moveTo(muzzle + 0.5, -2.8);
      brush.lineTo(muzzle + flame, 0);
      brush.lineTo(muzzle + 0.5, 2.8);
      brush.closePath();
      brush.fillStyle = withAlpha(mix(channels, RAISE, 0.75), 0.9 * flash);
      brush.fill();
      brush.beginPath();
      brush.moveTo(muzzle + 0.5, -2.8);
      brush.lineTo(muzzle + flame, 0);
      brush.lineTo(muzzle + 0.5, 2.8);
      brush.closePath();
      brush.strokeStyle = withAlpha(KIND_ACCENT.stream, 0.8 * flash);
      brush.lineWidth = 1;
      brush.stroke();
    }
    brush.restore();
  };
  turret(true);
  turret(false);
  brush.restore();
}
// 绘制次序
export function renderBoard(view: View, world: World, alpha: number): void {
  const surface = view.board;
  const brush = surface.brush;
  clearSurface(surface, PALETTE.canvas);
  brush.drawImage(view.ground!, 0, 0, boardWidth, boardHeight);
  // 只传脏行
  const territory = world.territory;
  const layer = view.territory!;
  let image = view.image;
  if (view.territorySource !== territory.buffer || !image) {
    image = view.image = new ImageData(territory.buffer, boardWidth, boardHeight);
    view.territorySource = territory.buffer;
    layer.brush.clearRect(0, 0, boardWidth, boardHeight);
    layer.brush.putImageData(image, 0, 0);
  } else if (territory.maxY >= territory.minY) {
    layer.brush.putImageData(image, 0, 0, 0, territory.minY, boardWidth, territory.maxY - territory.minY + 1);
  }
  territory.minY = boardHeight;
  territory.maxY = -1;
  brush.save();
  brush.drawImage(view.territory!.canvas, 0, 0, boardWidth, boardHeight);
  for (let team = 0; team < 4; team++) drawShield(brush, world, team, baseCorner(team));
  drawProjectiles(brush, view, world, alpha);
  brush.restore();
  for (let team = 0; team < 4; team++) drawBase(brush, world, team);
  drawEffects(brush, view, world.boardEffects);
  // 标签置顶
  for (let team = 0; team < 4; team++) {
    const base = world.bases[team];
    if (!base.alive) continue;
    const corner = baseCorner(team);
    const channels = TEAM[base.color].channels;
    const inner = BASE_RADIUS + SHIELD_GAP;
    drawReadout(brush, 'pending', base.pending, corner.posX, corner.posY - inner - 8, channels);
    drawReadout(brush, 'guard', base.guard, corner.posX, corner.posY + inner + 16, channels);
  }
  if (world.flash > 0.01) {
    brush.save();
    brush.globalCompositeOperation = 'source-over';
    brush.fillStyle = withAlpha(TINT[world.flashTeam], world.flash * 0.26);
    brush.fillRect(0, 0, boardWidth, boardHeight);
    brush.restore();
  }
  let leader = 0;
  for (let team = 1; team < 4; team++) if (world.bases[team].pixels > world.bases[leader].pixels) leader = team;
  brush.strokeStyle = withAlpha(TINT[leader], 0.4);
  brush.lineWidth = 3;
  brush.strokeRect(1.5, 1.5, boardWidth - 3, boardHeight - 3);
}
