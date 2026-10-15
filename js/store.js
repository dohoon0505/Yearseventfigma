/* ============================================================
   store.js — global state (profiles / contacts / favorites)
   pub/sub + localStorage persistence. Ports AppContext.tsx.
   ============================================================ */
import { INITIAL_CLIENTS, SEED_BILLING, DATA_NOW } from "./data/admin-mock.js";
/* 동의 상태(발행·마감·자동 동의·작성일자)는 규칙 모듈 한 곳에서 파생한다 — import 0 이라 순환이 없다. */
import { agreementState, fmtAt, parseAt, periodOf, invoiceDayOf, invoiceDayFor, invoiceDayEffectiveFrom, HOLD_CODES } from "./data/settlement-rules.js";
/* ⚠️ session.js 는 store 를 import 하지 않는다 — 순환이 아니다.
   util/client.js 는 store 를 import 하므로 여기서 쓰면 순환이 된다. */
import { getClientId, isReservedAccountId } from "./session.js";

/** @typedef {{category:string,product:string,price:string,description:string,icon:string}} Product */
/** @typedef {{no:string,name:string,role:string,phone:string,greeting:string}} Profile */
/** @typedef {{id:string,no?:string,name:string,role:string,phone:string,message:string,isBilling:boolean}} Contact */
/* ⚠️ Contact 의 키는 `id` 다. `no` 는 화면에 보이는 순번일 뿐이라 쓰기마다 다시 매겨진다 —
   삭제하면 뒤 번호가 전부 당겨지므로 `no` 로 대상을 지목하면 엉뚱한 사람이 바뀐다. */
/** @typedef {{id:string,accountId:string,companyName:string,bizNumber:string,ceoName:string,managerName:string,department:string,contact:string,email:string,address:string,status:string,joinDate:string,invoiceDay:string,clientNote:string,channel?:string,password?:string}} Client */
/* password 는 셀프 가입(register.js)·데모 시드(`demo1234`)·관리자의 임시비밀번호 발급이 채운다. 로그인은 언제나
   검사한다(login.js). 관리자는 비밀번호를 읽지 못하고 임시비밀번호 발급만 한다(admin-clients). */

