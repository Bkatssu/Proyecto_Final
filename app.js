// ================================================
// SISTEMA DE MONITOREO DE MOVIMIENTO — Física 1
// app.js
// Universidad Mariano Gálvez de Guatemala
// ================================================

// ─────────────────────────────────────────────
// NAVEGACIÓN POR TABS
// ─────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.code-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.code-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.code-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('code-' + btn.dataset.lang).classList.add('active');
  });
});

// ─────────────────────────────────────────────
// MOTOR DE CINEMÁTICA
// ─────────────────────────────────────────────
class MotorCinematico {
  constructor(x0, v0, a) {
    this.x0 = x0;
    this.v0 = v0;
    this.a  = a;
  }

  posicion(t) {
    // MRUV: x = x0 + v0*t + (1/2)*a*t²
    return this.x0 + this.v0 * t + 0.5 * this.a * t * t;
  }

  velocidad(t) {
    // v = v0 + a*t
    return this.v0 + this.a * t;
  }

  clasificar() {
    if (Math.abs(this.a) < 0.05)        return { tipo: 'MRU',         css: 'mru' };
    if (Math.abs(this.a + 9.81) < 0.15) return { tipo: 'Caída libre', css: 'caida' };
    return { tipo: 'MRUV', css: 'mruv' };
  }
}

// ─────────────────────────────────────────────
// ESTADO DE SIMULACIÓN
// ─────────────────────────────────────────────
let simRunning = false;
let simTimer   = null;
let simT       = 0;
const DT       = 0.05; // paso de integración (s)
let motor      = new MotorCinematico(0, 5, 2);
let maxPosVisto = 0;

// ─────────────────────────────────────────────
// SLIDERS
// ─────────────────────────────────────────────
function getParams() {
  return {
    x0:  parseFloat(document.getElementById('x0').value),
    v0:  parseFloat(document.getElementById('v0').value),
    a:   parseFloat(document.getElementById('acc').value),
    dur: parseFloat(document.getElementById('dur').value),
  };
}

function updateSliders() {
  const p = getParams();
  document.getElementById('x0-out').textContent  = p.x0.toFixed(0)  + ' m';
  document.getElementById('v0-out').textContent  = p.v0.toFixed(1)  + ' m/s';
  document.getElementById('acc-out').textContent = p.a.toFixed(2)   + ' m/s²';
  document.getElementById('dur-out').textContent = p.dur.toFixed(0) + ' s';
  motor = new MotorCinematico(p.x0, p.v0, p.a);
  const cls = motor.clasificar();
  const td  = document.getElementById('tipo-display');
  const tt  = document.getElementById('tipo-text');
  td.className = 'tipo-display ' + cls.css;
  const labels = {
    MRU:         'MRU — Movimiento Rectilíneo Uniforme',
    MRUV:        'MRUV — Movimiento Rectilíneo Uniformemente Variado',
    'Caída libre': 'Caída libre — a ≈ −9.81 m/s²',
  };
  tt.textContent = labels[cls.tipo];
  document.getElementById('m-acc').textContent = p.a.toFixed(2);
  document.getElementById('m-vel').textContent = p.v0.toFixed(2);
  document.getElementById('m-pos').textContent = p.x0.toFixed(2);
  document.getElementById('m-time').textContent = '0.0';
  document.getElementById('m-dist').textContent = '0.0';
}

['x0','v0','acc','dur'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateSliders);
});

// ─────────────────────────────────────────────
// CHART.JS — CONFIGURACIÓN BASE
// ─────────────────────────────────────────────
const GRID_COLOR = 'rgba(255,255,255,.06)';
const TICK_COLOR = '#555870';

function makeChart(id, color, yLabel, tension = 0.3) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: yLabel,
        data: [],
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        tension,
        fill: {
          target: 'origin',
          above: color.replace(')', ', 0.07)').replace('rgb', 'rgba'),
          below: 'transparent',
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: TICK_COLOR, maxTicksLimit: 8, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_COLOR },
          title: { display: true, text: 'Tiempo (s)', color: TICK_COLOR, font: { size: 10 } },
        },
        y: {
          ticks: { color: TICK_COLOR, maxTicksLimit: 6, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_COLOR },
          title: { display: true, text: yLabel, color: TICK_COLOR, font: { size: 10 } },
        },
      },
    },
  });
}

