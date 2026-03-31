def add_component_to_blueprint_via_harvest(
    blueprint,
    component_class,
    component_name,
    location=None,
    rotation=None,
    scale=None,
    component_properties=None,
):
    if not supports_kismet_component_harvest():
        raise ValueError(
            "KismetEditorUtilities.add_components_to_blueprint is not available in this UE4.27 Python environment."
        )

    template_name = str(component_name or "").strip()
    if not template_name:
        raise ValueError("component_name is required")

    temp_actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.Actor,
        unreal.Vector(0.0, 0.0, 0.0),
        unreal.Rotator(0.0, 0.0, 0.0),
    )
    if not temp_actor:
        raise RuntimeError("Failed to spawn a temporary actor for Blueprint component harvest.")

    component_template = None
    try:
        component_template = unreal.new_object(component_class, temp_actor, template_name)

        if not component_template:
            raise RuntimeError(
                "Failed to create a temporary component instance: {0}".format(template_name)
            )

        try:
            component_template.rename(template_name, temp_actor)
        except Exception:
            pass

        try:
            if hasattr(temp_actor, "add_instance_component"):
                temp_actor.add_instance_component(component_template)
        except Exception:
            pass

        if class_is_child_of(component_class, unreal.SceneComponent):
            current_root = None
            try:
                current_root = temp_actor.get_root_component()
            except Exception:
                current_root = get_editor_property_value(temp_actor, "root_component")

            if current_root and current_root != component_template:
                try:
                    component_template.attach_to_component(
                        current_root,
                        unreal.AttachmentTransformRules.KEEP_RELATIVE_TRANSFORM,
                    )
                except Exception:
                    try:
                        component_template.setup_attachment(current_root)
                    except Exception:
                        pass
            else:
                try:
                    temp_actor.set_root_component(component_template)
                except Exception:
                    set_object_property(temp_actor, "root_component", component_template)

        try:
            if hasattr(component_template, "on_component_created"):
                component_template.on_component_created()
        except Exception:
            pass

        try:
            if hasattr(component_template, "register_component"):
                component_template.register_component()
        except Exception:
            pass

        apply_scene_component_transform(component_template, location, rotation, scale)

        for property_name, property_value in (component_properties or {}).items():
            apply_component_property(component_template, property_name, property_value)

        harvest_attempts = [
            lambda: unreal.KismetEditorUtilities.add_components_to_blueprint(
                blueprint,
                [component_template],
                True,
            ),
            lambda: unreal.KismetEditorUtilities.add_components_to_blueprint(
                blueprint,
                [component_template],
            ),
        ]

        last_error = None
        for harvest_attempt in harvest_attempts:
            try:
                harvest_attempt()
                break
            except Exception as exc:
                last_error = exc
        else:
            raise last_error if last_error else RuntimeError(
                "Failed to harvest the temporary component into the Blueprint."
            )
    finally:
        try:
            unreal.EditorLevelLibrary.destroy_actor(temp_actor)
        except Exception:
            pass

    return find_blueprint_cdo_component(blueprint, component_name)


def add_component_template_to_blueprint(
    blueprint,
    component_class,
    component_name,
    location=None,
    rotation=None,
    scale=None,
    component_properties=None,
):
    generated_class = get_blueprint_generated_class(blueprint)
    if not generated_class:
        raise ValueError(
            "Blueprint generated class is not available for component template creation."
        )

    template_name = str(component_name or "").strip()
    if not template_name:
        raise ValueError("component_name is required")

    template_outer = get_blueprint_default_object(blueprint) or generated_class
    new_template = new_object_with_flags(
        component_class,
        template_outer,
        template_name,
        "PUBLIC",
        "ARCHETYPE_OBJECT",
        "TRANSACTIONAL",
    )
    if not new_template:
        raise RuntimeError(
            "Failed to create blueprint component template: {0}".format(component_name)
        )

    apply_scene_component_transform(new_template, location, rotation, scale)

    for property_name, property_value in (component_properties or {}).items():
        apply_component_property(new_template, property_name, property_value)

    component_templates = get_blueprint_component_templates(blueprint)
    if new_template not in component_templates:
        component_templates.append(new_template)
        set_object_property(blueprint, "component_templates", component_templates)

    return new_template


