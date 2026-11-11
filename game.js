// ゲームの仕組み

// ===== ルール設定 =====
const BASE_EXP = 10;          // 基本の経験値
const BONUS_PER_DAY = 5;      // 期限より1日早く出すごとに増える経験値
const MAX_BONUS_DAYS = 7;     // ボーナスの対象になる最大日数（7日前まで）
const LEVEL_BASE_EXP = 50;    // レベルnからn+1に必要な経験値 = 50 * n

const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_NAME_LENGTH = 30;  // 敵の名前の最大文字数

// 敵の種類（作成時にランダムで1つ決めて、敵のデータに保存する）
const ENEMY_TYPES = [
  { type: "slime",  icon: "🟢", names: ["スライム", "ぷるぷるスライム", "おこりんぼスライム"] },
  { type: "goblin", icon: "👺", names: ["ゴブリン", "いたずらゴブリン", "さぼりゴブリン"] },
  { type: "ghost",  icon: "👻", names: ["ゴースト", "締め切りゴースト", "ふわふわゴースト"] },
  { type: "dragon", icon: "🐉", names: ["ベビードラゴン", "ねぼすけドラゴン", "ひのこドラゴン"] },
];

// ===== 敵の生成 =====
// title: 課題名 / due: 提出期限（日本時間のISO文字列。なければ null）
// name: 敵の名前（担当教員名など。省略または空ならランダムな名前になる）
// now, rng は動作確認用（普段は指定しなくてよい）
function createEnemy(title, due, name = null, now = new Date(), rng = Math.random) {
  const kind = ENEMY_TYPES[Math.floor(rng() * ENEMY_TYPES.length)];
  const randomName = kind.names[Math.floor(rng() * kind.names.length)];
  const inputName = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
  return {
    id: "enemy_" + now.getTime() + "_" + Math.floor(rng() * 1e6).toString(36),
    title: title,
    due: due ?? null,
    enemyType: kind.type,
    enemyIcon: kind.icon,
    enemyName: inputName || randomName, // 入力があればそれを、なければランダムな名前を使う
    defeated: false,
    defeatedAt: null,
    submittedFileName: null,
    gainedExp: 0,
    createdAt: now.toISOString(),
  };
}

// ===== 残り日数・敵の状態（保存せず、毎回計算する） =====
function getDaysLeft(due, now = new Date()) {
  if (!due) return null;
  return Math.ceil((new Date(due) - now) / DAY_MS) + 0; // +0 は -0 を 0 にするため
}

// 戻り値: "defeated" / "nodue" / "expired" / "rampage" / "angry" / "normal"
function getEnemyState(enemy, now = new Date()) {
  if (enemy.defeated) return "defeated";
  if (!enemy.due) return "nodue";
  const msLeft = new Date(enemy.due) - now;
  if (msLeft < 0) return "expired";
  if (msLeft < DAY_MS) return "rampage";       // 24時間未満（警告・制限の対象）
  if (msLeft < DAY_MS * 3) return "angry";     // 3日未満
  return "normal";
}

// ===== 経験値 =====
// 早く出すほど多い。期限切れは0。期限なしは基本値のみ。
function calcExp(enemy, now = new Date()) {
  if (!enemy.due) return BASE_EXP;
  const msLeft = new Date(enemy.due) - now;
  if (msLeft < 0) return 0;
  const daysEarly = Math.min(Math.floor(msLeft / DAY_MS), MAX_BONUS_DAYS);
  return BASE_EXP + daysEarly * BONUS_PER_DAY;
}

// ===== レベル（だんだん必要量が増える） =====
function expToNextLevel(level) {
  return LEVEL_BASE_EXP * level;
}

function getLevelInfo(totalExp) {
  let level = 1;
  let rest = totalExp;
  while (rest >= expToNextLevel(level)) {
    rest -= expToNextLevel(level);
    level++;
  }
  return { level: level, expIntoLevel: rest, expToNext: expToNextLevel(level) };
}

// ===== 撃破 =====
// ファイル1つで倒せる。元のデータは書き換えず、新しい敵とプレイヤーを返す。
// player: { totalExp: 数値 }
function defeatEnemy(enemy, player, fileName, now = new Date()) {
  if (enemy.defeated) {
    return { enemy, player, gainedExp: 0, leveledUp: false, alreadyDefeated: true };
  }
  const gainedExp = calcExp(enemy, now);
  const before = getLevelInfo(player.totalExp).level;
  const newPlayer = { ...player, totalExp: player.totalExp + gainedExp };
  const after = getLevelInfo(newPlayer.totalExp).level;
  const newEnemy = {
    ...enemy,
    defeated: true,
    defeatedAt: now.toISOString(),
    submittedFileName: fileName ?? null,
    gainedExp: gainedExp,
  };
  return {
    enemy: newEnemy,
    player: newPlayer,
    gainedExp: gainedExp,
    leveledUp: after > before,
    alreadyDefeated: false,
  };
}

// ===== 表示用の仕分け（期限なしは別枠） =====
function groupEnemies(enemies) {
  const active = enemies.filter((e) => !e.defeated);
  return {
    withDue: active.filter((e) => e.due).sort((a, b) => new Date(a.due) - new Date(b.due)),
    noDue: active.filter((e) => !e.due),
    defeated: enemies.filter((e) => e.defeated),
  };
}

// Node.js での動作確認用（拡張機能では無視されます）
if (typeof module !== "undefined") {
  module.exports = {
    createEnemy, getDaysLeft, getEnemyState, calcExp,
    expToNextLevel, getLevelInfo, defeatEnemy, groupEnemies,
  };
}
