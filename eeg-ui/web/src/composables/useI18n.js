'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   useI18n.js — English / Gujarati translation system for the Vue frontend.

   Ported verbatim from eeg-ui/i18n.js (the legacy static frontend's i18n
   engine) so both frontends share the exact same dictionary and translation
   behavior. The dictionary and the identifier→display-text translators below
   are byte-for-byte the same source strings as i18n.js — only the "engine"
   (getLang/setLang/applyI18n/localizeDom) is replaced with Vue reactivity:
   `lang` is a ref, and every view/component that renders translated text
   calls `t()`/`tf()` from `useI18n()`, so the template re-renders automatically
   when `lang` changes — no DOM sweep needed (that was a workaround for the
   legacy app's non-reactive vanilla-JS rendering).

   The Chitta Bhumi state, depth, swara-nadi, nirodha and confidence words are
   used as internal identifiers throughout the app (comparisons, CSS class
   names, the backend API contract) and MUST stay in Roman/English at the
   source. The translateXxx() helpers only translate what's shown on screen —
   call them at every render site instead of displaying the raw identifier.
════════════════════════════════════════════════════════════════════════════ */
import { ref } from 'vue';

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
    navWatchLive: 'Watch Live',
    navPractices: 'Practices',
    navUsers: 'Users',
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
    demoLabel: '▶ Demo',
    stopDemoLabel: '⏹ Stop Demo',
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
    lastKnownReading: 'last known reading',
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
    exportSessionTxt: '⬇ Export TXT',
    exportingEllipsis: 'Exporting…',
    exportFailedPrefix: 'Export failed: ',
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
    noDataDot: 'No data.',
    noPhaseDataDot: 'No phase data.',
    noSvaraData: 'no svara data',
    noDepthData: 'no depth data',
    noBandData: 'no band data',
    noGunaData: 'no guṇa data',
    noDataLower: 'no data',
    dominantSuffix: 'dominant',
    bandDominantTemplate: '{band} dominant',
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

    // ── Alerts / confirms / prompts ──
    alertEnterUrl: 'Enter a URL first.',
    alertEnterPassword: 'Enter a password.',
    alertPasswordUpdated: 'Password updated.',
    alertErrorPrefix: 'Error: ',
    confirmDeleteUser: 'Delete this user? This cannot be undone.',
    confirmChangeRole: 'Change this user\'s role to "{role}"?',
    alertFailedStartSession: 'Failed to start session: ',
    alertWebBluetoothUnavailable: 'Web Bluetooth is not available. Please use Chrome or Edge on desktop.',
    promptNewClientName: 'New client name:',
    promptProtocol: 'Protocol (blank = keep current):',
    promptTeacherNotes: 'Teacher notes (blank = keep current):',
    promptSessionName: 'Session name:',
    defaultNewSessionName: 'New Session',

    // ── Login ──
    signingIn: 'Signing in…',
    loginFailed: 'Login failed',
    usernamePasswordRequired: 'Username and password required.',
    requestFailed: 'Request failed',

    // ── Admin ──
    noUsersFound: 'No users found.',
    btnApply: 'Apply',
    btnResetPw: 'Reset PW',
    btnDelete: 'Delete',
    youBadge: 'you',
    btnViewAnalytics: 'View Analytics',
    noSessionsYetAdmin: 'No sessions yet.',
    activeLabel: 'active',

    // ── Home / This Week ──
    kpiClients: 'Clients',
    kpiSessionsThisWeek: 'Sessions this week',
    kpiNeedsAttention: 'Needs attention',
    kpiTotalSessions: 'Total sessions',
    allClientsOnTrack: 'All clients on track.',
    noRecentSession: 'No recent session',
    homeNoSessionsYet: 'No sessions yet.',
    unknownClientLabel: 'Unknown client',
    unassignedLabel: 'Unassigned',

    // ── Cohort ──
    cohortTitleWithCount: 'Cohort · {n} client{s}',
    noClientsYetHint: 'No clients yet. Add your first client to start building a cohort.',
    noSessionsYetLower: 'no sessions yet',
    clientStatusPlateau: 'Plateau',
    clientStatusProgress: 'Progress',
    clientStatusIssue: 'Needs attention',
    clientStatusNew: 'New',

    // ── Client profile ──
    couldNotLoadClient: 'Could not load client: ',
    statSessions: 'Sessions',
    statLastSession: 'Last session',
    statProtocolSince: 'Protocol since',
    noSessionsRecordedClient: 'No sessions recorded for this client yet.',
    noProtocolSet: 'No protocol set. Use Edit to add one.',
    goalPrefix: 'Goal: ',
    noNotesYet: 'No notes yet.',
    yrsSuffix: ' yrs',
    monthsPracticingLt1: '<1 month practicing',
    monthsPracticing: '{m} month{s} practicing',
    yearsMonthsPracticing: '{y}y {m}m practicing',
    inProgressLabel: 'in progress',
    sessionCountTemplate: '{n} session{s}',

    // ── Replay/Analyze ──
    noSessionsOption: 'No sessions',
    playLabel: '▶ Play',
    pauseLabel: '⏸ Pause',
    recordSessionFirstHint: 'Record a session first, then analyze it here.',
    couldNotLoadSessions: 'Could not load sessions: ',
    noEpochDataToAnalyze: 'This session has no epoch data to analyze.',
    couldNotLoadAnalytics: 'Could not load analytics: ',
    noEegDataRecorded: 'No EEG data recorded',
    untitledSession: 'Untitled Session',
    analyzeSessionMetaTemplate: '{epochs} epochs · {duration} · dominant: {dominant}',
    replayViewMetaTemplate: '{epochs} epochs · {duration}',
    dominantStateLabel: 'Dominant state',
    dominantGunaLabel: 'Dominant guṇa',
    avgSpo2Label: 'Avg SpO₂',
    avgHrLabel: 'Avg HR',
    epochsLabel: 'Epochs',

    // ── AI Baba ──
    aiBabaDefaultSummary: 'Here is a summary of your session.',
    aiBabaTroubleLoading: 'Namaste 🙏 I had trouble loading your session data.',
    aiBabaTryAgainDifferent: 'Please try again or select a different session.',
    aiBabaCouldNotProcess: 'I could not process that. Please try again.',
    unknownErrorLabel: 'Unknown error',
    aiBabaSessionFallbackName: 'Session',
    aiBabaEpochSingular: 'epoch',
    aiBabaEpochPlural: 'epochs',
    aiBabaFailedToLoadSessions: 'Failed to load sessions — ',
    aiBabaUnknownErrorLower: 'unknown error',
    aiBabaPleaseTryAgainSuffix: '. Please try again.',
    aiBabaSomethingWentWrong: 'Something went wrong — ',
    aiBabaErrorPrefix: '⚠️ Error: ',

    // ── Misc toasts ──
    clientAddedToast: 'Client added',
    noCompatibleDriver: 'No compatible EEG driver for this device',
    newClientNamePrompt: 'New client name:',
    protocolPrompt: 'Protocol (blank = keep current):',
    notesPrompt: 'Teacher notes (blank = keep current):',
    sessionNamePrompt: 'Session name:',
    webBluetoothUnavailable: 'Web Bluetooth is not available. Please use Chrome or Edge on desktop.',
    failedToStartSessionPrefix: 'Failed to start session: ',
    sessionDefaultPrefix: 'Session ',
    newSessionFallbackName: 'New Session',

    testingEllipsis: 'Testing…',
    connectedBoardPrefix: '✓ Connected — board: ',
    modelReadySuffix: ' | model ready',
    modelLoadingSuffix: ' | model loading…',
    connectionFailed: 'connection failed',

    // ── Vue-only: Live sharing ("Go Live" — instructor watches a student's
    // sitting in real time). Not present in the legacy static frontend. ──
    goLiveLabel: 'Go Live',
    goLiveStarting: 'Starting…',
    goLiveHint: "Let your instructor see this sitting live",
    stopLiveLabel: 'Stop Live',
    liveTag: 'LIVE',
    liveDot: '● live',
    shareHint: "Your instructor can see this sitting while you're live. You can stop anytime.",
    shareWatchedByPrefix: 'being watched by ',
    shareNoWatchers: 'no one is watching right now',
    shareCouldNotGoLive: 'Could not go live',
    newStudentOption: '＋ New student…',
    studentNamePlaceholder: "Student's name",
    practicePlaceholder: 'Practice (e.g. Dhyāna)',
    practiceTitle: 'What practice is this sitting?',
    alertEnterStudentName: "Enter the student's name first.",
    alertCouldNotCreateStudent: 'Could not create the student: ',
    clientSelectTitle: 'Which student is this session for?',
    deviceFallback: 'device',
    liveSittingPrefix: 'Live sitting ',
    liveSittingFallback: 'Live sitting',

    // ── Vue-only: Watch (instructor watches a student's live sitting) ──
    liveNowWord: 'live',
    watchTitle: 'Watch a Live Session',
    watchStudentsLiveNow: 'YOUR STUDENTS · LIVE NOW',
    refresh: 'Refresh',
    watchHint: 'Students appear here when their linked account goes live. They see a "being watched" indicator the moment you join, and can stop anytime.',
    noLiveStudents: 'No linked students are live right now.',
    watchBtn: 'Watch',
    stopBtn: 'Stop',
    backBtn: 'Back',
    justNow: 'just now',
    minAgo: ' min',
    connectingToPrefix: 'connecting to ',
    watchingPrefix: 'watching ',
    epochSingular: ' epoch',
    epochPlural: ' epochs',
    waitingForFirstEpochPrefix: 'Waiting for ',
    waitingForFirstEpochSuffix: "'s first epoch…",
    couldNotLoadLiveStudents: 'Could not load live students',
    couldNotConnectLiveSession: 'Could not connect to the live session.',
    sessionNoLongerAvailable: 'The session is no longer available.',

    // ── Vue-only: Cohort ──
    cohortTitleNeedsAttention: 'Cohort · {n} need{s} attention',
    noClientsNeedAttention: "No clients need attention right now — everyone's on track.",
    noDepthDataYet: 'no depth data yet',
    clearFilterTitle: 'Clear filter',
    showAllClients: 'Show all clients',

    // ── Vue-only: Client profile (student login / account linking) ──
    createLoginBtn: 'Create login',
    createLoginTitle: "Create this student's login (account + link, one step)",
    linkAccountBtn: 'Link account',
    linkAccountTitle: 'Link an existing account instead',
    signsInAsPrefix: 'Signs in as ',
    signsInAsSuffix: ' — click to change/unlink',
    promptUsernameForStudent: 'Choose a username for this student:',
    promptPasswordForStudent: 'Choose a password (min 6 characters) — share it with the student:',
    createLoginDonePrefix: 'Done. ',
    createLoginDoneMid: ' signs in as "',
    createLoginDoneSuffix: '" — their sittings will appear under this client, and you can watch them live from Watch Live.',
    theStudentFallback: 'The student',
    promptLinkAccount: 'Link to a login account (username). Blank removes the link.\nWhile linked, you can watch this student\'s live sittings — they see a "being watched" indicator.',
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
    navWatchLive: 'લાઇવ જુઓ',
    navPractices: 'સાધનાઓ',
    navUsers: 'વપરાશકર્તાઓ',
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
    demoLabel: '▶ ડેમો',
    stopDemoLabel: '⏹ ડેમો બંધ કરો',
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
    lastKnownReading: 'છેલ્લું જાણીતું રીડિંગ',
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
    exportSessionTxt: '⬇ TXT એક્સપોર્ટ કરો',
    exportingEllipsis: 'એક્સપોર્ટ થઈ રહ્યું છે…',
    exportFailedPrefix: 'એક્સપોર્ટ નિષ્ફળ: ',
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
    noDataDot: 'કોઈ ડેટા નથી.',
    noPhaseDataDot: 'કોઈ તબક્કાનો ડેટા નથી.',
    noSvaraData: 'સ્વર ડેટા નથી',
    noDepthData: 'ઊંડાણનો ડેટા નથી',
    noBandData: 'બેન્ડ ડેટા નથી',
    noGunaData: 'ગુણ ડેટા નથી',
    noDataLower: 'ડેટા નથી',
    dominantSuffix: 'મુખ્ય',
    bandDominantTemplate: '{band} મુખ્ય',
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

    alertEnterUrl: 'પહેલા URL દાખલ કરો.',
    alertEnterPassword: 'પાસવર્ડ દાખલ કરો.',
    alertPasswordUpdated: 'પાસવર્ડ અપડેટ થયો.',
    alertErrorPrefix: 'ભૂલ: ',
    confirmDeleteUser: 'આ વપરાશકર્તાને કાઢી નાખવો છે? આ પૂર્વવત્ કરી શકાશે નહીં.',
    confirmChangeRole: 'આ વપરાશકર્તાની ભૂમિકા "{role}" માં બદલવી છે?',
    alertFailedStartSession: 'સેશન શરૂ કરવામાં નિષ્ફળ: ',
    alertWebBluetoothUnavailable: 'Web Bluetooth ઉપલબ્ધ નથી. કૃપા કરીને ડેસ્કટોપ પર Chrome અથવા Edge વાપરો.',
    promptNewClientName: 'નવા ગ્રાહકનું નામ:',
    promptProtocol: 'પ્રોટોકોલ (ખાલી = હાલનું રાખો):',
    promptTeacherNotes: 'શિક્ષકની નોંધો (ખાલી = હાલનું રાખો):',
    promptSessionName: 'સેશન નામ:',
    defaultNewSessionName: 'નવું સેશન',

    signingIn: 'સાઇન ઇન થઈ રહ્યું છે…',
    loginFailed: 'લૉગિન નિષ્ફળ',
    usernamePasswordRequired: 'વપરાશકર્તા નામ અને પાસવર્ડ જરૂરી છે.',
    requestFailed: 'વિનંતી નિષ્ફળ',

    noUsersFound: 'કોઈ વપરાશકર્તા મળ્યા નથી.',
    btnApply: 'લાગુ કરો',
    btnResetPw: 'PW રીસેટ કરો',
    btnDelete: 'કાઢી નાખો',
    youBadge: 'તમે',
    btnViewAnalytics: 'વિશ્લેષણ જુઓ',
    noSessionsYetAdmin: 'હજી કોઈ સેશન નથી.',
    activeLabel: 'સક્રિય',

    kpiClients: 'ગ્રાહકો',
    kpiSessionsThisWeek: 'આ અઠવાડિયાના સેશન',
    kpiNeedsAttention: 'ધ્યાન આપવાની જરૂર',
    kpiTotalSessions: 'કુલ સેશન',
    allClientsOnTrack: 'બધા ગ્રાહકો ટ્રેક પર છે.',
    noRecentSession: 'તાજેતરમાં કોઈ સેશન નથી',
    homeNoSessionsYet: 'હજી કોઈ સેશન નથી.',
    unknownClientLabel: 'અજાણ્યો ગ્રાહક',
    unassignedLabel: 'અસોંપાયેલ',

    cohortTitleWithCount: 'જૂથ · {n} ગ્રાહક',
    noClientsYetHint: 'હજી કોઈ ગ્રાહક નથી. જૂથ બનાવવાનું શરૂ કરવા માટે તમારો પ્રથમ ગ્રાહક ઉમેરો.',
    noSessionsYetLower: 'હજી કોઈ સેશન નથી',
    clientStatusPlateau: 'સ્થિર',
    clientStatusProgress: 'પ્રગતિ',
    clientStatusIssue: 'ધ્યાન આપવાની જરૂર',
    clientStatusNew: 'નવું',

    couldNotLoadClient: 'ગ્રાહક લોડ કરી શકાયો નથી: ',
    statSessions: 'સેશન',
    statLastSession: 'છેલ્લું સેશન',
    statProtocolSince: 'પ્રોટોકોલ ક્યારથી',
    noSessionsRecordedClient: 'આ ગ્રાહક માટે હજી કોઈ સેશન રેકોર્ડ કરવામાં આવ્યું નથી.',
    noProtocolSet: 'કોઈ પ્રોટોકોલ સેટ નથી. ઉમેરવા માટે સંપાદિત કરો વાપરો.',
    goalPrefix: 'ધ્યેય: ',
    noNotesYet: 'હજી કોઈ નોંધ નથી.',
    yrsSuffix: ' વર્ષ',
    monthsPracticingLt1: '૧ મહિનાથી ઓછું અભ્યાસ',
    monthsPracticing: '{m} મહિનાથી અભ્યાસ',
    yearsMonthsPracticing: '{y} વર્ષ {m} મહિનાથી અભ્યાસ',
    inProgressLabel: 'ચાલુ છે',
    sessionCountTemplate: '{n} સેશન',

    noSessionsOption: 'કોઈ સેશન નથી',
    playLabel: '▶ ચલાવો',
    pauseLabel: '⏸ થોભાવો',
    recordSessionFirstHint: 'તેનું વિશ્લેષણ કરવા માટે પહેલા એક સેશન રેકોર્ડ કરો.',
    couldNotLoadSessions: 'સેશન લોડ કરી શકાયા નથી: ',
    noEpochDataToAnalyze: 'આ સેશન માટે વિશ્લેષણ કરવા કોઈ એપોક ડેટા નથી.',
    couldNotLoadAnalytics: 'વિશ્લેષણ લોડ કરી શકાયું નથી: ',
    noEegDataRecorded: 'કોઈ EEG ડેટા રેકોર્ડ થયો નથી',
    untitledSession: 'શીર્ષક વિનાનું સેશન',
    analyzeSessionMetaTemplate: '{epochs} એપોક · {duration} · મુખ્ય: {dominant}',
    replayViewMetaTemplate: '{epochs} એપોક · {duration}',
    dominantStateLabel: 'મુખ્ય સ્થિતિ',
    dominantGunaLabel: 'મુખ્ય ગુણ',
    avgSpo2Label: 'સરેરાશ SpO₂',
    avgHrLabel: 'સરેરાશ હૃદય દર',
    epochsLabel: 'એપોક',

    aiBabaDefaultSummary: 'આ તમારા સેશનનો સારાંશ છે.',
    aiBabaTroubleLoading: 'નમસ્તે 🙏 મને તમારો સેશન ડેટા લોડ કરવામાં તકલીફ પડી.',
    aiBabaTryAgainDifferent: 'કૃપા કરીને ફરી પ્રયાસ કરો અથવા બીજું સેશન પસંદ કરો.',
    aiBabaCouldNotProcess: 'હું તે સમજી શક્યો નહીં. કૃપા કરીને ફરી પ્રયાસ કરો.',
    unknownErrorLabel: 'અજાણી ભૂલ',
    aiBabaSessionFallbackName: 'સેશન',
    aiBabaEpochSingular: 'એપોક',
    aiBabaEpochPlural: 'એપોક',
    aiBabaFailedToLoadSessions: 'સેશન લોડ કરવામાં નિષ્ફળ — ',
    aiBabaUnknownErrorLower: 'અજાણી ભૂલ',
    aiBabaPleaseTryAgainSuffix: '. કૃપા કરીને ફરી પ્રયાસ કરો.',
    aiBabaSomethingWentWrong: 'કંઈક ખોટું થયું — ',
    aiBabaErrorPrefix: '⚠️ ભૂલ: ',

    clientAddedToast: 'ગ્રાહક ઉમેરાયો',
    noCompatibleDriver: 'આ ડિવાઇસ માટે કોઈ સુસંગત EEG ડ્રાઇવર નથી',
    newClientNamePrompt: 'નવા ગ્રાહકનું નામ:',
    protocolPrompt: 'પ્રોટોકોલ (ખાલી = હાલનું રાખો):',
    notesPrompt: 'શિક્ષક નોંધો (ખાલી = હાલનું રાખો):',
    sessionNamePrompt: 'સેશનનું નામ:',
    webBluetoothUnavailable: 'Web Bluetooth ઉપલબ્ધ નથી. કૃપા કરીને ડેસ્કટોપ પર Chrome અથવા Edge વાપરો.',
    failedToStartSessionPrefix: 'સેશન શરૂ કરવામાં નિષ્ફળ: ',
    sessionDefaultPrefix: 'સેશન ',
    newSessionFallbackName: 'નવું સેશન',

    testingEllipsis: 'ચકાસી રહ્યાં છીએ…',
    connectedBoardPrefix: '✓ જોડાયેલ — બોર્ડ: ',
    modelReadySuffix: ' | મોડેલ તૈયાર છે',
    modelLoadingSuffix: ' | મોડેલ લોડ થઈ રહ્યું છે…',
    connectionFailed: 'જોડાણ નિષ્ફળ',

    goLiveLabel: 'લાઇવ જાઓ',
    goLiveStarting: 'શરૂ થઈ રહ્યું છે…',
    goLiveHint: 'તમારા શિક્ષકને આ સેશન લાઇવ જોવા દો',
    stopLiveLabel: 'લાઇવ બંધ કરો',
    liveTag: 'લાઇવ',
    liveDot: '● લાઇવ',
    shareHint: 'તમારા શિક્ષક તમે લાઇવ હો ત્યાં સુધી આ સેશન જોઈ શકે છે. તમે ગમે ત્યારે બંધ કરી શકો છો.',
    shareWatchedByPrefix: 'આના દ્વારા જોવાઈ રહ્યું છે: ',
    shareNoWatchers: 'હાલમાં કોઈ જોઈ રહ્યું નથી',
    shareCouldNotGoLive: 'લાઇવ જઈ શકાયું નથી',
    newStudentOption: '＋ નવો વિદ્યાર્થી…',
    studentNamePlaceholder: 'વિદ્યાર્થીનું નામ',
    practicePlaceholder: 'સાધના (દા.ત. ધ્યાન)',
    practiceTitle: 'આ સેશન કઈ સાધના માટે છે?',
    alertEnterStudentName: 'પહેલા વિદ્યાર્થીનું નામ દાખલ કરો.',
    alertCouldNotCreateStudent: 'વિદ્યાર્થી બનાવી શકાયો નથી: ',
    clientSelectTitle: 'આ સેશન કયા વિદ્યાર્થી માટે છે?',
    deviceFallback: 'ડિવાઇસ',
    liveSittingPrefix: 'લાઇવ સેશન ',
    liveSittingFallback: 'લાઇવ સેશન',

    liveNowWord: 'લાઇવ',
    watchTitle: 'લાઇવ સેશન જુઓ',
    watchStudentsLiveNow: 'તમારા વિદ્યાર્થીઓ · અત્યારે લાઇવ',
    refresh: 'તાજું કરો',
    watchHint: 'જ્યારે વિદ્યાર્થીનું જોડાયેલ ખાતું લાઇવ થાય ત્યારે તેઓ અહીં દેખાય છે. તમે જોડાવ કે તરત જ તેમને "જોવાઈ રહ્યું છે" સંકેત દેખાય છે, અને તેઓ ગમે ત્યારે બંધ કરી શકે છે.',
    noLiveStudents: 'હાલમાં કોઈ જોડાયેલ વિદ્યાર્થી લાઇવ નથી.',
    watchBtn: 'જુઓ',
    stopBtn: 'બંધ કરો',
    backBtn: 'પાછળ',
    justNow: 'હમણાં જ',
    minAgo: ' મિનિટ',
    connectingToPrefix: 'આની સાથે જોડાઈ રહ્યું છે: ',
    watchingPrefix: 'જોઈ રહ્યાં છીએ: ',
    epochSingular: ' એપોક',
    epochPlural: ' એપોક',
    waitingForFirstEpochPrefix: '',
    waitingForFirstEpochSuffix: 'ના પ્રથમ એપોકની રાહ જોઈ રહ્યાં છીએ…',
    couldNotLoadLiveStudents: 'લાઇવ વિદ્યાર્થીઓ લોડ કરી શકાયા નથી',
    couldNotConnectLiveSession: 'લાઇવ સેશન સાથે જોડાઈ શકાયું નથી.',
    sessionNoLongerAvailable: 'આ સેશન હવે ઉપલબ્ધ નથી.',

    cohortTitleNeedsAttention: 'જૂથ · {n}ને ધ્યાન આપવાની જરૂર',
    noClientsNeedAttention: 'હાલમાં કોઈ ગ્રાહકને ધ્યાન આપવાની જરૂર નથી — બધા ટ્રેક પર છે.',
    noDepthDataYet: 'હજી ઊંડાણનો ડેટા નથી',
    clearFilterTitle: 'ફિલ્ટર સાફ કરો',
    showAllClients: 'બધા ગ્રાહકો બતાવો',

    createLoginBtn: 'લૉગિન બનાવો',
    createLoginTitle: 'આ વિદ્યાર્થીનું લૉગિન બનાવો (ખાતું + લિંક, એક પગલામાં)',
    linkAccountBtn: 'ખાતું લિંક કરો',
    linkAccountTitle: 'તેના બદલે હાલના ખાતાને લિંક કરો',
    signsInAsPrefix: 'આ રીતે સાઇન ઇન કરે છે: ',
    signsInAsSuffix: ' — બદલવા/અનલિંક કરવા ક્લિક કરો',
    promptUsernameForStudent: 'આ વિદ્યાર્થી માટે વપરાશકર્તા નામ પસંદ કરો:',
    promptPasswordForStudent: 'પાસવર્ડ પસંદ કરો (ઓછામાં ઓછા 6 અક્ષર) — વિદ્યાર્થી સાથે શેર કરો:',
    createLoginDonePrefix: 'થઈ ગયું. ',
    createLoginDoneMid: ' આ રીતે સાઇન ઇન કરે છે: "',
    createLoginDoneSuffix: '" — તેમના સેશન આ ગ્રાહક હેઠળ દેખાશે, અને તમે તેમને Watch Live માંથી લાઇવ જોઈ શકો છો.',
    theStudentFallback: 'વિદ્યાર્થી',
    promptLinkAccount: 'લૉગિન ખાતા (વપરાશકર્તા નામ) સાથે લિંક કરો. ખાલી રાખવાથી લિંક દૂર થશે.\nલિંક હોય ત્યારે, તમે આ વિદ્યાર્થીના લાઇવ સેશન જોઈ શકો છો — તેમને "જોવાઈ રહ્યું છે" સંકેત દેખાય છે.',
  },
};

