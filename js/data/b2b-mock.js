/* ============================================================
   b2b-mock.js — 거래처(B2B) 주문 목데이터.

   **B2B 주문의 단일 소스**다(2026-10-16 운영자 결정 '주문과 정산을 완전히 연결'). 관리자 주문관리
   (#/admin/orders) · 포털 실시간 주문내역(#/app/orders, 로그인 거래처 것만) · 포털 주문 접수(#/app/order)
   가 모두 여기를 읽고 쓴다. 예전엔 포털이 자체 목데이터 16건을 들고 있어 두 화면이 서로 다른 주문을 보였다.

   시드는 세 갈래다 — 아래 '시드 조립' 참조.
     (a) 손으로 쓴 44건(t1~t44, B2B-0001~0044) — DATA_NOW 상대 날짜.
     (b) 거래명세서 실데이터(invoice-mock.js INVOICE_DB)의 행 → 배송완료 주문(절대 날짜).
     (c) 생성 주문 — 거래처마다 최근 6개월(이번 달 포함), (거래처 번호, 절대 년·월) 씨앗으로 결정적.
   그 위에 사용자의 변경분만(store.orderOps) 덧입힌다 — 새로고침해도 수정·취소·삭제·포털 접수가 남는다.

   ⚠️ 손으로 쓴 44건의 날짜는 DATA_NOW 기준 상대 생성(util/date.js mockDates). 절대값으로 박으면
      기본 필터('이번 달')에 걸리는 행이 사라져 표가 영구히 빈 화면이 된다.
   ⚠️ 상품·금액은 거래처의 clientNote(구 '거래처 참고사항') 조건을 따랐다.
      예: (주)홈박스은 특대 75,000 고정, (주)코어테크는 기본 80,000.
      데이터가 규칙과 어긋나면 화면에서 경고 배너와 값이 모순돼 보인다.
   ⚠️ 레코드 스키마는 b2c-mock 과 같은 모양을 유지한다 — 두 주문 화면이
      같은 컬럼·같은 모달을 쓰기 때문이다. 필드를 한쪽에만 추가하지 말 것.
      ordererName = 주문을 넣은 거래처 담당자, ribbonSender = 리본에 새겨질
      보내는분. 둘은 다른 값이다(구 sender 하나로 뭉쳐 있었다).
   실서비스에서는 서버 API로 대체.
   ============================================================ */
/* import 방향: b2b-mock → store → admin-mock → settlement-rules, b2b-mock → invoice-mock(시드 INVOICE_DB 만).
   store·admin-mock·invoice-mock 은 이 모듈을 import 하지 않는다 — 거꾸로 걸면 순환이다.
   정산 계산(이용 내역 · 청구금액 · 명세서 행)은 이 모듈을 읽는 `js/util/settlement.js` 층에서 한다. */
import { DATA_NOW, INITIAL_CLIENTS, SEED_BILLING } from "./admin-mock.js";
import { INVOICE_DB } from "./invoice-mock.js";
import { store, ALL_PRODUCTS, priceNum } from "../store.js";
import { periodOf, fmtAt } from "./settlement-rules.js";
import { seedHistory, pushHistory, histAt } from "./order-history.js";
import { formatDateLabel, mockDates } from "../util/date.js";

const D = mockDates(DATA_NOW);
/* 배송 희망일시 — datetime-local 포맷("YYYY-MM-DDTHH:mm").
   ⚠️ T 를 빠뜨리면 날짜가 통째로 NaN 이 된다(b2c-mock 의 dlv 와 같은 규약). */
const dlv = (d, t) => `${formatDateLabel(d)}T${t}`;

/* 워크플로는 B2C 와 동일 — 접수대기 → 주문접수 → 배송완료 + 취소. */
export const B2B_STATUSES = ["접수대기", "주문접수", "배송완료", "취소"];

