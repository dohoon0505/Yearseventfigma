/* ============================================================
   store.js — global state (profiles / contacts / favorites)
   pub/sub + localStorage persistence. Ports AppContext.tsx.
   ============================================================ */
import { INITIAL_CLIENTS, SEED_BILLING, DATA_NOW, WITHDRAWN } from "./data/admin-mock.js";
/* 동의 상태(발행·마감·자동 동의·작성일자)는 규칙 모듈 한 곳에서 파생한다 — import 0 이라 순환이 없다. */
import { agreementState, noticeState, fmtAt, parseAt, periodOf, invoiceDayOf, invoiceDayFor, invoiceDayEffectiveFrom } from "./data/settlement-rules.js";
/* ⚠️ session.js 는 store 를 import 하지 않는다 — 순환이 아니다.
   util/client.js 는 store 를 import 하므로 여기서 쓰면 순환이 된다. */
import { getClientId, isReservedAccountId } from "./session.js";
/* 시드 기록(입금 확인)의 처리자 — staff-mock 은 import 0 이라 순환이 없다. */
import { SEED_ACTOR } from "./data/staff-mock.js";
/* 정산담당을 자동으로 올릴 때 연락처가 맞는 사람을 먼저 고른다(fixBilling — 담당자 연락처 기준 contactPhoneOk · 2026-10-19 결정 ⓔ)
   — phone.js 는 import 0 이다. */
import { contactPhoneOk } from "./util/phone.js";

/** @typedef {{category:string,product:string,price:string,description:string,icon:string}} Product */
/** @typedef {{no:string,name:string,role:string,phone:string,greeting:string}} Profile */
/** @typedef {{id:string,no?:string,name:string,role:string,phone:string,message:string,isBilling:boolean}} Contact */
/* ⚠️ Contact 의 키는 `id` 다. `no` 는 화면에 보이는 순번일 뿐이라 쓰기마다 다시 매겨진다 —
   삭제하면 뒤 번호가 전부 당겨지므로 `no` 로 대상을 지목하면 엉뚱한 사람이 바뀐다. */
/** @typedef {{id:string,accountId:string,companyName:string,bizNumber:string,ceoName:string,managerName:string,department:string,contact:string,email:string,address:string,status:string,joinDate:string,invoiceDay:string,clientNote:string,channel?:string,password?:string,withdrawnAt?:string}} Client */
/* status 는 '활성' · '승인대기' · '반려' · '탈퇴' 넷(2026-10-22 운영자 결정 A — '정지' 는 없다 · admin-mock CLIENT_STATUSES).
   withdrawnAt 은 탈퇴한 시각 "YYYY-MM-DD HH:mm"(탈퇴 레코드에만 · updateClient 가 비어 있으면 채운다). */
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
  /* pf3~pf5 는 부서별 단체 명의다. 예전엔 셋 다 '임직원 · 일동 · 같은 번호 · 같은 고정문구' 라 줄 버튼 이름이 모두 '임직원 삭제'
     로 읽혀(초점이 다음 줄로 옮겨 가도 화면 읽기 프로그램으로는 어느 줄인지 몰랐다) 포털 보내는분 간편선택이 고정문구로
     프로필을 되찾을 때(order.js `senderTextOf`) 늘 첫 줄을 집었다 — 이름·번호·고정문구를 서로 다르게 둔다(가상 값 · 010-0000-01NN). */
  { id: "pf3", no: "03", name: "영업본부", role: "임직원 일동", phone: "010-0000-0151", greeting: "(주)올해의경조사 영업본부 임직원 일동" },
  { id: "pf4", no: "04", name: "연구소",   role: "임직원 일동", phone: "010-0000-0152", greeting: "(주)올해의경조사 연구소 임직원 일동" },
  { id: "pf5", no: "05", name: "총무팀",   role: "임직원 일동", phone: "010-0000-0153", greeting: "(주)올해의경조사 총무팀 임직원 일동" },
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
/* 두 순번은 새로고침마다 100 부터 다시 센다 — 저장해 둔 id 가 있으면 그 최댓값 뒤로 올린다(hydrate). 안 그러면 새로고침 뒤
   담당자를 등록할 때 이미 있는 `ct101` 이 다시 나와 같은 명단에 같은 id 가 둘 생겼다(실측) — 수정·삭제가 두 줄을 함께 건드린다.
   ⚠️ **저장된 원본(JSON)에서 먼저 잰다** — hydrate 는 id 없는 옛 줄에 그 자리에서 새 id 를 매기는데(fixBilling · hydrateProfiles),
   다 읽은 뒤에 재면 그 새 id(`ct101`…)가 아직 읽지 않은 저장 id 와 겹칠 수 있었다(2026-10-19 검토 12). 옛 모양(전역 contacts ·
   profiles 배열)도 함께 본다. */
