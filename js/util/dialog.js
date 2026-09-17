/* ============================================================
   dialog.js — 작은 다이얼로그 공용 셸 (시안 '전체 모달 리모델링')

   담당자 지정·주문취소·주문서 삭제·자동작성·발송 프로필·담당자 계정·
   거래처 담당자 관리가 **한 규격**을 쓴다. 예전에는 같은 성격의 다이얼로그가
   파일마다 `.hm__head`/`.hm__foot` 를 손으로 짜서, 헤더 글자 크기도 버튼 모양도
   제각각이었다(17px bold 제목 · 46px 전폭 버튼 · 에어브로 없음).

   규격: 18px 라운드 · 헤더(에어브로 + 22px 타이틀 + 34px 원형 ✕) ·
         1.5px 섹션 룰 · 무테 필드(.ord-in) · 힌트 푸터 + 38px 필 버튼.
   스타일은 css/components.css 의 `.dlg-*` 블록에 있다.

   ⚠️ 폭은 다이얼로그마다 다르다 — 클래스를 여섯 개 만들지 않고 `--dlg-w` 를 심는다.
   ⚠️ 푸터 좌측 힌트는 장식이 아니다. 주 버튼이 비활성일 때 **왜 못 누르는지**를
      그 자리에서 말한다(`setHint(text, true)`). 버튼만 흐려 두면 사용자는 이유를
      찾아 화면을 헤맨다.
   ============================================================ */
