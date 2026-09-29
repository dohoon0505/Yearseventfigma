/* ============================================================
   admin-mock.js — ADMIN console mock datasets.
   - INITIAL_CLIENTS: 거래처(client companies) — persisted/editable via store.
   - usageFor(client) / settlementBaseRows(client): 호출 시점에 client 레코드에서
     파생하는 lazy 목데이터(id 기준 메모이제이션). 정적 맵을 미리 굽지 않으므로
     UI로 새로 등록한 거래처도 정산 표·리포트에 즉시 나타난다.
   - 동의·발급 상태는 여기서 찍지 않는다 — store 의 동의 기록이 필요한데 store → admin-mock
     이라 import 할 수 없다. 조합은 `js/util/settlement.js`(settlementsFor) 가 한다.
   - 발행일·마감·작성일자 규칙은 `settlement-rules.js` 단일 소스. 여기서는 재수출만 한다.
   Dates are generated RELATIVE TO NOW so the date / year-month filters
   always have current data regardless of when the demo is viewed.
   ============================================================ */

import { INVOICE_DAYS, invoiceDayOf, invoiceDayFor, issueDate, dueDate, fmtDot, periodOf, periodLabel } from "./settlement-rules.js";
import { INVOICE_DB } from "./invoice-mock.js";
import { TERMS_VERSION } from "./terms.js";
export { INVOICE_DAYS, invoiceDayOf };

const NOW = new Date();
/** 목데이터 생성 기준 시각. 화면의 '이번달/저번달' 기본값은 반드시 이 값을 써야
 *  자정·월 전환 후에도(모듈은 재평가되지 않으므로) 데이터 창과 어긋나지 않는다. */
export const DATA_NOW = NOW;
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

// "YYYY년 MM월" for `monthsAgo` before this month
/* ⚠️ 이 문자열은 장식이 아니라 **조인 키**다 — 정산 행의 `청구년월` 과 이용 내역 맵의 키가 이 포맷이고,
   호출부가 만든 라벨과 문자열 비교로 그 달을 찾는다. 포맷이 한 글자만 달라도 표가 통째로 빈다.
   그래서 settlement-rules.periodLabel 한 곳에서만 만든다(예전엔 독립 구현이 다섯 벌이었다). */
const ymLabel = (monthsAgo) => periodLabel(periodOf(new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 1)));

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
};
/* 매출을 별도 KPI 로 떼어 보는 거래처 채널.
   '일반' 이 기본이고, 그 외 값은 대쉬보드에서 B2B 합계에서 빠져 자기 카드를 갖는다.
   '고이' 채널 거래처(데모: 고이메모리얼)는 사업 성격이 달라 매출을 따로 보고 있어 채널로 분리했다 —
   같은 성격의 거래처가 늘면 이 목록에 값을 추가하고 거래처 레코드에 지정하면 된다. */
export const CLIENT_CHANNELS = ["일반", "고이"];
/** 거래처의 채널. 값이 없으면 일반. */
export const channelOf = (client) => (client && client.channel) || "일반";

/* 공통 필드(상태·비밀번호·약관·대표 연락처)는 한 곳에서 채운다 — 19줄에 같은 값을 복제하면 한 줄만 어긋난다.
   대표 연락처 키(managerName·contact)는 정산 명세서·주문 모달이 읽는다 → 정산담당과 같은 사람이다(가입과 같은 규칙). */
const seed = (c) => {
  const [name, , phone] = SEED_BILLING[c.id];
  const at = `${c.joinDate} 09:00`;
  return {
    status: "활성", password: DEMO_PASSWORD, managerName: name, contact: phone,
    termsAgreedAt: at, termsFirstAgreedAt: at, termsVersion: TERMS_VERSION,
    ...c,
  };
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
];

/* ── 거래처별·월별 이용 내역 (항목 카테고리 단위) ──────────────
   대시보드 인포그래픽·월간 분석 리포트의 원천 데이터.
   시드 고정 PRNG(mulberry32)로 결정적 생성 → 새로고침해도 값이 흔들리지 않는다.
   정산금액(settlementBaseRows)은 이 이용 내역의 합계에서 파생 → 표·차트·리포트 정합. */
/* 항목별 이용 비중은 개별 상품 단위(상품 규격 안내 = store.js ALL_PRODUCTS 와 동일). */
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
const CAT_WEIGHTS = [0.2, 0.1, 0.28, 0.14, 0.04, 0.03, 0.03, 0.11, 0.07]; // 상품별 이용 비중(대략, 합=1)

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 거래처 id → 0-based 시퀀스. 배열 인덱스 대신 id를 쓰므로 목록에서 한 건을 지워도
 *  나머지 거래처의 과거 데이터가 흔들리지 않는다. */
const idNum = (id) => parseInt(String(id).replace(/\D/g, ""), 10) || 0;
/** 규모 계수는 20주기로 순환 — 21번째 이후 신규 거래처가 랭킹·도넛을 지배하지 않게. */
const scaleIdx = (ci) => ci % 20;

function usageMonth(ci, m) {
  const rnd = mulberry32(97 + ci * 131 + m * 17);
  const scale = 1 + scaleIdx(ci) * 0.35; // 거래처 규모 차이
  const growth = 1 + (5 - m) * 0.09;  // 최근 월일수록 이용 증가 추세
  const items = {};
  let orders = 0, total = 0;
  USAGE_CATEGORIES.forEach((cat, i) => {
    const base = 4 * scale * growth * CAT_WEIGHTS[i];
    const count = Math.max(0, Math.round(base + (rnd() - 0.35) * 3));
    items[cat.key] = { count, amount: count * cat.unit };
    orders += count;
    total += count * cat.unit;
  });
  if (orders === 0) { // 최소 1건 보장(빈 월 방지) — 3단화환(특대형)
    const f = USAGE_CATEGORIES[2];
    items[f.key] = { count: 1, amount: f.unit };
    orders = 1; total = f.unit;
  }
  return { items, orders, total };
}