function bumpSeqsFrom(data) {
  const listOf = (byClient, flat) => [
    ...(byClient && typeof byClient === "object" && !Array.isArray(byClient) ? Object.values(byClient).filter(Array.isArray).flat() : []),
    ...(Array.isArray(flat) ? flat : []),
  ];
  const maxOf = (arr, re) => arr.reduce((m, x) => {
    const n = x && re.exec(String(x.id || ""));
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  ctSeq = Math.max(ctSeq, maxOf(listOf(data.contactsByClient, data.contacts), /^ct(\d+)$/));
  pfSeq = Math.max(pfSeq, maxOf(listOf(data.profilesByClient, data.profiles), /^pf(\d+)$/));
}

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
     einvoice     : 계산서 발급 결과 **기록분만** { no, at, mode: "retry"|"manual", recordedAt?(직접 입력 — 기록한 시각) }. 동의(수동·자동)된 달은 동의 시각에
                    자동 발급된 것으로 util/settlement.js 가 **파생**한다(데모 규칙) — 기록하지 않는다.
     einvoiceFail : 자동 발급이 실패한 달 { detail }(바로빌 오류 예시) — 이 달만 AGREED(발급 전)에 머문다. 다시 시도·
                    직접 입력이 성공하면 einvoice 에 기록되고 실패 기록은 이력으로 남는다.
     payments     : 입금 확인 { at }. 0원 달은 입금 없이 닫히므로 여기 있어도 읽지 않는다(util 이 무시).
     noticeFails  : **마감 하루 전 안내(T4) 발송 실패 기록** — 알림톡·대체 문자 모두 닿지 않은 달 "UNDELIVERED"(noticeState t4.why 와
                    같은 낱말). 발송 로그(명세 5.10)의 데모 대역이고 **보류가 아니다** — 그 달도 마감에 평소대로 자동 동의된다
                    (2026-10-23 운영자 결정 D1 — 예전 잠정 '고지 미도달 보류'(Q19)와 마감 당일 다시 보내기는 걷어 냈다 · 실패 기록만).
                    옛 저장본의 키 `holds` 는 hydrate 가 옮긴다 — "NOTICE_UNDELIVERED" → "UNDELIVERED", "CLIENT_SUSPENDED"(정지 중 마감 ·
                    2026-10-22 결정 A 로 없앴다)는 버린다. 자동 동의를 막는 약관 동의 전은 거래처 약관 시각에서 파생한다.
     ⚠️ 저장값이 시드를 이긴다 — 시드는 저장소가 빈 브라우저(또는 이 칸이 없는 옛 저장본)에서만 보인다.
     `by`(einvoice · payments — 2026-10-16 DATA.md 1.4): 처리자 `{ type, id, name, dept }`(util/actor.js currentActor).
                    없는 기록(옛 저장본)은 화면이 '처리자 기록 없음' 으로 둔다. 시드 입금은 staff-mock SEED_ACTOR. */
  einvoice: {},
  einvoiceFail: {},
  payments: {},
  noticeFails: {},
  /* 정산 금액 변경 기록(원장) — **명세서가 나간 달**의 금액에 대한 주문 한 건의 기여가 바뀔 때마다 한 줄
     (2026-10-16 DATA.md 1.1~1.6 · 명세 8.4 '정산 금액 변경'). { [clientId]: { "YYYY-MM": Line[] } }, 시간순(오래된 것이 [0]).
       Line = { id, at("YYYY-MM-DD HH:mm"), by{type,id,name,dept}, orderId, orderNo,
                cause: "amount"|"product"|"cancel"|"remove"|"feeRemove"|"create"|"move"
                       |"complete"(배송완료 처리 — 명세서가 나간 뒤 배송완료가 된 주문을 아직 고칠 수 있는 그 달에 더함 · 2026-10-23 운영자 결정 D3),
                before, after(그 주문이 그 달에 보태던 금액 전 → 후 — 그 달 합계가 아니다), reason(사유 0~200자 · "" = 사유 없음),
                pair?("YYYY-MM" — 두 달이 함께 바뀐 저장의 상대 달), move?{ from, to }(배송일시 전후) }
     ⚠️ **사용자 변경분만** 담는다. 시드 줄은 b2b-mock 이 매번 만든다(b2bSeedAmountChanges — 저장하지 않는다).
     ⚠️ 그 달 금액(전 → 후)·발급 때 금액은 저장하지 않는다 — util/settlement 가 지금 금액에서 누적으로 파생한다
        (손으로 쓴 시드 주문이 달마다 움직여서, 절대 금액을 저장하면 그 숫자와 지금 집계가 어긋난다).
     쓰기는 b2b-mock 이 주문 변경분과 **한 번에**(setOrderOps 의 extra.amountLines) — 저장이 실패하면 둘 다 되돌린다. */
  amountLog: {},
};

/* ── 정산 기록 시드 — DATA_NOW 상대(늘 같은 모양으로 보이게) ──────────────────
   ⚠️ 실제 회사·사람이 아니다(가상 거래처). 오류 문구도 예시다. */
const seedYm = (monthsAgo) => periodOf(new Date(DATA_NOW.getFullYear(), DATA_NOW.getMonth() - monthsAgo, 1));
/* 발급 실패 — 푸른누리협회(C004)의 지난달분: 동의(자동)는 됐지만 바로빌 발급이 실패해 AGREED 에 머문다. */
const seedEinvoiceFail = () => ({
  C004: { [seedYm(1)]: { detail: "[예시] 바로빌 오류 -10002 · 공급받는자 사업자번호 상태 조회 실패 — 다시 시도하거나 수기 발급 승인번호를 입력하세요" } },
});
/* T4 발송 실패 — (주)바다향(C005)의 지난달분: 마감 하루 전 안내(T4)가 알림톡·대체 문자 모두 닿지 않았다. 보류가 아니다 — 그 달은
   마감(1~7일 그룹 — 발급월 10일 13:00 · 이미 지났다)에 평소대로 자동 동의됐고, 관리자 진행 기록이 닿지 않은 사실을 글자로 적는다
   (2026-10-23 운영자 결정 D1). 예전 셋째 시드 '정지 중 마감'((주)싱싱마켓 C009)은 2026-10-22 운영자 결정 A 로 지웠다. */
const seedNoticeFails = () => ({
  C005: { [seedYm(1)]: "UNDELIVERED" },
});
/** 정산·회계 담당자에게 알림이 닿을 수 있는가 — 담당자가 있고 연락처가 있다(util/settlement `noRecipientOf` 의 반대 · 같은 판정). */
const reachOf = (contactsByClient, clientId) => {
  const b = ((contactsByClient || {})[clientId] || []).find((c) => c.isBilling);
  return !!b && !!String(b.phone || "").trim();
};
/** 그 (거래처, 귀속월)의 정산 안내 도달(settlement-rules `noticeState`) — 지금 상태(st)의 기록으로. */
function noticeFor(client, ym, st) {
  return noticeState({
    period: ym, invoiceDay: invoiceDayFor(client, ym),
    reach: reachOf(st.contactsByClient, client.id),
    undelivered: ((st.noticeFails || {})[client.id] || {})[ym] === "UNDELIVERED",
    manualAt: ((st.invoiceAgreed || {})[client.id] || {})[ym] || null,
  });
}
/* 기한 초과 시연 — 한빛과학(주)(C001)의 두 달 전분은 입금 시드를 넣지 않는다(정산기한 다음 날 10:00 이 지나 OVERDUE). */
const NO_PAY_SEED = { C001: [2] };
/** 입금 시드 — 예전 화면 모습('두 달 이전이고 동의된 달은 입금됨')을 유지한다. 입금일은 정산기한 3일 전 14:00
 *  (계산서보다 앞서지 않게 동의 시각 + 2시간 이후). 발급 실패·약관 동의 전 달은 계산서가 없어 넣지 않는다.
 *  2년 전 달까지 넣는다(2026-10-22 — 예전엔 5개월 전까지만이라 그보다 오래된 달이 영원히 '입금 전' 으로 남아, 관리자 정산회계
 *  6개월 창 밖이라 입금 확인도 못 하는 채 거의 모든 거래처의 탈퇴가 막혔고 포털 정산회계에도 옛 달이 '정산필요' 로 섰다). */
function seedPayments(clients, fails, agreed) {
  const out = {};
  clients.forEach((c) => {
    const termsAt = c.termsFirstAgreedAt || c.termsAgreedAt || null;
    const joinYm = String(c.joinDate || "").slice(0, 7); // 가입하기 전 달에는 입금이 없다
    for (let m = 2; m <= 24; m++) {
      const ym = seedYm(m);
      if (joinYm && ym < joinYm) continue;
      if ((NO_PAY_SEED[c.id] || []).includes(m) || ((fails[c.id] || {})[ym])) continue;
      const st = agreementState({
        period: ym, invoiceDay: invoiceDayFor(c, ym), manualAt: (agreed[c.id] || {})[ym] || null, termsAt, now: DATA_NOW,
      });
      if (!st.mode) continue;
      const due = st.dueDate;
      const cand = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 3, 14, 0);
      const floor = new Date(st.at.getTime() + 2 * 3600e3);
      const at = cand > floor ? cand : floor;
      if (at > DATA_NOW) continue;
      (out[c.id] = out[c.id] || {})[ym] = { at: fmtAt(at), by: { ...SEED_ACTOR } };
    }
  });
  return out;
}
state.einvoiceFail = seedEinvoiceFail();
state.noticeFails = seedNoticeFails();
state.payments = seedPayments(state.clients, state.einvoiceFail, state.invoiceAgreed);

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
/* T4 발송 실패 기록 — 지금 키 `noticeFails`("UNDELIVERED"), 없으면 옛 키 `holds`(2026-10-22 까지)를 옮긴다: "NOTICE_UNDELIVERED"(옛
   잠정 보류 코드)는 실패 기록 "UNDELIVERED" 로, "CLIENT_SUSPENDED"(정지 중 마감)는 버린다. 두 키 모두 없으면 null(→ 시드).
   옮긴 값은 다음 쓰기에 새 키로 저장되고 옛 키는 그때 사라진다(persist 가 저장본을 통째로 다시 쓴다). */
