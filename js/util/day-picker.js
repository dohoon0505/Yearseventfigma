/* ============================================================
   day-picker.js — '매월 N일' 날짜 칸 팝오버 (시안 '정산회계 조회 - 리모델링' · 2026-10-07)

   포털 회사정보 수정의 **발급일** 피커다. 시안은 목록이 아니라 4열 날짜 칸이다 —
   고를 수 있는 날이 22개(1~7일·11~25일)라 세로 목록이면 240px 안에서 스크롤해야 하고,
   칸이면 한눈에 다 보인다. 두 무리(1~7 / 11~25)는 동의 마감과 계산서 작성일자가
   달라서 무리마다 캡션을 단다(가입 4단계 optgroup 과 같은 구분).

   ⚠️ `makeDropdown` 을 늘려 쓰지 않은 이유(실측·코드 확인):
      · 패널이 CSS absolute 라 다이얼로그의 스크롤 본문(.dlg-body)에 잘린다 — 이 피커는
        본문 셋째 구역에 있어 스크롤 위치에 따라 위로도 아래로도 잘린다.
      · 화살표 키가 없고, ESC 를 누르면 openModal 이 먼저 잡아 **다이얼로그째** 닫힌다.
      · 라벨 함수 하나가 트리거와 칸을 함께 그려 트리거는 '매월 15일', 칸은 '15일' 이 안 된다.
      · 호출부가 14곳이라 손대면 회귀 범위가 너무 넓다.
   그래서 배송일시 피커(`makeDateTimePicker`, ui.js)의 **fixed 배치 수법**을 따른다:
   아래 → 위 → 화면 안으로 당기기, 스크롤 조상은 open() 에서 한 번만 찾고, 스크롤·리사이즈에
   다시 놓고, 트리거가 스크롤 밖으로 나가면 닫는다.

   ⚠️ 호출부 계약 둘:
      · 다이얼로그 안에서 쓰면 `openDialog({ onEsc })` 로 ESC 를 넘겨줄 것 —
        `onEsc: () => (picker.isOpen() ? (picker.close({ focus: true }), false) : true)`.
        openModal 의 ESC 핸들러가 먼저 등록돼 있어 이 모듈의 키 처리로는 이길 수 없다.
      · 그 다이얼로그 패널은 **transform 없는 등장 애니메이션**이어야 한다(hmPopOrd).
        공용 hmPop 의 scale 이 도는 동안 패널이 containing block 이 되어 fixed 패널이 갇힌다.
   ============================================================ */
import { html, setHTML } from "../dom.js";

let seq = 0;

/**
 * 마크업 — 루트는 `.dd` 가 **아니다**. makeDropdown·makeDatepicker 의 open() 이
 * 문서의 `.dd.open` 을 전부 닫아서, 같은 클래스를 쓰면 서로를 닫는다(배송일시 피커가 `.ord-dtp` 인 이유).
 * @param {{ id: string, label: string }} o  id 는 트리거에 붙는다(`dlgRow({ htmlFor })` 와 짝).
 */
export function dayPickerMarkup({ id, label }) {
  const pid = `dpk-panel-${++seq}`;
  /* ⚠️ 트리거 글자(값)를 **설명으로도** 잇는다. 호출부가 `<label for>` 를 달면 버튼의 접근성 이름이 라벨('발급일')로
     바뀌고 버튼 안 글자('매월 15일')는 버려진다(크롬 실측) — 화면 낭독기가 지금 값을 영영 못 듣는다. */
  return html`
    <div class="dpk" data-dpk>
      <button type="button" class="dpk-trigger" id="${id}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${pid}" aria-describedby="${pid}-v">
        <span class="dpk-trigger__t" id="${pid}-v"></span>
      </button>
      <div class="dpk-panel" id="${pid}" role="listbox" aria-label="${label}"></div>
    </div>
  `;
}

/**
 * makeDayPicker(root, o) → { renderTrigger, isOpen, open, close, destroy }
 *
 * @param {Element}  root           dayPickerMarkup 의 `.dpk`
 * @param {object}   o
 * @param {Array<{label: string, days: string[]}>} o.groups  칸 무리(캡션 + 날 문자열)
 * @param {Function} o.get          현재 값(문자열 날 — "15")
 * @param {Function} o.set          고른 값. **같은 값을 다시 고르면 부르지 않는다**
 *                                  (호출부가 '수정한 항목' 을 세므로 헛호출이 없어야 한다 —
 *                                  makeDropdown 에 없는 동일값 가드를 여기서는 셸이 진다).
 * @param {Function} o.label        값 → 트리거 글자(지금은 고를 수 없는 옛 값도 받는다)
 */
