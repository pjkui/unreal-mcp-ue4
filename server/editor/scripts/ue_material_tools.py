import json


def _resolve_actor_and_component(args):
    actor_name = args.get("actor_name")
    component_name = args.get("component_name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        raise ValueError("Actor not found: {0}".format(actor_name))

    component = find_actor_material_component(actor, component_name)
    return actor, component


def _get_blueprint_component(blueprint_name, component_name):
    blueprint = load_blueprint_asset(blueprint_name)
    component_node, component_template = get_component_template(blueprint, component_name)
    return blueprint, component_node, component_template


def get_available_materials(args):
    search_term = str(args.get("search_term") or "").strip().lower()
    include_engine = bool(args.get("include_engine", True))
    limit = int(args.get("limit", 100))

    material_assets = []
    for asset_data in get_asset_registry().get_all_assets():
        asset_class_name = get_asset_class_name(asset_data)
        if asset_class_name not in ("Material", "MaterialInstanceConstant", "MaterialInstance"):
            continue

        package_name = get_asset_package_name(asset_data)
        if not include_engine and package_name.startswith("/Engine/"):
            continue

        searchable_text = "{0} {1}".format(
            package_name,
            get_asset_object_path(asset_data),
        ).lower()
        if search_term and search_term not in searchable_text:
            continue

        material_assets.append(
            {
                "name": str(asset_data.asset_name),
                "class": asset_class_name,
                "path": package_name,
            }
        )

    material_assets.sort(key=lambda material: (material["path"].startswith("/Engine/"), material["path"]))
    return {
        "success": True,
        "count": len(material_assets[:limit]),
        "materials": material_assets[:limit],
    }


def apply_material_to_actor(args):
    material_path = args.get("material_path")
    slot_index = int(args.get("slot_index", 0))

    try:
        actor, component = _resolve_actor_and_component(args)
        material_asset = apply_material_to_component(component, material_path, slot_index)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    return {
        "success": True,
        "actor": get_actor_summary(actor),
        "component": get_object_name(component),
        "slot_index": slot_index,
        "material": get_material_summary(material_asset),
    }


def apply_material_to_blueprint(args):
    blueprint_name = args.get("blueprint_name")
    component_name = args.get("component_name")
    material_path = args.get("material_path")
    slot_index = int(args.get("slot_index", 0))

    try:
        blueprint, component_node, component_template = _get_blueprint_component(
            blueprint_name, component_name
        )
        material_asset = apply_material_to_component(
            component_template, material_path, slot_index
        )
        finalize_blueprint_change(blueprint, structural=False)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    resolved_component_name = (
        get_scs_node_name(component_node)
        or get_object_name(component_template)
        or str(component_name or "")
    )

    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "component": resolved_component_name,
        "slot_index": slot_index,
        "material": get_material_summary(material_asset),
    }


def set_mesh_material_color(args):
    color = args.get("color") or [1.0, 1.0, 1.0, 1.0]
    parameter_name = args.get("parameter_name")
    slot_index = int(args.get("slot_index", 0))
    material_path = args.get("material_path")
    material_interface = None

    try:
        if args.get("actor_name"):
            actor, component = _resolve_actor_and_component(args)
            if material_path:
                apply_material_to_component(component, material_path, slot_index)
            material_interface = component.get_material(slot_index)
            tinted_material, used_parameter = tint_material_interface(
                material_interface,
                color,
                parameter_name=parameter_name,
                instance_name=args.get("instance_name"),
                package_path=args.get("instance_path") or "/Game/MCP/GeneratedMaterials",
            )
            component.set_material(slot_index, tinted_material)
            return {
                "success": True,
                "actor": get_actor_summary(actor),
                "component": get_object_name(component),
                "slot_index": slot_index,
                "material": get_material_summary(tinted_material),
                "parameter_name": used_parameter,
            }

        if args.get("blueprint_name"):
            blueprint, component_node, component_template = _get_blueprint_component(
                args.get("blueprint_name"),
                args.get("component_name"),
            )
            if material_path:
                apply_material_to_component(component_template, material_path, slot_index)
            material_interface = component_template.get_material(slot_index)
            tinted_material, used_parameter = tint_material_interface(
                material_interface,
                color,
                parameter_name=parameter_name,
                instance_name=args.get("instance_name"),
                package_path=args.get("instance_path") or "/Game/MCP/GeneratedMaterials",
            )
            component_template.set_material(slot_index, tinted_material)
            finalize_blueprint_change(blueprint, structural=False)
            return {
                "success": True,
                "blueprint": get_asset_package_name(blueprint),
                "component": get_scs_node_name(component_node),
                "slot_index": slot_index,
                "material": get_material_summary(tinted_material),
                "parameter_name": used_parameter,
            }

        if material_path:
            material_interface = load_material_asset(material_path)
            tinted_material, used_parameter = tint_material_interface(
                material_interface,
                color,
                parameter_name=parameter_name,
                instance_name=args.get("instance_name"),
                package_path=args.get("instance_path") or "/Game/MCP/GeneratedMaterials",
            )
            return {
                "success": True,
                "material": get_material_summary(tinted_material),
                "parameter_name": used_parameter,
            }
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    return {
        "success": False,
        "message": "Provide actor_name, blueprint_name, or material_path for material color changes.",
    }


def spawn_physics_blueprint_actor(args):
    blueprint_name = args.get("blueprint_name")
    actor_name = args.get("name") or ""
    location = args.get("location") or [0.0, 0.0, 0.0]
    rotation = args.get("rotation") or [0.0, 0.0, 0.0]
    scale = args.get("scale")
    component_name = args.get("component_name")
    material_path = args.get("material_path")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
        blueprint_path = get_asset_package_name(blueprint)
        blueprint_class = None
        try:
            blueprint_class = unreal.EditorAssetLibrary.load_blueprint_class(blueprint_path)
        except Exception:
            blueprint_class = get_blueprint_generated_class(blueprint)

        if not blueprint_class:
            raise ValueError(
                "Could not resolve blueprint class for {0}".format(blueprint_name)
            )

        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
            blueprint_class,
            as_vector3(location),
            as_rotator(rotation),
        )
        if actor is None:
            raise RuntimeError(
                "Failed to spawn blueprint actor from {0}".format(blueprint_name)
            )

        if actor_name:
            actor.set_actor_label(actor_name)
        if scale is not None:
            actor.set_actor_scale3d(as_vector3(scale, [1.0, 1.0, 1.0]))

        component = find_actor_material_component(actor, component_name)
        physics_summary = apply_physics_to_component_instance(component, args)
        if material_path:
            apply_material_to_component(component, material_path, int(args.get("slot_index", 0)))

        return {
            "success": True,
            "blueprint": blueprint_path,
            "actor": get_actor_summary(actor),
            "physics": physics_summary,
            "materials": get_component_material_info(component),
        }
    except Exception as exc:
        return {"success": False, "message": str(exc)}


OPERATIONS = {
    "spawn_physics_blueprint_actor": spawn_physics_blueprint_actor,
    "get_available_materials": get_available_materials,
    "apply_material_to_actor": apply_material_to_actor,
    "apply_material_to_blueprint": apply_material_to_blueprint,
    "set_mesh_material_color": set_mesh_material_color,
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
                    "message": "Unknown material tool operation: {0}".format(operation),
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
