/* ============================================================
   public-delivery.js — 배송완료 리포트 동적 바인딩.
   배송완료 시 주문자에게 SMS 로 발송되는 링크의 URL 쿼리 파라미터로
   주문정보를 주입한다.

   지원 파라미터 (모두 선택 · 없으면 샘플 폴백):
     order      주문번호            예) 20260706-0342
     date       주문일시(표시용 문자열)
     place      배송주소
     recipient  받는분 (주문 시 지정)
     sender     보내는분 (리본문구)
     receiver   경조화환 수령자 (현장 인수자)
     photo      현장 배송 사진 URL (http/https 만 허용)

   값은 전부 textContent 로 주입 → URL 을 통한 HTML/스크립트 주입(XSS) 불가.
   ============================================================ */
(function () {
  "use strict";

  var SAMPLE = {
    order: "20260706-0342",
    date: "2026년 07월 06일 14:30",
    place: "서울특별시 강남구 테헤란로 152, 강남파이낸스센터 3층 대회의실",
    recipient: "공훈 부장",
    sender: "(주)올해의경조사 임직원 일동",
    receiver: "박상준",
    photo: "",
  };

  var params = new URLSearchParams(location.search);

  function val(key) {
    var v = params.get(key);
    if (v != null) v = v.trim();
    return v ? v : SAMPLE[key] || "";
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function pad(n) {
    n = String(n);
    return n.length < 2 ? "0" + n : n;
  }

  /* 헤드라인: 받는 분을 부른다. 이미 존칭/단체 접미사가 붙은 경우만 '께', 그 외(직위 포함)는 '님께'. */
  function headlineFor(r) {
    if (!r || r.length > 12) return "화환 배송을 완료했습니다";
    var tail = /(님|귀하|유가족|일동|가족|드림|님들)$/.test(r)
      ? "께 화환을 전달했습니다"
      : "님께 화환을 전달했습니다";
    return r + tail;
  }

  /* 표시용 일시 문자열 → "YYYY.MM.DD" (직인 날짜용). */
  function compactDate(s) {
    var d = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return d ? d[1] + "." + pad(d[2]) + "." + pad(d[3]) : "";
  }

  /* http/https 만 허용 — javascript:, data: 등 차단. */
  function safePhoto(raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw, location.href);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (e) {}
    return null;
  }

  // ── 바인딩 ────────────────────────────────────────────────
  var order = val("order");
  var receiver = val("receiver");

  setText("hero-headline", headlineFor(val("recipient")));
  setText("order-no", "No." + order);
  setText("foot-no", "No." + order);

  setText("v-date", val("date"));
  setText("v-place", val("place"));
  setText("v-recipient", val("recipient"));
  setText("v-sender", val("sender"));
  setText("receiver-name", receiver);
  setText("seal-date", compactDate(val("date")));

  // 현장 배송 사진 (외부 URL 이 안전할 때만 교체)
  var photo = safePhoto(params.get("photo"));
  var img = document.getElementById("photo");
  if (photo && img) img.src = photo;

  /* 라이트박스를 **닫은** 키를 누른 채로 두면 — 그 키를 뗄(또는 새로 누를) 때까지 문서 전체에서 자동 반복을 버린다.
     닫는 순간 초점이 확대 버튼으로 돌아가므로 다음 반복이 그 버튼을 다시 눌러 라이트박스가 다시 열렸다.
     ⚠️ 이 블록과 아래 라이트박스의 `HELD`·`settled`·`down` 은 앱 `js/ui.js` 의 `swallowHeldRepeat`·`openLightbox`
        (2026-10-19)를 **복제**한 것이다 — 이 페이지는 비모듈 IIFE 라 ui.js 를 가져올 수 없다. 한쪽 규칙을 고치면 다른 쪽도 고칠 것. */
  var swallowing = {};
  function swallowHeldRepeat(key) {
    if (swallowing[key]) return;
    swallowing[key] = true;
    function onDown(e) {
      if (e.key !== key) return;
      if (!e.repeat) { off(); return; } /* 새로 누른 키 — 예전 그대로 동작한다 */
      e.preventDefault(); /* keypress 가 안 생겨 버튼 click 이 일어나지 않는다 */
      e.stopImmediatePropagation();
    }
    function onUp(e) { if (e.key === key) off(); }
    function off() {
      delete swallowing[key];
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", off);
    }
    document.addEventListener("keydown", onDown, true);
    document.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", off); /* 창 밖에서 떼면 keyup 이 오지 않는다 */
  }

  // 사진 탭 → 라이트박스 (object-fit:contain) — 리본/근조 문구 확인용.
  // 접근성 다이얼로그: role/aria-modal · 닫기 버튼 · 스크롤 잠금 · 포커스 트랩 · 복귀.
  var zoom = document.getElementById("photo-zoom");
  if (zoom && img) {
    zoom.addEventListener("click", function () {
      var box = document.createElement("div");
      box.className = "lightbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", img.alt || "배송 사진");
      box.tabIndex = -1;

      var big = document.createElement("img");
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "lightbox__close";
      closeBtn.setAttribute("aria-label", "닫기");
      closeBtn.innerHTML =
        '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

      box.appendChild(big);
      box.appendChild(closeBtn);

      var prevOverflow = document.body.style.overflow;
      var closed = false;
      /* ── 창을 연 키·닫은 키의 자동 반복 버리기(앱 ui.js openLightbox 와 같은 규칙 — 위 swallowHeldRepeat 주석) ──
         확대 버튼에서 Enter 를 누른 채로 두면 반복 keydown 이 라이트박스의 유일한 초점인 닫기 버튼을 눌러 열리자마자 닫히고,
         초점이 돌아간 확대 버튼을 다음 반복이 다시 눌러 열렸다 닫혔다 했다(2026-10-19 실측: 꾹 1 닫힘 · 2 열림 · 3 닫힘 ·
         8 열림(5번 열림)). 닫기 버튼을 꾹 누르면 반대로 닫혔다 다시 열렸다. 연 뒤 그 키를 **새로 누르거나 뗄 때까지**
         라이트박스 안 반복 Enter·Space 를 버리고(`settled` — 키마다), 닫는 순간 눌린 채인 키(`down`)는 `swallowHeldRepeat` 에
         넘겨 돌아간 확대 버튼이 다시 눌리지 않게 한다. */
      var HELD = ["Enter", " "];
      var settled = {};
      var down = {};
      function onKeyUp(e) {
        if (HELD.indexOf(e.key) >= 0) { settled[e.key] = true; delete down[e.key]; }
      }
      function close() {
        if (closed) return; /* 사진 오류(error)가 닫힌 뒤에 와도 두 번 닫지 않는다 */
        closed = true;
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("keyup", onKeyUp, true);
        Object.keys(down).forEach(swallowHeldRepeat);
        document.body.style.overflow = prevOverflow;
        box.remove();
        zoom.focus();
      }
      function onKey(e) {
        if (HELD.indexOf(e.key) >= 0) {
          down[e.key] = true;
          if (!settled[e.key]) {
            if (!e.repeat) settled[e.key] = true; /* 연 뒤 새로 누른 키 — 예전 그대로(닫기) */
            else if (box.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          }
        }
        if (e.key === "Escape") close();
        else if (e.key === "Tab") {
          e.preventDefault(); // only the close button is focusable → trap
          closeBtn.focus();
        }
      }
      box.addEventListener("click", close); // backdrop / image / close button
      /* 사진 주소가 깨지면 열자마자 닫는다(broken photo URL → dismissible). 이 닫힘은 여는 키의 첫 자동 반복(보통 0.5초 뒤)보다
         먼저 와서 `down` 이 비어 있다 — 그대로 두면 Enter 를 꾹 누르는 동안 반복마다 다시 열고 닫았다(2026-10-19 실측: 꾹 8 = 9번 열림).
         그래서 이 경로만 두 키의 반복을 넘겨 버린다. 누르고 있지 않았다면 다음 키 입력(새로 누름·뗌)에 스스로 풀려 아무 일도 없다.
         (ui.js openLightbox 에는 이런 '저절로 닫힘' 경로가 없어 이 줄은 복제가 아니라 이 페이지 몫이다.) */
      big.addEventListener("error", function () {
        HELD.forEach(function (k) { down[k] = true; });
        close();
      });
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("keyup", onKeyUp, true);

      document.body.style.overflow = "hidden";
      document.body.appendChild(box);
      closeBtn.focus();
    });
  }

  // 문서 제목에 수령인 반영 (문자 목록에서 식별 용이)
  if (receiver) document.title = "배송완료 리포트 · " + receiver + " — 올해의경조사";
})();
