/* ============================================================
   admin-dashboard.js — 관리자 대쉬보드 (#/admin/dashboard)

   claude.ai/design '대시보드 전면 리모델링 제안'(Admin Dashboard (remodel))을
   이식했다. 구성은 위에서 아래로:

     ① KPI 5장 — 통합 / B2C / B2B / 채널별(고이) / 미수금. 각 카드에 건수와
        전월 대비 증감.
     ② 액션 큐(좌) — 접수대기 · 미완료처리 탭. **남은시간 오름차순**이라
        급한 건이 항상 위에 온다. 도착희망까지 6시간 미만은 위험색.
     ③ 통합매출 추이(좌) — 최근 6개월 정산 매출 + 연속 증가 문장.
     ⓪ 약관 동의 전 · 첫 명세서 임박(우 맨 위, 건이 있을 때만 — 시안 'S-05 대쉬보드 약관 경고')
     ④ 가입 승인 대기(우, 대기 건이 있을 때만)
     ⑤ 상품별 이용 비중(우) — 도넛 + 순위 막대. 전체/채널 전환.
     ⑥ 거래처 계약 통계(우) — joinDate 누적. 월별/년별 전환.
     ⑦ 정산 진행(우) — 지난 달 귀속 4단계 + '연락 필요'(지난달) · '기한 초과'(최근 6개월 · 누르면 가장 오래된 달) 칩(needsAction).
     ①의 '미수금' 과 ⑦의 '미입금' 은 util/settlement `isUnpaid` 한 판정(명세서가 나간 달 전부 — 발행 전·0원·거래 없음 제외).

   ⚠️ 모든 수치는 목록 화면과 **같은 소스에서 파생**한다(b2cList·b2bList·
      usageFor·settlementsFor·termsWatchOf·store.clients). 대쉬보드 전용 집계를 두면
      화면 간 숫자가 어긋나 아무도 믿지 않는 화면이 된다. ⓪은 거래처 목록의 '약관 동의 전' 표시와,
      ⑦의 칩은 정산회계 '조치 필요' 탭과 같은 판정(util/settlement.js)이다.

   ⚠️ B2B 레코드에도 deliverAt 은 있지만 **이 큐는 쓰지 않는다** — 도착 기준은
      shell.js 의 당일배송 마감(BIZ_HOURS.closeMin)을 주문일에 적용해 잡는다.
      같은 숫자를 두 곳에 적지 않으려고 shell 에서 가져온다.
      (명세서 6.x '남은시간' 참조 — 서버 전환 시 desired_arrival_at 실값으로 맞출 것)

   페이지 규약: mount(root, { nav }) → cleanup.
   ============================================================ */
import { html, setHTML, on, qs } from "../dom.js";
import { store } from "../store.js";
import { pageTitle } from "../ui.js";
import { parseOrderDate } from "../util/date.js";
import { sharedBizKeys, displayName } from "../util/biz.js";
import { BIZ_HOURS } from "../shell.js";
import {
  DATA_NOW, USAGE_CATEGORIES, CLIENT_CHANNELS, channelOf,
} from "../data/admin-mock.js";
/* 이용 내역·정산 행은 B2B 주문(배송일시의 달)에서 파생한다 — 정산회계 화면·리포트와 같은 소스(util/settlement.js). */
import { settlementsFor, usageFor, inSettlementFlow, needsAction, isUnpaid, termsWatchOf } from "../util/settlement.js";
import { periodLabel, periodOf, fmtKoShortTime } from "../data/settlement-rules.js";
import { setFocusClient, setFocusSection } from "../session.js";
import { b2cList } from "../data/b2c-mock.js";
import { b2bList } from "../data/b2b-mock.js";

const won = (n) => Number(n || 0).toLocaleString("ko-KR") + "원";
const num = (n) => Number(n || 0).toLocaleString("ko-KR");
const pad2 = (n) => String(n).padStart(2, "0");

/* 프로젝트에 날짜 포맷이 셋 있다 — B2C 접수일시 "YYYY-MM-DD HH:mm",
   B2B 주문일시 "YYYY/MM/DD HH:mm", B2C 배송희망 "YYYY-MM-DDTHH:mm"(datetime-local).
   구분자를 맞춰 한 파서로 받는다. T 를 빠뜨리면 날짜가 통째로 NaN 이 된다. */
