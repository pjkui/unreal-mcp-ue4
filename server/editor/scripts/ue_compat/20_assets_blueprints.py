def get_object_name(target):
    if target is None:
        return ""

    try:
        return target.get_name()
    except Exception:
        return str(target)


def get_object_class_name(target):
    if target is None:
        return ""

    try:
        target_class = target.get_class()
        if target_class:
            return target_class.get_name()
    except Exception:
        pass

    return ""


def resolve_class_reference(class_name, module_hints=None):
    if not class_name:
        return None

    if not isinstance(class_name, str):
        return class_name

    try:
        if hasattr(unreal, class_name):
            return getattr(unreal, class_name)
    except Exception:
        pass

    candidate_paths = []
    if class_name.startswith("/Script/"):
        candidate_paths.append(class_name)
    else:
        for module_name in module_hints or []:
            candidate_paths.append("/Script/{0}.{1}".format(module_name, class_name))
        candidate_paths.append(class_name)

    for candidate_path in candidate_paths:
        try:
            resolved_class = unreal.load_class(None, candidate_path)
            if resolved_class:
                return resolved_class
        except Exception:
            continue

    return None


def get_asset_registry():
    return unreal.AssetRegistryHelpers.get_asset_registry()


def asset_class_matches(asset_class_name, allowed_class_names=None):
    if not allowed_class_names:
        return True

    asset_class_name_lower = str(asset_class_name).lower()
    for allowed_class_name in allowed_class_names:
        allowed_lower = str(allowed_class_name).lower()
        if (
            asset_class_name_lower == allowed_lower
            or asset_class_name_lower.endswith(allowed_lower)
            or allowed_lower in asset_class_name_lower
        ):
            return True
    return False


def find_asset_candidates(identifier, allowed_class_names=None):
    if not identifier:
        return []

    identifier_lower = str(identifier).lower()
    asset_registry = get_asset_registry()
    matches = []

    for asset_data in asset_registry.get_all_assets():
        asset_name = str(asset_data.asset_name)
        object_path = get_asset_object_path(asset_data)
        package_name = get_asset_package_name(asset_data)
        package_path = get_asset_package_path(asset_data)
        asset_class_name = get_asset_class_name(asset_data)

        if not asset_class_matches(asset_class_name, allowed_class_names):
            continue

        if identifier_lower.startswith("/"):
            match = (
                identifier_lower == object_path.lower()
                or identifier_lower == package_name.lower()
                or identifier_lower == package_path.lower()
                or identifier_lower == "{0}.{1}".format(package_name, asset_name).lower()
            )
        else:
            match = (
                identifier_lower == asset_name.lower()
                or identifier_lower == package_name.lower()
                or identifier_lower == object_path.lower()
                or identifier_lower == package_path.lower()
            )

        if not match:
            continue

        matches.append(
            {
                "asset_name": asset_name,
                "object_path": object_path,
                "package_name": package_name,
                "package_path": package_path,
                "class_name": asset_class_name,
            }
        )

    matches.sort(
        key=lambda asset_info: (
            asset_info["asset_name"].lower() != identifier_lower,
            asset_info["package_name"].lower() != identifier_lower,
            asset_info["object_path"].lower() != identifier_lower,
            asset_info["package_name"],
        )
    )
    return matches


def load_asset_by_identifier(identifier, allowed_class_names=None):
    if not identifier:
        raise ValueError("Asset identifier is required")

    direct_candidates = [identifier]
    if isinstance(identifier, str) and identifier.startswith("/") and "." not in identifier.rsplit("/", 1)[-1]:
        direct_candidates.append(
            "{0}.{1}".format(identifier, identifier.rsplit("/", 1)[-1])
        )

    for candidate in direct_candidates:
        try:
            asset = unreal.EditorAssetLibrary.load_asset(candidate)
            if asset:
                asset_class_name = get_object_class_name(asset)
                if asset_class_matches(asset_class_name, allowed_class_names):
                    return asset
        except Exception:
            continue

    asset_candidates = find_asset_candidates(identifier, allowed_class_names)
    for asset_candidate in asset_candidates:
        for candidate in (
            asset_candidate["object_path"],
            asset_candidate["package_name"],
        ):
            try:
                asset = unreal.EditorAssetLibrary.load_asset(candidate)
                if asset:
                    return asset
            except Exception:
                continue

    raise ValueError("Asset not found: {0}".format(identifier))