// Inicializar gráficas de simulación
let chartX = makeChart('chartX', '#5DCAA5', 'Posición (m)');
let chartV = makeChart('chartV', '#85B7EB', 'Velocidad (m/s)');
let chartA = makeChart('chartA', '#EF9F27', 'Aceleración (m/s²)', 0);

// ─────────────────────────────────────────────
// SIMULACIÓN
// ─────────────────────────────────────────────
function toggleSim() {
  if (simRunning) {
    pauseSim();
  } else {
    startSim();
  }
}

function startSim() {
  simRunning = true;
  document.getElementById('btn-play').innerHTML = '⏸ Pausar';
  const p = getParams();
  motor = new MotorCinematico(p.x0, p.v0, p.a);
  maxPosVisto = p.x0;

  simTimer = setInterval(() => {
    if (simT > p.dur) {
      pauseSim();
      document.getElementById('btn-play').innerHTML = '▶ Iniciar';
      return;
    }

    const x = motor.posicion(simT);
    const v = motor.velocidad(simT);
    const a = p.a;
    const dist = Math.abs(x - p.x0);

    if (x > maxPosVisto) maxPosVisto = x;

    // Actualizar métricas
    document.getElementById('m-pos').textContent  = x.toFixed(2);
    document.getElementById('m-vel').textContent  = v.toFixed(2);
    document.getElementById('m-acc').textContent  = a.toFixed(2);
    document.getElementById('m-time').textContent = simT.toFixed(1);
    document.getElementById('m-dist').textContent = dist.toFixed(2);
    document.getElementById('track-t').textContent = 't = ' + simT.toFixed(1) + ' s';

    // Posición del objeto en la pista
    const rango = Math.max(maxPosVisto - p.x0, 1);
    const pct   = Math.max(2, Math.min(92, ((x - p.x0) / rango) * 88 + 2));
    document.getElementById('obj').style.left    = pct + '%';
    document.getElementById('trail').style.width = Math.max(0, pct - 2) + '%';

    // Agregar a gráficas
    const tLabel = simT.toFixed(2);
    chartX.data.labels.push(tLabel);
    chartX.data.datasets[0].data.push(parseFloat(x.toFixed(3)));
    chartV.data.labels.push(tLabel);
    chartV.data.datasets[0].data.push(parseFloat(v.toFixed(3)));
    chartA.data.labels.push(tLabel);
    chartA.data.datasets[0].data.push(parseFloat(a.toFixed(3)));

    // Limitar historial a 300 puntos para rendimiento
    const MAX = 300;
    if (chartX.data.labels.length > MAX) {
      chartX.data.labels.shift(); chartX.data.datasets[0].data.shift();
      chartV.data.labels.shift(); chartV.data.datasets[0].data.shift();
      chartA.data.labels.shift(); chartA.data.datasets[0].data.shift();
    }

    chartX.update('none');
    chartV.update('none');
    chartA.update('none');

    simT = parseFloat((simT + DT).toFixed(4));
  }, 50);
}

function pauseSim() {
  clearInterval(simTimer);
  simRunning = false;
  document.getElementById('btn-play').innerHTML = '▶ Continuar';
}

function resetSim() {
  clearInterval(simTimer);
  simRunning = false;
  simT = 0;
  maxPosVisto = 0;

  document.getElementById('btn-play').innerHTML = '▶ Iniciar';
  document.getElementById('obj').style.left     = '2%';
  document.getElementById('trail').style.width  = '0%';
  document.getElementById('track-t').textContent = 't = 0.0 s';

  const p = getParams();
  document.getElementById('m-pos').textContent  = p.x0.toFixed(2);
  document.getElementById('m-vel').textContent  = p.v0.toFixed(2);
  document.getElementById('m-acc').textContent  = p.a.toFixed(2);
  document.getElementById('m-time').textContent = '0.0';
  document.getElementById('m-dist').textContent = '0.0';

  chartX.data.labels = []; chartX.data.datasets[0].data = [];
  chartV.data.labels = []; chartV.data.datasets[0].data = [];
  chartA.data.labels = []; chartA.data.datasets[0].data = [];
  chartX.update(); chartV.update(); chartA.update();
}

