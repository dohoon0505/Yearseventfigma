/* ============================================================
   admin-dashboard.js — 관리자 대쉬보드 (#/admin/dashboard)

   claude.ai/design '대시보드 전면 리모델링 제안'(Admin Dashboard (remodel))을
   이식했다. 구성은 위에서 아래로:

     ① KPI 5장 — 통합 / B2C / B2B / 채널별(고이) / 미수금. 각 카드에 건수와
        전월 대비 증감.
     ② 액션 큐(좌) — 접수대기 · 미완료처리 탭. **남은시간 오름차순**이라
        급한 건이 항상 위에 온다. 도착희망까지 6시간 미만은 위험색.
     ③ 통합매출 추이(좌) — 최근 6개월 정산 매출 + 연속 증가 문장.
     ④ 가입 승인 대기(우, 대기 건이 있을 때만)
     ⑤ 상품별 이용 비중(우) — 도넛 + 순위 막대. 전체/채널 전환.
     ⑥ 거래처 계약 통계(우) — joinDate 누적. 월별/년별 전환.
     ⑦ 정산 진행(우) — 지난 달 귀속 4단계.

   ⚠️ 모든 수치는 목록 화면과 **같은 소스에서 파생**한다(b2cList·b2bList·
      usageFor·settlementsFor·store.clients). 대쉬보드 전용 집계를 두면
      화면 간 숫자가 어긋나 아무도 믿지 않는 화면이 된다.

   ⚠️ B2B 주문에는 배송 희망시각 필드가 없다. 도착 기준은 shell.js 의 당일배송
      마감(BIZ_HOURS.closeMin)을 주문일에 적용해 잡는다 — 같은 숫자를 두 곳에
      적지 않으려고 shell 에서 가져온다.

   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { parseOrderDate } from "../util/date.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { BIZ_HOURS } from "../shell.js";
import {
  DATA_NOW, settlementsFor, usageFor, USAGE_CATEGORIES, CLIENT_CHANNELS, channelOf,
} from "../data/admin-mock.js";
import { b2cList } from "../data/b2c-mock.js";
import { b2bList } from "../data/b2b-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const num = (n) => Number(n || 0).toLocaleString("ko-KR");
const pad2 = (n) => String(n).padStart(2, "0");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/* 프로젝트에 날짜 포맷이 셋 있다 — B2C 접수일시 "YYYY-MM-DD HH:mm",
   B2B 주문일시 "YYYY/MM/DD HH:mm", B2C 배송희망 "YYYY-MM-DDTHH:mm"(datetime-local).
   구분자를 맞춰 한 파서로 받는다. T 를 빠뜨리면 날짜가 통째로 NaN 이 된다. */
const dateOf = (s) => parseOrderDate(String(s || "").replace(/-/g, "/").replace("T", " "));
const live = (o) => o.status !== "취소";
const ymLabel = (d) => `${d.getFullYear()}년 ${pad2(d.getMonth() + 1)}월`;
/** DATA_NOW 기준 off 개월 전의 1일 */
const monthStart = (off) => new Date(DATA_NOW.getFullYear(), DATA_NOW.getMonth() - off, 1);
const inMonth = (s, off) => {
  const d = dateOf(s);
  const t = monthStart(off);
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
};