/* (a) 손으로 쓴 44건. 내보내지 않는다 — 화면은 b2bList() 만 읽는다(시드 + 변경분). */
const HAND_ORDERS = [
  { id: "t1", orderNo: "B2B-0001", clientId: "C001", date: D.at(D.dayOff(0), "09:10"), ordererName: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", deliverAt: dlv(D.dayOff(0), "13:30"), recipientName: "故 김태수", recipientPhone: "010-3200-4100", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "한빛과학(주) 임직원 일동", image: "", notified: false, product: "3단화환(고급형)", amount: 60000, status: "접수대기", receiver: "", manager: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t2", orderNo: "B2B-0002", clientId: "C008", date: D.at(D.dayOff(0), "10:40"), ordererName: "정민수 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", deliverAt: dlv(D.dayOff(0), "14:30"), recipientName: "故 정만호", recipientPhone: "010-3207-4113", ribbonPhrase: "근조(謹弔)", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: false, product: "3단화환(기본형)", amount: 50000, status: "주문접수", receiver: "", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t3", orderNo: "B2B-0003", clientId: "C015", date: D.at(D.dayOff(0), "11:25"), ordererName: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", deliverAt: dlv(D.dayOff(0), "15:30"), recipientName: "故 오병철", recipientPhone: "010-3214-4126", ribbonPhrase: "조의를 표합니다", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: false, product: "3단화환(기본형)", amount: 50000, status: "주문접수", receiver: "", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t4", orderNo: "B2B-0004", clientId: "C004", date: D.at(D.dayOff(0), "13:50"), ordererName: "최유진", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", deliverAt: dlv(D.dayOff(0), "17:30"), recipientName: "강윤재 본부장", recipientPhone: "010-5100-6200", ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "푸른누리협회 임직원 일동", image: "", notified: false, product: "3단화환(기본형)", amount: 50000, status: "접수대기", receiver: "", manager: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t5", orderNo: "B2B-0005", clientId: "C011", date: D.at(D.dayOff(0), "15:05"), ordererName: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", deliverAt: dlv(D.dayOff(1), "10:00"), recipientName: "故 배순임", recipientPhone: "010-3221-4139", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)온누리헬스 임직원 일동", image: "", notified: false, product: "4단화환(표준형)", amount: 90000, status: "주문접수", receiver: "", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t6", orderNo: "B2B-0006", clientId: "C018", date: D.at(D.dayOff(1), "09:00"), ordererName: "전하율", address: "부산 영락공원 장례식장 2분향실", deliverAt: dlv(D.dayOff(1), "13:30"), recipientName: "故 하동수", recipientPhone: "010-3228-4152", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)코어테크 임직원 일동", image: "", notified: false, product: "3단화환(기본형)", amount: 80000, status: "접수대기", receiver: "", manager: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t7", orderNo: "B2B-0007", clientId: "C007", date: D.at(D.dayOff(1), "14:00"), ordererName: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", deliverAt: dlv(D.dayOff(1), "18:30"), recipientName: "故 남기석", recipientPhone: "010-3235-4165", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "고이메모리얼 임직원 일동", image: "", notified: false, product: "근조바구니", amount: 50000, status: "접수대기", receiver: "", manager: "", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t8", orderNo: "B2B-0008", clientId: "C014", date: D.at(D.dayOff(-1), "09:30"), ordererName: "황보라", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", deliverAt: dlv(D.dayOff(-1), "13:30"), recipientName: "故 김복순", recipientPhone: "010-3242-4178", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)파란코드 임직원 일동", image: "", notified: true, product: "쌀화환(10kg)", amount: 75000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t9", orderNo: "B2B-0009", clientId: "C003", date: D.at(D.dayOff(-1), "11:10"), ordererName: "총무팀", address: "대전 중구 문화로 282 충남대학교병원 장례식장 2호실", deliverAt: dlv(D.dayOff(-1), "15:30"), recipientName: "故 윤재호", recipientPhone: "010-3249-4191", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)동행코퍼레이션 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t10", orderNo: "B2B-0010", clientId: "C010", date: D.at(D.dayOff(-1), "16:40"), ordererName: "임수빈", address: "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸", deliverAt: dlv(D.dayOff(0), "10:00"), recipientName: "최현 총무부장", recipientPhone: "010-5109-6211", ribbonPhrase: "화혼을 축하합니다", ribbonSender: "(주)대성금속 임직원 일동", image: "", notified: true, product: "3단화환(특대형)", amount: 75000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t11", orderNo: "B2B-0011", clientId: "C017", date: D.at(D.dayOff(-1), "13:20"), ordererName: "구매팀", address: "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션", deliverAt: dlv(D.dayOff(-1), "17:30"), recipientName: "임세라 대표", recipientPhone: "010-5118-6222", ribbonPhrase: "축 개업(祝 開業)", ribbonSender: "(주)홈박스 임직원 일동", image: "", notified: false, product: "3단화환(특대형)", amount: 75000, status: "취소", receiver: "", manager: "김총무", request: "", memo: "", cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)" },
  { id: "t12", orderNo: "B2B-0012", clientId: "C006", date: D.at(D.daysAgo(2), "10:00"), ordererName: "강하은", address: "서울 서초구 반포대로 222 서울성모병원 장례식장 5호실", deliverAt: dlv(D.daysAgo(2), "14:30"), recipientName: "故 박순자", recipientPhone: "010-3256-4204", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)맛깔채 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t13", orderNo: "B2B-0013", clientId: "C013", date: D.at(D.daysAgo(3), "09:20"), ordererName: "물류팀", address: "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", deliverAt: dlv(D.daysAgo(3), "13:30"), recipientName: "故 서말순", recipientPhone: "010-3263-4217", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "(주)다온유통 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t14", orderNo: "B2B-0014", clientId: "C002", date: D.at(D.daysAgo(3), "15:40"), ordererName: "이서연", address: "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실", deliverAt: dlv(D.daysAgo(2), "10:00"), recipientName: "故 방일남", recipientPhone: "010-3270-4230", ribbonPhrase: "근조(謹弔)", ribbonSender: "새봄푸드(주) 임직원 일동", image: "", notified: true, product: "중형 꽃바구니", amount: 80000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t15", orderNo: "B2B-0015", clientId: "C009", date: D.at(D.daysAgo(4), "11:05"), ordererName: "구매팀", address: "경북 경주시 보문로 465 화백컨벤션센터 2층", deliverAt: dlv(D.daysAgo(4), "15:30"), recipientName: "정경호 원장", recipientPhone: "010-5127-6233", ribbonPhrase: "축 개업(祝 開業)", ribbonSender: "(주)싱싱마켓 임직원 일동", image: "", notified: true, product: "탁상용 중형화분", amount: 80000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t16", orderNo: "B2B-0016", clientId: "C016", date: D.at(D.daysAgo(5), "14:15"), ordererName: "배준영", address: "인천 남동구 구월로 12 가천대길병원 장례식장 301호실", deliverAt: dlv(D.daysAgo(5), "18:30"), recipientName: "故 이말순", recipientPhone: "010-3277-4243", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "주식회사 레이어드 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t17", orderNo: "B2B-0017", clientId: "C005", date: D.at(D.daysAgo(6), "10:35"), ordererName: "영업팀", address: "경남 밀양시 밀양농협 장례식장", deliverAt: dlv(D.daysAgo(6), "14:30"), recipientName: "故 김두식", recipientPhone: "010-3284-4256", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)바다향 임직원 일동", image: "", notified: false, product: "3단화환(기본형)", amount: 50000, status: "취소", receiver: "", manager: "박사원", request: "", memo: "", cancelFee: 10000, cancelReason: "고객 단순 변심 (제작 착수 전)" },
  { id: "t18", orderNo: "B2B-0018", clientId: "C012", date: D.at(D.daysAgo(7), "16:20"), ordererName: "담당 변호사", address: "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층", deliverAt: dlv(D.daysAgo(6), "10:00"), recipientName: "혼주 한동수", recipientPhone: "010-5136-6244", ribbonPhrase: "화혼을 축하합니다", ribbonSender: "법무법인 바른길 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t19", orderNo: "B2B-0019", clientId: "C001", date: D.at(D.daysAgo(8), "09:45"), ordererName: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", deliverAt: dlv(D.daysAgo(8), "13:30"), recipientName: "故 김태수", recipientPhone: "010-3200-4100", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "한빛과학(주) 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t20", orderNo: "B2B-0020", clientId: "C008", date: D.at(D.daysAgo(9), "13:00"), ordererName: "정민수 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", deliverAt: dlv(D.daysAgo(9), "17:30"), recipientName: "故 정만호", recipientPhone: "010-3207-4113", ribbonPhrase: "근조(謹弔)", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t21", orderNo: "B2B-0021", clientId: "C015", date: D.at(D.daysAgo(10), "11:50"), ordererName: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", deliverAt: dlv(D.daysAgo(10), "15:30"), recipientName: "故 오병철", recipientPhone: "010-3214-4126", ribbonPhrase: "조의를 표합니다", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t22", orderNo: "B2B-0022", clientId: "C004", date: D.at(D.daysAgo(11), "15:10"), ordererName: "최유진", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", deliverAt: dlv(D.daysAgo(10), "10:00"), recipientName: "강윤재 본부장", recipientPhone: "010-5100-6200", ribbonPhrase: "화혼을 축하합니다", ribbonSender: "푸른누리협회 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t23", orderNo: "B2B-0023", clientId: "C011", date: D.at(D.daysAgo(12), "10:20"), ordererName: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", deliverAt: dlv(D.daysAgo(12), "14:30"), recipientName: "故 배순임", recipientPhone: "010-3221-4139", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)온누리헬스 임직원 일동", image: "", notified: true, product: "4단화환(표준형)", amount: 90000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t24", orderNo: "B2B-0024", clientId: "C018", date: D.at(D.daysAgo(13), "14:40"), ordererName: "전하율", address: "부산 영락공원 장례식장 2분향실", deliverAt: dlv(D.daysAgo(13), "18:30"), recipientName: "故 하동수", recipientPhone: "010-3228-4152", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)코어테크 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 80000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t25", orderNo: "B2B-0025", clientId: "C007", date: D.at(D.daysAgo(14), "09:15"), ordererName: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", deliverAt: dlv(D.daysAgo(14), "13:30"), recipientName: "故 남기석", recipientPhone: "010-3235-4165", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "고이메모리얼 임직원 일동", image: "", notified: true, product: "근조바구니", amount: 50000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t26", orderNo: "B2B-0026", clientId: "C014", date: D.at(D.daysAgo(15), "16:05"), ordererName: "황보라", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", deliverAt: dlv(D.daysAgo(14), "10:00"), recipientName: "故 김복순", recipientPhone: "010-3242-4178", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)파란코드 임직원 일동", image: "", notified: true, product: "쌀화환(10kg)", amount: 75000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t27", orderNo: "B2B-0027", clientId: "C003", date: D.at(D.daysAgo(16), "12:30"), ordererName: "총무팀", address: "대전 중구 문화로 282 충남대학교병원 장례식장 2호실", deliverAt: dlv(D.daysAgo(16), "16:30"), recipientName: "故 윤재호", recipientPhone: "010-3249-4191", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)동행코퍼레이션 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t28", orderNo: "B2B-0028", clientId: "C010", date: D.at(D.daysAgo(17), "10:50"), ordererName: "임수빈", address: "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸", deliverAt: dlv(D.daysAgo(17), "14:30"), recipientName: "최현 총무부장", recipientPhone: "010-5109-6211", ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "(주)대성금속 임직원 일동", image: "", notified: true, product: "3단화환(특대형)", amount: 75000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t29", orderNo: "B2B-0029", clientId: "C017", date: D.at(D.daysAgo(18), "15:25"), ordererName: "구매팀", address: "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션", deliverAt: dlv(D.daysAgo(17), "10:00"), recipientName: "임세라 대표", recipientPhone: "010-5118-6222", ribbonPhrase: "축 결혼(祝 結婚)", ribbonSender: "(주)홈박스 임직원 일동", image: "", notified: true, product: "3단화환(특대형)", amount: 75000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t30", orderNo: "B2B-0030", clientId: "C006", date: D.at(D.lastMonth(27), "14:00"), ordererName: "강하은", address: "서울 서초구 반포대로 222 서울성모병원 장례식장 5호실", deliverAt: dlv(D.lastMonth(27), "18:30"), recipientName: "故 박순자", recipientPhone: "010-3256-4204", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)맛깔채 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t31", orderNo: "B2B-0031", clientId: "C013", date: D.at(D.lastMonth(26), "10:30"), ordererName: "물류팀", address: "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실", deliverAt: dlv(D.lastMonth(26), "14:30"), recipientName: "故 서말순", recipientPhone: "010-3263-4217", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "(주)다온유통 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t32", orderNo: "B2B-0032", clientId: "C002", date: D.at(D.lastMonth(24), "16:20"), ordererName: "이서연", address: "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실", deliverAt: dlv(D.lastMonth(24), "18:30"), recipientName: "故 방일남", recipientPhone: "010-3270-4230", ribbonPhrase: "근조(謹弔)", ribbonSender: "새봄푸드(주) 임직원 일동", image: "", notified: true, product: "중형 꽃바구니", amount: 80000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t33", orderNo: "B2B-0033", clientId: "C009", date: D.at(D.lastMonth(22), "09:00"), ordererName: "구매팀", address: "경북 경주시 보문로 465 화백컨벤션센터 2층", deliverAt: dlv(D.lastMonth(22), "13:30"), recipientName: "정경호 원장", recipientPhone: "010-5127-6233", ribbonPhrase: "축 결혼(祝 結婚)", ribbonSender: "(주)싱싱마켓 임직원 일동", image: "", notified: true, product: "탁상용 중형화분", amount: 80000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t34", orderNo: "B2B-0034", clientId: "C016", date: D.at(D.lastMonth(20), "11:40"), ordererName: "배준영", address: "인천 남동구 구월로 12 가천대길병원 장례식장 301호실", deliverAt: dlv(D.lastMonth(20), "15:30"), recipientName: "故 이말순", recipientPhone: "010-3277-4243", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "주식회사 레이어드 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t35", orderNo: "B2B-0035", clientId: "C005", date: D.at(D.lastMonth(19), "15:00"), ordererName: "영업팀", address: "경남 밀양시 밀양농협 장례식장", deliverAt: dlv(D.lastMonth(19), "18:30"), recipientName: "故 김두식", recipientPhone: "010-3284-4256", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)바다향 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t36", orderNo: "B2B-0036", clientId: "C012", date: D.at(D.lastMonth(17), "13:30"), ordererName: "담당 변호사", address: "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층", deliverAt: dlv(D.lastMonth(17), "17:30"), recipientName: "혼주 한동수", recipientPhone: "010-5136-6244", ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "법무법인 바른길 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t37", orderNo: "B2B-0037", clientId: "C001", date: D.at(D.lastMonth(15), "10:15"), ordererName: "한지훈", address: "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실", deliverAt: dlv(D.lastMonth(15), "14:30"), recipientName: "故 김태수", recipientPhone: "010-3200-4100", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "한빛과학(주) 임직원 일동", image: "", notified: true, product: "3단화환(고급형)", amount: 60000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t38", orderNo: "B2B-0038", clientId: "C008", date: D.at(D.lastMonth(13), "16:45"), ordererName: "정민수 변호사실", address: "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실", deliverAt: dlv(D.lastMonth(13), "18:30"), recipientName: "故 정만호", recipientPhone: "010-3207-4113", ribbonPhrase: "근조(謹弔)", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t39", orderNo: "B2B-0039", clientId: "C015", date: D.at(D.lastMonth(12), "09:50"), ordererName: "자문팀", address: "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실", deliverAt: dlv(D.lastMonth(12), "13:30"), recipientName: "故 오병철", recipientPhone: "010-3214-4126", ribbonPhrase: "조의를 표합니다", ribbonSender: "법무법인 한결 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t40", orderNo: "B2B-0040", clientId: "C004", date: D.at(D.lastMonth(10), "14:20"), ordererName: "최유진", address: "제주 제주시 첨단로 242 제주첨단과학기술단지 컨벤션홀", deliverAt: dlv(D.lastMonth(10), "18:30"), recipientName: "강윤재 본부장", recipientPhone: "010-5100-6200", ribbonPhrase: "축 취임(祝 就任)", ribbonSender: "푸른누리협회 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 50000, status: "배송완료", receiver: "총무부 최현", manager: "오임찬", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t41", orderNo: "B2B-0041", clientId: "C011", date: D.at(D.lastMonth(8), "11:00"), ordererName: "마케팅팀", address: "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실", deliverAt: dlv(D.lastMonth(8), "15:30"), recipientName: "故 배순임", recipientPhone: "010-3221-4139", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)온누리헬스 임직원 일동", image: "", notified: true, product: "4단화환(표준형)", amount: 90000, status: "배송완료", receiver: "상주 김민우", manager: "김총무", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t42", orderNo: "B2B-0042", clientId: "C018", date: D.at(D.lastMonth(6), "15:35"), ordererName: "전하율", address: "부산 영락공원 장례식장 2분향실", deliverAt: dlv(D.lastMonth(6), "18:30"), recipientName: "故 하동수", recipientPhone: "010-3228-4152", ribbonPhrase: "조의를 표합니다", ribbonSender: "(주)코어테크 임직원 일동", image: "", notified: true, product: "3단화환(기본형)", amount: 80000, status: "배송완료", receiver: "상주 박현우", manager: "박사원", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t43", orderNo: "B2B-0043", clientId: "C007", date: D.at(D.lastMonth(4), "10:05"), ordererName: "관리부", address: "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실", deliverAt: dlv(D.lastMonth(4), "14:30"), recipientName: "故 남기석", recipientPhone: "010-3235-4165", ribbonPhrase: "삼가 고인의 명복을 빕니다", ribbonSender: "고이메모리얼 임직원 일동", image: "", notified: true, product: "근조바구니", amount: 50000, status: "배송완료", receiver: "혼주 이영호", manager: "이대리", request: "", memo: "", cancelFee: 0, cancelReason: "" },
  { id: "t44", orderNo: "B2B-0044", clientId: "C014", date: D.at(D.lastMonth(2), "13:15"), ordererName: "황보라", address: "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실", deliverAt: dlv(D.lastMonth(2), "17:30"), recipientName: "故 김복순", recipientPhone: "010-3242-4178", ribbonPhrase: "근조(謹弔)", ribbonSender: "(주)파란코드 임직원 일동", image: "", notified: true, product: "쌀화환(10kg)", amount: 75000, status: "배송완료", receiver: "비서 김지원", manager: "최과장", request: "", memo: "", cancelFee: 0, cancelReason: "" },
];


