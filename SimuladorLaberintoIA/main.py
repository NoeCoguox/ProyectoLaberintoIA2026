# -*- coding: utf-8 -*-
"""
Simulador de laberinto 8x8 - Proyecto IA 2026.
Ejecutar: python main.py
"""

import pygame
import sys
import math
from config import (
    GRID_ROWS,
    GRID_COLS,
    CELL_SIZE_PX,
    WINDOW_WIDTH,
    WINDOW_HEIGHT,
    FPS,
    COLORS,
    NORTH,
    EAST,
    SOUTH,
    WEST,
    CELL_FREE,
    CELL_WALL,
    CELL_START,
    CELL_GOAL,
)
from simulator import Simulator, AGENT_TYPE_KEYS, AGENT_TYPES_USING_SEARCH, SEARCH_METHODS

# Inicializar Pygame
pygame.init()
screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
pygame.display.set_caption("Simulador Laberinto IA - Proyecto 2026")
clock = pygame.time.Clock()
# Fuentes legibles (fallback a por defecto si no existe la del sistema)
try:
    font = pygame.font.SysFont("Segoe UI", 15)
    font_title = pygame.font.SysFont("Segoe UI", 18)
except Exception:
    font = pygame.font.Font(None, 22)
    font_title = pygame.font.Font(None, 28)

# Panel derecho
PANEL_X = GRID_COLS * CELL_SIZE_PX + 12
PANEL_WIDTH = WINDOW_WIDTH - PANEL_X - 12
LINE_H = 20
TITLE_H = 24

# Etiquetas para combo de tipo de agente
AGENT_LABELS = {
    "programado": "1. Sistema programado",
    "reactivo": "2. Reactivo simple",
    "modelo": "3. Basado en modelo",
    "objetivos": "4. Basado en objetivos",
    "utilidad": "5. Basado en utilidad",
    "aprende": "6. Agente que aprende",
}
SEARCH_LABELS = {"bfs": "BFS", "astar": "A*"}

# Herramientas de edición del laberinto (solo cuando la simulación está detenida)
TOOL_WALL = "pared"
TOOL_PATH = "camino"
TOOL_START = "inicio"
TOOL_GOAL = "objetivo"
TOOLS = [
    (TOOL_WALL, "Pared/Obst.", (220, 40, 40)),
    (TOOL_PATH, "Camino", (255, 255, 255)),
    (TOOL_START, "Inicio", (40, 180, 70)),
    (TOOL_GOAL, "Objetivo", (40, 80, 220)),
]


def cell_at_pixel(px: int, py: int):
    """Devuelve (row, col) de la celda bajo el pixel, o None si está fuera de la cuadrícula."""
    if px < 0 or py < 0:
        return None
    c = px // CELL_SIZE_PX
    r = py // CELL_SIZE_PX
    if r < 0 or r >= GRID_ROWS or c < 0 or c >= GRID_COLS:
        return None
    return (r, c)


def apply_tool(sim: Simulator, r: int, c: int, tool: str):
    """Aplica la herramienta en la celda (r, c). Solo cuando sim no está en ejecución."""
    if sim.running:
        return
    w = sim.world
    if tool == TOOL_WALL:
        if (r, c) == w.start_pos:
            w.set_start(0, 0)
            sim.move_start_to(0, 0)
        if (r, c) == w.goal_pos:
            w.set_goal(7, 7)
            sim.goal_pos = (7, 7)
        w.set_cell(r, c, CELL_WALL)
    elif tool == TOOL_PATH:
        if (r, c) == w.start_pos:
            w.set_start(0, 0)
            sim.move_start_to(0, 0)
        if (r, c) == w.goal_pos:
            w.set_goal(7, 7)
            sim.goal_pos = (7, 7)
        w.set_cell(r, c, CELL_FREE)
    elif tool == TOOL_START:
        sim.move_start_to(r, c)
    elif tool == TOOL_GOAL:
        w.set_cell(r, c, CELL_FREE)
        w.set_goal(r, c)
        sim.goal_pos = (r, c)


