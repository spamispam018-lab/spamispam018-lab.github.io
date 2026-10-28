/**
 * Kompakte, offlinefähige Chart-Engine für file://
 * Bietet die für Aktien-Detailcharts und Mini-Sparklines notwendige Chart.js-kompatible API:
 * new Chart(ctx, { type: 'line', data: { labels, datasets }, options })
 * Verwendet natives HTML5 Canvas ohne externe Abhängigkeiten oder Netzwerkzugriffe.
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
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!canvas || !ctx) return;

    // Retina / High-DPI Support
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || canvas.clientWidth || 300;
    const height = rect.height || canvas.clientHeight || 180;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const datasets = this.data.datasets || [];
    if (datasets.length === 0) {
      ctx.restore();
      return;
    }

    const firstDataset = datasets[0];
    const dataPoints = firstDataset.data || [];
    if (dataPoints.length === 0) {
      ctx.restore();
      return;
    }

    // Min & Max berechnen mit Puffer oben/unten
    let minVal = Math.min.apply(null, dataPoints);
    let maxVal = Math.max.apply(null, dataPoints);
    if (minVal === maxVal) {
      minVal = minVal * 0.95;
      maxVal = maxVal * 1.05 || 1;
    }
    const valRange = maxVal - minVal;

    // Layout-Abstände
    const padding = { top: 16, bottom: 28, left: 12, right: 12 };
    const chartWidth = Math.max(10, width - padding.left - padding.right);
    const chartHeight = Math.max(10, height - padding.top - padding.bottom);

    // Horizontale Hilfslinien (Subtile Grid-Linien)
    const gridLines = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      const labelVal = maxVal - (valRange / gridLines) * i;
      ctx.fillText(labelVal.toFixed(1) + ' €', width - 4, y - 4);
    }

    // Datenpunkte auf Pixel skalieren
    const points = [];
    const stepX = chartWidth / (dataPoints.length - 1 || 1);

    for (let i = 0; i < dataPoints.length; i++) {
      const px = padding.left + i * stepX;
      const normalizedY = (dataPoints[i] - minVal) / (valRange || 1);
      const py = padding.top + (1 - normalizedY) * chartHeight;
      points.push({ x: px, y: py, val: dataPoints[i] });
    }

    // Verlaufsfläche (Gradient)
    const borderColor = firstDataset.borderColor || '#6366f1';
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    
    if (borderColor.indexOf('16, 185, 129') !== -1 || borderColor.indexOf('#10b981') !== -1) {
      // Positiver Trend (Grün)
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
    } else if (borderColor.indexOf('244, 63, 94') !== -1 || borderColor.indexOf('#f43f5e') !== -1) {
      // Negativer Trend (Rot/Pink)
      gradient.addColorStop(0, 'rgba(244, 63, 94, 0.28)');
      gradient.addColorStop(1, 'rgba(244, 63, 94, 0.00)');
    } else {
      // Standard Primär (Lila)
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.32)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.00)');
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight);
    ctx.lineTo(points[0].x, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Hauptlinie zeichnen
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = firstDataset.borderWidth || 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Endpunkt hervorheben
    const lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0c0f17';
    ctx.stroke();

    ctx.restore();
  };

  global.Chart = Chart;
})(typeof window !== 'undefined' ? window : this);
