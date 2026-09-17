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
import { INVOICE_DB } from "./invoice-mock.js";

export const SUPPLIER = { company: "도랑플라워", bizNumber: "321-99-01778", ceo: "김도훈", email: "ehgns335@naver.com", fax: "053-715-2699" };
export const ACCOUNT = "NH농협은행 352-2284-9916-83 예금주 김도훈(도랑플라워)";
/** 문서의 '계산서 발행' 칸 어휘 — 포털 거래명세서·관리자 정산·공개 링크가 **한 벌**을 쓴다.
 *  예전엔 관리자가 표 배지값('동의하기')을 그대로 PDF 에 흘렸다. 전 품목 면세라 '계산서' 다. */
export const INVOICE_NOTE = { wait: "발급대기", done: "발급완료" };

const wonOf = (n) => Number(n).toLocaleString("ko-KR") + "원";
/** 시드 명세서의 **거래 내역·합계는 INVOICE_DB 에서 파생한다.**
 *  손으로 적어 두면 포털·관리자가 보여 주는 금액과 갈린다 — 실제로 C001 2026-04 가 화면에서는
 *  8건 410,000원인데 이 시드 토큰을 열면 3건 180,000원짜리 문서가 나왔다(청구 근거가 두 값을 말했다).
 *  INVOICE_DB 에 없는 (거래처, 달)은 이 파일의 값이 유일한 원본이므로 그대로 둔다. */
function seedDoc(clientId, ym, base) {
  const rows = ((INVOICE_DB[clientId] || {})[ym] || {}).rows || [];
  if (!rows.length) return base;
  return {
    ...base,
    items: rows.map((r) => ({ date: r[0], sender: r[1], address: r[2], product: r[3], amount: wonOf(r[4]) })),
    total: wonOf(rows.reduce((a, r) => a + r[4], 0)),
  };
}

export const INVOICE_LINKS = {
  // 태원과학(주)(C001) · 2026년 04월
  FP9S0QA8YA: {
    clientId: "C001",
    bizNumber: "101-81-24696",
    doc: seedDoc("C001", "2026-04", {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울특별시 강남구 선릉로639 태원빌딩", company: "태원과학(주)", bizNumber: "101-81-24696", ceo: "태원과학", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: INVOICE_NOTE.wait },
      supplier: SUPPLIER,
      items: [],
      account: ACCOUNT,
      total: "0원",
    }),
  },
  // 태원과학(주)(C001) · 2026년 03월 (동일 거래처, 다른 귀속월 → 별도 링크)
  KM3X7BQ2LP: {
    clientId: "C001",
    bizNumber: "101-81-24696",
    doc: seedDoc("C001", "2026-03", {
      title: "26년 03월 꽃배달 거래명세서",
      period: "2026년 03월 귀속",
      buyer: { address: "서울특별시 강남구 선릉로639 태원빌딩", company: "태원과학(주)", bizNumber: "101-81-24696", ceo: "태원과학", summary: "꽃배달 이용료 청구", issueDate: "2026년 04월 01일", invoiceNote: INVOICE_NOTE.done },
      supplier: SUPPLIER,
      items: [],
      account: ACCOUNT,
      total: "0원",
    }),
  },
  /* (주)진양코퍼레이션(C003) · 2026년 04월 — INVOICE_DB 에 이 거래처의 명세서가 없어 **여기가 원본**이다.
     (포털 거래명세서는 C001·C011 만 데이터를 갖는다 — 다른 거래처의 공개 링크 시연용 시드다.) */
  ZT6W1HE4NC: {
    clientId: "C003",
    bizNumber: "127-86-11470",
    doc: {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "경기도 의정부시 산단로76번길 39(용현동)", company: "(주)진양코퍼레이션", bizNumber: "127-86-11470", ceo: "한상현", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: INVOICE_NOTE.wait },
      supplier: SUPPLIER,
      items: [
        { date: "2026년 04월 26일", sender: "총무팀", address: "서울 서초구 서초대로 396 강남빌딩", product: "3단화환(고급형)", amount: "60,000원" },
        { date: "2026년 04월 18일", sender: "총무팀", address: "경기 성남시 분당구 판교로 289", product: "3단화환(고급형)", amount: "60,000원" },
      ],
      account: ACCOUNT,
      total: "120,000원",
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

/** 명세서에 대한 공개 링크 토큰을 발급(동일 거래처·귀속월이면 기존 토큰 재사용).
 *  ⚠️ **토큰은 재사용하되 문서 본문은 늘 최신으로 덮는다.** 예전엔 같은 (거래처, 사업자번호, 귀속월)이면
 *     호출부가 만든 doc 을 버리고 시드 토큰만 돌려줘, 화면·PDF 와 공개 링크가 서로 다른 금액을 말했다.
 *     토큰이 바뀌면 이미 배포한 링크가 죽으므로 토큰은 그대로 두는 것이 맞다. */
export function issueLink(record) {
  const key = linkKey(record);
  const match = ([, r]) => linkKey(r) === key;
  const reg = loadReg();
  const existing = Object.entries(reg).find(match);
  const seed = Object.entries(INVOICE_LINKS).find(match);
  const token = (existing && existing[0]) || (seed && seed[0]) || genToken();
  reg[token] = record;
  saveReg(reg);
  return token;
}

/** 현재 배포 위치 기준 공개 명세서 URL ({origin}{base}invoice/?link=토큰). */
export function publicInvoiceUrl(token) {
  const dir = location.pathname.replace(/[^/]*$/, "");
  return `${location.origin}${dir}invoice/?link=${token}`;
}
