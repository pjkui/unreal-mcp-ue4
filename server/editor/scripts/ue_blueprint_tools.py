import json


def _component_summary(node, component_template):
    summary = {
        "name": get_scs_node_name(node),
        "class": get_object_class_name(component_template),
    }

    if class_is_child_of(component_template.get_class(), unreal.SceneComponent):
        try:
            relative_location = component_template.get_relative_location()
            summary["location"] = {
                "x": relative_location.x,
                "y": relative_location.y,
                "z": relative_location.z,
            }
        except Exception:
            pass

        try:
            relative_rotation = component_template.get_relative_rotation()
            summary["rotation"] = {
                "pitch": relative_rotation.pitch,
                "yaw": relative_rotation.yaw,
                "roll": relative_rotation.roll,
            }
        except Exception:
            pass

        try:
            relative_scale = component_template.get_relative_scale3d()
            summary["scale"] = {
                "x": relative_scale.x,
                "y": relative_scale.y,
                "z": relative_scale.z,
            }
        except Exception:
            pass

    return summary


def create_blueprint(args):
    blueprint_name = args.get("name")
    parent_class_name = args.get("parent_class") or "Actor"
    content_path = args.get("path") or "/Game/Blueprints"

    asset_name, package_path = split_asset_name_and_path(blueprint_name, content_path)
    parent_class = resolve_class_reference(parent_class_name, ["Engine", "UMG"])
    if not parent_class:
        return {
            "success": False,
            "message": "Parent class not found: {0}".format(parent_class_name),
        }

    factory = unreal.BlueprintFactory()
    parent_uclass = get_UClass(parent_class)
    if not parent_uclass:
        return {
            "success": False,
            "message": "Could not resolve UClass for parent class: {0}".format(
                parent_class_name
            ),
        }

    try:
        factory.set_editor_property("parent_class", parent_uclass)
    except Exception as exc:
        return {
            "success": False,
            "message": "Failed to assign Blueprint parent class '{0}': {1}".format(
                parent_class_name, exc
            ),
        }

    blueprint = create_asset_with_factory(
        asset_name,
        package_path,
        unreal.Blueprint,
        factory,
    )
    if not blueprint:
        return {
            "success": False,
            "message": "Failed to create blueprint asset '{0}'".format(asset_name),
        }

    finalize_blueprint_change(blueprint, structural=True)
    return {
        "success": True,
        "blueprint_name": asset_name,
        "asset_path": get_asset_package_name(blueprint),
        "parent_class": get_object_name(parent_uclass),
    }


def add_component_to_blueprint(args):
    blueprint_name = args.get("blueprint_name")
    component_type = args.get("component_type")
    component_name = args.get("component_name")
    location = args.get("location")
    rotation = args.get("rotation")
    scale = args.get("scale")
    component_properties = args.get("component_properties") or {}
    parent_component_name = args.get("parent_component_name")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    component_class = resolve_component_class(component_type)
    if not component_class:
        return {
            "success": False,
            "message": "Component class not found: {0}".format(component_type),
        }

    if not class_is_child_of(component_class, unreal.ActorComponent):
        return {
            "success": False,
            "message": "Class is not an ActorComponent: {0}".format(component_type),
        }

    if find_scs_node(blueprint, component_name):
        return {
            "success": False,
            "message": "Blueprint component already exists: {0}".format(component_name),
        }

    try:
        component_node = add_component_node_to_blueprint(
            blueprint,
            component_class,
            component_name,
            parent_component_name=parent_component_name,
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    component_template = get_scs_node_template(component_node)
    apply_scene_component_transform(component_template, location, rotation, scale)

    for property_name, property_value in component_properties.items():
        apply_component_property(component_template, property_name, property_value)

    finalize_blueprint_change(blueprint, structural=True)
    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "component": _component_summary(component_node, component_template),
    }


def set_component_property(args):
    blueprint_name = args.get("blueprint_name")
    component_name = args.get("component_name")
    property_name = args.get("property_name")
    property_value = args.get("property_value")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
        component_node, component_template = get_component_template(
            blueprint, component_name
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    if not property_name:
        return {"success": False, "message": "property_name is required"}

    if not apply_component_property(component_template, property_name, property_value):
        return {
            "success": False,
            "message": "Failed to set component property '{0}'".format(property_name),
        }

    finalize_blueprint_change(blueprint, structural=False)
    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "component": _component_summary(component_node, component_template),
    }


def set_static_mesh_properties(args):
    args = dict(args or {})
    args["property_name"] = "StaticMesh"
    args["property_value"] = args.get("static_mesh")
    return set_component_property(args)


def set_physics_properties(args):
    blueprint_name = args.get("blueprint_name")
    component_name = args.get("component_name")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
        component_node, component_template = get_component_template(
            blueprint, component_name
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    apply_component_property(
        component_template,
        "SimulatePhysics",
        args.get("simulate_physics", True),
    )
    apply_component_property(
        component_template,
        "EnableGravity",
        args.get("gravity_enabled", True),
    )
    apply_component_property(component_template, "Mass", args.get("mass", 1.0))
    apply_component_property(
        component_template,
        "LinearDamping",
        args.get("linear_damping", 0.01),
    )
    apply_component_property(
        component_template,
        "AngularDamping",
        args.get("angular_damping", 0.0),
    )

    finalize_blueprint_change(blueprint, structural=False)
    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "component": _component_summary(component_node, component_template),
    }


def compile_blueprint(args):
    blueprint_name = args.get("blueprint_name")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    compiled = try_compile_blueprint(blueprint)
    saved = save_loaded_editor_asset(blueprint)
    return {
        "success": bool(compiled or saved),
        "compiled": bool(compiled),
        "saved": bool(saved),
        "blueprint": get_asset_package_name(blueprint),
    }


def set_blueprint_property(args):
    blueprint_name = args.get("blueprint_name")
    property_name = args.get("property_name")
    property_value = args.get("property_value")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    cdo = get_blueprint_default_object(blueprint)
    if not cdo:
        return {
            "success": False,
            "message": "Could not resolve class default object for blueprint: {0}".format(
                blueprint_name
            ),
        }

    if not apply_component_property(cdo, property_name, property_value) and not set_object_property(
        cdo, property_name, property_value
    ):
        return {
            "success": False,
            "message": "Failed to set blueprint property '{0}'".format(property_name),
        }

    finalize_blueprint_change(blueprint, structural=False)
    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "property_name": property_name,
        "property_value": property_value,
    }


OPERATIONS = {
    "create_blueprint": create_blueprint,
    "add_component_to_blueprint": add_component_to_blueprint,
    "set_static_mesh_properties": set_static_mesh_properties,
    "set_component_property": set_component_property,
    "set_physics_properties": set_physics_properties,
    "compile_blueprint": compile_blueprint,
    "set_blueprint_property": set_blueprint_property,
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
                    "message": "Unknown blueprint tool operation: {0}".format(
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
