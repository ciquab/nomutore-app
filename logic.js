import { Store } from './store.js';
import { EXERCISE, CALORIES, APP, BEER_COLORS, STYLE_COLOR_MAP } from './constants.js'; 
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const Calc = {
    // 1. 引数 profile を追加
    getBMR: (profile = null) => {
        // profile が渡されていればそれを使い、なければ Store から取得する
        const p = profile || Store.getProfile();

        const k = 1000 / 4.186;
        if(p.gender === 'male') {
            return ((0.0481 * p.weight) + (0.0234 * p.height) - (0.0138 * p.age) - 0.4235) * k;
        } else {
            return ((0.0481 * p.weight) + (0.0234 * p.height) - (0.0138 * p.age) - 0.9708) * k;
        }
    },
    // 2. 引数 profile を追加し、getBMR へ渡す
    burnRate: (mets, profile = null) => {
        const bmr = Calc.getBMR(profile); // ★ここを変更
        const netMets = Math.max(0, mets - 1);
        return (bmr / 24 * netMets) / 60;
    },
    
    // 【必須】カロリー計算関数 (new_logic.jsで欠落していたもの)
    calculateExerciseKcal: (minutes, exerciseKey) => {
        const exData = EXERCISE[exerciseKey] || EXERCISE['stepper'];
        const rate = Calc.burnRate(exData.mets, null);
        return minutes * rate;
    },

    // 3. 引数 profile を追加し、burnRate へ渡す (重要: グラフ等で大量に使われるため)
    convertKcalToMinutes: (kcal, targetExerciseKey, profile = null) => {
        const exData = EXERCISE[targetExerciseKey] || EXERCISE['stepper'];
        const rate = Calc.burnRate(exData.mets, profile); // ★ここを変更
        if (rate === 0) return 0;
        return Math.round(kcal / rate);
    },
    convertKcalToBeerCount: (kcal, beerStyle) => {
    const unitKcal = CALORIES.STYLES[beerStyle];
    if (!unitKcal) return 0;
    return Math.round((kcal / unitKcal) * 10) / 10; // 小数1桁
},

    // 4. 引数 profile を追加し、convertKcalToMinutes へ渡す
    stepperEq: (kcal, profile = null) => {
        return Calc.convertKcalToMinutes(kcal, 'stepper', profile); // ★ここを変更
    },
    
    calculateAlcoholKcal: (ml, abv, type) => {
        const alcoholG = ml * (abv / 100) * 0.8;
        let kcal = alcoholG * 7;
        if (type === 'sweet') {
             kcal += ml * 0.15;
        }
        return kcal;
    },

    // 【維持】カロリーベースのタンク表示ロジック (logic.jsのものを採用)
    getTankDisplayData: (currentKcalBalance, currentBeerMode, profile = null) => { // ★引数追加
        const modes = Store.getModes();
        const targetStyle = currentBeerMode === 'mode1' ? modes.mode1 : modes.mode2;
        const unitKcal = CALORIES.STYLES[targetStyle] || 145;
        
        const colorKey = STYLE_COLOR_MAP[targetStyle] || 'default';
        const liquidColor = BEER_COLORS[colorKey];
        const isHazy = (colorKey === 'hazy');

        // カロリーベースで計算
        const canCount = parseFloat((currentKcalBalance / unitKcal).toFixed(1));

        const baseEx = Store.getBaseExercise();
        const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
        
        // カロリーから表示時間を計算
        const displayMinutes = Calc.convertKcalToMinutes(currentKcalBalance, baseEx, profile);
        const displayRate = Calc.burnRate(baseExData.mets, profile);
        
        return {
            targetStyle,
            canCount,
            displayMinutes,
            baseExData,
            unitKcal,
            displayRate,
            totalKcal: currentKcalBalance,
            liquidColor,
            isHazy
        };
    },
    
    isSameDay: (ts1, ts2) => dayjs(ts1).isSame(dayjs(ts2), 'day'),
    
    getDayStatus: (date, logs, checks) => {
        const targetDay = dayjs(date);
        const dayLogs = logs.filter(l => targetDay.isSame(dayjs(l.timestamp), 'day'));
        
        // 【修正】収支を計算して「完済」判定を行う
        // kcalがあればkcal、なければ互換用minutesを使用
        let balance = 0;
        let hasAlcohol = false;
        let hasExercise = false;

        dayLogs.forEach(l => {
            // カロリーまたは分を取得
            const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0));
            balance += val;
            
            if (val < 0) hasAlcohol = true;
            if (val > 0) hasExercise = true;
        });
        
        // 完済しているか（借金以上の運動をしたか）
        // ※ わずかな誤差許容のため -1kcal 以上ならOKとする
        const isRepaid = hasAlcohol && balance >= -1;

        const isDryCheck = checks.some(c => c.isDryDay && targetDay.isSame(dayjs(c.timestamp), 'day'));
        
        // 判定ロジック
        if (isDryCheck) {
            return hasExercise ? 'rest_exercise' : 'rest';
        }
        if (hasAlcohol) {
            // 【重要】完済していれば、システム上は「成功」扱いとしたいが、
            // 表示(Heatmap)では「青(飲んで動いた)」を出したい。
            // そこで、呼び出し元で isRepaid を判断できるように、特別なサフィックスを付けるか、
            // ここでは純粋な状態を返し、getStreakAtDate側でbalanceを見る形にする。
            // → 今回は getStreakAtDate 側で再計算するのはコストが高いので、
            //   ここで計算済みの balance を考慮した状態を返す設計にします。
            
            if (isRepaid) return 'drink_exercise_success'; // 新設: 完済
            return hasExercise ? 'drink_exercise' : 'drink';
        }
        if (hasExercise) {
            return 'exercise';
        }
        return 'none';
    },

    getCurrentStreak: (logs, checks) => {
        return Calc.getStreakAtDate(dayjs(), logs, checks);
    },

    getStreakAtDate: (dateInput, logs, checks) => {
        let streak = 0;
        const baseDate = dayjs(dateInput); 
        for (let i = 1; i <= 30; i++) {
            const d = baseDate.subtract(i, 'day');
            const status = Calc.getDayStatus(d, logs, checks);
            
            // 【修正】休肝日(rest) または 完済(drink_exercise_success) ならStreak継続！
            // これで「飲んでも返せばOK」というアプリのコンセプトが守られます
            if (status === 'rest' || status === 'rest_exercise' || status === 'drink_exercise_success') {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    },

    getStreakMultiplier: (streak) => {
        if (streak >= 3) return 1.2;
        if (streak >= 2) return 1.1;
        return 1.0;
    },

    // 【維持】カロリーベースの飲酒判定 (logic.jsのものを採用)
    hasAlcoholLog: (logs, timestamp) => {
        const target = dayjs(timestamp);
        // kcalがマイナス＝飲酒
        return logs.some(l => (l.kcal !== undefined ? l.kcal : l.minutes) < 0 && target.isSame(dayjs(l.timestamp), 'day'));
    },
    
    getDryDayCount: (checks) => {
        const uniqueDays = new Set();
        checks.forEach(c => {
            if (c.isDryDay) uniqueDays.add(dayjs(c.timestamp).format('YYYY-MM-DD'));
        });
        return uniqueDays.size;
    },

    getRecentGrade: (checks, logs = []) => {
        const NOW = dayjs();
        const PERIOD_DAYS = 28; 
        
        let startTs = NOW.valueOf();
        if (checks.length > 0) startTs = Math.min(startTs, checks[0].timestamp);
        if (logs.length > 0) startTs = Math.min(startTs, logs[logs.length-1].timestamp); 

        const daysSinceStart = Math.max(1, NOW.diff(dayjs(startTs), 'day'));
        const cutoffDate = NOW.subtract(PERIOD_DAYS, 'day').startOf('day');

        const successDays = new Set();

        checks.forEach(c => {
            if (c.isDryDay && dayjs(c.timestamp).isAfter(cutoffDate)) {
                successDays.add(dayjs(c.timestamp).format('YYYY-MM-DD'));
            }
        });

        const dailyBalances = {};
        logs.forEach(l => {
            const d = dayjs(l.timestamp);
            if (d.isAfter(cutoffDate)) {
                const key = d.format('YYYY-MM-DD');
                // カロリーベースで集計
                const val = l.kcal !== undefined ? l.kcal : (l.minutes * Calc.burnRate(6.0)); // fallback
                dailyBalances[key] = (dailyBalances[key] || 0) + val;
            }
        });

        Object.keys(dailyBalances).forEach(dateStr => {
            if (dailyBalances[dateStr] >= 0) {
                successDays.add(dateStr);
            }
        });

        const recentSuccessDays = successDays.size;

        if (daysSinceStart < 28) {
            const rate = recentSuccessDays / daysSinceStart;
            if (rate >= 0.7) return { rank: 'Rookie S', label: '新星 🌟', color: 'text-orange-500', bg: 'bg-orange-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 1.0 };
            if (rate >= 0.4) return { rank: 'Rookie A', label: '期待の星 🔥', color: 'text-indigo-500', bg: 'bg-indigo-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.7 };
            if (rate >= 0.25) return { rank: 'Rookie B', label: '駆け出し 🐣', color: 'text-green-500', bg: 'bg-green-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.4 };
            return { rank: 'Beginner', label: 'たまご 🥚', color: 'text-gray-500', bg: 'bg-gray-100', next: 1, current: recentSuccessDays, isRookie: true, rawRate: rate, targetRate: 0.25 };
        }

        if (recentSuccessDays >= 20) return { rank: 'S', label: '神の肝臓 👼', color: 'text-purple-600', bg: 'bg-purple-100', next: null, current: recentSuccessDays };
        if (recentSuccessDays >= 12) return { rank: 'A', label: '鉄の肝臓 🛡️', color: 'text-indigo-600', bg: 'bg-indigo-100', next: 20, current: recentSuccessDays };
        if (recentSuccessDays >= 8)  return { rank: 'B', label: '健康志向 🌿', color: 'text-green-600', bg: 'bg-green-100', next: 12, current: recentSuccessDays };
        return { rank: 'C', label: '要注意 ⚠️', color: 'text-red-500', bg: 'bg-red-50', next: 8, current: recentSuccessDays };
    }

};
