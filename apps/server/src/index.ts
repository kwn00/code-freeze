/**
 * 서버 진입점: 화면 파일 · API · WebSocket 을 한 프로세스가 모두 서빙한다 (Render 무료 플랜 한 대).
 *
 * HTTP
 *   GET  /healthz          살아 있는지 + 버전 (배포 확인용)
 *   POST /api/session      1회용 세션 토큰 (IP 당 제한)
 *   GET  /api/leaderboard  읽기 전용 순위표 (메모리에서 답한다)
 *   GET  그 밖             apps/client/dist 의 화면 파일
 * WS /ws                   게임 (protocol.ts)
 */
import { existsSync, statSync } from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { APP_VERSION, LEADERBOARD_SEASON, MAX_CLIENT_MSG_BYTES, PROTOCOL_VERSION, parseClientMsg, type LeaderboardResponse, type ServerMsg } from '@code-freeze/shared';
import { Game, GameManager } from './game';
import { Leaderboard, MemoryStore, type LeaderboardStore } from './leaderboard';
import { IpLimiter, SECURITY_HEADERS, TokenBucket, clientIp, issueSession, originAllowed, pathnameOf, verifySession } from './security';
import { sendFile } from './static';

const PORT = Number(process.env.PORT ?? 8787);
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/** 동시에 돌 수 있는 판 (0.1 CPU · 512MB 를 지킨다. 한 판은 틱 평균 수십 µs, 수십 kB) */
const MAX_GAMES = 300;
const MAX_CONNS_TOTAL = 400;
const MAX_CONNS_PER_IP = 4;
/** 한 주소가 연결 없이 지켜 둘 수 있는 판 수 (끊기를 되풀이해 판을 쌓아 두지 못하게) */
const MAX_HELD_PER_IP = 3;
const HELLO_TIMEOUT_MS = 5000;
/** 모양이 틀린 메시지를 이만큼 보내면 끊는다 */
const MAX_VIOLATIONS = 5;

async function openStore(): Promise<LeaderboardStore> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return new MemoryStore();
  try {
    const { createPostgresStore } = await import('./store-postgres');
    return createPostgresStore(url);
  } catch (err) {
    console.error('[leaderboard] DATABASE_URL 로 저장소를 열지 못했습니다. 이번 실행에서는 메모리에만 기록합니다.', err);
    return new MemoryStore();
  }
}

const leaderboard = new Leaderboard(await openStore(), LEADERBOARD_SEASON);
void leaderboard.init();

const games = new GameManager((g, why) => {
  heldRelease(g);
  sockets.get(g)?.close(4008, why);
});
/** 판 → 지금 붙어 있는 소켓 */
const sockets = new Map<Game, WebSocket>();

const sessionLimiter = new IpLimiter(10, 0.5);
const getLimiter = new IpLimiter(120, 4);
const connsPerIp = new Map<string, number>();
const bump = (ip: string, by: 1 | -1): void => {
  const n = (connsPerIp.get(ip) ?? 0) + by;
  if (n <= 0) connsPerIp.delete(ip);
  else connsPerIp.set(ip, n);
};
/** 주소별로 연결 없이 지켜 두는 판 (먼저 끊긴 것부터) */
const heldByIp = new Map<string, Set<Game>>();
const heldIpOf = new Map<Game, string>();
function heldAdd(ip: string, g: Game): void {
  let set = heldByIp.get(ip);
  if (!set) heldByIp.set(ip, (set = new Set()));
  set.add(g);
  heldIpOf.set(g, ip);
  // 넘치면 가장 오래된 것을 닫는다
  while (set.size > MAX_HELD_PER_IP) {
    const oldest = set.values().next().value!;
    heldRelease(oldest);
    games.remove(oldest);
  }
}
function heldRelease(g: Game): void {
  const ip = heldIpOf.get(g);
  if (ip === undefined) return;
  heldIpOf.delete(g);
  const set = heldByIp.get(ip);
  set?.delete(g);
  if (set && set.size === 0) heldByIp.delete(ip);
}
/** 세션 토큰은 한 번만 쓸 수 있다 */
const usedSessions = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [sid, at] of usedSessions) if (at < cutoff) usedSessions.delete(sid);
}, 60_000).unref();

