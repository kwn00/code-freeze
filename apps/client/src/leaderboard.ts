/**
 * 순위표 오버레이 (Friday Deploy 와 같은 모양). 게임 상태와는 무관한 읽기 전용 화면이라 연결(WebSocket)을 건드리지 않는다.
 * 서버에서 온 값은 모양을 확인한 것만 쓰고, 문자열(닉네임)은 textContent 로만 넣는다 (innerHTML 금지).
 */
import {
  LEADERBOARD_SIZE,
  TOWERS,
  TOWER_IDS,
  MAX_CLEARED,
  WIN_WAVE,
  isBoardTowers,
  isCleanName,
  type BoardTower,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type TowerId,
} from '@code-freeze/shared';

/** 같은 순위표를 짧은 시간에 반복해서 받지 않게 (열고 닫기만으로 서버 한도에 걸리지 않도록) */
const CACHE_MS = 15_000;

/** 이번 탭에서 방금 순위표에 오른 기록 (그 줄을 강조한다) */
export interface MyPlace {
  rank: number;
  name: string;
  cleared: number;
  lives: number;
  kills: number;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** 클리어 시간: 1시간 넘으면 h:mm:ss, 아니면 m:ss */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function shortDate(at: number): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** 서버가 보낸 한 줄이 순위표 모양인지 (틀리면 그 줄은 버린다) */
export function checkEntry(e: unknown): LeaderboardEntry | null {
  if (typeof e !== 'object' || e === null) return null;
  const o = e as Record<string, unknown>;
  if (!isInt(o.rank, 1, 10_000) || !isCleanName(o.name) || !isInt(o.cleared, 0, MAX_CLEARED) || !isInt(o.lives, 0, 1e6) || !isInt(o.kills, 0, 1e9)) return null;
  if (typeof o.won !== 'boolean' || typeof o.endedAt !== 'number' || !Number.isFinite(o.endedAt)) return null;
  return {
    rank: o.rank,
    name: o.name,
    cleared: o.cleared,
    lives: o.lives,
    kills: o.kills,
    won: o.won,
    endedAt: o.endedAt,
    ...(isBoardTowers(o.towers) ? { towers: o.towers } : {}),
    ...(typeof o.version === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(o.version) ? { version: o.version } : {}),
    ...(isInt(o.time, 0, 10 * 24 * 3600) ? { time: o.time } : {}),
  };
}

/**
 * 순위표에서 방금 내가 세운 기록을 찾는다 (없으면 -1). 그 사이 다른 기록이 앞에 들어와 순위가 밀렸을 수 있으므로
 * 순위가 아니라 내용으로 찾고, 후보가 여럿이면 알려준 순위에 가장 가까운 것을 고른다.
 */
export function findMine(entries: readonly LeaderboardEntry[], m: MyPlace): number {
  const same = entries.filter((e) => e.name === m.name && e.cleared === m.cleared && e.lives === m.lives && e.kills === m.kills);
  same.sort((a, b) => Math.abs(a.rank - m.rank) - Math.abs(b.rank - m.rank));
  return same[0]?.rank ?? -1;
}

/** 타워 그림 (픽셀). 없으면 이모지 */
export type TowerIcon = (kind: TowerId) => HTMLCanvasElement | null;

/** 끝날 때 서 있던 타워들: 같은 종류·단계는 묶어서 [그림]3 ×2 처럼 (그림은 게임 안의 픽셀 그림) */
function towerLine(towers: readonly BoardTower[], icon: TowerIcon): HTMLElement {
  const line = node('span', 'row__items');
  const groups = new Map<string, { kind: number; level: number; n: number }>();
  for (const [kind, level] of towers) {
    const key = `${kind}:${level}`;
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { kind, level, n: 1 });
  }
  const label: string[] = [];
  for (const g of groups.values()) {
    const def = TOWERS[TOWER_IDS[g.kind]!];
    const item = node('span', 'row__item');
    item.title = `${def.name} Lv.${g.level + 1}${g.n > 1 ? ` ×${g.n}` : ''}`;
    item.setAttribute('aria-hidden', 'true');
    const src = icon(TOWER_IDS[g.kind]!);
    if (src) {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.className = 'row__sprite';
      c.getContext('2d')!.drawImage(src, 0, 0);
      item.append(c);
    } else item.append(node('span', '', def.icon));
    item.append(node('b', '', String(g.level + 1)));
    if (g.n > 1) item.append(node('small', '', `×${g.n}`));
    line.append(item);
    label.push(item.title);
  }
  line.setAttribute('aria-label', `타워: ${label.join(', ')}`);
  return line;
}

