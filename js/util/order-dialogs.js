/* ============================================================
   order-dialogs.js — 주문 화면의 보조 선택 다이얼로그

   시안의 보조 다이얼로그 중 셋(주문 담당자 · 발송 프로필 · 주문 요청자)이
   같은 형태다 — 단일 선택 행 리스트 + [취소][확인]. 세 벌로 적으면 고아 행 처리·
   확인 버튼 게이트 같은 규칙이 곧 갈린다. 하나로 두고 행 데이터만 바꾼다.

   `openStaffPicker`(order-screen.js)도 이 함수에 위임한다 — 담당자 모달의 동작이
   그대로 유지되는 것이 이 구조의 조건이다.

   껍데기는 **js/util/dialog.js 의 `openDialog`** 다(시안 '전체 모달 리모델링').
   헤더(에어브로 + 22px 타이틀 + 원형 ✕) · 1.5px 섹션 룰 · 무테 필드 · 힌트 푸터를
   여기서 손으로 짜지 않는다. 예전에는 `.hm__head`/`.hm__foot` 를 직접 조립해
   같은 성격의 다이얼로그가 파일마다 다른 모양이었다.
   ⚠️ 옛 클래스 `.odlg-*` 는 CSS 에서 사라졌다 — 남겨 두면 스타일이 통째로 빠진다.
   ============================================================ */
import { html, on, qs, qsa } from "../dom.js";
import { onPhoneInput } from "./phone.js";
import { parseOrderUrl, AUTOFILL_HINT } from "../data/order-autofill.js";
import { parseOrderText } from "../data/order-text.js";
import { ALL_PRODUCTS } from "../store.js";
import { openDialog, dlgRule, dlgRow, dlgPick, dlgList, dlgActions, bindPick } from "./dialog.js";

export const MANUAL = "__manual";

/**
 * 단일 선택 행 리스트 다이얼로그.
 * @param {object} o
 *  - eyebrow, eyebrowNum     헤더 에어브로(주문번호·거래처명). **없으면 에어브로 줄을 그리지 않는다** —
 *                            `desc` 를 에어브로 자리에 올리지 않는다(그 문장은 푸터 힌트 몫이다).
 *  - title, width            (width 는 px 숫자 — 폭만 다른 클래스를 세 개 만들지 않는다)
 *  - listH                   목록 자체 스크롤 높이(기본 280 · 시안: 담당자 280·요청자 288·프로필 272)
 *  - rows[]                  { v, name, sub, meta, orphan }  v = 선택값
 *                            `meta` 는 우측 배지로, `sub` 는 이름 아래 보조줄로 간다.
 *  - current                 현재 값
 *  - confirmLabel            확인 버튼 문구
 *  - confirmIcon             확인 버튼 아이콘 이름(선택)
 *  - hint                    푸터 좌측 힌트(없으면 `desc`) — 선택이 없으면 **막는 이유**로 바뀐다
 *  - onPick(v, manual)       false 를 돌려주면 토스트 없이 닫기만 한다.
 *                            직접 입력을 고르면 v === MANUAL 이고 manual = { name, phone }
 *  - pickedMsg(v, manual)    성공 토스트 문구
 *  - empty                   행이 없을 때 보여줄 문구
 *  - manual                  { label, hint } — 목록에 없는 사람을 직접 적는 경로.
 *                            ⚠️ 이 경로가 없으면 담당자가 0명인 거래처에서 **등록 자체가
 *                            막힌다**. 구 시스템에 담당자 필드가 없어 이관 거래처 19곳 중
 *                            18곳이 담당자 0명이다 — 목록만으로는 막다른 길이다.
 *  - toast
 */
