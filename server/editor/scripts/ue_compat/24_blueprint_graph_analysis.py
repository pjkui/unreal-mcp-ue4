def serialize_graph_node(node, graph_name=None):
    pin_data = []
    for pin in list(getattr(node, "pins", []) or []):
        linked_nodes = []
        for linked_pin in list(getattr(pin, "linked_to", []) or []):
            try:
                linked_nodes.append(
                    {
                        "pin": get_pin_name(linked_pin),
                        "node_id": get_node_guid_string(linked_pin.get_owning_node()),
                    }
                )
            except Exception:
                continue

        pin_data.append(
            {
                "name": get_pin_name(pin),
                "direction": str(get_editor_property_value(pin, "direction", "")),
                "default_value": get_editor_property_value(pin, "default_value", ""),
                "linked_to": linked_nodes,
            }
        )

    return {
        "id": get_node_guid_string(node),
        "name": get_object_name(node),
        "title": get_node_title_text(node),
        "class": get_object_class_name(node),
        "graph": graph_name,
        "pins": pin_data,
    }


def get_actor_summary(actor):
    actor_summary = {
        "name": actor.get_name(),
        "label": actor.get_actor_label(),
        "class": actor.get_class().get_name(),
        "location": {
            "x": actor.get_actor_location().x,
            "y": actor.get_actor_location().y,
            "z": actor.get_actor_location().z,
        },
        "rotation": {
            "pitch": actor.get_actor_rotation().pitch,
            "yaw": actor.get_actor_rotation().yaw,
            "roll": actor.get_actor_rotation().roll,
        },
        "scale": {
            "x": actor.get_actor_scale3d().x,
            "y": actor.get_actor_scale3d().y,
            "z": actor.get_actor_scale3d().z,
        },
        "hidden_in_editor": bool(actor.is_hidden_ed()),
    }

    try:
        actor_summary["folder_path"] = str(actor.get_folder_path())
    except Exception:
        actor_summary["folder_path"] = ""

    try:
        actor_summary["tags"] = [str(tag) for tag in list(actor.tags)]
    except Exception:
        actor_summary["tags"] = []

    component_summaries = []
    try:
        for component in list(actor.get_components_by_class(unreal.ActorComponent) or [])[:16]:
            component_summaries.append(
                {
                    "name": get_object_name(component),
                    "class": get_object_class_name(component),
                }
            )
    except Exception:
        pass

    actor_summary["components"] = component_summaries
    return actor_summary


def get_actor_property_report(actor):
    actor_report = get_actor_summary(actor)
    common_properties = {}

    for property_name in (
        "mobility",
        "actor_label",
        "can_be_damaged",
        "tick_group",
        "custom_time_dilation",
        "hidden",
        "b_hidden",
    ):
        property_value = get_editor_property_value(actor, property_name)
        if property_value is None:
            continue

        if isinstance(property_value, (str, int, float, bool)):
            common_properties[property_name] = property_value
        else:
            common_properties[property_name] = str(property_value)

    actor_report["properties"] = common_properties
    return actor_report


def set_canvas_panel_slot_layout(slot, position=None, size=None, z_order=None):
    if not slot:
        return

    if position is not None:
        slot.set_position(
            unreal.Vector2D(
                x=float(position[0] if isinstance(position, list) else position.get("x", 0.0)),
                y=float(position[1] if isinstance(position, list) else position.get("y", 0.0)),
            )
        )

    if size is not None and hasattr(slot, "set_size"):
        slot.set_size(
            unreal.Vector2D(
                x=float(size[0] if isinstance(size, list) else size.get("x", 0.0)),
                y=float(size[1] if isinstance(size, list) else size.get("y", 0.0)),
            )
        )

    if z_order is not None and hasattr(slot, "set_z_order"):
        slot.set_z_order(int(z_order))


def set_widget_text(widget, text_value):
    if widget is None:
        return False

    if hasattr(widget, "set_text"):
        try:
            widget.set_text(str(text_value))
            return True
        except Exception:
            pass

    return set_object_property(widget, "text", str(text_value))


def set_widget_font_size(widget, font_size):
    if widget is None or font_size is None:
        return False

    font_data = get_editor_property_value(widget, "font")
    if not font_data:
        return False

    try:
        if hasattr(font_data, "set_editor_property"):
            font_data.set_editor_property("size", int(font_size))
            widget.set_editor_property("font", font_data)
            return True
    except Exception:
        pass

    try:
        font_data.size = int(font_size)
        widget.set_editor_property("font", font_data)
        return True
    except Exception:
        return False


def as_vector3(values, default=None):
    values = values or default or [0.0, 0.0, 0.0]
    if isinstance(values, dict):
        return unreal.Vector(
            x=float(values.get("x", 0.0)),
            y=float(values.get("y", 0.0)),
            z=float(values.get("z", 0.0)),
        )

    return unreal.Vector(
        x=float(values[0]),
        y=float(values[1]),
        z=float(values[2]),
    )