function hydrateNoticeFails(data) {
  const cur = hydrateByClient(data.noticeFails, (x) => x === "UNDELIVERED");
  if (cur) return cur;
  const old = hydrateByClient(data.holds, (x) => x === "NOTICE_UNDELIVERED");
  if (!old) return null;
  return Object.fromEntries(Object.entries(old).map(([cid, m]) => [cid, Object.fromEntries(Object.keys(m).map((ym) => [ym, "UNDELIVERED"]))]));
}

/* 정산 금액 변경 기록 — { [clientId]: { [ym]: Line[] } }. hydrateByClient 는 달 값 단위로 거르지만 여기는 **줄 단위**다:
   깨진 줄 하나 때문에 그 달 기록 전체를 버리면 '발급 때 금액' 파생이 통째로 틀어진다. 칸이 없는 옛 저장본은 {} —
   시드 줄은 저장하지 않으므로(b2b-mock 이 매번 만든다) 백필이 필요 없다. */
const okLine = (l) => !!l && typeof l === "object" && !!parseAt(l.at)
  && Number.isFinite(l.before) && Number.isFinite(l.after) && typeof l.orderNo === "string";
function hydrateLines(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out = {};
  Object.keys(v).forEach((cid) => {
    const m = v[cid];
    if (!m || typeof m !== "object" || Array.isArray(m)) return;
    Object.keys(m).forEach((ym) => {
      if (!/^\d{4}-\d{2}$/.test(ym) || !Array.isArray(m[ym])) return;
      const lines = m[ym].filter(okLine);
      if (lines.length) (out[cid] = out[cid] || {})[ym] = lines;
    });
  });
  return out;
}
/* b2b-mock 이 넘긴 줄 [{ clientId, ym, ...Line }] 을 기록에 덧붙인 새 객체(원본은 건드리지 않는다 — 되돌릴 수 있게). */
function appendLines(log, lines) {
  if (!Array.isArray(lines) || !lines.length) return log;
  const out = { ...log };
  lines.forEach(({ clientId, ym, ...line }) => {
    if (!clientId || !/^\d{4}-\d{2}$/.test(String(ym)) || !okLine(line)) return;
    const m = { ...(out[clientId] || {}) };
    m[ym] = [...(m[ym] || []), line];
    out[clientId] = m;
  });
  return out;
}
/** 저장 공간 부족(localStorage 용량)으로 기록하지 못했을 때 쓰기 함수들이 돌려주는 값 — 저장된 척하지 않는다. */
export const STORAGE_FULL = "STORAGE_FULL";

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

