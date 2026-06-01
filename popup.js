// Auto Swiper Popup v3.2 - Multi-tab support

// Get all active sessions
async function getActiveSessions() {
  const data = await chrome.storage.local.get(['sessions']);
  const sessions = data.sessions || {};
  return Object.values(sessions).filter(s => s.isRunning);
}

// Get current tab info
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const elements = {
  // Views
  settingsView: document.getElementById('settingsView'),
  runningView: document.getElementById('runningView'),

  // Settings - Basic
  autoLike: document.getElementById('autoLike'),
  autoDislike: document.getElementById('autoDislike'),
  swipeRatio: document.getElementById('swipeRatio'),
  ratioValue: document.getElementById('ratioValue'),

  // Settings - Timing
  delayTime: document.getElementById('delayTime'),
  delayValue: document.getElementById('delayValue'),
  delayRandomization: document.getElementById('delayRandomization'),
  delayRangeRow: document.getElementById('delayRangeRow'),
  delayMin: document.getElementById('delayMin'),
  delayMax: document.getElementById('delayMax'),
  antiDetection: document.getElementById('antiDetection'),
  speedMode: document.getElementById('speedMode'),
  speedModeWarning: document.getElementById('speedModeWarning'),

  // Settings - Limits
  swipeLimit: document.getElementById('swipeLimit'),
  dailyLimit: document.getElementById('dailyLimit'),
  breakInterval: document.getElementById('breakInterval'),
  breakDurationRow: document.getElementById('breakDurationRow'),
  breakDuration: document.getElementById('breakDuration'),
  sessionGapInterval: document.getElementById('sessionGapInterval'),
  sessionGapRow: document.getElementById('sessionGapRow'),
  sessionGapMin: document.getElementById('sessionGapMin'),
  sessionGapMax: document.getElementById('sessionGapMax'),

  // Settings - Filters
  filtersEnabled: document.getElementById('filtersEnabled'),
  filtersContent: document.getElementById('filtersContent'),
  ageMin: document.getElementById('ageMin'),
  ageMax: document.getElementById('ageMax'),
  maxDistance: document.getElementById('maxDistance'),
  requireBio: document.getElementById('requireBio'),
  verifiedOnly: document.getElementById('verifiedOnly'),
  minPhotos: document.getElementById('minPhotos'),
  bioKeywords: document.getElementById('bioKeywords'),
  bioBlocklist: document.getElementById('bioBlocklist'),

  // Quick Stats
  todayLikes: document.getElementById('todayLikes'),
  todayDislikes: document.getElementById('todayDislikes'),
  streakDays: document.getElementById('streakDays'),

  // Buttons - Settings
  playBtn: document.getElementById('playBtn'),
  dashboardBtn: document.getElementById('dashboardBtn'),
  resetBtn: document.getElementById('resetBtn'),

  // Running View Elements
  sessionLikes: document.getElementById('sessionLikes'),
  sessionDislikes: document.getElementById('sessionDislikes'),
  sessionTotal: document.getElementById('sessionTotal'),
  totalLikes: document.getElementById('totalLikes'),
  totalDislikes: document.getElementById('totalDislikes'),
  matchCount: document.getElementById('matchCount'),
  lastName: document.getElementById('lastName'),
  lastAge: document.getElementById('lastAge'),
  lastDistance: document.getElementById('lastDistance'),
  lastAction: document.getElementById('lastAction'),
  lastActionPill: document.getElementById('lastActionPill'),
  filterReasonPill: document.getElementById('filterReasonPill'),
  filterReason: document.getElementById('filterReason'),
  statusBar: document.getElementById('statusBar'),

  // Buttons - Running
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  matchBtn: document.getElementById('matchBtn'),

  // Common
  toast: document.getElementById('toast'),
  siteIndicator: document.getElementById('siteIndicator'),
  siteIndicatorRunning: document.getElementById('siteIndicatorRunning'),
};

function updateSliderBackground(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const value = ((slider.value - min) / (max - min)) * 100;
  slider.style.setProperty('--value', `${value}%`);
}

