/* ============================================================
   admin-dashboard.js — 관리자 대쉬보드 (#/admin/dashboard)

   구 시스템 대쉬보드(0)의 대응 화면. 원본은 매출·배송·주문·계약을 같은 무게로
   늘어놓았는데, 시간 단위가 다른 것을 섞으면 아무도 보지 않게 된다. 세 층으로
   나눈다 — 위로 갈수록 시급하고 아래로 갈수록 판단용이다.

     1층 지금 손대야 할 것   … 분 단위. 안 하면 사고
     2층 오늘 어디서 들어왔나 … 하루 단위. B2C 는 주문경로, B2B 는 거래처가 축
     3층 이번 달 성적        … 월 단위

   ⚠️ 모든 수치는 목록 화면과 **같은 소스에서 파생**한다(b2cList·b2bList·
      settlementsFor). 대쉬보드 전용 목데이터를 두면 화면 간 숫자가 어긋나
      아무도 믿지 않는 화면이 된다.

   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on } from "../dom.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { parseOrderDate, getDateRange } from "../util/date.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { DATA_NOW, settlementsFor } from "../data/admin-mock.js";
import { b2cList } from "../data/b2c-mock.js";
import { b2bList } from "../data/b2b-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const pad2 = (n) => String(n).padStart(2, "0");

/* B2C 접수일시는 "YYYY-MM-DD HH:mm", B2B 주문일시는 "YYYY/MM/DD HH:mm".
   두 포맷을 한 파서로 받기 위해 구분자만 맞춘다. */
const dateOf = (s) => parseOrderDate(String(s || "").replace(/-/g, "/"));
const isToday = (s) => {
  const d = dateOf(s);
  return d.getFullYear() === DATA_NOW.getFullYear() && d.getMonth() === DATA_NOW.getMonth() && d.getDate() === DATA_NOW.getDate();
};
const isThisMonth = (s) => {
  const d = dateOf(s);
  return d.getFullYear() === DATA_NOW.getFullYear() && d.getMonth() === DATA_NOW.getMonth();
};
const live = (o) => o.status !== "취소";

/** 합계 집계 — [{key, count, amount}] 를 금액 내림차순으로. */
function tally(rows, keyOf) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyOf(r);
    const cur = m.get(k) || { key: k, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(r.amount) || 0;
    m.set(k, cur);
  });
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

