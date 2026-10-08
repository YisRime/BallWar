// 循环绑定
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { baseCorner, boardHeight, boardWidth, STEP_SEC, TUNE, TUNE_DEFAULT, resizeBoard } from './domain.ts';
import type { Tune } from './domain.ts';
import { createWorld, readSnapshot, stepFrame, stepWorld, type Clock } from './engine.ts';
import { applySeed, resizeTerritory, recolor } from './Board/model.ts';
import { renderBoard } from './Board/view.ts';
import { renderCounter } from './Count/view.ts';
import { PALETTE, createView, fitSurface, resizeView, triplet } from './canvas.ts';
import { counterHeight, counterWidth, relayoutCounter, resizeCounter, retagPegs, resizeBalls } from './Count/model.ts';
import type { Surface } from './canvas.ts';
import type { Snapshot, World } from './domain.ts';
import { TUNE_SPECS } from './domain.ts';
import type { TuneSpec } from './domain.ts';
// 查询串取值
function queryParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}
// 拼一枚种子
function rollSeed(scale: number): number {
  return (Date.now() ^ Math.trunc(performance.now() * scale)) | 0;
}
// 明暗主题
export type Theme = 'light' | 'dark';
// 装配世界
function bootWorld(seed: number): World {
  const world = createWorld(seed);
  const fast = Number(queryParam('fast'));
  for (let stepIndex = Math.round(Math.max(0, Math.min(600, fast)) / STEP_SEC); stepIndex > 0; stepIndex--) stepWorld(world, STEP_SEC);
  return world;
}
// 邻域亮度
function luminance(surface: Surface, posX: number, posY: number): number {
  const sampleX = Math.max(0, Math.min(surface.canvas.width - 40, Math.round(posX * surface.scale + surface.offsetX) - 20));
  const sampleY = Math.max(0, Math.min(surface.canvas.height - 40, Math.round(posY * surface.scale + surface.offsetY) - 20));
  const data = surface.brush.getImageData(sampleX, sampleY, 40, 40).data;
  let sum = 0;
  for (let channelIndex = 0; channelIndex < 40 * 40 * 4; channelIndex += 4) sum += data[channelIndex] * 0.3 + data[channelIndex + 1] * 0.6 + data[channelIndex + 2] * 0.1;
  return sum / (40 * 40);
}
export interface GameControls {
  snapshot: Snapshot;
  diagnostics: string;
  restart: () => void;
  theme: Theme;
  toggleTheme: () => void;
  // 机制档位
  tune: Tune;
  setTune: (key: keyof Tune, value: number) => void;
  // 挡位规格
  tuneSpecs: TuneSpec[];
}
interface Binding {
  boardCanvas: RefObject<HTMLCanvasElement | null>;
  counterCanvas: RefObject<HTMLCanvasElement | null>;
  boardCard: RefObject<HTMLDivElement | null>;
  counterCard: RefObject<HTMLDivElement | null>;
  controls: GameControls;
}
// 游戏装配
export function useGame(): Binding {
  const boardCanvas = useRef<HTMLCanvasElement | null>(null);
  const counterCanvas = useRef<HTMLCanvasElement | null>(null);
  const boardCard = useRef<HTMLDivElement | null>(null);
  const counterCard = useRef<HTMLDivElement | null>(null);
  const clockRef = useRef<Clock>({ accumulator: 0 });
  const worldRef = useRef<World | null>(null);
  const seedRef = useRef(0);
  // 上次摊的额度
  const appliedRef = useRef(Math.max(0, Math.round(TUNE_DEFAULT.initialAmmo)));
  // 上次尺寸
  const fitSizes = useRef({ boardClientWidth: 0, boardClientHeight: 0, towerClientWidth: 0, towerClientHeight: 0, boardWidth: 0, boardHeight: 0 });
  if (worldRef.current === null) {
    const fromQuery = Number(queryParam('seed'));
    seedRef.current = Number.isFinite(fromQuery) && fromQuery !== 0 ? fromQuery | 0 : rollSeed(1000);
    worldRef.current = bootWorld(seedRef.current);
  }
  const [snapshot, setSnap] = useState<Snapshot>(() => readSnapshot(worldRef.current as World));
  const [diagnostics, setPix] = useState('');
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const [tune, setTuning] = useState<Tune>({ ...TUNE_DEFAULT });
  // 改一档位
  const setTune = useCallback((key: keyof Tune, value: number) => {
    TUNE[key] = value;
    const world = worldRef.current;
    if (world && key === 'tagCount') retagPegs(world.counter);
    if (world && key === 'ballCount') resizeBalls(world);
    if (world && key === 'initialAmmo') {
      applySeed(world, value, appliedRef.current);
      appliedRef.current = value;
    }
    setTuning({ ...TUNE });
  }, []);
  const push = useCallback(() => {
    if (worldRef.current) setSnap(readSnapshot(worldRef.current));
  }, []);
  const restart = useCallback(() => {
    seedRef.current = rollSeed(977);
    worldRef.current = bootWorld(seedRef.current);
    appliedRef.current = Math.max(0, Math.round(TUNE.initialAmmo));
    clockRef.current.accumulator = 0;
    push();
  }, [push]);
  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), []);
  // 换档重建视图
  useEffect(() => {
    const board = boardCanvas.current;
    const counter = counterCanvas.current;
    const field = boardCard.current;
    const box = counterCard.current;
    const first = worldRef.current;
    if (!board || !counter || !field || !box || !first) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const view = createView(board, counter);
    recolor(first.territory, triplet(PALETTE.veil));
    // 一帧画两张
    const draw = (world: World, alpha: number) => {
      renderBoard(view, world, alpha);
      renderCounter(view, world, alpha);
    };
    // 重排与铺满
    const fit = () => {
      const boardClientWidth = Math.max(1, field.clientWidth);
      const boardClientHeight = Math.max(1, field.clientHeight);
      const towerClientWidth = Math.max(1, box.clientWidth);
      const towerClientHeight = Math.max(1, box.clientHeight);
      const world = worldRef.current;
      if (!world) return;
      resizeBoard(boardClientWidth / boardClientHeight);
      resizeCounter(towerClientWidth / towerClientHeight);
      const done = fitSizes.current;
      if (done.boardClientWidth === boardClientWidth && done.boardClientHeight === boardClientHeight && done.towerClientWidth === towerClientWidth && done.towerClientHeight === towerClientHeight) return;
      let dirty = false;
      if (done.boardWidth !== boardWidth || done.boardHeight !== boardHeight) {
        resizeTerritory(world);
        recolor(world.territory, triplet(PALETTE.veil));
        done.boardWidth = boardWidth;
        done.boardHeight = boardHeight;
        dirty = true;
      }
      if (done.towerClientWidth !== counterWidth || done.towerClientHeight !== counterHeight) {
        relayoutCounter(world.counter);
        done.towerClientWidth = counterWidth;
        done.towerClientHeight = counterHeight;
        dirty = true;
      }
      // 这一支幂等
      resizeView(view, boardWidth, boardHeight);
      fitSurface(view.board, boardWidth, boardHeight, boardClientWidth, boardClientHeight);
      fitSurface(view.counter, counterWidth, counterHeight, towerClientWidth, towerClientHeight);
      done.boardClientWidth = boardClientWidth;
      done.boardClientHeight = boardClientHeight;
      if (dirty) setSnap(readSnapshot(world));
    };
    fit();
    draw(first, 0);
    setSnap(readSnapshot(first));
    // 诊断信息
    let timer = 0;
    if (queryParam('diag') === '1')
      timer = window.setInterval(() => {
        const world = worldRef.current;
        if (!world) return;
        const sampleSlot = world.counter.slots[0];
        const basePos = baseCorner(0);
        const parts = [
          `据${luminance(view.board, basePos.posX, basePos.posY).toFixed(0)}`,
          `中${luminance(view.board, boardWidth / 2, boardHeight / 2).toFixed(0)}`,
          `槽${luminance(view.counter, counterWidth / 2, sampleSlot.bottom + 4).toFixed(0)}`,
        ];
        const startMark = performance.now();
        for (let repeatIndex = 0; repeatIndex < 4; repeatIndex++) draw(world, 0.5);
        const line = `视${window.innerWidth}x${window.innerHeight} 尺${field.clientWidth}x${field.clientHeight}/${box.clientWidth}x${box.clientHeight} 场${boardWidth}x${boardHeight} 栏${counterWidth}x${counterHeight} fps${world.frameRate.toFixed(0)} ms${world.drawMillis.toFixed(1)} 纯绘${((performance.now() - startMark) / 4).toFixed(1)}ms t${world.time.toFixed(0)} 球${world.counter.balls.length} 基地球${world.baseBalls.length} 涂${world.captures} ${parts.join(' ')} 底${view.board.canvas.width}x${view.board.canvas.height} 种${seedRef.current}`;
        setPix(line);
        document.title = `BW ${line}`;
      }, 1000);
    let frameHandle = 0;
    let last = performance.now();
    let panelTime = 0;
    const loop = (now: number) => {
      const stepSec = (now - last) / 1000;
      last = now;
      fit();
      const world = worldRef.current;
      if (world) {
        if (stepSec > 0) world.frameRate = world.frameRate === 0 ? 1 / stepSec : world.frameRate * 0.88 + (1 / stepSec) * 0.12;
        const startMark = performance.now();
        draw(world, stepFrame(world, clockRef.current, stepSec));
        world.drawMillis = world.drawMillis * 0.9 + (performance.now() - startMark) * 0.1;
        panelTime += stepSec;
        if (panelTime >= 0.1) {
          panelTime = 0;
          setSnap(readSnapshot(world));
        }
      }
      frameHandle = requestAnimationFrame(loop);
    };
    frameHandle = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frameHandle);
      if (timer) window.clearInterval(timer);
    };
  }, [theme]);
  return {
    boardCanvas,
    counterCanvas,
    boardCard,
    counterCard,
    controls: { snapshot, diagnostics, restart, theme, toggleTheme, tune, setTune, tuneSpecs: TUNE_SPECS },
  };
}
