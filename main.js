import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { db, Store, ExternalApp } from './store.js';
import { Calc } from './logic.js';
// 【変更】currentState を削除し StateManager をインポート
import { UI, StateManager, updateBeerSelectOptions, refreshUI, toggleModal } from './ui.js';
// Day.js をCDNからインポート
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

/* ==========================================================================
   Global Error Handling
   ========================================================================== */
const showErrorOverlay = (msg, source, lineno) => {
    const overlay = document.getElementById('global-error-overlay');
    const details = document.getElementById('error-details');
    if (overlay && details) {
        // 現在時刻
        const now = new Date().toLocaleString();
        // エラー詳細テキスト
        const errText = `[${now}]\nMessage: ${msg}\nSource: ${source}:${lineno}\nUA: ${navigator.userAgent}`;
        
        details.textContent = errText;
        overlay.classList.remove('hidden');
        
        // コピーボタンの機能付け
        document.getElementById('btn-copy-error').onclick = () => {
            navigator.clipboard.writeText(errText)
                .then(() => alert('エラーログをコピーしました'))
                .catch(() => alert('コピーに失敗しました'));
        };
    }
    // コンソールにも出す
    console.error('Global Error Caught:', msg);
};

// 1. 通常のJSエラー (SyntaxError, ReferenceErrorなど)
window.onerror = function(msg, source, lineno, colno, error) {
    showErrorOverlay(msg, source, lineno);
    return false; // デフォルトの処理も走らせる
};

// 2. Promise由来のエラー (async/awaitの失敗など)
window.addEventListener('unhandledrejection', function(event) {
    showErrorOverlay(`Unhandled Promise Rejection: ${event.reason}`, 'Promise', 0);
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// constants.js の CALORIES.STYLES のキーと整合性を取った定義
const STYLE_SPECS = {
    // --- ラガー ---
    '国産ピルスナー': { abv: 5.0, type: 'sweet' },      // Renamed
    '糖質オフ/新ジャンル': { abv: 4.0, type: 'dry' },   // Renamed
    'ピルスナー': { abv: 5.0, type: 'sweet' },
    'ドルトムンター': { abv: 5.5, type: 'sweet' },
    'シュバルツ': { abv: 5.0, type: 'sweet' },

    // --- エール ---
    'ゴールデンエール': { abv: 5.0, type: 'sweet' },    // New
    'ペールエール': { abv: 5.5, type: 'sweet' },
    'ジャパニーズエール': { abv: 5.5, type: 'sweet' },
    'ヴァイツェン': { abv: 5.0, type: 'sweet' },
    'ベルジャンホワイト': { abv: 5.0, type: 'sweet' },
    'セゾン': { abv: 6.0, type: 'sweet' },

    // --- IPA ---
    'セッションIPA': { abv: 4.5, type: 'sweet' },
    'IPA (West Coast)': { abv: 6.5, type: 'sweet' },
    'Hazy IPA': { abv: 7.0, type: 'sweet' },
    'Hazyペールエール': { abv: 6.0, type: 'sweet' },
    'ダブルIPA (DIPA)': { abv: 8.5, type: 'sweet' },
    'アンバーエール': { abv: 5.5, type: 'sweet' }, // constantsにはないが念のため残すか、削除してもよい

    // --- 黒 ---
    'ポーター': { abv: 5.5, type: 'sweet' },
    'スタウト': { abv: 6.0, type: 'sweet' },
    'インペリアルスタウト': { abv: 9.0, type: 'sweet' }, // New

    // --- ハイアルコール ---
    'ベルジャン・トリペル': { abv: 9.0, type: 'sweet' },
    'バーレイワイン': { abv: 10.0, type: 'sweet' },

    // --- その他 ---
    'サワーエール': { abv: 5.0, type: 'sweet' },
    'フルーツビール': { abv: 5.0, type: 'sweet' }
};

// Helper: 日付文字列(YYYY-MM-DD)を、その日の12:00のTimestampに変換
const getDateTimestamp = (dateStr) => {
    if (!dateStr) return Date.now();
    return dayjs(dateStr).startOf('day').add(12, 'hour').valueOf();
};

/* ==========================================================================
   Event Handling & App Logic
   ========================================================================== */

// 編集モード管理用の変数
let editingLogId = null;
let editingCheckId = null;

const handleSaveSettings = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    const h = parseFloat(document.getElementById('height-input').value);
    const a = parseInt(document.getElementById('age-input').value);
    const g = document.getElementById('gender-input').value;
    const m1 = document.getElementById('setting-mode-1').value;
    const m2 = document.getElementById('setting-mode-2').value;
    const be = document.getElementById('setting-base-exercise').value;
    const theme = document.getElementById('theme-input').value;
    const de = document.getElementById('setting-default-record-exercise').value;
    
    // 【修正】基本的な入力チェックに加え、数値の範囲チェックを追加
    if (w > 0 && h > 0 && a > 0 && m1 && m2 && be) {
        // 常識的な範囲チェック (必須ではないが安全のため)
        if (w > 300 || h > 300 || a > 150) {
            return UI.showMessage('入力値を確認してください', 'error');
        }

        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, w);
        localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, h);
        localStorage.setItem(APP.STORAGE_KEYS.AGE, a);
        localStorage.setItem(APP.STORAGE_KEYS.GENDER, g);
        localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
        localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
        localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, be);
        localStorage.setItem(APP.STORAGE_KEYS.THEME, theme);
        localStorage.setItem(APP.STORAGE_KEYS.DEFAULT_RECORD_EXERCISE, de);
        
        toggleModal('settings-modal', false);
        UI.updateModeSelector();
        updateBeerSelectOptions(); 
        const recordSelect = document.getElementById('exercise-select');
        if (recordSelect) recordSelect.value = de;
        
        UI.applyTheme(theme);
        
        refreshUI();
        UI.showMessage('設定を保存しました', 'success');
    } else {
        UI.showMessage('すべての項目を正しく入力してください', 'error');
    }
};

