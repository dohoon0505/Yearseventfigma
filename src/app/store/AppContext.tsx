import React, { createContext, useContext, useState } from "react";

// ─── Shared Types ──────────────────────────────────────────────────────────────
export type Product = {
  category: string; product: string; price: string;
  description: string; icon: string;
};
export type Profile = {
  no: string; name: string; role: string;
  phone: string; greeting: string;
};
export type Contact = {
  no: string; name: string; role: string;
  phone: string; message: string;
};

// ─── Static Product Data ───────────────────────────────────────────────────────
export const ALL_PRODUCTS: Product[] = [
  { category: "경조화환", product: "근조바구니",         price: "50,000원",  description: "빈소 내에 놓지하는 바구니형 애도상품", icon: "🌸" },
  { category: "경조화환", product: "근조오브제(단형)",   price: "50,000원",  description: "웰체 스탠드 위 부분을 조화로 꾸민 오브제형 근조화환", icon: "🌸" },
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

export const productKey = (r: Product) => `${r.category}__${r.product}`;

// ─── Initial Data ──────────────────────────────────────────────────────────────
const INITIAL_PROFILES: Profile[] = [
  { no: "01", name: "홍길동",  role: "대표이사",   phone: "010-0000-0000", greeting: "(주)올해의경조사 대표이사 홍길동" },
  { no: "02", name: "정소빈",  role: "대표변호사", phone: "010-0000-0000", greeting: "올해표현(유) 대표변호사 정소빈" },
  { no: "03", name: "임직원",  role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "04", name: "임직원",  role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
  { no: "05", name: "임직원",  role: "일동",        phone: "010-0000-0000", greeting: "(주)올해의경조사 임직원 일동" },
];

const INITIAL_CONTACTS: Contact[] = [
  { no: "01", name: "할다운", role: "비서",   phone: "010-0000-0000", message: "모든 배송완료 마다에 메세지를 수신합니다" },
  { no: "02", name: "오임찬", role: "재경부", phone: "010-0000-0000", message: "메세지를 수신하지 않습니다." },
  { no: "03", name: "김현수", role: "경리",   phone: "010-0000-0000", message: "모든 배송완료 마다에 메세지를 수신합니다" },
];

// ─── Context Definition ────────────────────────────────────────────────────────
interface AppContextValue {
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  favorites: Set<string>;
  setFavorites: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  return (
    <AppContext.Provider value={{ profiles, setProfiles, contacts, setContacts, favorites, setFavorites }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppStore must be used within AppProvider");
  return ctx;
}
