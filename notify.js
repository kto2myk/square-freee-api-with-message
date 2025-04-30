/**
 * LINE Messaging API & Slack 通知スクリプト
 */


/**
 * LINE & Slack に売上 & 勤怠データを送信
 */

/**
 * プロパティに保存されているLINEユーザーID全員にメッセージを送信
 *
 * @param {string} message - 送信するテキストメッセージ
 * @param {string} channelAccessToken - LINEのチャネルアクセストークン
 */
function sendLineMessageToAllUsers(message, channelAccessToken) {
  const props = PropertiesService.getScriptProperties();
  const userIds = JSON.parse(props.getProperty("LINE_USER_GROUP_IDS") || "[]");

  if (userIds.length === 0) {
    Logger.log(" 登録されているユーザーIDがありません");
    return;
  }

  const url = "https://api.line.me/v2/bot/message/push";

  for (const userId of userIds) {
    const payload = JSON.stringify({
      to: userId,
      messages: [
        {
          type: "text",
          text: message
        }
      ]
    });

    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: `Bearer ${channelAccessToken}`
      },
      payload: payload,
      muteHttpExceptions: true
    };

    try {
      const res = UrlFetchApp.fetch(url, options);
      Logger.log(`✅ ${userId} に送信成功: ${res.getResponseCode()}`);
    } catch (e) {
      Logger.log(`❌ ${userId} に送信失敗: ${e.message}`);
    }
  }
}


/**
 * Slackにメッセージを送信する関数（chat.postMessage API）
 *
 * @param {string} message - 送信するテキストメッセージ
 * @param {string} token - Slack BotのOAuthアクセストークン（"xoxb-..." で始まる）
 * @param {string} channelId - 送信先のチャネルID（例: C1234567890）
 */
function sendSlackMessage(message, token, channelId) {
  const url = "https://slack.com/api/chat.postMessage";
  const payload = {
    channel: channelId,
    text: message
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": `Bearer ${token}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const res = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(res.getContentText());

    if (!json.ok) {
      Logger.log(` Slack送信失敗: ${json.error}`);
    } else {
      Logger.log(` Slack送信成功 ▶ チャンネル: ${channelId}`);
    }
  } catch (e) {
    Logger.log(` Slack通知エラー: ${e.message}`);
  }
}


function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(" No content received");
    }

    const contents = JSON.parse(e.postData.contents);

    // 🔹 userId と groupId を抽出（複数イベント対応）
    const events = contents.events || [];
    const newUserIds = events
      .map(e => e.source?.userId)
      .filter(id => !!id); // null/undefined 除去
    const newGroupIds = events
      .map(e => e.source?.groupId)
      .filter(id => !!id); // null/undefined 除去

    const idKey = 'LINE_USER_GROUP_IDS';
    const props = PropertiesService.getScriptProperties();
    const stored = JSON.parse(props.getProperty(idKey) || '[]');

    // 🔹 ユニークな userId と groupId を追加
    const updated = [
      ...new Set([...stored, ...newUserIds, ...newGroupIds])
    ];
    props.setProperty(idKey, JSON.stringify(updated));

    return ContentService.createTextOutput(" userId/groupId saved: " + JSON.stringify({ userIds: newUserIds, groupIds: newGroupIds }));

  } catch (err) {
    return ContentService.createTextOutput(" Error: " + err.message);
  }
}

function showUserIds() {
  const ids = JSON.parse(PropertiesService.getScriptProperties().getProperty('LINE_USER_GROUP_IDS') || '[]');
  Logger.log(" Stored userIds and groupIds:");
  Logger.log(JSON.stringify(ids, null, 2));
}

function clearUserIds() {
  PropertiesService.getScriptProperties().deleteProperty('LINE_USER_GROUP_IDS');
}

