import { Store } from './store.js';
import { EXERCISE, CALORIES, APP, BEER_COLORS, STYLE_COLOR_MAP } from './constants.js'; 
import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm';

export const Calc = {
    getBMR: () => {
        const p = Store.getProfile();
        const k = 1000 / 4.186;
        if(p.gender === 'male') {
            return ((0.0481 * p.weight) + (0.0234 * p.height) - (0.0138 * p.age) - 0.4235) * k;
        } else {
            return ((0.0481 * p.weight) + (0.0234 * p.height) - (0.0138 * p.age) - 0.9708) * k;
        }
    },
    burnRate: (mets) => {
        const bmr = Calc.getBMR();
        const netMets = Math.max(0, mets - 1);
        return (bmr / 24 * netMets) / 60;
    },
    
    // 【新規】運動時間(分) → カロリー(kcal)
    calculateExerciseKcal: (minutes, exerciseKey) => {
        const exData = EXERCISE[exerciseKey] || EXERCISE['stepper'];
        const rate = Calc.burnRate(exData.mets);
        return minutes * rate;
    },

    // 【新規】カロリー(kcal) → 指定された運動の時間(分)
    convertKcalToMinutes: (kcal, targetExerciseKey) => {
        const exData = EXERCISE[targetExerciseKey] || EXERCISE['stepper'];
        const rate = Calc.burnRate(exData.mets);
        if (rate === 0) return 0;
        return Math.round(kcal / rate);
    },
    
    // アルコールカロリー計算（変更なし）
    calculateAlcoholKcal: (ml, abv, type) => {
        const alcoholG = ml * (abv / 100) * 0.8;
        let kcal = alcoholG * 7;
        if (type === 'sweet') {
             kcal += ml * 0.15;
        }
        return kcal;
    },
    
    stepperEq: (kcal) => {
        return Calc.convertKcalToMinutes(kcal, 'stepper');
    },

    // 【修正】タンク表示用データ生成 (カロリーベースに変更)
    getTankDisplayData: (currentKcalBalance, currentBeerMode) => {
        const modes = Store.getModes();
        const targetStyle = currentBeerMode === 'mode1' ? modes.mode1 : modes.mode2;
        const unitKcal = CALORIES.STYLES[targetStyle] || 145;
        
        // 色情報の決定
        const colorKey = STYLE_COLOR_MAP[targetStyle] || 'default';
        const liquidColor = BEER_COLORS[colorKey];
        const isHazy = (colorKey === 'hazy');

        // 残数計算 (現在のカロリー収支 / 1本あたりのカロリー)
        const canCount = parseFloat((currentKcalBalance / unitKcal).toFixed(1));

        // 換算時間計算 (現在のカロリー収支を、設定されている運動で割る)
        const baseEx = Store.getBaseExercise();
        const baseExData = EXERCISE[baseEx] || EXERCISE['stepper'];
        const displayMinutes = Calc.convertKcalToMinutes(currentKcalBalance, baseEx);
        const displayRate = Calc.burnRate(baseExData.mets); // 参考用
        
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
        let balance = 0;
        dayLogs.forEach(l => balance += (l.kcal || 0)); // kcalで判定
        const isDryCheck = checks.some(c => c.isDryDay && targetDay.isSame(dayjs(c.timestamp), 'day'));
        
        if (isDryCheck) return 'dry';
        if (dayLogs.length > 0) {
            if (balance >= 0) return 'dry'; 
            return 'drink'; 
        }
        return 'unknown';
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
            if (status === 'dry') streak++; else break;
        }
        return streak;
    },

    getStreakMultiplier: (streak) => {
        if (streak >= 3) return 1.2;
        if (streak >= 2) return 1.1;
        return 1.0;
    },

    hasAlcoholLog: (logs, timestamp) => {
        const target = dayjs(timestamp);
        // kcalがマイナス＝飲酒
        return logs.some(l => l.kcal < 0 && target.isSame(dayjs(l.timestamp), 'day'));
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
                dailyBalances[key] = (dailyBalances[key] || 0) + (l.kcal || 0);
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