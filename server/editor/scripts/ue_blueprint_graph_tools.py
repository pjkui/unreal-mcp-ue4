import json


def _load_blueprint_and_graph(blueprint_name, graph_name=None):
    blueprint = load_blueprint_asset(blueprint_name)
    if graph_name:
        for graph in get_blueprint_graphs(blueprint):
            if get_object_name(graph) == graph_name:
                return blueprint, graph
        raise ValueError("Blueprint graph not found: {0}".format(graph_name))

    graph = get_blueprint_event_graph(blueprint)
    if not graph:
        raise ValueError(
            "Blueprint does not expose an event graph in this UE4.27 environment."
        )

    return blueprint, graph


def _find_component_class(blueprint, component_name):
    component_node, component_template = get_component_template(blueprint, component_name)
    return component_node, component_template, component_template.get_class()


def _result_for_node(blueprint, graph, node):
    finalize_blueprint_change(blueprint, structural=True)
    return {
        "success": True,
        "node": serialize_graph_node(node, get_object_name(graph)),
    }


def add_blueprint_event_node(args):
    blueprint_name = args.get("blueprint_name")
    event_name = args.get("event_name")
    node_position = args.get("node_position") or [0, 0]

    try:
        blueprint, graph = _load_blueprint_and_graph(blueprint_name, args.get("graph_name"))
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    utility_class = getattr(unreal, "KismetEditorUtilities", None)
    if utility_class and hasattr(utility_class, "add_default_event_node"):
        try:
            in_out_pos_y = int(node_position[1])
            node = utility_class.add_default_event_node(
                blueprint,
                graph,
                event_name,
                get_blueprint_parent_class(blueprint),
                in_out_pos_y,
            )
            if node:
                set_object_property(node, "node_pos_x", int(node_position[0]))
                set_object_property(node, "node_pos_y", int(node_position[1]))
                return _result_for_node(blueprint, graph, node)
        except Exception:
            pass

    try:
        node = create_graph_node(graph, "/Script/BlueprintGraph.K2Node_Event", node_position)
        event_reference = get_editor_property_value(node, "event_reference")
        if not try_set_member_reference(
            event_reference,
            event_name,
            parent_class=get_blueprint_parent_class(blueprint),
            self_context=False,
        ):
            return {
                "success": False,
                "message": "UE4.27 Python could not configure K2Node_Event references in this environment.",
            }

        set_object_property(node, "event_reference", event_reference)
        set_object_property(node, "b_override_function", True)
        reconstruct_graph_node(node)
        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def add_blueprint_input_action_node(args):
    blueprint_name = args.get("blueprint_name")
    action_name = args.get("action_name")
    node_position = args.get("node_position") or [0, 0]

    try:
        blueprint, graph = _load_blueprint_and_graph(blueprint_name, args.get("graph_name"))
        node = create_graph_node(
            graph, "/Script/BlueprintGraph.K2Node_InputAction", node_position
        )
        set_object_property(node, "input_action_name", action_name)
        reconstruct_graph_node(node)
        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def add_blueprint_function_node(args):
    blueprint_name = args.get("blueprint_name")
    target = args.get("target") or "self"
    function_name = args.get("function_name")
    params = args.get("params") or {}
    node_position = args.get("node_position") or [0, 0]

    try:
        blueprint, graph = _load_blueprint_and_graph(blueprint_name, args.get("graph_name"))
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    try:
        if str(target).lower() == "self":
            node = create_graph_node(
                graph, "/Script/BlueprintGraph.K2Node_CallFunction", node_position
            )
            target_class = get_blueprint_parent_class(blueprint)
            function_reference = get_editor_property_value(node, "function_reference")
            configured = try_set_member_reference(
                function_reference,
                function_name,
                parent_class=target_class,
                self_context=True,
            )
            set_object_property(node, "function_reference", function_reference)
        else:
            _, _, target_class = _find_component_class(blueprint, target)
            node = create_graph_node(
                graph,
                "/Script/BlueprintGraph.K2Node_CallFunctionOnMember",
                node_position,
            )
            function_reference = get_editor_property_value(node, "function_reference")
            configured = try_set_member_reference(
                function_reference,
                function_name,
                parent_class=target_class,
                self_context=False,
            )
            set_object_property(node, "function_reference", function_reference)

            member_reference = get_editor_property_value(
                node, "member_variable_to_call_on"
            )
            configured = configured and try_set_member_reference(
                member_reference,
                target,
                self_context=True,
            )
            set_object_property(node, "member_variable_to_call_on", member_reference)

        if not configured:
            return {
                "success": False,
                "message": "UE4.27 Python could not configure function node references in this environment.",
            }

        reconstruct_graph_node(node)

        for param_name, param_value in params.items():
            pin = find_node_pin(node, param_name)
            if pin:
                set_pin_default(pin, param_value)

        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def connect_blueprint_nodes(args):
    blueprint_name = args.get("blueprint_name")
    source_node_id = args.get("source_node_id")
    source_pin_name = args.get("source_pin")
    target_node_id = args.get("target_node_id")
    target_pin_name = args.get("target_pin")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    source_graph, source_node = find_blueprint_graph_node(blueprint, source_node_id)
    target_graph, target_node = find_blueprint_graph_node(blueprint, target_node_id)
    if not source_node or not target_node:
        return {
            "success": False,
            "message": "Could not find both graph nodes by id.",
        }

    source_pin = find_node_pin(source_node, source_pin_name)
    target_pin = find_node_pin(target_node, target_pin_name)
    if not source_pin or not target_pin:
        return {
            "success": False,
            "message": "Could not find both graph pins for the requested connection.",
        }

    try:
        source_pin.make_link_to(target_pin)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    finalize_blueprint_change(blueprint, structural=True)
    return {
        "success": True,
        "source": {
            "graph": get_object_name(source_graph),
            "node_id": get_node_guid_string(source_node),
            "pin": source_pin_name,
        },
        "target": {
            "graph": get_object_name(target_graph),
            "node_id": get_node_guid_string(target_node),
            "pin": target_pin_name,
        },
    }


