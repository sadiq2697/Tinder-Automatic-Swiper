// Storage Schema v3.0 - Centralized storage management with migration support

const STORAGE_VERSION = 3;

const DEFAULT_STORAGE = {
  version: STORAGE_VERSION,

  // === SETTINGS ===
  settings: {
    autoLike: false,
    autoDislike: false,
    delayTime: 3,
    delayRandomization: false,
    delayMin: 2,
    delayMax: 5,
    swipeRatio: 70,
    swipeLimit: 0,
    dailyLimit: 0,
    breakInterval: 0,
    breakDuration: 30,
    sessionGapInterval: 0,
    sessionGapMin: 30,
    sessionGapMax: 60,
    antiDetection: true,
    speedMode: false,
  },

  // === FILTERS ===
  filters: {
    enabled: false,
    ageMin: 18,
    ageMax: 50,
    maxDistance: 0,
    requireBio: false,
    minPhotos: 0,
    bioKeywords: [],
    bioBlocklist: [],
    verifiedOnly: false,
  },

  // === STATS ===
  stats: {
    totalLikes: 0,
    totalDislikes: 0,
    sessionsCount: 0,
    matchCount: 0,
    todayLikes: 0,
    todayDislikes: 0,
    todayDate: '',
    streakDays: 0,
    lastActiveDate: '',
  },

  // === SESSIONS (per-tab) ===
  sessions: {
    // Keyed by tabId, each entry has:
    // tabId, isRunning, isPaused, site, sessionLikes, sessionDislikes, sessionStart, swipesSinceBreak
  },

  // === HISTORY ===
  history: {
    swipes: [],
    sessions: [],
  },

  // === UI PREFERENCES ===
  ui: {
    theme: 'dark',
    soundEnabled: true,
    notificationsEnabled: true,
    showPercentages: true,
  },

  // === ACHIEVEMENTS ===
  achievements: {
    unlocked: [],
    lastChecked: 0,
  },

  // === GOALS ===
  goals: {
    dailyTarget: 0,
    dailyProgress: 0,
  },
};

// Migrate from v1/v2 flat storage to v3 nested structure
function migrateFromLegacy(oldData) {
  const migrated = JSON.parse(JSON.stringify(DEFAULT_STORAGE));

  // Migrate settings
  if (oldData.autoLike !== undefined) migrated.settings.autoLike = oldData.autoLike;
  if (oldData.autoDislike !== undefined) migrated.settings.autoDislike = oldData.autoDislike;
  if (oldData.delayTime !== undefined) migrated.settings.delayTime = parseInt(oldData.delayTime, 10);

  // Migrate stats
  if (oldData.likeCount !== undefined) migrated.stats.totalLikes = oldData.likeCount;
  if (oldData.dislikeCount !== undefined) migrated.stats.totalDislikes = oldData.dislikeCount;

  // Migrate session state
  if (oldData.isRunning !== undefined) migrated.session.isRunning = oldData.isRunning;
  if (oldData.currentSite !== undefined) migrated.session.currentSite = oldData.currentSite;

  // Migrate last swipe to history
  if (oldData.lastSwipe) {
    migrated.history.swipes.push({
      id: generateId(),
      name: oldData.lastSwipe.name || 'Unknown',
      age: oldData.lastSwipe.age || '?',
      distance: oldData.lastSwipe.distance || '?',
      action: oldData.lastSwipe.action || 'like',
      site: oldData.lastSwipe.site || 'tinder',
      timestamp: oldData.lastSwipe.time || Date.now(),
      photoCount: 0,
      hasBio: false,
      filterReason: null,
    });
  }

  migrated.version = STORAGE_VERSION;
  return migrated;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Initialize storage with defaults or migrate existing data
async function initializeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      // Check if already on current version
      if (data.version === STORAGE_VERSION) {
        resolve(data);
        return;
      }

      // Check if this is legacy data (no version field)
      if (data.version === undefined && (data.autoLike !== undefined || data.likeCount !== undefined)) {
        console.log('[Storage] Migrating from legacy storage...');
        const migrated = migrateFromLegacy(data);

        // Clear old keys and save new structure
        chrome.storage.local.clear(() => {
          chrome.storage.local.set(migrated, () => {
            console.log('[Storage] Migration complete');
            resolve(migrated);
          });
        });
        return;
      }

      // Fresh install - use defaults
      console.log('[Storage] Fresh install, setting defaults...');
      chrome.storage.local.set(DEFAULT_STORAGE, () => {
        resolve(DEFAULT_STORAGE);
      });
    });
  });
}

// Get nested value from storage
async function getStorage(keys = null) {
  return new Promise((resolve) => {
    if (keys === null) {
      chrome.storage.local.get(null, resolve);
    } else {
      chrome.storage.local.get(keys, resolve);
    }
  });
}

// Update nested storage values
async function updateStorage(updates) {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (current) => {
      const merged = deepMerge(current, updates);
      chrome.storage.local.set(merged, () => resolve(merged));
    });
  });
}