import { html, raw, escapeHtml, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { openModal } from "../ui.js";

/** 문자열이면 이스케이프해서 Html 로 감싼다.
 *  ⚠️ `setHTML` 은 Html 인스턴스가 아니면 이스케이프 없이 innerHTML 에 넣는다 —
 *     회사명·담당자명은 자유 입력이라 태그가 그대로 실행될 수 있다. */
const safe = (v) => (v == null || v === "" ? "" : typeof v === "string" ? html`${v}` : v);

/* 제목 id 는 **다이얼로그마다 달라야 한다** — 이 셸은 거래처 모달·등록 위저드 **위에
   스택**되는 것이 설계 전제인데, 아래 모달도 `id="modal-title"` 을 쓴다. 같은 id 가 둘이면
   `aria-labelledby` 가 트리 순서상 먼저 나온 아래 모달의 제목을 집어, 위에 뜬
   다이얼로그가 남의 이름으로 읽힌다. */
let dlgSeq = 0;

/**
 * openDialog(o) → { panel, close, setHint, render }
 *
 * @param {object}  o
 * @param {string}  o.eyebrow      헤더 소제목(주문번호·거래처명·구역 이름)
 * @param {boolean} o.eyebrowNum   에어브로가 번호면 true(tabular-nums)
 * @param {string}  o.title        22px 타이틀 — 질문형("주문을 취소할까요?")을 권장
 * @param {number}  o.width        패널 폭 px (기본 440)
 * @param {*}       o.body         본문 Html (보통 `.dlg-body` 를 셸이 씌운다)
 * @param {boolean} o.rawBody      true 면 `.dlg-body` 를 씌우지 않는다(표처럼 자체 패딩)
 * @param {*}       o.headExtra    ✕ 왼쪽에 들어갈 것(담당자 관리의 인원수 pill)
 * @param {string}  o.hint         푸터 좌측 힌트
 * @param {boolean} o.hintBlock    힌트가 '막는 이유'면 true(위험색)
 * @param {*}       o.actions      푸터 우측 버튼 Html
 * @param {string}  o.panelClass   추가 패널 클래스
 * @param {Function} o.onClose     닫힐 때
 * @param {Function} o.onEsc       ESC 훅 — false 를 돌려주면 닫지 않는다
 */
export function openDialog(o = {}) {
  const titleId = `dlg-title-${++dlgSeq}`;
  const inner = html`
    <div class="dlg-hd">
      <div class="dlg-hd__l">
        ${o.eyebrow
          ? html`<p class="dlg-hd__eyebrow ${o.eyebrowNum ? "is-num" : ""}">${safe(o.eyebrow)}</p>`
          : ""}
        <h4 class="dlg-hd__t" id="${titleId}">${safe(o.title)}</h4>
      </div>
      <div class="dlg-hd__r">
        ${o.headExtra || ""}
        <button class="dlg-x" data-action="close" data-modal-close aria-label="닫기">
          ${icon("x", { size: 15 })}
        </button>
      </div>
    </div>
    ${o.rawBody ? o.body : html`<div class="dlg-body ${o.bodyClass || ""}">${o.body}</div>`}
    <div class="dlg-ft">
      <p class="dlg-ft__hint ${o.hintBlock ? "is-block" : ""}" data-slot="dlghint">${safe(o.hint)}</p>
      <div class="dlg-ft__acts">${o.actions || ""}</div>
    </div>
  `;

  const m = openModal({
    panelClass: `modal-panel--dlg ${o.panelClass || ""}`.trim(),
    body: inner,
    labelledBy: titleId,
    onClose: o.onClose,
    onEsc: o.onEsc,
  });
  m.panel.style.setProperty("--dlg-w", `${o.width || 440}px`);
  m.panel.addEventListener("click", (e) => {
    if (e.target.closest("[data-action='close']")) m.close();
  });

  /** 푸터 힌트만 갈아 끼운다 — 본문을 다시 그리면 입력 커서가 날아간다. */
  function setHint(text, blocking = false) {
    const el = qs(m.panel, "[data-slot='dlghint']");
    if (!el) return;
    setHTML(el, safe(text));
    el.classList.toggle("is-block", !!blocking);
  }

  return { panel: m.panel, close: m.close, render: m.render, setHint };
}

/* ── 본문 조각 ─────────────────────────────────────────────
   시안의 구역 구분은 카드 테두리가 아니라 **1.5px 선 하나**다. 선 오른쪽
   캡션은 "이 구역이 어디에 쓰이는지"를 말한다(라벨만으로는 안 보이는 맥락). */
export const dlgRule = ({ t, cap } = {}) => html`
  <div class="dlg-rule">
    <b class="dlg-rule__t">${safe(t)}</b>
    ${cap ? html`<span class="dlg-rule__cap">${safe(cap)}</span>` : ""}
  </div>
`;

/** 무테 필드 한 줄. `v` 는 입력 Html(보통 `.ord-in`).
 *  조건부 행은 `hidden`/`slot` 으로 접는다 — `.dlg-row[hidden]` 규칙이 있어
 *  행에 직접 걸어도 듣는다(래퍼로 감싸면 그 행이 :last-child 가 되어 구분선이 빠진다).
 *  ⚠️ 숨길 때 안쪽 입력에 `disabled` 도 함께 걸 것(포커스 트랩이 hidden 을 모른다). */
export const dlgRow = ({ k, req, v, top, hidden, slot, htmlFor } = {}) => {
  /* ⚠️ `for` 가 없는 `<label>` 은 라벨이 아니다 — 눌러도 포커스가 옮겨가지 않고
     접근성 이름도 주지 않는다. 묶을 컨트롤 id 가 오면 진짜 label, 아니면 span 이다
     (그 경우 호출부가 입력에 `aria-label` 을 달아 이름을 준다). */
  const label = htmlFor
    ? html`<label class="dlg-row__k" for="${htmlFor}">${safe(k)}${req ? html`<span class="req">*</span>` : ""}</label>`
    : html`<span class="dlg-row__k">${safe(k)}${req ? html`<span class="req">*</span>` : ""}</span>`;
  return html`
    <div class="dlg-row ${top ? "dlg-row--top" : ""}" ${slot ? raw(`data-slot="${escapeHtml(slot)}"`) : ""} ${hidden ? "hidden" : ""}>
      ${label}
      <div class="dlg-row__v">${v}</div>
    </div>
  `;
};

/**
 * 선택 행. 체크 원 + 이름 + 보조줄(+ 우측 배지).
 * ⚠️ 선택 표시 클래스는 `is-sel` 이다. 고를 때 **행을 다시 그리지 말고**
 *    `is-sel`/`aria-checked` 만 토글할 것 — 재렌더는 직접 입력 칸의 커서를 날린다.
 */
export const dlgPick = ({ v, name, sub, subNum, badge, sel, orphan, sm } = {}) => html`
  <button type="button" class="dlg-pick ${sm ? "dlg-pick--sm" : ""} ${orphan ? "dlg-pick--orphan" : ""} ${sel ? "is-sel" : ""}"
          role="radio" aria-checked="${sel ? "true" : "false"}" data-pickrow="${v}">
    <span class="dlg-tick" aria-hidden="true"></span>
    ${sub || badge
      ? html`<span class="dlg-pick__main">
          <b class="dlg-pick__name">${safe(name)}</b>
          ${sub ? html`<span class="dlg-pick__sub ${subNum ? "is-num" : ""}">${safe(sub)}</span>` : ""}
        </span>`
      : html`<b class="dlg-pick__name" style="flex:1;min-width:0">${safe(name)}</b>`}
    ${badge ? html`<span class="dlg-pick__badge">${safe(badge)}</span>` : ""}
  </button>
`;

/** 푸터 버튼 한 쌍. 주 버튼은 `data-action='ok'`. */
export const dlgActions = ({ cancel = "취소", ok, okIcon, okClass = "hm-btn--primary", disabled } = {}) => html`
  <button class="hm-btn hm-btn--secondary" data-action="close">${safe(cancel)}</button>
  <button class="hm-btn ${okClass}" data-action="ok" ${disabled ? "disabled" : ""}>
    ${okIcon ? icon(okIcon, { size: 15 }) : ""}${safe(ok)}
  </button>
`;

/**
 * 되돌릴 수 없는 삭제 확인 — 체크를 해야 삭제 버튼이 열린다.
 * ⚠️ 주문 전용이 아니다. 거래처 모달도 같은 절차를 쓰므로 문구를 파라미터화했다 —
 *    예전엔 제목이 `주문서를 삭제할까요?` 로 **하드코딩**돼 거래처를 지울 때도
 *    "주문서"라고 물었다(본문은 '주문취소를 사용하세요'까지 권했다).
 *    인자를 안 넘기면 주문 문구가 그대로 나오므로 기존 호출부는 무변화다.
 */
export function openDeleteConfirm({ orderNo, eyebrow, title, desc, note, okLabel, onConfirm }) {
  let ack = false;
  /* 힌트 두 문장은 상수로 묶는다 — 초기 렌더와 토글이 각자 문자열을 적으면
     한쪽만 고쳐져 푸터가 버튼 상태와 다른 말을 하게 된다. */
  const HINT_OFF = "확인에 체크해야 삭제됩니다";
  const HINT_ON = "삭제를 진행할 수 있습니다";
  const d = openDialog({
    /* 에어브로는 **무엇을 지우는지**다 — 주문이면 주문번호(tabular-nums),
       거래처면 호출부가 넘긴 식별자(접속 아이디·회사명)라 숫자 정렬을 끈다. */
    eyebrow: eyebrow ?? orderNo,
    eyebrowNum: eyebrow == null,
    title: title ?? "주문서를 삭제할까요?",
    width: 440,
    /* ⚠️ 섹션 간격(`--sections`)을 쓰지 않는다 — `.dlg-desc + .dlg-note`(12px)와
       `.dlg-check`(16px)가 이미 자기 여백을 갖고 있어 flex `gap:20px` 이 **더해진다**
       (경고가 붙는 B2B 경로에서 32/36px 로 벌어졌다). 간격은 한 곳에서만 준다. */
    body: html`
      <p class="dlg-desc">${desc ?? html`목록과 정산 근거에서 함께 사라지며 되돌릴 수 없습니다.
        기록을 남겨야 한다면 삭제 대신 <b>주문취소</b>를 사용하세요.`}</p>
      ${note ? html`<div class="dlg-note">${note}</div>` : ""}
      <button class="dlg-check" data-action="ack" aria-pressed="false">
        <span class="dlg-check__box" aria-hidden="true"></span>
        <span>되돌릴 수 없음을 확인했습니다</span>
      </button>`,
    hint: HINT_OFF,
    hintBlock: true,
    actions: dlgActions({
      /* 문구는 호출부 계약이 정한다 — 주문이면 '주문서 삭제', 거래처면 '거래처 삭제'.
         제목만 갈아 끼우고 버튼을 '삭제' 로 두면 무엇을 지우는지 마지막 순간에 흐려진다. */
      cancel: "돌아가기", ok: okLabel ?? "주문서 삭제", okIcon: "trash2",
      okClass: "hm-btn--danger", disabled: true,
    }),
  });
  const p = d.panel;
  const chk = qs(p, "[data-action='ack']");
  const go = qs(p, "[data-action='ok']");
  /* 닫기(✕·돌아가기)는 셸이 이미 위임받아 처리한다 — 여기서 또 걸면 두 번 닫는다. */
  on(p, "click", "[data-action='ack']", () => {
    ack = !ack;
    chk.classList.toggle("is-on", ack);
    chk.setAttribute("aria-pressed", ack ? "true" : "false");
    go.disabled = !ack;
    /* 버튼만 흐려 두지 않는다 — 왜 못 누르는지 푸터가 그 자리에서 말한다. */
    d.setHint(ack ? HINT_ON : HINT_OFF, !ack);
  });
  on(p, "click", "[data-action='ok']", () => { if (ack) { d.close(); onConfirm(); } });
  return d;
}

/** 목록 컨테이너. `h` 로 자체 스크롤 높이를 정한다(패널이 아니라 목록이 스크롤한다).
 *  ⚠️ 속성 문자열을 통째로 보간하면 `html` 이 따옴표까지 이스케이프해 속성이 깨진다 —
 *     값만 보간할 것. */
export const dlgList = ({ rows, label, h = 280 } = {}) => html`
  <div class="dlg-list" role="radiogroup" aria-label="${label || ""}" data-slot="rows" style="--dlg-list-h:${h}px">
    ${rows}
  </div>
`;

/** 선택 행 클릭·키보드 위임 — 재렌더 없이 클래스만 토글하고 고른 값을 돌려준다.
 *
 *  ⚠️ `role="radio"` 로 선언해 놓고 화살표 키를 구현하지 않으면 AT 사용자에게
 *     **거짓말**이 된다(라디오 그룹은 화살표로 옮기고 Tab 은 그룹을 통째로 건너뛴다는
 *     약속이다). 그래서 roving tabindex + 화살표/Home/End 를 여기서 함께 준다 —
 *     행이 5~19개인 담당자·프로필 목록에서 Tab 을 그만큼 눌러야 하던 문제도 같이 사라진다.
 */
export function bindPick(panel, onPick) {
  const groupOf = (el) => el.closest("[role='radiogroup']") || panel;
  const rowsOf = (el) => [...groupOf(el).querySelectorAll("[data-pickrow]")];

  const mark = (t) => {
    rowsOf(t).forEach((el) => {
      const isIt = el === t;
      el.classList.toggle("is-sel", isIt);
      el.setAttribute("aria-checked", isIt ? "true" : "false");
      el.tabIndex = isIt ? 0 : -1; /* 그룹 전체가 Tab 한 정거장 */
    });
  };
  /* 초기 roving — 선택된 행(없으면 첫 행)만 Tab 으로 닿는다. */
  panel.querySelectorAll("[role='radiogroup']").forEach((g) => {
    const rows = [...g.querySelectorAll("[data-pickrow]")];
    const sel = rows.find((r) => r.classList.contains("is-sel")) || rows[0];
    rows.forEach((r) => { r.tabIndex = r === sel ? 0 : -1; });
  });

  const pick = (t) => { mark(t); onPick(t.dataset.pickrow, t); };
  const offClick = on(panel, "click", "[data-pickrow]", (e, t) => pick(t));
  const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  const offKey = on(panel, "keydown", "[data-pickrow]", (e, t) => {
    const rows = rowsOf(t);
    if (rows.length < 2) return;
    let next = null;
    if (e.key === "Home") next = rows[0];
    else if (e.key === "End") next = rows[rows.length - 1];
    else if (STEP[e.key]) next = rows[(rows.indexOf(t) + STEP[e.key] + rows.length) % rows.length];
    if (!next) return;
    e.preventDefault(); /* 목록 스크롤이 아니라 선택을 옮긴다 */
    next.focus();
    pick(next);
  });
  return () => { offClick(); offKey(); };
}