export function makeDayPicker(root, { groups, get, set, label }) {
  const trigger = root.querySelector(".dpk-trigger");
  const tText = root.querySelector(".dpk-trigger__t");
  const panel = root.querySelector(".dpk-panel");

  const renderTrigger = () => {
    const t = label(String(get() ?? ""));
    tText.textContent = t;
    trigger.title = t;
  };
  const isOpen = () => root.classList.contains("is-open");
  const cells = () => [...panel.querySelectorAll("[data-day]")];

  function renderPanel() {
    const cur = String(get() ?? "");
    setHTML(panel, html`${groups.map((g, gi) => html`
      <div class="dpk-grp" role="group" aria-labelledby="${panel.id}-g${gi}">
        <p class="dpk-grp__t" id="${panel.id}-g${gi}">${g.label}</p>
        <div class="dpk-grid">
          ${g.days.map((d) => html`<button type="button" class="dpk-cell ${d === cur ? "is-sel" : ""}"
            role="option" aria-selected="${d === cur ? "true" : "false"}" tabindex="-1" data-day="${d}">${d}일</button>`)}
        </div>
      </div>`)}`);
  }

  /* ── fixed 배치 — ui.js makeDateTimePicker.place() 와 같은 순서·같은 근거 ── */
  const GAP = 6, EDGE = 8;
  let clip = null;
  function findClip(el) {
    for (let p = el && el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowY;
      if (ov === "auto" || ov === "scroll") return p;
    }
    return null;
  }
  function place() {
    const t = trigger.getBoundingClientRect();
    /* 트리거가 떨어져 나갔다 → 좌표가 0,0 이라 패널이 좌상단에 유령처럼 뜬다 */
    if (!root.isConnected || (!t.width && !t.height)) { close(); return; }
    /* 스크롤로 트리거가 본문 밖으로 밀려났다 → 패널만 허공에 남는다 */
    if (clip) {
      const c = clip.getBoundingClientRect();
      if (t.bottom <= c.top || t.top >= c.bottom) { close(); return; }
    }
    const h = panel.offsetHeight, w = panel.offsetWidth;
    const vh = document.documentElement.clientHeight; // 스크롤바를 뺀 가시영역
    const vw = document.documentElement.clientWidth;
    let top = t.bottom + GAP;
    if (top + h > vh - EDGE) {
      const up = t.top - GAP - h;
      top = up >= EDGE ? up : Math.max(EDGE, Math.min(top, vh - EDGE - h));
    }
    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(Math.max(EDGE, Math.min(t.left, vw - EDGE - w))) + "px";
  }

  function open() {
    if (isOpen()) return;
    /* 다른 드롭다운은 닫고 연다(이 루트는 .dd 가 아니라 그 쓸기에 걸리지 않는다) */
    document.querySelectorAll(".dd.open").forEach((d) => d.classList.remove("open"));
    renderPanel();
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    clip = findClip(trigger);
    place(); // display 가 켜진 뒤라야 offsetHeight 가 나온다
    /* 고른 칸(없으면 첫 칸)으로 포커스 — 열자마자 화살표가 듣는다 */
    const all = cells();
    const sel = all.find((c) => c.classList.contains("is-sel")) || all[0];
    if (sel) { sel.tabIndex = 0; sel.focus({ preventScroll: true }); }
  }
  /** @param {{ focus?: boolean }} o  focus: 트리거로 포커스를 돌려준다(ESC·고르기) */
  function close({ focus = false } = {}) {
    if (!isOpen()) return;
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    clip = null;
    if (focus) trigger.focus();
  }

  const pick = (d) => {
    const cur = String(get() ?? "");
    if (d !== cur) set(d);
    renderTrigger();
    close({ focus: true });
  };

  /* ↑↓ 는 **눈에 보이는 바로 위·아래 줄**로 간다. 무리마다 줄 수가 달라(7일 = 4+3, 15일 = 4+4+4+3)
     평면 인덱스 ±4 로는 무리 경계에서 엉뚱한 칸으로 튄다 — 그래서 좌표로 고른다. */
  function vertical(from, dir) {
    const r = from.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const rows = cells().filter((c) => {
      const b = c.getBoundingClientRect();
      return dir > 0 ? b.top > r.top + 1 : b.top < r.top - 1;
    });
    if (!rows.length) return null;
    const rowTop = dir > 0
      ? Math.min(...rows.map((c) => c.getBoundingClientRect().top))
      : Math.max(...rows.map((c) => c.getBoundingClientRect().top));
    const row = rows.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 1);
    return row.reduce((best, c) => {
      const b = c.getBoundingClientRect();
      const dx = Math.abs(b.left + b.width / 2 - cx);
      return !best || dx < best.dx ? { c, dx } : best;
    }, null).c;
  }
  const move = (to) => {
    if (!to) return;
    cells().forEach((c) => { c.tabIndex = c === to ? 0 : -1; });
    to.focus();
  };

  const onTrigger = () => (isOpen() ? close() : open());
  const onPanelClick = (e) => {
    const c = e.target.closest("[data-day]");
    if (c) pick(c.dataset.day);
  };
  const onPanelKey = (e) => {
    const c = e.target.closest("[data-day]");
    if (!c) return;
    const all = cells();
    const i = all.indexOf(c);
    let to = null;
    if (e.key === "ArrowRight") to = all[Math.min(i + 1, all.length - 1)];
    else if (e.key === "ArrowLeft") to = all[Math.max(i - 1, 0)];
    else if (e.key === "ArrowDown") to = vertical(c, 1);
    else if (e.key === "ArrowUp") to = vertical(c, -1);
    else if (e.key === "Home") to = all[0];
    else if (e.key === "End") to = all[all.length - 1];
    else if (e.key === "Escape") { e.preventDefault(); close({ focus: true }); return; } // 다이얼로그 밖에서 쓸 때
    else return; // Enter·Space 는 버튼의 기본 동작(click)이 고른다
    e.preventDefault(); // 본문 스크롤이 아니라 칸을 옮긴다
    move(to);
  };
  /* 바깥 클릭 · 포커스 이탈(Tab 으로 다음 칸)에 닫는다. 칸을 다시 그리지 않으므로
     배송일시 피커의 '떨어져 나간 클릭 대상' 함정은 여기 없다. */
  const onDoc = (e) => {
    if (!isOpen() || root.contains(e.target)) return;
    /* 트리거에 묶인 <label> 은 바깥이 아니다 — 여기서 닫으면 라벨이 이어서 트리거에 보내는 합성 클릭이 다시 연다(실측).
       닫지 않고 두면 그 합성 클릭이 onTrigger 로 토글해 닫는다. */
    const lb = e.target.closest("label");
    if (lb && lb.control === trigger) return;
    close();
  };
  /* 포커스가 피커 **밖의 다른 컨트롤**로 갔을 때만 닫는다(Tab 으로 다음 칸). 조상(tabindex=-1 인 모달 패널)으로
     간 것은 빈 곳을 누른 것이라 바깥 클릭 판정(onDoc)에 맡긴다 — 여기서 닫으면 라벨을 누를 때 닫혔다가
     라벨의 합성 클릭으로 다시 열린다(실측). */
  const onFocusOut = (e) => {
    const to = e.relatedTarget;
    if (isOpen() && to && !root.contains(to) && !to.contains(root)) close();
  };
  /* 칸이 아닌 곳(무리 캡션 · 칸 사이 틈 · 패널 여백)을 누르면 포커스가 tabindex=-1 인 모달 패널로 넘어가
     위 focusout 이 '밖으로 나갔다' 로 읽고 닫는다(실측). 포커스가 칸을 떠나지 않게 기본 동작을 막는다. */
  const onPanelDown = (e) => { if (!e.target.closest("[data-day]")) e.preventDefault(); };
  const onResize = () => { if (isOpen()) place(); };
  /* 다이얼로그 본문이 스크롤되면 따라간다(capture — scroll 은 버블링하지 않는다). 패널 자신은 제외. */
  const onScroll = (e) => { if (isOpen() && !panel.contains(e.target)) place(); };

  trigger.addEventListener("click", onTrigger);
  panel.addEventListener("click", onPanelClick);
  panel.addEventListener("keydown", onPanelKey);
  panel.addEventListener("mousedown", onPanelDown);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("click", onDoc);
  window.addEventListener("resize", onResize);
  document.addEventListener("scroll", onScroll, true);
  renderTrigger();

  return {
    renderTrigger,
    isOpen,
    open,
    close,
    destroy() {
      trigger.removeEventListener("click", onTrigger);
      panel.removeEventListener("click", onPanelClick);
      panel.removeEventListener("keydown", onPanelKey);
      panel.removeEventListener("mousedown", onPanelDown);
      root.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("click", onDoc);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, true);
    },
  };
}
