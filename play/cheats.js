// play/cheats.js
// Aggressive client-side overrides to:
//  - start resources at a 64-bit max
//  - force percent/progress values to 100
//  - unlock all skins
// This script is tolerant of different variable names and repeatedly reapplies changes.

(function () {
  'use strict';

  // Choose signed or unsigned 64-bit max here:
  const SIGNED64_MAX = 2n ** 63n - 1n;             // 9223372036854775807
  const UNSIGNED64_MAX = 2n ** 64n - 1n;           // 18446744073709551615
  // DEFAULT: signed 64-bit. Change to true for unsigned.
  const USE_UNSIGNED = false;
  const MAX64 = USE_UNSIGNED ? UNSIGNED64_MAX : SIGNED64_MAX;
  // Fallback for Number-typed counters (JS Number can't safely represent full 64-bit)
  const NUM_FALLBACK = Number.MAX_SAFE_INTEGER; // 9007199254740991

  function asBestValue(current) {
    if (typeof current === 'bigint') return MAX64;
    if (typeof current === 'number') return Math.min(NUM_FALLBACK, Number(MAX64 > BigInt(NUM_FALLBACK) ? NUM_FALLBACK : Number(MAX64)));
    // If it's a string used to store big ints, store the BigInt string
    return MAX64.toString();
  }

  function forceSet(obj, key, bigVal) {
    if (!obj || typeof key === 'undefined') return false;
    try {
      const cur = obj[key];
      if (typeof cur === 'bigint') obj[key] = bigVal;
      else if (typeof cur === 'number') obj[key] = asBestValue(cur);
      else if (typeof cur === 'string') obj[key] = bigVal.toString();
      else obj[key] = bigVal; // best effort
      return true;
    } catch (e) {
      return false;
    }
  }

  function setAllNumericToBig(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(k => {
      try {
        const v = obj[k];
        if (typeof v === 'bigint') obj[k] = MAX64;
        else if (typeof v === 'number' && !Number.isNaN(v)) {
          // Heuristic: percent-like numbers (0..100) => set to 100, other numeric stats -> set to large
          if (v >= 0 && v <= 100) obj[k] = 100;
          else obj[k] = Math.min(NUM_FALLBACK, Number(MAX64));
        } else if (typeof v === 'object') {
          // Recurse into nested objects (e.g., stats, inventory)
          setAllNumericToBig(v);
        }
      } catch (e) { /* swallow */ }
    });
  }

  function unlockSkins(container) {
    if (!container) return;
    // Array of skin objects [{id, unlocked}] or map {skinId: true}
    if (Array.isArray(container)) {
      container.forEach(item => {
        if (!item) return;
        if (typeof item === 'object') {
          if ('unlocked' in item) item.unlocked = true;
          if ('locked' in item) item.locked = false;
          if ('owned' in item) item.owned = true;
        }
      });
    } else if (container instanceof Set) {
      try { container.add('__ALL__'); } catch (e) {}
    } else if (typeof container === 'object') {
      Object.keys(container).forEach(k => {
        try { container[k] = true; } catch (e) { /* ignore */ }
      });
    }
  }

  function applyCheatsOnce() {
    try {
      // Common global candidates
      const globals = [
        window.game, window.player, window.Player, window._player, window.me,
        window.bfdi, window.bfdiState, window.app, window.store
      ];

      globals.forEach(g => {
        if (!g) return;
        // Try direct resource keys
        ['coins','money','gold','credits','xp','experience','score','points','currency','gems'].forEach(k => {
          if (k in g) forceSet(g, k, MAX64);
        });

        // Stats/percents
        if (g.stats && typeof g.stats === 'object') setAllNumericToBig(g.stats);
        setAllNumericToBig(g);

        // Skins
        if (g.skins) unlockSkins(g.skins);
        if (g.unlockedSkins) unlockSkins(g.unlockedSkins);
        if (g.player && g.player.skins) unlockSkins(g.player.skins);
      });

      // Heuristic scan of window properties for player-like objects
      Object.keys(window).forEach(key => {
        if (key.length > 2 && (key.toLowerCase().includes('player') || key.toLowerCase().includes('profile') || key.toLowerCase().includes('save'))) {
          try {
            const obj = window[key];
            if (!obj || typeof obj !== 'object') return;
            setAllNumericToBig(obj);
            if (obj.skins) unlockSkins(obj.skins);
          } catch (e) {}
        }
      });

      // Monkey-patch common spend/purchase functions to no-op (so user never loses resources)
      ['spend','purchase','buy','consume','removeCurrency'].forEach(fname => {
        const f = window[fname];
        if (typeof f === 'function') {
          window[fname] = function () { return true; };
        }
      });

    } catch (e) {
      console.warn('cheats apply error', e);
    }
  }

  // Intercept localStorage saves and try to inject our values into saved state
  function interceptSaves() {
    try {
      const orig = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        try {
          if (/save|player|progress|profile/i.test(String(k)) && typeof v === 'string') {
            let parsed = JSON.parse(v);
            if (parsed && typeof parsed === 'object') {
              // Try to find player sections and patch them
              const candidates = ['player','profile','user','save'];
              candidates.forEach(c => {
                if (parsed[c] && typeof parsed[c] === 'object') {
                  setAllNumericToBig(parsed[c]);
                  if (parsed[c].skins) unlockSkins(parsed[c].skins);
                }
              });
              // Also patch top-level
              setAllNumericToBig(parsed);
              v = JSON.stringify(parsed);
            }
          }
        } catch (e) { /* ignore parse errors */ }
        return orig(k, v);
      };
    } catch (e) {
      // localStorage may be inaccessible in some contexts
    }
  }

  // Apply once after DOM is ready, and keep re-applying
  function start() {
    try {
      applyCheatsOnce();
      interceptSaves();
      // Re-apply frequently to fight game overrides
      setInterval(applyCheatsOnce, 400);
    } catch (e) {
      console.error('cheats start error', e);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else window.addEventListener('DOMContentLoaded', start);

  // Dev helpers
  window.__cheatsApply = applyCheatsOnce;
  window.__cheatsMax64 = MAX64;
})();
