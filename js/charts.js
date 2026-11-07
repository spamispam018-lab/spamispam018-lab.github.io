  /**
   * Rendert ein Linien-Diagramm mit mehreren Datensätzen (z. B. Kurs + SMA + Bollinger Bänder).
   * Neu: Unterstützt gestrichelte Linien via series[i].dash (z. B. [5, 5])
   */
  function renderMultiLineChart(canvas, config) {
    if (!canvas) return;
    
    // Zerstöre alten Chart, falls vorhanden (verhindert Memory Leaks und Überlagerungen)
    if (canvas.chartInstance) {
      canvas.chartInstance.destroy();
    }

    var datasets = config.series.map(function(s) {
      return {
        label: s.name,
        data: s.values,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: s.width || 2,
        borderDash: s.dash || [], // HIER: Chart.js borderDash Eigenschaft auslesen
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.1 // Leichte Glättung
      };
    });

    canvas.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: config.labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false // Wir nutzen deine eigene HTML-Legende
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleColor: '#f3f4f6',
            bodyColor: '#f3f4f6',
            borderColor: '#262b3a',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                var val = context.parsed.y;
                if (val === null || isNaN(val)) return null;
                var formatted = config.formatY ? config.formatY(val) : val;
                return context.dataset.label + ': ' + formatted;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(148, 163, 184, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#6b7280',
              maxTicksLimit: 6,
              maxRotation: 0
            }
          },
          y: {
            position: 'right',
            grid: {
              color: 'rgba(148, 163, 184, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#6b7280',
              callback: function(value) {
                return config.formatY ? config.formatY(value) : value;
              }
            }
          }
        }
      }
    });
  }
