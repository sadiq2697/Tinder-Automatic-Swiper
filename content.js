let isRunning = false;
let swipeInterval = null;

function log(msg) {
  console.log(`[AutoSwiper] ${msg}`);
}

function getSite() {
  const url = window.location.hostname;
  if (url.includes('tinder')) return 'tinder';
  if (url.includes('bumble')) return 'bumble';
  return 'unknown';
}

function getProfileInfo() {
  const site = getSite();
  const info = { name: 'Unknown', age: '?', distance: '?' };

  if (site === 'tinder') {
    // Tinder profile scraping
    const nameSelectors = ['[itemprop="name"]', 'h1', 'span[class*="Typs"]'];
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

    const distEl = Array.from(document.querySelectorAll('span')).find(el =>
      el.textContent.includes('kilometre') || el.textContent.includes('mile')
    );
    if (distEl) {
      const m = distEl.textContent.match(/(\d+)/);
      if (m) info.distance = m[1] + 'km';
    }
  } else if (site === 'bumble') {
    // Bumble profile scraping
    const nameEl = document.querySelector('[class*="encounters-story-profile__name"]')
      || document.querySelector('[data-qa-role="encounters-story-profile-name"]')
      || document.querySelector('.encounters-story-profile__name');

    if (nameEl) {
      const text = nameEl.textContent.trim();
      const match = text.match(/^(.+?),?\s*(\d{2})?$/);
      if (match) {
        info.name = match[1];
        if (match[2]) info.age = match[2];
      }
    }

    // Age might be separate on Bumble
    const ageEl = document.querySelector('[class*="encounters-story-profile__age"]')
      || document.querySelector('[data-qa-role="encounters-story-profile-age"]');
    if (ageEl) {
      const m = ageEl.textContent.match(/(\d+)/);
      if (m) info.age = m[1];
    }

    // Distance
    const distEl = document.querySelector('[class*="location"]')
      || Array.from(document.querySelectorAll('span')).find(el =>
        el.textContent.includes('km') || el.textContent.includes('mile')
      );
    if (distEl) {
      const m = distEl.textContent.match(/(\d+)/);
      if (m) info.distance = m[1] + 'km';
    }
  }

  return info;
}

async function triggerClick(element, direction) {
  if (!element) return false;

  const site = getSite();

  if (site === 'bumble') {
    // Use Chrome debugger API for Bumble (sends trusted clicks)
    const rect = element.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);

    log(`[BUMBLE] Sending debugger click at (${x}, ${y})`);

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'debuggerClick',
        x: x,
        y: y
      });

      if (response && response.success) {
        log(`[BUMBLE] Debugger click successful`);
        return true;
      } else {
        log(`[BUMBLE] Debugger click failed: ${response?.error}`);
        // Fallback to regular click
        element.click();
      }
    } catch (err) {
      log(`[BUMBLE] Debugger error: ${err.message}`);
      element.click();
    }

  } else {
    // Tinder - simple click works
    element.click();
  }

  return true;
}

function findProfileCard() {
  const site = getSite();

  if (site === 'tinder') {
    const cardSelectors = [
      '[class*="recsCardboard"]',
      '[class*="Expand"][class*="Pos(r)"]',
      'div[class*="keen-slider"]',
      'article'
    ];
    for (const sel of cardSelectors) {
      const card = document.querySelector(sel);
      if (card && card.offsetHeight > 300) return card;
    }
  } else if (site === 'bumble') {
    const cardSelectors = [
      '[class*="encounters-story"]',
      '[data-qa-role="encounters-story"]',
      '.encounters-story',
      '[class*="encounters-card"]'
    ];
    for (const sel of cardSelectors) {
      const card = document.querySelector(sel);
      if (card && card.offsetHeight > 200) return card;
    }
  }

  return null;
}

