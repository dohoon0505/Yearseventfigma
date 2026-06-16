/* ============================================================
   store.js — global state (profiles / contacts / favorites)
   pub/sub + localStorage persistence. Ports AppContext.tsx.
   ============================================================ */
import { INITIAL_CLIENTS } from "./data/admin-mock.js";

/** @typedef {{category:string,product:string,price:string,description:string,icon:string}} Product */
/** @typedef {{no:string,name:string,role:string,phone:string,greeting:string}} Profile */
/** @typedef {{no:string,name:string,role:string,phone:string,message:string,isBilling:boolean}} Contact */
/** @typedef {{id:string,accountId:string,password:string,companyName:string,bizNumber:string,ceoName:string,managerName:string,department:string,contact:string,email:string,address:string,status:string,joinDate:string}} Client */

/* ── Static product catalog (immutable) ─────────────────── */
export const ALL_PRODUCTS = [
  { category: "경조화환", product: "근조바구니",        price: "50,000원",  description: "빈소 내에 놓지하는 바구니형 애도상품", icon: "🌸" },
  { category: "경조화환", product: "근조오브제(단형)",  price: "50,000원",  description: "웰체 스탠드 위 부분을 조화로 꾸민 오브제형 근조화환", icon: "🌸" },
  { category: "경조화환", product: "근조오브제(2단형)", price: "75,000원",  description: "웰체 스탠드 위·아래를 조화로 꾸민 오브제형 근조화환", icon: "🌸" },
  { category: "경조화환", product: "3단화환(기본형)",   price: "50,000원",  description: "보편적으로 가장 많이 유통되는 3단형 화환(목·근조 동일)", icon: "🌸" },
  { category: "경조화환", product: "3단화환(고급형)",   price: "60,000원",  description: "기본 화환에서 장식이 일부 추가된 3단형 화환", icon: "🌸" },
  { category: "경조화환", product: "3단화환(특대형)",   price: "75,000원",  description: "기본 화환에 좋은 꽃만 구비된 특대 3단형 화환", icon: "🌸" },
  { category: "경조화환", product: "4단화환(표준형)",   price: "95,000원",  description: "기존 3단형 화환에서 1단이 추가된 대형 4단화환", icon: "🌸" },
  { category: "경조화환", product: "평탁화(10kg)",      price: "75,000원",  description: "기본 화환 형태에 쌀 10kg가 더해져 배송되는 예도상품", icon: "🌸" },
  { category: "경조화환", product: "평탁화(20kg)",      price: "110,000원", description: "기본 화환 형태에 쌀 20kg가 더해져 배송되는 예도상품", icon: "🌸" },
  { category: "관엽화분", product: "박상용 마니빔분",   price: "50,000원",  description: "카운터·테이블에 두기 좋은 마니화분으로 평균 40~70cm", icon: "🌿" },
  { category: "관엽화분", product: "박상용 중형화분",   price: "80,000원",  description: "바닥에 두는 화분 중 크기가 적당한 화분으로 평균 60~120cm", icon: "🌿" },
  { category: "관엽화분", product: "박상용 대형화분",   price: "100,000원", description: "바닥에 두는 화분 중 크기가 큰 화분으로 평균 130~160cm", icon: "🌿" },
  { category: "동서양란", product: "동양란(기본형)",    price: "50,000원",  description: "기본적인 동양란을 보편적인 품종으로 제공하는 동양란", icon: "🏵️" },
  { category: "동서양란", product: "동양란(고급형)",    price: "100,000원", description: "고급 화양에 고급 품종으로 제작되는 동양란", icon: "🏵️" },
  { category: "동서양란", product: "서양란(기본형)",    price: "50,000원",  description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 1~2대", icon: "🏵️" },
  { category: "동서양란", product: "서양란(고급형)",    price: "80,000원",  description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 3~4대", icon: "🏵️" },
  { category: "동서양란", product: "서양란(특대형)",    price: "120,000원", description: "서양 꽃의 고급진 품종으로 제작되는 서양란, 꽃대 6~8대", icon: "🏵️" },
  { category: "생화",     product: "소형 꽃바구니",     price: "50,000원",  description: "생화 5~10송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
  { category: "생화",     product: "중형 꽃바구니",     price: "80,000원",  description: "생화 10~20송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
  { category: "생화",     product: "대형 꽃바구니",     price: "120,000원", description: "생화 20~30송이로 제작, 품종·계절에 따라 상이할 수 있습니다.", icon: "💐" },
];

export const productKey = (r) => `${r.category}__${r.product}`;
/** "50,000원" → 50000 */
export const priceNum = (str) => parseInt(String(str).replace(/[^0-9]/g, ""), 10) || 0;
/** 50000 → "50,000원" */
export const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

/* ── Initial mock data ──────────────────────────────────── */
const INITIAL_PROFILES = [
  { no: "01", name: "홍길동", role: "대표이사",   phone: "010-0000-0000", greeting: "(주)올해의경조사 대표이사 홍길동" },
  { no: "02", name: "정소빈", role: "대표변호사", phone: "010-0000-0000", greeting: "올해표현(유) 대표변호사 정소빈" },
  { no: "03", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "04", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "05", name: "임직원", role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
];

const INITIAL_CONTACTS = [
  { no: "01", name: "할다운", role: "비서",   phone: "010-1111-2222", message: "모든 배송완료 마다에 메세지를 수신합니다", isBilling: false },
  { no: "02", name: "오임찬", role: "재경부", phone: "010-3333-4444", message: "메세지를 수신하지 않습니다.",        isBilling: true },
  { no: "03", name: "김현수", role: "경리",   phone: "010-5555-6666", message: "모든 배송완료 마다에 메세지를 수신합니다", isBilling: false },
];

/* ── Reactive store ─────────────────────────────────────── */
const KEY = "yeop.store.v1";
const subs = new Set();

let state = {
  profiles: INITIAL_PROFILES.map((p) => ({ ...p })),
  contacts: INITIAL_CONTACTS.map((c) => ({ ...c })),
  favorites: new Set(),
  clients: INITIAL_CLIENTS.map((c) => ({ ...c })),
  clientPrices: {}, // { [clientId]: { [productKey]: number } } — per-client price overrides
};

function persist() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        profiles: state.profiles,
        contacts: state.contacts,
        favorites: [...state.favorites], // Set → array
        clients: state.clients,
        clientPrices: state.clientPrices,
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
      profiles: Array.isArray(data.profiles) ? data.profiles : state.profiles,
      contacts: Array.isArray(data.contacts) ? data.contacts.map((c) => ({ isBilling: false, ...c })) : state.contacts,
      favorites: new Set(Array.isArray(data.favorites) ? data.favorites : []),
      clients: Array.isArray(data.clients) ? data.clients : state.clients,
      clientPrices: data.clientPrices && typeof data.clientPrices === "object" ? data.clientPrices : state.clientPrices,
    };
    // 불변식 보정: 로드된 담당자 중 정산담당이 없으면 첫 담당자로 지정
    if (state.contacts.length > 0 && !state.contacts.some((c) => c.isBilling)) {
      state.contacts = state.contacts.map((c, i) => ({ ...c, isBilling: i === 0 }));
    }
  } catch {
    /* corrupt JSON → keep defaults (self-heal) */
  }
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
    state = { ...state, profiles: resolve(next, state.profiles) };
    persist();
    emit();
  },
  setContacts(next) {
    let arr = resolve(next, state.contacts);
    // 불변식: 정산·회계 담당자는 항상 1명 존재해야 한다 (없으면 첫 담당자로 자동 지정)
    if (arr.length > 0 && !arr.some((c) => c.isBilling)) {
      arr = arr.map((c, i) => ({ ...c, isBilling: i === 0 }));
    }
    state = { ...state, contacts: arr };
    persist();
    emit();
  },
  /** Designate a single 정산/회계 담당자 (거래명세서·입금 알림 수신). */
  setBillingContact(no) {
    this.setContacts((prev) => prev.map((c) => ({ ...c, isBilling: c.no === no })));
  },
  /** The contact who receives settlement/billing 알림톡, or null. */
  getBillingContact() {
    return state.contacts.find((c) => c.isBilling) || null;
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
};
