/**
 * 누른 것을 서버가 받아들이기 전까지 화면에 붙잡아 두기.
 *
 * 버튼을 누르면 화면은 바로 바뀌지만, 서버가 그 입력을 받기 직전에 보낸 상태(옛 값)가 뒤늦게 도착한다.
 * 받은 상태를 그대로 그리면 옛 값으로 잠깐 돌아갔다가(×2 → ×1 → ×2, 메뉴가 떴다 사라졌다 다시 뜸) 다시 바뀐다.
 * 그래서 누른 값을 기억해 두고, 서버가 같은 값을 보낼 때까지(또는 TTL 이 지날 때까지) 누른 값을 보여 준다.
 * 판정은 그대로 서버가 한다: 서버가 끝내 다른 값을 보내면(거절 등) TTL 뒤에는 서버 값을 따른다.
 *
 * DOM 을 쓰지 않는다 (단위 테스트에서 검사한다).
 */
export const PENDING_TTL_MS = 2000;

export class Pending<T> {
  private want: { v: T; at: number } | null = null;

  /** 이 값을 서버에 부탁했다 */
  set(v: T, now: number): void {
    this.want = { v, at: now };
  }

  /** 아직 확인을 기다리는 값 (없으면 null) */
  peek(now: number): T | null {
    if (this.want && now - this.want.at >= PENDING_TTL_MS) this.want = null;
    return this.want ? this.want.v : null;
  }

  /** 화면에 보여 줄 값: 서버가 같은 값을 보냈으면 확인된 것이니 잊고 서버 값을, 아니면 기다리는 값을 */
  shown(server: T, now: number): T {
    const v = this.peek(now);
    if (v === null) return server;
    if (v === server) {
      this.want = null;
      return server;
    }
    return v;
  }

  clear(): void {
    this.want = null;
  }
}
