# Sistema de Monitoreo de Movimiento — Física 1
**Universidad Mariano Gálvez de Guatemala**

## Archivos del proyecto

```
fisica1-proyecto/
├── index.html   ← Página principal (abre este en el navegador)
├── style.css    ← Estilos visuales
├── app.js       ← Lógica de simulación y gráficas
├── monitor.py   ← Versión Python con OpenCV (opcional)
└── README.md    ← Este archivo
```

## Cómo usar localmente

1. Descarga los 3 archivos: `index.html`, `style.css`, `app.js`
2. Ponlos en la misma carpeta
3. Abre `index.html` en tu navegador (Chrome o Firefox recomendado)

## Cómo subir a la web (GRATIS)

### Opción A — GitHub Pages (recomendado)
1. Crea cuenta en https://github.com
2. Crea un repositorio nuevo (ej: `fisica1-proyecto`)
3. Sube los 3 archivos al repo
4. Ve a Settings → Pages → Branch: main → Save
5. Tu sitio estará en: `https://tu-usuario.github.io/fisica1-proyecto`

### Opción B — Netlify (más fácil)
1. Ve a https://netlify.com
2. Arrastra y suelta la carpeta con los 3 archivos
3. ¡Listo! Te da un link público instantáneamente

### Opción C — Vercel
1. Ve a https://vercel.com
2. Importa desde GitHub o arrastra la carpeta
3. Deploy automático

## Versión Python (OpenCV)

Para la demostración con video real:

```bash
pip install opencv-python matplotlib numpy
python monitor.py
```

Ajusta el rango HSV en `monitor.py` según el color de tu objeto.

## Criterios cubiertos

| Criterio | Implementado |
|---|---|
| Captura de datos (simulación) | ✅ |
| Cálculo de posición | ✅ x = x₀ + v₀t + ½at² |
| Cálculo de velocidad | ✅ v = v₀ + at |
| Cálculo de aceleración | ✅ constante o discreta |
| Clasificación MRU/MRUV/Caída libre | ✅ |
| Gráfica x(t) | ✅ Tiempo real |
| Gráfica v(t) | ✅ Tiempo real |
| Gráfica a(t) | ✅ Tiempo real |
| Validación con caso real | ✅ Caída libre 20m |
| Márgenes de error | ✅ Tabla comparativa |
| Interfaz amigable | ✅ |
| Código documentado | ✅ |

---
Proyecto Final · Física 1 · Escuela de Ingeniería en Sistemas plan fin de semana
