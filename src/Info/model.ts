// 信息区取数
import { TEAM, formatCount } from '../domain.ts';
import type { Snapshot } from '../domain.ts';
// 一格名目数值
export interface Cell {
  label: string;
  value: string;
}
// 一家一块
export interface Row {
  rank: number;
  name: string;
  colorValue: string;
  dead: boolean;
  share: string;
  landPercent: number;
  landText: string;
  guardPercent: number;
  guard: string;
  cells: Cell[];
}
// 局势条一段
export interface Part {
  colorValue: string;
  percent: number;
}
export interface Panel {
  rows: Row[];
  land: Part[];
  shield: Part[];
  readouts: Cell[];
  elapsed: string;
  frameRate: string;
}
// 速率读数
function perSecond(fraction: number, amount: number): string {
  if (fraction <= 1) return '—';
  const rate = amount / fraction;
  return rate >= 100 ? `${formatCount(Math.round(rate))}/s` : `${rate.toFixed(1)}/s`;
}
// 全部读数
export function readPanel(snapshot: Snapshot): Panel {
  const order = [...snapshot.bases].sort((first, second) => Number(second.alive) - Number(first.alive) || second.score - first.score);
  const leadText = `${((order[0].share - order[1].share) * 100).toFixed(1)}%`;
  const totalGuard = order.reduce((total, entry) => total + entry.guard, 0);
  return {
    rows: order.map((entry, index) => ({
      rank: index + 1,
      name: entry.label,
      colorValue: TEAM[entry.color].colorValue,
      dead: !entry.alive,
      share: `${(entry.share * 100).toFixed(1)}%`,
      landPercent: entry.share * 100,
      landText: formatCount(entry.pixels),
      guardPercent: Math.min(100, (entry.guard / entry.maxGuard) * 100),
      guard: formatCount(entry.guard),
      cells: [
        { label: '抢占像素', value: entry.captured },
        { label: '消失像素', value: entry.lost },
        { label: '发射发数', value: entry.fired },
        { label: '待发单位', value: entry.pending },
      ].map((cell) => ({ label: cell.label, value: formatCount(cell.value) })),
    })),
    land: order.map((entry) => ({ colorValue: TEAM[entry.color].colorValue, percent: entry.share * 100 })),
    shield: order.map((entry) => ({ colorValue: TEAM[entry.color].colorValue, percent: totalGuard > 0 ? (entry.guard / totalGuard) * 100 : 25 })),
    readouts: [
      { label: '无主像素', value: formatCount(snapshot.free) },
      { label: '改写像素', value: formatCount(snapshot.captures) },
      { label: '改写速率', value: perSecond(snapshot.time, snapshot.captures) },
      { label: '在飞发数', value: String(snapshot.baseBalls) },
      { label: '粒子个数', value: String(snapshot.particles) },
      { label: '生成单位', value: formatCount(snapshot.ammo) },
      { label: '生成速率', value: perSecond(snapshot.time, snapshot.ammo) },
      { label: '发射发数', value: formatCount(snapshot.spawned) },
      { label: '护盾单位', value: formatCount(totalGuard) },
      { label: '领先占比', value: leadText },
    ],
    elapsed: snapshot.time.toFixed(0),
    frameRate: snapshot.frameRate.toFixed(0),
  };
}
