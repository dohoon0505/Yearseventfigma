/* ============================================================
   products.js — 상품 규격 안내 (#/app/products)
   시안: claude.ai/design '상품 규격 안내 - 리모델링.dc.html'

   구조는 **표 + 고정 상세 패널** 2단이다. 예전엔 표 한 장에 행마다 '샘플사진 보기'
   버튼이 있어 상품을 비교하려면 모달을 20번 여닫아야 했다 — 지금은 행을 훑는 동안
   우측 패널이 그 자리에서 바뀐다. 필터·즐겨찾기 카운트·저장은 스티키 바 하나로 합쳤다.

   ⚠️ `js/data/intake-guide.js`(지역별 반입가이드 52곳)는 **일부러 참조하지 않는다** —
      2026-09-17 시안 이식 때 표를 화면에서 내렸다(사용자 지시: 화면만 제거, 데이터는 보존).
      고아 모듈처럼 보이지만 '정리'하지 말 것. 반입 제한은 주문 퍼널(js/pages/order.js)이
      intake-rules 엔진으로 주소 입력 시점에 여전히 거르고 경고한다.
   ============================================================ */
import { html, setHTML, on, qs, qsa } from "../dom.js";
import { icon } from "../icons.js";
import { store, ALL_PRODUCTS, productKey, won } from "../store.js";
import { currentClient } from "../util/client.js";
import { pageHead, tableGrid, onRowOpen, openLightbox } from "../ui.js";

const SAMPLE = {
  경조화환: "https://images.unsplash.com/photo-1728080568516-28156ceae0ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdW5lcmFsJTIwZmxvd2VyJTIwS29yZWElMjBjZXJlbW9ueXxlbnwxfHx8fDE3NzU2Mzk0ODd8MA&ixlib=rb-4.1.0&q=80&w=1080",
  관엽화분: "https://images.unsplash.com/photo-1771466883438-4b4564648309?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cm9waWNhbCUyMGZvbGlhZ2UlMjBncmVlbiUyMHBsYW50JTIwaW5kb29yfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
  동서양란: "https://images.unsplash.com/photo-1577378978713-9bebf3db8312?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3aGl0ZSUyMHBoYWxhZW5vcHNpcyUyMG9yY2hpZCUyMGVsZWdhbnR8ZW58MXx8fHwxNzc1NjM5NDg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
  생화: "https://images.unsplash.com/photo-1641430262389-93bbbd2dd754?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMGZsb3dlciUyMGJvdXF1ZXQlMjBjb2xvcmZ1bCUyMGJsb29tfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
};
const CATEGORIES = ["전체", "경조화환", "관엽화분", "동서양란", "생화"];
/* 반입 제한 안내가 붙는 유일한 분류 — 오브제·근조바구니·쌀화환이 전부 여기 속한다. */
const IG_CAT = "경조화환";
/* 사진 비율 — 화환·화분은 세로형(3:4), 난·생화는 정방형(1:1). 시안 규격. */
const RATIO_34 = new Set(["경조화환", "관엽화분"]);