/* ── Static product catalog (immutable) ─────────────────── */
export const ALL_PRODUCTS = [
  { category: "경조화환", product: "근조바구니",        price: "50,000원",  description: "빈소 내에 놓지하는 바구니형 애도상품", icon: "🌸" },
  { category: "경조화환", product: "근조오브제(1단형)", price: "50,000원",  description: "웰체 스탠드 위 부분을 조화로 꾸민 오브제형 근조화환", icon: "🌸" },
  { category: "경조화환", product: "근조오브제(2단형)", price: "75,000원",  description: "웰체 스탠드 위·아래를 조화로 꾸민 오브제형 근조화환", icon: "🌸" },
  { category: "경조화환", product: "3단화환(기본형)",   price: "50,000원",  description: "보편적으로 가장 많이 유통되는 3단형 화환(목·근조 동일)", icon: "🌸" },
  { category: "경조화환", product: "3단화환(고급형)",   price: "60,000원",  description: "기본 화환에서 장식이 일부 추가된 3단형 화환", icon: "🌸" },
  { category: "경조화환", product: "3단화환(특대형)",   price: "75,000원",  description: "기본 화환에 좋은 꽃만 구비된 특대 3단형 화환", icon: "🌸" },
  { category: "경조화환", product: "4단화환(표준형)",   price: "95,000원",  description: "기존 3단형 화환에서 1단이 추가된 대형 4단화환", icon: "🌸" },
  { category: "경조화환", product: "쌀화환(10kg)",      price: "75,000원",  description: "기본 화환 형태에 쌀 10kg가 더해져 배송되는 예도상품", icon: "🌸" },
  { category: "경조화환", product: "쌀화환(20kg)",      price: "110,000원", description: "기본 화환 형태에 쌀 20kg가 더해져 배송되는 예도상품", icon: "🌸" },
  { category: "관엽화분", product: "탁상용 미니화분",   price: "50,000원",  description: "카운터·테이블에 두기 좋은 미니화분으로 평균 40~70cm", icon: "🌿" },
  { category: "관엽화분", product: "탁상용 중형화분",   price: "80,000원",  description: "바닥에 두는 화분 중 크기가 적당한 화분으로 평균 60~120cm", icon: "🌿" },
  { category: "관엽화분", product: "탁상용 대형화분",   price: "100,000원", description: "바닥에 두는 화분 중 크기가 큰 화분으로 평균 130~160cm", icon: "🌿" },
  { category: "동서양란", product: "동양란(기본형)",    price: "50,000원",  description: "기본적인 동양란을 보편적인 품종으로 제공하는 동양란", icon: "🏵️" },
  { category: "동서양란", product: "동양란(고급형)",    price: "100,000원", description: "고급 화양에 고급 품종으로 제작되는 동양란", icon: "🏵️" },
  { category: "동서양란", product: "서양란(기본형)",    price: "50,000원",  description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 1~2대", icon: "🏵️" },
  { category: "동서양란", product: "서양란(고급형)",    price: "80,000원",  description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 3~4대", icon: "🏵️" },
  { category: "동서양란", product: "서양란(특대형)",    price: "120,000원", description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 6~8대", icon: "🏵️" },
  { category: "생화",     product: "소형 꽃바구니",     price: "50,000원",  description: "생화 5~10송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
  { category: "생화",     product: "중형 꽃바구니",     price: "80,000원",  description: "생화 10~20송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
  { category: "생화",     product: "대형 꽃바구니",     price: "120,000원", description: "생화 20~30송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
  /* 2026-09-17 신설 — (주)온누리헬스 2026-08 실데이터의 꽃바구니 150,000원 항목(사용자 지시). */
  { category: "생화",     product: "특대 꽃바구니",     price: "150,000원", description: "생화 30송이 이상으로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
];

export const productKey = (r) => `${r.category}__${r.product}`;
/** "50,000원" → 50000 */
export const priceNum = (str) => parseInt(String(str).replace(/[^0-9]/g, ""), 10) || 0;
/** 50000 → "50,000원" */
export const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

/* ── Initial mock data ──────────────────────────────────── */
const INITIAL_PROFILES = [
  { id: "pf1", no: "01", name: "홍길동", role: "대표이사",   phone: "010-0000-0000", greeting: "(주)올해의경조사 대표이사 홍길동" },
  { id: "pf2", no: "02", name: "정소빈", role: "대표변호사", phone: "010-0000-0000", greeting: "올해표현(유) 대표변호사 정소빈" },
  { id: "pf3", no: "03", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { id: "pf4", no: "04", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { id: "pf5", no: "05", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
];

/* 담당자의 배송완료 알림 수신 여부. 주문서의 알림 수신자 명단이 이 값으로 파생되므로
   문자열 비교가 두 모듈(profile.js·order.js)에서 어긋나면 안 된다 → 여기서 단일 정의. */
export const MSG_RECEIVE = "모든 배송완료 마다에 메세지를 수신합니다";
export const MSG_NONE = "메세지를 수신하지 않습니다.";
/** 배송완료 알림을 받는 담당자만. */
export const receivingContacts = (contacts) => contacts.filter((c) => c.message === MSG_RECEIVE);

const INITIAL_CONTACTS = [
  { id: "ct1", name: "할다운", role: "비서",   phone: "010-1111-2222", message: MSG_RECEIVE, isBilling: false },
  { id: "ct2", name: "오임찬", role: "재경부", phone: "010-3333-4444", message: MSG_NONE,    isBilling: true },
  { id: "ct3", name: "김현수", role: "경리",   phone: "010-5555-6666", message: MSG_RECEIVE, isBilling: false },
];

/* 담당자는 **거래처별**이다(백엔드 명세서 5.1 Client 1:N Contact).
   위 3명은 데모에서 포털에 주로 로그인하는 첫 거래처 소속이다. 나머지 거래처는 SEED_BILLING(admin-mock)의
   정산담당 1명씩 — 데모 거래처는 모두 '가입 완료' 상태라 가입 2단계 담당자가 정산담당이 된 모양과 같다
   (2026-09-29 · 법무 답 '정산담당자는 필수'). */
const FIRST_CLIENT = INITIAL_CLIENTS[0] ? INITIAL_CLIENTS[0].id : "C001";
const seedContactsByClient = () => Object.fromEntries(INITIAL_CLIENTS.map((c) => {
  if (c.id === FIRST_CLIENT) return [c.id, INITIAL_CONTACTS.map((x) => ({ ...x }))];
  const [name, role, phone] = SEED_BILLING[c.id] || [c.managerName, "", c.contact];
  return [c.id, [{ id: `ct-${c.id}`, name, role, phone, message: MSG_RECEIVE, isBilling: true }]];
}));
let ctSeq = 100;
export const newContactId = () => `ct${++ctSeq}`;
/* 프로필도 안정 id 를 갖는다 — `no` 는 `reindexNo` 가 쓰기마다 다시 매기는 표시
   순번이라 주문이 프로필을 지목하는 키로 쓸 수 없다(담당자에서 이미 겪은 것). */
let pfSeq = 100;
export const newProfileId = () => `pf${++pfSeq}`;

/* ── Reactive store ─────────────────────────────────────── */
/* ⚠️ 키는 함부로 올리지 않는다. 올리면 담당자뿐 아니라 거래처 편집·단가·프로필까지 **전부** 버려진다.
   담당자 구조 변경(전역 → 거래처별)은 hydrateContacts 가 두 모양을 다 읽어 흡수한다.
   v5 는 예외다(2026-09-29) — 거래처를 가상 데모로 바꿨는데 hydrate 는 저장값이 시드를 이기므로, 올리지 않으면
   이미 열어 본 브라우저에 구 시스템 **실데이터**가 계속 남는다. 옛 키는 읽지 않고 지운다. */
const KEY = "yeop.store.v5"; // v5: 가상 데모 거래처 19곳(비밀번호·약관·정산담당 포함)
const RETIRED_KEYS = ["yeop.store.v4"]; // v4: 구 시스템 거래처 실데이터 — 남기지 않는다
const subs = new Set();
const SEED_BY_ID = new Map(INITIAL_CLIENTS.map((c) => [c.id, c]));

/* 순번(no) 재부여: 프로필·담당자 목록은 항상 배열 순서대로 01,02,03… 을 유지한다.
   → 대상자 삭제 시 뒤 항목이 자동으로 앞 번호로 당겨진다(빈 번호 방지). */
const reindexNo = (arr) => arr.map((x, i) => ({ ...x, no: String(i + 1).padStart(2, "0") }));

let state = {
  /* 발송 프로필도 담당자처럼 **거래처별**이다(2026-09-17 결정). 전역 목록이던 시절 관리자가 한빛과학
     주문에 다른 회사 명의를 고를 수 있었고, 포털에서 남의 거래처 프로필이 보였다. */
  profilesByClient: { [FIRST_CLIENT]: INITIAL_PROFILES.map((p) => ({ ...p })) },
  contactsByClient: seedContactsByClient(),
  favorites: new Set(),
  clients: INITIAL_CLIENTS.map((c) => ({ ...c })),
  clientPrices: {}, // { [clientId]: { [productKey]: number } } — per-client price overrides
  /* 거래명세서 '계산서 발급 동의' **수동** 기록 — { [clientId]: { "YYYY-MM": "YYYY-MM-DD HH:mm" } }.
     자동 동의(마감 13:00 경과)는 기록하지 않고 `agreementOf` 가 매번 파생한다 — 과거 달을 전부
     적어 두면 시드·신규 거래처마다 백필이 필요해진다. 관리자 정산 표도 같은 함수를 본다. */
  invoiceAgreed: {},
  /* B2B 주문의 **사용자 변경분만** — 시드(b2b-mock)는 매번 다시 만들고 그 위에 이것을 덧입힌다.
     { created: { [id]: 레코드 }, patched: { [시드 id]: 레코드 }, removed: [시드 id] }.
     주문 전체를 저장하지 않는 이유: 시드가 600건 가까이라 통째로 넣으면 저장 용량을 먹고, 시드 생성 규칙을
     고쳐도 이미 열어 본 브라우저에는 옛 시드가 남는다. 읽기·쓰기는 b2b-mock 이 한다(`orderOps`/`setOrderOps`). */
  orderOps: { created: {}, patched: {}, removed: [], lastNo: 0 },
  /* ── 정산 기록(서버 대역 · 2026-10-16 F2) — 모두 { [clientId]: { "YYYY-MM": … } } ──
     einvoice     : 계산서 발급 결과 **기록분만** { no, at, mode: "retry"|"manual" }. 동의(수동·자동)된 달은 동의 시각에
                    자동 발급된 것으로 util/settlement.js 가 **파생**한다(데모 규칙) — 기록하지 않는다.
     einvoiceFail : 자동 발급이 실패한 달 { detail }(바로빌 오류 예시) — 이 달만 AGREED(발급 전)에 머문다. 다시 시도·
                    직접 입력이 성공하면 einvoice 에 기록되고 실패 기록은 이력으로 남는다.
     payments     : 입금 확인 { at }. 0원 달은 입금 없이 닫히므로 여기 있어도 읽지 않는다(util 이 무시).
     holds        : 잠정 보류(10.4 Q19 고지 미도달 · Q20 정지 중 마감)의 데모 대역 — "NOTICE_UNDELIVERED"|"CLIENT_SUSPENDED".
                    그 달은 마감에 자동 동의하지 않는다(agreementOf 가 존중). 약관 보류는 거래처 약관 시각에서 파생한다.
     ⚠️ 저장값이 시드를 이긴다 — 시드는 저장소가 빈 브라우저(또는 이 칸이 없는 옛 저장본)에서만 보인다. */
  einvoice: {},
  einvoiceFail: {},
  payments: {},
  holds: {},
};

/* ── 정산 기록 시드 — DATA_NOW 상대(늘 같은 모양으로 보이게) ──────────────────
   ⚠️ 실제 회사·사람이 아니다(가상 거래처). 오류 문구도 예시다. */
const seedYm = (monthsAgo) => periodOf(new Date(DATA_NOW.getFullYear(), DATA_NOW.getMonth() - monthsAgo, 1));
/* 발급 실패 — 푸른누리협회(C004)의 지난달분: 동의(자동)는 됐지만 바로빌 발급이 실패해 AGREED 에 머문다. */
const seedEinvoiceFail = () => ({
  C004: { [seedYm(1)]: { detail: "[예시] 바로빌 오류 -10002 · 공급받는자 사업자번호 상태 조회 실패 — 다시 시도하거나 수기 발급 승인번호를 입력하세요" } },
});
/* 보류 — 둘 다 1~7일 그룹이라 지난달분 마감(발급월 10일)이 이미 지난 곳. (주)싱싱마켓은 마감 때 정지였고 지금은 풀렸다(활성). */
const seedHolds = () => ({
  C005: { [seedYm(1)]: "NOTICE_UNDELIVERED" },
  C009: { [seedYm(1)]: "CLIENT_SUSPENDED" },
});
/* 기한 초과 시연 — 한빛과학(주)(C001)의 두 달 전분은 입금 시드를 넣지 않는다(정산기한 다음 날 10:00 이 지나 OVERDUE). */
const NO_PAY_SEED = { C001: [2] };
/** 입금 시드 — 예전 화면 모습('두 달 이전이고 동의된 달은 입금됨')을 유지한다. 입금일은 정산기한 3일 전 14:00
 *  (계산서보다 앞서지 않게 동의 시각 + 2시간 이후). 발급 실패·보류 달은 계산서가 없어 넣지 않는다. */
function seedPayments(clients, holds, fails, agreed) {
  const out = {};
  clients.forEach((c) => {
    const termsAt = c.termsFirstAgreedAt || c.termsAgreedAt || null;
    for (let m = 2; m <= 5; m++) {
      const ym = seedYm(m);
      if ((NO_PAY_SEED[c.id] || []).includes(m) || ((fails[c.id] || {})[ym])) continue;
      const st = agreementState({
        period: ym, invoiceDay: invoiceDayFor(c, ym), manualAt: (agreed[c.id] || {})[ym] || null,
        termsAt, hold: (holds[c.id] || {})[ym] || null, now: DATA_NOW,
      });
      if (!st.mode) continue;
      const due = st.dueDate;
      const cand = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 3, 14, 0);
      const floor = new Date(st.at.getTime() + 2 * 3600e3);
      const at = cand > floor ? cand : floor;
      if (at > DATA_NOW) continue;
      (out[c.id] = out[c.id] || {})[ym] = { at: fmtAt(at) };
    }
  });
  return out;
}
state.einvoiceFail = seedEinvoiceFail();
state.holds = seedHolds();
state.payments = seedPayments(state.clients, state.holds, state.einvoiceFail, state.invoiceAgreed);

/** 계산서 승인번호 예시 꼴 — `YYYYMMDD-8자리-8자리`(명세 5.4 · 6.6 예시. ⚠ 미확정 M62 — 바로빌 레퍼런스로 확정한다). */
export const EINVOICE_NO_RE = /^\d{8}-\d{8}-\d{8}$/;
/** 데모 승인번호 — (거래처, 귀속월)에서 결정적으로 만든다. 앞 8자리는 발급일. 실서비스는 바로빌 응답을 가공하지 않고 저장. */
export function einvoiceNoFor(clientId, ym, at) {
  const d = at instanceof Date ? at : parseAt(at) || new Date(0);
  let h = 2166136261;
  for (const ch of `${clientId}|${ym}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const a = String(41000000 + (h % 1000000)).padStart(8, "0");
  const b = String(Math.imul(h, 2654435761) >>> 0).padStart(8, "0").slice(-8);
  return `${fmtAt(d).slice(0, 10).replace(/-/g, "")}-${a}-${b}`;
}

/* 저장본의 { [clientId]: { [ym]: … } } 모양만 받는다 — 깨진 조각은 버린다(다른 상태까지 버리지 않게). */
function hydrateByClient(v, okVal) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out = {};
  Object.keys(v).forEach((cid) => {
    const m = v[cid];
    if (!m || typeof m !== "object" || Array.isArray(m)) return;
    Object.keys(m).forEach((ym) => {
      if (/^\d{4}-\d{2}$/.test(ym) && okVal(m[ym])) (out[cid] = out[cid] || {})[ym] = m[ym];
    });
  });
  return out;
}
const okAt = (x) => !!x && typeof x === "object" && !!parseAt(x.at);

/* 저장본의 orderOps 를 모양 그대로 받아들인다 — 깨진 조각은 빈 값으로(다른 상태까지 버리지 않게). */
function hydrateOrderOps(v) {
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  if (!v || typeof v !== "object") return { created: {}, patched: {}, removed: [], lastNo: 0 };
  return {
    created: obj(v.created),
    patched: obj(v.patched),
    removed: Array.isArray(v.removed) ? v.removed.filter((x) => typeof x === "string") : [],
    lastNo: Number.isFinite(v.lastNo) ? v.lastNo : 0, // 마지막으로 내준 새 주문번호(숫자) — 지운 새 주문의 번호를 다시 쓰지 않게
  };
}

/* 저장에 성공했는지 돌려준다 — 실패를 아는 쪽은 `setOrderOps` 하나다(아래). 다른 쓰기는 예전처럼 메모리로 계속 돈다. */
function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        profilesByClient: state.profilesByClient,
        contactsByClient: state.contactsByClient,
        favorites: [...state.favorites], // Set → array
        clients: state.clients,
        clientPrices: state.clientPrices,
        invoiceAgreed: state.invoiceAgreed,
        orderOps: state.orderOps,
        einvoice: state.einvoice,
        einvoiceFail: state.einvoiceFail,
        payments: state.payments,
        holds: state.holds,
      })
    );
    return true;
  } catch {
    /* storage full / disabled — keep running from memory */
    return false;
  }
}

function hydrate() {
  RETIRED_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch { /* storage 비활성 */ } });
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state = {
      profilesByClient: hydrateProfilesByClient(data),
      contactsByClient: hydrateContacts(data),
      favorites: new Set(Array.isArray(data.favorites) ? data.favorites : []),
      // 저장된 레코드에 없는 신규 시드 필드(invoiceDay 등)만 백필한다.
      // 편집값이 항상 이기고, 삭제한 거래처는 부활시키지 않는다(저장 목록만 순회).
      clients: Array.isArray(data.clients) ? data.clients.map((c) => ({ ...(SEED_BY_ID.get(c.id) || {}), ...c })) : state.clients,
      clientPrices: data.clientPrices && typeof data.clientPrices === "object" ? data.clientPrices : state.clientPrices,
      invoiceAgreed: data.invoiceAgreed && typeof data.invoiceAgreed === "object" ? data.invoiceAgreed : state.invoiceAgreed,
      orderOps: hydrateOrderOps(data.orderOps),
      /* 정산 기록 — 칸이 없는 옛 저장본이면 시드(F2 이전에 열어 본 브라우저도 예시 달이 보이게) */
      einvoice: hydrateByClient(data.einvoice, (x) => okAt(x) && typeof x.no === "string") || {},
      einvoiceFail: hydrateByClient(data.einvoiceFail, (x) => !!x && typeof x === "object") || seedEinvoiceFail(),
      holds: hydrateByClient(data.holds, (x) => HOLD_CODES.includes(x)) || seedHolds(),
      payments: null,
    };
    state.payments = hydrateByClient(data.payments, okAt)
      || seedPayments(state.clients, state.holds, state.einvoiceFail, state.invoiceAgreed);
    // 불변식 보정: 버킷마다 정산담당이 없으면 첫 담당자로 지정
    const fixed = {};
    Object.keys(state.contactsByClient).forEach((k) => { fixed[k] = fixBilling(state.contactsByClient[k]); });
    state.contactsByClient = fixed;
  } catch {
    /* corrupt JSON → keep defaults (self-heal) */
  }
}

/* 구 저장본(id 없음)에 안정 id 를 그 자리에서 발급한다 — KEY 를 올리지 않고
   이관하는 이 레포의 방식(hydrateContacts·fixBilling 과 같은 수법). */
function hydrateProfiles(arr) {
  return reindexNo((arr || []).map((p) => ({ ...p, id: p.id || newProfileId() })));
}
/* 구 저장본(전역 `profiles` 배열)은 첫 거래처로 이관한다 — contactsByClient 이관과 같은 수법, KEY 는 올리지 않는다. */
function hydrateProfilesByClient(data) {
  if (data.profilesByClient && typeof data.profilesByClient === "object") {
    const out = {};
    Object.keys(data.profilesByClient).forEach((k) => { out[k] = hydrateProfiles(data.profilesByClient[k]); });
    return out;
  }
  if (Array.isArray(data.profiles)) return { [FIRST_CLIENT]: hydrateProfiles(data.profiles) };
  return state.profilesByClient;
}

/* 버킷 하나의 불변식 — 비어 있지 않으면 정산담당이 정확히 1명. */
function fixBilling(arr) {
  const a = (arr || []).map((c) => ({ isBilling: false, ...c, id: c.id || newContactId() }));
  if (a.length && !a.some((c) => c.isBilling)) a[0] = { ...a[0], isBilling: true };
  return a;
}

/* 구 전역 contacts → 거래처별 contactsByClient 이관(KEY 는 올리지 않는다). 옛 키가 남아 있으면 첫 거래처 버킷으로 옮긴다 —
   데모에서 포털에 로그인하는 거래처가 currentClient() 폴백상 첫 거래처와 같다. */
function hydrateContacts(data) {
  if (data.contactsByClient && typeof data.contactsByClient === "object") {
    const out = {};
    Object.keys(data.contactsByClient).forEach((k) => { out[k] = fixBilling(data.contactsByClient[k]); });
    return out;
  }
  if (Array.isArray(data.contacts)) return { [FIRST_CLIENT]: fixBilling(data.contacts) };
  return state.contactsByClient;
}

/** 지금 화면의 거래처 id — 세션에 없으면(관리자·딥링크) 첫 거래처. util/client.js 폴백과 같다. */
function scopeId(clientId) {
  if (clientId) return clientId;
  const id = getClientId();
  return (state.clients.find((c) => c.id === id) || state.clients[0] || {}).id || FIRST_CLIENT;
}

function emit() {
  subs.forEach((fn) => fn(state));
}

function resolve(next, current) {
  return typeof next === "function" ? next(current) : next;
}

/* 발급일이 바뀌면 **언제부터 적용되는지**를 레코드에 남긴다 — 다음 달 발급분(= 변경한 달의 귀속분)부터다.
   남기지 않으면 과거 귀속월의 발행일·마감·작성일자가 **현재** 발급일로 통째로 다시 계산돼, 이미 동의·
   발급이 끝난 달의 계산서 작성일자가 소급해 바뀌고 자동 동의분이 '동의대기' 로 되돌아간다(실측).
   `updateClient` 한 곳에 두는 이유: 거래처 저장 경로가 8곳인데 전부 이 함수를 지난다. */
function withInvoiceDayLog(prevRec, nextRec, now = new Date()) {
  const before = String(prevRec.invoiceDay ?? "");
  const after = String(nextRec.invoiceDay ?? "");
  if (!after || before === after) return nextRec;
  const from = invoiceDayEffectiveFrom(now);
  const log = Array.isArray(prevRec.invoiceDayLog) ? [...prevRec.invoiceDayLog] : [];
  const last = log[log.length - 1];
  /* 같은 달에 두 번 바꾸면 항목을 덮어쓴다 — 적용 시작 귀속월이 같아 줄이 둘일 이유가 없다.
     원래 값으로 되돌렸으면 이력 자체를 지운다(변경이 없던 것과 같아야 한다). */
  if (last && last.from === from) {
    if (String(last.prev) === after) log.pop();
    else log[log.length - 1] = { ...last, day: after, at: fmtAt(now) };
  } else {
    log.push({ from, day: after, prev: before || String(invoiceDayOf(prevRec)), at: fmtAt(now) });
  }
  return { ...nextRec, invoiceDayLog: log };
}

export const store = {
  hydrate,
  get: () => state,
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  /** 한 거래처의 발송 프로필(항상 배열). 표시 순번 `no` 는 여기서 파생한다.
   *  ⚠️ `state.profilesByClient` 를 직접 읽지 말 것 — 거래처 스코프(scopeId)가 여기에 있다. */
  profilesOf(clientId) {
    return (state.profilesByClient[scopeId(clientId)] || []).map((p, i) => ({ ...p, no: String(i + 1).padStart(2, "0") }));
  },
  /** 한 거래처의 발송 프로필 목록을 통째로 교체. */
  setProfilesOf(clientId, next) {
    const k = scopeId(clientId);
    const arr = reindexNo(resolve(next, state.profilesByClient[k] || []));
    state = { ...state, profilesByClient: { ...state.profilesByClient, [k]: arr } };
    persist();
    emit();
  },
  /* ── 로그인 거래처 기준 축약형 — 포털 화면이 쓴다 ── */
  setProfiles(next) { this.setProfilesOf(null, next); },
  /** 한 거래처의 담당자 목록(항상 배열). 표시 순번 `no` 는 여기서 파생한다. */
  contactsOf(clientId) {
    return (state.contactsByClient[scopeId(clientId)] || []).map((c, i) => ({ ...c, no: String(i + 1).padStart(2, "0") }));
  },
  /** 한 거래처의 담당자 목록을 통째로 교체. 정산담당 1명 불변식을 여기서 지킨다. */
  setContactsOf(clientId, next) {
    const k = scopeId(clientId);
    const arr = fixBilling(resolve(next, state.contactsByClient[k] || []));
    state = { ...state, contactsByClient: { ...state.contactsByClient, [k]: arr } };
    persist();
    emit();
  },
  /** 정산·회계 담당자 지정(거래명세서·입금 알림 수신). 대상은 **id** 로 지목한다. */
  setBillingContactOf(clientId, id) {
    this.setContactsOf(clientId, (prev) => prev.map((c) => ({ ...c, isBilling: c.id === id })));
  },
  /** 그 거래처의 정산·회계 담당자, 없으면 null. */
  getBillingContactOf(clientId) {
    return this.contactsOf(clientId).find((c) => c.isBilling) || null;
  },
  /* ── 로그인 거래처 기준 축약형 — 포털 화면이 쓴다 ── */
  setContacts(next) { this.setContactsOf(null, next); },
  getBillingContact() { return this.getBillingContactOf(null); },

  /* ── 거래명세서 계산서 발급 동의 ──────────────────────────
     **거래처별로 가른다** — 담당자·명세서 토큰과 같은 규칙이다(계정을 바꾸면 남의
     동의 기록이 보이면 안 된다). 되돌릴 수 없는 기록이라 시각까지 남긴다. */
  /** 그 거래처·귀속월의 동의 상태(settlement-rules.js `agreementState`) — 포털 버튼 활성 ·
   *  아래 `agreeInvoice` 의 쓰기 가드 · 관리자 정산 표가 **전부 이 한 곳**을 본다.
   *  수동 기록은 읽을 때 항상 이기고, 마감(13:00)이 지나면 자동 동의로 파생된다. */
  agreementOf(clientId, ym, now = new Date()) {
    const k = scopeId(clientId);
    const client = state.clients.find((c) => c.id === k);
    /* **그 귀속월에 유효했던** 발급일으로 판정한다 — 발급일을 바꿔도 이미 지난 달의 동의·작성일자는 그대로다. */
    /* 약관에 **처음** 동의한 시각으로 자동 동의를 가른다(2026-09-29 법무 답 — 약관 동의 전에는 자동 동의 불가).
       재동의 시각(termsAgreedAt)을 쓰면 약관 버전을 올리는 순간 이미 자동 동의된 달이 '동의대기'로 되돌아간다
       (발급일 변경 때 겪은 소급 결함과 같은 모양). termsFirstAgreedAt 이 없는 옛 저장본은 termsAgreedAt 을 쓴다. */
    const termsAt = client ? client.termsFirstAgreedAt || client.termsAgreedAt || null : null;
    /* 잠정 보류(Q19·Q20)도 같은 자리에서 존중한다 — 그 달은 마감에 자동 동의하지 않는다. */
    const hold = (state.holds[k] || {})[ym] || null;
    return agreementState({ period: ym, invoiceDay: invoiceDayFor(client, ym), manualAt: (state.invoiceAgreed[k] || {})[ym] || null, termsAt, hold, now });
  },
  /** 수동 동의 기록. 이미 동의했으면 **덮어쓰지 않는다**(최초 시각이 기록이다).
   *  발행 전이거나 마감이 지났으면(자동 동의) **기록하지 않고 null** — 화면과 같은 함수·같은
   *  시계로 판정하므로 버튼이 열려 있던 순간과 어긋날 수 없다.
   *
   *  `opts`(선택) — `{ amount, currentAmount }`: 거래처 화면이 **보여 준 금액**과 지금 금액(명세 3.4 '마감 전 수정' 5 ·
   *  6.6 agree). 둘 다 숫자이고 다르면 기록하지 않고 `{ error: "SETTLEMENT_AMOUNT_CHANGED", amount: 지금 금액 }`.
   *  store 는 금액을 모른다(주문은 b2b-mock 이 store 를 import 한다) — 지금 금액은 호출부(util/settlement.js
   *  `agreeSettlement`)가 같은 소스에서 계산해 넘긴다. 지금 금액이 0 이면 0원 달이라 동의를 받지 않는다(null).
   *  옛 호출 모양 `agreeInvoice(clientId, ym, now)` 도 받는다. */
  agreeInvoice(clientId, ym, opts = {}, now = new Date()) {
    if (opts instanceof Date) { now = opts; opts = {}; }
    const k = scopeId(clientId);
    const cur = state.invoiceAgreed[k] || {};
    if (cur[ym]) return cur[ym];
    if (!this.agreementOf(clientId, ym, now).open) return null;
    const { amount, currentAmount } = opts || {};
    if (currentAmount === 0) return null;
    if (Number.isFinite(amount) && Number.isFinite(currentAmount) && amount !== currentAmount) {
      return { error: "SETTLEMENT_AMOUNT_CHANGED", amount: currentAmount };
    }
    const at = fmtAt(now);
    state = { ...state, invoiceAgreed: { ...state.invoiceAgreed, [k]: { ...cur, [ym]: at } } };
    persist();
    emit();
    return at;
  },
  /* ── 정산 기록 (서버 대역) — 상태 판정은 util/settlement.js `settlementOf` 가 한다 ──────
     아래 두 쓰기는 **store 가 아는 사실만으로** 가드한다(동의 여부 · 발급 실패 기록 · 기존 기록). 금액(0원 달)은 store 가
     모르므로 util 의 `issueEinvoiceFor`·`confirmPaymentFor` 가 settlementOf 로 한 번 더 거른다 — 화면은 그쪽을 부를 것. */
  einvoiceOf(clientId, ym) { return (state.einvoice[scopeId(clientId)] || {})[ym] || null; },
  einvoiceFailOf(clientId, ym) { return (state.einvoiceFail[scopeId(clientId)] || {})[ym] || null; },
  paymentOf(clientId, ym) { return (state.payments[scopeId(clientId)] || {})[ym] || null; },
  holdOf(clientId, ym) { return (state.holds[scopeId(clientId)] || {})[ym] || null; },
  /** 계산서 발급 재시도·수기 입력(명세 6.6 `POST …/einvoice`). **AGREED(동의완료 · 발급 전)에서만** 받는다 —
   *  동의 전이거나, 이미 발급됐거나(기록 또는 자동 발급 파생 = 실패 기록이 없는 달) 이면 null.
   *  - `{ mode: "retry" }` — 데모에서는 늘 성공한다(승인번호는 결정적으로 만든다 — 실서비스는 바로빌 응답).
   *  - `{ mode: "manual", no, at }` — 승인번호(예시 꼴 `YYYYMMDD-8자리-8자리` · ⚠ 미확정 M62)와 발급 시각(미래 불가) 필수.
   *    형식이 틀리면 `{ error: "EINVOICE_NO_INVALID" }`, 시각이 틀리거나 미래면 `{ error: "EINVOICE_AT_INVALID" }`.
   *  성공하면 `{ no, at, mode }`. */
  issueEinvoice(clientId, ym, { mode, no, at } = {}, now = new Date()) {
    const k = scopeId(clientId);
    if (!this.agreementOf(k, ym, now).mode) return null;
    if (this.einvoiceOf(k, ym) || !this.einvoiceFailOf(k, ym)) return null;
    let rec;
    if (mode === "retry") {
      rec = { no: einvoiceNoFor(k, ym, now), at: fmtAt(now), mode: "retry" };
    } else if (mode === "manual") {
      const n = String(no || "").trim();
      if (!EINVOICE_NO_RE.test(n)) return { error: "EINVOICE_NO_INVALID" };
      const d = at instanceof Date ? at : parseAt(at);
      if (!d || d > now) return { error: "EINVOICE_AT_INVALID" };
      rec = { no: n, at: fmtAt(d), mode: "manual" };
    } else return null;
    state = { ...state, einvoice: { ...state.einvoice, [k]: { ...(state.einvoice[k] || {}), [ym]: rec } } };
    persist();
    emit();
    return rec;
  },
  /** 입금 확인(명세 6.6 `POST …/payment` — 전액만). 계산서가 나간 달(ISSUED·OVERDUE)만 받는다 — 동의 전 · 발급 실패로
   *  계산서가 없는 달 · 이미 입금된 달이면 null. `at` 생략 시 지금. 성공하면 `{ at }`. */
  confirmPayment(clientId, ym, at, now = new Date()) {
    const k = scopeId(clientId);
    if (this.paymentOf(k, ym)) return null;
    if (!this.agreementOf(k, ym, now).mode) return null;
    if (!this.einvoiceOf(k, ym) && this.einvoiceFailOf(k, ym)) return null;
    const d = at instanceof Date ? at : at ? parseAt(at) : now;
    if (!d || d > now) return null;
    const rec = { at: fmtAt(d) };
    state = { ...state, payments: { ...state.payments, [k]: { ...(state.payments[k] || {}), [ym]: rec } } };
    persist();
    emit();
    return rec;
  },
  /* ── B2B 주문 변경분 (b2b-mock 전용) ─────────────────────
     ⚠️ 페이지가 이걸 직접 부르지 말 것 — 주문 쓰기는 b2b-mock 의 저장 함수(b2bUpsert·b2bSetStatus·…)를
        지나야 캐시와 기록이 함께 바뀐다. 여기는 그 함수들이 쓰는 저장 칸일 뿐이다. */
  orderOps() { return state.orderOps; },
  /** 저장에 성공하면 true. **실패하면 변경분을 되돌리고 false** — 용량을 넘긴 변경분이 메모리에 남아 있으면
   *  그 뒤의 **모든** 저장(다른 주문·담당자·거래처·동의 기록)이 같이 실패한다. 예전엔 빈 catch 가 삼켜
   *  '저장했습니다' 토스트가 뜬 채 새로고침에 전부 사라졌다(2026-10-16 실측 — 원본 HEIC 사진 4MB). */
  setOrderOps(next) {
    const prev = state.orderOps;
    state = { ...state, orderOps: hydrateOrderOps(resolve(next, prev)) };
    if (persist()) { emit(); return true; }
    state = { ...state, orderOps: prev };
    persist(); // 되돌린 상태로 다시 — 실패해도 이전 저장본은 그대로다
    return false;
  },
  setFavorites(next) {
    state = { ...state, favorites: resolve(next, state.favorites) };
    persist();
    emit();
  },
  toggleFavorite(key) {
    const f = new Set(state.favorites);
    f.has(key) ? f.delete(key) : f.add(key);
    state = { ...state, favorites: f };
    persist();
    emit();
  },
  // ── 거래처 (admin) ──────────────────────────────────────
  setClients(next) {
    state = { ...state, clients: resolve(next, state.clients) };
    persist();
    emit();
  },
  addClient(c) {
    this.setClients((prev) => [...prev, c]);
  },
  /** 접속 아이디가 이미 쓰이는가. 로그인은 **아이디 하나**로 거래처를 가린다(2026-09-25 결정 · 명세 5.2 UNIQUE) —
   *  같은 아이디가 둘이면 로그인이 먼저 찾은 레코드로 들어가고 나머지는 영영 못 들어간다.
   *  `exceptClientId` 는 자기 자신을 빼고 볼 때. 관리자 아이디는 예약어로 친다. */
  accountIdTaken(accountId, exceptClientId) {
    const id = String(accountId ?? "").trim();
    if (!id) return false;
    return isReservedAccountId(id) || state.clients.some((c) => c.id !== exceptClientId && c.accountId === id);
  },
  updateClient(c) {
    this.setClients((prev) => prev.map((x) => (x.id === c.id ? withInvoiceDayLog(x, c) : x)));
  },
  removeClient(id) {
    this.setClients((prev) => prev.filter((x) => x.id !== id));
    if (state.clientPrices[id]) {
      const cp = { ...state.clientPrices };
      delete cp[id];
      state = { ...state, clientPrices: cp };
      persist();
      emit();
    }
  },
  // ── 기업별 상품단가 (admin) ─────────────────────────────
  setClientPrices(clientId, map) {
    state = { ...state, clientPrices: { ...state.clientPrices, [clientId]: { ...map } } };
    persist();
    emit();
  },
  clientPriceFor(clientId, key) {
    return state.clientPrices?.[clientId]?.[key];
  },
  /** 적용 단가(원) — 거래처 계약 단가가 있으면 그것, 없으면 카탈로그 정가.
   *  `product` 는 카탈로그 레코드 또는 상품명 문자열.
   *
   *  ⚠️ **이 규칙을 복제하지 말 것.** 포털 상품안내·포털 주문 퍼널·관리자 주문서가
   *  각자 같은 로직을 들고 있었고, 그 중 주문 퍼널만 빠져 있어 같은 거래처가
   *  상품안내에서는 계약가를, 결제 화면에서는 정가를 보고 있었다. */
  appliedPrice(clientId, product) {
    const p = typeof product === "string"
      ? ALL_PRODUCTS.find((x) => x.product === product)
      : product;
    if (!p) return 0;
    return this.contractPrice(clientId, p) ?? priceNum(p.price);
  },
  /** 계약 단가만 — 등록돼 있지 않으면 `null`(정가로 떨어지기 **전**의 사실).
   *  주문서가 "계약단가 적용 / 계약단가와 다름 / 미등록"을 구분해야 해서 필요하다.
   *  판정 규칙을 호출부에 복제하지 말 것 — appliedPrice 도 이 함수를 쓴다. */
  contractPrice(clientId, product) {
    const p = typeof product === "string"
      ? ALL_PRODUCTS.find((x) => x.product === product)
      : product;
    if (!p) return null;
    const c = state.clientPrices?.[clientId]?.[productKey(p)];
    return typeof c === "number" && c > 0 ? c : null;
  },
  /** 이 거래처에 **정가와 다른** 단가가 걸린 상품 수(등록 여부 판정의 단일 소스). */
  contractCount(clientId) {
    return ALL_PRODUCTS.filter((p) => {
      const c = this.contractPrice(clientId, p);
      return c != null && c !== priceNum(p.price);
    }).length;
  },
};
