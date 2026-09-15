/* ============================================================
   b2c-mock.js — B2C 통합주문관리 목데이터 + 옵션 상수.
   모듈 레벨 배열이라 세션 내 편집·추가·삭제가 유지된다(재import 없음).
   실서비스에서는 서버 API로 대체.
   ============================================================ */
import { ALL_PRODUCTS, priceNum } from "../store.js";
import { staffNames, staffOptions } from "./staff-mock.js";
import { DATA_NOW } from "./admin-mock.js";
import { seedHistory, pushHistory } from "./order-history.js";
import { formatDateLabel, mockDates } from "../util/date.js";

/* 날짜는 DATA_NOW 기준 상대 생성 — 절대값으로 박아두면 시간이 흐르면서
   기간 필터·대쉬보드의 "오늘" 집계에 걸리는 행이 하나도 없어진다.
   포맷이 두 가지다: 접수일시는 "YYYY-MM-DD HH:mm", 배송일시는 datetime-local
   입력이 읽는 "YYYY-MM-DDTHH:mm". 표시·편집 양쪽이 이 포맷을 파싱한다. */
const D = mockDates(DATA_NOW);
/* 주문번호 접두사도 기준 시각에서 파생 — 2607 같은 값이 박혀 있으면
   데모 중 '올해 주문인데 작년 번호'가 되어 접수 순서를 오해하게 된다. */
const NO_PREFIX = `B2C-${String(DATA_NOW.getFullYear()).slice(2)}${String(DATA_NOW.getMonth() + 1).padStart(2, "0")}`;
const rcv = (d, t) => `${formatDateLabel(d)} ${t}`;
const dlv = (d, t) => `${formatDateLabel(d)}T${t}`;

/* ── 드롭다운(select) 옵션 ─────────────────────────────── */
/* 담당자 이름 목록은 시스템 관리 > 담당자 디렉터리(staff-mock)에서 파생 —
   담당자 관련설정에서 추가/삭제하면 B2C 담당자 피커에도 그대로 반영된다. */
export { staffNames, staffOptions };
export const B2C_STAFF = staffNames(); // 하위호환 스냅샷(라이브 목록은 staffNames() 사용)
export const B2C_CHANNELS = ["네이버 스토어", "카카오톡 채널", "전화 주문", "자사몰", "인스타그램 DM", "거래처 직접"];
/* 주문경로 부가 정보 — **표시 전용**이다. 정산은 거래처별 월 마감 단일 모델이라
   여기 수수료를 끼우면 정산·대쉬보드 집계까지 같이 뒤집어야 한다(→ backend-spec 10.4).
   ⚠️ 배열 `B2C_CHANNELS` 의 모양은 바꾸지 않는다 — `channel` 필드값이자 검색 대상이다.
   ⚠️ 레코드에 복사하지도 않는다 — 요율이 바뀌면 과거 주문과 어긋난다. */
export const B2C_CHANNEL_META = {
  "네이버 스토어":   { desc: "스마트스토어 주문 유입", fee: "수수료 3.5% · 정산 D+2" },
  "카카오톡 채널":   { desc: "상담 후 수동 접수",      fee: "수수료 없음 · 선결제" },
  "전화 주문":       { desc: "유선 상담 · 계좌 입금",  fee: "수수료 없음 · 입금 확인" },
  "자사몰":          { desc: "직접 결제 · PG 정산",    fee: "수수료 2.8% · 정산 D+3" },
  "인스타그램 DM":   { desc: "DM 상담 · 송금 확인",    fee: "수수료 없음" },
  "거래처 직접":     { desc: "거래처가 직접 접수",     fee: "월 청구에 합산" },
};
/* 결제 상태 — 주문서에 적힌 사실로 레코드에 남기되 파생·집계가 읽지 않는다(표시 전용). */
export const B2C_PAY_STATES = ["선결제 완료", "입금 대기", "후불 정산"];
/* 워크플로: 접수대기(신규 유입) → 주문접수(담당자 확인) → 배송완료(사진+인수자 저장 시 자동) */
export const B2C_STATUSES = ["접수대기", "주문접수", "배송완료", "취소"];
/* 주문상품 옵션(상품 규격 안내 카탈로그) — 선택 시 주문금액 자동 채움 */
export const B2C_PRODUCTS = ALL_PRODUCTS.map((p) => ({ name: p.product, price: priceNum(p.price) }));
export const productPrice = (name) => B2C_PRODUCTS.find((p) => p.name === name)?.price ?? 0;
/* 리본 경조사어 추천은 js/data/ribbon-phrases.js 단일 소스 (RIBBON_GROUPS / RIBBON_FLAT) */

