import { APP, EXERCISE, CALORIES, SIZE_DATA } from './constants.js';
import { Calc } from './logic.js';
import { Store, db } from './store.js';

// アプリケーションの状態
export let currentState = { 
    beerMode: 'mode1', 
    chart: null, 
    timerId: null 
};

// モーダルの開閉関数
export const toggleModal = (id, show) => { 
    const el = document.getElementById(id);
    if (el) el.style.display = show ? 'block' : 'none'; 
};

// UI操作系オブジェクト
export const UI = {
    // トーストメッセージ表示
    showMessage: (msg, type) => {
        const mb = document.getElementById('message-box');
        if (!mb) return;
        
        mb.textContent = msg; 
        mb.className = `fixed top-4 left-1/2 transform -translate-x-1/2 p-3 text-white rounded-lg shadow-lg z-[100] text-center font-bold text-sm w-11/12 max-w-sm transition-all ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
        mb.classList.remove('hidden'); 
        
        setTimeout(() => mb.classList.add('hidden'), 3000);
    },

    // 今日の日付文字列(YYYY-MM-DD)を取得するヘルパー
    getTodayString: () => {
        const d = new Date();
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // 休肝日チェックボックスの連動表示
    toggleDryDay: (cb) => {
        const section = document.getElementById('drinking-section');
        if (section) section.classList.toggle('hidden-area', cb.checked);
    },

    // 飲酒記録モーダルを開く
    openBeerModal: () => {
        const dateEl = document.getElementById('beer-date');
        if (dateEl) dateEl.value = UI.getTodayString(); // 今日の日付をセット
        toggleModal('beer-modal', true);
    },

    // 健康チェックモーダルを開く
    openCheckModal: () => { 
        const dateEl = document.getElementById('check-date');
        if (dateEl) dateEl.value = UI.getTodayString(); // 今日の日付をセット
        
        document.getElementById('check-weight').value = ''; // 体重欄リセット
        toggleModal('check-modal', true); 
    },

    // 運動手入力モーダルを開く
    openManualInput: () => { 
        const select = document.getElementById('exercise-select');
        const label = EXERCISE[select.value] ? EXERCISE[select.value].label : '運動';
        document.getElementById('manual-exercise-name').textContent = label; 
        
        const dateEl = document.getElementById('manual-date');
        if (dateEl) dateEl.value = UI.getTodayString(); // 今日の日付をセット
        
        toggleModal('manual-exercise-modal', true); 
    },

    // 設定モーダルを開く
    openSettings: () => {
        const p = Store.getProfile();
        document.getElementById('weight-input').value = p.weight;
        document.getElementById('height-input').value = p.height;
        document.getElementById('age-input').value = p.age;
        document.getElementById('gender-input').value = p.gender;
        
        const modes = Store.getModes();
        document.getElementById('setting-mode-1').value = modes.mode1;
        document.getElementById('setting-mode-2').value = modes.mode2;
        document.getElementById('setting-base-exercise').value = Store.getBaseExercise();
        
        toggleModal('settings-modal', true);
    },

    // ヘルプモーダルを開く
    openHelp: () => {
        toggleModal('help-modal', true);
    },

    // モード切り替えボタンのテキスト更新
    updateModeButtons: () => {
        const modes = Store.getModes();
        const btn1 = document.getElementById('btn-mode-1');
        const btn2 = document.getElementById('btn-mode-2');
        if(btn1) btn1.textContent = `🍺 ${modes.mode1}換算`;
        if(btn2) btn2.textContent = `🍺🍺 ${modes.mode2}換算`;
    }
};

// ビール選択肢の生成
export function updateBeerSelectOptions() { 
    const s = document.getElementById('beer-select'); 
    if (!s) return;

    const baseEx = Store.getBaseExercise();
    const exData = EXERCISE[baseEx] || EXERCISE['stepper'];
    
    s.innerHTML = '<option value="">選択してください</option>'; 
    const r = Calc.burnRate(exData.mets); 
    
    const labelEl = document.getElementById('beer-select-mode-label');
    if (labelEl) labelEl.textContent = `${exData.icon} ${exData.label} 換算`;

    Object.keys(CALORIES.STYLES).forEach(k => { 
        const o = document.createElement('option'); 
        o.value = k; 
        o.textContent = `${k} (${Math.round(CALORIES.STYLES[k]/r)}分)`; 
        s.appendChild(o); 
    }); 
    
    // 設定モーダル内のセレクトボックスも更新
    const m1 = document.getElementById('setting-mode-1'); 
    const m2 = document.getElementById('setting-mode-2'); 
    
    if (m1 && m2) {
        m1.innerHTML = '';
        m2.innerHTML = '';
        Object.keys(CALORIES.STYLES).forEach(k => {
            const o1 = document.createElement('option'); o1.value = k; o1.textContent = k; m1.appendChild(o1);
            const o2 = document.createElement('option'); o2.value = k; o2.textContent = k; m2.appendChild(o2);
        });
    }
}

// ==========================================
// 描画関連 (Rendering)
// ==========================================

export async function refreshUI() {
    try {
        const logs = await db.logs.toArray();
        const checks = await db.checks.toArray();

        renderLogList(logs);
        renderBeerTank(logs);
        renderCheckStatus(checks, logs);
        renderLiverRank(checks);
        renderWeeklyAndHeatUp(logs, checks);
        
        // 履歴タブが開いている場合のみチャートを描画
        if(document.getElementById('tab-history').classList.contains('active')) {
            renderChart(logs, checks);
        }
    } catch (err) {
        console.error("Failed to refresh UI:", err);
    }
}

function renderLogList(logs) {
    // 新しい順にソート
    logs.sort((a, b) => b.timestamp - a.timestamp);
    const list = document.getElementById('log-list');
    if (!list) return;

    if (logs.length === 0) { 
        list.innerHTML = '<p class="text-gray-500 p-4 text-center">まだ記録がありません。</p>'; 
        return; 
    }
    
    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
    const displayRate = Calc.burnRate(baseExData.mets);
    const stepperRate = Calc.burnRate(EXERCISE['stepper'].mets);

    const labelEl = document.getElementById('history-base-label');
    if(labelEl) labelEl.textContent = `(${baseExData.icon} ${baseExData.label} 換算)`;

    list.innerHTML = logs.map(log => {
        const isDebt = log.minutes < 0;
        const typeText = isDebt ? '借金 🍺' : '返済 🏃‍♀️';
        const signClass = isDebt ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50';
        
        // 日付のフォーマット (例: 10/25 18:30)
        const date = new Date(log.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let detailHtml = '';
        if (log.brewery || log.brand) {
            detailHtml += `<p class="text-xs mt-0.5"><span class="font-bold text-gray-600">${log.brewery||''}</span> <span class="text-gray-600">${log.brand||''}</span></p>`;
        }
        
        if (log.minutes < 0 && (log.rating > 0 || log.memo)) {
            const stars = '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating);
            const ratingDisplay = log.rating > 0 ? `<span class="text-yellow-500 text-[10px] mr-2">${stars}</span>` : '';
            const memoDisplay = log.memo ? `<span class="text-[10px] text-gray-400">"${log.memo}"</span>` : '';
            detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-gray-50 rounded px-2 py-1">${ratingDisplay}${memoDisplay}</div>`;
        } else if (log.minutes > 0 && log.memo) {
             detailHtml += `<div class="mt-1 flex flex-wrap items-center bg-orange-50 rounded px-2 py-1"><span class="text-[10px] text-orange-500 font-bold">${log.memo}</span></div>`;
        }

        const kcal = Math.abs(log.minutes) * stepperRate;
        const displayMinutes = Math.round(kcal / displayRate) * (log.minutes < 0 ? -1 : 1);

        // 注意: deleteLog は main.js で window に登録されている前提
        return `<div class="flex justify-between items-center p-3 border-b border-gray-100 hover:bg-gray-50 group">
                    <div class="flex-grow min-w-0 pr-2">
                        <p class="font-semibold text-sm text-gray-800 truncate">${log.name}</p>
                        ${detailHtml} <p class="text-[10px] text-gray-400 mt-0.5">${date}</p>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${signClass} whitespace-nowrap">${typeText} ${displayMinutes}分</span>
                        <button onclick="deleteLog(${log.timestamp})" class="text-gray-300 hover:text-red-500 p-1 font-bold px-2">×</button>
                    </div>
                </div>`;
    }).join('');
}

