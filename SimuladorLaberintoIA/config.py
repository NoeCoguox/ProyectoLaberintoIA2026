# -*- coding: utf-8 -*-
"""
Configuración del simulador: dimensiones, colores y constantes.
"""

# Cuadrícula
GRID_ROWS = 8
GRID_COLS = 8
CELL_SIZE_PX = 60  # Tamaño de cada celda en píxeles en pantalla

# Tipos de celda (igual que en el documento de proyecto)
CELL_UNKNOWN = 0
CELL_FREE = 1
CELL_WALL = 2
CELL_START = 3
CELL_GOAL = 4

# Nombres para sensores (color reportado al agente)
CELL_TYPE_NAMES = {
    CELL_UNKNOWN: "UNKNOWN",
    CELL_FREE: "PATH",
    CELL_WALL: "WALL",
    CELL_START: "START",
    CELL_GOAL: "GOAL",
}

# Orientaciones: 0=Norte, 1=Este, 2=Sur, 3=Oeste
NORTH, EAST, SOUTH, WEST = 0, 1, 2, 3
DIRECTION_NAMES = ["NORTH", "EAST", "SOUTH", "WEST"]

# Movimientos: (delta_row, delta_col) para cada dirección
DELTAS = {
    NORTH: (-1, 0),
    EAST: (0, 1),
    SOUTH: (1, 0),
    WEST: (0, -1),
}

# Colores Pygame (R, G, B) — identificación por color (coherente con documento del proyecto)
# Verde = Inicio, Blanco = Camino, Rojo = Pared/Obstáculo, Azul = Objetivo
COLORS = {
    CELL_UNKNOWN: (120, 120, 120),
    CELL_FREE: (255, 255, 255),    # Blanco = camino transitable
    CELL_WALL: (220, 40, 40),     # Rojo = pared/obstáculo (no transitable)
    CELL_START: (40, 180, 70),    # Verde = inicio
    CELL_GOAL: (40, 80, 220),     # Azul = objetivo
}

# Colores para "mapa descubierto por el agente" (más suave)
COLORS_DISCOVERED = {
    CELL_UNKNOWN: (180, 180, 180),
    CELL_FREE: (220, 255, 220),
    CELL_WALL: (255, 150, 150),
    CELL_START: (100, 220, 140),
    CELL_GOAL: (100, 160, 255),
}

# Ventana (panel derecho más ancho para textos completos)
PANEL_WIDTH_PX = 340
WINDOW_WIDTH = GRID_COLS * CELL_SIZE_PX + PANEL_WIDTH_PX
WINDOW_HEIGHT = max(GRID_ROWS * CELL_SIZE_PX + 40, 720)
FPS = 30

# Umbral simulado para "obstáculo delante" (distancia en celdas)
DISTANCE_OBSTACLE_THRESHOLD = 1  # Si la celda delante es WALL, distancia = 0