// 【新規】同日の運動ログを再計算してボーナスを整合させる関数
const recalcDailyExercises = async (targetTs) => {
    const targetDate = dayjs(targetTs);
    
    // 1. その日の全ログを取得
    const dayStart = targetDate.startOf('day').valueOf();
    const dayEnd = targetDate.endOf('day').valueOf();
    const dayLogs = await db.logs.where('timestamp').between(dayStart, dayEnd, true, true).toArray();
    
    // 2. 運動ログだけを抽出
    const exerciseLogs = dayLogs.filter(l => l.minutes > 0); // プラスが運動
    if (exerciseLogs.length === 0) return; // 運動してなければ関係なし

    // 3. 全期間のログとチェックを取得（ストリーク判定用）
    const allLogs = await db.logs.toArray();
    const allChecks = await db.checks.toArray();

    // 4. 「もしこの日にお酒を飲んでいたら」ボーナスは無効 (x1.0)
    //    飲んでいなければ、過去のストリークに基づいた倍率を適用
    const hasAlcohol = Calc.hasAlcoholLog(allLogs, targetTs);
    const streak = Calc.getStreakAtDate(targetTs, allLogs, allChecks);
    
    // 飲酒ありなら強制1.0、なしならストリーク倍率
    const multiplier = hasAlcohol ? 1.0 : Calc.getStreakMultiplier(streak);

    let updatedCount = 0;
    let bonusLost = false;
    let bonusGained = false;

    // 5. 各運動ログを更新
    for (const log of exerciseLogs) {
        // 運動データ定義を取得
        let exKey = log.exerciseKey;
        if (!exKey) {
            const entry = Object.entries(EXERCISE).find(([k, v]) => log.name.includes(v.label));
            if (entry) exKey = entry[0];
        }
        const exData = EXERCISE[exKey] || EXERCISE['stepper']; // fallback

        // 生の運動時間(rawMinutes)を使って再計算
        const rawMinutes = log.rawMinutes || Math.round(Calc.stepperEq(log.minutes * Calc.burnRate(EXERCISE['stepper'].mets)) / Calc.burnRate(exData.mets)); // fallback calculation
        
        // カロリー・時間を再計算
        const baseKcal = Calc.burnRate(exData.mets) * rawMinutes;
        const bonusKcal = baseKcal * multiplier;
        const newMinutes = Math.round(Calc.stepperEq(bonusKcal));

        // メモの書き換え
        let newMemo = log.memo || '';
        const hasBonusText = newMemo.includes('Streak Bonus');
        
        if (multiplier > 1.0) {
            if (!hasBonusText) {
                newMemo = newMemo ? `${newMemo} 🔥 Streak Bonus x${multiplier}` : `🔥 Streak Bonus x${multiplier}`;
                bonusGained = true;
            }
        } else {
            if (hasBonusText) {
                // ボーナス表記を削除
                newMemo = newMemo.replace(/🔥 Streak Bonus x[\d.]+/g, '').trim();
                bonusLost = true;
            }
        }

        // 値が変わる場合のみ更新
        if (log.minutes !== newMinutes || log.memo !== newMemo) {
            await db.logs.update(log.id, {
                minutes: newMinutes,
                memo: newMemo
            });
            updatedCount++;
        }
    }

    // 6. ユーザーへの通知
    if (updatedCount > 0) {
        if (bonusLost) {
            UI.showMessage('飲酒により、本日の運動ボーナスが\n無効になりました... 😭', 'error');
        } else if (bonusGained) {
            UI.showMessage('飲酒記録が消えたため\n運動ボーナスが復活しました！ 🔥', 'success');
        }
    }
};

