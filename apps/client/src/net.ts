/**
 * 서버 연결. 세션 토큰을 받고(POST /api/session) WebSocket 으로 붙는다.
 * 끊기면 스스로 다시 붙는다: 이어받기 키(서버가 준 비밀 값)를 이 탭의 sessionStorage 에 두고, 다시 붙을 때 보낸다.
 * 서버가 보낸 값은 protocol.ts 의 모양대로 왔다고 믿지 않고, 화면에 쓰기 전에 main.ts 에서 확인한다.
 */
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '@code-freeze/shared';

const RESUME_KEY = 'cf-resume';
/** 다시 붙지 않는 오류 (사용자가 새로고침하거나 다른 창에서 하는 중) */
const FATAL = new Set(['version_mismatch', 'replaced', 'server_full', 'bad_message', 'rate_limited']);

export type NetStatus = 'connecting' | 'online' | 'offline';

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export class Net {
  private ws: WebSocket | null = null;
  private retry = 0;
  private stopped = false;
  private timer = 0;
  private name = '';
  onMessage: (m: ServerMsg) => void = () => {};
  onStatus: (s: NetStatus, why?: string) => void = () => {};

  get resumeKey(): string | null {
    return storage()?.getItem(RESUME_KEY) ?? null;
  }
  set resumeKey(v: string | null) {
    const s = storage();
    if (!s) return;
    try {
      if (v) s.setItem(RESUME_KEY, v);
      else s.removeItem(RESUME_KEY);
    } catch {
      /* 무시 */
    }
  }

  start(name: string): void {
    this.name = name;
    this.stopped = false;
    void this.open();
  }

  send(m: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private async open(): Promise<void> {
    this.onStatus('connecting');
    let token: string;
    try {
      const res = await fetch('/api/session', { method: 'POST' });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const body = (await res.json()) as { token?: unknown };
      if (typeof body.token !== 'string') throw new Error('session');
      token = body.token;
    } catch {
      return this.later();
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      const resume = this.resumeKey;
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token, name: this.name, ...(resume ? { resume } : {}) }));
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > 1_000_000) return;
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        this.retry = 0;
        this.resumeKey = typeof m.resume === 'string' ? m.resume : null;
        this.onStatus('online');
      }
      if (m.t === 'error') {
        if (m.code === 'resume_failed') this.resumeKey = null; // 다음 시도는 새 판으로
        if (FATAL.has(m.code)) {
          this.stopped = true;
          this.onStatus('offline', m.message);
        }
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.stopped) this.later();
    };
  }

  private later(): void {
    if (this.stopped) return;
    this.onStatus('connecting');
    const wait = Math.min(10_000, 500 * 2 ** this.retry++);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.open(), wait);
  }
}