def draw_grid(sim: Simulator):
    """
    Dibuja el laberinto real con paredes y obstáculos siempre visibles.
    Colores: Verde = Inicio, Blanco = Camino, Rojo = Pared/Obstáculo, Azul = Objetivo.
    """
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            cell_type = sim.world.get_cell(r, c)
            color = COLORS.get(cell_type, (255, 255, 255))
            rect = pygame.Rect(c * CELL_SIZE_PX, r * CELL_SIZE_PX, CELL_SIZE_PX, CELL_SIZE_PX)
            pygame.draw.rect(screen, color, rect)
            border_color = (40, 40, 40) if cell_type == CELL_WALL else (90, 90, 90)
            border_w = 2 if cell_type == CELL_WALL else 1
            pygame.draw.rect(screen, border_color, rect, border_w)


def _rotate_pt(px: float, py: float, angle_rad: float):
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return (px * c - py * s, px * s + py * c)


def draw_agent(sim: Simulator):
    """Dibuja el agente como carro/robot (vista superior, orientado según dirección)."""
    r, c = sim.agent_state.position()
    ori = sim.agent_state.orientation
    cx = c * CELL_SIZE_PX + CELL_SIZE_PX // 2
    cy = r * CELL_SIZE_PX + CELL_SIZE_PX // 2
    # Orientación: 0=Norte (arriba), 1=Este, 2=Sur, 3=Oeste -> ángulo en rad (N=0, E=-90°)
    angle = -ori * (math.pi / 2)
    # Carro en coordenadas locales (frente = +y hacia arriba en pantalla = -y local)
    w, h = CELL_SIZE_PX * 0.42, CELL_SIZE_PX * 0.32
    # Cuerpo: rectángulo redondeado (esquinas en local)
    body_pts = [(-w/2, -h/2), (w/2, -h/2), (w/2, h/2), (-w/2, h/2)]
    body_rot = [_rotate_pt(x, y, angle) for x, y in body_pts]
    body_screen = [(cx + x, cy + y) for x, y in body_rot]
    pygame.draw.polygon(screen, (60, 75, 95), body_screen)
    pygame.draw.polygon(screen, (40, 52, 70), body_screen, 2)
    # Parabrisas / frente (rectángulo pequeño delante)
    fw, fh = w * 0.5, h * 0.4
    front_pts = [(-fw/2, -h/2 - fh*0.3), (fw/2, -h/2 - fh*0.3), (fw/2, -h/2), (-fw/2, -h/2)]
    front_rot = [_rotate_pt(x, y, angle) for x, y in front_pts]
    front_screen = [(cx + x, cy + y) for x, y in front_rot]
    pygame.draw.polygon(screen, (90, 120, 150), front_screen)
    pygame.draw.polygon(screen, (40, 52, 70), front_screen, 1)
    # Ruedas: dos atrás (en local: parte trasera del cuerpo)
    wheel_w, wheel_h = w * 0.24, h * 0.45
    for wx in (-w/2 + wheel_w/2, w/2 - wheel_w/2):
        wy = h / 2
        wpts = [(-wheel_w/2, -wheel_h/2), (wheel_w/2, -wheel_h/2), (wheel_w/2, wheel_h/2), (-wheel_w/2, wheel_h/2)]
        wrot = [_rotate_pt(wx + x, wy + y, angle) for x, y in wpts]
        wsc = [(cx + x, cy + y) for x, y in wrot]
        pygame.draw.polygon(screen, (25, 25, 28), wsc)
        pygame.draw.polygon(screen, (15, 15, 18), wsc, 1)