/** 증감률 — 기준이 0이면 비교할 수 없다(신규 진입과 성장을 구분해야 한다). */
function delta(cur, prev) {
  if (!prev) return { none: true, text: "전월 기록 없음" };
  const pct = ((cur - prev) / prev) * 100;
  return { none: false, up: pct >= 0, text: `전월 대비 ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
}

/** "서울 종로구 대학로 101 서울대학교병원 장례식장 3호실" → 지역 / 장소.
 *  건물번호(숫자만인 토큰) 뒤를 장소로 본다. 번호가 없으면 통째로 장소. */
function splitAddress(addr) {
  const t = String(addr || "").trim().split(/\s+/).filter(Boolean);
  if (!t.length) return { region: "", place: "-" };
  let i = -1;
  for (let k = 1; k < t.length; k++) if (/^\d+(-\d+)?$/.test(t[k])) { i = k; break; }
  if (i < 0) return { region: t[0], place: t.join(" ") };
  const place = t.slice(i + 1).join(" ");
  return { region: t.slice(0, Math.min(2, i)).join(" "), place: place || t.join(" ") };
}

/** 남은 분 → "1일 2시간" · "2시간 30분" · "19시간" · "12분" */
function leftLabel(min) {
  if (min <= 0) return "기한 지남";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 && h < 6 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}
/** 도착 시각 라벨 — 오늘이면 "오늘 HH:mm", 아니면 "MM/DD HH:mm" */
function etaLabel(d, now) {
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return sameDay ? `오늘 ${hm}` : `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${hm}`;
}

/** 백만원 표기 — 자릿수가 커지면 소수 1자리로 충분하고, 작을 때 1자리로
 *  뭉개면 1.55 와 1.64 가 같은 값으로 보인다. */
const mil2 = (v) => (v >= 1e7 ? (v / 1e6).toFixed(1) : (v / 1e6).toFixed(2));

const DONUT_R = 54;
const DONUT_C = 2 * Math.PI * DONUT_R; // 339.292
/* 도넛·범례 색 — tokens.css 의 차트 팔레트. 카테고리 순서와 1:1. */
const MIX_COLORS = [
  "var(--c-orange)", "var(--c-blue)", "var(--c-success)", "var(--ch-purple)",
  "var(--c-warn)", "var(--ch-cyan)", "var(--ch-pink)", "var(--ch-lime)", "var(--ch-slate)",
];

export function mount(root, { nav }) {
  const state = { tab: "pending", mix: "전체", contract: "month" };

  const clients = () => store.get().clients;
  const clientById = (id) => clients().find((c) => c.id === id) || null;
  const clientLabel = (id) => {
    const cs = clients();
    const c = cs.find((x) => x.id === id);
    return c ? displayName(c, sharedBizKeys(cs)) : "(삭제된 거래처)";
  };
  /* '일반' 외 채널만 별도 카드를 갖는다. 거래처에 지정된 값만 노출 — 빈 채널의
     카드가 0원으로 떠 있으면 KPI 줄이 의미 없이 길어진다. */
  const activeChannels = () => {
    const used = new Set(clients().map(channelOf));
    return CLIENT_CHANNELS.filter((ch) => ch !== "일반" && used.has(ch));
  };

  /* ── ① 월별 매출 집계 ─────────────────────────────────── */
  function monthAgg(off) {
    const b2c = b2cList().filter((o) => inMonth(o.receivedAt, off) && live(o));
    const b2b = b2bList().filter((o) => inMonth(o.date, off) && live(o));
    const sum = (a) => a.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const byChannel = {};
    b2b.forEach((o) => {
      const ch = channelOf(clientById(o.clientId));
      (byChannel[ch] = byChannel[ch] || { count: 0, amount: 0 });
      byChannel[ch].count += 1;
      byChannel[ch].amount += Number(o.amount) || 0;
    });
    return {
      b2c: { count: b2c.length, amount: sum(b2c) },
      b2bAll: { count: b2b.length, amount: sum(b2b) },
      channel: (ch) => byChannel[ch] || { count: 0, amount: 0 },
      total: { count: b2c.length + b2b.length, amount: sum(b2c) + sum(b2b) },
    };
  }

  /** 그 귀속월의 미수금 — 청구됐으나 입금되지 않은 금액. */
  function unpaidOf(off) {
    return clients().reduce((s, c) => {
      const r = settlementsFor(c)[off];
      if (!r || r.입금완료 === "입금완료") return s;
      return s + (Number(String(r.정산금액).replace(/[^0-9]/g, "")) || 0);
    }, 0);
  }

  function kpiCards() {
    const cur = monthAgg(0), prev = monthAgg(1);
    const ym = ymLabel(DATA_NOW);
    const cards = [
      { key: "total", label: `${ym} 통합매출`, amount: cur.total.amount, count: cur.total.count, d: delta(cur.total.amount, prev.total.amount), accent: "is-brand" },
      { key: "b2c", label: "B2C 통합매출", amount: cur.b2c.amount, count: cur.b2c.count, d: delta(cur.b2c.amount, prev.b2c.amount) },
      { key: "b2b", label: "B2B 통합매출", amount: cur.channel("일반").amount, count: cur.channel("일반").count, d: delta(cur.channel("일반").amount, prev.channel("일반").amount) },
    ];
    activeChannels().forEach((ch) => {
      cards.push({ key: ch, label: `${ch} 통합매출`, amount: cur.channel(ch).amount, count: cur.channel(ch).count, d: delta(cur.channel(ch).amount, prev.channel(ch).amount) });
    });
    const u0 = unpaidOf(0), u1 = unpaidOf(1);
    cards.push({ key: "unpaid", label: `${ym} 미수금`, amount: u0, d: delta(u0, u1), danger: true, accent: "is-danger" });
    return cards;
  }

  const kpiBody = () => kpiCards().map((c) => html`
    <div class="dsh-kpi ${c.accent || ""}">
      <div class="dsh-kpi__l">${c.label}</div>
      <div class="dsh-kpi__v ${c.danger ? "is-danger" : ""}">${won(c.amount)}</div>
      <div class="dsh-kpi__tags">
        ${c.count != null ? html`<span class="dsh-tag ${c.accent === "is-brand" ? "dsh-tag--brand" : "dsh-tag--blue"}">${c.count}건</span>` : ""}
        <span class="dsh-tag ${c.d.none ? "dsh-tag--mute" : c.danger ? "dsh-tag--danger" : c.d.up ? "dsh-tag--up" : "dsh-tag--down"}">${c.d.text}</span>
      </div>
    </div>`);

  /* ── ② 액션 큐 ───────────────────────────────────────── */
  /** 도착희망 시각. B2C 는 deliverAt 실값, B2B 는 주문일의 당일배송 마감. */
  function etaOf(o, kind) {
    if (kind === "B2C" && o.deliverAt) return dateOf(o.deliverAt);
    const d = dateOf(o.date || o.receivedAt);
    d.setHours(Math.floor(BIZ_HOURS.closeMin / 60), BIZ_HOURS.closeMin % 60, 0, 0);
    return d;
  }
  function queueRows() {
    const pending = state.tab === "pending";
    const now = new Date();
    const rows = [];
    b2cList().forEach((o) => {
      const hit = pending ? o.status === "접수대기" : o.status === "주문접수" && !o.image;
      if (!hit) return;
      rows.push({ kind: "B2C", id: o.id, who: o.ordererName, no: o.orderNo, address: o.address, product: o.product, amount: o.amount, eta: etaOf(o, "B2C"), go: "#/admin/b2c" });
    });
    b2bList().forEach((o) => {
      const hit = pending ? o.status === "접수대기" : o.status === "주문접수" && !o.hasPhoto;
      if (!hit) return;
      rows.push({ kind: "B2B", id: o.id, who: clientLabel(o.clientId), no: o.orderNo, address: o.address, product: o.product, amount: o.amount, eta: etaOf(o, "B2B"), go: "#/admin/orders" });
    });
    /* 남은시간 오름차순 — 급한 건이 항상 위로. */
    return rows
      .map((r) => {
        const min = Math.round((r.eta - now) / 60000);
        const { region, place } = splitAddress(r.address);
        return { ...r, min, region, place, left: leftLabel(min), etaText: etaLabel(r.eta, now), tone: min <= 0 ? "over" : min < 360 ? "hot" : min < 1440 ? "warm" : "cool" };
      })
      .sort((a, b) => a.min - b.min);
  }
  const queueCount = (tab) => {
    const b2c = b2cList().filter((o) => (tab === "pending" ? o.status === "접수대기" : o.status === "주문접수" && !o.image)).length;
    const b2b = b2bList().filter((o) => (tab === "pending" ? o.status === "접수대기" : o.status === "주문접수" && !o.hasPhoto)).length;
    return b2c + b2b;
  };
  function queueBody() {
    const rows = queueRows();
    if (!rows.length) return html`<p class="dsh-none">처리할 건이 없습니다.</p>`;
    const cta = state.tab === "pending" ? "주문서" : "사진 등록";
    return rows.map((r) => html`
      <div class="dsh-q">
        <div class="dsh-clock dsh-clock--${r.tone}">
          <span class="dsh-clock__l">${r.left}</span>
          <span class="dsh-clock__e">${r.etaText}</span>
        </div>
        <div class="dsh-q__main">
          <div class="dsh-q__place">${r.place}</div>
          <div class="dsh-q__sub">${[r.region, r.who, r.no].filter(Boolean).join(" · ")}</div>
        </div>
        <div class="dsh-q__prod">
          <div class="dsh-q__p">${r.product}</div>
          <div class="dsh-q__a">${won(r.amount)}</div>
        </div>
        <span class="dsh-q__dv"></span>
        <button class="dsh-q__cta" data-go="${r.go}">${cta}</button>
      </div>`);
  }
  const tabsBody = () => html`
    <button class="dsh-tab ${state.tab === "pending" ? "is-on" : ""}" data-tab="pending">접수대기<b class="dsh-tab__n is-hot">${queueCount("pending")}</b></button>
    <button class="dsh-tab ${state.tab === "photo" ? "is-on" : ""}" data-tab="photo">미완료처리<b class="dsh-tab__n">${queueCount("photo")}</b></button>`;

  /* ── ③ 통합매출 추이 (최근 6개월 정산 매출) ───────────── */
  function trend() {
    const cs = clients();
    const bars = [];
    for (let m = 5; m >= 0; m--) {
      const d = monthStart(m);
      const label = ymLabel(d);
      bars.push({ label: `${pad2(d.getMonth() + 1)}월`, v: cs.reduce((s, c) => s + (usageFor(c)[label]?.total || 0), 0) });
    }
    let streak = 0;
    for (let i = bars.length - 1; i > 0; i--) { if (bars[i].v > bars[i - 1].v) streak++; else break; }
    return { bars, streak };
  }
  function trendBody() {
    const { bars, streak } = trend();
    const max = Math.max(...bars.map((b) => b.v)) || 1;
    const last = bars[bars.length - 1];
    const mil = (v) => (v / 1e6).toFixed(1);
    return html`
      <div class="dsh-lead">${pad2(DATA_NOW.getMonth() + 1)}월 정산 매출은 <b>${mil(last.v)}백만원</b>${streak > 0 ? html`, ${streak}개월 연속 증가했습니다.` : "입니다."}</div>
      <div class="dsh-bars">
        ${bars.map((b, i) => {
          const on = i === bars.length - 1;
          return html`
            <div class="dsh-bar">
              <span class="dsh-bar__v ${on ? "is-on" : ""}">${mil(b.v)}</span>
              <span class="dsh-bar__r ${on ? "is-on" : ""}" style="height:${Math.max(3, Math.round((b.v / max) * 120))}px"></span>
              <span class="dsh-bar__l ${on ? "is-on" : ""}">${b.label}</span>
            </div>`;
        })}
      </div>`;
  }

  /* ── ④ 가입 승인 대기 ────────────────────────────────── */
  const pendingClients = () => clients().filter((c) => c.status === "승인대기");

  /* ── ⑤ 상품별 이용 비중 ──────────────────────────────── */
  function mixData() {
    const label = ymLabel(DATA_NOW);
    const target = state.mix === "전체" ? clients() : clients().filter((c) => channelOf(c) === state.mix);
    const amounts = USAGE_CATEGORIES.map(() => 0);
    let orders = 0;
    target.forEach((c) => {
      const u = usageFor(c)[label];
      if (!u) return;
      orders += u.orders;
      USAGE_CATEGORIES.forEach((cat, i) => { amounts[i] += u.items[cat.key]?.amount || 0; });
    });
    const sum = amounts.reduce((a, b) => a + b, 0) || 1;
    let cum = 0;
    const donut = amounts.map((amt, i) => {
      const len = (amt / sum) * DONUT_C;
      /* 세그먼트 사이 2px 흰 간격 — 9개가 붙어 있으면 경계가 읽히지 않는다. */
      const seg = { color: MIX_COLORS[i], dash: `${Math.max(1, len - 2).toFixed(1)} ${DONUT_C.toFixed(1)}`, offset: (-cum).toFixed(1) };
      cum += len;
      return seg;
    });
    const ranked = amounts
      .map((v, i) => ({ name: USAGE_CATEGORIES[i].key, color: MIX_COLORS[i], v }))
      .sort((a, b) => b.v - a.v);
    const top = ranked[0]?.v / sum || 1;
    return {
      donut, orders, sum,
      caption: `${state.mix} · ${pad2(DATA_NOW.getMonth() + 1)}월`,
      legendTop: ranked.slice(0, 4).map((l) => ({ ...l, pct: ((l.v / sum) * 100).toFixed(1), w: ((l.v / sum) / top * 100).toFixed(1) })),
      legendRest: ranked.slice(4).map((l) => ({ ...l, pct: ((l.v / sum) * 100).toFixed(1) })),
    };
  }
  function mixBody() {
    const m = mixData();
    return html`
      <div class="dsh-mix">
        <div class="dsh-donut">
          <svg viewBox="0 0 140 140" role="img" aria-label="상품별 이용 비중 도넛 차트">
            <g transform="rotate(-90 70 70)" fill="none" stroke-width="17">
              <circle cx="70" cy="70" r="${DONUT_R}" stroke="var(--c-surface-3)"></circle>
              ${m.donut.map((d) => html`<circle cx="70" cy="70" r="${DONUT_R}" stroke="${d.color}" stroke-dasharray="${d.dash}" stroke-dashoffset="${d.offset}"></circle>`)}
            </g>
          </svg>
          <div class="dsh-donut__c">
            <span class="dsh-donut__cap">${m.caption}</span>
            <span class="dsh-donut__t">${mil2(m.sum)}백만원</span>
            <span class="dsh-donut__o">${num(m.orders)}건</span>
          </div>
        </div>
        <div class="dsh-legend">
          ${m.legendTop.map((l) => html`
            <div class="dsh-lg">
              <div class="dsh-lg__h"><span class="dsh-lg__n">${l.name}</span><span class="dsh-lg__p">${l.pct}%</span></div>
              <div class="dsh-lg__track"><span class="dsh-lg__bar" style="width:${l.w}%;background:${l.color}"></span></div>
            </div>`)}
        </div>
      </div>
      <div class="dsh-legend2">
        ${m.legendRest.map((l) => html`<span class="dsh-lg2"><span class="dsh-lg2__d" style="background:${l.color}"></span>${l.name}<b>${l.pct}%</b></span>`)}
      </div>`;
  }
  const mixChips = () => ["전체", ...activeChannels()].map((v) =>
    html`<button class="dsh-chip ${state.mix === v ? "is-on" : ""}" data-mix="${v}">${v}</button>`);

  /* ── ⑥ 거래처 계약 통계 (joinDate 누적) ───────────────── */
  function contractData() {
    const cs = clients();
    const joined = cs.map((c) => new Date(c.joinDate)).filter((d) => !isNaN(d));
    const upto = (d) => joined.filter((j) => j <= d).length;
    if (state.contract === "year") {
      const y = DATA_NOW.getFullYear();
      const bars = [y - 2, y - 1, y].map((yy) => ({ label: `${yy}년`, v: upto(new Date(yy, 11, 31, 23, 59, 59)), show: true }));
      const newVal = bars[2].v - bars[1].v;
      return { bars, caption: `${y - 2} → ${y}`, sub: "연말 기준 누적 계약", newLabel: `${y}년 신규`, newVal: `+${newVal}개사` };
    }
    const bars = [];
    for (let m = 11; m >= 0; m--) {
      const d = monthStart(m);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      bars.push({ label: String(d.getMonth() + 1), v: upto(end), show: false });
    }
    const newVal = bars[11].v - bars[5].v;
    const f = monthStart(11), l = monthStart(0);
    return {
      bars,
      caption: `${f.getFullYear()}.${pad2(f.getMonth() + 1)} → ${l.getFullYear()}.${pad2(l.getMonth() + 1)}`,
      sub: "누적 계약", newLabel: "최근 6개월 신규", newVal: `+${newVal}개사`,
    };
  }
  function contractBody() {
    const d = contractData();
    const max = Math.max(...d.bars.map((b) => b.v)) || 1;
    const total = d.bars[d.bars.length - 1].v;
    return html`
      <div class="dsh-cstat">
        <span class="dsh-cstat__v">${total}개사</span>
        <span class="dsh-cstat__s">${d.sub}</span>
        <span class="dsh-cstat__c">${d.caption}</span>
      </div>
      <div class="dsh-bars dsh-bars--tight">
        ${d.bars.map((b, i) => {
          const on = i === d.bars.length - 1;
          return html`
            <div class="dsh-bar">
              <span class="dsh-bar__v ${on ? "is-on" : ""}">${b.show ? b.v : ""}</span>
              <span class="dsh-bar__r ${on ? "is-on" : ""}" style="height:${Math.round((b.v / max) * 112)}px"></span>
              <span class="dsh-bar__l ${on ? "is-on" : ""}">${b.label}</span>
            </div>`;
        })}
      </div>
      <div class="dsh-cfoot">
        <span>${d.newLabel} <b>${d.newVal}</b></span>
        <span>승인대기 <b>${pendingClients().length}개사</b></span>
      </div>`;
  }

  /* ── ⑦ 정산 진행 (지난 달 귀속) ──────────────────────── */
  function settleStages() {
    const cs = clients();
    const st = { 명세서: 0, 동의: 0, 계산서: 0, 입금: 0 };
    let billed = 0, unpaid = 0;
    cs.forEach((c) => {
      const r = settlementsFor(c)[1];
      if (!r) return;
      const amt = Number(String(r.정산금액).replace(/[^0-9]/g, "")) || 0;
      billed += amt;
      st.명세서 += 1;
      if (r.거래명세서동의 === "동의완료") st.동의 += 1;
      if (r.계산서발급 === "발급완료") st.계산서 += 1;
      if (r.입금완료 === "입금완료") st.입금 += 1; else unpaid += amt;
    });
    const n = st.명세서 || 1;
    const pct = Math.round(((st.명세서 + st.동의 + st.계산서 + st.입금) / (n * 4)) * 100);
    return { st, billed, unpaid, count: st.명세서, pct };
  }
  function settleBody() {
    const s = settleStages();
    const cell = (k, v) => html`
      <div class="dsh-stg ${v === 0 ? "is-zero" : v === s.count ? "is-done" : ""}">
        <b>${k}</b><span>${v}</span>
      </div>`;
    return html`
      <div class="dsh-prog"><span style="width:${s.pct}%"></span></div>
      <div class="dsh-stgs">
        ${cell("명세서", s.st.명세서)}${cell("동의", s.st.동의)}${cell("계산서", s.st.계산서)}${cell("입금", s.st.입금)}
      </div>
      <div class="dsh-cfoot dsh-cfoot--plain">
        <span>청구 합계 <b>${won(s.billed)}</b></span>
        <span>미입금 <b class="is-danger">${won(s.unpaid)}</b></span>
      </div>
      <button class="dsh-more" data-go="#/admin/settlement">거래처 정산회계 열기</button>`;
  }

  /* ── 렌더 ────────────────────────────────────────────── */
  const card = (title, badge, body, cls = "") => html`
    <section class="dsh-card ${cls}">
      <div class="dsh-card__h"><b>${title}</b>${badge}</div>
      <div class="dsh-card__b">${body}</div>
    </section>`;

  function render() {
    const approvals = pendingClients();
    const shared = sharedBizKeys(clients());
    setHTML(root, html`
      <div class="page-admin page-dash">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-accounting.png",
            title: "대쉬보드",
            action: html`<span class="dsh-scope">${ymLabel(DATA_NOW)} · 주문 접수 기준</span>`,
          })}
          <p class="dsh-asof">${DATA_NOW.getFullYear()}년 ${pad2(DATA_NOW.getMonth() + 1)}월 ${pad2(DATA_NOW.getDate())}일 (${DOW[DATA_NOW.getDay()]}) 기준</p>

          <div class="dsh-kpis" data-slot="kpi">${kpiBody()}</div>

          <div class="dsh-cols">
            <div class="dsh-col">
              <section class="dsh-card">
                <div class="dsh-card__h dsh-card__h--tabs">
                  <div class="dsh-tabs" data-slot="tabs">${tabsBody()}</div>
                  <span class="dsh-hint">남은시간 = 도착희망까지</span>
                </div>
                <div class="dsh-card__b dsh-card__b--queue" data-slot="queue">${queueBody()}</div>
              </section>
              ${card("B2B · B2C 통합매출 추이", html`<span class="dsh-badge">최근 6개월 · 단위 백만원</span>`, trendBody())}
            </div>

            <div class="dsh-col">
              ${approvals.length
                ? card(
                    "가입 승인 대기",
                    html`<span class="dsh-badge dsh-badge--danger">${approvals.length}건</span>`,
                    html`${approvals.map((c) => html`
                      <div class="dsh-apv">
                        <div class="dsh-apv__m">
                          <div class="dsh-apv__n">${displayName(c, shared)}</div>
                          <div class="dsh-apv__s">${c.bizNumber} · ${c.joinDate} 신청</div>
                        </div>
                        <div class="dsh-apv__a">
                          <button class="dsh-btn dsh-btn--ok" data-go="#/admin">확인</button>
                        </div>
                      </div>`)}`,
                    "is-danger"
                  )
                : ""}
              ${card("상품별 이용 비중", html`<span class="dsh-chips" data-slot="mixchips">${mixChips()}</span>`, html`<span data-slot="mix">${mixBody()}</span>`)}
              ${card("거래처 계약 통계", html`<span class="dsh-chips">
                  <button class="dsh-chip ${state.contract === "month" ? "is-on" : ""}" data-contract="month">월별</button>
                  <button class="dsh-chip ${state.contract === "year" ? "is-on" : ""}" data-contract="year">년별</button>
                </span>`, html`<span data-slot="contract">${contractBody()}</span>`)}
              ${card("정산 진행 · 지난 달 귀속", html`<span class="dsh-badge">${settleStages().count}개사</span>`, settleBody())}
            </div>
          </div>
        </div>
      </div>`);
  }

  render();

  /* 슬롯 단위 갱신 — 탭·칩은 해당 블록만 다시 그린다(전체 재렌더 시 스크롤이 튄다). */
  const refreshQueue = () => {
    const t = qs(root, "[data-slot='tabs']"), q = qs(root, "[data-slot='queue']");
    if (t) setHTML(t, tabsBody());
    if (q) setHTML(q, queueBody());
  };

  const offs = [
    on(root, "click", "[data-tab]", (e, t) => { state.tab = t.dataset.tab; refreshQueue(); }),
    on(root, "click", "[data-mix]", (e, t) => {
      state.mix = t.dataset.mix;
      setHTML(qs(root, "[data-slot='mixchips']"), mixChips());
      setHTML(qs(root, "[data-slot='mix']"), mixBody());
    }),
    on(root, "click", "[data-contract]", (e, t) => {
      state.contract = t.dataset.contract;
      const h = t.closest(".dsh-chips");
      if (h) [...h.children].forEach((b) => b.classList.toggle("is-on", b.dataset.contract === state.contract));
      setHTML(qs(root, "[data-slot='contract']"), contractBody());
    }),
    on(root, "click", "[data-go]", (e, t) => nav(t.dataset.go)),
  ];

  return () => offs.forEach((off) => off());
}
