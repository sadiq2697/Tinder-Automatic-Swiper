// Auto Swiper Content Script v3.2
// Multi-tab support with per-tab sessions
// Includes anti-detection features

let isRunning = false;
let isPaused = false;
let swipeInterval = null;
let matchObserver = null;
let sessionGapTimeout = null;
let breakTimeout = null;
let totalSwipesBeforeGap = 0;
let isSwipeInProgress = false;
let tabId = null;
let currentSpeedMode = false;

// Single-owner loop guard. Every (re)start/resume bumps runToken; a doSwipe
// chain captures the token it was launched with and must still own it after
// each await, otherwise it is a stale loop (from a duplicate start, an
// overlapping resume, etc.) and exits before counting. This guarantees
// exactly one increment per swipe and fixes the 2x/4x double-counting bug.
let runToken = 0;

// Signature of the last profile we actually counted. Guards against counting
// the same card twice when the DOM has not yet advanced to the next profile
// (a fast-mode hazard that double-counts and shows stale data).
let lastCountedSignature = null;

function log(msg) {
  console.log(`[AutoSwiper:${tabId || '?'}] ${msg}`);
}

// True while this content script still has a live connection to the
// extension. After the extension is reloaded/updated/disabled, the injected
// script keeps running but chrome.runtime.id becomes undefined; any chrome.*
// call then throws "Extension context invalidated".
function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

// Stop the loop locally when the context is gone. Must NOT make any chrome.*
// calls (they would throw again). Just halt timers and flags so the orphaned
// script goes quiet until the page is reloaded.
function handleContextLost() {
  isRunning = false;
  isPaused = false;
  isSwipeInProgress = false;
  runToken++;
  if (swipeInterval) { clearTimeout(swipeInterval); swipeInterval = null; }
  if (sessionGapTimeout) { clearTimeout(sessionGapTimeout); sessionGapTimeout = null; }
  if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
  if (matchObserver) { try { matchObserver.disconnect(); } catch (e) {} matchObserver = null; }
  console.log('[AutoSwiper] Extension context invalidated; stopped. Reload the tab to continue.');
}

// Get this tab's session from storage
async function getTabSession() {
  if (!isExtensionContextValid()) return null;
  try {
    const data = await chrome.storage.local.get(['sessions']);
    const sessions = (data && data.sessions) || {};
    return sessions[tabId] || null;
  } catch (e) {
    return null;
  }
}

// Update this tab's session in storage
async function updateTabSession(updates) {
  if (!isExtensionContextValid()) return null;
  let data;
  try {
    data = await chrome.storage.local.get(['sessions']);
  } catch (e) {
    return null;
  }
  data = data || {};
  const sessions = data.sessions || {};

  if (!sessions[tabId]) {
    sessions[tabId] = {
      tabId: tabId,
      isRunning: false,
      isPaused: false,
      site: getSite(),
      sessionLikes: 0,
      sessionDislikes: 0,
      sessionStart: 0,
      swipesSinceBreak: 0,
    };
  }

  Object.assign(sessions[tabId], updates);
  try {
    await chrome.storage.local.set({ sessions });
  } catch (e) {
    return null;
  }
  return sessions[tabId];
}

// ============================================
// ANTI-DETECTION: Match Detection
// ============================================
function setupMatchDetection() {
  if (matchObserver) return;

  const site = getSite();
  log('[MATCH] Setting up match detection');

  matchObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          checkForMatch(node, site);
        }
      }
    }
  });

  matchObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function checkForMatch(element, site) {
  const text = element.textContent?.toLowerCase() || '';
  const className = element.className?.toLowerCase() || '';

  // Tinder match indicators
  const tinderMatchIndicators = [
    'it\'s a match',
    'you matched',
    'new match',
    'matchview',
    'match-chat',
  ];

  // Bumble match indicators
  const bumbleMatchIndicators = [
    'you matched',
    'it\'s a match',
    'boom',
    'new connection',
  ];

  const indicators = site === 'tinder' ? tinderMatchIndicators : bumbleMatchIndicators;

  for (const indicator of indicators) {
    if (text.includes(indicator) || className.includes(indicator.replace(/\s/g, ''))) {
      log('[MATCH] Match detected!');
      logMatchAutomatically();
      return;
    }
  }
}