function showView(hasActiveSessions) {
  if (hasActiveSessions) {
    elements.settingsView.style.display = 'none';
    elements.runningView.style.display = 'block';
  } else {
    elements.settingsView.style.display = 'block';
    elements.runningView.style.display = 'none';
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  setTimeout(() => elements.toast.classList.remove('show'), 2000);
}

function parseKeywords(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function formatKeywords(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.join(', ');
}

// Load all settings from new storage structure
function loadSettings() {
  chrome.storage.local.get(['settings', 'filters', 'stats', 'sessions', 'history'], (data) => {
    const settings = data.settings || {};
    const filters = data.filters || {};
    const stats = data.stats || {};
    const sessions = data.sessions || {};
    const history = data.history || { swipes: [] };
    const activeSessions = Object.values(sessions).filter(s => s.isRunning);

    // Basic settings
    if (settings.autoLike !== undefined) elements.autoLike.checked = settings.autoLike;
    if (settings.autoDislike !== undefined) elements.autoDislike.checked = settings.autoDislike;

    // Ratio
    if (settings.swipeRatio !== undefined) {
      elements.swipeRatio.value = settings.swipeRatio;
      elements.ratioValue.textContent = `${settings.swipeRatio}%`;
      updateSliderBackground(elements.swipeRatio);
    }

    // Timing
    if (settings.delayTime !== undefined) {
      elements.delayTime.value = settings.delayTime;
      elements.delayValue.textContent = `${settings.delayTime}s`;
      updateSliderBackground(elements.delayTime);
    }
    if (settings.delayRandomization !== undefined) {
      elements.delayRandomization.checked = settings.delayRandomization;
      elements.delayRangeRow.style.display = settings.delayRandomization ? 'flex' : 'none';
    }
    if (settings.delayMin !== undefined) elements.delayMin.value = settings.delayMin;
    if (settings.delayMax !== undefined) elements.delayMax.value = settings.delayMax;
    if (settings.antiDetection !== undefined) elements.antiDetection.checked = settings.antiDetection;
    if (settings.speedMode !== undefined) {
      elements.speedMode.checked = settings.speedMode;
      elements.speedModeWarning.style.display = settings.speedMode ? 'flex' : 'none';
    }

    // Limits
    if (settings.swipeLimit !== undefined) elements.swipeLimit.value = settings.swipeLimit;
    if (settings.dailyLimit !== undefined) elements.dailyLimit.value = settings.dailyLimit;
    if (settings.breakInterval !== undefined) {
      elements.breakInterval.value = settings.breakInterval;
      elements.breakDurationRow.style.display = settings.breakInterval > 0 ? 'flex' : 'none';
    }
    if (settings.breakDuration !== undefined) elements.breakDuration.value = settings.breakDuration;
    if (settings.sessionGapInterval !== undefined) {
      elements.sessionGapInterval.value = settings.sessionGapInterval;
      elements.sessionGapRow.style.display = settings.sessionGapInterval > 0 ? 'flex' : 'none';
    }
    if (settings.sessionGapMin !== undefined) elements.sessionGapMin.value = settings.sessionGapMin;
    if (settings.sessionGapMax !== undefined) elements.sessionGapMax.value = settings.sessionGapMax;

    // Filters
    if (filters.enabled !== undefined) {
      elements.filtersEnabled.checked = filters.enabled;
      elements.filtersContent.style.display = filters.enabled ? 'block' : 'none';
    }
    if (filters.ageMin !== undefined) elements.ageMin.value = filters.ageMin;
    if (filters.ageMax !== undefined) elements.ageMax.value = filters.ageMax;
    if (filters.maxDistance !== undefined) elements.maxDistance.value = filters.maxDistance;
    if (filters.requireBio !== undefined) elements.requireBio.checked = filters.requireBio;
    if (filters.verifiedOnly !== undefined) elements.verifiedOnly.checked = filters.verifiedOnly;
    if (filters.minPhotos !== undefined) elements.minPhotos.value = filters.minPhotos;
    if (filters.bioKeywords) elements.bioKeywords.value = formatKeywords(filters.bioKeywords);
    if (filters.bioBlocklist) elements.bioBlocklist.value = formatKeywords(filters.bioBlocklist);

    // Quick stats
    elements.todayLikes.textContent = stats.todayLikes || 0;
    elements.todayDislikes.textContent = stats.todayDislikes || 0;
    elements.streakDays.textContent = stats.streakDays || 0;

    // Check if any sessions are running
    const hasActive = activeSessions.length > 0;
    showView(hasActive);
    if (hasActive) {
      updateRunningStats(activeSessions, stats, history);
    }
  });
}

function updateRunningStats(activeSessions, stats, history) {
  // Aggregate session stats from all active tabs
  let totalSessionLikes = 0;
  let totalSessionDislikes = 0;
  let anyPaused = false;

  activeSessions.forEach(session => {
    totalSessionLikes += session.sessionLikes || 0;
    totalSessionDislikes += session.sessionDislikes || 0;
    if (session.isPaused) anyPaused = true;
  });

  // Session stats (combined)
  elements.sessionLikes.textContent = totalSessionLikes;
  elements.sessionDislikes.textContent = totalSessionDislikes;
  elements.sessionTotal.textContent = totalSessionLikes + totalSessionDislikes;

  // All-time stats
  elements.totalLikes.textContent = stats.totalLikes || 0;
  elements.totalDislikes.textContent = stats.totalDislikes || 0;
  elements.matchCount.textContent = stats.matchCount || 0;

  // Update status bar to show active tab count
  const statusText = elements.statusBar.querySelector('.status-text');
  const statusDot = elements.statusBar.querySelector('.status-dot');
  if (activeSessions.length > 1) {
    statusText.textContent = `${activeSessions.length} tabs running`;
  } else if (activeSessions.length === 1) {
    const site = activeSessions[0].site || 'Unknown';
    statusText.textContent = anyPaused ? `Paused (${site})` : `Running (${site})`;
  }
  statusDot.className = anyPaused ? 'status-dot paused' : 'status-dot running';

  // Last swipe from history
  const lastSwipe = history.swipes && history.swipes[0];
  if (lastSwipe) {
    elements.lastName.textContent = lastSwipe.name || '-';
    elements.lastAge.textContent = lastSwipe.age || '-';
    elements.lastDistance.textContent = lastSwipe.distance || '-';

    if (lastSwipe.action === 'like') {
      elements.lastAction.textContent = 'LIKED';
      elements.lastActionPill.className = 'info-pill action liked';
    } else {
      elements.lastAction.textContent = 'PASSED';
      elements.lastActionPill.className = 'info-pill action passed';
    }

    if (lastSwipe.filterReason) {
      elements.filterReasonPill.style.display = 'block';
      elements.filterReason.textContent = lastSwipe.filterReason;
    } else {
      elements.filterReasonPill.style.display = 'none';
    }
  }
}

// Lucide icons used for the pause/resume toggle (matches the static markup style)
const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>';

function updatePauseButton(isPaused) {
  const statusDot = elements.statusBar.querySelector('.status-dot');
  const statusText = elements.statusBar.querySelector('.status-text');

  if (isPaused) {
    elements.pauseBtn.innerHTML = ICON_PLAY;
    elements.pauseBtn.title = 'Resume';
    statusDot.className = 'status-dot paused';
    statusText.textContent = 'Paused';
  } else {
    elements.pauseBtn.innerHTML = ICON_PAUSE;
    elements.pauseBtn.title = 'Pause';
    statusDot.className = 'status-dot running';
    statusText.textContent = 'Running';
  }
}

// Save all settings to new storage structure
function saveSettings() {
  const settings = {
    autoLike: elements.autoLike.checked,
    autoDislike: elements.autoDislike.checked,
    swipeRatio: parseInt(elements.swipeRatio.value, 10),
    delayTime: parseInt(elements.delayTime.value, 10),
    delayRandomization: elements.delayRandomization.checked,
    delayMin: parseInt(elements.delayMin.value, 10),
    delayMax: parseInt(elements.delayMax.value, 10),
    swipeLimit: parseInt(elements.swipeLimit.value, 10) || 0,
    dailyLimit: parseInt(elements.dailyLimit.value, 10) || 0,
    breakInterval: parseInt(elements.breakInterval.value, 10) || 0,
    breakDuration: parseInt(elements.breakDuration.value, 10) || 30,
    sessionGapInterval: parseInt(elements.sessionGapInterval.value, 10) || 0,
    sessionGapMin: parseInt(elements.sessionGapMin.value, 10) || 30,
    sessionGapMax: parseInt(elements.sessionGapMax.value, 10) || 60,
    antiDetection: elements.antiDetection.checked,
    speedMode: elements.speedMode.checked,
  };

  const filters = {
    enabled: elements.filtersEnabled.checked,
    ageMin: parseInt(elements.ageMin.value, 10) || 18,
    ageMax: parseInt(elements.ageMax.value, 10) || 50,
    maxDistance: parseInt(elements.maxDistance.value, 10) || 0,
    requireBio: elements.requireBio.checked,
    verifiedOnly: elements.verifiedOnly.checked,
    minPhotos: parseInt(elements.minPhotos.value, 10) || 0,
    bioKeywords: parseKeywords(elements.bioKeywords.value),
    bioBlocklist: parseKeywords(elements.bioBlocklist.value),
  };

  chrome.storage.local.set({ settings, filters }, () => {
    showToast('Settings saved!');
  });
}

async function sendMessageToTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      showToast('Open Tinder/Bumble first!');
      return false;
    }

    const isTinder = tab.url.includes('tinder.com');
    const isBumble = tab.url.includes('bumble.com');

    if (!isTinder && !isBumble) {
      showToast('Open Tinder/Bumble first!');
      return false;
    }

    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch (error) {
    console.log('Message error:', error);
    showToast('Reload the page');
    return false;
  }
}

