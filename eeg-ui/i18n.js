'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   i18n.js — English / Gujarati translation system.

   Two layers:
   1. STATIC UI text — every element with a data-i18n="key" attribute gets its
      textContent set from I18N[lang][key] by applyI18n(). Placeholders use
      data-i18n-placeholder="key"; titles use data-i18n-title="key".
   2. DYNAMIC text generated in app.js (state names, notes, status messages,
      numbers) — call t('key') for strings, or use the state/label lookup
      tables below (translateState, translateGuna, ...) for the Sanskrit/
      Yoga identifiers that are also used as internal logic keys and must
      NOT be renamed at the source (only their on-screen text changes).

   Load this file BEFORE app.js — it defines window.I18N/t/applyI18n/
   getLang/setLang/toGujaratiDigits used throughout app.js.
════════════════════════════════════════════════════════════════════════════ */

const I18N = {
  en: {
    // ── Brand / login ──
    brandName: 'EEG Dev Testing',
    brandSub: 'from brainwaves to bliss',
    signIn: 'Sign In',
    username: 'Username',
    password: 'Password',

    // ── Chitta Bhumi state names (also used as internal/API identifiers in
    // Roman script elsewhere — these keys only affect what's DISPLAYED) ──
    state_Mudha: 'Mudha', state_Kshipta: 'Kshipta', state_Vikshipta: 'Vikshipta',
    state_Ekagra: 'Ekagra', state_Niruddha: 'Niruddha',
    depth_Surface: 'Surface', depth_Emerging: 'Emerging', depth_Deep: 'Deep',
    depth_Profound: 'Profound', 'depth_Deep Inertia': 'Deep Inertia',
    swara_Ida: 'Ida', swara_Pingala: 'Pingala', swara_Sushumna: 'Sushumna',
    nirodha_Nirodha: 'Nirodha (still)', nirodha_Settling: 'Settling',
    nirodha_Active: 'Active', nirodha_Vikshepa: 'Vikshepa (scattered)',
    conf_High: 'High', conf_Moderate: 'Moderate', conf_Low: 'Low',

    // ── Sidebar nav ──
    navLiveMonitor: 'Live Monitor',
    navThisWeek: 'This Week',
    navCohort: 'Cohort',
    navClients: 'Clients',
    navReplay: 'Replay',
    navAnalyze: 'Analyze',
    navPrescribe: 'Prescribe',
    navAdmin: 'Admin',
    sidebarBadge: 'Phase 0 · shell',

    // ── Header ──
    adminDashboardBtn: 'Admin Dashboard',
    aiBabaBtn: '🧘 AI Baba',
    signOut: 'Sign out',

    // ── Settings overlay ──
    settingsTitle: 'configuration',
    settingsBluetoothTitle: 'Bluetooth Headband',
    settingsBtScan: 'Scan & Connect Headband',
    settingsBtNote: 'Works with Muse and BrainBit headbands; the driver layer makes adding other BLE headbands straightforward. Raw EEG is collected for 2 s then sent to your Render backend for full Random-Forest classification — or processed locally if no backend is configured. Requires Chrome or Edge.',
    settingsBackendTitle: 'Render Backend URL',
    settingsBackendUrlLabel: 'Backend URL',
    settingsBackendNote: 'The backend must expose POST /analyze (raw EEG) and optionally POST /analyze/bands (pre-computed powers).',
    settingsTestConn: 'Test connection',
    settingsSaveConn: 'Save & connect',
    settingsRawEndpointTitle: 'Raw EEG endpoint',
    settingsBandsEndpointTitle: 'Pre-computed bands endpoint',
    settingsResponseTitle: 'Response (both endpoints)',

    // ── Command bar / metric bar ──
    disconnect: 'Disconnect',
    connect: 'Connect',
    demo: 'Demo',
    noClient: 'No client',
    startSession: 'Start Session',
    endSession: 'End Session',
    metricEpoch: 'EPOCH',
    metricQuality: 'QUALITY',
    metricLatency: 'LATENCY',
    metricBuffer: 'BUFFER',
    metricMode: 'MODE',
    metricBoard: 'BOARD',
    metricStatus: 'STATUS',
    awaitingSignal: 'awaiting signal',
    disconnected: 'disconnected',

    // ── Chitta Bhumi card ──
    chittaBhumiTitle: 'CHITTA BHUMI',
    confidence: 'CONFIDENCE',
    stateProbabilitiesTitle: 'STATE PROBABILITIES',
    contemplativeDepth: 'CONTEMPLATIVE DEPTH',

    // ── Swara Nadi card ──
    swaraNadiTitle: 'SWARA NADI',
    swaraLunarLeft: 'lunar · left',
    swaraBalanced: 'balanced',
    swaraSolarRight: 'solar · right',

    // ── Band powers ──
    bandPowersTitle: 'SPECTRAL BAND POWERS',
    bandDelta: 'Delta', bandTheta: 'Theta', bandAlpha: 'Alpha', bandBeta: 'Beta', bandGamma: 'Gamma',

    // ── Trigunas ──
    trigunasTitle: 'TRIGUNAS',
    sattva: 'Sattva', rajas: 'Rajas', tamas: 'Tamas',
    sattvaSub: 'clarity', rajasSub: 'activity', tamasSub: 'inertia',

    // ── Inner Texture ──
    innerTextureTitle: 'INNER TEXTURE',
    innerTextureNote: 'stilling of the citta-vṛttis (relative to this session)',
    vritti: 'Vṛtti', vrittiSub: 'mental activity',
    mindRichness: 'Mind Richness', mindRichnessSub: 'liveliness',
    backgroundStillness: 'Background Stillness', backgroundStillnessSub: 'settled baseline',

    // ── Vitals ──
    bloodOxygenTitle: 'BLOOD OXYGEN',
    bloodOxygenSub: 'SpO₂ · blood oxygen saturation',
    heartRateTitle: 'HEART RATE',
    heartRateSub: 'pulse · beats per minute',
    statusLabel: 'STATUS',

    // ── Tattva ──
    tattvaTitle: 'TATTVA / CHAKRA CORRELATES',
    noFlagsActive: 'no flags active',
    noneDetected: 'None detected',

    // ── Session notes / history ──
    sessionNotesTitle: 'SESSION NOTES',
    sessionNotesPlaceholder: 'Notes for this session…',
    sessionHistoryTitle: 'SESSION HISTORY',
    show: 'Show', hide: 'Hide',
    noSessionsYet: 'No sessions yet',

    // ── Home / This Week ──
    needsAttention: 'NEEDS ATTENTION',
    recentSessions: 'RECENT SESSIONS',

    // ── Cohort ──
    cohortTitle: 'Cohort',
    addClient: '＋ Add client',
    cohortHint: 'Click a client to open their profile.',

    // ── Client profile ──
    clientEmptyState: 'Select a client from the Cohort view.',
    edit: 'Edit',
    backToCohort: '← Cohort',
    sessionTimelineTitle: 'SESSION TIMELINE',
    sessionTimelineHint: 'Dot size = session length · click a session to replay it',
    protocolTitle: 'PROTOCOL',
    teacherNotesTitle: 'TEACHER NOTES',

    // ── Replay ──
    replayPrev: 'Previous', replayNext: 'Next', replayPlay: '▶ Play', replayPause: '⏸ Pause',
    replayState: 'State', replaySwara: 'Swara', replayGuna: 'Dominant Guna',
    replayAlpha: 'Alpha Power', replaySpo2: 'SpO₂', replayHr: 'Heart Rate',
    replayNoData: 'No epoch data available for this session.',

    // ── Analyze ──
    analyzeTitle: 'Analyze',
    analyzeEmptyHint: 'Pick a recorded session to see its guṇa, chitta-bhūmi, svara and band-power profile.',
    bandSpectrumTitle: 'BAND POWER SPECTRUM',
    trigunaBalanceTitle: 'TRIGUṆA BALANCE',
    bhumiDistributionTitle: 'CHITTA-BHŪMI DISTRIBUTION',
    swaraBalanceTitle: 'SVARA / NĀḌĪ BALANCE',
    contemplativeDepthTitle: 'CONTEMPLATIVE DEPTH',
    sensorLayoutTitle: 'SENSOR LAYOUT',
    sensorDisclaimer: '4-channel headband. Values are whole-head averages — per-electrode localization is not recorded and not implied.',
    innerTextureSessionAvgTitle: 'INNER TEXTURE (SESSION AVERAGE)',
    innerTextureAvgNote: 'stilling of the citta-vṛttis, averaged over the session',
    tattvaSessionTitle: 'TATTVA / CHAKRA CORRELATES (SESSION)',

    // ── Prescribe ──
    prescribeTitle: 'Prescribe',
    prescribeHint: 'Turn a session into a practice recommendation with AI Baba.',
    prescribeTag: 'Phase 4',

    // ── Admin ──
    adminBackToDashboard: '← Dashboard',
    adminDashboardTitle: 'Admin Dashboard',
    adminTabUsers: 'Users', adminTabSessions: 'Sessions',
    adminUserAccountsTitle: 'User Accounts',
    adminAddUser: '+ Add User',
    adminRoleUser: 'User', adminRoleCoAdmin: 'Co-Admin', adminRoleAdmin: 'Admin',
    create: 'Create', cancel: 'Cancel', save: 'Save',
    resetPwPlaceholder: 'New password for user',
    colUsername: 'Username', colRole: 'Role', colCreated: 'Created', colActions: 'Actions',
    loading: 'Loading…',
    adminAllSessionsTitle: 'All Sessions',
    searchUserPlaceholder: 'Search user…',
    colUser: 'User', colSessionName: 'Session Name', colStart: 'Start',
    colDuration: 'Duration', colEpochs: 'Epochs',

    // ── Analytics modal ──
    sessionAnalyticsTitle: 'Session Analytics',
    close: '✕ Close',
    loadingSessionData: 'Loading session data…',
    statEpochs: 'Epochs', statDuration: 'Duration', statDominantGuna: 'Dominant Guna',
    statPrimaryState: 'Primary State', statAvgSpo2: 'Avg SpO₂ (%)', statAvgHr: 'Avg Heart Rate (BPM)',
    trigunaSessionAvgTitle: 'Trigunas — Session Average',
    bhumiDistTitle: 'Chitta Bhumi Distribution',
    swaraDistTitle: 'Swara Distribution',
    avgBandPowersTitle: 'Average Band Powers',
    sessionTimelineTitle2: 'Session Timeline',
    timelineHint: 'Consecutive epochs in the same Chitta Bhumi state are grouped into phases.',
    sessionNotesTitle2: 'Session Notes',
    noNotesRecorded: 'No notes recorded for this session.',
    epochReplayTitle: 'Epoch Replay',
    epochReplayHint: 'Step through recorded epochs to see how the EEG state evolved over time.',
    openInReplay: 'Open in Replay ↗',

    // ── AI Baba ──
    aiBabaTitle: 'AI Baba',
    aiBabaIntro: 'Namaste 🙏 I am AI Baba. I can help you understand your EEG sessions — your mental states, concentration, energy, and brainwave patterns.',
    aiBabaWhichSession: 'Which session would you like to explore?',
    aiBabaLoadingSessions: 'Loading your sessions…',
    aiBabaNoSessions: 'No sessions with recorded data found. Start a session and record some EEG epochs first!',
    aiBabaReadingBrainwaves: 'AI Baba is reading your brainwaves…',
    aiBabaChangeSession: '↩ Change session',
    aiBabaInputPlaceholder: 'Ask about your session…',

    // ── Toast / misc ──
    toastSaved: 'Saved',

    // ── Swara notes (client-side fallback only — the real backend's
    // ClassifySwara notes are its own DO-NOT-TOUCH English text; Gujarati
    // mode substitutes this shorter note instead of touching that logic) ──
    swaraNoteIda: 'Parasympathetic dominance. Receptive, creative and introspective state.',
    swaraNotePingala: 'Sympathetic dominance. Active, analytical and goal-directed focus.',
    swaraNoteSushumna: 'Equilibrium of solar and lunar channels. Gateway to higher contemplative states.',

    // ── Guna blend words (pattern-substituted into whatever combination the
    // classifier returns — "Sattvic-predominant, Rajasic-secondary" etc) ──
    guna_Sattvic: 'Sattvic', guna_Rajasic: 'Rajasic', guna_Tamasic: 'Tamasic',
    guna_predominant: 'predominant', guna_secondary: 'secondary',
    guna_Balanced: 'Balanced', guna_allThree: 'all three',
    gunaNoteSattvic: 'clarity & balance dominant',
    gunaNoteRajasic: 'activity & passion dominant',
    gunaNoteTamasic: 'inertia & heaviness dominant',

    // ── Tattva flag templates (percentages substituted in) ──
    tattva_pratyaharaWindow: 'Pratyahara Window',
    tattva_potentialActivation: 'Potential Tattva Activation',
    tattva_turiyaApproach: 'Turiya Approach',
    tattva_gammaSpike: 'Gamma Spike',
    tattva_gammaSurge: 'Gamma Surge',
    tattva_sushumnaActivated: 'Sushumna Activated',
    tattva_highBetaAgitation: 'High-Beta Agitation',
    tattva_tamasicState: 'Tamasic State',
    tattva_fmThetaActivation: 'Fm-θ Activation (Frontal Midline Theta)',

    // ── Status / mode text ──
    statusConnecting: 'connecting…',
    statusBluetoothFailed: 'BT failed',
    statusDemoMode: 'demo mode',
    statusWakingUp: 'waking up…',
    statusBackendWaking: 'backend waking…',
    modeBleRender: 'BLE → Render',
    modeBleLocal: 'BLE local',
    statusConnected: 'connected',
    statusModelLoading: 'model loading…',
    statusBackendReady: 'backend ready',
    statusBackendOffline: 'backend offline',
    statusReady: 'ready',
    statusLoadingModelDots: 'loading model…',
    renderBackendLabel: 'Render backend',
    qualityReplay: '⏪ replay',
    qualityLocalFft: '✓ local FFT',
    qualityDemo: '✓ demo',
    qualityBleRender: '✓ BLE → Render',
    liveReading: 'live reading',

    // ── Corroboration card ("WHAT THE SIGNALS SAY") ──
    corrobTitle: 'WHAT THE SIGNALS SAY',
    corrobHeldGently: 'held gently',
    axis_neural_complexity: 'Mind richness',
    axis_cortical_quietude: 'Background stillness',
    axis_mental_chatter: 'Mental chatter',
    axis_absorption_signature: 'Focus',
    axis_effortlessness: 'Effortlessness',
    concord_corroborated: 'Signals agree',
    concord_mixed: 'Mixed signals',
    concord_tension: 'Signals in tension',
    concord_inconclusive: 'Inconclusive',
  },

  gu: {
    brandName: 'EEG ડેવ ટેસ્ટિંગ',
    brandSub: 'મગજના તરંગોથી શાંતિ સુધી',
    signIn: 'લૉગિન કરો',
    username: 'વપરાશકર્તા નામ',
    password: 'પાસવર્ડ',

    state_Mudha: 'મૂઢ', state_Kshipta: 'ક્ષિપ્ત', state_Vikshipta: 'વિક્ષિપ્ત',
    state_Ekagra: 'એકાગ્ર', state_Niruddha: 'નિરુદ્ધ',
    depth_Surface: 'સપાટી', depth_Emerging: 'ઉભરતું', depth_Deep: 'ઊંડું',
    depth_Profound: 'ગહન', 'depth_Deep Inertia': 'ઊંડી જડતા',
    swara_Ida: 'ઇડા', swara_Pingala: 'પિંગલા', swara_Sushumna: 'સુષુમ્ણા',
    nirodha_Nirodha: 'નિરોધ (સ્થિર)', nirodha_Settling: 'સ્થિર થઈ રહ્યું છે',
    nirodha_Active: 'સક્રિય', nirodha_Vikshepa: 'વિક્ષેપ (વિખરાયેલું)',
    conf_High: 'ઊંચું', conf_Moderate: 'મધ્યમ', conf_Low: 'નીચું',

    navLiveMonitor: 'લાઇવ મોનિટર',
    navThisWeek: 'આ અઠવાડિયું',
    navCohort: 'જૂથ',
    navClients: 'ગ્રાહકો',
    navReplay: 'રિપ્લે',
    navAnalyze: 'વિશ્લેષણ',
    navPrescribe: 'સૂચન',
    navAdmin: 'એડમિન',
    sidebarBadge: 'તબક્કો 0 · શેલ',

    adminDashboardBtn: 'એડમિન ડેશબોર્ડ',
    aiBabaBtn: '🧘 AI બાબા',
    signOut: 'સાઇન આઉટ કરો',

    settingsTitle: 'સેટિંગ્સ',
    settingsBluetoothTitle: 'બ્લૂટૂથ હેડબેન્ડ',
    settingsBtScan: 'હેડબેન્ડ શોધો અને જોડો',
    settingsBtNote: 'Muse અને BrainBit હેડબેન્ડ સાથે કામ કરે છે; ડ્રાઇવર લેયર અન્ય BLE હેડબેન્ડ ઉમેરવાનું સરળ બનાવે છે. કાચો EEG ડેટા 2 સેકન્ડ માટે એકત્રિત કરવામાં આવે છે અને પછી સંપૂર્ણ વર્ગીકરણ માટે તમારા બેકએન્ડને મોકલવામાં આવે છે — અથવા જો કોઈ બેકએન્ડ સેટ ન હોય તો સ્થાનિક રીતે પ્રોસેસ કરવામાં આવે છે. Chrome અથવા Edge જરૂરી છે.',
    settingsBackendTitle: 'બેકએન્ડ URL',
    settingsBackendUrlLabel: 'બેકએન્ડ URL',
    settingsBackendNote: 'બેકએન્ડે POST /analyze (કાચો EEG) અને વૈકલ્પિક રીતે POST /analyze/bands (પૂર્વ-ગણતરી કરેલ પાવર) ઉપલબ્ધ કરાવવું જોઈએ.',
    settingsTestConn: 'જોડાણ ચકાસો',
    settingsSaveConn: 'સાચવો અને જોડો',
    settingsRawEndpointTitle: 'કાચો EEG endpoint',
    settingsBandsEndpointTitle: 'પૂર્વ-ગણતરી કરેલ બેન્ડ endpoint',
    settingsResponseTitle: 'પ્રતિભાવ (બંને endpoints)',

    disconnect: 'ડિસ્કનેક્ટ કરો',
    connect: 'જોડો',
    demo: 'ડેમો',
    noClient: 'કોઈ ગ્રાહક નહીં',
    startSession: 'સેશન શરૂ કરો',
    endSession: 'સેશન સમાપ્ત કરો',
    metricEpoch: 'એપોક',
    metricQuality: 'ગુણવત્તા',
    metricLatency: 'વિલંબ',
    metricBuffer: 'બફર',
    metricMode: 'મોડ',
    metricBoard: 'બોર્ડ',
    metricStatus: 'સ્થિતિ',
    awaitingSignal: 'સિગ્નલની રાહ જોઈ રહ્યાં છીએ',
    disconnected: 'ડિસ્કનેક્ટ થયેલ',

    chittaBhumiTitle: 'ચિત્ત ભૂમિ',
    confidence: 'વિશ્વાસ',
    stateProbabilitiesTitle: 'સ્થિતિ સંભાવનાઓ',
    contemplativeDepth: 'ચિંતનશીલ ઊંડાણ',

    swaraNadiTitle: 'સ્વર નાડી',
    swaraLunarLeft: 'ચંદ્ર · ડાબે',
    swaraBalanced: 'સંતુલિત',
    swaraSolarRight: 'સૂર્ય · જમણે',

    bandPowersTitle: 'સ્પેક્ટ્રલ બેન્ડ પાવર',
    bandDelta: 'ડેલ્ટા', bandTheta: 'થીટા', bandAlpha: 'આલ્ફા', bandBeta: 'બીટા', bandGamma: 'ગામા',

    trigunasTitle: 'ત્રિગુણ',
    sattva: 'સત્વ', rajas: 'રજસ', tamas: 'તમસ',
    sattvaSub: 'સ્પષ્ટતા', rajasSub: 'પ્રવૃત્તિ', tamasSub: 'જડતા',

    innerTextureTitle: 'આંતરિક રચના',
    innerTextureNote: 'ચિત્ત-વૃત્તિઓનું શમન (આ સેશનની સાપેક્ષે)',
    vritti: 'વૃત્તિ', vrittiSub: 'માનસિક પ્રવૃત્તિ',
    mindRichness: 'મનની સમૃદ્ધિ', mindRichnessSub: 'જીવંતતા',
    backgroundStillness: 'પાર્શ્વભૂમિ સ્થિરતા', backgroundStillnessSub: 'સ્થિર આધારરેખા',

    bloodOxygenTitle: 'લોહીમાં ઓક્સિજન',
    bloodOxygenSub: 'SpO₂ · લોહીમાં ઓક્સિજન સંતૃપ્તિ',
    heartRateTitle: 'હૃદય દર',
    heartRateSub: 'નાડી · પ્રતિ મિનિટ ધબકારા',
    statusLabel: 'સ્થિતિ',

    tattvaTitle: 'તત્ત્વ / ચક્ર સંબંધો',
    noFlagsActive: 'કોઈ ફ્લેગ સક્રિય નથી',
    noneDetected: 'કંઈ મળ્યું નથી',

    sessionNotesTitle: 'સેશન નોંધો',
    sessionNotesPlaceholder: 'આ સેશન માટે નોંધો…',
    sessionHistoryTitle: 'સેશન ઇતિહાસ',
    show: 'બતાવો', hide: 'છુપાવો',
    noSessionsYet: 'હજી કોઈ સેશન નથી',

    needsAttention: 'ધ્યાન આપવાની જરૂર',
    recentSessions: 'તાજેતરના સેશન',

    cohortTitle: 'જૂથ',
    addClient: '＋ ગ્રાહક ઉમેરો',
    cohortHint: 'ગ્રાહકની પ્રોફાઇલ ખોલવા માટે ક્લિક કરો.',

    clientEmptyState: 'જૂથ દૃશ્યમાંથી એક ગ્રાહક પસંદ કરો.',
    edit: 'સંપાદિત કરો',
    backToCohort: '← જૂથ',
    sessionTimelineTitle: 'સેશન સમયરેખા',
    sessionTimelineHint: 'ડોટનું કદ = સેશનની લંબાઈ · રિપ્લે કરવા માટે સેશન પર ક્લિક કરો',
    protocolTitle: 'પ્રોટોકોલ',
    teacherNotesTitle: 'શિક્ષકની નોંધો',

    replayPrev: 'પાછળ', replayNext: 'આગળ', replayPlay: '▶ ચલાવો', replayPause: '⏸ થોભાવો',
    replayState: 'સ્થિતિ', replaySwara: 'સ્વર', replayGuna: 'મુખ્ય ગુણ',
    replayAlpha: 'આલ્ફા પાવર', replaySpo2: 'SpO₂', replayHr: 'હૃદય દર',
    replayNoData: 'આ સેશન માટે કોઈ એપોક ડેટા ઉપલબ્ધ નથી.',

    analyzeTitle: 'વિશ્લેષણ',
    analyzeEmptyHint: 'તેની ગુણ, ચિત્ત-ભૂમિ, સ્વર અને બેન્ડ-પાવર પ્રોફાઇલ જોવા માટે રેકોર્ડ કરેલ સેશન પસંદ કરો.',
    bandSpectrumTitle: 'બેન્ડ પાવર સ્પેક્ટ્રમ',
    trigunaBalanceTitle: 'ત્રિગુણ સંતુલન',
    bhumiDistributionTitle: 'ચિત્ત-ભૂમિ વિતરણ',
    swaraBalanceTitle: 'સ્વર / નાડી સંતુલન',
    contemplativeDepthTitle: 'ચિંતનશીલ ઊંડાણ',
    sensorLayoutTitle: 'સેન્સર લેઆઉટ',
    sensorDisclaimer: '4-ચેનલ હેડબેન્ડ. મૂલ્યો સંપૂર્ણ-માથાની સરેરાશ છે — પ્રતિ-ઇલેક્ટ્રોડ સ્થાનિકીકરણ રેકોર્ડ કે સૂચિત નથી.',
    innerTextureSessionAvgTitle: 'આંતરિક રચના (સેશન સરેરાશ)',
    innerTextureAvgNote: 'ચિત્ત-વૃત્તિઓનું શમન, સેશન પર સરેરાશ',
    tattvaSessionTitle: 'તત્ત્વ / ચક્ર સંબંધો (સેશન)',

    prescribeTitle: 'સૂચન',
    prescribeHint: 'AI બાબા સાથે સેશનને પ્રેક્ટિસ ભલામણમાં ફેરવો.',
    prescribeTag: 'તબક્કો 4',

    adminBackToDashboard: '← ડેશબોર્ડ',
    adminDashboardTitle: 'એડમિન ડેશબોર્ડ',
    adminTabUsers: 'વપરાશકર્તાઓ', adminTabSessions: 'સેશનો',
    adminUserAccountsTitle: 'વપરાશકર્તા ખાતાઓ',
    adminAddUser: '+ વપરાશકર્તા ઉમેરો',
    adminRoleUser: 'વપરાશકર્તા', adminRoleCoAdmin: 'સહ-એડમિન', adminRoleAdmin: 'એડમિન',
    create: 'બનાવો', cancel: 'રદ કરો', save: 'સાચવો',
    resetPwPlaceholder: 'વપરાશકર્તા માટે નવો પાસવર્ડ',
    colUsername: 'વપરાશકર્તા નામ', colRole: 'ભૂમિકા', colCreated: 'બનાવ્યું', colActions: 'ક્રિયાઓ',
    loading: 'લોડ થઈ રહ્યું છે…',
    adminAllSessionsTitle: 'બધા સેશન',
    searchUserPlaceholder: 'વપરાશકર્તા શોધો…',
    colUser: 'વપરાશકર્તા', colSessionName: 'સેશન નામ', colStart: 'શરૂઆત',
    colDuration: 'સમયગાળો', colEpochs: 'એપોક',

    sessionAnalyticsTitle: 'સેશન વિશ્લેષણ',
    close: '✕ બંધ કરો',
    loadingSessionData: 'સેશન ડેટા લોડ થઈ રહ્યો છે…',
    statEpochs: 'એપોક', statDuration: 'સમયગાળો', statDominantGuna: 'મુખ્ય ગુણ',
    statPrimaryState: 'મુખ્ય સ્થિતિ', statAvgSpo2: 'સરેરાશ SpO₂ (%)', statAvgHr: 'સરેરાશ હૃદય દર (BPM)',
    trigunaSessionAvgTitle: 'ત્રિગુણ — સેશન સરેરાશ',
    bhumiDistTitle: 'ચિત્ત ભૂમિ વિતરણ',
    swaraDistTitle: 'સ્વર વિતરણ',
    avgBandPowersTitle: 'સરેરાશ બેન્ડ પાવર',
    sessionTimelineTitle2: 'સેશન સમયરેખા',
    timelineHint: 'સમાન ચિત્ત ભૂમિ સ્થિતિમાં સતત એપોકને તબક્કાઓમાં જૂથબદ્ધ કરવામાં આવે છે.',
    sessionNotesTitle2: 'સેશન નોંધો',
    noNotesRecorded: 'આ સેશન માટે કોઈ નોંધ રેકોર્ડ કરવામાં આવી નથી.',
    epochReplayTitle: 'એપોક રિપ્લે',
    epochReplayHint: 'EEG સ્થિતિ સમય સાથે કેવી રીતે વિકસિત થઈ તે જોવા માટે રેકોર્ડ કરેલ એપોકમાંથી પસાર થાઓ.',
    openInReplay: 'રિપ્લેમાં ખોલો ↗',

    aiBabaTitle: 'AI બાબા',
    aiBabaIntro: 'નમસ્તે 🙏 હું AI બાબા છું. હું તમને તમારા EEG સેશન સમજવામાં મદદ કરી શકું છું — તમારી માનસિક સ્થિતિઓ, એકાગ્રતા, ઊર્જા અને મગજના તરંગોની પેટર્ન.',
    aiBabaWhichSession: 'તમે કયું સેશન અન્વેષણ કરવા માંગો છો?',
    aiBabaLoadingSessions: 'તમારા સેશન લોડ થઈ રહ્યાં છે…',
    aiBabaNoSessions: 'રેકોર્ડ કરેલ ડેટા સાથે કોઈ સેશન મળ્યું નથી. પહેલા સેશન શરૂ કરો અને કેટલાક EEG એપોક રેકોર્ડ કરો!',
    aiBabaReadingBrainwaves: 'AI બાબા તમારા મગજના તરંગો વાંચી રહ્યા છે…',
    aiBabaChangeSession: '↩ સેશન બદલો',
    aiBabaInputPlaceholder: 'તમારા સેશન વિશે પૂછો…',

    toastSaved: 'સાચવ્યું',

    swaraNoteIda: 'પેરાસિમ્પેથેટિક પ્રભુત્વ. ગ્રહણશીલ, સર્જનાત્મક અને આત્મનિરીક્ષણ કરતી સ્થિતિ.',
    swaraNotePingala: 'સિમ્પેથેટિક પ્રભુત્વ. સક્રિય, વિશ્લેષણાત્મક અને લક્ષ્ય-લક્ષી એકાગ્રતા.',
    swaraNoteSushumna: 'સૂર્ય અને ચંદ્ર ચેનલોનું સંતુલન. ઉચ્ચ ચિંતનશીલ સ્થિતિઓનું પ્રવેશદ્વાર.',

    guna_Sattvic: 'સાત્વિક', guna_Rajasic: 'રાજસિક', guna_Tamasic: 'તામસિક',
    guna_predominant: 'મુખ્ય', guna_secondary: 'ગૌણ',
    guna_Balanced: 'સંતુલિત', guna_allThree: 'ત્રણેય',
    gunaNoteSattvic: 'સ્પષ્ટતા અને સંતુલન મુખ્ય',
    gunaNoteRajasic: 'પ્રવૃત્તિ અને ઉત્કટતા મુખ્ય',
    gunaNoteTamasic: 'જડતા અને ભારેપણું મુખ્ય',

    tattva_pratyaharaWindow: 'પ્રત્યાહાર વિન્ડો',
    tattva_potentialActivation: 'સંભવિત તત્ત્વ સક્રિયકરણ',
    tattva_turiyaApproach: 'તુરીય અભિગમ',
    tattva_gammaSpike: 'ગામા સ્પાઇક',
    tattva_gammaSurge: 'ગામા ઉછાળો',
    tattva_sushumnaActivated: 'સુષુમ્ણા સક્રિય',
    tattva_highBetaAgitation: 'ઉચ્ચ-બીટા આંદોલન',
    tattva_tamasicState: 'તામસિક સ્થિતિ',
    tattva_fmThetaActivation: 'Fm-θ સક્રિયકરણ (ફ્રન્ટલ મિડલાઇન થીટા)',

    statusConnecting: 'જોડાઈ રહ્યું છે…',
    statusBluetoothFailed: 'BT નિષ્ફળ',
    statusDemoMode: 'ડેમો મોડ',
    statusWakingUp: 'જાગી રહ્યું છે…',
    statusBackendWaking: 'બેકએન્ડ જાગી રહ્યું છે…',
    modeBleRender: 'BLE → Render',
    modeBleLocal: 'BLE સ્થાનિક',
    statusConnected: 'જોડાયેલ',
    statusModelLoading: 'મોડેલ લોડ થઈ રહ્યું છે…',
    statusBackendReady: 'બેકએન્ડ તૈયાર છે',
    statusBackendOffline: 'બેકએન્ડ ઓફલાઇન',
    statusReady: 'તૈયાર',
    statusLoadingModelDots: 'મોડેલ લોડ થઈ રહ્યું છે…',
    renderBackendLabel: 'Render બેકએન્ડ',
    qualityReplay: '⏪ રિપ્લે',
    qualityLocalFft: '✓ સ્થાનિક FFT',
    qualityDemo: '✓ ડેમો',
    qualityBleRender: '✓ BLE → Render',
    liveReading: 'લાઇવ રીડિંગ',

    corrobTitle: 'સંકેતો શું કહે છે',
    corrobHeldGently: 'નમ્રતાથી રાખેલ',
    axis_neural_complexity: 'મનની સમૃદ્ધિ',
    axis_cortical_quietude: 'પાર્શ્વભૂમિ સ્થિરતા',
    axis_mental_chatter: 'માનસિક ખળભળાટ',
    axis_absorption_signature: 'ધ્યાન કેન્દ્રિતતા',
    axis_effortlessness: 'સહજતા',
    concord_corroborated: 'સંકેતો સંમત છે',
    concord_mixed: 'મિશ્ર સંકેતો',
    concord_tension: 'સંકેતોમાં તણાવ',
    concord_inconclusive: 'અનિર્ણિત',
  },
};

