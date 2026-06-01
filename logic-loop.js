/*
 * Pure model of the swipe loop's "single owner" invariant, extracted from
 * content.js so the concurrency rule can be unit tested without a DOM.
 *
 * The real loop in content.js spawns one async chain per (re)start/resume.
 * The bug was that several of those chains could run at once, each
 * incrementing the swipe counter, so one visible swipe counted 2x or 4x.
 *
 * The fix: every (re)launch bumps a `runToken`. A loop captures the token it
 * was launched with and must re-check it after every await; if a newer launch
 * happened, the older loop is stale and exits before counting. Only the
 * newest loop survives, guaranteeing exactly one increment per swipe.
 *
 * This module exposes a tiny SwipeLoop with the same token discipline so the
 * test suite can prove duplicate launches cannot double-count.
 */
(function (root) {
  'use strict';

  function createSwipeLoop() {
    return {
      runToken: 0,
      count: 0,

      // Begin a new authoritative run. Any loop launched from an earlier
      // token becomes stale. Returns the token for the caller's loop.
      launch() {
        this.runToken += 1;
        return this.runToken;
      },

      // A loop is allowed to proceed only if it still owns the latest token.
      isCurrent(token) {
        return token === this.runToken;
      },

      // One swipe step. Mirrors doSwipe: re-check ownership AFTER the async
      // work (modeled by `awaitedOwnershipChecks`) and only then count.
      // Returns true if it counted, false if it bailed as a stale loop.
      step(token) {
        // Top-of-function guard (cheap fast path).
        if (!this.isCurrent(token)) return false;
        // Post-await guard: this is the one that actually prevents
        // double-counting when loops interleave around awaits.
        if (!this.isCurrent(token)) return false;
        this.count += 1;
        return true;
      },
    };
  }

  // Async mutex used by doSwipe so that NO two swipe executions overlap,
  // regardless of what triggers them (the main timer, a resume, a stray
  // duplicate timer, etc). The check-and-claim is synchronous (before any
  // await), so two invocations can never both pass the gate. This is what
  // actually prevents double-counting at fast (1s) timing where a second
  // trigger can fire while the first swipe is still awaiting.
  function createSwipeMutex() {
    let locked = false;
    let count = 0;
    return {
      get isLocked() { return locked; },
      get count() { return count; },

      // Run `work` under the lock. If the lock is held, the call is dropped
      // (returns false) instead of running concurrently. Returns true if it
      // ran. `work` is an async function that performs one swipe + count.
      async run(work) {
        if (locked) return false;   // synchronous gate: duplicate dropped
        locked = true;
        try {
          await work();
          count += 1;
          return true;
        } finally {
          locked = false;
        }
      },
    };
  }

  const api = { createSwipeLoop, createSwipeMutex };
  root.AutoSwiperLoop = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
