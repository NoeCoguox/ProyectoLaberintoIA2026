# Simulador Laberinto IA — Versión Web

Versión web del simulador (HTML, CSS y JavaScript). Misma lógica que la aplicación de escritorio: 6 tipos de agente, BFS/A*, edición del laberinto y métricas.

## Cómo ejecutarlo

1. **Abrir directamente:** Abre `index.html` en tu navegador (doble clic o arrastrar al navegador).
2. **Con servidor local (recomendado):** Por ejemplo con Python:
   ```bash
   cd web
   python -m http.server 8080
   ```
   Luego entra en: http://localhost:8080

## Uso

- **Tipo de agente:** selector con los 6 tipos (programado, reactivo, modelo, objetivos, utilidad, aprende).
- **Método de búsqueda:** solo visible para modelo, objetivos y utilidad (BFS o A*).
- **Editar laberinto:** elige Pared, Camino, Inicio u Objetivo y haz clic en una celda (con la simulación parada).
- **Lab. por defecto:** restaura el laberinto de ejemplo.
- **Iniciar / Pausar** y **Reiniciar:** control de la simulación.

## Archivos

- `index.html` — Estructura y cuadrícula 8×8.
- `styles.css` — Estilos (fuente Inter, panel, grid, botones).
- `app.js` — Mundo, agente, BFS, A*, tipos de agente, Q-learning y eventos.