/* 상태 배지 색은 두 주문 화면이 공유한다 → util/order-screen.js ORDER_STATUS_STYLE */

/* ── 초기 목데이터 (가변 모듈 상태) ────────────────────── */
export const B2C_ORDERS = [
  {
    id: "b1", orderNo: `${NO_PREFIX}-0006`, receivedAt: rcv(D.dayOff(0), "15:20"),
    manager: "", channel: "네이버 스토어", // API 자동등록 → 담당자 미지정(열면 담당자 지정 우선)
    ordererName: "정하윤", ordererPhone: "010-4821-3300",
    ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "정하윤",
    image: "", product: "근조바구니", amount: 50000,
    deliverAt: dlv(D.dayOff(1), "11:00"), request: "빈소 입구 우측에 배치 부탁드립니다.",
    recipientName: "故 김태수", recipientPhone: "010-3921-4400",
    address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", receiver: "",
    memo: "", status: "접수대기", notified: false, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b2", orderNo: `${NO_PREFIX}-0005`, receivedAt: rcv(D.dayOff(0), "10:05"),
    manager: "박사원", channel: "카카오톡 채널",
    ordererName: "이서준", ordererPhone: "010-5540-1180",
    ribbonPhrase: "축 결혼(祝 結婚)", ribbonSender: "이서준·김하은",
    image: "", product: "3단화환(고급형)", amount: 60000,
    deliverAt: dlv(D.dayOff(2), "13:30"), request: "예식 30분 전까지 도착 희망",
    recipientName: "혼주 김영호", recipientPhone: "010-8845-1120",
    address: "서울 서초구 강남대로 373 홀리데이인 서울강남 3층 그랜드볼룸", receiver: "",
    memo: "예식장 반입 확인 완료", status: "주문접수", notified: false, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b3", orderNo: `${NO_PREFIX}-0004`, receivedAt: rcv(D.dayOff(-1), "16:40"),
    manager: "이대리", channel: "전화 주문",
    ordererName: "최민재", ordererPhone: "010-2277-8130",
    ribbonPhrase: "축 개업(祝 開業)", ribbonSender: "(주)오버레이 임직원 일동",
    image: "", product: "4단화환(표준형)", amount: 95000,
    deliverAt: dlv(D.dayOff(0), "10:00"), request: "",
    recipientName: "박상무", recipientPhone: "010-6612-7788",
    address: "부산 해운대구 센텀중앙로 90 벡스코 제2전시장 로비", receiver: "박상무 비서 김지원",
    memo: "현장사진 발송 완료", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b4", orderNo: `${NO_PREFIX}-0003`, receivedAt: rcv(D.daysAgo(3), "09:30"),
    manager: "최과장", channel: "자사몰",
    ordererName: "한소희", ordererPhone: "010-7714-2206",
    ribbonPhrase: "화혼을 축하합니다", ribbonSender: "한소희",
    image: "", product: "중형 꽃바구니", amount: 80000,
    deliverAt: dlv(D.daysAgo(2), "14:00"), request: "리본 문구 오탈자 없이 확인 부탁",
    recipientName: "이지안", recipientPhone: "010-3326-7740",
    address: "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층", receiver: "이지안",
    memo: "", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
  {
    id: "b5", orderNo: `${NO_PREFIX}-0002`, receivedAt: rcv(D.daysAgo(4), "13:15"),
    manager: "오임찬", channel: "인스타그램 DM",
    ordererName: "강태오", ordererPhone: "010-9043-2271",
    ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "강태오",
    image: "", product: "서양란(고급형)", amount: 80000,
    deliverAt: dlv(D.daysAgo(3), "11:00"), request: "",
    recipientName: "윤대표", recipientPhone: "010-4471-9920",
    address: "서울 강남구 테헤란로 131 한국타이어빌딩 16층", receiver: "",
    memo: "결제 후 고객 변심으로 당일 취소 요청", status: "취소", notified: true,
    cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)",
  },
  {
    id: "b6", orderNo: `${NO_PREFIX}-0001`, receivedAt: rcv(D.daysAgo(5), "11:00"),
    manager: "김총무", channel: "거래처 직접",
    ordererName: "서지호", ordererPhone: "010-2240-6638",
    ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "고이장례연구소 일동",
    image: "", product: "동양란(기본형)", amount: 50000,
    deliverAt: dlv(D.daysAgo(4), "09:00"), request: "장례식장 정문에서 수령 확인 요망",
    recipientName: "故 박순자", recipientPhone: "010-5540-9902",
    address: "대전 중구 문화로 282 충남대학교병원 장례식장 5호실", receiver: "상주 박현우",
    memo: "", status: "배송완료", notified: true, cancelFee: 0, cancelReason: "",
  },
];