def draw_panel(sim: Simulator, buttons: list, tool_rects: list, current_tool: str, default_maze_rect: pygame.Rect,
               agent_combo_rect: pygame.Rect, agent_combo_open: bool, agent_option_rects: list,
               search_combo_rect: pygame.Rect, search_combo_open: bool, search_option_rects: list,
               show_search_combo: bool):
    """Panel derecho: leyenda, métricas, herramientas, combos y botones. Textos completos y alineados."""
    y = 16
    # Leyenda
    t = font_title.render("Colores", True, (0, 0, 0))
    screen.blit(t, (PANEL_X, y))
    y += TITLE_H
    legend = [
        ("Verde = Inicio", (40, 180, 70)),
        ("Blanco = Camino", (255, 255, 255)),
        ("Rojo = Pared/Obst.", (220, 40, 40)),
        ("Azul = Objetivo", (40, 80, 220)),
    ]
    for label, col in legend:
        pygame.draw.rect(screen, col, pygame.Rect(PANEL_X, y - 1, 14, 14))
        pygame.draw.rect(screen, (80, 80, 80), pygame.Rect(PANEL_X, y - 1, 14, 14), 1)
        screen.blit(font.render(label, True, (0, 0, 0)), (PANEL_X + 20, y - 1))
        y += LINE_H
    y += 8
    # Métricas
    t = font_title.render("Métricas", True, (0, 0, 0))
    screen.blit(t, (PANEL_X, y))
    y += TITLE_H
    lines = [
        f"Movimientos: {sim.agent_state.movements_count}",
        f"Tiempo: {sim.elapsed_seconds:.1f} s" if sim.start_time else "Tiempo: 0.0 s",
        f"Nodos explorados: {sim.nodes_explored_last}",
        f"Long. ruta: {sim.path_length_last}",
        "Estado: " + ("Objetivo alcanzado!" if sim.won else ("En ejecución" if sim.running else "Detenido")),
        "Modo: " + AGENT_LABELS.get(sim.agent_type_name, sim.agent_type_name),
    ]
    for line in lines:
        txt = font.render(line, True, (0, 0, 0))
        screen.blit(txt, (PANEL_X, y))
        y += LINE_H
    y += 10
    # Editar laberinto
    screen.blit(font.render("Editar (clic en cuadrícula)", True, (0, 0, 0)), (PANEL_X, y))
    y += LINE_H + 4
    for rect, tool_key, label, col in tool_rects:
        pygame.draw.rect(screen, col, rect)
        pygame.draw.rect(screen, (0, 0, 0) if tool_key == current_tool else (80, 80, 80), rect, 3 if tool_key == current_tool else 1)
        lbl = "Pared" if tool_key == TOOL_WALL else ("Objet." if tool_key == TOOL_GOAL else label)
        screen.blit(font.render(lbl, True, (0, 0, 0) if col != (255, 255, 255) else (80, 80, 80)), (rect.x + 4, rect.y + 4))
    y += 32
    pygame.draw.rect(screen, (255, 220, 180), default_maze_rect)
    pygame.draw.rect(screen, (80, 80, 80), default_maze_rect, 1)
    screen.blit(font.render("Lab. por defecto", True, (0, 0, 0)), (default_maze_rect.x + 8, default_maze_rect.y + 6))
    y += 36
    # Combo Tipo de agente (etiqueta encima, texto completo en caja)
    screen.blit(font.render("Tipo de agente", True, (0, 0, 0)), (PANEL_X, agent_combo_rect.y - 18))
    pygame.draw.rect(screen, (255, 255, 255), agent_combo_rect)
    pygame.draw.rect(screen, (60, 60, 60), agent_combo_rect, 2)
    lbl_agent = AGENT_LABELS.get(sim.agent_type_name, sim.agent_type_name)
    screen.blit(font.render(lbl_agent, True, (0, 0, 0)), (agent_combo_rect.x + 6, agent_combo_rect.y + 5))
    if agent_combo_open:
        for rect, key in agent_option_rects:
            pygame.draw.rect(screen, (240, 248, 255), rect)
            pygame.draw.rect(screen, (100, 100, 100), rect, 1)
            screen.blit(font.render(AGENT_LABELS.get(key, key), True, (0, 0, 0)), (rect.x + 6, rect.y + 4))
    # Combo Búsqueda
    if show_search_combo:
        screen.blit(font.render("Método de búsqueda", True, (0, 0, 0)), (PANEL_X, search_combo_rect.y - 18))
        pygame.draw.rect(screen, (255, 255, 255), search_combo_rect)
        pygame.draw.rect(screen, (60, 60, 60), search_combo_rect, 2)
        screen.blit(font.render(SEARCH_LABELS.get(sim.search_algorithm, sim.search_algorithm), True, (0, 0, 0)), (search_combo_rect.x + 6, search_combo_rect.y + 5))
        if search_combo_open:
            for rect, key in search_option_rects:
                pygame.draw.rect(screen, (240, 248, 255), rect)
                pygame.draw.rect(screen, (100, 100, 100), rect, 1)
                screen.blit(font.render(SEARCH_LABELS.get(key, key), True, (0, 0, 0)), (rect.x + 6, rect.y + 4))
    # Botones
    for rect, label in buttons:
        pygame.draw.rect(screen, (200, 220, 255), rect)
        pygame.draw.rect(screen, (80, 80, 80), rect, 1)
        screen.blit(font.render(label, True, (0, 0, 0)), (rect.x + 8, rect.y + 6))


