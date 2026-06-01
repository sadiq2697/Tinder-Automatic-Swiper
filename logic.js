/*
 * Pure presentation/format logic for the Auto Swiper popup.
 *
 * This module has NO DOM dependencies so it can be unit tested in Node.
 * It is loaded as a plain script before popup.js (exposing a global
 * `AutoSwiperLogic`) and is also importable by the Vitest test suite via the
 * CommonJS export at the bottom.
 */
(function (root) {
  'use strict';

  // Format the read-only value label for a single-value limit/filter slider.
  // 0 carries special meaning for several fields (unlimited / off / any).
  function formatSliderValue(id, value) {
    const v = parseInt(value, 10) || 0;
    switch (id) {
      case 'swipeLimit':
      case 'dailyLimit':
        return v === 0 ? 'Unlimited' : `${v} swipes`;
      case 'breakInterval':
      case 'sessionGapInterval':
        return v === 0 ? 'Off' : `every ${v}`;
      case 'breakDuration':
        return `${v}s`;
      case 'maxDistance':
        return v === 0 ? 'Any' : `${v} km`;
      case 'minPhotos':
        return v === 0 ? 'Any' : `${v}`;
      default:
        return `${v}`;
    }
  }

  // Clamp a dual-range pair so lo <= hi. `active` is 'min' or 'max' and
  // indicates which thumb the user just moved, that thumb wins and pushes the
  // other to meet it. Returns the corrected { lo, hi }.
  function clampDualRange(lo, hi, active) {
    lo = parseInt(lo, 10);
    hi = parseInt(hi, 10);
    if (Number.isNaN(lo)) lo = 0;
    if (Number.isNaN(hi)) hi = 0;
    if (lo > hi) {
      if (active === 'min') hi = lo;
      else lo = hi;
    }
    return { lo, hi };
  }

  // Compute the left/right inset percentages for a dual-range fill bar.
  function dualFillPercents(lo, hi, rangeMin, rangeMax) {
    const span = (rangeMax - rangeMin) || 1;
    return {
      left: ((lo - rangeMin) / span) * 100,
      right: 100 - ((hi - rangeMin) / span) * 100,
    };
  }

  // Single slider fill percent (0..100) for the gradient track.
  function sliderFillPercent(value, min, max) {
    const lo = parseFloat(min) || 0;
    const hi = parseFloat(max);
    const span = (hi - lo) || 1;
    return ((parseFloat(value) - lo) / span) * 100;
  }

  // "travel, music ,, hiking" -> ['travel', 'music', 'hiking']
  function parseKeywords(str) {
    if (!str) return [];
    return str.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  function formatKeywords(arr) {
    if (!arr || !Array.isArray(arr)) return '';
    return arr.join(', ');
  }

  // Parse a Tinder profile heading like "Meera 23" into { name, age }.
  // The age is the trailing number; the name is everything before it. Handles
  // multi-word names, accents, extra whitespace, name-only, and badge noise.
  // Returns age as a string, or '?' when no plausible age is present.
  function parseTinderHeading(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return { name: '', age: '?' };
    const ageMatch = text.match(/\b(\d{1,3})\b/);
    const name = text.replace(/\s*\b\d{1,3}\b\s*$/, '').trim();
    return { name, age: ageMatch ? ageMatch[1] : '?' };
  }

  const api = {
    formatSliderValue,
    clampDualRange,
    dualFillPercents,
    sliderFillPercent,
    parseKeywords,
    formatKeywords,
    parseTinderHeading,
  };

  // Browser: expose as a global. Node/Vitest: export via module.exports.
  root.AutoSwiperLogic = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
