// ================================================
// MONITOR DE MOVIMIENTO CON CÁMARA — Física 1
// app.js · Universidad Mariano Gálvez de Guatemala
// ================================================
// Funciona 100% en el navegador con la cámara del
// dispositivo. No requiere instalación de nada.
// ================================================

'use strict';

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
const state = {
  camaraActiva:  false,
  rastreando:    false,
  colorMode:     'motion',   // 'motion' | 'red' | 'green' | 'blue' | 'yellow' | 'orange'
  sensibilidad:  35,
  facingMode:    'user',     // 'user' (frontal) | 'environment' (trasera)

  // Datos cinemáticos
  tiempos:       [],
  posicionesX:   [],
  posicionesY:   [],
  velocidades:   [],
  aceleraciones: [],
  trayectoria:   [],   // [{x,y}] en metros

  // Estado previo para diferencias finitas
  prevX: null, prevY: null, prevV: null, prevT: null,
  t0:    null,

  // Escala px → metros
  escala: null,  // m/px (calculado de los inputs)

  // Para detección por movimiento (diff frames)
  prevFrame: null,

  // Loop de animación
  animId: null,
};

// Rangos HSV para cada color (H en 0-360, S y V en 0-255)
const COLOR_RANGES = {
  red:    { hMin:  0, hMax: 10,  sMin: 100, vMin: 80 },
  green:  { hMin: 40, hMax: 80,  sMin: 80,  vMin: 60 },
  blue:   { hMin:100, hMax:130,  sMin: 80,  vMin: 60 },
  yellow: { hMin: 25, hMax: 40,  sMin: 100, vMin: 100 },
  orange: { hMin: 10, hMax: 25,  sMin: 100, vMin: 100 },
};

// ─────────────────────────────────────────────
// ELEMENTOS DOM
// ─────────────────────────────────────────────
const video      = document.getElementById('video');
const canvasProc = document.getElementById('canvas-proc');
const canvasOvrl = document.getElementById('canvas-overlay');
const ctxProc    = canvasProc.getContext('2d', { willReadFrequently: true });
const ctxOvrl    = canvasOvrl.getContext('2d');

// ─────────────────────────────────────────────
// CALIBRACIÓN
// ─────────────────────────────────────────────
function getEscala() {
  const refReal = parseFloat(document.getElementById('ref-real').value) || 0.3;
  const refPx   = parseFloat(document.getElementById('ref-px').value)   || 100;
  return refReal / refPx;  // metros por píxel
}

function updateCalib() {
  const e = getEscala();
  document.getElementById('calib-info').textContent =
    `Escala: ${(e * 100).toFixed(3)} m/px · ${(1/e).toFixed(1)} px/m`;
}

['ref-real','ref-px'].forEach(id =>
  document.getElementById(id).addEventListener('input', updateCalib)
);
updateCalib();

// ─────────────────────────────────────────────
// INICIAR / DETENER CÁMARA
// ─────────────────────────────────────────────
async function toggleCamara() {
  if (state.camaraActiva) {
    detenerCamara();
  } else {
    await iniciarCamara();
  }
}

async function iniciarCamara() {
  setStatus('Solicitando acceso...', false);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: state.facingMode,
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(res => video.onloadedmetadata = res);
    video.play();

    state.camaraActiva = true;
    setStatus('EN VIVO', true, false);
    document.getElementById('btn-cam').textContent   = '⏹ Detener cámara';
    document.getElementById('btn-track').disabled    = false;
    document.getElementById('btn-flip').style.display = 'inline-block';
    document.getElementById('color-selector').style.display = 'block';

    // Ajustar tamaños de canvas
    resizeCanvases();

    // Iniciar loop de video
    requestAnimationFrame(videoLoop);

  } catch (err) {
    setStatus('❌ Sin acceso a cámara: ' + err.message, false);
    console.error(err);
  }
}

function detenerCamara() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  cancelAnimationFrame(state.animId);
  state.camaraActiva = false;
  state.rastreando   = false;
  state.prevFrame    = null;

  document.getElementById('btn-cam').textContent  = '▶ Iniciar cámara';
  document.getElementById('btn-track').textContent = '◎ Activar rastreo';
  document.getElementById('btn-track').classList.remove('btn-active');
  document.getElementById('btn-track').disabled    = true;
  document.getElementById('btn-flip').style.display = 'none';
  document.getElementById('color-selector').style.display = 'none';
  setStatus('Cámara detenida', false);

  // Limpiar overlay
  ctxOvrl.clearRect(0, 0, canvasOvrl.width, canvasOvrl.height);
}