async function logMatchAutomatically() {
  try {
    const data = await chrome.storage.local.get(['stats']);
    const stats = data.stats || {};
    stats.matchCount = (stats.matchCount || 0) + 1;
    await chrome.storage.local.set({ stats });
    log(`[MATCH] Auto-logged match #${stats.matchCount}`);

    chrome.runtime.sendMessage({
      action: 'notify',
      title: 'New Match!',
      message: `You got a match! Total: ${stats.matchCount}`,
    });
  } catch (e) {
    log(`[MATCH] Failed to log match: ${e.message}`);
  }
}

// ============================================
// ANTI-DETECTION: Mouse Movement Simulation
// ============================================
function simulateMouseMovement(targetX, targetY) {
  return new Promise((resolve) => {
    const startX = Math.random() * window.innerWidth;
    const startY = Math.random() * window.innerHeight;
    const steps = 5 + Math.floor(Math.random() * 5); // 5-10 steps
    const duration = 200 + Math.random() * 300; // 200-500ms total

    let step = 0;
    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      // Use easing for natural movement
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentX = startX + (targetX - startX) * eased;
      const currentY = startY + (targetY - startY) * eased;

      // Dispatch mousemove event
      const event = new MouseEvent('mousemove', {
        clientX: currentX,
        clientY: currentY,
        bubbles: true,
      });
      document.dispatchEvent(event);

      if (step >= steps) {
        clearInterval(interval);
        resolve();
      }
    }, duration / steps);
  });
}

// ============================================
// ANTI-DETECTION: Scroll Through Photos
// ============================================
async function scrollThroughPhotos() {
  const site = getSite();
  let photoCount = 0;

  if (site === 'tinder') {
    // Find photo indicators
    const indicators = document.querySelectorAll('[class*="bullet"]');
    photoCount = indicators.length;

    if (photoCount > 1 && Math.random() < 0.4) { // 40% chance to scroll photos
      const scrolls = Math.min(photoCount - 1, 1 + Math.floor(Math.random() * 3)); // 1-3 scrolls
      log(`[HUMAN] Scrolling through ${scrolls} photos`);

      for (let i = 0; i < scrolls; i++) {
        // Click next photo or swipe right on card
        const card = findProfileCard();
        if (card) {
          // Simulate click on right side of card to advance photo
          const rect = card.getBoundingClientRect();
          const clickX = rect.right - 50;
          const clickY = rect.top + rect.height / 2;

          await simulateMouseMovement(clickX, clickY);

          const clickEvent = new MouseEvent('click', {
            clientX: clickX,
            clientY: clickY,
            bubbles: true,
          });
          card.dispatchEvent(clickEvent);

          await sleep(500 + Math.random() * 1000); // Wait between photo views
        }
      }
    }
  } else if (site === 'bumble') {
    // Bumble photo navigation
    const photoNav = document.querySelectorAll('[class*="encounters-album__bullet"]');
    photoCount = photoNav.length;

    if (photoCount > 1 && Math.random() < 0.35) {
      const scrolls = Math.min(photoCount - 1, 1 + Math.floor(Math.random() * 2));
      log(`[HUMAN] Scrolling through ${scrolls} Bumble photos`);

      for (let i = 0; i < scrolls; i++) {
        const nextBtn = document.querySelector('[class*="encounters-album__next"]');
        if (nextBtn) {
          nextBtn.click();
          await sleep(600 + Math.random() * 800);
        }
      }
    }
  }

  return photoCount;
}

// ============================================
// ANTI-DETECTION: Profile View Time
// ============================================
function getProfileViewTime(profileInfo) {
  let baseTime = 500; // Base 0.5s

  // Longer view time for profiles with more content
  if (profileInfo.hasBio) {
    baseTime += 800 + Math.random() * 1500; // +0.8-2.3s for bio
  }

  if (profileInfo.photoCount > 1) {
    baseTime += profileInfo.photoCount * 200; // +0.2s per photo
  }

  if (profileInfo.isVerified) {
    baseTime += 300; // Slightly longer for verified
  }

  // Random variance
  baseTime += Math.random() * 1000;

  // Occasionally spend extra time (as if reading carefully)
  if (Math.random() < 0.15) {
    baseTime += 2000 + Math.random() * 3000; // +2-5s extra
    log('[HUMAN] Taking extra time to view profile');
  }

  return baseTime;
}

