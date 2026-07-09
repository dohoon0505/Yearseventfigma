/* ============================================================
   admin-mock.js — ADMIN console mock datasets.
   - INITIAL_CLIENTS: 거래처(client companies) — persisted/editable via store.
   - CLIENT_SETTLEMENTS: static read-only mock, keyed by client id.
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
   회사명은 실제 거래처. 사업자번호·연락처·이메일·주소·담당자 등 세부값은
   데모용 플레이스홀더(실제 정보 아님). */
export const INITIAL_CLIENTS = [
  { id: "C001", accountId: "sodamchae",  password: "sd1234!",  companyName: "소담채(주)",            bizNumber: "144-81-20356", ceoName: "김소담", managerName: "정수민", department: "총무팀",   contact: "010-3641-2050", email: "chong@sodamchae.co.kr",  address: "서울 송파구 법원로 11 문정역테라타워 8층",          status: "활성",    joinDate: "2023-04-18" },
  { id: "C002", accountId: "taewonsci",  password: "tw2024@",  companyName: "태원과학(주)",          bizNumber: "220-87-55013", ceoName: "이태원", managerName: "한지훈", department: "구매팀",   contact: "010-2847-9931", email: "sales@taewonsci.com",    address: "경기 안양시 동안구 시민대로 327 안양무역센터 12층", status: "활성",    joinDate: "2022-09-05" },
  { id: "C003", accountId: "jinyang",    password: "jy1234!",  companyName: "(주)진양코퍼레이션",     bizNumber: "123-45-67890", ceoName: "김진양", managerName: "김사원", department: "총무팀",   contact: "010-1234-5678", email: "chong@jinyang.co.kr",    address: "서울 강남구 테헤란로 152 강남파이낸스센터 18층",   status: "활성",    joinDate: "2024-03-12" },
  { id: "C004", accountId: "ksanit",     password: "kh#3030",  companyName: "대한위생사협회",         bizNumber: "209-82-00417", ceoName: "정문수", managerName: "오현경", department: "사무국",   contact: "010-7720-4416", email: "office@ksanitation.or.kr", address: "서울 영등포구 국회대로76길 22 기계회관 신관 5층",  status: "활성",    joinDate: "2023-11-22" },
  { id: "C005", accountId: "bluesea",    password: "bs@9090",  companyName: "(주)늘푸른바다",         bizNumber: "615-81-33920", ceoName: "한바다", managerName: "문선호", department: "영업팀",   contact: "010-9043-2271", email: "order@bluesea-f.co.kr",  address: "부산 서구 충무대로 380 부산공동어시장 3층",        status: "활성",    joinDate: "2024-01-30" },
  { id: "C006", accountId: "ilpumchae",  password: "ip$5050",  companyName: "(주)일품채",            bizNumber: "128-86-44102", ceoName: "윤일품", managerName: "배수진", department: "운영팀",   contact: "010-5521-8870", email: "mgr@ilpumchae.kr",       address: "경기 광주시 곤지암읍 경충대로 33 일품물류센터",    status: "활성",    joinDate: "2024-08-14" },
  { id: "C007", accountId: "goifuneral", password: "gi^2424",  companyName: "고이장례연구소",         bizNumber: "305-81-77231", ceoName: "고영진", managerName: "임가람", department: "관리부",   contact: "010-2240-6638", email: "info@goi.re.kr",         address: "서울 서초구 효령로 304 국제전자센터 12층",         status: "활성",    joinDate: "2023-06-09" },
  { id: "C008", accountId: "sejong-kds", password: "sj!7788",  companyName: "법무법인 세종(김동선)",   bizNumber: "101-85-62019", ceoName: "김동선", managerName: "류현우", department: "송무팀",   contact: "010-8810-3352", email: "kds@sejonglaw.com",      address: "서울 종로구 사직로8길 39 세양빌딩",               status: "활성",    joinDate: "2022-05-17" },
  { id: "C009", accountId: "ongiflower",password: "og2025@",  companyName: "온기꽃배달",             bizNumber: "119-04-88273", ceoName: "오온기", managerName: "신보라", department: "운영팀",   contact: "010-3326-7740", email: "hello@ongiflower.com",   address: "서울 마포구 양화로 45 메세나폴리스 1층",           status: "활성",    joinDate: "2025-02-11" },
  { id: "C010", accountId: "wholefresh", password: "wf#1212",  companyName: "(주)홀프레쉬",          bizNumber: "220-88-19035", ceoName: "신선우", managerName: "강민재", department: "구매팀",   contact: "010-4419-7763", email: "md@wholefresh.co.kr",    address: "경기 용인시 기흥구 흥덕중앙로 120 흥덕IT밸리",     status: "활성",    joinDate: "2024-10-03" },
  { id: "C011", accountId: "knmetal",    password: "kn@3434",  companyName: "(주)한국비철",          bizNumber: "134-81-29688", ceoName: "강철민", managerName: "조성광", department: "자재팀",   contact: "010-6627-1108", email: "biz@knmetal.co.kr",      address: "인천 서구 백범로 707 한국비철 인천공장",          status: "활성",    joinDate: "2022-12-01" },
  { id: "C012", accountId: "nutree",     password: "nt$6767",  companyName: "(주)뉴트리",            bizNumber: "312-86-51470", ceoName: "남보영", managerName: "한가은", department: "마케팅팀", contact: "010-3380-9924", email: "cs@nutree.co.kr",        address: "충북 청주시 흥덕구 오송읍 오송생명1로 194",        status: "활성",    joinDate: "2023-03-27" },
  { id: "C013", accountId: "peellaw",    password: "pl!9988",  companyName: "법무법인 필",            bizNumber: "211-85-90388", ceoName: "황필립", managerName: "정다해", department: "사무국",   contact: "010-7714-2206", email: "office@peellaw.kr",      address: "서울 서초구 서초중앙로 160 법조타워 8층",         status: "활성",    joinDate: "2024-04-22" },
  { id: "C014", accountId: "daehyang",   password: "dh@5151",  companyName: "(주)대향유통",          bizNumber: "408-81-13256", ceoName: "조대향", managerName: "윤석진", department: "물류팀",   contact: "010-2937-6614", email: "sales@daehyang.co.kr",   address: "광주 광산구 하남산단6번로 107",                  status: "활성",    joinDate: "2023-08-19" },
  { id: "C015", accountId: "jobis",      password: "jb#7788",  companyName: "(주)자비스앤빌런즈",     bizNumber: "144-88-00714", ceoName: "김범섭", managerName: "이서연", department: "경영지원", contact: "010-5048-1193", email: "partner@jobis.co",       address: "서울 강남구 테헤란로 131 한국타이어빌딩 16층",     status: "활성",    joinDate: "2025-05-08" },
  { id: "C016", accountId: "sejong-lbh", password: "sj!7799",  companyName: "법무법인 세종(이병한)",   bizNumber: "101-85-62020", ceoName: "이병한", managerName: "박준영", department: "자문팀",   contact: "010-8810-4421", email: "lbh@sejonglaw.com",      address: "서울 종로구 사직로8길 39 세양빌딩",               status: "활성",    joinDate: "2024-02-14" },
  { id: "C017", accountId: "overlay",    password: "ov2026@",  companyName: "주식회사 오버레이",       bizNumber: "765-87-01239", ceoName: "정현우", managerName: "김태희", department: "운영팀",   contact: "010-4471-9920", email: "contact@overlay.team",   address: "서울 성동구 아차산로7길 18 성수SK V1 1동",         status: "승인대기", joinDate: "2026-06-09" },
  { id: "C018", accountId: "homepack",   password: "hp#2323",  companyName: "(주)홈팩",              bizNumber: "137-81-44521", ceoName: "한정수", managerName: "서지원", department: "구매팀",   contact: "010-3329-8845", email: "order@homepack.co.kr",   address: "경기 김포시 양촌읍 황금로 124 홈팩물류센터",       status: "활성",    joinDate: "2023-10-11" },
  { id: "C019", accountId: "comverse",   password: "cv@4545",  companyName: "(주)컴버스테크",        bizNumber: "220-81-62107", ceoName: "이상헌", managerName: "노태경", department: "경영지원", contact: "010-6612-3098", email: "admin@comverse.co.kr",   address: "서울 금천구 가산디지털1로 168 우림라이온스밸리 A동", status: "활성",   joinDate: "2022-07-26" },
  { id: "C020", accountId: "ccbros",     password: "cc2026@",  companyName: "주식회사 청춘브라더스",   bizNumber: "119-86-30945", ceoName: "박지훈", managerName: "최유진", department: "마케팅팀", contact: "010-2208-7741", email: "hello@ccbros.kr",        address: "서울 마포구 와우산로29길 18",                    status: "승인대기", joinDate: "2026-06-15" },
];

