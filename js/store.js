import { APP } from './constants.js';

// DexieはHTMLで読み込んでいるため window.Dexie として存在します
export const db = new Dexie("NomutoreDB");
db.version(1).stores({
    logs: '++id, timestamp, type, name',
    checks: '++id, timestamp'
});

export const Store = {
    getProfile: () => ({
        weight: parseFloat(localStorage.getItem(APP.STORAGE_KEYS.WEIGHT)) || APP.DEFAULTS.WEIGHT,
        height: parseFloat(localStorage.getItem(APP.STORAGE_KEYS.HEIGHT)) || APP.DEFAULTS.HEIGHT,
        age: parseInt(localStorage.getItem(APP.STORAGE_KEYS.AGE)) || APP.DEFAULTS.AGE,
        gender: localStorage.getItem(APP.STORAGE_KEYS.GENDER) || APP.DEFAULTS.GENDER
    }),
    getModes: () => ({
        mode1: localStorage.getItem(APP.STORAGE_KEYS.MODE1) || APP.DEFAULTS.MODE1,
        mode2: localStorage.getItem(APP.STORAGE_KEYS.MODE2) || APP.DEFAULTS.MODE2
    }),
    getBaseExercise: () => localStorage.getItem(APP.STORAGE_KEYS.BASE_EXERCISE) || APP.DEFAULTS.BASE_EXERCISE
};

// 外部アプリ連携など
export const ExternalApp = {
    searchUntappd: (term) => {
        const query = encodeURIComponent(term);
        const appUrl = `untappd://beer/search?q=${query}`;
        const webUrl = `https://untappd.com/search?q=${query}`;
        window.location.href = appUrl;
        setTimeout(() => {
            if (!document.hidden) {
                window.open(webUrl, '_blank');
            }
        }, 1000);
    }
};