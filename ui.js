import { APP, EXERCISE, CALORIES, SIZE_DATA } from './constants.js';
import { Calc } from './logic.js';
import { Store, db } from './store.js';
// Day.js をCDNからインポート
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';
// 紙吹雪ライブラリ
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';

// 【変更】外部から直接アクセスできない非公開の状態変数
const _state = { 
    beerMode: 'mode1', 
    chart: null, 
    timerId: null,
    chartRange: '1w',
    isEditMode: false,
    heatmapOffset: 0,
    logLimit: 50
};

// 【新規】状態へのアクセスを管理するマネージャー
export const StateManager = {
    // 読み取り専用プロパティ (Getters)
    get beerMode() { return _state.beerMode; },
    get chart() { return _state.chart; },
    get timerId() { return _state.timerId; },
    get chartRange() { return _state.chartRange; },
    get isEditMode() { return _state.isEditMode; },
    get heatmapOffset() { return _state.heatmapOffset; },
    get logLimit() { return _state.logLimit; },

    // 状態更新メソッド (Setters) - ここにログを仕込めば変更を追跡可能
    setBeerMode: (v) => { _state.beerMode = v; },
    setChart: (v) => { _state.chart = v; },
    setTimerId: (v) => { _state.timerId = v; },
    setChartRange: (v) => { _state.chartRange = v; },
    setEditMode: (v) => { _state.isEditMode = v; },
    setHeatmapOffset: (v) => { _state.heatmapOffset = v; },
    setLogLimit: (v) => { _state.logLimit = v; },
    
    // インクリメント/デクリメントなどの便利メソッド
    incrementHeatmapOffset: () => { _state.heatmapOffset++; },
    decrementHeatmapOffset: () => { if(_state.heatmapOffset > 0) _state.heatmapOffset--; },
    incrementLogLimit: (amount = 50) => { _state.logLimit += amount; },
    toggleEditMode: () => { _state.isEditMode = !_state.isEditMode; return _state.isEditMode; }
};

// DOM要素のキャッシュ用オブジェクト
const DOM = {
    isInitialized: false,
    elements: {}
};

// XSS対策: HTMLエスケープ関数
const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m];
    });
};