def _build_pin_type(variable_type_name):
    pin_type_class = getattr(unreal, "EdGraphPinType", None)
    if not pin_type_class:
        raise ValueError(
            "EdGraphPinType is not exposed in this UE4.27 Python environment."
        )

    pin_type = pin_type_class()
    variable_type_lower = str(variable_type_name or "").strip().lower()

    struct_types = {
        "vector": unreal.Vector.static_struct(),
        "rotator": unreal.Rotator.static_struct(),
        "transform": unreal.Transform.static_struct(),
        "linearcolor": unreal.LinearColor.static_struct(),
        "color": unreal.LinearColor.static_struct(),
    }
    primitive_categories = {
        "bool": "bool",
        "boolean": "bool",
        "int": "int",
        "integer": "int",
        "float": "float",
        "real": "float",
        "string": "string",
        "name": "name",
        "text": "text",
    }

    if variable_type_lower in primitive_categories:
        set_object_property(pin_type, "pin_category", primitive_categories[variable_type_lower])
        return pin_type

    if variable_type_lower in struct_types:
        set_object_property(pin_type, "pin_category", "struct")
        set_object_property(pin_type, "pin_subcategory_object", struct_types[variable_type_lower])
        return pin_type

    if variable_type_lower.startswith("object:"):
        class_name = variable_type_name.split(":", 1)[1]
        object_class = resolve_class_reference(class_name, ["Engine", "UMG"])
        if not object_class:
            raise ValueError("Object variable class not found: {0}".format(class_name))
        set_object_property(pin_type, "pin_category", "object")
        set_object_property(pin_type, "pin_subcategory_object", get_UClass(object_class))
        return pin_type

    raise ValueError("Unsupported blueprint variable type: {0}".format(variable_type_name))


