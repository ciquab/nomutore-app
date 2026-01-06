import { APP, EXERCISE, SIZE_DATA, CALORIES } from './constants.js';
import { db, Store, ExternalApp } from './store.js';
import { Calc } from './logic.js';
import { UI, currentState, updateBeerSelectOptions, refreshUI, toggleModal } from './ui.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Helper: 日付文字列(YYYY-MM-DD)を、その日の12:00のTimestampに変換
const getDateTimestamp = (dateStr) => {
    if (!dateStr) return Date.now();
    const d = new Date(dateStr);
    d.setHours(12, 0, 0, 0); 
    return d.getTime();
};

/* ==========================================================================
   Event Handling & App Logic
   ========================================================================== */

// 設定保存
const handleSaveSettings = () => {
    const w = parseFloat(document.getElementById('weight-input').value);
    const h = parseFloat(document.getElementById('height-input').value);
    const a = parseInt(document.getElementById('age-input').value);
    const g = document.getElementById('gender-input').value;
    const m1 = document.getElementById('setting-mode-1').value;
    const m2 = document.getElementById('setting-mode-2').value;
    const be = document.getElementById('setting-base-exercise').value;
    const theme = document.getElementById('theme-input').value;
    
    if (w && h && a && m1 && m2 && be) {
        localStorage.setItem(APP.STORAGE_KEYS.WEIGHT, w);
        localStorage.setItem(APP.STORAGE_KEYS.HEIGHT, h);
        localStorage.setItem(APP.STORAGE_KEYS.AGE, a);
        localStorage.setItem(APP.STORAGE_KEYS.GENDER, g);
        localStorage.setItem(APP.STORAGE_KEYS.MODE1, m1);
        localStorage.setItem(APP.STORAGE_KEYS.MODE2, m2);
        localStorage.setItem(APP.STORAGE_KEYS.BASE_EXERCISE, be);
        localStorage.setItem(APP.STORAGE_KEYS.THEME, theme); // テーマ保存
        
        toggleModal('settings-modal', false);
        UI.updateModeButtons();
        updateBeerSelectOptions(); 
        
        // テーマ即時適用
        UI.applyTheme(theme);
        
        refreshUI();
        UI.showMessage('設定を保存しました', 'success');
    } else {
        UI.showMessage('すべての項目を入力してください', 'error');
    }
};

// 飲酒記録（借金）の送信
const handleBeerSubmit = async (e) => {
    e.preventDefault();
    const dateVal = document.getElementById('beer-date').value;
    const brewery = document.getElementById('beer-brewery').value;
    const brand = document.getElementById('beer-brand').value;
    const rating = parseInt(document.getElementById('beer-rating').value) || 0;
    const memo = document.getElementById('beer-memo').value;
    const useUntappd = document.getElementById('untappd-check').checked;
    
    // 日付指定があればその日付、なければ現在日時
    const ts = dateVal ? getDateTimestamp(dateVal) : Date.now();

    // モード判定
    const isCustom = !document.getElementById('beer-input-custom').classList.contains('hidden');
    
    let logName = '';
    let logStyle = '';
    let logSize = '';
    let totalKcal = 0;

    if (isCustom) {
        // カスタム入力
        const abv = parseFloat(document.getElementById('custom-abv').value);
        const ml = parseFloat(document.getElementById('custom-amount').value);
        const type = document.querySelector('input[name="customType"]:checked').value; // dry or sweet

        if (!abv || !ml) return UI.showMessage('度数と量を入力してください', 'error');

        // 純アルコール量 (g) = ml * (abv/100) * 0.8
        const alcoholG = ml * (abv / 100) * 0.8;
        
        // カロリー計算
        // アルコール分: 7kcal/g
        // 糖質分(Sweet): 0.15kcal/ml (仮定)
        let kcal = alcoholG * 7;
        if (type === 'sweet') {
             kcal += ml * 0.15;
        }
        
        totalKcal = kcal;
        logName = `Custom ${abv}% ${ml}ml` + (type==='dry' ? '🔥' : '🍺');
        logStyle = 'Custom';
        logSize = `${ml}ml`;

    } else {
        // プリセット入力 (既存ロジック)
        const s = document.getElementById('beer-select').value;
        const z = document.getElementById('beer-size').value;
        const c = parseFloat(document.getElementById('beer-count').value);

        if (!s || !z || !c) return UI.showMessage('入力を確認してください', 'error');

        totalKcal = CALORIES.STYLES[s] * SIZE_DATA[z].ratio * c;
        logName = `${s} x${c}`;
        logStyle = s;
        logSize = z;
    }

    // 借金時間（分）に変換
    const min = totalKcal / Calc.burnRate(EXERCISE['stepper'].mets);

    await db.logs.add({ 
        name: logName, 
        type: '借金', 
        style: logStyle, 
        size: logSize,
        minutes: -Math.round(min), 
        timestamp: ts, 
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
    document.getElementById('beer-count').value = '';

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
    if(!m) return UI.showMessage('時間を入力','error'); 
    
    await recordExercise(document.getElementById('exercise-select').value, m, dateVal); 
    
    document.getElementById('manual-minutes').value=''; 
    toggleModal('manual-exercise-modal', false); 
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

    if(w) entry.weight = parseFloat(w);

    await db.checks.add(entry); 
    
    UI.showMessage('チェック完了！','success'); 
    toggleModal('check-modal', false); 
    
    document.getElementById('is-dry-day').checked = false; 
    document.getElementById('check-weight').value = '';
    document.getElementById('drinking-section').classList.remove('hidden-area'); 
    
    await refreshUI(); 
};

const deleteLog = async (timestamp) => {
    if (!confirm('削除しますか？')) return;
    await db.logs.where('timestamp').equals(timestamp).delete();
    UI.showMessage('削除しました', 'success');
    await refreshUI();
};

const handleShare = async () => {
    // ランクと残高を取得してシェアテキストを作成
    const rankTitle = document.getElementById('rank-title').textContent || 'Rookie';
    const balanceText = document.getElementById('tank-minutes').textContent || '0 min';
    const isPositive = balanceText.includes('+');
    
    let text = '';
    if (isPositive) {
        text = `現在 ${balanceText} の貯金中！ランク: ${rankTitle} #ノムトレ #飲んだら動く`;
    } else {
        text = `現在 ${balanceText} の借金中... 運動して返済します！ランク: ${rankTitle} #ノムトレ`;
    }

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
        // Fallback for PC etc
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
        window.open(twitterUrl, '_blank');
    }
};

/* ==========================================================================
   Swipe Navigation Logic
   ========================================================================== */

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

    // 水平方向の移動が大きく、垂直方向の移動が小さい場合のみスワイプと判定
    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
        const currentTabId = document.querySelector('.tab-content.active').id;
        const currentIndex = TABS.indexOf(currentTabId);
        
        if (diffX < 0) {
            // Left swipe (Next tab)
            if (currentIndex < TABS.length - 1) {
                UI.switchTab(TABS[currentIndex + 1]);
            }
        } else {
            // Right swipe (Prev tab)
            if (currentIndex > 0) {
                UI.switchTab(TABS[currentIndex - 1]);
            }
        }
    }
};