export const toggleModal = (id, show) => { 
    const el = document.getElementById(id);
    if (el) {
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
};

export const UI = {
    initDOM: () => {
        if (DOM.isInitialized) return;
        
        const ids = [
            'message-box', 'drinking-section', 
            'beer-date', 'beer-select', 'beer-size', 'beer-count',
            'beer-input-preset', 'beer-input-custom',
            'custom-abv', 'custom-amount', 
            'tab-beer-preset', 'tab-beer-custom',
            'check-date', 'check-weight', 
            'manual-exercise-name', 'manual-date', 
            'weight-input', 'height-input', 'age-input', 'gender-input',
            'setting-mode-1', 'setting-mode-2', 'setting-base-exercise', 'theme-input','setting-default-record-exercise',
            'btn-mode-1', 'btn-mode-2', 
            'tank-liquid', 'tank-empty-icon', 'tank-cans', 'tank-minutes', 'tank-message',
            'log-list', 'history-base-label',
            'liver-rank-card', 'rank-title', 'dry-count', 'rank-progress', 'rank-next-msg',
            'check-status', 'streak-count', 'streak-badge', 'weekly-stamps', 'weekly-status-text',
            'chart-filters', 'quick-input-area', 'beer-select-mode-label',
            'tab-history', 
            'heatmap-grid',
            'log-detail-modal', 'detail-icon', 'detail-title', 'detail-date', 'detail-minutes', 
            'detail-beer-info', 'detail-style', 'detail-size', 'detail-brand', 
            'detail-memo-container', 'detail-rating', 'detail-memo',
            'btn-detail-edit', 'btn-detail-delete',
            'beer-submit-btn', 'check-submit-btn',
            'btn-toggle-edit-mode', 'bulk-action-bar', 'btn-bulk-delete', 'bulk-selected-count',
            'btn-select-all', 'log-container',
            'heatmap-prev', 'heatmap-next', 'heatmap-period-label', 'btn-reset-all'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) DOM.elements[id] = el;
        });
        
        UI.injectPresetAbvInput();
        UI.injectHeatmapContainer();

        DOM.isInitialized = true;
    },

    injectPresetAbvInput: () => {
        const sizeSelect = DOM.elements['beer-size'];
        if (!sizeSelect || document.getElementById('preset-abv-container')) return;

        const container = document.createElement('div');
        container.id = 'preset-abv-container';
        container.className = "mb-4";
        container.innerHTML = `
            <label class="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                度数 (ABV %) <span class="text-xs font-normal text-gray-500">※変更でカロリー自動補正</span>
            </label>
            <div class="relative">
                <input type="number" id="preset-abv" step="0.1" placeholder="5.0" 
                    class="shadow-sm appearance-none border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded w-full py-3 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 transition">
                <span class="absolute right-3 top-3 text-gray-400 font-bold">%</span>
            </div>
        `;

        sizeSelect.parentNode.parentNode.insertBefore(container, DOM.elements['beer-count'].parentNode);
        DOM.elements['preset-abv'] = document.getElementById('preset-abv');
    },

    injectHeatmapContainer: () => {
        const historyTab = DOM.elements['tab-history'];
        const target = document.getElementById('chart-container');
        if (!historyTab || !target || document.getElementById('heatmap-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'heatmap-wrapper';
        wrapper.className = "mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4";
        
        wrapper.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider">Continuity</h3>
                <div class="flex items-center gap-2">
                    <button id="heatmap-prev" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 active:scale-95 transition">◀</button>
                    <span id="heatmap-period-label" class="text-[10px] font-bold text-gray-500">Last 5 Weeks</span>
                    <button id="heatmap-next" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 active:scale-95 transition" disabled>▶</button>
                </div>
            </div>
            
            <div id="heatmap-grid" class="grid grid-cols-7 gap-1 mb-3">
                <div class="text-[10px] text-center text-gray-300">日</div>
                <div class="text-[10px] text-center text-gray-300">月</div>
                <div class="text-[10px] text-center text-gray-300">火</div>
                <div class="text-[10px] text-center text-gray-300">水</div>
                <div class="text-[10px] text-center text-gray-300">木</div>
                <div class="text-[10px] text-center text-gray-300">金</div>
                <div class="text-[10px] text-center text-gray-300">土</div>
            </div>

            <div class="flex flex-wrap justify-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-emerald-500 mr-1"></span>休肝+運動</div>
                <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-green-400 mr-1"></span>休肝日</div>
                <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-blue-400 mr-1"></span>飲酒+運動</div>
                <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-red-400 mr-1"></span>飲酒のみ</div>
                <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-cyan-400 mr-1"></span>運動のみ</div>
            </div>
        `;

        target.parentNode.insertBefore(wrapper, target);
        DOM.elements['heatmap-grid'] = document.getElementById('heatmap-grid');
    },

    showConfetti: () => {
        const duration = 2000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#10B981', '#F59E0B', '#6366F1']
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#10B981', '#F59E0B', '#6366F1']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    },

    showMessage: (msg, type) => {
        const mb = DOM.elements['message-box'] || document.getElementById('message-box');
        if (!mb) return;
        
        mb.textContent = msg; 
        mb.className = `fixed top-4 left-1/2 transform -translate-x-1/2 p-3 text-white rounded-lg shadow-lg z-[100] text-center font-bold text-sm w-11/12 max-w-sm transition-all ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
        mb.classList.remove('hidden'); 
        
        setTimeout(() => mb.classList.add('hidden'), 3000);
    },

    getTodayString: () => dayjs().format('YYYY-MM-DD'),

    applyTheme: (theme) => {
        const root = document.documentElement;
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (theme === 'dark' || (theme === 'system' && isSystemDark)) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    },

    toggleDryDay: (cb) => {
        const section = DOM.elements['drinking-section'];
        if (section) section.classList.toggle('hidden-area', cb.checked);
    },

    openBeerModal: (log = null) => {
        const dateEl = DOM.elements['beer-date'];
        const styleSelect = DOM.elements['beer-select'];
        const sizeSelect = DOM.elements['beer-size'];
        const countInput = DOM.elements['beer-count'];
        const abvInput = DOM.elements['preset-abv'];
        const breweryInput = document.getElementById('beer-brewery');
        const brandInput = document.getElementById('beer-brand');
        const ratingInput = document.getElementById('beer-rating');
        const memoInput = document.getElementById('beer-memo');
        const submitBtn = document.getElementById('beer-submit-btn') || document.querySelector('#beer-form button[type="submit"]');
        
        if (submitBtn) submitBtn.id = 'beer-submit-btn';

        if (dateEl) dateEl.value = UI.getTodayString();
        if (styleSelect) styleSelect.value = '';
        if (sizeSelect) sizeSelect.value = '350';
        if (countInput) countInput.value = '1';
        if (abvInput) abvInput.value = '5.0';
        if (breweryInput) breweryInput.value = '';
        if (brandInput) brandInput.value = '';
        if (ratingInput) ratingInput.value = '0';
        if (memoInput) memoInput.value = '';
        if (DOM.elements['custom-abv']) DOM.elements['custom-abv'].value = '';
        if (DOM.elements['custom-amount']) DOM.elements['custom-amount'].value = '';

        if (log) {
            if (submitBtn) {
                submitBtn.textContent = '更新する';
                submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
            }
            
            if (dateEl) dateEl.value = dayjs(log.timestamp).format('YYYY-MM-DD');
            if (breweryInput) breweryInput.value = log.brewery || '';
            if (brandInput) brandInput.value = log.brand || '';
            if (ratingInput) ratingInput.value = log.rating || 0;
            if (memoInput) memoInput.value = log.memo || '';

            const isCustom = log.style === 'Custom' || log.isCustom; 

            if (isCustom) {
                UI.switchBeerInputTab('custom');
                if (DOM.elements['custom-abv']) DOM.elements['custom-abv'].value = log.abv || '';
                if (DOM.elements['custom-amount']) DOM.elements['custom-amount'].value = log.rawAmount || (parseInt(log.size) || '');
                
                const radios = document.getElementsByName('customType');
                if (log.customType) {
                    radios.forEach(r => r.checked = (r.value === log.customType));
                }
            } else {
                UI.switchBeerInputTab('preset');
                if (styleSelect) styleSelect.value = log.style || '';
                if (sizeSelect) sizeSelect.value = log.size || '350';
                if (countInput) countInput.value = log.count || 1;
                if (abvInput) abvInput.value = log.abv || 5.0;
            }

        } else {
            if (submitBtn) {
                submitBtn.textContent = '記録する';
                submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.remove('bg-orange-500', 'hover:bg-orange-600');
            }
            UI.switchBeerInputTab('preset');
        }

        toggleModal('beer-modal', true);
    },

    switchBeerInputTab: (mode) => {
        const presetTab = DOM.elements['tab-beer-preset'];
        const customTab = DOM.elements['tab-beer-custom'];
        const presetContent = DOM.elements['beer-input-preset'];
        const customContent = DOM.elements['beer-input-custom'];

        if (!presetTab || !customTab) return;

        const activeClass = "bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm";
        const inactiveClass = "text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-600";

        if (mode === 'preset') {
            presetTab.className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${activeClass}`;
            customTab.className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${inactiveClass}`;
            presetContent?.classList.remove('hidden');
            customContent?.classList.add('hidden');
        } else {
            customTab.className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${activeClass}`;
            presetTab.className = `flex-1 py-2 text-xs font-bold rounded-lg transition ${inactiveClass}`;
            customContent?.classList.remove('hidden');
            presetContent?.classList.add('hidden');
        }
    },

    openCheckModal: (check = null, dateStr = null) => { 
        const dateEl = DOM.elements['check-date'];
        const isDryCb = document.getElementById('is-dry-day');
        const form = document.getElementById('check-form');
        const submitBtn = document.getElementById('check-submit-btn') || document.querySelector('#check-form button[type="submit"]');
        if (submitBtn) submitBtn.id = 'check-submit-btn';

        form.reset();
        UI.toggleDryDay(isDryCb);

        if (check) {
            if (dateEl) dateEl.value = dayjs(check.timestamp).format('YYYY-MM-DD');
            if (isDryCb) {
                isDryCb.checked = check.isDryDay;
                UI.toggleDryDay(isDryCb);
            }
            if (form.elements['waistEase']) form.elements['waistEase'].checked = check.waistEase;
            if (form.elements['footLightness']) form.elements['footLightness'].checked = check.footLightness;
            if (form.elements['waterOk']) form.elements['waterOk'].checked = check.waterOk;
            if (form.elements['fiberOk']) form.elements['fiberOk'].checked = check.fiberOk;
            if (DOM.elements['check-weight']) DOM.elements['check-weight'].value = check.weight || '';

            if (submitBtn) {
                submitBtn.textContent = '更新する';
                submitBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
            }
        } else {
            if (dateEl) dateEl.value = dateStr || UI.getTodayString();
            
            if (submitBtn) {
                submitBtn.textContent = '完了';
                submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
                submitBtn.classList.remove('bg-orange-500', 'hover:bg-orange-600');
            }
        }

        toggleModal('check-modal', true); 
    },

    openManualInput: () => { 
        const select = document.getElementById('exercise-select');
        const label = EXERCISE[select.value] ? EXERCISE[select.value].label : '運動';
        
        const nameEl = DOM.elements['manual-exercise-name'];
        if (nameEl) nameEl.textContent = label; 
        
        const dateEl = DOM.elements['manual-date'];
        if (dateEl) dateEl.value = UI.getTodayString();
        
        toggleModal('manual-exercise-modal', true); 
    },

    openSettings: () => {
        const p = Store.getProfile();
        const setVal = (key, val) => { if(DOM.elements[key]) DOM.elements[key].value = val; };
        
        setVal('weight-input', p.weight);
        setVal('height-input', p.height);
        setVal('age-input', p.age);
        setVal('gender-input', p.gender);
        
        const modes = Store.getModes();
        setVal('setting-mode-1', modes.mode1);
        setVal('setting-mode-2', modes.mode2);
        setVal('setting-base-exercise', Store.getBaseExercise());
        setVal('theme-input', Store.getTheme());
        setVal('setting-default-record-exercise', Store.getDefaultRecordExercise());        

        toggleModal('settings-modal', true);
    },

    openHelp: () => {
        toggleModal('help-modal', true);
    },

    updateModeButtons: () => {
        const modes = Store.getModes();
        const btn1 = DOM.elements['btn-mode-1'];
        const btn2 = DOM.elements['btn-mode-2'];
        if(btn1) btn1.textContent = `🍺 ${modes.mode1}換算`;
        if(btn2) btn2.textContent = `🍺🍺 ${modes.mode2}換算`;
    },

    setBeerMode: (mode) => {
        StateManager.setBeerMode(mode); // StateManagerを使用
        const lBtn = DOM.elements['btn-mode-1'];
        const hBtn = DOM.elements['btn-mode-2'];
        const liq = DOM.elements['tank-liquid'];
        
        const activeClass = "bg-indigo-600 text-white shadow-sm";
        const inactiveClass = "text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700";

        requestAnimationFrame(() => {
            if (mode === 'mode1') {
                if(lBtn) lBtn.className = `px-4 py-2 rounded-md text-xs font-bold transition-all min-w-[100px] ${activeClass}`;
                if(hBtn) hBtn.className = `px-4 py-2 rounded-md text-xs font-bold transition-all min-w-[100px] ${inactiveClass}`;
                if(liq) { liq.classList.remove('mode2'); liq.classList.add('mode1'); }
            } else {
                if(hBtn) hBtn.className = `px-4 py-2 rounded-md text-xs font-bold transition-all min-w-[100px] ${activeClass}`;
                if(lBtn) lBtn.className = `px-4 py-2 rounded-md text-xs font-bold transition-all min-w-[100px] ${inactiveClass}`;
                if(liq) { liq.classList.remove('mode1'); liq.classList.add('mode2'); }
            }
        });
        refreshUI();
    },

    switchTab: (tabId) => {
        if (!tabId) return;
        const targetTab = document.getElementById(tabId);
        const targetNav = document.getElementById(`nav-${tabId}`);
        if (!targetTab || !targetNav) return;
    
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        targetTab.classList.add('active');
        
        document.querySelectorAll('.nav-item').forEach(el => { 
            el.classList.remove('text-indigo-600', 'dark:text-indigo-400'); 
            el.classList.add('text-gray-400', 'dark:text-gray-500'); 
        });
        targetNav.classList.remove('text-gray-400', 'dark:text-gray-500');
        targetNav.classList.add('text-indigo-600', 'dark:text-indigo-400');
        
        if (tabId === 'tab-history') {
            refreshUI(); 
        }
        
        const resetScroll = () => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        };

        resetScroll();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resetScroll();
            });
        });
    },

    openLogDetail: (log) => {
        if (!DOM.elements['log-detail-modal']) return;

        const isDebt = log.minutes < 0;
        
        DOM.elements['detail-icon'].textContent = isDebt ? '🍺' : '🏃‍♀️';
        DOM.elements['detail-title'].textContent = log.name;
        DOM.elements['detail-date'].textContent = dayjs(log.timestamp).format('YYYY/MM/DD HH:mm');
        
        const typeText = isDebt ? '借金' : '返済';
        const signClass = isDebt ? 'text-red-500' : 'text-green-500';
        DOM.elements['detail-minutes'].innerHTML = `<span class="${signClass}">${typeText} ${Math.abs(log.minutes)}分</span>`;

        if (isDebt && (log.style || log.size || log.brewery || log.brand)) {
            DOM.elements['detail-beer-info'].classList.remove('hidden');
            DOM.elements['detail-style'].textContent = log.style || '-';
            const sizeLabel = SIZE_DATA[log.size] ? SIZE_DATA[log.size].label : log.size;
            DOM.elements['detail-size'].textContent = sizeLabel || '-';
            
            const brewery = log.brewery ? `[${log.brewery}] ` : '';
            const brand = log.brand || '';
            DOM.elements['detail-brand'].textContent = (brewery + brand) || '-';
        } else {
            DOM.elements['detail-beer-info'].classList.add('hidden');
        }

        if (log.memo || log.rating > 0) {
            DOM.elements['detail-memo-container'].classList.remove('hidden');
            const stars = '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating);
            DOM.elements['detail-rating'].textContent = log.rating > 0 ? stars : '';
            DOM.elements['detail-memo'].textContent = log.memo || '';
        } else {
            DOM.elements['detail-memo-container'].classList.add('hidden');
        }

        DOM.elements['log-detail-modal'].dataset.id = log.id;

        toggleModal('log-detail-modal', true);
    },

    toggleEditMode: () => {
        const isEdit = StateManager.toggleEditMode(); // StateManagerを使用
        
        const btn = document.getElementById('btn-toggle-edit-mode');
        if (btn) {
            btn.textContent = isEdit ? '完了' : '編集';
            btn.className = isEdit 
                ? "text-xs font-bold text-white bg-indigo-500 px-3 py-1.5 rounded-lg transition"
                : "text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-gray-700 px-3 py-1.5 rounded-lg transition hover:bg-indigo-100 dark:hover:bg-gray-600";
        }

        const selectAllBtn = document.getElementById('btn-select-all');
        if (selectAllBtn) {
            if (isEdit) selectAllBtn.classList.remove('hidden');
            else {
                selectAllBtn.classList.add('hidden');
                selectAllBtn.textContent = '全選択'; 
            }
        }

        const bar = document.getElementById('bulk-action-bar');
        if (bar) {
            if (isEdit) bar.classList.remove('hidden');
            else bar.classList.add('hidden');
        }

        const checkboxes = document.querySelectorAll('.edit-checkbox-area');
        checkboxes.forEach(el => {
            if (isEdit) el.classList.remove('hidden');
            else el.classList.add('hidden');
        });

        const spacer = document.getElementById('edit-spacer');
        if (spacer) {
            if (isEdit) { spacer.classList.remove('hidden'); spacer.classList.add('block'); }
            else { spacer.classList.add('hidden'); spacer.classList.remove('block'); }
        }

        if (!isEdit) {
            const inputs = document.querySelectorAll('.log-checkbox');
            inputs.forEach(i => i.checked = false);
            UI.updateBulkCount(0);
        }
    },

    toggleSelectAll: () => {
        const btn = document.getElementById('btn-select-all');
        const inputs = document.querySelectorAll('.log-checkbox');
        const isAllSelected = btn.textContent === '全解除';

        if (isAllSelected) {
            inputs.forEach(i => i.checked = false);
            btn.textContent = '全選択';
            UI.updateBulkCount(0);
        } else {
            inputs.forEach(i => i.checked = true);
            btn.textContent = '全解除';
            UI.updateBulkCount(inputs.length);
        }
    },

    updateBulkCount: (count) => {
        const el = document.getElementById('bulk-selected-count');
        if (el) el.textContent = count;
        
        const btn = document.getElementById('btn-bulk-delete');
        if (btn) {
            if (count > 0) btn.removeAttribute('disabled');
            else btn.setAttribute('disabled', 'true');
            
            btn.style.opacity = count > 0 ? '1' : '0.5';
        }
    }
};

export function updateBeerSelectOptions() { 
    const s = DOM.elements['beer-select']; 
    if (!s) return;

    const baseEx = Store.getBaseExercise();
    const exData = EXERCISE[baseEx] || EXERCISE['stepper'];
    
    const fragment = document.createDocumentFragment();
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.textContent = "選択してください";
    fragment.appendChild(defaultOpt);

    const labelEl = DOM.elements['beer-select-mode-label'];
    if (labelEl) labelEl.textContent = `${exData.icon} ${exData.label} 換算`;

    Object.keys(CALORIES.STYLES).forEach(k => { 
        const o = document.createElement('option'); 
        o.value = k; 
        o.textContent = `${k}`; 
        fragment.appendChild(o); 
    }); 
    
    s.innerHTML = '';
    s.appendChild(fragment);

    const m1 = DOM.elements['setting-mode-1']; 
    const m2 = DOM.elements['setting-mode-2']; 
    
    if (m1 && m2) {
        const frag1 = document.createDocumentFragment();
        const frag2 = document.createDocumentFragment();
        
        Object.keys(CALORIES.STYLES).forEach(k => {
            const o1 = document.createElement('option'); o1.value = k; o1.textContent = k; frag1.appendChild(o1);
            const o2 = document.createElement('option'); o2.value = k; o2.textContent = k; frag2.appendChild(o2);
        });
        
        m1.innerHTML = ''; m1.appendChild(frag1);
        m2.innerHTML = ''; m2.appendChild(frag2);
    }
}

export async function refreshUI() {
    try {
        let totalBalance = 0;
        await db.logs.each(log => { totalBalance += log.minutes; });
        
        const recentLimit = dayjs().subtract(40, 'day').valueOf();
        const recentLogs = await db.logs.where('timestamp').above(recentLimit).toArray();
        const recentChecks = await db.checks.where('timestamp').above(recentLimit).toArray();

        renderBeerTank(totalBalance);
        renderCheckStatus(recentChecks, recentLogs);
        renderLiverRank(recentChecks, recentLogs); 
        renderWeeklyAndHeatUp(recentLogs, recentChecks);
        renderQuickButtons(recentLogs); 
        
        const isHistoryTab = document.getElementById('tab-history')?.classList.contains('active');
        if(isHistoryTab) {
            await updateChartView();
            await updateHeatmapView();
            await updateLogListView();
        }
    } catch (err) {
        console.error("Failed to refresh UI:", err);
    }
}

export async function updateHeatmapView() {
    const today = dayjs();
    const dayOfWeek = today.day(); 
    let endDay = today.add(6 - dayOfWeek, 'day'); 
    
    if (StateManager.heatmapOffset > 0) { // StateManagerを使用
        endDay = endDay.subtract(StateManager.heatmapOffset, 'week');
    }
    
    const startDay = endDay.subtract(35, 'day'); 

    const startTs = startDay.valueOf();
    const endTs = endDay.endOf('day').valueOf();

    const rangeLogs = await db.logs.where('timestamp').between(startTs, endTs, true, true).toArray();
    const rangeChecks = await db.checks.where('timestamp').between(startTs, endTs, true, true).toArray();

    renderHeatmap(rangeLogs, rangeChecks);
}

async function updateChartView() {
    let startTs = 0;
    const now = dayjs();

    // StateManagerを使用
    if (StateManager.chartRange === '1w') {
        startTs = now.subtract(7, 'day').startOf('day').valueOf();
    } else if (StateManager.chartRange === '1m') {
        startTs = now.subtract(30, 'day').startOf('day').valueOf();
    } else {
        startTs = 0; 
    }

    let rangeLogs, rangeChecks;
    if (startTs > 0) {
        rangeLogs = await db.logs.where('timestamp').above(startTs).toArray();
        rangeChecks = await db.checks.where('timestamp').above(startTs).toArray();
    } else {
        rangeLogs = await db.logs.toArray();
        rangeChecks = await db.checks.toArray();
    }

    renderChart(rangeLogs, rangeChecks);
}

async function updateLogListView() {
    const listContainer = document.getElementById('log-list');
    if (!listContainer) return;

    const totalCount = await db.logs.count();
    const limit = StateManager.logLimit || 50; // StateManagerを使用
    
    const limitedLogs = await db.logs
        .orderBy('timestamp')
        .reverse()
        .limit(limit)
        .toArray();

    renderLogList(limitedLogs);

    if (totalCount > limit) {
        const remaining = totalCount - limit;
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'py-6 text-center pb-24';
        btnContainer.innerHTML = `
            <button id="btn-load-more" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 font-bold py-3 px-10 rounded-full shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition text-xs flex items-center justify-center gap-2 mx-auto">
                <span>⬇️</span>
                <span>もっと見る (あと${remaining}件)</span>
            </button>
        `;
        
        listContainer.appendChild(btnContainer);

        document.getElementById('btn-load-more').addEventListener('click', () => {
            StateManager.incrementLogLimit(50); // StateManagerを使用
            updateLogListView(); 
        });
    }
}

function renderHeatmap(logs, checks) {
    let grid = DOM.elements['heatmap-grid'];
    if (!grid) {
        grid = document.getElementById('heatmap-grid');
        if (!grid) return; 
        DOM.elements['heatmap-grid'] = grid;
    }

    while (grid.children.length > 7) {
        grid.removeChild(grid.lastChild);
    }

    const today = dayjs();
    const dayOfWeek = today.day(); 
    
    let endDay = today.add(6 - dayOfWeek, 'day'); 
    // StateManagerを使用
    if (StateManager.heatmapOffset > 0) {
        endDay = endDay.subtract(StateManager.heatmapOffset, 'week');
    }
    
    const totalWeeks = 5;
    const totalDays = totalWeeks * 7;
    const startDay = endDay.subtract(totalDays - 1, 'day'); 
    
    const label = document.getElementById('heatmap-period-label');
    if (label) {
        // StateManagerを使用
        if (StateManager.heatmapOffset === 0) {
            label.textContent = "Last 5 Weeks";
        } else {
            label.textContent = `${startDay.format('M/D')} - ${endDay.format('M/D')}`;
        }
    }

    const nextBtn = document.getElementById('heatmap-next');
    if (nextBtn) {
        // StateManagerを使用
        nextBtn.disabled = (StateManager.heatmapOffset <= 0);
        if (StateManager.heatmapOffset <= 0) {
            nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
        } else {
            nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
        }
    }

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < totalDays; i++) {
        const currentDay = startDay.add(i, 'day');
        
        const check = checks.find(c => dayjs(c.timestamp).isSame(currentDay, 'day'));
        const isDry = check?.isDryDay;

        const dayLogs = logs.filter(l => dayjs(l.timestamp).isSame(currentDay, 'day'));
        const hasDrink = dayLogs.some(l => l.minutes < 0); 
        const hasExercise = dayLogs.some(l => l.minutes > 0); 

        let bgColor = "bg-gray-100 dark:bg-gray-700"; 
        let title = `${currentDay.format('MM/DD')}: No Record`;

        if (isDry && hasExercise) {
            bgColor = "bg-emerald-500"; 
            title = `${currentDay.format('MM/DD')}: Perfect! (休肝+運動)`;
        } else if (isDry) {
            bgColor = "bg-green-400"; 
            title = `${currentDay.format('MM/DD')}: 休肝日`;
        } else if (hasDrink && hasExercise) {
            bgColor = "bg-blue-400"; 
            title = `${currentDay.format('MM/DD')}: 飲酒+運動`;
        } else if (hasDrink) {
            bgColor = "bg-red-400"; 
            title = `${currentDay.format('MM/DD')}: 飲酒`;
        } else if (hasExercise) {
            bgColor = "bg-cyan-400"; 
            title = `${currentDay.format('MM/DD')}: 運動のみ`;
        }

        if (currentDay.isAfter(today, 'day')) {
            bgColor = "bg-transparent border border-gray-100 dark:border-gray-700 opacity-30";
            title = "";
        }

        const cell = document.createElement('div');
        cell.className = `heatmap-cell w-full aspect-square rounded-sm flex items-center justify-center text-[8px] font-bold transition hover:opacity-80 ${bgColor} text-white/90 cursor-pointer`;
        cell.title = title;
        cell.dataset.date = currentDay.format('YYYY-MM-DD');
        
        if (currentDay.date() === 1 || currentDay.isSame(today, 'day')) {
             cell.textContent = currentDay.date();
             if (bgColor.includes('bg-gray-100') || bgColor.includes('bg-transparent')) {
                 cell.classList.remove('text-white/90');
                 cell.classList.add('text-gray-400');
             }
        }

        if (currentDay.isSame(today, 'day')) {
            cell.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-1', 'dark:ring-offset-gray-800');
        }

        fragment.appendChild(cell);
    }

    grid.appendChild(fragment);
}

function renderQuickButtons(logs) {
    const container = DOM.elements['quick-input-area'];
    if (!container) return;
    
    const counts = {};
    logs.forEach(l => {
        if (l.style && l.size) {
            const key = `${l.style}|${l.size}`;
            counts[key] = (counts[key] || 0) + 1;
        }
    });

    const topShortcuts = Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, 2)
        .map(key => {
            const [style, size] = key.split('|');
            return { style, size };
        });

    if (topShortcuts.length === 0) {
        container.innerHTML = ''; 
        return;
    }

    container.innerHTML = topShortcuts.map(item => {
        const sizeLabel = SIZE_DATA[item.size] ? SIZE_DATA[item.size].label.replace(/ \(.*\)/, '') : item.size;
        return `<button data-style="${escapeHtml(item.style)}" data-size="${escapeHtml(item.size)}" 
            class="quick-beer-btn flex-1 bg-white dark:bg-gray-800 border border-indigo-100 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 font-bold py-3 rounded-xl shadow-sm hover:bg-indigo-50 dark:hover:bg-gray-700 text-xs flex flex-col items-center justify-center transition active:scale-95">
            <span class="mb-0.5 text-[10px] text-indigo-400 uppercase">いつもの</span>
            <span>${escapeHtml(item.style)}</span>
            <span class="text-[10px] opacity-70">${escapeHtml(sizeLabel)}</span>
        </button>`;
    }).join('');
}

function renderLogList(logs) {
    logs.sort((a, b) => b.timestamp - a.timestamp);
    const list = DOM.elements['log-list'];
    if (!list) return;

    if (logs.length === 0) { 
        list.innerHTML = '<p class="text-gray-500 dark:text-gray-400 p-4 text-center">まだ記録がありません。</p>'; 
        return; 
    }
    
    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
    const displayRate = Calc.burnRate(baseExData.mets);
    const stepperRate = Calc.burnRate(EXERCISE['stepper'].mets);

    const labelEl = DOM.elements['history-base-label'];
    if(labelEl) labelEl.textContent = `(${baseExData.icon} ${baseExData.label} 換算)`;

    const htmlItems = logs.map(log => {
        const isDebt = log.minutes < 0;
        const typeText = isDebt ? '借金 🍺' : '返済 🏃‍♀️';
        const signClass = isDebt ? 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300' : 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-300';
        
        const date = dayjs(log.timestamp).format('MM/DD HH:mm');
        
        let detailHtml = '';
        if (log.brewery || log.brand) {
            detailHtml += `<p class="text-xs mt-0.5"><span class="font-bold text-gray-600 dark:text-gray-400">${escapeHtml(log.brewery)||''}</span> <span class="text-gray-600 dark:text-gray-400">${escapeHtml(log.brand)||''}</span></p>`;
        }
        
        if (log.minutes < 0 && (log.rating > 0 || log.memo)) {
            const stars = '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating);
            const ratingDisplay = log.rating > 0 ? `<span class="text-yellow-500 text-[10px] mr-2">${stars}</span>` : '';
            const memoDisplay = log.memo ? `<span class="text-[10px] text-gray-400 dark:text-gray-500">"${escapeHtml(log.memo)}"</span>` : '';
            detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">${ratingDisplay}${memoDisplay}</div>`;
        } else if (log.minutes > 0 && log.memo) {
             detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1"><span class="text-[10px] text-orange-500 dark:text-orange-400 font-bold">${escapeHtml(log.memo)}</span></div>`;
        }

        const kcal = Math.abs(log.minutes) * stepperRate;
        const displayMinutes = Math.round(kcal / displayRate) * (log.minutes < 0 ? -1 : 1);

        // StateManagerを使用
        const checkHidden = StateManager.isEditMode ? '' : 'hidden';
        const checkboxHtml = `<div class="edit-checkbox-area ${checkHidden} mr-3 flex-shrink-0"><input type="checkbox" class="log-checkbox w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 bg-gray-100 dark:bg-gray-700 dark:border-gray-600" value="${log.id}"></div>`;

        return `<div class="log-item-row flex justify-between items-center p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 group transition-colors cursor-pointer" data-id="${log.id}">
                    <div class="flex items-center flex-grow min-w-0 pr-2">
                        ${checkboxHtml}
                        <div class="min-w-0">
                            <p class="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">${escapeHtml(log.name)}</p>
                            ${detailHtml} <p class="text-[10px] text-gray-400 mt-0.5">${date}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${signClass} whitespace-nowrap">${typeText} ${displayMinutes}分</span>
                        <button data-id="${log.id}" class="delete-log-btn text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 p-1 font-bold px-2">×</button>
                    </div>
                </div>`;
    });

    list.innerHTML = htmlItems.join('');
    
    const spacer = document.createElement('div');
    spacer.id = 'edit-spacer';
    // StateManagerを使用
    spacer.className = `${StateManager.isEditMode ? 'block' : 'hidden'} h-24 w-full flex-shrink-0`;
    list.appendChild(spacer);
}