/* ───────────── HTTP ───────────── */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
};

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: 'bad_request' });
  }
  if (rel.includes('\0')) return json(res, 400, { error: 'bad_request' });
  let file = path.join(CLIENT_DIST, path.normalize(rel));
  // 경로 탈출(path traversal) 방지
  if (file !== CLIENT_DIST && !file.startsWith(CLIENT_DIST + path.sep)) return json(res, 403, { error: 'forbidden' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(CLIENT_DIST, 'index.html');
  if (!existsSync(file)) return json(res, 404, { error: 'client_not_built' });
  const ext = path.extname(file);
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) || file.includes(`${path.sep}fonts${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  };
  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    return void res.end();
  }
  sendFile(res, file, headers, (status) => json(res, status, { error: status === 404 ? 'not_found' : 'internal' }));
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const pathname = pathnameOf(req.url);
  if (pathname === null) return json(res, 400, { error: 'bad_request' });
  if (pathname === '/healthz') return json(res, 200, { ok: true, games: games.count, version: APP_VERSION });
  if (pathname === '/api/session') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
    if (!originAllowed(req)) return json(res, 403, { error: 'forbidden_origin' });
    if (!sessionLimiter.take(clientIp(req))) return json(res, 429, { error: 'rate_limited' }, { 'Retry-After': '5' });
    req.resume(); // 본문은 읽지 않는다
    return json(res, 200, { token: issueSession().token, v: PROTOCOL_VERSION });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  if (!getLimiter.take(clientIp(req))) return json(res, 429, { error: 'rate_limited' }, { 'Retry-After': '10' });
  if (pathname === '/api/leaderboard') {
    const body: LeaderboardResponse = { season: leaderboard.season, persistent: leaderboard.persistent, loading: !leaderboard.ready, entries: leaderboard.top() };
    return json(res, 200, body, { 'Access-Control-Allow-Origin': '*' });
  }
  if (pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
  serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  try {
    handleRequest(req, res);
  } catch (err) {
    console.error('[error] http', err instanceof Error ? err.message : err);
    if (!res.headersSent) json(res, 500, { error: 'internal' });
    else res.destroy();
  }
});
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;

/* ───────────── WebSocket ───────────── */

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MSG_BYTES, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const reject = (code: number, text: string): void => {
    socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };
  if (pathnameOf(req.url) !== '/ws') return reject(404, 'Not Found');
  if (!originAllowed(req)) return reject(403, 'Forbidden');
  const ip = clientIp(req);
  if (wss.clients.size >= MAX_CONNS_TOTAL) return reject(503, 'Service Unavailable');
  if ((connsPerIp.get(ip) ?? 0) >= MAX_CONNS_PER_IP) return reject(429, 'Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
});

function sendTo(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function onConnection(ws: WebSocket, ip: string): void {
  bump(ip, 1);
  let game: Game | null = null;
  let violations = 0;
  // 초당 15개, 한 번에 30개까지 (짓기·올리기를 빠르게 눌러도 넉넉하고, 넘치는 것은 버린다)
  const bucket = new TokenBucket(30, 15);
  let dropped = 0;
  const helloTimer = setTimeout(() => ws.close(4001, 'hello_timeout'), HELLO_TIMEOUT_MS);
  const fail = (code: Extract<ServerMsg, { t: 'error' }>['code'], message: string, close = 4000): void => {
    sendTo(ws, { t: 'error', code, message });
    ws.close(close, code);
  };

  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (isBinary) return void ws.close(4002, 'binary');
    if (!bucket.take()) {
      // 계속 넘치게 보내면 끊는다
      if (++dropped > 60) fail('rate_limited', '요청이 너무 많아요', 4029);
      return;
    }
    const msg = parseClientMsg(data.toString());
    if (!msg) {
      if (++violations >= MAX_VIOLATIONS) fail('bad_message', '잘못된 요청', 4003);
      return;
    }
    if (!game) {
      if (msg.t !== 'hello') return void ws.close(4001, 'hello_first');
      clearTimeout(helloTimer);
      if (msg.v !== PROTOCOL_VERSION) return fail('version_mismatch', '새 버전이 나왔어요. 새로고침해 주세요', 4010);
      const sid = verifySession(msg.token);
      if (!sid || usedSessions.has(sid)) return fail('bad_token', '세션이 만료됐어요. 새로고침해 주세요', 4011);
      usedSessions.set(sid, Date.now());
      const send = (m: ServerMsg): void => sendTo(ws, m);
      if (msg.resume) {
        const g = games.byKey(msg.resume);
        if (!g) return fail('resume_failed', '이어 할 판이 없어요', 4012);
        // 다른 연결이 붙어 있으면 그쪽을 닫는다 (한 판에 연결 하나)
        const old = sockets.get(g);
        if (old && old !== ws) {
          sendTo(old, { t: 'error', code: 'replaced', message: '다른 창에서 이어 하고 있어요' });
          old.close(4009, 'replaced');
        }
        heldRelease(g);
        game = g;
        sockets.set(g, ws);
        sendTo(ws, { t: 'welcome', version: APP_VERSION, name: g.name, resumed: true, resume: g.resumeKey });
        g.attach(send);
        return;
      }
      if (games.count >= MAX_GAMES) return fail('server_full', '서버가 가득 찼어요. 잠시 뒤에 다시 와 주세요', 4013);
      const g = new Game(msg.name, send, async (r) => leaderboard.record(r));
      game = g;
      sockets.set(g, ws);
      games.add(g);
      sendTo(ws, { t: 'welcome', version: APP_VERSION, name: g.name, resumed: false, resume: g.resumeKey });
      return;
    }
    if (msg.t === 'hello') return;
    game.handle(msg);
  });

  ws.on('close', (code) => {
    clearTimeout(helloTimer);
    bump(ip, -1);
    if (!game || sockets.get(game) !== ws) return;
    sockets.delete(game);
    // 서버가 끊은 연결(규칙 위반·속도 제한)이거나 판이 끝났으면 지켜 두지 않는다
    const st = game.state.status;
    if (code === 4003 || code === 4029 || code === 4008 || st === 'won' || st === 'lost') {
      games.remove(game);
      return;
    }
    game.detach();
    heldAdd(ip, game);
  });
  ws.on('error', () => ws.terminate());
}

server.listen(PORT, () => console.log(`[server] code-freeze ${APP_VERSION} on :${PORT} (leaderboard: ${leaderboard.persistent ? 'postgres' : 'memory'})`));

/** 배포·재시작 때: 남은 기록을 마저 쓰고 끝낸다 */
let stopping = false;
async function shutdown(sig: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[server] ${sig}: 종료합니다`);
  games.stop();
  for (const ws of wss.clients) ws.close(1012, 'restart');
  server.close();
  await Promise.race([leaderboard.close(), new Promise((r) => setTimeout(r, 8000))]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