function renderBeerTank(logs) {
    const totalBalance = logs.reduce((sum, log) => sum + log.minutes, 0);
    const modes = Store.getModes();
    const targetStyle = currentState.beerMode === 'mode1' ? modes.mode1 : modes.mode2;
    const unitKcal = CALORIES.STYLES[targetStyle] || 145;
    
    const totalKcal = totalBalance * Calc.burnRate(EXERCISE['stepper'].mets);
    const canCount = parseFloat((totalKcal / unitKcal).toFixed(1));

    const baseEx = Store.getBaseExercise();
    const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
    const displayRate = Calc.burnRate(baseExData.mets);
    const displayMinutes = totalKcal / displayRate;

    const liquid = document.getElementById('tank-liquid');
    const emptyIcon = document.getElementById('tank-empty-icon');
    const cansText = document.getElementById('tank-cans');
    const minText = document.getElementById('tank-minutes');
    const msgText = document.querySelector('#tank-message p');

    if (totalBalance > 0) {
        emptyIcon.style.opacity = '0';
        let h = (canCount / APP.TANK_MAX_CANS) * 100;
        liquid.style.height = `${Math.max(5, Math.min(100, h))}%`;
        cansText.textContent = canCount.toFixed(1);
        
        minText.innerHTML = `+${Math.round(displayMinutes)} min <span class="text-[10px] font-normal text-gray-400">(${baseExData.icon})</span>`;
        
        if (canCount < 0.5) { msgText.textContent = 'まだガマン… まずは0.5本分！😐'; msgText.className = 'text-sm font-bold text-gray-500'; }
        else if (canCount < 1.0) { msgText.textContent = 'あと少しで1本分！頑張れ！🤔'; msgText.className = 'text-sm font-bold text-orange-500'; }
        else if (canCount < 2.0) { msgText.textContent = `1本飲めるよ！(${targetStyle})🍺`; msgText.className = 'text-sm font-bold text-green-600'; }
        else { msgText.textContent = '余裕の貯金！最高だね！✨'; msgText.className = 'text-sm font-bold text-green-800'; }
    } else {
        liquid.style.height = '0%';
        emptyIcon.style.opacity = '1';
        cansText.textContent = "0.0";
        
        minText.innerHTML = `${Math.round(displayMinutes)} min <span class="text-[10px] font-normal text-red-300">(${baseExData.icon})</span>`;
        minText.className = 'text-sm font-bold text-red-500';
        
        const debtCans = (Math.abs(totalKcal) / unitKcal).toFixed(1);
        msgText.textContent = `枯渇中... あと${debtCans}本分動こう😱`;
        msgText.className = 'text-sm font-bold text-red-500 animate-pulse';
    }
}

