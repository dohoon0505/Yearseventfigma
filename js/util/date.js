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
