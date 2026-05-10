# -*- coding: utf-8 -*-
"""
Mundo del laberinto: cuadrícula 8x8, tipos de celda y consultas para sensores simulados.
"""

from config import (
    GRID_ROWS,
    GRID_COLS,
    CELL_FREE,
    CELL_WALL,
    CELL_START,
    CELL_GOAL,
    CELL_UNKNOWN,
    DELTAS,
)


class World:
    """Mundo real (laberinto): estado verdadero de cada celda."""

    def __init__(self):
        self.grid = [[CELL_FREE for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
        self.start_pos = (0, 0)
        self.goal_pos = (7, 7)

    def set_cell(self, row: int, col: int, cell_type: int) -> None:
        if 0 <= row < GRID_ROWS and 0 <= col < GRID_COLS:
            self.grid[row][col] = cell_type

    def get_cell(self, row: int, col: int) -> int:
        if 0 <= row < GRID_ROWS and 0 <= col < GRID_COLS:
            return self.grid[row][col]
        return CELL_WALL  # Fuera de límites = pared

    def is_valid_move(self, row: int, col: int) -> bool:
        """True si la celda es transitable (no pared)."""
        t = self.get_cell(row, col)
        return t != CELL_WALL

    def set_start(self, row: int, col: int) -> None:
        r, c = self.start_pos
        self.set_cell(r, c, CELL_FREE)
        self.start_pos = (row, col)
        self.set_cell(row, col, CELL_START)

    def set_goal(self, row: int, col: int) -> None:
        r, c = self.goal_pos
        self.set_cell(r, c, CELL_FREE)
        self.goal_pos = (row, col)
        self.set_cell(row, col, CELL_GOAL)

    def load_default_maze(self) -> None:
        """Laberinto por defecto: algunas paredes, inicio (0,0), objetivo (7,7)."""
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                self.grid[r][c] = CELL_FREE
        self.set_start(0, 0)
        self.set_goal(7, 7)
        # Paredes de ejemplo
        walls = [
            (1, 1), (1, 2), (1, 3),
            (2, 3), (3, 3), (4, 3),
            (4, 4), (4, 5), (5, 5), (6, 5),
            (2, 5), (2, 6), (3, 6),
            (5, 1), (5, 2), (6, 2), (7, 2),
        ]
        for (r, c) in walls:
            self.set_cell(r, c, CELL_WALL)

    def get_neighbor(self, row: int, col: int, direction: int):
        """Devuelve (row, col) del vecino en esa dirección."""
        dr, dc = DELTAS[direction]
        return row + dr, col + dc

    def get_cell_type_name(self, row: int, col: int) -> str:
        from config import CELL_TYPE_NAMES
        return CELL_TYPE_NAMES.get(self.get_cell(row, col), "UNKNOWN")
