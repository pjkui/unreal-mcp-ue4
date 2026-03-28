import json
import random


def _structure_result(structure_name, actors, metadata=None):
    actor_summaries = [get_actor_summary(actor) for actor in actors]
    return {
        "success": True,
        "structure": structure_name,
        "actor_count": len(actor_summaries),
        "actors": actor_summaries,
        "metadata": metadata or {},
    }


def _spawn_box(actors, label, location, scale, material_path=None):
    actor = spawn_basic_shape_actor(
        label,
        location,
        scale=scale,
        shape_name="cube",
        material_identifier=material_path,
    )
    actors.append(actor)
    return actor


def _build_wall(
    actors,
    prefix,
    center,
    segments,
    segment_length,
    height,
    thickness,
    axis="x",
    material_path=None,
):
    for index in range(int(segments)):
        location = [float(center[0]), float(center[1]), float(center[2])]
        offset = (index - (float(segments) - 1.0) / 2.0) * float(segment_length)
        if axis == "x":
            location[0] += offset
            scale = [float(segment_length) / 100.0, float(thickness) / 100.0, float(height) / 100.0]
        else:
            location[1] += offset
            scale = [float(thickness) / 100.0, float(segment_length) / 100.0, float(height) / 100.0]

        _spawn_box(
            actors,
            "{0}_Wall_{1}".format(prefix, index),
            location,
            scale,
            material_path=material_path,
        )


def _build_staircase_geometry(
    actors,
    prefix,
    origin,
    steps,
    step_width,
    step_height,
    step_depth,
    material_path=None,
):
    for step_index in range(int(steps)):
        location = [
            float(origin[0]) + step_index * float(step_depth),
            float(origin[1]),
            float(origin[2]) + step_index * float(step_height),
        ]
        scale = [
            float(step_depth) / 100.0,
            float(step_width) / 100.0,
            float(step_height) / 100.0,
        ]
        _spawn_box(
            actors,
            "{0}_Step_{1}".format(prefix, step_index),
            location,
            scale,
            material_path=material_path,
        )


def _build_arch_geometry(
    actors,
    prefix,
    origin,
    span_width,
    pillar_height,
    pillar_width,
    beam_height,
    material_path=None,
):
    half_span = float(span_width) / 2.0
    half_pillar = float(pillar_width) / 2.0
    base_z = float(origin[2])
    pillar_scale = [
        float(pillar_width) / 100.0,
        float(pillar_width) / 100.0,
        float(pillar_height) / 100.0,
    ]

    _spawn_box(
        actors,
        "{0}_Pillar_L".format(prefix),
        [float(origin[0]) - half_span, float(origin[1]), base_z],
        pillar_scale,
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Pillar_R".format(prefix),
        [float(origin[0]) + half_span, float(origin[1]), base_z],
        pillar_scale,
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Beam".format(prefix),
        [
            float(origin[0]),
            float(origin[1]),
            base_z + float(pillar_height),
        ],
        [
            (float(span_width) + float(pillar_width)) / 100.0,
            float(pillar_width) / 100.0,
            float(beam_height) / 100.0,
        ],
        material_path=material_path,
    )


def _build_tower_geometry(
    actors,
    prefix,
    origin,
    width,
    floors,
    floor_height,
    material_path=None,
):
    total_height = float(floors) * float(floor_height)
    _spawn_box(
        actors,
        "{0}_Core".format(prefix),
        [float(origin[0]), float(origin[1]), float(origin[2]) + total_height / 2.0],
        [float(width) / 100.0, float(width) / 100.0, total_height / 100.0],
        material_path=material_path,
    )

    battlement_size = max(float(width) * 0.2, 50.0)
    top_z = float(origin[2]) + total_height + battlement_size / 2.0
    offsets = [
        (-float(width) / 2.5, -float(width) / 2.5),
        (-float(width) / 2.5, float(width) / 2.5),
        (float(width) / 2.5, -float(width) / 2.5),
        (float(width) / 2.5, float(width) / 2.5),
    ]
    for index, (offset_x, offset_y) in enumerate(offsets):
        _spawn_box(
            actors,
            "{0}_Battlement_{1}".format(prefix, index),
            [float(origin[0]) + offset_x, float(origin[1]) + offset_y, top_z],
            [
                battlement_size / 100.0,
                battlement_size / 100.0,
                battlement_size / 100.0,
            ],
            material_path=material_path,
        )


