import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Flag, SkipForward, Bell, BellOff } from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolDefinition } from '@/types/tool';
import { Button, Card, Tabs, Toggle } from '@/components/ui/primitives';
import { NumField } from '@/tools/calculators/CalcTools';
import { formatClock, nextPomodoroPhase, type PomodoroPhase } from './clock';

/* ---------- Shared: ticking, alarm, title ---------- */

/** Re-render periodically while `active`; time is always derived from Date.now(). */
function useTick(active: boolean, ms = 200) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [active, ms]);
}

let audioCtx: AudioContext | null = null;
/** Must be called from a click so browsers allow sound later. */
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function playAlarm() {
  const ctx = audioCtx;
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 3; i++) {
      const t = t0 + round * 1.1 + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }
}

function notify(title: string, body: string, enabled: boolean) {
  navigator.vibrate?.([300, 150, 300]);
  if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: `${import.meta.env.BASE_URL}icon-192.png`, tag: 'dhurta-timer' });
    } catch {
      /* some mobile browsers only allow notifications from a service worker */
    }
  }
}

function useDocumentTitle(text: string | null) {
  const original = useRef(document.title);
  useEffect(() => {
    const base = original.current;
    if (text) document.title = `${text} · ${base}`;
    else document.title = base;
    return () => {
      document.title = base;
    };
  }, [text]);
}

/** Fire `cb` once at `endAt` with a single (non-chained) timeout, which background tabs throttle least. */
function useDeadline(endAt: number | null, cb: () => void) {
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (endAt === null) return;
    const h = setTimeout(() => latest.current(), Math.max(0, endAt - Date.now()));
    return () => clearTimeout(h);
  }, [endAt]);
}

