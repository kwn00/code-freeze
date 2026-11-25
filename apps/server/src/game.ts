/**
 * 한 사람의 판 (서버 권위).
 *
 * - 규칙은 @code-freeze/shared 의 sim.ts 가 정한다. 여기서는 그것을 돌리고, 클라이언트의 "의도"를 sim 명령으로 바꾸고,
 *   상태를 보내고, 끝나면 결과를 리더보드에 남긴다.
 * - 시간은 서버의 틱(GameManager)으로만 흐른다. 클라이언트가 시간을 앞당기거나(빨리 감기 상한 ×3) 돈·체력을 바꾸는 통로는 없다.
 * - 연결이 끊기면 판을 멈추고 RESUME_WINDOW_MS 동안 지켜 둔다. 이어받기 키(서버가 만든 비밀 값)로만 다시 붙을 수 있다.
 * - 화면(WebSocket)에 직접 기대지 않는다: 보내는 함수만 받는다 (단위 테스트에서 그대로 돌린다).
 */
import { randomBytes } from 'node:crypto';
import {
  IDLE_LIMIT_MS,
  RESUME_WINDOW_MS,
  SNAPSHOT_HZ,
  TICK_HZ,
  build,
  newGame,
  sell,
  snapshotOf,
  startWave,
  step,
  upgrade,
  type ClientMsg,
  type GameEvent,
  type RunResult,
  type ServerMsg,
  type Speed,
  type State,
} from '@code-freeze/shared';

/** 판이 끝날 때 리더보드에 남길 것 */
export interface RunReport {
  name: string;
  won: boolean;
  cleared: number;
  lives: number;
  kills: number;
  /** 이 판에서 웨이브가 실제로 돈 서버 시간 (초). 빨리 감기 상한을 넘지 않았는지 보는 근거 */
  simSeconds: number;
  wallSeconds: number;
}

export type Send = (msg: ServerMsg) => void;
/** 결과를 남기고 순위를 알려 준다 (순위표에 못 오르면 null) */
export type Recorder = (r: RunReport) => Promise<number | null>;

const TICKS_PER_SNAPSHOT = Math.round(TICK_HZ / SNAPSHOT_HZ);

export class Game {
  state: State = newGame();
  speed: Speed = 1;
  paused = false;
  /** 연결이 끊겨 멈춘 것 (사용자가 멈춘 것과 따로 센다) */
  away = false;
  readonly resumeKey = randomBytes(24).toString('base64url');
  private send: Send | null;
  private pending: GameEvent[] = [];
  private dirty = true;
  private tickCount = 0;
  private startedAt: number;
  lastActive: number;
  awaySince = 0;
  /** 결과를 이미 남겼는가 (한 판에 한 번) */
  private reported = false;

  constructor(
    readonly name: string,
    send: Send,
    private readonly record: Recorder,
    now = Date.now(),
  ) {
    this.send = send;
    this.startedAt = now;
    this.lastActive = now;
  }

  /** 클라이언트의 의도를 처리한다. 판이 끝났거나 멈춘 동안 받을 수 없는 것은 조용히 버린다 */
  handle(msg: ClientMsg, now = Date.now()): void {
    this.lastActive = now;
    const s = this.state;
    switch (msg.t) {
      case 'build':
        if (build(s, msg.kind, msg.col, msg.row)) this.dirty = true;
        break;
      case 'upgrade':
        if (upgrade(s, msg.id)) this.dirty = true;
        break;
      case 'sell':
        if (sell(s, msg.id)) this.dirty = true;
        break;
      case 'wave':
        if (!this.paused && startWave(s)) this.dirty = true;
        break;
      case 'speed':
        this.speed = msg.s;
        this.dirty = true;
        break;
      case 'pause':
        if (s.status === 'won' || s.status === 'lost') break;
        this.paused = msg.on;
        this.dirty = true;
        break;
      case 'restart':
        this.state = newGame();
        this.speed = 1;
        this.paused = false;
        this.reported = false;
        this.pending = [];
        this.startedAt = now;
        this.dirty = true;
        break;
      case 'ping':
        this.send?.({ t: 'pong' });
        break;
      case 'hello':
        break;
    }
  }