// ── Reactive engine ──────────────────────────────────────────────────────────
const LANG_KEY = 'eeg_lang';
const hasStorage = typeof localStorage !== 'undefined';
const lang = ref((hasStorage && localStorage.getItem(LANG_KEY)) || 'en');

function setLang(l) {
  lang.value = l === 'gu' ? 'gu' : 'en';
  if (hasStorage) localStorage.setItem(LANG_KEY, lang.value);
  if (typeof document !== 'undefined') document.documentElement.lang = lang.value;
}

function t(key) {
  return (I18N[lang.value] && I18N[lang.value][key]) ?? I18N.en[key] ?? key;
}

// Template variant of t() — replaces {placeholder} tokens with values from
// `params`. Used for strings with embedded counts/names (e.g. "Cohort · {n}
// client{s}") where the surrounding words need to translate too, not just
// the raw number.
function tf(key, params) {
  let s = t(key);
  for (const [k, v] of Object.entries(params || {})) {
    s = s.replaceAll('{' + k + '}', v);
  }
  return s;
}

// ── Identifier -> display-text translators ──────────────────────────────────
function translateState(state) { return t('state_' + state) === 'state_' + state ? state : t('state_' + state); }
function translateDepth(depth) { const k = 'depth_' + depth; return I18N[lang.value]?.[k] ?? I18N.en[k] ?? depth; }
function translateSwaraNadi(nadi) { return t('swara_' + nadi) === 'swara_' + nadi ? nadi : t('swara_' + nadi); }
function translateConfidenceWord(word) { return t('conf_' + word) === 'conf_' + word ? word : t('conf_' + word); }
function translateNirodha(label) {
  if (!label) return label;
  if (label.startsWith('Nirodha')) return t('nirodha_Nirodha');
  if (label.startsWith('Vikshepa')) return t('nirodha_Vikshepa');
  const k = 'nirodha_' + label;
  return I18N[lang.value]?.[k] ?? I18N.en[k] ?? label;
}