/* ── 거래처별·월별 이용 내역 (항목 카테고리 단위) ──────────────
   대시보드 인포그래픽·월간 분석 리포트의 원천 데이터.
   시드 고정 PRNG(mulberry32)로 결정적 생성 → 새로고침해도 값이 흔들리지 않는다.
   정산금액(CLIENT_SETTLEMENTS)은 이 이용 내역의 합계에서 파생 → 표·차트·리포트 정합. */
/* 항목별 이용 비중은 개별 상품 단위(상품 규격 안내 = store.js ALL_PRODUCTS 와 동일). */
export const USAGE_CATEGORIES = [
  { key: "3단화환(기본형)",  unit: 50000 },
  { key: "3단화환(고급형)",  unit: 60000 },
  { key: "3단화환(특대형)",  unit: 75000 },
  { key: "4단화환(표준형)",  unit: 95000 },
  { key: "근조오브제(단형)", unit: 50000 },
  { key: "근조바구니",       unit: 50000 },
  { key: "평탁화(10kg)",     unit: 75000 },
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

function usageFor(ci, m) {
  const rnd = mulberry32(97 + ci * 131 + m * 17);
  const scale = 1 + ci * 0.35;        // 거래처 규모 차이
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

/** CLIENT_USAGE[clientId]["YYYY년 MM월"] = { items:{카테고리:{count,amount}}, orders, total } */
export const CLIENT_USAGE = {};
INITIAL_CLIENTS.forEach((c, ci) => {
  CLIENT_USAGE[c.id] = {};
  for (let m = 0; m <= 5; m++) CLIENT_USAGE[c.id][ymLabel(m)] = usageFor(ci, m);
});

/* ── per-client SETTLEMENTS (settlement.js fields + 3 checks) ── */
function settlementsFor(client) {
  return [0, 1, 2, 3, 4, 5].map((m) => {
    const complete = m >= 2;   // older months: fully settled
    const inProgress = m === 1; // last month: agreed + issued, not paid yet
    const issueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 1, 1);
    const dueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 2, 0);
    const amount = CLIENT_USAGE[client.id][ymLabel(m)].total; // 이용 내역 합계에서 파생
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
}

export const CLIENT_SETTLEMENTS = {};
INITIAL_CLIENTS.forEach((c) => {
  CLIENT_SETTLEMENTS[c.id] = settlementsFor(c);
});

/** Available billing year/month options (for the settlement selector). */
export const SETTLEMENT_YEARS = (() => {
  const ys = new Set();
  for (let m = 0; m <= 5; m++) ys.add(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1).getFullYear());
  return [...ys].sort((a, b) => b - a);
})();
