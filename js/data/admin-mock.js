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
   구 시스템(flowerdel.pe.kr/adm2 · 거래처 리스트 301)에서 이관한 실데이터다.
   ─ 계약유형 '꽃집'(협력 화원) 3곳과 테스트 레코드 '장부미리보기'는 제외했다.
   ─ 담당자명·이메일은 구 시스템에 대응 필드가 없어 빈 값이다(운영이 채운다).
   ─ clientNote = 구 '거래처 참고사항'. 메모가 아니라 **거래 조건**이므로
     주문 화면에서 담당자에게 노출한다. 지우지 말 것.
   ─ 법무법인 세종 2건(C008·C015)은 같은 사업자번호의 부서 분리 — 정상 시나리오다.
   ─ 비밀번호는 이관하지 않는다(관리자 화면에서 임시비밀번호 발급 방식).
   ─ (주)뉴트리(C011)의 발급일 15일은 2026-09-17 사용자 지시 — 발급일 11~28 그룹
     (동의 마감 28일 · 작성일자 = 동의일)을 시연하는 거래처다. 2026-08 실데이터는 invoice-mock.js. */
/* 매출을 별도 KPI 로 떼어 보는 거래처 채널.
   '일반' 이 기본이고, 그 외 값은 대쉬보드에서 B2B 합계에서 빠져 자기 카드를 갖는다.
   고이장례연구소는 사업 성격이 달라 매출을 따로 보고 있어 채널로 분리했다 —
   같은 성격의 거래처가 늘면 이 목록에 값을 추가하고 거래처 레코드에 지정하면 된다. */
export const CLIENT_CHANNELS = ["일반", "고이"];
/** 거래처의 채널. 값이 없으면 일반. */
export const channelOf = (client) => (client && client.channel) || "일반";

