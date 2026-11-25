/**
 * 화면과 입력. 판정은 모두 서버가 한다: 여기서는 "의도"를 보내고(net.ts), 서버가 보낸 상태를 그린다(view.ts, render.ts).
 * 짓기 자리 미리보기처럼 화면에만 쓰는 판단은 shared 의 같은 함수를 쓰지만, 결과를 정하는 것은 서버다.
 * 화면에 글자를 넣을 때는 textContent 만 쓴다 (innerHTML 금지). 서버에서 온 이름은 isCleanName 으로 확인한다.
 */
import './style.css';
import {
  APP_VERSION,
  GAME_TAGLINE,
  NAME_MAX_LEN,
  RELEASES,
  START_LIVES,
  TOWER_IDS,
  TOWERS,
  WAVES,
  canBuildAt,
  newGame,
  isCleanName,
  sanitizeName,
  sellValue,
  towerAt,
  unseenReleases,
  upgradeCost,
  type BoardEntry,
  type ClientMsg,
  type ReleaseNote,
  type RunResult,
  type ServerMsg,
  type TowerId,
} from '@code-freeze/shared';
import { Audio } from './audio';
import { Net } from './net';
import { Renderer, type Preview } from './render';
import { makeSprites } from './sprites';
import { View, checkSnapshot, type ViewState } from './view';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const spr = makeSprites();
const canvas = $<HTMLCanvasElement>('game');
const stage = $('stage');
const renderer = new Renderer(canvas, spr);
const audio = new Audio();
const net = new Net();
let view = new View();

let buildKind: TowerId | null = null;
let selected: number | null = null;
let hover: [number, number] | null = null;
let playing = false;
let myName = '';
let bannerTimer = 0;
let muted = store('cf-muted') === '1';
audio.setMuted(muted);

/** 연결 전에 그리는 빈 맵 */
const EMPTY = newGame();
const send = (m: ClientMsg): void => net.send(m);

// ── 타이틀 ──
$('tagline').textContent = GAME_TAGLINE;
($('title-art') as HTMLCanvasElement).getContext('2d')!.drawImage(spr.dev, 0, 0);
$('btn-version').textContent = `v${APP_VERSION} · 새 소식`;
const nameInput = $<HTMLInputElement>('name-input');
nameInput.maxLength = NAME_MAX_LEN;
nameInput.value = store('cf-name') ?? '';

// ── 타워 고르기 버튼 ──
const towerBtns = new Map<TowerId, HTMLButtonElement>();
for (const [i, id] of TOWER_IDS.entries()) {
  const def = TOWERS[id];
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tower-btn';
  b.title = `${def.name} — ${def.desc} (${i + 1})`;
  const c = document.createElement('canvas');
  c.width = spr.tower[id].width;
  c.height = spr.tower[id].height;
  c.getContext('2d')!.drawImage(spr.tower[id], 0, 0);
  const name = document.createElement('span');
  name.className = 'tower-btn__name';
  name.textContent = def.short;
  const cost = document.createElement('span');
  cost.className = 'tower-btn__cost';
  cost.textContent = `${def.levels[0]!.cost}`;
  b.append(c, name, cost);
  b.addEventListener('click', () => chooseBuild(buildKind === id ? null : id));
  $('build-bar').append(b);
  towerBtns.set(id, b);
}

function chooseBuild(kind: TowerId | null): void {
  buildKind = kind;
  if (kind) selected = null;
  refreshUi();
}

function showBanner(text: string, kind: '' | 'good' | 'bad' = '', ms = 1800): void {
  const el = $('banner');
  el.textContent = text;
  el.className = `banner${kind ? ` banner--${kind}` : ''}`;
  void el.offsetWidth;
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => el.classList.add('hidden'), ms);
}

/** 지금 화면이 보고 있는 서버 상태 (아직 없으면 null) */
function current(): ViewState | null {
  return view.state(performance.now());
}

