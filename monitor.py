"""
================================================
SISTEMA DE MONITOREO DE MOVIMIENTO — Física 1
monitor.py — Detección con OpenCV en tiempo real
Universidad Mariano Gálvez de Guatemala
================================================

INSTALACIÓN:
  pip install opencv-python matplotlib numpy

USO:
  python monitor.py              → usa la webcam
  python monitor.py video.mp4   → analiza un video

DETECCIÓN:
  El script detecta un objeto de color naranja por defecto.
  Cambia hsv_min y hsv_max para otro color.
"""

import sys
import time
import cv2
import numpy as np
import matplotlib.pyplot as plt


# ──────────────────────────────────────────────
# MOTOR DE CINEMÁTICA
# ──────────────────────────────────────────────
class MotorCinematico:
    def __init__(self, escala_px_m=100):
        """
        escala_px_m: cuántos píxeles equivalen a 1 metro.
        Mide un objeto de tamaño conocido en el video para calibrar.
        """
        self.escala = escala_px_m
        self.tiempos      = []
        self.posiciones   = []  # metros
        self.velocidades  = []  # m/s
        self.aceleraciones = [] # m/s²

        self._prev_x = None
        self._prev_v = None
        self._prev_t = None

    def registrar(self, px, t):
        """Registra la posición horizontal en píxeles al tiempo t."""
        x = px / self.escala  # píxeles → metros

        # Velocidad por diferencias finitas
        if self._prev_x is not None and self._prev_t is not None:
            dt = t - self._prev_t
            v  = (x - self._prev_x) / dt if dt > 0 else 0.0
        else:
            v = 0.0

        # Aceleración por diferencias finitas
        if self._prev_v is not None and self._prev_t is not None:
            dt = t - self._prev_t
            a  = (v - self._prev_v) / dt if dt > 0 else 0.0
        else:
            a = 0.0

        self.tiempos.append(t)
        self.posiciones.append(round(x, 4))
        self.velocidades.append(round(v, 4))
        self.aceleraciones.append(round(a, 4))

        self._prev_x = x
        self._prev_v = v
        self._prev_t = t

    def clasificar(self, ventana=15):
        """Clasifica el movimiento basándose en los últimos `ventana` valores."""
        if len(self.aceleraciones) < 3:
            return "Sin datos suficientes"
        a_media = np.mean(self.aceleraciones[-ventana:])
        if abs(a_media) < 0.25:
            return "MRU (Movimiento Rectilíneo Uniforme)"
        elif abs(a_media + 9.81) < 1.5:
            return "Caída libre"
        else:
            return f"MRUV (a ≈ {a_media:.2f} m/s²)"

    def ultimo(self, variable):
        data = {
            'x': self.posiciones,
            'v': self.velocidades,
            'a': self.aceleraciones,
        }[variable]
        return data[-1] if data else 0.0