export const INITIAL_CLIENTS = [
  { id: "C001", accountId: "taewonsci", companyName: "태원과학(주)", bizNumber: "101-81-24696", ceoName: "태원과학", managerName: "", department: "", contact: "010-2907-0637", email: "", address: "서울특별시 강남구 선릉로639 태원빌딩", status: "활성", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 6만" },
  { id: "C002", accountId: "sodamchae", companyName: "소담채(주)", bizNumber: "126-86-69187", ceoName: "방태진", managerName: "", department: "", contact: "010-3111-6726", email: "", address: "서울특별시 송파구 양재대로 932", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C003", accountId: "jinyang", companyName: "(주)진양코퍼레이션", bizNumber: "127-86-11470", ceoName: "한상현", managerName: "", department: "", contact: "010-2693-1993", email: "", address: "경기도 의정부시 산단로76번길 39(용현동)", status: "활성", joinDate: "2025-08-18", invoiceDay: "1", clientNote: "항상 고급으로 고정 진행\n60,000원 고정" },
  { id: "C004", accountId: "ksanit", companyName: "대한위생사협회", bizNumber: "106-82-31544", ceoName: "홍성유", managerName: "", department: "", contact: "", email: "", address: "인천광역시 미추홀구 미추로 62, 3층", status: "활성", joinDate: "2026-03-24", invoiceDay: "1", clientNote: "기본 50 · 고급 60 · 특대 75" },
  { id: "C005", accountId: "bluesea", companyName: "(주)늘푸른바다", bizNumber: "603-81-55074", ceoName: "김형광, 김세종", managerName: "", department: "", contact: "010-9036-5637", email: "", address: "부산광역시 사하구 다산로 277", status: "활성", joinDate: "2026-06-11", invoiceDay: "1", clientNote: "" },
  { id: "C006", accountId: "ilpumchae", companyName: "(주)일품채", bizNumber: "253-81-00355", ceoName: "심영택", managerName: "", department: "", contact: "010-2763-2483", email: "", address: "서울특별시 송파구 양재대로 932", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C007", accountId: "goifuneral", companyName: "고이장례연구소", bizNumber: "831-87-01971", ceoName: "송슬옹", managerName: "", department: "", contact: "010-6716-1647", email: "", address: "서울 관악구 신림로 122 2층 고이장례연구소", status: "활성", joinDate: "2025-02-19", invoiceDay: "1", clientNote: "", channel: "고이" },
  { id: "C008", accountId: "sejong-kds", companyName: "법무법인 세종", bizNumber: "110-81-37778", ceoName: "오종한", managerName: "", department: "김동선 변호사", contact: "010-3736-9514", email: "", address: "서울특별시 종로구 종로3길17(청진동, 디타워 디2)", status: "활성", joinDate: "2025-06-09", invoiceDay: "1", clientNote: "김동선 변호사님" },
  { id: "C009", accountId: "wholefresh", companyName: "(주)홀프레쉬", bizNumber: "609-88-01518", ceoName: "심영택", managerName: "", department: "", contact: "010-3111-6726", email: "", address: "경기도 이천시 마장면 이장로 131-14", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C010", accountId: "knmetal", companyName: "(주)한국비철", bizNumber: "105-81-52554", ceoName: "안국헌, 안준영", managerName: "", department: "", contact: "010-3813-2748", email: "", address: "충청남도 아산시 둔포면 아산밸리중앙로 170", status: "활성", joinDate: "2025-09-24", invoiceDay: "1", clientNote: "★ 기본상품 50\n필요 시 특대 75로 진행" },
  { id: "C011", accountId: "nutree", companyName: "(주)뉴트리", bizNumber: "214-86-80043", ceoName: "김도언", managerName: "", department: "", contact: "010-9547-7578", email: "", address: "서울 송파구 백제고분로27길 6-14", status: "활성", joinDate: "2025-12-03", invoiceDay: "15", clientNote: "3단(50,000원) 또는 4단(90,000원) 중 선택\n화분 80,000원 · 동서양란 80,000원 고정\n배송지연 이슈 또는 배송완료 시 빠른 소통 요망\n총담당자: 백창엽 대리" },
  { id: "C012", accountId: "peellaw", companyName: "법무법인 필", bizNumber: "856-86-03156", ceoName: "대표변호사", managerName: "", department: "", contact: "010-4137-3270", email: "", address: "서울 서초구 반포대로30길 81 웅진타워 14층", status: "활성", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 5만원 / 담당 변호사에게 배송사진 전송" },
  { id: "C013", accountId: "daehyang", companyName: "(주)대향유통", bizNumber: "215-86-29199", ceoName: "심영택", managerName: "", department: "", contact: "010-2027-7481", email: "", address: "서울특별시 송파구 양재대로 932", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C014", accountId: "jobis", companyName: "(주)자비스앤빌런즈", bizNumber: "158-86-00171", ceoName: "김범섭", managerName: "", department: "", contact: "010-2846-5524", email: "", address: "서울 강남구 테헤란로44길 8 (주)자비스앤빌런즈", status: "활성", joinDate: "2025-12-11", invoiceDay: "1", clientNote: "3단화환 '특대' 상품으로 고정, 75,000원\n쌀화환 10kg 요청 시 쌀화환 발송, 75,000원\n배송비 발생지역의 경우 별도 청구" },
  { id: "C015", accountId: "sejong-lbh", companyName: "법무법인 세종", bizNumber: "110-81-37778", ceoName: "오종한", managerName: "", department: "이병한 변호사", contact: "", email: "", address: "서울특별시 종로구 종로3길17(청진동, 디타워 디2)", status: "활성", joinDate: "2025-04-30", invoiceDay: "1", clientNote: "이병한 변호사님" },
  { id: "C016", accountId: "overlay", companyName: "주식회사 오버레이", bizNumber: "871-81-02641", ceoName: "소경민", managerName: "", department: "", contact: "010-7155-5734", email: "", address: "대전광역시 중구 중앙로 119, 9층 901호", status: "활성", joinDate: "2025-09-01", invoiceDay: "1", clientNote: "항상 고급형으로, 60,000원" },
  { id: "C017", accountId: "homepack", companyName: "(주)홈팩", bizNumber: "128-81-92904", ceoName: "", managerName: "", department: "", contact: "010-5272-6873", email: "", address: "경기도 파주시 광탄면 만장산로 227", status: "활성", joinDate: "2025-06-24", invoiceDay: "1", clientNote: "★ 상품금액 75,000원으로 기재, 무조건 특대상품 발송\n★ 추가배송비·취소비용 등 추가비용 개별청구\n★ 배송완료 이미지 전달 필수" },
  { id: "C018", accountId: "comverse", companyName: "(주)컴버스테크", bizNumber: "203-81-64674", ceoName: "김상주, 구자옥", managerName: "", department: "", contact: "010-6602-3744", email: "", address: "서울특별시 금천구 벚꽃로 234, 401호~404호", status: "활성", joinDate: "2025-05-26", invoiceDay: "1", clientNote: "화환 무조건 8만(기본) / 배송비 일절 없음" },
  { id: "C019", accountId: "cnb", companyName: "주식회사 씨앤비", bizNumber: "253-87-01899", ceoName: "여지운, 김진영", managerName: "", department: "", contact: "", email: "", address: "서울특별시 중랑구 동일로 847, 6층", status: "활성", joinDate: "2026-02-10", invoiceDay: "1", clientNote: "담당: 백소정" },
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
