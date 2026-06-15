/* ============================================================
   admin-mock.js — ADMIN console mock datasets.
   - INITIAL_CLIENTS: 거래처(client companies) — persisted/editable via store.
   - CLIENT_SETTLEMENTS: static read-only mock, keyed by client id.
   Dates are generated RELATIVE TO NOW so the date / year-month filters
   always have current data regardless of when the demo is viewed.
   ============================================================ */

const NOW = new Date();
const pad = (n) => String(n).padStart(2, "0");
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

// "YYYY년 MM월" for `monthsAgo` before this month
const ymLabel = (monthsAgo) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() - monthsAgo, 1);
  return `${d.getFullYear()}년 ${pad(d.getMonth() + 1)}월`;
};
const fmtDot = (d) => `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;

/* ── 거래처 (client companies) ──────────────────────────── */
export const INITIAL_CLIENTS = [
  { id: "C001", accountId: "jinyang",   password: "jy1234!",  companyName: "(주)진양코퍼레이션", bizNumber: "123-45-67890", ceoName: "김진양", managerName: "김사원", department: "총무팀",   contact: "010-1234-5678", email: "chong@jinyang.co.kr",   address: "서울 강남구 테헤란로 152 강남파이낸스센터 18층", status: "활성",    joinDate: "2024-03-12" },
  { id: "C002", accountId: "olhae",     password: "oh2025@",  companyName: "올해표현(유)",       bizNumber: "220-88-41205", ceoName: "정소빈", managerName: "이주임", department: "경영지원", contact: "010-2222-3456", email: "manage@olhae.kr",      address: "서울 서초구 서초대로 396 강남빌딩 7층",         status: "활성",    joinDate: "2024-07-01" },
  { id: "C003", accountId: "thinkflow", password: "tf!7788",  companyName: "주식회사 싱크플로",   bizNumber: "680-87-02988", ceoName: "홍길동", managerName: "박과장", department: "재경부",   contact: "010-7615-2699", email: "billing@thinkflow.info", address: "서울 중구 퇴계로 100 스테이트타워 남산 3층",   status: "활성",    joinDate: "2025-01-20" },
  { id: "C004", accountId: "hanbit",    password: "hb#3030",  companyName: "한빛엔지니어링",     bizNumber: "314-81-55012", ceoName: "오현석", managerName: "최대리", department: "인사팀",   contact: "010-3030-1212", email: "hr@hanbit-eng.com",    address: "경기 성남시 분당구 판교로 289 삼환하이펙스 B동", status: "승인대기", joinDate: "2026-06-02" },
  { id: "C005", accountId: "daesung",   password: "ds@9090",  companyName: "대성물산(주)",       bizNumber: "129-86-33471", ceoName: "장대성", managerName: "윤주임", department: "총무부",   contact: "010-9090-4545", email: "chong@daesung.co.kr",  address: "부산 해운대구 센텀중앙로 79 센텀사이언스파크 9층", status: "활성",    joinDate: "2024-11-08" },
  { id: "C006", accountId: "miraelaw",  password: "ml$5050",  companyName: "미래법무법인",       bizNumber: "201-85-71239", ceoName: "서민준", managerName: "한실장", department: "사무국",   contact: "010-5050-6767", email: "office@miraelaw.kr",   address: "서울 종로구 종로 33 그랑서울 타워1 12층",        status: "정지",    joinDate: "2024-05-19" },
  { id: "C007", accountId: "sejong",    password: "sj^2424",  companyName: "세종산업개발",       bizNumber: "514-87-90183", ceoName: "남기훈", managerName: "조과장", department: "관리부",   contact: "010-2424-8989", email: "admin@sejongdev.com",  address: "대전 유성구 대학로 99 세종빌딩 5층",            status: "활성",    joinDate: "2025-09-30" },
];

/* ── per-client SETTLEMENTS (settlement.js fields + 3 checks) ── */
function settlementsFor(client, ci) {
  return [0, 1, 2, 3, 4, 5].map((m) => {
    const complete = m >= 2;   // older months: fully settled
    const inProgress = m === 1; // last month: agreed + issued, not paid yet
    const issueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 1, 1);
    const dueD = new Date(NOW.getFullYear(), NOW.getMonth() - m + 2, 0);
    const amount = 300000 + ci * 50000 + (5 - m) * 30000;
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
INITIAL_CLIENTS.forEach((c, ci) => {
  CLIENT_SETTLEMENTS[c.id] = settlementsFor(c, ci);
});

/** Available billing year/month options (for the settlement selector). */
export const SETTLEMENT_YEARS = (() => {
  const ys = new Set();
  for (let m = 0; m <= 5; m++) ys.add(new Date(NOW.getFullYear(), NOW.getMonth() - m, 1).getFullYear());
  return [...ys].sort((a, b) => b - a);
})();
