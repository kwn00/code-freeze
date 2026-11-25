/**
 * 캔버스 그리기. 맵(9×13 칸)을 정수 배율로 키워서 픽셀이 뭉개지지 않게 한다.
 * 논리 좌표: 칸 하나 = TILE(16) 픽셀. 화면 좌표 = 논리 × scale + 여백.
 */
import { COLS, ENEMIES, ROWS, TILE, TOWERS, type TowerId } from '@code-freeze/shared';
import { PATH_TILES, PROD_TILE, enemyPos, type GameEvent, type State } from '@code-freeze/shared';
import type { Sprites } from './sprites';

const C = {
  base: '#1e1e2e',
  tile: '#212133',
  dot: '#2a2a3d',
  glyph: '#33354d',
  path: '#181825',
  pathEdge: '#313244',
  pathMark: '#45475a',
  ok: 'rgba(166, 227, 161, 0.25)',
  bad: 'rgba(243, 139, 168, 0.25)',
  range: 'rgba(137, 220, 235, 0.12)',
  rangeEdge: 'rgba(137, 220, 235, 0.6)',
  hpBack: '#11111b',
  hp: '#a6e3a1',
  hpLow: '#f38ba8',
  text: '#cdd6f4',
};

const GLYPHS = ['{ }', '</>', '//', ';', '=>', '0x', '[]', '&&', '()', '#!', '::', '!='];

interface Fx {
  kind: 'pop' | 'beam' | 'text' | 'ring';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r?: number;
  text?: string;
  color: string;
  born: number;
  life: number;
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Preview {
  kind: TowerId;
  col: number;
  row: number;
  ok: boolean;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  scale = 2;
  ox = 0;
  oy = 0;
  private fx: Fx[] = [];
  private floor: HTMLCanvasElement | null = null;
  shake = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly spr: Sprites,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** 화면 크기가 바뀌면: 맵이 들어가는 가장 큰 정수 배율 (dpr 포함) */
  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const mw = COLS * TILE;
    const mh = ROWS * TILE;
    // 크면 정수 배율 (픽셀이 고르게), 작은 화면에서는 빈 곳이 많이 남지 않게 0.25 단위까지 허용한다
    const fit = Math.min(this.canvas.width / mw, this.canvas.height / mh);
    this.scale = Math.max(1, fit >= 3 ? Math.floor(fit) : Math.floor(fit * 4) / 4);
    this.ox = Math.floor((this.canvas.width - mw * this.scale) / 2);
    this.oy = Math.floor((this.canvas.height - mh * this.scale) / 2);
    this.floor = null;
  }

  /** 화면(CSS) 좌표 → 칸. 맵 밖이면 null */
  tileAt(cssX: number, cssY: number): [number, number] | null {
    const dpr = this.canvas.width / this.canvas.clientWidth;
    const x = (cssX * dpr - this.ox) / (TILE * this.scale);
    const y = (cssY * dpr - this.oy) / (TILE * this.scale);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return [Math.floor(x), Math.floor(y)];
  }

  /** 칸 좌표(소수) → 캔버스 픽셀 */
  private px(v: number, axis: 'x' | 'y'): number {
    return (axis === 'x' ? this.ox : this.oy) + Math.round(v * TILE * this.scale);
  }