/* ════════════════════════════════════════════════════════════
   (b)(c) 시드 조립 — 거래명세서 실데이터 행 + 생성 주문
   ════════════════════════════════════════════════════════════
   ⚠️ **결정적이어야 한다.** 같은 (거래처, 달)은 새로고침해도 · 달이 바뀌어도 같은 주문이어야 한다 —
      사용자의 수정은 시드 id 에 덧입혀지므로(store.orderOps.patched), 시드가 흔들리면 수정이 엉뚱한 주문에
      붙는다. 그래서 씨앗·id·주문번호는 **절대 년·월**에서 나오고(상대 m 금지), 한 주문의 난수는 분기와
      무관하게 **미리 정해진 개수만** 뽑는다(지금 시각에 따라 갈리는 상태 분기가 뒤 주문의 난수를 밀면 안 된다).
   ⚠️ 지금 시각(DATA_NOW)에 따라 달라지는 것은 **상태**(배송일이 지났으면 배송완료 — 앞으로만 간다)와, 주문일이 아직
      오지 않은 주문의 주문일(오늘·어제로 당긴다 — 그 날이 오면 제 날짜로 굳는다)뿐이다.
   ⚠️ 문자열은 전부 가상 값이다 — 실제 회사·사람·연락처를 넣지 말 것(공개 저장소·공개 사이트). */

