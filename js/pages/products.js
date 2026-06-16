/* ============================================================
   products.js — ports ProductGuide.tsx (상품 규격 안내)
   Favorites toggle → store (persisted). Category filter, sample modal.
   ============================================================ */
import { html, raw, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store, ALL_PRODUCTS, productKey, won } from "../store.js";
import { getClientId } from "../session.js";
import { pageTitle, tableGrid, openModal } from "../ui.js";

const sampleImages = {
  경조화환: "https://images.unsplash.com/photo-1728080568516-28156ceae0ea?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdW5lcmFsJTIwZmxvd2VyJTIwS29yZWElMjBjZXJlbW9ueXxlbnwxfHx8fDE3NzU2Mzk0ODd8MA&ixlib=rb-4.1.0&q=80&w=1080",
  관엽화분: "https://images.unsplash.com/photo-1771466883438-4b4564648309?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0cm9waWNhbCUyMGZvbGlhZ2UlMjBncmVlbiUyMHBsYW50JTIwaW5kb29yfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
  동서양란: "https://images.unsplash.com/photo-1577378978713-9bebf3db8312?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3aGl0ZSUyMHBoYWxhZW5vcHNpcyUyMG9yY2hpZCUyMGVsZWdhbnR8ZW58MXx8fHwxNzc1NjM5NDg3fDA&ixlib=rb-4.1.0&q=80&w=1080",
  생화: "https://images.unsplash.com/photo-1641430262389-93bbbd2dd754?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmcmVzaCUyMGZsb3dlciUyMGJvdXF1ZXQlMjBjb2xvcmZ1bCUyMGJsb29tfGVufDF8fHx8MTc3NTYzOTQ4N3ww&ixlib=rb-4.1.0&q=80&w=1080",
};
const categories = ["전체", "경조화환", "관엽화분", "동서양란", "생화"];

export function mount(root, { nav }) {
  const state = { selectedCategory: "전체", saved: false };
  let activeModal = null;
  let saveTimer = null;
  const closeModal = () => { if (activeModal) { activeModal.close(); activeModal = null; } };

  // Per-client price override (set in admin '기업별 상품단가 설정'). Falls back
  // to the catalog default when this company has no custom price for the item.
  const clientId = getClientId();
  const priceFor = (p) => {
    const ov = store.get().clientPrices[clientId]?.[productKey(p)];
    return typeof ov === "number" && ov > 0 ? won(ov) : p.price;
  };

  const columns = [
    {
      label: "즐겨찾기", width: "64px", align: "center",
      headerLabel: html`<span class="prod-fav-hdr">즐겨<br />찾기</span>`,
      render: (r) => {
        const k = productKey(r);
        const on = store.get().favorites.has(k);
        return html`<input type="checkbox" class="prod-fav-chk" data-fav="${k}" ${on ? "checked" : ""} aria-label="${r.product} 즐겨찾기" />`;
      },
    },
    { label: "구분", width: "90px", render: (r) => r.category },
    { label: "상세상품", width: "170px", render: (r) => r.product },
    { label: "상품금액", width: "120px", align: "right", render: (r) => html`<span class="prod-price">${priceFor(r)}</span>` },
    { label: "상품설명 및 비고(규격)", width: "1fr", render: (r) => r.description },
    {
      label: "샘플사진", width: "96px", align: "center",
      render: (r) => html`<button class="prod-sample-btn" data-action="sample" data-key="${productKey(r)}">${icon("camera", { size: 13 })}<span>보기</span></button>`,
    },
  ];

  function savebarBody() {
    const favs = store.get().favorites;
    const saveCls = favs.size === 0 ? "is-disabled" : state.saved ? "is-saved" : "is-on";
    return html`
      <span class="prod-savecount">즐겨찾기 선택 항목: <strong>${favs.size}개</strong></span>
      <button class="prod-savebtn ${saveCls}" data-action="save" ${favs.size === 0 ? "disabled" : ""}>
        ${state.saved ? icon("check-circle", { size: 15 }) : icon("save", { size: 15 })}
        ${state.saved ? "저장 완료!" : "저장"}
      </button>
    `;
  }
  const updateSavebar = () => {
    const el = qs(root, "[data-slot='savebar']");
    if (el) setHTML(el, savebarBody());
  };

  function render() {
    const filtered = state.selectedCategory === "전체" ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => p.category === state.selectedCategory);
    setHTML(
      root,
      html`
        <div class="page-products">
          ${pageTitle({ imgSrc: "./assets/nav-product.png", title: "상품 규격 안내" })}
          <div class="prod-inner">
            <div class="prod-filters">
              <div class="prod-filter-row">
                <span class="prod-filter-lbl">상품조회구분</span>
                <div class="prod-cats">
                  ${categories.map(
                    (cat) => html`<label class="prod-cat">
                      <input type="radio" name="category" data-cat="${cat}" ${state.selectedCategory === cat ? "checked" : ""} />
                      <span class="${state.selectedCategory === cat ? "is-active" : ""}">${cat}</span>
                    </label>`
                  )}
                </div>
              </div>
              <div class="prod-guide-row">
                <span class="prod-filter-lbl">즐겨찾기안내</span>
                <p>자주 이용하는 상품을 즐겨찾기에 선택해두면 경조상품 주문 시 상품 선택을 수월하게 할 수 있습니다.</p>
              </div>
            </div>

            <div class="prod-savebar" data-slot="savebar">${savebarBody()}</div>

            <div class="prod-table">
              ${tableGrid({ columns, rows: filtered, rowKey: (r) => productKey(r), compact: true })}
            </div>
          </div>
        </div>
      `
    );
  }

  function openSample(product) {
    closeModal();
    const imgUrl = sampleImages[product.category];
    const body = html`
      <div class="psample">
        <div class="psample__head">
          <div><p class="psample__cat">${product.category}</p><h3>${product.product}</h3></div>
          <button class="modal-close" data-action="close" aria-label="닫기">${icon("x", { size: 18 })}</button>
        </div>
        <div class="psample__imgwrap"><img src="${imgUrl}" alt="${product.product}" /></div>
        <div class="psample__body">
          <div class="psample__price-row"><span>상품금액</span><span class="psample__price">${priceFor(product)}</span></div>
          <p class="psample__desc">${product.description}</p>
          <div class="psample__note"><p>※ 실제 상품은 사진과 다를 수 있으며, 계절 및 산지 사정에 따라 품종이 변경될 수 있습니다.</p></div>
        </div>
        <div class="psample__foot"><button class="psample__close-btn" data-action="close">닫기</button></div>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--sample", body, onClose: () => {} });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
  }

  render();

  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    if (a === "save") {
      if (store.get().favorites.size === 0) return;
      state.saved = true;
      updateSavebar();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; state.saved = false; updateSavebar(); }, 2000);
    } else if (a === "sample") {
      const p = ALL_PRODUCTS.find((x) => productKey(x) === t.dataset.key);
      if (p) openSample(p);
    }
  });
  // favorite toggle: checkbox keeps its native state; only update count/save button
  const offFav = on(root, "change", "[data-fav]", (e, t) => {
    state.saved = false;
    store.toggleFavorite(t.dataset.fav);
    updateSavebar();
  });
  const offCat = on(root, "change", "[data-cat]", (e, t) => {
    state.selectedCategory = t.dataset.cat;
    render();
  });

  return () => {
    offClick();
    offFav();
    offCat();
    closeModal();
    if (saveTimer) clearTimeout(saveTimer);
  };
}