def load_blueprint_asset(blueprint_name_or_path, allow_widget=False):
    allowed_class_names = ["Blueprint", "BlueprintGeneratedClass"]
    if allow_widget:
        allowed_class_names.extend(["WidgetBlueprint", "BaseWidgetBlueprint"])

    blueprint_asset = load_asset_by_identifier(
        blueprint_name_or_path, allowed_class_names
    )
    blueprint_class_name = get_object_class_name(blueprint_asset)

    if blueprint_class_name.endswith("WidgetBlueprint") and not allow_widget:
        raise ValueError(
            "Expected a non-widget blueprint, but got widget blueprint: {0}".format(
                blueprint_name_or_path
            )
        )

    return blueprint_asset


def get_asset_package_path_for_create(content_path):
    if not content_path:
        return "/Game"

    normalized = str(content_path).strip()
    if not normalized.startswith("/"):
        normalized = "/Game/{0}".format(normalized.strip("/"))

    return normalized.rstrip("/")


def split_asset_name_and_path(asset_name, default_path):
    if not asset_name:
        raise ValueError("Asset name is required")

    normalized = str(asset_name).strip()
    if normalized.startswith("/"):
        package_path, leaf_name = normalized.rsplit("/", 1)
        return leaf_name, package_path

    return normalized, get_asset_package_path_for_create(default_path)


def create_asset_with_factory(asset_name, package_path, asset_class, factory):
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    return asset_tools.create_asset(
        asset_name,
        package_path,
        get_UClass(asset_class),
        factory,
    )


def get_blueprint_parent_class(blueprint):
    return get_editor_property_value(blueprint, "parent_class")


def get_blueprint_generated_class(blueprint):
    generated_class = get_editor_property_value(blueprint, "generated_class")
    if generated_class:
        return generated_class

    try:
        generated_class_path = str(blueprint.generated_class())
        if generated_class_path:
            return unreal.load_class(None, generated_class_path)
    except Exception:
        pass

    asset_path = get_asset_package_name(blueprint)
    if asset_path:
        try:
            generated_class = unreal.EditorAssetLibrary.load_blueprint_class(asset_path)
            if generated_class:
                return generated_class
        except Exception:
            pass

        try:
            try_compile_blueprint(blueprint)
        except Exception:
            pass

        try:
            save_loaded_editor_asset(blueprint)
        except Exception:
            pass

        try:
            reloaded_blueprint = unreal.EditorAssetLibrary.load_asset(asset_path)
            if reloaded_blueprint:
                generated_class = get_editor_property_value(
                    reloaded_blueprint, "generated_class"
                )
                if generated_class:
                    return generated_class
        except Exception:
            pass

        try:
            generated_class = unreal.EditorAssetLibrary.load_blueprint_class(asset_path)
            if generated_class:
                return generated_class
        except Exception:
            pass

        try:
            asset_name = asset_path.rsplit("/", 1)[-1]
            generated_class = unreal.load_class(
                None,
                "{0}.{1}_C".format(asset_path, asset_name),
            )
            if generated_class:
                return generated_class
        except Exception:
            pass

    return None


def get_blueprint_default_object(blueprint):
    generated_class = get_blueprint_generated_class(blueprint)
    if not generated_class:
        return None

    try:
        get_default_object = getattr(unreal, "get_default_object", None)
        if callable(get_default_object):
            default_object = get_default_object(generated_class)
            if default_object:
                return default_object
    except Exception:
        pass

    try:
        return generated_class.get_default_object()
    except Exception:
        pass

    return None


