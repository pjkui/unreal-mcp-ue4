def get_blueprint_graphs(blueprint):
    graphs = []
    for property_name in (
        "ubergraph_pages",
        "function_graphs",
        "macro_graphs",
        "delegate_signature_graphs",
    ):
        try:
            property_value = get_editor_property_value(blueprint, property_name, []) or []
            graphs.extend(list(property_value))
        except Exception:
            continue
    return graphs


def get_blueprint_event_graph(blueprint):
    ubergraph_pages = list(get_editor_property_value(blueprint, "ubergraph_pages", []) or [])
    if ubergraph_pages:
        for graph in ubergraph_pages:
            if get_object_name(graph).lower() == "eventgraph":
                return graph
        return ubergraph_pages[0]

    for graph in get_blueprint_graphs(blueprint):
        if "event" in get_object_name(graph).lower():
            return graph

    return None


def load_graph_node_class(class_path):
    node_class = resolve_class_reference(class_path)
    if node_class:
        return node_class

    raise ValueError("Blueprint graph node class is not available: {0}".format(class_path))


def create_graph_node(graph, node_class_path, node_position=None):
    if not graph:
        raise ValueError("Blueprint graph is required")

    node_class = load_graph_node_class(node_class_path)

    if not hasattr(graph, "create_node"):
        raise ValueError(
            "Graph node creation is not exposed in this UE4.27 Python environment."
        )

    node = graph.create_node(node_class)
    if not node:
        raise RuntimeError("Failed to create graph node: {0}".format(node_class_path))

    try:
        node.create_new_guid()
    except Exception:
        pass

    if node_position and len(node_position) >= 2:
        set_object_property(node, "node_pos_x", int(node_position[0]))
        set_object_property(node, "node_pos_y", int(node_position[1]))

    try:
        node.post_placed_new_node()
    except Exception:
        pass

    try:
        if len(getattr(node, "pins", []) or []) == 0:
            node.allocate_default_pins()
    except Exception:
        pass

    return node


def try_set_member_reference(member_reference, member_name, parent_class=None, self_context=False):
    if member_reference is None:
        return False

    try:
        if self_context and hasattr(member_reference, "set_self_member"):
            member_reference.set_self_member(member_name)
            return True

        if not self_context and hasattr(member_reference, "set_external_member"):
            member_reference.set_external_member(member_name, get_UClass(parent_class))
            return True
    except Exception:
        pass

    return False


def reconstruct_graph_node(node):
    try:
        node.reconstruct_node()
        return True
    except Exception:
        pass

    try:
        node.allocate_default_pins()
        return True
    except Exception:
        return False


def get_graph_nodes(graph):
    try:
        return list(get_editor_property_value(graph, "nodes", []) or [])
    except Exception:
        return []


def get_node_guid_string(node):
    node_guid = get_editor_property_value(node, "node_guid")
    if node_guid:
        return str(node_guid)

    return get_object_name(node)


def get_node_title_text(node):
    for title_arg in (
        getattr(getattr(unreal, "NodeTitleType", None), "FULL_TITLE", None),
        0,
    ):
        if title_arg is None:
            continue
        try:
            return str(node.get_node_title(title_arg))
        except Exception:
            continue

    return get_object_name(node)


def get_pin_name(pin):
    pin_name = get_editor_property_value(pin, "pin_name")
    if pin_name:
        return str(pin_name)

    return get_object_name(pin)


def find_node_pin(node, pin_name):
    try:
        pin = node.find_pin(pin_name)
        if pin:
            return pin
    except Exception:
        pass

    for pin in list(getattr(node, "pins", []) or []):
        if get_pin_name(pin) == pin_name:
            return pin

    return None


def set_pin_default(pin, value):
    if value is None or pin is None:
        return

    if isinstance(value, bool):
        set_object_property(pin, "default_value", "true" if value else "false")
        return

    if isinstance(value, (int, float)):
        set_object_property(pin, "default_value", str(value))
        return

    if isinstance(value, str) and value.startswith("/"):
        loaded_asset = unreal.EditorAssetLibrary.load_asset(value)
        if loaded_asset:
            set_object_property(pin, "default_object", loaded_asset)
            set_object_property(pin, "default_value", "")
            return

    if isinstance(value, str):
        set_object_property(pin, "default_value", value)
        return

    set_object_property(pin, "default_value", json.dumps(value))


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


def find_blueprint_graph_node(blueprint, node_id):
    if not node_id:
        return None, None

    normalized_node_id = str(node_id)
    for graph in get_blueprint_graphs(blueprint):
        for node in get_graph_nodes(graph):
            if (
                get_node_guid_string(node) == normalized_node_id
                or get_object_name(node) == normalized_node_id
            ):
                return graph, node

    return None, None


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


def break_pin_links(pin, target_pin=None):
    if pin is None:
        return 0

    broken_count = 0

    if target_pin is not None:
        break_link_to = getattr(pin, "break_link_to", None)
        if callable(break_link_to):
            break_link_to(target_pin)
            return 1

        linked_pins = list(getattr(pin, "linked_to", []) or [])
        if target_pin in linked_pins:
            try:
                linked_pins.remove(target_pin)
                set_object_property(pin, "linked_to", linked_pins)
                broken_count += 1
            except Exception:
                pass

        return broken_count

    break_all_links = getattr(pin, "break_all_pin_links", None)
    if callable(break_all_links):
        linked_count = len(list(getattr(pin, "linked_to", []) or []))
        try:
            break_all_links()
            return linked_count
        except Exception:
            pass

    for linked_pin in list(getattr(pin, "linked_to", []) or []):
        try:
            if hasattr(pin, "break_link_to"):
                pin.break_link_to(linked_pin)
                broken_count += 1
        except Exception:
            continue

    return broken_count
