import json


def _format_widget_authoring_error(exc):
    message = str(exc)
    if "editable widget tree in UE4.27 Python" in message:
        return {
            "success": False,
            "message": message,
            "unsupported_capability": "widget_tree_authoring",
        }

    return {"success": False, "message": message}


def _linear_color_from_list(color_values, default=None):
    values = color_values or default or [1.0, 1.0, 1.0, 1.0]
    return unreal.LinearColor(
        r=float(values[0]),
        g=float(values[1]),
        b=float(values[2]),
        a=float(values[3]),
    )


def _load_widget_blueprint(widget_name):
    return load_blueprint_asset(widget_name, allow_widget=True)


def _ensure_root_canvas(widget_blueprint):
    widget_tree = get_widget_tree(widget_blueprint)
    root_widget = get_root_widget(widget_tree)
    if root_widget:
        return widget_tree, root_widget

    root_widget = create_widget_instance(widget_tree, "CanvasPanel", "RootCanvas")
    add_widget_to_tree(widget_tree, root_widget, None)
    return widget_tree, root_widget


def _try_set_widget_color(widget, color_values):
    if color_values is None:
        return False

    linear_color = _linear_color_from_list(color_values)

    for method_name in ("set_color_and_opacity", "set_foreground_color"):
        method = getattr(widget, method_name, None)
        if callable(method):
            try:
                method(linear_color)
                return True
            except Exception:
                continue

    return False


def create_umg_widget_blueprint(args):
    widget_name = args.get("widget_name")
    parent_class_name = args.get("parent_class") or "UserWidget"
    content_path = args.get("path") or "/Game/UI"

    asset_name, package_path = split_asset_name_and_path(widget_name, content_path)
    parent_class = resolve_class_reference(parent_class_name, ["UMG"])
    if not parent_class:
        return {
            "success": False,
            "message": "Widget parent class not found: {0}".format(parent_class_name),
        }

    factory = unreal.WidgetBlueprintFactory()
    parent_uclass = get_UClass(parent_class)
    if not parent_uclass:
        return {
            "success": False,
            "message": "Could not resolve UClass for widget parent class: {0}".format(
                parent_class_name
            ),
        }

    try:
        factory.set_editor_property("parent_class", parent_uclass)
    except Exception as exc:
        return {
            "success": False,
            "message": "Failed to assign widget blueprint parent class '{0}': {1}".format(
                parent_class_name, exc
            ),
        }
    widget_blueprint = create_asset_with_factory(
        asset_name,
        package_path,
        unreal.WidgetBlueprint,
        factory,
    )
    if not widget_blueprint:
        return {
            "success": False,
            "message": "Failed to create widget blueprint asset '{0}'".format(asset_name),
        }

    asset_path = "{0}/{1}".format(package_path, asset_name)
    save_widget_blueprint(widget_blueprint)
    return {
        "success": True,
        "widget_name": asset_name,
        "asset_path": asset_path,
        "parent_class": get_object_name(parent_uclass),
    }


def add_text_block_to_widget(args):
    widget_name = args.get("widget_name")
    text_block_name = args.get("text_block_name")
    text_value = args.get("text", "")
    position = args.get("position") or [0.0, 0.0]
    size = args.get("size") or [200.0, 50.0]
    font_size = args.get("font_size")
    color_values = args.get("color")

    try:
        widget_blueprint = _load_widget_blueprint(widget_name)
        widget_tree, root_widget = _ensure_root_canvas(widget_blueprint)
        root_widget = require_panel_widget(root_widget, get_widget_name(root_widget))
        text_block = create_widget_instance(widget_tree, "TextBlock", text_block_name)
        slot = add_widget_to_tree(widget_tree, text_block, root_widget)
        set_canvas_panel_slot_layout(slot, position=position, size=size)
        set_widget_text(text_block, text_value)
        set_widget_font_size(text_block, font_size)
        _try_set_widget_color(text_block, color_values)
        save_widget_blueprint(widget_blueprint)
        return {
            "success": True,
            "widget_blueprint": get_asset_package_name(widget_blueprint),
            "widget": {
                "name": text_block_name,
                "class": "TextBlock",
                "text": text_value,
                "position": {"x": float(position[0]), "y": float(position[1])},
                "size": {"x": float(size[0]), "y": float(size[1])},
            },
        }
    except Exception as exc:
        return _format_widget_authoring_error(exc)


