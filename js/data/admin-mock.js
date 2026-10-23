/* ============================================================
   admin-mock.js — ADMIN console mock datasets.
   - INITIAL_CLIENTS: 거래처(client companies) — persisted/editable via store.
   - 이용 내역·정산 행(usageFor · settlementBaseRows)은 **여기 없다** — 2026-10-16 운영자 결정('주문과 정산을
     완전히 연결')으로 `js/util/settlement.js` 가 B2B 주문(b2b-mock)에서 파생한다. admin-mock 은 store 와
     b2b-mock 이 import 하는 바닥층이라 주문을 읽을 수 없다(거꾸로 걸면 순환).
   - 발행일·마감·작성일자 규칙은 `settlement-rules.js` 단일 소스. 여기서는 재수출만 한다.
   Dates are generated RELATIVE TO NOW so the date / year-month filters
   always have current data regardless of when the demo is viewed.
   ============================================================ */

import { INVOICE_DAYS, invoiceDayOf, periodOf } from "./settlement-rules.js";
import { TERMS_VERSION } from "./terms.js";
import { PRIVACY_VERSION } from "./privacy.js";
export { INVOICE_DAYS, invoiceDayOf };

const NOW = new Date();
/** 목데이터 생성 기준 시각. 화면의 '이번달/저번달' 기본값은 반드시 이 값을 써야
 *  자정·월 전환 후에도(모듈은 재평가되지 않으므로) 데이터 창과 어긋나지 않는다. */
export const DATA_NOW = NOW;
/** DATA_NOW 기준 `monthsAgo` 달 전의 `day` 일("YYYY-MM-DD", 그 달 말일을 넘지 않게). 가상 거래처의 가입일처럼
 *  **날짜가 지나도 같은 모양으로 보여야 하는** 시드에만 쓴다(첫 명세서가 곧/이미 발급 · 마감 전/뒤로 갈리게). */