const pad2 = (n) => String(n).padStart(2, "0");
/** Date → "YYYY/MM/DD HH:mm"(B2B 주문일 포맷) */
const atStr = (d) => `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** Date → "YYYY-MM-DDTHH:mm"(배송일시 포맷) */
const dlvStr = (d) => `${formatDateLabel(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const idNum = (id) => parseInt(String(id).replace(/\D/g, ""), 10) || 0;

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

/* ── 문자열 풀 — 기존 시드(손으로 쓴 44건·INVOICE_DB)에서 모았다 ──
   ⚠️ 지역 규칙(intake-rules)에 걸리는 주소는 뺐다 — 부산 영락공원(근조오브제만 반입) · 제주(추가 배송비).
      생성 주문은 카탈로그 금액 그대로라 배송비·반입 제한이 붙는 주소면 금액과 규칙이 모순돼 보인다. */
const OBIT_VENUES = [
  "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실",
  "광주 동구 필문대로 365 조선대학교병원 장례식장 1호실",
  "충북 청주시 흥덕구 1순환로 776 청주성모병원 장례식장 5호실",
  "경기 성남시 분당구 야탑로 59 분당차병원 장례식장 특실",
  "강원 춘천시 백령로 156 강원대학교병원 장례식장 특실",
  "충남 천안시 동남구 망향로 201 순천향대 천안병원 장례식장 3호실",
  "대전 중구 문화로 282 충남대학교병원 장례식장 2호실",
  "서울 서초구 반포대로 222 서울성모병원 장례식장 5호실",
  "대구 중구 달성로 56 계명대 동산병원 장례식장 4호실",
  "전북 전주시 덕진구 백제대로 567 전북대학교병원 장례식장 특2호실",
  "인천 남동구 구월로 12 가천대길병원 장례식장 301호실",
  "경기 수원시 영통구 월드컵로 164 아주대학교병원 장례식장 5호실",
  "부산 서구 감천로 262 고신대복음병원 장례식장 2호실",
  "울산 동구 방어진순환도로 877 울산대학교병원 장례식장 2호실",
  "전북 익산시 무왕로 895 원광대학교병원 장례식장 2호실",
];
const CELEB_VENUES = [
  "울산 남구 삼산로 200 울산롯데호텔 3층 크리스탈볼룸",
  "서울 송파구 올림픽로 300 롯데월드타워 SKY31 컨벤션",
  "경북 경주시 보문로 465 화백컨벤션센터 2층",
  "경기 수원시 영통구 광교중앙로 140 수원컨벤션센터 3층",
  "인천 연수구 컨벤시아대로 165 송도컨벤시아 2층 프리미어볼룸",
  "대구 수성구 동대구로 305 호텔인터불고 엑스코 3층",
  "경기 성남시 분당구 판교역로 160 카노푸스 웨딩홀 4층",
  "서울 서초구 강남대로 373 홀리데이인 서울강남 그랜드볼룸",
  "경기 고양시 일산동구 정발산로 24 웨스턴돔 웨딩홀 5층",
  "부산 해운대구 마린시티2로 33 파라다이스호텔 그랜드볼룸",
  "서울 강남구 테헤란로 406 아펠가모 삼성 4층 그랜드홀",
  "서울 중구 을지로 30 롯데호텔서울 3층 크리스탈볼룸",
];
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "송", "홍"];
const GIVEN = ["민수", "서연", "지훈", "하은", "도윤", "수빈", "예준", "지아", "현우", "유진", "태호", "은서", "준영", "나연",
  "성민", "다은", "재원", "소율", "경호", "미숙", "영철", "순자", "말순", "기석", "동수", "복순"];
const TITLES = ["대표", "원장", "본부장", "이사", "센터장"];
const RIBBON = {
  obit: ["삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다"],
  wed: ["축 결혼(祝 結婚)", "화혼을 진심으로 축하드립니다", "행복한 새 출발을 축하합니다"],
  open: ["축 개업(祝 開業)", "축 취임(祝 就任)", "번창하시길 기원합니다"],
};
const RECEIVERS = {
  obit: ["상주 박현우", "상주 김민우", "유족 이수진", "장례식장 사무실"],
  celeb: ["비서 김지원", "총무부 최현", "혼주 이영호", "행사 담당자"],
};
/* 우리 직원(staff-mock 의 담당자). 시드라 고정 목록을 쓴다 — 담당자 설정을 바꿔도 지난 주문의 담당자는 그대로다. */
const STAFF = ["김총무", "박사원", "이대리", "최과장", "오임찬"];
const CANCEL_REASONS = ["고객 단순 변심 (제작 착수 전)", "행사 일정 변경", "중복 주문", "배송지 변경으로 재주문"];
const DELIVER_TIMES = ["10:00", "11:00", "13:30", "14:30", "15:30", "16:30", "17:30", "18:30"];
const ORDER_TIMES = ["09:10", "09:40", "10:20", "11:05", "13:15", "14:40", "15:50", "16:35", "17:20"];

/* 거래 조건(clientNote)을 따르는 상품·금액 — [상품명(카탈로그명과 정확히 같게), 금액, 비중].
   ⚠️ 거래 조건과 어긋나면 상세 모달의 '거래 조건' 카드와 값이 모순돼 보인다(손으로 쓴 44건과 같은 규칙). */
const CLIENT_GOODS = {
  C001: [["3단화환(고급형)", 60000, 5], ["근조바구니", 50000, 2], ["쌀화환(10kg)", 75000, 1], ["중형 꽃바구니", 80000, 1], ["근조오브제(1단형)", 50000, 1]], // 화환 6만
  C003: [["3단화환(고급형)", 60000, 1]],                                                           // 항상 고급 60,000 고정
  C004: [["3단화환(기본형)", 50000, 3], ["3단화환(고급형)", 60000, 2], ["3단화환(특대형)", 75000, 1]], // 기본 50 · 고급 60 · 특대 75
  C010: [["3단화환(기본형)", 50000, 4], ["3단화환(특대형)", 75000, 1]],                              // 기본 50, 필요 시 특대 75
  C011: [["3단화환(기본형)", 50000, 4], ["4단화환(표준형)", 90000, 2], ["탁상용 중형화분", 80000, 1], ["서양란(고급형)", 80000, 1]], // 3단 50 · 4단 90 · 화분·란 80
  C012: [["3단화환(기본형)", 50000, 1]],                                                           // 화환 5만원
  C014: [["3단화환(특대형)", 75000, 4], ["쌀화환(10kg)", 75000, 1]],                                 // 특대 75,000 고정 · 쌀 10kg 75,000
  C016: [["3단화환(고급형)", 60000, 1]],                                                           // 항상 고급형 60,000
  C017: [["3단화환(특대형)", 75000, 1]],                                                           // 75,000 기재, 무조건 특대
  C018: [["3단화환(기본형)", 80000, 1]],                                                           // 무조건 8만(기본)
};
/* 거래 조건이 없는 거래처 — 카탈로그 상품을 섞고 금액은 카탈로그 정가. */
const catalogPrice = (name) => priceNum((ALL_PRODUCTS.find((p) => p.product === name) || {}).price);
const DEFAULT_GOODS = [
  ["3단화환(기본형)", 30], ["3단화환(고급형)", 18], ["3단화환(특대형)", 12], ["근조바구니", 8], ["근조오브제(1단형)", 5],
  ["쌀화환(10kg)", 6], ["4단화환(표준형)", 5], ["동양란(기본형)", 6], ["서양란(고급형)", 3], ["탁상용 중형화분", 4], ["중형 꽃바구니", 3],
].map(([n, w]) => [n, catalogPrice(n), w]);
const goodsOf = (clientId) => CLIENT_GOODS[clientId] || DEFAULT_GOODS;
function pickGoods(list, r) {
  const total = list.reduce((a, g) => a + g[2], 0);
  let x = r * total;
  for (const g of list) { if ((x -= g[2]) < 0) return g; }
  return list[list.length - 1];
}
/* 상품이 경조사를 정한다 — 근조 상품은 부고, 화분·란·꽃바구니는 개업·취임, 화환류는 부고가 대부분. */
function occasionOf(product, r) {
  if (product.startsWith("근조")) return "obit";
  if (/화분|란\(|꽃바구니/.test(product)) return "open";
  if (r < 0.7) return "obit";
  return r < 0.85 ? "wed" : "open";
}
function recipientOf(occ, rName, rTitle) {
  const nm = pick(SURNAMES, rName) + pick(GIVEN, (rName * 7.31) % 1);
  if (occ === "obit") return `故 ${nm}`;
  if (occ === "wed") return `혼주 ${nm}`;
  return `${nm} ${pick(TITLES, rTitle)}`;
}
/* 가상 번호 — 010-0000-0NNN 꼴. */
const fakePhone = (r) => `010-0000-0${100 + Math.floor(r * 900)}`;

const SEED_CLIENTS = new Map(INITIAL_CLIENTS.map((c) => [c.id, c]));
const companyOf = (clientId) => (SEED_CLIENTS.get(clientId) || {}).companyName || "";
/* 주문을 넣은 사람(발송인) — 그 거래처 담당자 이름 또는 부서. */
function ordererOf(clientId, r) {
  const c = SEED_CLIENTS.get(clientId) || {};
  const [name, role] = SEED_BILLING[clientId] || [c.managerName || "", ""];
  if (r < 0.55 && name) return name;
  if (c.department) return c.department;
  return String(role || "").split(" ")[0] || name || "총무팀";
}

/* 처리 이력 시드 + 취소 시각을 레코드에도 남긴다 — 수수료가 붙는 달은 **취소한 날의 달**이다(명세 3.4). */
function finishSeed(o) {
  seedHistory(o, "date");
  if (o.status === "취소" && !o.canceledAt) {
    const h = (o.history || []).find((x) => x.type === "cancel");
    o.canceledAt = h ? h.at : histAt(o.date, 90);
  }
  return o;
}

/** (b) 거래명세서 실데이터 행 → 배송완료 주문. 행 = [배송요청일 '2026년 06월 30일', 발송인, 배송지, 상품, 금액].
 *  배송 시각·주문일(배송 1~2일 전)·받는분·리본은 (거래처, 달) 씨앗에서 결정적으로 고른다. */
function fromInvoiceRows(clientId, ym, rows) {
  const rnd = mulberry32(7919 + idNum(clientId) * 104729 + Number(ym.replace("-", "")));
  return rows.map((row, i) => {
    const r = Array.from({ length: 8 }, rnd);
    const m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(row[0]) || [];
    const t = pick(DELIVER_TIMES, r[0]).split(":").map(Number);
    const dd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), t[0], t[1]);
    const ot = pick(ORDER_TIMES, r[1]).split(":").map(Number);
    const od = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - (r[2] < 0.5 ? 1 : 2), ot[0], ot[1]);
    const occ = occasionOf(row[3], r[3]);
    return {
      id: `inv-${clientId}-${ym.replace("-", "")}-${pad2(i + 1)}`, orderNo: "", clientId,
      date: atStr(od), ordererName: row[1], address: row[2], deliverAt: dlvStr(dd),
      recipientName: recipientOf(occ, r[4], r[5]), recipientPhone: fakePhone(r[6]),
      ribbonPhrase: pick(RIBBON[occ], r[7]), ribbonSender: `${companyOf(clientId)} 임직원 일동`,
      image: "", notified: true, product: row[3], amount: Number(row[4]) || 0, status: "배송완료",
      receiver: pick(RECEIVERS[occ === "obit" ? "obit" : "celeb"], r[5]), manager: pick(STAFF, r[1]),
      request: "", memo: "", cancelFee: 0, cancelReason: "",
    };
  });
}

