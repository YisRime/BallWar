// 循环绑定
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { boardHeight, boardWidth, TUNE, TUNE_DEFAULT, resizeBoard } from './domain.ts';
import type { Tune } from './domain.ts';
import { createWorld, readSnapshot, stepFrame, type Clock } from './engine.ts';
import { applySeed, resizeTerritory, recolor } from './Board/model.ts';
import { renderBoard } from './Board/view.ts';
import { renderCounter } from './Count/view.ts';
import { PALETTE, createView, fitSurface, resizeView, triplet } from './canvas.ts';
import { counterHeight, counterWidth, relayoutCounter, resizeCounter, retagPegs, resizeBalls } from './Count/model.ts';
import type { Snapshot, World } from './domain.ts';
import { TUNE_SPECS } from './domain.ts';
import type { TuneSpec } from './domain.ts';
// 拼一枚种子
function rollSeed(scale: number): number {
  return (Date.now() ^ Math.trunc(performance.now() * scale)) | 0;
}
// 明暗主题
export type Theme = 'light' | 'dark';
// 装配世界
function bootWorld(seed: number): World {
  const world = createWorld(seed);
  return world;
}
export interface GameControls {
  snapshot: Snapshot;
  paused: boolean;
  togglePause: () => void;
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
    seedRef.current = rollSeed(1000);
    worldRef.current = bootWorld(seedRef.current);
  }
  const [snapshot, setSnap] = useState<Snapshot>(() => readSnapshot(worldRef.current as World));
  const pausedRef = useRef(true);
  const [paused, setPaused] = useState(true);
  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, []);
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
    pausedRef.current = false;
    setPaused(false);
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
    let frameHandle = 0;
    let last = performance.now();
    let panelTime = 0;
    const loop = (now: number) => {
      const stepSec = (now - last) / 1000;
      last = now;
      fit();
      const world = worldRef.current;
      if (world) {
        if (stepSec > 0 && !pausedRef.current) world.frameRate = world.frameRate === 0 ? 1 / stepSec : world.frameRate * 0.88 + (1 / stepSec) * 0.12;
        const startMark = performance.now();
        draw(world, pausedRef.current ? 0 : stepFrame(world, clockRef.current, stepSec));
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
    };
  }, [theme]);
  return {
    boardCanvas,
    counterCanvas,
    boardCard,
    counterCard,
    controls: { snapshot, paused, togglePause, restart, theme, toggleTheme, tune, setTune, tuneSpecs: TUNE_SPECS },
  };
}
