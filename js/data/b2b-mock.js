/* ============================================================
   b2b-mock.js — 거래처(B2B) 주문 목데이터.

   구 시스템 '거래처 주문 조회(202)' 의 신규 대응 화면(#/admin/orders)이 쓴다.
   포털 #/app/orders 는 로그인한 거래처 한 곳의 화면이라 자체 목데이터를 갖고,
   이쪽은 여러 거래처가 섞인 관리자 시야다 — 두 화면의 건수는 일치하지 않는다.

   ⚠️ 날짜는 DATA_NOW 기준 상대 생성(util/date.js mockDates). 절대값으로 박으면
      기본 필터('이번 달')에 걸리는 행이 사라져 표가 영구히 빈 화면이 된다.
   ⚠️ 상품·금액은 거래처의 clientNote(구 '거래처 참고사항') 조건을 따랐다.
      예: (주)홈팩은 특대 75,000 고정, (주)컴버스테크는 기본 80,000.
      데이터가 규칙과 어긋나면 화면에서 경고 배너와 값이 모순돼 보인다.
   실서비스에서는 서버 API로 대체.
   ============================================================ */
import { DATA_NOW } from "./admin-mock.js";
import { mockDates } from "../util/date.js";

const D = mockDates(DATA_NOW);

/* 워크플로는 B2C 와 동일 — 접수대기 → 주문접수 → 배송완료 + 취소. */
export const B2B_STATUSES = ["접수대기", "주문접수", "배송완료", "취소"];