function BigClock({ ms, sub, tone }: { ms: number; sub?: string; tone?: 'done' | 'focus' | 'break' }) {
  return (
    <div className="py-6 text-center">
      <p className={clsx('font-mono text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl', tone === 'done' ? 'text-error' : tone === 'break' ? 'text-success' : 'text-fg')} aria-live="off">
        {formatClock(ms, ms < 3_600_000 ? 'ms' : 'hms')}
      </p>
      {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
    </div>
  );
}

/* ---------- Countdown ---------- */

const PRESETS = [1, 3, 5, 10, 15, 25, 30, 45, 60];

function Countdown({ notifyOn }: { notifyOn: boolean }) {
  const [h, setH] = useState('0');
  const [m, setM] = useState('5');
  const [s, setS] = useState('0');
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null); // paused remainder
  const [done, setDone] = useState(false);
  const total = ((Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)) * 1000;
  const running = endAt !== null;
  useTick(running);
  const remaining = running ? Math.max(0, endAt - Date.now()) : left ?? total;

  const finish = useCallback(() => {
    setEndAt(null);
    setLeft(0);
    setDone(true);
    playAlarm();
    notify('Time’s up', 'Your Dhurta Suite timer has finished.', notifyOn);
  }, [notifyOn]);
  useDeadline(endAt, finish);
  useDocumentTitle(running ? `⏳ ${formatClock(remaining, 's')}` : done ? '⏰ Time’s up' : null);

  const start = (ms = remaining) => {
    if (ms <= 0) return;
    unlockAudio();
    setDone(false);
    setEndAt(Date.now() + ms);
    setLeft(null);
  };
  const reset = () => {
    setEndAt(null);
    setLeft(null);
    setDone(false);
  };

  return (
    <div className="space-y-4">
      <BigClock ms={remaining} tone={done ? 'done' : undefined} sub={done ? 'Time’s up!' : running ? `Ends at ${new Date(endAt!).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : undefined} />
      {!running && left === null && (
        <>
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
            <NumField id="cd-h" label="Hours" value={h} onChange={setH} />
            <NumField id="cd-m" label="Minutes" value={m} onChange={setM} />
            <NumField id="cd-s" label="Seconds" value={s} onChange={setS} />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p}
                size="sm"
                onClick={() => {
                  setH(String(Math.floor(p / 60)));
                  setM(String(p % 60));
                  setS('0');
                }}
              >
                {p < 60 ? `${p} min` : `${p / 60} h`}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="flex justify-center gap-2">
        {running ? (
          <Button
            size="lg"
            icon={<Pause size={18} />}
            onClick={() => {
              setLeft(remaining);
              setEndAt(null);
            }}
          >
            Pause
          </Button>
        ) : (
          <Button size="lg" variant="primary" icon={<Play size={18} />} disabled={remaining <= 0 && !done} onClick={() => (done ? (reset(), start(total)) : start())}>
            {done ? 'Restart' : left !== null ? 'Resume' : 'Start'}
          </Button>
        )}
        <Button size="lg" icon={<RotateCcw size={18} />} onClick={reset} disabled={!running && left === null && !done}>
          Reset
        </Button>
      </div>
    </div>
  );
}

/* ---------- Stopwatch ---------- */

function Stopwatch() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const running = startedAt !== null;
  useTick(running, 50);
  const elapsed = acc + (running ? Date.now() - startedAt : 0);
  useDocumentTitle(running ? `⏱ ${formatClock(elapsed, 's')}` : null);
  const lapTimes = laps.map((t, i) => t - (laps[i - 1] ?? 0));
  const best = lapTimes.length > 1 ? Math.min(...lapTimes) : -1;
  const worst = lapTimes.length > 1 ? Math.max(...lapTimes) : -1;

  return (
    <div className="space-y-4">
      <BigClock ms={elapsed} />
      <div className="flex justify-center gap-2">
        {running ? (
          <Button
            size="lg"
            icon={<Pause size={18} />}
            onClick={() => {
              setAcc(elapsed);
              setStartedAt(null);
            }}
          >
            Pause
          </Button>
        ) : (
          <Button size="lg" variant="primary" icon={<Play size={18} />} onClick={() => setStartedAt(Date.now())}>
            {elapsed ? 'Resume' : 'Start'}
          </Button>
        )}
        {running ? (
          <Button size="lg" icon={<Flag size={18} />} onClick={() => setLaps((l) => [...l, elapsed])}>
            Lap
          </Button>
        ) : (
          <Button
            size="lg"
            icon={<RotateCcw size={18} />}
            disabled={!elapsed}
            onClick={() => {
              setAcc(0);
              setLaps([]);
            }}
          >
            Reset
          </Button>
        )}
      </div>
      {laps.length > 0 && (
        <table className="mx-auto w-full max-w-md text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 text-left">Lap</th>
              <th className="py-1 text-right">Lap time</th>
              <th className="py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...laps].reverse().map((t, ri) => {
              const i = laps.length - 1 - ri;
              return (
                <tr key={i} className={clsx(lapTimes[i] === best && 'text-success', lapTimes[i] === worst && 'text-error')}>
                  <td className="py-1.5">{i + 1}</td>
                  <td className="py-1.5 text-right font-mono">{formatClock(lapTimes[i], 'ms')}</td>
                  <td className="py-1.5 text-right font-mono text-muted">{formatClock(t, 'ms')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---------- Pomodoro ---------- */

const PHASE_LABEL: Record<PomodoroPhase, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' };

function Pomodoro({ notifyOn }: { notifyOn: boolean }) {
  const [cfg, setCfg] = useState({ focus: '25', short: '5', long: '15', every: '4' });
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [completed, setCompleted] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [autoStart, setAutoStart] = useState(true);
  const minutes = (p: PomodoroPhase) => Math.max(1, Number(cfg[p]) || 1) * 60_000;
  const running = endAt !== null;
  useTick(running);
  const remaining = running ? Math.max(0, endAt - Date.now()) : left ?? minutes(phase);
  useDocumentTitle(running ? `${phase === 'focus' ? '🍅' : '☕'} ${formatClock(remaining, 's')}` : null);

  const advance = useCallback(
    (fromTimer: boolean) => {
      const done = phase === 'focus' ? completed + 1 : completed;
      if (phase === 'focus') setCompleted(done);
      const next = nextPomodoroPhase(phase, done, Math.max(1, Number(cfg.every) || 4));
      setPhase(next);
      setLeft(null);
      if (fromTimer) {
        playAlarm();
        notify(next === 'focus' ? 'Break over' : 'Focus session done', next === 'focus' ? 'Time to focus.' : `Take a ${PHASE_LABEL[next].toLowerCase()}.`, notifyOn);
      }
      setEndAt(fromTimer && autoStart ? Date.now() + Math.max(1, Number(cfg[next]) || 1) * 60_000 : null);
    },
    [phase, completed, cfg, autoStart, notifyOn],
  );
  useDeadline(endAt, () => advance(true));

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-1.5" role="status">
        {(['focus', 'short', 'long'] as const).map((p) => (
          <span key={p} className={clsx('rounded-full border px-3 py-1 text-xs font-medium', phase === p ? (p === 'focus' ? 'border-accent bg-accent/10 text-accent' : 'border-success bg-success/10 text-success') : 'border-line text-muted')}>
            {PHASE_LABEL[p]}
          </span>
        ))}
      </div>
      <BigClock ms={remaining} tone={phase === 'focus' ? 'focus' : 'break'} sub={`${completed} focus session${completed === 1 ? '' : 's'} completed`} />
      <div className="flex justify-center gap-2">
        {running ? (
          <Button
            size="lg"
            icon={<Pause size={18} />}
            onClick={() => {
              setLeft(remaining);
              setEndAt(null);
            }}
          >
            Pause
          </Button>
        ) : (
          <Button
            size="lg"
            variant="primary"
            icon={<Play size={18} />}
            onClick={() => {
              unlockAudio();
              setEndAt(Date.now() + remaining);
              setLeft(null);
            }}
          >
            {left !== null ? 'Resume' : 'Start'}
          </Button>
        )}
        <Button size="lg" icon={<SkipForward size={18} />} onClick={() => advance(false)}>
          Skip
        </Button>
        <Button
          size="lg"
          icon={<RotateCcw size={18} />}
          onClick={() => {
            setEndAt(null);
            setLeft(null);
            setPhase('focus');
            setCompleted(0);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField id="p-focus" label="Focus (min)" value={cfg.focus} onChange={(v) => setCfg({ ...cfg, focus: v })} />
        <NumField id="p-short" label="Short break" value={cfg.short} onChange={(v) => setCfg({ ...cfg, short: v })} />
        <NumField id="p-long" label="Long break" value={cfg.long} onChange={(v) => setCfg({ ...cfg, long: v })} />
        <NumField id="p-every" label="Long every" value={cfg.every} onChange={(v) => setCfg({ ...cfg, every: v })} />
      </div>
      <div className="mx-auto max-w-lg">
        <Toggle checked={autoStart} onChange={setAutoStart} label="Start the next session automatically" />
      </div>
    </div>
  );
}

/* ---------- Tool ---------- */

type Mode = 'timer' | 'stopwatch' | 'pomodoro';

export default function TimerTool(_: { tool: ToolDefinition }) {
  const [mode, setMode] = useState<Mode>('timer');
  const [notifyOn, setNotifyOn] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  const canNotify = typeof Notification !== 'undefined';

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Tabs
        label="Mode"
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'timer', label: 'Timer' },
          { id: 'stopwatch', label: 'Stopwatch' },
          { id: 'pomodoro', label: 'Pomodoro' },
        ]}
      />
      {/* Keep all three mounted so switching tabs never stops a running clock. */}
      <Card className="p-4">
        <div hidden={mode !== 'timer'}>
          <Countdown notifyOn={notifyOn} />
        </div>
        <div hidden={mode !== 'stopwatch'}>
          <Stopwatch />
        </div>
        <div hidden={mode !== 'pomodoro'}>
          <Pomodoro notifyOn={notifyOn} />
        </div>
      </Card>
      {canNotify && mode !== 'stopwatch' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Button
            size="sm"
            variant="ghost"
            icon={notifyOn ? <Bell size={14} /> : <BellOff size={14} />}
            onClick={async () => {
              if (notifyOn) return setNotifyOn(false);
              const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
              setNotifyOn(p === 'granted');
            }}
          >
            {notifyOn ? 'Desktop notification on' : 'Also show a desktop notification'}
          </Button>
          {Notification.permission === 'denied' && <span className="text-xs">Notifications are blocked for this site in your browser settings.</span>}
        </div>
      )}
      <p className="text-xs text-muted">A sound plays when time is up — keep your volume on and this tab open. Timers keep counting while you use other tabs; closing the tab stops them.</p>
    </div>
  );
}