export function openRowPicker(o) {
  const rows = o.rows || [];
  let pick = o.current || "";

  const man = o.manual || null;
  const manVal = { name: "", phone: "" };
  const baseHint = o.hint || o.desc || "";

  /* 확인 가능 여부 — 직접 입력은 이름이 있어야 한다(연락처는 없으면 알림만 못 간다). */
  const canOk = () => (pick === MANUAL ? !!manVal.name.trim() : !!pick);
  /* 버튼만 흐려 두지 않는다 — 못 누르는 이유를 푸터가 그 자리에서 말한다. */
  const blockHint = () => (pick === MANUAL ? "이름을 입력하세요" : "목록에서 한 명을 선택하세요");

  /* 고아 행(직원 디렉터리에서 사라진 기존 담당자)은 보조줄에 '목록에 없음'을 실어
     맨 위에 남긴다 — 조용한 재배정이 가장 나쁜 결과다. 색은 `.dlg-pick--orphan` 이 칠한다. */
  const subOf = (r) =>
    r.orphan ? (r.sub ? `${r.sub} · 목록에 없음` : "목록에 없음") : r.sub;

  const manualRow = man
    ? dlgPick({
        v: MANUAL,
        name: man.label || "직접 입력",
        sub: man.hint || "목록에 없는 사람",
        sel: pick === MANUAL,
      })
    : "";

  const listRows = rows.length
    ? html`${rows.map((r) =>
        dlgPick({
          v: r.v,
          name: r.name,
          sub: subOf(r),
          subNum: !!r.subNum,
          badge: r.meta,
          sel: pick === r.v,
          orphan: r.orphan,
        }),
      )}${manualRow}`
    : html`<p class="dlg-empty">${o.empty || "선택할 항목이 없습니다."}</p>${manualRow}`;

  /* 직접 입력 칸은 목록 **밖**에 둔다 — 라디오그룹 안에 텍스트 입력이 섞이지 않고,
     목록이 스크롤해도 적고 있는 칸이 시야에서 사라지지 않는다.
     ⚠️ 숨김은 `.dlg-rows` 래퍼에 건다. `.dlg-row { display: grid }` 는 같은 특이도의
     `[hidden]` 을 이겨(뒤 선언 우선) 행이 그대로 보인다 — `.ordnew-req__man` 과 같은 함정. */
  const manualFields = () => html`
    <div class="dlg-rows" data-slot="manf" ${pick === MANUAL ? "" : "hidden"}>
      ${dlgRow({
        k: "이름",
        req: true,
        v: html`<input type="text" class="ord-in" data-mf="name" placeholder="이름" aria-label="이름"
          value="${manVal.name}" ${pick === MANUAL ? "" : "disabled"} />`,
      })}
      ${dlgRow({
        k: "연락처",
        v: html`<input type="text" class="ord-in" data-mf="phone" placeholder="연락처" inputmode="numeric"
          aria-label="연락처" value="${manVal.phone}" ${pick === MANUAL ? "" : "disabled"} />`,
      })}
    </div>`;

  const d = openDialog({
    eyebrow: o.eyebrow,
    eyebrowNum: o.eyebrowNum,
    title: o.title,
    width: o.width || 440,
    body: html`
      ${dlgList({ rows: listRows, label: o.title, h: o.listH || 280 })}
      ${man ? manualFields() : ""}`,
    hint: canOk() ? baseHint : blockHint(),
    hintBlock: !canOk(),
    /* ⚠️ `confirmLabel` 에 " 지정" 처럼 앞 공백을 실어 보내는 호출부가 있다(아이콘과
       띄우려던 옛 수법). 지금은 `dlgActions` 가 아이콘과 라벨 사이를 알아서 띄운다. */
    actions: dlgActions({
      ok: String(o.confirmLabel || "선택").trim(),
      okIcon: o.confirmIcon,
      disabled: !canOk(),
    }),
  });
  const panel = d.panel;

  const sync = () => {
    const ok = qs(panel, "[data-action='ok']");
    if (ok) ok.disabled = !canOk();
    if (canOk()) d.setHint(baseHint);
    else d.setHint(blockHint(), true);
  };

  /* 고를 때 **행을 다시 그리지 않는다** — 재렌더는 직접 입력 칸의 커서를 날린다.
     `bindPick` 이 `is-sel`/`aria-checked` 만 토글한다. */
  bindPick(panel, (v) => {
    pick = v;
    /* 직접 입력 칸은 그 행을 골랐을 때만 산다 — 숨은 채로 Tab 순서에 남으면
       포커스가 보이지 않는 칸으로 빠진다(openModal 의 트랩이 hidden 도 잡는다).
       그래서 `hidden` 과 `disabled` 를 **둘 다** 토글한다. */
    const box = qs(panel, "[data-slot='manf']");
    if (box) {
      const live = pick === MANUAL;
      box.hidden = !live;
      qsa(box, "input").forEach((el) => {
        el.disabled = !live;
      });
      if (live) {
        const n = qs(box, "[data-mf='name']");
        if (n) n.focus();
      }
    }
    sync();
  });
  on(panel, "input", "[data-mf]", (e, t) => {
    manVal[t.dataset.mf] = t.dataset.mf === "phone" ? onPhoneInput(t) : t.value;
    sync();
  });
  /* 닫기(✕·취소)는 `openDialog` 가 이미 위임받는다 — 여기서 다시 묶지 않는다. */
  on(panel, "click", "[data-action='ok']", () => {
    if (!canOk()) return;
    const mv = { name: manVal.name.trim(), phone: manVal.phone.trim() };
    const r = o.onPick ? o.onPick(pick, mv) : undefined;
    d.close();
    if (r === false) return;
    if (o.toast && o.pickedMsg) o.toast(o.pickedMsg(pick, mv), "ok");
  });
  return d;
}

