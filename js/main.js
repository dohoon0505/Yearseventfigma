/* ============================================================
   main.js — entry point
   ============================================================ */
import { store } from "./store.js";
import { buildSprite } from "./icons.js";
import { start } from "./router.js";
import { INVOICE_YM_KEY } from "./util/settlement.js";
import { getRole, setFocusSection } from "./session.js";

/* 알림 링크 진입(명세 6.6 · M20) — 서버가 `/go/invoice/{YYYY-MM}` 를 `/?period=YYYY-MM#/app/invoice` 로 넘긴다.
   라우터는 해시가 완전히 같아야 화면을 찾으므로 귀속월을 해시에 실을 수 없다 — 해시 **앞** 쿼리로 받아,
   정산회계 조회가 쓰는 귀속월 전달(INVOICE_YM_KEY)에 넣고 주소에서 지운다. sessionStorage 라 로그인 화면을
   거쳐 돌아와도 남고, 받는 쪽(invoice.js)이 읽고 지운다. 그 거래처의 달인지는 invoice.js 가 로그인한 뒤에 본다.
   ⚠️ 예전엔 이 쿼리를 아무도 읽지 않아 04월 링크가 가장 최근 달(06월)을 열었다(2026-10-15 실측).

   '알림으로 왔음' 도 함께 남긴다(S-02 시안 — 페이지 머리 아래 닫을 수 있는 한 줄 안내). 귀속월 전달 키는 정산회계
   조회 버튼과 **같은 키**라 그것만으로는 화면이 알림으로 왔는지 모른다 — 그래서 구역 전달(`setFocusSection`)
   한 칸을 따로 쓴다: "arrival"(이미 로그인돼 있었음) / "arrival:login"(로그인 화면을 거친다 — 안내가 '로그인 뒤에도'
   라고 말해도 사실인 경우만). 형식이 틀린 값(2026-13)도 **도착은 남긴다** — 그래야 화면이 '알림 주소의 달을 찾지
   못했습니다' 라고 말할 수 있다(예전엔 조용히 버려서 사용자는 왜 다른 달이 열렸는지 몰랐다). 그때는 남아 있던
   귀속월 전달도 지운다 — 다른 경로가 남긴 옛 값이 알림이 가리킨 달인 것처럼 열리면 안 된다. */
function takePeriodParam() {
  const q = new URLSearchParams(location.search);
  const p = q.get("period");
  if (p === null) return;
  if (location.hash === "#/app/invoice") {
    const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
    let loggedIn = false;
    try {
      if (ok) sessionStorage.setItem(INVOICE_YM_KEY, p);
      else sessionStorage.removeItem(INVOICE_YM_KEY);
      loggedIn = !!getRole();
    } catch { /* storage 비활성 — 기본 달로 열린다 */ }
    setFocusSection("invoice", loggedIn ? "arrival" : "arrival:login");
  }
  q.delete("period");
  const rest = q.toString();
  history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : "") + location.hash);
}

takePeriodParam();
store.hydrate();
buildSprite();
start();
