import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { db, Store, ExternalApp } from './store.js';
import { Calc } from './logic.js';
import { UI, currentState, updateBeerSelectOptions, refreshUI, toggleModal } from './ui.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/* ==========================================================================
   Global Window Registration
   (HTMLの onclick="..." から呼び出せるように window オブジェクトに登録)
   ========================================================================== */

// UI操作用
window.UI = UI; 
window.toggleModal = toggleModal;

// タブ切り替え
window.switchTab = async (tabId) => {
    if (!tabId) return;
    const targetTab = document.getElementById(tabId);
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (!targetTab || !targetNav) return;

    // タブの表示切り替え
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    targetTab.classList.add('active');
    
    // ナビゲーションボタンのスタイル切り替え
    document.querySelectorAll('.nav-item').forEach(el => { 
        el.classList.remove('text-indigo-600'); 
        el.classList.add('text-gray-400'); 
    });
    targetNav.classList.remove('text-gray-400');
    targetNav.classList.add('text-indigo-600');
    
    // 履歴タブが開かれた場合はグラフ等を再描画
    if (tabId === 'tab-history') {
        refreshUI(); 
    }
};

// ビール換算モードの切り替え
window.setBeerMode = (mode) => {
    currentState.beerMode = mode;
    const lBtn = document.getElementById('btn-mode-1');
    const hBtn = document.getElementById('btn-mode-2');
    const liq = document.getElementById('tank-liquid');
    
    if (mode === 'mode1') {
        lBtn.className = "px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm bg-indigo-600 text-white";
        hBtn.className = "px-4 py-2 rounded-md text-xs font-bold transition-all text-gray-500 hover:bg-white";
        liq.classList.remove('mode2'); liq.classList.add('mode1');
    } else {
        hBtn.className = "px-4 py-2 rounded-md text-xs font-bold transition-all shadow-sm bg-indigo-600 text-white";
        lBtn.className = "px-4 py-2 rounded-md text-xs font-bold transition-all text-gray-500 hover:bg-white";
        liq.classList.remove('mode1'); liq.classList.add('mode2');
    }
    refreshUI();
};

// 設定保存
window.saveSettings = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    const h = parseFloat(document.getElementById('height-input').value);
    const a = parseInt(document.getElementById('age-input').value);
    const g = document.getElementById('gender-input').value;
    const m1 = document.getElementById('setting-mode-1').value;
    const m2 = document.getElementById('setting-mode-2').value;
    const be = document.getElementById('setting-base-exercise').value;
    
    if (w && h && a && m1 && m2 && be) {
        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, w);
        localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, h);
        localStorage.setItem(APP.STORAGE_KEYS.AGE, a);
        localStorage.setItem(APP.STORAGE_KEYS.GENDER, g);
        localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
        localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
        localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, be);
        
        toggleModal('settings-modal', false);
        
        // 画面の更新
        UI.updateModeButtons();
        updateBeerSelectOptions(); 
        refreshUI();
        
        UI.showMessage('設定を保存しました', 'success');
    } else {
        UI.showMessage('すべての項目を入力してください', 'error');
    }
};

// 飲酒記録（借金）の送信
window.handleBeerSubmit = async () => {
    const s = document.getElementById('beer-select').value;
    const z = document.getElementById('beer-size').value;
    const c = parseFloat(document.getElementById('beer-count').value);
    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    const rating = parseInt(document.getElementById('beer-rating').value) || 0;
    const memo = document.getElementById('beer-memo').value;
    const useUntappd = document.getElementById('untappd-check').checked;

    if (!s || !z || !c) return UI.showMessage('入力を確認してください', 'error');

    const kcal = CALORIES.STYLES[s] * SIZE_DATA[z].ratio * c;
    const min = kcal / Calc.burnRate(EXERCISE['stepper'].mets);
    
    await db.logs.add({ 
        name: `${s} x${c}`, 
        type: '借金', 
        minutes: -Math.round(min), 
        timestamp: Date.now(), 
        brewery: brewery, 
        brand: brand,
        rating: rating,
        memo: memo
    });
    
    UI.showMessage('飲酒を記録しました 🍺', 'success'); 
    toggleModal('beer-modal', false); 
    await refreshUI();

    // フォームのリセット
    document.getElementById('beer-brewery').value = '';
    document.getElementById('beer-brand').value = '';
    document.getElementById('beer-rating').value = '0';
    document.getElementById('beer-memo').value = '';
    document.getElementById('untappd-check').checked = false;

    if (useUntappd) {
        let searchTerm = brand;
        if (brewery) searchTerm = `${brewery} ${brand}`;
        if (!searchTerm) searchTerm = s;
        ExternalApp.searchUntappd(searchTerm);
    }
};