def get_object_flags_value(*flag_names):
    object_flags = getattr(unreal, "ObjectFlags", None)
    if not object_flags:
        return None

    resolved_value = None
    for flag_name in flag_names:
        try:
            flag_value = getattr(object_flags, flag_name)
        except Exception:
            continue

        resolved_value = flag_value if resolved_value is None else (resolved_value | flag_value)

    return resolved_value


def new_object_with_flags(object_class, outer, name, *flag_names):
    object_flags = get_object_flags_value(*flag_names)

    constructor_attempts = []
    if object_flags is not None:
        constructor_attempts.extend(
            [
                lambda: unreal.new_object(
                    object_class,
                    outer=outer,
                    name=name,
                    set_flags=object_flags,
                ),
                lambda: unreal.new_object(object_class, outer, name, set_flags=object_flags),
                lambda: unreal.new_object(object_class, outer, name, object_flags),
            ]
        )

    constructor_attempts.extend(
        [
            lambda: unreal.new_object(object_class, outer=outer, name=name),
            lambda: unreal.new_object(object_class, outer, name),
        ]
    )

    last_error = None
    for constructor in constructor_attempts:
        try:
            created_object = constructor()
            if created_object and object_flags is not None and hasattr(created_object, "set_flags"):
                try:
                    created_object.set_flags(object_flags)
                except Exception:
                    pass
            if created_object:
                return created_object
        except Exception as exc:
            last_error = exc

    if last_error:
        raise last_error

    return None


def save_loaded_editor_asset(asset):
    touch_editor_object(asset)

    try:
        asset.post_edit_change()
    except Exception:
        pass

    try:
        result = unreal.EditorAssetLibrary.save_loaded_asset(asset)
        if result is None:
            return True
        return bool(result)
    except TypeError:
        try:
            result = unreal.EditorAssetLibrary.save_loaded_asset(asset, False)
            if result is None:
                return True
            return bool(result)
        except Exception:
            pass
    except Exception:
        pass

    asset_path = get_asset_package_name(asset)
    if asset_path:
        try:
            result = unreal.EditorAssetLibrary.save_asset(asset_path, False)
            if result is None:
                return True
            return bool(result)
        except Exception:
            pass

    return False


def finalize_blueprint_change(blueprint, structural=False):
    cdo = get_blueprint_default_object(blueprint)
    if cdo:
        touch_editor_object(cdo)

    touch_editor_object(blueprint)

    if structural:
        for utility_name in ("BlueprintEditorUtils", "KismetEditorUtilities"):
            utility_class = getattr(unreal, utility_name, None)
            if utility_class and hasattr(
                utility_class, "mark_blueprint_as_structurally_modified"
            ):
                try:
                    utility_class.mark_blueprint_as_structurally_modified(blueprint)
                    break
                except Exception:
                    continue

    try:
        blueprint.post_edit_change()
    except Exception:
        pass

    try_compile_blueprint(blueprint)
    return save_loaded_editor_asset(blueprint)


def get_simple_construction_script(blueprint):
    try:
        blueprint_editor_utils = getattr(unreal, "BlueprintEditorUtils", None)
        if blueprint_editor_utils and hasattr(
            blueprint_editor_utils, "preload_construction_script"
        ):
            try:
                blueprint_editor_utils.preload_construction_script(blueprint)
            except Exception:
                pass
    except Exception:
        pass

    scs = get_editor_property_value(blueprint, "simple_construction_script")
    if scs:
        return scs

    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class:
        scs = get_editor_property_value(generated_class, "simple_construction_script")
        if scs:
            return scs

    if not scs:
        raise ValueError(
            "Blueprint '{0}' does not expose a SimpleConstructionScript in UE4.27 Python.".format(
                get_object_name(blueprint)
            )
        )
    return scs


