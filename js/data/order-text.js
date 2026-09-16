/* ============================================================
   order-text.js — 주문 문자 본문 → 주문서 필드 (텍스트 인식)

   거래처가 카톡·문자로 보내는 **평문 주문서**를 읽는다. 링크 자동입력
   (`order-autofill.js`)과 **다른 입력**이다 — 저쪽은 부고장/청첩장 URL 이고
   이쪽은 사람이 쓴 문장이다.

   ── 이 파서의 제1원칙: **틀린 값보다 빈 칸이 낫다.** ───────────────────
   여기서 나온 값은 배송지·배송시각·청구금액이 된다. 애매한 것을 채워 넣으면
   화환이 엉뚱한 곳에 엉뚱한 시각에 가고 청구가 어긋난다. 그래서
   · 확신이 서는 모양만 채운다(엄격한 정규식 + 달력 검증 + 문맥 배제).
   · 후보가 둘이거나 형태가 어긋나면 **비우고 원문을 요청사항으로 넘긴다.**
   · **소비하지 않은 줄은 한 줄도 버리지 않는다**(원문 보존이 불변식이다).

   첫 판은 '모양으로 대충 읽기'였다가 실측에서 무너졌다 — 계좌번호가 연락처로,
   전화번호가 2027-02-30 이라는 배송일로, '저녁 7시' 가 07:00 으로, '17만 5000원'
   이 5,000원으로 들어갔다. 지금 규칙이 깐깐한 이유다.

   실제로 들어오는 모양 셋:
   ① 부고 통보형   ② 배송 지시형   ③ 공문형(번호 라벨)
   ============================================================ */

/* ── 어휘 ────────────────────────────────────────────────── */
const SIDO = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주";
/* 종류 판정용(리본 후보와 **다른 목록**이다 — 섞으면 '장례식장' 줄이 리본에 찍힌다) */
const OBIT_WORDS = ["삼가", "명복", "근조", "조의", "고인", "故", "장례", "빈소", "발인", "부고", "별세", "영결"];
const CONGRAT_WORDS = ["축하", "축 ", "생신", "개업", "취임", "입학", "졸업", "결혼", "화혼", "승진", "창립", "개원", "당선"];
/* 리본에 새길 **문구**의 모양 — 맺음 어미로 끝나는 한 문장 */
const PHRASE_END = /(빕니다|드립니다|합니다|바랍니다|기원합니다|표합니다|축하해요|축하드려요)[.!]?$/;
const PHRASE_HINT = ["명복", "조의", "근조", "삼가", "축하", "기원", "축원", "쾌유", "만수무강", "번영", "발전"];
/* 문구가 아니라 '부탁하는 말' — 리본에 찍히면 안 된다 */
const REQUEST_WORDS = ["부탁", "주세요", "해주세요", "문의", "신청", "요청", "보내주", "결제", "계산서", "확인"];
/* 사실 서술(장소·일정) — 리본 후보에서 먼저 제외한다 */
const FACT_WORDS = ["장례식장", "빈소", "호실", "분향", "발인", "부고", "입관", "장지", "예식장", "웨딩홀"];
/* 보내는분 꼬리 — 기관·직함·경조 관용 맺음말 */
const SENDER_TAIL = /(교수|총장|원장|처장|실장|부장|과장|팀장|대표|사장|회장|이사|위원장|본부장|센터장|협력처|총무과|대학원|대학교|주식회사|\(주\)|재단|협회|조합|일동|올림|드림|배상|백)$/;
/* 숫자가 있어도 전화·금액으로 읽으면 안 되는 줄 */
const MONEY_ID_WORDS = ["계좌", "예금주", "부의", "조의금", "입금", "사업자", "카드번호", "은행", "농협", "국민", "신한", "우리", "하나", "기업"];
/* 배송일이 **아닌** 날짜 — 화환은 발인 전에 도착한다 */
const NOT_DELIVERY = ["발인", "별세", "입관", "영결", "장지", "하관", "소천", "운명", "임종"];