export class Leaderboard {
  private readonly root = document.getElementById('screen-board') as HTMLElement;
  private readonly body = document.getElementById('board-body') as HTMLElement;
  private readonly note = document.getElementById('board-note') as HTMLElement;
  private readonly closeBtn = document.getElementById('btn-board-close') as HTMLButtonElement;
  private readonly tabs = document.getElementById('board-tabs') as HTMLElement;
  private mine: MyPlace | null = null;
  /** 시즌별로 받은 것 (짧게 보관) */
  private cache = new Map<number, { at: number; data: LeaderboardResponse }>();
  /** 보고 있는 시즌 (null = 지금 시즌) */
  private season: number | null = null;
  /** 마지막으로 안 시즌 목록 (탭) */
  private seasons: number[] = [];
  private current = 0;
  private seq = 0;
  private abort: AbortController | null = null;
  private opener: HTMLElement | null = null;

  /** behind: 열려 있는 동안 포커스·읽기에서 빼 둘 뒤 화면 */
  constructor(
    private readonly behind: HTMLElement[],
    private readonly icon: TowerIcon = () => null,
  ) {
    this.closeBtn.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close(); // 패널 바깥을 눌러도 닫는다
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** 방금 끝난 판이 순위표에 올랐으면 알려 둔다. 열 때 그 줄을 강조한다 */
  setMine(place: MyPlace | null): void {
    this.mine = place;
    if (place) this.cache.delete(this.current); // 새 기록이 올라갔으니 지금 시즌의 보관해 둔 목록은 낡았다
  }

  open(): void {
    if (!this.isOpen) {
      this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.root.classList.remove('hidden');
      for (const b of this.behind) b.inert = true;
    }
    this.season = null; // 열 때는 지금 시즌부터
    void this.load(false);
    this.closeBtn.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.abort?.abort();
    this.seq++;
    this.root.classList.add('hidden');
    for (const b of this.behind) b.inert = false;
    const back = this.opener;
    this.opener = null;
    if (back && back.isConnected && back.offsetParent !== null) back.focus({ preventScroll: true });
  }

  private async load(force: boolean): Promise<void> {
    this.abort?.abort();
    const seq = ++this.seq;
    const key = this.season ?? this.current;
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) return this.render(hit.data);
    this.abort = new AbortController();
    this.note.classList.add('hidden');
    this.body.setAttribute('aria-busy', 'true');
    this.body.replaceChildren(node('p', 'board__msg', '불러오는 중… 서버가 잠들어 있었다면 1분쯤 걸릴 수 있어요.'));
    try {
      const res = await fetch(this.season === null ? '/api/leaderboard' : `/api/leaderboard?season=${this.season}`, { signal: this.abort.signal });
      if (res.status === 429) throw new Error('잠시 뒤에 다시 열어 주세요 (요청이 너무 많아요).');
      if (!res.ok) throw new Error('순위표를 불러오지 못했어요.');
      const raw = (await res.json()) as Partial<LeaderboardResponse>;
      const season = isInt(raw.season, 0, 9999) ? raw.season : 0;
      const current = isInt(raw.current, 0, 9999) ? raw.current : season;
      const data: LeaderboardResponse = {
        season,
        current,
        seasons: (Array.isArray(raw.seasons) ? raw.seasons : []).filter((n): n is number => isInt(n, 0, current)).slice(-50),
        persistent: raw.persistent === true,
        loading: raw.loading === true,
        entries: (Array.isArray(raw.entries) ? raw.entries : []).slice(0, LEADERBOARD_SIZE).map(checkEntry).filter((e): e is LeaderboardEntry => e !== null),
      };
      if (seq !== this.seq) return; // 그 사이 닫았다
      // 서버가 저장된 기록을 아직 불러오는 중이면 곧 바뀌므로 보관하지 않는다
      if (data.loading) this.cache.delete(data.season);
      else this.cache.set(data.season, { at: Date.now(), data });
      this.render(data);
    } catch (err) {
      if (seq !== this.seq) return;
      const msg = err instanceof Error && err.name !== 'AbortError' && err.message.endsWith('.') ? err.message : '순위표를 불러오지 못했어요.';
      const retry = node('button', 'btn board__retry', '↻ 다시 시도');
      retry.type = 'button';
      retry.addEventListener('click', () => void this.load(true));
      this.body.replaceChildren(node('p', 'board__msg board__msg--error', msg), retry);
      this.body.removeAttribute('aria-busy');
    }
  }

