# -*- coding: utf-8 -*-
"""
Algoritmos de búsqueda: BFS y A* para planificación de rutas en el laberinto.
"""

from collections import deque
import heapq
from config import NORTH, EAST, SOUTH, WEST, DELTAS, CELL_WALL


def get_neighbors(row: int, col: int):
    """Genera vecinos (arriba, abajo, izq, der) como (r, c)."""
    for direction in (NORTH, EAST, SOUTH, WEST):
        dr, dc = DELTAS[direction]
        yield (row + dr, col + dc), direction


def bfs(grid_known, start: tuple, goal: tuple, rows: int, cols: int):
    """
    Búsqueda en anchura.
    grid_known: función (r, c) -> True si la celda está explorada y no es obstáculo (transitable).
    start, goal: (row, col).
    Devuelve: lista de direcciones (NORTH, EAST, ...) desde start hasta goal, o [] si no hay camino.
    """
    if start == goal:
        return []
    visited = {start}
    queue = deque([(start, [])])
    while queue:
        (r, c), path = queue.popleft()
        for (nr, nc), direction in get_neighbors(r, c):
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if not grid_known(nr, nc):
                continue
            if (nr, nc) in visited:
                continue
            visited.add((nr, nc))
            new_path = path + [direction]
            if (nr, nc) == goal:
                return new_path
            queue.append(((nr, nc), new_path))
    return []


def manhattan(r1: int, c1: int, r2: int, c2: int) -> int:
    return abs(r1 - r2) + abs(c1 - c2)


def astar(grid_known, start: tuple, goal: tuple, rows: int, cols: int):
    """
    A* con heurística Manhattan.
    grid_known: función (r, c) -> True si transitable.
    Devuelve: lista de direcciones desde start hasta goal, o [] si no hay camino.
    """
    if start == goal:
        return []
    gr, gc = goal
    # (f, g, (r, c), path)
    # f = g + h
    h0 = manhattan(start[0], start[1], gr, gc)
    open_set = [(h0, 0, start, [])]
    visited = {start}
    while open_set:
        f, g, (r, c), path = heapq.heappop(open_set)
        for (nr, nc), direction in get_neighbors(r, c):
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if not grid_known(nr, nc):
                continue
            if (nr, nc) == goal:
                return path + [direction]
            if (nr, nc) in visited:
                continue
            visited.add((nr, nc))
            new_g = g + 1
            h = manhattan(nr, nc, gr, gc)
            new_f = new_g + h
            heapq.heappush(open_set, (new_f, new_g, (nr, nc), path + [direction]))
    return []


def count_explored_bfs(grid_known, start: tuple, goal: tuple, rows: int, cols: int) -> int:
    """Cuenta nodos explorados por BFS (para métricas)."""
    if start == goal:
        return 0
    visited = {start}
    queue = deque([start])
    while queue:
        r, c = queue.popleft()
        for (nr, nc), _ in get_neighbors(r, c):
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if not grid_known(nr, nc):
                continue
            if (nr, nc) in visited:
                continue
            visited.add((nr, nc))
            if (nr, nc) == goal:
                return len(visited)
            queue.append((nr, nc))
    return len(visited)


def count_explored_astar(grid_known, start: tuple, goal: tuple, rows: int, cols: int) -> int:
    """Cuenta nodos explorados por A* (nodos extraídos de open/closed)."""
    if start == goal:
        return 0
    gr, gc = goal
    open_set = [(manhattan(start[0], start[1], gr, gc), 0, start)]
    closed = set()
    while open_set:
        f, g, (r, c) = heapq.heappop(open_set)
        if (r, c) in closed:
            continue
        closed.add((r, c))
        if (r, c) == goal:
            return len(closed)
        for (nr, nc), _ in get_neighbors(r, c):
            if nr < 0 or nr >= rows or nc < 0 or nc >= cols:
                continue
            if not grid_known(nr, nc):
                continue
            if (nr, nc) in closed:
                continue
            new_g = g + 1
            h = manhattan(nr, nc, gr, gc)
            heapq.heappush(open_set, (new_g + h, new_g, (nr, nc)))
    return len(closed)