// 【修正】飲酒ログ登録・更新ハンドラ
const handleBeerSubmit = async (e) => {
    e.preventDefault();
    const dateVal = document.getElementById('beer-date').value;
    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    const rating = parseInt(document.getElementById('beer-rating').value) || 0;
    const memo = document.getElementById('beer-memo').value;
    const useUntappd = document.getElementById('untappd-check').checked;
    
    const ts = dateVal ? getDateTimestamp(dateVal) : Date.now();
    const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
    
    let logName = '';
    let logStyle = '';
    let logSize = '';
    let totalKcal = 0;
    
    let saveCount = 1;
    let saveAbv = 0;
    let saveIsCustom = false;
    let saveCustomType = null;
    let saveRawAmount = null;

    if (isCustom) {
        const abv = parseFloat(document.getElementById('custom-abv').value);
        const ml = parseFloat(document.getElementById('custom-amount').value);
        const type = document.querySelector('input[name="customType"]:checked').value;

        if (isNaN(abv) || isNaN(ml) || abv < 0 || ml <= 0) {
            return UI.showMessage('正しい数値を入力してください', 'error');
        }

        totalKcal = Calc.calculateAlcoholKcal(ml, abv, type);
        
        logName = `Custom ${abv}% ${ml}ml` + (type==='dry' ? '🔥' : '🍺');
        logStyle = 'Custom';
        logSize = `${ml}ml`;
        
        saveCount = 1;
        saveAbv = abv;
        saveIsCustom = true;
        saveCustomType = type;
        saveRawAmount = ml;

    } else {
        const s = document.getElementById('beer-select').value;
        const z = document.getElementById('beer-size').value;
        const c = parseFloat(document.getElementById('beer-count').value);
        const userAbv = parseFloat(document.getElementById('preset-abv').value);

        if (!s || !z || !c || c <= 0 || isNaN(userAbv) || userAbv < 0) {
            return UI.showMessage('正しい数値を入力してください', 'error');
        }

        const sizeMl = parseFloat(z);
        const spec = STYLE_SPECS[s] || { type: 'sweet' };
        
        const unitKcal = Calc.calculateAlcoholKcal(sizeMl, userAbv, spec.type);
        totalKcal = unitKcal * c;

        logName = `${s} (${userAbv}%) x${c}`;
        logStyle = s;
        logSize = z;
        
        saveCount = c;
        saveAbv = userAbv;
        saveIsCustom = false;
    }

    const min = Calc.stepperEq(totalKcal);

    const logData = { 
        name: logName, 
        type: '借金', 
        style: logStyle, 
        size: logSize,
        minutes: -Math.round(min), 
        timestamp: ts, 
        brewery: brewery, 
        brand: brand, 
        rating: rating, 
        memo: memo,
        count: saveCount, 
        abv: saveAbv, 
        isCustom: saveIsCustom, 
        customType: saveCustomType, 
        rawAmount: saveRawAmount
    };

    if (editingLogId) {
        await db.logs.update(editingLogId, logData);
        UI.showMessage('記録を更新しました', 'success');
        editingLogId = null;
    } else {
        await db.logs.add(logData);
        UI.showMessage('飲酒を記録しました 🍺', 'success'); 
    }
    
    // 【重要】飲酒記録後、同日の運動ボーナスを再評価する
    await recalcDailyExercises(ts);
    
    toggleModal('beer-modal', false); 
    await refreshUI();

    // 入力リセット
    document.getElementById('beer-brewery').value = '';
    document.getElementById('beer-brand').value = '';
    document.getElementById('beer-rating').value = '0';
    document.getElementById('beer-memo').value = '';
    document.getElementById('untappd-check').checked = false;
    document.getElementById('beer-count').value = '';
    
    if(document.getElementById('custom-abv')) document.getElementById('custom-abv').value = '';
    if(document.getElementById('custom-amount')) document.getElementById('custom-amount').value = '';

    if (useUntappd) {
        let searchTerm = brand;
        if (brewery) searchTerm = `${brewery} ${brand}`;
        if (!searchTerm) searchTerm = logStyle;
        ExternalApp.searchUntappd(searchTerm);
    }
};

const handleManualExerciseSubmit = async () => { 
    const dateVal = document.getElementById('manual-date').value;
    const m = parseFloat(document.getElementById('manual-minutes').value); 
    const applyBonus = document.getElementById('manual-apply-bonus').checked; 
    
    if (!m || m <= 0) return UI.showMessage('正しい時間を入力してください', 'error'); 
    
    // editingLogId を第5引数に渡す
    await recordExercise(document.getElementById('exercise-select').value, m, dateVal, applyBonus, editingLogId); 
    
    document.getElementById('manual-minutes').value=''; 
    toggleModal('manual-exercise-modal', false); 
    editingLogId = null; // リセット
};

const handleCheckSubmit = async (e) => {
    e.preventDefault();
    const f = document.getElementById('check-form');
    const dateVal = document.getElementById('check-date').value;
    const isDry = document.getElementById('is-dry-day').checked; 
    const w = document.getElementById('check-weight').value;

    const ts = dateVal ? getDateTimestamp(dateVal) : Date.now();
    
    const entry = {
        isDryDay: isDry, 
        waistEase: f.elements['waistEase'].checked, 
        footLightness: f.elements['footLightness'].checked, 
        waterOk: isDry ? null : f.elements['waterOk'].checked, 
        fiberOk: isDry ? null : f.elements['fiberOk'].checked, 
        timestamp: ts
    };

    // 【修正】体重が入力されており、かつ正の数の場合のみ保存
    if(w) {
        const val = parseFloat(w);
        if (val > 0) {
            entry.weight = val;
        } else {
             return UI.showMessage('体重は正の数で入力してください', 'error');
        }
    }

    if (editingCheckId) {
        await db.checks.update(editingCheckId, entry);
        editingCheckId = null;
    } else {
        const existing = (await db.checks.toArray()).find(c => Calc.isSameDay(c.timestamp, ts));
        if (existing) {
            if(confirm('この日付のデータは既に存在します。上書きしますか？')) {
                await db.checks.update(existing.id, entry);
            } else {
                return;
            }
        } else {
            await db.checks.add(entry);
        }
    }
    
    UI.showMessage('チェック完了！','success'); 
    toggleModal('check-modal', false); 
    
    document.getElementById('is-dry-day').checked = false; 
    document.getElementById('check-weight').value = '';
    document.getElementById('drinking-section').classList.remove('hidden-area'); 
    
    await refreshUI(); 
};

