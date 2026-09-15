/* ============================================================
   admin-mock.js — ADMIN console mock datasets.
   - INITIAL_CLIENTS: 거래처(client companies) — persisted/editable via store.
   - usageFor(client) / settlementsFor(client): 호출 시점에 client 레코드에서
     파생하는 lazy 목데이터(id 기준 메모이제이션). 정적 맵을 미리 굽지 않으므로
     UI로 새로 등록한 거래처도 정산 표·리포트에 즉시 나타난다.
   Dates are generated RELATIVE TO NOW so the date / year-month filters
   always have current data regardless of when the demo is viewed.
   ============================================================ */

const NOW = new Date();
/** 목데이터 생성 기준 시각. 화면의 '이번달/저번달' 기본값은 반드시 이 값을 써야
 *  자정·월 전환 후에도(모듈은 재평가되지 않으므로) 데이터 창과 어긋나지 않는다. */
export const DATA_NOW = NOW;
const pad = (n) => String(n).padStart(2, "0");
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

// "YYYY년 MM월" for `monthsAgo` before this month
const ymLabel = (monthsAgo) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}년 ${pad(d.getMonth() + 1)}월`;
};
const fmtDot = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;

/* ── 거래처 (client companies) ──────────────────────────────
   구 시스템(flowerdel.pe.kr/adm2 · 거래처 리스트 301)에서 이관한 실데이터다.
   ─ 계약유형 '꽃집'(협력 화원) 3곳과 테스트 레코드 '테스트 레코드'는 제외했다.
   ─ 담당자명·이메일은 구 시스템에 대응 필드가 없어 빈 값이다(운영이 채운다).
   ─ clientNote = 구 '거래처 참고사항'. 메모가 아니라 **거래 조건**이므로
     주문 화면에서 담당자에게 노출한다. 지우지 말 것.
   ─ 법무법인 한결 2건(C008·C015)은 같은 사업자번호의 부서 분리 — 정상 시나리오다.
   ─ 비밀번호는 이관하지 않는다(관리자 화면에서 임시비밀번호 발급 방식). */
/* 매출을 별도 KPI 로 떼어 보는 거래처 채널.
   '일반' 이 기본이고, 그 외 값은 대쉬보드에서 B2B 합계에서 빠져 자기 카드를 갖는다.
   고이메모리얼는 사업 성격이 달라 매출을 따로 보고 있어 채널로 분리했다 —
   같은 성격의 거래처가 늘면 이 목록에 값을 추가하고 거래처 레코드에 지정하면 된다. */
export const CLIENT_CHANNELS = ["일반", "고이"];
/** 거래처의 채널. 값이 없으면 일반. */
export const channelOf = (client) => (client && client.channel) || "일반";

export const INITIAL_CLIENTS = [
  { id: "C001", accountId: "hanbit", companyName: "한빛과학(주)", bizNumber: "000-00-00001", ceoName: "한빛과학", managerName: "", department: "", contact: "010-0000-0101", email: "", address: "서울특별시 강남구 예시로 101 한빛빌딩", status: "활성", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 6만" },
  { id: "C002", accountId: "saebom", companyName: "새봄푸드(주)", bizNumber: "000-00-00002", ceoName: "이서연", managerName: "", department: "", contact: "010-0000-0102", email: "", address: "서울특별시 송파구 예시로 202", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C003", accountId: "donghaeng", companyName: "(주)동행코퍼레이션", bizNumber: "000-00-00003", ceoName: "박지호", managerName: "", department: "", contact: "010-0000-0103", email: "", address: "경기도 의정부시 예시로 303", status: "활성", joinDate: "2025-08-18", invoiceDay: "1", clientNote: "항상 고급으로 고정 진행\n60,000원 고정" },
  { id: "C004", accountId: "nuri", companyName: "푸른누리협회", bizNumber: "000-00-00004", ceoName: "최유진", managerName: "", department: "", contact: "", email: "", address: "인천광역시 미추홀구 예시로 404, 3층", status: "활성", joinDate: "2026-03-24", invoiceDay: "1", clientNote: "기본 50 · 고급 60 · 특대 75" },
  { id: "C005", accountId: "badahyang", companyName: "(주)바다향", bizNumber: "000-00-00005", ceoName: "정도윤", managerName: "", department: "", contact: "010-0000-0105", email: "", address: "부산광역시 사하구 예시로 505", status: "활성", joinDate: "2026-06-11", invoiceDay: "1", clientNote: "" },
  { id: "C006", accountId: "matkkal", companyName: "(주)맛깔채", bizNumber: "000-00-00006", ceoName: "강하은", managerName: "", department: "", contact: "010-0000-0106", email: "", address: "서울특별시 송파구 예시로 202", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C007", accountId: "goimemorial", companyName: "고이메모리얼", bizNumber: "000-00-00007", ceoName: "조민재", managerName: "", department: "", contact: "010-0000-0107", email: "", address: "서울특별시 관악구 예시로 707, 2층", status: "활성", joinDate: "2025-02-19", invoiceDay: "1", clientNote: "", channel: "고이" },
  { id: "C008", accountId: "hangyeol-jms", companyName: "법무법인 한결", bizNumber: "000-00-00008", ceoName: "윤서아", managerName: "", department: "정민수 변호사", contact: "010-0000-0108", email: "", address: "서울특별시 종로구 예시로 808 한결빌딩", status: "활성", joinDate: "2025-06-09", invoiceDay: "1", clientNote: "정민수 변호사님" },
  { id: "C009", accountId: "singsing", companyName: "(주)싱싱마켓", bizNumber: "000-00-00009", ceoName: "강하은", managerName: "", department: "", contact: "010-0000-0102", email: "", address: "경기도 이천시 예시로 909", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C010", accountId: "daesung", companyName: "(주)대성금속", bizNumber: "000-00-00010", ceoName: "임수빈", managerName: "", department: "", contact: "010-0000-0110", email: "", address: "충청남도 아산시 예시로 110", status: "활성", joinDate: "2025-09-24", invoiceDay: "1", clientNote: "★ 기본상품 50\n필요 시 특대 75로 진행" },
  { id: "C011", accountId: "onnuri", companyName: "(주)온누리헬스", bizNumber: "000-00-00011", ceoName: "서준호", managerName: "", department: "", contact: "010-0000-0111", email: "", address: "서울특별시 송파구 예시로 111", status: "활성", joinDate: "2025-12-03", invoiceDay: "1", clientNote: "3단(50,000원) 또는 4단(90,000원) 중 선택\n화분 80,000원 · 동서양란 80,000원 고정\n배송지연 이슈 또는 배송완료 시 빠른 소통 요망\n총담당자: 이하늘 대리" },
  { id: "C012", accountId: "bareun", companyName: "법무법인 바른길", bizNumber: "000-00-00012", ceoName: "대표변호사", managerName: "", department: "", contact: "010-0000-0112", email: "", address: "서울특별시 서초구 예시로 112, 14층", status: "활성", joinDate: "2024-12-11", invoiceDay: "1", clientNote: "화환 5만원 / 담당 변호사에게 배송사진 전송" },
  { id: "C013", accountId: "daon", companyName: "(주)다온유통", bizNumber: "000-00-00013", ceoName: "강하은", managerName: "", department: "", contact: "010-0000-0113", email: "", address: "서울특별시 송파구 예시로 202", status: "활성", joinDate: "2026-01-08", invoiceDay: "1", clientNote: "" },
  { id: "C014", accountId: "parancode", companyName: "(주)파란코드", bizNumber: "000-00-00014", ceoName: "황보라", managerName: "", department: "", contact: "010-0000-0114", email: "", address: "서울특별시 강남구 예시로 114", status: "활성", joinDate: "2025-12-11", invoiceDay: "1", clientNote: "3단화환 '특대' 상품으로 고정, 75,000원\n쌀화환 10kg 요청 시 쌀화환 발송, 75,000원\n배송비 발생지역의 경우 별도 청구" },
  { id: "C015", accountId: "hangyeol-yja", companyName: "법무법인 한결", bizNumber: "000-00-00008", ceoName: "윤서아", managerName: "", department: "윤지아 변호사", contact: "", email: "", address: "서울특별시 종로구 예시로 808 한결빌딩", status: "활성", joinDate: "2025-04-30", invoiceDay: "1", clientNote: "윤지아 변호사님" },
  { id: "C016", accountId: "layered", companyName: "주식회사 레이어드", bizNumber: "000-00-00016", ceoName: "배준영", managerName: "", department: "", contact: "010-0000-0116", email: "", address: "대전광역시 중구 예시로 116, 9층", status: "활성", joinDate: "2025-09-01", invoiceDay: "1", clientNote: "항상 고급형으로, 60,000원" },
  { id: "C017", accountId: "homebox", companyName: "(주)홈박스", bizNumber: "000-00-00017", ceoName: "", managerName: "", department: "", contact: "010-0000-0117", email: "", address: "경기도 파주시 예시로 117", status: "활성", joinDate: "2025-06-24", invoiceDay: "1", clientNote: "★ 상품금액 75,000원으로 기재, 무조건 특대상품 발송\n★ 추가배송비·취소비용 등 추가비용 개별청구\n★ 배송완료 이미지 전달 필수" },
  { id: "C018", accountId: "coretech", companyName: "(주)코어테크", bizNumber: "000-00-00018", ceoName: "전하율", managerName: "", department: "", contact: "010-0000-0118", email: "", address: "서울특별시 금천구 예시로 118, 4층", status: "활성", joinDate: "2025-05-26", invoiceDay: "1", clientNote: "화환 무조건 8만(기본) / 배송비 일절 없음" },
  { id: "C019", accountId: "haneul", companyName: "주식회사 하늘빛", bizNumber: "000-00-00019", ceoName: "노승우", managerName: "", department: "", contact: "", email: "", address: "서울특별시 중랑구 예시로 119, 6층", status: "활성", joinDate: "2026-02-10", invoiceDay: "1", clientNote: "담당: 김하나" },
];

/* ── 거래처별·월별 이용 내역 (항목 카테고리 단위) ──────────────
   대시보드 인포그래픽·월간 분석 리포트의 원천 데이터.
   시드 고정 PRNG(mulberry32)로 결정적 생성 → 새로고침해도 값이 흔들리지 않는다.
   정산금액(settlementsFor)은 이 이용 내역의 합계에서 파생 → 표·차트·리포트 정합. */
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

/** usageFor(client)["YYYY년 MM월"] = { items:{카테고리:{count,amount}}, orders, total } */
export function usageFor(client) {
  const id = client.id;
  if (usageCache.has(id)) return usageCache.get(id);
  const ci = idNum(id) - 1;
  const byMonth = {};
  for (let m = 0; m <= 5; m++) byMonth[ymLabel(m)] = usageMonth(ci, m);
  usageCache.set(id, byMonth);
  return byMonth;
}

/** 거래처별 계산서 발급일(매월 N일, 1~28). 미설정·범위 밖이면 1일. */
export const INVOICE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1));
export function invoiceDayOf(client) {
  const n = Number(client && client.invoiceDay);
  return n >= 1 && n <= 28 ? n : 1;
}

/* ── per-client SETTLEMENTS (settlement.js fields + 3 checks) ── */
export function settlementsFor(client) {
  const key = `${client.id}|${invoiceDayOf(client)}|${client.companyName}`;
  if (settleCache.has(key)) return settleCache.get(key);
  const day = invoiceDayOf(client);
  const usage = usageFor(client);
  const rows = [0, 1, 2, 3, 4, 5].map((m) => {
    const complete = m >= 2;   // older months: fully settled
    const inProgress = m === 1; // last month: agreed + issued, not paid yet
    // 발행일 = 귀속월 다음 달의 거래처 지정일. 정산기한 = 그 발행일이 속한 달의 말일.
    const issueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 1, day);
    const dueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 2, 0);
    const amount = usage[ymLabel(m)].total; // 이용 내역 합계에서 파생
    return {
      id: `${client.id}-${ymLabel(m).replace(/[년월\s]/g, "")}`,
      발행일: fmtDot(issueD),
      정산기한: fmtDot(dueD),
      청구내역: `${ymLabel(m)} 꽃배달 이용금 청구`,
      청구년월: ymLabel(m),
      정산금액: won(amount),
      입금자: client.companyName,
      거래명세서동의: complete || inProgress ? "동의완료" : "동의대기",
      계산서발급: complete || inProgress ? "발급완료" : "동의하기",
      입금완료: complete ? "입금완료" : "미입금",
    };
  });
  settleCache.set(key, rows);
  return rows;
}

/** report.js 계약 유지용 — { [clientId]: … } 맵으로 묶어 넘긴다. */
export const usageMap = (clients) => Object.fromEntries(clients.map((c) => [c.id, usageFor(c)]));
export const settlementsMap = (clients) => Object.fromEntries(clients.map((c) => [c.id, settlementsFor(c)]));

/** Available billing year/month options (for the settlement selector). */
export const SETTLEMENT_YEARS = (() => {
  const ys = new Set();
  for (let m = 0; m <= 5; m++) ys.add(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1).getFullYear());
  return [...ys].sort((a, b) => b - a);
})();
