const elements = {
  settingsView: document.getElementById('settingsView'),
  runningView: document.getElementById('runningView'),
  autoLike: document.getElementById('autoLike'),
  autoDislike: document.getElementById('autoDislike'),
  delayTime: document.getElementById('delayTime'),
  delayValue: document.getElementById('delayValue'),
  playBtn: document.getElementById('playBtn'),
  stopBtn: document.getElementById('stopBtn'),
  saveBtn: document.getElementById('saveBtn'),
  resetBtn: document.getElementById('resetBtn'),
  toast: document.getElementById('toast'),
  leftCount: document.getElementById('leftCount'),
  leftPercent: document.getElementById('leftPercent'),
  rightCount: document.getElementById('rightCount'),
  totalCount: document.getElementById('totalCount'),
  lastName: document.getElementById('lastName'),
  lastAge: document.getElementById('lastAge'),
  lastDistance: document.getElementById('lastDistance'),
  lastAction: document.getElementById('lastAction'),
  lastActionPill: document.getElementById('lastActionPill'),
  siteIndicator: document.getElementById('siteIndicator'),
  siteIndicatorRunning: document.getElementById('siteIndicatorRunning')
};

function updateSliderBackground(slider) {
  const min = slider.min || 0;
  const max = slider.max || 100;
  const value = ((slider.value - min) / (max - min)) * 100;
  slider.style.setProperty('--value', `${value}%`);
}

function showView(isRunning) {
  if (isRunning) {
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

function updateStats(data) {
  const likes = data.likeCount || 0;
  const dislikes = data.dislikeCount || 0;
  const total = likes + dislikes;
  const leftPct = total > 0 ? Math.round((dislikes / total) * 100) : 0;

  elements.leftCount.textContent = dislikes;
  elements.leftPercent.textContent = `${leftPct}%`;
  elements.rightCount.textContent = likes;
  elements.totalCount.textContent = total;

  if (data.lastSwipe) {
    elements.lastName.textContent = data.lastSwipe.name || '-';
    elements.lastAge.textContent = data.lastSwipe.age || '-';
    elements.lastDistance.textContent = data.lastSwipe.distance || '-';

    if (data.lastSwipe.action === 'like') {
      elements.lastAction.textContent = 'LIKED';
      elements.lastActionPill.className = 'info-pill action liked';
    } else {
      elements.lastAction.textContent = 'PASSED';
      elements.lastActionPill.className = 'info-pill action passed';
    }
  }
}

function loadSettings() {
  chrome.storage.local.get([
    'autoLike', 'autoDislike', 'delayTime', 'isRunning',
    'likeCount', 'dislikeCount', 'lastSwipe'
  ], (result) => {
    if (result.autoLike !== undefined) elements.autoLike.checked = result.autoLike;
    if (result.autoDislike !== undefined) elements.autoDislike.checked = result.autoDislike;
    if (result.delayTime !== undefined) {
      elements.delayTime.value = result.delayTime;
      elements.delayValue.textContent = `${result.delayTime}s`;
      updateSliderBackground(elements.delayTime);
    }

    showView(result.isRunning || false);
    updateStats(result);
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

// Event Listeners
elements.delayTime.addEventListener('input', () => {
  elements.delayValue.textContent = `${elements.delayTime.value}s`;
  updateSliderBackground(elements.delayTime);
});

elements.saveBtn.addEventListener('click', () => {
  const settings = {
    autoLike: elements.autoLike.checked,
    autoDislike: elements.autoDislike.checked,
    delayTime: elements.delayTime.value
  };
  chrome.storage.local.set(settings, () => showToast('Saved!'));
});

elements.resetBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    likeCount: 0,
    dislikeCount: 0,
    totalCount: 0,
    lastSwipe: null
  }, () => showToast('Stats reset!'));
});

elements.playBtn.addEventListener('click', async () => {
  if (!elements.autoLike.checked && !elements.autoDislike.checked) {
    showToast('Enable an option first!');
    return;
  }

  const settings = {
    autoLike: elements.autoLike.checked,
    autoDislike: elements.autoDislike.checked,
    delayTime: elements.delayTime.value,
    isRunning: true
  };
  await chrome.storage.local.set(settings);

  const success = await sendMessageToTab({ action: 'start' });
  if (success) {
    showView(true);
  } else {
    await chrome.storage.local.set({ isRunning: false });
  }
});

elements.stopBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ isRunning: false });
  await sendMessageToTab({ action: 'stop' });
  showView(false);
});

// Auto-save toggles
elements.autoLike.addEventListener('change', () => {
  chrome.storage.local.set({ autoLike: elements.autoLike.checked });
});

elements.autoDislike.addEventListener('change', () => {
  chrome.storage.local.set({ autoDislike: elements.autoDislike.checked });
});

// Live update stats
setInterval(() => {
  chrome.storage.local.get(['likeCount', 'dislikeCount', 'lastSwipe', 'isRunning'], (result) => {
    updateStats(result);
    if (result.isRunning === false && elements.runningView.style.display !== 'none') {
      showView(false);
    }
  });
}, 500);

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
    updateSiteIndicator('-');
  }
}

function updateSiteIndicator(site) {
  if (elements.siteIndicator) elements.siteIndicator.textContent = site;
  if (elements.siteIndicatorRunning) elements.siteIndicatorRunning.textContent = site;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updateSliderBackground(elements.delayTime);
  detectSite();
});
