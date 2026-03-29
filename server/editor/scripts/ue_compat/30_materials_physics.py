def get_actor_mesh_components(actor):
    if not actor:
        return []

    component_classes = [
        getattr(unreal, "StaticMeshComponent", None),
        getattr(unreal, "SkeletalMeshComponent", None),
        getattr(unreal, "InstancedStaticMeshComponent", None),
        getattr(unreal, "HierarchicalInstancedStaticMeshComponent", None),
        getattr(unreal, "MeshComponent", None),
    ]

    components = []
    seen_names = set()
    for component_class in component_classes:
        if not component_class:
            continue

        try:
            class_components = list(actor.get_components_by_class(component_class) or [])
        except Exception:
            class_components = []

        for component in class_components:
            component_name = get_object_name(component)
            if component_name in seen_names:
                continue
            seen_names.add(component_name)
            components.append(component)

    try:
        generic_components = list(
            actor.get_components_by_class(getattr(unreal, "ActorComponent", object)) or []
        )
    except Exception:
        generic_components = []

    for component in generic_components:
        component_name = get_object_name(component)
        if component_name in seen_names:
            continue

        if not hasattr(component, "set_material"):
            continue

        if not (
            hasattr(component, "get_material")
            or hasattr(component, "get_num_materials")
            or hasattr(component, "get_material_slot_names")
        ):
            continue

        seen_names.add(component_name)
        components.append(component)

    return components


def get_material_summary(material_interface):
    if not material_interface:
        return {}

    return {
        "name": get_object_name(material_interface),
        "class": get_object_class_name(material_interface),
        "path": get_asset_package_name(material_interface)
        or get_asset_object_path(material_interface),
    }


def get_component_material_info(component):
    material_info = []

    material_slot_names = []
    try:
        if hasattr(component, "get_material_slot_names"):
            material_slot_names = list(component.get_material_slot_names() or [])
    except Exception:
        material_slot_names = []

    try:
        material_count = int(component.get_num_materials())
    except Exception:
        material_count = len(material_slot_names)

    if material_count <= 0:
        material_count = len(material_slot_names)

    for slot_index in range(max(material_count, 0)):
        material_interface = None
        try:
            material_interface = component.get_material(slot_index)
        except Exception:
            material_interface = None

        slot_name = ""
        if slot_index < len(material_slot_names):
            slot_name = str(material_slot_names[slot_index])

        material_info.append(
            {
                "slot_index": slot_index,
                "slot_name": slot_name,
                "material": get_material_summary(material_interface),
            }
        )

    return material_info


def load_material_asset(material_identifier):
    return load_asset_by_identifier(
        material_identifier,
        [
            "Material",
            "MaterialInstance",
            "MaterialInstanceConstant",
            "MaterialInterface",
        ],
    )


def apply_material_to_component(component, material_identifier, slot_index=0):
    if component is None:
        raise ValueError("A render component is required")

    material_asset = load_material_asset(material_identifier)
    if not hasattr(component, "set_material"):
        raise ValueError(
            "Component '{0}' does not support material assignment.".format(
                get_object_name(component)
            )
        )

    component.set_material(int(slot_index), material_asset)
    return material_asset


def find_actor_material_component(actor, component_name=None):
    mesh_components = get_actor_mesh_components(actor)
    if component_name:
        for component in mesh_components:
            if get_object_name(component) == component_name:
                return component
        raise ValueError(
            "Material-capable component not found on actor: {0}".format(component_name)
        )

    if not mesh_components:
        raise ValueError(
            "Actor '{0}' does not have a material-capable mesh component.".format(
                actor.get_actor_label()
            )
        )

    return mesh_components[0]


def get_actor_material_report(actor):
    return {
        "actor": get_actor_summary(actor),
        "components": [
            {
                "name": get_object_name(component),
                "class": get_object_class_name(component),
                "materials": get_component_material_info(component),
            }
            for component in get_actor_mesh_components(actor)
        ],
    }


