// 画布共用层
import { COLORS, TEAM } from './domain.ts';
import type { Effects } from './domain.ts';
export const TAU = Math.PI * 2;
export const FONT = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
export const TINT = COLORS.map((color) => TEAM[color].channels);
// 墨色随令牌翻
export let INK: [number, number, number] = [9, 9, 11];
export let RAISE: [number, number, number] = [255, 255, 255];
// 色板契约
const SKIN: Record<string, [string, string]> = {
  canvas: ['--canvas', '#f1f4f2'],
  panel: ['--panel', '#f7f8f6'],
  raise: ['--raise', '#ffffff'],
  triggerY: ['--line', '#dfe5e0'],
  lineStrong: ['--line-strong', '#cbd4ce'],
  ink: ['--ink', '#19231f'],
  dim: ['--dim', '#53615a'],
  faint: ['--faint', '#7b8981'],
  cavity: ['--slot-cavity', '#e4e9e6'],
  wall: ['--slot-wall', '#c8d2cc'],
  wallLit: ['--slot-wall-lit', '#ffffff'],
  floor: ['--slot-floor', '#fafcf9'],
  slotEdge: ['--slot-edge', '#aebbb3'],
  veil: ['--veil', '#dce5df'],
  halo: ['--halo', 'rgba(255, 255, 255, 0.92)'],
};
// 取色总表
export const PALETTE: Record<string, string> = {};
for (const key in SKIN) PALETTE[key] = SKIN[key][1];
// 取三分量
export function triplet(value: string): [number, number, number] {
  if (value[0] === '#') {
    const parsed = Number.parseInt(value.slice(1, 7), 16);
    return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
  }
  const parsed = value.match(/[\d.]+/g) ?? [];
  return [Number(parsed[0]) || 0, Number(parsed[1]) || 0, Number(parsed[2]) || 0];
}
// 带透明度
export function withAlpha(channel: [number, number, number], alpha: number): string {
  return `rgba(${channel[0]},${channel[1]},${channel[2]},${alpha})`;
}
// 向墨压一半
export function mixInk(channel: [number, number, number]): string {
  return `rgb(${Math.round((channel[0] + INK[0]) / 2)},${Math.round((channel[1] + INK[1]) / 2)},${Math.round((channel[2] + INK[2]) / 2)})`;
}
// 插值式子
export function interpolateX(point: { prevX: number; posX: number }, alpha: number): number {
  return point.prevX + (point.posX - point.prevX) * alpha;
}
export function interpolateY(point: { prevY: number; posY: number }, alpha: number): number {
  return point.prevY + (point.posY - point.prevY) * alpha;
}
export interface Surface {
  canvas: HTMLCanvasElement;
  brush: CanvasRenderingContext2D;
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}
export interface Layer {
  canvas: HTMLCanvasElement;
  brush: CanvasRenderingContext2D;
}
// 视图资产
export interface View {
  board: Surface;
  counter: Surface;
  ground: HTMLCanvasElement | null;
  territory: Layer | null;
  image: ImageData | null;
  territorySource: Uint8ClampedArray | null;
  glow: HTMLCanvasElement[];
  ballArt: HTMLCanvasElement[];
}
// 画布表面
function makeSurface(canvas: HTMLCanvasElement, logicalWidth: number, logicalHeight: number): Surface {
  const brush = canvas.getContext('2d', { alpha: false });
  if (!brush) throw new Error('画布上下文创建失败');
  return { canvas, brush, logicalWidth, logicalHeight, scale: 1, offsetX: 0, offsetY: 0 };
}
// 离屏图层
function makeLayer(width: number, height: number): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const brush = canvas.getContext('2d');
  if (!brush) throw new Error('画布上下文创建失败');
  return { canvas, brush };
}
// 整块补底
export function clearSurface(surface: Surface, paint: string | CanvasGradient): void {
  const brush = surface.brush;
  brush.setTransform(1, 0, 0, 1, 0, 0);
  brush.fillStyle = paint;
  brush.fillRect(0, 0, surface.canvas.width, surface.canvas.height);
  brush.setTransform(surface.scale, 0, 0, surface.scale, surface.offsetX, surface.offsetY);
}
// 铺满卡片
export function fitSurface(surface: Surface, logicalWidth: number, logicalHeight: number, cssWidth: number, cssHeight: number): void {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const bufferWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
  const bufferHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
  surface.canvas.style.width = `${cssWidth}px`;
  surface.canvas.style.height = `${cssHeight}px`;
  if (surface.logicalWidth !== logicalWidth || surface.logicalHeight !== logicalHeight) {
    surface.logicalWidth = logicalWidth;
    surface.logicalHeight = logicalHeight;
    surface.scale = 0;
  }
  surface.scale = Math.min(bufferWidth / surface.logicalWidth, bufferHeight / surface.logicalHeight);
  surface.offsetX = (bufferWidth - surface.logicalWidth * surface.scale) / 2;
  surface.offsetY = (bufferHeight - surface.logicalHeight * surface.scale) / 2;
  if (surface.canvas.width === bufferWidth && surface.canvas.height === bufferHeight) return;
  surface.canvas.width = bufferWidth;
  surface.canvas.height = bufferHeight;
}
// 读色板烘资产
export function createView(boardCanvas: HTMLCanvasElement, counterCanvas: HTMLCanvasElement): View {
  const styles = getComputedStyle(document.documentElement);
  for (const key in SKIN) {
    const got = styles.getPropertyValue(SKIN[key][0]).trim();
    if (got) PALETTE[key] = got;
  }
  INK = triplet(PALETTE.ink);
  RAISE = triplet(PALETTE.raise);
  return {
    board: makeSurface(boardCanvas, 1, 1),
    counter: makeSurface(counterCanvas, 1, 1),
    ground: null,
    territory: null,
    image: null,
    territorySource: null,
    glow: COLORS.map((color) => {
      const layer = makeLayer(64, 64);
      const gradient = layer.brush.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, withAlpha(TEAM[color].channels, 1));
      gradient.addColorStop(0.3, withAlpha(TEAM[color].channels, 0.45));
      gradient.addColorStop(1, withAlpha(TEAM[color].channels, 0));
      layer.brush.fillStyle = gradient;
      layer.brush.fillRect(0, 0, 64, 64);
      return layer.canvas;
    }),
    ballArt: COLORS.map((color) => {
      const channels = TEAM[color].channels;
      const layer = makeLayer(64, 64);
      const light: [number, number, number] = [Math.min(255, channels[0] + 95), Math.min(255, channels[1] + 95), Math.min(255, channels[2] + 95)];
      const shadowColor: [number, number, number] = [channels[0] * 0.3, channels[1] * 0.3, channels[2] * 0.3];
      const gradient = layer.brush.createRadialGradient(25, 22, 1, 32, 32, 31);
      gradient.addColorStop(0, 'rgba(255,255,255,0.98)');
      gradient.addColorStop(0.2, withAlpha(light, 1));
      gradient.addColorStop(0.7, withAlpha(channels, 1));
      gradient.addColorStop(1, withAlpha(shadowColor, 1));
      layer.brush.fillStyle = gradient;
      layer.brush.beginPath();
      layer.brush.arc(32, 32, 30, 0, TAU);
      layer.brush.fill();
      return layer.canvas;
    }),
  };
}
// 尺寸变就重烘
export function resizeView(view: View, boardWidth: number, boardHeight: number): void {
  if (!view.ground || view.ground.width !== boardWidth || view.ground.height !== boardHeight) {
    const layer = makeLayer(boardWidth, boardHeight);
    layer.brush.fillStyle = PALETTE.canvas;
    layer.brush.fillRect(0, 0, boardWidth, boardHeight);
    const grid = (allotment: number, color: string) => {
      layer.brush.strokeStyle = color;
      layer.brush.lineWidth = 1;
      layer.brush.beginPath();
      for (let index = 0; index <= boardWidth; index += allotment) {
        layer.brush.moveTo(index + 0.5, 0);
        layer.brush.lineTo(index + 0.5, boardHeight);
      }
      for (let index = 0; index <= boardHeight; index += allotment) {
        layer.brush.moveTo(0, index + 0.5);
        layer.brush.lineTo(boardWidth, index + 0.5);
      }
      layer.brush.stroke();
    };
    grid(8, withAlpha(INK, 0.045));
    grid(128, withAlpha(INK, 0.08));
    view.ground = layer.canvas;
  }
  if (!view.territory || view.territory.canvas.width !== boardWidth || view.territory.canvas.height !== boardHeight) {
    view.territory = makeLayer(boardWidth, boardHeight);
    view.image = null;
    view.territorySource = null;
  }
}
// 晕底落字
export function drawCount(brush: CanvasRenderingContext2D, posX: number, posY: number, text: string, font: string, foreground: string): void {
  brush.save();
  brush.textAlign = 'center';
  brush.font = font;
  brush.lineWidth = 3;
  brush.strokeStyle = PALETTE.halo;
  brush.strokeText(text, posX, posY);
  brush.fillStyle = foreground;
  brush.fillText(text, posX, posY);
  brush.restore();
}
// 特效抽样
export function drawEffects(brush: CanvasRenderingContext2D, view: View, pool: Effects): void {
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const parts = pool.particles;
  const stride = Math.max(1, Math.ceil(parts.length / 420));
  brush.save();
  brush.globalCompositeOperation = 'source-over';
  brush.lineCap = 'round';
  for (let index = 0; index < parts.length; index += stride) {
    const particle = parts[index];
    const life = particle.life / particle.maxLife;
    if (particle.kind === 'spark') {
      const speed = Math.hypot(particle.velX, particle.velY) || 1;
      const tailLength = 1.6 + Math.min(4, (speed / 900) * 3.2);
      paths[particle.team].moveTo(particle.posX - (particle.velX / speed) * tailLength * 2, particle.posY - (particle.velY / speed) * tailLength * 2);
      paths[particle.team].lineTo(particle.posX + (particle.velX / speed) * tailLength, particle.posY + (particle.velY / speed) * tailLength);
    } else if (particle.kind === 'glow' || particle.kind === 'paint') {
      const size = particle.radius * (particle.kind === 'glow' ? 5.4 : 3.6) * (0.6 + life * 0.7);
      brush.globalAlpha = Math.min(0.9, life * 0.7);
      brush.drawImage(view.glow[particle.team], particle.posX - size / 2, particle.posY - size / 2, size, size);
    } else {
      brush.globalAlpha = Math.min(1, life * 1.5);
      brush.save();
      brush.translate(particle.posX, particle.posY);
      brush.rotate(particle.rotation);
      brush.fillStyle = withAlpha(TINT[particle.team], 0.92);
      brush.fillRect(-particle.radius * 0.5, -particle.radius * 0.5, particle.radius, particle.radius * 0.72);
      brush.restore();
      brush.globalAlpha = 1;
    }
  }
  brush.globalAlpha = 1;
  for (let pass = 0; pass < 2; pass++) {
    brush.lineWidth = pass === 0 ? 2.6 : 1;
    for (let team = 0; team < 4; team++) {
      brush.strokeStyle = pass === 0 ? withAlpha(TINT[team], 0.9) : withAlpha(INK, 0.5);
      brush.stroke(paths[team]);
    }
  }
  for (const ringItem of pool.rings) {
    const life = ringItem.life / ringItem.maxLife;
    brush.globalAlpha = Math.min(1, life * 1.6);
    brush.strokeStyle = withAlpha(TINT[ringItem.team], 0.9);
    brush.lineWidth = Math.max(0.6, ringItem.width * life);
    brush.beginPath();
    brush.arc(ringItem.posX, ringItem.posY, ringItem.radius, 0, TAU);
    brush.stroke();
  }
  brush.globalAlpha = 1;
  brush.restore();
}
