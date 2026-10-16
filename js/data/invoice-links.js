/* ============================================================
   invoice-links.js — public 거래명세서 링크 매핑 (DEMO mock).
   각 토큰 = 한 거래처의 한 귀속 년/월 명세서. 토큰 자체가 비밀값(capability URL)
   이므로 공개 링크(/invoice/?link=토큰)를 아는 사람이 곧 열람 권한자다.

   ⚠️ 논리 키는 (clientId, 사업자번호, 귀속월) 3튜플이다. clientId를 빼면
   같은 법인의 서로 다른 부서가 한 토큰을 공유해 남의 명세서를 받게 된다.
   issueLink 를 호출하는 쪽은 반드시 clientId 를 실어야 한다.

   ⚠️ DEMO: 토큰은 클라이언트에서 생성되고 localStorage 에만 남습니다.
   실서비스에서는 서버가 토큰을 발급·저장하고 만료·접근로그를 관리해야 합니다.

   ── 토큰은 본문 대신 (거래처, 사업자번호, 귀속월)만 든다 (2026-10-16 DATA.md 3.2 · 명세 3.5 '열 때의 지금 값') ──
   레코드 = `{ clientId, bizNumber, ym }`. 공개 페이지(public-invoice.js)가 **열 때** util/invoice-data `invoiceDocData` 로
   문서를 만든다 — 예전엔 복사한 순간의 본문을 실어 동의 뒤에도 링크 속 '계산서 발행' 칸이 복사 때 낱말 그대로였다.
   `ym` 이 없는 옛 레코드·시드 토큰(C003 — INVOICE_DB 에 없는 달)은 저장된 `doc` 으로 연다. LKEY 는 그대로다.
   데모 한계는 그대로 — 레지스트리도 store 도 그 브라우저의 localStorage 라 다른 브라우저에서는 링크가 열리지 않는다.
   ============================================================ */
import { INVOICE_DB } from "./invoice-mock.js";
import { periodLabel } from "./settlement-rules.js";

/** 공급자·입금계좌는 **자리표시**다(2026-10-03 결정 · 알림 체계 M61). 이 저장소·데모 사이트는 공개라 실제 값을 두지 않는다 —
 *  실서비스 값은 서버 설정값으로 둔다(명세 9.4 · 5.4). 문서·알림톡(T6~T8 #{입금계좌})은 서버가 그 값을 채운다. */
export const SUPPLIER = { company: "예시플라워", bizNumber: "000-00-00000", ceo: "홍길동", email: "billing@example.com", fax: "02-0000-0000" };
export const ACCOUNT = "예시은행 000-0000-0000-00 예금주 홍길동(예시플라워)";
/** 문서의 '계산서 발행' 칸 어휘 — 포털 거래명세서·관리자 정산·공개 링크가 **한 벌**을 쓴다.
 *  예전엔 관리자가 표 배지값('동의하기')을 그대로 PDF 에 흘렸다. 전 품목 면세라 '계산서' 다. */
export const INVOICE_NOTE = {
  wait: "발급대기", done: "발급완료",
  /* S-02 시안('포털 거래명세서 동의')이 정한 상태별 낱말 — util/settlement.js `invoiceDocNoteOf` 가 고른다.
     동의 뒤 계산서가 아직 안 나온 달(발급 실패·재시도)을 '발급완료'·'발급대기' 로 뭉개지 않고, 0원 달·거래 없는 달·
     발행 전 달을 '-' 대신 말로 적는다. */
  none: "해당 없음", scheduled: "발행 전", awaiting: "발급대기 · 동의 후 발급", issuing: "발급 중", zero: "해당 없음(0원)",
};
/** 문서의 **동의 전 표기**(S-02 시안 · 명세 R14 '동의 전 문서') — 머리 오른쪽 태그와 모든 장 왼쪽 아래 줄에 출력 시각과 함께
 *  찍는다(invoice-doc.js). 찍는 달은 settlementOf().docStamp(명세서가 나갔고 · 동의 전이고 · 수정 마감 전 — 사용자 답 1).
 *  포털 미리보기·PDF·EXCEL·관리자 PDF·공개 링크가 이 한 벌을 쓴다(util/invoice-data `invoiceDocData` 의 stamp.text). */
export const DOC_STAMP = "동의 전 — 금액이 바뀔 수 있습니다";

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

/* 시드 토큰 — INVOICE_DB 에 그 달이 있는 둘(C001 2026-04·03)은 `ym` 을 실어 **열 때 다시 만든다**(그 달 주문이 b2b-mock 에
   있다). 남겨 둔 `doc` 은 store 가 그 거래처를 못 찾을 때의 대비일 뿐이다. C003 은 지난달을 가리킨다(아래). */