def blueprint_supports_scs_editing(blueprint):
    try:
        scs = get_simple_construction_script(blueprint)
    except Exception:
        return False

    return callable(getattr(scs, "create_node", None)) and callable(
        getattr(scs, "add_node", None)
    )


def blueprint_supports_scs_lookup(blueprint):
    try:
        scs = get_simple_construction_script(blueprint)
    except Exception:
        return False

    if hasattr(scs, "find_scs_node") and callable(getattr(scs, "find_scs_node", None)):
        return True

    try:
        return len(get_scs_all_nodes(scs)) >= 0
    except Exception:
        return False


def get_blueprint_component_templates(blueprint):
    component_templates = list(
        get_editor_property_value(blueprint, "component_templates", []) or []
    )
    if component_templates:
        return component_templates

    generated_class = get_blueprint_generated_class(blueprint)
    if generated_class:
        return list(
            get_editor_property_value(generated_class, "component_templates", []) or []
        )

    return []


def find_blueprint_component_template(blueprint, component_name):
    if not component_name:
        return None

    for component_template in get_blueprint_component_templates(blueprint):
        template_name = get_object_name(component_template)
        if component_name_matches(template_name, component_name):
            return component_template

    return None


def component_name_matches(candidate_name, component_name):
    candidate_name = str(candidate_name or "")
    component_name = str(component_name or "")

    if not candidate_name or not component_name:
        return False

    if candidate_name == component_name:
        return True

    if candidate_name.endswith("_GEN_VARIABLE") and candidate_name[: -len("_GEN_VARIABLE")] == component_name:
        return True

    return False


def blueprint_has_component(blueprint, component_name):
    if not component_name:
        return False

    try:
        if blueprint_supports_scs_lookup(blueprint):
            return find_scs_node(blueprint, component_name) is not None
    except Exception:
        pass

    return find_blueprint_component_template(blueprint, component_name) is not None


def find_blueprint_cdo_component(blueprint, component_name):
    cdo = get_blueprint_default_object(blueprint)
    if not cdo or not component_name:
        return None

    try:
        components = list(cdo.get_components_by_class(unreal.ActorComponent) or [])
    except Exception:
        return None

    for component in components:
        if component_name_matches(get_object_name(component), component_name):
            return component

    return None


def get_blueprint_component_candidates(blueprint):
    candidates = []
    seen = set()

    for component_template in get_blueprint_component_templates(blueprint):
        component_key = get_object_path_name(component_template) or get_object_name(
            component_template
        )
        if component_key in seen:
            continue
        seen.add(component_key)
        candidates.append((None, component_template))

    cdo = get_blueprint_default_object(blueprint)
    if cdo:
        try:
            for component in list(cdo.get_components_by_class(unreal.ActorComponent) or []):
                component_key = get_object_path_name(component) or get_object_name(component)
                if component_key in seen:
                    continue
                seen.add(component_key)
                candidates.append((None, component))
        except Exception:
            pass

    return candidates


def list_blueprint_component_names(blueprint):
    names = []
    seen = set()
    for _, component in get_blueprint_component_candidates(blueprint):
        component_name = get_object_name(component)
        if component_name and component_name not in seen:
            seen.add(component_name)
            names.append(component_name)
    return names


def get_blueprint_construction_graph(blueprint):
    try:
        blueprint_editor_utils = getattr(unreal, "BlueprintEditorUtils", None)
        if blueprint_editor_utils and hasattr(
            blueprint_editor_utils, "find_user_construction_script"
        ):
            construction_graph = blueprint_editor_utils.find_user_construction_script(
                blueprint
            )
            if construction_graph:
                return construction_graph
    except Exception:
        pass

    for graph in get_blueprint_graphs(blueprint):
        graph_name = get_object_name(graph).lower()
        if graph_name in ("userconstructionscript", "constructionscript"):
            return graph

    return None


def supports_kismet_component_harvest():
    return hasattr(unreal, "KismetEditorUtilities") and hasattr(
        unreal.KismetEditorUtilities, "add_components_to_blueprint"
    )


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
