/* =====================================================================
   image-prep.js — AIに送るレシート画像を「軽く・くっきり」する
   ---------------------------------------------------------------------
   文字の読みやすさは保ったまま、送るデータを小さくして速くする。
     1. レシート（白い紙）の部分だけを自動で切り抜く（背景のテーブル等を捨てる）
     2. 白黒（グレー）にする … 色の情報がなくなり、JPEGが大幅に小さくなる
     3. コントラストを上げる … 薄い文字・感熱紙のかすれもくっきり
     4. 必要な大きさまで縮小して JPEG にする
   画像はメモリ上だけで処理し、どこにも保存しない。
   使い方：const blob = await ImagePrep.receiptJpeg(video, crop, ImagePrep.FAST);
   ===================================================================== */
"use strict";

const ImagePrep = (() => {
  /* ---- 画質のプリセット ----
     maxShort : 短い辺（レシートの横幅）の上限px。文字の大きさに一番効く
     maxLong  : 長い辺（レシートの縦）の上限px
     q        : JPEG画質（0〜1）。白黒なので低めでも文字は崩れにくい
     cut      : レシート部分を自動で切り抜くか */
  const FAST   = { maxShort: 800,  maxLong: 1600, q: 0.7,  cut: true  };  // 1回目：速さ重視
  const SHARP  = { maxShort: 1200, maxLong: 2400, q: 0.85, cut: false }; // 2回目以降：確実さ重視（切り抜きミスも防ぐ）

  /* ---- 1. レシート（明るい紙）の範囲を探す ----
     小さく縮めた画像で「明るい点」が多い行・列を数え、その範囲を紙とみなす。
     見つからない・小さすぎる時は null（＝切り抜かない） */
  function findPaper(src, crop) {
    const W = 160, H = Math.max(1, Math.round(W * crop.h / crop.w));    // 判定用の小さな画像
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    c.width = c.height = 0;

    /* 全体の明るさの上位側を「紙の白」とみなすしきい値を決める */
    const lum = new Uint8Array(W * H);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
      lum[j] = y; hist[y]++;
    }
    let acc = 0, th = 200;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > W * H * 0.25) { th = Math.max(120, v - 25); break; } }

    /* 行ごと・列ごとに「白い点の割合」を数える */
    const rowOk = y => { let n = 0; for (let x = 0; x < W; x++) if (lum[y * W + x] >= th) n++; return n > W * 0.25; };
    const colOk = x => { let n = 0; for (let y = 0; y < H; y++) if (lum[y * W + x] >= th) n++; return n > H * 0.25; };
    let top = 0, bot = H - 1, left = 0, right = W - 1;
    while (top < bot && !rowOk(top)) top++;
    while (bot > top && !rowOk(bot)) bot--;
    while (left < right && !colOk(left)) left++;
    while (right > left && !colOk(right)) right--;

    /* 小さすぎる＝うまく見つからなかったので切り抜かない */
    const area = (right - left + 1) * (bot - top + 1);
    if (area < W * H * 0.2) return null;

    /* 文字が端で切れないように少し余白（4%）をつけて、元の座標に戻す */
    const m = 0.04, sx = crop.w / W, sy = crop.h / H;
    const x0 = Math.max(0, (left - W * m) * sx), y0 = Math.max(0, (top - H * m) * sy);
    const x1 = Math.min(crop.w, (right + 1 + W * m) * sx), y1 = Math.min(crop.h, (bot + 1 + H * m) * sy);
    return { x: crop.x + x0, y: crop.y + y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ---- 2〜3. 白黒にしてコントラストを上げる（canvasの中身を直接書き換え） ---- */
  function grayContrast(g, w, h) {
    const d = g.getImageData(0, 0, w, h), p = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) {
      const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0;
      p[i] = y; hist[y]++;
    }
    /* 暗い側2%を真っ黒、明るい側10%を真っ白に引き伸ばす（文字はくっきり、紙は白く） */
    const n = w * h; let lo = 0, hi = 255, acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.10) { hi = i; break; } }
    const r = Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) {
      let v = (p[i] - lo) * 255 / r; v = v < 0 ? 0 : v > 255 ? 255 : v;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
  }

  /* ---- まとめ：AI用のJPEG（Blob）を作る ---- */
  async function receiptJpeg(src, crop, opt) {
    opt = opt || FAST;
    const area = (opt.cut && findPaper(src, crop)) || crop;              // 1. 切り抜き
    const short = Math.min(area.w, area.h), long = Math.max(area.w, area.h);
    const s = Math.min(1, opt.maxShort / short, opt.maxLong / long);     // 4. 縮小率
    const w = Math.max(1, Math.round(area.w * s)), h = Math.max(1, Math.round(area.h * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingQuality = "high";
    g.drawImage(src, area.x, area.y, area.w, area.h, 0, 0, w, h);
    grayContrast(g, w, h);                                               // 2〜3. 白黒＋くっきり
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", opt.q));
    c.width = c.height = 0;                                              // メモリを開放
    return blob;
  }

  return { receiptJpeg, findPaper, FAST, SHARP };
})();