// Event Listeners - Sliders
elements.delayTime.addEventListener('input', () => {
  elements.delayValue.textContent = `${elements.delayTime.value}s`;
  updateSliderBackground(elements.delayTime);
  autoSaveSettings();
});

elements.swipeRatio.addEventListener('input', () => {
  elements.ratioValue.textContent = `${elements.swipeRatio.value}%`;
  updateSliderBackground(elements.swipeRatio);
  autoSaveSettings();
});

// Event Listeners - Toggles
elements.autoLike.addEventListener('change', autoSaveSettings);
elements.autoDislike.addEventListener('change', autoSaveSettings);

elements.delayRandomization.addEventListener('change', () => {
  elements.delayRangeRow.style.display = elements.delayRandomization.checked ? 'flex' : 'none';
  autoSaveSettings();
});

elements.antiDetection.addEventListener('change', autoSaveSettings);

elements.speedMode.addEventListener('change', () => {
  elements.speedModeWarning.style.display = elements.speedMode.checked ? 'flex' : 'none';
  autoSaveSettings();
});

elements.filtersEnabled.addEventListener('change', () => {
  elements.filtersContent.style.display = elements.filtersEnabled.checked ? 'block' : 'none';
  autoSaveSettings();
});

elements.breakInterval.addEventListener('change', () => {
  const val = parseInt(elements.breakInterval.value, 10) || 0;
  elements.breakDurationRow.style.display = val > 0 ? 'flex' : 'none';
  autoSaveSettings();
});