// Guna blend labels come in several shapes from the classifier: "Sattvic",
// "Rajasic-predominant, Sattvic-secondary", "Balanced (all three)". Word-level
// substitution handles every combination without enumerating each one.
function translateGunaLabel(label) {
  if (!label || lang.value === 'en') return label;
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
// each known template, translate the label, and keep the numeric part as-is.
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
  if (!flag || lang.value === 'en') return flag;
  for (const [re, key] of TATTVA_PATTERNS) {
    if (re.test(flag)) return flag.replace(re, t(key));
  }
  return flag; // unrecognized template — leave as-is rather than guess
}

// ── Corroboration axis notes/readings ──
// Fixed English sentences authored in the backend (VedanticAnalyzer.Corroborate)
// and mirrored in the local-FFT fixture. Neither source parameterizes these by
// language, so we translate them client-side by exact-text lookup.
const CORROB_NOTE_GU = {
  'low complexity is consistent with tāmasic dullness': 'નીચી જટિલતા તામસિક જડતા સાથે સુસંગત છે',
  'rich, structured signal — resembles resting awareness more than inertia': 'સમૃદ્ધ, સંરચિત સંકેત — જડતા કરતાં વિશ્રામી જાગૃતિ જેવું લાગે છે',
  'richness is higher than a purely inert state would show': 'સંપૂર્ણ જડ સ્થિતિ કરતાં સમૃદ્ધિ વધારે છે',
  'high, unpredictable complexity fits a scattered mind': 'ઊંચી, અણધારી જટિલતા વિખરાયેલા મન સાથે બંધબેસે છે',
  'unusually ordered for a scattered state': 'વિખરાયેલી સ્થિતિ માટે અસામાન્ય રીતે વ્યવસ્થિત',
  'mid-range complexity fits an oscillating mind': 'મધ્ય-શ્રેણીની જટિલતા ડોલતા મન સાથે બંધબેસે છે',
  'retained complexity — genuine stillness, not drowsiness': 'જળવાયેલી જટિલતા — સાચી સ્થિરતા, ઊંઘ નહીં',
  'low complexity resembles drowsiness (tāmasic Mudha), not absorption': 'નીચી જટિલતા ઊંઘ (તામસિક મૂઢ) જેવી લાગે છે, લીનતા નહીં',
  'flat 1/f (cortical excitation) fits hyperarousal': 'સપાટ 1/f (કોર્ટિકલ ઉત્તેજના) અતિ-ઉત્તેજના સાથે બંધબેસે છે',
  'a quiet cortical background is unexpected for agitation': 'શાંત કોર્ટિકલ પૃષ્ઠભૂમિ ઉશ્કેરાટ માટે અનપેક્ષિત છે',
  'steep 1/f — a quiet, inhibition-weighted cortex': 'તીવ્ર 1/f — શાંત, અવરોધ-ભારિત કોર્ટેક્સ',
  'an excitation-weighted background is unexpected for deep absorption': 'ઊંડી લીનતા માટે ઉત્તેજના-ભારિત પૃષ્ઠભૂમિ અનપેક્ષિત છે',
  'steep 1/f fits low-arousal heaviness': 'તીવ્ર 1/f નીચી-ઉત્તેજના ભારેપણા સાથે બંધબેસે છે',
  'elevated high-β chatter fits Kṣipta': 'ઊંચી high-β વાચાળતા ક્ષિપ્ત સાથે બંધબેસે છે',
  'unusually quiet for a scattered state': 'વિખરાયેલી સ્થિતિ માટે અસામાન્ય રીતે શાંત',
  'stilled fluctuations — citta-vṛtti-nirodha': 'શાંત થયેલી વધઘટ — ચિત્ત-વૃત્તિ-નિરોધ',
  'active chatter is at odds with one-pointedness': 'સક્રિય વાચાળતા એકાગ્રતા સાથે વિરોધાભાસી છે',
  'low chatter — though dullness and stillness both read low here': 'ઓછી વાચાળતા — જોકે અહીં જડતા અને સ્થિરતા બંને નીચા દેખાય છે',
  'some restlessness fits an oscillating mind': 'થોડી અસ્વસ્થતા ડોલતા મન સાથે બંધબેસે છે',
  'Fm-θ + α synchrony — the focused-attention absorption signature': 'Fm-θ + α સુમેળ — કેન્દ્રિત-ધ્યાન લીનતાની નિશાની',
  'the one-pointed absorption signature is absent': 'એકાગ્ર લીનતાની નિશાની ગેરહાજર છે',
  'effortless — the flow-like signature of dhyāna, not strained holding': 'સહજ — ધ્યાનની પ્રવાહ જેવી નિશાની, તાણયુક્ત પકડ નહીં',
  'focus appears effortful — dhāraṇā-like holding rather than settled flow': 'ધ્યાન કેન્દ્રીકરણ પ્રયત્નશીલ લાગે છે — સ્થિર પ્રવાહને બદલે ધારણા જેવી પકડ',
};
const CORROB_CAVEAT_GU = {
  'Low neural complexity resembles drowsiness (tāmasic Mudha) rather than genuine absorption.':
    'નીચી ન્યુરલ જટિલતા સાચી લીનતાને બદલે ઊંઘ (તામસિક મૂઢ) જેવી લાગે છે.',
  'The signal retains rich structure — this may be quiet resting awareness rather than inertia.':
    'સંકેત સમૃદ્ધ સંરચના જાળવે છે — આ જડતાને બદલે શાંત વિશ્રામી જાગૃતિ હોઈ શકે છે.',
  'Neuromarkers diverge from the śāstric reading.': 'ન્યુરોમાર્કર્સ શાસ્ત્રીય વાંચનથી અલગ પડે છે.',
};
const CORROB_LEVEL_GU = {
  low: 'નીચી', moderate: 'મધ્યમ', high: 'ઊંચી',
  flat: 'સપાટ', steep: 'તીવ્ર',
  present: 'હાજર', absent: 'ગેરહાજર',
  effortless: 'સહજ', effortful: 'પ્રયત્નશીલ',
};
function translateCorrobNote(note) {
  if (!note || lang.value !== 'gu') return note;
  return CORROB_NOTE_GU[note] || note;
}
function translateCorrobCaveat(caveat) {
  if (!caveat || lang.value !== 'gu') return caveat;
  return CORROB_CAVEAT_GU[caveat] || caveat;
}
function translateCorrobReading(reading) {
  if (!reading || lang.value !== 'gu') return reading;
  if (CORROB_LEVEL_GU[reading]) return CORROB_LEVEL_GU[reading];
  let m = reading.match(/^(low|moderate|high) richness \(([\d.]+)\)$/);
  if (m) return `${CORROB_LEVEL_GU[m[1]]} સમૃદ્ધિ (${toGujaratiDigits(m[2])})`;
  m = reading.match(/^(flat|moderate|steep) 1\/f slope \(exponent ([\d.]+)\)$/);
  if (m) return `${CORROB_LEVEL_GU[m[1]]} 1/f ઢાળ (એક્સપોનન્ટ ${toGujaratiDigits(m[2])})`;
  m = reading.match(/^(low|moderate|high) vṛtti \(([\d.]+)\)$/);
  if (m) return `${CORROB_LEVEL_GU[m[1]]} વૃત્તિ (${toGujaratiDigits(m[2])})`;
  return reading; // unrecognized template — leave as-is rather than guess
}

