/**
 * Navigation- und Tab-Steuerung innerhalb der Aktien-Detailseiten
 */
const StockNav = (function () {
  function getCurrentSymbol() {
    const params = new URLSearchParams(window.location.search);
    return params.get("symbol") || "AAPL";
  }

  function updateInternalLinks() {
    const symbol = getCurrentSymbol();
    // Alle internen Detail-Links mit aktuellem Symbol synchronisieren
    const subLinks = document.querySelectorAll("[data-stock-link]");
    subLinks.forEach(link => {
      const baseHref = link.getAttribute("data-stock-link");
      link.href = `${baseHref}?symbol=${encodeURIComponent(symbol)}`;
    });
  }

  function highlightActiveTab() {
    const currentPath = window.location.pathname.toLowerCase();
    const navItems = document.querySelectorAll(".nav-link, .subnav-link");

    navItems.forEach(item => {
      const href = item.getAttribute("href");
      if (!href) return;

      const cleanHref = href.split("?")[0].toLowerCase();
      if (currentPath.endsWith(cleanHref) || (cleanHref.includes("index") && currentPath.endsWith("/"))) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  function init() {
    updateInternalLinks();
    highlightActiveTab();
  }

  return {
    init,
    getCurrentSymbol
  };
})();

// DOM-Ready Hook
document.addEventListener("DOMContentLoaded", () => {
  StockNav.init();
});

// Global verfügbar machen
window.StockNav = StockNav;
