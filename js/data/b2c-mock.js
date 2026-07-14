/* ============================================================
   b2c-mock.js — B2C 통합주문관리 목데이터 + 옵션 상수.
   모듈 레벨 배열이라 세션 내 편집·추가·삭제가 유지된다(재import 없음).
   실서비스에서는 서버 API로 대체.
   ============================================================ */
import { ALL_PRODUCTS, priceNum } from "../store.js";

/* ── 드롭다운(select) 옵션 ─────────────────────────────── */
export const B2C_STAFF = ["김총무", "박사원", "이대리", "최과장", "오임찬"];
export const B2C_CHANNELS = ["네이버 스토어", "카카오톡 채널", "전화 주문", "자사몰", "인스타그램 DM", "거래처 직접"];
/* 워크플로: 접수대기(신규 유입) → 주문접수(담당자 확인) → 배송완료(사진+인수자 저장 시 자동) */
export const B2C_STATUSES = ["접수대기", "주문접수", "배송완료", "취소"];
/* 주문상품 옵션(상품 규격 안내 카탈로그) — 선택 시 주문금액 자동 채움 */
export const B2C_PRODUCTS = ALL_PRODUCTS.map((p) => ({ name: p.product, price: priceNum(p.price) }));
export const productPrice = (name) => B2C_PRODUCTS.find((p) => p.name === name)?.price ?? 0;
/* 리본 경조사어 추천(datalist) */
export const B2C_RIBBON_PHRASES = [
  "삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다",
  "축 결혼(祝 結婚)", "화혼을 축하합니다", "축 개업(祝 開業)", "축 취임(祝 就任)",
];

/* ── 상태 배지 색 (orders.js 톤과 통일) ────────────────── */
export const B2C_STATUS_STYLE = {
  "접수대기": { bg: "var(--c-orange-soft)", color: "var(--c-orange-ink)" },
  "주문접수": { bg: "var(--c-blue-soft)", color: "var(--c-blue)" },
  "배송완료": { bg: "var(--c-success-bg)", color: "var(--c-success-ink)" },
  "취소":    { bg: "var(--c-danger-bg)", color: "var(--c-danger-ink)" },
};