// ── Engine ──────────────────────────────────────────────────────────────────
const LANG_KEY = 'eeg_lang';
function getLang() { return localStorage.getItem(LANG_KEY) || 'en'; }
function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === 'gu' ? 'gu' : 'en';
  applyI18n();
  if (typeof onLanguageChanged === 'function') onLanguageChanged(lang);
}

function t(key) {
  const lang = getLang();
  return (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
}

// ── Identifier -> display-text translators ──────────────────────────────────
// The Chitta Bhumi state, depth, swara-nadi, nirodha and confidence words are
// used as internal identifiers throughout app.js (comparisons, CSS class
// names, the backend API contract) and MUST stay in Roman/English at the
// source. These only translate what's shown on screen; call them at every
// render site instead of displaying the raw identifier directly.
function translateState(state) { return t('state_' + state) === 'state_' + state ? state : t('state_' + state); }
function translateDepth(depth) { const k = 'depth_' + depth; return I18N[getLang()]?.[k] ?? I18N.en[k] ?? depth; }
function translateSwaraNadi(nadi) { return t('swara_' + nadi) === 'swara_' + nadi ? nadi : t('swara_' + nadi); }
function translateConfidenceWord(word) { return t('conf_' + word) === 'conf_' + word ? word : t('conf_' + word); }
function translateNirodha(label) {
  if (!label) return label;
  if (label.startsWith('Nirodha')) return t('nirodha_Nirodha');
  if (label.startsWith('Vikshepa')) return t('nirodha_Vikshepa');
  const k = 'nirodha_' + label;
  return I18N[getLang()]?.[k] ?? I18N.en[k] ?? label;
}

// Guna blend labels come in several shapes from the classifier: "Sattvic",
// "Rajasic-predominant, Sattvic-secondary", "Balanced (all three)". Word-level
// substitution handles every combination without enumerating each one.
function translateGunaLabel(label) {
  if (!label || getLang() === 'en') return label;
  return label
    .replace(/Sattvic/g, t('guna_Sattvic'))
    .replace(/Rajasic/g, t('guna_Rajasic'))
    .replace(/Tamasic/g, t('guna_Tamasic'))
    .replace(/predominant/g, t('guna_predominant'))
    .replace(/secondary/g, t('guna_secondary'))
    .replace(/Balanced/g, t('guna_Balanced'))
    .replace(/all three/g, t('guna_allThree'));
}

// Tattva flags are free-text with embedded percentages (e.g. "Gamma Surge
// (32%) — Ajna/Sahasrara activation..."). Match by a stable substring from
// each known template, translate the label, and keep the numeric part as-is
// (localizeNumber handles the digit-only case; embedded parenthetical detail
// stays in English rather than risk mistranslating live figures).
const TATTVA_PATTERNS = [
  [/^Pratyahara Window/, 'tattva_pratyaharaWindow'],
  [/^Potential Tattva Activation/, 'tattva_potentialActivation'],
  [/^Turiya Approach/, 'tattva_turiyaApproach'],
  [/^Fm-θ Activation/, 'tattva_fmThetaActivation'],
  [/^Gamma Spike/, 'tattva_gammaSpike'],
  [/^Gamma Surge/, 'tattva_gammaSurge'],
  [/^Sushumna Activated/, 'tattva_sushumnaActivated'],
  [/^High-Beta Agitation/, 'tattva_highBetaAgitation'],
  [/^Tamasic State/, 'tattva_tamasicState'],
];
function translateTattvaFlag(flag) {
  if (!flag || getLang() === 'en') return flag;
  for (const [re, key] of TATTVA_PATTERNS) {
    if (re.test(flag)) return flag.replace(re, t(key));
  }
  return flag; // unrecognized template — leave as-is rather than guess
}

function applyI18n() {
  const lang = getLang();
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key] != null) el.placeholder = dict[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (dict[key] != null) el.title = dict[key];
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('lang-btn--active', btn.dataset.lang === lang);
  });
  localizeDom(); // sweep whatever numbers are already on screen
}