// Deep merge helper
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Add swipe to history (keeps last 500)
async function addSwipeToHistory(swipeData) {
  const data = await getStorage(['history', 'stats']);
  const history = data.history || { swipes: [], sessions: [] };
  const stats = data.stats || DEFAULT_STORAGE.stats;

  const swipe = {
    id: generateId(),
    timestamp: Date.now(),
    ...swipeData,
  };

  history.swipes.unshift(swipe);

  // Keep only last 500
  if (history.swipes.length > 500) {
    history.swipes = history.swipes.slice(0, 500);
  }

  // Update stats
  if (swipe.action === 'like') {
    stats.totalLikes++;
    stats.todayLikes++;
  } else {
    stats.totalDislikes++;
    stats.todayDislikes++;
  }

  // Check if we need to reset daily stats
  const today = new Date().toDateString();
  if (stats.todayDate !== today) {
    stats.todayLikes = swipe.action === 'like' ? 1 : 0;
    stats.todayDislikes = swipe.action === 'dislike' ? 1 : 0;
    stats.todayDate = today;

    // Update streak
    const lastActive = stats.lastActiveDate;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastActive === yesterday) {
      stats.streakDays++;
    } else if (lastActive !== today) {
      stats.streakDays = 1;
    }
    stats.lastActiveDate = today;
  }

  await updateStorage({ history, stats });
  return swipe;
}

// Start a new session
async function startSession(site) {
  const data = await getStorage(['stats']);
  const stats = data.stats || DEFAULT_STORAGE.stats;

  const session = {
    isRunning: true,
    isPaused: false,
    currentSite: site,
    sessionLikes: 0,
    sessionDislikes: 0,
    sessionStart: Date.now(),
    swipesSinceBreak: 0,
  };

  stats.sessionsCount++;

  await updateStorage({ session, stats });
  return session;
}

// End current session
async function endSession() {
  const data = await getStorage(['session', 'history']);
  const session = data.session || DEFAULT_STORAGE.session;
  const history = data.history || { swipes: [], sessions: [] };

  if (session.sessionStart > 0) {
    const sessionRecord = {
      id: generateId(),
      site: session.currentSite,
      startTime: session.sessionStart,
      endTime: Date.now(),
      likes: session.sessionLikes,
      dislikes: session.sessionDislikes,
    };

    history.sessions.unshift(sessionRecord);

    // Keep only last 30 sessions
    if (history.sessions.length > 30) {
      history.sessions = history.sessions.slice(0, 30);
    }
  }

  const newSession = {
    isRunning: false,
    isPaused: false,
    currentSite: '',
    sessionLikes: 0,
    sessionDislikes: 0,
    sessionStart: 0,
    swipesSinceBreak: 0,
  };

  await updateStorage({ session: newSession, history });
}

// Increment session swipe count
async function incrementSessionSwipe(action) {
  const data = await getStorage(['session']);
  const session = data.session || DEFAULT_STORAGE.session;

  if (action === 'like') {
    session.sessionLikes++;
  } else {
    session.sessionDislikes++;
  }
  session.swipesSinceBreak++;

  await updateStorage({ session });
  return session;
}

// Log a match manually
async function logMatch() {
  const data = await getStorage(['stats']);
  const stats = data.stats || DEFAULT_STORAGE.stats;
  stats.matchCount++;
  await updateStorage({ stats });
  return stats.matchCount;
}

// Reset all stats
async function resetStats() {
  const freshStats = JSON.parse(JSON.stringify(DEFAULT_STORAGE.stats));
  const freshHistory = JSON.parse(JSON.stringify(DEFAULT_STORAGE.history));
  const freshAchievements = JSON.parse(JSON.stringify(DEFAULT_STORAGE.achievements));
  const freshGoals = JSON.parse(JSON.stringify(DEFAULT_STORAGE.goals));

  await updateStorage({
    stats: freshStats,
    history: freshHistory,
    achievements: freshAchievements,
    goals: freshGoals,
  });
}

// Check daily limits
async function checkLimits() {
  const data = await getStorage(['settings', 'stats', 'session']);
  const settings = data.settings || DEFAULT_STORAGE.settings;
  const stats = data.stats || DEFAULT_STORAGE.stats;
  const session = data.session || DEFAULT_STORAGE.session;

  const result = {
    canSwipe: true,
    reason: null,
    todayTotal: stats.todayLikes + stats.todayDislikes,
    sessionTotal: session.sessionLikes + session.sessionDislikes,
  };

  // Check daily limit
  if (settings.dailyLimit > 0 && result.todayTotal >= settings.dailyLimit) {
    result.canSwipe = false;
    result.reason = 'daily_limit';
  }

  // Check session limit
  if (settings.swipeLimit > 0 && result.sessionTotal >= settings.swipeLimit) {
    result.canSwipe = false;
    result.reason = 'session_limit';
  }

  return result;
}

// Check if break is needed
async function checkBreakNeeded() {
  const data = await getStorage(['settings', 'session']);
  const settings = data.settings || DEFAULT_STORAGE.settings;
  const session = data.session || DEFAULT_STORAGE.session;

  if (settings.breakInterval > 0 && session.swipesSinceBreak >= settings.breakInterval) {
    return {
      needsBreak: true,
      duration: settings.breakDuration,
    };
  }

  return { needsBreak: false, duration: 0 };
}

// Reset break counter after break
async function resetBreakCounter() {
  const data = await getStorage(['session']);
  const session = data.session || DEFAULT_STORAGE.session;
  session.swipesSinceBreak = 0;
  await updateStorage({ session });
}

// Get last swipe from history
async function getLastSwipe() {
  const data = await getStorage(['history']);
  const history = data.history || { swipes: [] };
  return history.swipes[0] || null;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.SwipeStorage = {
    DEFAULT_STORAGE,
    initializeStorage,
    getStorage,
    updateStorage,
    addSwipeToHistory,
    startSession,
    endSession,
    incrementSessionSwipe,
    logMatch,
    resetStats,
    checkLimits,
    checkBreakNeeded,
    resetBreakCounter,
    getLastSwipe,
    generateId,
  };
}