const deleteLog = async (id) => {
    if (!confirm('削除しますか？')) return;
    
    // 【修正】削除前にログの日付とタイプを取得しておく
    const targetLog = await db.logs.get(id);
    const targetTs = targetLog ? targetLog.timestamp : null;
    const isAlcohol = targetLog && targetLog.minutes < 0;

    await db.logs.delete(id);
    UI.showMessage('削除しました', 'success');

    // 【追加】飲酒ログを削除した場合、その日の運動ボーナスが復活する可能性があるため再計算
    if (targetLog && isAlcohol) {
        await recalcDailyExercises(targetTs);
    }

    await refreshUI();
};

// 一括削除ロジック
const bulkDeleteLogs = async (ids) => {
    if (!ids || ids.length === 0) return;
    if (!confirm(`${ids.length}件のデータを削除しますか？\nこの操作は取り消せません。`)) return;
    
    try {
        // 【修正】一括削除の際も、影響を受ける日付をリストアップ
        const logsToDelete = await db.logs.where('id').anyOf(ids).toArray();
        const affectedDates = new Set();
        logsToDelete.forEach(l => {
            if (l.minutes < 0) { // 飲酒ログが含まれていたら
                affectedDates.add(dayjs(l.timestamp).format('YYYY-MM-DD'));
            }
        });

        await db.logs.bulkDelete(ids);
        UI.showMessage(`${ids.length}件削除しました`, 'success');
        
        // 【追加】影響を受ける各日付で再計算
        for (const dateStr of affectedDates) {
            await recalcDailyExercises(dayjs(dateStr).valueOf());
        }

        UI.toggleEditMode(); 
        await refreshUI();
    } catch (e) {
        console.error(e);
        UI.showMessage('一括削除に失敗しました', 'error');
    }
};

// 1. 既存の handleShare を「リッチなステータスシェア」に書き換え
const handleShare = async () => {
    // 最新のデータを取得して計算
    const logs = await db.logs.toArray();
    const checks = await db.checks.toArray();
    
    // ランク情報の取得
    const gradeData = Calc.getRecentGrade(checks, logs);
    // Streak情報の取得
    const streak = Calc.getCurrentStreak(logs, checks);
    
    // 貯金/借金残高の取得
    const currentBalance = logs.reduce((sum, l) => sum + l.minutes, 0);
    const balanceText = currentBalance >= 0 ? `+${currentBalance}分` : `${currentBalance}分`;
    const balanceStatus = currentBalance >= 0 ? '貯金' : '借金';

    // 投稿テキストの生成
    const text = `現在: ${gradeData.label} (${gradeData.rank}) | 連続: ${streak}日🔥 | ${balanceStatus}: ${balanceText} | 飲んだら動く！健康管理アプリ #ノムトレ`;

    shareToSocial(text);
};

// 2. 【新規】ログ詳細からのシェア機能
const handleDetailShare = async () => {
    const modal = document.getElementById('log-detail-modal');
    if (!modal || !modal.dataset.id) return;
    
    const id = parseInt(modal.dataset.id);
    const log = await db.logs.get(id);
    if (!log) return;

    let text = '';
    
    if (log.minutes < 0) {
        // 🍺 飲酒ログの場合
        const debtMins = Math.abs(log.minutes);
        const beerName = log.brand ? `${log.brand}` : (log.style || 'ビール');
        const star = log.rating > 0 ? '★'.repeat(log.rating) : '';
        // 【修正】運動基準名を取得して表示
        const baseEx = Store.getBaseExercise();
        const baseExName = EXERCISE[baseEx] ? EXERCISE[baseEx].label : '運動';
        
        text = `🍺 飲みました: ${beerName} | 借金発生: ${baseExName}換算で${debtMins}分が追加されました...😱 ${star} #ノムトレ`;
    } else {
        // 🏃‍♀️ 運動ログの場合
        const earnedMins = log.minutes;
        const exName = log.name.split(' ')[1] || log.name; 
        
        // 【修正】具体的な運動基準名またはビール換算を表示
        // ここでは「ユーザーが設定しているビールモード1」を基準にするのが分かりやすい
        const modes = Store.getModes();
        text = `🏃‍♀️ 運動しました: ${exName} (${log.rawMinutes}分) | 借金返済: ${modes.mode1}換算で${earnedMins}分相当を確保！🍺 #ノムトレ #飲んだら動く`;
    }

    shareToSocial(text);
};

// 3. 共通シェア関数 (Web Share API or Twitter)
const shareToSocial = async (text) => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'ノムトレ - 借金返済ダイエット',
                text: text,
                url: window.location.href
            });
        } catch (err) {
            console.log('Share canceled');
        }
    } else {
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
        window.open(twitterUrl, '_blank');
    }
};

let touchStartX = 0;
let touchStartY = 0;
const TABS = ['tab-home', 'tab-record', 'tab-history'];

const handleTouchStart = (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
};

