/**
 * Squareの現在文脈における売上を取得（1時間 or 集計モード）
 *
 * @param {string} locationId - Squareの店舗ID
 * @param {Date} nowUTC - 現在のUTC時刻（Main関数で取得＆使い回す）
 * @returns {{ orders: Array }} - 取得された注文オブジェクト
 */
function getSalesForCurrentContext(locationId, squareToken, nowUTC = new Date(), jstHour) {

  let startUTC, endUTC;
  Logger.log(" JST時間帯: " + jstHour);

  if (jstHour === 10) {
    // JST 10時は一括集計：JST20:00〜翌3:00（＝UTC11:00〜18:00）
    const baseDate = new Date(Date.UTC(
      nowUTC.getUTCFullYear(),
      nowUTC.getUTCMonth(),
      nowUTC.getUTCDate() - 1
    ));
    startUTC = getStartUTCFromJST20(nowUTC); // 前日20:00（JST）
    endUTC = new Date(baseDate.getTime() + 19 * 60 * 60 * 1000);   // 当日03:00（JST）

    console.log(" 一括集計モード（10時）:", startUTC.toISOString(), "〜", endUTC.toISOString());
  } else {
    // 通常：JST20:00〜現在時刻まで
    startUTC = getStartUTCFromJST20(nowUTC);
    endUTC = nowUTC;

    console.log(` 通常売上取得（UTC）: ${startUTC.toISOString()} 〜 ${endUTC.toISOString()}`);
    console.log(` 通常売上取得（JST）: ${startUTC.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 〜 ${endUTC.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
  }

  const { orders = [] } = fetchSquareOrders(locationId, squareToken, startUTC.toISOString(), endUTC.toISOString());
  return { orders };
}


function fetchSquareOrders(locationId, squareToken, startUTC, endUTC) {
  const url = "https://connect.squareup.com/v2/orders/search";
  const payload = {
    location_ids: [locationId],
    query: {
      filter: {
        date_time_filter: {
          created_at: {
            start_at: startUTC,
            end_at: endUTC
          }
        }
      },
      sort: {
        sort_field: "CREATED_AT",
        sort_order: "DESC"
      }
    },
    limit: 100
  };

  const options = {
    method: "post",
    headers: {
      Authorization: `Bearer ${squareToken}`,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    console.log(` 注文取得: ${result.orders?.length || 0}件`);
    return result;
  } catch (e) {
    console.error(" Square API失敗:", e);
    return { orders: [] };
  }
}
