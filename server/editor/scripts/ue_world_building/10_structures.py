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
