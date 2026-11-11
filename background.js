// background.js : 締め切りの定期チェックと警告通知（担当：ゲームの仕組み・制限警告）

importScripts("game.js"); 

// 保存のキー名
const ENEMIES_KEY = "enemies";   // 敵の一覧
const NOTIFIED_KEY = "notified"; // 通知済みの敵ID { 敵ID: true }
const ALARM_NAME = "deadline-check";

// ===== アラームの登録（1分おき） =====
async function setupAlarm() {
  const alarm = await chrome.alarms.get(ALARM_NAME);
  if (!alarm) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  setupAlarm();
  checkDeadlines();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  checkDeadlines();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkDeadlines();
});

// 敵の一覧が変わったとき（追加・撃破）にもすぐチェックする
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[ENEMIES_KEY]) checkDeadlines();
});

// ===== 締め切りのチェックと通知 =====
async function checkDeadlines() {
  const data = await chrome.storage.local.get([ENEMIES_KEY, NOTIFIED_KEY]);
  const enemies = data[ENEMIES_KEY] ?? [];
  const notified = data[NOTIFIED_KEY] ?? {};
  const now = new Date();
  let rampageCount = 0;

  for (const enemy of enemies) {
    // 暴走中（残り24時間未満・未撃破）の敵だけが対象
    if (getEnemyState(enemy, now) !== "rampage") continue;
    rampageCount++;

    // 同じ敵の通知は1回だけ
    if (notified[enemy.id]) continue;

    chrome.notifications.create(enemy.id, {
      type: "basic",
      iconUrl: "images/icon.png",
      title: "⚠ 敵が暴走中！",
      message: `「${enemy.title}」の締め切りまで24時間を切りました`,
    });
    notified[enemy.id] = true;
  }

  await chrome.storage.local.set({ [NOTIFIED_KEY]: notified });

  // アイコンに、暴走中の敵の数を表示する
  chrome.action.setBadgeText({ text: rampageCount > 0 ? String(rampageCount) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
}