function findActionButtons() {
  const site = getSite();
  const buttons = Array.from(document.querySelectorAll('button'));

  if (site === 'tinder') {
    // Tinder: circular buttons at bottom
    const actionBtns = buttons.filter(btn => {
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.top < window.innerHeight * 0.5) return false;
      if (rect.width < 40 || rect.width > 100) return false;
      const ratio = rect.width / rect.height;
      return ratio > 0.8 && ratio < 1.2;
    });
    actionBtns.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return { buttons: actionBtns, likeIndex: 3, dislikeIndex: 1 };
  } else if (site === 'bumble') {
    // Bumble: buttons can be divs or spans, not just button elements
    // Look for action buttons by multiple methods

    // Method 1: Look for elements with specific test IDs or classes
    const allElements = document.querySelectorAll('div, span, button');

    let likeBtn = null;
    let dislikeBtn = null;

    // Find by aria-label or title
    for (const el of allElements) {
      const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
      const title = el.getAttribute('title')?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';

      if ((aria.includes('like') || title.includes('like') || className.includes('vote-yes'))
          && !aria.includes('super') && !title.includes('super')) {
        if (!likeBtn && el.offsetWidth > 30) likeBtn = el;
      }
      if (aria.includes('pass') || aria.includes('dislike') || aria.includes('nope')
          || title.includes('pass') || className.includes('vote-no')) {
        if (!dislikeBtn && el.offsetWidth > 30) dislikeBtn = el;
      }
    }

    // Method 2: Find circular buttons at bottom by position (X, Star, Check layout)
    const bottomElements = Array.from(document.querySelectorAll('div, span, button')).filter(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.width < 50 || rect.width > 150) return false;
      if (rect.top < window.innerHeight * 0.7) return false;
      // Check if roughly circular
      const ratio = rect.width / rect.height;
      if (ratio < 0.7 || ratio > 1.3) return false;
      // Check if clickable (has cursor pointer or is button-like)
      const style = window.getComputedStyle(el);
      return style.cursor === 'pointer' || el.tagName === 'BUTTON' || el.onclick;
    });

    bottomElements.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    log(`[BUMBLE] Found ${bottomElements.length} bottom action elements`);

    // Layout is typically: [Pass/X, SuperSwipe/Star, Like/Check]
    if (bottomElements.length >= 3) {
      dislikeBtn = dislikeBtn || bottomElements[0];
      likeBtn = likeBtn || bottomElements[2]; // Rightmost is Like
    } else if (bottomElements.length >= 2) {
      dislikeBtn = dislikeBtn || bottomElements[0];
      likeBtn = likeBtn || bottomElements[bottomElements.length - 1];
    }

    if (likeBtn || dislikeBtn) {
      log(`[BUMBLE] Like btn: ${likeBtn?.className?.slice(0, 50)}, Dislike btn: ${dislikeBtn?.className?.slice(0, 50)}`);
      return {
        buttons: [dislikeBtn, likeBtn].filter(Boolean),
        likeBtn,
        dislikeBtn,
        site: 'bumble'
      };
    }

    return { buttons: [], likeIndex: -1, dislikeIndex: -1 };
  }

  return { buttons: [], likeIndex: -1, dislikeIndex: -1 };
}

async function swipe(direction) {
  const site = getSite();
  const card = findProfileCard();

  if (!card) {
    log(`[WARN] No profile card found on ${site}`);
    return false;
  }

  const actionData = findActionButtons();
  log(`[${site.toUpperCase()}] Found ${actionData.buttons?.length || 0} action buttons`);

  // Bumble specific handling
  if (actionData.site === 'bumble') {
    if (direction === 'right' && actionData.likeBtn) {
      log(`DECISION: Swiping RIGHT on Bumble`);
      await triggerClick(actionData.likeBtn, direction);
      return true;
    } else if (direction === 'left' && actionData.dislikeBtn) {
      log(`DECISION: Swiping LEFT on Bumble`);
      await triggerClick(actionData.dislikeBtn, direction);
      return true;
    }
  }

  // Generic handling (Tinder and fallback)
  const { buttons, likeIndex, dislikeIndex } = actionData;

  if (buttons.length >= 2) {
    const btnIndex = direction === 'right' ? likeIndex : dislikeIndex;
    const btn = buttons[btnIndex];

    if (btn) {
      log(`DECISION: Swiping ${direction.toUpperCase()} on ${site}`);
      await triggerClick(btn, direction);
      return true;
    }
  }

  log(`[WARN] Could not find action button on ${site}`);
  return false;
}

async function updateStats(action, profileInfo) {
  const site = getSite();
  const result = await chrome.storage.local.get(['likeCount', 'dislikeCount']);
  const likeCount = (result.likeCount || 0) + (action === 'like' ? 1 : 0);
  const dislikeCount = (result.dislikeCount || 0) + (action === 'dislike' ? 1 : 0);

  const lastSwipe = {
    action,
    name: profileInfo.name,
    age: profileInfo.age,
    distance: profileInfo.distance,
    site,
    time: Date.now()
  };

  await chrome.storage.local.set({ likeCount, dislikeCount, lastSwipe, currentSite: site });

  log(`Stats: {swipeCount: ${likeCount + dislikeCount}, direction: '${action}', site: '${site}', profile: {name: '${profileInfo.name}'}}`);
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

  const site = getSite();
  const card = findProfileCard();

  if (!card) {
    log(`[WARN] No profile card found on ${site}, skipping`);
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

  log(`[${site.toUpperCase()}] Processing: {profileName: '${profileInfo.name}', age: ${profileInfo.age}}`);

  const success = await swipe(direction);

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

  const site = getSite();
  log(`[INFO] Starting auto swiper on ${site}`);
  isRunning = true;
  chrome.storage.local.set({ isRunning: true, currentSite: site });

  // Debug info
  const actionData = findActionButtons();
  log(`[INFO] Found ${actionData.buttons?.length || 0} action buttons`);

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
  else if (msg.action === 'getSite') respond({ site: getSite() });
  respond({ ok: true });
  return true;
});

log(`[INFO] Content script ready on ${getSite()}`);
