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
      function close() {
        document.removeEventListener("keydown", onKey, true);
        document.body.style.overflow = prevOverflow;
        box.remove();
        zoom.focus();
      }
      function onKey(e) {
        if (e.key === "Escape") close();
        else if (e.key === "Tab") {
          e.preventDefault(); // only the close button is focusable → trap
          closeBtn.focus();
        }
      }
      box.addEventListener("click", close); // backdrop / image / close button
      big.addEventListener("error", close); // broken photo URL → dismissible
      document.addEventListener("keydown", onKey, true);

      document.body.style.overflow = "hidden";
      document.body.appendChild(box);
      closeBtn.focus();
    });
  }

  // 문서 제목에 수령인 반영 (문자 목록에서 식별 용이)
  if (receiver) document.title = "배송완료 리포트 · " + receiver + " — 올해의경조사";
})();