/* ── 초기 목데이터 (가변 모듈 상태) ────────────────────── */
export const B2C_ORDERS = [
  {
    id: "b1", orderNo: "B2C-2607-0006", receivedAt: "2026-07-08 15:20",
    manager: "", channel: "네이버 스토어", // API 자동등록 → 담당자 미지정(열면 담당자 지정 우선)
    ordererName: "정하윤", ordererPhone: "010-4821-3300",
    ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "정하윤",
    image: "", product: "근조바구니", amount: 50000,
    deliverAt: "2026-07-09T11:00", request: "빈소 입구 우측에 배치 부탁드립니다.",
    recipientName: "故 김태수", recipientPhone: "010-3921-4400",
    address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", receiver: "",
    memo: "", status: "접수대기", notified: false, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b2", orderNo: "B2C-2607-0005", receivedAt: "2026-07-08 10:05",
    manager: "박사원", channel: "카카오톡 채널",
    ordererName: "이서준", ordererPhone: "010-5540-1180",
    ribbonPhrase: "축 결혼(祝 結婚)", ribbonSender: "이서준·김하은",
    image: "", product: "3단화환(고급형)", amount: 60000,
    deliverAt: "2026-07-10T13:30", request: "예식 30분 전까지 도착 희망",
    recipientName: "혼주 김영호", recipientPhone: "010-8845-1120",
    address: "서울 서초구 강남대로 373 홀리데이인 서울강남 3층 그랜드볼룸", receiver: "",
    memo: "예식장 반입 확인 완료", status: "주문접수", notified: false, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b3", orderNo: "B2C-2607-0004", receivedAt: "2026-07-07 16:40",
    manager: "이대리", channel: "전화 주문",
    ordererName: "최민재", ordererPhone: "010-2277-8130",
    ribbonPhrase: "축 개업(祝 開業)", ribbonSender: "(주)오버레이 임직원 일동",
    image: "", product: "4단화환(표준형)", amount: 95000,
    deliverAt: "2026-07-08T10:00", request: "",
    recipientName: "박상무", recipientPhone: "010-6612-7788",
    address: "부산 해운대구 센텀중앙로 90 벡스코 제2전시장 로비", receiver: "박상무 비서 김지원",
    memo: "현장사진 발송 완료", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b4", orderNo: "B2C-2607-0003", receivedAt: "2026-07-06 09:30",
    manager: "최과장", channel: "자사몰",
    ordererName: "한소희", ordererPhone: "010-7714-2206",
    ribbonPhrase: "화혼을 축하합니다", ribbonSender: "한소희",
    image: "", product: "중형 꽃바구니", amount: 80000,
    deliverAt: "2026-07-07T14:00", request: "리본 문구 오탈자 없이 확인 부탁",
    recipientName: "이지안", recipientPhone: "010-3326-7740",
    address: "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층", receiver: "이지안",
    memo: "", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b5", orderNo: "B2C-2607-0002", receivedAt: "2026-07-05 13:15",
    manager: "오임찬", channel: "인스타그램 DM",
    ordererName: "강태오", ordererPhone: "010-9043-2271",
    ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "강태오",
    image: "", product: "서양란(고급형)", amount: 80000,
    deliverAt: "2026-07-06T11:00", request: "",
    recipientName: "윤대표", recipientPhone: "010-4471-9920",
    address: "서울 강남구 테헤란로 131 한국타이어빌딩 16층", receiver: "",
    memo: "결제 후 고객 변심으로 당일 취소 요청", status: "취소", notified: true,
    cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)",
  },
  {
    id: "b6", orderNo: "B2C-2607-0001", receivedAt: "2026-07-04 11:00",
    manager: "김총무", channel: "거래처 직접",
    ordererName: "서지호", ordererPhone: "010-2240-6638",
    ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "고이장례연구소 일동",
    image: "", product: "동양란(기본형)", amount: 50000,
    deliverAt: "2026-07-05T09:00", request: "장례식장 정문에서 수령 확인 요망",
    recipientName: "故 박순자", recipientPhone: "010-5540-9902",
    address: "대전 중구 문화로 282 충남대학교병원 장례식장 5호실", receiver: "상주 박현우",
    memo: "", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
];

/* ── CRUD 헬퍼 (모듈 상태 직접 변경) ───────────────────── */
let idSeq = B2C_ORDERS.length;
let noSeq = 6; // 최신 주문번호 시퀀스(B2C-2607-0006 이후)

export function b2cList() { return B2C_ORDERS; }
export function b2cNewId() { return "b" + String(++idSeq) + "_" + Date.now().toString(36); }
export function b2cNextOrderNo() { return `B2C-2607-${String(++noSeq).padStart(4, "0")}`; }
export function b2cUpsert(rec) {
  const i = B2C_ORDERS.findIndex((o) => o.id === rec.id);
  if (i >= 0) B2C_ORDERS[i] = { ...rec };
  else B2C_ORDERS.unshift({ ...rec }); // 신규는 최상단
}
export function b2cRemove(id) {
  const i = B2C_ORDERS.findIndex((o) => o.id === id);
  if (i >= 0) B2C_ORDERS.splice(i, 1);
}
export function b2cSetStatus(id, status) {
  const o = B2C_ORDERS.find((x) => x.id === id);
  if (!o) return;
  o.status = status;
  if (status === "배송완료") o.notified = true; // 배송완료 → 알림톡 자동 발송(API)
}
export function b2cSetManager(id, name) {
  const o = B2C_ORDERS.find((x) => x.id === id);
  if (o) o.manager = name; // API 미지정 주문에 담당자 배정(별도 모달에서 선택·입력)
}
