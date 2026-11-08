/**
 * js/pwa.js – Registriert den Service Worker und zeigt Installations-Prompt.
 */
window.App = window.App || {};
window.App.PWA = (function () {
  'use strict';

  var deferredPrompt = null;

  function register() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });
  }

  function showInstallBanner() {
    if (localStorage.getItem('pwa_install_dismissed')) return;
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'inline-flex';
  }

  function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      var btn = document.getElementById('pwa-install-btn');
      if (btn) btn.style.display = 'none';
    });
  }

  function dismiss() {
    try { localStorage.setItem('pwa_install_dismissed', '1'); } catch (e) {}
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'none';
  }

  function init() {
    register();
    setupInstallPrompt();
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.onclick = install;
    var dismissBtn = document.getElementById('pwa-install-dismiss');
    if (dismissBtn) dismissBtn.onclick = dismiss;
  }

  return { init: init };
})();