def create_material_instance_constant(
    parent_material, instance_name=None, package_path="/Game/MCP/GeneratedMaterials"
):
    material_instance_class = getattr(unreal, "MaterialInstanceConstant", None)
    material_factory_class = getattr(unreal, "MaterialInstanceConstantFactoryNew", None)
    material_library = getattr(unreal, "MaterialEditingLibrary", None)

    if material_instance_class is None or material_factory_class is None:
        raise ValueError(
            "MaterialInstanceConstant asset creation is not exposed in this UE4.27 Python environment."
        )

    instance_asset_name = sanitize_asset_name(
        instance_name or "{0}_MCPInst".format(get_object_name(parent_material)),
        fallback="GeneratedMaterialInstance",
    )
    package_path = get_asset_package_path_for_create(package_path)
    instance_asset_path = "{0}/{1}".format(package_path, instance_asset_name)

    try:
        existing_asset = unreal.EditorAssetLibrary.load_asset(instance_asset_path)
        if existing_asset:
            if material_library and hasattr(material_library, "set_material_instance_parent"):
                material_library.set_material_instance_parent(existing_asset, parent_material)
            else:
                set_object_property(existing_asset, "parent", parent_material)
            save_loaded_editor_asset(existing_asset)
            return existing_asset
    except Exception:
        pass

    factory = material_factory_class()
    material_instance = create_asset_with_factory(
        instance_asset_name,
        package_path,
        material_instance_class,
        factory,
    )
    if not material_instance:
        raise RuntimeError(
            "Failed to create material instance '{0}'".format(instance_asset_name)
        )

    if material_library and hasattr(material_library, "set_material_instance_parent"):
        material_library.set_material_instance_parent(material_instance, parent_material)
    else:
        set_object_property(material_instance, "parent", parent_material)

    save_loaded_editor_asset(material_instance)
    return material_instance


def tint_material_interface(
    material_interface,
    color_values,
    parameter_name=None,
    instance_name=None,
    package_path="/Game/MCP/GeneratedMaterials",
):
    material_library = getattr(unreal, "MaterialEditingLibrary", None)
    material_class_name = get_object_class_name(material_interface)
    parameter_candidates = []

    def _linear_colors_match(lhs, rhs, tolerance=1e-4):
        return (
            abs(float(lhs.r) - float(rhs.r)) <= tolerance
            and abs(float(lhs.g) - float(rhs.g)) <= tolerance
            and abs(float(lhs.b) - float(rhs.b)) <= tolerance
            and abs(float(lhs.a) - float(rhs.a)) <= tolerance
        )

    if parameter_name:
        parameter_candidates.append(parameter_name)
    parameter_candidates.extend(
        [
            "BaseColor",
            "Color",
            "Tint",
            "TintColor",
            "BodyColor",
            "AlbedoTint",
        ]
    )

    if material_class_name == "Material":
        material_interface = create_material_instance_constant(
            material_interface,
            instance_name=instance_name,
            package_path=package_path,
        )

    if hasattr(material_library, "get_vector_parameter_names"):
        try:
            discovered_names = material_library.get_vector_parameter_names(
                material_interface
            )
            for discovered_name in discovered_names or []:
                discovered_name = str(discovered_name)
                if discovered_name and discovered_name not in parameter_candidates:
                    parameter_candidates.append(discovered_name)
        except Exception:
            pass

    if (
        material_library is None
        or not hasattr(material_library, "set_material_instance_vector_parameter_value")
        or not hasattr(material_library, "update_material_instance")
    ):
        raise ValueError(
            "MaterialEditingLibrary vector parameter editing is not exposed in this UE4.27 Python environment."
        )

    color_value = as_linear_color(color_values)
    for parameter_candidate in parameter_candidates:
        try:
            success = material_library.set_material_instance_vector_parameter_value(
                material_interface,
                unreal.Name(parameter_candidate)
                if hasattr(unreal, "Name")
                else parameter_candidate,
                color_value,
            )
            readback_matches = False
            if hasattr(material_library, "get_material_instance_vector_parameter_value"):
                try:
                    current_value = (
                        material_library.get_material_instance_vector_parameter_value(
                            material_interface,
                            unreal.Name(parameter_candidate)
                            if hasattr(unreal, "Name")
                            else parameter_candidate,
                        )
                    )
                    readback_matches = _linear_colors_match(current_value, color_value)
                except Exception:
                    readback_matches = False
            if success or readback_matches:
                material_library.update_material_instance(material_interface)
                save_loaded_editor_asset(material_interface)
                return material_interface, parameter_candidate
        except Exception:
            continue

    raise ValueError(
        "Could not set a vector color parameter on material '{0}'.".format(
            get_object_name(material_interface)
        )
    )


