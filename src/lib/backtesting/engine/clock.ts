/* ------------------------------------------------------------------ */
/*  Central Backtest Clock — PHASE 1                                   */
/*                                                                      */
/*  One clock drives everything: both NQ and ES candle data, orders,   */
/*  positions, P&L, drawdown, playback. Components subscribe to the    */
/*  clock and derive their state from it.                               */
/* ------------------------------------------------------------------ */

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 5 | 10;

export type ClockEvent = 
  | { type: 'tick'; time: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; speed: PlaybackSpeed }
  | { type: 'seek'; time: number }
  | { type: 'session-end' };

export type ClockListener = (event: ClockEvent) => void;

/**
 * Central simulation clock for the backtesting engine.
 * All components derive their current state from this clock.
 * NQ and ES always share the same clock instance.
 */
export class BacktestClock {
  private _currentTime: number; // UTC epoch seconds
  private _startTime: number;
  private _endTime: number;
  private _playing = false;
  private _speed: PlaybackSpeed = 1;
  private _timerId: ReturnType<typeof setTimeout> | null = null;
  private _listeners = new Set<ClockListener>();
  /** Sorted array of all candle timestamps (epoch seconds) for stepping. */
  private _timestamps: number[] = [];
  private _currentIndex = 0;

  constructor(startTime: number, endTime: number) {
    this._startTime = startTime;
    this._endTime = endTime;
    this._currentTime = startTime;
  }

  get currentTime(): number { return this._currentTime; }
  get startTime(): number { return this._startTime; }
  get endTime(): number { return this._endTime; }
  get playing(): boolean { return this._playing; }
  get speed(): PlaybackSpeed { return this._speed; }
  get currentIndex(): number { return this._currentIndex; }
  get totalSteps(): number { return this._timestamps.length; }
  get progress(): number {
    if (this._timestamps.length === 0) return 0;
    return this._currentIndex / this._timestamps.length;
  }

  /** Set the ordered timestamps the clock steps through. */
  setTimestamps(timestamps: number[]): void {
    this._timestamps = [...timestamps].sort((a, b) => a - b);
    // Find the nearest index to current time
    this._currentIndex = this._timestamps.findIndex(t => t >= this._currentTime);
    if (this._currentIndex === -1) this._currentIndex = 0;
    if (this._timestamps.length > 0) {
      this._currentTime = this._timestamps[this._currentIndex];
    }
  }

  subscribe(listener: ClockListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private emit(event: ClockEvent): void {
    for (const fn of this._listeners) {
      try { fn(event); } catch { /* listener errors must not break the clock */ }
    }
  }

  play(): void {
    if (this._playing) return;
    if (this._currentIndex >= this._timestamps.length - 1) return; // at end
    this._playing = true;
    this.emit({ type: 'play' });
    this.scheduleNext();
  }

  pause(): void {
    this._playing = false;
    if (this._timerId) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this.emit({ type: 'pause' });
  }

  setSpeed(speed: PlaybackSpeed): void {
    this._speed = speed;
    this.emit({ type: 'speed', speed });
    // Reschedule if playing
    if (this._playing && this._timerId) {
      clearTimeout(this._timerId);
      this.scheduleNext();
    }
  }

  /** Advance one candle forward. */
  stepForward(): boolean {
    if (this._currentIndex >= this._timestamps.length - 1) {
      this.emit({ type: 'session-end' });
      return false;
    }
    this._currentIndex++;
    this._currentTime = this._timestamps[this._currentIndex];
    this.emit({ type: 'tick', time: this._currentTime });
    return true;
  }

  /** Step one candle backward (where possible). */
  stepBackward(): boolean {
    if (this._currentIndex <= 0) return false;
    this._currentIndex--;
    this._currentTime = this._timestamps[this._currentIndex];
    this.emit({ type: 'tick', time: this._currentTime });
    return true;
  }

  /** Jump to a specific time. */
  seekTo(time: number): void {
    const idx = this._timestamps.findIndex(t => t >= time);
    if (idx === -1) return;
    this._currentIndex = idx;
    this._currentTime = this._timestamps[idx];
    this.emit({ type: 'seek', time: this._currentTime });
  }

  /** Reset to the beginning. */
  reset(): void {
    this.pause();
    this._currentIndex = 0;
    if (this._timestamps.length > 0) {
      this._currentTime = this._timestamps[0];
    } else {
      this._currentTime = this._startTime;
    }
    this.emit({ type: 'seek', time: this._currentTime });
  }

  dispose(): void {
    this.pause();
    this._listeners.clear();
  }

  private scheduleNext(): void {
    // Base interval: 1 candle per second at 1x speed
    const intervalMs = 1000 / this._speed;
    this._timerId = setTimeout(() => {
      if (!this._playing) return;
      const advanced = this.stepForward();
      if (advanced && this._playing) {
        this.scheduleNext();
      } else {
        this._playing = false;
        this.emit({ type: 'session-end' });
      }
    }, intervalMs);
  }
}
