// debug.js : 動作確認用の簡易画面（本番のUIは担当Aのpopup.js）
const ENEMIES_KEY = "enemies";
const NOTIFIED_KEY = "notified";
const PLAYER_KEY = "player";

const STATE_LABEL = {
  normal: "通常", angry: "怒り", rampage: "暴走（警告中）",
  expired: "期限切れ", nodue: "期限なし", defeated: "撃破済み",
};

// 期限を「2026/11/20 23:59」の形で表示する
function formatDue(due) {
  if (!due) return "期限なし";
  const d = new Date(due);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

async function loadAll() {
  const d = await chrome.storage.local.get([ENEMIES_KEY, PLAYER_KEY]);
  return { enemies: d[ENEMIES_KEY] ?? [], player: d[PLAYER_KEY] ?? { totalExp: 0 } };
}

async function render() {
  const { enemies, player } = await loadAll();
  const info = getLevelInfo(player.totalExp);
  document.getElementById("player").textContent =
    `Lv.${info.level}　経験値 ${info.expIntoLevel} / ${info.expToNext}`;

  const list = document.getElementById("list");
  list.textContent = "";
  const now = new Date();
  for (const e of enemies) {
    const state = getEnemyState(e, now);
    const li = document.createElement("li");
    li.className = state;

    const title = document.createElement("div");
    title.textContent = `${e.enemyIcon} ${e.enemyName}：${e.title}`;
    li.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "state";
    const days = getDaysLeft(e.due, now);
    sub.textContent = `${STATE_LABEL[state]}` +
      (days !== null && !e.defeated ? `（あと${days}日）` : "") +
      (e.defeated ? `（+${e.gainedExp}exp）` : "") +
      ` ／ 期限 ${formatDue(e.due)}`;
    li.appendChild(sub);

    if (!e.defeated) {
      const btn = document.createElement("button");
      btn.textContent = "撃破（提出）";
      btn.addEventListener("click", () => defeat(e.id));
      li.appendChild(btn);
    }
    const del = document.createElement("button");
    del.textContent = "削除";
    del.addEventListener("click", () => removeEnemy(e.id));
    li.appendChild(del);
    list.appendChild(li);
  }
}

async function addEnemy(title, hoursFromNow) {
  const { enemies } = await loadAll();
  const due = hoursFromNow === null
    ? null
    : new Date(Date.now() + hoursFromNow * 3600 * 1000).toISOString();
  enemies.push(createEnemy(title + (enemies.length + 1), due));
  await chrome.storage.local.set({ [ENEMIES_KEY]: enemies });
  render();
}

async function defeat(id) {
  const { enemies, player } = await loadAll();
  const idx = enemies.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const result = defeatEnemy(enemies[idx], player, "test.pdf");
  enemies[idx] = result.enemy;
  await chrome.storage.local.set({ [ENEMIES_KEY]: enemies, [PLAYER_KEY]: result.player });
  render();
}

// テスト用ボタンが画面になくても、下のフォームの処理が止まらないよう ?. を付けている
document.getElementById("add-5h")?.addEventListener("click", () => addEnemy("テスト課題", 5));
document.getElementById("add-2d")?.addEventListener("click", () => addEnemy("テスト課題", 48));
document.getElementById("add-none")?.addEventListener("click", () => addEnemy("期限なし課題", null));
document.getElementById("add-past")?.addEventListener("click", () => addEnemy("期限切れ課題", -3));
document.getElementById("reset")?.addEventListener("click", async () => {
  await chrome.storage.local.remove([ENEMIES_KEY, NOTIFIED_KEY, PLAYER_KEY]);
  chrome.action.setBadgeText({ text: "" });
  render();
});

// ===== 課題の入力フォーム =====
const addForm = document.getElementById("add-form");
const titleInput = document.getElementById("title-input");
const dueInput = document.getElementById("due-input");
const noDueCheck = document.getElementById("nodue-check");
const formMessage = document.getElementById("form-message");

function showMessage(text, isError) {
  formMessage.textContent = text;
  formMessage.className = isError ? "message error" : "message";
}

// 「期限なし」にチェックしたら、期限の入力欄を使えなくする
noDueCheck.addEventListener("change", () => {
  dueInput.disabled = noDueCheck.checked;
  if (noDueCheck.checked) dueInput.value = "";
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // ページが再読み込みされないようにする

  const title = titleInput.value.trim();
  if (!title) {
    showMessage("課題名を入力してください", true);
    return;
  }

  let due = null;
  if (!noDueCheck.checked) {
    if (!dueInput.value) {
      showMessage("提出期限を入力するか、「期限なし」にチェックしてください", true);
      return;
    }
    const date = new Date(dueInput.value); // 入力は端末の時刻（日本時間）として扱われる
    if (isNaN(date.getTime())) {
      showMessage("提出期限の形式が正しくありません", true);
      return;
    }
    due = date.toISOString();
  }

  const { enemies } = await loadAll();
  enemies.push(createEnemy(title, due));
  await chrome.storage.local.set({ [ENEMIES_KEY]: enemies });

  addForm.reset();
  dueInput.disabled = false;
  showMessage(`「${title}」の敵を呼び出しました`, false);
  render();
});

// ===== 敵の削除（入力ミスの修正用） =====
async function removeEnemy(id) {
  const { enemies } = await loadAll();
  await chrome.storage.local.set({ [ENEMIES_KEY]: enemies.filter((e) => e.id !== id) });
  render();
}

render();

// ポップアップを開いたまま表示が古くならないように自動更新する
chrome.storage.onChanged.addListener(() => render());
setInterval(render, 60 * 1000); // 1分ごと（残り日数の更新用）