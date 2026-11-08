/**
 * js/theme.js
 * Manueller Dark/Light-Toggle mit System-Override.
 * Nutzt data-theme-Attribut auf <html> und localStorage.
 */
window.App = window.App || {};
window.App.Theme = (function () {
  'use strict';
  var KEY = 'app_theme';

  function get() {
    try { return localStorage.getItem(KEY) || null; } catch (e) { return null; }
  }

  function apply(theme) {
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(KEY, theme); } catch (e) {}
    } else {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
    updateToggleUI();
  }

  function toggle() {
    var current = get();
    if (!current) {
      var isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      apply(isSystemDark ? 'light' : 'dark');
    } else {
      apply(current === 'dark' ? 'light' : 'dark');
    }
  }

  function updateToggleUI() {
    var btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    var manual = get();
    var isDark = manual ? manual === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
      btn.setAttribute('aria-label', 'Zu Light-Mode wechseln');
    } else {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      btn.setAttribute('aria-label', 'Zu Dark-Mode wechseln');
    }
  }

  function init() {
    if (!get() && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
        if (!get()) {
          if (e.matches) document.documentElement.setAttribute('data-theme', 'light');
          else document.documentElement.removeAttribute('data-theme');
        }
        updateToggleUI();
      });
    } catch (e) {}
    updateToggleUI();
  }

  return { init: init, apply: apply, toggle: toggle, get: get };
})();