// ── HUD, 독 ──
function refreshUi(): void {
  const s = current();
  const money = s?.money ?? 0;
  const lives = s?.lives ?? START_LIVES;
  $('lives').textContent = `${lives}`;
  $('lives').parentElement!.classList.toggle('is-low', lives <= START_LIVES / 4);
  $('money').textContent = `${money}`;
  $('wave').textContent = `${s?.wave ?? 0}/${WAVES.length}`;
  for (const [id, b] of towerBtns) {
    b.disabled = !s || (money < TOWERS[id].levels[0]!.cost && buildKind !== id);
    b.classList.toggle('is-active', buildKind === id);
  }
  const waveBtn = $<HTMLButtonElement>('btn-wave');
  if (s?.status === 'build') {
    const next = WAVES[s.wave];
    waveBtn.disabled = !next || s.paused;
    waveBtn.textContent = next ? `▶ git push · ${s.wave + 1}` : '▶';
    waveBtn.title = next?.name ?? '';
  } else {
    waveBtn.disabled = true;
    waveBtn.textContent = s?.status === 'wave' ? `⏳ ${WAVES[s.wave - 1]?.name ?? ''}` : '—';
  }
  $('btn-speed').textContent = `×${s?.speed ?? 1}`;
  const hint = $('build-hint');
  // 자리는 늘 차지한다 (보였다 사라질 때 독의 높이가 바뀌면 맵이 다시 커지고 작아져, 바로 누른 칸이 어긋난다)
  hint.classList.toggle('is-off', !buildKind);
  hint.textContent = buildKind ? `${TOWERS[buildKind].icon} ${TOWERS[buildKind].name} · ${TOWERS[buildKind].desc}` : '타워를 고르고 길 옆 빈칸을 누르세요';

  const t = s && selected !== null ? s.towers.find((x) => x.id === selected) : undefined;
  if (selected !== null && !t && s) selected = null; // 팔렸거나 새 판
  // 둘은 같은 칸에 겹쳐 있다: 보이지만 않게 해서 독의 높이가 바뀌지 않게 한다 (맵 크기가 흔들리지 않게)
  $('tower-panel').classList.toggle('is-away', !t);
  $('build-bar').classList.toggle('is-away', !!t);
  if (t) {
    const def = TOWERS[t.kind];
    const lv = def.levels[t.level]!;
    $('tp-name').textContent = `${def.icon} ${def.name} Lv.${t.level + 1}/${def.levels.length}`;
    const parts = [`피해 ${lv.damage}`, `사거리 ${lv.range}`, `간격 ${lv.cooldown}초`];
    if (lv.splash) parts.push(`폭발 ${lv.splash}`);
    if (lv.slow) parts.push(`둔화 ${Math.round((1 - lv.slow) * 100)}%`);
    if (lv.burn) parts.push(`화상 ${lv.burn}/초`);
    if (lv.pierce) parts.push('갑옷 무시');
    $('tp-stats').textContent = parts.join(' · ');
    const cost = upgradeCost(t);
    const up = $<HTMLButtonElement>('tp-upgrade');
    up.textContent = cost === null ? '최대 단계' : `⬆ 올리기 ${cost} SP`;
    up.disabled = cost === null || money < cost;
    $('tp-sell').textContent = `💸 팔기 +${sellValue(t)}`;
  }
  // 서버가 멈춤 상태면 멈춤 화면을 띄운다 (끊겼다 다시 붙었을 때 포함)
  if (playing && s) $('screen-pause').classList.toggle('hidden', !(s.paused && s.status !== 'won' && s.status !== 'lost'));
}

// ── 맵 누르기 ──
function pointerTile(ev: PointerEvent): [number, number] | null {
  const r = canvas.getBoundingClientRect();
  return renderer.tileAt(ev.clientX - r.left, ev.clientY - r.top);
}

canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'mouse') hover = pointerTile(ev);
});
canvas.addEventListener('pointerleave', () => (hover = null));
canvas.addEventListener('pointerdown', (ev) => {
  audio.unlock();
  const s = current();
  const tile = pointerTile(ev);
  if (!s || !tile) {
    selected = null;
    refreshUi();
    return;
  }
  const [col, row] = tile;
  const existing = towerAt(s, col, row);
  if (existing) {
    buildKind = null;
    selected = selected === existing.id ? null : existing.id;
  } else if (buildKind) {
    const def = TOWERS[buildKind];
    if (!canBuildAt(s, col, row)) {
      audio.play('deny');
      showBanner('여기는 main 브랜치 (길) 예요. 길 옆 빈칸에 지으세요', 'bad', 1400);
    } else if (s.money < def.levels[0]!.cost) {
      audio.play('deny');
      showBanner('SP 가 모자라요', 'bad', 1200);
    } else {
      // 서버에 부탁한다. 지어졌는지는 다음 상태에서 보인다
      send({ t: 'build', kind: buildKind, col, row });
      audio.play('build');
      if (s.money - def.levels[0]!.cost < def.levels[0]!.cost) buildKind = null;
    }
  } else {
    selected = null;
  }
  refreshUi();
});

// ── 버튼 ──
$('tp-upgrade').addEventListener('click', () => {
  if (selected !== null) {
    send({ t: 'upgrade', id: selected });
    audio.play('upgrade');
  }
});
$('tp-sell').addEventListener('click', () => {
  if (selected !== null) {
    send({ t: 'sell', id: selected });
    audio.play('sell');
  }
  selected = null;
  refreshUi();
});
$('tp-close').addEventListener('click', () => {
  selected = null;
  refreshUi();
});
$('btn-wave').addEventListener('click', () => tryStartWave());
$('btn-speed').addEventListener('click', () => toggleSpeed());
$('btn-pause').addEventListener('click', () => setPaused(true));
$('btn-resume').addEventListener('click', () => setPaused(false));
$('btn-quit').addEventListener('click', () => restart());
$('btn-retry').addEventListener('click', () => restart());
$('btn-start').addEventListener('click', () => startGame());
nameInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') startGame();
});

function startGame(): void {
  audio.unlock();
  myName = sanitizeName(nameInput.value);
  if (myName !== 'anonymous') store('cf-name', myName);
  nameInput.value = myName === 'anonymous' ? '' : myName;
  $('status-text').textContent = '서버에 연결하는 중… (잠든 서버는 깨는 데 1분쯤 걸려요)';
  ($('btn-start') as HTMLButtonElement).disabled = true;
  net.start(myName);
}

function refreshSoundBtn(): void {
  $('btn-sound').textContent = muted ? '🔇 소리 켜기' : '🔊 소리 끄기';
}
refreshSoundBtn();
$('btn-sound').addEventListener('click', () => {
  muted = !muted;
  audio.setMuted(muted);
  store('cf-muted', muted ? '1' : '0');
  refreshSoundBtn();
});

function tryStartWave(): void {
  audio.unlock();
  const s = current();
  if (s?.status === 'build') {
    send({ t: 'wave' });
    buildKind = null;
    refreshUi();
  }
}
/** 서버 답을 기다리지 않고 연달아 눌러도 1 → 2 → 3 으로 넘어가게, 마지막으로 부탁한 값을 기억한다 */
let wantSpeed: { s: 1 | 2 | 3; at: number } | null = null;
function toggleSpeed(): void {
  const now = performance.now();
  const base = wantSpeed && now - wantSpeed.at < 1000 ? wantSpeed.s : (current()?.speed ?? 1);
  const s = base === 1 ? 2 : base === 2 ? 3 : 1;
  wantSpeed = { s, at: now };
  send({ t: 'speed', s });
  $('btn-speed').textContent = `×${s}`;
}
function setPaused(p: boolean): void {
  const s = current();
  if (!playing || !s || s.status === 'won' || s.status === 'lost') return;
  send({ t: 'pause', on: p });
  $('screen-pause').classList.toggle('hidden', !p);
}
function restart(): void {
  send({ t: 'restart' });
  buildKind = null;
  selected = null;
  $('screen-pause').classList.add('hidden');
  $('screen-result').classList.add('hidden');
}