export function mount(root) {
  const state = { cat: "전체", saved: false, selKey: productKey(ALL_PRODUCTS[0]) };
  let saveTimer = null;

  /* 거래처별 계약단가(관리자 '기업별 상품단가'). 오버라이드가 없으면 카탈로그 정가.
     ⚠️ 거래처 결정은 반드시 `util/client.js` 를 경유한다(규약). 예전엔 `getClientId()` 를
        직접 써서 세션에 거래처 id 가 없는 경우 폴백이 없어 **맞춤 단가가 통째로 무시**됐다.
     ⚠️ `p.price` 는 "50,000원" 완제 문자열이지만 그건 **카탈로그 정가**다. 표와 상세 패널
        **양쪽 모두** 이 함수를 거칠 것 — 한쪽만 거치면 같은 화면이 두 금액을 말한다. */
  const clientId = (currentClient() || {}).id || null;
  const priceFor = (p) => won(store.appliedPrice(clientId, p));

  const listFor = (cat) => (cat === "전체" ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => p.category === cat));
  const findProduct = (k) => ALL_PRODUCTS.find((p) => productKey(p) === k);
  const isFav = (k) => store.get().favorites.has(k);
  const favLabel = (p, on_) => `${p.product} 즐겨찾기 ${on_ ? "해제" : "담기"}`;

  /* ── 표 ─────────────────────────────────────────────────
     ⚠️ 폭을 `var(--pc-*)` 로 넘기는 이유: tableGrid 는 grid-template-columns 를 **인라인
        style 로** 찍어서(ui.js) 미디어쿼리가 못 이긴다. 변수로 넘기면 .page-products 에서
        변수만 다시 정의해 좁은 화면 폭을 줄일 수 있다.
     ⚠️ **폴백을 반드시 함께 적을 것** — 변수가 하나라도 미정의면 선언 전체가 무효가 되어
        `grid-template-columns: none` 이 되고 **전 셀이 한 열에 쌓인다**(콘솔 오류는 없다). */
  const columns = [
    {
      label: "저장", width: "var(--pc-fav, 56px)", align: "center",
      render: (r) => {
        const k = productKey(r);
        const on_ = isFav(k);
        return html`<button class="prod-star ${on_ ? "is-on" : ""}" data-fav="${k}" aria-label="${favLabel(r, on_)}">
          ${icon("star", { size: 17 })}
        </button>`;
      },
    },
    { label: "구분", width: "var(--pc-cat, 96px)", render: (r) => r.category },
    {
      /* 행 전체가 클릭 대상이지만 행에는 tabindex 를 달지 않는다(20개 탭 스톱이 끼어든다).
         이 이름 버튼이 **선택의 키보드 경로**다. */
      label: "상세상품", width: "var(--pc-name, 180px)",
      render: (r) => {
        const k = productKey(r);
        return html`<button class="prod-name" data-pick="${k}" aria-current="${k === state.selKey ? "true" : "false"}">${r.product}</button>`;
      },
    },
    { label: "상품설명 및 비고(규격)", width: "var(--pc-desc, minmax(0,1fr))", render: (r) => r.description },
    {
      label: "상품금액", width: "var(--pc-price, 130px)", align: "right",
      render: (r) => html`<span class="prod-price">${priceFor(r)}</span>`,
    },
  ];

  /* ── 스티키 바 우측 — 카운트 + 저장 3상태 ────────────────
     즐겨찾기는 토글 즉시 store 에 영속된다. 저장 버튼은 그 사실을 사람에게 알리는
     **연출**이다 — 보류 버퍼를 만들어 '정당화'하지 말 것. */
  function saveBody() {
    const n = store.get().favorites.size;
    return html`
      <span class="prod-savecount">즐겨찾기 <b>${n}개</b></span>
      ${state.saved && n > 0
        ? html`<span class="prod-saved" role="status">${icon("check-circle", { size: 15 })}저장했습니다</span>`
        : html`<button class="prod-savebtn" data-action="save" ${n === 0 ? "disabled" : ""}>즐겨찾기 저장</button>`}
    `;
  }
  const updateSave = () => {
    const slot = qs(root, "[data-slot='save']");
    if (slot) setHTML(slot, saveBody());
  };

  const tableBody = () =>
    tableGrid({
      columns,
      rows: listFor(state.cat),
      rowKey: (r) => productKey(r),
      rowClass: (r) => (productKey(r) === state.selKey ? "prodrow--sel" : ""),
      compact: true,
    });
  const updateTable = () => {
    const slot = qs(root, "[data-slot='table']");
    if (slot) setHTML(slot, tableBody());
  };
  const updateDetail = () => {
    const slot = qs(root, "[data-slot='detail']");
    if (slot) setHTML(slot, detailBody());
  };

  /* ── 상세 패널 ─────────────────────────────────────────── */
  function detailBody() {
    const p = findProduct(state.selKey) || ALL_PRODUCTS[0];
    const k = productKey(p);
    const fav = isFav(k);
    return html`
      <div class="prod-card">
        <div class="prod-card__mediapad">
          <button class="prod-media ${RATIO_34.has(p.category) ? "is-34" : "is-11"}" data-action="zoom" aria-label="${p.product} 샘플 사진 크게 보기">
            <img src="${SAMPLE[p.category]}" alt="${p.product} 샘플 사진" />
            <span class="prod-media__zoom">${icon("search", { size: 12 })}크게 보기</span>
          </button>
        </div>
        <div class="prod-card__body">
          <p class="prod-card__cat">${p.category}</p>
          <h2 class="prod-card__name">${p.product}</h2>
          <p class="prod-card__price">${priceFor(p)}</p>
          <p class="prod-card__desc">${p.description}</p>
          ${p.category === IG_CAT
            ? html`<p class="prod-card__note">일부 지역 · 장소는 3단화환 반입이 제한돼 오브제 · 근조바구니 · 쌀화환으로 대체 발송됩니다.</p>`
            : ""}
          <button class="prod-cardfav ${fav ? "is-on" : ""}" data-fav="${k}">${fav ? "즐겨찾기에 담겼습니다" : "즐겨찾기에 담기"}</button>
          <p class="prod-card__fine">실제 상품은 사진과 다를 수 있으며, 계절과 산지 사정에 따라 품종이 바뀔 수 있습니다.</p>
        </div>
      </div>
    `;
  }

  /* 마운트에서 **한 번만** 돈다. 이후는 전부 슬롯 부분 갱신이다 —
     카테고리를 바꿀 때 페이지를 통째로 다시 그리면 포커스를 쥔 라디오가 갈려 나가
     화살표를 연속으로 누를 수 없다(실측: 세 번째 화살표가 먹지 않았다). */
  function render() {
    setHTML(
      root,
      html`
        <div class="page-products">
          <div class="prod-inner">
            ${pageHead({
              imgSrc: "./assets/nav-product.png",
              title: "상품 규격 안내",
              desc: "가격과 규격을 비교하고, 자주 쓰는 상품은 즐겨찾기에 담아두세요.",
            })}

            <div class="prod-bar">
              <div class="prod-cats" role="radiogroup" aria-label="상품조회구분">
                ${CATEGORIES.map(
                  (c) => html`<label class="prod-cat">
                    <input type="radio" name="category" data-cat="${c}" ${state.cat === c ? "checked" : ""} />
                    <span>${c}</span>
                  </label>`
                )}
              </div>
              <div class="prod-bar__r" data-slot="save">${saveBody()}</div>
            </div>

            <div class="prod-layout">
              <div class="prod-table" data-slot="table">${tableBody()}</div>
              <aside class="prod-detail" data-slot="detail" aria-label="선택한 상품 상세">${detailBody()}</aside>
            </div>
          </div>
        </div>
      `
    );
  }

  /* ── 선택 — 행을 다시 그리지 않는다 ──────────────────────
     클래스와 aria 만 토글하고 패널 슬롯만 갈아 끼운다(규약: 선택은 재렌더가 아니다). */
  function selectProduct(k) {
    if (!k || k === state.selKey || !findProduct(k)) return;
    state.selKey = k;
    qsa(root, ".table-grid__row[data-rowkey]").forEach((el) =>
      el.classList.toggle("prodrow--sel", el.dataset.rowkey === k)
    );
    qsa(root, ".prod-name[data-pick]").forEach((el) =>
      el.setAttribute("aria-current", el.dataset.pick === k ? "true" : "false")
    );
    updateDetail();
  }

  /* 같은 key 를 가진 조작 컨트롤이 **둘**이다 — 표의 별과 패널의 필 버튼.
     한쪽만 고치면 같은 상태를 두 곳이 다르게 말한다.
     ⚠️ 셀렉터는 따옴표 친 속성 선택자로 쓴다. 키에 괄호가 들어가는데
        (`경조화환__근조오브제(1단형)`) 따옴표 안에서는 안전하다 — 반대로 `CSS.escape` 를
        걸면 `\\(1단형\\)` 이 되어 오히려 매치가 깨진다. */
  function toggleFav(k) {
    const p = findProduct(k);
    if (!p) return;
    store.toggleFavorite(k);
    state.saved = false;
    const fav = isFav(k);
    qsa(root, `.prod-star[data-fav="${k}"]`).forEach((b) => {
      b.classList.toggle("is-on", fav);
      b.setAttribute("aria-label", favLabel(p, fav));
    });
    const cardBtn = qs(root, `.prod-cardfav[data-fav="${k}"]`);
    if (cardBtn) {
      cardBtn.classList.toggle("is-on", fav);
      cardBtn.textContent = fav ? "즐겨찾기에 담겼습니다" : "즐겨찾기에 담기";
    }
    updateSave();
  }

  render();

  const offPick = on(root, "click", "[data-pick]", (e, t) => selectProduct(t.dataset.pick));
  const offFav = on(root, "click", "[data-fav]", (e, t) => toggleFav(t.dataset.fav));
  /* 행 아무 데나 눌러도 선택된다. 가드 둘은 onRowOpen 안에 있다 — 안쪽 버튼(별·이름)은
     비켜 가고, 설명 칸을 드래그해 복사하는 중이면 선택이 튀지 않는다. */
  const offRow = onRowOpen(root, selectProduct);

  const offAction = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "save") {
      if (store.get().favorites.size === 0) return;
      state.saved = true;
      updateSave();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        state.saved = false;
        updateSave();
      }, 2200);
    } else if (a === "zoom") {
      const p = findProduct(state.selKey);
      if (p) openLightbox({ src: SAMPLE[p.category], alt: `${p.product} 샘플 사진`, caption: `${p.product} — ${priceFor(p)}` });
    }
  });

  /* 카테고리 전환만 전체 재렌더다.
     ⚠️ 고른 분류에 선택 상품이 없으면 첫 상품으로 옮긴다 — 안 그러면 '생화' 로 걸러 놓고
        패널엔 근조화환이 남는다(시안 목업이 다루지 않은 경우). */
  const offCat = on(root, "change", "[data-cat]", (e, t) => {
    state.cat = t.dataset.cat;
    state.saved = false;
    const list = listFor(state.cat);
    if (list.length && !list.some((p) => productKey(p) === state.selKey)) state.selKey = productKey(list[0]);
    /* ⚠️ 바(라디오)는 건드리지 않는다 — 여기서 페이지를 다시 그리면 포커스를 쥔 라디오가
       갈려 나가 **화살표를 연속으로 누를 수 없다**(실측). 라디오 그룹을 쓰는 이유가
       그 화살표 이동이라 그게 죽으면 버튼 5개와 다를 바 없어진다. */
    updateTable();
    updateDetail();
    updateSave();
  });

  /* ⚠️ 타이머 해제는 위생이 아니라 필수다. router 가 넘기는 root 는 `.shell__main`
     **그 자체**이고 이 요소는 /app/* 라우트 사이에서 재사용된다 — 남은 2.2초 타이머가
     화면을 떠난 뒤 터지면 setHTML 이 **다음 페이지의 DOM** 을 친다. */
  return () => {
    offPick();
    offFav();
    offRow();
    offAction();
    offCat();
    if (saveTimer) clearTimeout(saveTimer);
  };
}