function resizeCanvases() {
  const w = video.videoWidth  || 640;
  const h = video.videoHeight || 480;
  canvasProc.width  = w; canvasProc.height  = h;
  canvasOvrl.width  = w; canvasOvrl.height  = h;
}

// ─────────────────────────────────────────────
// VOLTEAR CÁMARA
// ─────────────────────────────────────────────
async function flipCam() {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  // el video frontal se espeja con CSS, el trasero no
  video.style.transform = state.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
  detenerCamara();
  await iniciarCamara();
}

// ─────────────────────────────────────────────
// RASTREO
// ─────────────────────────────────────────────
function toggleTracking() {
  state.rastreando = !state.rastreando;
  const btn = document.getElementById('btn-track');
  if (state.rastreando) {
    state.t0 = null;
    state.prevX = null; state.prevY = null;
    state.prevV = null; state.prevT = null;
    state.prevFrame = null;
    btn.textContent = '⏹ Detener rastreo';
    btn.classList.add('btn-active');
    setStatus('RASTREANDO', true, true);
    document.getElementById('cam-legend').style.display = 'flex';
  } else {
    btn.textContent = '◎ Activar rastreo';
    btn.classList.remove('btn-active');
    setStatus('EN VIVO', true, false);
    document.getElementById('cam-legend').style.display = 'none';
  }
}

function setColorMode(mode) {
  state.colorMode = mode;
  document.querySelectorAll('.color-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.color === mode)
  );
}

function updateSensib() {
  state.sensibilidad = parseInt(document.getElementById('sensib').value);
  document.getElementById('sensib-val').textContent = state.sensibilidad;
}

// ─────────────────────────────────────────────
// LOOP DE VIDEO — se llama cada frame (~30-60fps)
// ─────────────────────────────────────────────
function videoLoop() {
  if (!state.camaraActiva) return;
  state.animId = requestAnimationFrame(videoLoop);

  if (video.readyState < 2) return;

  // Dibujar frame en canvas de proceso (oculto)
  resizeCanvases();
  ctxProc.save();
  // Espejo horizontal para que coordenadas coincidan con overlay
  if (state.facingMode === 'user') {
    ctxProc.translate(canvasProc.width, 0);
    ctxProc.scale(-1, 1);
  }
  ctxProc.drawImage(video, 0, 0, canvasProc.width, canvasProc.height);
  ctxProc.restore();

  if (!state.rastreando) {
    // Solo mostrar overlay limpio
    ctxOvrl.clearRect(0, 0, canvasOvrl.width, canvasOvrl.height);
    return;
  }

  // ── Obtener píxeles ──
  const imgData = ctxProc.getImageData(0, 0, canvasProc.width, canvasProc.height);
  const pixels  = imgData.data;
  const W = canvasProc.width;
  const H = canvasProc.height;

  let cx = null, cy = null;

  if (state.colorMode === 'motion') {
    [cx, cy] = detectarMovimiento(pixels, W, H);
  } else {
    [cx, cy] = detectarColor(pixels, W, H, state.colorMode);
  }

  // ── Dibujar overlay ──
  ctxOvrl.clearRect(0, 0, W, H);

  // Cuadrícula de referencia sutil
  dibujarGrilla(ctxOvrl, W, H);

  if (cx !== null) {
    const ahora = performance.now() / 1000;
    if (!state.t0) state.t0 = ahora;
    const t = ahora - state.t0;

    procesarPunto(cx, cy, t);
    dibujarCentroide(ctxOvrl, cx, cy, W, H);
    dibujarTrayectoriaOverlay(ctxOvrl);
  } else {
    // Sin detección
    dibujarMensaje(ctxOvrl, W, H, '⚠ Sin objeto detectado');
  }
}