def _build_house_geometry(
    actors,
    prefix,
    origin,
    width,
    depth,
    wall_height,
    wall_thickness,
    roof_height,
    material_path=None,
):
    width = float(width)
    depth = float(depth)
    wall_height = float(wall_height)
    wall_thickness = float(wall_thickness)
    roof_height = float(roof_height)
    origin = [float(origin[0]), float(origin[1]), float(origin[2])]

    _spawn_box(
        actors,
        "{0}_Floor".format(prefix),
        [origin[0], origin[1], origin[2]],
        [width / 100.0, depth / 100.0, wall_thickness / 120.0],
        material_path=material_path,
    )

    wall_z = origin[2] + wall_height / 2.0
    _spawn_box(
        actors,
        "{0}_Wall_N".format(prefix),
        [origin[0], origin[1] + depth / 2.0, wall_z],
        [width / 100.0, wall_thickness / 100.0, wall_height / 100.0],
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Wall_S".format(prefix),
        [origin[0], origin[1] - depth / 2.0, wall_z],
        [width / 100.0, wall_thickness / 100.0, wall_height / 100.0],
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Wall_E".format(prefix),
        [origin[0] + width / 2.0, origin[1], wall_z],
        [wall_thickness / 100.0, depth / 100.0, wall_height / 100.0],
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Wall_W".format(prefix),
        [origin[0] - width / 2.0, origin[1], wall_z],
        [wall_thickness / 100.0, depth / 100.0, wall_height / 100.0],
        material_path=material_path,
    )
    _spawn_box(
        actors,
        "{0}_Roof".format(prefix),
        [origin[0], origin[1], origin[2] + wall_height + roof_height / 2.0],
        [(width * 1.05) / 100.0, (depth * 1.05) / 100.0, roof_height / 100.0],
        material_path=material_path,
    )


def create_wall(args):
    prefix = args.get("prefix") or "Wall"
    location = args.get("location") or [0.0, 0.0, 150.0]
    actors = []

    _build_wall(
        actors,
        prefix,
        location,
        args.get("segments", 8),
        args.get("segment_length", 300.0),
        args.get("height", 300.0),
        args.get("thickness", 50.0),
        axis=str(args.get("axis") or "x").lower(),
        material_path=args.get("material_path"),
    )

    return _structure_result("create_wall", actors)


def create_staircase(args):
    prefix = args.get("prefix") or "Staircase"
    location = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    _build_staircase_geometry(
        actors,
        prefix,
        location,
        args.get("steps", 8),
        args.get("step_width", 250.0),
        args.get("step_height", 25.0),
        args.get("step_depth", 120.0),
        material_path=args.get("material_path"),
    )
    return _structure_result("create_staircase", actors)


def create_arch(args):
    prefix = args.get("prefix") or "Arch"
    location = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    _build_arch_geometry(
        actors,
        prefix,
        location,
        args.get("span_width", 400.0),
        args.get("pillar_height", 350.0),
        args.get("pillar_width", 60.0),
        args.get("beam_height", 60.0),
        material_path=args.get("material_path"),
    )
    return _structure_result("create_arch", actors)


def create_tower(args):
    prefix = args.get("prefix") or "Tower"
    location = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    _build_tower_geometry(
        actors,
        prefix,
        location,
        args.get("width", 300.0),
        args.get("floors", 5),
        args.get("floor_height", 220.0),
        material_path=args.get("material_path"),
    )
    return _structure_result("create_tower", actors)


def construct_house(args):
    prefix = args.get("prefix") or "House"
    location = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    _build_house_geometry(
        actors,
        prefix,
        location,
        args.get("width", 500.0),
        args.get("depth", 400.0),
        args.get("wall_height", 260.0),
        args.get("wall_thickness", 35.0),
        args.get("roof_height", 80.0),
        material_path=args.get("material_path"),
    )
    return _structure_result("construct_house", actors)