const dateOf = (s) => parseOrderDate(String(s || "").replace(/-/g, "/").replace("T", " "));
const live = (o) => o.status !== "취소";
/* ⚠️ 이 문자열은 장식이 아니라 **조인 키**다 — 정산 행의 `청구년월` 과 이용 내역 맵의 키가 이 포맷이고,
   호출부가 만든 라벨과 문자열 비교로 그 달을 찾는다. 포맷이 한 글자만 달라도 표가 통째로 빈다.
   그래서 settlement-rules.periodLabel 한 곳에서만 만든다(예전엔 독립 구현이 다섯 벌이었다). */
const ymLabel = (d) => periodLabel(periodOf(d));
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
/* 도넛·범례 색 — tokens.css 의 차트 팔레트. 기본 9종과 1:1이고 그 밖의 품목은 순환한다. */
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

  /** 그 시각에 받을 돈 — 최근 6개월 귀속 중 util/settlement `isUnpaid`(명세서가 나갔고 입금 전 · 0원·거래 없음·발행 전 제외 —
   *  사용자 결정 A)인 달을 **모두** 더한다. 관리자 정산회계 표 머리 '미입금'·월간 분석 '미입금액' 과 같은 판정이다(그쪽은 한 달씩).
   *  ⚠️ 이번 달 귀속 하나만 세면 안 된다 — 명세서가 다음 달에 나가므로 늘 0원이라 '전월 대비 -100%' 가 찍혔다.
   *  전월 대비는 한 달 전 같은 시각의 같은 합과 비교한다. */
  function unpaidAt(at) {
    return clients().reduce((s, c) => s + settlementsFor(c, at).reduce((t, r) => (isUnpaid(r) ? t + r.amount : t), 0), 0);
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
    const now = new Date();
    const u0 = unpaidAt(now);
    const u1 = unpaidAt(new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), 28), now.getHours(), now.getMinutes()));
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
      const hit = pending ? o.status === "접수대기" : o.status === "주문접수" && !o.image;
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
    const b2b = b2bList().filter((o) => (tab === "pending" ? o.status === "접수대기" : o.status === "주문접수" && !o.image)).length;
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

  /* ── ⓪ 약관 동의 전 · 첫 명세서 임박 (시안 'S-05 대쉬보드 약관 경고' · N18 ①·ⓐ·ⓕ) ──────────
     약관에 동의하지 않은 거래처는 마감이 지나도 그 달이 자동 동의되지 않는다(명세 3.4 · termsHold). 발급일이 7일·25일이면
     발급에서 마감까지 사흘 남짓뿐이라, 직원이 연락하고 임시비밀번호를 다시 만들어 주고 로그인을 기다리려면 **첫 명세서
     7일 전부터** 챙겨야 한다 — 그래서 매일 보는 첫 화면에, 급할 때만 나타난다('가입 승인 대기' 와 같은 문법).
     · 판정은 거래처 목록의 '약관 동의 전' 표시와 **같은 함수**다 — util/settlement.js `termsWatchOf`(termsPending + settlementOf
       파생 · hot = 발급 7일 이내 · 발급 뒤 마감 전 · 마감이 지났어도 약관 동의 전이면 남는다). 경고용 데이터를 따로 두지 않는다
       (명세 4.8). 거래처마다 한 줄 — 마감이 지난 달(held — 가장 오래된 것)이 있으면 그 달, 없으면 다음 달(next).
       ⚠️ 예전엔 첫 달만 보는 firstStatementOf 를 써서, 첫 달이 0원으로 닫힌 거래처(가입 혜택 '1회 무료')의 다음 유료 명세서를
          놓쳤다 — 목록은 'D-4' 로 경고하는데 이 카드는 비었다(2026-10-16 통합 점검 실측). 그 달은 목록과 같은 말로
          '다음 명세서'(발급 전) · 'M월분 명세서'(발급 뒤)라고 한다. 첫 달이면 시안대로 '첫 명세서'.
     · **활성 거래처만**(2026-10-16 운영자 결정) — 정지한 거래처는 로그인 자체가 막혀 연락해도 동의를 받을 수 없다.
     · 0원으로 닫힌 달은 동의를 받지 않는다 — termsWatchOf 가 건너뛴다(발행 전 달은 아직 주문이 들어올 수 있어 남긴다).
     · 순서(급한 순): 마감 지남 → 발급 뒤 마감 전 → 발급 전. 같은 단계에서는 마감(발급 전은 발급)이 가까운 것이 위.
     · 발송·계산서 실패 경고와는 다른 것이다 — 그쪽 대쉬보드 경고는 두지 않는다(M59). 섞지 말 것. */
  const PHASE_RANK = { closed: 0, open: 1, before: 2 };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  /** 연락할 사람 — 정산·회계 담당자(가입 2단계 · 관리자 등록 레일). 번호가 비면 '연락처 미등록' 을 그대로 말한다. */
  function contactLine(clientId) {
    const b = store.getBillingContactOf(clientId);
    if (!b) return "정산 담당 미등록";
    const phone = String(b.phone || "").trim();
    return phone ? `${b.name} ${phone}` : `${b.name} · 연락처 미등록`;
  }
  function termsWatch(now) {
    const cs = clients();
    const shared = sharedBizKeys(cs);
    return cs
      .filter((c) => (c.status || "활성") === "활성")
      .map((c) => ({ c, w: termsWatchOf(c, now) }))
      .filter(({ w }) => w && w.hot)
      .map(({ c, w }) => {
        const f = w.held.length ? { ...w.held[0], phase: "closed" } : w.next;
        /* 'open' 은 마감 정각까지다(settlementOf — 정각까지 AWAITING) — 반올림하면 마지막 30초·정각에 0분이 되어 leftLabel 이
           '기한 지남' 을 돌려줘 칩이 '마감까지 기한 지남' 이라고 말한다. 올림 + 최소 1분으로 둔다. */
        const min = Math.max(1, Math.ceil((f.deadline - now) / 60000));
        const chip = f.phase === "closed"
          ? { text: "마감 지남 · 자동 동의 안 함", tone: "danger" }
          : f.phase === "open"
          ? { text: `${sameDay(f.issueAt, now) ? "오늘 발급" : "발급 완료"} · 마감까지 ${leftLabel(min)}`, tone: "danger" }
          : { text: f.dDay <= 0 ? "오늘 발급" : `D-${f.dDay}`, tone: "warn" };
        const dl = fmtKoShortTime(f.deadline);
        /* 어느 명세서인지 — 거래처 목록(admin-clients termsLineParts)과 같은 말: 첫 달 '첫' · 발급 전 '다음' · 발급 뒤 'M월분' */
        const which = f.first ? "첫 명세서" : f.phase === "before" ? "다음 명세서" : `${Number(f.ym.slice(5))}월분 명세서`;
        return {
          id: c.id,
          name: displayName(c, shared),
          chip,
          line1: `${which} ${fmtKoShortTime(f.issueAt)} ${f.phase === "before" ? "발급 예정" : "발급 완료"}`,
          line2: f.phase === "closed" ? `동의 마감 ${dl}이 지났습니다. 약관에 동의하면 직접 동의할 수 있습니다` : `동의 마감 ${dl}`,
          contact: contactLine(c.id),
          rank: PHASE_RANK[f.phase],
          key: (f.phase === "before" ? f.issueAt : f.deadline).getTime(),
          issue: f.issueAt.getTime(),
        };
      })
      .sort((a, b) => a.rank - b.rank || a.key - b.key || a.issue - b.issue || a.name.localeCompare(b.name, "ko"));
  }
  function termsCard(items) {
    if (!items.length) return "";
    return html`
      <section class="dsh-card is-warn" aria-labelledby="dsh-tw-title">
        <div class="dsh-card__h">
          <span class="dsh-tw__hl">
            <b id="dsh-tw-title">약관 동의 전 · 첫 명세서 임박</b>
            <span class="dsh-badge dsh-badge--warn">${items.length}건</span>
          </span>
          <span class="dsh-tw__sort">급한 순</span>
        </div>
        <p class="dsh-tw__desc">마감까지 약관 동의가 없으면 이 달은 자동 동의되지 않습니다. 직접 연락해 로그인과 약관 동의를 부탁하세요.</p>
        <ul class="dsh-tw__list">
          ${items.map((t) => html`
            <li class="dsh-tw">
              <div class="dsh-tw__top">
                <b class="dsh-tw__n" title="${t.name}">${t.name}</b>
                <span class="dsh-pill dsh-pill--${t.chip.tone}">${t.chip.text}</span>
              </div>
              <p class="dsh-tw__line">${t.line1}</p>
              <p class="dsh-tw__line dsh-tw__line--2">${t.line2}</p>
              <div class="dsh-tw__foot">
                <span class="dsh-tw__ct">연락 <b>${t.contact}</b></span>
                <button type="button" class="dsh-tw__open" data-open-client="${t.id}" aria-label="${t.name} 거래처 정보 열기">거래처 정보 열기 <span aria-hidden="true">›</span></button>
              </div>
            </li>`)}
        </ul>
      </section>`;
  }

  /* ── ⑤ 상품별 이용 비중 ──────────────────────────────── */
  function mixData() {
    const label = ymLabel(DATA_NOW);
    const target = state.mix === "전체" ? clients() : clients().filter((c) => channelOf(c) === state.mix);
    /* 9종 고정 순회가 아니라 **실제 집계된 품목 키**를 훑는다(월간 리포트와 같은 방식, 2026-09-17 결정).
       카탈로그에 뒤늦게 추가된 품목('특대 꽃바구니')이 도넛에서만 빠져 항목 합계가 총계와 어긋났다.
       기본 9종을 먼저 심어 순서·색이 흔들리지 않게 하고, 그 밖의 품목은 뒤에 붙는다(색은 순환). */
    const sums = new Map(USAGE_CATEGORIES.map((cat) => [cat.key, 0]));
    let orders = 0;
    target.forEach((c) => {
      const u = usageFor(c)[label];
      if (!u) return;
      orders += u.orders;
      Object.entries(u.items).forEach(([k, v]) => sums.set(k, (sums.get(k) || 0) + (v.amount || 0)));
    });
    const keys = [...sums.keys()];
    const amounts = keys.map((k) => sums.get(k));
    const sum = amounts.reduce((a, b) => a + b, 0) || 1;
    let cum = 0;
    const donut = amounts.map((amt, i) => {
      const len = (amt / sum) * DONUT_C;
      /* 세그먼트 사이 2px 흰 간격 — 9개가 붙어 있으면 경계가 읽히지 않는다. */
      const seg = { color: MIX_COLORS[i % MIX_COLORS.length], dash: `${Math.max(1, len - 2).toFixed(1)} ${DONUT_C.toFixed(1)}`, offset: (-cum).toFixed(1) };
      cum += len;
      return seg;
    });
    const ranked = amounts
      .map((v, i) => ({ name: keys[i], color: MIX_COLORS[i % MIX_COLORS.length], v }))
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
      if (!inSettlementFlow(r)) return; // 0원 달·거래 없는 달은 동의·계산서 단계가 없다 — 진행률에 세지 않는다(리포트와 같은 판정)
      const amt = Number(String(r.정산금액).replace(/[^0-9]/g, "")) || 0;
      billed += amt;
      if (r.issued) st.명세서 += 1; // 발행일이 아직 안 온 달은 명세서 단계에도 세지 않는다
      if (r.거래명세서동의 === "동의완료") st.동의 += 1;
      if (r.계산서발급 === "발급완료") st.계산서 += 1;
      if (r.입금완료 === "입금완료") st.입금 += 1;
      /* 미입금은 isUnpaid 한 판정 — 발행일(15일·25일 등)이 아직 안 온 지난달은 청구 합계에만 든다(KPI '미수금'·정산회계 표 머리와 같다). */
      if (isUnpaid(r)) unpaid += amt;
    });
    const n = st.명세서 || 1;
    const pct = Math.round(((st.명세서 + st.동의 + st.계산서 + st.입금) / (n * 4)) * 100);
    return { st, billed, unpaid, count: st.명세서, pct };
  }
  /** 조치가 필요한 정산 줄 — 판정은 관리자 정산회계 '조치 필요' 탭과 **같은** `needsAction`(보류 3종 · 계산서 발급 전에
   *  머문 달 · 기한 초과 · 알림 수신자 없음)이다. 세는 범위는 칩마다 다르다(2026-10-16 사용자 결정 B):
   *  · '연락 필요' · '조치 필요 열기' — 이 카드와 같은 귀속월(지난 달)의 조치 필요 줄 중 기한 초과가 아닌 것 / 전부.
   *    total = 정산회계 지난달 '조치 필요' 탭 건수.
   *  · '기한 초과' — **최근 6개월 전체**의 OVERDUE 줄. 지난달은 정산기한이 이번 달 말일이라 기한 초과가 될 수 없어, 지난달만
   *    세던 시절엔 이 칩이 늘 0이라 보이지 않았다. 숫자 = 정산회계에서 그 달들로 옮겨 '조치 필요' 탭의 기한 초과 줄을 합한 것.
   *    overdueYm = 기한 초과가 있는 가장 오래된 달(칩을 누르면 그 달의 '조치 필요' 탭이 열린다). */
  function actionCounts() {
    const cs = clients();
    const last = cs.map((c) => settlementsFor(c)[1]).filter(needsAction);
    const lastOverdue = last.filter((r) => r.status === "OVERDUE").length;
    const overdueRows = cs.flatMap((c) => settlementsFor(c).filter((r) => r.status === "OVERDUE"));
    const overdueYm = overdueRows.reduce((a, r) => (!a || r.ym < a ? r.ym : a), "");
    return { total: last.length, contact: last.length - lastOverdue, overdue: overdueRows.length, overdueYm };
  }
  function settleBody() {
    const s = settleStages();
    const a = actionCounts();
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
      ${a.contact || a.overdue
        ? html`<div class="dsh-acts">
            ${a.contact ? html`<span class="dsh-pill dsh-pill--danger">연락 필요 ${a.contact}</span>` : ""}
            ${/* 기한 초과 칩은 누를 수 있다 — 모양은 알약 그대로(버튼 기본값만 지운다 · admin-dashboard.css button.dsh-pill).
                 이 카드는 '지난 달 귀속' 이지만 이 칩만 최근 6개월이라, 어디로 가는지 이름(aria-label · title)이 말한다. */ ""}
            ${a.overdue
              ? html`<button type="button" class="dsh-pill dsh-pill--danger" data-settle-go="action:${a.overdueYm}"
                  aria-label="기한 초과 ${a.overdue} — 최근 6개월 · ${periodLabel(a.overdueYm)} 귀속 조치 필요 열기"
                  title="최근 6개월 중 기한 초과 ${a.overdue}건 · 가장 오래된 ${periodLabel(a.overdueYm)} 귀속부터 엽니다">기한 초과 ${a.overdue}</button>`
              : ""}
          </div>`
        : ""}
      ${a.total
        ? html`<button type="button" class="dsh-more" data-settle-go="action">거래처 정산회계 · 조치 필요 열기 <span aria-hidden="true">›</span></button>`
        : html`<button type="button" class="dsh-more" data-settle-go="">거래처 정산회계 열기</button>`}`;
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
    const terms = termsWatch(new Date());
    setHTML(root, html`
      <div class="page-admin page-dash">
        <div class="admin-inner">
          ${pageTitle({
            imgSrc: "./assets/nav-accounting.png",
            title: "대쉬보드",
            action: html`<span class="dsh-scope">${ymLabel(DATA_NOW)} · 주문 접수 기준</span>`,
          })}
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
              ${termsCard(terms)}
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
    /* 거래처 정보 창으로 — 거래처 관리(#/admin)가 mount 에서 takeFocusClient("clients") 로 받아 그 창을 연다
       (임시비밀번호 발급이 거기 있다). 단가 화면의 '승인하러 가기' 와 같은 1회 전달이다. */
    on(root, "click", "[data-open-client]", (e, t) => {
      setFocusClient("clients", t.dataset.openClient);
      nav("#/admin");
    }),
    /* 정산회계로 — 받는 쪽: admin-settlement mount 의 takeFocusSection("admin-settlement").
       "action" = 지난달 '조치 필요' 탭('조치 필요 열기') · "action:YYYY-MM" = 그 달 '조치 필요' 탭('기한 초과' 칩) ·
       빈 값 = 평소 화면 그대로(조치할 줄이 없을 때). */
    on(root, "click", "[data-settle-go]", (e, t) => {
      const go = t.dataset.settleGo;
      if (go) setFocusSection("admin-settlement", go);
      nav("#/admin/settlement");
    }),
  ];

  return () => offs.forEach((off) => off());
}
