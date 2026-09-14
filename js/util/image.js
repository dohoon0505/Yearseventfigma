/* ============================================================
   image.js — 첨부 이미지 축소(순수 브라우저).

   사업자등록증처럼 **localStorage 에 함께 저장되는** 첨부는 원본을 그대로
   넣으면 용량 한도(5MB 안팎)를 금방 넘겨 store 전체가 저장되지 않는다.
   긴 변 기준으로 줄이고 JPEG 로 다시 굽는다.

   PDF 등 이미지가 아닌 파일은 축소 대상이 아니므로 dataUrl 없이 이름·용량만
   돌려준다 — 호출부는 미리보기를 생략하고 파일명만 보여준다.
   실서비스에서는 파일을 서버에 올리고 URL 만 저장해야 한다.
   ============================================================ */

/** 이미지면 축소한 dataUrl 을, 아니면 null 을 준다. */
function shrink(file, maxSide, quality) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onerror = () => resolve(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(cv.toDataURL("image/jpeg", quality)); }
        catch { resolve(null); } // 드물게 보안 예외
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}

/**
 * 첨부 파일 → 저장 가능한 레코드.
 * @returns {Promise<{name:string, size:number, type:string, dataUrl:string}>}
 *   dataUrl 이 빈 문자열이면 미리보기가 없는 첨부(PDF·축소 실패)다.
 */
export async function attachmentOf(file, { maxSide = 1000, quality = 0.7 } = {}) {
  const base = { name: file.name, size: file.size, type: file.type, dataUrl: "" };
  if (!String(file.type).startsWith("image/")) return base;
  const url = await shrink(file, maxSide, quality);
  return url ? { ...base, dataUrl: url } : base;
}

/** "243KB" · "1.4MB" */
export const fileSizeLabel = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