export const B2B_ORDERS = [
  { id: "t1", orderNo: "B2B-0001", clientId: "C001", date: D.at(D.dayOff(0), "09:10"), sender: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", product: "3단화환(고급형)", amount: 60000, status: "접수대기", hasPhoto: false, receiver: "", staff: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t2", orderNo: "B2B-0002", clientId: "C008", date: D.at(D.dayOff(0), "10:40"), sender: "김동선 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", product: "3단화환(기본형)", amount: 50000, status: "주문접수", hasPhoto: false, receiver: "", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t3", orderNo: "B2B-0003", clientId: "C015", date: D.at(D.dayOff(0), "11:25"), sender: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", product: "3단화환(기본형)", amount: 50000, status: "주문접수", hasPhoto: false, receiver: "", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t4", orderNo: "B2B-0004", clientId: "C004", date: D.at(D.dayOff(0), "13:50"), sender: "홍성유", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", product: "3단화환(기본형)", amount: 50000, status: "접수대기", hasPhoto: false, receiver: "", staff: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t5", orderNo: "B2B-0005", clientId: "C011", date: D.at(D.dayOff(0), "15:05"), sender: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", product: "4단화환(표준형)", amount: 90000, status: "주문접수", hasPhoto: false, receiver: "", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t6", orderNo: "B2B-0006", clientId: "C018", date: D.at(D.dayOff(1), "09:00"), sender: "김상주", address: "부산 영락공원 장례식장 2분향실", product: "3단화환(기본형)", amount: 80000, status: "접수대기", hasPhoto: false, receiver: "", staff: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t7", orderNo: "B2B-0007", clientId: "C007", date: D.at(D.dayOff(1), "14:00"), sender: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", product: "근조바구니", amount: 50000, status: "접수대기", hasPhoto: false, receiver: "", staff: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t8", orderNo: "B2B-0008", clientId: "C014", date: D.at(D.dayOff(-1), "09:30"), sender: "김범섭", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", product: "쌀화환(10kg)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t9", orderNo: "B2B-0009", clientId: "C003", date: D.at(D.dayOff(-1), "11:10"), sender: "총무팀", address: "대전 중구 문화로 282 충남대학교병원 장례식장 2호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t10", orderNo: "B2B-0010", clientId: "C010", date: D.at(D.dayOff(-1), "16:40"), sender: "안준영", address: "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸", product: "3단화환(특대형)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t11", orderNo: "B2B-0011", clientId: "C017", date: D.at(D.dayOff(-1), "13:20"), sender: "구매팀", address: "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션", product: "3단화환(특대형)", amount: 75000, status: "취소", hasPhoto: false, receiver: "", staff: "김총무", request: "", memo: "", cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)" },
  { id: "t12", orderNo: "B2B-0012", clientId: "C006", date: D.at(D.daysAgo(2), "10:00"), sender: "심영택", address: "서울 서초구 반포대로 222 서울성모병원 장례식장 5호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t13", orderNo: "B2B-0013", clientId: "C013", date: D.at(D.daysAgo(3), "09:20"), sender: "물류팀", address: "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t14", orderNo: "B2B-0014", clientId: "C002", date: D.at(D.daysAgo(3), "15:40"), sender: "방태진", address: "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실", product: "중형 꽃바구니", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t15", orderNo: "B2B-0015", clientId: "C009", date: D.at(D.daysAgo(4), "11:05"), sender: "구매팀", address: "경북 경주시 보문로 465 화백컨벤션센터 2층", product: "탁상용 중형화분", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t16", orderNo: "B2B-0016", clientId: "C016", date: D.at(D.daysAgo(5), "14:15"), sender: "소경민", address: "인천 남동구 구월로 12 가천대길병원 장례식장 301호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t17", orderNo: "B2B-0017", clientId: "C005", date: D.at(D.daysAgo(6), "10:35"), sender: "영업팀", address: "경남 밀양시 밀양농협 장례식장", product: "3단화환(기본형)", amount: 50000, status: "취소", hasPhoto: false, receiver: "", staff: "박사원", request: "", memo: "", cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)" },
  { id: "t18", orderNo: "B2B-0018", clientId: "C012", date: D.at(D.daysAgo(7), "16:20"), sender: "담당 변호사", address: "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t19", orderNo: "B2B-0019", clientId: "C001", date: D.at(D.daysAgo(8), "09:45"), sender: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t20", orderNo: "B2B-0020", clientId: "C008", date: D.at(D.daysAgo(9), "13:00"), sender: "김동선 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t21", orderNo: "B2B-0021", clientId: "C015", date: D.at(D.daysAgo(10), "11:50"), sender: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t22", orderNo: "B2B-0022", clientId: "C004", date: D.at(D.daysAgo(11), "15:10"), sender: "홍성유", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t23", orderNo: "B2B-0023", clientId: "C011", date: D.at(D.daysAgo(12), "10:20"), sender: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", product: "4단화환(표준형)", amount: 90000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t24", orderNo: "B2B-0024", clientId: "C018", date: D.at(D.daysAgo(13), "14:40"), sender: "김상주", address: "부산 영락공원 장례식장 2분향실", product: "3단화환(기본형)", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t25", orderNo: "B2B-0025", clientId: "C007", date: D.at(D.daysAgo(14), "09:15"), sender: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", product: "근조바구니", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t26", orderNo: "B2B-0026", clientId: "C014", date: D.at(D.daysAgo(15), "16:05"), sender: "김범섭", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", product: "쌀화환(10kg)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t27", orderNo: "B2B-0027", clientId: "C003", date: D.at(D.daysAgo(16), "12:30"), sender: "총무팀", address: "대전 중구 문화로 282 충남대학교병원 장례식장 2호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t28", orderNo: "B2B-0028", clientId: "C010", date: D.at(D.daysAgo(17), "10:50"), sender: "안준영", address: "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸", product: "3단화환(특대형)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t29", orderNo: "B2B-0029", clientId: "C017", date: D.at(D.daysAgo(18), "15:25"), sender: "구매팀", address: "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션", product: "3단화환(특대형)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t30", orderNo: "B2B-0030", clientId: "C006", date: D.at(D.lastMonth(27), "14:00"), sender: "심영택", address: "서울 서초구 반포대로 222 서울성모병원 장례식장 5호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t31", orderNo: "B2B-0031", clientId: "C013", date: D.at(D.lastMonth(26), "10:30"), sender: "물류팀", address: "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t32", orderNo: "B2B-0032", clientId: "C002", date: D.at(D.lastMonth(24), "16:20"), sender: "방태진", address: "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실", product: "중형 꽃바구니", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t33", orderNo: "B2B-0033", clientId: "C009", date: D.at(D.lastMonth(22), "09:00"), sender: "구매팀", address: "경북 경주시 보문로 465 화백컨벤션센터 2층", product: "탁상용 중형화분", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t34", orderNo: "B2B-0034", clientId: "C016", date: D.at(D.lastMonth(20), "11:40"), sender: "소경민", address: "인천 남동구 구월로 12 가천대길병원 장례식장 301호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t35", orderNo: "B2B-0035", clientId: "C005", date: D.at(D.lastMonth(19), "15:00"), sender: "영업팀", address: "경남 밀양시 밀양농협 장례식장", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t36", orderNo: "B2B-0036", clientId: "C012", date: D.at(D.lastMonth(17), "13:30"), sender: "담당 변호사", address: "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t37", orderNo: "B2B-0037", clientId: "C001", date: D.at(D.lastMonth(15), "10:15"), sender: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", product: "3단화환(고급형)", amount: 60000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t38", orderNo: "B2B-0038", clientId: "C008", date: D.at(D.lastMonth(13), "16:45"), sender: "김동선 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t39", orderNo: "B2B-0039", clientId: "C015", date: D.at(D.lastMonth(12), "09:50"), sender: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t40", orderNo: "B2B-0040", clientId: "C004", date: D.at(D.lastMonth(10), "14:20"), sender: "홍성유", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", product: "3단화환(기본형)", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "총무부 최현", staff: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t41", orderNo: "B2B-0041", clientId: "C011", date: D.at(D.lastMonth(8), "11:00"), sender: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", product: "4단화환(표준형)", amount: 90000, status: "배송완료", hasPhoto: true, receiver: "상주 김민우", staff: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t42", orderNo: "B2B-0042", clientId: "C018", date: D.at(D.lastMonth(6), "15:35"), sender: "김상주", address: "부산 영락공원 장례식장 2분향실", product: "3단화환(기본형)", amount: 80000, status: "배송완료", hasPhoto: true, receiver: "상주 박현우", staff: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t43", orderNo: "B2B-0043", clientId: "C007", date: D.at(D.lastMonth(4), "10:05"), sender: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", product: "근조바구니", amount: 50000, status: "배송완료", hasPhoto: true, receiver: "혼주 이영호", staff: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t44", orderNo: "B2B-0044", clientId: "C014", date: D.at(D.lastMonth(2), "13:15"), sender: "김범섭", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", product: "쌀화환(10kg)", amount: 75000, status: "배송완료", hasPhoto: true, receiver: "비서 김지원", staff: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
];

/* ── 조회 헬퍼 ─────────────────────────────────────────────── */
export function b2bList() { return B2B_ORDERS; }
export function b2bFind(id) { return B2B_ORDERS.find((o) => o.id === id) || null; }
export function b2bUpsert(rec) {
  const i = B2B_ORDERS.findIndex((o) => o.id === rec.id);
  if (i >= 0) B2B_ORDERS[i] = { ...rec };
}
export function b2bSetStatus(id, status) {
  const o = b2bFind(id);
  if (!o) return;
  o.status = status;
  if (status === "배송완료") o.hasPhoto = true; // 배송완료 = 현장사진 첨부 완료
}