/** 지난달 "YYYY-MM" — 모듈을 읽는 시각 기준(데모 시계를 따른다). */
const PREV_YM = (() => { const d = new Date(); const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`; })();

export const INVOICE_LINKS = {
  // 한빛과학(주)(C001) · 2026년 04월
  FP9S0QA8YA: {
    clientId: "C001",
    bizNumber: "000-00-00001",
    ym: "2026-04",
    doc: seedDoc("C001", "2026-04", {
      title: "26년 04월 꽃배달 거래명세서",
      period: "2026년 04월 귀속",
      buyer: { address: "서울특별시 강남구 예시로 101 한빛빌딩", company: "한빛과학(주)", bizNumber: "000-00-00001", ceo: "김민준", summary: "꽃배달 이용료 청구", issueDate: "2026년 05월 01일", invoiceNote: INVOICE_NOTE.wait },
      supplier: SUPPLIER,
      items: [],
      account: ACCOUNT,
      total: "0원",
    }),
  },
  // 한빛과학(주)(C001) · 2026년 03월 (동일 거래처, 다른 귀속월 → 별도 링크)
  KM3X7BQ2LP: {
    clientId: "C001",
    bizNumber: "000-00-00001",
    ym: "2026-03",
    doc: seedDoc("C001", "2026-03", {
      title: "26년 03월 꽃배달 거래명세서",
      period: "2026년 03월 귀속",
      buyer: { address: "서울특별시 강남구 예시로 101 한빛빌딩", company: "한빛과학(주)", bizNumber: "000-00-00001", ceo: "김민준", summary: "꽃배달 이용료 청구", issueDate: "2026년 04월 01일", invoiceNote: INVOICE_NOTE.done },
      supplier: SUPPLIER,
      items: [],
      account: ACCOUNT,
      total: "0원",
    }),
  },
  /* (주)동행코퍼레이션(C003) · **지난달** — 다른 거래처의 공개 링크 시연용 시드. 예전엔 2026-04 본문을 여기 박아 두었는데,
     그 달은 주문 데이터에 없어(가상 주문은 최근 달만 만든다) 관리자 정산 화면이 '거래 없음' 이라고 할 때 링크만 120,000원을
     말했다(2026-10-16 통합 점검). 이제 다른 시드처럼 `ym` 만 싣고 열 때 지금 주문으로 만든다 — 지난달은 늘 발행된 달이다. */
  ZT6W1HE4NC: {
    clientId: "C003",
    bizNumber: "000-00-00003",
    ym: PREV_YM,
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

/** 토큰 → 명세서 레코드 해석. 런타임 발급분 우선, 없으면 시드.
 *  `{ clientId, bizNumber, ym }`(지금 모양 — 열 때 invoiceDocData 로 만든다) 또는 `{ clientId?, bizNumber, doc }`(옛 런타임 레코드). */
export function resolveLink(token) {
  if (!token) return null;
  return loadReg()[token] || INVOICE_LINKS[token] || null;
}

/** "2026년 09월 귀속" → "2026-09"(옛 호출부가 넘긴 doc.period 에서 귀속월을 읽는다). 모양이 어긋나면 "". */
const ymOfPeriod = (p) => { const m = /(\d{4})년\s*(\d{1,2})월/.exec(String(p || "")); return m ? `${m[1]}-${String(m[2]).padStart(2, "0")}` : ""; };
/** 레코드의 귀속월 표기 — 논리 키 문자열은 예전과 같게 `${periodLabel(ym)} 귀속` 으로 만든다(이미 나간 토큰이 그대로 이어진다). */
const periodText = (r) => (r.ym ? `${periodLabel(r.ym)} 귀속` : (r.doc && r.doc.period) || "");
/** 명세서의 논리 키 — (거래처, 사업자번호, 귀속월).
 *  거래처 id가 빠지면 같은 법인의 다른 부서가 한 토큰을 공유한다. */
const linkKey = (r) => `${r.clientId || ""}|${normBiz(r.bizNumber)}|${periodText(r)}`;

/** 명세서에 대한 공개 링크 토큰을 발급(동일 거래처·귀속월이면 기존 토큰 재사용).
 *  `record = { clientId, bizNumber, ym }` — **본문을 싣지 않는다**(공개 페이지가 열 때 만든다 · 명세 3.5).
 *  옛 호출 모양 `{ clientId, bizNumber, doc }` 도 받는다 — clientId 가 있고 doc.period 에서 귀속월을 읽을 수 있으면 같은
 *  `{ clientId, bizNumber, ym }` 로 바꿔 저장한다(본문은 버린다). clientId 가 없는 옛 모양만 본문을 그대로 둔다.
 *  ⚠️ 토큰은 재사용한다 — 토큰이 바뀌면 이미 배포한 링크가 죽는다. */
export function issueLink(record) {
  const ym = record.ym || (record.clientId ? ymOfPeriod(record.doc && record.doc.period) : "");
  const rec = ym && record.clientId ? { clientId: record.clientId, bizNumber: record.bizNumber, ym } : record;
  const key = linkKey(rec);
  const match = ([, r]) => linkKey(r) === key;
  const reg = loadReg();
  const existing = Object.entries(reg).find(match);
  const seed = Object.entries(INVOICE_LINKS).find(match);
  const token = (existing && existing[0]) || (seed && seed[0]) || genToken();
  reg[token] = rec;
  saveReg(reg);
  return token;
}

/** 현재 배포 위치 기준 공개 명세서 URL ({origin}{base}invoice/?link=토큰). */
export function publicInvoiceUrl(token) {
  const dir = location.pathname.replace(/[^/]*$/, "");
  return `${location.origin}${dir}invoice/?link=${token}`;
}
