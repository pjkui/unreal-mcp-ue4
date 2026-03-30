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


def get_scs_all_nodes(scs):
    try:
        return list(scs.get_all_nodes())
    except Exception:
        pass

    try:
        return list(get_editor_property_value(scs, "all_nodes", []) or [])
    except Exception:
        pass

    return []


def get_scs_root_nodes(scs):
    try:
        return list(get_editor_property_value(scs, "root_nodes", []) or [])
    except Exception:
        return []


def get_default_scene_root_node(scs):
    try:
        return scs.get_default_scene_root_node()
    except Exception:
        return get_editor_property_value(scs, "default_scene_root_node")


def get_scs_node_name(node):
    try:
        return str(node.get_variable_name())
    except Exception:
        pass

    variable_name = get_editor_property_value(node, "internal_variable_name")
    if variable_name:
        return str(variable_name)

    component_template = get_editor_property_value(node, "component_template")
    if component_template:
        return get_object_name(component_template)

    return get_object_name(node)


def get_scs_node_template(node):
    return get_editor_property_value(node, "component_template")


def find_scs_node(blueprint_or_scs, component_name):
    if not component_name:
        return None

    scs = blueprint_or_scs
    if get_object_class_name(blueprint_or_scs).endswith("Blueprint"):
        scs = get_simple_construction_script(blueprint_or_scs)

    try:
        node = scs.find_scs_node(component_name)
        if node:
            return node
    except Exception:
        pass

    for node in get_scs_all_nodes(scs):
        node_name = get_scs_node_name(node)
        if node_name == component_name:
            return node

    return None


def apply_scene_component_transform(
    component, location=None, rotation=None, scale=None
):
    if component is None:
        return

    if location is not None:
        relative_location = unreal.Vector(
            x=float(location[0] if isinstance(location, list) else location.get("x", 0.0)),
            y=float(location[1] if isinstance(location, list) else location.get("y", 0.0)),
            z=float(location[2] if isinstance(location, list) else location.get("z", 0.0)),
        )

        try:
            component.set_relative_location(relative_location, False, None, False)
        except Exception:
            try:
                component.set_relative_location(relative_location)
            except Exception:
                set_object_property(component, "relative_location", relative_location)

    if rotation is not None:
        relative_rotation = unreal.Rotator(
            pitch=float(rotation[0] if isinstance(rotation, list) else rotation.get("pitch", 0.0)),
            yaw=float(rotation[1] if isinstance(rotation, list) else rotation.get("yaw", 0.0)),
            roll=float(rotation[2] if isinstance(rotation, list) else rotation.get("roll", 0.0)),
        )

        try:
            component.set_relative_rotation(relative_rotation, False, None, False)
        except Exception:
            try:
                component.set_relative_rotation(relative_rotation)
            except Exception:
                set_object_property(component, "relative_rotation", relative_rotation)

    if scale is not None:
        relative_scale = unreal.Vector(
            x=float(scale[0] if isinstance(scale, list) else scale.get("x", 1.0)),
            y=float(scale[1] if isinstance(scale, list) else scale.get("y", 1.0)),
            z=float(scale[2] if isinstance(scale, list) else scale.get("z", 1.0)),
        )

        try:
            component.set_relative_scale3d(relative_scale)
        except Exception:
            set_object_property(component, "relative_scale3d", relative_scale)


def resolve_component_class(component_type):
    component_class = resolve_class_reference(
        component_type,
        ["Engine", "UMG", "Paper2D", "Niagara", "AIModule"],
    )
    if component_class:
        return component_class

    return resolve_actor_class(component_type)


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


def get_component_template(blueprint, component_name):
    component_node = None
    if blueprint_supports_scs_lookup(blueprint):
        component_node = find_scs_node(blueprint, component_name)
        if component_node:
            component_template = get_scs_node_template(component_node)
            if not component_template:
                raise ValueError(
                    "Blueprint component template is not available: {0}".format(component_name)
                )

            return component_node, component_template

    component_template = find_blueprint_component_template(blueprint, component_name)
    if component_template:
        return None, component_template

    component_template = find_blueprint_cdo_component(blueprint, component_name)
    if component_template:
        return None, component_template

    if try_compile_blueprint(blueprint):
        component_template = find_blueprint_cdo_component(blueprint, component_name)
        if component_template:
            return None, component_template

    component_candidates = get_blueprint_component_candidates(blueprint)
    fuzzy_matches = []
    requested_name_lower = str(component_name or "").lower()
    for component_node, candidate in component_candidates:
        candidate_name_lower = get_object_name(candidate).lower()
        if (
            requested_name_lower
            and (
                requested_name_lower in candidate_name_lower
                or candidate_name_lower in requested_name_lower
            )
        ):
            fuzzy_matches.append((component_node, candidate))

    if len(fuzzy_matches) == 1:
        return fuzzy_matches[0]

    if len(component_candidates) == 1:
        return component_candidates[0]

    available_names = list_blueprint_component_names(blueprint)
    if available_names:
        raise ValueError(
            "Blueprint component not found: {0}. Available components: {1}".format(
                component_name,
                ", ".join(available_names),
            )
        )

    raise ValueError("Blueprint component not found: {0}".format(component_name))


def apply_component_property(component_template, property_name, property_value):
    component_class_name = get_object_class_name(component_template)

    try:
        if (
            property_name == "StaticMesh"
            and object_is_instance_of(component_template, unreal.StaticMeshComponent)
        ):
            static_mesh = unreal.EditorAssetLibrary.load_asset(property_value)
            if static_mesh:
                component_template.set_static_mesh(static_mesh)
                return True

        if property_name == "Material" and hasattr(component_template, "set_material"):
            material = unreal.EditorAssetLibrary.load_asset(property_value)
            if material:
                component_template.set_material(0, material)
                return True

        if (
            property_name == "Materials"
            and isinstance(property_value, list)
            and hasattr(component_template, "set_material")
        ):
            for index, material_path in enumerate(property_value):
                material = unreal.EditorAssetLibrary.load_asset(material_path)
                if material:
                    component_template.set_material(index, material)
            return True
    except Exception:
        pass

    if property_name == "SimulatePhysics":
        for setter_name in ("set_simulate_physics",):
            setter = getattr(component_template, setter_name, None)
            if callable(setter):
                try:
                    setter(bool(property_value))
                    return True
                except Exception:
                    continue

    if property_name == "EnableGravity":
        for setter_name in ("set_enable_gravity",):
            setter = getattr(component_template, setter_name, None)
            if callable(setter):
                try:
                    setter(bool(property_value))
                    return True
                except Exception:
                    continue

    if property_name == "Mass" and hasattr(component_template, "set_mass_override_in_kg"):
        try:
            bone_name = ""
            if hasattr(unreal, "Name"):
                try:
                    bone_name = unreal.Name("")
                except Exception:
                    bone_name = ""
            component_template.set_mass_override_in_kg(
                bone_name,
                float(property_value),
                True,
            )
            return True
        except Exception:
            pass

    if property_name == "LinearDamping":
        return set_object_property(component_template, "linear_damping", float(property_value))

    if property_name == "AngularDamping":
        return set_object_property(component_template, "angular_damping", float(property_value))

    if isinstance(property_value, str) and property_value.startswith("/"):
        loaded_asset = unreal.EditorAssetLibrary.load_asset(property_value)
        if loaded_asset and set_object_property(component_template, property_name, loaded_asset):
            return True

    return set_object_property(component_template, property_name, property_value)