def construct_mansion(args):
    prefix = args.get("prefix") or "Mansion"
    location = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    _build_house_geometry(
        actors,
        "{0}_Main".format(prefix),
        location,
        args.get("width", 900.0),
        args.get("depth", 650.0),
        args.get("wall_height", 320.0),
        args.get("wall_thickness", 40.0),
        args.get("roof_height", 100.0),
        material_path=args.get("material_path"),
    )
    wing_offset = float(args.get("wing_offset", 650.0))
    for side, offset in (("L", -wing_offset), ("R", wing_offset)):
        _build_house_geometry(
            actors,
            "{0}_Wing_{1}".format(prefix, side),
            [float(location[0]) + offset, float(location[1]), float(location[2])],
            450.0,
            350.0,
            260.0,
            35.0,
            80.0,
            material_path=args.get("material_path"),
        )
    _build_staircase_geometry(
        actors,
        "{0}_FrontSteps".format(prefix),
        [float(location[0]) + 350.0, float(location[1]), float(location[2]) - 20.0],
        6,
        320.0,
        20.0,
        90.0,
        material_path=args.get("material_path"),
    )
    return _structure_result("construct_mansion", actors)


def create_town(args):
    prefix = args.get("prefix") or "Town"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    rows = int(args.get("rows", 2))
    cols = int(args.get("cols", 3))
    spacing = float(args.get("spacing", 1200.0))
    actors = []

    for row in range(rows):
        for col in range(cols):
            house_location = [
                float(origin[0]) + row * spacing,
                float(origin[1]) + col * spacing,
                float(origin[2]),
            ]
            _build_house_geometry(
                actors,
                "{0}_House_{1}_{2}".format(prefix, row, col),
                house_location,
                500.0,
                400.0,
                260.0,
                35.0,
                70.0,
                material_path=args.get("material_path"),
            )

    _build_tower_geometry(
        actors,
        "{0}_CenterTower".format(prefix),
        [
            float(origin[0]) + (rows - 1) * spacing / 2.0,
            float(origin[1]) + (cols - 1) * spacing / 2.0,
            float(origin[2]),
        ],
        320.0,
        6,
        220.0,
        material_path=args.get("material_path"),
    )
    return _structure_result("create_town", actors, {"rows": rows, "cols": cols})


def create_bridge(args):
    prefix = args.get("prefix") or "Bridge"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    actors = []
    segments = int(args.get("segments", 10))
    span = float(args.get("segment_length", 250.0))
    width = float(args.get("width", 300.0))
    thickness = float(args.get("thickness", 30.0))

    for index in range(segments):
        _spawn_box(
            actors,
            "{0}_Deck_{1}".format(prefix, index),
            [float(origin[0]) + index * span, float(origin[1]), float(origin[2])],
            [span / 100.0, width / 100.0, thickness / 100.0],
            material_path=args.get("material_path"),
        )

    rail_height = float(args.get("rail_height", 80.0))
    rail_offset = width / 2.0
    for side in (-1, 1):
        _build_wall(
            actors,
            "{0}_Rail_{1}".format(prefix, "L" if side < 0 else "R"),
            [
                float(origin[0]) + (segments - 1) * span / 2.0,
                float(origin[1]) + rail_offset * side,
                float(origin[2]) + rail_height,
            ],
            segments,
            span,
            rail_height,
            15.0,
            axis="x",
            material_path=args.get("material_path"),
        )
    return _structure_result("create_bridge", actors)


def create_suspension_bridge(args):
    prefix = args.get("prefix") or "SuspensionBridge"
    result = create_bridge(dict(args, prefix="{0}_Deck".format(prefix)))
    actors = [find_actor_by_name(actor["label"]) for actor in result["actors"]]
    actors = [actor for actor in actors if actor]

    origin = args.get("location") or [0.0, 0.0, 0.0]
    span = float(args.get("segment_length", 250.0))
    segments = int(args.get("segments", 10))
    bridge_length = segments * span
    tower_height = float(args.get("tower_height", 700.0))
    material_path = args.get("material_path")

    for name, offset in (("A", 0.0), ("B", bridge_length)):
        _build_tower_geometry(
            actors,
            "{0}_Tower_{1}".format(prefix, name),
            [float(origin[0]) + offset, float(origin[1]), float(origin[2])],
            120.0,
            1,
            tower_height,
            material_path=material_path,
        )

    return _structure_result("create_suspension_bridge", actors)