// ============================================
// ANTI-DETECTION: Session Gaps
// ============================================
async function checkSessionGap(settings) {
  const gapInterval = settings.sessionGapInterval || 0;
  const gapMinDuration = settings.sessionGapMin || 30;
  const gapMaxDuration = settings.sessionGapMax || 60;

  if (gapInterval <= 0) return false;

  totalSwipesBeforeGap++;

  if (totalSwipesBeforeGap >= gapInterval) {
    const gapDuration = gapMinDuration + Math.random() * (gapMaxDuration - gapMinDuration);
    const gapMs = gapDuration * 60 * 1000;

    log(`[SESSION GAP] Taking ${gapDuration.toFixed(0)} minute break after ${totalSwipesBeforeGap} swipes`);

    chrome.runtime.sendMessage({
      action: 'notify',
      title: 'Session Gap',
      message: `Taking a ${gapDuration.toFixed(0)} minute break. Will resume automatically.`,
    });

    isPaused = true;
    await updateTabSession({ isPaused: true, inSessionGap: true });

    sessionGapTimeout = setTimeout(async () => {
      log('[SESSION GAP] Resuming after gap');
      totalSwipesBeforeGap = 0;
      isPaused = false;

      await updateTabSession({ isPaused: false, inSessionGap: false });

      if (isRunning) {
        chrome.runtime.sendMessage({
          action: 'notify',
          title: 'Resuming',
          message: 'Session gap complete. Resuming swiping.',
        });
        // New authoritative run after the gap; supersede any lingering loop.
        runToken++;
        doSwipe(runToken);
      }
    }, gapMs);

    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSite() {
  const url = window.location.hostname;
  if (url.includes('tinder')) return 'tinder';
  if (url.includes('bumble')) return 'bumble';
  return 'unknown';
}

// Wait until the next profile card has actually rendered before scraping it.
// In fast/speed mode there is no settle delay, so getProfileInfo can run
// before the DOM swaps in the new card, producing "Unknown / ? / ?". This
// polls briefly (capped) for a scrapeable name and returns as soon as the
// card is ready, so slow mode is unaffected and fast mode stops misreading.
async function waitForProfileReady(maxWaitMs = 1200, stepMs = 60) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const info = getProfileInfo();
    if (info.name && info.name !== 'Unknown') return info;
    await sleep(stepMs);
  }
  // Timed out: return whatever we can read (may still be partial).
  return getProfileInfo();
}

// Enhanced profile info extraction
function getProfileInfo() {
  const site = getSite();
  const info = {
    name: 'Unknown',
    age: '?',
    distance: '?',
    bio: '',
    hasBio: false,
    photoCount: 0,
    isVerified: false,
  };

  if (site === 'tinder') {
    // Scope scraping to the visible recs card when we can find it, so we do
    // not read a hidden, preloaded next card. Fall back to the document.
    const root = findProfileCard() || document;
    const q = (sel) => root.querySelector(sel) || document.querySelector(sel);
    const qa = (sel) => {
      const a = Array.from(root.querySelectorAll(sel));
      return a.length ? a : Array.from(document.querySelectorAll(sel));
    };

    // Name + age. Tinder's heading often renders the name and the age in
    // separate nodes (and may include a verified badge), so the old
    // "name then exactly two digits" regex on a single element missed it.
    // Read the heading text, then pull the trailing age out separately.
    const nameSelectors = [
      '[itemprop="name"]',
      'h1[aria-label]',
      'h1',
      '[class*="Typs(display-1-strong)"]',
      'span[class*="Typs"]',
    ];
    // Use the shared, unit-tested parser; fall back to an inline equivalent
    // if logic.js somehow failed to load, so scraping never throws.
    const parseHeading = (typeof AutoSwiperLogic !== 'undefined' && AutoSwiperLogic.parseTinderHeading)
      ? AutoSwiperLogic.parseTinderHeading
      : (raw) => {
          const text = String(raw || '').replace(/\s+/g, ' ').trim();
          if (!text) return { name: '', age: '?' };
          const m = text.match(/\b(\d{1,3})\b/);
          return { name: text.replace(/\s*\b\d{1,3}\b\s*$/, '').trim(), age: m ? m[1] : '?' };
        };

    for (const selector of nameSelectors) {
      const el = q(selector);
      if (!el) continue;
      // Prefer an explicit aria-label ("Meera 23") when present.
      const raw = (el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '';
      const parsed = parseHeading(raw);
      if (parsed.name) {
        info.name = parsed.name;
        if (parsed.age !== '?') info.age = parsed.age;
        break;
      }
    }

    // If the name selectors did not yield an age, scan for an age node.
    if (info.age === '?') {
      const ageEl = qa('span, div').find((el) => {
        const t = (el.textContent || '').trim();
        return /^\d{1,3}$/.test(t) && Number(t) >= 18 && Number(t) <= 99;
      });
      if (ageEl) info.age = ageEl.textContent.trim();
    }

    // Distance ("10 kilometres away" / "5 miles away").
    const distEl = qa('span, div').find((el) => {
      const t = el.textContent || '';
      return /kilometre|kilometer|\bkm\b|mile/i.test(t) && /\d/.test(t);
    });
    if (distEl) {
      const m = distEl.textContent.match(/(\d+)/);
      if (m) {
        const unit = /mile/i.test(distEl.textContent) ? 'mi' : 'km';
        info.distance = m[1] + unit;
      }
    }

    // Bio detection
    const bioSelectors = [
      '[class*="BreakWord"]',
      '[class*="Fxs(1)"]',
      '.profileCard__bio',
    ];
    for (const selector of bioSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent && el.textContent.length > 10) {
        info.bio = el.textContent.trim();
        info.hasBio = true;
        break;
      }
    }

    // Photo count (count pagination dots or swipe indicators)
    const photoIndicators = document.querySelectorAll('[class*="bullet"]') ||
                           document.querySelectorAll('[class*="indicator"]');
    info.photoCount = Math.max(1, photoIndicators.length);

    // Verified badge
    const verifiedEl = document.querySelector('[class*="verified"]') ||
                      document.querySelector('[title*="verified" i]');
    info.isVerified = !!verifiedEl;

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

    // Bio
    const bioEl = document.querySelector('[class*="encounters-story-about"]')
      || document.querySelector('[data-qa-role="encounters-story-about"]');
    if (bioEl && bioEl.textContent.length > 10) {
      info.bio = bioEl.textContent.trim();
      info.hasBio = true;
    }

    // Photo count
    const photoNav = document.querySelectorAll('[class*="photo-nav"]') ||
                    document.querySelectorAll('[class*="gallery-item"]');
    info.photoCount = Math.max(1, photoNav.length);

    // Verified
    const verifiedEl = document.querySelector('[class*="verified"]') ||
                      document.querySelector('[class*="badge"]');
    info.isVerified = !!verifiedEl;
  }

  return info;
}