const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
        const currentTabId = document.querySelector('.tab-content.active').id;
        const currentIndex = TABS.indexOf(currentTabId);
        
        if (diffX < 0) {
            if (currentIndex < TABS.length - 1) UI.switchTab(TABS[currentIndex + 1]);
        } else {
            if (currentIndex > 0) UI.switchTab(TABS[currentIndex - 1]);
        }
    }
};

/* ==========================================================================
   Internal Logic & Functions
   ========================================================================== */

async function recordExercise(t, m, dateVal = null, applyBonus = true, existingId = null) { 
    const allLogs = await db.logs.toArray();
    const allChecks = await db.checks.toArray();
    
    const ts = dateVal ? getDateTimestamp(dateVal) : Date.now();

    const streak = Calc.getStreakAtDate(ts, allLogs, allChecks);
    const multiplier = applyBonus ? Calc.getStreakMultiplier(streak) : 1.0;

    const i = EXERCISE[t];
    const baseKcal = Calc.burnRate(i.mets) * m;
    const bonusKcal = baseKcal * multiplier;
    const eq = Calc.stepperEq(bonusKcal);
    const earnedMinutes = Math.round(eq);

    // 更新の場合は、計算前の残高から「自分自身の古い値」を除外して計算する
    let currentBalance = allLogs.reduce((sum, l) => {
        if (existingId && l.id === existingId) return sum;
        return sum + l.minutes;
    }, 0);

    let bonusMemo = '';
    if (applyBonus && multiplier > 1.0) {
        bonusMemo = `🔥 Streak Bonus x${multiplier}`;
    } else if (!applyBonus) {
        bonusMemo = `(Bonusなし)`;
    }

    const logData = {
        name: `${i.icon} ${i.label}`, 
        type: '返済', 
        minutes: earnedMinutes, 
        rawMinutes: m, 
        timestamp: ts,
        memo: bonusMemo,
        exerciseKey: t // 後で編集しやすいようにキーも保存しておく
    };

    if (existingId) {
        // 更新処理
        await db.logs.update(existingId, logData);
        UI.showMessage('記録を更新しました', 'success');
    } else {
        // 新規追加
        await db.logs.add(logData);
        
        // 完済演出 (借金状態からプラスになった時のみ)
        if (currentBalance < 0 && (currentBalance + earnedMinutes) >= 0) {
            UI.showConfetti();
            UI.showMessage(`借金完済！おめでとう！🎉\n${i.label} ${m}分 記録完了`, 'success');
        } else {
            if (multiplier > 1.0) {
                UI.showMessage(`${i.label} ${m}分 記録！\n🔥連続休肝ボーナス！返済効率 x${multiplier}`, 'success'); 
            } else {
                UI.showMessage(`${i.label} ${m}分 記録！`, 'success'); 
            }
        }
    }
    
    await refreshUI(); 
}

const DataManager = {
    exportCSV: async (t) => { 
        let d=[], c="", n=""; 
        const e = (s) => `"${String(s).replace(/"/g,'""')}"`; 
        
        if(t === 'logs'){ 
            d = await db.logs.toArray();
            d.sort((a,b) => a.timestamp - b.timestamp); 
            c = "日時,内容,換算分(ステッパー基準),実運動時間(分),ブルワリー,銘柄,評価,メモ\n" + 
                d.map(r => {
                    const rawMin = r.rawMinutes !== undefined ? r.rawMinutes : '-';
                    return `${new Date(r.timestamp).toLocaleString()},${e(r.name)},${r.minutes},${rawMin},${e(r.brewery)},${e(r.brand)},${r.rating || 0},${e(r.memo || '')}`;
                }).join('\n'); 
            n = "beer-log"; 
        } else { 
            d = await db.checks.toArray();
            d.sort((a,b) => a.timestamp - b.timestamp); 
            c = "日時,休肝日,ウエスト,足,水分,繊維,体重\n" + 
                d.map(r => `${new Date(r.timestamp).toLocaleString()},${r.isDryDay},${r.waistEase||false},${r.footLightness||false},${r.waterOk||false},${r.fiberOk||false},${r.weight||''}`).join('\n'); 
            n = "check-log"; 
        } 
        DataManager.download(c, `nomutore-${n}.csv`, 'text/csv'); 
    },
    exportJSON: async () => { 
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        DataManager.download(JSON.stringify({logs, checks}, null, 2), 'nomutore-backup.json', 'application/json'); 
    },
    copyToClipboard: async () => { 
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();
        navigator.clipboard.writeText(JSON.stringify({logs, checks}, null, 2))
            .then(() => UI.showMessage('コピーしました','success')); 
    },
    importJSON: (i) => { 
        const f = i.files[0]; if(!f) return; 
        const r = new FileReader(); 
        r.onload = async (e) => { 
            try { 
                const d = JSON.parse(e.target.result); 
                if(confirm('データを復元しますか？')){ 
                    if(d.logs) await db.logs.bulkAdd(d.logs);
                    if(d.checks) await db.checks.bulkAdd(d.checks);
                    await refreshUI(); 
                    UI.showMessage('復元しました','success'); 
                } 
            } catch(err) { UI.showMessage('読込失敗','error'); } 
            i.value = ''; 
        }; 
        r.readAsText(f); 
    },
    download: (d,n,t) => { 
        const b = new Blob([new Uint8Array([0xEF,0xBB,0xBF]), d], {type:t});
        const u = URL.createObjectURL(b);
        const a = document.createElement('a'); 
        a.href = u; a.download = n; a.click(); 
    }
};

