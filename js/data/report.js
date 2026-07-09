/* ============================================================
   report.js — 거래처 분리정산 월간 분석 리포트 로직 (순수 함수).
   buildMonthlyReport({ year, month, clients, usage, settlements, categories })
     → 대시보드·A4 리포트가 공유하는 구조화 분석 데이터 + 규칙 기반 코멘트.
   DOM 의존 없음(Node 검증 가능). 데이터가 없는 월은 null 반환.
   ============================================================ */

const pad2 = (n) => String(n).padStart(2, "0");
export const ymLabelOf = (y, m) => `${y}년 ${pad2(m)}월`;
const wonFmt = (n) => Number(n).toLocaleString("ko-KR") + "원";
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** 선택 월 기준 direction 개월 이동한 {y,m} */
function shiftMonth(y, m, diff) {
  const d = new Date(y, m - 1 + diff, 1);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

/** 해당 월의 거래처별 이용 합계 목록 (데이터 없으면 빈 배열) */
function monthRows(label, clients, usage) {
  return clients
    .map((c) => {
      const u = usage[c.id] && usage[c.id][label];
      return u ? { client: c, orders: u.orders, total: u.total, items: u.items } : null;
    })
    .filter(Boolean);
}

export function buildMonthlyReport({ year, month, clients, usage, settlements, categories }) {
  const label = ymLabelOf(year, month);
  const rows = monthRows(label, clients, usage);
  if (rows.length === 0) return null; // 데이터 없는 월

  const prev = shiftMonth(year, month, -1);
  const prevLabel = ymLabelOf(prev.y, prev.m);
  const prevRows = monthRows(prevLabel, clients, usage);
  const hasPrev = prevRows.length > 0;

  /* ── 합계 KPI ── */
  const total = rows.reduce((a, r) => a + r.total, 0);
  const orders = rows.reduce((a, r) => a + r.orders, 0);
  const activeClients = rows.filter((r) => r.orders > 0).length;
  const prevTotal = prevRows.reduce((a, r) => a + r.total, 0);
  const prevOrders = prevRows.reduce((a, r) => a + r.orders, 0);
  const deltaTotal = hasPrev ? total - prevTotal : null;
  const deltaOrders = hasPrev ? orders - prevOrders : null;
  const deltaPct = hasPrev && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10 : null;

  /* ── 월별 추이 (선택 월 포함 최근 6개월, 데이터 없는 달은 0) ── */
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const t = shiftMonth(year, month, -i);
    const tLabel = ymLabelOf(t.y, t.m);
    const tRows = monthRows(tLabel, clients, usage);
    trend.push({
      label: tLabel,
      short: `${t.m}월`,
      total: tRows.reduce((a, r) => a + r.total, 0),
      isCurrent: i === 0,
    });
  }

  /* ── 거래처별 순위 (금액 내림차순) ── */
  const prevById = {};
  prevRows.forEach((r) => { prevById[r.client.id] = r; });
  const affiliates = rows
    .map((r) => {
      const p = prevById[r.client.id];
      return {
        id: r.client.id,
        name: r.client.companyName,
        orders: r.orders,
        total: r.total,
        share: pct(r.total, total),
        delta: hasPrev && p ? r.total - p.total : null,
      };
    })
    .sort((a, b) => b.total - a.total);
  const top3Share = pct(affiliates.slice(0, 3).reduce((a, r) => a + r.total, 0), total);

  /* ── 항목(카테고리)별 합계 + 전월 대비 비중 변화 ── */
  const catSum = (list) => {
    const acc = {};
    categories.forEach((c) => { acc[c.key] = { count: 0, amount: 0 }; });
    list.forEach((r) => {
      Object.entries(r.items).forEach(([k, v]) => {
        if (!acc[k]) acc[k] = { count: 0, amount: 0 };
        acc[k].count += v.count;
        acc[k].amount += v.amount;
      });
    });
    return acc;
  };
  const curCats = catSum(rows);
  const prevCats = catSum(prevRows);
  const prevCatTotal = prevRows.reduce((a, r) => a + r.total, 0);
  const catStats = categories
    .map((c) => {
      const cur = curCats[c.key];
      const share = pct(cur.amount, total);
      const prevShare = hasPrev ? pct(prevCats[c.key].amount, prevCatTotal) : null;
      return {
        key: c.key,
        count: cur.count,
        amount: cur.amount,
        share,
        shiftPp: prevShare == null ? null : Math.round((share - prevShare) * 10) / 10,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  /* ── 정산 진행 현황 (해당 월 정산 레코드 기준) ── */
  const recs = clients
    .map((c) => {
      const rec = (settlements[c.id] || []).find((r) => r.청구년월 === label);
      return rec ? { client: c, rec } : null;
    })
    .filter(Boolean);
  const wonToNum = (s) => Number(String(s).replace(/[^0-9]/g, "")) || 0;
  const agreed = recs.filter(({ rec }) => rec.거래명세서동의 === "동의완료").length;
  const issued = recs.filter(({ rec }) => rec.계산서발급 === "발급완료").length;
  const paidRecs = recs.filter(({ rec }) => rec.입금완료 === "입금완료");
  const paidAmount = paidRecs.reduce((a, { rec }) => a + wonToNum(rec.정산금액), 0);
  const unpaidRecs = recs.filter(({ rec }) => rec.입금완료 !== "입금완료");
  const unpaidAmount = unpaidRecs.reduce((a, { rec }) => a + wonToNum(rec.정산금액), 0);
  const settle = {
    count: recs.length,
    agreed,
    issued,
    paid: paidRecs.length,
    paidAmount,
    unpaidAmount,
    // 스토어의 현재 회사명 사용(레코드의 입금자는 모듈 로드 시점 스냅샷이라 개명 시 어긋남)
    unpaidNames: unpaidRecs.map(({ client }) => client.companyName),
    paidRate: recs.length ? Math.round((paidRecs.length / recs.length) * 100) : 0,
  };

  /* ── 규칙 기반 분석 코멘트 ── */
  const insights = [];
  if (deltaTotal != null) {
    const dir = deltaTotal >= 0 ? "증가" : "감소";
    insights.push(
      `${month}월 총 이용금액은 ${wonFmt(total)}(주문 ${orders}건)으로, 전월 대비 ${wonFmt(Math.abs(deltaTotal))}(${Math.abs(deltaPct ?? 0)}%) ${dir}했습니다.`
    );
  } else {
    insights.push(`${month}월 총 이용금액은 ${wonFmt(total)}(주문 ${orders}건)입니다. 전월 데이터가 없어 증감 비교는 생략합니다.`);
  }
  if (affiliates.length) {
    const top = affiliates[0];
    let s = `이용금액 1위 거래처는 ${top.name}(${wonFmt(top.total)}, 전체의 ${top.share}%)입니다.`;
    if (affiliates.length > 3) s = s.slice(0, -4) + `이며, 상위 3개 거래처가 전체의 ${top3Share}%를 차지합니다.`;
    insights.push(s);
  }
  if (hasPrev) {
    const withDelta = affiliates.filter((a) => a.delta != null);
    if (withDelta.length) {
      const up = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
      const down = [...withDelta].sort((a, b) => a.delta - b.delta)[0];
      if (up.delta > 0) insights.push(`전월 대비 이용 증가폭이 가장 큰 거래처는 ${up.name}(+${wonFmt(up.delta)})입니다.`);
      if (down.delta < 0) insights.push(`반면 ${down.name}은(는) 전월 대비 ${wonFmt(Math.abs(down.delta))} 감소해 확인이 필요합니다.`);
    }
  }
  if (catStats.length) {
    const topCat = catStats[0];
    insights.push(`가장 많이 이용한 항목은 ${topCat.key}(${topCat.count}건, ${wonFmt(topCat.amount)}, ${topCat.share}%)입니다.`);
    const shifted = catStats.filter((c) => c.shiftPp != null && Math.abs(c.shiftPp) >= 1).sort((a, b) => Math.abs(b.shiftPp) - Math.abs(a.shiftPp))[0];
    if (shifted) {
      insights.push(`항목 구성에서는 ${shifted.key} 비중이 전월 대비 ${shifted.shiftPp > 0 ? "+" : ""}${shifted.shiftPp}%p ${shifted.shiftPp > 0 ? "확대" : "축소"}되었습니다.`);
    }
  }
  /* 정산 완료율은 대시보드 '정산 진행 현황' 카드·리포트 KPI 에 이미 노출되므로
     분석 코멘트에서는 중복 제외한다(요청 반영). */

  return {
    label, prevLabel, hasPrev,
    total, orders, activeClients, clientCount: clients.length,
    prevTotal, deltaTotal, deltaOrders, deltaPct,
    trend, affiliates, top3Share, catStats, settle, insights,
  };
}
