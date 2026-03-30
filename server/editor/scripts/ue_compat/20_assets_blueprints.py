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
