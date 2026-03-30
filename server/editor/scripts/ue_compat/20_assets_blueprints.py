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