/* ── CRUD 헬퍼 (모듈 상태 직접 변경) ───────────────────── */
let idSeq = B2C_ORDERS.length;
let noSeq = B2C_ORDERS.length; // 최신 주문번호 시퀀스 — 시드가 늘면 따라온다(하드코딩 금지)

export function b2cList() { return B2C_ORDERS; }
export function b2cNewId() { return "b" + String(++idSeq) + "_" + Date.now().toString(36); }
export function b2cNextOrderNo() { return `${NO_PREFIX}-${String(++noSeq).padStart(4, "0")}`; }
export function b2cUpsert(rec) {
  const i = B2C_ORDERS.findIndex((o) => o.id === rec.id);
  if (i < 0) { B2C_ORDERS.unshift({ ...rec, history: rec.history || [] }); return; } // 신규는 최상단
  /* ⚠️ 모달 draft 는 history 를 싣지 않는다(얕은 복사로 배열 참조가 공유되면
     편집 취소가 이력을 되돌린다). rec 에 없으면 기존 것을 지킨다. */
  B2C_ORDERS[i] = { ...rec, history: rec.history || B2C_ORDERS[i].history || [] };
}
export function b2cRemove(id) {
  const i = B2C_ORDERS.findIndex((o) => o.id === id);
  if (i >= 0) B2C_ORDERS.splice(i, 1);
}
export function b2cSetStatus(id, status) {
  const o = B2C_ORDERS.find((x) => x.id === id);
  if (!o || o.status === status) return;
  o.status = status;
  if (status === "배송완료") {
    o.notified = true; // 배송완료 → 알림톡 자동 발송(API)
    pushHistory(o, "delivered", "배송완료 · 알림톡 발송");
  } else if (status === "취소") {
    pushHistory(o, "cancel", "주문취소");
  } else {
    pushHistory(o, "status", `${status}로 변경`);
  }
}
export function b2cSetManager(id, name) {
  const o = B2C_ORDERS.find((x) => x.id === id);
  if (!o || o.manager === name) return;
  o.manager = name; // API 미지정 주문에 담당자 배정(별도 모달에서 선택·입력)
  pushHistory(o, "manager", `담당자 ${name} 지정`);
}

/* 처리 이력 시드 — 각 레코드의 기존 날짜에서 분 오프셋으로만 파생한다.
   절대 날짜를 새로 쓰면 '오늘' 집계가 깨진다(파일 상단 경고 참조). */
B2C_ORDERS.forEach((o) => seedHistory(o, "receivedAt"));
