/**
 * 화면과 입력. 규칙은 sim.ts, 그리기는 render.ts.
 * 화면에 글자를 넣을 때는 textContent 만 쓴다 (innerHTML 금지).
 */
import './style.css';
import { GAME_TAGLINE, START_LIVES, TOWER_IDS, TOWERS, WAVES, type TowerId } from './content';
import { Audio } from './audio';
import { Renderer, type Preview } from './render';
import { STEP, build, canBuildAt, newGame, sell, sellValue, startWave, step, towerAt, upgrade, upgradeCost, type State } from './sim';
import { makeSprites } from './sprites';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const spr = makeSprites();
const canvas = $<HTMLCanvasElement>('game');
const stage = $('stage');
const renderer = new Renderer(canvas, spr);
const audio = new Audio();

let state: State = newGame();
let buildKind: TowerId | null = null;
let selected: number | null = null;
let hover: [number, number] | null = null;
let speed = 1;
let paused = true; // 타이틀이 떠 있는 동안
let bannerTimer = 0;
let muted = false;
try {
  muted = localStorage.getItem('cf-muted') === '1';
} catch {
  /* 저장소를 못 쓰면 기본값 */
}
audio.setMuted(muted);

// ── 타이틀 그림, 문구 ──
$('tagline').textContent = GAME_TAGLINE;
{
  const t = $<HTMLCanvasElement>('title-art').getContext('2d')!;
  t.drawImage(spr.dev, 0, 0);
}

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
  name.textContent = def.name;
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
  if (kind) {
    selected = null;
    const def = TOWERS[kind];
    showBanner(`${def.icon} ${def.name}: ${def.desc}`, '', 1600);
  }
  refreshUi();
}

// ── 알림 띠 ──
function showBanner(text: string, kind: '' | 'good' | 'bad' = '', ms = 1800): void {
  const el = $('banner');
  el.textContent = text;
  el.className = `banner${kind ? ` banner--${kind}` : ''}`;
  // 애니메이션을 다시 돌리려고 한 번 뺐다가 넣는다
  void el.offsetWidth;
  window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => el.classList.add('hidden'), ms);
}

// ── HUD, 독 ──
function refreshUi(): void {
  $('lives').textContent = `${state.lives}`;
  $('lives').parentElement!.classList.toggle('is-low', state.lives <= START_LIVES / 4);
  $('money').textContent = `${state.money}`;
  $('wave').textContent = `${state.wave}/${WAVES.length}`;
  for (const [id, b] of towerBtns) {
    b.disabled = state.money < TOWERS[id].levels[0]!.cost && buildKind !== id;
    b.classList.toggle('is-active', buildKind === id);
  }
  const waveBtn = $<HTMLButtonElement>('btn-wave');
  if (state.status === 'build') {
    waveBtn.disabled = false;
    const next = WAVES[state.wave];
    waveBtn.textContent = next ? `▶ git push · ${state.wave + 1}` : '▶';
    waveBtn.title = next?.name ?? '';
  } else {
    waveBtn.disabled = true;
    waveBtn.textContent = state.status === 'wave' ? `⏳ ${WAVES[state.wave - 1]?.name ?? ''}` : '—';
  }
  $('btn-speed').textContent = `×${speed}`;

  const t = selected !== null ? state.towers.find((x) => x.id === selected) : undefined;
  $('tower-panel').classList.toggle('hidden', !t);
  $('build-bar').classList.toggle('hidden', !!t);
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
    up.disabled = cost === null || state.money < cost;
    $('tp-sell').textContent = `💸 팔기 +${sellValue(t)}`;
  }
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
  const tile = pointerTile(ev);
  if (!tile) {
    selected = null;
    refreshUi();
    return;
  }
  const [col, row] = tile;
  const existing = towerAt(state, col, row);
  if (existing) {
    buildKind = null;
    selected = selected === existing.id ? null : existing.id;
    refreshUi();
    return;
  }
  if (buildKind) {
    const def = TOWERS[buildKind];
    if (!canBuildAt(state, col, row)) {
      audio.play('deny');
      showBanner('여기는 main 브랜치 (길) 예요. 길 옆 빈칸에 지으세요', 'bad', 1400);
    } else if (state.money < def.levels[0]!.cost) {
      audio.play('deny');
      showBanner('SP 가 모자라요', 'bad', 1200);
    } else {
      build(state, buildKind, col, row);
      audio.play('build');
      // 돈이 모자라면 고르기를 푼다 (계속 지을 수 있으면 그대로)
      if (state.money < def.levels[0]!.cost) buildKind = null;
    }
  } else {
    selected = null;
  }
  refreshUi();
});