elements.sessionGapInterval.addEventListener('change', () => {
  const val = parseInt(elements.sessionGapInterval.value, 10) || 0;
  elements.sessionGapRow.style.display = val > 0 ? 'flex' : 'none';
  autoSaveSettings();
});

// Event Listeners - Number inputs with debounce
let saveTimeout;
function autoSaveSettings() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveSettings, 500);
}

// Apply debounced save to all filter inputs
[elements.ageMin, elements.ageMax, elements.maxDistance, elements.minPhotos,
 elements.swipeLimit, elements.dailyLimit, elements.breakInterval, elements.breakDuration,
 elements.sessionGapInterval, elements.sessionGapMin, elements.sessionGapMax,
 elements.delayMin, elements.delayMax, elements.bioKeywords, elements.bioBlocklist,
 elements.requireBio, elements.verifiedOnly].forEach(el => {
  if (el) el.addEventListener('change', autoSaveSettings);
  if (el && (el.type === 'text' || el.type === 'number')) {
    el.addEventListener('input', autoSaveSettings);
  }
});

// Event Listeners - Buttons
elements.playBtn.addEventListener('click', async () => {
  if (!elements.autoLike.checked && !elements.autoDislike.checked) {
    showToast('Enable an option first!');
    return;
  }

  // Save current settings first
  saveSettings();

  // Start on current tab - session will be created by content script
  const success = await sendMessageToTab({ action: 'start' });
  if (success) {
    showView(true);
  }
});

