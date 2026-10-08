// 应用外壳
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { InfoColumn } from './Info/view.tsx';
import { useGame } from './useGame.ts';
function App() {
  const { boardCanvas, counterCanvas, boardCard, counterCard, controls } = useGame();
  return (
    <div className="app-shell grid h-full min-h-0 grid-cols-[minmax(0,1fr)_var(--board-width)_var(--info-width)] gap-[var(--shell-gap)] p-[var(--shell-padding)] font-sans text-ink antialiased tabular-nums">
      <aside className="card canvas-card counter-card overflow-hidden bg-canvas" ref={counterCard} aria-label="计分轨道">
        <canvas ref={counterCanvas} className="absolute inset-0 block rounded-canvas" />
      </aside>
      <main className="card canvas-card board-card overflow-hidden bg-canvas" ref={boardCard} aria-label="对战场地">
        <canvas ref={boardCanvas} className="absolute inset-0 block rounded-canvas" />
      </main>
      <aside className="card info-card flex min-h-0 flex-col overflow-hidden bg-card px-4" aria-label="比赛数据与设置">
        <InfoColumn controls={controls} />
      </aside>
    </div>
  );
}
// 明暗定档
if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark');
// 挂载守卫
const host = document.getElementById('root')!;
if (!host.dataset.mounted) {
  host.dataset.mounted = '1';
  createRoot(host).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
