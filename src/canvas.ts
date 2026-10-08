// 画布共用层
import { COLORS, TEAM, baseCorner } from './domain.ts';
import type { Effects, Kind } from './domain.ts';
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
// 弹种辅助色
export const KIND_ACCENT: Record<Kind, [number, number, number]> = {
  spin: triplet('#ffd48a'),
  stream: triplet('#d6ecff'),
  shield: triplet('#9fe3ff'),
  ball: triplet('#fff7e2'),
  eater: triplet('#c7a6ff'),
};
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
  kindGlow: Record<Kind, HTMLCanvasElement>;
  ballArt: HTMLCanvasElement[];
  pegArt: HTMLCanvasElement;
  gemArt: HTMLCanvasElement;
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
// 柔光圆斑
function makeGlow(channels: [number, number, number], core: number, mid: number): HTMLCanvasElement {
  const layer = makeLayer(64, 64);
  const gradient = layer.brush.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, withAlpha(channels, core));
  gradient.addColorStop(0.3, withAlpha(channels, mid));
  gradient.addColorStop(1, withAlpha(channels, 0));
  layer.brush.fillStyle = gradient;
  layer.brush.fillRect(0, 0, 64, 64);
  return layer.canvas;
}
// 普通钉柱头
function makePegArt(): HTMLCanvasElement {
  const size = 32;
  const center = size / 2;
  const radius = 7;
  const layer = makeLayer(size, size);
  const brush = layer.brush;
  brush.beginPath();
  brush.ellipse(center, center + radius * 0.5, radius * 0.98, radius * 0.7, 0, 0, TAU);
  brush.fillStyle = withAlpha(INK, 0.16);
  brush.fill();
  brush.beginPath();
  brush.arc(center, center, radius + 0.4, 0, TAU);
  brush.fillStyle = withAlpha(INK, 0.24);
  brush.fill();
  const metal = brush.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
  metal.addColorStop(0, PALETTE.wallLit);
  metal.addColorStop(0.46, PALETTE.wall);
  metal.addColorStop(1, PALETTE.lineStrong);
  brush.beginPath();
  brush.arc(center, center, radius, 0, TAU);
  brush.fillStyle = metal;
  brush.fill();
  brush.lineWidth = 1;
  brush.strokeStyle = withAlpha(INK, 0.3);
  brush.stroke();
  brush.beginPath();
  brush.ellipse(center - radius * 0.24, center - radius * 0.3, radius * 0.44, radius * 0.22, -0.5, Math.PI, TAU);
  brush.strokeStyle = withAlpha(RAISE, 0.8);
  brush.lineWidth = 1.1;
  brush.stroke();
  brush.beginPath();
  brush.arc(center, center, radius * 0.3, 0, TAU);
  brush.fillStyle = withAlpha(RAISE, 0.45);
  brush.fill();
  return layer.canvas;
}
// 倍率钉宝石
function makeGemArt(): HTMLCanvasElement {
  const size = 40;
  const center = size / 2;
  const radius = 10;
  const layer = makeLayer(size, size);
  const brush = layer.brush;
  const halo = brush.createRadialGradient(center, center, radius * 0.5, center, center, radius * 1.9);
  halo.addColorStop(0, withAlpha(RAISE, 0.5));
  halo.addColorStop(0.5, withAlpha(RAISE, 0.14));
  halo.addColorStop(1, withAlpha(RAISE, 0));
  brush.fillStyle = halo;
  brush.fillRect(0, 0, size, size);
  const vertex = (index: number, reach: number): [number, number] => [center + Math.cos((-Math.PI / 2) + (index * Math.PI) / 3) * reach, center + Math.sin((-Math.PI / 2) + (index * Math.PI) / 3) * reach];
  const face = brush.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
  face.addColorStop(0, PALETTE.wallLit);
  face.addColorStop(0.4, PALETTE.wall);
  face.addColorStop(0.75, PALETTE.slotEdge);
  face.addColorStop(1, PALETTE.lineStrong);
  brush.beginPath();
  for (let index = 0; index < 6; index++) {
    const [pointX, pointY] = vertex(index, radius);
    if (index) brush.lineTo(pointX, pointY);
    else brush.moveTo(pointX, pointY);
  }
  brush.closePath();
  brush.fillStyle = face;
  brush.fill();
  brush.lineWidth = 1.3;
  brush.strokeStyle = withAlpha(INK, 0.62);
  brush.stroke();
  const inner: [number, number] = [center, center - radius * 0.22];
  brush.strokeStyle = withAlpha(RAISE, 0.42);
  brush.lineWidth = 1;
  brush.beginPath();
  for (let index = 0; index < 6; index++) {
    const [pointX, pointY] = vertex(index, radius * 0.98);
    brush.moveTo(inner[0], inner[1]);
    brush.lineTo(pointX, pointY);
  }
  brush.stroke();
  brush.beginPath();
  brush.moveTo(center, center - radius * 0.78);
  brush.lineTo(center + radius * 0.42, center - radius * 0.2);
  brush.lineTo(center, center + radius * 0.18);
  brush.lineTo(center - radius * 0.42, center - radius * 0.2);
  brush.closePath();
  brush.fillStyle = withAlpha(RAISE, 0.55);
  brush.fill();
  return layer.canvas;
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
    glow: COLORS.map((color) => makeGlow(TEAM[color].channels, 1, 0.45)),
    kindGlow: Object.fromEntries(Object.entries(KIND_ACCENT).map(([kind, channels]) => [kind, makeGlow(channels, 1, 0.28)])) as Record<Kind, HTMLCanvasElement>,
    ballArt: COLORS.map((color) => {
      const channels = TEAM[color].channels;
      const size = 96;
      const center = size / 2;
      const layer = makeLayer(size, size);
      const brush = layer.brush;
      const light: [number, number, number] = [Math.min(255, channels[0] + 110), Math.min(255, channels[1] + 110), Math.min(255, channels[2] + 110)];
      const deep: [number, number, number] = [channels[0] * 0.24, channels[1] * 0.24, channels[2] * 0.24];
      const gradient = brush.createRadialGradient(center - 13, center - 16, 2, center, center, center - 3);
      gradient.addColorStop(0, 'rgba(255,255,255,0.99)');
      gradient.addColorStop(0.17, withAlpha(light, 1));
      gradient.addColorStop(0.6, withAlpha(channels, 1));
      gradient.addColorStop(0.87, withAlpha(deep, 1));
      gradient.addColorStop(1, 'rgba(8,10,12,1)');
      brush.beginPath();
      brush.arc(center, center, center - 3, 0, TAU);
      brush.fillStyle = gradient;
      brush.fill();
      // 底缘反光
      brush.beginPath();
      brush.arc(center, center, center - 8, 0.62, 1.95);
      brush.strokeStyle = withAlpha(light, 0.92);
      brush.lineWidth = 3.6;
      brush.lineCap = 'round';
      brush.stroke();
      // 高光点
      brush.beginPath();
      brush.ellipse(center - 14, center - 17, 11, 7.5, -0.7, 0, TAU);
      brush.fillStyle = 'rgba(255,255,255,0.92)';
      brush.fill();
      brush.beginPath();
      brush.arc(center - 10, center - 12, 3.4, 0, TAU);
      brush.fillStyle = 'rgba(255,255,255,1)';
      brush.fill();
      return layer.canvas;
    }),
    pegArt: makePegArt(),
    gemArt: makeGemArt(),
  };
}
// 尺寸变就重烘
export function resizeView(view: View, boardWidth: number, boardHeight: number): void {
  if (!view.ground || view.ground.width !== boardWidth || view.ground.height !== boardHeight) {
    const layer = makeLayer(boardWidth, boardHeight);
    const scene = layer.brush;
    scene.fillStyle = PALETTE.canvas;
    scene.fillRect(0, 0, boardWidth, boardHeight);
    // 中央暗角
    const vignette = scene.createRadialGradient(boardWidth / 2, boardHeight / 2, Math.min(boardWidth, boardHeight) * 0.08, boardWidth / 2, boardHeight / 2, Math.max(boardWidth, boardHeight) * 0.66);
    vignette.addColorStop(0, withAlpha(INK, 0));
    vignette.addColorStop(0.68, withAlpha(INK, 0.05));
    vignette.addColorStop(1, withAlpha(INK, 0.16));
    scene.fillStyle = vignette;
    scene.fillRect(0, 0, boardWidth, boardHeight);
    const grid = (allotment: number, color: string, width: number) => {
      scene.strokeStyle = color;
      scene.lineWidth = width;
      scene.beginPath();
      for (let index = 0; index <= boardWidth; index += allotment) {
        scene.moveTo(index + 0.5, 0);
        scene.lineTo(index + 0.5, boardHeight);
      }
      for (let index = 0; index <= boardHeight; index += allotment) {
        scene.moveTo(0, index + 0.5);
        scene.lineTo(boardWidth, index + 0.5);
      }
      scene.stroke();
    };
    grid(8, withAlpha(INK, 0.035), 1);
    grid(64, withAlpha(INK, 0.05), 1);
    grid(256, withAlpha(INK, 0.1), 1.4);
    // 中心刻度
    scene.strokeStyle = withAlpha(INK, 0.14);
    scene.lineWidth = 1.4;
    scene.beginPath();
    scene.moveTo(boardWidth / 2, boardHeight / 2 - 26);
    scene.lineTo(boardWidth / 2, boardHeight / 2 + 26);
    scene.moveTo(boardWidth / 2 - 26, boardHeight / 2);
    scene.lineTo(boardWidth / 2 + 26, boardHeight / 2);
    scene.stroke();
    for (const radius of [120, 240, 360]) {
      scene.beginPath();
      scene.arc(boardWidth / 2, boardHeight / 2, radius, 0, TAU);
      scene.strokeStyle = withAlpha(INK, radius === 240 ? 0.1 : 0.06);
      scene.setLineDash(radius === 240 ? [4, 7] : []);
      scene.stroke();
    }
    scene.setLineDash([]);
    // 四角基座垫
    for (let team = 0; team < 4; team++) {
      const corner = baseCorner(team);
      const channels = TEAM[COLORS[team]].channels;
      const halo = scene.createRadialGradient(corner.posX, corner.posY, 4, corner.posX, corner.posY, 96);
      halo.addColorStop(0, withAlpha(channels, 0.13));
      halo.addColorStop(1, withAlpha(channels, 0));
      scene.fillStyle = halo;
      scene.fillRect(corner.posX - 96, corner.posY - 96, 192, 192);
      scene.beginPath();
      scene.arc(corner.posX, corner.posY, 44, 0, TAU);
      scene.strokeStyle = withAlpha(channels, 0.16);
      scene.lineWidth = 1.4;
      scene.stroke();
    }
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
  const parts = pool.particles;
  const stride = Math.max(1, Math.ceil(parts.length / 460));
  const sparks = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const sparkles = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const shards = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  brush.save();
  brush.globalCompositeOperation = 'source-over';
  brush.lineCap = 'round';
  // 晕层先铺
  for (let index = 0; index < parts.length; index += stride) {
    const particle = parts[index];
    if (particle.kind !== 'glow' && particle.kind !== 'paint' && particle.kind !== 'ember') continue;
    const life = particle.life / particle.maxLife;
    const scale = particle.kind === 'glow' ? 5.4 : particle.kind === 'paint' ? 3.6 : 3.1;
    const size = particle.radius * scale * (0.6 + life * 0.7);
    brush.globalAlpha = Math.min(0.9, life * (particle.kind === 'ember' ? 0.55 : 0.72));
    brush.drawImage(view.glow[particle.team], particle.posX - size / 2, particle.posY - size / 2, size, size);
  }
  brush.globalAlpha = 1;
  // 批层构建
  for (let index = 0; index < parts.length; index += stride) {
    const particle = parts[index];
    const life = particle.life / particle.maxLife;
    if (particle.kind === 'spark') {
      const speed = Math.hypot(particle.velX, particle.velY) || 1;
      const tailLength = 1.6 + Math.min(4.4, (speed / 900) * 3.6);
      sparks[particle.team].moveTo(particle.posX - (particle.velX / speed) * tailLength * 2, particle.posY - (particle.velY / speed) * tailLength * 2);
      sparks[particle.team].lineTo(particle.posX + (particle.velX / speed) * tailLength, particle.posY + (particle.velY / speed) * tailLength);
    } else if (particle.kind === 'sparkle') {
      const reach = particle.radius * (0.7 + life * 1.1);
      for (let point = 0; point < 8; point++) {
        const angle = particle.rotation + (point * Math.PI) / 4;
        const radius = point % 2 === 0 ? reach : reach * 0.3;
        const pointX = particle.posX + Math.cos(angle) * radius;
        const pointY = particle.posY + Math.sin(angle) * radius;
        if (point) sparkles[particle.team].lineTo(pointX, pointY);
        else sparkles[particle.team].moveTo(pointX, pointY);
      }
      sparkles[particle.team].closePath();
    } else if (particle.kind === 'shard' || particle.kind === 'debris') {
      const reach = particle.radius * (0.6 + life * 0.85);
      const cosine = Math.cos(particle.rotation);
      const sine = Math.sin(particle.rotation);
      const shape = shards[particle.team];
      const corners = [[0, -reach], [reach * 0.86, reach * 0.72], [-reach * 0.86, reach * 0.72]] as const;
      for (let point = 0; point < 3; point++) {
        const pointX = particle.posX + corners[point][0] * cosine - corners[point][1] * sine;
        const pointY = particle.posY + corners[point][0] * sine + corners[point][1] * cosine;
        if (point) shape.lineTo(pointX, pointY);
        else shape.moveTo(pointX, pointY);
      }
      shape.closePath();
    }
  }
  // 火花两遍描边
  for (let pass = 0; pass < 2; pass++) {
    brush.lineWidth = pass === 0 ? 2.6 : 1;
    for (let team = 0; team < 4; team++) {
      brush.strokeStyle = pass === 0 ? withAlpha(TINT[team], 0.9) : withAlpha(INK, 0.5);
      brush.stroke(sparks[team]);
    }
  }
  // 星芒与碎片
  for (let team = 0; team < 4; team++) {
    brush.fillStyle = withAlpha(TINT[team], 0.95);
    brush.fill(sparkles[team]);
    brush.fill(shards[team]);
    brush.lineWidth = 0.8;
    brush.strokeStyle = withAlpha(INK, 0.45);
    brush.stroke(shards[team]);
  }
  // 冲击环
  for (const ringItem of pool.rings) {
    const life = ringItem.life / ringItem.maxLife;
    brush.globalAlpha = Math.min(1, life * 1.6);
    brush.strokeStyle = withAlpha(TINT[ringItem.team], 0.9);
    brush.lineWidth = Math.max(0.6, ringItem.width * life);
    brush.beginPath();
    brush.arc(ringItem.posX, ringItem.posY, ringItem.radius, 0, TAU);
    brush.stroke();
    brush.globalAlpha = Math.min(0.7, life * 0.8);
    brush.strokeStyle = withAlpha(RAISE, 0.7);
    brush.lineWidth = Math.max(0.4, ringItem.width * life * 0.32);
    brush.beginPath();
    brush.arc(ringItem.posX, ringItem.posY, ringItem.radius * 0.86, 0, TAU);
    brush.stroke();
  }
  brush.globalAlpha = 1;
  brush.restore();
}
