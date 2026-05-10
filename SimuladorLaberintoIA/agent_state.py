# -*- coding: utf-8 -*-
"""
Estado del agente: posición, orientación y mapa interno (lo que ha descubierto).
"""

from config import (
    GRID_ROWS,
    GRID_COLS,
    CELL_UNKNOWN,
    CELL_FREE,
    CELL_WALL,
    CELL_START,
    CELL_GOAL,
    NORTH,
    EAST,
    SOUTH,
    WEST,
    DELTAS,
    CELL_TYPE_NAMES,
)


class AgentState:
    def __init__(self, start_row: int, start_col: int):
        self.row = start_row
        self.col = start_col
        self.orientation = NORTH
        # Mapa interno: lo que el agente cree del mundo (desconocido hasta que lo explora)
        self.known_grid = [[CELL_UNKNOWN for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]
        self.known_grid[start_row][start_col] = CELL_START
        self.movements_count = 0
        self.nodes_explored_last_search = 0

    def position(self):
        return (self.row, self.col)

    def get_forward_cell(self):
        """Posición de la celda que está 'al frente' según la orientación."""
        dr, dc = DELTAS[self.orientation]
        return self.row + dr, self.col + dc

    def is_known(self, r: int, c: int) -> bool:
        if 0 <= r < GRID_ROWS and 0 <= c < GRID_COLS:
            return self.known_grid[r][c] != CELL_UNKNOWN
        return False

    def is_transitable(self, r: int, c: int) -> bool:
        """True si la celda conocida no es pared. Desconocido se considera transitable para explorar."""
        if 0 <= r < GRID_ROWS and 0 <= c < GRID_COLS:
            return self.known_grid[r][c] != CELL_WALL
        return False

    def mark_cell(self, r: int, c: int, cell_type: int) -> None:
        if 0 <= r < GRID_ROWS and 0 <= c < GRID_COLS:
            self.known_grid[r][c] = cell_type

    def move_forward(self) -> bool:
        """Avanza una celda en la dirección actual. Devuelve True si el movimiento es válido (lo hace)."""
        nr, nc = self.get_forward_cell()
        if 0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS and self.known_grid[nr][nc] != CELL_WALL:
            self.row, self.col = nr, nc
            self.movements_count += 1
            return True
        return False

    def turn_left(self) -> None:
        self.orientation = (self.orientation - 1) % 4
        self.movements_count += 1

    def turn_right(self) -> None:
        self.orientation = (self.orientation + 1) % 4
        self.movements_count += 1

    def turn_around(self) -> None:
        self.orientation = (self.orientation + 2) % 4
        self.movements_count += 1

    def direction_to_move(self, direction: int) -> None:
        """Gira hasta quedar en 'direction' y luego podría avanzar (no avanza aquí)."""
        while self.orientation != direction:
            self.turn_right()

    def get_cell_type_name(self, r: int, c: int) -> str:
        return CELL_TYPE_NAMES.get(self.known_grid[r][c], "UNKNOWN")