window.addEventListener('keydown', (ev) => {
  if (ev.repeat || ev.target instanceof HTMLInputElement) return;
  if (!playing) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= TOWER_IDS.length) {
    const id = TOWER_IDS[n - 1]!;
    chooseBuild(buildKind === id ? null : id);
  } else if (ev.key === ' ') {
    ev.preventDefault();
    tryStartWave();
  } else if (ev.key === 'Escape') {
    if (buildKind || selected !== null) {
      buildKind = null;
      selected = null;
      refreshUi();
    } else setPaused(!(current()?.paused ?? false));
  } else if (ev.key === 'f' || ev.key === 'F') toggleSpeed();
  else if (ev.key === 'p' || ev.key === 'P') setPaused(!(current()?.paused ?? false));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (current()?.status === 'wave') setPaused(true);
    audio.suspend();
  }
});

// ── 순위표 ──
function isEntry(e: unknown): e is BoardEntry {
  const o = e as BoardEntry;
  return (
    typeof o === 'object' &&
    o !== null &&
    isCleanName(o.name) &&
    Number.isInteger(o.cleared) &&
    Number.isInteger(o.lives) &&
    Number.isInteger(o.kills) &&
    typeof o.won === 'boolean' &&
    Number.isFinite(o.endedAt)
  );
}

async function openBoard(): Promise<void> {
  const list = $('board-list');
  const note = $('board-note');
  list.replaceChildren();
  note.textContent = '불러오는 중…';
  $('screen-board').classList.remove('hidden');
  try {
    const res = await fetch('/api/leaderboard');
    const body = (await res.json()) as { entries?: unknown; persistent?: unknown; season?: unknown };
    const entries = Array.isArray(body.entries) ? body.entries.filter(isEntry).slice(0, 100) : [];
    note.textContent = entries.length ? `시즌 ${typeof body.season === 'number' ? body.season : 0} · 막은 스프린트 → 남은 가용성 순` : '아직 기록이 없어요. 첫 번째가 되어 보세요!';
    for (const e of entries) {
      const li = document.createElement('li');
      if (e.won) li.classList.add('is-won');
      if (e.name === myName) li.classList.add('is-me');
      const b = document.createElement('b');
      b.textContent = e.name;
      const span = document.createElement('span');
      span.textContent = ` · ${e.won ? '🎉 프리즈 성공' : `Sprint ${e.cleared}`} · 🖥️${e.lives} · 🐞${e.kills}`;
      li.append(b, span);
      list.append(li);
    }
  } catch {
    note.textContent = '순위표를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.';
  }
}
$('btn-board').addEventListener('click', () => void openBoard());
$('btn-board2').addEventListener('click', () => void openBoard());
$('btn-board-close').addEventListener('click', () => $('screen-board').classList.add('hidden'));

// ── 새 소식 ──
function openNews(notes: readonly ReleaseNote[]): void {
  const box = $('news-list');
  box.replaceChildren();
  for (const r of notes) {
    const h = document.createElement('h3');
    h.textContent = `v${r.version} ${r.title} `;
    const small = document.createElement('small');
    small.textContent = r.date;
    h.append(small);
    const ul = document.createElement('ul');
    for (const item of r.items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.append(li);
    }
    box.append(h, ul);
  }
  $('screen-news').classList.remove('hidden');
  store('cf-seen-version', APP_VERSION);
}
$('btn-version').addEventListener('click', () => openNews(RELEASES));
$('btn-news-close').addEventListener('click', () => $('screen-news').classList.add('hidden'));
{
  const unseen = unseenReleases(store('cf-seen-version'));
  if (unseen.length) openNews(unseen);
}

// ── 결과 ──
function showResult(r: RunResult): void {
  if (typeof r !== 'object' || r === null || typeof r.won !== 'boolean') return;
  const code = $('result-code');
  if (r.won) {
    code.className = 'result-code is-good';
    code.textContent = `$ git tag freeze-${new Date().getFullYear()}\n✔ All checks passed\n✔ prod uptime ${Math.round((r.lives / START_LIVES) * 100)}%`;
    $('result-title').textContent = '🎉 코드 프리즈 성공!';
    $('result-text').textContent = `버그 ${r.kills}마리를 막았어요. 이제 맘 편히 연휴를 보내세요.`;
  } else {
    code.className = 'result-code is-bad';
    code.textContent = `HTTP/1.1 502 Bad Gateway\nprod is down. (sprint ${r.cleared + 1}/${WAVES.length})`;
    $('result-title').textContent = '💥 장애 발생';
    $('result-text').textContent = `스프린트 ${r.cleared}개를 막고 버그 ${r.kills}마리를 잡았지만 prod 가 내려갔어요.`;
  }
  $('result-rank').textContent = typeof r.rank === 'number' ? `🏆 순위표 ${r.rank}등에 올랐어요!` : r.cleared < 1 ? '스프린트를 하나 이상 막으면 순위표에 올라요.' : '';
  $('screen-result').classList.remove('hidden');
}

