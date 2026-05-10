# Cómo funciona el proyecto — Explicación paso a paso

Este documento explica **cómo funciona** el simulador y la lógica del agente, de forma que puedas entenderlo y explicarlo (por ejemplo en la presentación del proyecto).

---

## 1. Idea general

- Hay un **laberinto** de 8×8 celdas. Cada celda puede ser: **libre** (camino), **pared**, **inicio** (verde) o **objetivo** (azul).
- Un **agente** (el robot en la simulación, un triángulo en pantalla) está en una celda y tiene una **orientación** (hacia dónde “mira”: norte, este, sur, oeste).
- El agente **no conoce** el laberinto al inicio. Lo va **descubriendo** con “sensores”: en la simulación, al estar en una celda “lee” el tipo de esa celda y de la celda que tiene **al frente**.
- La **meta** es llegar a la celda objetivo. Según el tipo de agente, decide **avanzar**, **girar** o **parar** usando solo lo que ha descubierto hasta ese momento.

---

## 2. Partes del sistema

### 2.1 El mundo (`world.py`)

- Es el **laberinto real**: una matriz 8×8 donde cada posición tiene un tipo (libre, pared, inicio, objetivo).
- El programa sabe la verdad del mundo (por ejemplo dónde están las paredes), pero el **agente** no: el agente solo conoce lo que ha “visto” con sus sensores.

### 2.2 El estado del agente (`agent_state.py`)

- **Posición:** fila y columna actuales `(row, col)`.
- **Orientación:** hacia dónde apunta (0=Norte, 1=Este, 2=Sur, 3=Oeste). Norte = arriba en la cuadrícula.
- **Mapa interno:** otra matriz 8×8 donde el agente guarda lo que **cree** que hay en cada celda: desconocido, libre, pared, inicio u objetivo. Este mapa se va llenando con las lecturas de los sensores.

El agente usa este mapa interno para decidir; no usa directamente el “mundo real”.

### 2.3 Los “sensores” (simulados en `simulator.py`)

En el robot físico serían el **sensor de color** (tipo de celda) y el **ultrasónico** (obstáculo delante). En el simulador se imitan así:

1. **Celda actual:** se mira en el mundo real qué tipo tiene la celda donde está el agente y se **actualiza el mapa interno** con ese tipo (libre, pared, inicio, objetivo).
2. **Celda delante:** según la orientación del agente, se mira la celda que está “al frente” y también se actualiza el mapa interno con ese tipo. Así el agente “descubre” si hay pared delante sin moverse.

Con eso el agente **no pasa por celdas que ya sabe que son pared**: las tiene marcadas en su mapa y no planificará movimientos hacia ellas.

### 2.4 Los tipos de agente (`agent_types.py`)

Cada tipo recibe: estado del agente (posición, orientación, mapa interno), mundo (para leer el tipo de celda cuando hace falta) y posición del objetivo. **Devuelve una lista de acciones**, por ejemplo `["forward"]`, `["turn_right"]`, `["stop"]`.

- **Reactivo:**  
  - Si la celda actual es el **objetivo** → `["stop"]`.  
  - Si la celda **delante** es pared (o no se puede pasar) → `["turn_right"]`.  
  - Si no → `["forward"]`.  
  No usa el mapa para planificar; solo reacciona a “¿qué hay aquí?” y “¿qué hay delante?”.

- **Basado en objetivos (A* o BFS):**  
  - Si ya está en el objetivo → `["stop"]`.  
  - Si no, usa el **mapa interno** (solo celdas conocidas y no pared) y ejecuta **BFS** o **A*** desde la posición actual hasta el objetivo.  
  - Obtiene una **secuencia de direcciones** (por ejemplo: Este, Este, Sur, Sur…).  
  - La primera acción que necesita es: o bien **girar** para quedar mirando en esa dirección, o bien **avanzar** si ya mira en esa dirección. Por eso devuelve una o más acciones (por ejemplo `["turn_right"]` o `["forward"]`).  
  Cada vez que el agente da un paso y actualiza el mapa (por ejemplo descubre una pared), en el **siguiente** paso se vuelve a calcular la ruta; así se hace la **replanificación** cuando descubre obstáculos.

- **Basado en modelo:**  
  Igual que el basado en objetivos con A*: mantiene el mapa interno (que se actualiza con los sensores) y usa A* sobre ese mapa para decidir el siguiente movimiento.

### 2.5 Los algoritmos de búsqueda (`search.py`)

- **BFS (Breadth-First Search):** explora por “capas”. Desde la posición actual, encuentra un camino hasta el objetivo explorando primero todos los vecinos a un paso, luego a dos pasos, etc. Garantiza camino **más corto** en número de pasos (con coste 1 por movimiento).
- **A*:** igual pero usa una **heurística** (distancia Manhattan al objetivo) para explorar primero los nodos “más prometedores”. Suele explorar **menos nodos** que BFS y también da un camino óptimo con la heurística elegida.