def create_aqueduct(args):
    prefix = args.get("prefix") or "Aqueduct"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    arches = int(args.get("arches", 5))
    spacing = float(args.get("spacing", 450.0))
    actors = []

    for index in range(arches):
        _build_arch_geometry(
            actors,
            "{0}_Arch_{1}".format(prefix, index),
            [float(origin[0]) + index * spacing, float(origin[1]), float(origin[2])],
            220.0,
            300.0,
            45.0,
            45.0,
            material_path=args.get("material_path"),
        )

    _build_wall(
        actors,
        "{0}_Channel".format(prefix),
        [
            float(origin[0]) + (arches - 1) * spacing / 2.0,
            float(origin[1]),
            float(origin[2]) + 320.0,
        ],
        arches,
        spacing,
        50.0,
        220.0,
        axis="x",
        material_path=args.get("material_path"),
    )
    return _structure_result("create_aqueduct", actors)


def create_castle_fortress(args):
    prefix = args.get("prefix") or "CastleFortress"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    size = float(args.get("size", 2200.0))
    segments = int(args.get("segments", 6))
    height = float(args.get("height", 420.0))
    thickness = float(args.get("thickness", 80.0))
    actors = []

    half_size = size / 2.0
    _build_wall(
        actors,
        "{0}_North".format(prefix),
        [float(origin[0]), float(origin[1]) + half_size, float(origin[2]) + height / 2.0],
        segments,
        size / segments,
        height,
        thickness,
        axis="x",
        material_path=args.get("material_path"),
    )
    _build_wall(
        actors,
        "{0}_South".format(prefix),
        [float(origin[0]), float(origin[1]) - half_size, float(origin[2]) + height / 2.0],
        segments,
        size / segments,
        height,
        thickness,
        axis="x",
        material_path=args.get("material_path"),
    )
    _build_wall(
        actors,
        "{0}_East".format(prefix),
        [float(origin[0]) + half_size, float(origin[1]), float(origin[2]) + height / 2.0],
        segments,
        size / segments,
        height,
        thickness,
        axis="y",
        material_path=args.get("material_path"),
    )
    _build_wall(
        actors,
        "{0}_West".format(prefix),
        [float(origin[0]) - half_size, float(origin[1]), float(origin[2]) + height / 2.0],
        segments,
        size / segments,
        height,
        thickness,
        axis="y",
        material_path=args.get("material_path"),
    )

    tower_width = float(args.get("tower_width", 280.0))
    for suffix, x_offset, y_offset in (
        ("NE", half_size, half_size),
        ("NW", -half_size, half_size),
        ("SE", half_size, -half_size),
        ("SW", -half_size, -half_size),
    ):
        _build_tower_geometry(
            actors,
            "{0}_{1}".format(prefix, suffix),
            [float(origin[0]) + x_offset, float(origin[1]) + y_offset, float(origin[2])],
            tower_width,
            6,
            220.0,
            material_path=args.get("material_path"),
        )

    _build_arch_geometry(
        actors,
        "{0}_Gate".format(prefix),
        [float(origin[0]) + half_size, float(origin[1]), float(origin[2])],
        240.0,
        260.0,
        60.0,
        60.0,
        material_path=args.get("material_path"),
    )
    return _structure_result("create_castle_fortress", actors)


def create_pyramid(args):
    prefix = args.get("prefix") or "Pyramid"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    levels = int(args.get("levels", 6))
    block_size = float(args.get("block_size", 200.0))
    actors = []

    for level in range(levels):
        size = levels - level
        for row in range(size):
            for col in range(size):
                _spawn_box(
                    actors,
                    "{0}_L{1}_{2}_{3}".format(prefix, level, row, col),
                    [
                        float(origin[0]) + row * block_size,
                        float(origin[1]) + col * block_size,
                        float(origin[2]) + level * block_size * 0.5,
                    ],
                    [
                        block_size / 100.0,
                        block_size / 100.0,
                        (block_size * 0.5) / 100.0,
                    ],
                    material_path=args.get("material_path"),
                )
    return _structure_result("create_pyramid", actors, {"levels": levels})


