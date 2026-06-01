// ================================================
// MONITOR DE MOVIMIENTO — Física 1 · UMG
// app.js
// ================================================

'use strict';

// ─── ESTADO ───────────────────────────────────
const S = {
  camON: false, capturando: false,
  colorMode: 'motion', sens: 30,
  t0: null, timerInterval: null,
  prevFrame: null, prevX: null, prevY: null,
  prevVx: null, prevVy: null, prevT: null,
  // Arrays de datos capturados
  T: [], X: [], Y: [], Vx: [], Vy: [], V: [], A: [],
};

const COLOR_HSV = {
  red:    { hMin:0,   hMax:12,  sMin:.4, vMin:.3 },
  orange: { hMin:12,  hMax:28,  sMin:.4, vMin:.3 },
  yellow: { hMin:28,  hMax:42,  sMin:.4, vMin:.4 },
  green:  { hMin:42,  hMax:90,  sMin:.3, vMin:.25 },
  blue:   { hMin:100, hMax:135, sMin:.3, vMin:.25 },
};

// ─── DOM ──────────────────────────────────────
const video     = document.getElementById('video');
const cProc     = document.getElementById('canvas-proc');
const cOvrl     = document.getElementById('canvas-overlay');
const ctxP      = cProc.getContext('2d', { willReadFrequently: true });
const ctxO      = cOvrl.getContext('2d');
let   animId    = null;

// ─── CALIBRACIÓN ─────────────────────────────
function escala() {
  const m  = parseFloat(document.getElementById('ref-m').value)  || 0.3;
  const px = parseFloat(document.getElementById('ref-px').value) || 100;
  return m / px;
}

function updCalib() {
  const e = escala();
  document.getElementById('calib-info').textContent =
    `Escala: ${e.toFixed(5)} m/px · ${(1/e).toFixed(1)} px/m`;
}

['ref-m','ref-px'].forEach(id => document.getElementById(id).addEventListener('input', updCalib));
updCalib();

// ─── CÁMARA ───────────────────────────────────
async function toggleCam() {
  if (S.camON) { detenerCam(); return; }
  setSt('Solicitando acceso...', '');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));

    video.srcObject = stream;
    await new Promise(r => (video.onloadedmetadata = r));
    video.play();
    S.camON = true;

    resize();
    setSt('EN VIVO', 'live');
    document.getElementById('btn-cam').textContent     = '⏹ Apagar cámara';
    document.getElementById('btn-iniciar').disabled   = false;
    document.getElementById('color-sel').style.display = 'block';
    animId = requestAnimationFrame(loop);
  } catch (e) {
    setSt('❌ ' + e.message, '');
  }
}

function detenerCam() {
  video.srcObject?.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  cancelAnimationFrame(animId);
  S.camON = false; S.capturando = false;
  setSt('Cámara apagada', '');
  document.getElementById('btn-cam').textContent    = '▶ Iniciar cámara';
  document.getElementById('btn-iniciar').disabled  = true;
  document.getElementById('btn-fin').style.display = 'none';
  document.getElementById('btn-iniciar').style.display = 'inline-block';
  document.getElementById('color-sel').style.display   = 'none';
  document.getElementById('timer-overlay').style.display = 'none';
  clearInterval(S.timerInterval);
  ctxO.clearRect(0, 0, cOvrl.width, cOvrl.height);
}

function resize() {
  const w = video.videoWidth  || 640;
  const h = video.videoHeight || 480;
  cProc.width = w; cProc.height = h;
  cOvrl.width = w; cOvrl.height = h;
}

// ─── INICIAR CAPTURA ─────────────────────────
function iniciarCaptura() {
  // Limpiar datos anteriores
  Object.assign(S, { T:[], X:[], Y:[], Vx:[], Vy:[], V:[], A:[],
    t0: null, prevFrame: null, prevX: null, prevY: null,
    prevVx: null, prevVy: null, prevT: null });

  S.capturando = true;
  S.t0 = performance.now() / 1000;

  setSt('GRABANDO', 'rec');
  document.getElementById('tipo-pill').textContent = 'Capturando...';
  document.getElementById('tipo-pill').className   = 'tipo-pill';

  // Cambiar botones
  document.getElementById('btn-iniciar').style.display  = 'none';
  document.getElementById('btn-fin').style.display      = 'inline-block';
  document.getElementById('btn-cam').disabled           = true;

  // Timer visual
  const timerEl = document.getElementById('timer-overlay');
  timerEl.style.display = 'block';
  timerEl.textContent   = '0.0';
  S.timerInterval = setInterval(() => {
    const t = (performance.now()/1000 - S.t0).toFixed(1);
    timerEl.textContent = t + 's';
  }, 100);

  // Resetear gráficas live
  [liveX, liveV, liveA].forEach(c => {
    c.data.labels = []; c.data.datasets[0].data = []; c.update();
  });
  document.getElementById('reporte').style.display = 'none';
}