/* ── lazy 파생 + 메모이제이션 ────────────────────────────────
   시드 배열을 미리 순회해 굽지 않고, 호출 시점에 client 레코드에서 파생한다.
   → UI로 새로 등록한 거래처도 정산 표·리포트에 즉시 나타난다(예전엔 통째로 누락).
   메모 키에는 "출력에 영향을 주는 필드"를 모두 넣어, 개명·발급일 변경이
   stale 캐시로 남지 않게 한다. */
const usageCache = new Map();
const settleCache = new Map();

/** 거래명세서 실데이터(invoice-mock.js) 행 → 이용 내역 집계. 품목 키는 상품명 그대로라
 *  드릴다운·리포트(Object.entries 순회)에 그대로 실리고, 대쉬보드 도넛(USAGE_CATEGORIES 9종
 *  고정)은 `?.amount || 0` 가드로 9종 밖 품목('특대 꽃바구니')을 조용히 제외한다. */
function usageFromRows(rows) {
  const items = {};
  let total = 0;
  rows.forEach((r) => {
    const k = r[3];
    if (!items[k]) items[k] = { count: 0, amount: 0 };
    items[k].count += 1;
    items[k].amount += r[4];
    total += r[4];
  });
  return { items, orders: rows.length, total };
}

/** usageFor(client)["YYYY년 MM월"] = { items:{상품:{count,amount}}, orders, total }
 *  ⚠️ **실데이터가 있는 달은 실데이터가 이긴다**(2026-09-17 사용자 결정) — 포털 거래명세서에
 *     4건·300,000원이 찍혀 있는데 관리자 청구금액이 난수 1,795,000원이면 같은 달을 두 화면이
 *     다르게 청구하는 것이다. INVOICE_DB 는 정적이라 캐시 키는 id 그대로다. */
export function usageFor(client) {
  const id = client.id;
  if (usageCache.has(id)) return usageCache.get(id);
  const ci = idNum(id) - 1;
  const real = INVOICE_DB[id] || {};
  const byMonth = {};
  for (let m = 0; m <= 5; m++) {
    const ym = periodOf(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1));
    const rows = real[ym] && real[ym].rows;
    byMonth[ymLabel(m)] = rows && rows.length ? usageFromRows(rows) : usageMonth(ci, m);
  }
  usageCache.set(id, byMonth);
  return byMonth;
}

/* ── per-client 정산 행의 **바탕**(날짜·금액) ───────────────────
   동의·발급·입금 문자열은 여기 없다 — `js/util/settlement.js::settlementsFor` 가 store 의
   동의 기록을 얹어 완성한다(옛 이름은 그쪽이 쓴다 · 화면은 이 함수를 직접 부르지 않는다).
   메모 키에 invoiceDay 가 들어 있어 발급일을 바꾸면 발행일·정산기한이 다시 계산된다. */
export function settlementBaseRows(client) {
  /* 메모 키에 발급일 **이력 지문**까지 넣는다 — 발급일을 바꾸면 새 이력이 붙어 키가 갈리고 다시 계산된다.
     현재 발급일만 넣으면 "15일 → 1일 → 다시 15일" 이 같은 키가 되어 stale 캐시가 남는다. */
  const logKey = (client.invoiceDayLog || []).map((e) => `${e.from}:${e.day}`).join(",");
  const key = `${client.id}|${invoiceDayOf(client)}|${logKey}|${client.companyName}`;
  if (settleCache.has(key)) return settleCache.get(key);
  const usage = usageFor(client);
  const rows = [0, 1, 2, 3, 4, 5].map((m) => {
    const ym = periodOf(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1));
    /* 발행일시 = 귀속월 다음 달의 거래처 지정일 10:00 · 정산기한 = 그 발행일이 속한 달의 말일.
       둘 다 settlement-rules.js 가 계산한다 — 여기서 Date 산술을 다시 하지 않는다.
       발급일은 **그 귀속월에 유효했던 값**이다(변경은 다음 달 발급분부터 적용). */
    const issueD = issueDate(ym, invoiceDayFor(client, ym));
    const dueD = dueDate(ym);
    const amount = usage[ymLabel(m)].total; // 이용 내역 합계에서 파생(실데이터 우선)
    return {
      id: `${client.id}-${ym.replace("-", "")}`,
      ym, m,
      발행일시: issueD,
      정산기한일: dueD,
      발행일: fmtDot(issueD),
      정산기한: fmtDot(dueD),
      청구내역: `${ymLabel(m)} 꽃배달 이용금 청구`,
      청구년월: ymLabel(m),
      정산금액: won(amount),
      입금자: client.companyName,
    };
  });
  settleCache.set(key, rows);
  return rows;
}

/** report.js 계약 유지용 — { [clientId]: … } 맵으로 묶어 넘긴다. (`settlementsMap` 은 util/settlement.js) */
export const usageMap = (clients) => Object.fromEntries(clients.map((c) => [c.id, usageFor(c)]));

/** Available billing year/month options (for the settlement selector). */
export const SETTLEMENT_YEARS = (() => {
  const ys = new Set();
  for (let m = 0; m <= 5; m++) ys.add(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1).getFullYear());
  return [...ys].sort((a, b) => b - a);
})();