def create_maze(args):
    prefix = args.get("prefix") or "Maze"
    origin = args.get("location") or [0.0, 0.0, 0.0]
    rows = int(args.get("rows", 5))
    cols = int(args.get("cols", 5))
    cell_size = float(args.get("cell_size", 300.0))
    wall_height = float(args.get("wall_height", 220.0))
    wall_thickness = float(args.get("wall_thickness", 35.0))
    random_gen = random.Random(int(args.get("seed", 1337)))
    actors = []

    cells = {
        (row, col): {"N": True, "S": True, "E": True, "W": True}
        for row in range(rows)
        for col in range(cols)
    }
    visited = set()
    stack = [(0, 0)]
    direction_data = {
        "N": (-1, 0, "S"),
        "S": (1, 0, "N"),
        "E": (0, 1, "W"),
        "W": (0, -1, "E"),
    }

    while stack:
        current = stack[-1]
        visited.add(current)
        row, col = current
        neighbors = []
        for direction, (row_delta, col_delta, opposite) in direction_data.items():
            neighbor = (row + row_delta, col + col_delta)
            if (
                0 <= neighbor[0] < rows
                and 0 <= neighbor[1] < cols
                and neighbor not in visited
            ):
                neighbors.append((direction, neighbor, opposite))

        if not neighbors:
            stack.pop()
            continue

        direction, neighbor, opposite = random_gen.choice(neighbors)
        cells[current][direction] = False
        cells[neighbor][opposite] = False
        stack.append(neighbor)

    def _spawn_wall_segment(label, center, horizontal):
        _spawn_box(
            actors,
            label,
            center,
            [
                (cell_size if horizontal else wall_thickness) / 100.0,
                (wall_thickness if horizontal else cell_size) / 100.0,
                wall_height / 100.0,
            ],
            material_path=args.get("material_path"),
        )

    for row in range(rows):
        for col in range(cols):
            cell_origin_x = float(origin[0]) + row * cell_size
            cell_origin_y = float(origin[1]) + col * cell_size
            cell_center = [cell_origin_x, cell_origin_y, float(origin[2]) + wall_height / 2.0]

            if row == 0 and cells[(row, col)]["N"]:
                _spawn_wall_segment(
                    "{0}_N_{1}_{2}".format(prefix, row, col),
                    [cell_center[0] - cell_size / 2.0, cell_center[1], cell_center[2]],
                    False,
                )
            if col == 0 and cells[(row, col)]["W"]:
                _spawn_wall_segment(
                    "{0}_W_{1}_{2}".format(prefix, row, col),
                    [cell_center[0], cell_center[1] - cell_size / 2.0, cell_center[2]],
                    True,
                )
            if cells[(row, col)]["S"]:
                _spawn_wall_segment(
                    "{0}_S_{1}_{2}".format(prefix, row, col),
                    [cell_center[0] + cell_size / 2.0, cell_center[1], cell_center[2]],
                    False,
                )
            if cells[(row, col)]["E"]:
                _spawn_wall_segment(
                    "{0}_E_{1}_{2}".format(prefix, row, col),
                    [cell_center[0], cell_center[1] + cell_size / 2.0, cell_center[2]],
                    True,
                )

    return _structure_result("create_maze", actors, {"rows": rows, "cols": cols})


OPERATIONS = {
    "create_town": create_town,
    "construct_house": construct_house,
    "construct_mansion": construct_mansion,
    "create_tower": create_tower,
    "create_arch": create_arch,
    "create_staircase": create_staircase,
    "create_castle_fortress": create_castle_fortress,
    "create_suspension_bridge": create_suspension_bridge,
    "create_bridge": create_bridge,
    "create_aqueduct": create_aqueduct,
    "create_maze": create_maze,
    "create_pyramid": create_pyramid,
    "create_wall": create_wall,
}


def main():
    operation = decode_template_json("""${operation}""")
    args = decode_template_json("""${args}""")

    handler = OPERATIONS.get(operation)
    if not handler:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": "Unknown world building tool operation: {0}".format(
                        operation
                    ),
                },
                indent=2,
            )
        )
        return

    try:
        result = handler(args or {})
    except Exception as exc:
        result = {"success": False, "message": str(exc)}

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
