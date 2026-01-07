import { Store } from './store.js';
import { EXERCISE } from './constants.js';
// Day.js をCDNからインポート (ES Modules)
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
    stepperEq: (kcal) => kcal / Calc.burnRate(EXERCISE['stepper'].mets),
    
    // Day.js を使用して日付が同じかどうかを判定 ('day'単位で比較)
    isSameDay: (ts1, ts2) => dayjs(ts1).isSame(dayjs(ts2), 'day'),
    
    getDayStatus: (date, logs, checks) => {
        // dateはDay.jsオブジェクトまたはDateオブジェクト等
        const targetDay = dayjs(date);
        
        // logsの中で、ターゲット日と同じ日付の「借金(minutes < 0)」があるか
        const hasDrink = logs.some(l => l.minutes < 0 && targetDay.isSame(dayjs(l.timestamp), 'day'));
        
        // checksの中で、ターゲット日と同じ日付の「休肝日フラグ」があるか
        const isDryCheck = checks.some(c => c.isDryDay && targetDay.isSame(dayjs(c.timestamp), 'day'));
        
        if (hasDrink) return 'drink';
        if (isDryCheck) return 'dry';
        return 'unknown';
    },

    getCurrentStreak: (logs, checks) => {
        let streak = 0;
        const today = dayjs(); // 本日
        
        // 過去30日分遡ってチェック
        for (let i = 1; i <= 30; i++) {
            const d = today.subtract(i, 'day'); // Day.jsで日付を引き算
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
        return logs.some(l => l.minutes < 0 && target.isSame(dayjs(l.timestamp), 'day'));
    },
    
    getDryDayCount: (checks) => {
        // ★修正: 日付重複を除外してユニークカウント
        const uniqueDays = new Set();
        checks.forEach(c => {
            if (c.isDryDay) uniqueDays.add(dayjs(c.timestamp).format('YYYY-MM-DD'));
        });
        return uniqueDays.size;
    },

    // 【改善】ルーキー救済対応のグレード判定
    getRecentGrade: (checks, logs = []) => {
        const NOW = dayjs();
        const PERIOD_DAYS = 28; // 4週間
        
        // 最初の記録日を探す（開始日判定）
        let startTs = NOW.valueOf();
        if (checks.length > 0) startTs = Math.min(startTs, checks[0].timestamp);
        if (logs.length > 0) startTs = Math.min(startTs, logs[logs.length-1].timestamp); 

        // 開始からの日数をDay.jsで計算 (diff)
        const daysSinceStart = Math.max(1, NOW.diff(dayjs(startTs), 'day'));
        
        // 直近28日以内の休肝日をカウント
        // cutoffDate = 本日 - 28日
        const cutoffDate = NOW.subtract(PERIOD_DAYS, 'day').startOf('day');

        // ★修正: 日付重複を除外してユニークカウント
        const uniqueRecentDryDays = new Set();
        checks.forEach(c => {
            if (c.isDryDay && dayjs(c.timestamp).isAfter(cutoffDate)) {
                uniqueRecentDryDays.add(dayjs(c.timestamp).format('YYYY-MM-DD'));
            }
        });
        const recentDryDays = uniqueRecentDryDays.size;

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