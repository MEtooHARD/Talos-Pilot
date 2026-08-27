/**
 * Traditional Chinese (繁體中文). Drafted by an AI translation pass — please
 * open a PR if any phrasing reads unnaturally; native review is welcome
 * and expected for this file in particular.
 */
module.exports = {
  meta: { name: '繁體中文' },

  tray: {
    menu_settings: '設定',
    menu_run_now: '立即簽到',
    menu_open_log: '開啟紀錄',
    menu_quit: '結束',
    status_waiting: '狀態：等待首次檢查',
    status_setup_incomplete: '尚未完成設定 — 請點擊上方的「設定」',
    status_label: {
      signed_in: '今日已簽到',
      'session-expired': '登入已過期 — 需要處理',
      'selector-not-found': '網站版面已變更 — 需要檢查',
      error: '上次嘗試失敗',
    },
    status_simple: '狀態：{label}',
    status_with_time: '狀態：{label}（{whenLabel}）',
    status_last_checked: '最後檢查於 {when}',
  },

  notify: {
    title: {
      'session-expired': 'Talos Autopilot — 需要登入',
      'selector-not-found': 'Talos Autopilot — SKPORT 頁面已變更',
      error: 'Talos Autopilot 發生問題',
      crashed: 'Talos Autopilot 已停止',
      default: 'Talos Autopilot',
    },
    hint: {
      'session-expired': '您儲存的登入已過期，請開啟應用程式重新登入。',
      'selector-not-found': '網站版面已變更，工具找不到今天的簽到格。',
      error: '稍後將自動重試。若持續發生，請開啟應用程式查看。',
      crashed: '不會自動重試 — 您需要自行重新啟動程式，自動簽到才能繼續運作。',
    },
  },

  result: {
    'no-session': '尚未儲存登入資訊，請先透過「設定」執行登入。',
    'session-expired': '您儲存的 SKPORT 登入已過期，請重新登入。',
    'already-signed-in': '今日已簽到。',
    claimed: '簽到成功 — 已領取{dayLabel}。',
    'selector-not-found': '找不到今天的簽到格（{dayLabel}）— 頁面版面可能已變更。',
    error: '簽到執行時發生錯誤：{detail}',
  },

  main: {
    running: 'Talos Autopilot 正在執行中 — 請在系統匣中尋找打勾圖示（可能需要點擊「^」箭頭以顯示隱藏圖示）。點擊右鍵可查看選項。',
    crashed_message: 'Talos Autopilot 發生非預期錯誤，已停止運作。',
  },

  scheduler: {
    scheduled_for: '已排定今日簽到時間：{when}。',
  },

  webui: {
    title: 'Talos Autopilot — 設定',
    heading: 'Talos Autopilot — 設定',
    login_intro: '您尚未登入。我們將開啟一個瀏覽器視窗，讓您登入 SKPORT 並儲存您的登入憑證。',
    login_button: '登入 SKPORT',
    waiting_intro: '瀏覽器視窗即將開啟。請在該視窗中登入，先不要關閉該視窗，回來後點擊下方按鈕。\n請注意第三方登入（如 Google）可能會受到限制，這是正常現象，請直接使用密碼登入。',
    login_done_button: '我已登入',
    logged_in_note_with_config: '您已登入 — 可隨時在下方變更設定。',
    logged_in_note_no_config: '您已登入 — 請在下方設定您的偏好。',
    mode_label: '每天何時嘗試簽到？',
    mode_window_option: '於指定時段內隨機時間',
    mode_asap_option: '只要電腦開機就立即執行',
    mode_asap_hint: '系統會在每天到達這個時間後立即檢查；若當時電腦尚未開機，則會在開機後盡快執行。發生問題時您仍會收到通知。',
    label_asap_time: '每日更新時間（UTC+8，非您的當地時間）',
    label_earliest: '每日最早嘗試時間',
    label_latest: '最晚時間',
    window_hint: '系統會在此時間範圍內隨機選擇一個時間點執行 — 若發生問題，您將收到通知，且此時您通常還在電腦前，方便及時處理。',
    autostart_label: '隨 Windows 自動啟動',
    language_label: '語言',
    save_button: '儲存',
    relogin_button: '重新登入',
    status_opening_browser: '正在開啟瀏覽器視窗...',
    status_saving_login: '正在儲存登入資訊...',
    status_invalid_range: '請選擇有效的時間範圍（最早時間需早於最晚時間）。',
    status_no_mode_selected: '請先選擇上方其中一個選項。',
    status_generic_error: '發生錯誤。',
    status_browser_closed_early: '該瀏覽器視窗似乎在完成前被關閉了。請再次點擊「登入 SKPORT」重試。',
    status_save_timeout: '儲存登入資訊逾時 — 這通常表示您點擊按鈕時其實尚未完成登入。請再次點擊「登入 SKPORT」，完整登入後再試一次。',
    status_saved: '✅ 已儲存 — 您現在可以關閉此分頁。',
    status_session_ended: '此設定工作階段已結束 — 請從系統匣重新開啟設定以繼續變更。',
  },
};