/* ==========================================================================
   Internal Logic & Functions
   ========================================================================== */

async function recordExercise(t, m, dateVal = null) { 
    const allLogs = await db.logs.toArray();
    const allChecks = await db.checks.toArray();
    const streak = Calc.getCurrentStreak(allLogs, allChecks);
    const multiplier = Calc.getStreakMultiplier(streak);

    const i = EXERCISE[t];
    const baseKcal = Calc.burnRate(i.mets) * m;
    const bonusKcal = baseKcal * multiplier;
    const eq = Calc.stepperEq(bonusKcal);

    const ts = dateVal ? getDateTimestamp(dateVal) : Date.now();

    await db.logs.add({
        name: `${i.icon} ${i.label}`, 
        type: '返済', 
        minutes: Math.round(eq), 
        rawMinutes: m, 
        timestamp: ts,
        memo: multiplier > 1.0 ? `🔥 Streak Bonus x${multiplier}` : ''
    }); 
    
    if (multiplier > 1.0) {
        UI.showMessage(`${i.label} ${m}分 記録！\n🔥連続休肝ボーナス！返済効率 x${multiplier}`, 'success'); 
    } else {
        UI.showMessage(`${i.label} ${m}分 記録！`, 'success'); 
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
    // Header & Tabs
    document.getElementById('btn-open-help')?.addEventListener('click', UI.openHelp);
    document.getElementById('btn-open-settings')?.addEventListener('click', UI.openSettings);
    
    document.getElementById('nav-tab-home').addEventListener('click', () => UI.switchTab('tab-home'));
    document.getElementById('nav-tab-record').addEventListener('click', () => UI.switchTab('tab-record'));
    document.getElementById('nav-tab-history').addEventListener('click', () => UI.switchTab('tab-history'));

    // Swipe Events
    const swipeArea = document.getElementById('swipe-area');
    if (swipeArea) {
        swipeArea.addEventListener('touchstart', handleTouchStart, {passive: true});
        swipeArea.addEventListener('touchend', handleTouchEnd);
    }

    // Mode Buttons
    document.getElementById('btn-mode-1').addEventListener('click', () => UI.setBeerMode('mode1'));
    document.getElementById('btn-mode-2').addEventListener('click', () => UI.setBeerMode('mode2'));

    // Chart Filters
    document.getElementById('chart-filters').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentState.chartRange = e.target.dataset.range;
            refreshUI();
        }
    });

    // Beer Modal Tabs
    // オプショナルチェーン (?.) を追加して、要素がない場合のエラーを防止
    document.getElementById('tab-beer-preset')?.addEventListener('click', () => UI.switchBeerInputTab('preset'));
    document.getElementById('tab-beer-custom')?.addEventListener('click', () => UI.switchBeerInputTab('custom'));
    
    // Custom Amount Buttons
    document.querySelectorAll('.btn-quick-amount').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('custom-amount').value = this.dataset.amount;
        });
    });

    // Modals Close
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-bg') || e.target.closest('.modal-content').parentNode;
            toggleModal(modal.id, false);
        });
    });
    // Modal Backgound Click
    document.querySelectorAll('.modal-bg').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) toggleModal(modal.id, false);
        });
    });

    // Record Tab
    document.getElementById('start-stepper-btn').addEventListener('click', timerControl.start);
    document.getElementById('stop-stepper-btn').addEventListener('click', timerControl.stop);
    document.getElementById('manual-record-btn').addEventListener('click', UI.openManualInput);
    document.getElementById('btn-open-beer').addEventListener('click', () => UI.openBeerModal());
    document.getElementById('btn-open-check').addEventListener('click', UI.openCheckModal);
    document.getElementById('btn-share-sns').addEventListener('click', handleShare); // Share Button Event
    
    // Forms
    document.getElementById('beer-form').addEventListener('submit', handleBeerSubmit);
    document.getElementById('check-form').addEventListener('submit', handleCheckSubmit);
    document.getElementById('btn-submit-manual').addEventListener('click', handleManualExerciseSubmit);
    document.getElementById('btn-save-settings').addEventListener('click', handleSaveSettings);

    // Check Form Logic
    document.getElementById('is-dry-day').addEventListener('change', function() { UI.toggleDryDay(this); });

    // History Tab
    document.getElementById('btn-export-logs').addEventListener('click', () => DataManager.exportCSV('logs'));
    document.getElementById('btn-export-checks').addEventListener('click', () => DataManager.exportCSV('checks'));
    document.getElementById('btn-copy-data').addEventListener('click', DataManager.copyToClipboard);
    document.getElementById('btn-download-json').addEventListener('click', DataManager.exportJSON);
    document.getElementById('btn-import-json').addEventListener('change', function() { DataManager.importJSON(this); });

    // Event Delegation for Dynamic Elements
    
    // 1. Log List Delete Buttons
    document.getElementById('log-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-log-btn');
        if (btn) {
            deleteLog(parseInt(btn.dataset.id));
        }
    });

    // 2. Check Status Edit/Record Buttons
    document.getElementById('check-status').addEventListener('click', (e) => {
        if (e.target.closest('#btn-edit-check') || e.target.closest('#btn-record-check')) {
            UI.openCheckModal();
        }
    });

    // 3. Quick Input Buttons
    document.getElementById('quick-input-area').addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-beer-btn');
        if (btn) {
            UI.openBeerModal(btn.dataset.style, btn.dataset.size);
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // 最初にテーマを適用（チラつき防止のため、HTMLのscriptでもやっているが、念のため）
    const savedTheme = localStorage.getItem(APP.STORAGE_KEYS.THEME) || APP.DEFAULTS.THEME;
    UI.applyTheme(savedTheme);

    bindEvents();
    await migrateData();

    // Select options setup
    const exSelect = document.getElementById('exercise-select'); 
    Object.keys(EXERCISE).forEach(k => { 
        const o = document.createElement('option'); 
        o.value = k; o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`; exSelect.appendChild(o); 
    });
    
    const settingExSelect = document.getElementById('setting-base-exercise');
    if (settingExSelect) {
        settingExSelect.innerHTML = '';
        Object.keys(EXERCISE).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = `${EXERCISE[k].icon} ${EXERCISE[k].label}`; settingExSelect.appendChild(o); });
    }

    const zs = document.getElementById('beer-size'); 
    Object.keys(SIZE_DATA).forEach(k => { 
        const o = document.createElement('option'); o.value = k; o.textContent = SIZE_DATA[k].label; 
        if(k === '350') o.selected = true; zs.appendChild(o); 
    });

    // Load Profile
    const p = Store.getProfile();
    document.getElementById('weight-input').value = p.weight;
    document.getElementById('height-input').value = p.height;
    document.getElementById('age-input').value = p.age;
    document.getElementById('gender-input').value = p.gender;

    // Initialize UI
    UI.updateModeButtons();
    // ボタンのフェードイン
    document.getElementById('mode-selector').classList.remove('opacity-0');

    UI.setBeerMode('mode1');
    updateBeerSelectOptions(); 
    
    const st = localStorage.getItem(APP.STORAGE_KEYS.TIMER_START);
    if(st) { timerControl.start(); UI.switchTab('tab-record'); } else { UI.switchTab('tab-home'); }

    await refreshUI();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./service-worker.js'); });
}