/** (c) 생성 주문 — (거래처, 절대 년·월) 하나. 양은 거래처 규모 계수 × 절대 시간 추세(최근 달일수록 약간 증가). */
function generateMonth(clientId, ym, now) {
  const [y, mo] = ym.split("-").map(Number);
  const cn = idNum(clientId);
  const abs = y * 12 + mo;
  const rnd = mulberry32(97 + cn * 131 + abs * 17);
  const size = 2 + ((cn * 7) % 5) * 0.75;                  // 2.0 ~ 5.0 — 거래처 규모 차이
  const growth = 1 + (abs - (2026 * 12 + 5)) * 0.04;       // 절대 달 기준 추세(상대 m 을 쓰면 달이 바뀔 때 흔들린다)
  const count = Math.max(2, Math.min(6, Math.round(size * growth + rnd() * 1.6 - 0.8)));
  const days = new Date(y, mo, 0).getDate();
  const goods = goodsOf(clientId);
  const limit = new Date(now.getTime() - 2 * 3600e3);      // 주문일은 지금보다 2시간 이상 앞(취소 시각 = 주문 + 90분)
  const out = [];
  for (let i = 0; i < count; i++) {
    /* 한 주문의 난수는 분기와 무관하게 14개 — 지금 시각에 따른 상태 분기가 뒤 주문을 밀지 않게. */
    const r = Array.from({ length: 14 }, rnd);
    const [product, amount] = pickGoods(goods, r[0]);
    const occ = occasionOf(product, r[1]);
    const t = pick(DELIVER_TIMES, r[3]).split(":").map(Number);
    const dd = new Date(y, mo - 1, 1 + Math.floor(r[2] * days), t[0], t[1]);
    const ot = pick(ORDER_TIMES, r[4]).split(":").map(Number);
    let od = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() - (r[5] < 0.6 ? 1 : 2), ot[0], ot[1]);
    /* 주문일은 배송일 1~2일 전(절대값)이다. 그 날이 아직 안 온 주문만 오늘(안 되면 어제)로 당긴다 — 주문일이 미래일
       수는 없다. 하루 단위라 새로고침에는 흔들리지 않고, 제 날짜가 지나면 그 날짜로 굳는다. */
    if (od > limit) {
      od = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ot[0], ot[1]);
      if (od > limit) od.setDate(od.getDate() - 1);
    }
    const past = dd <= now;
    const cancel = r[6] < 0.05;
    /* 접수대기·주문접수는 **주문마다 정해진 난수(r[7])로만** 가른다 — '배송까지 남은 시간'(지금 시각)으로 가르면
       며칠 전 '주문접수 · 담당자 지정' 이던 주문이 배송일이 다가오며 '접수대기 · 담당자 없음' 으로 **되돌아갔다**
       (2026-10-16 검증 — 10-16 → 10-20 사이 3건). 이제 시간이 지나며 바뀌는 길은 → 배송완료 하나뿐이다(앞으로만). */
    const status = cancel ? "취소" : past ? "배송완료" : r[7] < 0.3 ? "접수대기" : "주문접수";
    const fee = !cancel ? 0 : clientId === "C017" || r[8] < 0.5 ? 10000 : 0; // 홈박스는 취소비용 개별청구
    out.push({
      id: `g-${clientId}-${ym.replace("-", "")}-${pad2(i + 1)}`, orderNo: "", clientId,
      date: atStr(od), ordererName: ordererOf(clientId, r[9]),
      address: pick(occ === "obit" ? OBIT_VENUES : CELEB_VENUES, r[10]), deliverAt: dlvStr(dd),
      recipientName: recipientOf(occ, r[11], r[12]), recipientPhone: fakePhone(r[13]),
      ribbonPhrase: pick(RIBBON[occ], r[12]), ribbonSender: `${companyOf(clientId)} 임직원 일동`,
      image: "", notified: status === "배송완료", product, amount, status,
      receiver: status === "배송완료" ? pick(RECEIVERS[occ === "obit" ? "obit" : "celeb"], r[8]) : "",
      manager: status === "접수대기" ? "" : pick(STAFF, r[9]),
      request: "", memo: "",
      cancelFee: fee, cancelReason: cancel ? pick(CANCEL_REASONS, r[7]) : "",
    });
  }
  return out;
}

