export const APP = {
    STORAGE_KEYS: {
        LOGS: 'hazy_payback_logs', 
        CHECKS: 'hazy_payback_checks', 
        WEIGHT: 'hazy_payback_weight', 
        HEIGHT: 'hazy_payback_height', 
        AGE: 'hazy_payback_age', 
        GENDER: 'hazy_payback_gender', 
        TIMER_START: 'hazy_payback_timer_start', 
        MODE1: 'hazy_payback_mode_1', 
        MODE2: 'hazy_payback_mode_2',
        BASE_EXERCISE: 'hazy_payback_base_exercise',
        THEME: 'hazy_payback_theme',
        DEFAULT_RECORD_EXERCISE: 'hazy_payback_default_record_exercise' // 追加
    },
    DEFAULTS: { 
        WEIGHT: 60, HEIGHT: 160, AGE: 30, GENDER: 'female', 
        MODE1: '大手ラガー', MODE2: 'Hazy IPA',
        BASE_EXERCISE: 'walking',
        THEME: 'system',
        DEFAULT_RECORD_EXERCISE: 'walking' // 追加
    },
    TANK_MAX_CANS: 3.0
};

export const CALORIES = { STYLES: { 'バーレイワイン': 320, 'ダブルIPA (DIPA)': 270, 'ベルジャン・トリペル': 250, 'Hazy IPA': 220, 'スタウト': 200, 'IPA (West Coast)': 190, 'ヴァイツェン': 180, 'アンバーエール': 175, 'ポーター': 170, 'Hazyペールエール': 170, 'セゾン': 165, 'ベルジャンホワイト': 160, 'ペールエール': 160, 'ジャパニーズエール': 160, 'シュバルツ': 155, '大手ラガー': 145, 'ドルトムンター': 145, 'ピルスナー': 140, 'サワーエール': 140, 'フルーツビール': 160, 'セッションIPA': 130, '糖質オフ/第三のビール': 110 } };

// 【追加】スタイルごとの液色定義 (CSSのbackgroundプロパティ値)
export const BEER_COLORS = {
    'default': 'linear-gradient(to top, #d97706, #fbbf24)', // 通常の黄金色
    'black': 'linear-gradient(to top, #000000, #4b2c20)', // 黒ビール
    'amber': 'linear-gradient(to top, #78350f, #d97706)', // アンバー/茶色
    'white': 'linear-gradient(to top, #fcd34d, #fef3c7)', // 白ビール/薄い黄色
    'hazy': 'linear-gradient(to top, #d97706, #fbbf24)', // Hazy (濁りはCSSクラスで制御)
    'red': 'linear-gradient(to top, #7f1d1d, #ef4444)', // フルーツ/サワー系
};

// 【追加】各スタイルがどの色カテゴリに属するか
export const STYLE_COLOR_MAP = {
    'スタウト': 'black', 'ポーター': 'black', 'シュバルツ': 'black',
    'アンバーエール': 'amber', 'バーレイワイン': 'amber',
    'ヴァイツェン': 'white', 'ベルジャンホワイト': 'white', 'セゾン': 'white',
    'Hazy IPA': 'hazy', 'Hazyペールエール': 'hazy',
    'フルーツビール': 'red', 'サワーエール': 'red',
    // その他はdefault
};

export const EXERCISE = { 'stepper': { label: 'ステッパー', mets: 6.0, icon: '🏃‍♀️' }, 'walking': { label: 'ウォーキング (通勤等)', mets: 3.5, icon: '🚶' }, 'brisk_walking': { label: '早歩き', mets: 4.5, icon: '👟' }, 'cycling': { label: '自転車 (ゆっくり)', mets: 4.0, icon: '🚲' }, 'training': { label: '筋トレ (パーソナル等)', mets: 5.0, icon: '🏋️' }, 'running': { label: 'ランニング', mets: 7.0, icon: '💨' }, 'hiit': { label: 'HIIT (高強度)', mets: 8.0, icon: '🔥' }, 'yoga': { label: 'ヨガ (ストレッチ)', mets: 2.5, icon: '🧘' }, 'cleaning': { label: '部屋の掃除', mets: 3.0, icon: '🧹' } };
export const SIZE_DATA = { '350': { label: '350ml (缶)', ratio: 1.0 }, '500': { label: '500ml (ロング缶)', ratio: 1.43 }, '473': { label: '473ml (USパイント)', ratio: 1.35 }, '568': { label: '568ml (UKパイント)', ratio: 1.62 }, '250': { label: '250ml (小グラス)', ratio: 0.71 }, '1000': { label: '1L (マース)', ratio: 2.86 } };