import { NAME_MAX_LEN } from './constants';

/** 글자로 분류되지만 화면에 보이지 않는 것들 (한글 채움 문자 등). 이것만으로 된 이름은 빈칸으로 보인다 */
const INVISIBLE_RE = /\p{Default_Ignorable_Code_Point}/u;

/** 닉네임 정제: 글자·숫자·일부 기호만 남긴다 (보이지 않는 글자는 뺀다). 결과가 비면 'anonymous' */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 64) return 'anonymous';
  const cleaned = Array.from(raw.normalize('NFKC'))
    .filter((ch) => /[\p{L}\p{N}_\-. ]/u.test(ch) && !INVISIBLE_RE.test(ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = Array.from(cleaned).slice(0, NAME_MAX_LEN).join('').trim();
  return cut.length > 0 ? cut : 'anonymous';
}

/** 서버에서 온 이름을 화면에 쓰기 전 확인 (정제된 모양인지) */
export function isCleanName(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && sanitizeName(v) === v;
}