// Data-quality badge and admin-role labels come back from the driver/API as
// fixed English strings — map the ones we know to a translation key.
const DATA_QUALITY_KEYS = {
  '⏪ replay': 'qualityReplay',
  '✓ local FFT': 'qualityLocalFft',
  '✓ demo': 'qualityDemo',
  '✓ BLE → Render': 'qualityBleRender',
};
function translateDataQuality(q) {
  if (!q) return q;
  const key = DATA_QUALITY_KEYS[q];
  return key ? t(key) : q;
}

const ROLE_KEYS = { user: 'adminRoleUser', 'co-admin': 'adminRoleCoAdmin', admin: 'adminRoleAdmin' };
function translateRole(role) {
  const key = ROLE_KEYS[role];
  return key ? t(key) : role;
}

// ── Gujarati numerals ────────────────────────────────────────────────────────
// ૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯ — applied to any already-formatted number/string so
// every displayed figure (percentages, BPM, counts, ms) follows the language
// choice, not just labels. Route any number rendered in a template through
// localizeNumber() rather than raw .toFixed()/String().
const GUJARATI_DIGITS = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
const LATIN_DIGITS_RE = /[0-9]/g;
const GUJARATI_DIGITS_RE = /[૦૧૨૩૪૫૬૭૮૯]/g;
function toGujaratiDigits(str) {
  return String(str).replace(LATIN_DIGITS_RE, d => GUJARATI_DIGITS[+d]);
}
function toLatinDigits(str) {
  return String(str).replace(GUJARATI_DIGITS_RE, d => String(GUJARATI_DIGITS.indexOf(d)));
}
function localizeNumber(value) {
  const s = String(value);
  return lang.value === 'gu' ? toGujaratiDigits(s) : s;
}

if (typeof document !== 'undefined') document.documentElement.lang = lang.value;

// Single shared instance — `lang` is module-scoped so every component that
// calls useI18n() reacts to the same language switch.
export function useI18n() {
  return {
    lang, setLang, t, tf,
    translateState, translateDepth, translateSwaraNadi, translateConfidenceWord, translateNirodha,
    translateGunaLabel, translateTattvaFlag, translateCorrobNote, translateCorrobCaveat, translateCorrobReading,
    translateDataQuality, translateRole,
    toGujaratiDigits, toLatinDigits, localizeNumber,
  };
}
