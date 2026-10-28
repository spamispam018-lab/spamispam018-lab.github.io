/**
 * js/router.js
 * Hash-Routing für die lokale file://-Laufumgebung.
 * Unterstützt Routen:
 * - #/screener
 * - #/watchlist
 * - #/compare
 * - #/stock/:ticker/:tab (z.B. #/stock/AAPL/overview)
 */

window.App = window.App || {};

window.App.Router = (function () {
  'use strict';

  var routes = {};
  var currentRoute = null;

  /**
   * Registriert einen Route-Handler für ein Pfadmuster.
   * Beispiel: register('/stock/:ticker/:tab', handlerFn)
   */
  function register(pattern, handler) {
    routes[pattern] = handler;
  }

  /**
   * Analysiert den aktuellen Window-Hash und extrahiert Pfad und Parameter.
   */
  function parseLocation() {
    var rawHash = window.location.hash || '#/screener';
    var path = rawHash.replace(/^#/, '');

    if (!path || path === '/') {
      path = '/screener';
    }

    // Query-Parameter abspalten, falls vorhanden
    var queryIndex = path.indexOf('?');
    if (queryIndex !== -1) {
      path = path.slice(0, queryIndex);
    }

    return path;
  }

  /**
   * Vergleicht Pfade mit dynamischen Parametern (:ticker, :tab).
   */
  function matchRoute(routePattern, currentPath) {
    var patternParts = routePattern.split('/').filter(Boolean);
    var pathParts = currentPath.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return null;
    }

    var params = {};
    for (var i = 0; i < patternParts.length; i++) {
      if (patternParts[i].charAt(0) === ':') {
        var paramName = patternParts[i].slice(1);
        params[paramName] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return params;
  }

  /**
   * Aktualisiert die aktive Markierung in der unteren Navigationsleiste.
   */
  function updateBottomNav(activeMainRoute) {
    var navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(function (item) {
      var target = item.getAttribute('data-route');
      if (target === activeMainRoute) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Löst das Routing basierend auf aktuellem Hash aus.
   */
  function handleRoute() {
    var path = parseLocation();
    var matchedHandler = null;
    var routeParams = {};

    for (var pattern in routes) {
      if (Object.prototype.hasOwnProperty.call(routes, pattern)) {
        var params = matchRoute(pattern, path);
        if (params !== null) {
          matchedHandler = routes[pattern];
          routeParams = params;
          break;
        }
      }
    }

    if (!matchedHandler) {
      // Fallback-Route
      window.location.hash = '#/screener';
      return;
    }

    currentRoute = path;

    // Aktiven Hauptnavigationspunkt bestimmen
    var primarySection = path.split('/')[1] || 'screener';
    updateBottomNav(primarySection);

    // Handler ausführen
    matchedHandler(routeParams);
  }

  /**
   * Programmatischer Seitenwechsel per Hash.
   */
  function navigate(path) {
    var cleanPath = path.replace(/^#/, '');
    window.location.hash = '#' + cleanPath;
  }

  /**
   * Initialisiert Event-Listener auf Hash-Änderungen.
   */
  function init() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  return {
    register: register,
    navigate: navigate,
    init: init,
    parseLocation: parseLocation
  };
})();