/** 최근 6개월(이번 달 포함)의 절대 귀속월 키. */
const windowMonths = (now) => [0, 1, 2, 3, 4, 5].map((m) => periodOf(new Date(now.getFullYear(), now.getMonth() - m, 1)));

/* ── 예시 달 (2026-10-16 운영자 결정 — 가상 거래처·예시 달 추가) ──────────────────
   ⚠️ 주문이 없는 거래처: 누리솔루션(C022) — 가입했지만 아직 주문을 넣지 않았다(첫 명세서가 없다).
   ⚠️ 0원 달: 고이메모리얼(C007)의 **3달 전**은 가입 혜택 '1회 무료' 0원 주문 2건만 있는 달이다 — 명세서는 발급되고
      동의·계산서 없이 닫힌다(명세 3.4 예외표 · 10.4 Q21 잠정 ①). DATA_NOW 상대라 늘 '발급 뒤 닫힌 달' 로 보인다. */
const NO_ORDER_CLIENTS = new Set(["C022"]);
const ZERO_MONTH = { clientId: "C007", monthsAgo: 3 };
function zeroMonth(clientId, ym) {
  const [y, mo] = ym.split("-").map(Number);
  const rnd = mulberry32(4211 + idNum(clientId) * 131 + (y * 12 + mo) * 17);
  return [9, 22].map((day, i) => {
    const r = Array.from({ length: 8 }, rnd);
    const dd = new Date(y, mo - 1, day, 13, 30);
    const od = new Date(y, mo - 1, day - 1, 10, 20);
    return {
      id: `g-${clientId}-${ym.replace("-", "")}-${pad2(i + 1)}`, orderNo: "", clientId,
      date: atStr(od), ordererName: ordererOf(clientId, r[0]),
      address: pick(OBIT_VENUES, r[1]), deliverAt: dlvStr(dd),
      recipientName: recipientOf("obit", r[2], r[3]), recipientPhone: fakePhone(r[4]),
      ribbonPhrase: pick(RIBBON.obit, r[5]), ribbonSender: `${companyOf(clientId)} 임직원 일동`,
      image: "", notified: true, product: "근조바구니", amount: 0, status: "배송완료",
      receiver: pick(RECEIVERS.obit, r[6]), manager: pick(STAFF, r[7]),
      request: "", memo: "가입 혜택 '1회 무료' — 0원 처리", cancelFee: 0, cancelReason: "",
    };
  });
}