elements.stopBtn.addEventListener('click', async () => {
  // Stop all active sessions
  const data = await chrome.storage.local.get(['sessions']);
  const sessions = data.sessions || {};
  const activeTabIds = Object.keys(sessions).filter(id => sessions[id].isRunning);

  for (const tabIdStr of activeTabIds) {
    try {
      await chrome.tabs.sendMessage(parseInt(tabIdStr), { action: 'stop' });
    } catch (e) {
      // Tab might be closed, clean up session
      delete sessions[tabIdStr];
    }
  }

  await chrome.storage.local.set({ sessions });
  showView(false);
});

elements.pauseBtn.addEventListener('click', async () => {
  // Toggle pause on all active sessions
  const data = await chrome.storage.local.get(['sessions']);
  const sessions = data.sessions || {};
  const activeSessions = Object.values(sessions).filter(s => s.isRunning);

  if (activeSessions.length === 0) return;

  // Check if any are paused
  const anyPaused = activeSessions.some(s => s.isPaused);
  const action = anyPaused ? 'resume' : 'pause';

  for (const session of activeSessions) {
    try {
      await chrome.tabs.sendMessage(session.tabId, { action });
    } catch (e) {
      // Tab might be closed
    }
  }
});

elements.matchBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || {};
  stats.matchCount = (stats.matchCount || 0) + 1;
  await chrome.storage.local.set({ stats });
  elements.matchCount.textContent = stats.matchCount;
  showToast('Match logged!');
});

elements.resetBtn.addEventListener('click', () => {
  if (confirm('Reset all statistics?')) {
    const freshStats = {
      totalLikes: 0,
      totalDislikes: 0,
      sessionsCount: 0,
      matchCount: 0,
      todayLikes: 0,
      todayDislikes: 0,
      todayDate: '',
      streakDays: 0,
      lastActiveDate: '',
    };
    const freshHistory = { swipes: [], sessions: [] };

    chrome.storage.local.set({ stats: freshStats, history: freshHistory }, () => {
      elements.todayLikes.textContent = '0';
      elements.todayDislikes.textContent = '0';
      elements.streakDays.textContent = '0';
      showToast('Stats reset!');
    });
  }
});

elements.dashboardBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'dashboard.html' });
});

// Live stats update
setInterval(() => {
  chrome.storage.local.get(['sessions', 'stats', 'history'], (data) => {
    const sessions = data.sessions || {};
    const stats = data.stats || {};
    const history = data.history || { swipes: [] };
    const activeSessions = Object.values(sessions).filter(s => s.isRunning);

    // Update quick stats on settings view
    elements.todayLikes.textContent = stats.todayLikes || 0;
    elements.todayDislikes.textContent = stats.todayDislikes || 0;
    elements.streakDays.textContent = stats.streakDays || 0;

    // Update running view if any sessions active
    if (activeSessions.length > 0) {
      if (elements.runningView.style.display === 'none') {
        showView(true);
      }
      updateRunningStats(activeSessions, stats, history);
    } else if (elements.runningView.style.display !== 'none') {
      showView(false);
    }
  });
}, 500);

// Site detection
async function detectSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      if (tab.url.includes('tinder.com')) {
        updateSiteIndicator('Tinder');
      } else if (tab.url.includes('bumble.com')) {
        updateSiteIndicator('Bumble');
      } else {
        updateSiteIndicator('No site');
      }
    }
  } catch (e) {
    updateSiteIndicator('Idle');
  }
}

function updateSiteIndicator(site) {
  if (elements.siteIndicator) elements.siteIndicator.textContent = site;
  if (elements.siteIndicatorRunning) elements.siteIndicatorRunning.textContent = site;
}

// Tab Navigation
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      // Update button states
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel visibility
      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `tab-${targetTab}`) {
          panel.classList.add('active');
        }
      });

      // Save active tab preference
      chrome.storage.local.get(['ui'], (data) => {
        const ui = data.ui || {};
        ui.activeTab = targetTab;
        chrome.storage.local.set({ ui });
      });
    });
  });

  // Restore last active tab
  chrome.storage.local.get(['ui'], (data) => {
    const activeTab = data.ui?.activeTab || 'swipe';
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updateSliderBackground(elements.delayTime);
  updateSliderBackground(elements.swipeRatio);
  detectSite();
  initTabs();
});