// 【変更点】新しいグレード制に対応した描画ロジック
function renderLiverRank(checks) {
    // ロジック側で計算されたグレード情報を取得
    const gradeData = Calc.getRecentGrade(checks);
    
    const card = document.getElementById('liver-rank-card');
    const title = document.getElementById('rank-title');
    const countEl = document.getElementById('dry-count');
    const bar = document.getElementById('rank-progress');
    const msg = document.getElementById('rank-next-msg');

    if(!card) return;

    // タイトル (例: S : 神の肝臓)
    title.className = `text-xl font-black mt-1 ${gradeData.color}`;
    title.textContent = `${gradeData.rank} : ${gradeData.label}`;
    
    // 直近28日間の休肝日数
    countEl.textContent = gradeData.current;
    
    // 背景色
    card.className = `mx-2 mt-4 mb-2 p-4 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden ${gradeData.bg}`;

    // プログレスバー（次のランクまでの進捗）
    if (gradeData.next) {
        // 前のランクの基準値（プログレスバーの0%地点）
        const prevTarget = gradeData.rank === 'A' ? 12 : (gradeData.rank === 'B' ? 8 : 0);
        const range = gradeData.next - prevTarget;
        const currentInRank = gradeData.current - prevTarget;
        
        // 5%〜100%の間でバーを表示
        const percent = Math.min(100, Math.max(5, (currentInRank / range) * 100));
        
        bar.style.width = `${percent}%`;
        msg.textContent = `ランクアップまであと ${gradeData.next - gradeData.current} 日`;
    } else {
        // 最高ランクの場合
        bar.style.width = '100%';
        msg.textContent = '最高ランク到達！キープしよう！👑';
    }
}

