// Track debugger attachment state per tab
const debuggerAttached = new Map();

// Storage schema version
const STORAGE_VERSION = 3;

const DEFAULT_STORAGE = {
  version: STORAGE_VERSION,
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
  sessions: {
    // Keyed by tabId
  },
  history: {
    swipes: [],
    sessions: [],
  },
  ui: {
    theme: 'dark',
    soundEnabled: true,
    notificationsEnabled: true,
    showPercentages: true,
  },
  achievements: {
    unlocked: [],
    lastChecked: 0,
  },
  goals: {
    dailyTarget: 0,
    dailyProgress: 0,
  },
};

// Initialize storage on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Background] Fresh install, setting defaults...');
    chrome.storage.local.set(DEFAULT_STORAGE);
  } else if (details.reason === 'update') {
    console.log('[Background] Extension updated, checking migration...');
    migrateStorageIfNeeded();
  }
});

// Migrate from legacy storage format
async function migrateStorageIfNeeded() {
  const data = await chrome.storage.local.get(null);

  if (data.version === STORAGE_VERSION) {
    console.log('[Background] Storage already up to date');
    return;
  }

  // Check if legacy data exists
  if (data.version === undefined && (data.autoLike !== undefined || data.likeCount !== undefined)) {
    console.log('[Background] Migrating from legacy storage...');

    const migrated = JSON.parse(JSON.stringify(DEFAULT_STORAGE));

    // Migrate settings
    if (data.autoLike !== undefined) migrated.settings.autoLike = data.autoLike;
    if (data.autoDislike !== undefined) migrated.settings.autoDislike = data.autoDislike;
    if (data.delayTime !== undefined) migrated.settings.delayTime = parseInt(data.delayTime, 10);

    // Migrate stats
    if (data.likeCount !== undefined) migrated.stats.totalLikes = data.likeCount;
    if (data.dislikeCount !== undefined) migrated.stats.totalDislikes = data.dislikeCount;

    // Migrate session state
    if (data.isRunning !== undefined) migrated.session.isRunning = data.isRunning;
    if (data.currentSite !== undefined) migrated.session.currentSite = data.currentSite;

    // Migrate last swipe to history
    if (data.lastSwipe) {
      migrated.history.swipes.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        name: data.lastSwipe.name || 'Unknown',
        age: data.lastSwipe.age || '?',
        distance: data.lastSwipe.distance || '?',
        action: data.lastSwipe.action || 'like',
        site: data.lastSwipe.site || 'tinder',
        timestamp: data.lastSwipe.time || Date.now(),
        photoCount: 0,
        hasBio: false,
        filterReason: null,
      });
    }

    await chrome.storage.local.clear();
    await chrome.storage.local.set(migrated);
    console.log('[Background] Migration complete');
  } else if (data.version === undefined) {
    // Fresh install
    await chrome.storage.local.set(DEFAULT_STORAGE);
  }
}

// Show notification
function showNotification(title, message) {
  chrome.storage.local.get(['ui'], (data) => {
    if (data.ui?.notificationsEnabled !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon128.png',
        title: title,
        message: message,
      });
    }
  });
}

// Storage change listener for debugging
chrome.storage.onChanged.addListener((changes, namespace) => {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    if (key !== 'history') {
      console.log(`[Storage] "${key}" changed`);
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Provide tab ID to content scripts
  if (message.action === 'getTabId') {
    sendResponse({ tabId: sender.tab?.id || null });
    return true;
  }

  if (message.action === 'debuggerClick') {
    handleDebuggerClick(sender.tab.id, message.x, message.y)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'attachDebugger') {
    attachDebugger(sender.tab.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'detachDebugger') {
    detachDebugger(sender.tab.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'notify') {
    showNotification(message.title, message.message);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'sessionComplete') {
    showNotification('Session Complete', `Swiped ${message.total} profiles (${message.likes} likes, ${message.dislikes} passes)`);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'limitReached') {
    const msg = message.limitType === 'daily'
      ? 'Daily swipe limit reached. Take a break!'
      : 'Session swipe limit reached.';
    showNotification('Limit Reached', msg);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'breakTime') {
    showNotification('Break Time', `Taking a ${message.duration}s break to stay safe.`);
    sendResponse({ success: true });
    return true;
  }
});

async function attachDebugger(tabId) {
  if (debuggerAttached.get(tabId)) {
    console.log(`Debugger already attached to tab ${tabId}`);
    return;
  }

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    debuggerAttached.set(tabId, true);
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (err) {
    console.error(`Failed to attach debugger: ${err.message}`);
    throw err;
  }
}

async function detachDebugger(tabId) {
  if (!debuggerAttached.get(tabId)) {
    return;
  }

  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttached.set(tabId, false);
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (err) {
    console.error(`Failed to detach debugger: ${err.message}`);
  }
}

async function handleDebuggerClick(tabId, x, y) {
  // Ensure debugger is attached
  if (!debuggerAttached.get(tabId)) {
    await attachDebugger(tabId);
  }

  try {
    // Send mouse pressed event
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x,
      y: y,
      button: 'left',
      clickCount: 1
    });

    // Small delay
    await new Promise(r => setTimeout(r, 50));

    // Send mouse released event
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: x,
      y: y,
      button: 'left',
      clickCount: 1
    });

    console.log(`Debugger click sent at (${x}, ${y})`);
  } catch (err) {
    console.error(`Debugger click failed: ${err.message}`);
    throw err;
  }
}

// Clean up debugger and session when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (debuggerAttached.get(tabId)) {
    debuggerAttached.delete(tabId);
  }

  // Clean up session for this tab
  try {
    const data = await chrome.storage.local.get(['sessions', 'history']);
    const sessions = data.sessions || {};
    const history = data.history || { swipes: [], sessions: [] };

    if (sessions[tabId]) {
      const session = sessions[tabId];

      // Save session to history if it had activity
      if (session.sessionStart > 0 && (session.sessionLikes > 0 || session.sessionDislikes > 0)) {
        const sessionRecord = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          tabId: tabId,
          site: session.site,
          startTime: session.sessionStart,
          endTime: Date.now(),
          likes: session.sessionLikes || 0,
          dislikes: session.sessionDislikes || 0,
        };
        history.sessions.unshift(sessionRecord);
        if (history.sessions.length > 30) {
          history.sessions = history.sessions.slice(0, 30);
        }
      }

      // Remove session
      delete sessions[tabId];
      await chrome.storage.local.set({ sessions, history });
      console.log(`[Background] Cleaned up session for tab ${tabId}`);
    }
  } catch (e) {
    console.log(`[Background] Error cleaning up session for tab ${tabId}:`, e);
  }
});

// Handle debugger detach events
chrome.debugger.onDetach.addListener((source, reason) => {
  debuggerAttached.set(source.tabId, false);
  console.log(`Debugger detached from tab ${source.tabId}: ${reason}`);
});
