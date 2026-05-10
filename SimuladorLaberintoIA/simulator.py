# -*- coding: utf-8 -*-
"""
Lógica del simulador: un paso = leer sensores, actualizar mapa, decidir acción, ejecutar.
Soporta los 6 tipos de agente y método de búsqueda (BFS/A*) donde aplique.
"""

import time
from config import GRID_ROWS, GRID_COLS, CELL_WALL, CELL_GOAL, CELL_FREE, CELL_START
from world import World
from agent_state import AgentState
from agent_types import (
    programmed_agent,
    reactive_agent,
    model_based_agent,
    goal_based_agent,
    utility_based_agent,
    learning_agent,
    QLearningAgent,
)
from search import count_explored_bfs, count_explored_astar


# Claves de los 6 tipos de agente (para combo)
AGENT_TYPE_KEYS = [
    "programado",
    "reactivo",
    "modelo",
    "objetivos",
    "utilidad",
    "aprende",
]

# Tipos que usan algoritmo de búsqueda (BFS/A*)
AGENT_TYPES_USING_SEARCH = ["modelo", "objetivos", "utilidad"]

SEARCH_METHODS = ["bfs", "astar"]

AGENT_TYPES = {
    "programado": programmed_agent,
    "reactivo": reactive_agent,
    "modelo": model_based_agent,
    "objetivos": goal_based_agent,
    "utilidad": utility_based_agent,
    "aprende": learning_agent,
}