function renderCheckStatus(checks, logs) {
    const status = document.getElementById('check-status');
    if(!status) return;

    const today = new Date(); const yest = new Date(new Date().setDate(today.getDate()-1));
    let targetCheck = null; let type = 'none';

    if (checks.length > 0) {
        // 最新のチェックを確認
        // sort済みではない場合を考慮して、timestampで判断すべきだが、
        // IndexedDBからtoArrayした配列の順序依存。通常はID順（登録順）。
        // ここでは配列の最後（最新）を見るか、日付マッチを探すのが安全。
        // ※今回は簡易的に末尾または走査
        
        // 配列を後ろから探す
        for(let i=checks.length-1; i>=0; i--) {
            const c = checks[i];
            if (Calc.isSameDay(c.timestamp, today)) { targetCheck = c; type = 'today'; break; }
            if (Calc.isSameDay(c.timestamp, yest)) { targetCheck = c; type = 'yesterday'; break; }
        }
    }

    if (type !== 'none') {
        const msg = getCheckMessage(targetCheck, logs);
        const title = type === 'today' ? "Today's Condition" : "Yesterday's Check";
        const style = type === 'today' ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-green-400 border-l-4";
        
        let weightHtml = '';
        if(targetCheck.weight) {
            weightHtml = `<span class="ml-2 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-bold">${targetCheck.weight}kg</span>`;
        }

        status.innerHTML = `<div class="p-3 rounded-xl border ${style} flex justify-between items-center shadow-sm"><div class="flex items-center gap-3"><span class="text-2xl">${type==='today'?'😎':'✅'}</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">${title}</p><p class="text-sm font-bold text-gray-800 flex items-center">${msg}${weightHtml}</p></div></div><button onclick="UI.openCheckModal()" class="bg-white bg-opacity-50 hover:bg-opacity-100 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm border border-gray-200">編集</button></div>`;
    } else {
        const lastDate = checks.length > 0 ? new Date(checks[checks.length-1].timestamp).toLocaleDateString('ja-JP', {month:'2-digit', day:'2-digit'}) : 'なし';
        status.innerHTML = `<div class="p-3 rounded-xl border bg-yellow-50 text-yellow-800 border-yellow-200 flex justify-between items-center shadow-sm"><div class="flex items-center gap-3"><span class="text-2xl">👋</span><div><p class="text-[10px] opacity-70 font-bold uppercase tracking-wider">Daily Check</p><p class="text-sm font-bold">昨日の振り返りをしましょう！</p><p class="text-[10px] opacity-60">最終: ${lastDate}</p></div></div><button onclick="UI.openCheckModal()" class="bg-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm border border-yellow-300 animate-pulse text-yellow-800">記録する</button></div>`;
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
    
    const streakEl = document.getElementById('streak-count');
    if(streakEl) streakEl.textContent = streak;
    
    const badge = document.getElementById('streak-badge');
    if (badge) {
        if (multiplier > 1.0) {
            badge.textContent = `🔥 x${multiplier.toFixed(1)} Bonus!`;
            badge.className = "mt-1 px-2 py-0.5 bg-orange-500 rounded-full text-[10px] font-bold text-white shadow-sm animate-pulse";
        } else {
            badge.textContent = "x1.0 (Normal)";
            badge.className = "mt-1 px-2 py-0.5 bg-white rounded-full text-[10px] font-bold text-gray-400 shadow-sm border border-orange-100";
        }
    }

    const container = document.getElementById('weekly-stamps');
    if (!container) return;
    container.innerHTML = '';
    
    const today = new Date();
    let dryCountInWeek = 0;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(today.getDate() - i);
        const status = Calc.getDayStatus(d, logs, checks);
        const isToday = i === 0;

        let elClass = "w-6 h-6 rounded-full flex items-center justify-center text-[10px] shadow-sm transition-all ";
        let content = "";

        if (isToday) {
            elClass += "border-2 border-indigo-500 bg-white text-indigo-500 font-bold relative transform scale-110";
            content = "今";
        } else if (status === 'dry') {
            elClass += "bg-green-100 text-green-600 border border-green-200";
            content = "🍵";
            dryCountInWeek++;
        } else if (status === 'drink') {
            elClass += "bg-red-100 text-red-600 border border-red-200";
            content = "🍺";
        } else {
            elClass += "bg-gray-100 text-gray-300 border border-gray-200";
            content = "?";
        }

        const div = document.createElement('div');
        div.className = elClass;
        div.textContent = content;
        div.title = `${d.getMonth()+1}/${d.getDate()}`;
        
        container.appendChild(div);
    }

    const msgEl = document.getElementById('weekly-status-text');
    if (msgEl) {
        if (dryCountInWeek >= 4) msgEl.textContent = "Excellent! 🌟";
        else if (dryCountInWeek >= 2) msgEl.textContent = "Good pace 👍";
        else msgEl.textContent = "Let's rest... 🍵";
    }
}

