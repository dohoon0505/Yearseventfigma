/* ============================================================
   invoice-links.js — public 거래명세서 링크 매핑 (DEMO mock).
   각 토큰 = 한 거래처의 한 귀속 년/월 명세서. 토큰 자체가 비밀값(capability URL)
   이므로 공개 링크(/invoice/?link=토큰)를 아는 사람이 곧 열람 권한자다.

   ⚠️ 논리 키는 (clientId, 사업자번호, 귀속월) 3튜플이다. clientId를 빼면
   같은 법인의 서로 다른 부서가 한 토큰을 공유해 남의 명세서를 받게 된다.
   issueLink 를 호출하는 쪽은 반드시 clientId 를 실어야 한다.

   ⚠️ DEMO: 토큰은 클라이언트에서 생성되고 localStorage 에만 남습니다.
   실서비스에서는 서버가 토큰을 발급·저장하고 만료·접근로그를 관리해야 합니다.
   ============================================================ */
export const SUPPLIER = { company: "도랑플라워", bizNumber: "321-99-01778", ceo: "김도훈", email: "ehgns335@naver.com", fax: "053-715-2699" };
export const ACCOUNT = "NH농협은행 352-2284-9916-83 예금주 김도훈(도랑플라워)";

export const INVOICE_LINKS = {
  // 주식회사 싱크플로(C021) · 2026년 04월
  FP9S0QA8YA: {
    clientId: "C021",
    bizNumber: "680-87-02988",
    doc: {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 주식회사 싱크플로", company: "주식회사 싱크플로", bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: "명세서 조회 후 발급" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 04월 28일", sender: "홍길동", address: "서울 관악구 관악로 1 서울대학교 행정관", product: "근조화환(기본형)", amount: "70,000원" },
        { date: "2026년 04월 21일", sender: "김태권", address: "경기 성남시 분당구 판교로 289 삼환하이펙스", product: "축하화환(고급형)", amount: "75,000원" },
        { date: "2026년 04월 12일", sender: "박진찬", address: "부산 해운대구 센텀중앙로 79 센텀사이언스파크", product: "근조화환(기본형)", amount: "70,000원" },
      ],
      account: ACCOUNT,
      total: "215,000원",
    },
  },
  // 주식회사 싱크플로(C021) · 2026년 03월 (동일 거래처, 다른 귀속월 → 별도 링크)
  KM3X7BQ2LP: {
    clientId: "C021",
    bizNumber: "680-87-02988",
    doc: {
      title: "26년 03월 꽃배달 거래명세서",
      period: "2026년 03월 귀속",
      buyer: { address: "서울 중구 퇴계로 100 스테이트타워 남산 3층 주식회사 싱크플로", company: "주식회사 싱크플로", bizNumber: "680-87-02988", ceo: "홍길동", summary: "꽃배달 이용료 청구", issueDate: "2026년 04월 01일", invoiceNote: "발급완료" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 03월 30일", sender: "홍길동", address: "서울 강남구 테헤란로 152 강남파이낸스센터", product: "3단화환(특대형)", amount: "95,000원" },
        { date: "2026년 03월 22일", sender: "정소빈", address: "대전 유성구 대학로 99 세종빌딩", product: "근조오브제(2단형)", amount: "120,000원" },
        { date: "2026년 03월 15일", sender: "임직원", address: "인천 연수구 송도과학로 32 송도컨벤시아", product: "서양란(고급형)", amount: "80,000원" },
        { date: "2026년 03월 08일", sender: "홍길동", address: "광주 서구 상무중앙로 110 김대중컨벤션센터", product: "근조화환(기본형)", amount: "50,000원" },
      ],
      account: ACCOUNT,
      total: "345,000원",
    },
  },
  // (주)진양코퍼레이션(C003) · 2026년 04월 (다른 거래처)
  ZT6W1HE4NC: {
    clientId: "C003",
    bizNumber: "123-45-67890",
    doc: {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울 강남구 테헤란로 152 강남파이낸스센터 18층 (주)진양코퍼레이션", company: "(주)진양코퍼레이션", bizNumber: "123-45-67890", ceo: "김진양", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: "명세서 조회 후 발급" },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 04월 26일", sender: "김사원", address: "서울 서초구 서초대로 396 강남빌딩", product: "축하화환(고급형)", amount: "75,000원" },
        { date: "2026년 04월 18일", sender: "총무팀", address: "경기 성남시 분당구 판교로 289", product: "관엽화분(중형)", amount: "80,000원" },
      ],
      account: ACCOUNT,
      total: "155,000원",
    },
  },
};

/** 사업자번호 비교용: 숫자만 추출. (정의는 util/biz.js — 여기서는 재export) */
export { normalizeBiz } from "../util/biz.js";
import { normalizeBiz as normBiz } from "../util/biz.js";

/* ── 발급된 링크 레지스트리 (localStorage, SPA↔/invoice/ 동일 origin 공유) ──
   정적 시드(INVOICE_LINKS) + 런타임 발급 링크를 합쳐 해석한다.
   실서비스에서는 서버가 토큰을 발급·저장·만료 관리해야 한다. */
const LKEY = "yeop.invoice-links.v2"; // v2: 논리 키에 clientId 추가 — 구 레코드는 키가 없어 폐기
const loadReg = () => { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch { return {}; } };
const saveReg = (reg) => { try { localStorage.setItem(LKEY, JSON.stringify(reg)); } catch {} };
try { localStorage.removeItem("yeop.invoice-links.v1"); } catch { /* storage 비활성 — 무시 */ }

/** 무작위 토큰 생성 (혼동 문자 제외, crypto 우선). */
export function genToken(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  const rnd = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(len)) : null;
  for (let i = 0; i < len; i++) {
    const r = rnd ? rnd[i] % chars.length : Math.floor(Math.random() * chars.length);
    t += chars[r];
  }
  return t;
}

/** 토큰 → 명세서 레코드 ({clientId, bizNumber, doc}) 해석. 런타임 발급분 우선, 없으면 시드. */
export function resolveLink(token) {
  if (!token) return null;
  return loadReg()[token] || INVOICE_LINKS[token] || null;
}

/** 명세서의 논리 키 — (거래처, 사업자번호, 귀속월).
 *  거래처 id가 빠지면 같은 법인의 다른 부서가 한 토큰을 공유한다. */
const linkKey = (r) => `${r.clientId || ""}|${normBiz(r.bizNumber)}|${r.doc.period}`;

/** 명세서에 대한 공개 링크 토큰을 발급(동일 거래처·귀속월이면 기존 토큰 재사용). */
export function issueLink(record) {
  const key = linkKey(record);
  const match = ([, r]) => linkKey(r) === key;
  const seed = Object.entries(INVOICE_LINKS).find(match);
  if (seed) return seed[0];
  const reg = loadReg();
  const existing = Object.entries(reg).find(match);
  if (existing) return existing[0];
  const token = genToken();
  reg[token] = record;
  saveReg(reg);
  return token;
}

/** 현재 배포 위치 기준 공개 명세서 URL ({origin}{base}invoice/?link=토큰). */
export function publicInvoiceUrl(token) {
  const dir = location.pathname.replace(/[^/]*$/, "");
  return `${location.origin}${dir}invoice/?link=${token}`;
}