/* 엄격한 전화번호 — 국번을 못박고 앞뒤 경계를 본다.
   ⚠️ 느슨하게 두면 계좌번호 '302-0123-4567' 에서 '02-0123-4567' 을 뽑아낸다. */
const PHONE = /(?<![\d-])(01[016789]|0(?:2|[3-6][1-5]))[-.\s]?(\d{3,4})[-.\s]?(\d{4})(?![\d-])/;
const pad2 = (n) => String(n).padStart(2, "0");
const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
/* 글머리표·번호를 벗긴다 — 실무 부고문은 '▣ 빈소 :' 처럼 온다 */
const BULLET = /^[\s\d]*[.)\]]?\s*[▣■□▶▷◆◇○●※*\-–—·•]*\s*/;
const labelKey = (s) => clean(s).replace(BULLET, "").replace(/[\s·:：]/g, "");
const has = (s, list) => list.some((w) => s.includes(w));

const LABELS = {
  addr: ["행사장소", "장소", "배송지", "주소", "배송장소", "예식장", "장례식장", "받는곳", "수령처", "도착지"],
  when: ["행사일시", "일시", "배송일시", "배송일", "날짜", "일자", "행사일", "희망일시", "희망일"],
  ribbon: ["화환문구", "리본문구", "문구", "경조문구", "리본"],
  toName: ["받는분", "받는사람", "수령인", "고인", "수신인", "혼주"],
  toPhone: ["연락처", "전화", "전화번호", "휴대폰", "핸드폰"],
  sender: ["보내는분", "보내는이", "발신", "명의", "주문자"],
  /* 빈소·분향실은 값이 주소면 배송지, 아니면(호실만 적힌 경우) 요청사항으로 */
  place: ["빈소", "분향실", "장례식장", "식장"],
  product: ["상품", "품목", "화환", "제품"],
  amount: ["금액", "가격", "단가"],
  /* 값은 쓰지 않고 **요청사항으로 넘기는** 라벨 — 배송 정보가 아니다 */
  note: ["행사명", "행사", "호실", "발인", "상주", "별세", "고인생년", "조의금", "계좌", "보내는곳", "발송지"],
};
const labelOf = (key) => {
  for (const [k, list] of Object.entries(LABELS)) if (list.includes(key)) return k;
  return "";
};

/* ── 조각 판정 ───────────────────────────────────────────── */
function pickPhone(line) {
  const s = String(line || "");
  if (has(s, MONEY_ID_WORDS)) return ""; /* 계좌·사업자번호 줄에서는 뽑지 않는다 */
  const m = PHONE.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** 주소 줄인가 — 시/도 + **도로명·지번 꼬리**가 둘 다 있어야 한다.
 *  ⚠️ `시 `·`구 ` 만으로 통과시키면 "강원 원주시 소재 병원에 입원 중" 같은 문장이
 *     배송지가 된다. 종결어미가 있는 문장도 주소가 아니다. */
function isAddr(line) {
  const s = clean(line);
  if (!new RegExp(`(${SIDO})`).test(s)) return false;
  if (/(니다|세요|해요|입니다|드려요)[.!]?$/.test(s)) return false;
  return /(로|길)\s*\d|\d+\s*(로|길)|\d+\s*번지|\d+\s*가\d|\d+\s*동|\d+\s*호|\d+-\d+/.test(s);
}

/** 괄호 안에 주소가 있으면 그것을 쓰고, **나머지 괄호는 남긴다**(호실·층이 배송지의 일부다). */
function addrFrom(line) {
  let s = clean(line).replace(/^\(?\d{5}\)?\s*/, "").replace(/^\d{3}-\d{3}\s*/, ""); /* 우편번호 */
  /* ⚠️ 실주소는 이 길이를 넘지 않는다. 쉼표 없이 한 줄로 온 부고 문자 전체(140자)가
     통째로 배송지가 된 적이 있다 — 길면 주소로 인정하지 않고 원문으로 넘긴다. */
  if (s.length > 70) return "";
  const groups = [...s.matchAll(/\(([^)]+)\)/g)];
  const hit = groups.find((g) => isAddr(g[1]));
  if (!hit) return isAddr(s) ? s : "";
  const outer = clean(s.replace(hit[0], " "));
  return outer ? `${clean(hit[1])} ${outer}` : clean(hit[1]);
}