// Filter logic - returns { decision: boolean, reason: string } or null for default behavior
function shouldLikeProfile(profile, filters) {
  if (!filters || !filters.enabled) return null;

  // Age filter
  if (profile.age !== '?' && filters.ageMin && filters.ageMax) {
    const age = parseInt(profile.age);
    if (!isNaN(age)) {
      if (age < filters.ageMin) {
        return { decision: false, reason: 'age_too_young' };
      }
      if (age > filters.ageMax) {
        return { decision: false, reason: 'age_too_old' };
      }
    }
  }

  // Distance filter
  if (profile.distance !== '?' && filters.maxDistance > 0) {
    const dist = parseInt(profile.distance);
    if (!isNaN(dist) && dist > filters.maxDistance) {
      return { decision: false, reason: 'too_far' };
    }
  }

  // Bio requirement
  if (filters.requireBio && !profile.hasBio) {
    return { decision: false, reason: 'no_bio' };
  }

  // Photo count
  if (filters.minPhotos > 0 && profile.photoCount < filters.minPhotos) {
    return { decision: false, reason: 'few_photos' };
  }

  // Verified only
  if (filters.verifiedOnly && !profile.isVerified) {
    return { decision: false, reason: 'not_verified' };
  }

  // Bio blocklist keywords
  if (profile.bio && filters.bioBlocklist && filters.bioBlocklist.length > 0) {
    const bioLower = profile.bio.toLowerCase();
    for (const keyword of filters.bioBlocklist) {
      if (keyword && bioLower.includes(keyword.toLowerCase())) {
        return { decision: false, reason: `blocked:${keyword}` };
      }
    }
  }

  // Bio positive keywords
  if (profile.bio && filters.bioKeywords && filters.bioKeywords.length > 0) {
    const bioLower = profile.bio.toLowerCase();
    for (const keyword of filters.bioKeywords) {
      if (keyword && bioLower.includes(keyword.toLowerCase())) {
        return { decision: true, reason: `matched:${keyword}` };
      }
    }
  }

  return null;
}

