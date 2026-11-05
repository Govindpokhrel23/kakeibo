/* =====================================================================
   scan-log.js — レシート読み取りの「エラー記録」と「強制終了の検知」
   ---------------------------------------------------------------------
   ・AI読み取りが失敗した理由（エラーの種類・HTTPコード・モデル名・かかった秒数）を
     iPhoneの中（localStorage）に最新30件だけ保存する。外部には送らない。
   ・読み取り中にアプリが落ちて最初の画面に戻った場合（メモリ不足など）も、
     次に起動したときに検知して記録する。
   ・設定 →「読み取りエラーの記録」から一覧を見られる。
   index.html より先に読み込むこと（グローバル変数 ScanLog を作る）。
   ===================================================================== */
"use strict";

const ScanLog = (() => {
  /* ---- 保存に使うキー名 ---- */
  const LOG_KEY = "kb_scanlog";     // エラー記録の配列（JSON）
  const BUSY_KEY = "kb_scan_busy";  // 「今AIで読み取り中」の目印（落ちたかどうかの判定用）
  const MAX = 30;                   // 残す件数の上限

  /* ---- localStorage の読み書き（プライベートモード等で例外が出ても止めない） ---- */
  function load() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, MAX))); }
    catch (e) { /* 保存できなくてもアプリは動かす */ }
  }

  /* ---- 1件追加する
     rec = { code, status, model, detail, ms }
       code   : エラーの種類（quota / timeout / net / key / model / parse / crash など）
       status : HTTPステータス（429など。ない時は0）
       model  : 使ったGeminiのモデル名
       detail : Googleから返ってきたエラー文の先頭（APIキーは含まれない）
       ms     : 送ってから失敗するまでの時間（ミリ秒） ---- */
  function add(rec) {
    const item = {
      at: Date.now(),
      code: String(rec.code || "fail"),
      status: +rec.status || 0,
      model: String(rec.model || ""),
      detail: String(rec.detail || "").slice(0, 160),
      ms: Math.round(+rec.ms || 0),
    };
    save([item, ...load()]);
    return item;
  }

  /* ---- 強制終了の検知
     AIに送る直前に begin()、結果が返ったら end()。
     begin したまま end されずに次の起動を迎えたら「読み取り中に落ちた」と判断する。 ---- */
  function begin(info) {
    try { localStorage.setItem(BUSY_KEY, JSON.stringify({ at: Date.now(), ...info })); } catch (e) {}
  }
  function end() {
    try { localStorage.removeItem(BUSY_KEY); } catch (e) {}
  }
  /* 起動時に1回呼ぶ。前回落ちていたら記録して true を返す */
  function checkCrash() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(BUSY_KEY) || "null"); } catch (e) {}
    end();
    if (!b) return false;
    add({ code: "crash", model: b.model, detail: "読み取り中にアプリが再起動しました", ms: 0 });
    return true;
  }

  /* ---- エラーの種類 → 日本語の説明（記録一覧に表示する） ---- */
  const REASON = {
    quota:   "無料枠の上限（短時間に送りすぎ）",
    timeout: "時間切れ（AIの返事が遅すぎた）",
    net:     "通信エラー（電波が弱い・オフライン）",
    key:     "APIキーが正しくない",
    model:   "モデルが使えない（名前の変更など）",
    parse:   "AIの返事が読み取れない形だった",
    busy:    "Google側が混雑中",
    crash:   "アプリが強制終了（メモリ不足の可能性）",
    hidden:  "読み取り中に画面を閉じた・ロックした",
    fail:    "その他のエラー",
  };
  const reason = code => REASON[code] || REASON.fail;

  function clear() { save([]); }

  return { add, load, clear, begin, end, checkCrash, reason };
})();