/** (b)+(c) 조립. 주문번호는 **배송 달별 일련번호** `B2B-YYMMNNN`(7자리) — 그 달 안에서 거래처 번호 순 → 배송일 순.
 *  ⚠️ 거래처 번호 순이라 번호가 큰 거래처가 늘어도 기존 번호는 밀리지 않는다(뒤에 붙는다).
 *     손으로 쓴 44건(0001~0044)과 대역이 겹치지 않는다. 가입일이 든 달보다 앞선 달은 만들지 않는다.
 *  ⚠️ 사람이 만든 새 주문은 **다른 대역**(`B2B-YYMM9NNN`, 8자리 — 아래 b2bNextOrderNo)이다. 시드 달 대역 안에
 *     두면 시드가 늘 때(거래처 추가) 번호가 겹쳐, 사용자가 완료 화면에서 본 번호가 다시 매겨진다. */
function seedGenerated(now) {
  const months = windowMonths(now);
  const clientIds = [...new Set([...INITIAL_CLIENTS.map((c) => c.id), ...Object.keys(INVOICE_DB)])]
    .sort((a, b) => idNum(a) - idNum(b));
  const byMonth = new Map();
  const zeroYm = periodOf(new Date(now.getFullYear(), now.getMonth() - ZERO_MONTH.monthsAgo, 1));
  const curYm = periodOf(now);
  const suspended = new Set(INITIAL_CLIENTS.filter((c) => c.status === "정지").map((c) => c.id));
  clientIds.forEach((cid) => {
    if (NO_ORDER_CLIENTS.has(cid)) return;
    const real = INVOICE_DB[cid] || {};
    const joinDay = String((SEED_CLIENTS.get(cid) || {}).joinDate || "").slice(0, 10);
    const joined = joinDay.slice(0, 7);
    const yms = [...new Set([...months, ...Object.keys(real)])];
    yms.forEach((ym) => {
      const rows = real[ym] && real[ym].rows;
      let recs = null;
      if (rows && rows.length) recs = fromInvoiceRows(cid, ym, rows);          // 실데이터가 이긴다
      else if (cid === ZERO_MONTH.clientId && ym === zeroYm) recs = zeroMonth(cid, ym);
      /* 정지된 거래처(시드 상태 '정지' — C023 다솜물산)는 **이번 달 주문을 만들지 않는다** — 정지는 이번 달 1일부터로 본다.
         예전엔 정지된 계정에도 이번 달 미래 배송분(접수대기)이 생겨 대쉬보드 액션 큐에 떴다. 지금 시각(now)으로 자르지 않는
         이유: 날이 지나며 미래 주문이 하나씩 '배송완료' 로 나타나게 된다 — 달 경계는 DATA_NOW 상대라 늘 같은 모양이다. */
      else if (suspended.has(cid) && ym >= curYm) recs = null;
      else if (months.includes(ym) && SEED_CLIENTS.has(cid) && (!joined || ym >= joined)) {
        /* 가입한 달은 가입일 이후 배송분만 — 가입 전에 배송된 주문이 생기면 안 된다(C020~ 의 첫 명세서가 이 날짜로 정해진다).
           기존 거래처 19곳은 가입일이 시드 창보다 앞이라 걸리지 않는다. */
        recs = generateMonth(cid, ym, now);
        if (ym === joined) recs = recs.filter((o) => o.deliverAt.slice(0, 10) >= joinDay);
      }
      if (!recs || !recs.length) return;
      recs.sort((a, b) => a.deliverAt.localeCompare(b.deliverAt));
      if (!byMonth.has(ym)) byMonth.set(ym, []);
      byMonth.get(ym).push(...recs);
    });
  });
  const out = [];
  [...byMonth.keys()].sort().forEach((ym) => {
    const yymm = ym.slice(2, 4) + ym.slice(5, 7);
    byMonth.get(ym).forEach((o, i) => { o.orderNo = `B2B-${yymm}${String(i + 1).padStart(3, "0")}`; out.push(finishSeed(o)); });
  });
  return out;
}

/* ════════════════════════════════════════════════════════════
   목록 캐시 + 변경분 영속
   ════════════════════════════════════════════════════════════
   ⚠️ **첫 b2bList() 호출 때** 조립한다 — 모듈 평가 시점에는 store.hydrate() 전이라 변경분이 비어 있다.
   쓰기 함수는 캐시를 고치고 그 레코드를 store.orderOps 에 기록한다(시드면 patched, 아니면 created).
   ⚠️ 페이지가 레코드를 **직접 고치면 새로고침에 사라진다** — 반드시 아래 쓰기 함수를 지날 것
      (이력 한 줄도 b2bPushHistory).
   ⚠️ **저장은 실패할 수 있다**(브라우저 저장 공간 한도). 쓰기 함수는 실패하면 캐시를 바꾸기 전으로 되돌리고
      실패를 돌려준다(b2bUpsert → null, 나머지 → false · 값이 그대로인 no-op 은 true). 호출부는 그때 '저장하지 못했다' 고 말해야 한다 —
      예전엔 실패를 삼켜 '저장했습니다' 토스트가 뜬 채 새로고침에 사라졌다. */
