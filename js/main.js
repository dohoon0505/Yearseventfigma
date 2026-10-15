/* ============================================================
   main.js — entry point
   ============================================================ */
import { store } from "./store.js";
import { buildSprite } from "./icons.js";
import { start } from "./router.js";
import { INVOICE_YM_KEY } from "./util/settlement.js";

/* 알림 링크 진입(명세 6.6 · M20) — 서버가 `/go/invoice/{YYYY-MM}` 를 `/?period=YYYY-MM#/app/invoice` 로 넘긴다.
   라우터는 해시가 완전히 같아야 화면을 찾으므로 귀속월을 해시에 실을 수 없다 — 해시 **앞** 쿼리로 받아,
   정산회계 조회가 쓰는 귀속월 전달(INVOICE_YM_KEY)에 넣고 주소에서 지운다. sessionStorage 라 로그인 화면을
   거쳐 돌아와도 남고, 받는 쪽(invoice.js)이 읽고 지운다. 그 거래처의 달인지는 invoice.js 가 로그인한 뒤에 본다.
   ⚠️ 예전엔 이 쿼리를 아무도 읽지 않아 04월 링크가 가장 최근 달(06월)을 열었다(2026-10-15 실측). */
function takePeriodParam() {
  const q = new URLSearchParams(location.search);
  const p = q.get("period");
  if (p === null) return;
  if (location.hash === "#/app/invoice" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
    try { sessionStorage.setItem(INVOICE_YM_KEY, p); } catch { /* storage 비활성 — 기본 달로 열린다 */ }
  }
  q.delete("period");
  const rest = q.toString();
  history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
}

takePeriodParam();
store.hydrate();
buildSprite();
start();