Entrada: función que dice si una celda `(r, c)` es **transitable** (en nuestro caso: en el mapa interno no es pared, y las celdas desconocidas se consideran transitables para poder explorar), posición de inicio y posición del objetivo.  
Salida: lista de **direcciones** (Norte, Este, Sur, Oeste) que forman el camino desde el inicio hasta el objetivo. El agente traduce la primera dirección en una acción concreta: girar o avanzar.

---

## 3. Un paso del simulador (qué pasa cuando “avanza” el tiempo)

Cada vez que el simulador ejecuta **un paso** (por ejemplo cada 400 ms en la interfaz), ocurre lo siguiente, en este orden:

1. **Leer sensores y actualizar mapa**  
   - Se mira en el mundo real el tipo de la celda actual y de la celda delante.  
   - Se actualiza el **mapa interno** del agente con esa información (celda actual y celda delante marcadas como libre, pared, inicio u objetivo).

2. **Decidir la siguiente acción**  
   - Si no hay ya una acción en cola, se llama al **tipo de agente** actual (reactivo, objetivos con A*, objetivos con BFS, o modelo).  
   - El agente devuelve una lista de acciones (p. ej. `["forward"]` o `["turn_right", "turn_right"]`).  
   - Para los agentes basados en objetivos/modelo, además se calculan las **métricas** (nodos explorados por BFS o A*, longitud de la ruta calculada) y se guardan para mostrarlas en pantalla.

3. **Ejecutar una acción**  
   - Se toma la **primera** acción de la lista y se ejecuta:  
     - **forward:** si la celda delante es transitable en el mundo real, el agente se mueve una celda en esa dirección y se vuelve a actualizar el mapa con los sensores; si no, se marca la celda delante como pared y no se mueve.  
     - **turn_left** / **turn_right:** se cambia la orientación del agente (y se cuenta como “movimiento” para las métricas).  
     - **stop:** se termina la ejecución (éxito si está en el objetivo).  
   - Si la lista tenía más acciones (p. ej. dos giros), la siguiente se ejecutará en el **próximo** paso.

4. **Comprobar si llegó al objetivo**  
   - Si después de moverse la posición del agente es la celda objetivo, se marca la simulación como terminada y éxito.

Así, en cada paso el agente **siempre** primero actualiza su creencia del mundo (mapa interno) y luego decide y ejecuta **una** acción física (avanzar o girar). La repetición de pasos hace que explore el laberinto y, en los modos basados en objetivos/modelo, que **replanifique** cuando descubre nuevas paredes.

---

## 4. Cómo se evita “pasar por paredes”

- **En el mapa:** las celdas que el agente ha marcado como **pared** (por sensores o por intentar avanzar y encontrar obstáculo) no se consideran transitables. BFS y A* **nunca** devuelven un camino que pase por esas celdas.
- **Al ejecutar “forward”:** antes de mover al agente se comprueba en el **mundo real** si la celda delante es transitable. Si es pared, no se mueve y se marca esa celda como pared en el mapa interno.
- Por tanto el agente **nunca** entra en una celda que ya sabe que es pared, y en la simulación nunca se le deja avanzar a una celda que en el mundo es pared.

---

## 5. La interfaz (Pygame, `main.py`)

- **Bucle principal:** cada frame se comprueba si hay que ejecutar un paso del simulador (cada 400 ms) y se redibuja todo.
- **Dibujo:**  
  - Se dibuja la cuadrícula 8×8 usando el **mapa interno** del agente (colores: desconocido, libre, pared, inicio, objetivo).  
  - Se dibuja el agente (triángulo) en su posición actual y con su orientación.  
  - Se muestra el panel de métricas (movimientos, tiempo, nodos explorados, longitud de ruta, estado, modo).
- **Botones:**  
  - Iniciar/Pausar: activa o pausa la ejecución de pasos.  
  - Reiniciar: vuelve a cargar el laberinto por defecto y reinicia el agente.  
  - Los demás: eligen el tipo de agente (reactivo, objetivos A*, objetivos BFS, modelo). El cambio tiene efecto en el siguiente paso (o al reiniciar).

---

## 6. Resumen en una frase

**Cada paso el agente (1) actualiza su mapa con lo que “ven” sus sensores, (2) decide la siguiente acción según su tipo (reactivo o búsqueda A*/BFS sobre el mapa), y (3) ejecuta una acción (avanzar o girar); así explora el laberinto, evita paredes y llega al objetivo.**

---

## 7. Del simulador al robot físico

- En el **robot real**, la **misma lógica** puede estar en la PC: la PC tiene el mapa interno, ejecuta BFS o A*, y decide “avanzar” o “girar 90°”.
- La PC envía al ESP32 comandos como `MOVER:ADELANTE` o `MOVER:DERECHA`.
- El ESP32 mueve los motores y lee los sensores (color y ultrasónico) y envía a la PC: `CELDA:...` y `DIST:...`.
- La PC actualiza el mapa con esa información y calcula el siguiente comando. Así el “cerebro” (agente y búsqueda) sigue en la PC y el robot solo ejecuta movimientos y reporta sensores; el **funcionamiento** (actualizar mapa → decidir → ejecutar una acción) es el mismo que en el simulador.
