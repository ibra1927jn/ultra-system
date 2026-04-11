// ════════════════════════════════════════════════════════════
//  GDELT Throttle — process-wide rate gate
//
//  GDELT's public DOC API rate-limits per source IP with the message
//  "Please limit requests to one every 5 seconds". Empirically the
//  IP gets cooled down much more aggressively once any burst happens
//  — 10-30 min stalls after a single 429 are common.
//
//  Until 2026-04-10 wm_gdelt_geo.js and wm_gdelt_intel.js each had
//  their own internal stagger (10s and 12s respectively) but did NOT
//  coordinate with each other. When wm-gdelt-geo at HH:22 collided
//  with wm-gdelt-intel-c (also HH:22) the IP got throttled and
//  wm-gdelt-geo would persist only 11/29 countries per cycle with
//  0 alerts — a dead runner.
//
//  This module provides a single in-process gate that ALL GDELT
//  callers go through:
//
//    const throttle = require('./gdelt_throttle');
//    await throttle.acquire();           // wait for an allowed slot
//    const res = await fetch(...);
//    if (res.status === 429)             // report so others back off
//      throttle.reportThrottled(30_000);
//
//  Guarantees:
//    - Serialized: only one caller advances at a time
//    - Min gap between consecutive slots: MIN_GAP_MS + jitter
//    - Global cooldown: when any caller reports a 429, ALL pending
//      acquires wait until cooldownUntil before proceeding
//
//  Process-wide only. Multiple node processes on the same IP will
//  still clash — ultra_engine runs as a single process, so this is
//  sufficient for our deployment.
// ════════════════════════════════════════════════════════════

'use strict';

// GDELT official minimum is 5s but empirically the IP gets flagged
// at any pace below ~15s once a burst has already triggered a 429.
// 2026-04-11: bumped from 8s→16s baseline + 4s jitter (→16-20s real
// gap) after B4 validation showed only 15/29 countries persisting
// per cycle with 8s pacing. Cooldown also bumped 30s→60s so a single
// 429 pushes the whole pool out of GDELT's penalty window.
const MIN_GAP_MS = 16_000;
const JITTER_MS = 4_000;
const DEFAULT_COOLDOWN_MS = 60_000;

let lastSentAt = 0;
let cooldownUntil = 0;
let queue = Promise.resolve();
let acquireCount = 0;
let throttleEventCount = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Acquire a GDELT rate-limit slot. Returns a promise that resolves
 * when it's safe to make the next GDELT request. Call immediately
 * before the `fetch()`.
 *
 * Serialized: if N callers call acquire() simultaneously, they resolve
 * one after another with at least MIN_GAP_MS between each.
 */
function acquire() {
  const myTurn = queue.then(async () => {
    const now = Date.now();
    const gap = MIN_GAP_MS + Math.floor(Math.random() * JITTER_MS);
    const gapWait = Math.max(0, (lastSentAt + gap) - now);
    const cooldownWait = Math.max(0, cooldownUntil - now);
    const waitMs = Math.max(gapWait, cooldownWait);
    if (waitMs > 0) await sleep(waitMs);
    lastSentAt = Date.now();
    acquireCount++;
  });
  // Keep chain alive even if a caller's wrapper rejects — the next
  // acquire should not inherit the rejection.
  queue = myTurn.catch(() => {});
  return myTurn;
}

/**
 * Report that GDELT just throttled us (HTTP 429 or the HTML error
 * page that GDELT returns with a 200). All pending and future
 * acquires will wait until the cooldown elapses.
 *
 * @param {number} ms Cooldown duration in milliseconds
 */
function reportThrottled(ms = DEFAULT_COOLDOWN_MS) {
  const until = Date.now() + ms + Math.floor(Math.random() * 5000);
  if (until > cooldownUntil) cooldownUntil = until;
  throttleEventCount++;
}

/** Diagnostics — exposed for tests and /healthz endpoints. */
function stats() {
  return {
    lastSentAt,
    cooldownUntil,
    cooldownRemainingMs: Math.max(0, cooldownUntil - Date.now()),
    acquireCount,
    throttleEventCount,
    minGapMs: MIN_GAP_MS,
    jitterMs: JITTER_MS,
  };
}

/** Test-only reset. Do not call in production. */
function _reset() {
  lastSentAt = 0;
  cooldownUntil = 0;
  queue = Promise.resolve();
  acquireCount = 0;
  throttleEventCount = 0;
}

module.exports = {
  acquire,
  reportThrottled,
  stats,
  _reset,
  MIN_GAP_MS,
  JITTER_MS,
  DEFAULT_COOLDOWN_MS,
};