const updTm = (st) => { 
    const e = Date.now() - st; 
    const mm = Math.floor(e/60000).toString().padStart(2,'0');
    const ss = Math.floor((e%60000)/1000).toString().padStart(2,'0');
    const display = document.getElementById('timer-display');
    if(display) display.textContent = `${mm}:${ss}`;
};

const timerControl = {
    start: () => {
        // StateManagerを使用
        if (StateManager.timerId) return;
        let st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
        if (!st) {
            st = Date.now();
            try { localStorage.setItem(APP.STORAGE_KEYS.TIMER_START, st); } catch (err) { console.error(err); }
        } else {
            st = parseInt(st, 10);
            const elapsed = Date.now() - st;
            if (elapsed > ONE_DAY_MS) {
                localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
                UI.showMessage('途中で中断された計測をリセットしました', 'error');
                return;
            }
        }
        
        document.getElementById('start-stepper-btn').classList.add('hidden');
        document.getElementById('stop-stepper-btn').classList.remove('hidden');
        document.getElementById('timer-status').textContent = '計測中...';
        document.getElementById('timer-status').className = 'text-xs text-green-600 font-bold mb-1 animate-pulse';
        
        updTm(st);
        // StateManagerを使用
        StateManager.setTimerId(setInterval(() => updTm(st), 1000));
    },
    stop: async () => {
        const st = parseInt(localStorage.getItem(APP.STORAGE_KEYS.TIMER_START) || '0', 10);
        if (!st) return;
        
        // StateManagerを使用
        if (StateManager.timerId) {
            clearInterval(StateManager.timerId);
            StateManager.setTimerId(null);
        }
        
        const m = Math.round((Date.now() - st) / 60000);
        localStorage.removeItem(APP.STORAGE_KEYS.TIMER_START);
        
        document.getElementById('start-stepper-btn').classList.remove('hidden');
        document.getElementById('stop-stepper-btn').classList.add('hidden');
        document.getElementById('timer-display').textContent = '00:00';
        document.getElementById('timer-status').textContent = 'READY';
        document.getElementById('timer-status').className = 'text-xs text-gray-400 mt-1 font-medium';
        
        if (m > 0) await recordExercise(document.getElementById('exercise-select').value, m);
        else UI.showMessage('1分未満のため記録せず','error');
    }
};

async function migrateData() {
    const oldLogs = localStorage.getItem(APP.STORAGE_KEYS.LOGS);
    const oldChecks = localStorage.getItem(APP.STORAGE_KEYS.CHECKS);
    if (oldLogs) {
        try { const logs = JSON.parse(oldLogs); if (logs.length > 0) await db.logs.bulkAdd(logs); } catch (e) { console.error(e); }
        localStorage.removeItem(APP.STORAGE_KEYS.LOGS);
    }
    if (oldChecks) {
        try { const checks = JSON.parse(oldChecks); if (checks.length > 0) await db.checks.bulkAdd(checks); } catch (e) { console.error(e); }
        localStorage.removeItem(APP.STORAGE_KEYS.CHECKS);
    }
}

// -----------------------------------------------------
// Init & Event Bindings
// -----------------------------------------------------