// ── 버튼 ──
$('tp-upgrade').addEventListener('click', () => {
  if (selected !== null && upgrade(state, selected)) audio.play('upgrade');
  refreshUi();
});
$('tp-sell').addEventListener('click', () => {
  if (selected !== null && sell(state, selected)) audio.play('sell');
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
$('btn-start').addEventListener('click', () => {
  audio.unlock();
  $('screen-title').classList.add('hidden');
  paused = false;
  showBanner('🛠️ 길 옆에 타워를 깔고 git push 로 웨이브를 시작하세요', '', 3200);
});
function refreshSoundBtn(): void {
  $('btn-sound').textContent = muted ? '🔇 소리 켜기' : '🔊 소리 끄기';
}
refreshSoundBtn();
$('btn-sound').addEventListener('click', () => {
  muted = !muted;
  audio.setMuted(muted);
  try {
    localStorage.setItem('cf-muted', muted ? '1' : '0');
  } catch {
    /* 무시 */
  }
  refreshSoundBtn();
});

function tryStartWave(): void {
  audio.unlock();
  if (startWave(state)) {
    buildKind = null;
    refreshUi();
  }
}
function toggleSpeed(): void {
  speed = speed === 1 ? 2 : speed === 2 ? 3 : 1;
  refreshUi();
}
function setPaused(p: boolean): void {
  if (state.status === 'won' || state.status === 'lost') return;
  if (!$('screen-title').classList.contains('hidden')) return;
  paused = p;
  $('screen-pause').classList.toggle('hidden', !p);
}
function restart(): void {
  state = newGame();
  buildKind = null;
  selected = null;
  speed = 1;
  paused = false;
  $('screen-pause').classList.add('hidden');
  $('screen-result').classList.add('hidden');
  refreshUi();
}

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
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
    } else setPaused(!paused);
  } else if (ev.key === 'f' || ev.key === 'F') toggleSpeed();
  else if (ev.key === 'p' || ev.key === 'P') setPaused(!paused);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state.status === 'wave') setPaused(true);
    audio.suspend();
  }
});

// ── 결과 ──
function showResult(won: boolean): void {
  const code = $('result-code');
  if (won) {
    code.className = 'result-code is-good';
    code.textContent = `$ git tag freeze-${new Date().getFullYear()}\n✔ All checks passed\n✔ prod uptime ${Math.round((state.lives / START_LIVES) * 100)}%`;
    $('result-title').textContent = '🎉 코드 프리즈 성공!';
    $('result-text').textContent = `버그 ${state.kills}마리를 막았어요. 이제 맘 편히 연휴를 보내세요.`;
  } else {
    code.className = 'result-code is-bad';
    code.textContent = `HTTP/1.1 502 Bad Gateway\nprod is down. (sprint ${state.wave}/${WAVES.length})`;
    $('result-title').textContent = '💥 장애 발생';
    $('result-text').textContent = `버그 ${state.kills}마리를 막았지만 prod 가 내려갔어요. 회고하고 다시 가 봅시다.`;
  }
  $('screen-result').classList.remove('hidden');
}

// ── 시뮬레이션 이벤트 → 소리, 알림 ──
function handleEvents(now: number): void {
  if (!state.events.length) return;
  renderer.consume(state.events, now);
  let changed = false;
  for (const e of state.events) {
    switch (e.t) {
      case 'hit':
        audio.play('hit');
        break;
      case 'beam':
        audio.play('shoot');
        break;
      case 'kill':
        audio.play('kill');
        changed = true;
        break;
      case 'leak':
        audio.play('leak');
        changed = true;
        break;
      case 'wave_start':
        audio.play('wave');
        showBanner(`Sprint ${e.wave}: ${WAVES[e.wave - 1]!.name}`, '', 2200);
        changed = true;
        break;
      case 'boss':
        audio.play('boss');
        showBanner(`⚠️ ${e.kind === 'god_class' ? 'God Class' : '왕버그'} 가 나타났어요!`, 'bad', 2200);
        break;
      case 'wave_clear':
        audio.play('clear');
        showBanner(`✔ PR Merged! 보너스 +${e.bonus} SP`, 'good', 2200);
        changed = true;
        break;
      case 'won':
        audio.play('won');
        showResult(true);
        break;
      case 'lost':
        audio.play('lost');
        showResult(false);
        break;
    }
  }
  state.events.length = 0;
  if (changed) refreshUi();
}

// ── 돌리기 ──
function resize(): void {
  renderer.resize(stage.clientWidth, stage.clientHeight);
}
new ResizeObserver(resize).observe(stage);
resize();
refreshUi();

let last = performance.now();
let acc = 0;
let lastMoney = state.money;
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt * speed;
    while (acc >= STEP) {
      step(state);
      acc -= STEP;
    }
  } else acc = 0;
  audio.tempo = state.status === 'wave' ? 1.4 : 1;
  handleEvents(now);
  if (state.money !== lastMoney) {
    lastMoney = state.money;
    refreshUi();
  }
  let preview: Preview | null = null;
  if (buildKind && hover) preview = { kind: buildKind, col: hover[0], row: hover[1], ok: canBuildAt(state, hover[0], hover[1]) && state.money >= TOWERS[buildKind].levels[0]!.cost };
  renderer.draw(state, now, { preview, selected });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