function renderBeerTank(currentBalance) {
    // StateManagerを使用
    const { 
        canCount, 
        displayMinutes, 
        baseExData, 
        unitKcal, 
        displayRate, 
        totalKcal, 
        targetStyle,
        liquidColor, // 追加
        isHazy       // 追加 
    } = Calc.getTankDisplayData(currentBalance, StateManager.beerMode);

    const liquid = DOM.elements['tank-liquid'];
    const emptyIcon = DOM.elements['tank-empty-icon'];
    const cansText = DOM.elements['tank-cans'];
    const minText = DOM.elements['tank-minutes'];
    const msgText = DOM.elements['tank-message'] ? DOM.elements['tank-message'].querySelector('p') : null;

    if (!liquid || !emptyIcon || !cansText || !minText || !msgText) return;

    requestAnimationFrame(() => {
        // 【追加】液色とHazyエフェクトの適用
        liquid.style.background = liquidColor;
        if (isHazy) {
            liquid.style.filter = 'blur(1px) brightness(1.1)';
        } else {
            liquid.style.filter = 'none';
        }

        if (currentBalance > 0) {
            emptyIcon.style.opacity = '0';
            let h = (canCount / APP.TANK_MAX_CANS) * 100;
            liquid.style.height = `${Math.max(5, Math.min(100, h))}%`;
            cansText.textContent = canCount.toFixed(1);
            
            minText.innerHTML = `+${Math.round(displayMinutes)} min <span class="text-[10px] font-normal text-gray-400">(${baseExData.icon})</span>`;
            
            if (canCount < 0.5) { msgText.textContent = 'まだガマン… まずは0.5本分！😐'; msgText.className = 'text-sm font-bold text-gray-500 dark:text-gray-400'; }
            else if (canCount < 1.0) { msgText.textContent = 'あと少しで1本分！頑張れ！🤔'; msgText.className = 'text-sm font-bold text-orange-500'; }
            else if (canCount < 2.0) { msgText.textContent = `1本飲めるよ！(${targetStyle})🍺`; msgText.className = 'text-sm font-bold text-green-600 dark:text-green-400'; }
            else { msgText.textContent = '余裕の貯金！最高だね！✨'; msgText.className = 'text-sm font-bold text-green-800 dark:text-green-400'; }
        } else {
            liquid.style.height = '0%';
            emptyIcon.style.opacity = '1';
            cansText.textContent = "0.0";
            
            minText.innerHTML = `${Math.round(displayMinutes)} min <span class="text-[10px] font-normal text-red-300">(${baseExData.icon})</span>`;
            minText.className = 'text-sm font-bold text-red-500';
            
            const debtCansVal = Math.abs(canCount);

            if (debtCansVal > 1.5) {
                const oneCanMin = Math.round(unitKcal / displayRate);
                msgText.textContent = `借金山積み...😱 まずは1杯分 (${oneCanMin}分) だけ返そう！`;
                msgText.className = 'text-sm font-bold text-orange-500 animate-pulse';
            } else {
                msgText.textContent = `枯渇中... あと${debtCansVal.toFixed(1)}本分動こう😱`;
                msgText.className = 'text-sm font-bold text-red-500 animate-pulse';
            }
        }
    });
}