class Simulator:
    def __init__(self):
        self.world = World()
        self.world.load_default_maze()
        sr, sc = self.world.start_pos
        self.agent_state = AgentState(sr, sc)
        self.goal_pos = self.world.goal_pos
        self.agent_type_name = "objetivos"
        self.search_algorithm = "astar"
        self.running = False
        self.finished = False
        self.won = False
        self.current_actions = []
        self.total_movements = 0
        self.nodes_explored_last = 0
        self.path_length_last = 0
        self.start_time = None
        self.elapsed_seconds = 0.0
        self.q_agent = QLearningAgent(alpha=0.2, gamma=0.95, epsilon=0.2)
        self._last_pos_before_step = None

    def reset(self):
        """Reinicia solo el agente (posición, mapa conocido) sin cambiar el laberinto."""
        sr, sc = self.world.start_pos
        self.agent_state = AgentState(sr, sc)
        self.goal_pos = self.world.goal_pos
        self.running = False
        self.finished = False
        self.won = False
        self.current_actions = []
        self.total_movements = 0
        self.nodes_explored_last = 0
        self.path_length_last = 0
        self.start_time = None
        self.elapsed_seconds = 0.0
        self.q_agent.last_s = None
        self.q_agent.last_a = None
        self._last_pos_before_step = None

    def load_default_maze_and_reset(self):
        self.world.load_default_maze()
        self.reset()

    def move_start_to(self, row: int, col: int):
        self.world.set_start(row, col)
        self.agent_state.row, self.agent_state.col = row, col
        self.agent_state.orientation = 0
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                self.agent_state.known_grid[r][c] = 0
        self.agent_state.known_grid[row][col] = CELL_START
        self.agent_state.movements_count = 0
        self.running = False
        self.finished = False
        self.won = False
        self.current_actions = []

    def set_agent_type(self, name: str):
        if name in AGENT_TYPES:
            self.agent_type_name = name

    def set_search_algorithm(self, algo: str):
        if algo in SEARCH_METHODS:
            self.search_algorithm = algo

    def read_sensors_and_update_map(self):
        r, c = self.agent_state.position()
        cell_type = self.world.get_cell(r, c)
        self.agent_state.mark_cell(r, c, cell_type)
        fr, fc = self.agent_state.get_forward_cell()
        if 0 <= fr < GRID_ROWS and 0 <= fc < GRID_COLS:
            forward_type = self.world.get_cell(fr, fc)
            self.agent_state.mark_cell(fr, fc, forward_type)

    def get_next_actions(self):
        fn = AGENT_TYPES.get(self.agent_type_name)
        if not fn:
            return ["turn_right"]
        if self.agent_type_name == "objetivos":
            return goal_based_agent(self.agent_state, self.world, self.goal_pos, self.search_algorithm)
        if self.agent_type_name == "modelo":
            return model_based_agent(self.agent_state, self.world, self.goal_pos, self.search_algorithm)
        if self.agent_type_name == "utilidad":
            return utility_based_agent(self.agent_state, self.world, self.goal_pos, self.search_algorithm)
        if self.agent_type_name == "aprende":
            return learning_agent(self.agent_state, self.world, self.goal_pos, self.q_agent)
        return fn(self.agent_state, self.world, self.goal_pos)

    def step(self):
        if self.finished or not self.running:
            return
        if self.start_time is None:
            self.start_time = time.perf_counter()

        self._last_pos_before_step = self.agent_state.position()
        self.read_sensors_and_update_map()

        if not self.current_actions:
            self.current_actions = self.get_next_actions()
            if self.agent_type_name in AGENT_TYPES_USING_SEARCH:
                from search import bfs, astar
                grid_known = lambda r, c: self.agent_state.is_transitable(r, c)
                if self.search_algorithm == "bfs":
                    self.nodes_explored_last = count_explored_bfs(
                        grid_known, self.agent_state.position(), self.goal_pos, GRID_ROWS, GRID_COLS
                    )
                    path = bfs(grid_known, self.agent_state.position(), self.goal_pos, GRID_ROWS, GRID_COLS)
                else:
                    self.nodes_explored_last = count_explored_astar(
                        grid_known, self.agent_state.position(), self.goal_pos, GRID_ROWS, GRID_COLS
                    )
                    path = astar(grid_known, self.agent_state.position(), self.goal_pos, GRID_ROWS, GRID_COLS)
                self.path_length_last = len(path)

        if not self.current_actions:
            self.running = False
            if self.agent_type_name == "aprende" and self._last_pos_before_step and self.q_agent.last_s is not None:
                self.q_agent.update(self.agent_state.position(), -0.1, self.goal_pos)
            return

        action = self.current_actions.pop(0)
        if action == "stop":
            self.finished = True
            self.won = self.agent_state.position() == self.goal_pos
            self.running = False
            self.elapsed_seconds = time.perf_counter() - self.start_time
            if self.agent_type_name == "aprende":
                self.q_agent.update(self.agent_state.position(), 10.0 if self.won else -0.1, self.goal_pos)
            return
        if action == "forward":
            fr, fc = self.agent_state.get_forward_cell()
            if self.world.is_valid_move(fr, fc):
                self.agent_state.move_forward()
                self.read_sensors_and_update_map()
                if self.agent_type_name == "aprende":
                    self.q_agent.update(self.agent_state.position(), -0.1, self.goal_pos)
            else:
                self.agent_state.mark_cell(fr, fc, CELL_WALL)
                if self.agent_type_name == "aprende":
                    self.q_agent.update(self.agent_state.position(), -1.0, self.goal_pos)
        elif action == "turn_left":
            self.agent_state.turn_left()
            if self.agent_type_name == "aprende":
                self.q_agent.update(self.agent_state.position(), -0.02, self.goal_pos)
        elif action == "turn_right":
            self.agent_state.turn_right()
            if self.agent_type_name == "aprende":
                self.q_agent.update(self.agent_state.position(), -0.02, self.goal_pos)
        elif action == "turn_around":
            self.agent_state.turn_around()
            if self.agent_type_name == "aprende":
                self.q_agent.update(self.agent_state.position(), -0.02, self.goal_pos)

        self.total_movements = self.agent_state.movements_count
        if self.agent_state.position() == self.goal_pos:
            self.finished = True
            self.won = True
            self.running = False
            self.elapsed_seconds = time.perf_counter() - self.start_time
            if self.agent_type_name == "aprende":
                self.q_agent.update(self.agent_state.position(), 10.0, self.goal_pos)
