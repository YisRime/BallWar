// 信息区排版
import type { CSSProperties, ReactNode } from 'react';
import { readPanel } from './model.ts';
import type { Part } from './model.ts';
import type { GameControls } from '../useGame.ts';
// 一段读数
function Pane({ title, fill, children }: { title: string; fill?: boolean; children: ReactNode }) {
  return (
    <section className={`pane ${fill ? 'pane--fill' : ''}`}>
      <h4 className="pane-title"><span>{title}</span></h4>
      {children}
    </section>
  );
}
// 一条进度条
function Gauge({ name, percent, text }: { name: string; percent: number; text: string }) {
  return (
    <div className="gauge-row">
      <span className="gauge-name">{name}</span>
      <span className="rail">
        <i style={{ width: `${percent}%` }} />
      </span>
      <b className="gauge-value">{text}</b>
    </div>
  );
}
// 堆叠局势条
function StackBar({ name, particles }: { name: string; particles: Part[] }) {
  const shave = (2 * Math.max(1, particles.length - 1)) / Math.max(1, particles.length);
  return (
    <div className="stack-row">
      <span className="stack-name">{name}</span>
      <span className="stack">
        {particles.map((part) => (
          <i key={part.colorValue} style={{ width: `calc(${part.percent}% - ${shave}px)`, background: part.colorValue }} />
        ))}
      </span>
    </div>
  );
}
// 线性图标
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
// 四段加底行
export function InfoColumn({ controls }: { controls: GameControls }) {
  const panel = readPanel(controls.snapshot);
  const dark = controls.theme === 'dark';
  const flip = dark ? '切到亮色' : '切到暗色';
  return (
    <>
      <Pane title="战况排行" fill>
        <div className="team-list">
          {panel.rows.map((row) => (
            <div className="team" data-dead={row.dead ? 1 : 0} data-top={row.rank} style={{ '--team-color': row.colorValue, '--team-deep': `color-mix(in srgb, ${row.colorValue} 58%, var(--ink))` } as CSSProperties} key={row.rank}>
              <div className="team-heading">
                <i className="rank">{row.rank}</i>
                <b className="team-name">{row.name}</b>
                <span className="team-share">
                  <i>占领</i>
                  <em>{row.share}</em>
                </span>
              </div>
              <Gauge name="领地" percent={row.landPercent} text={row.landText} />
              <Gauge name="护盾" percent={row.guardPercent} text={row.guard} />
              <div className="team-stats">
                {row.cells.map((cell) => (
                  <span className="stat-cell" key={cell.label}>
                    <i>{cell.label}</i>
                    <b>{cell.value}</b>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Pane>
      <Pane title="势力分布">
        <div className="distribution">
          <StackBar name="领地" particles={panel.land} />
          <StackBar name="护盾" particles={panel.shield} />
        </div>
      </Pane>
      <Pane title="战场数据" fill>
        {/* 恒定两列 */}
        <div className="readout-grid">
          {panel.readouts.map((cell) => (
            <span className="readout" key={cell.label}>
              {cell.label}
              <b>{cell.value}</b>
            </span>
          ))}
        </div>
      </Pane>
      <Pane title="模拟参数" fill>
        {/* 恒定两列 */}
        <div className="setting-grid">
          {controls.tuneSpecs.map((spec) => (
            <label className="setrow" key={spec.key}>
              <span className="setline">
                <span className="setname">{spec.name}</span>
                <b className="set-value">{spec.text(controls.tune[spec.key])}</b>
              </span>
              <input
                type="range"
                min={0}
                max={spec.stops.length - 1}
                step={1}
                value={Math.max(0, spec.stops.indexOf(controls.tune[spec.key]))}
                onChange={(event) => controls.setTune(spec.key, spec.stops[Number(event.target.value)])}
              />
            </label>
          ))}
        </div>
      </Pane>
      <div className="footer">
      <span className="runtime-readouts flex items-center gap-1.5">
          <span className="runtime-chip">
            <i>时间</i><b className="font-mono">{panel.elapsed}<small>s</small></b>
          </span>
          <span className="runtime-chip">
            <i>帧率</i><b className="font-mono">{panel.frameRate}<small>fps</small></b>
          </span>
        </span>
        <div className="flex items-center gap-2">
          <button className="button button--ghost" onClick={controls.togglePause} aria-label={controls.paused ? '继续' : '暂停'} title={controls.paused ? '继续' : '暂停'}>
            <Icon path={controls.paused ? 'M8 5v14l11-7Z' : 'M9 5v14M15 5v14'} />
          </button>
          <button className="button button--primary" onClick={controls.restart} aria-label="重开" title="重开">
            <Icon path="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
          </button>
          <button className="button button--ghost" onClick={controls.toggleTheme} aria-label={flip} title={flip}>
            <Icon path={dark ? 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' : 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8ZM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41'} />
          </button>
        </div>
      </div>
    </>
  );
}