// ─────────────────────────────────────────────
// DETECCIÓN POR MOVIMIENTO (frame diff)
// ─────────────────────────────────────────────
function detectarMovimiento(pixels, W, H) {
  if (!state.prevFrame || state.prevFrame.length !== pixels.length) {
    state.prevFrame = new Uint8ClampedArray(pixels);
    return [null, null];
  }

  const umbral = state.sensibilidad * 2;
  let sumX = 0, sumY = 0, count = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dr = Math.abs(pixels[i]   - state.prevFrame[i]);
      const dg = Math.abs(pixels[i+1] - state.prevFrame[i+1]);
      const db = Math.abs(pixels[i+2] - state.prevFrame[i+2]);
      const diff = (dr + dg + db) / 3;
      if (diff > umbral) {
        sumX += x; sumY += y; count++;
      }
    }
  }

  state.prevFrame = new Uint8ClampedArray(pixels);

  if (count < 200) return [null, null];  // muy poco movimiento
  return [Math.round(sumX / count), Math.round(sumY / count)];
}

// ─────────────────────────────────────────────
// DETECCIÓN POR COLOR (HSV)
// ─────────────────────────────────────────────
function detectarColor(pixels, W, H, colorMode) {
  const range = COLOR_RANGES[colorMode];
  if (!range) return [null, null];

  let sumX = 0, sumY = 0, count = 0;
  const minS = range.sMin / 255;
  const minV = range.vMin / 255;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = pixels[i] / 255;
      const g = pixels[i+1] / 255;
      const b = pixels[i+2] / 255;

      const [h, s, v] = rgbToHsv(r, g, b);

      let inRange = false;
      if (colorMode === 'red') {
        inRange = ((h >= 0 && h <= range.hMax) || (h >= 350 && h <= 360)) && s >= minS && v >= minV;
      } else {
        inRange = h >= range.hMin && h <= range.hMax && s >= minS && v >= minV;
      }

      if (inRange) {
        sumX += x; sumY += y; count++;
      }
    }
  }

  const minPx = Math.max(80, state.sensibilidad * 5);
  if (count < minPx) return [null, null];
  return [Math.round(sumX / count), Math.round(sumY / count)];
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min  = Math.min(r, g, b);
  const d    = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, v];
}

// ─────────────────────────────────────────────
// PROCESAMIENTO FÍSICO
// ─────────────────────────────────────────────
function procesarPunto(cx, cy, t) {
  const esc = getEscala(); // m/px

  // Convertir px → metros (origen en centro del frame)
  const W = canvasProc.width;
  const H = canvasProc.height;
  const xM = (cx - W / 2) * esc;
  const yM = (H / 2 - cy) * esc;  // Y invertida para que arriba sea positivo

  // Velocidad por diferencias finitas
  let vx = 0, vy = 0, v = 0;
  if (state.prevX !== null && state.prevT !== null) {
    const dt = t - state.prevT;
    if (dt > 0.001) {
      vx = (xM - state.prevX) / dt;
      vy = (yM - state.prevY) / dt;
      v  = Math.sqrt(vx * vx + vy * vy);
    }
  }

  // Aceleración por diferencias finitas de v
  let a = 0;
  if (state.prevV !== null && state.prevT !== null) {
    const dt = t - state.prevT;
    if (dt > 0.001) {
      a = (v - state.prevV) / dt;
    }
  }

  // Distancia total recorrida
  let dist = 0;
  if (state.posicionesX.length > 0) {
    const px = state.posicionesX[state.posicionesX.length - 1];
    const py = state.posicionesY[state.posicionesY.length - 1];
    dist = Math.sqrt((xM - px) ** 2 + (yM - py) ** 2);
  }
  const distTotal = (state.trayectoria.length > 1)
    ? state.trayectoria.slice(1).reduce((acc, p, i) => {
        const prev = state.trayectoria[i];
        return acc + Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
      }, 0)
    : 0;

  // Guardar
  state.tiempos.push(t);
  state.posicionesX.push(xM);
  state.posicionesY.push(yM);
  state.velocidades.push(v);
  state.aceleraciones.push(a);
  state.trayectoria.push({ x: xM, y: yM });

  state.prevX = xM; state.prevY = yM;
  state.prevV = v;  state.prevT = t;

  // Clasificar movimiento
  const tipo = clasificar();

  // Actualizar UI
  document.getElementById('m-pos').textContent  = xM.toFixed(3);
  document.getElementById('m-vel').textContent  = v.toFixed(3);
  document.getElementById('m-acc').textContent  = a.toFixed(3);
  document.getElementById('m-time').textContent = t.toFixed(2);
  document.getElementById('m-dist').textContent = distTotal.toFixed(3);

  const pill = document.getElementById('tipo-pill');
  pill.textContent  = tipo.label;
  pill.className    = 'tipo-pill ' + tipo.css;

  // Actualizar gráficas (cada 3 frames para no saturar)
  if (state.tiempos.length % 3 === 0) {
    actualizarGraficas();
  }

  // Actualizar trayectoria
  actualizarTrayectoria();
}

