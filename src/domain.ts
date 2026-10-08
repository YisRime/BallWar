// 规格与契约
export type TeamColor = 'red' | 'yellow' | 'blue' | 'green';
// 五种弹种
export type Kind = 'spin' | 'stream' | 'shield' | 'ball' | 'eater';
// 运动公共体
export interface Body {
  posX: number;
  posY: number;
  prevX: number;
  prevY: number;
  velX: number;
  velY: number;
  radius: number;
}
// 计数球不出区
export interface CounterBall extends Body {
  team: number;
  carry: number;
  cooldown: number;
  squash: number;
  trail: number[];
  // 漂移力场
  driftX: number;
  driftY: number;
  // 交替出孔
  launches: number;
  // 同枚只结一次
  settledPegs: Peg[];
}
// 类型槽一格
export interface TypeSlot {
  left: number;
  width: number;
  top: number;
  lip: number;
  bottom: number;
  triggerY: number;
  kind: Kind;
  hits: number;
  flash: number;
  lastTeam: number;
}
// 零倍即普通钉
export interface Peg {
  posX: number;
  posY: number;
  radius: number;
  multiplier: number;
  hits: number;
  flash: number;
  lastTeam: number;
}
// 炮口三态
export interface BaseCannon {
  angle: number;
  direction: number;
  flash: number;
  cooldown: number;
}
// 线段与球
export interface BaseBall extends Body {
  id: number;
  team: number;
  kind: Kind;
  form: Form;
  // 剩余方数值
  value: number;
  dead: boolean;
}
// 逐像素归属
export interface Territory {
  owner: Uint8Array;
  buffer: Uint8ClampedArray<ArrayBuffer>;
  counts: Int32Array;
  width: number;
  height: number;
  minY: number;
  maxY: number;
}
// 护盾即生命
export interface Base {
  color: TeamColor;
  label: string;
  guard: number;
  alive: boolean;
  pixels: number;
  score: number;
  fired: number;
  captured: number;
  lost: number;
  // 发射队列
  orders: FireOrder[];
  pending: number;
}
// 一批待射弹药
export interface FireOrder {
  kind: Kind;
  value: number;
}
export interface Particle {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  radius: number;
  life: number;
  maxLife: number;
  team: number;
  kind: 'spark' | 'glow' | 'debris' | 'paint';
  gravity: number;
  drag: number;
  rotation: number;
  spin: number;
}
export interface Ring {
  posX: number;
  posY: number;
  radius: number;
  growth: number;
  life: number;
  maxLife: number;
  team: number;
  width: number;
}
// 特效分池
export interface Effects {
  particles: Particle[];
  rings: Ring[];
  capacity: number;
}
// 画撞同源
export interface Counter {
  balls: CounterBall[];
  boxes: number[];
  ramps: number[];
  pegs: Peg[];
  slots: TypeSlot[];
}
export interface BaseSnapshot {
  color: TeamColor;
  label: string;
  guard: number;
  maxGuard: number;
  pixels: number;
  share: number;
  score: number;
  alive: boolean;
  fired: number;
  captured: number;
  lost: number;
  pending: number;
}
// 快照只读
export interface Snapshot {
  time: number;
  frameRate: number;
  baseBalls: number;
  particles: number;
  free: number;
  captures: number;
  ammo: number;
  firedUnits: number;
  spawned: number;
  bases: BaseSnapshot[];
}
// 世界全状态
export interface World {
  seed: number;
  time: number;
  stepCount: number;
  frameRate: number;
  drawMillis: number;
  bases: Base[];
  counter: Counter;
  baseBalls: BaseBall[];
  territory: Territory;
  cannons: BaseCannon[];
  boardEffects: Effects;
  counterEffects: Effects;
  winner: number;
  flash: number;
  flashTeam: number;
  captures: number;
  ammo: number;
  firedUnits: number;
  dropped: number;
  spawned: number;
  nextId: number;
}
export const COLORS: TeamColor[] = ['red', 'yellow', 'blue', 'green'];
// 四大势力
export const TEAM: Record<TeamColor, { label: string; colorValue: string; channels: [number, number, number] }> = {
  red: { label: '赤焰', colorValue: '#d95c6b', channels: [217, 92, 107] },
  yellow: { label: '金霜', colorValue: '#d9a441', channels: [217, 164, 65] },
  blue: { label: '苍穹', colorValue: '#5f86c9', channels: [95, 134, 201] },
  green: { label: '碧野', colorValue: '#4fae72', channels: [79, 174, 114] },
};
// 弹种总表
export type Form = 'segment' | 'ball' | 'none';
export interface KindInfo {
  label: string;
  form: Form;
  // 库存怎么花
  spend: 'each' | 'all' | 'guard';
  // 单发数值
  units: number;
  // 线段视觉厚度
  width: number;
  // 线段视觉长度
  length: number;
  // 覆盖半径
  reach: number;
  // 基准速度
  speed: number;
  // 出膛间隔步数
  cycle: number;
  // 出膛锁定
  pause: boolean;
  // 异色引力
  pull: number;
}
// 弹种即槽序
export const KINDS: Kind[] = ['spin', 'stream', 'shield', 'ball', 'eater'];
// 一发扣的单位
export const SHOT_UNITS = 16;
// 球径随数值长
export const ORB_RADIUS_MIN = 4;
export const ORB_RADIUS_MAX = 26;
// 开局只摊旋射
export const BAND_KINDS: Kind[] = ['spin'];
export const KIND_INFO: Record<Kind, KindInfo> = {
  // 随炮扫射
  spin: { label: '旋射弹', form: 'segment', spend: 'each', units: SHOT_UNITS, width: 2.2, length: 12, reach: 9, speed: 520, cycle: 2, pause: false, pull: 0 },
  // 锁角连发
  stream: { label: '直射弹', form: 'segment', spend: 'each', units: SHOT_UNITS, width: 2.2, length: 12, reach: 9, speed: 520, cycle: 2, pause: true, pull: 0 },
  // 整转换盾
  shield: { label: '护盾弹', form: 'none', spend: 'guard', units: 0, width: 0, length: 0, reach: 0, speed: 0, cycle: 0, pause: false, pull: 0 },
  // 整批合为一球
  ball: { label: '大球弹', form: 'ball', spend: 'all', units: 0, width: 0, length: 0, reach: 0, speed: 0, cycle: 30, pause: false, pull: 0 },
  // 合球并带引力
  eater: { label: '黑洞弹', form: 'ball', spend: 'all', units: 0, width: 0, length: 0, reach: 0, speed: 0, cycle: 30, pause: false, pull: 1.2 },
};
// 槽三件尺度
export const SLOT_WALL = 6;
export const SLOT_LIP = 6;
export const SLOT_FLOOR = 8;
// 四角带护盾
export const BASE_RADIUS = 10;
export const SHIELD_GAP = 8;
export const GUARD_SPAN_MAX = 26;
export const BASE_INSET = BASE_RADIUS + SHIELD_GAP + GUARD_SPAN_MAX + 20;
// 进账不封顶
export const BASE_GUARD = 10240;
export function shieldReach(guard: number): number {
  const fieldSpan = guard <= 0 ? 0 : GUARD_SPAN_MAX * Math.max(0.12, Math.min(1, guard / BASE_GUARD));
  return fieldSpan > 0 ? BASE_RADIUS + SHIELD_GAP + fieldSpan : BASE_RADIUS;
}
// 面积守恒
export let boardWidth = 1024;
export let boardHeight = 1024;
export let boardArea = 1024 * 1024;
// 重排逻辑尺寸
export function resizeBoard(aspect: number): boolean {
  const clamped = Math.max(0.05, Math.min(20, aspect || 1));
  const width = Math.round(1024 * Math.sqrt(clamped));
  const height = Math.round(1024 / Math.sqrt(clamped));
  if (width === boardWidth && height === boardHeight) return false;
  boardWidth = width;
  boardHeight = height;
  boardArea = width * height;
  return true;
}
// 四角中心现取
export function baseCorner(cornerIndex: number): { posX: number; posY: number } {
  return {
    posX: cornerIndex % 2 === 0 ? BASE_INSET : boardWidth - BASE_INSET,
    posY: cornerIndex < 2 ? BASE_INSET : boardHeight - BASE_INSET,
  };
}
// 换档即换一局
export interface Tune {
  initialCarry: number;
  jitter: number;
  tagCount: number;
  ballCount: number;
  unitPixels: number;
  initialAmmo: number;
}
export const TUNE_DEFAULT: Tune = { initialCarry: 3, jitter: 10, tagCount: 33, ballCount: 2, unitPixels: 4, initialAmmo: 10240 };
export const TUNE: Tune = { ...TUNE_DEFAULT };
// 挡位阶梯
export function ladder(from: number, to: number, allotment: number): number[] {
  const steps = Math.round((to - from) / allotment);
  return Array.from({ length: steps + 1 }, (unused, index) => Number((from + index * allotment).toFixed(10)));
}
// 一挡的规格
export interface TuneSpec {
  key: keyof Tune;
  name: string;
  stops: number[];
  text: (value: number) => string;
}
// 规格总表
export const TUNE_SPECS: TuneSpec[] = [
  { key: 'initialCarry', name: '每投初值', stops: [1, ...ladder(2, 64, 2)], text: (value) => `${value}` },
  { key: 'jitter', name: '撞钉扰动', stops: ladder(0, 45, 5), text: (value) => `±${value}°` },
  { key: 'tagCount', name: '倍率钉数', stops: ladder(5, 97, 4), text: (value) => `${value} 枚` },
  { key: 'ballCount', name: '每色球数', stops: ladder(1, 8, 1), text: (value) => `${value} 颗` },
  { key: 'unitPixels', name: '单值像素', stops: ladder(1, 64, 1), text: (value) => `${value}` },
  { key: 'initialAmmo', name: '初始数值', stops: [...ladder(0, 1020 * 1024, 10240), 1024 * 1024], text: (value) => formatCount(value) },
];
// 定步长率
export const STEP_SEC = 1 / 120;
// 单位后缀
const UNITS = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
// 数字写法
export function formatCount(amount: number): string {
  if (!Number.isFinite(amount)) return '∞';
  const magnitude = Math.abs(amount);
  if (magnitude < 1024) return `${Math.round(amount)}`;
  if (magnitude >= 1024 ** UNITS.length) return amount.toExponential(1).replace('e+', 'e');
  let unitIndex = 1;
  while (unitIndex < UNITS.length - 1 && magnitude >= 1024 ** (unitIndex + 1)) unitIndex++;
  const scaled = amount / 1024 ** unitIndex;
  const text = Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${text.endsWith('.0') ? text.slice(0, -2) : text}${UNITS[unitIndex]}`;
}
// 区间夹取
export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}
// 同种子可复现
export function randomFloat(seedHost: { seed: number }): number {
  seedHost.seed = (seedHost.seed + 0x6d2b79f5) | 0;
  let bits = Math.imul(seedHost.seed ^ (seedHost.seed >>> 15), 1 | seedHost.seed);
  bits = (bits + Math.imul(bits ^ (bits >>> 7), 61 | bits)) ^ bits;
  return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
}
