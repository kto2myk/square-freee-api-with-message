/**
 * スプレッドシートに店舗損益データを書き込むユーティリティ
 * スプレッドシートが存在しない場合は自動で作成され、1シートにすべての店舗データを追記する形式
 */

// プロパティサービスに保存するスプレッドシートIDのキー名
const SHEET_KEY_NAME = "IZUMO_SPREADSHEET_ID";

/**
 * スプレッドシートを取得する関数
 * 既に作成済みであればIDから取得、なければ新規作成して初期化
 * @returns {Spreadsheet} 取得または作成されたスプレッドシートオブジェクト
 */
function getOrCreateSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty(SHEET_KEY_NAME);

  if (sheetId) {
    // 既存のスプレッドシートをIDで取得
    return SpreadsheetApp.openById(sheetId);
  }

  // スプレッドシートが存在しない場合は新規作成
  const newSheet = SpreadsheetApp.create("店舗損益データ"); // スプレッドシートを新規作成
  const newId = newSheet.getId();
  props.setProperty(SHEET_KEY_NAME, newId); // IDをプロパティに保存

  const sheet = newSheet.getActiveSheet();
  sheet.setName("集計データ"); // 初期シート名を設定
  sheet.appendRow(["日時", "店舗名", "売上", "人件費", "固定費", "バック", "営業利益"]); // ヘッダー行

  return newSheet;
}

/**
 * 1行分の損益データをスプレッドシートに追記する関数
 * @param {Array} rowData - データ行（[日時, 店舗名, 売上, 人件費, 固定費, バック, 営業利益]）
 */
function writeProfitRow(rowData) {
  const ss = getOrCreateSpreadsheet();              // スプレッドシートを取得
  const sheet = ss.getSheetByName("集計データ");    // 指定シートを取得（存在しない場合はエラーになるため注意）
  sheet.appendRow(rowData);                         // データ行を末尾に追加
}
