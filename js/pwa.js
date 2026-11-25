/**
 * js/pwa.js – Registriert den Service Worker und zeigt Installations-Prompt.
 */
window.App = window.App || {};
window.App.PWA = (function () {
  'use strict';

  var deferredPrompt = null;

  function register() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('Service Worker nicht registriert:', e); });
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function canPrompt() { return !!deferredPrompt; }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /** Installieren: Browser-Dialog, falls verfügbar – sonst kurze Anleitung für das jeweilige Gerät. */
  function installOrExplain() {
    if (deferredPrompt) { install(); return; }
    var UI = window.App.UI;
    if (!UI || !UI.openSheet) return;
    var steps;
    if (isIOS()) {
      steps = '<li>Seite in <b>Safari</b> öffnen (in anderen Browsern auf dem iPhone geht es nicht).</li>' +
        '<li>Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben).</li>' +
        '<li><b>Zum Home-Bildschirm</b> wählen und bestätigen.</li>';
    } else {
      steps = '<li>Seite in <b>Chrome</b> öffnen.</li>' +
        '<li>Oben rechts auf <b>⋮</b> tippen.</li>' +
        '<li><b>App installieren</b> oder <b>Zum Startbildschirm hinzufügen</b> wählen.</li>' +
        '<li>Erscheint nur „Verknüpfung erstellen“: Seite einmal neu laden und kurz warten, dann erneut versuchen.</li>';
    }
    UI.openSheet('<h3 class="ui-sheet-title">App installieren</h3>' +
      '<ol style="font-size:0.88rem;line-height:1.6;padding-left:20px;margin:10px 0 16px;color:var(--text-main);">' + steps + '</ol>' +
      '<div class="ui-sheet-actions"><button class="ui-btn ui-btn-primary" id="pwa-help-ok" type="button">Verstanden</button></div>',
      function (root) { root.querySelector('#pwa-help-ok').onclick = function () { UI.closeSheet(); }; });
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });
  }

  function showInstallBanner() {
    if (isStandalone()) return;
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
    if (btn) btn.onclick = installOrExplain;
    window.addEventListener('appinstalled', function () { deferredPrompt = null; if (btn) btn.style.display = 'none'; if (window.App.UI && window.App.UI.toast) window.App.UI.toast('App installiert'); });
    var dismissBtn = document.getElementById('pwa-install-dismiss');
    if (dismissBtn) dismissBtn.onclick = dismiss;
  }

  return { init: init, install: installOrExplain, isStandalone: isStandalone, canPrompt: canPrompt };
})();