/* 저장에 성공했는지 돌려준다 — 실패를 아는 쪽은 `setOrderOps`(주문 + 정산 금액 변경 기록)와 정산 기록 세 쓰기
   (`agreeInvoice` · `issueEinvoice` · `confirmPayment` — 2026-10-16, 되돌리고 { error: "STORAGE_FULL" })다.
   다른 쓰기(담당자·거래처·단가 …)는 예전처럼 메모리로 계속 돈다. */
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
        noticeFails: state.noticeFails,
        amountLog: state.amountLog,
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
    bumpSeqsFrom(data); // 새 id 를 매기기(아래 fixBilling · hydrateProfiles) **전에** 저장된 id 의 최댓값부터
    const clients = Array.isArray(data.clients)
      ? data.clients.filter((c) => c && typeof c === "object").map(hydrateClient)
      : null;
    state = {
      profilesByClient: hydrateProfilesByClient(data),
      contactsByClient: hydrateContacts(data),
      favorites: new Set(Array.isArray(data.favorites) ? data.favorites : []),
      // 저장된 레코드에 없는 신규 시드 필드(invoiceDay 등)만 백필한다(hydrateClient — 옛 '정지' 도 여기서 '활성' 으로 읽는다).
      // 편집값이 항상 이기고, 삭제한 거래처는 부활시키지 않는다(저장 목록만 순회).
      clients: clients || state.clients,
      clientPrices: data.clientPrices && typeof data.clientPrices === "object" ? data.clientPrices : state.clientPrices,
      invoiceAgreed: data.invoiceAgreed && typeof data.invoiceAgreed === "object" ? data.invoiceAgreed : state.invoiceAgreed,
      orderOps: hydrateOrderOps(data.orderOps),
      /* 정산 기록 — 칸이 없는 옛 저장본이면 시드(F2 이전에 열어 본 브라우저도 예시 달이 보이게) */
      einvoice: hydrateByClient(data.einvoice, (x) => okAt(x) && typeof x.no === "string") || {},
      einvoiceFail: hydrateByClient(data.einvoiceFail, (x) => !!x && typeof x === "object") || seedEinvoiceFail(),
      /* T4 발송 실패 기록 — 보류가 아니다(2026-10-23 결정 D1). 옛 키 holds 는 hydrateNoticeFails 가 옮긴다(정지 중 마감 기록은 버림) */
      noticeFails: hydrateNoticeFails(data) || seedNoticeFails(),
      payments: null,
      amountLog: hydrateLines(data.amountLog),
    };
    state.payments = hydrateByClient(data.payments, okAt)
      || seedPayments(state.clients, state.einvoiceFail, state.invoiceAgreed);
    // 불변식 보정: 버킷마다 정산담당이 없으면 첫 담당자로 지정
    const fixed = {};
    Object.keys(state.contactsByClient).forEach((k) => { fixed[k] = fixBilling(state.contactsByClient[k]); });
    state.contactsByClient = fixed;
  } catch {
    /* corrupt JSON → keep defaults (self-heal) */
  }
}