async function triggerClick(element, direction) {
  if (!element) return false;

  const site = getSite();
  const rect = element.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);

  // Skip mouse simulation in speed mode
  if (!currentSpeedMode) {
    await simulateMouseMovement(x, y);
    await sleep(50 + Math.random() * 150);
  }

  if (site === 'bumble') {
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
        element.click();
      }
    } catch (err) {
      log(`[BUMBLE] Debugger error: ${err.message}`);
      element.click();
    }
  } else {
    // Tinder clicks
    if (currentSpeedMode) {
      // Speed mode - just click
      element.click();
    } else {
      // Normal mode - dispatch proper mouse events for more realism
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(20 + Math.random() * 30);
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      await sleep(30 + Math.random() * 50);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      element.click();
    }
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
    const allElements = document.querySelectorAll('div, span, button');

    let likeBtn = null;
    let dislikeBtn = null;

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

    const bottomElements = Array.from(document.querySelectorAll('div, span, button')).filter(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.width < 50 || rect.width > 150) return false;
      if (rect.top < window.innerHeight * 0.7) return false;
      const ratio = rect.width / rect.height;
      if (ratio < 0.7 || ratio > 1.3) return false;
      const style = window.getComputedStyle(el);
      return style.cursor === 'pointer' || el.tagName === 'BUTTON' || el.onclick;
    });

    bottomElements.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    if (bottomElements.length >= 3) {
      dislikeBtn = dislikeBtn || bottomElements[0];
      likeBtn = likeBtn || bottomElements[2];
    } else if (bottomElements.length >= 2) {
      dislikeBtn = dislikeBtn || bottomElements[0];
      likeBtn = likeBtn || bottomElements[bottomElements.length - 1];
    }

    if (likeBtn || dislikeBtn) {
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

// Human-like delay state
let burstCount = 0;
let burstTarget = 0;
let isInBurst = false;

// Calculate delay with human-like patterns
function getDelay(settings) {
  // SPEED MODE: 260ms
  if (settings.speedMode) {
    return 260;
  }

  if (!settings.delayRandomization) {
    // Fixed delay mode - add small variance to not look robotic
    const base = (settings.delayTime || 3) * 1000;
    const variance = base * 0.15; // +/- 15%
    return base + (Math.random() * variance * 2 - variance);
  }

  const min = settings.delayMin || 2;
  const max = settings.delayMax || 5;

  // Human-like burst pattern:
  // - Swipe 3-15 profiles quickly (0.8-1.5s each)
  // - Then take a longer break (5-12s)
  // - Occasionally take an extra long break (15-25s)

  if (!isInBurst) {
    // Start a new burst
    burstTarget = Math.floor(Math.random() * 13) + 3; // 3 to 15 swipes
    burstCount = 0;
    isInBurst = true;
    log(`[HUMAN] Starting burst of ${burstTarget} swipes`);
  }

  burstCount++;

  if (burstCount < burstTarget) {
    // During burst: fast swipes with slight variation
    // Range: 0.8s to 1.8s (simulates quick decision making)
    const quickDelay = 800 + Math.random() * 1000;

    // Occasionally add micro-hesitation (as if considering the profile)
    if (Math.random() < 0.2) {
      return quickDelay + Math.random() * 500; // Add up to 0.5s hesitation
    }
    return quickDelay;
  }

  // End of burst - take a break
  isInBurst = false;

  // 70% chance: normal break (5-12 seconds)
  // 25% chance: medium break (12-18 seconds)
  // 5% chance: long break (20-35 seconds) - like checking messages or scrolling

  const roll = Math.random();

  if (roll < 0.70) {
    // Normal break
    const breaks = [5, 6, 7, 8, 9, 10, 11, 12];
    const breakTime = breaks[Math.floor(Math.random() * breaks.length)];
    log(`[HUMAN] Normal break: ${breakTime}s`);
    return breakTime * 1000;
  } else if (roll < 0.95) {
    // Medium break
    const breakTime = 12 + Math.random() * 6;
    log(`[HUMAN] Medium break: ${breakTime.toFixed(1)}s`);
    return breakTime * 1000;
  } else {
    // Long break (simulates distraction)
    const breakTime = 20 + Math.random() * 15;
    log(`[HUMAN] Long break: ${breakTime.toFixed(1)}s`);
    return breakTime * 1000;
  }
}

// Decide swipe direction based on settings and filters
function decideDirection(settings, filterResult) {
  // If filter made a decision, use it
  if (filterResult !== null) {
    return filterResult.decision ? 'right' : 'left';
  }

  // Both modes enabled - use ratio
  if (settings.autoLike && settings.autoDislike) {
    const ratio = settings.swipeRatio || 50;
    return Math.random() * 100 < ratio ? 'right' : 'left';
  }

  // Single mode
  if (settings.autoLike) return 'right';
  if (settings.autoDislike) return 'left';

  return 'right';
}

async function doSwipe(token = runToken) {
  if (!isRunning || isPaused) return;

  // Stale-loop guard: a newer start/resume superseded this chain.
  if (token !== runToken) {
    log('[WARN] Stale swipe loop, exiting');
    return;
  }

  // ASYNC MUTEX (synchronous claim, before any await): if a swipe is already
  // executing, drop this invocation entirely. Because this check-and-set runs
  // synchronously, two invocations from ANY source (the main timer, a resume,
  // a stray duplicate timer at fast 1s timing) can never both pass. The lock
  // is held for the WHOLE swipe and released only in the finally below, so it
  // survives every await. This is the core fix for the 2x/4x counting bug.
  if (isSwipeInProgress) {
    log('[WARN] Swipe already in progress, skipping duplicate');
    return;
  }
  isSwipeInProgress = true;

  try {
    await runSwipe(token);
  } finally {
    isSwipeInProgress = false;
  }
}

async function runSwipe(token) {
  // If the extension was reloaded/updated, this content script is orphaned
  // and its chrome.* connection is dead. Bail out cleanly instead of throwing
  // "Extension context invalidated" on the next chrome call.
  if (!isExtensionContextValid()) {
    handleContextLost();
    return;
  }

  let data;
  try {
    data = await new Promise((resolve, reject) => {
      if (!chrome.runtime?.id) {
        reject(new Error("Context invalidated"));
        return;
      }
      chrome.storage.local.get(['settings', 'filters', 'stats'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });
  } catch (e) {
    handleContextLost();
    return;
  }

  // Guard against an undefined result (can happen if the context dies during
  // the storage read), which previously threw at "data.settings".
  data = data || {};
  const settings = data.settings || {};
  const filters = data.filters || {};
  const stats = data.stats || {};
  const session = await getTabSession() || {};

  // Update module-level speed mode for use in triggerClick
  currentSpeedMode = settings.speedMode || false;

  if (!settings.autoLike && !settings.autoDislike) {
    return;
  }

  // Check limits
  const todayTotal = (stats.todayLikes || 0) + (stats.todayDislikes || 0);
  const sessionTotal = (session.sessionLikes || 0) + (session.sessionDislikes || 0);

  if (settings.dailyLimit > 0 && todayTotal >= settings.dailyLimit) {
    log('[LIMIT] Daily limit reached');
    chrome.runtime.sendMessage({ action: 'limitReached', limitType: 'daily' });
    stopSwiper();
    return;
  }

  if (settings.swipeLimit > 0 && sessionTotal >= settings.swipeLimit) {
    log('[LIMIT] Session limit reached');
    chrome.runtime.sendMessage({ action: 'limitReached', limitType: 'session' });
    stopSwiper();
    return;
  }

  // ANTI-DETECTION: Check for session gap (long break every X swipes)
  const gapStarted = await checkSessionGap(settings);
  if (gapStarted) {
    return;
  }

  // Check short break
  if (settings.breakInterval > 0 && (session.swipesSinceBreak || 0) >= settings.breakInterval) {
    log(`[BREAK] Taking ${settings.breakDuration}s break`);
    isPaused = true;

    chrome.runtime.sendMessage({ action: 'breakTime', duration: settings.breakDuration });
    await updateTabSession({ isPaused: true });

    breakTimeout = setTimeout(async () => {
      breakTimeout = null;
      isPaused = false;
      await updateTabSession({ isPaused: false, swipesSinceBreak: 0 });
      // New authoritative run after the break; supersede any lingering loop.
      if (isRunning) {
        runToken++;
        doSwipe(runToken);
      }
    }, (settings.breakDuration || 30) * 1000);

    return;
  }

  const site = getSite();
  const card = findProfileCard();

  if (!card) {
    log(`[WARN] No profile card found on ${site}, skipping`);
    scheduleNext(settings, token);
    return;
  }

  // Wait for the card to render before scraping (fixes "Unknown / ?" in fast
  // mode where scraping otherwise races ahead of the DOM).
  const profileInfo = await waitForProfileReady();

  // Anti-detection behaviors (skip if speed mode OR anti-detection disabled)
  if (!settings.speedMode && settings.antiDetection !== false) {
    const viewTime = getProfileViewTime(profileInfo);
    log(`[HUMAN] Viewing profile for ${(viewTime / 1000).toFixed(1)}s`);
    await sleep(viewTime);
    await scrollThroughPhotos();
  }

  const filterResult = shouldLikeProfile(profileInfo, filters);
  const direction = decideDirection(settings, filterResult);

  log(`[${site.toUpperCase()}] Processing: {name: '${profileInfo.name}', age: ${profileInfo.age}, filter: ${filterResult?.reason || 'none'}}`);

  const success = await swipe(direction);

  // Post-await ownership re-check: if a newer loop took over while we were
  // awaiting (the window that caused double-counting), bail before counting.
  if (token !== runToken) {
    log('[WARN] Loop superseded during swipe, not counting');
    return;
  }

  if (success) {
    const action = direction === 'right' ? 'like' : 'dislike';

    // Same-card guard: if this profile signature matches the one we just
    // counted, the DOM had not advanced to a new card (a fast-mode hazard),
    // so do not count it again. Skip recording but keep the loop going.
    const signature = `${profileInfo.name}|${profileInfo.age}|${profileInfo.distance}`;
    if (signature === lastCountedSignature && profileInfo.name !== 'Unknown') {
      log('[WARN] Same profile as last swipe, not double-counting');
      scheduleNext(settings, token);
      return;
    }
    lastCountedSignature = signature;

    // Bail if the extension was reloaded mid-swipe, so the count write below
    // does not throw "Extension context invalidated".
    if (!isExtensionContextValid()) {
      handleContextLost();
      return;
    }

    // Update global stats
    let freshData;
    try {
      freshData = await chrome.storage.local.get(['stats', 'history']);
    } catch (e) {
      handleContextLost();
      return;
    }
    freshData = freshData || {};
    const freshStats = freshData.stats || {};
    const freshHistory = freshData.history || { swipes: [], sessions: [] };

    // Update global stats
    if (action === 'like') {
      freshStats.totalLikes = (freshStats.totalLikes || 0) + 1;
      freshStats.todayLikes = (freshStats.todayLikes || 0) + 1;
    } else {
      freshStats.totalDislikes = (freshStats.totalDislikes || 0) + 1;
      freshStats.todayDislikes = (freshStats.todayDislikes || 0) + 1;
    }

    // Check daily date reset
    const today = new Date().toDateString();
    if (freshStats.todayDate !== today) {
      freshStats.todayLikes = action === 'like' ? 1 : 0;
      freshStats.todayDislikes = action === 'dislike' ? 1 : 0;
      freshStats.todayDate = today;

      // Streak logic
      const lastActive = freshStats.lastActiveDate;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (lastActive === yesterday) {
        freshStats.streakDays = (freshStats.streakDays || 0) + 1;
      } else if (lastActive !== today) {
        freshStats.streakDays = 1;
      }
      freshStats.lastActiveDate = today;
    }

    // Update per-tab session
    const currentSession = await getTabSession() || {};
    const sessionUpdate = {
      sessionLikes: (currentSession.sessionLikes || 0) + (action === 'like' ? 1 : 0),
      sessionDislikes: (currentSession.sessionDislikes || 0) + (action === 'dislike' ? 1 : 0),
      swipesSinceBreak: (currentSession.swipesSinceBreak || 0) + 1,
    };
    await updateTabSession(sessionUpdate);

    // Add to history
    const swipeRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      tabId: tabId,
      name: profileInfo.name,
      age: profileInfo.age,
      distance: profileInfo.distance,
      action: action,
      site: site,
      timestamp: Date.now(),
      photoCount: profileInfo.photoCount,
      hasBio: profileInfo.hasBio,
      filterReason: filterResult?.reason || null,
    };

    freshHistory.swipes.unshift(swipeRecord);
    if (freshHistory.swipes.length > 500) {
      freshHistory.swipes = freshHistory.swipes.slice(0, 500);
    }

    await chrome.storage.local.set({
      stats: freshStats,
      history: freshHistory,
    });

    log(`Stats: {total: ${freshStats.totalLikes + freshStats.totalDislikes}, action: '${action}', profile: '${profileInfo.name}'}`);
  }

  scheduleNext(settings, token);
}

function scheduleNext(settings, token = runToken) {
  // Only the current loop may arm the next swipe; a stale loop must not.
  if (token !== runToken) return;
  const delay = getDelay(settings);
  // Always clear any pending timer first so timers can never stack.
  if (swipeInterval) {
    clearTimeout(swipeInterval);
    swipeInterval = null;
  }
  if (isRunning && !isPaused) {
    swipeInterval = setTimeout(() => doSwipe(token), delay);
  }
}

async function startSwiper() {
  if (isRunning) return;
  // Claim the running flag synchronously (before any await) so a second
  // 'start' arriving during the awaits below cannot start a parallel loop.
  isRunning = true;

  // Ensure we have a tab ID
  if (!tabId) {
    const response = await chrome.runtime.sendMessage({ action: 'getTabId' });
    tabId = response?.tabId;
    if (!tabId) {
      log('[ERROR] Could not get tab ID');
      isRunning = false;
      return;
    }
  }

  const site = getSite();
  log(`[INFO] Starting auto swiper on ${site}`);
  isPaused = false;
  totalSwipesBeforeGap = 0;
  isSwipeInProgress = false;
  lastCountedSignature = null;
  // New authoritative run; supersedes any lingering loop.
  runToken++;

  // Setup match detection
  setupMatchDetection();

  // Update global stats
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || {};
  stats.sessionsCount = (stats.sessionsCount || 0) + 1;
  await chrome.storage.local.set({ stats });

  // Create per-tab session
  await updateTabSession({
    tabId: tabId,
    isRunning: true,
    isPaused: false,
    site: site,
    sessionLikes: 0,
    sessionDislikes: 0,
    sessionStart: Date.now(),
    swipesSinceBreak: 0,
  });

  // Start swiping
  doSwipe();
}

async function stopSwiper() {
  log('[INFO] Stopping auto swiper');
  isRunning = false;
  isPaused = false;
  totalSwipesBeforeGap = 0;
  isSwipeInProgress = false;
  // Invalidate any in-flight loop so it cannot count or reschedule.
  runToken++;

  if (swipeInterval) {
    clearTimeout(swipeInterval);
    swipeInterval = null;
  }

  if (sessionGapTimeout) {
    clearTimeout(sessionGapTimeout);
    sessionGapTimeout = null;
  }

  if (breakTimeout) {
    clearTimeout(breakTimeout);
    breakTimeout = null;
  }

  // Cleanup match observer
  if (matchObserver) {
    matchObserver.disconnect();
    matchObserver = null;
  }

  // End session and save to history
  const session = await getTabSession();
  if (session && session.sessionStart > 0) {
    const data = await chrome.storage.local.get(['sessions', 'history']);
    const sessions = data.sessions || {};
    const history = data.history || { swipes: [], sessions: [] };

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

    // Notify session complete
    const total = sessionRecord.likes + sessionRecord.dislikes;
    if (total > 0) {
      chrome.runtime.sendMessage({
        action: 'sessionComplete',
        total,
        likes: sessionRecord.likes,
        dislikes: sessionRecord.dislikes,
      });
    }

    // Remove this tab's session
    delete sessions[tabId];
    await chrome.storage.local.set({ sessions, history });
  }
}

async function pauseSwiper() {
  if (!isRunning || isPaused) return;

  log('[INFO] Pausing auto swiper');
  isPaused = true;
  // Invalidate any in-flight loop so a swipe mid-await cannot count or
  // reschedule after we pause.
  runToken++;

  if (swipeInterval) {
    clearTimeout(swipeInterval);
    swipeInterval = null;
  }

  await updateTabSession({ isPaused: true, isRunning: true });
  log('[INFO] Session paused, storage updated');
}

async function resumeSwiper() {
  if (!isRunning || !isPaused) return;

  log('[INFO] Resuming auto swiper');
  isPaused = false;

  await updateTabSession({ isPaused: false, isRunning: true });
  log('[INFO] Session resumed, storage updated');

  // New authoritative run; supersedes any lingering loop, then launch one.
  runToken++;
  doSwipe(runToken);
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  log(`[INFO] Message: ${msg.action}`);

  if (msg.action === 'start') startSwiper();
  else if (msg.action === 'stop') stopSwiper();
  else if (msg.action === 'pause') pauseSwiper();
  else if (msg.action === 'resume') resumeSwiper();
  else if (msg.action === 'getSite') respond({ site: getSite() });
  else if (msg.action === 'getStatus') {
    respond({ isRunning, isPaused, site: getSite() });
    return true;
  }

  respond({ ok: true });
  return true;
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey) {
    if (e.key === 'S' || e.key === 's') {
      e.preventDefault();
      if (isRunning) {
        stopSwiper();
      } else {
        startSwiper();
      }
    }
    if (e.key === 'P' || e.key === 'p') {
      e.preventDefault();
      if (isRunning && !isPaused) {
        pauseSwiper();
      } else if (isRunning && isPaused) {
        resumeSwiper();
      }
    }
  }
});

// Initialize tab ID
(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getTabId' });
    tabId = response?.tabId;
    log(`[INFO] Content script v3.2 ready on ${getSite()}`);
  } catch (e) {
    log(`[WARN] Could not get tab ID: ${e.message}`);
  }
})();
