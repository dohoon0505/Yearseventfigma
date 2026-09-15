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

/* ── 주문 목록 행 색 톤 ──────────────────────────────────────
   세 주문 화면(#/admin/b2c · #/admin/orders · #/app/orders)이 **한 함수**를 쓴다.
   화면마다 따로 계산하면 같은 주문이 화면마다 다른 색으로 보인다.

   ⚠️ 레코드에 배송모드 필드가 없다. 주문 퍼널의 '즉시배송/날짜지정'(order.js
      state.deliv)은 피커를 자동으로 채워 줄 뿐인 **화면용 임시값**이라 제출
      시점엔 둘이 구별되지 않는다 → 당일/예약은 **배송요청일과 오늘을 비교해
      파생**한다. 서버 전환 때 모드를 필드로 둘지는 열린 질문(→ backend-spec 10장).

   ⚠️ 달력일 비교는 **문자열로** 한다. Date 로 만들어 비교하면 자정 경계·타임존에서
      하루가 밀린다. 세 포맷(대시/슬래시/T)이 앞 10자리는 모두 YYYY?MM?DD 라
      구분자만 통일하면 사전순 비교가 곧 날짜 비교다. */

/** 세 포맷 어느 것이든 → "YYYY-MM-DD" (빈 값이면 ""). */
export const dayKey = (s) => String(s || "").replace(/\//g, "-").replace("T", " ").slice(0, 10);

/** 오늘의 dayKey. getDateRange 와 같이 **호출 시점** new Date() 를 쓴다 —
    목데이터의 DATA_NOW 는 모듈 로드 시각에 고정이라, 탭을 자정 너머로 열어두면
    하루 어긋난다(새로고침하면 맞는다). 이미 있는 성질이라 여기만 다르게 가지 않는다. */
export const todayKey = () => formatDateLabel(new Date());

/** 주문 목록 행에 붙일 톤 클래스.
      취소            → ordrow--void   (연회색)
      배송완료        → ""             (흰색 = 기본)
      접수대기        → ordrow--wait   (연노랑, 배송일 무관)
      주문접수 + 당일 → ordrow--today  (연핑크) — 배송일이 오늘이거나 **이미 지난** 건.
                        지연은 가장 급한 건이라 '지금 처리할 것' 덩어리에 넣는다.
      주문접수 + 예약 → ordrow--booked (연파랑)
    배송일을 못 읽으면 색을 칠하지 않는다(틀린 색보다 무색이 낫다). */
export function orderRowTone(status, deliverAt) {
  if (status === "취소") return "ordrow--void";
  if (status === "배송완료") return "";
  if (status === "접수대기") return "ordrow--wait";
  if (status !== "주문접수") return "";
  const d = dayKey(deliverAt);
  if (!d) return "";
  return d <= todayKey() ? "ordrow--today" : "ordrow--booked";
}