let cache = null;
let seedIds = new Set();
let version = 0;
const clone = (o) => JSON.parse(JSON.stringify(o));
const orderNum = (no) => { const m = /^B2B-(\d+)$/.exec(String(no || "")); return m ? Number(m[1]) : 0; };
const toTime = (s) => { const t = new Date(String(s || "").replace(/\//g, "-").replace(" ", "T")).getTime(); return Number.isFinite(t) ? t : 0; };

/* 새 주문번호 대역 — `B2B-YYMM9NNN`(8자리, 만든 달 기준). 시드는 4자리(손으로 쓴 44건)·7자리(달별 일련번호)라
   자릿수부터 달라 겹칠 수 없다. 한 달 999건까지(데모). */
const newBandBase = (d) => ((d.getFullYear() % 100) * 100 + d.getMonth() + 1) * 10000 + 9000; // 2026-10 → 26109000
const isNewBandNo = (n) => n >= 1e7 && n % 10000 > 9000;
/** 그 달 새 주문 대역의 다음 번호(숫자). 지운 새 주문의 번호는 다시 쓰지 않는다(store.orderOps.lastNo). */
function nextNewNo(arr, now) {
  const base = newBandBase(now);
  const inBand = (n) => n > base && n < base + 1000;
  let max = base;
  arr.forEach((o) => { const n = orderNum(o.orderNo); if (inBand(n)) max = Math.max(max, n); });
  const last = Number(store.orderOps().lastNo) || 0;
  if (inBand(last)) max = Math.max(max, last);
  return max + 1;
}

function build() {
  const hand = HAND_ORDERS.map((o) => finishSeed({ ...o }));
  const seeds = [...hand, ...seedGenerated(DATA_NOW)];
  seedIds = new Set(seeds.map((o) => o.id));
  const ops = store.orderOps();
  const removed = new Set(ops.removed || []);
  /* 시드 창(6개월) 밖으로 밀려난 달의 patched 는 버려진다 — 그 달 시드가 더는 없다. */
  const kept = seeds
    .filter((o) => !removed.has(o.id))
    .map((o) => (ops.patched && ops.patched[o.id] ? clone(ops.patched[o.id]) : o));
  const created = Object.values(ops.created || {}).filter((o) => o && o.id && !seedIds.has(o.id)).map(clone);
  /* 저장된 새 주문의 번호가 시드와 겹치면(대역을 나누기 전의 옛 저장본) 새 주문 대역으로 다시 매긴다 —
     같은 번호가 둘이면 검색·안내가 엉킨다. 지금 대역의 번호는 시드와 자릿수가 달라 여기에 걸리지 않는다. */
  const used = new Set(kept.map((o) => o.orderNo));
  const renumbered = [];
  created.forEach((o) => {
    if (!o.orderNo || used.has(o.orderNo)) { o.orderNo = `B2B-${nextNewNo([...kept, ...created], DATA_NOW)}`; renumbered.push(o); }
    used.add(o.orderNo);
  });
  /* 최신순(주문일) — 화면은 색 순서로 **안정** 정렬하므로 같은 색 안에서는 이 순서가 남는다. */
  cache = [...created, ...kept].sort((a, b) => toTime(b.date) - toTime(a.date));
  renumbered.forEach(record);
  version++;
  return cache;
}
const list = () => cache || build();

/** 캐시의 레코드 하나를 변경분으로 기록·저장한다(사본을 남긴다 — 캐시 객체를 store 와 공유하지 않게).
 *  저장에 성공하면 true(실패하면 store 가 변경분을 되돌린다). */
function record(o) {
  const snap = clone(o);
  const no = orderNum(o.orderNo);
  return store.setOrderOps((ops) => (seedIds.has(o.id)
    ? { ...ops, patched: { ...ops.patched, [o.id]: snap } }
    : { ...ops, created: { ...ops.created, [o.id]: snap }, lastNo: isNewBandNo(no) ? Math.max(Number(ops.lastNo) || 0, no) : ops.lastNo }));
}
/** 캐시에서 고친 `o` 를 기록한다. 저장에 실패하면 캐시를 `before`(바꾸기 전 사본 · 새 주문이면 null = 빼기)로
 *  되돌리고 false — 화면이 새로고침 뒤에 사라질 값을 '저장됨' 으로 들고 있지 않게. */
function commit(o, before) {
  if (record(o)) { version++; return true; }
  const arr = list();
  const i = arr.findIndex((x) => x.id === o.id);
  if (i >= 0) { if (before) arr[i] = before; else arr.splice(i, 1); }
  return false;
}

/* ── 조회·변경 헬퍼 (b2c-mock 과 같은 계약 + 저장 실패 반환) ── */
export function b2bList() { return list(); }
export function b2bFind(id) { return list().find((o) => o.id === id) || null; }
/** 정산 캐시가 무효화를 아는 번호 — 주문 쓰기마다 +1. */
export function b2bVersion() { list(); return version; }
/** 새 주문 id — 시드 id(t·inv-·g-)와 겹치지 않는 접두사. */
export function b2bNewId() { return "n" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, "0"); }
/** 새 주문번호 — `B2B-YYMM9NNN`(만든 달의 새 주문 대역, 시드와 겹치지 않는다). */
export function b2bNextOrderNo(now = new Date()) { return `B2B-${nextNewNo(list(), now)}`; }
/** 저장한 레코드를 돌려준다. **저장에 실패하면 null**(캐시는 바꾸기 전 그대로). */
export function b2bUpsert(rec) {
  const arr = list();
  const i = arr.findIndex((o) => o.id === rec.id);
  if (i < 0) { // 신규는 최상단
    const o = { ...rec, history: rec.history || [] };
    arr.unshift(o);
    return commit(o, null) ? o : null;
  }
  /* ⚠️ 모달 draft 는 history 를 싣지 않는다(얕은 복사로 배열 참조가 공유되면
     편집 취소가 이력을 되돌린다). rec 에 없으면 기존 것을 지킨다. */
  const before = arr[i];
  arr[i] = { ...rec, history: rec.history || before.history || [] };
  return commit(arr[i], before) ? arr[i] : null;
}
/** 지금 레코드를 그대로 다시 기록한다(필드를 직접 고친 드문 경우의 탈출구). 실패하면 false — 되돌릴 사본이 없으니
 *  호출부가 고치기 전 값을 들고 있어야 한다. */
export function b2bSave(id) {
  const o = b2bFind(id);
  if (!o) return false;
  if (!record(o)) return false;
  version++;
  return true;
}
/** 처리 이력 한 줄 — 페이지가 레코드에 pushHistory 를 직접 걸면 새로고침에 사라진다. 실패하면 false. */
export function b2bPushHistory(id, type, label, at) {
  const o = b2bFind(id);
  if (!o) return false;
  const before = clone(o);
  pushHistory(o, type, label, at);
  return commit(o, before);
}
export function b2bRemove(id) {
  const arr = list();
  const i = arr.findIndex((o) => o.id === id);
  if (i < 0) return false;
  const ok = store.setOrderOps((ops) => {
    if (seedIds.has(id)) {
      const patched = { ...ops.patched };
      delete patched[id];
      return { ...ops, patched, removed: [...new Set([...(ops.removed || []), id])] };
    }
    const created = { ...ops.created };
    delete created[id];
    return { ...ops, created };
  });
  if (!ok) return false;
  arr.splice(i, 1);
  version++;
  return true;
}
/** 주문취소 — 사유·수수료와 **취소한 시각**(canceledAt)을 함께 남긴다. 수수료는 취소한 날의 달 정산에 붙는다. */
export function b2bCancel(id, { reason = "", fee = 0 } = {}, now = new Date()) {
  const o = b2bFind(id);
  if (!o) return false;
  if (o.status === "취소") return true; // 이미 취소 — 할 일 없음(실패가 아니다)
  const before = clone(o);
  o.status = "취소";
  o.cancelReason = reason;
  o.cancelFee = Number(fee) || 0;
  o.canceledAt = fmtAt(now);
  const why = reason ? ` · ${reason}` : "";
  const f = o.cancelFee ? ` · 수수료 ${o.cancelFee.toLocaleString("ko-KR")}원` : "";
  pushHistory(o, "cancel", `주문취소${why}${f}`);
  return commit(o, before);
}
export function b2bSetStatus(id, status) {
  const o = b2bFind(id);
  if (!o) return false;
  if (o.status === status) return true; // 값이 그대로면 no-op — 이력이 중복으로 쌓이지 않게
  const before = clone(o);
  o.status = status;
  if (status === "배송완료") {
    o.notified = true; // 배송완료 → 알림톡 자동 발송(API)
    pushHistory(o, "delivered", "배송완료 · 알림톡 발송");
  } else if (status === "취소") {
    o.canceledAt = fmtAt(new Date()); // 사유·수수료가 있으면 b2bCancel 을 쓸 것
    pushHistory(o, "cancel", "주문취소");
  } else {
    pushHistory(o, "status", `${status}로 변경`);
  }
  return commit(o, before);
}
export function b2bSetManager(id, name) {
  const o = b2bFind(id);
  if (!o) return false;
  if (o.manager === name) return true;
  const before = clone(o);
  o.manager = name; // 담당자 배정(별도 모달에서 선택·입력)
  pushHistory(o, "manager", `담당자 ${name} 지정`);
  return commit(o, before);
}
