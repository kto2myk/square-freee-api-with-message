/**
 * 店舗別に一括損益計算を行う本番関数（現在時刻使用）
 */
function main() {
  const baseDateUTC = new Date(); // 現在のUTC時刻を取得
  const jstHour = (baseDateUTC.getUTCHours() + 9) % 24;

  //実行時刻の追加
  if (![10,11,12].includes(jstHour)) {
    Logger.log(`スキップ ▶ JST${jstHour}:00 は対象時間外です`);
    return;
  }
  let finalMsg = ""
  
  Object.entries(StoreSettings).forEach(([storeName, store], index) => {
  
    Logger.log(`集計開始 ▶ ${storeName}`);

    const nowUTC = new Date( baseDateUTC.getTime() )

    // 売上取得・集計
    const { orders = [] } = getSalesForCurrentContext(store.locationId, store.squareToken, nowUTC, jstHour) || {};
    const result = calculateSales(orders,store.squareToken);

    if (!result || typeof result.totalSales !== "number" || typeof result.totalBack !== "number") {
      Logger.log(` [${storeName}] 売上データが不正: ${JSON.stringify(result)}`);
      return;
    }

    const { totalSales, totalBack, totalTax } = result;

    //  人件費計算（メッセージ＋合計）
    const { total: laborCost } = calculateAllEmployeeWages(
      store.companyId,
      nowUTC,
      storeName
    );

    // 📊 利益メッセージ生成
    finalMsg += profitManager(
      storeName,
      totalSales,
      laborCost,
      totalBack,
      store.fixedCost,
      nowUTC,
      jstHour,
      index,
      totalTax
    );
    // スプレッドシート作成
    // if(jstHour === 10){
    //   const row = buildProfitRow(nowUTC, storeName, totalSales, laborCost, store.fixedCost,totalBack)
    //   writeProfitRow(row)
    // }
    Logger.log("✅ 完成メッセージ:\n" + finalMsg);
  });
  sendLineMessageToAllUsers(finalMsg, lineToken)
}