// 運動手入力の送信
window.handleManualExerciseSubmit = async () => { 
    const m = parseFloat(document.getElementById('manual-minutes').value); 
    if(!m) return UI.showMessage('時間を入力','error'); 
    
    await recordExercise(document.getElementById('exercise-select').value, m); 
    
    document.getElementById('manual-minutes').value=''; 
    toggleModal('manual-exercise-modal', false); 
};

// デイリーチェックの送信
window.handleCheckSubmit = async () => { 
    const f = document.getElementById('check-form');
    const isDry = document.getElementById('is-dry-day').checked; 
    const w = document.getElementById('check-weight').value;

    let ts = Date.now(); 
    if(document.getElementById('record-as-yesterday').checked) ts -= ONE_DAY_MS; 
    
    const entry = {
        isDryDay: isDry, 
        waistEase: f.elements['waistEase'].checked, 
        footLightness: f.elements['footLightness'].checked, 
        waterOk: isDry ? null : f.elements['waterOk'].checked, 
        fiberOk: isDry ? null : f.elements['fiberOk'].checked, 
        timestamp: ts
    };

    if(w) entry.weight = parseFloat(w);

    await db.checks.add(entry); 
    
    UI.showMessage('チェック完了！','success'); 
    toggleModal('check-modal', false); 
    
    // フォームリセット
    document.getElementById('is-dry-day').checked = false; 
    document.getElementById('record-as-yesterday').checked = false; 
    document.getElementById('check-weight').value = '';
    document.getElementById('drinking-section').classList.remove('hidden-area'); 
    
    await refreshUI(); 
};

// ログ削除
window.deleteLog = async (timestamp) => {
    if (!confirm('削除しますか？')) return;
    await db.logs.where('timestamp').equals(timestamp).delete();
    UI.showMessage('削除しました', 'success');
    await refreshUI();
};

/* ==========================================================================
   Internal Logic & Functions
   ========================================================================== */

// 運動記録の共通処理
async function recordExercise(t, m) { 
    const allLogs = await db.logs.toArray();
    const allChecks = await db.checks.toArray();
    const streak = Calc.getCurrentStreak(allLogs, allChecks);
    const multiplier = Calc.getStreakMultiplier(streak);

    const i = EXERCISE[t];
    
    const baseKcal = Calc.burnRate(i.mets) * m;
    const bonusKcal = baseKcal * multiplier;
    
    const eq = Calc.stepperEq(bonusKcal);

    await db.logs.add({
        name: `${i.icon} ${i.label}`, 
        type: '返済', 
        minutes: Math.round(eq), 
        rawMinutes: m, 
        timestamp: Date.now(),
        memo: multiplier > 1.0 ? `🔥 Streak Bonus x${multiplier}` : ''
    }); 
    
    if (multiplier > 1.0) {
        UI.showMessage(`${i.label} ${m}分 記録！\n🔥連続休肝ボーナス！返済効率 x${multiplier}`, 'success'); 
    } else {
        UI.showMessage(`${i.label} ${m}分 記録！`, 'success'); 
    }
    
    await refreshUI(); 
}
// グローバルから呼べるように登録
window.recordExercise = recordExercise;

// データ管理 (CSV/JSON/Clipboard)
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
window.DataManager = DataManager;