  private bakeFloor(): HTMLCanvasElement {
    const s = this.scale;
    const c = document.createElement('canvas');
    c.width = COLS * TILE * s;
    c.height = ROWS * TILE * s;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = C.base;
    g.fillRect(0, 0, c.width, c.height);
    g.font = `${4 * s}px monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const x = col * TILE * s;
        const y = r * TILE * s;
        const h = hash(col, r);
        if (PATH_TILES.has(`${col},${r}`)) {
          g.fillStyle = C.path;
          g.fillRect(x, y, TILE * s, TILE * s);
          continue;
        }
        if ((col + r) % 2 === 0) {
          g.fillStyle = C.tile;
          g.fillRect(x, y, TILE * s, TILE * s);
        }
        g.fillStyle = C.dot;
        g.fillRect(x, y, s, s);
        if (h % 5 === 0) {
          g.fillStyle = C.glyph;
          g.fillText(GLYPHS[(h >>> 8) % GLYPHS.length]!, x + (TILE * s) / 2, y + (TILE * s) / 2);
        }
      }
    }
    // 길 가장자리 (픽셀 1줄) 와 가운데 점선: git log --graph 의 선처럼
    for (const key of PATH_TILES) {
      const [col, r] = key.split(',').map(Number) as [number, number];
      if (r < 0) continue;
      const x = col * TILE * s;
      const y = r * TILE * s;
      g.fillStyle = C.pathEdge;
      if (!PATH_TILES.has(`${col},${r - 1}`) && r > 0) g.fillRect(x, y, TILE * s, s);
      if (!PATH_TILES.has(`${col},${r + 1}`)) g.fillRect(x, y + (TILE - 1) * s, TILE * s, s);
      if (!PATH_TILES.has(`${col - 1},${r}`)) g.fillRect(x, y, s, TILE * s);
      if (!PATH_TILES.has(`${col + 1},${r}`)) g.fillRect(x + (TILE - 1) * s, y, s, TILE * s);
      g.fillStyle = C.pathMark;
      g.fillRect(x + 7 * s, y + 7 * s, 2 * s, 2 * s);
    }
    return c;
  }

  private blit(img: HTMLCanvasElement, cx: number, cy: number, alpha = 1): void {
    const s = this.scale;
    const w = Math.round(img.width * s);
    const h = Math.round(img.height * s);
    if (alpha !== 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, Math.round(this.px(cx, 'x') - w / 2), Math.round(this.px(cy, 'y') - h / 2), w, h);
    if (alpha !== 1) this.ctx.globalAlpha = 1;
  }

  /** 시뮬레이션이 남긴 일을 효과로 바꾼다 */
  consume(events: readonly GameEvent[], now: number): void {
    for (const e of events) {
      if (e.t === 'hit') {
        if (e.splash > 0) this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.splash, color: '#a6e3a1', born: now, life: 260 });
        else this.fx.push({ kind: 'pop', x: e.x, y: e.y, color: '#f9e2af', born: now, life: 140 });
      } else if (e.t === 'beam') {
        this.fx.push({ kind: 'beam', x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, color: '#89dceb', born: now, life: 160 });
      } else if (e.t === 'kill') {
        this.fx.push({ kind: 'pop', x: e.x, y: e.y, color: '#f38ba8', born: now, life: 220 });
        this.fx.push({ kind: 'text', x: e.x, y: e.y - 0.3, text: `+${e.bounty}`, color: '#f9e2af', born: now, life: 650 });
      } else if (e.t === 'leak') {
        this.shake = 6;
        const [px, py] = PROD_TILE;
        this.fx.push({ kind: 'text', x: px + 0.5, y: py, text: `-${e.amount}`, color: '#f38ba8', born: now, life: 800 });
      }
    }
  }

  draw(s: State, now: number, opts: { preview: Preview | null; selected: number | null }): void {
    const ctx = this.ctx;
    const sc = this.scale;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.path;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.shake > 0) {
      ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * this.shake * sc * 0.5, (Math.random() - 0.5) * this.shake * sc * 0.5);
      this.shake = Math.max(0, this.shake - 0.5);
    }
    if (!this.floor) this.floor = this.bakeFloor();
    ctx.drawImage(this.floor, this.ox, this.oy);

    // prod 서버
    const [pc, pr] = PROD_TILE;
    this.blit(this.spr.prod, pc + 0.5, pr + 0.5);

    // 고른 타워의 사거리
    const sel = opts.selected !== null ? s.towers.find((t) => t.id === opts.selected) : undefined;
    if (sel) this.rangeCircle(sel.col + 0.5, sel.row + 0.5, TOWERS[sel.kind].levels[sel.level]!.range);

    // 지을 자리 미리보기
    const pv = opts.preview;
    if (pv) {
      ctx.fillStyle = pv.ok ? C.ok : C.bad;
      ctx.fillRect(this.px(pv.col, 'x'), this.px(pv.row, 'y'), TILE * sc, TILE * sc);
      this.rangeCircle(pv.col + 0.5, pv.row + 0.5, TOWERS[pv.kind].levels[0]!.range);
      this.blit(this.spr.tower[pv.kind], pv.col + 0.5, pv.row + 0.5, 0.55);
    }

    // 타워 (위에서 아래 순서로 그려서 겹침이 자연스럽게)
    const towers = [...s.towers].sort((a, b) => a.row - b.row);
    for (const t of towers) {
      const def = TOWERS[t.kind];
      const lv = def.levels[t.level]!;
      // 오라 타워는 둘레가 은은하게
      if (def.attack === 'aura') {
        ctx.fillStyle = t.kind === 'duck' ? 'rgba(249, 226, 175, 0.07)' : 'rgba(250, 179, 135, 0.09)';
        ctx.beginPath();
        ctx.arc(this.px(t.col + 0.5, 'x'), this.px(t.row + 0.5, 'y'), lv.range * TILE * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      const bob = t.kind === 'duck' ? Math.round(Math.sin(now / 300 + t.id) * 0.6) / TILE : 0;
      this.blit(this.spr.tower[t.kind], t.col + 0.5, t.row + 0.5 + bob);
      // 단계 표시: 오른쪽 아래 점
      for (let i = 0; i < t.level; i++) {
        ctx.fillStyle = '#11111b';
        ctx.fillRect(this.px(t.col + 1, 'x') - (3 + i * 3) * sc, this.px(t.row + 1, 'y') - 3 * sc, 3 * sc, 3 * sc);
        ctx.fillStyle = '#f9e2af';
        ctx.fillRect(this.px(t.col + 1, 'x') - (3 + i * 3) * sc + sc / 2, this.px(t.row + 1, 'y') - 3 * sc + sc / 2, 2 * sc, 2 * sc);
      }
      if (sel && sel.id === t.id) {
        ctx.strokeStyle = '#f9e2af';
        ctx.lineWidth = sc;
        ctx.strokeRect(this.px(t.col, 'x') + sc / 2, this.px(t.row, 'y') + sc / 2, TILE * sc - sc, TILE * sc - sc);
      }
    }

    // 버그 (멀리 간 것을 위에)
    const enemies = [...s.enemies].sort((a, b) => a.dist - b.dist);
    for (const e of enemies) {
      const [x, y] = enemyPos(e);
      if (y < -0.2) continue;
      const def = ENEMIES[e.kind];
      const wobble = Math.round(Math.sin(now / 120 + e.id) * 1) / TILE;
      const img = e.flash > 0 ? this.spr.enemyFlash[e.kind] : this.spr.enemy[e.kind];
      this.blit(img, x, y + wobble);
      if (e.burnLeft > 0 && Math.floor(now / 100) % 2 === 0) {
        ctx.fillStyle = '#fab387';
        ctx.fillRect(this.px(x, 'x') - sc, this.px(y, 'y') - (img.height / 2 + 3) * sc, 2 * sc, 2 * sc);
      }
      if (e.slow < 1) {
        ctx.fillStyle = '#89dceb';
        ctx.fillRect(this.px(x, 'x') + 3 * sc, this.px(y, 'y') - (img.height / 2 + 3) * sc, 2 * sc, 2 * sc);
      }
      if (e.hp < e.maxHp || def.boss) {
        const w = Math.max(10, Math.round(img.width * 0.9));
        const bx = this.px(x, 'x') - Math.round((w * sc) / 2);
        const by = this.px(y, 'y') + Math.round((img.height / 2 + 1) * sc);
        ctx.fillStyle = C.hpBack;
        ctx.fillRect(bx - sc, by - sc, (w + 2) * sc, 4 * sc);
        const k = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = k > 0.35 ? C.hp : C.hpLow;
        ctx.fillRect(bx, by, Math.round(w * k) * sc, 2 * sc);
      }
    }

    // 탄
    for (const sh of s.shots) {
      const img = this.spr.shot[sh.tower];
      if (img) this.blit(img, sh.x, sh.y);
    }

    // 효과
    this.fx = this.fx.filter((f) => now - f.born < f.life);
    for (const f of this.fx) {
      const k = (now - f.born) / f.life;
      ctx.globalAlpha = 1 - k;
      if (f.kind === 'pop') {
        const r = Math.round((2 + k * 5) * sc);
        ctx.fillStyle = f.color;
        const x = this.px(f.x, 'x');
        const y = this.px(f.y, 'y');
        ctx.fillRect(x - r, y - sc, sc * 2, sc * 2);
        ctx.fillRect(x + r - sc * 2, y - sc, sc * 2, sc * 2);
        ctx.fillRect(x - sc, y - r, sc * 2, sc * 2);
        ctx.fillRect(x - sc, y + r - sc * 2, sc * 2, sc * 2);
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.arc(this.px(f.x, 'x'), this.px(f.y, 'y'), (f.r ?? 1) * TILE * sc * (0.5 + k * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'beam') {
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(1, Math.round((1 - k) * 3)) * sc;
        ctx.beginPath();
        ctx.moveTo(this.px(f.x, 'x'), this.px(f.y, 'y') - 4 * sc);
        ctx.lineTo(this.px(f.x2!, 'x'), this.px(f.y2!, 'y'));
        ctx.stroke();
      } else if (f.kind === 'text') {
        ctx.font = `${6 * sc}px Galmuri11, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#11111b';
        const y = this.px(f.y - k * 0.6, 'y');
        ctx.fillText(f.text!, this.px(f.x, 'x') + sc, y + sc);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text!, this.px(f.x, 'x'), y);
      }
      ctx.globalAlpha = 1;
    }
  }

  private rangeCircle(cx: number, cy: number, range: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = C.range;
    ctx.strokeStyle = C.rangeEdge;
    ctx.lineWidth = this.scale;
    ctx.setLineDash([3 * this.scale, 3 * this.scale]);
    ctx.beginPath();
    ctx.arc(this.px(cx, 'x'), this.px(cy, 'y'), range * TILE * this.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