/* ── 자동작성 ───────────────────────────────────────────────
   부고장·청첩장 링크에서 배송 정보를 읽는다. **판정은 `parseOrderUrl` 몫**이고
   이 함수는 묻고 보여줄 뿐이다 — 실 API 가 붙어도 여기는 바뀌지 않는다.
   ⚠️ 파서를 복제하거나 여기서 새 정규식을 만들지 말 것(`js/data/order-autofill.js` 단일 계약).

   인식 실패를 조용히 넘기지 않는다: 어떤 링크를 아는지 그 자리에서 말해 준다.
   (모달을 닫고 토스트로 알리면 사용자가 방금 붙여 넣은 링크를 잃는다.)
   ────────────────────────────────────────────────────────── */

/* 세그먼트 3종 — **입력의 종류가 다르다.**
   · 링크 둘: 부고장/청첩장 URL. 무엇을 넣는지 먼저 고르게 하고, 넣은 뒤 종류가
     어긋나면 그 자리에서 알려 준다(청첩장 링크를 부고장 칸에 붙여 넣는 실수가 잦다).
   · 텍스트 인식: **거래처가 보낸 평문 주문서**다(링크가 아니다). 주소·받는분·연락처·
     일시·리본문구·보내는분을 문장에서 읽는다 — 판정은 `data/order-text.js` 한 곳이다.
   ⚠️ 못 읽은 줄은 버리지 않고 요청사항으로 넘긴다. 상품·금액은 청구 근거라
      카탈로그 이름과 정확히 맞을 때만 채우고, 나머지는 담당자가 눈으로 고른다. */
const AU_MODES = [
  { k: "obit", seg: "부고장 자동입력", label: "부고장 링크", ph: "https://..." },
  { k: "wed", seg: "청첩장 자동입력", label: "청첩장 링크", ph: "https://..." },
  { k: "text", seg: "텍스트 인식", label: "주문 문자 본문",
    ph: "받은 문자를 그대로 붙여 넣으세요\n\n예) 대구광역시 수성구 동원로 123\n최창규님 (010-0000-0000)\n생신을 진심으로 축하드립니다" },
];
const AU_FOOT = "금액과 상품은 직접 확인해 주세요";
const auMode = (k) => AU_MODES.find((m) => m.k === k) || AU_MODES[0];
const auHint = (k) =>
  k === "text"
    ? "주소 · 받는분 · 연락처 · 일시 · 리본문구 · 보내는분을 문장에서 찾아 채웁니다. 못 읽은 줄은 요청사항에 남깁니다."
    : `인식 가능한 링크 · ${AUTOFILL_HINT}`;
