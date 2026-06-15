/* ============================================================
   order.js — ports OrderPage.tsx (경조상품 주문)
   ContactSelector → OrderForm + 4 modals (Ribbon/Sender/Quick/Success)
   ============================================================ */
import { html, raw, setHTML, on, qs } from "../dom.js";
import { icon } from "../icons.js";
import { store, ALL_PRODUCTS, productKey } from "../store.js";
import { pageTitle, openModal } from "../ui.js";

const COMMON_PHRASES = [
  { group: "부고·근조", phrases: ["삼가 고인의 명복을 빕니다", "근조(謹弔)", "조의를 표합니다"] },
  { group: "결혼 축하", phrases: ["축 결혼(祝 結婚)", "화혼을 진심으로 축하드립니다", "행복한 새 출발을 축하합니다"] },
  { group: "개업·취임", phrases: ["축 개업(祝 開業)", "축 취임(祝 就任)", "번창하시길 기원합니다"] },
  { group: "기타", phrases: ["감사합니다", "항상 건강하세요", "축 승진(祝 昇진)"] },
];
const QUICK_CONFIG = {
  부고: { title: "부고장 간편접수", emoji: "🌸", desc: "부고 URL을 입력하면 배송지 정보를 자동으로 불러옵니다." },
  청첩: { title: "청첩장 간편접수", emoji: "💍", desc: "청첩장 URL을 입력하면 배송지 정보를 자동으로 불러옵니다." },
};
const MOCK_URL_DB = {
  "kakao.com": { addr: "서울특별시 강남구 테헤란로 152 강남파이낸스센터 3층", toName: "김○○ 상주" },
  "naeil.com": { addr: "경기도 성남시 분당구 판교로 289 판교오피스 빌딩", toName: "이○○ 상주" },
  "mobile.co.kr": { addr: "서울특별시 중구 세종대로 110 서울시청 본관 2층", toName: "박○○ 상주" },
  "wedding.me": { addr: "서울특별시 서초구 강남대로 373 홀리데이인 강남", toName: "최○○ 신랑측" },
  "weddingbook.com": { addr: "서울특별시 마포구 백범로 235 서울창업허브 컨벤션홀", toName: "정○○ 신부측" },
};
const won = (n) => Number(n).toLocaleString("ko-KR") + "원";