// ─────────────────────────────────────────────
// CLASIFICACIÓN DEL MOVIMIENTO
// ─────────────────────────────────────────────
function clasificar() {
  const n = state.aceleraciones.length;
  if (n < 5) return { label: 'Calculando...', css: '' };

  const ventana = Math.min(20, n);
  const aVals   = state.aceleraciones.slice(-ventana);
  const aMed    = aVals.reduce((s, v) => s + v, 0) / aVals.length;

  if (Math.abs(aMed) < 0.3) {
    return { label: 'MRU — Velocidad constante', css: 'mru' };
  } else if (Math.abs(aMed + 9.81) < 2.0) {
    return { label: 'Caída libre — g ≈ 9.81 m/s²', css: 'caida' };
  } else {
    return { label: `MRUV — a ≈ ${aMed.toFixed(2)} m/s²`, css: 'mruv' };
  }
}

// ─────────────────────────────────────────────
// DIBUJO DEL OVERLAY
// ─────────────────────────────────────────────
function dibujarGrilla(ctx, W, H) {
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  const paso = 80;
  for (let x = 0; x < W; x += paso) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += paso) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Ejes centrales
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();
}

let trayPts = [];  // puntos en px para overlay

function dibujarCentroide(ctx, cx, cy, W, H) {
  // Guardar punto para estela
  trayPts.push({ x: cx, y: cy });
  if (trayPts.length > 120) trayPts.shift();

  // Estela
  if (trayPts.length > 1) {
    for (let i = 1; i < trayPts.length; i++) {
      const alpha = i / trayPts.length;
      ctx.strokeStyle = `rgba(239,159,39,${alpha * 0.7})`;
      ctx.lineWidth   = 2 * alpha;
      ctx.beginPath();
      ctx.moveTo(trayPts[i-1].x, trayPts[i-1].y);
      ctx.lineTo(trayPts[i].x,   trayPts[i].y);
      ctx.stroke();
    }
  }

  // Círculo exterior pulsante
  ctx.strokeStyle = 'rgba(239,159,39,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.stroke();

  // Círculo interior
  ctx.fillStyle = 'rgba(239,159,39,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Crosshair
  ctx.strokeStyle = 'rgba(239,159,39,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 18, cy); ctx.lineTo(cx + 18, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy + 18); ctx.stroke();

  // Coordenadas en pantalla
  const esc = getEscala();
  const xM = ((cx - W/2) * esc).toFixed(3);
  const yM = ((H/2 - cy) * esc).toFixed(3);
  ctx.fillStyle = 'rgba(11,12,16,.7)';
  ctx.fillRect(cx + 14, cy - 22, 130, 20);
  ctx.fillStyle = '#EF9F27';
  ctx.font = '11px Space Mono, monospace';
  ctx.fillText(`x:${xM}m  y:${yM}m`, cx + 18, cy - 7);
}

function dibujarTrayectoriaOverlay() {
  // Ya dibujada dentro de dibujarCentroide como estela
}

function dibujarMensaje(ctx, W, H, msg) {
  ctx.fillStyle = 'rgba(239,159,39,0.15)';
  ctx.fillRect(W/2 - 130, H/2 - 18, 260, 36);
  ctx.fillStyle = '#EF9F27';
  ctx.font = '13px Space Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(msg, W/2, H/2 + 5);
  ctx.textAlign = 'left';
}

// ─────────────────────────────────────────────
// GRÁFICAS CHART.JS
// ─────────────────────────────────────────────
const GRID_CLR = 'rgba(255,255,255,.06)';
const TICK_CLR = '#454760';

function mkChart(id, color, yLbl) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [], borderColor: color, borderWidth: 2,
        pointRadius: 0, tension: 0.3, fill: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: TICK_CLR, maxTicksLimit: 6, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_CLR },
          title: { display: true, text: 't (s)', color: TICK_CLR, font: { size: 10 } },
        },
        y: {
          ticks: { color: TICK_CLR, maxTicksLimit: 5, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_CLR },
          title: { display: true, text: yLbl, color: TICK_CLR, font: { size: 10 } },
        },
      },
    },
  });
}