def add_button_to_widget(args):
    widget_name = args.get("widget_name")
    button_name = args.get("button_name")
    text_value = args.get("text", "")
    position = args.get("position") or [0.0, 0.0]
    size = args.get("size") or [200.0, 50.0]
    font_size = args.get("font_size")
    text_color = args.get("color")
    background_color = args.get("background_color")

    try:
        widget_blueprint = _load_widget_blueprint(widget_name)
        widget_tree, root_widget = _ensure_root_canvas(widget_blueprint)
        root_widget = require_panel_widget(root_widget, get_widget_name(root_widget))

        button_widget = create_widget_instance(widget_tree, "Button", button_name)
        button_slot = add_widget_to_tree(widget_tree, button_widget, root_widget)
        set_canvas_panel_slot_layout(button_slot, position=position, size=size)
        _try_set_widget_color(button_widget, background_color)

        if text_value:
            text_block_name = "{0}_Text".format(button_name)
            text_block = create_widget_instance(widget_tree, "TextBlock", text_block_name)
            add_widget_to_tree(widget_tree, text_block, button_widget)
            set_widget_text(text_block, text_value)
            set_widget_font_size(text_block, font_size)
            _try_set_widget_color(text_block, text_color)

        save_widget_blueprint(widget_blueprint)
        return {
            "success": True,
            "widget_blueprint": get_asset_package_name(widget_blueprint),
            "widget": {
                "name": button_name,
                "class": "Button",
                "text": text_value,
                "position": {"x": float(position[0]), "y": float(position[1])},
                "size": {"x": float(size[0]), "y": float(size[1])},
            },
        }
    except Exception as exc:
        return _format_widget_authoring_error(exc)


def _apply_delegate_binding(widget_blueprint, object_name, property_name, function_name=None, source_property=None):
    binding_class = getattr(unreal, "DelegateEditorBinding", None)
    if not binding_class:
        raise ValueError(
            "DelegateEditorBinding is not exposed in this UE4.27 Python environment."
        )

    bindings = list(get_editor_property_value(widget_blueprint, "bindings", []) or [])
    binding = binding_class()
    set_object_property(binding, "object_name", object_name)
    set_object_property(binding, "property_name", property_name)

    if function_name:
        set_object_property(binding, "function_name", function_name)
    if source_property:
        set_object_property(binding, "source_property", source_property)

    filtered_bindings = []
    for existing_binding in bindings:
        existing_object_name = str(get_editor_property_value(existing_binding, "object_name", ""))
        existing_property_name = str(get_editor_property_value(existing_binding, "property_name", ""))
        if existing_object_name == object_name and existing_property_name == property_name:
            continue
        filtered_bindings.append(existing_binding)

    filtered_bindings.append(binding)
    set_object_property(widget_blueprint, "bindings", filtered_bindings)
    finalize_blueprint_change(widget_blueprint, structural=True)


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

    try:
        widget_blueprint = _load_widget_blueprint(widget_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    widget_class = None
    widget_path = get_asset_package_name(widget_blueprint)
    try:
        widget_class = unreal.EditorAssetLibrary.load_blueprint_class(widget_path)
    except Exception:
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


OPERATIONS = {
    "create_umg_widget_blueprint": create_umg_widget_blueprint,
    "add_text_block_to_widget": add_text_block_to_widget,
    "add_button_to_widget": add_button_to_widget,
    "bind_widget_event": bind_widget_event,
    "add_widget_to_viewport": add_widget_to_viewport,
    "set_text_block_binding": set_text_block_binding,
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
                    "message": "Unknown UMG tool operation: {0}".format(operation),
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