def add_blueprint_variable(args):
    blueprint_name = args.get("blueprint_name")
    variable_name = args.get("variable_name")
    variable_type = args.get("variable_type")
    is_exposed = bool(args.get("is_exposed", args.get("is_public", False)))
    default_value = args.get("default_value")
    tooltip = args.get("tooltip")
    category = args.get("category")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    variables = list(get_editor_property_value(blueprint, "new_variables", []) or [])
    for existing_var in variables:
        existing_name = str(get_editor_property_value(existing_var, "var_name", ""))
        if existing_name == variable_name:
            return {
                "success": False,
                "message": "Blueprint variable already exists: {0}".format(variable_name),
            }

    variable_desc_class = getattr(unreal, "BPVariableDescription", None)
    if not variable_desc_class:
        return {
            "success": False,
            "message": "BPVariableDescription is not exposed in this UE4.27 Python environment.",
        }

    try:
        variable_desc = variable_desc_class()
        set_object_property(variable_desc, "var_name", variable_name)
        set_object_property(variable_desc, "friendly_name", variable_name)
        set_object_property(variable_desc, "var_type", _build_pin_type(variable_type))
        if tooltip:
            set_object_property(variable_desc, "tooltip", tooltip)
        if category:
            set_object_property(variable_desc, "category", category)

        if is_exposed:
            property_flags = get_editor_property_value(variable_desc, "property_flags", 0)
            set_object_property(variable_desc, "property_flags", int(property_flags) | 0x1 | 0x4)

        variables.append(variable_desc)
        set_object_property(blueprint, "new_variables", variables)
        finalize_blueprint_change(blueprint, structural=True)
        if default_value is not None:
            cdo = get_blueprint_default_object(blueprint)
            if cdo:
                set_object_property(cdo, variable_name, default_value)
                save_loaded_editor_asset(blueprint)
        return {
            "success": True,
            "blueprint": get_asset_package_name(blueprint),
            "variable_name": variable_name,
            "variable_type": variable_type,
            "default_value": default_value,
            "is_public": is_exposed,
        }
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def add_node(args):
    node_type = str(args.get("node_type") or args.get("node_kind") or "").strip().lower()
    node_class = args.get("node_class")

    if node_type in ("event", "event_node"):
        return add_blueprint_event_node(
            {
                "blueprint_name": args.get("blueprint_name"),
                "event_name": args.get("event_name"),
                "graph_name": args.get("graph_name"),
                "node_position": args.get("node_position"),
            }
        )

    if node_type in ("input_action", "inputaction", "input_action_node"):
        return add_blueprint_input_action_node(
            {
                "blueprint_name": args.get("blueprint_name"),
                "action_name": args.get("action_name"),
                "graph_name": args.get("graph_name"),
                "node_position": args.get("node_position"),
            }
        )

    if node_type in ("function", "function_call", "call_function"):
        return add_blueprint_function_node(
            {
                "blueprint_name": args.get("blueprint_name"),
                "target": args.get("target"),
                "function_name": args.get("function_name"),
                "params": args.get("params"),
                "graph_name": args.get("graph_name"),
                "node_position": args.get("node_position"),
            }
        )

    if node_type in ("self", "self_reference"):
        return add_blueprint_self_reference(
            {
                "blueprint_name": args.get("blueprint_name"),
                "graph_name": args.get("graph_name"),
                "node_position": args.get("node_position"),
            }
        )

    if node_type in ("component_reference", "get_self_component_reference"):
        return add_blueprint_get_self_component_reference(
            {
                "blueprint_name": args.get("blueprint_name"),
                "component_name": args.get("component_name"),
                "graph_name": args.get("graph_name"),
                "node_position": args.get("node_position"),
            }
        )

    if not node_class:
        return {
            "success": False,
            "message": "Provide node_type for a supported helper or node_class for raw node creation.",
        }

    try:
        blueprint, graph = _load_blueprint_and_graph(
            args.get("blueprint_name"),
            args.get("graph_name"),
        )
        normalized_node_class = str(node_class)
        if not normalized_node_class.startswith("/Script/"):
            normalized_node_class = "/Script/BlueprintGraph.{0}".format(node_class)
        node = create_graph_node(graph, normalized_node_class, args.get("node_position") or [0, 0])
        reconstruct_graph_node(node)
        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def connect_nodes(args):
    args = dict(args or {})
    args["source_node_id"] = args.get("source_node_id") or args.get("source_node")
    args["target_node_id"] = args.get("target_node_id") or args.get("target_node")
    return connect_blueprint_nodes(args)