// ── 서버 메시지 ──
net.onStatus = (st, why) => {
  const el = $('net-text');
  if (st === 'online') {
    el.classList.add('hidden');
    return;
  }
  if (!playing) {
    $('status-text').textContent = why ?? (st === 'connecting' ? '서버에 연결하는 중… (잠든 서버는 깨는 데 1분쯤 걸려요)' : '연결이 끊겼어요');
    ($('btn-start') as HTMLButtonElement).disabled = st === 'connecting';
    return;
  }
  el.textContent = why ?? '연결이 끊겼어요. 다시 연결하는 중…';
  el.classList.remove('hidden');
};

net.onMessage = (m: ServerMsg) => {
  const now = performance.now();
  switch (m.t) {
    case 'welcome':
      if (!m.resumed) view = new View();
      if (isCleanName(m.name)) myName = m.name;
      if (!playing) {
        playing = true;
        $('screen-title').classList.add('hidden');
        $('status-text').textContent = '';
        showBanner(m.resumed ? '↩️ 하던 판을 이어 가요' : '🛠️ 길 옆에 타워를 깔고 git push 로 웨이브를 시작하세요', m.resumed ? 'good' : '', m.resumed ? 1600 : 3200);
      }
      break;
    case 'state': {
      const snap = checkSnapshot(m);
      if (!snap) return;
      view.push(snap, now);
      refreshUi();
      break;
    }
    case 'result':
      showResult(m.result);
      break;
    case 'error':
      if (m.code === 'resume_failed') view = new View();
      break;
  }
};

// ── 시뮬레이션 이벤트 → 소리, 알림 ──
function handleEvents(now: number): void {
  const evs = view.events;
  if (!evs.length) return;
  renderer.consume(evs, now);
  for (const e of evs) {
    switch (e.t) {
      case 'hit':
        audio.play('hit');
        break;
      case 'beam':
        audio.play('shoot');
        break;
      case 'kill':
        audio.play('kill');
        break;
      case 'leak':
        audio.play('leak');
        break;
      case 'wave_start':
        audio.play('wave');
        showBanner(`Sprint ${e.wave}: ${WAVES[e.wave - 1]?.name ?? ''}`, '', 2200);
        break;
      case 'boss':
        audio.play('boss');
        showBanner(`⚠️ ${e.kind === 'god_class' ? 'God Class' : '왕버그'} 가 나타났어요!`, 'bad', 2200);
        break;
      case 'wave_clear':
        audio.play('clear');
        showBanner(`✔ PR Merged! 보너스 +${e.bonus} SP`, 'good', 2200);
        break;
      case 'won':
        audio.play('won');
        break;
      case 'lost':
        audio.play('lost');
        break;
    }
  }
  evs.length = 0;
}

// ── 돌리기 ──
function resize(): void {
  renderer.resize(stage.clientWidth, stage.clientHeight);
}
new ResizeObserver(resize).observe(stage);
resize();
refreshUi();

function frame(now: number): void {
  const s = view.state(now);
  audio.tempo = s?.status === 'wave' ? 1.4 : 1;
  handleEvents(now);
  let preview: Preview | null = null;
  if (s && buildKind && hover) preview = { kind: buildKind, col: hover[0], row: hover[1], ok: canBuildAt(s, hover[0], hover[1]) && s.money >= TOWERS[buildKind].levels[0]!.cost };
  renderer.draw(s ?? EMPTY, now, { preview, selected });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