// ─── FINALIZAR CAPTURA ────────────────────────
function finalizarCaptura() {
  if (S.T.length < 5) {
    alert('Se necesitan al menos 5 puntos de datos. Asegúrate de que el objeto sea visible.');
    return;
  }

  S.capturando = false;
  clearInterval(S.timerInterval);

  setSt('EN VIVO', 'live');
  document.getElementById('btn-fin').style.display      = 'none';
  document.getElementById('btn-iniciar').style.display  = 'none';
  document.getElementById('btn-reset').style.display    = 'inline-block';
  document.getElementById('btn-cam').disabled           = false;
  document.getElementById('timer-overlay').style.display = 'none';

  generarReporte();
}

// ─── LOOP DE VIDEO ────────────────────────────
function loop() {
  if (!S.camON) return;
  animId = requestAnimationFrame(loop);
  if (video.readyState < 2) return;

  resize();

  // Dibujar frame (espejado para cámara frontal)
  ctxP.save();
  ctxP.translate(cProc.width, 0);
  ctxP.scale(-1, 1);
  ctxP.drawImage(video, 0, 0, cProc.width, cProc.height);
  ctxP.restore();

  const W = cProc.width, H = cProc.height;
  const img = ctxP.getImageData(0, 0, W, H);
  const px  = img.data;

  let cx = null, cy = null;
  if (S.colorMode === 'motion') {
    [cx, cy] = detectMotion(px, W, H);
  } else {
    [cx, cy] = detectColor(px, W, H);
  }

  // Overlay
  ctxO.clearRect(0, 0, W, H);
  drawGrid(W, H);

  if (cx !== null) {
    const t = performance.now()/1000 - (S.t0 || performance.now()/1000);

    if (S.capturando) {
      registrar(cx, cy, t);
    }

    drawTarget(cx, cy, W, H);
  } else if (S.capturando) {
    drawMsg(W, H, '⚠ No se detecta el objeto — muévelo hacia la cámara');
  }
}

// ─── DETECCIÓN POR MOVIMIENTO ────────────────
function detectMotion(px, W, H) {
  if (!S.prevFrame || S.prevFrame.length !== px.length) {
    S.prevFrame = new Uint8ClampedArray(px); return [null, null];
  }
  const umbral = S.sens * 2.2;
  let sx = 0, sy = 0, n = 0;
  for (let y = 2; y < H-2; y++) {
    for (let x = 2; x < W-2; x++) {
      const i = (y*W+x)*4;
      const d = (Math.abs(px[i]-S.prevFrame[i]) +
                 Math.abs(px[i+1]-S.prevFrame[i+1]) +
                 Math.abs(px[i+2]-S.prevFrame[i+2])) / 3;
      if (d > umbral) { sx += x; sy += y; n++; }
    }
  }
  S.prevFrame = new Uint8ClampedArray(px);
  if (n < 300) return [null, null];
  return [Math.round(sx/n), Math.round(sy/n)];
}

// ─── DETECCIÓN POR COLOR ─────────────────────
function detectColor(px, W, H) {
  const r = COLOR_HSV[S.colorMode]; if (!r) return [null,null];
  let sx=0, sy=0, n=0;
  for (let y=0; y<H; y++) {
    for (let x=0; x<W; x++) {
      const i=(y*W+x)*4;
      const [h,s,v] = rgb2hsv(px[i]/255, px[i+1]/255, px[i+2]/255);
      let ok = s>=r.sMin && v>=r.vMin;
      if (S.colorMode==='red') ok = ok && (h<=r.hMax || h>=350);
      else ok = ok && h>=r.hMin && h<=r.hMax;
      if (ok) { sx+=x; sy+=y; n++; }
    }
  }
  const minPx = Math.max(60, S.sens*4);
  if (n<minPx) return [null,null];
  return [Math.round(sx/n), Math.round(sy/n)];
}