def as_rotator(values, default=None):
    values = values or default or [0.0, 0.0, 0.0]
    if isinstance(values, dict):
        return unreal.Rotator(
            pitch=float(values.get("pitch", 0.0)),
            yaw=float(values.get("yaw", 0.0)),
            roll=float(values.get("roll", 0.0)),
        )

    return unreal.Rotator(
        pitch=float(values[0]),
        yaw=float(values[1]),
        roll=float(values[2]),
    )


def as_linear_color(values, default=None):
    values = values or default or [1.0, 1.0, 1.0, 1.0]
    if isinstance(values, dict):
        return unreal.LinearColor(
            r=float(values.get("r", 1.0)),
            g=float(values.get("g", 1.0)),
            b=float(values.get("b", 1.0)),
            a=float(values.get("a", 1.0)),
        )

    return unreal.LinearColor(
        r=float(values[0]),
        g=float(values[1]),
        b=float(values[2]),
        a=float(values[3] if len(values) > 3 else 1.0),
    )


def sanitize_asset_name(name, fallback="GeneratedAsset"):
    sanitized = re.sub(r"[^A-Za-z0-9_]+", "_", str(name or "")).strip("_")
    return sanitized or fallback


def get_blueprint_variable_descriptions(blueprint):
    return list(get_editor_property_value(blueprint, "new_variables", []) or [])


def serialize_pin_type(pin_type):
    if not pin_type:
        return {}

    pin_category = get_editor_property_value(pin_type, "pin_category")
    pin_subcategory = get_editor_property_value(pin_type, "pin_subcategory")
    pin_subcategory_object = get_editor_property_value(
        pin_type, "pin_subcategory_object"
    )
    container_type = get_editor_property_value(pin_type, "container_type")

    result = {
        "pin_category": str(pin_category or ""),
        "pin_subcategory": str(pin_subcategory or ""),
        "container_type": str(container_type or ""),
        "is_reference": bool(get_editor_property_value(pin_type, "is_reference", False)),
        "is_const": bool(get_editor_property_value(pin_type, "is_const", False)),
        "is_weak_pointer": bool(
            get_editor_property_value(pin_type, "is_weak_pointer", False)
        ),
    }

    if pin_subcategory_object:
        result["pin_subcategory_object"] = {
            "name": get_object_name(pin_subcategory_object),
            "class": get_object_class_name(pin_subcategory_object),
        }

    return result


def serialize_blueprint_variable_desc(variable_desc):
    var_name = str(get_editor_property_value(variable_desc, "var_name", ""))
    friendly_name = str(
        get_editor_property_value(variable_desc, "friendly_name", var_name)
    )
    category_name = str(
        get_editor_property_value(variable_desc, "category", "Default")
    )
    default_value = get_editor_property_value(variable_desc, "default_value")
    tooltip = str(get_editor_property_value(variable_desc, "tooltip", "") or "")
    replication_condition = get_editor_property_value(
        variable_desc, "replication_condition"
    )
    replication_notify = get_editor_property_value(variable_desc, "rep_notify_func")

    return {
        "name": var_name,
        "friendly_name": friendly_name,
        "category": category_name,
        "tooltip": tooltip,
        "default_value": default_value,
        "pin_type": serialize_pin_type(get_editor_property_value(variable_desc, "var_type")),
        "property_flags": int(get_editor_property_value(variable_desc, "property_flags", 0) or 0),
        "replication_condition": str(replication_condition or ""),
        "rep_notify_func": str(replication_notify or ""),
    }


def get_blueprint_function_graphs(blueprint):
    return list(get_editor_property_value(blueprint, "function_graphs", []) or [])


def get_graph_edges(graph):
    edges = []
    seen_edges = set()

    for node in get_graph_nodes(graph):
        node_id = get_node_guid_string(node)
        for pin in list(getattr(node, "pins", []) or []):
            source_pin_name = get_pin_name(pin)
            for linked_pin in list(getattr(pin, "linked_to", []) or []):
                try:
                    target_node = linked_pin.get_owning_node()
                    target_node_id = get_node_guid_string(target_node)
                except Exception:
                    continue

                edge_key = (
                    node_id,
                    source_pin_name,
                    target_node_id,
                    get_pin_name(linked_pin),
                )
                if edge_key in seen_edges:
                    continue

                seen_edges.add(edge_key)
                edges.append(
                    {
                        "source_node_id": node_id,
                        "source_pin": source_pin_name,
                        "target_node_id": target_node_id,
                        "target_pin": get_pin_name(linked_pin),
                    }
                )

    return edges