/* 채운 항목을 사람 말로 — 토스트가 "무엇이 들어갔는지"를 말해야 담당자가 확인할 곳을 안다.
   순서는 주문서에 놓인 순서를 따른다(파서가 읽은 순서가 아니라). `time`·`vague` 는
   `date` 가 대표하므로 라벨을 주지 않는다 — '배송일 · 시각' 두 번 말할 이유가 없다. */
const GOT_ORDER = ["addr", "toName", "toPhone", "date", "ribbonPhrase", "ribbonSender", "product", "amount"];
const GOT_LABEL = {
  addr: "배송지", toName: "받는분", toPhone: "연락처", date: "배송일시",
  ribbonPhrase: "리본문구", ribbonSender: "보내는분", product: "상품", amount: "금액",
};
/** 받침이 있으면 '을', 없으면 '를' — "을(를)" 은 기계가 쓴 티가 난다. */
const eul = (w) => {
  const c = String(w || "").charCodeAt(String(w || "").length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? "을" : "를";
};
const gotText = (got) => {
  const set = new Set(got || []);
  const names = GOT_ORDER.filter((k) => set.has(k)).map((k) => GOT_LABEL[k]);
  if (!names.length) return "";
  return names.length <= 3 ? names.join(" · ") : `${names.slice(0, 3).join(" · ")} 외 ${names.length - 3}건`;
};

export function openAutofill({ toast, onApply }) {
  let mode = "obit";

  const d = openDialog({
    eyebrow: "주문서 자동작성",
    title: "무엇으로 채울까요?",
    width: 540,
    bodyClass: "dlg-body--sections",
    body: html`
      <div class="dlg-seg" role="group" aria-label="자동작성 소스">
        ${AU_MODES.map(
          (s) => html`<button type="button" class="dlg-seg__b ${s.k === mode ? "is-on" : ""}"
            aria-pressed="${s.k === mode ? "true" : "false"}" data-auseg="${s.k}">${s.seg}</button>`,
        )}
      </div>
      <div>
        ${dlgRule({ t: auMode(mode).label, cap: "배송지 · 받는분 · 리본문구" })}
        <div class="dlg-rows">
          <div class="dlg-auto">
            <input type="url" class="ord-in" data-au="link" placeholder="${auMode(mode).ph}"
              aria-label="${auMode(mode).label}" />
            <textarea class="ord-in" data-au="text" rows="4" placeholder="${auMode("text").ph}"
              aria-label="${auMode("text").label}" hidden disabled></textarea>
          </div>
          <p class="dlg-err" data-slot="auerr" hidden></p>
          <p class="dlg-hintline" data-slot="auhint">${auHint(mode)}</p>
        </div>
      </div>`,
    hint: "링크를 붙여 넣으세요",
    hintBlock: true,
    actions: dlgActions({ ok: "불러오기", disabled: true }),
  });
  const panel = d.panel;

  const field = () => qs(panel, `[data-au='${mode === "text" ? "text" : "link"}']`);
  const val = () => String((field() || {}).value || "");

  const showErr = (t) => {
    const box = qs(panel, "[data-slot='auerr']");
    if (!box) return;
    box.textContent = t || "";
    box.hidden = !t;
  };

  /* 값이 비면 못 누른다 — 그 이유를 푸터가 말한다. */
  const sync = () => {
    const has = !!val().trim();
    const ok = qs(panel, "[data-action='ok']");
    if (ok) ok.disabled = !has;
    if (has) d.setHint(AU_FOOT);
    else d.setHint(mode === "text" ? "문자를 붙여 넣으세요" : "링크를 붙여 넣으세요", true);
  };

  /* 모드 전환 — **재렌더하지 않는다**. 라벨·placeholder·힌트와 두 입력의
     hidden/disabled 만 갈아 끼운다(재렌더는 포커스를 날리고 트랩을 흔든다). */
  on(panel, "click", "[data-auseg]", (e, t) => {
    const k = t.dataset.auseg;
    if (k === mode) return;
    /* ⚠️ 값을 **버리지 않는다** — 종류가 어긋났을 때 오류 줄이 '다른 세그먼트로 바꾸세요'
       라고 안내하는데, 바꾸는 순간 방금 붙여 넣은 링크가 사라지면 그 안내가 함정이 된다.
       ⚠️ `mode` 를 바꾸기 **전에** 읽어야 한다 — `val()` 은 현재 모드의 칸을 읽는다. */
    const carried = String(val() || "");
    mode = k;
    const m = auMode(mode);
    qsa(panel, "[data-auseg]").forEach((b) => {
      const isIt = b.dataset.auseg === mode;
      b.classList.toggle("is-on", isIt);
      b.setAttribute("aria-pressed", isIt ? "true" : "false");
    });
    const link = qs(panel, "[data-au='link']");
    const text = qs(panel, "[data-au='text']");
    const useText = mode === "text";
    /* 숨은 칸은 `disabled` 까지 꺼야 한다 — openModal 의 포커스 트랩이 hidden 요소도
       훑는다(FOCUSABLE 이 `:not([disabled])` 로만 거른다). */
    if (link) {
      link.value = useText ? "" : carried;
      link.hidden = useText;
      link.disabled = useText;
      if (!useText) {
        link.placeholder = m.ph;
        link.setAttribute("aria-label", m.label);
      }
    }
    if (text) {
      text.value = useText ? carried : "";
      text.hidden = !useText;
      text.disabled = !useText;
    }
    const rule = qs(panel, ".dlg-rule__t");
    if (rule) rule.textContent = m.label;
    const hint = qs(panel, "[data-slot='auhint']");
    if (hint) hint.textContent = auHint(mode);
    showErr("");
    sync();
    const f = field();
    if (f) f.focus();
  });

  on(panel, "input", "[data-au]", () => {
    showErr("");
    sync();
  });
  /* 닫기(✕·취소)는 `openDialog` 가 위임받는다. */
  on(panel, "click", "[data-action='ok']", () => {
    const raw = val();
    if (!raw.trim()) {
      showErr(mode === "text" ? "문자를 붙여 넣으세요." : "링크를 붙여 넣으세요.");
      return;
    }
    /* 텍스트 모드는 **다른 파서**다 — 링크가 아니라 사람이 쓴 문장을 읽는다. */
    if (mode === "text") {
      const t = parseOrderText(raw, { catalog: ALL_PRODUCTS.map((p) => p.product) });
      if (!t) {
        showErr("문자에서 읽을 수 있는 항목이 없습니다. 배송지·받는분·연락처·일시·리본문구가 들어 있는지 확인해 주세요.");
        return;
      }
      d.close();
      onApply({ source: "text", ...t });
      const what = gotText(t.got);
      toast(what ? `문자에서 ${what}${eul(what)} 채웠습니다` : "문자에서 배송 정보를 불러왔습니다", "ok");
      return;
    }
    const res = parseOrderUrl(raw);
    if (!res) {
      showErr("인식하지 못한 링크입니다. 아래 목록의 링크인지 확인하세요.");
      return;
    }
    if (mode !== "text" && res.kind !== mode) {
      showErr(
        mode === "obit"
          ? "청첩장 링크입니다. '청첩장 자동입력'으로 바꾸거나 부고장 링크를 넣으세요."
          : "부고장 링크입니다. '부고장 자동입력'으로 바꾸거나 청첩장 링크를 넣으세요.",
      );
      return;
    }
    d.close();
    /* 링크 결과도 **텍스트 결과와 같은 모양**으로 넘긴다 — 상대 일자(dayOffset)를
       여기서 절대 일시로 바꿔 두면 호출부가 매핑을 두 벌로 갖지 않는다. */
    const when = res.dayOffset != null
      ? (() => { const x = new Date(); x.setDate(x.getDate() + res.dayOffset); return {
          date: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`,
          time: `${res.hour}:${res.min}` }; })()
      : { date: "", time: "" };
    onApply && onApply({ source: "link", ...res, ...when, got: ["addr", "toName", "toPhone", ...(when.date ? ["date"] : [])] });
    toast &&
      toast(
        res.kind === "obit" ? "부고장에서 배송 정보를 불러왔습니다" : "청첩장에서 배송 정보를 불러왔습니다",
        "ok",
      );
  });

  const first = qs(panel, "[data-au='link']");
  if (first) first.focus();
  return d;
}