function rgb2hsv(r,g,b) {
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let h=0;
  if(d){
    if(mx===r) h=((g-b)/d+(g<b?6:0))/6;
    else if(mx===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  return [h*360, mx?d/mx:0, mx];
}

// ─── FÍSICA — REGISTRAR PUNTO ────────────────
function registrar(cx, cy, t) {
  const esc = escala();
  const W = cProc.width, H = cProc.height;

  // px → metros (origen en centro del frame)
  const xM =  (cx - W/2) * esc;
  const yM =  (H/2 - cy) * esc;   // Y positivo hacia arriba

  // Velocidad por diferencias finitas
  let vx=0, vy=0, v=0;
  if (S.prevX!==null && S.prevT!==null) {
    const dt = t - S.prevT;
    if (dt > 0.005) {
      vx = (xM - S.prevX) / dt;
      vy = (yM - S.prevY) / dt;
      v  = Math.sqrt(vx*vx + vy*vy);
    } else return; // frame demasiado cercano
  }

  // Aceleración por diferencias finitas de v
  let ax=0, ay=0, a=0;
  if (S.prevVx!==null && S.prevT!==null) {
    const dt = t - S.prevT;
    if (dt > 0.005) {
      ax = (vx - S.prevVx) / dt;
      ay = (vy - S.prevVy) / dt;
      a  = Math.sqrt(ax*ax + ay*ay) * Math.sign(ay); // signed por eje y
    }
  }

  // Guardar
  S.T.push(t); S.X.push(xM); S.Y.push(yM);
  S.Vx.push(vx); S.Vy.push(vy); S.V.push(v); S.A.push(a);

  S.prevX=xM; S.prevY=yM; S.prevVx=vx; S.prevVy=vy; S.prevT=t;

  // Actualizar UI live
  document.getElementById('lv-x').textContent     = xM.toFixed(3);
  document.getElementById('lv-v').textContent     = v.toFixed(3);
  document.getElementById('lv-a').textContent     = a.toFixed(3);
  document.getElementById('lv-t').textContent     = t.toFixed(2);
  document.getElementById('lv-frames').textContent= S.T.length;

  const cl = clasificar();
  document.getElementById('tipo-pill').textContent = cl.label;
  document.getElementById('tipo-pill').className   = 'tipo-pill ' + cl.css;

  // Actualizar gráficas live cada 4 frames
  if (S.T.length % 4 === 0) updLiveCharts();
}

// ─── CLASIFICAR ───────────────────────────────
function clasificar() {
  const n = S.A.length;
  if (n < 5) return { label:'Calculando...', css:'' };
  const win = S.A.slice(-Math.min(20,n));
  const am  = win.reduce((s,v)=>s+v,0)/win.length;
  if (Math.abs(am) < 0.3)           return { label:'MRU — Velocidad constante',  css:'mru' };
  if (Math.abs(am + 9.81) < 2.5)    return { label:'Caída libre — g ≈ 9.81 m/s²', css:'caida' };
  return { label:`MRUV — a ≈ ${am.toFixed(2)} m/s²`, css:'mruv' };
}

// ─── DIBUJO OVERLAY ───────────────────────────
const trail = [];

function drawGrid(W, H) {
  ctxO.strokeStyle = 'rgba(255,255,255,.05)';
  ctxO.lineWidth = 1;
  for(let x=0;x<W;x+=80){ctxO.beginPath();ctxO.moveTo(x,0);ctxO.lineTo(x,H);ctxO.stroke()}
  for(let y=0;y<H;y+=80){ctxO.beginPath();ctxO.moveTo(0,y);ctxO.lineTo(W,y);ctxO.stroke()}
  ctxO.strokeStyle='rgba(255,255,255,.1)';
  ctxO.beginPath();ctxO.moveTo(W/2,0);ctxO.lineTo(W/2,H);ctxO.stroke();
  ctxO.beginPath();ctxO.moveTo(0,H/2);ctxO.lineTo(W,H/2);ctxO.stroke();
}

function drawTarget(cx, cy, W, H) {
  trail.push({x:cx,y:cy});
  if(trail.length>150) trail.shift();

  // Estela
  for(let i=1;i<trail.length;i++){
    const a=i/trail.length;
    ctxO.strokeStyle=`rgba(239,159,39,${a*.7})`;
    ctxO.lineWidth=2*a;
    ctxO.beginPath();ctxO.moveTo(trail[i-1].x,trail[i-1].y);ctxO.lineTo(trail[i].x,trail[i].y);ctxO.stroke();
  }

  // Círculos
  ctxO.strokeStyle='rgba(239,159,39,.5)';ctxO.lineWidth=2;
  ctxO.beginPath();ctxO.arc(cx,cy,30,0,Math.PI*2);ctxO.stroke();
  ctxO.fillStyle='#EF9F27';
  ctxO.beginPath();ctxO.arc(cx,cy,7,0,Math.PI*2);ctxO.fill();

  // Crosshair
  ctxO.strokeStyle='rgba(239,159,39,.6)';ctxO.lineWidth=1;
  ctxO.beginPath();ctxO.moveTo(cx-22,cy);ctxO.lineTo(cx+22,cy);ctxO.stroke();
  ctxO.beginPath();ctxO.moveTo(cx,cy-22);ctxO.lineTo(cx,cy+22);ctxO.stroke();

  // Etiqueta
  const esc=escala(), W2=cProc.width, H2=cProc.height;
  const xm=((cx-W2/2)*esc).toFixed(3);
  const ym=((H2/2-cy)*esc).toFixed(3);
  ctxO.fillStyle='rgba(11,12,16,.75)';ctxO.fillRect(cx+14,cy-24,145,20);
  ctxO.fillStyle='#EF9F27';ctxO.font='11px Space Mono,monospace';
  ctxO.fillText(`x:${xm}m  y:${ym}m`,cx+18,cy-9);

  if(S.capturando){
    ctxO.fillStyle='rgba(231,76,60,.85)';ctxO.fillRect(cx+14,cy-48,145,20);
    ctxO.fillStyle='#fff';ctxO.font='10px Space Mono,monospace';
    const t=S.T.length>0?S.T[S.T.length-1].toFixed(2):'0.00';
    const v=S.V.length>0?S.V[S.V.length-1].toFixed(3):'0.000';
    ctxO.fillText(`t:${t}s  v:${v}m/s`,cx+18,cy-33);
  }
}

function drawMsg(W, H, msg) {
  ctxO.fillStyle='rgba(231,76,60,.15)';ctxO.fillRect(W/2-170,H/2-18,340,36);
  ctxO.fillStyle='#e74c4c';ctxO.font='13px Space Mono,monospace';
  ctxO.textAlign='center';ctxO.fillText(msg,W/2,H/2+5);ctxO.textAlign='left';
}

// ─── GRÁFICAS LIVE ────────────────────────────
const G={color:'rgba(255,255,255,.06)', tick:'#454760'};

function mkChart(id,color,yLbl) {
  return new Chart(document.getElementById(id),{
    type:'line',
    data:{labels:[],datasets:[{data:[],borderColor:color,borderWidth:2,pointRadius:0,tension:0.3,fill:false}]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:G.tick,maxTicksLimit:6,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:'t (s)',color:G.tick,font:{size:10}}},
        y:{ticks:{color:G.tick,maxTicksLimit:5,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:yLbl,color:G.tick,font:{size:10}}},
      },
    },
  });
}

