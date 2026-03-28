import json


def _vector_from_list(values, default=None):
    values = values or default or [0.0, 0.0, 0.0]
    return unreal.Vector(x=float(values[0]), y=float(values[1]), z=float(values[2]))


def _rotator_from_list(values, default=None):
    values = values or default or [0.0, 0.0, 0.0]
    return unreal.Rotator(
        pitch=float(values[0]),
        yaw=float(values[1]),
        roll=float(values[2]),
    )


def get_actors_in_level(_args):
    world = get_editor_world()
    if not world:
        return {"success": False, "message": "No world loaded", "actors": []}

    actors = [get_actor_summary(actor) for actor in get_all_level_actors()]
    actors.sort(key=lambda actor: actor["label"] or actor["name"])
    return {"success": True, "world_name": world.get_name(), "actors": actors}


def find_actors_by_name(args):
    pattern = str(args.get("pattern") or "").strip().lower()
    if not pattern:
        return {"success": False, "message": "Pattern is required", "actors": []}

    matching_actors = []
    for actor in get_all_level_actors():
        actor_name = actor.get_name()
        actor_label = actor.get_actor_label()
        if pattern in actor_name.lower() or pattern in actor_label.lower():
            matching_actors.append(
                {
                    "name": actor_name,
                    "label": actor_label,
                    "class": actor.get_class().get_name(),
                }
            )

    matching_actors.sort(key=lambda actor: actor["label"] or actor["name"])
    return {
        "success": True,
        "pattern": pattern,
        "count": len(matching_actors),
        "actors": matching_actors,
    }


def spawn_actor(args):
    actor_class_name = args.get("type")
    actor_name = args.get("name") or ""
    location = args.get("location") or [0.0, 0.0, 0.0]
    rotation = args.get("rotation") or [0.0, 0.0, 0.0]

    actor_class = resolve_actor_class(
        actor_class_name,
        {
            "StaticMeshActor": unreal.StaticMeshActor,
            "SkeletalMeshActor": unreal.SkeletalMeshActor,
            "DirectionalLight": unreal.DirectionalLight,
            "PointLight": unreal.PointLight,
            "SpotLight": unreal.SpotLight,
            "CameraActor": unreal.CameraActor,
            "PlayerStart": unreal.PlayerStart,
            "Character": unreal.Character,
            "Pawn": unreal.Pawn,
        },
    )
    if not actor_class:
        return {
            "success": False,
            "message": "Could not find actor class: {0}".format(actor_class_name),
        }

    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        actor_class,
        _vector_from_list(location),
        _rotator_from_list(rotation),
    )
    if not actor:
        return {"success": False, "message": "Failed to spawn actor"}

    if actor_name:
        actor.set_actor_label(actor_name)

    return {"success": True, "actor": get_actor_summary(actor)}


def delete_actor(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    deleted_actor = get_actor_summary(actor)
    if not destroy_actor(actor):
        return {
            "success": False,
            "message": "Failed to delete actor: {0}".format(actor_name),
        }

    return {
        "success": True,
        "message": "Deleted actor: {0}".format(actor_name),
        "actor": deleted_actor,
    }


def set_actor_transform(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    if args.get("location") is not None:
        actor.set_actor_location(_vector_from_list(args.get("location")), False, False)

    if args.get("rotation") is not None:
        actor.set_actor_rotation(_rotator_from_list(args.get("rotation")), False)

    if args.get("scale") is not None:
        actor.set_actor_scale3d(_vector_from_list(args.get("scale"), [1.0, 1.0, 1.0]))

    return {"success": True, "actor": get_actor_summary(actor)}


def get_actor_properties(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    return {"success": True, "actor": get_actor_property_report(actor)}


def get_actor_material_info(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    return {"success": True, "materials": get_actor_material_report(actor)}


def set_actor_property(args):
    actor_name = args.get("name")
    property_name = args.get("property_name")
    property_value = args.get("property_value")

    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    if not property_name:
        return {"success": False, "message": "property_name is required"}

    if not apply_actor_property(actor, property_name, property_value):
        return {
            "success": False,
            "message": "Failed to set actor property '{0}'".format(property_name),
        }

    return {"success": True, "actor": get_actor_property_report(actor)}


def spawn_blueprint_actor(args):
    blueprint_name = args.get("blueprint_name")
    actor_name = args.get("name") or ""
    location = args.get("location") or [0.0, 0.0, 0.0]
    rotation = args.get("rotation") or [0.0, 0.0, 0.0]
    scale = args.get("scale")
    properties = args.get("properties") or {}

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    blueprint_path = get_asset_package_name(blueprint)
    blueprint_class = None

    try:
        blueprint_class = unreal.EditorAssetLibrary.load_blueprint_class(blueprint_path)
    except Exception:
        blueprint_class = get_blueprint_generated_class(blueprint)

    if not blueprint_class:
        return {
            "success": False,
            "message": "Could not resolve blueprint class for {0}".format(blueprint_name),
        }

    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        blueprint_class,
        _vector_from_list(location),
        _rotator_from_list(rotation),
    )
    if not actor:
        return {
            "success": False,
            "message": "Failed to spawn blueprint actor from {0}".format(blueprint_name),
        }

    if actor_name:
        actor.set_actor_label(actor_name)

    if scale is not None:
        actor.set_actor_scale3d(_vector_from_list(scale, [1.0, 1.0, 1.0]))

    for property_name, property_value in properties.items():
        apply_actor_property(actor, property_name, property_value)

    return {
        "success": True,
        "blueprint": blueprint_path,
        "actor": get_actor_summary(actor),
    }


OPERATIONS = {
    "get_actors_in_level": get_actors_in_level,
    "find_actors_by_name": find_actors_by_name,
    "spawn_actor": spawn_actor,
    "delete_actor": delete_actor,
    "set_actor_transform": set_actor_transform,
    "get_actor_properties": get_actor_properties,
    "get_actor_material_info": get_actor_material_info,
    "set_actor_property": set_actor_property,
    "spawn_blueprint_actor": spawn_blueprint_actor,
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
                    "message": "Unknown actor tool operation: {0}".format(operation),
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
