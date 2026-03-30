def bind_widget_event(args):
    widget_name = args.get("widget_name")
    widget_member_name = args.get("widget_member_name") or args.get("widget_component_name")
    event_name = args.get("event_name")
    function_name = args.get("function_name") or "{0}_{1}".format(
        widget_member_name, event_name
    )

    if not widget_member_name:
        return {"success": False, "message": "widget_member_name is required"}

    try:
        widget_blueprint = _load_widget_blueprint(widget_name)
        _apply_delegate_binding(
            widget_blueprint,
            widget_member_name,
            event_name,
            function_name=function_name,
        )
        return {
            "success": True,
            "widget_blueprint": get_asset_package_name(widget_blueprint),
            "widget": widget_member_name,
            "event_name": event_name,
            "function_name": function_name,
        }
    except Exception as exc:
        return _format_widget_authoring_error(exc)


def add_widget_to_viewport(args):
    widget_name = args.get("widget_name")
    z_order = int(args.get("z_order", 0))

    widget_blueprint, widget_path, widget_class = _resolve_widget_runtime_class(widget_name)
    if not widget_blueprint and not widget_class:
        return {
            "success": False,
            "message": "Asset not found: {0}".format(widget_name),
        }

    if not widget_class and widget_blueprint:
        widget_class = get_blueprint_generated_class(widget_blueprint)

    if not widget_class:
        return {
            "success": False,
            "message": "Could not resolve widget class for {0}".format(widget_name),
        }

    game_world = None
    try:
        if hasattr(unreal.EditorLevelLibrary, "get_game_world"):
            game_world = unreal.EditorLevelLibrary.get_game_world()
    except Exception:
        game_world = None

    if not game_world:
        return {
            "success": False,
            "message": "A PIE or game world is required to add a widget to the viewport.",
        }

    widget_instance = None
    try:
        if hasattr(unreal.UserWidget, "create_widget_instance"):
            widget_instance = unreal.UserWidget.create_widget_instance(
                game_world,
                widget_class,
                widget_class.get_name(),
            )
    except Exception:
        widget_instance = None

    if widget_instance is None:
        try:
            widget_instance = unreal.new_object(get_UClass(widget_class), outer=game_world)
        except Exception:
            widget_instance = None

    if widget_instance is None or not hasattr(widget_instance, "add_to_viewport"):
        return {
            "success": False,
            "message": "Could not instantiate a UserWidget in this UE4.27 Python environment.",
        }

    try:
        widget_instance.add_to_viewport(z_order)
    except Exception as exc:
        return _format_widget_authoring_error(exc)

    return {
        "success": True,
        "widget_blueprint": widget_path,
        "widget_class": get_object_name(widget_class),
        "z_order": z_order,
    }


def set_text_block_binding(args):
    widget_name = args.get("widget_name")
    text_block_name = args.get("text_block_name")
    binding_property = args.get("binding_property") or "TextDelegate"
    function_name = args.get("function_name")
    source_property = args.get("source_property")

    if not function_name and not source_property:
        return {
            "success": False,
            "message": "Either function_name or source_property is required.",
        }

    try:
        widget_blueprint = _load_widget_blueprint(widget_name)
        _apply_delegate_binding(
            widget_blueprint,
            text_block_name,
            binding_property,
            function_name=function_name,
            source_property=source_property,
        )
        return {
            "success": True,
            "widget_blueprint": get_asset_package_name(widget_blueprint),
            "widget": text_block_name,
            "binding_property": binding_property,
            "function_name": function_name,
            "source_property": source_property,
        }
    except Exception as exc:
        return _format_widget_authoring_error(exc)