function bindEvents() {
    // オプショナルチェーン (?.) を追加して、要素が存在しない場合のエラーを防止
    document.getElementById('btn-open-help')?.addEventListener('click', UI.openHelp);
    document.getElementById('btn-open-settings')?.addEventListener('click', UI.openSettings);
    
    document.getElementById('nav-tab-home')?.addEventListener('click', () => UI.switchTab('tab-home'));
    document.getElementById('nav-tab-record')?.addEventListener('click', () => UI.switchTab('tab-record'));
    document.getElementById('nav-tab-history')?.addEventListener('click', () => UI.switchTab('tab-history'));

    const swipeArea = document.getElementById('swipe-area');
    if (swipeArea) {
        swipeArea.addEventListener('touchstart', handleTouchStart, {passive: true});
        swipeArea.addEventListener('touchend', handleTouchEnd);
    }

    // 追加: モード切替ドロップダウン
    document.getElementById('home-mode-select')?.addEventListener('change', (e) => {
        UI.setBeerMode(e.target.value);
    });

    // 追加: ランクカードクリックで健康チェックを開く
    document.getElementById('liver-rank-card')?.addEventListener('click', async () => {
        const todayStr = dayjs().format('YYYY-MM-DD');
        const checks = await db.checks.toArray();
        const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === todayStr);
        
        if (target) editingCheckId = target.id;
        else editingCheckId = null;
        
        UI.openCheckModal(target);
    });

    document.getElementById('chart-filters')?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            StateManager.setChartRange(e.target.dataset.range); // StateManagerを使用
            refreshUI();
        }
    });

    document.getElementById('tab-beer-preset')?.addEventListener('click', () => UI.switchBeerInputTab('preset'));
    document.getElementById('tab-beer-custom')?.addEventListener('click', () => UI.switchBeerInputTab('custom'));
    
    document.querySelectorAll('.btn-quick-amount').forEach(btn => {
        btn.addEventListener('click', function() {
            const customAmt = document.getElementById('custom-amount');
            if(customAmt) customAmt.value = this.dataset.amount;
        });
    });

    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-bg') || e.target.closest('.modal-content').parentNode;
            toggleModal(modal.id, false);
            if (modal.id === 'beer-modal') editingLogId = null;
            if (modal.id === 'check-modal') editingCheckId = null;
        });
    });
    
    document.querySelectorAll('.modal-bg').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                toggleModal(modal.id, false);
                if (modal.id === 'beer-modal') editingLogId = null;
                if (modal.id === 'check-modal') editingCheckId = null;
            }
        });
    });

    document.getElementById('start-stepper-btn')?.addEventListener('click', timerControl.start);
    document.getElementById('stop-stepper-btn')?.addEventListener('click', timerControl.stop);
    document.getElementById('manual-record-btn')?.addEventListener('click', UI.openManualInput);
    
    document.getElementById('btn-open-beer')?.addEventListener('click', () => {
        editingLogId = null;
        UI.openBeerModal(null);
    });
    document.getElementById('btn-open-check')?.addEventListener('click', () => {
        editingCheckId = null;
        UI.openCheckModal(null);
    });

    document.getElementById('btn-share-sns')?.addEventListener('click', handleShare);
    document.getElementById('btn-detail-share')?.addEventListener('click', handleDetailShare);
    
    document.getElementById('beer-form')?.addEventListener('submit', handleBeerSubmit);
    document.getElementById('check-form')?.addEventListener('submit', handleCheckSubmit);
    document.getElementById('btn-submit-manual')?.addEventListener('click', handleManualExerciseSubmit);
    document.getElementById('btn-save-settings')?.addEventListener('click', handleSaveSettings);

    document.getElementById('is-dry-day')?.addEventListener('change', function() { UI.toggleDryDay(this); });

    document.getElementById('btn-export-logs')?.addEventListener('click', () => DataManager.exportCSV('logs'));
    document.getElementById('btn-export-checks')?.addEventListener('click', () => DataManager.exportCSV('checks'));
    document.getElementById('btn-copy-data')?.addEventListener('click', DataManager.copyToClipboard);
    document.getElementById('btn-download-json')?.addEventListener('click', DataManager.exportJSON);
    document.getElementById('btn-import-json')?.addEventListener('change', function() { DataManager.importJSON(this); });

    document.getElementById('log-list')?.addEventListener('click', async (e) => {
        if (e.target.classList.contains('log-checkbox')) return; 

        const deleteBtn = e.target.closest('.delete-log-btn');
        if (deleteBtn) {
            e.stopPropagation();
            deleteLog(parseInt(deleteBtn.dataset.id));
            return;
        }

        const row = e.target.closest('.log-item-row');
        if (row) {
            const id = parseInt(row.dataset.id);
            const log = await db.logs.get(id);
            if(log) UI.openLogDetail(log);
        }
    });

    document.getElementById('btn-detail-delete')?.addEventListener('click', () => {
        const modal = document.getElementById('log-detail-modal');
        if (modal && modal.dataset.id) {
            const id = parseInt(modal.dataset.id);
            deleteLog(id);
            toggleModal('log-detail-modal', false);
        }
    });

    document.getElementById('btn-detail-edit')?.addEventListener('click', async () => {
        const modal = document.getElementById('log-detail-modal');
        if (modal && modal.dataset.id) {
            const id = parseInt(modal.dataset.id);
            const log = await db.logs.get(id);
            if (log) {
                editingLogId = id;
                toggleModal('log-detail-modal', false);
                
                // 借金(マイナス)ならビール、返済(プラス)なら運動
                if (log.minutes < 0) {
                    UI.openBeerModal(log);
                } else {
                    // 運動モーダルを編集モードで開く
                    UI.openManualInput(log);
                }
            }
        }
    });

    // 【追加】運動セレクトボックスを変えたらラベルも変える (bindEvents内の適当な場所に追加)
    document.getElementById('exercise-select')?.addEventListener('change', function() {
        const nameEl = document.getElementById('manual-exercise-name');
        if (nameEl && EXERCISE[this.value]) {
            nameEl.textContent = EXERCISE[this.value].label;
        }
    });

    document.getElementById('btn-toggle-edit-mode')?.addEventListener('click', UI.toggleEditMode);
    document.getElementById('btn-select-all')?.addEventListener('click', UI.toggleSelectAll);

    document.getElementById('btn-bulk-delete')?.addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.log-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
        if (ids.length > 0) {
            await bulkDeleteLogs(ids);
        }
    });

    document.getElementById('log-list')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('log-checkbox')) {
            const count = document.querySelectorAll('.log-checkbox:checked').length;
            UI.updateBulkCount(count);
        }
    });

    // 【追加】ヒートマップ期間移動イベント (安全対策済み)
    document.getElementById('heatmap-prev')?.addEventListener('click', () => {
        StateManager.incrementHeatmapOffset(); // StateManagerを使用
        refreshUI();
    });

    document.getElementById('heatmap-next')?.addEventListener('click', () => {
        // StateManagerを使用
        if (StateManager.heatmapOffset > 0) {
            StateManager.decrementHeatmapOffset();
            refreshUI();
        }
    });

    // 【追加】全データ削除イベント (安全対策済み)
    document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
        if(confirm('本当に全てのデータを削除して初期化しますか？\nこの操作は取り消せません。')) {
            if(confirm('これまでの記録が全て消えます。よろしいですか？')) {
                try {
                    await db.logs.clear();
                    await db.checks.clear();
                    Object.values(APP.STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
                    alert('初期化しました。アプリを再読み込みします。');
                    location.reload();
                } catch(e) {
                    console.error(e);
                    UI.showMessage('削除に失敗しました', 'error');
                }
            }
        }
    });

    // ヒートマップのクリックイベント委譲 (安全対策済み)
    document.getElementById('heatmap-grid')?.addEventListener('click', async (e) => {
        const cell = e.target.closest('.heatmap-cell');
        if (cell && cell.dataset.date) {
            const dateStr = cell.dataset.date;
            const checks = await db.checks.toArray();
            const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === dateStr);
            
            if (target) {
                editingCheckId = target.id;
                UI.openCheckModal(target);
            } else {
                editingCheckId = null;
                UI.openCheckModal(null, dateStr);
            }
        }
    });

    // ホーム画面の健康チェック編集ボタン (安全対策済み)
    document.getElementById('check-status')?.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-edit-check') || e.target.closest('#btn-record-check')) {
            const todayStr = dayjs().format('YYYY-MM-DD');
            const checks = await db.checks.toArray();
            const target = checks.find(c => dayjs(c.timestamp).format('YYYY-MM-DD') === todayStr);
            
            if (target) editingCheckId = target.id;
            else editingCheckId = null;
            
            UI.openCheckModal(target);
        }
    });

    document.getElementById('quick-input-area')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-beer-btn');
        if (btn) {
            editingLogId = null;
            UI.openBeerModal(null);
            setTimeout(() => {
                const styleSelect = document.getElementById('beer-select');
                const sizeSelect = document.getElementById('beer-size');
                if(styleSelect) styleSelect.value = btn.dataset.style;
                if(sizeSelect) sizeSelect.value = btn.dataset.size;
            }, 50);
        }
    });

    document.getElementById('beer-select')?.addEventListener('change', function() {
        const style = this.value;
        const abvInput = document.getElementById('preset-abv');
        if (style && abvInput) {
            const spec = STYLE_SPECS[style];
            if (spec) abvInput.value = spec.abv;
        }
    });
    
    // 【追加】システム（端末）のテーマ変更をリアルタイムで監視
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // 現在のアプリ設定を取得
        const currentSetting = localStorage.getItem(APP.STORAGE_KEYS.THEME) || APP.DEFAULTS.THEME;
        
        // 設定が「端末に合わせる(system)」の場合のみ、自動で切り替える
        if (currentSetting === 'system') {
            // テーマを再適用（UI.applyTheme内で再度システム設定を判定してくれる）
            UI.applyTheme('system');
            
            // 重要：グラフの色（文字やグリッド線）を更新するために画面を再描画する
            refreshUI();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    UI.initDOM();

    const savedTheme = localStorage.getItem(APP.STORAGE_KEYS.THEME) || APP.DEFAULTS.THEME;
    UI.applyTheme(savedTheme);

    // イベント登録を実行 (エラーが出ても後続処理が走るように修正済み)
    bindEvents();
    
    await migrateData();

    // Select options setup
    const exSelect = document.getElementById('exercise-select'); 
    if (exSelect) {
        Object.keys(EXERCISE).forEach(k => { 
            const o = document.createElement('option'); 
            o.value = k; o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`; exSelect.appendChild(o); 
        });
        exSelect.value = Store.getDefaultRecordExercise();
    }
    
    const settingExSelect = document.getElementById('setting-base-exercise');
    if (settingExSelect) {
        settingExSelect.innerHTML = '';
        Object.keys(EXERCISE).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`; settingExSelect.appendChild(o); });
    }
    const settingDefExSelect = document.getElementById('setting-default-record-exercise');
    if (settingDefExSelect) {
        settingDefExSelect.innerHTML = '';
        Object.keys(EXERCISE).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`;
            settingDefExSelect.appendChild(o);
        });
    }

    const zs = document.getElementById('beer-size'); 
    if (zs) {
        Object.keys(SIZE_DATA).forEach(k => { 
            const o = document.createElement('option'); o.value = k; o.textContent = SIZE_DATA[k].label; 
            if(k === '350') o.selected = true; zs.appendChild(o); 
        });
    }

    const p = Store.getProfile();
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
    setVal('weight-input', p.weight);
    setVal('height-input', p.height);
    setVal('age-input', p.age);
    setVal('gender-input', p.gender);

    UI.updateModeSelector();
    document.getElementById('mode-selector')?.classList.remove('opacity-0');

    UI.setBeerMode('mode1');
    updateBeerSelectOptions(); 
    
    const st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    if(st) { 
        timerControl.start(); 
        UI.switchTab('tab-record'); 
    } else { 
        UI.switchTab('tab-home'); 
        
        // 【追加】初回ユーザー判定 & 設定画面オートオープン
        // localStorageに身長・体重のキーがまだない場合、初回とみなす
        if (!localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) {
            // 少し遅らせて表示（画面描画が落ち着いてから）
            setTimeout(() => {
                UI.openSettings();
                UI.showMessage('👋 ようこそ！まずはプロフィールと\n基準にする運動を設定しましょう！', 'success');
            }, 800);
        }
    }

    await refreshUI();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); });
}