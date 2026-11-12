/* ============================================================
   site-info.js — 사이트 아래 '사이트 정보' 칸의 값(서비스 운영사 사업자 정보). import: contact.js 만.

   전자상거래법 제10조 제1항 · 시행규칙 제7조가 첫 화면에 보이라는 회사 정보다(명세 2.5 · 6.10 · 2026-11-05 운영자 답 F1 · B1).
   화면은 로그인 · 가입 화면 아래 칸과 포털 왼쪽 메뉴 아래 버튼·판이다(시안 'K-01 사이트 아래 사업자 정보' 2026-11-11 —
   그리는 쪽은 util/site-info-ui.js).

   ⚠️ 값은 **자리표시**다. 이 저장소·데모 사이트는 공개라 실제 회사 값을 두지 않는다(명세 6.10 · M61 · 계획 E-25 · G-01) —
   실서비스는 서버 설정에서 GET /api/public/site-info 로 읽는다(`loadSiteInfo` 가 그 자리다). 상호 · 대표자 · 사업자등록번호는
   거래명세서 '공급자' 칸과 **같은 출처**라(명세 9.1 끝) invoice-links.js 의 SUPPLIER 가 여기서 가져간다. 이메일은 다르다 —
   이 칸은 대표 이메일(= 개인정보 문의 이메일 · B8), 공급자 칸은 계산서 공급자 이메일이다.
   ============================================================ */
import { CS_PHONE, CS_HOURS } from "./contact.js";

/** 데모 자리표시 값 — 명세 6.10 응답 모양 그대로(`{ company, ceo, address, phone, email, bizNumber, mailOrderNo, hostingCompany, csHours }`).
 *  대표 전화는 고객센터 번호와 같은 번호다(실제 값 — contact.js). */
export const SITE_INFO_DEMO = Object.freeze({
  company: "예시플라워",
  ceo: "홍길동",
  address: "서울특별시 예시구 예시로 12, 3층",
  phone: CS_PHONE,
  email: "help@example.com",
  bizNumber: "000-00-00000",
  mailOrderNo: "제2026-서울예시-0000호",
  hostingCompany: "예시클라우드(주)",
  csHours: CS_HOURS,
});

/** 칸의 항목 — 순서 · 이름이 시안 그대로다. `wrap` = 제 칸 안에서 줄바꿈(긴 주소) · `extra` = 값 뒤에 붙는 보조 값(받는 시간)
 *  · `ftc` = 값 뒤에 공정거래위원회 사업자정보 공개 링크. */
export const SITE_INFO_ROWS = Object.freeze([
  { key: "company", label: "상호" },
  { key: "ceo", label: "대표자" },
  { key: "address", label: "주소", wrap: true },
  { key: "phone", label: "대표 전화", extra: "csHours" },
  { key: "email", label: "이메일" },
  { key: "bizNumber", label: "사업자등록번호", ftc: true },
  { key: "mailOrderNo", label: "통신판매업 신고번호" },
  { key: "hostingCompany", label: "호스팅 서비스 제공" },
]);

const clean = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** 그릴 줄 — **값이 빈 항목은 줄째 뺀다**(시안 — '미정' · '—' 를 공개 화면에 남기지 않는다). */
export function siteInfoRows(info) {
  if (!info) return [];
  return SITE_INFO_ROWS
    .filter((r) => clean(info[r.key]))
    .map((r) => ({ ...r, value: clean(info[r.key]), extraValue: r.extra ? clean(info[r.extra]) : "" }));
}

/** 공정거래위원회 사업자정보 공개 페이지 — 주소는 사업자등록번호(숫자 10자리)로 만든다(시행규칙 제7조 제2항 · 명세 6.10).
 *  10자리가 아니면 "" (링크를 그리지 않는다). */
export function ftcUrl(bizNumber) {
  const d = clean(bizNumber).replace(/\D/g, "");
  return d.length === 10 ? `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${d}` : "";
}

/* ── 읽기(서버 대역) ─────────────────────────────────────────
   데모는 곧바로 자리표시 값을 준다. 못 읽음 · 읽는 중 갈래는 실서비스에서만 생기므로, 화면 검증은 `setSiteInfoSource` 로
   읽는 길을 갈아 끼워 본다(같은 모듈 주소로 import 해야 앱과 같은 인스턴스다 — ?v= 를 붙이면 다른 인스턴스). */
let source = () => SITE_INFO_DEMO;
let pending = null;   // 읽는 중인 약속(같은 때 여러 자리가 불러도 한 번만 읽는다)
let loaded = null;    // 다 읽은 값 — 다시 그릴 때 기다리지 않는다

/** 읽은 값이 있으면 곧바로 돌려준다(없으면 null) — 화면이 깜빡이지 않게 먼저 본다. */
export const peekSiteInfo = () => loaded;

/** 값을 읽는다. 실패는 기억하지 않는다 — 다음 부름(다시 불러오기)이 다시 읽는다. */
export function loadSiteInfo({ fresh = false } = {}) {
  if (loaded && !fresh) return Promise.resolve(loaded);
  if (pending && !fresh) return pending;
  const p = Promise.resolve()
    .then(() => source())
    .then((v) => {
      if (!v || typeof v !== "object") throw new Error("SITE_INFO_EMPTY");
      const out = Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])));
      if (pending === p) { loaded = out; pending = null; }
      return out;
    }, (err) => {
      if (pending === p) pending = null;
      throw err;
    });
  pending = p;
  return p;
}

/** 검증 전용 — 읽는 길을 갈아 끼우고 기억한 값을 버린다(함수는 값 또는 약속을 돌려준다). 인자 없이 부르면 데모 값으로 되돌린다. */
export function setSiteInfoSource(fn) {
  source = typeof fn === "function" ? fn : () => SITE_INFO_DEMO;
  pending = null;
  loaded = null;
}