def disconnect_nodes(args):
    blueprint_name = args.get("blueprint_name")
    source_node_id = args.get("source_node_id") or args.get("source_node")
    source_pin_name = args.get("source_pin")
    target_node_id = args.get("target_node_id") or args.get("target_node")
    target_pin_name = args.get("target_pin")

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    source_graph, source_node = find_blueprint_graph_node(blueprint, source_node_id)
    if not source_node:
        return {"success": False, "message": "Could not find source node."}

    source_pin = find_node_pin(source_node, source_pin_name)
    if not source_pin:
        return {"success": False, "message": "Could not find source pin."}

    target_pin = None
    target_graph = None
    target_node = None
    if target_node_id and target_pin_name:
        target_graph, target_node = find_blueprint_graph_node(blueprint, target_node_id)
        if not target_node:
            return {"success": False, "message": "Could not find target node."}
        target_pin = find_node_pin(target_node, target_pin_name)
        if not target_pin:
            return {"success": False, "message": "Could not find target pin."}

    try:
        broken_links = break_pin_links(source_pin, target_pin)
        finalize_blueprint_change(blueprint, structural=True)
        return {
            "success": True,
            "broken_links": broken_links,
            "source": {
                "graph": get_object_name(source_graph),
                "node_id": get_node_guid_string(source_node),
                "pin": source_pin_name,
            },
            "target": {
                "graph": get_object_name(target_graph) if target_graph else None,
                "node_id": get_node_guid_string(target_node) if target_node else None,
                "pin": target_pin_name,
            },
        }
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def create_variable(args):
    return add_blueprint_variable(args)


def add_blueprint_get_self_component_reference(args):
    blueprint_name = args.get("blueprint_name")
    component_name = args.get("component_name")
    node_position = args.get("node_position") or [0, 0]

    try:
        blueprint, graph = _load_blueprint_and_graph(blueprint_name, args.get("graph_name"))
        _find_component_class(blueprint, component_name)
        node = create_graph_node(
            graph,
            "/Script/BlueprintGraph.K2Node_VariableGet",
            node_position,
        )
        variable_reference = get_editor_property_value(node, "variable_reference")
        if not try_set_member_reference(variable_reference, component_name, self_context=True):
            return {
                "success": False,
                "message": "UE4.27 Python could not configure component reference nodes in this environment.",
            }

        set_object_property(node, "variable_reference", variable_reference)
        reconstruct_graph_node(node)
        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def add_blueprint_self_reference(args):
    blueprint_name = args.get("blueprint_name")
    node_position = args.get("node_position") or [0, 0]

    try:
        blueprint, graph = _load_blueprint_and_graph(blueprint_name, args.get("graph_name"))
        node = create_graph_node(graph, "/Script/BlueprintGraph.K2Node_Self", node_position)
        reconstruct_graph_node(node)
        return _result_for_node(blueprint, graph, node)
    except Exception as exc:
        return {"success": False, "message": str(exc)}


def find_blueprint_nodes(args):
    blueprint_name = args.get("blueprint_name")
    search_term = str(args.get("search_term") or "").strip().lower()
    graph_name = args.get("graph_name")
    node_class_filter = str(args.get("node_class") or "").strip().lower()

    try:
        blueprint = load_blueprint_asset(blueprint_name)
    except Exception as exc:
        return {"success": False, "message": str(exc), "nodes": []}

    results = []
    for graph in get_blueprint_graphs(blueprint):
        current_graph_name = get_object_name(graph)
        if graph_name and current_graph_name != graph_name:
            continue

        for node in get_graph_nodes(graph):
            node_info = serialize_graph_node(node, current_graph_name)

            if search_term and search_term not in (
                "{0} {1} {2}".format(
                    node_info["title"],
                    node_info["name"],
                    node_info["class"],
                ).lower()
            ):
                continue

            if node_class_filter and node_class_filter not in node_info["class"].lower():
                continue

            results.append(node_info)

    return {
        "success": True,
        "blueprint": get_asset_package_name(blueprint),
        "count": len(results),
        "nodes": results,
    }


OPERATIONS = {
    "add_blueprint_event_node": add_blueprint_event_node,
    "add_blueprint_input_action_node": add_blueprint_input_action_node,
    "add_blueprint_function_node": add_blueprint_function_node,
    "connect_blueprint_nodes": connect_blueprint_nodes,
    "add_node": add_node,
    "connect_nodes": connect_nodes,
    "disconnect_nodes": disconnect_nodes,
    "add_blueprint_variable": add_blueprint_variable,
    "create_variable": create_variable,
    "add_blueprint_get_self_component_reference": add_blueprint_get_self_component_reference,
    "add_blueprint_self_reference": add_blueprint_self_reference,
    "find_blueprint_nodes": find_blueprint_nodes,
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
                    "message": "Unknown blueprint graph tool operation: {0}".format(
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
