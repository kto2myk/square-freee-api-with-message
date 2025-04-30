/**
 * Freee API GASユーティリティ - トークン管理・通信処理
 */

/** トークン保存 */
function setFreeeTokens(accessToken, refreshToken) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(`FREEE_ACCESS_TOKEN`, accessToken);
  props.setProperty(`FREEE_REFRESH_TOKEN`, refreshToken);
}

/** トークン取得 */
function getFreeeTokens() {
  const props = PropertiesService.getScriptProperties();
  return {
    accessToken: props.getProperty(`FREEE_ACCESS_TOKEN`),
    refreshToken: props.getProperty(`FREEE_REFRESH_TOKEN`)
  };
}

/** トークン表示（開発用） */
function showFreeeTokens() {
  const tokens = getFreeeTokens();
  Logger.log(`Access Token: ${tokens.accessToken}`);
  Logger.log(`Refresh Token: ${tokens.refreshToken}`);
}


/**
 * Freeeのアクセストークンをリフレッシュ（期限切れ時に使用）
 * @param {string} storeName - 店舗名（StoreSettingsキー）
 * @returns {string} 新しいアクセストークン
 * @throws エラーが発生した場合は例外をスロー
 */
function refreshFreeeAccessToken(storeName) {
  const store = StoreSettings[storeName]; // 店舗ごとの設定を取得
  const { refreshToken } = getFreeeTokens(); // 保存されたリフレッシュトークンを取得
  if (!refreshToken) {
    throw new Error("リフレッシュトークンが存在しません。");
  }

  // Freeeのトークンリフレッシュ用エンドポイント
  const url = "https://accounts.secure.freee.co.jp/public_api/token";

  // リフレッシュ用のパラメータ
  const payload = {
    grant_type: "refresh_token",
    client_id: store.clientId,
    client_secret: store.clientSecret,
    refresh_token: refreshToken
  };

  // リクエストオプション（Content-Typeはx-www-form-urlencoded）
  const options = {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload
  };

  // APIリクエスト実行
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());

  // アクセストークン・リフレッシュトークンの更新が成功した場合
  if (data.access_token && data.refresh_token) {
    setFreeeTokens(data.access_token, data.refresh_token); // 新しいトークンを保存
    Logger.log("トークンを更新しました");
    return data.access_token;
  } else {
    // 失敗時はレスポンス内容をログに出して例外をスロー
    throw new Error("トークン更新失敗: " + response.getContentText());
  }
}


// =====================
// APIリクエスト（トークン自動更新付き）
// =====================

/**
 * 認証付きfetch（失敗時に自動リフレッシュ）
 * @param {string} url
 * @param {Object} options
 * @param {boolean} retrying - 再実行中かどうか
 * @returns {HTTPResponse}
 */
function fetchWithFreeeAuth(url, storeName, options = {}, retrying = false) {
  const { accessToken } = getFreeeTokens();

  const headers = Object.assign({}, options.headers, {
    Authorization: "Bearer " + accessToken,
    "Content-Type": "application/json"
  });

  const response = UrlFetchApp.fetch(url, {
    ...options,
    headers,
    muteHttpExceptions: true // ← これで 401 でもキャッチできるように
  });

  const statusCode = Number(response.getResponseCode());
  const content = response.getContentText();
  Logger.log(`ステータス: ${statusCode}`);
  Logger.log(" レスポンス内容: " + response.getContentText());

  // トークンの期限切れエラーを確認（コードでチェック）
  if ((statusCode === 401 || content.includes("expired_access_token")) && !retrying) {
    Logger.log(" アクセストークン期限切れ検出（リフレッシュして再試行）");

    const newAccessToken = refreshFreeeAccessToken(storeName);

    const retryHeaders = Object.assign({}, options.headers, {
      Authorization: "Bearer " + newAccessToken,
      "Content-Type": "application/json"
    });

    const retryResponse = UrlFetchApp.fetch(url, {
      ...options,
      headers: retryHeaders,
      muteHttpExceptions: true
    });

    return retryResponse;
  }
  return response;
}