function renderLiverRank(checks, logs) {
    const gradeData = Calc.getRecentGrade(checks, logs);
    
    const card = DOM.elements['liver-rank-card'];
    const title = DOM.elements['rank-title'];
    const countEl = DOM.elements['dry-count'];
    const bar = DOM.elements['rank-progress'];
    const msg = DOM.elements['rank-next-msg'];

    if(!card || !title || !countEl || !bar || !msg) return;

    card.classList.remove('hidden');

    title.className = `text-xl font-black mt-1 ${gradeData.color}`;
    title.textContent = `${gradeData.rank} : ${gradeData.label}`;
    
    countEl.textContent = gradeData.current;
    
    const darkBgMap = {
        'bg-orange-100': 'dark:bg-orange-900/30 dark:border-orange-800',
        'bg-indigo-100': 'dark:bg-indigo-900/30 dark:border-indigo-800',
        'bg-green-100': 'dark:bg-green-900/30 dark:border-green-800',
        'bg-gray-100': 'dark:bg-gray-700 dark:border-gray-600',
        'bg-purple-100': 'dark:bg-purple-900/30 dark:border-purple-800',
        'bg-red-50': 'dark:bg-red-900/20 dark:border-red-800'
    };
    
    const darkClasses = darkBgMap[gradeData.bg] || '';
    
    card.className = `mx-2 mt-4 mb-2 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden transition-colors ${gradeData.bg} ${darkClasses}`;

    requestAnimationFrame(() => {
        if (gradeData.next) {
            let percent = 0;
            if (gradeData.isRookie) {
                 percent = (gradeData.rawRate / gradeData.targetRate) * 100;
                 msg.textContent = `ランクアップまであと少し！ (現在 ${Math.round(gradeData.rawRate * 100)}%)`;
            } else {
                const prevTarget = gradeData.rank === 'A' ? 12 : (gradeData.rank === 'B' ? 8 : 0);
                const range = gradeData.next - prevTarget;
                const currentInRank = gradeData.current - prevTarget;
                percent = (currentInRank / range) * 100;
                msg.textContent = `ランクアップまであと ${gradeData.next - gradeData.current} 日`;
            }
            bar.style.width = `${Math.min(100, Math.max(5, percent))}%`;
        } else {
            bar.style.width = '100%';
            msg.textContent = '最高ランク到達！キープしよう！👑';
        }
    });
}

