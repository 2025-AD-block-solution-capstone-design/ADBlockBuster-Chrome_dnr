// 1) 액션 이름 상수
const ACTIONS = {
    HIDE:               'hide',
    VISIBILITY_HIDDEN:  'visibilityHidden',
    TRANSPARENT:        'transparent',
    COLLAPSE:           'collapse',
    OFFSCREEN:          'offscreen',
    REMOVE:             'remove',
    DETACH:             'detach',
    HIDDEN_ATTRIBUTE:   'hiddenAttribute',
    POINTER_EVENTS_NONE:'pointerEventsNone',
    USER_SELECT_NONE:   'userSelectNone',
    BACKGROUND_NONE:    'backgroundNone',
    Z_INDEX_NEG:        'zIndexNeg',
    FILTER_BLUR:        'filterBlur',
    FILTER_GRAYSCALE:   'filterGrayscale',
    FILTER_SEPIA:       'filterSepia',
    TRANSFORM_SCALE_ZERO:'transformScaleZero',
    CLIP_RECT_ZERO:     'clipRectZero'
};

// 2) 각 액션에 대응하는 핸들러 매핑
const ACTION_HANDLERS = {
    [ACTIONS.HIDE]: el => el.style.display = 'none',
    [ACTIONS.VISIBILITY_HIDDEN]: el => el.style.visibility = 'hidden',
    [ACTIONS.TRANSPARENT]: el => el.style.opacity = '0',
    [ACTIONS.COLLAPSE]: el => Object.assign(el.style, { width: '0', height: '0', overflow: 'hidden' }),
    [ACTIONS.OFFSCREEN]: el => Object.assign(el.style, { position: 'absolute', left: '-9999px', top: '-9999px' }),
    [ACTIONS.REMOVE]: el => el.remove(),
    [ACTIONS.DETACH]: el => el.parentNode?.removeChild(el),
    [ACTIONS.HIDDEN_ATTRIBUTE]: el => el.hidden = true,
    [ACTIONS.POINTER_EVENTS_NONE]: el => el.style.pointerEvents = 'none',
    [ACTIONS.USER_SELECT_NONE]: el => el.style.userSelect = 'none',
    [ACTIONS.BACKGROUND_NONE]: el => el.style.setProperty('background', 'none', 'important'),
    [ACTIONS.Z_INDEX_NEG]: el => el.style.zIndex = '-9999',
    [ACTIONS.FILTER_BLUR]: el => el.style.filter = 'blur(50px)',
    [ACTIONS.FILTER_GRAYSCALE]: el => el.style.filter = 'grayscale(100%)',
    [ACTIONS.FILTER_SEPIA]: el => el.style.filter = 'sepia(100%)',
    [ACTIONS.TRANSFORM_SCALE_ZERO]: el => el.style.transform = 'scale(0)',
    [ACTIONS.CLIP_RECT_ZERO]: el => el.style.clip = 'rect(0,0,0,0)'
};

// Global variables for both content scripts and service worker
globalThis.ACTIONS = ACTIONS;
globalThis.ACTION_HANDLERS = ACTION_HANDLERS;