const relDate = (monthsAgo, day) => {
  const first = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return `${periodOf(first)}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

/* ── 거래처 (client companies) ──────────────────────────────
   **가상 데모 데이터다**(2026-09-29 사용자 결정). 예전엔 구 시스템(flowerdel.pe.kr/adm2)에서 옮긴 실거래처
   19곳이었는데, 거래처는 이관하지 않고 **모든 회원이 새로 가입**하기로 해서(법무 답 · 명세 1.4) 실데이터를
   걷어냈다. 회사명·사업자번호(000-00-000NN)·대표자·연락처(010-0000-01NN)·주소(예시로)는 전부 지어낸 값이다.
   이관 데이터의 **구조**는 시연에 필요해 본떴다:
   ─ clientNote = **거래 조건**(메모가 아니다). 주문 화면에서 담당자에게 노출한다. 지우지 말 것.
   ─ 법무법인 한결 2건(C008·C015)은 같은 사업자번호의 부서 분리 — 정상 시나리오다.
   ─ (주)온누리헬스(C011)의 발급일 15일 — 발급일 11~25 그룹(동의 마감 28일 · 작성일자 = 동의일)을 시연한다.
   ─ 모두 '가입 완료' 상태다: 비밀번호 `demo1234` · 약관 동의 · 정산·회계 담당자 1명(아래 SEED_BILLING →
     store 가 담당자 저장공간 시드를 만든다). 가입하면 2단계 담당자가 정산담당이 되는 것과 같은 모양이다.
     약관 동의 시각은 가입일 09:00 — 자동 동의는 이 시각 이후 마감만 인정하므로(store.agreementOf)
     가입일이 정산 표 6개월 창보다 앞서야 지난 달이 '약관 동의 전'으로 보이지 않는다. */
export const DEMO_PASSWORD = "demo1234";
/** 거래처별 첫 정산·회계 담당자 — [이름, 부서·직위, 연락처]. C001 은 store 의 INITIAL_CONTACTS(3명)를 쓴다. */
export const SEED_BILLING = {
  C001: ["오임찬", "재경부", "010-3333-4444"],
  C002: ["박소윤", "재무팀", "010-0000-0102"],
  C003: ["최다은", "총무팀", "010-0000-0103"],
  C004: ["정우진", "사무국", "010-0000-0104"],
  C005: ["강서윤", "경영지원팀", "010-0000-0105"],
  C006: ["조예린", "재무팀", "010-0000-0106"],
  C007: ["윤태호", "운영팀", "010-0000-0107"],
  C008: ["장미래", "사무국", "010-0000-0108"],
  C009: ["임가온", "회계팀", "010-0000-0109"],
  C010: ["한지우", "총무팀", "010-0000-0110"],
  C011: ["이하늘", "마케팅팀 대리", "010-0000-0111"],
  C012: ["권민서", "사무장", "010-0000-0112"],
  C013: ["황지안", "재무팀", "010-0000-0113"],
  C014: ["송하람", "경영지원팀", "010-0000-0114"],
  C015: ["전서진", "사무국", "010-0000-0115"],
  C016: ["노은채", "재무팀", "010-0000-0116"],
  C017: ["유건우", "구매팀", "010-0000-0117"],
  C018: ["문가람", "총무팀", "010-0000-0118"],
  C019: ["김하나", "총무팀", "010-0000-0119"],
  /* 관리자가 등록한 가상 거래처(아래 seedPending). 정산·회계 담당 연락처는 비울 수 없다(2026-10-19 사용자 결정 · 명세 M52) —
     예전엔 C026 온새미로의 연락처를 비워 '알림 수신자 없음' 을 시연했는데 이제 이웃과 같은 가상 번호다. 화면의 '알림 수신자 없음' ·
     '연락처 미등록' 갈래는 데이터 오류 대비로 코드에 남아 있다. */
  C020: ["배수아", "경영지원팀", "010-0000-0120"],
  C021: ["남궁연", "디자인팀", "010-0000-0121"],
  C022: ["차민호", "총무팀", "010-0000-0122"],
  C023: ["염다솜", "재무팀", "010-0000-0123"],
  C024: ["표소담", "운영팀", "010-0000-0124"],
  C025: ["기윤서", "경영지원팀", "010-0000-0125"],
  C026: ["설하람", "총무팀", "010-0000-0126"],
  C027: ["서도현", "연구지원팀", "010-0000-0127"],
  /* 탈퇴한 가상 거래처(아래 INITIAL_CLIENTS 끝 — 2026-10-22 운영자 결정 A 의 예시) */
  C028: ["하윤슬", "경영지원팀", "010-0000-0128"],
};
/* 매출을 별도 KPI 로 떼어 보는 거래처 채널.
   '일반' 이 기본이고, 그 외 값은 대쉬보드에서 B2B 합계에서 빠져 자기 카드를 갖는다.
   '고이' 채널 거래처(데모: 고이메모리얼)는 사업 성격이 달라 매출을 따로 보고 있어 채널로 분리했다 —
   같은 성격의 거래처가 늘면 이 목록에 값을 추가하고 거래처 레코드에 지정하면 된다. */
export const CLIENT_CHANNELS = ["일반", "고이"];
/** 거래처의 채널. 값이 없으면 일반. */
export const channelOf = (client) => (client && client.channel) || "일반";

/* 거래처 상태(2026-10-22 운영자 결정 A — '정지' 를 없애고 '탈퇴' 를 둔다): 활성 · 승인대기 · 반려 · 탈퇴 넷.
   탈퇴 = 계정을 닫고 기록은 남긴다 · 되돌리지 않는다 · 끝나지 않은 정산이 있으면 할 수 없다(판정은 util/withdraw.js).
   탈퇴한 시각은 레코드의 `withdrawnAt`("YYYY-MM-DD HH:mm") 한 칸이다(이력 장치가 아니라 사실 한 칸). 옛 저장본의 '정지' 는
   store.hydrate 가 '활성' 으로 읽는다. 낱말은 이 바닥층에 둔다 — store·b2b-mock 이 util/client.js 를 부를 수 없다(순환). */
export const CLIENT_STATUSES = ["활성", "승인대기", "반려", "탈퇴"];
export const WITHDRAWN = "탈퇴";
/** 탈퇴한 달("YYYY-MM") — 그 달부터는 시드 주문을 만들지 않는다(b2b-mock). 탈퇴가 아니거나 시각이 없으면 "". */
export const withdrawnYmOf = (client) => (client && client.status === WITHDRAWN ? String(client.withdrawnAt || "").slice(0, 7) : "");

/* 공통 필드(상태·비밀번호·약관·개인정보 동의·대표 연락처)는 한 곳에서 채운다 — 19줄에 같은 값을 복제하면 한 줄만 어긋난다.
   대표 연락처 키(managerName·contact)는 정산 명세서·주문 모달이 읽는다 → 정산담당과 같은 사람이다(가입과 같은 규칙).
   개인정보 수집·이용 동의(2026-10-23 운영자 결정 D6 — 약관과 따로)도 가입을 마친 모양이라 약관과 같은 시각·지금 버전으로 둔다 —
   데모 로그인에 게이트가 뜨지 않게(약관 시드와 같은 방식). 예전에 데모를 연 브라우저는 저장된 termsVersion 이 옛 값이라
   다음 로그인에 약관 게이트가 뜬다(2026-10-23 약관 개정 D4 — 그것이 맞다). 개인정보 동의도 함께 뜬다 — 저장된 레코드에는 개인정보 칸이
   없고, store.hydrate 가 시드의 빈 칸을 채울 때 동의 기록 칸만은 채우지 않는다(동의한 적 없는 기록을 지어내지 않게 · store hydrateClient). */
const seed = (c) => {
  const [name, , phone] = SEED_BILLING[c.id];
  const at = `${c.joinDate} 09:00`;
  return {
    status: "활성", password: DEMO_PASSWORD, managerName: name, contact: phone,
    termsAgreedAt: at, termsFirstAgreedAt: at, termsVersion: TERMS_VERSION,
    privacyAgreedAt: at, privacyVersion: PRIVACY_VERSION,
    ...c,
  };
};
/* 관리자가 등록했고 **아직 약관에 동의하지 않은** 거래처(2026-10-16 운영자 결정 — 예시 상태 시연). 약관 시각이 없어
   첫 로그인에 약관 게이트가 뜨고(개인정보 동의도 없어 같은 게이트에서 둘 다 받는다 — 2026-10-23 결정 D6),
   마감이 지나도 자동 동의하지 않는다(명세 3.4 · termsHold). 가입일은 DATA_NOW 상대 —
   첫 명세서가 '곧 발급 · 발급·마감 전 · 마감 지남' 으로 갈리게(정확한 D-n 은 보는 날짜에 따라 달라지는 것이 정상). */
const seedPending = (c) => {
  const [name, , phone] = SEED_BILLING[c.id];
  return { status: "활성", password: DEMO_PASSWORD, managerName: name, contact: phone, ...c };
};

export const INITIAL_CLIENTS = [
  seed({ id: "C001", accountId: "hanbit", companyName: "한빛과학(주)", bizNumber: "000-00-00001", ceoName: "김민준", department: "", email: "c001@example.com", address: "서울특별시 강남구 예시로 101 한빛빌딩", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 6만" }),
  seed({ id: "C002", accountId: "saebom", companyName: "새봄푸드(주)", bizNumber: "000-00-00002", ceoName: "이서연", department: "", email: "c002@example.com", address: "서울특별시 송파구 예시로 202", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" }),
  seed({ id: "C003", accountId: "donghaeng", companyName: "(주)동행코퍼레이션", bizNumber: "000-00-00003", ceoName: "박지호", department: "", email: "c003@example.com", address: "경기도 의정부시 예시로 303", joinDate: "2025-08-18", invoiceDay: "1", clientNote: "항상 고급으로 고정 진행\n60,000원 고정" }),
  seed({ id: "C004", accountId: "nuri", companyName: "푸른누리협회", bizNumber: "000-00-00004", ceoName: "최유진", department: "", email: "c004@example.com", address: "인천광역시 미추홀구 예시로 404, 3층", joinDate: "2026-03-24", invoiceDay: "1", clientNote: "기본 50 · 고급 60 · 특대 75" }),
  seed({ id: "C005", accountId: "badahyang", companyName: "(주)바다향", bizNumber: "000-00-00005", ceoName: "정도윤", department: "", email: "c005@example.com", address: "부산광역시 사하구 예시로 505", joinDate: "2026-03-11", invoiceDay: "1", clientNote: "" }),
  seed({ id: "C006", accountId: "matkkal", companyName: "(주)맛깔채", bizNumber: "000-00-00006", ceoName: "강하은", department: "", email: "c006@example.com", address: "서울특별시 송파구 예시로 606", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" }),
  seed({ id: "C007", accountId: "goimemorial", companyName: "고이메모리얼", bizNumber: "000-00-00007", ceoName: "조민재", department: "", email: "c007@example.com", address: "서울특별시 관악구 예시로 707, 2층", joinDate: "2025-02-19", invoiceDay: "1", clientNote: "", channel: "고이" }),
  seed({ id: "C008", accountId: "hangyeol-jms", companyName: "법무법인 한결", bizNumber: "000-00-00008", ceoName: "윤서아", department: "정민수 변호사", email: "c008@example.com", address: "서울특별시 종로구 예시로 808 한결빌딩", joinDate: "2025-06-09", invoiceDay: "1", clientNote: "정민수 변호사님" }),
  seed({ id: "C009", accountId: "singsing", companyName: "(주)싱싱마켓", bizNumber: "000-00-00009", ceoName: "장현우", department: "", email: "c009@example.com", address: "경기도 이천시 예시로 909", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" }),
  seed({ id: "C010", accountId: "daesung", companyName: "(주)대성금속", bizNumber: "000-00-00010", ceoName: "임수빈", department: "", email: "c010@example.com", address: "충청남도 아산시 예시로 110", joinDate: "2025-09-24", invoiceDay: "1", clientNote: "★ 기본상품 50\n필요 시 특대 75로 진행" }),
  seed({ id: "C011", accountId: "onnuri", companyName: "(주)온누리헬스", bizNumber: "000-00-00011", ceoName: "서준호", department: "", email: "c011@example.com", address: "서울특별시 송파구 예시로 111", joinDate: "2025-12-03", invoiceDay: "15", clientNote: "3단(50,000원) 또는 4단(90,000원) 중 선택\n화분 80,000원 · 동서양란 80,000원 고정\n배송지연 이슈 또는 배송완료 시 빠른 소통 요망\n총담당자: 이하늘 대리" }),
  seed({ id: "C012", accountId: "bareun", companyName: "법무법인 바른길", bizNumber: "000-00-00012", ceoName: "신예린", department: "", email: "c012@example.com", address: "서울특별시 서초구 예시로 112, 14층", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 5만원 / 담당 변호사에게 배송사진 전송" }),
  seed({ id: "C013", accountId: "daon", companyName: "(주)다온유통", bizNumber: "000-00-00013", ceoName: "권태양", department: "", email: "c013@example.com", address: "서울특별시 송파구 예시로 113", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" }),
  seed({ id: "C014", accountId: "parancode", companyName: "(주)파란코드", bizNumber: "000-00-00014", ceoName: "황보라", department: "", email: "c014@example.com", address: "서울특별시 강남구 예시로 114", joinDate: "2025-12-11", invoiceDay: "1", clientNote: "3단화환 '특대' 상품으로 고정, 75,000원\n쌀화환 10kg 요청 시 쌀화환 발송, 75,000원\n배송비 발생지역의 경우 별도 청구" }),
  seed({ id: "C015", accountId: "hangyeol-yja", companyName: "법무법인 한결", bizNumber: "000-00-00008", ceoName: "윤서아", department: "윤지아 변호사", email: "c015@example.com", address: "서울특별시 종로구 예시로 808 한결빌딩", joinDate: "2025-04-30", invoiceDay: "1", clientNote: "윤지아 변호사님" }),
  seed({ id: "C016", accountId: "layered", companyName: "주식회사 레이어드", bizNumber: "000-00-00016", ceoName: "배준영", department: "", email: "c016@example.com", address: "대전광역시 중구 예시로 116, 9층", joinDate: "2025-09-01", invoiceDay: "1", clientNote: "항상 고급형으로, 60,000원" }),
  seed({ id: "C017", accountId: "homebox", companyName: "(주)홈박스", bizNumber: "000-00-00017", ceoName: "송지후", department: "", email: "c017@example.com", address: "경기도 파주시 예시로 117", joinDate: "2025-06-24", invoiceDay: "1", clientNote: "★ 상품금액 75,000원으로 기재, 무조건 특대상품 발송\n★ 추가배송비·취소비용 등 추가비용 개별청구\n★ 배송완료 이미지 전달 필수" }),
  seed({ id: "C018", accountId: "coretech", companyName: "(주)코어테크", bizNumber: "000-00-00018", ceoName: "전하율", department: "", email: "c018@example.com", address: "서울특별시 금천구 예시로 118, 4층", joinDate: "2025-05-26", invoiceDay: "1", clientNote: "화환 무조건 8만(기본) / 배송비 일절 없음" }),
  seed({ id: "C019", accountId: "haneul", companyName: "주식회사 하늘빛", bizNumber: "000-00-00019", ceoName: "노승우", department: "", email: "c019@example.com", address: "서울특별시 중랑구 예시로 119, 6층", joinDate: "2026-02-10", invoiceDay: "1", clientNote: "담당: 김하나" }),
  /* ── 약관 동의 전 가상 거래처(C020~) — 주문은 b2b-mock 이 가입일 이후로만 만든다(누리솔루션은 0건) ──
     발급일을 INVOICE_DAYS 안에서 갈라 첫 명세서 단계가 다르게 보인다: 1·3·7일(지난달분 마감 지남) ·
     11·15일(발급·마감 전) · 20일(곧 발급) · 이음테크(이번 달부터 — 다음 달 발급). */
  seedPending({ id: "C020", accountId: "saesol", companyName: "(주)새솔테크", bizNumber: "000-00-00020", ceoName: "고은결", department: "", email: "c020@example.com", address: "서울특별시 마포구 예시로 120", joinDate: relDate(1, 2), invoiceDay: "1", clientNote: "" }),
  seedPending({ id: "C021", accountId: "hanbyeol", companyName: "(주)한별디자인", bizNumber: "000-00-00021", ceoName: "류하진", department: "", email: "c021@example.com", address: "서울특별시 성동구 예시로 121, 5층", joinDate: relDate(1, 3), invoiceDay: "15", clientNote: "" }),
  seedPending({ id: "C022", accountId: "nurisol", companyName: "누리솔루션", bizNumber: "000-00-00022", ceoName: "변지호", department: "", email: "c022@example.com", address: "경기도 성남시 예시로 122", joinDate: relDate(0, 1), invoiceDay: "5", clientNote: "" }),
  seedPending({ id: "C023", accountId: "dasom", companyName: "(주)다솜물산", bizNumber: "000-00-00023", ceoName: "엄태윤", department: "", email: "c023@example.com", address: "인천광역시 남동구 예시로 123", joinDate: relDate(1, 4), invoiceDay: "3", clientNote: "" }),
  seedPending({ id: "C024", accountId: "sodam", companyName: "소담케이터링", bizNumber: "000-00-00024", ceoName: "편서우", department: "", email: "c024@example.com", address: "서울특별시 용산구 예시로 124", joinDate: relDate(1, 5), invoiceDay: "20", clientNote: "" }),
  seedPending({ id: "C025", accountId: "ieum", companyName: "이음테크", bizNumber: "000-00-00025", ceoName: "육민결", department: "", email: "c025@example.com", address: "대전광역시 유성구 예시로 125", joinDate: relDate(0, 1), invoiceDay: "1", clientNote: "" }),
  seedPending({ id: "C026", accountId: "onsaemiro", companyName: "온새미로", bizNumber: "000-00-00026", ceoName: "탁하늘", department: "", email: "c026@example.com", address: "광주광역시 서구 예시로 126", joinDate: relDate(1, 2), invoiceDay: "7", clientNote: "" }),
  /* 한빛과학(주)의 연구소 계정 — 같은 사업자번호의 부서 분리(정상 시나리오 · 계정 구분으로 가른다) */
  seedPending({ id: "C027", accountId: "hanbit-lab", companyName: "한빛과학(주)", bizNumber: "000-00-00001", ceoName: "김민준", department: "연구소 계정", email: "c027@example.com", address: "서울특별시 강남구 예시로 101 한빛빌딩 별관", joinDate: relDate(1, 6), invoiceDay: "11", clientNote: "" }),
  /* ── 탈퇴한 가상 거래처(2026-10-22 운영자 결정 A — 탈퇴한 거래처도 지난 달 정산 줄에 남는다) ──
     주문은 **두 달 전까지만**이다(b2b-mock 은 탈퇴한 달부터 시드 주문을 만들지 않는다) — 그 달들은 모두 자동 동의 · 계산서 · 입금까지
     끝났다(store 입금 시드 — 두 달 전분 입금은 지난달 말일 3일 전 14:00). 탈퇴한 시각은 그 마지막 입금 뒤인 **지난달 말일 15:00** —
     끝나지 않은 정산이 있으면 탈퇴할 수 없다는 규칙에 맞는 모양이 늘 DATA_NOW 상대로 선다. 로그인은 막힌다(util/client portalBlock). */
  seed({ id: "C028", accountId: "haemaru", companyName: "(주)해마루상사", bizNumber: "000-00-00028", ceoName: "금하준", department: "", email: "c028@example.com", address: "부산광역시 해운대구 예시로 128", joinDate: "2025-03-17", invoiceDay: "1", clientNote: "", status: WITHDRAWN, withdrawnAt: `${relDate(1, 31)} 15:00` }),
];

/* ── 상품 카테고리 (대쉬보드 도넛·월간 리포트의 **기본 순서·색**) ──────────────
   이용 내역·청구금액은 여기서 만들지 않는다 — 2026-10-16 운영자 결정('주문과 정산을 완전히 연결')으로
   B2B 주문(배송일시의 달)에서 파생한다(`js/util/settlement.js` usageFor · billingRowsOf). 예전의 난수 생성기
   (usageMonth · CAT_WEIGHTS)는 주문 생성기(b2b-mock)가 대신해 지웠다.
   이 목록은 도넛이 품목을 늘어놓는 **기본 순서**일 뿐이고, 실제로 집계된 그 밖의 품목은 뒤에 붙는다(색은 순환). */
export const USAGE_CATEGORIES = [
  { key: "3단화환(기본형)",  unit: 50000 },
  { key: "3단화환(고급형)",  unit: 60000 },
  { key: "3단화환(특대형)",  unit: 75000 },
  { key: "4단화환(표준형)",  unit: 95000 },
  { key: "근조오브제(1단형)", unit: 50000 },
  { key: "근조바구니",       unit: 50000 },
  { key: "쌀화환(10kg)",     unit: 75000 },
  { key: "동양란(기본형)",   unit: 50000 },
  { key: "중형 꽃바구니",    unit: 80000 },
];

/** Available billing year/month options (for the settlement selector). */
export const SETTLEMENT_YEARS = (() => {
  const ys = new Set();
  for (let m = 0; m <= 5; m++) ys.add(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1).getFullYear());
  return [...ys].sort((a, b) => b - a);
})();