// タイマー機能
const updTm = (st) => { 
    const e = Date.now() - st; 
    const mm = Math.floor(e/60000).toString().padStart(2,'0');
    const ss = Math.floor((e%60000)/1000).toString().padStart(2,'0');
    const display = document.getElementById('timer-display');
    if(display) display.textContent = `${mm}:${ss}`;
};

window.timerControl = {
    start: () => {
        if (currentState.timerId) return;
        let st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
        if (!st) {
            st = Date.now();
            try { localStorage.setItem(APP.STORAGE_KEYS.TIMER_START, st); } catch (err) { console.error(err); }
        } else {
            st = parseInt(st, 10);
            const elapsed = Date.now() - st;
            if (elapsed > ONE_DAY_MS) {
                console.warn('Timer start too old, resetting.');
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
        currentState.timerId = setInterval(() => updTm(st), 1000);
    },
    stop: async () => {
        const st = parseInt(localStorage.getItem(APP.STORAGE_KEYS.TIMER_START) || '0', 10);
        if (!st) return;
        
        if (currentState.timerId) {
            clearInterval(currentState.timerId);
            currentState.timerId = null;
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

/* ==========================================================================
   Initialization & Migration
   ========================================================================== */

// 旧LocalStorageデータからの移行処理
async function migrateData() {
    const oldLogs = localStorage.getItem(APP.STORAGE_KEYS.LOGS);
    const oldChecks = localStorage.getItem(APP.STORAGE_KEYS.CHECKS);

    if (oldLogs) {
        try {
            const logs = JSON.parse(oldLogs);
            if (Array.isArray(logs) && logs.length > 0) {
                await db.logs.bulkAdd(logs);
                console.log('Logs migrated:', logs.length);
            }
        } catch (e) { console.error('Migration error (logs)', e); }
        localStorage.removeItem(APP.STORAGE_KEYS.LOGS);
    }

    if (oldChecks) {
        try {
            const checks = JSON.parse(oldChecks);
            if (Array.isArray(checks) && checks.length > 0) {
                await db.checks.bulkAdd(checks);
                console.log('Checks migrated:', checks.length);
            }
        } catch (e) { console.error('Migration error (checks)', e); }
        localStorage.removeItem(APP.STORAGE_KEYS.CHECKS);
    }
}

// アプリ起動時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    // データの移行（必要な場合）
    await migrateData();

    // 運動セレクトボックスの初期化
    const exSelect = document.getElementById('exercise-select'); 
    Object.keys(EXERCISE).forEach(k => { 
        const o = document.createElement('option'); 
        o.value = k; 
        o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`; 
        exSelect.appendChild(o); 
    });
    
    // 設定画面の運動セレクトボックスも同様に
    const settingExSelect = document.getElementById('setting-base-exercise');
    if (settingExSelect) {
        settingExSelect.innerHTML = '';
        Object.keys(EXERCISE).forEach(k => {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`;
            settingExSelect.appendChild(o);
        });
    }

    // ビールサイズセレクトボックスの初期化
    const zs = document.getElementById('beer-size'); 
    Object.keys(SIZE_DATA).forEach(k => { 
        const o = document.createElement('option'); 
        o.value = k; 
        o.textContent = SIZE_DATA[k].label; 
        if(k === '350') o.selected = true; 
        zs.appendChild(o); 
    });

    // プロフィール設定の読み込み
    const p = Store.getProfile();
    document.getElementById('weight-input').value = p.weight;
    document.getElementById('height-input').value = p.height;
    document.getElementById('age-input').value = p.age;
    document.getElementById('gender-input').value = p.gender;

    // UI初期状態の設定
    UI.updateModeButtons();
    window.setBeerMode('mode1');
    updateBeerSelectOptions(); 
    
    // タイマー復帰 or タブ初期化
    const st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    if(st) { 
        window.timerControl.start(); 
        window.switchTab('tab-record'); 
    } else { 
        window.switchTab('tab-home'); 
    }

    // データの描画
    await refreshUI();
});

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => console.log('Service Worker registered!', reg))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}