export function mount(root, { nav }) {
  const clients = () => store.get().clients;
  const clientName = (id) => {
    const cs = clients();
    const c = cs.find((x) => x.id === id);
    return c ? displayName(c, sharedBizKeys(cs)) : "(삭제된 거래처)";
  };

  /* ── 1층: 처리 대기 ──────────────────────────────────── */
  function queues() {
    const b2c = b2cList();
    const b2b = b2bList();
    return {
      b2c: [
        { label: "접수대기", n: b2c.filter((o) => o.status === "접수대기").length, tone: "danger", go: "#/admin/b2c" },
        { label: "담당자 미지정", n: b2c.filter((o) => !o.manager && live(o)).length, tone: "warn", go: "#/admin/b2c" },
        { label: "사진 미등록", n: b2c.filter((o) => o.status === "주문접수" && !o.image).length, tone: "plain", go: "#/admin/b2c" },
      ],
      b2b: [
        { label: "접수대기", n: b2b.filter((o) => o.status === "접수대기").length, tone: "danger", go: "#/admin/orders" },
        { label: "사진 미등록", n: b2b.filter((o) => o.status === "주문접수" && !o.hasPhoto).length, tone: "plain", go: "#/admin/orders" },
        { label: "승인대기 거래처", n: clients().filter((c) => c.status === "승인대기").length, tone: "warn", go: "#/admin" },
      ],
    };
  }

  /* ── 2층: 오늘 유입 ──────────────────────────────────── */
  const todayB2C = () => b2cList().filter((o) => isToday(o.receivedAt) && live(o));
  const todayB2B = () => b2bList().filter((o) => isToday(o.date) && live(o));

  /* ── 3층: 이번 달 ────────────────────────────────────── */
  function monthly() {
    const b2c = b2cList().filter((o) => isThisMonth(o.receivedAt) && live(o));
    const b2b = b2bList().filter((o) => isThisMonth(o.date) && live(o));
    const b2cTotal = b2c.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const b2bTotal = b2b.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const channels = tally(b2c, (o) => o.channel);
    /* 정산 3단계 — 지난 달 귀속분(정산이 실제로 도는 달)을 센다. */
    const stage = { 발급: 0, 동의: 0, 계산서: 0, 입금: 0, 미수: 0 };
    clients().forEach((c) => {
      const row = settlementsFor(c)[1]; // [0]=이번 달(진행 전), [1]=지난 달 귀속
      if (!row) return;
      stage.발급 += 1;
      if (row.거래명세서동의 === "동의완료") stage.동의 += 1;
      if (row.계산서발급 === "발급완료") stage.계산서 += 1;
      if (row.입금완료 === "입금완료") stage.입금 += 1;
      else stage.미수 += Number(String(row.정산금액).replace(/[^0-9]/g, "")) || 0;
    });
    return { b2cTotal, b2bTotal, b2cCount: b2c.length, b2bCount: b2b.length, channels, stage };
  }

  /* ── 렌더 ────────────────────────────────────────────── */
  const qCard = (q) => html`
    <button class="dash-q dash-q--${q.tone}" data-go="${q.go}">
      <span class="dash-q__l">${q.label}</span>
      <b class="dash-q__n">${q.n}</b>
    </button>`;

  const listRows = (items, nameOf) =>
    items.length === 0
      ? html`<p class="dash-none">오늘 접수된 주문이 없습니다.</p>`
      : items.slice(0, 6).map((it) => html`
          <div class="dash-li">
            <span class="dash-li__k">${nameOf(it)}</span>
            <span class="dash-li__v">${it.count}건 · ${won(it.amount)}</span>
          </div>`);

  function render() {
    const q = queues();
    const tc = todayB2C();
    const tb = todayB2B();
    const m = monthly();
    const chanPct = m.channels.slice(0, 5);
    const chanSum = chanPct.reduce((s, c) => s + c.amount, 0) || 1;

    setHTML(
      root,
      html`
        <div class="page-admin">
          <div class="admin-inner">
            ${pageTitle({ imgSrc: "./assets/nav-accounting.png", title: "대쉬보드" })}

            <div class="dash-head">
              <b>${DATA_NOW.getFullYear()}년 ${pad2(DATA_NOW.getMonth() + 1)}월 ${pad2(DATA_NOW.getDate())}일</b>
              <span>오늘 주문 ${tc.length + tb.length}건</span>
            </div>

            <div class="dash-sec"><i>1</i>지금 손대야 할 것</div>
            <div class="dash-2col">
              <section class="dash-card">
                <div class="dash-card__t">B2C</div>
                <div class="dash-qs">${q.b2c.map(qCard)}</div>
              </section>
              <section class="dash-card">
                <div class="dash-card__t">B2B 거래처</div>
                <div class="dash-qs">${q.b2b.map(qCard)}</div>
              </section>
            </div>

            <div class="dash-sec"><i>2</i>오늘 어디서 들어왔는가</div>
            <div class="dash-2col">
              <section class="dash-card">
                <div class="dash-card__t">B2C · 주문경로별<span>${tc.length}건</span></div>
                ${listRows(tally(tc, (o) => o.channel), (it) => it.key)}
              </section>
              <section class="dash-card">
                <div class="dash-card__t">B2B · 거래처별<span>${tb.length}건</span></div>
                ${listRows(tally(tb, (o) => o.clientId), (it) => clientName(it.key))}
              </section>
            </div>

            <div class="dash-sec"><i>3</i>이번 달 성적</div>
            <div class="dash-2col">
              <section class="dash-card">
                <div class="dash-card__t">B2C</div>
                <b class="dash-big">${won(m.b2cTotal)}</b>
                <p class="dash-sub">${m.b2cCount}건 · 취소 제외</p>
                <div class="dash-card__t dash-card__t--sm">경로별 비중</div>
                ${chanPct.length === 0
                  ? html`<p class="dash-none">이번 달 B2C 주문이 없습니다.</p>`
                  : chanPct.map((c) => html`
                      <div class="dash-li">
                        <span class="dash-li__k">${c.key}</span>
                        <span class="dash-li__v">${Math.round((c.amount / chanSum) * 100)}%</span>
                      </div>`)}
              </section>
              <section class="dash-card">
                <div class="dash-card__t">B2B</div>
                <b class="dash-big">${won(m.b2bTotal)}</b>
                <p class="dash-sub">${m.b2bCount}건 · 미수금 <b class="dash-due">${won(m.stage.미수)}</b></p>
                <div class="dash-card__t dash-card__t--sm">정산 3단계 · 지난 달 귀속</div>
                <div class="dash-stage">
                  <span class="dash-stage__s dash-stage__s--ok">명세서 ${m.stage.발급}</span>
                  <span class="dash-stage__a">›</span>
                  <span class="dash-stage__s dash-stage__s--warn">동의 ${m.stage.동의}</span>
                  <span class="dash-stage__a">›</span>
                  <span class="dash-stage__s dash-stage__s--danger">계산서 ${m.stage.계산서}</span>
                  <span class="dash-stage__a">›</span>
                  <span class="dash-stage__s">입금 ${m.stage.입금}</span>
                </div>
                <button class="dash-more" data-go="#/admin/settlement">정산회계로 이동</button>
              </section>
            </div>
          </div>
        </div>
      `
    );
  }

  render();
  const off = on(root, "click", "[data-go]", (e, t) => nav(t.dataset.go));
  return () => off();
}
