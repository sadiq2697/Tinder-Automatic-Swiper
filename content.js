let isRunning = false;
let swipeInterval = null;

function log(msg) {
  console.log(`[AutoSwiper] ${msg}`);
}

function getProfileInfo() {
  const info = { name: 'Unknown', age: '?', distance: '?' };

  // Look for name element
  const nameSelectors = [
    '[itemprop="name"]',
    'h1',
    'span[class*="Typs"]'
  ];

  for (const selector of nameSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      const text = el.textContent.trim();
      const match = text.match(/^(.+?)\s*(\d{2})$/);
      if (match) {
        info.name = match[1];
        info.age = match[2];
        break;
      }
    }
  }

  // Distance
  const distEl = Array.from(document.querySelectorAll('span')).find(el =>
    el.textContent.includes('kilometre') || el.textContent.includes('mile')
  );
  if (distEl) {
    const m = distEl.textContent.match(/(\d+)/);
    if (m) info.distance = m[1] + 'km';
  }

  return info;
}

// Trigger click event
function triggerClick(element) {
  if (!element) return false;
  element.click();
  return true;
}

function findProfileCard() {
  // Look for the main card container
  const cardSelectors = [
    '[class*="recsCardboard"]',
    '[class*="Expand"][class*="Pos(r)"]',
    'div[class*="keen-slider"]',
    'article'
  ];

  for (const sel of cardSelectors) {
    const card = document.querySelector(sel);
    if (card && card.offsetHeight > 300) {
      return card;
    }
  }
  return null;
}

function findActionButtons() {
  const buttons = Array.from(document.querySelectorAll('button'));

  // Filter for action buttons (circular, bottom of screen)
  const actionBtns = buttons.filter(btn => {
    const rect = btn.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.top < window.innerHeight * 0.5) return false;
    if (rect.width < 40 || rect.width > 100) return false;

    // Check if it's roughly square/circular
    const ratio = rect.width / rect.height;
    return ratio > 0.8 && ratio < 1.2;
  });

  actionBtns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

  return actionBtns;
}

function swipe(direction) {
  const card = findProfileCard();
  if (!card) {
    log('[WARN] No profile card found');
    return false;
  }

  const actionBtns = findActionButtons();
  log(`Found ${actionBtns.length} action buttons`);

  if (actionBtns.length >= 4) {
    // Layout: [Rewind(0), Nope(1), SuperLike(2), Like(3), Boost(4)]
    const btnIndex = direction === 'right' ? 3 : 1;
    const btn = actionBtns[btnIndex];

    if (btn) {
      log(`DECISION: Swiping ${direction.toUpperCase()}`);
      triggerClick(btn);
      log(`Swipe #${direction} executed`);
      return true;
    }
  } else if (actionBtns.length >= 2) {
    const btn = direction === 'right' ? actionBtns[actionBtns.length - 2] : actionBtns[1];
    if (btn) {
      triggerClick(btn);
      return true;
    }
  }

  log('[WARN] Could not find action button');
  return false;
}

async function updateStats(action, profileInfo) {
  const result = await chrome.storage.local.get(['likeCount', 'dislikeCount']);
  const likeCount = (result.likeCount || 0) + (action === 'like' ? 1 : 0);
  const dislikeCount = (result.dislikeCount || 0) + (action === 'dislike' ? 1 : 0);

  const lastSwipe = {
    action,
    name: profileInfo.name,
    age: profileInfo.age,
    distance: profileInfo.distance,
    time: Date.now()
  };

  await chrome.storage.local.set({ likeCount, dislikeCount, lastSwipe });

  log(`Stats: {swipeCount: ${likeCount + dislikeCount}, direction: '${action}', profile: {name: '${profileInfo.name}'}}`);
}

async function doSwipe() {
  if (!isRunning) return;

  let settings;
  try {
    settings = await new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error("Context invalidated"));
        return;
      }
      chrome.storage.local.get(["autoLike", "autoDislike", "delayTime"], resolve);
    });
  } catch (e) {
    log("Context lost, stopping");
    stopSwiper();
    return;
  }

  const { autoLike, autoDislike, delayTime } = settings;
  if (!autoLike && !autoDislike) return;

  // Check if card exists
  const card = findProfileCard();
  if (!card) {
    log('[WARN] No profile card found, skipping');
    scheduleNext(delayTime);
    return;
  }

  const profileInfo = getProfileInfo();
  let direction;

  if (autoLike && autoDislike) {
    direction = Math.random() < 0.5 ? 'right' : 'left';
  } else if (autoLike) {
    direction = 'right';
  } else {
    direction = 'left';
  }

  log(`Processing: {profileName: '${profileInfo.name}', age: ${profileInfo.age}}`);

  const success = swipe(direction);

  if (success) {
    await updateStats(direction === 'right' ? 'like' : 'dislike', profileInfo);
  }

  scheduleNext(delayTime);
}

function scheduleNext(delayTime) {
  const delay = parseInt(delayTime, 10) * 1000 || 1000;
  if (isRunning) {
    swipeInterval = setTimeout(doSwipe, delay);
  }
}

function startSwiper() {
  if (isRunning) return;

  log('[INFO] Starting auto swiper');
  isRunning = true;
  chrome.storage.local.set({ isRunning: true });

  // Debug info
  const btns = findActionButtons();
  log(`[INFO] Found ${btns.length} action buttons`);
  btns.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    log(`  Button ${i}: x=${Math.round(r.left)}, size=${Math.round(r.width)}x${Math.round(r.height)}`);
  });

  doSwipe();
}

function stopSwiper() {
  log('[INFO] Stopping auto swiper');
  isRunning = false;
  if (swipeInterval) {
    clearTimeout(swipeInterval);
    swipeInterval = null;
  }
  chrome.storage.local.set({ isRunning: false });
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  log(`[INFO] Message: ${msg.action}`);
  if (msg.action === 'start') startSwiper();
  else if (msg.action === 'stop') stopSwiper();
  respond({ ok: true });
  return true;
});

log('[INFO] Content script ready');
