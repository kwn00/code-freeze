/** 서버와 클라이언트가 주고받는 내용의 모양이나 뜻이 바뀔 때만 올린다 (게임 버전과 별개). 다르면 서버가 접속을 거절한다 */
export const PROTOCOL_VERSION = 3;

/** 닉네임 최대 길이 (글자) */
export const NAME_MAX_LEN = 12;

/** 서버가 시뮬레이션을 돌리는 틱 (초당). sim.ts 의 STEP 과 같다 */
export const TICK_HZ = 30;
/** 웨이브 중 화면에 상태를 보내는 횟수 (초당). 짓는 중에는 바뀔 때만 보낸다 */
export const SNAPSHOT_HZ = 10;
/** 고를 수 있는 빠르기 */
export const SPEEDS = [1, 2, 3] as const;
export type Speed = (typeof SPEEDS)[number];

/** 클라이언트 메시지 하나의 최대 크기 (바이트). 넘으면 연결을 끊는다 */
export const MAX_CLIENT_MSG_BYTES = 256;
/** 아무 메시지도 없이 이만큼 지나면 판을 닫는다 (멈춤·짓는 중 포함). 서버 메모리를 붙잡아 두지 못하게 */
export const IDLE_LIMIT_MS = 15 * 60 * 1000;
/** 연결이 끊긴 판을 지켜 두는 시간. 그동안 판은 멈춰 있고, 같은 세션으로 다시 붙으면 이어 간다 */
export const RESUME_WINDOW_MS = 10 * 60 * 1000;