/* 시간대 어휘 — '저녁 7시' 를 07:00 으로 읽으면 12시간 일찍 간다 */
const PM_WORDS = ["오후", "저녁", "밤"];
const AM_WORDS = ["오전", "아침", "새벽"];

/** 날짜·시각. 읽지 못하면 null. 읽었더라도 **과거·비실재 날짜는 거부**한다. */
function pickWhen(line, now) {
  const s = clean(line);
  if (has(s, NOT_DELIVERY)) return null; /* 발인·별세 일시는 배송일이 아니다 */
  /* 날짜는 '월/일' 한글 표기 또는 점 구분만 받는다 — 하이픈·슬래시는 전화번호와
     구분이 안 된다(02-3010-2230 이 2027-02-30 으로 읽힌 적이 있다). */
  /* ⚠️ 뒤에 단위가 붙으면 날짜가 아니다 — '2.5만원' 이 2월 5일로 읽혀 배송일이
     2027-02-05 가 된 적이 있다(금액은 통째로 사라졌다). */
  const md = /(?:(\d{4})\s*[년.]\s*)?(\d{1,2})\s*[월.]\s*(\d{1,2})\s*일?(?!\s*(?:만|천|억|원|개|kg|%|대|건))/.exec(s);
  if (!md) return null;
  /* 점 표기는 '월/일' 글자가 없으면 금액·소수와 구분이 안 된다 — 금액 어휘가 있으면 포기 */
  if (!/[월일년]/.test(md[0]) && /(만|원|천|억)/.test(s)) return null;
  const mo = +md[2], d = +md[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let y = md[1] ? +md[1] : now.getFullYear();
  if (!md[1]) {
    /* 연도를 안 적었으면 가까운 미래로 읽는다(12월에 받은 '1월 5일' 은 내년). */
    const cand = new Date(y, mo - 1, d);
    if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
  }
  const real = new Date(y, mo - 1, d);
  if (real.getFullYear() !== y || real.getMonth() !== mo - 1 || real.getDate() !== d) return null; /* 2월 30일 */
  /* 적힌 연도가 과거면(작년 공문 재사용) 추측하지 않는다 — 비우고 원문을 남긴다. */
  if (real < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return { past: true };

  /* 시각 — 날짜 부분을 지운 뒤 찾는다(9월 16일의 16이 시각으로 읽히지 않게) */
  const rest = s.replace(md[0], " ");
  const band = [...PM_WORDS, ...AM_WORDS, "낮", "정오", "자정"].find((w) => rest.includes(w)) || "";
  const hm = /(\d{1,2})\s*(?::|시)\s*(\d{1,2})?\s*분?/.exec(rest);
  if (!hm) {
    if (band === "정오") return { date: ymd(y, mo, d), time: "12:00" };
    if (band === "자정") return { date: ymd(y, mo, d), time: "00:00" };
    /* '오전중'처럼 시각을 못박지 않았다 — 시각은 비우고 원문을 남긴다. */
    return { date: ymd(y, mo, d), time: "", vague: band ? clean(`${band}${/\s*중/.test(rest) ? " 중" : ""}`) : "" };
  }
  let h = +hm[1];
  if (h > 24) return { date: ymd(y, mo, d), time: "", vague: clean(rest) };
  if (PM_WORDS.includes(band) && h < 12) h += 12;
  else if (band === "낮" && h < 12) h += 12;
  else if (AM_WORDS.includes(band) && h === 12) h = 0;
  else if (!band && h > 23) return { date: ymd(y, mo, d), time: "" };
  return { date: ymd(y, mo, d), time: `${pad2(h % 24)}:${pad2(hm[2] ? +hm[2] : 0)}` };
}
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

/** 금액. "17만 5000원" · "3만5천원" · "150,000원" 을 모두 같은 수로 읽는다. */
function pickAmount(line, { loose = false } = {}) {
  const s = clean(line);
  if (has(s, MONEY_ID_WORDS)) return 0;
  let m = /(\d+)\s*만\s*(\d{1,4})\s*천\s*원?/.exec(s);
  if (m) return +m[1] * 10000 + +m[2] * 1000;
  m = /(\d+)\s*만\s*(\d{3,4})\s*원?/.exec(s);
  if (m) return +m[1] * 10000 + +m[2];
  m = /(\d+(?:\.\d+)?)\s*만\s*원?/.exec(s);
  if (m) return Math.round(parseFloat(m[1]) * 10000);
  m = /([\d,]{4,})\s*원/.exec(s);
  if (m) return parseInt(m[1].replace(/,/g, ""), 10) || 0;
  if (loose) { m = /([\d,]{4,})/.exec(s); if (m) return parseInt(m[1].replace(/,/g, ""), 10) || 0; }
  return 0;
}

/** 카탈로그 이름과 **정확히** 같은 것이 **하나**일 때만 상품으로 인정한다(추측 금지). */
function pickProduct(text, catalog) {
  const s = clean(text);
  const hits = (catalog || []).filter((name) => s.includes(name));
  return hits.length === 1 ? hits[0] : "";
}

/* 이름 뒤에 붙는 것들 — 존칭·직함·상사(喪事) 표현. 이름이 아니다. */
const NAME_TAIL = /(님|씨|귀하|귀중|여사|옹|선생|교수|대표|사장|회장|원장|총장|이사장|부장|과장|팀장|실장|국장|이사|의원|변호사|박사|주무관|신부|신랑)$/;
const MOURN_TAIL = /(부친상|모친상|빙부상|빙모상|조부상|조모상|장인상|장모상|별세|영면|소천|작고|운명|임종)$/;

/** 사람 이름 꼴인가 — **처음부터 끝까지** 이름이어야 한다.
 *  ⚠️ 끝에서만 훑으면 '故 한성규 부친상' → '故 부친상', '대구가톨릭대학교' → '톨릭대학교'
 *     처럼 잘린 조각이 이름 칸에 들어간다(실측). 앵커를 양쪽에 건다. */
function nameOf(v, { obit = false } = {}) {
  const raw = clean(v);
  let s = raw
    .replace(BULLET, "")
    .replace(/\([^)]*\)/g, " ")            /* (향년 87세) */
    .replace(/^(고인|故|망인|상주)\s*[:：]?\s*/, "");
  /* 꼬리 토큰을 하나씩 떼어 낸다 — 존칭·직함·상사 표현 */
  let guard = 0;
  while (guard++ < 4) {
    const t = clean(s);
    const cut = t.replace(NAME_TAIL, "").replace(MOURN_TAIL, "");
    if (cut === t) break;
    s = cut;
  }
  s = clean(s);
  /* 남은 것이 **통째로** 한글 이름 2~4자여야 한다(성+이름). 아니면 이름이 아니다. */
  if (!/^[가-힣]{2,4}$/.test(s)) return "";
  const isObit = obit || /(고인|故|망인)/.test(raw);
  return isObit ? `故 ${s}` : s;
}

/** 리본 문구 꼴인가 — 맺음 어미로 끝나는 **경조 문구** 한 줄. */
function isPhrase(line) {
  const s = clean(line);
  if (s.length > 40) return false;
  if (has(s, REQUEST_WORDS) || has(s, FACT_WORDS)) return false;
  /* '축 개업'·'근조' 같은 **짧은 정형 문구**는 어휘 검사를 면제한다 —
     예전엔 어휘 검사가 먼저 돌아 이 분기가 도달 불가능한 죽은 코드였다. */
  if (/^(축|근조|謹弔)(\s|$)/.test(s)) return true;
  if (!has(s, PHRASE_HINT)) return false;
  return PHRASE_END.test(s);
}

/** 보내는분 꼴인가 — 짧고, 서술어로 끝나지 않으며, 기관·직함·관용 맺음말이 있는 줄. */
function isSender(line) {
  const s = clean(line);
  if (s.length > 30) return false;
  if (has(s, REQUEST_WORDS)) return false;
  if (/(니다|세요|해요|드려요)[.!]?$/.test(s)) return false;
  return SENDER_TAIL.test(s);
}

/* ── 본 파서 ─────────────────────────────────────────────── */
/**
 * parseOrderText(raw, { catalog, now }) → null | {
 *   kind, addr, toName, toPhone, date, time, vague,
 *   ribbonPhrase, ribbonSender, product, amount, note, got:[] }
 *
 * 하나도 못 읽으면 null — 호출부가 "무엇을 찾는지" 안내한다.
 */
export function parseOrderText(raw, { catalog = [], now = new Date() } = {}) {
  const text = String(raw == null ? "" : raw);
  if (!clean(text)) return null;

  const out = {
    kind: "", addr: "", toName: "", toPhone: "", date: "", time: "", vague: "",
    ribbonPhrase: "", ribbonSender: "", product: "", amount: 0, note: "", got: [],
  };
  const notes = [];
  /* 값을 넣는 유일한 문. 이미 찼거나 값이 비면 **원문을 요청사항으로 넘긴다** —
     조용히 버리는 경로를 만들지 않는다. */
  const take = (k, v, src) => {
    if (v && !out[k]) { out[k] = v; if (k !== "vague") out.got.push(k); return true; }
    if (src) notes.push(clean(src));
    return false;
  };
  const when = (w, src) => {
    if (!w || w.past) { notes.push(clean(src)); return; }
    if (!out.date) {
      out.date = w.date; out.got.push("date");
      if (w.time) { out.time = w.time; } else { out.vague = w.vague || "시각 미기재"; }
      if (w.vague || !w.time) notes.push(`배송 희망: ${w.date} ${w.vague || "(시각 미기재)"}`);
    } else notes.push(clean(src));
  };

  const lines = text.split(/\r?\n/).map((l) => clean(l)).filter(Boolean);
  const plain = [];

  /* ① 라벨 줄 — 사람이 표를 그려 보낸 것이니 가장 믿을 만하다.
        ⚠️ 라벨이 붙었어도 **값의 모양이 아니면 채우지 않는다**(연락처 칸에 '현장 문의'). */
  lines.forEach((line) => {
    const m = /^([^:：]{1,16})[:：](.*)$/.exec(line);
    const key = m ? labelOf(labelKey(m[1])) : "";
    if (!key) { plain.push(line); return; }
    const v = clean(m[2]);
    if (!v) return; /* 값 없는 라벨은 버려도 잃는 것이 없다 */
    const lab = clean(m[1].replace(BULLET, ""));
    const src = `${lab}: ${v}`;
    /* ⚠️ 빈소·장례식장(place)은 **도로명 주소를 이기면 안 된다** — 부고문은 관례상
       빈소가 주소보다 위에 오는데 선착순이면 '○○병원 특2호실' 이 배송지가 되고
       진짜 도로명이 요청사항으로 밀린다. 도로명이 있는 값이 이긴다. */
    if (key === "addr" || key === "place") {
      const a = addrFrom(v);
      const road = /(로|길)\s*\d|\d+\s*(로|길)|\d+\s*번지/.test(a);
      if (a && road && (!out.addr || !/(로|길)\s*\d|\d+\s*(로|길)/.test(out.addr))) {
        if (out.addr) notes.push(out.addr); /* 밀려난 값도 버리지 않는다 */
        else out.got.push("addr");
        out.addr = a;
      } else take("addr", a, src);
    }
    else if (key === "when") when(pickWhen(v, now), src);
    else if (key === "ribbon") splitRibbon(v, take, notes);
    else if (key === "toName") take("toName", nameOf(v, { obit: /고인/.test(lab) }), src);
    else if (key === "toPhone") take("toPhone", pickPhone(v), src);
    /* ⚠️ 보내는분 칸에 주소가 오면 리본에 주소가 찍힌다 — 명의 꼴만 받는다. */
    else if (key === "sender") take("ribbonSender", !isAddr(v) && (isSender(v) || v.length <= 30) ? v : "", src);
    else if (key === "product") { if (!take("product", pickProduct(v, catalog), null)) notes.push(src); const a = pickAmount(v); if (a) take("amount", a); }
    else if (key === "amount") { if (!take("amount", pickAmount(v, { loose: true }), null)) notes.push(src); }
    else notes.push(src); /* note 라벨(행사명·빈소·발인·상주·계좌 …) */
  });

  /* ② 라벨 없는 줄 — **확신이 서는 모양만** 읽고, 나머지는 통째로 요청사항으로.
        ⚠️ 카톡은 줄바꿈 없이 한 줄로 오는 일이 흔하다. 쉼표·하이픈으로 한 번 더
           쪼개지 않으면 "주소, 상주 010-…, 삼가…, 회사 일동" 전체가 배송지가 된다.
           단 **괄호 안 쉼표는 주소의 일부**다("(만촌동, 메트로팔레스2단지아파트)"). */
  const fragments = plain.flatMap((line) => {
    if (line.length <= 40) return [line];
    const kept = [];
    const masked = line.replace(/\([^)]*\)/g, (g) => ` ${kept.push(g) - 1} `);
    return masked
      .split(/\s*[,;]\s*|\s+-\s+/)
      .map((f) => clean(f.replace(/ (\d+) /g, (_, i) => kept[+i])))
      .filter(Boolean);
  });
  fragments.forEach((line) => {
    let rest = line;
    let usedAny = false;

    const ph = pickPhone(rest);
    if (ph && !out.toPhone) {
      out.toPhone = ph; out.got.push("toPhone"); usedAny = true;
      rest = clean(rest.replace(PHONE, " ").replace(/[()\[\]]/g, " ").replace(/[,·]/g, " "));
      /* ⚠️ 남은 조각이 길면 이름이 아니다 — 문장 꼬리만 떼어 이름으로 삼으면
         '…임직원 일동' 이 '故 일동' 이 된다. 짧은 조각만 이름으로 인정한다. */
      const nm = rest.length <= 12 ? nameOf(rest) : "";
      if (nm && !out.toName) { out.toName = nm; out.got.push("toName"); rest = ""; }
    }
    if (rest && !out.addr) { const a = addrFrom(rest); if (a) { out.addr = a; out.got.push("addr"); rest = ""; usedAny = true; } }
    if (rest && !out.amount) {
      const a = pickAmount(rest);
      if (a) {
        out.amount = a; out.got.push("amount"); usedAny = true;
        const p = pickProduct(rest, catalog);
        if (p && !out.product) { out.product = p; out.got.push("product"); }
        /* 상품 표현은 카탈로그와 다를 수 있다 — 원문을 남겨 담당자가 고르게 한다 */
        notes.push(clean(rest)); rest = "";
      }
    }
    if (rest && !out.toName && /(고인|故|망인)/.test(rest) && !has(rest, PHRASE_HINT)) {
      const nm = nameOf(rest);
      if (nm) { out.toName = nm; out.got.push("toName"); rest = ""; usedAny = true; }
    }
    if (rest && !out.date) {
      const w = pickWhen(rest, now);
      if (w && !w.past) { when(w, rest); rest = ""; usedAny = true; }
    }
    if (rest && !out.product) {
      const p = pickProduct(rest, catalog);
      if (p) { out.product = p; out.got.push("product"); notes.push(clean(rest)); rest = ""; usedAny = true; }
    }
    if (rest && !out.ribbonPhrase && isPhrase(rest)) { out.ribbonPhrase = rest; out.got.push("ribbonPhrase"); rest = ""; usedAny = true; }
    if (rest && !out.ribbonSender && isSender(rest)) {
      /* ⚠️ '일동·올림·드림' 만으로 통과한 줄은 **단독 명의가 아니다** — 바로 앞 줄이
         기관명이면 두 줄을 합친다(리본에 '임직원 일동'만 찍히던 자리). */
      const tailOnly = /^(임직원\s*)?(일동|올림|드림|배상|백)$/.test(rest);
      const prev = notes.length ? notes[notes.length - 1] : "";
      if (tailOnly && prev && prev.length <= 30 && !/(니다|세요)$/.test(prev)) {
        out.ribbonSender = `${prev} ${rest}`; notes.pop();
      } else out.ribbonSender = rest;
      out.got.push("ribbonSender"); rest = ""; usedAny = true;
    }

    if (rest) notes.push(clean(rest)); /* 못 읽은 것은 **반드시** 남는다 */
    else if (!usedAny) notes.push(clean(line));
  });

  /* ③ 종류 — 본문 전체로 본다(부고는 '삼가~' 한 마디만 오기도 한다) */
  out.kind = has(text, OBIT_WORDS) ? "obit" : "congrat";
  out.note = [...new Set(notes.filter((l) => l && l.length > 1))].join("\n");
  return out.got.length ? out : null;
}