/* 저장된 거래처 레코드 하나 — 신규 시드 필드 백필 + **옛 '정지' 를 '활성' 으로**(2026-10-22 운영자 결정 A — '정지' 체계를 없애고
   '탈퇴' 를 둔다). 2026-10-19 의 거래처 상태 이력 칸(`statusLog`)도 버린다 — 읽는 곳이 없고, 남겨 두면 저장할 때마다 따라다닌다.
   '활성' 으로 바꾼 것은 저장하지 않는다 — 읽을 때마다 같은 답이 나오고(다른 쓰기가 생기면 그때 함께 저장된다), 옛 브라우저의 거래처는
   예전처럼 로그인할 수 있게 된다(정지가 없으니 막을 이유가 없다 · 그 거래처를 닫으려면 직원이 탈퇴 처리한다). 탈퇴는 건드리지 않는다. */
function hydrateClient(c) {
  /* 동의 기록 칸은 시드로 채우지 않는다 — 개인정보 수집·이용 동의(2026-10-23 운영자 결정 D6)는 새 칸이라, 그 칸이 생기기 전에 저장한 브라우저의
     시드 거래처(C001~C019)에 채우면 동의한 적 없는 거래처가 '가입일 09:00 에 지금 버전으로 동의함' 으로 읽혀 첫 로그인 게이트가 개인정보 동의를
     건너뛰었다(동의 기록을 지어낸 것이다 · 2026-10-23 검증). 저장소가 빈 브라우저는 INITIAL_CLIENTS 를 그대로 써 데모 로그인에 게이트가 없는
     것은 그대로다. 약관 칸(terms*)은 옛 저장본에도 이미 있어 여기서 빼지 않는다. */
  const { privacyAgreedAt: _pa, privacyVersion: _pv, ...seed } = SEED_BY_ID.get(c.id) || {};
  const { statusLog: _droppedLog, ...rec } = { ...seed, ...c };
  if (rec.status === "정지") rec.status = "활성";
  return rec;
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

/* 버킷 하나의 불변식 — 비어 있지 않으면 정산담당이 정확히 1명. 자동으로 올릴 땐 연락처가 맞는 첫 사람을 먼저 고른다
   (정산 담당 연락처는 비울 수 없다 — 2026-10-19 사용자 결정 · 명세 M52). '맞는' 은 담당자 창·'지정' 막기와 같은 담당자 연락처 기준
   `contactPhoneOk`(결정 ⓔ — 010 이면 11자리)다 — 받는분 기준 phoneOk 로 고르면 담당자 창이 받지 않는 010-123-4567 이 정산담당이 됐다.
   그런 사람이 없을 때만(옛 데이터) 첫 사람이다. */
function fixBilling(arr) {
  const a = (arr || []).map((c) => ({ isBilling: false, ...c, id: c.id || newContactId() }));
  if (a.length && !a.some((c) => c.isBilling)) {
    const i = Math.max(0, a.findIndex((c) => contactPhoneOk(c.phone)));
    a[i] = { ...a[i], isBilling: true };
  }
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

/* 탈퇴(2026-10-22 운영자 결정 A)는 **되돌리지 않는다** — 저장소가 마지막으로 지킨다. 화면(거래처 정보 창)은 탈퇴한 거래처의 상태 칸을
   모두 잠그지만, 낡은 form 사본이나 다른 쓰기 경로가 '활성' 을 실어 와도 상태와 탈퇴한 시각은 그대로 둔다(되살아나면 끝난 줄 알았던
   계정이 다시 로그인하고, 시드 주문도 다시 생긴다 — b2b-mock 은 탈퇴한 달부터 시드 주문을 만들지 않는다).
   탈퇴로 바뀌는데 시각(`withdrawnAt` "YYYY-MM-DD HH:mm")이 없으면 지금으로 채운다(사실 한 칸 — 이력 장치가 아니다).
   2026-10-19 의 상태 이력 칸(statusLog)은 들어와도 버린다(hydrateClient 와 같은 이유). */
function withWithdrawn(prevRec, nextRec, now = new Date()) {
  const { statusLog: _droppedLog, ...rec } = nextRec;
  if (prevRec.status === WITHDRAWN) return { ...rec, status: WITHDRAWN, withdrawnAt: prevRec.withdrawnAt || rec.withdrawnAt || fmtAt(now) };
  if (rec.status === WITHDRAWN && !parseAt(rec.withdrawnAt)) return { ...rec, withdrawnAt: fmtAt(now) };
  return rec;
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
    /* `notice`(안내 도달 — settlement-rules `noticeState`)는 관리자 진행 기록이 같은 판정으로 '보냈다/못 보냈다/닿지 않았다' 를 말하게
       싣는다. 자동 동의에는 끼지 않는다 — T4 가 닿지 않은 달도 마감에 평소대로 자동 동의한다(2026-10-23 운영자 결정 D1 — 예전 잠정
       '고지 미도달 보류'(Q19)는 걷어 냈다 · 실패 기록만). 자동 동의를 막는 것은 약관 동의 전 하나다(agreementState). */
    const notice = noticeFor(client || { id: k }, ym, state);
    return { ...agreementState({ period: ym, invoiceDay: invoiceDayFor(client, ym), manualAt: (state.invoiceAgreed[k] || {})[ym] || null, termsAt, now }), notice };
  },
  /** 수동 동의 기록. 이미 동의했으면 **덮어쓰지 않는다**(최초 시각이 기록이다).
   *  발행 전이거나 마감이 지났으면(자동 동의) **기록하지 않고 null** — 화면과 같은 함수·같은
   *  시계로 판정하므로 버튼이 열려 있던 순간과 어긋날 수 없다.
   *
   *  `opts`(선택) — `{ amount, currentAmount, issuedAmount }`: 거래처 화면이 **보여 준 금액** · 지금 금액 · 발급 때 금액
   *  (명세 3.4 '마감 전 수정' 5 · 6.6 agree). 보여 준 금액과 지금 금액이 둘 다 숫자이고 다르면 기록하지 않고
   *  `{ error: "SETTLEMENT_AMOUNT_CHANGED", amount: 지금 금액, issuedAmount }`(명세 6.6 detail 그대로).
   *  ⚠️ **금액 불일치를 먼저 본다**(2026-10-16 DATA.md 2.1) — 고쳐서 0원이 된 달에 옛 화면(60,000원을 보여 준)이 동의하면
   *     예전엔 '지금 금액 0 → null' 이 먼저라 이유 없는 실패가 됐다. 이제 `{ error, amount: 0, issuedAmount: 60000 }` 이고,
   *     null 은 보여 준 금액도 0인 요청(올바른 화면은 버튼이 없어 보낼 수 없다)뿐이다.
   *  store 는 금액을 모른다(주문은 b2b-mock 이 store 를 import 한다) — 금액들은 호출부(util/settlement.js
   *  `agreeSettlement`)가 같은 소스에서 계산해 넘긴다.
   *  저장(localStorage)에 실패하면 기록을 되돌리고 `{ error: "STORAGE_FULL" }` — 동의한 척하지 않는다.
   *  옛 호출 모양 `agreeInvoice(clientId, ym, now)` 도 받는다. */
  agreeInvoice(clientId, ym, opts = {}, now = new Date()) {
    if (opts instanceof Date) { now = opts; opts = {}; }
    const k = scopeId(clientId);
    const cur = state.invoiceAgreed[k] || {};
    if (cur[ym]) return cur[ym];
    if (!this.agreementOf(clientId, ym, now).open) return null;
    const { amount, currentAmount, issuedAmount = null } = opts || {};
    if (Number.isFinite(amount) && Number.isFinite(currentAmount) && amount !== currentAmount) {
      return { error: "SETTLEMENT_AMOUNT_CHANGED", amount: currentAmount, issuedAmount };
    }
    if (currentAmount === 0) return null;
    const at = fmtAt(now);
    const prev = state.invoiceAgreed;
    state = { ...state, invoiceAgreed: { ...prev, [k]: { ...cur, [ym]: at } } };
    if (!persist()) {
      state = { ...state, invoiceAgreed: prev };
      persist();
      return { error: STORAGE_FULL };
    }
    emit();
    return at;
  },
  /* ── 정산 기록 (서버 대역) — 상태 판정은 util/settlement.js `settlementOf` 가 한다 ──────
     아래 두 쓰기는 **store 가 아는 사실만으로** 가드한다(동의 여부 · 발급 실패 기록 · 기존 기록). 금액(0원 달)은 store 가
     모르므로 util 의 `issueEinvoiceFor`·`confirmPaymentFor` 가 settlementOf 로 한 번 더 거른다 — 화면은 그쪽을 부를 것. */
  einvoiceOf(clientId, ym) { return (state.einvoice[scopeId(clientId)] || {})[ym] || null; },
  einvoiceFailOf(clientId, ym) { return (state.einvoiceFail[scopeId(clientId)] || {})[ym] || null; },
  paymentOf(clientId, ym) { return (state.payments[scopeId(clientId)] || {})[ym] || null; },
  /** 마감 하루 전 안내(T4) 발송 실패 **기록** — "UNDELIVERED" 또는 null. 보류가 아니다(2026-10-23 결정 D1) — 화면은 settlementOf 의
   *  notice(t4.why)를 쓸 것. */
  noticeFailOf(clientId, ym) { return (state.noticeFails[scopeId(clientId)] || {})[ym] || null; },
  /** 계산서 발급 재시도·수기 입력(명세 6.6 `POST …/einvoice`). **AGREED(동의완료 · 발급 전)에서만** 받는다 —
   *  동의 전이거나, 이미 발급됐거나(기록 또는 자동 발급 파생 = 실패 기록이 없는 달) 이면 null.
   *  - `{ mode: "retry" }` — 데모에서는 늘 성공한다(승인번호는 결정적으로 만든다 — 실서비스는 바로빌 응답).
   *  - `{ mode: "manual", no, at }` — 승인번호(예시 꼴 `YYYYMMDD-8자리-8자리` · ⚠ 미확정 M62)와 발급 시각(미래 불가) 필수.
   *    형식이 틀리면 `{ error: "EINVOICE_NO_INVALID" }`, 시각이 틀리거나 미래면 `{ error: "EINVOICE_AT_INVALID" }`.
   *    기록에는 `recordedAt`(기록한 시각 = now)을 함께 남긴다 — 적은 발급 시각과 다르다(기한 초과 · T6·T8 은 기록한 순간 기준).
   *  - `by`(선택) — 처리자 `{ type, id, name, dept }`(util/settlement `issueEinvoiceFor` 가 currentActor 를 싣는다).
   *  성공하면 `{ no, at, mode, by? }`. 저장(localStorage)에 실패하면 되돌리고 `{ error: "STORAGE_FULL" }`. */
  issueEinvoice(clientId, ym, { mode, no, at, by } = {}, now = new Date()) {
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
      /* recordedAt = 기록한 시각(지금). 적은 발급 시각(at)은 바로빌 콘솔에서 낸 과거일 수 있다 — 안내(T6 · 기한이 지났으면 T8)는
         기록한 순간에 나가고 기한 초과도 그 순간부터다(M39 · util/settlement `overdueFrom` · 2026-10-19 검토 4). */
      rec = { no: n, at: fmtAt(d), mode: "manual", recordedAt: fmtAt(now) };
    } else return null;
    if (by && typeof by === "object") rec.by = { ...by };
    const prev = state.einvoice;
    state = { ...state, einvoice: { ...prev, [k]: { ...(prev[k] || {}), [ym]: rec } } };
    if (!persist()) {
      state = { ...state, einvoice: prev };
      persist();
      return { error: STORAGE_FULL };
    }
    emit();
    return rec;
  },
  /** 입금 확인(명세 6.6 `POST …/payment` — 전액만). 계산서가 나간 달(ISSUED·OVERDUE)만 받는다 — 동의 전 · 발급 실패로
   *  계산서가 없는 달 · 이미 입금된 달이면 null. `at` 생략 시 지금. `by`(선택) — 처리자(util `confirmPaymentFor` 가 싣는다).
   *  성공하면 `{ at, by? }`. 저장(localStorage)에 실패하면 되돌리고 `{ error: "STORAGE_FULL" }`. */
  confirmPayment(clientId, ym, at, now = new Date(), by = null) {
    const k = scopeId(clientId);
    if (this.paymentOf(k, ym)) return null;
    if (!this.agreementOf(k, ym, now).mode) return null;
    if (!this.einvoiceOf(k, ym) && this.einvoiceFailOf(k, ym)) return null;
    const d = at instanceof Date ? at : at ? parseAt(at) : now;
    if (!d || d > now) return null;
    const rec = { at: fmtAt(d) };
    if (by && typeof by === "object") rec.by = { ...by };
    const prev = state.payments;
    state = { ...state, payments: { ...prev, [k]: { ...(prev[k] || {}), [ym]: rec } } };
    if (!persist()) {
      state = { ...state, payments: prev };
      persist();
      return { error: STORAGE_FULL };
    }
    emit();
    return rec;
  },
  /** 정산 금액 변경 기록 — 그 (거래처, 귀속월)의 **사용자 변경분** 줄(시간순 사본 · 없으면 []).
   *  ⚠️ 화면은 이걸 직접 읽지 말 것 — 시드 줄과 합치고 그 달 금액 전후를 붙이는 것은 util/settlement `amountChangesOf` 다. */
  amountLogOf(clientId, ym) {
    return ((state.amountLog[scopeId(clientId)] || {})[ym] || []).map((l) => ({ ...l }));
  },
  /** 옛 저장본 이행(b2b-mock 전용 · 주문 목록을 처음 만들 때 한 번) — `keep(line, clientId, ym)` 이 false 인 사용자 줄을 버린다.
   *  **메모리에서만** 바꾸고 저장하지 않는다 — 읽을 때마다 같은 답이 나오고 다음 쓰기에 함께 저장된다(옛 '정지' → '활성' 과 같은 수법).
   *  알림(emit)도 하지 않는다(그 순간 화면은 아직 이 값을 읽지 않았다). 버린 줄 수를 돌려준다. */
  pruneAmountLog(keep) {
    let dropped = 0;
    const out = {};
    Object.keys(state.amountLog || {}).forEach((cid) => Object.keys(state.amountLog[cid] || {}).forEach((ym) => {
      const lines = state.amountLog[cid][ym].filter((l) => { const ok = keep(l, cid, ym); if (!ok) dropped++; return ok; });
      if (lines.length) (out[cid] = out[cid] || {})[ym] = lines;
    }));
    if (dropped) state = { ...state, amountLog: out };
    return dropped;
  },
  /* ── B2B 주문 변경분 (b2b-mock 전용) ─────────────────────
     ⚠️ 페이지가 이걸 직접 부르지 말 것 — 주문 쓰기는 b2b-mock 의 저장 함수(b2bUpsert·b2bSetStatus·…)를
        지나야 캐시와 기록이 함께 바뀐다. 여기는 그 함수들이 쓰는 저장 칸일 뿐이다. */
  orderOps() { return state.orderOps; },
  /** 저장에 성공하면 true. **실패하면 변경분을 되돌리고 false** — 용량을 넘긴 변경분이 메모리에 남아 있으면
   *  그 뒤의 **모든** 저장(다른 주문·담당자·거래처·동의 기록)이 같이 실패한다. 예전엔 빈 catch 가 삼켜
   *  '저장했습니다' 토스트가 뜬 채 새로고침에 전부 사라졌다(2026-10-16 실측 — 원본 HEIC 사진 4MB).
   *  `extra.amountLines`(선택) — 같은 저장이 남기는 정산 금액 변경 기록 줄 `[{ clientId, ym, ...Line }]`. 주문 변경분과
   *  **한 state 전이 · persist 한 번**으로 쓰고, 실패하면 둘 다 되돌린다(주문만 남고 기록이 빠지면 '발급 때 금액' 파생이
   *  틀어지고, 기록만 남으면 없던 변경이 생긴다). */
  setOrderOps(next, extra = {}) {
    const prev = state.orderOps;
    const prevLog = state.amountLog;
    state = {
      ...state,
      orderOps: hydrateOrderOps(resolve(next, prev)),
      amountLog: appendLines(prevLog, extra && extra.amountLines),
    };
    if (persist()) { emit(); return true; }
    state = { ...state, orderOps: prev, amountLog: prevLog };
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
  /** 거래처 레코드 저장 — 발급일 이력(invoiceDayLog)을 여기서 쌓고, 탈퇴는 되돌리지 않는다(withWithdrawn — 탈퇴한 시각도 채운다).
   *  `now`(선택)는 이력·탈퇴 시각 — 테스트가 시계를 못박을 때만 넘긴다. */
  updateClient(c, now = new Date()) {
    this.setClients((prev) => prev.map((x) => (x.id === c.id ? withWithdrawn(x, withInvoiceDayLog(x, c, now), now) : x)));
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