// CompanyId取得関数
function getMyCompanies() {
  const url = "https://api.freee.co.jp/hr/api/v1/users/me";
  const response = fetchWithFreeeAuth(url, { method: "get" });
  const data = JSON.parse(response.getContentText());

  if (!data.companies || data.companies.length === 0) {
    Logger.log("❌ 所属会社が見つかりませんでした");
    return [];
  }

  const companyList = data.companies.map(c => ({
    name: c.name,
    id: c.id
  }));

  Logger.log("✅ 所属会社一覧:");
  companyList.forEach(c => Logger.log(`・${c.name}（ID: ${c.id}）`));
  return companyList;
}



/**
 * 指定された店舗名または「フードサービス事業部」に所属する従業員のみを抽出する関数
 * 従業員オブジェクトの配列（id, name, groupName, isShared）を返す
 *
 * @param {number} companyId - 処理対象の事業所ID
 * @param {Date} baseDateUTC - 基準日（UTC形式）
 * @param {string} storeName - 処理対象の店舗名（例: "本店", "別邸"）
 * @returns {Array<{ id: number, name: string, groupName: string, isShared: boolean }>} 対象従業員リスト
 */
function getFilteredEmployees(companyId, baseDateUTC, storeName) {
  const baseDateJST = Utilities.formatDate(baseDateUTC, "JST", "yyyy-MM-dd");
  const url = `https://api.freee.co.jp/hr/api/v1/employee_group_memberships?company_id=${companyId}&base_date=${baseDateJST}`;

  Logger.log("所属情報取得URL: " + url);

  // Freee API による所属情報取得（トークンは storeName ごとに fetchWithFreeeAuth を利用）
  const response = fetchWithFreeeAuth(url, storeName, { method: "get", muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    Logger.log("所属取得失敗: " + response.getContentText());
    return [];
  }

  const data = JSON.parse(response.getContentText());
  const all = data.employee_group_memberships || [];

  const filtered = [];

  all.forEach(emp => {
    const name = emp.display_name || "名前不明";
    const id = emp.id;

    // グループの中に storeName または "フードサービス事業部" が含まれているものを探す
    const matchedGroup = emp.group_memberships?.find(group => {
      const groupName = (group.group_name || "").trim();
      return (
        groupName === "フードサービス事業部" ||      // 完全一致
        groupName === storeName                  // 店舗名が含まれている
      );
    });

    if (matchedGroup) {
      const groupName = matchedGroup.group_name;
      const isShared = groupName === "フードサービス事業部"; // 完全一致の場合のみ true

      Logger.log(`対象: ${name}（ID: ${id} / 所属: ${groupName} / isShared: ${isShared}）`);

      filtered.push({
        id,
        name,
        groupName,
        isShared
      });
    } else {
      Logger.log(`除外: ${name}`);
    }
  });

  Logger.log(filtered);
  return filtered;
}


/**
 * 指定従業員の出勤（clock_in）・退勤（clock_out）時刻を取得する
 * JST時刻が10時以下（0〜10時）の場合は、前日〜当日の2日間を取得範囲にする
 * それ以外の時間帯では、当日のみを対象とする
 * 
 * 取得した打刻情報から：
 * - 出勤（clock_in）時刻を基準に、後続の退勤（clock_out）をペアリング
 * - 出勤がない場合でも、退勤だけ取得されていればそれを返す
 * 
 * @param {number} companyId - Freee事業所ID
 * @param {number} employeeId - 対象の従業員ID
 * @param {Date} [nowUTC=new Date()] - 現在のUTC時刻（テスト用に任意時刻を指定可）
 * @returns {{ clockIn: string|null, clockOut: string|null }}
 */
function getClockInOutTimes(companyId, employeeId, hourInJST, nowUTC = new Date(), storeName) {
  // JSTの日時を文字列で取得し、それをDate化
  // JSTの時刻（数字だけ）を直接取得

  let fromDate, toDate;
  const jstYMD = Utilities.formatDate(nowUTC, "Asia/Tokyo", "yyyy-MM-dd");
  Logger.log("jstYMD" + jstYMD)

  if (hourInJST <= 10) {
    // JST 0時〜10時までは「前日〜当日」2日分を取得
    const yday = new Date(nowUTC.getTime() - 24 * 60 * 60 * 1000);
    fromDate = Utilities.formatDate(yday, "Asia/Tokyo", "yyyy-MM-dd");
    toDate = jstYMD;
    } else {
    // それ以外の時間帯(20-0)は「当日のみ」を取得
    fromDate = toDate = jstYMD;
  }

  // Freee API で指定従業員の打刻情報を取得
  const url = `https://api.freee.co.jp/hr/api/v1/employees/${employeeId}/time_clocks?company_id=${companyId}&from_date=${fromDate}&to_date=${toDate}`;
  const response = fetchWithFreeeAuth(url, storeName);
  const clocks = JSON.parse(response.getContentText()) || [];

  // 出勤打刻を探す（最初に見つかった1件）
  const clockInObj = clocks.find(clock => clock.type === "clock_in");
  const clockIn = clockInObj?.datetime || null;

  let clockOut = null;

  if (clockIn) {
    const clockInTime = new Date(clockIn).getTime();

    // 出勤時刻より後にある退勤をすべて抽出し、最も早いものを選択
    const outCandidates = clocks
      .filter(clock => clock.type === "clock_out")
      .map(clock => ({ dt: clock.datetime, time: new Date(clock.datetime).getTime() }))
      .filter(clock => clock.time > clockInTime)
      .sort((a, b) => a.time - b.time);

    if (outCandidates.length > 0) {
      clockOut = outCandidates[0].dt;
    }

  } else {
    // 出勤が存在しない場合でも、退勤だけ存在する可能性があるため取得
    const anyOut = clocks.find(clock => clock.type === "clock_out");
    clockOut = anyOut?.datetime || null;
  }

  return { clockIn, clockOut };
}


/**
 * Freee APIから従業員の時給を取得する（basic_pay_ruleエンドポイント）
 *
 * @param {number} employeeId - 従業員ID
 * @param {number} companyId - 事業所ID
 * @param {Date} baseDateUTC - 基準となるUTC時刻（JSTで年月を取得する）
 * @returns {number} 時給（円） ※取得できなければ 0 を返す
 */
function getEmployeeHourlyWage(employeeId, companyId, nowUTC = new Date(), storeName) {
  const dateInJST = new Date(nowUTC.getTime() + 9 * 60 * 60 * 1000);
  const year = dateInJST.getFullYear();
  const month = dateInJST.getMonth() + 1;
  
  Logger.log("JST日時: " + Utilities.formatDate(nowUTC, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"));


  const url = `https://api.freee.co.jp/hr/api/v1/employees/${employeeId}/basic_pay_rule` +
              `?company_id=${companyId}&year=${year}&month=${month}`;

  try {
    const response = fetchWithFreeeAuth(url, storeName);
    const code = response.getResponseCode();
    const body = response.getContentText();
    const json = JSON.parse(body);


    const rule = json.employee_basic_pay_rule;

    if (rule?.pay_calc_type === "hourly" && rule.pay_amount > 0) {
      return rule.pay_amount;
    } else if (rule?.pay_calc_type === "monthly" && rule.pay_amount > 0) {
      const businessDays = countBusinessDays(year, month)
      const estimatedHoursPerMonth = 8 *  businessDays; //月給受給の推定月間労働時間
      const estimatedHourlyWage = Math.floor(rule.pay_amount * 1.15 / estimatedHoursPerMonth);
      Logger.log(` 月給 ${rule.pay_amount}円 → 推定時給: ${estimatedHourlyWage}円（仮）`);
      return estimatedHourlyWage;
    } else {
      Logger.log(" pay_amount未設定 or 判定不能,仮時給1500円適用");
      return 1500
    }
  } catch (e) {
    Logger.log(" 通信エラー: " + e.message);
  }

  return 0;
}
/**
 * 出退勤時刻と時給から従業員の給与を計算する関数
 * 深夜勤務には1.25倍の割増を適用
 * isShared が true の場合は Config.sharedStores.length で割る
 *
 * @param {Date} clockIn - 出勤時刻
 * @param {Date} clockOut - 退勤時刻
 * @param {Date} nowUTC - 現在時刻（デフォルト: 実行時点）
 * @param {number} hourlyWage - 時給
 * @param {boolean} isShared - 複数店舗所属フラグ
 * @returns {number} 四捨五入された給与金額（円）
 */
function calculateEmployeeWage(clockIn, clockOut, nowUTC = new Date(), hourlyWage, isShared = false) {

  ///該当処理
  
  return Math.floor(totalPay); // 最終給与も四捨五入
}

/**
 * 勤務時間（分）を「通常時間」と「深夜時間」に分割して返す
 *
 * - 深夜時間帯は JST 22:00〜翌05:00 として判定される
 * - `clockInStr`, `clockOutStr` は ISO8601文字列（+09:00などタイムゾーン付き）
 * - `nowUTC` は現在時刻（UTC基準の Dateオブジェクト）
 *
 * @param {string|null} clockInStr - 出勤時刻（ISO文字列）
 * @param {string|null} clockOutStr - 退勤時刻（ISO文字列 or null）
 * @param {Date} nowUTC - 現在のUTC時刻（退勤がない場合の代用）
 * @returns {{ normal: number, lateNight: number }} - 通常時間と深夜時間（分単位）
 */
function splitWorkedMinutes(clockInStr, clockOutStr, nowUTC = new Date()) {
  if (!clockInStr) return { normal: 0, lateNight: 0 };

  const start = new Date(clockInStr); // ← JSTつきISO → OK

  const end = clockOutStr
    ? new Date(clockOutStr)
    : new Date(Utilities.formatDate(nowUTC, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss'+09:00'"));

  
  let normalMinutes = 0;
  let lateNightMinutes = 0;
  Logger.log("nowUTC: " + nowUTC)
  Logger.log(" JST表示 start: " + Utilities.formatDate(start, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"));
  Logger.log(end)
  Logger.log(" JST表示 end  : " + Utilities.formatDate(end, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"));

  // ⏱ 勤務時間を1分ずつスキャンして、時間帯を判定
  for (let t = start; t < end; t.setMinutes(t.getMinutes() + 1)) { // startの参照をそのまま使う
    const hour = parseInt(Utilities.formatDate(t, "Asia/Tokyo", "H")); // JST時刻として時間を取得（0〜23）

    //  深夜時間帯：22:00〜04:59（= 22〜23, 0〜4）
    if (hour >= 22 || hour < 5) {
      lateNightMinutes++;
    } else {
      normalMinutes++;
    }
  }

  return { normal: normalMinutes, lateNight: lateNightMinutes };
}


/**
 * フードサービス事業部の従業員の給与を一括計算して、メッセージと総額を返す
 * 
 * @param {number} companyId - 対象事業所のID
 * @param {Date} nowUTC - 現在のUTC時刻（省略時は new Date()）
 * @returns {{ message: string, total: number }} 人件費メッセージと総額
 */
function calculateAllEmployeeWages(companyId, baseDateUTC, storeName) {
  const hourInJST = parseInt(Utilities.formatDate(baseDateUTC, "Asia/Tokyo", "H"), 10);

  // ログ確認
  Logger.log("UTC: " + baseDateUTC.toISOString());
  Logger.log("Hour in JST: " + hourInJST);
  const employees = getFilteredEmployees(companyId,baseDateUTC, storeName);
  const messages = [];
  let totalWage = 0;

  employees.forEach(emp => {
    const { id: employeeId, name, groupName, isShared } = emp;
    
    // 出退勤時刻の取得
    const { clockIn, clockOut } = getClockInOutTimes(companyId, employeeId, hourInJST, baseDateUTC, storeName);

    // 時給の取得
    const hourlyWage = getEmployeeHourlyWage(employeeId, companyId, baseDateUTC, storeName);

    // 給与の計算
    const wage = calculateEmployeeWage(clockIn, clockOut, baseDateUTC, hourlyWage, isShared);

    // メッセージの構築と合計への加算（0円の人は除外）
    if (wage > 0) {
    //   messages.push(`・${name}：${wage.toLocaleString()}円`);
      totalWage += wage;
    }
  });

  // 結果をまとめて返す
  return {
    // message: messages.join("\n"),
    total: totalWage
  };
}