def main():
    sim = Simulator()
    current_tool = TOOL_WALL
    tw, th = 42, 28
    edit_section_y = 328
    tool_rects = []
    for i, (tool_key, label, col) in enumerate(TOOLS):
        rx = PANEL_X + (i % 2) * (tw + 4)
        ry = edit_section_y + 22 + (i // 2) * (th + 4)
        tool_rects.append((pygame.Rect(rx, ry, tw, th), tool_key, label, col))
    default_maze_rect = pygame.Rect(PANEL_X, edit_section_y + 22 + 2 * (th + 4) + 8, 260, 28)
    # Combos: tipo de agente y método de búsqueda (ancho suficiente para textos completos)
    combo_h, combo_w = 26, 260
    start_y = default_maze_rect.bottom + 14
    agent_combo_rect = pygame.Rect(PANEL_X, start_y, combo_w, combo_h)
    agent_combo_open = False
    agent_option_rects = []
    for i, key in enumerate(AGENT_TYPE_KEYS):
        agent_option_rects.append((pygame.Rect(PANEL_X, start_y + combo_h + i * 22, combo_w, 22), key))
    search_combo_rect = pygame.Rect(PANEL_X, start_y + 38, combo_w, combo_h)
    search_combo_open = False
    search_option_rects = [(pygame.Rect(PANEL_X, start_y + 38 + combo_h + i * 22, combo_w, 22), k) for i, k in enumerate(SEARCH_METHODS)]
    # Botones Iniciar y Reiniciar
    btn_w, btn_h = 280, 30
    start_rect = pygame.Rect(PANEL_X, start_y + 92, btn_w, btn_h)
    reset_rect = pygame.Rect(PANEL_X, start_y + 92 + 34, btn_w, btn_h)
    buttons = [(start_rect, "Iniciar / Pausar"), (reset_rect, "Reiniciar")]
    step_delay = 0
    STEP_INTERVAL_MS = 400
    grid_rect = pygame.Rect(0, 0, GRID_COLS * CELL_SIZE_PX, GRID_ROWS * CELL_SIZE_PX)
    show_search_combo = sim.agent_type_name in AGENT_TYPES_USING_SEARCH

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            if event.type == pygame.MOUSEBUTTONDOWN:
                pos = event.pos
                if grid_rect.collidepoint(pos) and not sim.running:
                    cell = cell_at_pixel(pos[0], pos[1])
                    if cell:
                        apply_tool(sim, cell[0], cell[1], current_tool)
                    agent_combo_open = False
                    search_combo_open = False
                for rect, tool_key, label, col in tool_rects:
                    if rect.collidepoint(pos):
                        current_tool = tool_key
                        break
                if default_maze_rect.collidepoint(pos):
                    sim.load_default_maze_and_reset()
                elif agent_combo_rect.collidepoint(pos):
                    agent_combo_open = not agent_combo_open
                    search_combo_open = False
                elif agent_combo_open:
                    for rect, key in agent_option_rects:
                        if rect.collidepoint(pos):
                            sim.set_agent_type(key)
                            if not sim.running:
                                sim.reset()
                            agent_combo_open = False
                            show_search_combo = key in AGENT_TYPES_USING_SEARCH
                            break
                elif show_search_combo and search_combo_rect.collidepoint(pos):
                    search_combo_open = not search_combo_open
                    agent_combo_open = False
                elif show_search_combo and search_combo_open:
                    for rect, key in search_option_rects:
                        if rect.collidepoint(pos):
                            sim.set_search_algorithm(key)
                            if not sim.running:
                                sim.reset()
                            search_combo_open = False
                            break
                elif start_rect.collidepoint(pos):
                    if sim.finished:
                        sim.reset()
                    sim.running = not sim.running
                elif reset_rect.collidepoint(pos):
                    sim.reset()
                else:
                    agent_combo_open = False
                    search_combo_open = False

        show_search_combo = sim.agent_type_name in AGENT_TYPES_USING_SEARCH
        if sim.running and not sim.finished:
            step_delay += clock.get_time()
            if step_delay >= STEP_INTERVAL_MS:
                step_delay = 0
                sim.step()

        screen.fill((240, 240, 245))
        draw_grid(sim)
        draw_agent(sim)
        draw_panel(sim, buttons, tool_rects, current_tool, default_maze_rect,
                   agent_combo_rect, agent_combo_open, agent_option_rects,
                   search_combo_rect, search_combo_open, search_option_rects,
                   show_search_combo)
        pygame.display.flip()
        clock.tick(FPS)


if __name__ == "__main__":
    main()
