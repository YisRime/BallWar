// 计数区绘制
import { FONT, INK, PALETTE, RAISE, TAU, TINT, clearSurface, drawCount, drawEffects, interpolateX, interpolateY, mixInk, withAlpha } from '../canvas.ts';
import { formatCount } from '../domain.ts';
import { HOLE_RADIUS, HOLE_Y, RAMP_RISE, counterHeight, counterWidth, holeX } from './model.ts';
import type { World } from '../domain.ts';
import type { View } from '../canvas.ts';
// 钉是一枚柱头
function drawPeg(brush: CanvasRenderingContext2D, posX: number, posY: number, radius: number): void {
  brush.beginPath();
  brush.ellipse(posX, posY + radius * 0.46, radius * 0.96, radius * 0.72, 0, 0, TAU);
  brush.fillStyle = withAlpha(INK, 0.18);
  brush.fill();
  brush.beginPath();
  brush.arc(posX, posY, radius + 0.35, 0, TAU);
  brush.fillStyle = withAlpha(INK, 0.22);
  brush.fill();
  brush.beginPath();
  brush.arc(posX, posY, radius, 0, TAU);
  const metal = brush.createLinearGradient(posX - radius, posY - radius, posX + radius, posY + radius);
  metal.addColorStop(0, PALETTE.wallLit);
  metal.addColorStop(0.42, PALETTE.wall);
  metal.addColorStop(1, PALETTE.lineStrong);
  brush.fillStyle = metal;
  brush.fill();
  brush.strokeStyle = withAlpha(INK, 0.28);
  brush.lineWidth = Math.max(0.8, radius * 0.13);
  brush.stroke();
  brush.beginPath();
  brush.ellipse(posX - radius * 0.24, posY - radius * 0.28, radius * 0.43, radius * 0.22, -0.5, Math.PI, TAU);
  brush.strokeStyle = withAlpha(RAISE, 0.72);
  brush.lineWidth = Math.max(0.8, radius * 0.12);
  brush.stroke();
}
// 绘制次序
export function renderCounter(view: View, world: World, alpha: number): void {
  const surface = view.counter;
  const brush = surface.brush;
  const counter = world.counter;
  clearSurface(surface, PALETTE.canvas);
  {
    const gradient = brush.createLinearGradient(0, 0, 0, counterHeight);
    gradient.addColorStop(0, PALETTE.panel);
    gradient.addColorStop(0.52, PALETTE.canvas);
    gradient.addColorStop(1, PALETTE.canvas);
    brush.fillStyle = gradient;
    brush.fillRect(0, 0, counterWidth, counterHeight);
  }
  for (const centerX of [holeX(0), holeX(1)]) {
    brush.beginPath();
    brush.arc(centerX, HOLE_Y, HOLE_RADIUS + 4, 0, TAU);
    brush.fillStyle = withAlpha(INK, 0.08);
    brush.fill();
    brush.beginPath();
    brush.arc(centerX, HOLE_Y, HOLE_RADIUS, 0, TAU);
    brush.fillStyle = PALETTE.cavity;
    brush.fill();
    const shade = brush.createLinearGradient(0, HOLE_Y - HOLE_RADIUS, 0, HOLE_Y + HOLE_RADIUS);
    shade.addColorStop(0, withAlpha(INK, 0.28));
    shade.addColorStop(0.6, withAlpha(INK, 0.02));
    brush.fillStyle = shade;
    brush.fill();
    brush.beginPath();
    brush.arc(centerX, HOLE_Y, HOLE_RADIUS, 0, TAU);
    brush.strokeStyle = PALETTE.slotEdge;
    brush.lineWidth = 1;
    brush.stroke();
    // 孔底提亮
    brush.beginPath();
    brush.arc(centerX, HOLE_Y, HOLE_RADIUS - 1.4, 0.45, Math.PI - 0.45);
    brush.strokeStyle = withAlpha(RAISE, 0.85);
    brush.lineWidth = 1.4;
    brush.stroke();
    for (const ball of counter.balls) {
      if (ball.posY > HOLE_Y + 40 || Math.abs(ball.posX - centerX) > 40) continue;
      brush.beginPath();
      brush.arc(centerX, HOLE_Y, HOLE_RADIUS + 3.4, 0, TAU);
      brush.strokeStyle = withAlpha(TINT[ball.team], 0.5);
      brush.lineWidth = 2;
      brush.stroke();
    }
  }
  // 普通钉先立
  for (const peg of counter.pegs) if (!peg.multiplier) drawPeg(brush, peg.posX, peg.posY, peg.radius);
  for (const peg of counter.pegs) {
    if (!peg.multiplier) continue;
    const lit = peg.flash > 0.05 && peg.lastTeam >= 0;
    drawPeg(brush, peg.posX, peg.posY, peg.radius);
    if (lit) {
      brush.beginPath();
      brush.arc(peg.posX, peg.posY, peg.radius - 0.6, 0, TAU);
      brush.fillStyle = withAlpha(TINT[peg.lastTeam], 0.3 + peg.flash * 0.5);
      brush.fill();
    }
    // 只多一道环
    brush.beginPath();
    brush.arc(peg.posX, peg.posY, peg.radius + 2.4, 0, TAU);
    brush.strokeStyle = withAlpha(lit ? TINT[peg.lastTeam] : INK, lit ? 0.5 + peg.flash * 0.4 : 0.24);
    brush.lineWidth = 1.2;
    brush.stroke();
  }
  {
    const { lip, top, triggerY } = counter.slots[0];
    const foot = counterHeight;
    const slotHead = lip + 1;
    const gutter = 3;
    // 底部共用基线
    for (const slot of counter.slots) {
      const lit = slot.flash > 0.05 && slot.lastTeam >= 0;
      const left = slot.left + gutter;
      const width = slot.width - gutter * 2;
      brush.beginPath();
      brush.roundRect(left, slotHead, width, foot - slotHead, 5);
      brush.fillStyle = PALETTE.cavity;
      brush.fill();
      brush.strokeStyle = PALETTE.slotEdge;
      brush.lineWidth = 1;
      brush.stroke();
      brush.save();
      brush.beginPath();
      brush.roundRect(left + 1, slotHead + 1, width - 2, foot - slotHead - 2, 4);
      brush.clip();
      if (lit) {
        const channels = TINT[slot.lastTeam];
        brush.fillStyle = withAlpha(channels, 0.07 + slot.flash * 0.13);
        brush.fillRect(left, slotHead, width, foot - slotHead);
        const litGradient = brush.createLinearGradient(0, triggerY, 0, foot);
        litGradient.addColorStop(0, withAlpha(channels, 0.32 + slot.flash * 0.22));
        litGradient.addColorStop(1, withAlpha(channels, 0.08 + slot.flash * 0.12));
        brush.fillStyle = litGradient;
        brush.fillRect(left, triggerY, width, foot - triggerY);
      }
      brush.restore();
      // 凹槽与凸唇
      brush.fillStyle = PALETTE.slotEdge;
      brush.fillRect(left + 3, triggerY, width - 6, 1.5);
      brush.fillStyle = PALETTE.wallLit;
      brush.fillRect(left, slotHead, width, 1);
    }
  }
  drawEffects(brush, view, world.counterEffects);
  for (const ball of counter.balls) {
    const posX = interpolateX(ball, alpha);
    const posY = interpolateY(ball, alpha);
    const channels = TINT[ball.team];
    if (ball.trail.length > 3) {
      // 尾迹分两档
      const fast = Math.hypot(ball.velX, ball.velY) > 240;
      brush.strokeStyle = withAlpha(channels, fast ? 0.5 : 0.28);
      brush.lineWidth = ball.radius * (fast ? 0.85 : 0.62);
      brush.lineCap = 'round';
      brush.beginPath();
      brush.moveTo(ball.trail[0], ball.trail[1]);
      for (let trailIndex = 2; trailIndex < ball.trail.length; trailIndex += 2) brush.lineTo(ball.trail[trailIndex], ball.trail[trailIndex + 1]);
      brush.stroke();
      brush.lineCap = 'butt';
    }
    brush.save();
    brush.translate(posX, posY);
    const angle = Math.atan2(ball.velY, ball.velX);
    brush.rotate(angle);
    brush.scale(1 + ball.squash, 1 - ball.squash);
    brush.rotate(-angle);
    brush.drawImage(view.ballArt[ball.team], -ball.radius, -ball.radius, ball.radius * 2, ball.radius * 2);
    brush.restore();
  }
  // 文字最后画
  for (const peg of counter.pegs) {
    if (!peg.multiplier) continue;
    const lit = peg.flash > 0.05 && peg.lastTeam >= 0;
    drawCount(brush, peg.posX, peg.posY - peg.radius - 5, `×${peg.multiplier}`, `700 13px ${FONT}`, lit ? mixInk(TINT[peg.lastTeam]) : PALETTE.dim);
  }
  for (const slot of counter.slots) {
    brush.save();
    brush.translate(slot.left + slot.width / 2, slot.top - 35);
    brush.strokeStyle = PALETTE.dim;
    brush.fillStyle = PALETTE.dim;
    brush.lineWidth = 2.4;
    brush.lineCap = 'round';
    brush.lineJoin = 'round';
    brush.strokeStyle = PALETTE.dim;
    brush.fillStyle = PALETTE.dim;
    // 无框剪影
    if (slot.kind === 'stream') {
      brush.beginPath();
      brush.moveTo(-13, -8);
      brush.lineTo(-13, 8);
      brush.stroke();
      for (const [deltaX, radius] of [[-6, 2.2], [1, 2.8], [9, 3.5]] as const) {
        brush.beginPath();
        brush.arc(deltaX, 0, radius, 0, TAU);
        brush.fill();
      }
    } else if (slot.kind === 'spin') {
      brush.beginPath();
      for (let index = 0; index <= 36; index++) {
        const angle = (index / 36) * TAU * 1.35;
        const radius = 1.8 + (index / 36) * 11;
        const pointX = Math.cos(angle) * radius;
        const pointY = Math.sin(angle) * radius;
        if (index) brush.lineTo(pointX, pointY);
        else brush.moveTo(pointX, pointY);
      }
      brush.stroke();
      brush.beginPath();
      brush.arc(Math.cos(TAU * 1.35) * 12.8, Math.sin(TAU * 1.35) * 12.8, 3.2, 0, TAU);
      brush.fill();
    } else if (slot.kind === 'shield') {
      brush.beginPath();
      brush.moveTo(0, -13);
      brush.lineTo(11, -8);
      brush.lineTo(9, 3);
      brush.quadraticCurveTo(7, 10, 0, 13);
      brush.quadraticCurveTo(-7, 10, -9, 3);
      brush.lineTo(-11, -8);
      brush.closePath();
      brush.stroke();
      brush.beginPath();
      brush.moveTo(-5, 0);
      brush.lineTo(-1, 4);
      brush.lineTo(6, -5);
      brush.stroke();
    } else if (slot.kind === 'ball') {
      brush.beginPath();
      brush.moveTo(-13, -7);
      brush.lineTo(-6, -7);
      brush.moveTo(-15, 0);
      brush.lineTo(-7, 0);
      brush.moveTo(-12, 7);
      brush.lineTo(-5, 7);
      brush.stroke();
      brush.beginPath();
      brush.arc(5, 0, 9, 0, TAU);
      brush.fill();
    } else {
      brush.beginPath();
      brush.arc(0, 0, 4, 0, TAU);
      brush.fill();
      for (const angle of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const sideX = -sine;
        const sideY = cosine;
        brush.beginPath();
        brush.moveTo(cosine * 6, sine * 6);
        brush.quadraticCurveTo(cosine * 14 + sideX * 5, sine * 14 + sideY * 5, cosine * 13, sine * 13);
        brush.quadraticCurveTo(cosine * 11 - sideX * 4, sine * 11 - sideY * 4, cosine * 6, sine * 6);
        brush.closePath();
        brush.stroke();
      }
      brush.beginPath();
      brush.arc(0, 0, 11, 0, TAU);
      brush.setLineDash([2, 5]);
      brush.globalAlpha = 0.45;
      brush.stroke();
    }
    brush.restore();
    drawCount(brush, slot.left + slot.width / 2, slot.top - 5, `${slot.hits}`, `700 15px ${FONT}`, PALETTE.faint);
  }
  for (const ball of counter.balls) {
    const posX = interpolateX(ball, alpha);
    const posY = interpolateY(ball, alpha) - ball.radius - 7;
    const text = formatCount(ball.carry);
    brush.font = `800 14px ${FONT}`;
    const height = 17;
    const padding = height / 3;
    const textWidth = brush.measureText(text).width;
    const left = posX - textWidth / 2 - padding;
    const top = posY - height / 2 - 1;
    brush.beginPath();
    brush.roundRect(left, top, textWidth + padding * 2, height, Math.min(6, height / 3));
    brush.fillStyle = withAlpha(RAISE, 1);
    brush.fill();
    brush.strokeStyle = PALETTE.lineStrong;
    brush.lineWidth = 1;
    brush.stroke();
    brush.textAlign = 'center';
    brush.fillStyle = mixInk(TINT[ball.team]);
    brush.fillText(text, posX, posY);
  }
}
