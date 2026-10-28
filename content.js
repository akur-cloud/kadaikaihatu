// content.js : 特定サイトの使用制限（担当：ゲームの仕組み・制限警告）
// manifest.json の content_scripts で、対象サイトを開いたときに game.js とともに読み込まれる。
// 読むのは拡張機能の保存データ（敵の一覧）だけで、サイトのページの内容は読まない。

// ===== 設定（ここを変えれば挙動を調整できます） =====
const ENEMIES_KEY = "enemies";        // 保存のキー名（background.js とそろえる）
const CLOSE_DELAY_SECONDS = 5;        // 閉じるボタンが使えるようになるまでの秒数（閉じられなくするなら大きくする）
const PAUSE_MEDIA = true;             // 警告を出したとき、動画や音声を一時停止するか
const CHECK_INTERVAL_MS = 60 * 1000;  // 開きっぱなしのページを、再チェックする間隔

let host = null;          // 画面に付ける警告の要素
let listEl = null;        // 警告の中の、課題の一覧を入れる場所
let closeBtn = null;      // 閉じるボタン
let countdownTimer = null;
let dismissed = false;    // このページで「閉じる」を押したか

// 締め切り24時間未満（暴走中）の敵を、期限が近い順に返す
async function getUrgentEnemies() {
  const data = await chrome.storage.local.get(ENEMIES_KEY);
  const enemies = data[ENEMIES_KEY] ?? [];
  const now = new Date();
  return enemies
    .filter((e) => getEnemyState(e, now) === "rampage")
    .sort((a, b) => new Date(a.due) - new Date(b.due));
}

// 残り時間を「あと3時間20分」の形にする
function formatTimeLeft(due) {
  const totalMin = Math.max(0, Math.floor((new Date(due) - new Date()) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `あと${h}時間${m}分` : `あと${m}分`;
}

// ===== 警告の画面を作る（Shadow DOMで、サイト側のCSSの影響を受けないようにする） =====
function createOverlay() {
  host = document.createElement("div");
  host.id = "kadai-rpg-overlay";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .wrap {
        position: fixed; inset: 0; z-index: 2147483647;
        background: rgba(30, 0, 0, 0.93); color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-family: sans-serif; text-align: center;
      }
      .box { max-width: 480px; padding: 24px; }
      h1 { font-size: 28px; margin: 0 0 12px; }
      p { margin: 0 0 12px; font-size: 16px; }
      ul { list-style: none; padding: 0; margin: 0 0 20px; }
      li { background: rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }
      .time { color: #ffb4a8; font-size: 14px; }
      button { font-size: 16px; padding: 8px 20px; border-radius: 6px; border: none; cursor: pointer; }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
    <div class="wrap">
      <div class="box" role="dialog" aria-modal="true">
        <h1>⚠ 敵が暴走中！</h1>
        <p>課題の締め切りまで24時間を切っています。<br>先に課題を提出して、敵を倒しましょう。</p>
        <ul id="list"></ul>
        <button id="close"></button>
      </div>
    </div>`;
  listEl = root.getElementById("list");
  closeBtn = root.getElementById("close");
  closeBtn.addEventListener("click", () => {
    dismissed = true;      // このページを開き直すまで、再表示しない
    hideOverlay();
  });
}

// 課題の一覧を書き換える（課題名は textContent で入れ、HTMLとして解釈されないようにする）
function fillList(urgent) {
  listEl.textContent = "";
  for (const e of urgent) {
    const li = document.createElement("li");
    li.textContent = `${e.enemyIcon ?? ""} ${e.enemyName ?? ""}「${e.title}」`;
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = formatTimeLeft(e.due);
    li.appendChild(time);
    listEl.appendChild(li);
  }
}

// 閉じるボタンを、数秒後に使えるようにする
function startCloseCountdown() {
  clearInterval(countdownTimer);
  let left = CLOSE_DELAY_SECONDS;
  closeBtn.disabled = left > 0;
  closeBtn.textContent = left > 0 ? `あと${left}秒で閉じられます` : "閉じる";
  if (left <= 0) return;
  countdownTimer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(countdownTimer);
      closeBtn.disabled = false;
      closeBtn.textContent = "閉じる";
    } else {
      closeBtn.textContent = `あと${left}秒で閉じられます`;
    }
  }, 1000);
}

function pauseMedia() {
  document.querySelectorAll("video, audio").forEach((m) => {
    try { m.pause(); } catch (e) { /* 一時停止できなくても続行 */ }
  });
}

function showOverlay(urgent) {
  if (!host) createOverlay();
  fillList(urgent);
  if (!host.isConnected) {
    document.documentElement.appendChild(host);
    startCloseCountdown();
    if (PAUSE_MEDIA) pauseMedia();
  }
}

function hideOverlay() {
  clearInterval(countdownTimer);
  if (host && host.isConnected) host.remove();
}

// ===== 表示するかどうかを判断する =====
async function update() {
  try {
    const urgent = await getUrgentEnemies();
    if (urgent.length === 0) {
      hideOverlay();
      dismissed = false;   // 暴走中の敵がいなくなったら、次回また表示できるようにする
      return;
    }
    if (dismissed) return;
    showOverlay(urgent);
  } catch (e) {
    // 拡張機能を再読み込みした直後の古いページでは、通信エラーになる。ページを再読み込みすれば直る。
    clearInterval(checkTimer);
  }
}

// 敵が追加・撃破されたときにすぐ反映する
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[ENEMIES_KEY]) update();
});

// 開きっぱなしのページでも、時間が経って暴走状態になったら表示する
const checkTimer = setInterval(update, CHECK_INTERVAL_MS);

update();