# ──────────────────────────────────────────────
# DETECCIÓN DE OBJETO POR COLOR (HSV)
# ──────────────────────────────────────────────
def detectar_centroide(frame, hsv_min, hsv_max, area_min=300):
    """
    Devuelve (cx, cy) del objeto más grande dentro del rango de color.
    Devuelve (None, None) si no se detecta nada.
    """
    hsv     = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mascara = cv2.inRange(hsv, hsv_min, hsv_max)
    mascara = cv2.morphologyEx(mascara, cv2.MORPH_OPEN,
                               np.ones((5, 5), np.uint8))
    contornos, _ = cv2.findContours(mascara, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    if not contornos:
        return None, None

    mayor = max(contornos, key=cv2.contourArea)
    if cv2.contourArea(mayor) < area_min:
        return None, None

    M = cv2.moments(mayor)
    if M['m00'] == 0:
        return None, None

    cx = int(M['m10'] / M['m00'])
    cy = int(M['m01'] / M['m00'])
    return cx, cy


# ──────────────────────────────────────────────
# OVERLAY EN PANTALLA
# ──────────────────────────────────────────────
def dibujar_overlay(frame, cx, cy, motor):
    # Círculo en el objeto
    cv2.circle(frame, (cx, cy), 22, (0, 220, 110), 3)
    cv2.circle(frame, (cx, cy), 4,  (0, 220, 110), -1)

    # Panel semitransparente
    overlay = frame.copy()
    cv2.rectangle(overlay, (8, 8), (340, 160), (15, 15, 20), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    tipo = motor.clasificar()
    x    = motor.ultimo('x')
    v    = motor.ultimo('v')
    a    = motor.ultimo('a')
    t    = motor.tiempos[-1] if motor.tiempos else 0

    font  = cv2.FONT_HERSHEY_SIMPLEX
    verde = (80, 220, 130)
    blanco = (220, 220, 220)
    amarillo = (60, 220, 230)

    cv2.putText(frame, f"Tipo: {tipo}",       (16, 35),  font, 0.55, amarillo, 1)
    cv2.putText(frame, f"t  = {t:.2f} s",     (16, 65),  font, 0.55, blanco,   1)
    cv2.putText(frame, f"x  = {x:.3f} m",     (16, 90),  font, 0.55, verde,    1)
    cv2.putText(frame, f"v  = {v:.3f} m/s",   (16, 115), font, 0.55, verde,    1)
    cv2.putText(frame, f"a  = {a:.3f} m/s2",  (16, 140), font, 0.55, verde,    1)
    cv2.putText(frame, "Q para salir",         (16, 158), font, 0.38, (100,100,100), 1)


# ──────────────────────────────────────────────
# GRAFICAR RESULTADOS FINALES
# ──────────────────────────────────────────────
def graficar(motor):
    if not motor.tiempos:
        print("No hay datos para graficar.")
        return

    fig, axs = plt.subplots(3, 1, figsize=(11, 8), facecolor='#0f0f0f')
    fig.suptitle("Resultados del Análisis Cinemático — Física 1\n"
                 "Universidad Mariano Gálvez de Guatemala",
                 color='white', fontsize=13, y=0.98)

    config = [
        (motor.posiciones,    '#5DCAA5', 'Posición (m)',     'x(t)'),
        (motor.velocidades,   '#85B7EB', 'Velocidad (m/s)',  'v(t)'),
        (motor.aceleraciones, '#EF9F27', 'Aceleración (m/s²)', 'a(t)'),
    ]

    for ax, (datos, color, ylabel, titulo) in zip(axs, config):
        ax.set_facecolor('#1a1a1a')
        ax.plot(motor.tiempos, datos, color=color, linewidth=2, label=titulo)
        ax.set_ylabel(ylabel, color='white', fontsize=10)
        ax.tick_params(colors='white', labelsize=9)
        ax.set_facecolor('#1a1a2e')
        ax.grid(color='rgba(255,255,255,0.06)', linewidth=0.5)
        for spine in ax.spines.values():
            spine.set_edgecolor('#333')
        ax.legend(loc='upper right', fontsize=9,
                  facecolor='#1a1a1a', labelcolor='white', edgecolor='#333')

    axs[2].set_xlabel("Tiempo (s)", color='white', fontsize=10)
    axs[0].set_title(f"Tipo de movimiento detectado: {motor.clasificar()}",
                     color='#5DCAA5', fontsize=11, pad=6)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    salida = "resultados_movimiento.png"
    plt.savefig(salida, dpi=150, bbox_inches='tight', facecolor='#0f0f0f')
    print(f"\n✓ Gráfica guardada: {salida}")
    plt.show()


# ──────────────────────────────────────────────
# LOOP PRINCIPAL
# ──────────────────────────────────────────────
def main():
    fuente = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() \
             else (sys.argv[1] if len(sys.argv) > 1 else 0)

    cap = cv2.VideoCapture(fuente)
    if not cap.isOpened():
        print(f"Error: no se pudo abrir la fuente '{fuente}'")
        sys.exit(1)

    motor = MotorCinematico(escala_px_m=100)

    # Rango HSV para pelota/objeto NARANJA
    # Para cambiar color: usa cv2.inRange en prueba o busca rangos HSV para tu color
    hsv_min = np.array([ 5, 120, 100])
    hsv_max = np.array([25, 255, 255])

    t_inicio = None
    print("▶ Sistema iniciado. Presiona Q para salir y generar gráficas.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        ahora = time.time()
        if t_inicio is None:
            t_inicio = ahora
        t = ahora - t_inicio

        cx, cy = detectar_centroide(frame, hsv_min, hsv_max)

        if cx is not None:
            motor.registrar(cx, t)
            dibujar_overlay(frame, cx, cy, motor)
        else:
            cv2.putText(frame, "Buscando objeto...", (16, 35),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)

        cv2.imshow("Monitor de Movimiento — Fisica 1 · UMG", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    graficar(motor)


if __name__ == "__main__":
    main()