function renderChart(logs, checks) {
    const ctxCanvas = document.getElementById('balanceChart');
    if (!ctxCanvas || typeof Chart === 'undefined') return;
    
    try {
        const sortedLogs = [...logs].sort((a, b) => a.timestamp - b.timestamp);
        const dailyData = new Map();
        
        let currentBalance = 0;
        
        if (sortedLogs.length === 0 && checks.length === 0) { 
            const t = new Date(); dailyData.set(`${t.getMonth()+1}/${t.getDate()}`, {plus:0, minus:0, bal:0, weight: null}); 
        } else {
            sortedLogs.forEach(l => {
                const d = new Date(l.timestamp); const k = `${d.getMonth()+1}/${d.getDate()}`;
                if (!dailyData.has(k)) dailyData.set(k, {plus:0, minus:0, bal:0, weight: null});
                const e = dailyData.get(k);
                if (l.minutes >= 0) e.plus += l.minutes; else e.minus += l.minutes;
                currentBalance += l.minutes; e.bal = currentBalance;
            });
        }

        checks.forEach(c => {
            const d = new Date(c.timestamp); const k = `${d.getMonth()+1}/${d.getDate()}`;
            if (!dailyData.has(k)) {
                 dailyData.set(k, {plus:0, minus:0, bal:0, weight: null});
            }
            const e = dailyData.get(k);
            if (c.weight) e.weight = parseFloat(c.weight);
        });

        const sortedKeys = Array.from(dailyData.keys()).sort((a,b) => {
            const [m1,d1] = a.split('/').map(Number);
            const [m2,d2] = b.split('/').map(Number);
            if(m1 !== m2) return m1 - m2;
            return d1 - d2;
        });

        const labels = []; const plus = []; const minus = []; const bal = []; const weight = [];
        
        sortedKeys.forEach(k => {
            const e = dailyData.get(k);
            labels.push(k);
            plus.push(e.plus);
            minus.push(e.minus);
            bal.push(e.bal !== 0 ? e.bal : (labels.length > 1 ? bal[bal.length-1] : 0));
            weight.push(e.weight);
        });

        if (currentState.chart) currentState.chart.destroy();
        
        currentState.chart = new Chart(ctxCanvas.getContext('2d'), {
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
                        title: { display: true, text: 'カロリー収支 (分)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '体重 (kg)' },
                        suggestMin: 50,
                        suggestMax: 100
                    }
                }, 
                plugins: { legend: { display: true, position: 'bottom' } } 
            }
        });
    } catch(e) { console.error('Chart Error', e); }
}