  /** 서버 틱 한 번 (1/TICK_HZ 초). 빠르기만큼 sim 을 돌린다 */
  tick(now = Date.now()): void {
    const s = this.state;
    if (!this.paused && !this.away && s.status === 'wave') {
      for (let i = 0; i < this.speed && s.status === 'wave'; i++) {
        step(s);
        if (s.events.length) {
          this.pending.push(...s.events);
          s.events.length = 0;
        }
      }
      this.dirty = true;
    }
    // startWave 가 남긴 일도 함께 보낸다
    if (s.events.length) {
      this.pending.push(...s.events);
      s.events.length = 0;
      this.dirty = true;
    }
    this.tickCount++;
    if (this.dirty && this.send && (s.status !== 'wave' || this.tickCount % TICKS_PER_SNAPSHOT === 0)) this.flush();
    if ((s.status === 'won' || s.status === 'lost') && !this.reported) this.finish(now);
  }

  private flush(): void {
    this.send?.(snapshotOf(this.state, this.speed, this.paused || this.away, this.pending));
    this.pending = [];
    this.dirty = false;
  }

  private finish(now: number): void {
    this.reported = true;
    const s = this.state;
    const won = s.status === 'won';
    const cleared = won ? s.wave : s.wave - 1;
    const report: RunReport = { name: this.name, won, cleared, lives: s.lives, kills: s.kills, simSeconds: s.time, wallSeconds: (now - this.startedAt) / 1000 };
    const result = (rank: number | null): RunResult => ({ won, cleared, lives: s.lives, kills: s.kills, rank });
    const state = this.state;
    this.record(report)
      .catch(() => null)
      .then((rank) => {
        // 그사이 다시 시작했으면 옛 판의 결과는 보내지 않는다
        if (this.state === state) this.send?.({ t: 'result', result: result(rank) });
      });
  }

  /** 연결이 끊겼다: 멈추고 지켜 둔다 */
  detach(now = Date.now()): void {
    this.send = null;
    this.away = true;
    this.awaySince = now;
  }

  /** 다시 붙었다: 사용자 멈춤 상태로 돌려준다 (화면이 메뉴를 띄우고, 계속하기를 누르면 이어 간다) */
  attach(send: Send, now = Date.now()): void {
    this.send = send;
    if (this.away && this.state.status === 'wave') this.paused = true;
    this.away = false;
    this.lastActive = now;
    this.dirty = true;
    this.flush();
  }

  /** 닫을 때가 됐는가 (오래 끊김 / 오래 조용함) */
  expired(now = Date.now()): 'away' | 'idle' | null {
    if (this.away && now - this.awaySince > RESUME_WINDOW_MS) return 'away';
    if (!this.away && now - this.lastActive > IDLE_LIMIT_MS) return 'idle';
    return null;
  }
}

/** 모든 판을 한 타이머로 돌린다 */
export class GameManager {
  private games = new Set<Game>();
  private byResume = new Map<string, Game>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onExpire: (g: Game, why: 'away' | 'idle') => void = () => {}) {}

  get count(): number {
    return this.games.size;
  }

  add(g: Game): void {
    this.games.add(g);
    this.byResume.set(g.resumeKey, g);
    if (!this.timer) this.timer = setInterval(() => this.tickAll(), 1000 / TICK_HZ);
  }

  remove(g: Game): void {
    this.games.delete(g);
    this.byResume.delete(g.resumeKey);
    if (this.games.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  byKey(key: string): Game | undefined {
    return this.byResume.get(key);
  }

  tickAll(now = Date.now()): void {
    for (const g of this.games) {
      try {
        g.tick(now);
      } catch (err) {
        // 한 판의 오류가 다른 판(프로세스)을 멈추지 않게
        console.error('[error] game tick', err instanceof Error ? err.message : err);
        this.remove(g);
        continue;
      }
      const why = g.expired(now);
      if (why) {
        this.remove(g);
        this.onExpire(g, why);
      }
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