def apply_physics_to_component_instance(component, args):
    if component is None:
        raise ValueError("A primitive component is required")

    simulate_physics = bool(args.get("simulate_physics", True))
    gravity_enabled = bool(args.get("gravity_enabled", True))
    mass = float(args.get("mass", 1.0))
    linear_damping = float(args.get("linear_damping", 0.01))
    angular_damping = float(args.get("angular_damping", 0.0))

    simulate_setter = getattr(component, "set_simulate_physics", None)
    if callable(simulate_setter):
        simulate_setter(simulate_physics)

    gravity_setter = getattr(component, "set_enable_gravity", None)
    if callable(gravity_setter):
        gravity_setter(gravity_enabled)

    if hasattr(component, "set_mass_override_in_kg"):
        bone_name = unreal.Name("") if hasattr(unreal, "Name") else ""
        try:
            component.set_mass_override_in_kg(bone_name, mass, True)
        except Exception:
            pass

    set_object_property(component, "linear_damping", linear_damping)
    set_object_property(component, "angular_damping", angular_damping)

    return {
        "component_name": get_object_name(component),
        "component_class": get_object_class_name(component),
        "simulate_physics": simulate_physics,
        "gravity_enabled": gravity_enabled,
        "mass": mass,
        "linear_damping": linear_damping,
        "angular_damping": angular_damping,
    }


_BASIC_SHAPE_ASSET_PATHS = {
    "cube": "/Engine/BasicShapes/Cube.Cube",
    "sphere": "/Engine/BasicShapes/Sphere.Sphere",
    "cylinder": "/Engine/BasicShapes/Cylinder.Cylinder",
    "cone": "/Engine/BasicShapes/Cone.Cone",
    "plane": "/Engine/BasicShapes/Plane.Plane",
}


def load_basic_shape_mesh(shape_name="cube"):
    mesh_path = _BASIC_SHAPE_ASSET_PATHS.get(str(shape_name or "cube").lower())
    if not mesh_path:
        raise ValueError("Unsupported basic shape: {0}".format(shape_name))

    shape_mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if not shape_mesh:
        raise ValueError("Could not load engine basic shape mesh: {0}".format(mesh_path))

    return shape_mesh


def spawn_basic_shape_actor(
    label,
    location,
    scale=None,
    rotation=None,
    shape_name="cube",
    material_identifier=None,
):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor,
        as_vector3(location),
        as_rotator(rotation),
    )
    if not actor:
        raise RuntimeError("Failed to spawn StaticMeshActor for '{0}'".format(label))

    actor.set_actor_label(label)
    mesh_component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if mesh_component is None:
        raise RuntimeError(
            "Spawned actor '{0}' does not expose a StaticMeshComponent.".format(label)
        )

    mesh_component.set_static_mesh(load_basic_shape_mesh(shape_name))
    if scale is not None:
        actor.set_actor_scale3d(as_vector3(scale, [1.0, 1.0, 1.0]))

    if material_identifier:
        apply_material_to_component(mesh_component, material_identifier)

    return actor