// ── Gujarati numerals ────────────────────────────────────────────────────────
// ૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯ — applied to any already-formatted number/string so
// every displayed figure (percentages, BPM, counts, ms) follows the language
// choice, not just labels.
const GUJARATI_DIGITS = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
function toGujaratiDigits(str) {
  return String(str).replace(/[0-9]/g, d => GUJARATI_DIGITS[+d]);
}
// Localizes a number/numeric-string for display: formats then swaps digits
// if Gujarati is active. Use this instead of raw .toFixed()/String() at any
// UI-facing render site.
function localizeNumber(value) {
  const s = String(value);
  return getLang() === 'gu' ? toGujaratiDigits(s) : s;
}

// Sweeps every text node under `root` (default: whole page) and swaps digits
// to Gujarati numerals when that's the active language. This is the one
// mechanism covering every number in the app (percentages, ms, BPM, counts,
// SVG chart labels) instead of hand-wrapping each individual render site —
// call it after any render that might have written new numeric text
// (applyReading, admin/analytics tables, replay, analyze SVG draws). A no-op
// in English, and safe everywhere: only literal 0-9 characters are touched,
// and no UI string in this app contains digits as anything but a number.
function localizeDom(root) {
  if (getLang() !== 'gu') return;
  const target = root || document.body;
  if (!target || typeof document === 'undefined' || !document.createTreeWalker) return;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  for (const node of nodes) {
    if (/[0-9]/.test(node.nodeValue)) node.nodeValue = toGujaratiDigits(node.nodeValue);
  }
}

if (typeof window !== 'undefined') {
  window.I18N = I18N;
  window.t = t;
  window.getLang = getLang;
  window.setLang = setLang;
  window.applyI18n = applyI18n;
  window.toGujaratiDigits = toGujaratiDigits;
  window.localizeNumber = localizeNumber;
  window.localizeDom = localizeDom;
  window.translateState = translateState;
  window.translateDepth = translateDepth;
  window.translateSwaraNadi = translateSwaraNadi;
  window.translateConfidenceWord = translateConfidenceWord;
  window.translateNirodha = translateNirodha;
  window.translateGunaLabel = translateGunaLabel;
  window.translateTattvaFlag = translateTattvaFlag;
}