  /** 시즌 탭 (최신 시즌부터). 지금 시즌에는 '지금' */
  private renderTabs(data: LeaderboardResponse): void {
    this.current = data.current;
    const list = [...new Set([...data.seasons, data.current, data.season])].sort((a, b) => b - a);
    this.seasons = list;
    const btns = list.map((n) => {
      const b = node('button', `tab${n === data.season ? ' tab--on' : ''}`, n === data.current ? `시즌 ${n} · 지금` : `시즌 ${n}`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(n === data.season));
      b.tabIndex = n === data.season ? 0 : -1;
      b.addEventListener('click', () => this.select(n));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = list.indexOf(n) + (e.key === 'ArrowRight' ? 1 : -1);
        const next = list[(i + list.length) % list.length]!;
        this.select(next);
      });
      return b;
    });
    this.tabs.replaceChildren(...btns);
    this.tabs.classList.toggle('hidden', list.length < 2);
  }

  private select(season: number): void {
    this.season = season === this.current ? null : season;
    void this.load(false).then(() => (this.tabs.querySelector('.tab--on') as HTMLElement | null)?.focus({ preventScroll: true }));
  }

  private render(data: LeaderboardResponse): void {
    this.body.removeAttribute('aria-busy');
    this.renderTabs(data);
    const note = data.season !== data.current
      ? `지난 시즌(시즌 ${data.season})의 기록이에요. 지금은 시즌 ${data.current} 이에요.`
      : !data.persistent
      ? '기록은 서버 메모리에 있어서 서버가 다시 시작되면 사라져요.'
      : data.loading
        ? '저장된 기록을 아직 불러오지 못했어요. 잠시 뒤 다시 열면 목록과 순위가 달라질 수 있어요.'
        : '';
    this.note.classList.toggle('hidden', !note);
    this.note.textContent = note;
    if (data.entries.length === 0) {
        const empty = data.loading
        ? '저장된 기록을 불러오는 중이에요. 잠시 뒤 다시 열어 주세요.'
        : data.season === data.current
          ? `시즌 ${data.season} 에는 아직 기록이 없어요. 첫 번째 프리즈의 주인공이 되어 보세요!`
          : `시즌 ${data.season} 에는 기록이 없어요.`;
      this.body.replaceChildren(node('p', 'board__msg', empty));
      return;
    }
    const mineRank = this.mine && data.season === data.current ? findMine(data.entries, this.mine) : -1;
    const list = node('ol', 'rows');
    list.setAttribute('aria-label', `시즌 ${data.season} 순위표${data.season === data.current ? '' : ' (지난 시즌)'}`);
    let mineRow: HTMLElement | null = null;
    let hasTowers = false;
    for (const e of data.entries) {
      const li = node('li', `row${e.won ? ' row--won' : ''}`);
      const rank = node('span', `row__rank${e.rank <= 3 ? ` row__rank--${e.rank}` : ''}`, String(e.rank));
      const name = node('span', 'row__names');
      name.append(e.name);
      const meta = node('span', 'row__meta');
      for (const t of [e.won ? (e.cleared > WIN_WAVE ? `🎉 프리즈 · 야근 ${e.cleared - WIN_WAVE}일` : '🎉 프리즈 성공') : `Sprint ${e.cleared}`, `🖥️ ${e.lives}`, `⏱ ${e.time === undefined ? '—' : clock(e.time)}`, `🐞 ${e.kills}`, shortDate(e.endedAt)]) if (t) meta.append(node('span', '', t));
      li.append(rank, name);
      if (e.towers && e.towers.length > 0) {
        hasTowers = true;
        li.append(towerLine(e.towers, this.icon));
      }
      li.append(meta);
      if (e.rank === mineRank) {
        li.classList.add('row--mine');
        name.append(node('em', '', '내 기록'));
        mineRow = li;
      }
      list.append(li);
    }
    this.body.replaceChildren(list);
    const legend = ['막은 스프린트 → 남은 가용성 → 클리어 시간(⏱, 짧을수록 위) 순이에요', hasTowers ? '아이콘은 끝날 때 서 있던 타워, 숫자는 단계예요' : ''].filter(Boolean);
    this.body.append(node('p', 'board__legend', legend.join(' · ')));
    this.body.scrollTop = 0;
    mineRow?.scrollIntoView({ block: 'nearest' });
  }
}