function renderCheckStatus(checks, logs) {
    const status = DOM.elements['check-status'];
    if(!status) return;

    const today = dayjs();
    const yest = today.subtract(1, 'day');
    
    let targetCheck = null; let type = 'none';

    if (checks.length > 0) {
        for(let i=checks.length-1; i>=0; i--) {
            const c = checks[i];
            const checkDay = dayjs(c.timestamp);
            
            if (checkDay.isSame(today, 'day')) { targetCheck = c; type = 'today'; break; }
            if (checkDay.isSame(yest, 'day')) { targetCheck = c; type = 'yesterday'; break; }
        }
    }

    if (type !== 'none') {
        const msg = getCheckMessage(targetCheck, logs);
        const title = type === 'today' ? "Today's Condition" : "Yesterday's Check";
        
        const style = type === 'today' 
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300" 
            : "bg-white dark:bg-gray-800 border-green-400 border-l-4";
        
        let weightHtml = '';
        if(targetCheck.weight) {
            weightHtml = `<span class="ml-2 text-[10px] bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-300 font-bold">${targetCheck.weight}kg</span>`;
        }

        const textColor = type === 'today' ? '' : 'text-gray-800 dark:text-gray-200';

        status.innerHTML = `<div class="p-3 rounded-xl border ${style} flex justify-between items-center shadow-sm transition-colors"><div class="flex items-center gap-3"><span class="text-2xl">${type==='today'?'😎':'✅'}</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">${title}</p><p class="text-sm font-bold ${textColor} flex items-center">${msg}${weightHtml}</p></div></div><button id="btn-edit-check" class="bg-white dark:bg-gray-700 bg-opacity-50 hover:bg-opacity-100 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border border-gray-200 dark:border-gray-600 dark:text-white">編集</button></div>`;
        
    } else {
        const lastDate = checks.length > 0 ? dayjs(checks[checks.length-1].timestamp).format('MM/DD') : 'なし';
        status.innerHTML = `<div class="p-3 rounded-xl border bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800 flex justify-between items-center shadow-sm transition-colors"><div class="flex items-center gap-3"><span class="text-2xl">👋</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">Daily Check</p><p class="text-sm font-bold">昨日の振り返りをしましょう！</p><p class="text-[10px] opacity-60">最終: ${lastDate}</p></div></div><button id="btn-record-check" class="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm border border-yellow-300 dark:border-yellow-700 animate-pulse text-yellow-800 dark:text-yellow-400">記録する</button></div>`;
    }
}

