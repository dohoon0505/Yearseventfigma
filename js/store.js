/* ============================================================
   store.js — global state (profiles / contacts / favorites)
   pub/sub + localStorage persistence. Ports AppContext.tsx.
   ============================================================ */
import { INITIAL_CLIENTS } from "./data/admin-mock.js";
/* 동의 상태(발행·마감·자동 동의·작성일자)는 규칙 모듈 한 곳에서 파생한다 — import 0 이라 순환이 없다. */
import { agreementState, fmtAt, invoiceDayOf } from "./data/settlement-rules.js";
/* ⚠️ session.js 는 store 를 import 하지 않는다 — 순환이 아니다.
   util/client.js 는 store 를 import 하므로 여기서 쓰면 순환이 된다. */
import { getClientId } from "./session.js";

/** @typedef {{category:string,product:string,price:string,description:string,icon:string}} Product */
/** @typedef {{no:string,name:string,role:string,phone:string,greeting:string}} Profile */
/** @typedef {{id:string,no?:string,name:string,role:string,phone:string,message:string,isBilling:boolean}} Contact */
/* ⚠️ Contact 의 키는 `id` 다. `no` 는 화면에 보이는 순번일 뿐이라 쓰기마다 다시 매겨진다 —
   삭제하면 뒤 번호가 전부 당겨지므로 `no` 로 대상을 지목하면 엉뚱한 사람이 바뀐다. */
/** @typedef {{id:string,accountId:string,companyName:string,bizNumber:string,ceoName:string,managerName:string,department:string,contact:string,email:string,address:string,status:string,joinDate:string,invoiceDay:string,clientNote:string,channel?:string,password?:string}} Client */
/* password 는 셀프 가입(register.js)으로 만든 레코드에만 있다. 이관 시드에는 없다 —
   관리자는 비밀번호를 읽지 못하고 임시비밀번호 발급만 한다(admin-clients). */

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
  /* 2026-09-17 신설 — (주)뉴트리 2026-08 실데이터의 꽃바구니 150,000원 항목(사용자 지시). */
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
   이관 시드 3명은 데모에서 포털에 로그인하는 거래처, 즉 첫 거래처에 귀속시킨다. */
const FIRST_CLIENT = INITIAL_CLIENTS[0] ? INITIAL_CLIENTS[0].id : "C001";
let ctSeq = 100;
export const newContactId = () => `ct${++ctSeq}`;
/* 프로필도 안정 id 를 갖는다 — `no` 는 `reindexNo` 가 쓰기마다 다시 매기는 표시
   순번이라 주문이 프로필을 지목하는 키로 쓸 수 없다(담당자에서 이미 겪은 것). */
let pfSeq = 100;
export const newProfileId = () => `pf${++pfSeq}`;

/* ── Reactive store ─────────────────────────────────────── */
/* ⚠️ 키를 올리지 않는다. 올리면 담당자뿐 아니라 거래처 편집·단가·프로필까지 **전부** 버려진다.
   담당자 구조 변경(전역 → 거래처별)은 hydrateContacts 가 두 모양을 다 읽어 흡수한다. */
const KEY = "yeop.store.v4"; // v4: 구 시스템 거래처 실데이터 이관(19곳) + clientNote 필드
const subs = new Set();
const SEED_BY_ID = new Map(INITIAL_CLIENTS.map((c) => [c.id, c]));

/* 순번(no) 재부여: 프로필·담당자 목록은 항상 배열 순서대로 01,02,03… 을 유지한다.
   → 대상자 삭제 시 뒤 항목이 자동으로 앞 번호로 당겨진다(빈 번호 방지). */
const reindexNo = (arr) => arr.map((x, i) => ({ ...x, no: String(i + 1).padStart(2, "0") }));

