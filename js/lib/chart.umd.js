/**
 * Kompakte, offlinefähige Chart-Engine für file:// und Mobile-Browser.
 * Ermittelt die Dimensionen direkt vom Parent-Container, verhindert Skalierungsfehler
 * bei High-DPI-Displays (Retina/Android) und clippt den Zeichenbereich sauber.
 */
(function (global) {
  'use strict';

  function Chart(ctx, config) {
    if (typeof ctx === 'string') {
      this.canvas = document.getElementById(ctx);
    } else if (ctx && ctx.canvas) {
      this.canvas = ctx.canvas;
    } else {
      this.canvas = ctx;
    }

    if (!this.canvas || !this.canvas.getContext) {
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.config = config || {};
    this.data = this.config.data || { labels: [], datasets: [] };
    this.options = this.config.options || {};

    this.init();
  }

  Chart.prototype.init = function () {
    this.resizeListener = this.render.bind(this);
    window.addEventListener('resize', this.resizeListener);
    this.render();
  };

  Chart.prototype.destroy = function () {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };

  Chart.prototype.update = function () {
    this.render();
  };

  Chart.prototype.render = function () {
    var canvas = this.canvas;
    var ctx = this.ctx;
    if (!canvas || !ctx) return;

    var parent = canvas.parentElement;
    var width = parent ? parent.clientWidth : (canvas.clientWidth || 320);
    var height = parent ? parent.clientHeight : (canvas.clientHeight || 200);

    if (width <= 0 || height <= 0) {
      width = 320;
      height = 200;
    }

    var dpr = window.devicePixelRatio || 1;

    // Physische Pixel für Schärfe setzen
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    // CSS-Anzeigemaße fixieren, um Skalierungsausbrüche zu verhindern
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.display = 'block';

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var datasets = this.data.datasets || [];
    if (datasets.length === 0) {
      ctx.restore();
      return;
    }

    var firstDataset = datasets[0];
    var dataPoints = firstDataset.data || [];
    if (dataPoints.length === 0) {
      ctx.restore();
      return;
    }

    // Min & Max berechnen
    var minVal = dataPoints[0];
    var maxVal = dataPoints[0];
    for (var k = 1; k < dataPoints.length; k++) {
      if (dataPoints[k] < minVal) minVal = dataPoints[k];
      if (dataPoints[k] > maxVal) maxVal = dataPoints[k];
    }

    if (minVal === maxVal) {
      minVal = minVal * 0.95;
      maxVal = maxVal * 1.05 || 1;
    }

    // Zusätzlicher vertikaler Puffer (10%) für optische Eleganz
    var rawRange = maxVal - minVal;
    var paddedMin = minVal - rawRange * 0.08;
    var paddedMax = maxVal + rawRange * 0.08;
    var valRange = paddedMax - paddedMin;

    var padding = { top: 18, bottom: 20, left: 14, right: 54 };
    var chartWidth = Math.max(10, width - padding.left - padding.right);
    var chartHeight = Math.max(10, height - padding.top - padding.bottom);

    // Grid-Linien & Y-Achsenbeschriftung
    var gridLines = 3;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (var i = 0; i <= gridLines; i++) {
      var y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      var labelVal = paddedMax - (valRange / gridLines) * i;
      ctx.fillText(labelVal.toFixed(0) + ' €', width - 8, y);
    }

    // Punkte berechnen
    var points = [];
    var stepX = chartWidth / (dataPoints.length - 1 || 1);

    for (var j = 0; j < dataPoints.length; j++) {
      var px = padding.left + j * stepX;
      var normalizedY = (dataPoints[j] - paddedMin) / valRange;
      var py = padding.top + (1 - normalizedY) * chartHeight;
      points.push({ x: px, y: py, val: dataPoints[j] });
    }

    var borderColor = firstDataset.borderColor || '#6366f1';

    // Verlaufsfläche (Gradient)
    var gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    if (borderColor.indexOf('10b981') !== -1 || borderColor.indexOf('16, 185, 129') !== -1) {
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
    } else if (borderColor.indexOf('f43f5e') !== -1 || borderColor.indexOf('244, 63, 94') !== -1) {
      gradient.addColorStop(0, 'rgba(244, 63, 94, 0.28)');
      gradient.addColorStop(1, 'rgba(244, 63, 94, 0.00)');
    } else {
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.28)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.00)');
    }

    // Fläche füllen
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p++) {
      ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
    ctx.lineTo(points[0].x, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Linie zeichnen
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var l = 1; l < points.length; l++) {
      ctx.lineTo(points[l].x, points[l].y);
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Endpunkt hervorheben
    var lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#151a24';
    ctx.stroke();

    ctx.restore();
  };

  global.Chart = Chart;
})(typeof window !== 'undefined' ? window : this);