function getCheckMessage(check, logs) {
    const drank = Calc.hasAlcoholLog(logs, check.timestamp);
    if (drank || !check.isDryDay) {
        let s = 0; if (check.waistEase) s++; if (check.footLightness) s++; if (check.fiberOk) s++; if (check.waterOk) s++;
        if (s === 4) return '代謝絶好調！😆'; if (s >= 1) return `${s}/4 クリア 😐`; return '不調気味... 😰';
    } else { return (check.waistEase && check.footLightness) ? '休肝日＋絶好調！✨' : '休肝日 (体調イマイチ)🍵'; }
}

function renderWeeklyAndHeatUp(logs, checks) {
    const streak = Calc.getCurrentStreak(logs, checks);
    const multiplier = Calc.getStreakMultiplier(streak);
    
    const streakEl = DOM.elements['streak-count'];
    if(streakEl) streakEl.textContent = streak;
    
    const badge = DOM.elements['streak-badge'];
    if (badge) {
        if (multiplier > 1.0) {
            badge.textContent = `🔥 x${multiplier.toFixed(1)} Bonus!`;
            badge.className = "mt-1 px-2 py-0.5 bg-orange-500 rounded-full text-[10px] font-bold text-white shadow-sm animate-pulse";
        } else {
            badge.textContent = "x1.0 (Normal)";
            badge.className = "mt-1 px-2 py-0.5 bg-white dark:bg-gray-700 rounded-full text-[10px] font-bold text-gray-400 shadow-sm border border-orange-100 dark:border-gray-600";
        }
    }

    const container = DOM.elements['weekly-stamps'];
    if (!container) return;
    
    const fragment = document.createDocumentFragment();
    const today = dayjs();
    let dryCountInWeek = 0;

    for (let i = 6; i >= 0; i--) {
        const d = today.subtract(i, 'day');
        const status = Calc.getDayStatus(d, logs, checks);
        const isToday = i === 0;

        let elClass = "w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-sm transition-all ";
        let content = "";

        if (isToday) {
            elClass += "border-2 border-indigo-500 bg-white dark:bg-gray-700 text-indigo-500 dark:text-indigo-300 font-bold relative transform scale-110";
            content = "今";
        } else if (status === 'dry') {
            elClass += "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-800";
            content = "🍵";
            dryCountInWeek++;
        } else if (status === 'drink') {
            elClass += "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800";
            content = "🍺";
        } else {
            elClass += "bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 border border-gray-200 dark:border-gray-600";
            content = "-";
        }

        const div = document.createElement('div');
        div.className = elClass;
        div.textContent = content;
        div.title = d.format('MM/DD'); 
        
        fragment.appendChild(div);
    }

    container.innerHTML = '';
    container.appendChild(fragment);

    const msgEl = DOM.elements['weekly-status-text'];
    if (msgEl) {
        if (dryCountInWeek >= 4) msgEl.textContent = "Excellent! 🌟";
        else if (dryCountInWeek >= 2) msgEl.textContent = "Good pace 👍";
        else msgEl.textContent = "Let's rest... 🍵";
    }
}