/** "대구가톨릭대학교 총장 성한기 / 차이나포럼 39기 입학을 축하드립니다" 처럼
 *  한 줄에 보내는분과 문구가 같이 오는 모양을 가른다.
 *  ⚠️ 구분자는 **공백으로 둘러싸인** 슬래시만 — '9/17' 의 슬래시를 자르면 안 된다.
 *  ⚠️ 조각이 셋 이상이면 자동 분배하지 않는다(무엇이 명의인지 알 수 없다). */
function splitRibbon(v, take, notes) {
  const s = clean(v);
  const parts = s.split(/\s+[/|]\s+/).filter(Boolean);
  if (parts.length > 2) { notes.push(s); return; } /* 무엇이 명의인지 알 수 없다 */
  if (parts.length === 1) {
    if (isPhrase(s)) take("ribbonPhrase", s, s);
    else notes.push(s);
    return;
  }
  const pi = parts.findIndex((p) => isPhrase(p) || has(p, PHRASE_HINT));
  if (pi < 0) { notes.push(s); return; }
  take("ribbonPhrase", parts[pi], null);
  const other = parts[1 - pi];
  if (other) take("ribbonSender", other, other);
}

/**
 * 파싱 결과를 등록 모달 드래프트에 옮긴다 — **호출부가 규칙을 복제하지 않게** 여기 둔다.
 * ⚠️ 읽은 것만 덮는다. 빈 값으로 기존 입력을 지우면 "자동작성을 눌렀더니 적어 둔 게
 *    사라졌다" 가 된다.
 * ⚠️ 시각을 못 읽었으면 09:00 을 넣되 **요청사항에 그 사실이 남아 있다**(parseOrderText 가
 *    넣는다). 담당자가 '거래처가 9시를 지정했다' 고 읽으면 안 된다.
 */
export function applyOrderText(draft, r) {
  if (!draft || !r) return [];
  const set = (k, v) => { if (v) draft[k] = v; };
  set("address", r.addr);
  set("recipientName", r.toName);
  set("recipientPhone", r.toPhone);
  set("ribbonPhrase", r.ribbonPhrase);
  set("ribbonSender", r.ribbonSender);
  set("product", r.product);
  if (r.amount) draft.amount = r.amount;
  if (r.date) draft.deliverAt = `${r.date}T${r.time || "09:00"}`;
  if (r.note) draft.request = draft.request ? `${draft.request}\n${r.note}` : r.note;
  return r.got;
}