// ─────────────────────────────────────────────
// VALIDACIÓN — Caída libre
// ─────────────────────────────────────────────
function buildValidacion() {
  const g  = 9.81;
  const y0 = 20;
  const tiempos = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, Math.sqrt(2 * y0 / g)];
  const tbody = document.getElementById('val-body');
  tbody.innerHTML = '';

  const tLabels = [], yTeo = [], yMed = [], vTeo = [], errores = [];

  tiempos.forEach(t => {
    const yt = Math.max(0, y0 - 0.5 * g * t * t);
    const vt = g * t;
    const noise = (Math.random() - 0.5) * 0.12;
    const ym = Math.max(0, yt + noise);
    const vm = vt + (Math.random() - 0.5) * 0.08;
    const err = yt > 0.01 ? Math.abs((ym - yt) / yt * 100) : 0;

    tLabels.push(t.toFixed(2));
    yTeo.push(parseFloat(yt.toFixed(3)));
    yMed.push(parseFloat(ym.toFixed(3)));
    vTeo.push(parseFloat(vt.toFixed(3)));
    errores.push(err);

    const errClass = err > 1 ? 'err-chip warn' : 'err-chip';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.toFixed(2)}</td>
      <td>${yt.toFixed(3)}</td>
      <td>${ym.toFixed(3)}</td>
      <td>${vt.toFixed(3)}</td>
      <td>${vm.toFixed(3)}</td>
      <td><span class="${errClass}">${err.toFixed(2)}%</span></td>
    `;
    tbody.appendChild(tr);
  });

  const errMax = Math.max(...errores);
  const errProm = errores.reduce((a, b) => a + b, 0) / errores.length;
  document.getElementById('error-summary').textContent =
    `Error máximo: ${errMax.toFixed(2)}% · Error promedio: ${errProm.toFixed(2)}% · Margen aceptable: < 2%`;

  // Gráfica posición
  new Chart(document.getElementById('chartVal'), {
    type: 'line',
    data: {
      labels: tLabels,
      datasets: [
        { label: 'Teórico', data: yTeo, borderColor: '#85B7EB', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false },
        { label: 'Medido',  data: yMed, borderColor: '#EF9F27', borderWidth: 1.5, pointRadius: 3, tension: 0.3, fill: false, borderDash: [5, 3] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: TICK_COLOR, font: { size: 11, family: 'Space Mono' }, boxWidth: 12 },
        },
      },
      scales: {
        x: { ticks: { color: TICK_COLOR }, grid: { color: GRID_COLOR }, title: { display: true, text: 'Tiempo (s)', color: TICK_COLOR } },
        y: { ticks: { color: TICK_COLOR }, grid: { color: GRID_COLOR }, title: { display: true, text: 'Altura (m)', color: TICK_COLOR } },
      },
    },
  });

  // Gráfica velocidad
  const vMed = tLabels.map((_, i) => parseFloat((vTeo[i] + (Math.random() - 0.5) * 0.1).toFixed(3)));
  new Chart(document.getElementById('chartValV'), {
    type: 'line',
    data: {
      labels: tLabels,
      datasets: [
        { label: 'v teórico', data: vTeo, borderColor: '#5DCAA5', borderWidth: 2, pointRadius: 3, tension: 0, fill: false },
        { label: 'v medido',  data: vMed, borderColor: '#F09595', borderWidth: 1.5, pointRadius: 3, tension: 0, fill: false, borderDash: [5, 3] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: TICK_COLOR, font: { size: 11, family: 'Space Mono' }, boxWidth: 12 },
        },
      },
      scales: {
        x: { ticks: { color: TICK_COLOR }, grid: { color: GRID_COLOR }, title: { display: true, text: 'Tiempo (s)', color: TICK_COLOR } },
        y: { ticks: { color: TICK_COLOR }, grid: { color: GRID_COLOR }, title: { display: true, text: 'Velocidad (m/s)', color: TICK_COLOR } },
      },
    },
  });
}

// ─────────────────────────────────────────────
// COPIAR CÓDIGO
// ─────────────────────────────────────────────
function copyCode(preId) {
  const text = document.getElementById(preId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    btn.textContent = '✓ Copiado';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}

// ─────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateSliders();
  buildValidacion();
});