export function mount(root, { nav }) {
  const state = {
    contact: null,
    selectedProduct: null,
    address: "", toName: "", toPhone: "",
    immediateDelivery: false, deliveryDate: "", deliveryHour: "09", deliveryMinute: "00",
    ribbonPhrase: "", sender: null,
    notifyRecipient: true, notifySender: true, notifyManager: true,
  };
  let activeModal = null;
  let quickTimer = null;

  const favProducts = () =>
    ALL_PRODUCTS.filter((p) => store.get().favorites.has(productKey(p)));
  const selectedItem = () =>
    state.selectedProduct
      ? favProducts().find((p) => productKey(p) === state.selectedProduct) ?? null
      : null;
  const totalAmount = () => {
    const it = selectedItem();
    return it ? parseInt(it.price.replace(/[^0-9]/g, ""), 10) : 0;
  };
  const isReady = () =>
    !!(state.address && state.toName && state.toPhone && selectedItem() &&
      state.ribbonPhrase && state.sender &&
      (state.immediateDelivery || state.deliveryDate));

  function closeModal() {
    if (activeModal) { activeModal.close(); activeModal = null; }
    if (quickTimer) { clearTimeout(quickTimer); quickTimer = null; }
  }

  // ── top-level render ───────────────────────────────────
  function render() {
    state.contact ? renderForm() : renderSelector();
  }

  // ── ContactSelector ────────────────────────────────────
  function renderSelector() {
    const contacts = store.get().contacts;
    setHTML(
      root,
      html`
        <div class="page-order">
          <div class="page-pad">${pageTitle({ icon: "🌸", title: "경조상품 주문" })}</div>
          <div class="cselect">
            <div class="cselect__inner">
              <div class="cselect__head">
                <div class="cselect__badge">${icon("users", { size: 28 })}</div>
                <h2>담당자를 선택해 주세요</h2>
                <p>주문을 진행할 담당자를 선택하면 주문서 작성이 시작됩니다.</p>
              </div>
              ${contacts.length === 0
                ? html`
                    <div class="cselect__empty">
                      ${icon("alert-circle", { size: 32 })}
                      <div>
                        <p class="cselect__empty-t">등록된 담당자가 없습니다</p>
                        <p class="cselect__empty-d">프로필 저장공간에서 담당자를 먼저 등록해 주세요.</p>
                      </div>
                      <button class="btn btn-secondary" data-action="goto-profile">담당자 등록하러 가기</button>
                    </div>
                  `
                : html`
                    <div class="cselect__list">
                      ${contacts.map(
                        (c) => html`
                          <button class="ccard" data-action="select-contact" data-no="${c.no}">
                            <div class="ccard__l">
                              <div class="ccard__avatar">${icon("user", { size: 18 })}</div>
                              <div>
                                <div class="ccard__name-row">
                                  <span class="ccard__name">${c.name}</span>
                                  <span class="ccard__role">${c.role}</span>
                                </div>
                                <p class="ccard__phone">${c.phone}</p>
                              </div>
                            </div>
                            ${icon("chevron-right", { size: 18, cls: "ccard__chev" })}
                          </button>
                        `
                      )}
                    </div>
                  `}
              <div class="cselect__add">
                <button data-action="goto-profile">+ 새 담당자 등록하기</button>
              </div>
            </div>
          </div>
        </div>
      `
    );
  }

  // ── OrderForm sub-renderers ────────────────────────────
  function notifyRows() {
    return [
      { key: "recipient", label: "받는분", name: state.toName || null, phone: state.toPhone || null, fallback: "미입력", on: state.notifyRecipient },
      { key: "sender", label: "보내는분", name: state.sender?.name || null, phone: state.sender?.phone || null, fallback: "미선택", on: state.notifySender },
      { key: "manager", label: "담당자", name: state.contact.name, phone: state.contact.phone, fallback: null, on: state.notifyManager },
    ];
  }
  function notifyBody() {
    return html`${notifyRows().map(
      (item) => html`
        <div class="onotify__row">
          <div class="onotify__info">
            <p class="onotify__label">${item.label}</p>
            <p class="onotify__value">
              ${item.name
                ? html`${item.name}${item.phone ? `(${item.phone})` : ""}`
                : html`<span class="onotify__fallback">${item.fallback}</span>`}
            </p>
          </div>
          <div class="onotify__ctrl">
            ${item.on
              ? icon("bell", { size: 13, cls: "onotify__bell-on" })
              : icon("bell-off", { size: 13, cls: "onotify__bell-off" })}
            <button
              type="button"
              class="toggle"
              role="switch"
              aria-checked="${String(item.on)}"
              aria-label="${item.label} 알림"
              data-action="toggle-notify"
              data-key="${item.key}"
            >
              <span class="toggle__knob"></span>
            </button>
          </div>
        </div>
      `
    )}`;
  }
  function submitBody() {
    const ready = isReady();
    return html`
      <button
        type="button"
        class="osubmit ${ready ? "is-ready" : ""}"
        data-action="submit"
        ${ready ? "" : "disabled"}
      >
        ${ready ? "🌸 주문 접수하기" : "필수 항목을 모두 입력해 주세요"}
      </button>
      ${ready ? "" : html`<p class="osubmit__hint">상품선택 · 배송지 · 리본문구 · 보내는분 필수</p>`}
    `;
  }
  function rightSummaryBody() {
    const it = selectedItem();
    if (!it) return "";
    return html`
      <div class="card osummary">
        <div class="osummary__head">${icon("package", { size: 15 })}<span>주문 상품 요약</span></div>
        <div class="osummary__body">
          <div class="osummary__line">
            <span class="osummary__prod">${it.product}</span>
            <span class="osummary__cat">${it.category}</span>
          </div>
          <div class="osummary__total">
            <span>금액</span><span class="osummary__amt">${won(totalAmount())}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderForm() {
    const favs = favProducts();
    const it = selectedItem();
    setHTML(
      root,
      html`
        <div class="page-order">
          <div class="page-pad page-order__title">${pageTitle({ icon: "🌸", title: "경조상품 주문" })}</div>

          <!-- 담당자 바 -->
          <div class="oform__contactbar">
            <div class="oform__contactbar-inner">
              <div class="oform__contact-avatar">${icon("user", { size: 14 })}</div>
              <span class="oform__contact-lbl">담당자:</span>
              <span class="oform__contact-name">${state.contact.name}</span>
              <span class="oform__contact-role">${state.contact.role}</span>
              <span class="oform__contact-phone">${state.contact.phone}</span>
              <button class="oform__contact-change" data-action="change-contact">
                ${icon("pencil", { size: 13 })} 변경
              </button>
            </div>
          </div>

          <div class="oform__scroll">
            <div class="oform__wrap">
              <!-- 간편접수 -->
              <div class="oquick">
                <button class="oquick__btn oquick__btn--obit" data-action="quick-부고">
                  <span class="oquick__deco-l"></span>
                  <div class="oquick__txt">
                    <p class="oquick__t">부고장으로 간편접수</p>
                    <p class="oquick__d">근조화환 빠른주문</p>
                  </div>
                  ${icon("chevron-right", { size: 20, cls: "oquick__chev" })}
                </button>
                <button class="oquick__btn oquick__btn--wed" data-action="quick-청첩">
                  <span class="oquick__deco-l oquick__deco-l--wed"></span>
                  <div class="oquick__txt">
                    <p class="oquick__t">청첩장으로 간편접수</p>
                    <p class="oquick__d">축하화환 빠른주문</p>
                  </div>
                  ${icon("chevron-right", { size: 20, cls: "oquick__chev" })}
                </button>
              </div>

              <div class="oform__divider">
                <span class="oform__divider-line"></span>
                <span class="oform__divider-txt">일반 주문서 작성</span>
                <span class="oform__divider-line"></span>
              </div>

              <div class="oform__cols">
                <!-- 좌측 -->
                <div class="oform__left">
                  <!-- 상품 선택 -->
                  <div class="section-card">
                    <div class="section-card__head">
                      <div class="section-card__title">${icon("package", { size: 16, cls: "tint-blue" })}상품 선택</div>
                      ${favs.length
                        ? html`<button class="section-card__link" data-action="goto-products">즐겨찾기 관리</button>`
                        : ""}
                    </div>
                    <div class="section-card__body">
                      ${favs.length === 0
                        ? html`
                            <div class="oprod__empty">
                              ${icon("star", { size: 24 })}
                              <div>
                                <p class="oprod__empty-t">즐겨찾기 상품이 없습니다</p>
                                <p class="oprod__empty-d">상품 규격 안내 페이지에서 즐겨찾기를 설정해 주세요.</p>
                              </div>
                              <button class="btn btn-primary" data-action="goto-products">상품 규격 안내 보기</button>
                            </div>
                          `
                        : html`
                            <div class="oprod__list">
                              ${favs.map((p) => {
                                const key = productKey(p);
                                const sel = state.selectedProduct === key;
                                return html`
                                  <label class="oprod__item ${sel ? "is-sel" : ""}">
                                    <input type="radio" name="product" value="${key}" ${sel ? "checked" : ""} />
                                    <span class="oprod__emoji">${p.icon}</span>
                                    <div class="oprod__meta">
                                      <p class="oprod__name">${p.product}</p>
                                      <p class="oprod__cat">${p.category}</p>
                                    </div>
                                    <span class="oprod__price ${sel ? "is-sel" : ""}">${p.price}</span>
                                    ${sel ? icon("check-circle", { size: 15, cls: "tint-blue" }) : ""}
                                  </label>
                                `;
                              })}
                              ${it
                                ? html`<div class="oprod__selected">
                                    <span>선택 상품: ${it.product}</span>
                                    <span class="oprod__selected-amt">${won(totalAmount())}</span>
                                  </div>`
                                : ""}
                            </div>
                          `}
                    </div>
                  </div>

                  <!-- 배송지 정보 -->
                  <div class="section-card">
                    <div class="section-card__head">
                      <div class="section-card__title">${icon("truck", { size: 16, cls: "tint-blue" })}배송지 정보</div>
                    </div>
                    <div class="section-card__body">
                      <div class="ofields">
                        ${ofield({ label: "배송지 주소", field: "address", value: state.address, placeholder: "배송지 주소를 입력해 주세요", icon: "map-pin", required: true })}
                        <div class="ofields__grid2">
                          ${ofield({ label: "받는분 성함", field: "toName", value: state.toName, placeholder: "예) 홍길동", icon: "user", required: true })}
                          ${ofield({ label: "받는분 연락처", field: "toPhone", value: state.toPhone, placeholder: "010-0000-0000", icon: "phone", required: true })}
                        </div>
                        <!-- 배송요청 일시 -->
                        <div class="odt">
                          <div class="odt__head">
                            <label class="odt__label">${icon("calendar-days", { size: 15, cls: "tint-blue" })}배송요청 일시<span class="req">*</span></label>
                            <label class="odt__imm">
                              <input type="checkbox" data-field="immediate" ${state.immediateDelivery ? "checked" : ""} />
                              <span>즉시배송</span>
                            </label>
                          </div>
                          <div class="odt__row ${state.immediateDelivery ? "is-disabled" : ""}">
                            <div class="odt__date-wrap">
                              ${icon("calendar-days", { size: 15, cls: "odt__icon" })}
                              <input type="date" class="odt__date" data-field="deliveryDate" value="${state.deliveryDate}" ${state.immediateDelivery ? "disabled" : ""} />
                            </div>
                            <div class="odt__hour-wrap">
                              ${icon("clock", { size: 15, cls: "odt__icon" })}
                              <select class="odt__hour" data-field="deliveryHour" ${state.immediateDelivery ? "disabled" : ""}>
                                ${Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(
                                  (h) => html`<option value="${h}" ${state.deliveryHour === h ? "selected" : ""}>${h}시</option>`
                                )}
                              </select>
                            </div>
                            <select class="odt__min" data-field="deliveryMinute" ${state.immediateDelivery ? "disabled" : ""}>
                              ${["00", "10", "20", "30", "40", "50"].map(
                                (m) => html`<option value="${m}" ${state.deliveryMinute === m ? "selected" : ""}>${m}분</option>`
                              )}
                            </select>
                          </div>
                          ${state.immediateDelivery ? immediateMsg() : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 리본 정보 -->
                  <div class="section-card">
                    <div class="section-card__head">
                      <div class="section-card__title">${icon("tag", { size: 16, cls: "tint-blue" })}리본 정보</div>
                    </div>
                    <div class="section-card__body">
                      <div class="oribbon">
                        <div>
                          <div class="oribbon__lblrow">
                            <label class="oribbon__lbl">리본 문구<span class="req">*</span></label>
                            <button class="oribbon__edit" data-action="open-ribbon">${icon("pencil", { size: 13 })} ${state.ribbonPhrase ? "수정" : "작성하기"}</button>
                          </div>
                          <div class="oribbon__box ${state.ribbonPhrase ? "is-filled" : "is-empty"}" data-action="open-ribbon">
                            ${state.ribbonPhrase || "리본 문구를 작성해 주세요"}
                          </div>
                        </div>
                        <div>
                          <div class="oribbon__lblrow">
                            <label class="oribbon__lbl">보내는분<span class="req">*</span></label>
                            <button class="oribbon__edit" data-action="open-sender">${icon("user", { size: 13 })} ${state.sender ? "변경" : "선택하기"}</button>
                          </div>
                          ${state.sender
                            ? html`<div class="oribbon__sender is-filled" data-action="open-sender">
                                <div class="oribbon__sender-top"><span class="oribbon__sender-name">${state.sender.name}</span><span class="oribbon__sender-role">${state.sender.role}</span></div>
                                <p class="oribbon__sender-greet">${state.sender.greeting}</p>
                              </div>`
                            : html`<div class="oribbon__box is-empty" data-action="open-sender">프로필에서 보내는분을 선택해 주세요</div>`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div data-slot="submit">${submitBody()}</div>
                </div>

                <!-- 우측 -->
                <div class="oform__right">
                  <div class="onote">
                    <div class="onote__head">${icon("file-text", { size: 15 })}<span>주문 시 참고사항</span></div>
                    <div class="onote__body">
                      • 당일 오전 11:00 이전 주문 건 당일 배송 가능합니다.<br />
                      • 주말 및 공휴일은 배송이 제한됩니다.<br />
                      • 이른 아침·저녁 시간대 배송은 사전 협의가 필요합니다.<br />
                      • 화환 리본 문구는 접수 후 수정이 불가합니다.<br />
                      • 기타 문의: 02-0000-0000
                    </div>
                  </div>

                  <div class="card onotify">
                    <div class="onotify__head">${icon("bell", { size: 15, cls: "tint-blue" })}<span>배송완료 알림 수신</span></div>
                    <div class="onotify__list" data-slot="notify">${notifyBody()}</div>
                    <div class="onotify__foot">배송 완료 시 ON 설정된 분께 문자 메세지가 자동 발송됩니다.</div>
                  </div>

                  <div data-slot="summary-right">${rightSummaryBody()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    );
  }

  function ofield({ label, field, value, placeholder, icon: ic, required }) {
    return html`
      <div class="ofield">
        <label class="ofield__lbl" for="of-${field}">${label}${required ? html`<span class="req">*</span>` : ""}</label>
        <div class="ofield__wrap">
          ${ic ? icon(ic, { size: 14, cls: "ofield__icon" }) : ""}
          <input class="ofield__input ${ic ? "has-icon" : ""}" id="of-${field}" data-field="${field}" type="text" value="${value}" placeholder="${placeholder}" />
        </div>
      </div>
    `;
  }
  function immediateMsg() {
    const d = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return html`<p class="odt__imm-msg">${icon("check-circle", { size: 14 })}${yyyy}년 ${mm}월 ${dd}일 ${hh}시 ${min}분 전으로 배송됩니다.</p>`;
  }

  // targeted updates (avoid full re-render while typing)
  const upd = (slot, body) => {
    const el = qs(root, `[data-slot='${slot}']`);
    if (el) setHTML(el, body);
  };
  const updNotify = () => upd("notify", notifyBody());
  const updSubmit = () => upd("submit", submitBody());
  const updRight = () => upd("summary-right", rightSummaryBody());

  /* ── Modals ──────────────────────────────────────────── */
  function modalHead({ iconBox, title, desc, emoji }) {
    return html`
      <div class="omodal-head">
        <div class="omodal-head__l">
          ${emoji ? html`<span class="omodal-head__emoji">${emoji}</span>` : iconBox}
          <div>
            <h3 id="omodal-title">${title}</h3>
            <p>${desc}</p>
          </div>
        </div>
        <button class="modal-close" data-action="close" aria-label="닫기">${icon("x", { size: 18 })}</button>
      </div>
    `;
  }

  function openRibbonModal() {
    closeModal();
    const m = { tab: "common", selected: state.ribbonPhrase, custom: state.ribbonPhrase };
    const current = () => (m.tab === "common" ? m.selected : m.custom);
    const body = () => html`
      ${modalHead({
        iconBox: html`<div class="omodal-head__icon omodal-head__icon--orange">${icon("tag", { size: 16 })}</div>`,
        title: "리본 문구 작성",
        desc: "화환 리본에 표시될 문구를 선택하거나 직접 입력하세요.",
      })}
      <div class="rib-tabs">
        ${[["common", "자주 사용 문구"], ["custom", "직접 입력"]].map(
          ([k, label]) => html`<button class="rib-tab ${m.tab === k ? "is-active" : ""}" data-action="tab" data-tab="${k}">${label}</button>`
        )}
      </div>
      <div class="rib-scroll">
        ${m.tab === "common"
          ? html`<div class="rib-groups">
              ${COMMON_PHRASES.map(
                (g) => html`<div>
                  <p class="rib-group-t">${g.group}</p>
                  <div class="rib-chips">
                    ${g.phrases.map(
                      (ph) => html`<button class="rib-chip ${m.selected === ph ? "is-sel" : ""}" data-action="phrase" data-phrase="${ph}">${ph}${m.selected === ph ? icon("check-circle", { size: 12, cls: "rib-chip__chk" }) : ""}</button>`
                    )}
                  </div>
                </div>`
              )}
            </div>`
          : html`<div class="rib-custom">
              <textarea class="rib-textarea" data-ribbon-custom placeholder="리본에 표시될 문구를 직접 입력해 주세요." rows="4">${m.custom}</textarea>
              <p class="rib-count" data-slot="rib-count">${m.custom.length}자</p>
            </div>`}
      </div>
      <div class="rib-preview-slot" data-slot="rib-preview">${ribPreview(current())}</div>
      <div class="omodal-foot">
        <button class="btn-cancel" data-action="close">취소</button>
        <button class="btn-apply ${current() ? "is-on" : ""}" data-action="confirm" data-slot="rib-confirm" ${current() ? "" : "disabled"}>적용</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--ribbon", body: body(), labelledBy: "omodal-title", onClose: () => {} });
    const re = () => activeModal.render(body());
    on(activeModal.panel, "click", "[data-action]", (e, t) => {
      const a = t.dataset.action;
      if (a === "close") { closeModal(); }
      else if (a === "tab") { m.tab = t.dataset.tab; re(); }
      else if (a === "phrase") { m.selected = t.dataset.phrase; re(); }
      else if (a === "confirm") {
        if (!current()) return;
        state.ribbonPhrase = current();
        closeModal();
        renderForm();
      }
    });
    on(activeModal.panel, "input", "[data-ribbon-custom]", (e, t) => {
      m.custom = t.value;
      const c = qs(activeModal.panel, "[data-slot='rib-count']");
      if (c) c.textContent = `${m.custom.length}자`;
      upInModal("rib-preview", ribPreview(current()));
      const btn = qs(activeModal.panel, "[data-slot='rib-confirm']");
      if (btn) { btn.disabled = !current(); btn.classList.toggle("is-on", !!current()); }
    });
  }
  const ribPreview = (cur) =>
    cur
      ? html`<div class="rib-preview"><p class="rib-preview__lbl">리본 문구 미리보기</p><p class="rib-preview__val">${cur}</p></div>`
      : "";
  const upInModal = (slot, body) => {
    const el = qs(activeModal.panel, `[data-slot='${slot}']`);
    if (el) setHTML(el, body);
  };

  function openSenderModal() {
    closeModal();
    const profiles = store.get().profiles;
    const m = { pick: state.sender };
    const body = () => html`
      ${modalHead({
        iconBox: html`<div class="omodal-head__icon omodal-head__icon--blue">${icon("user", { size: 16 })}</div>`,
        title: "보내는분 선택",
        desc: "리본에 표시될 발신인 프로필을 선택하세요.",
      })}
      <div class="snd-list">
        ${profiles.length === 0 ? html`<div class="snd-empty">등록된 프로필이 없습니다.<br />프로필 저장공간에서 먼저 등록해 주세요.</div>` : ""}
        ${profiles.map(
          (p) => html`<label class="snd-item ${m.pick?.no === p.no ? "is-sel" : ""}">
            <input type="radio" name="sender" value="${p.no}" ${m.pick?.no === p.no ? "checked" : ""} data-snd-no="${p.no}" />
            <div class="snd-item__meta">
              <div class="snd-item__top"><span class="snd-item__name">${p.name}</span><span class="snd-item__role">${p.role}</span></div>
              <p class="snd-item__greet">${p.greeting}</p>
            </div>
          </label>`
        )}
      </div>
      ${m.pick
        ? html`<div class="snd-preview"><p class="snd-preview__lbl">선택된 프로필 고정문구</p><p class="snd-preview__val">${m.pick.greeting}</p></div>`
        : ""}
      <div class="omodal-foot">
        <button class="btn-cancel" data-action="close">취소</button>
        <button class="btn-confirm-blue ${m.pick ? "is-on" : ""}" data-action="confirm" ${m.pick ? "" : "disabled"}>선택 완료</button>
      </div>
    `;
    activeModal = openModal({ panelClass: "modal-panel--sender", body: body(), labelledBy: "omodal-title", onClose: () => {} });
    const re = () => activeModal.render(body());
    on(activeModal.panel, "change", "input[data-snd-no]", (e, t) => {
      m.pick = profiles.find((p) => p.no === t.dataset.sndNo) || null;
      re();
    });
    on(activeModal.panel, "click", "[data-action]", (e, t) => {
      const a = t.dataset.action;
      if (a === "close") closeModal();
      else if (a === "confirm" && m.pick) { state.sender = m.pick; closeModal(); renderForm(); }
    });
  }

  function openQuickModal(type) {
    closeModal();
    const cfg = QUICK_CONFIG[type];
    const profiles = store.get().profiles;
    const m = { url: "", urlStatus: "idle", addr: "", toName: "", toPhone: "", step: 1, sender: null, done: false };
    const step1Valid = () => m.urlStatus === "success" && !!m.toPhone;

    const spinner = (sz) => raw(`<svg class="icon icon--spin" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle style="opacity:.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path style="opacity:.75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>`);

    const body = () => {
      if (m.done) {
        return html`
          ${modalHead({ emoji: cfg.emoji, title: cfg.title, desc: cfg.desc })}
          <div class="quick-done">
            <div class="quick-done__icon">${icon("check-circle", { size: 28 })}</div>
            <div class="quick-done__txt"><p class="quick-done__t">간편접수가 완료되었습니다!</p><p class="quick-done__d">담당자에게 배송 완료 알림이 발송됩니다.</p></div>
            <button class="btn btn-secondary" data-action="close">확인</button>
          </div>
        `;
      }
      return html`
        ${modalHead({ emoji: cfg.emoji, title: cfg.title, desc: cfg.desc })}
        <div class="quick-steps">
          <div class="quick-step-dot ${m.step >= 1 ? "is-on" : ""}">1</div>
          <div class="quick-step-line ${m.step > 1 ? "is-on" : ""}"></div>
          <div class="quick-step-dot ${m.step >= 2 ? "is-on" : ""}">2</div>
        </div>
        ${m.step === 1
          ? html`
              <div class="quick-body">
                <p class="quick-steplbl">STEP 1 — URL 조회 및 배송지 확인</p>
                <div class="ofield">
                  <label class="ofield__lbl">${type === "부고" ? "부고장" : "청첩장"} URL<span class="req">*</span></label>
                  <div class="quick-url-row">
                    <div class="quick-url-input ${m.urlStatus}">
                      ${icon("external-link", { size: 14, cls: "ofield__icon" })}
                      <input type="url" data-quick-url placeholder="https://..." value="${m.url}" />
                    </div>
                    <button class="quick-lookup ${m.url.trim() && m.urlStatus !== "loading" ? "is-on" : ""}" data-action="lookup" ${!m.url.trim() || m.urlStatus === "loading" ? "disabled" : ""}>
                      ${m.urlStatus === "loading" ? spinner(16) : "조회"}
                    </button>
                  </div>
                  ${m.urlStatus === "loading" ? html`<div class="quick-fb quick-fb--load">${spinner(14)}<span>배송지 정보를 조회하고 있습니다...</span></div>` : ""}
                  ${m.urlStatus === "error" ? html`<div class="quick-fb quick-fb--err">${icon("alert-circle", { size: 13 })}<span>URL을 다시 확인해주세요.</span></div>` : ""}
                  ${m.urlStatus === "success" ? html`<div class="quick-fb quick-fb--ok">${icon("check-circle", { size: 13 })}<span>배송지 정보를 불러왔습니다.</span></div>` : ""}
                </div>
                <div class="quick-auto ${m.urlStatus === "success" ? "" : "is-locked"}">
                  ${quickAutoField("배송지 주소", "addr", m.addr, "map-pin", "URL 조회 후 자동 입력됩니다", m.urlStatus === "success")}
                  ${quickAutoField("받는분 성함", "toName", m.toName, "user", "URL 조회 후 자동 입력됩니다", m.urlStatus === "success")}
                  <div class="ofield">
                    <label class="ofield__lbl">받는분 연락처<span class="req">*</span></label>
                    <div class="ofield__wrap">${icon("phone", { size: 14, cls: "ofield__icon" })}<input class="ofield__input has-icon" data-quick-field="toPhone" type="text" value="${m.toPhone}" placeholder="010-0000-0000" /></div>
                  </div>
                </div>
                ${m.urlStatus === "idle"
                  ? html`<div class="quick-hint">${icon("info", { size: 13, cls: "tint-blue" })}<p>${type === "부고" ? "카카오 부고 등" : "청첩장"} URL을 붙여넣고 <strong>조회</strong> 버튼을 눌러주세요.<br />배송지 주소와 받는분 성함이 자동으로 입력됩니다.</p></div>`
                  : ""}
              </div>
            `
          : html`
              <div class="quick-body">
                <p class="quick-steplbl">STEP 2 — 보내는분 선택</p>
                <div class="quick-snd-list">
                  ${profiles.length === 0 ? html`<div class="snd-empty">등록된 프로필이 없습니다.<br />프로필 저장공간에서 먼저 등록해 주세요.</div>` : ""}
                  ${profiles.map(
                    (p) => html`<label class="quick-snd-item ${m.sender?.no === p.no ? "is-sel" : ""}">
                      <input type="radio" name="qsender" ${m.sender?.no === p.no ? "checked" : ""} data-qsnd-no="${p.no}" />
                      <div class="quick-snd-meta"><span class="quick-snd-name">${p.name}</span><span class="quick-snd-role">${p.role}</span><p class="quick-snd-greet">${p.greeting}</p></div>
                    </label>`
                  )}
                </div>
                <div class="quick-osum">
                  <p class="quick-osum__lbl">주문 요약</p>
                  <p class="quick-osum__row">${icon("map-pin", { size: 12 })}${m.addr}</p>
                  <p class="quick-osum__row">${icon("user", { size: 12 })}받는분: ${m.toName} (${m.toPhone})</p>
                  ${m.sender ? html`<p class="quick-osum__row">${icon("check-circle", { size: 12, cls: "tint-green" })}보내는분: ${m.sender.greeting}</p>` : ""}
                </div>
              </div>
            `}
        <div class="omodal-foot quick-foot">
          ${m.step > 1 ? html`<button class="btn-cancel" data-action="quick-prev">이전</button>` : ""}
          <button class="btn-cancel" data-action="close">취소</button>
          ${m.step === 1
            ? html`<button class="btn-confirm-blue ${step1Valid() ? "is-on" : ""}" data-action="quick-next" ${step1Valid() ? "" : "disabled"}>적용</button>`
            : html`<button class="btn-apply is-on" data-action="quick-submit">접수하기</button>`}
        </div>
      `;
    };

    function doLookup() {
      if (!m.url.trim()) return;
      m.urlStatus = "loading"; m.addr = ""; m.toName = "";
      if (quickTimer) clearTimeout(quickTimer);
      activeModal.render(body());
      quickTimer = setTimeout(() => {
        const matched = Object.entries(MOCK_URL_DB).find(([d]) => m.url.includes(d));
        if (matched && m.url.startsWith("http")) {
          m.addr = matched[1].addr; m.toName = matched[1].toName; m.urlStatus = "success";
        } else {
          m.urlStatus = "error";
        }
        quickTimer = null;
        activeModal.render(body());
      }, 1800);
    }

    activeModal = openModal({ panelClass: "modal-panel--quick", body: body(), labelledBy: "omodal-title", onClose: () => {} });
    on(activeModal.panel, "click", "[data-action]", (e, t) => {
      const a = t.dataset.action;
      if (a === "close") closeModal();
      else if (a === "lookup") doLookup();
      else if (a === "quick-next" && step1Valid()) { m.step = 2; activeModal.render(body()); }
      else if (a === "quick-prev") { m.step = 1; activeModal.render(body()); }
      else if (a === "quick-submit") { m.done = true; if (quickTimer) { clearTimeout(quickTimer); quickTimer = null; } activeModal.render(body()); }
    });
    on(activeModal.panel, "input", "[data-quick-url]", (e, t) => {
      m.url = t.value;
      if (m.urlStatus !== "idle") {
        // editing after a result → reset feedback (full re-render; rare)
        m.urlStatus = "idle"; m.addr = ""; m.toName = "";
        if (quickTimer) { clearTimeout(quickTimer); quickTimer = null; }
        activeModal.render(body());
      } else {
        // normal typing → keep focus, just toggle the 조회 button
        const btn = qs(activeModal.panel, "[data-action='lookup']");
        if (btn) {
          const on = !!m.url.trim();
          btn.disabled = !on;
          btn.classList.toggle("is-on", on);
        }
      }
    });
    on(activeModal.panel, "keydown", "[data-quick-url]", (e) => {
      if (e.key === "Enter") { e.preventDefault(); doLookup(); }
    });
    on(activeModal.panel, "input", "[data-quick-field]", (e, t) => {
      m[t.dataset.quickField] = t.value;
      // only the next-button enabled state depends on it
      const btn = qs(activeModal.panel, "[data-action='quick-next']");
      if (btn) { btn.disabled = !step1Valid(); btn.classList.toggle("is-on", step1Valid()); }
    });
    on(activeModal.panel, "input", "[data-quick-auto]", (e, t) => { m[t.dataset.quickAuto] = t.value; });
    on(activeModal.panel, "change", "input[data-qsnd-no]", (e, t) => {
      m.sender = profiles.find((p) => p.no === t.dataset.qsndNo) || null;
      activeModal.render(body());
    });
  }
  function quickAutoField(label, key, value, ic, ph, success) {
    return html`
      <div class="ofield">
        <label class="ofield__lbl">${label}${success ? html`<span class="quick-auto-badge">자동입력</span>` : ""}</label>
        <div class="ofield__wrap">${icon(ic, { size: 14, cls: "ofield__icon" })}<input class="ofield__input has-icon" data-quick-auto="${key}" type="text" value="${value}" placeholder="${ph}" /></div>
      </div>
    `;
  }

  function openSuccessModal() {
    closeModal();
    activeModal = openModal({
      panelClass: "modal-panel--success",
      labelledBy: "omodal-title",
      body: html`
        <div class="osuccess">
          <div class="osuccess__icon">${icon("check-circle", { size: 32 })}</div>
          <div class="osuccess__txt"><p class="osuccess__t" id="omodal-title">주문이 접수되었습니다!</p><p class="osuccess__d">실시간 주문내역에서 진행 상황을 확인할 수 있습니다.</p></div>
          <button class="btn btn-secondary osuccess__btn" data-action="close">확인</button>
        </div>
      `,
      onClose: () => {},
    });
    on(activeModal.panel, "click", "[data-action='close']", () => closeModal());
  }

  // ── delegated events on the page root ──────────────────
  const offClick = on(root, "click", "[data-action]", (e, t) => {
    const a = t.dataset.action;
    switch (a) {
      case "goto-profile": return nav("#/app/profile");
      case "goto-products": return nav("#/app/products");
      case "select-contact": {
        const c = store.get().contacts.find((x) => x.no === t.dataset.no);
        if (c) { state.contact = c; render(); }
        return;
      }
      case "change-contact": { state.contact = null; render(); return; }
      case "quick-부고": return openQuickModal("부고");
      case "quick-청첩": return openQuickModal("청첩");
      case "open-ribbon": return openRibbonModal();
      case "open-sender": return openSenderModal();
      case "toggle-notify": {
        const k = t.dataset.key;
        if (k === "recipient") state.notifyRecipient = !state.notifyRecipient;
        else if (k === "sender") state.notifySender = !state.notifySender;
        else state.notifyManager = !state.notifyManager;
        updNotify();
        return;
      }
      case "submit": { if (isReady()) openSuccessModal(); return; }
    }
  });

  const offChange = on(root, "change", "input,select", (e, t) => {
    if (t.name === "product") { state.selectedProduct = t.value; renderForm(); return; }
    const f = t.dataset.field;
    if (f === "immediate") { state.immediateDelivery = t.checked; renderForm(); return; }
    if (f === "deliveryDate") { state.deliveryDate = t.value; updSubmit(); return; }
    if (f === "deliveryHour") { state.deliveryHour = t.value; return; }
    if (f === "deliveryMinute") { state.deliveryMinute = t.value; return; }
  });

  const offInput = on(root, "input", "[data-field]", (e, t) => {
    const f = t.dataset.field;
    if (f === "address" || f === "toName" || f === "toPhone") {
      state[f] = t.value;
      updNotify();
      updSubmit();
    }
  });

  render();

  return () => {
    offClick();
    offChange();
    offInput();
    closeModal();
  };
}