function renderChart(logs, checks) {
    const ctxCanvas = document.getElementById('balanceChart');
    if (!ctxCanvas || typeof Chart === 'undefined') return;
    
    const filters = DOM.elements['chart-filters'];
    if(filters) {
        filters.querySelectorAll('button').forEach(btn => {
            const activeClass = "active-filter bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm";
            const inactiveClass = "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200";
            
            // StateManagerを使用
            btn.className = "px-2 py-1 text-[10px] font-bold rounded-md transition-all " + 
                (btn.dataset.range === StateManager.chartRange ? activeClass : inactiveClass);
        });
    }

    try {
        const now = dayjs();
        let cutoffDate = 0;
        
        // StateManagerを使用
        if (StateManager.chartRange === '1w') {
            cutoffDate = now.subtract(7, 'day').valueOf();
        } else if (StateManager.chartRange === '1m') {
            cutoffDate = now.subtract(30, 'day').valueOf();
        } else {
            cutoffDate = 0;
        }

        const allLogsSorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        const allChecksSorted = [...checks].sort((a, b) => a.timestamp - b.timestamp);
        
        const fullHistoryMap = new Map();
        let runningBalance = 0;

        allLogsSorted.forEach(l => {
            const d = dayjs(l.timestamp);
            const k = d.format('M/D');
            
            if (!fullHistoryMap.has(k)) fullHistoryMap.set(k, {plus:0, minus:0, bal:0, weight:null, ts: l.timestamp});
            const e = fullHistoryMap.get(k);
            
            if (l.minutes >= 0) e.plus += l.minutes; else e.minus += l.minutes;
            runningBalance += l.minutes;
            e.bal = runningBalance;
        });

        allChecksSorted.forEach(c => {
             const d = dayjs(c.timestamp);
             const k = d.format('M/D');
             if (!fullHistoryMap.has(k)) {
                 fullHistoryMap.set(k, {plus:0, minus:0, bal: runningBalance, weight:null, ts: c.timestamp});
             }
             const e = fullHistoryMap.get(k);
             if (c.weight) e.weight = parseFloat(c.weight);
        });

        let dataArray = Array.from(fullHistoryMap.entries()).map(([k, v]) => ({
            label: k,
            ...v
        }));

        dataArray.sort((a, b) => a.ts - b.ts);
        
        if (cutoffDate > 0) {
            dataArray = dataArray.filter(d => d.ts >= cutoffDate);
        }
        
        if (dataArray.length === 0) {
            dataArray.push({label: now.format('M/D'), plus:0, minus:0, bal:0, weight:null});
        }

        const labels = dataArray.map(d => d.label);
        const plus = dataArray.map(d => d.plus);
        const minus = dataArray.map(d => d.minus);
        const bal = dataArray.map(d => d.bal);
        const weight = dataArray.map(d => d.weight);

        // StateManagerを使用
        if (StateManager.chart) StateManager.chart.destroy();
        
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#6b7280';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        const newChart = new Chart(ctxCanvas.getContext('2d'), {
            type: 'bar',
            data: { 
                labels: labels, 
                datasets: [ 
                    { 
                        type: 'line', 
                        label: '体重 (kg)', 
                        data: weight, 
                        borderColor: '#F59E0B', 
                        borderDash: [5, 5],
                        borderWidth: 2, 
                        pointRadius: 3, 
                        pointBackgroundColor: '#F59E0B',
                        fill: false, 
                        yAxisID: 'y1',
                        spanGaps: true,
                        order: 0 
                    },
                    { 
                        type: 'line', 
                        label: '累積残高', 
                        data: bal, 
                        borderColor: '#4F46E5', 
                        borderWidth: 2, 
                        tension: 0.3, 
                        pointRadius: 1, 
                        fill: false, 
                        order: 1 
                    }, 
                    { 
                        type: 'bar', 
                        label: '返済', 
                        data: plus, 
                        backgroundColor: '#10B981', 
                        borderRadius: 4, 
                        stack: '0', 
                        order: 2 
                    }, 
                    { 
                        type: 'bar', 
                        label: '借金', 
                        data: minus, 
                        backgroundColor: '#EF4444', 
                        borderRadius: 4, 
                        stack: '0', 
                        order: 2 
                    } 
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: { stacked: true, display: false }, 
                    y: { 
                        stacked: false, 
                        beginAtZero: true,
                        title: { display: true, text: 'カロリー収支 (分)', color: textColor },
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '体重 (kg)', color: textColor },
                        ticks: { color: textColor },
                        suggestMin: 50,
                        suggestMax: 100
                    }
                }, 
                plugins: { 
                    legend: { display: true, position: 'bottom', labels: { color: textColor } } 
                } 
            }
        });
        
        // StateManagerを使用
        StateManager.setChart(newChart);

    } catch(e) { console.error('Chart Error', e); }
}