def add_component_node_to_blueprint(
    blueprint, component_class, component_name, parent_component_name=None
):
    if blueprint_supports_scs_editing(blueprint):
        scs = get_simple_construction_script(blueprint)
        create_node = getattr(scs, "create_node", None)
        add_node = getattr(scs, "add_node", None)

        new_node = create_node(get_UClass(component_class), component_name)
        if not new_node:
            raise RuntimeError(
                "Failed to create blueprint component node: {0}".format(component_name)
            )

        if parent_component_name:
            parent_node = find_scs_node(scs, parent_component_name)
            if not parent_node:
                raise ValueError(
                    "Parent component not found in blueprint: {0}".format(
                        parent_component_name
                    )
                )

            if not hasattr(parent_node, "add_child_node"):
                raise ValueError(
                    "Parent component cannot accept child nodes in this UE4.27 Python environment."
                )

            parent_node.add_child_node(new_node)
            return new_node

        root_nodes = get_scs_root_nodes(scs)
        default_root_node = get_default_scene_root_node(scs)

        if (
            root_nodes
            and not (len(root_nodes) == 1 and root_nodes[0] == default_root_node)
            and hasattr(root_nodes[0], "add_child_node")
            and class_is_child_of(component_class, unreal.SceneComponent)
        ):
            root_nodes[0].add_child_node(new_node)
        else:
            add_node(new_node)

        return new_node

    if parent_component_name:
        raise ValueError(
            "UE4.27 Python cannot parent Blueprint components without SimpleConstructionScript editing support."
        )

    construction_graph = get_blueprint_construction_graph(blueprint)
    if not construction_graph:
        raise ValueError(
            "Blueprint does not expose a UserConstructionScript graph in this UE4.27 Python environment."
        )

    generated_class = get_blueprint_generated_class(blueprint)
    if not generated_class:
        raise ValueError(
            "Blueprint generated class is not available for component template creation."
        )

    template_name = str(component_name).strip()
    if not template_name:
        raise ValueError("component_name is required")

    new_template = unreal.new_object(component_class, generated_class, template_name)
    if not new_template:
        raise RuntimeError(
            "Failed to create blueprint component template: {0}".format(component_name)
        )

    component_templates = get_blueprint_component_templates(blueprint)
    component_templates.append(new_template)
    set_object_property(blueprint, "component_templates", component_templates)

    node = create_graph_node(
        construction_graph,
        "/Script/BlueprintGraph.K2Node_AddComponent",
        [0, len(get_graph_nodes(construction_graph)) * 180],
    )

    function_reference = get_editor_property_value(node, "function_reference")
    try_set_member_reference(
        function_reference,
        "AddComponent",
        parent_class=unreal.Actor,
        self_context=True,
    )
    set_object_property(node, "function_reference", function_reference)
    set_object_property(node, "template_type", get_UClass(component_class))
    reconstruct_graph_node(node)

    template_name_pin = find_node_pin(node, "TemplateName")
    if template_name_pin:
        set_pin_default(template_name_pin, get_object_name(new_template))

    entry_node = None
    for graph_node in get_graph_nodes(construction_graph):
        if get_object_class_name(graph_node) == "K2Node_FunctionEntry":
            entry_node = graph_node
            break

    if entry_node:
        entry_pin = find_node_pin(entry_node, "then") or find_node_pin(entry_node, "Then")
        execute_pin = find_node_pin(node, "execute") or find_node_pin(node, "Execute")
        if entry_pin and execute_pin and not list(getattr(entry_pin, "linked_to", []) or []):
            try:
                entry_pin.make_link_to(execute_pin)
            except Exception:
                pass

    return node
