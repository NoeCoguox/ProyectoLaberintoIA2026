# -*- coding: utf-8 -*-
"""
Tipos de agente: los 6 del proyecto IA 2026.
1. Sistema programado  2. Reactivo simple  3. Basado en modelo
4. Basado en objetivos  5. Basado en utilidad  6. Agente que aprende
"""

import random
from config import NORTH, EAST, SOUTH, WEST, CELL_GOAL, CELL_WALL, GRID_ROWS, GRID_COLS
from search import bfs, astar


def grid_known_transitable(agent_state):
    def fn(r, c):
        return agent_state.is_transitable(r, c)
    return fn


# ----- 1. Sistema programado: regla fija (mano derecha / seguir pared derecha) -----
def programmed_agent(agent_state, world, _goal_pos):
    """
    Sin usar percepción para decidir meta; programa fijo: intentar derecha, luego adelante.
    Regla de la mano derecha: girar derecha si puede, si no adelante, si no izquierda.
    """
    r, c = agent_state.position()
    if world.get_cell(r, c) == CELL_GOAL:
        return ["stop"]
    ori = agent_state.orientation
    # Orden: derecha (relativa), adelante, izquierda, atrás
    dr, dc = agent_state.get_forward_cell()
    from config import DELTAS
    right_ori = (ori + 1) % 4
    dro, dco = DELTAS[right_ori]
    rr, rc = r + dro, c + dco
    if 0 <= rr < GRID_ROWS and 0 <= rc < GRID_COLS and world.is_valid_move(rr, rc):
        return ["turn_right"]
    if world.is_valid_move(dr, dc):
        return ["forward"]
    left_ori = (ori - 1) % 4
    lr, lc = r + DELTAS[left_ori][0], c + DELTAS[left_ori][1]
    if 0 <= lr < GRID_ROWS and 0 <= lc < GRID_COLS and world.is_valid_move(lr, lc):
        return ["turn_left"]
    return ["turn_right"]


# ----- 2. Agente reactivo simple -----
def reactive_agent(agent_state, world, _goal_pos):
    """Reacciona solo a percepción actual: obstáculo delante -> girar; objetivo -> parar."""
    r, c = agent_state.position()
    if world.get_cell(r, c) == CELL_GOAL:
        return ["stop"]
    fr, fc = agent_state.get_forward_cell()
    if not world.is_valid_move(fr, fc):
        return ["turn_right"]
    return ["forward"]


# ----- 3. Basado en modelo (mapa interno + búsqueda) -----
def model_based_agent(agent_state, world, goal_pos, algorithm="astar"):
    return goal_based_agent(agent_state, world, goal_pos, algorithm)


# ----- 4. Basado en objetivos -----
def goal_based_agent(agent_state, world, goal_pos, algorithm="astar"):
    """Planifica con BFS o A* sobre el mapa conocido."""
    start = agent_state.position()
    if start == goal_pos:
        return ["stop"]
    grid_known = grid_known_transitable(agent_state)
    if algorithm == "bfs":
        path = bfs(grid_known, start, goal_pos, GRID_ROWS, GRID_COLS)
    else:
        path = astar(grid_known, start, goal_pos, GRID_ROWS, GRID_COLS)
    if not path:
        return ["turn_right"]
    next_direction = path[0]
    current = agent_state.orientation
    if current == next_direction:
        return ["forward"]
    diff = (next_direction - current) % 4
    if diff == 1:
        return ["turn_right"]
    if diff == 3:
        return ["turn_left"]
    if diff == 2:
        return ["turn_right", "turn_right"]
    return ["forward"]


# ----- 5. Basado en utilidad (minimizar coste / maximizar utilidad) -----
def utility_based_agent(agent_state, world, goal_pos, algorithm="astar"):
    """Maximiza utilidad (equiv. minimizar pasos); usa A* o BFS como política."""
    return goal_based_agent(agent_state, world, goal_pos, algorithm)


# ----- 6. Agente que aprende (Q-learning) -----
class QLearningAgent:
    """Tabla Q(s,a). Estado = (r,c), acciones = 0..3 (N,E,S,W)."""
    def __init__(self, alpha=0.2, gamma=0.95, epsilon=0.15):
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon
        self.Q = {}  # (r,c,a) -> float
        self.last_s = None
        self.last_a = None

    def _key(self, s, a):
        return (s[0], s[1], a)

    def get_value(self, s, a):
        return self.Q.get(self._key(s, a), 0.0)

    def best_action(self, s, valid_actions):
        if not valid_actions:
            return None
        best = max(valid_actions, key=lambda a: self.get_value(s, a))
        return best

    def choose_action(self, s, valid_actions, goal_pos):
        if not valid_actions:
            return None
        if s == goal_pos:
            return "stop"
        if random.random() < self.epsilon:
            a = random.choice(valid_actions)
        else:
            a = self.best_action(s, valid_actions)
        self.last_s = s
        self.last_a = a
        return a

    def update(self, s_next, reward, goal_pos):
        if self.last_s is None or self.last_a is None:
            return
        from config import DELTAS
        q_old = self.get_value(self.last_s, self.last_a)
        if s_next == goal_pos:
            max_next = 0.0
        else:
            next_actions = list(range(4))
            max_next = max(self.get_value(s_next, a) for a in next_actions) if next_actions else 0.0
        q_new = q_old + self.alpha * (reward + self.gamma * max_next - q_old)
        self.Q[self._key(self.last_s, self.last_a)] = q_new
        self.last_s = None
        self.last_a = None


def learning_agent(agent_state, world, goal_pos, q_agent: "QLearningAgent" = None):
    """
    Devuelve la siguiente acción usando Q-learning.
    q_agent debe ser compartido y actualizado desde el simulador con (s', reward).
    """
    from config import DELTAS
    s = agent_state.position()
    if s == goal_pos:
        return ["stop"]
    valid_actions = []
    for a in range(4):
        dr, dc = DELTAS[a]
        nr, nc = s[0] + dr, s[1] + dc
        if 0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS and world.is_valid_move(nr, nc):
            valid_actions.append(a)
    if not q_agent:
        return ["turn_right"]
    a = q_agent.choose_action(s, valid_actions, goal_pos)
    if a == "stop":
        return ["stop"]
    if a is None:
        return ["turn_right"]
    current = agent_state.orientation
    if current == a:
        return ["forward"]
    diff = (a - current) % 4
    if diff == 1:
        return ["turn_right"]
    if diff == 3:
        return ["turn_left"]
    if diff == 2:
        return ["turn_right", "turn_right"]
    return ["forward"]
