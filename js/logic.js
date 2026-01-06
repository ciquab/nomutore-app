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
    getLiverRank: (count) => {
        if (count >= 100) return { title: '神の肝臓 👼', color: 'text-purple-600', bg: 'bg-purple-100', next: null };
        if (count >= 50) return { title: '鉄の肝臓 🛡️', color: 'text-slate-700', bg: 'bg-slate-200', next: 100 };
        if (count >= 30) return { title: 'プロ休肝ラー 🧘', color: 'text-indigo-600', bg: 'bg-indigo-100', next: 50 };
        if (count >= 10) return { title: '健康マイスター 🌿', color: 'text-green-600', bg: 'bg-green-100', next: 30 };
        if (count >= 3) return { title: '見習い 🔰', color: 'text-blue-600', bg: 'bg-blue-100', next: 10 };
        return { title: 'たまご 🥚', color: 'text-gray-500', bg: 'bg-gray-100', next: 3 };
    }
};