const chartX = mkChart('chartX', '#5DCAA5', 'x (m)');
const chartV = mkChart('chartV', '#85B7EB', 'v (m/s)');
const chartA = mkChart('chartA', '#EF9F27', 'a (m/s²)');

function actualizarGraficas() {
  const n = state.tiempos.length;
  if (n === 0) return;

  // Submuestrear si hay muchos puntos
  const paso = n > 300 ? Math.floor(n / 300) : 1;
  const indices = [];
  for (let i = 0; i < n; i += paso) indices.push(i);

  const labels = indices.map(i => state.tiempos[i].toFixed(2));

  const update = (chart, vals) => {
    chart.data.labels = labels;
    chart.data.datasets[0].data = indices.map(i => parseFloat(vals[i].toFixed(4)));
    chart.update('none');
  };

  update(chartX, state.posicionesX);
  update(chartV, state.velocidades);
  update(chartA, state.aceleraciones);
}

// ─────────────────────────────────────────────
// TRAYECTORIA 2D (scatter)
// ─────────────────────────────────────────────
let chartTray = null;

function initTrayectoria() {
  const ctx = document.getElementById('chartTray').getContext('2d');
  chartTray = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Trayectoria',
        data: [],
        borderColor: '#EF9F27',
        backgroundColor: 'rgba(239,159,39,.4)',
        pointRadius: 2,
        showLine: true,
        tension: 0.3,
        borderWidth: 1.5,
      }],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: TICK_CLR, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_CLR },
          title: { display: true, text: 'x (m)', color: TICK_CLR },
        },
        y: {
          ticks: { color: TICK_CLR, font: { size: 10, family: 'Space Mono' } },
          grid:  { color: GRID_CLR },
          title: { display: true, text: 'y (m)', color: TICK_CLR },
        },
      },
    },
  });
}

function actualizarTrayectoria() {
  if (!chartTray) return;
  const n = state.trayectoria.length;
  if (n === 0) return;
  const paso = n > 200 ? Math.floor(n / 200) : 1;
  const pts = [];
  for (let i = 0; i < n; i += paso) {
    pts.push({ x: parseFloat(state.trayectoria[i].x.toFixed(4)),
               y: parseFloat(state.trayectoria[i].y.toFixed(4)) });
  }
  chartTray.data.datasets[0].data = pts;
  chartTray.update('none');
}

function limpiarTrayectoria() {
  trayPts = [];
  if (chartTray) { chartTray.data.datasets[0].data = []; chartTray.update(); }
}

// ─────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────
function resetDatos() {
  state.tiempos = []; state.posicionesX = []; state.posicionesY = [];
  state.velocidades = []; state.aceleraciones = [];
  state.trayectoria = [];
  state.prevX = null; state.prevY = null;
  state.prevV = null; state.prevT = null;
  state.t0    = null;
  state.prevFrame = null;
  trayPts = [];

  ['m-pos','m-vel','m-acc','m-dist'].forEach(id =>
    document.getElementById(id).textContent = '—'
  );
  document.getElementById('m-time').textContent = '0.0';
  document.getElementById('tipo-pill').textContent = '—';
  document.getElementById('tipo-pill').className  = 'tipo-pill';

  [chartX, chartV, chartA].forEach(c => {
    c.data.labels = []; c.data.datasets[0].data = []; c.update();
  });
  limpiarTrayectoria();
}

// ─────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────
function setStatus(msg, dotLive, dotTrack) {
  document.getElementById('status-text').textContent = msg;
  const dot = document.querySelector('.status-dot');
  dot.className = 'status-dot';
  if (dotTrack) dot.classList.add('track');
  else if (dotLive) dot.classList.add('live');
}

// ─────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTrayectoria();
  updateCalib();
  setStatus('Listo — presiona Iniciar cámara', false);
});

// Exponer funciones al HTML
window.toggleCamara  = toggleCamara;
window.toggleTracking= toggleTracking;
window.resetDatos    = resetDatos;
window.flipCam       = flipCam;
window.setColorMode  = setColorMode;
window.updateSensib  = updateSensib;
window.limpiarTrayectoria = limpiarTrayectoria;
