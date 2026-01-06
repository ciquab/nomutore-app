import { Store } from './store.js';
import { EXERCISE } from './constants.js';

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
    stepperEq: (kcal) => kcal / Calc.burnRate(EXERCISE['stepper'].mets),
    isSameDay: (ts1, ts2) => { const d1 = new Date(ts1), d2 = new Date(ts2); return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate(); },
    
    getDayStatus: (date, logs, checks) => {
        const hasDrink = logs.some(l => l.minutes < 0 && Calc.isSameDay(l.timestamp, date));
        const isDryCheck = checks.some(c => c.isDryDay && Calc.isSameDay(c.timestamp, date));
        if (hasDrink) return 'drink';
        if (isDryCheck) return 'dry';
        return 'unknown';
    },

    getCurrentStreak: (logs, checks) => {
        let streak = 0;
        const today = new Date();
        for (let i = 1; i <= 30; i++) {
            const d = new Date();
            d.setDate(today.getDate() - i);
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

    hasAlcoholLog: (logs, timestamp) => logs.some(l => l.minutes < 0 && Calc.isSameDay(l.timestamp, timestamp)),
    getDryDayCount: (checks) => checks.filter(c => c.isDryDay).length,

    // 【改善】ルーキー救済対応のグレード判定
    getRecentGrade: (checks, logs = []) => {
        const NOW = new Date();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const PERIOD_DAYS = 28; // 4週間
        
        // 最初の記録日を探す（開始日判定）
        let startTs = NOW.getTime();
        if (checks.length > 0) startTs = Math.min(startTs, checks[0].timestamp);
        if (logs.length > 0) startTs = Math.min(startTs, logs[logs.length-1].timestamp); // logsは新しい順になっている場合が多いが念のため末尾も確認

        const daysSinceStart = Math.max(1, Math.floor((NOW.getTime() - startTs) / DAY_MS));
        
        // 直近28日以内の休肝日をカウント
        const cutoffDate = new Date(NOW.getTime() - (PERIOD_DAYS * DAY_MS));
        cutoffDate.setHours(0, 0, 0, 0);

        const recentDryDays = checks.filter(c => {
            return c.isDryDay && new Date(c.timestamp) >= cutoffDate;
        }).length;

        // ルーキーモード (開始28日未満)
        if (daysSinceStart < 28) {
            const rate = recentDryDays / daysSinceStart;
            // 判定基準: 週5(0.71)=S, 週3(0.42)=A, 週2(0.28)=B
            if (rate >= 0.7) return { rank: 'Rookie S', label: '新星 🌟', color: 'text-orange-500', bg: 'bg-orange-100', next: 1, current: recentDryDays, isRookie: true, rawRate: rate, targetRate: 1.0 };
            if (rate >= 0.4) return { rank: 'Rookie A', label: '期待の星 🔥', color: 'text-indigo-500', bg: 'bg-indigo-100', next: 1, current: recentDryDays, isRookie: true, rawRate: rate, targetRate: 0.7 };
            if (rate >= 0.25) return { rank: 'Rookie B', label: '駆け出し 🐣', color: 'text-green-500', bg: 'bg-green-100', next: 1, current: recentDryDays, isRookie: true, rawRate: rate, targetRate: 0.4 };
            return { rank: 'Beginner', label: 'たまご 🥚', color: 'text-gray-500', bg: 'bg-gray-100', next: 1, current: recentDryDays, isRookie: true, rawRate: rate, targetRate: 0.25 };
        }

        // 通常モード
        if (recentDryDays >= 20) return { rank: 'S', label: '神の肝臓 👼', color: 'text-purple-600', bg: 'bg-purple-100', next: null, current: recentDryDays };
        if (recentDryDays >= 12) return { rank: 'A', label: '鉄の肝臓 🛡️', color: 'text-indigo-600', bg: 'bg-indigo-100', next: 20, current: recentDryDays };
        if (recentDryDays >= 8)  return { rank: 'B', label: '健康志向 🌿', color: 'text-green-600', bg: 'bg-green-100', next: 12, current: recentDryDays };
        return { rank: 'C', label: '要注意 ⚠️', color: 'text-red-500', bg: 'bg-red-50', next: 8, current: recentDryDays };
    }
};