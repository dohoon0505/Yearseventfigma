/* ============================================================
   util/date.js — date helpers for RealTimeOrders (pure)
   ============================================================ */

/** Quick-filter label → [start, end] Date range. */
export function getDateRange(filter) {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  switch (filter) {
    case "오늘":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "어제":
      start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1); end.setHours(23, 59, 59, 999);
      break;
    case "내일":
      start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 1); end.setHours(23, 59, 59, 999);
      break;
    case "이번 달":
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
      break;
    case "지난 달":
      start.setMonth(start.getMonth() - 1, 1); start.setHours(0, 0, 0, 0);
      end.setDate(0); end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setDate(1); start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0); end.setHours(23, 59, 59, 999);
  }
  return [start, end];
}

/** "2026/04/08 14:30" → Date */
export function parseOrderDate(str) {
  const [datePart, timePart] = str.split(" ");
  const [y, m, d] = datePart.split("/").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Date → "YYYY-MM-DD" */
export function formatDateLabel(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── 목데이터 날짜 생성기 ────────────────────────────────────
   목데이터의 날짜를 절대값으로 박아두면 시간이 흐르면서 기본 필터('이번 달')에
   걸리는 행이 하나도 없어져 표가 영구히 빈 화면이 된다. 기준 시각(base)을 주고
   상대 생성한다 — base 는 admin-mock 의 DATA_NOW 를 쓸 것(화면 간 '오늘'이
   어긋나면 같은 주문이 서로 다른 날로 보인다).

   ⚠ getDateRange 는 호출 시점의 new Date() 를 쓴다 — 탭을 자정 너머로 열어두면
     '오늘' 필터와 데이터가 하루 어긋날 수 있다(새로고침하면 다시 맞는다). */
export function mockDates(base) {
  const pad2 = (n) => String(n).padStart(2, "0");
  /** 오늘 기준 n일 이동 */
  const dayOff = (n) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  return {
    /** Date + "HH:mm" → "YYYY/MM/DD HH:mm" — parseOrderDate 와 같은 포맷. */
    at: (d, time) => `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${time}`,
    dayOff,
    /** n일 전 — 달 경계는 넘어가게 둔다. 1일로 클램프하면 월초에 과거 건이
     *  전부 '오늘/어제'로 쏠려 부자연스럽다. '이번 달'은 오늘·내일 건이 채운다. */
    daysAgo: (n) => dayOff(-n),
    /** 지난 달 n일 — 말일 길이(28~31)와 무관하도록 28 이하만 쓸 것. */
    lastMonth: (day) => new Date(base.getFullYear(), base.getMonth() - 1, day),
  };
}

/* ── 배송 가능 시간 규정 ────────────────────────────────────
   09:00 ~ 18:30. 주문 4단계(order.js)와 관리자 주문 모달의 배송일시 피커가
   같은 규칙을 써야 한다 — 한쪽만 고치면 포털에서 받은 시각을 관리자가 못 고른다. */
export const BIZ = { openH: 9, closeH: 18, closeM: 30 };
const p2 = (n) => String(n).padStart(2, "0");
export const hourOptions = () =>
  Array.from({ length: BIZ.closeH - BIZ.openH + 1 }, (_, i) => p2(BIZ.openH + i));
/** 마감 시각(18시)에는 30분까지만 — 18:40 은 영업시간 밖이다. */
export const minOptions = (hour) =>
  (+hour === BIZ.closeH ? ["00", "10", "20", "30"] : ["00", "10", "20", "30", "40", "50"]);
/** 시를 바꿔 분이 범위를 벗어나면 마지막 유효값으로 당긴다(18시 + 50분 → 30분). */
export const clampMin = (hour, min) => {
  const opts = minOptions(hour);
  return opts.includes(min) ? min : opts[opts.length - 1];
};