const liveX = mkChart('cX','#5DCAA5','x (m)');
const liveV = mkChart('cV','#85B7EB','v (m/s)');
const liveA = mkChart('cA','#EF9F27','a (m/s²)');

function updLiveCharts() {
  const n=S.T.length, paso=n>300?Math.ceil(n/300):1;
  const idx=[]; for(let i=0;i<n;i+=paso) idx.push(i);
  const lbl=idx.map(i=>S.T[i].toFixed(2));
  const upd=(c,arr)=>{c.data.labels=lbl;c.data.datasets[0].data=idx.map(i=>+arr[i].toFixed(4));c.update('none')};
  upd(liveX,S.X); upd(liveV,S.V); upd(liveA,S.A);
}

// ─── REPORTE FINAL ────────────────────────────
let repX=null,repV=null,repA=null,repTray=null;

function generarReporte() {
  const n = S.T.length;
  const cl = clasificar();
  const dur = S.T[n-1] - S.T[0];

  // Submuestrear para gráficas del reporte
  const paso = Math.max(1, Math.ceil(n/200));
  const idx=[]; for(let i=0;i<n;i+=paso) idx.push(i);
  const lbl = idx.map(i=>S.T[i].toFixed(3));
  const xs  = idx.map(i=>+S.X[i].toFixed(4));
  const ys  = idx.map(i=>+S.Y[i].toFixed(4));
  const vs  = idx.map(i=>+S.V[i].toFixed(4));
  const as_ = idx.map(i=>+S.A[i].toFixed(4));

  // KPIs
  const distTotal = S.X.reduce((acc,_,i)=>i===0?0:acc+Math.sqrt((S.X[i]-S.X[i-1])**2+(S.Y[i]-S.Y[i-1])**2),0);
  const vMax = Math.max(...S.V);
  const aMed = S.A.reduce((s,v)=>s+v,0)/n;

  document.getElementById('r-x0').textContent  = S.X[0].toFixed(3);
  document.getElementById('r-xf').textContent  = S.X[n-1].toFixed(3);
  document.getElementById('r-dist').textContent= distTotal.toFixed(3);
  document.getElementById('r-vmax').textContent= vMax.toFixed(3);
  document.getElementById('r-amed').textContent= aMed.toFixed(3);

  document.getElementById('rep-subtitulo').textContent =
    `${cl.label} · duración: ${dur.toFixed(2)} s · ${n} puntos capturados`;
  const rPill = document.getElementById('rep-tipo-pill');
  rPill.textContent = cl.label;
  rPill.className   = 'tipo-pill ' + cl.css;

  // Destruir gráficas anteriores si existen
  [repX,repV,repA,repTray].forEach(c => c?.destroy());

  // Gráficas reporte
  repX = mkRepChart('rX','#5DCAA5','x (m)',lbl,xs);
  repV = mkRepChart('rV','#85B7EB','v (m/s)',lbl,vs);
  repA = mkRepChart('rA','#EF9F27','a (m/s²)',lbl,as_);

  // Trayectoria 2D
  repTray = new Chart(document.getElementById('rTray'),{
    type:'scatter',
    data:{datasets:[{
      label:'Trayectoria',
      data:idx.map(i=>({x:+S.X[i].toFixed(4),y:+S.Y[i].toFixed(4)})),
      borderColor:'#EF9F27',backgroundColor:'rgba(239,159,39,.4)',
      pointRadius:2.5,showLine:true,tension:0.3,borderWidth:1.5,
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:G.tick,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:'x (m)',color:G.tick}},
        y:{ticks:{color:G.tick,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:'y (m)',color:G.tick}},
      },
    },
  });

  // Tabla de puntos clave (cada ~10% del recorrido)
  const tbody = document.getElementById('rep-tbody');
  tbody.innerHTML='';
  const step = Math.max(1,Math.floor(n/12));
  const puntos = [0];
  for(let i=step;i<n;i+=step) puntos.push(i);
  puntos.push(n-1);
  const vistos = new Set();
  puntos.filter(i=>{ if(vistos.has(i)) return false; vistos.add(i); return true; })
    .forEach((i,row)=>{
      const dt=i>0?(S.T[i]-S.T[i-1]).toFixed(4):'—';
      const dx=i>0?(S.X[i]-S.X[i-1]).toFixed(4):'—';
      const vOk=Math.abs(S.V[i])<50;
      const aOk=Math.abs(S.A[i])<100;
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${row+1}</td>
        <td>${S.T[i].toFixed(3)}</td>
        <td>${S.X[i].toFixed(4)}</td>
        <td>${S.Y[i].toFixed(4)}</td>
        <td><span class="chip ${vOk?'chip-ok':'chip-warn'}">${S.V[i].toFixed(4)}</span></td>
        <td><span class="chip ${aOk?'chip-ok':'chip-warn'}">${S.A[i].toFixed(4)}</span></td>
        <td>${dx}</td><td>${dt}</td>`;
      tbody.appendChild(tr);
    });

  // Ecuaciones con valores reales
  const x0=S.X[0], xf=S.X[n-1], v0=S.V[0], vf=S.V[n-1];
  document.getElementById('rep-eqs').innerHTML=`
    <div class="eq-box">
      <div class="eq-tipo" style="color:#5DCAA5">DESPLAZAMIENTO</div>
      <div class="eq-f">Δx = xf − x₀</div>
      <div class="eq-res">= ${xf.toFixed(4)} − ${x0.toFixed(4)}</div>
      <div class="eq-res">= ${(xf-x0).toFixed(4)} m</div>
    </div>
    <div class="eq-box">
      <div class="eq-tipo" style="color:#85B7EB">VELOCIDAD MEDIA</div>
      <div class="eq-f">v̄ = Δx / Δt</div>
      <div class="eq-res">= ${(xf-x0).toFixed(4)} / ${dur.toFixed(4)}</div>
      <div class="eq-res">= ${((xf-x0)/dur).toFixed(4)} m/s</div>
    </div>
    <div class="eq-box">
      <div class="eq-tipo" style="color:#EF9F27">ACELERACIÓN MEDIA</div>
      <div class="eq-f">ā = Δv / Δt</div>
      <div class="eq-res">= ${(vf-v0).toFixed(4)} / ${dur.toFixed(4)}</div>
      <div class="eq-res">= ${((vf-v0)/dur).toFixed(4)} m/s²</div>
    </div>
    <div class="eq-box">
      <div class="eq-tipo" style="color:#5DCAA5">MRU VERIFICACIÓN</div>
      <div class="eq-f">x = x₀ + v₀·t</div>
      <div class="eq-res">= ${x0.toFixed(4)} + ${v0.toFixed(4)}·${dur.toFixed(4)}</div>
      <div class="eq-res">= ${(x0+v0*dur).toFixed(4)} m</div>
      <div class="eq-desc">Real: ${xf.toFixed(4)} m</div>
    </div>
    <div class="eq-box">
      <div class="eq-tipo" style="color:#85B7EB">MRUV VERIFICACIÓN</div>
      <div class="eq-f">x = x₀ + v₀t + ½at²</div>
      <div class="eq-res">= ${x0.toFixed(4)} + ${v0.toFixed(4)}·t + ½·${aMed.toFixed(4)}·t²</div>
      <div class="eq-res">t = ${dur.toFixed(4)} s → ${(x0+v0*dur+0.5*aMed*dur*dur).toFixed(4)} m</div>
      <div class="eq-desc">Real: ${xf.toFixed(4)} m</div>
    </div>
    <div class="eq-box">
      <div class="eq-tipo" style="color:#EF9F27">DISTANCIA TOTAL</div>
      <div class="eq-f">d = Σ|Δxᵢ|</div>
      <div class="eq-res">= ${distTotal.toFixed(4)} m</div>
      <div class="eq-desc">v máx = ${vMax.toFixed(4)} m/s</div>
    </div>`;

  // Mostrar reporte
  const rep = document.getElementById('reporte');
  rep.style.display = 'block';
  rep.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function mkRepChart(id,color,yLbl,labels,data) {
  return new Chart(document.getElementById(id),{
    type:'line',
    data:{labels,datasets:[{data,borderColor:color,borderWidth:2,pointRadius:0,tension:0.3,fill:false}]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:G.tick,maxTicksLimit:8,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:'t (s)',color:G.tick,font:{size:10}}},
        y:{ticks:{color:G.tick,maxTicksLimit:6,font:{size:10,family:'Space Mono'}},grid:{color:G.color},
           title:{display:true,text:yLbl,color:G.tick,font:{size:10}}},
      },
    },
  });
}

// ─── RESET TOTAL ─────────────────────────────
function resetTodo() {
  Object.assign(S,{T:[],X:[],Y:[],Vx:[],Vy:[],V:[],A:[],
    t0:null,prevFrame:null,prevX:null,prevY:null,
    prevVx:null,prevVy:null,prevT:null,capturando:false});
  trail.length=0;
  clearInterval(S.timerInterval);

  document.getElementById('reporte').style.display     = 'none';
  document.getElementById('btn-iniciar').style.display = 'inline-block';
  document.getElementById('btn-fin').style.display     = 'none';
  document.getElementById('btn-reset').style.display   = 'none';
  document.getElementById('btn-cam').disabled          = false;
  document.getElementById('timer-overlay').style.display='none';

  ['lv-x','lv-v','lv-a','lv-frames'].forEach(id=>document.getElementById(id).textContent='—');
  document.getElementById('lv-t').textContent='0.0';
  document.getElementById('tipo-pill').textContent='Esperando...';
  document.getElementById('tipo-pill').className='tipo-pill';

  [liveX,liveV,liveA].forEach(c=>{c.data.labels=[];c.data.datasets[0].data=[];c.update()});

  if(S.camON) setSt('EN VIVO','live');
  else setSt('Iniciar cámara primero','');
}

// ─── HELPERS ──────────────────────────────────
function setSt(msg,dotCls) {
  document.getElementById('stxt').textContent=msg;
  const d=document.getElementById('sdot');
  d.className='sdot'+(dotCls?' '+dotCls:'');
}

function setColor(c) {
  S.colorMode=c;
  document.querySelectorAll('.cbtn').forEach(b=>b.classList.toggle('active',b.dataset.c===c));
}

// Exponer al HTML
window.toggleCam       = toggleCam;
window.iniciarCaptura  = iniciarCaptura;
window.finalizarCaptura= finalizarCaptura;
window.resetTodo       = resetTodo;
window.setColor        = setColor;

window.addEventListener('DOMContentLoaded', updCalib);