let state = {
  profiles: INITIAL_PROFILES.map((p) => ({ ...p })),
  contactsByClient: { [FIRST_CLIENT]: INITIAL_CONTACTS.map((c) => ({ ...c })) },
  favorites: new Set(),
  clients: INITIAL_CLIENTS.map((c) => ({ ...c })),
  clientPrices: {}, // { [clientId]: { [productKey]: number } } — per-client price overrides
  /* 거래명세서 '계산서 발급 동의' **수동** 기록 — { [clientId]: { "YYYY-MM": "YYYY-MM-DD HH:mm" } }.
     자동 동의(마감 13:00 경과)는 기록하지 않고 `agreementOf` 가 매번 파생한다 — 과거 달을 전부
     적어 두면 시드·신규 거래처마다 백필이 필요해진다. 관리자 정산 표도 같은 함수를 본다. */
  invoiceAgreed: {},
};

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        profiles: state.profiles,
        contactsByClient: state.contactsByClient,
        favorites: [...state.favorites], // Set → array
        clients: state.clients,
        clientPrices: state.clientPrices,
        invoiceAgreed: state.invoiceAgreed,
      })
    );
  } catch {
    /* storage full / disabled — keep running from memory */
  }
}

function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state = {
      profiles: Array.isArray(data.profiles) ? hydrateProfiles(data.profiles) : state.profiles,
      contactsByClient: hydrateContacts(data),
      favorites: new Set(Array.isArray(data.favorites) ? data.favorites : []),
      // 저장된 레코드에 없는 신규 시드 필드(invoiceDay 등)만 백필한다.
      // 편집값이 항상 이기고, 삭제한 거래처는 부활시키지 않는다(저장 목록만 순회).
      clients: Array.isArray(data.clients) ? data.clients.map((c) => ({ ...(SEED_BY_ID.get(c.id) || {}), ...c })) : state.clients,
      clientPrices: data.clientPrices && typeof data.clientPrices === "object" ? data.clientPrices : state.clientPrices,
      invoiceAgreed: data.invoiceAgreed && typeof data.invoiceAgreed === "object" ? data.invoiceAgreed : state.invoiceAgreed,
    };
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

/* 버킷 하나의 불변식 — 비어 있지 않으면 정산담당이 정확히 1명. */
function fixBilling(arr) {
  const a = (arr || []).map((c) => ({ isBilling: false, ...c, id: c.id || newContactId() }));
  if (a.length && !a.some((c) => c.isBilling)) a[0] = { ...a[0], isBilling: true };
  return a;
}

/* v4(전역 contacts) → v5(거래처별) 이관. 옛 키가 남아 있으면 첫 거래처 버킷으로 옮긴다 —
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

export const store = {
  hydrate,
  get: () => state,
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  setProfiles(next) {
    state = { ...state, profiles: reindexNo(resolve(next, state.profiles)) };
    persist();
    emit();
  },
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
    return agreementState({ period: ym, invoiceDay: invoiceDayOf(client), manualAt: (state.invoiceAgreed[k] || {})[ym] || null, now });
  },
  /** 수동 동의 기록. 이미 동의했으면 **덮어쓰지 않는다**(최초 시각이 기록이다).
   *  발행 전이거나 마감이 지났으면(자동 동의) **기록하지 않고 null** — 화면과 같은 함수·같은
   *  시계로 판정하므로 버튼이 열려 있던 순간과 어긋날 수 없다. */
  agreeInvoice(clientId, ym, now = new Date()) {
    const k = scopeId(clientId);
    const cur = state.invoiceAgreed[k] || {};
    if (cur[ym]) return cur[ym];
    if (!this.agreementOf(clientId, ym, now).open) return null;
    const at = fmtAt(now);
    state = { ...state, invoiceAgreed: { ...state.invoiceAgreed, [k]: { ...cur, [ym]: at } } };
    persist();
    emit();
    return at;
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
  updateClient(c) {
    this.setClients((prev) => prev.map((x) => (x.id === c.id ? c : x)));
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
