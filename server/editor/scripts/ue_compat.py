import base64
import json
import os
import re
import tempfile
from pathlib import Path

import unreal


def _has_unreal_class(class_name):
    return hasattr(unreal, class_name)


def decode_template_json(encoded_value):
    if encoded_value is None:
        return None

    encoded_text = str(encoded_value).strip()
    if not encoded_text:
        return None

    try:
        decoded_text = base64.b64decode(encoded_text).decode("utf-8")
        return json.loads(decoded_text)
    except Exception:
        return None


def get_editor_world():
    try:
        if _has_unreal_class("UnrealEditorSubsystem"):
            subsystem = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
            if subsystem:
                world = subsystem.get_editor_world()
                if world:
                    return world
    except Exception:
        pass

    try:
        if hasattr(unreal, "EditorLevelLibrary") and hasattr(
            unreal.EditorLevelLibrary, "get_editor_world"
        ):
            return unreal.EditorLevelLibrary.get_editor_world()
    except Exception:
        pass

    return None


def get_all_level_actors():
    try:
        if _has_unreal_class("EditorActorSubsystem"):
            subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
            if subsystem:
                actors = subsystem.get_all_level_actors()
                if actors is not None:
                    return list(actors)
    except Exception:
        pass

    try:
        return list(unreal.EditorLevelLibrary.get_all_level_actors())
    except Exception:
        return []


def find_actor_by_name(actor_name):
    for actor in get_all_level_actors():
        try:
            if actor.get_name() == actor_name or actor.get_actor_label() == actor_name:
                return actor
        except Exception:
            continue
    return None


def destroy_actor(actor):
    try:
        if _has_unreal_class("EditorActorSubsystem"):
            subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
            if subsystem:
                return subsystem.destroy_actor(actor)
    except Exception:
        pass

    try:
        return unreal.EditorLevelLibrary.destroy_actor(actor)
    except Exception:
        return False


def get_streaming_level_names(world):
    streaming_levels = []

    try:
        streaming_levels = list(world.get_editor_property("streaming_levels"))
    except Exception:
        try:
            streaming_levels = list(world.streaming_levels)
        except Exception:
            streaming_levels = []

    names = []
    for streaming_level in streaming_levels:
        try:
            if hasattr(streaming_level, "get_world_asset_package_name"):
                name = str(streaming_level.get_world_asset_package_name())
                if name:
                    names.append(name)
                    continue
        except Exception:
            pass

        try:
            name = str(streaming_level.get_editor_property("package_name_to_load"))
            if name:
                names.append(name)
                continue
        except Exception:
            pass

        try:
            names.append(streaming_level.get_name())
        except Exception:
            continue

    return names


def get_asset_class_name(asset_or_data):
    try:
        if hasattr(asset_or_data, "asset_class_path"):
            asset_class_path = asset_or_data.asset_class_path
            if hasattr(asset_class_path, "asset_name"):
                return str(asset_class_path.asset_name)
            return str(asset_class_path)
    except Exception:
        pass

    try:
        if hasattr(asset_or_data, "asset_class"):
            return str(asset_or_data.asset_class)
    except Exception:
        pass

    try:
        asset_class = asset_or_data.get_class()
        if asset_class:
            return asset_class.get_name()
    except Exception:
        pass

    return ""


def get_asset_object_path(asset_or_data):
    try:
        if hasattr(asset_or_data, "object_path"):
            return str(asset_or_data.object_path)
    except Exception:
        pass

    try:
        return asset_or_data.get_path_name()
    except Exception:
        return ""


def normalize_asset_reference_path(path_value):
    if not path_value:
        return ""

    normalized = str(path_value).strip()
    if not normalized:
        return ""

    if ":" in normalized:
        normalized = normalized.split(":", 1)[0]

    if "." in normalized:
        package_name, object_name = normalized.rsplit(".", 1)
        if package_name.rsplit("/", 1)[-1] == object_name:
            return package_name

    return normalized


def get_asset_package_name(asset_or_data):
    candidates = []

    try:
        package = asset_or_data.get_package()
        if package:
            normalized_package_name = normalize_asset_reference_path(package.get_name())
            if normalized_package_name:
                candidates.append(normalized_package_name)
    except Exception:
        pass

    try:
        if hasattr(asset_or_data, "package_name"):
            normalized_package_name = normalize_asset_reference_path(
                asset_or_data.package_name
            )
            if normalized_package_name:
                candidates.append(normalized_package_name)
    except Exception:
        pass

    try:
        object_path = normalize_asset_reference_path(get_asset_object_path(asset_or_data))
        if object_path:
            candidates.append(object_path)
    except Exception:
        pass

    if candidates:
        return max(candidates, key=len)

    return ""


def get_asset_package_path(asset_or_data):
    try:
        if hasattr(asset_or_data, "package_path"):
            return str(asset_or_data.package_path)
    except Exception:
        pass

    package_name = get_asset_package_name(asset_or_data)
    if "/" in package_name:
        return package_name.rsplit("/", 1)[0]
    return package_name


def get_asset_data_tag_value(asset_data, tag_name):
    try:
        value = asset_data.get_tag_value(tag_name)
        if isinstance(value, tuple):
            if len(value) == 2 and value[0]:
                return value[1]
            return None
        return value
    except Exception:
        return None


def get_static_mesh_lod_info(static_mesh):
    lod_levels = []

    try:
        if hasattr(unreal, "EditorStaticMeshLibrary"):
            lod_count = unreal.EditorStaticMeshLibrary.get_lod_count(static_mesh)
            for lod_index in range(max(lod_count, 0)):
                lod_info = {"lod_index": lod_index}

                try:
                    lod_info["num_vertices"] = unreal.EditorStaticMeshLibrary.get_number_verts(
                        static_mesh, lod_index
                    )
                except Exception:
                    pass

                try:
                    if hasattr(static_mesh, "get_num_triangles"):
                        lod_info["num_triangles"] = static_mesh.get_num_triangles(
                            lod_index
                        )
                except Exception:
                    pass

                lod_levels.append(lod_info)

            return lod_levels
    except Exception:
        pass

    try:
        if hasattr(static_mesh, "get_num_lods"):
            for lod_index in range(static_mesh.get_num_lods()):
                lod_levels.append({"lod_index": lod_index})
    except Exception:
        pass

    return lod_levels


def get_skeletal_mesh_lod_info(skeletal_mesh):
    lod_levels = []

    try:
        if hasattr(unreal, "EditorSkeletalMeshLibrary"):
            lod_count = unreal.EditorSkeletalMeshLibrary.get_lod_count(skeletal_mesh)
            for lod_index in range(max(lod_count, 0)):
                lod_info = {"lod_index": lod_index}

                try:
                    lod_info["num_vertices"] = unreal.EditorSkeletalMeshLibrary.get_num_verts(
                        skeletal_mesh, lod_index
                    )
                except Exception:
                    pass

                try:
                    lod_info["num_sections"] = unreal.EditorSkeletalMeshLibrary.get_num_sections(
                        skeletal_mesh, lod_index
                    )
                except Exception:
                    pass

                lod_levels.append(lod_info)

            return lod_levels
    except Exception:
        pass

    try:
        if hasattr(skeletal_mesh, "get_lod_num"):
            for lod_index in range(skeletal_mesh.get_lod_num()):
                lod_levels.append({"lod_index": lod_index})
    except Exception:
        pass

    return lod_levels


def resolve_actor_class(object_class, class_mappings=None):
    if class_mappings and object_class in class_mappings:
        return class_mappings[object_class]

    try:
        return unreal.load_class(None, object_class)
    except Exception:
        pass

    try:
        if hasattr(unreal, "find_class"):
            return unreal.find_class(object_class)
    except Exception:
        pass

    try:
        return unreal.EditorAssetLibrary.load_blueprint_class(object_class)
    except Exception:
        pass

    return None


def get_property_name_candidates(prop_name):
    normalized_name = str(prop_name or "").strip()
    if not normalized_name:
        return []

    candidates = [normalized_name]
    if "_" in normalized_name:
        parts = [part for part in normalized_name.split("_") if part]
        if parts:
            pascal_case_name = "".join(part[:1].upper() + part[1:] for part in parts)
            camel_case_name = parts[0] + "".join(
                part[:1].upper() + part[1:] for part in parts[1:]
            )
            for candidate_name in (pascal_case_name, camel_case_name):
                if candidate_name and candidate_name not in candidates:
                    candidates.append(candidate_name)

    return candidates


def set_object_property(target, prop_name, prop_value):
    for candidate_name in get_property_name_candidates(prop_name):
        try:
            if hasattr(target, "set_editor_property"):
                target.set_editor_property(candidate_name, prop_value)
                return True
        except Exception:
            pass

        try:
            if hasattr(target, candidate_name):
                setattr(target, candidate_name, prop_value)
                return True
        except Exception:
            pass

    return False


def apply_actor_property(actor, prop_name, prop_value):
    try:
        actor_class_name = actor.get_class().get_name()
    except Exception:
        actor_class_name = ""

    try:
        if prop_name == "StaticMesh" and actor_class_name == "StaticMeshActor":
            static_mesh = unreal.EditorAssetLibrary.load_asset(prop_value)
            if static_mesh:
                mesh_component = actor.get_component_by_class(unreal.StaticMeshComponent)
                if mesh_component:
                    mesh_component.set_static_mesh(static_mesh)
                    return True

        if prop_name == "Material" and actor_class_name == "StaticMeshActor":
            material = unreal.EditorAssetLibrary.load_asset(prop_value)
            if material:
                mesh_component = actor.get_component_by_class(unreal.StaticMeshComponent)
                if mesh_component:
                    mesh_component.set_material(0, material)
                    return True

        if (
            prop_name == "Materials"
            and actor_class_name == "StaticMeshActor"
            and isinstance(prop_value, list)
        ):
            mesh_component = actor.get_component_by_class(unreal.StaticMeshComponent)
            if mesh_component:
                for index, material_path in enumerate(prop_value):
                    if not material_path:
                        continue

                    material = unreal.EditorAssetLibrary.load_asset(material_path)
                    if material:
                        mesh_component.set_material(index, material)
                return True
    except Exception:
        pass

    return set_object_property(actor, prop_name, prop_value)


def get_project_descriptor():
    project_file_path = unreal.Paths.get_project_file_path()
    if not project_file_path:
        return {}

    try:
        return json.loads(Path(project_file_path).read_text(encoding="utf-8"))
    except Exception:
        return {}


def get_enabled_plugins():
    descriptor = get_project_descriptor()
    enabled_plugins = set()

    for plugin in descriptor.get("Plugins", []):
        try:
            if plugin.get("Enabled", True):
                name = plugin.get("Name")
                if name:
                    enabled_plugins.add(name.lower())
        except Exception:
            continue

    return enabled_plugins


_ACTION_NAME_RE = re.compile(r'ActionName="?([^",)]+)"?')
_AXIS_NAME_RE = re.compile(r'AxisName="?([^",)]+)"?')


def _extract_ini_names(ini_paths, pattern):
    values = []
    seen = set()

    for ini_path in ini_paths:
        path = Path(ini_path)
        if not path.exists():
            continue

        try:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                stripped = line.strip()
                if not stripped or stripped[0] in ";#":
                    continue

                match = pattern.search(stripped)
                if not match:
                    continue

                value = match.group(1).strip()
                if value and value not in seen:
                    seen.add(value)
                    values.append(value)
        except Exception:
            continue

    return values


def get_classic_input_mappings():
    project_dir = unreal.Paths.project_dir()
    ini_paths = [
        os.path.join(project_dir, "Config", "DefaultInput.ini"),
        os.path.join(project_dir, "Config", "Input.ini"),
    ]

    return {
        "action_mappings": _extract_ini_names(ini_paths, _ACTION_NAME_RE),
        "axis_mappings": _extract_ini_names(ini_paths, _AXIS_NAME_RE),
    }


def take_editor_screenshot(width=640, height=520):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
        screenshot_path = temp_file.name

    try:
        if hasattr(unreal, "AutomationLibrary") and hasattr(
            unreal.AutomationLibrary, "take_high_res_screenshot"
        ):
            try:
                unreal.AutomationLibrary.take_high_res_screenshot(
                    width, height, screenshot_path
                )
                return screenshot_path
            except Exception:
                pass

        command = 'HighResShot {0}x{1} filename="{2}"'.format(
            width, height, screenshot_path
        )
        unreal.SystemLibrary.execute_console_command(None, command)
        return screenshot_path
    except Exception:
        try:
            os.unlink(screenshot_path)
        except Exception:
            pass
        return ""


def get_editor_property_value(target, prop_name, default=None):
    for candidate_name in get_property_name_candidates(prop_name):
        try:
            value = target.get_editor_property(candidate_name)
            if value is not None:
                return value
        except Exception:
            pass

        try:
            value = getattr(target, candidate_name)
            if value is not None:
                return value
        except Exception:
            pass

    return default


def get_widget_name(widget):
    try:
        return widget.get_name()
    except Exception:
        return ""


def get_widget_class_name(widget):
    try:
        return widget.get_class().get_name()
    except Exception:
        return ""


def get_UClass(class_reference):
    if class_reference is None:
        return None

    try:
        unreal_class_type = getattr(unreal, "Class", None)
        if unreal_class_type and isinstance(class_reference, unreal_class_type):
            return class_reference
    except Exception:
        pass

    try:
        if hasattr(class_reference, "static_class"):
            return class_reference.static_class()
    except Exception:
        pass

    return class_reference


def get_super_UClass(class_reference):
    class_object = get_UClass(class_reference)
    if not class_object:
        return None

    for accessor_name in ("get_super_class", "get_super_struct"):
        accessor = getattr(class_object, accessor_name, None)
        if callable(accessor):
            try:
                super_class = accessor()
                if super_class:
                    return super_class
            except Exception:
                pass

    for property_name in ("super_class", "super_struct"):
        super_class = get_editor_property_value(class_object, property_name)
        if super_class:
            return super_class

    return None


def class_is_child_of(class_reference, parent_class_reference):
    if not class_reference or not parent_class_reference:
        return False

    if class_reference == parent_class_reference:
        return True

    try:
        if isinstance(class_reference, type) and isinstance(parent_class_reference, type):
            return issubclass(class_reference, parent_class_reference)
    except Exception:
        pass

    class_object = get_UClass(class_reference)
    parent_class_object = get_UClass(parent_class_reference)

    if not class_object or not parent_class_object:
        return False

    if class_object == parent_class_object:
        return True

    try:
        return bool(class_object.is_child_of(parent_class_object))
    except Exception:
        pass

    parent_name = get_object_name(parent_class_object)
    current_class = class_object
    visited_names = set()

    while current_class:
        current_name = get_object_name(current_class)
        if not current_name or current_name in visited_names:
            break

        if current_class == parent_class_object or current_name == parent_name:
            return True

        visited_names.add(current_name)
        current_class = get_super_UClass(current_class)

    return False


def load_widget_blueprint(widget_blueprint_path):
    widget_blueprint = unreal.EditorAssetLibrary.load_asset(widget_blueprint_path)
    if not widget_blueprint:
        raise ValueError(
            "Widget blueprint not found: {0}".format(widget_blueprint_path)
        )

    widget_blueprint_class_name = ""
    try:
        widget_blueprint_class_name = widget_blueprint.get_class().get_name()
    except Exception:
        pass

    base_widget_blueprint_class = getattr(unreal, "BaseWidgetBlueprint", None)
    if base_widget_blueprint_class and isinstance(
        widget_blueprint, base_widget_blueprint_class
    ):
        return widget_blueprint

    if widget_blueprint_class_name.endswith("WidgetBlueprint"):
        return widget_blueprint

    raise ValueError(
        "Asset is not a widget blueprint: {0}".format(widget_blueprint_path)
    )


def get_widget_tree(widget_blueprint):
    widget_tree = get_editor_property_value(widget_blueprint, "widget_tree")
    if widget_tree:
        return widget_tree

    raise ValueError(
        "Widget blueprint does not expose an editable widget tree in UE4.27 Python."
    )


def get_root_widget(widget_tree):
    return get_editor_property_value(widget_tree, "root_widget")


def is_panel_widget(widget):
    if not widget:
        return False

    try:
        return class_is_child_of(widget.get_class(), unreal.PanelWidget)
    except Exception:
        return False


def get_panel_children(widget):
    if not is_panel_widget(widget):
        return []

    try:
        return list(widget.get_all_children())
    except Exception:
        return []


def find_widget_in_tree(widget_tree, widget_name):
    if not widget_name:
        return None

    try:
        widget = widget_tree.find_widget(widget_name)
        if widget:
            return widget
    except Exception:
        pass

    root_widget = get_root_widget(widget_tree)
    if not root_widget:
        return None

    if get_widget_name(root_widget) == widget_name:
        return root_widget

    stack = list(get_panel_children(root_widget))
    while stack:
        current_widget = stack.pop()
        if get_widget_name(current_widget) == widget_name:
            return current_widget
        stack.extend(get_panel_children(current_widget))

    return None


def find_widget_parent(widget_tree, target_widget):
    root_widget = get_root_widget(widget_tree)
    if not root_widget or not target_widget or root_widget == target_widget:
        return None

    stack = [root_widget]
    while stack:
        current_widget = stack.pop()
        for child_widget in get_panel_children(current_widget):
            if child_widget == target_widget:
                return current_widget
            stack.append(child_widget)

    return None


def find_direct_child_widget(parent_widget, child_widget_name):
    for child_widget in get_panel_children(parent_widget):
        if get_widget_name(child_widget) == child_widget_name:
            return child_widget
    return None


def widget_contains_descendant(root_widget, candidate_descendant):
    if not root_widget or not candidate_descendant:
        return False

    stack = list(get_panel_children(root_widget))
    while stack:
        current_widget = stack.pop()
        if current_widget == candidate_descendant:
            return True
        stack.extend(get_panel_children(current_widget))

    return False


def get_widget_subtree(root_widget):
    if not root_widget:
        return []

    widgets = []
    stack = [root_widget]
    while stack:
        current_widget = stack.pop()
        widgets.append(current_widget)
        stack.extend(get_panel_children(current_widget))

    return widgets


def resolve_widget_class(widget_class):
    if not widget_class:
        return None

    try:
        if hasattr(unreal, widget_class):
            return getattr(unreal, widget_class)
    except Exception:
        pass

    try:
        resolved_class = unreal.load_class(None, widget_class)
        if resolved_class:
            return resolved_class
    except Exception:
        pass

    try:
        resolved_class = unreal.EditorAssetLibrary.load_blueprint_class(widget_class)
        if resolved_class:
            return resolved_class
    except Exception:
        pass

    return None


def create_widget_instance(widget_tree, widget_class, widget_name):
    resolved_class = resolve_widget_class(widget_class)
    if not resolved_class:
        raise ValueError("Could not find widget class: {0}".format(widget_class))

    if not class_is_child_of(resolved_class, unreal.Widget):
        raise ValueError("Class is not a UMG widget: {0}".format(widget_class))

    if class_is_child_of(resolved_class, unreal.UserWidget):
        raise ValueError(
            "UserWidget subclasses are not supported for nested widget creation in this UE4.27 tool. Use native widget classes such as CanvasPanel, Border, Button, TextBlock, or Image."
        )

    if find_widget_in_tree(widget_tree, widget_name):
        raise ValueError("Widget already exists: {0}".format(widget_name))

    constructor_error = None

    try:
        if hasattr(resolved_class, "static_class"):
            return resolved_class(outer=widget_tree, name=widget_name)
    except Exception as exc:
        constructor_error = exc

    try:
        return unreal.new_object(
            get_UClass(resolved_class), outer=widget_tree, name=widget_name
        )
    except Exception as exc:
        if constructor_error:
            raise RuntimeError(
                "Failed to create widget '{0}': {1}; fallback failed: {2}".format(
                    widget_name, constructor_error, exc
                )
            )
        raise RuntimeError(
            "Failed to create widget '{0}': {1}".format(widget_name, exc)
        )


def require_panel_widget(widget, widget_name=None):
    if is_panel_widget(widget):
        return widget

    raise ValueError(
        "Widget '{0}' is not a panel widget and cannot contain child widgets.".format(
            widget_name or get_widget_name(widget)
        )
    )


def add_widget_to_tree(widget_tree, widget, parent_widget=None):
    if parent_widget is None:
        if get_root_widget(widget_tree):
            raise ValueError(
                "Widget blueprint already has a root widget. Use editor_umg_add_child_widget to add nested widgets."
            )
        if not set_object_property(widget_tree, "root_widget", widget):
            raise RuntimeError("Failed to assign root widget")
        return None

    parent_widget = require_panel_widget(parent_widget)

    slot = None
    try:
        if class_is_child_of(parent_widget.get_class(), unreal.CanvasPanel) and hasattr(
            parent_widget, "add_child_to_canvas"
        ):
            slot = parent_widget.add_child_to_canvas(widget)
        else:
            slot = parent_widget.add_child(widget)
    except Exception as exc:
        raise RuntimeError(
            "Failed to add widget '{0}' to parent '{1}': {2}".format(
                get_widget_name(widget), get_widget_name(parent_widget), exc
            )
        )

    if slot is None:
        raise RuntimeError(
            "Parent widget '{0}' could not accept child widget '{1}'.".format(
                get_widget_name(parent_widget), get_widget_name(widget)
            )
        )

    return slot


def get_canvas_panel_slot(widget):
    slot = get_editor_property_value(widget, "slot")
    if not slot:
        return None

    try:
        if class_is_child_of(slot.get_class(), unreal.CanvasPanelSlot):
            return slot
    except Exception:
        pass

    return None


def set_widget_canvas_position(widget, position, z_order=None):
    slot = get_canvas_panel_slot(widget)
    if not slot:
        raise ValueError(
            "Widget '{0}' is not attached to a CanvasPanel slot. Position changes are only supported for CanvasPanel children in UE4.27.".format(
                get_widget_name(widget)
            )
        )

    slot.set_position(
        unreal.Vector2D(
            x=float(position.get("x", 0.0)),
            y=float(position.get("y", 0.0)),
        )
    )

    if z_order is not None:
        slot.set_z_order(int(z_order))

    return slot


def get_canvas_slot_layout(widget):
    slot = get_canvas_panel_slot(widget)
    if not slot:
        return None

    position = slot.get_position()
    size = slot.get_size()

    return {
        "position": {"x": position.x, "y": position.y},
        "size": {"x": size.x, "y": size.y},
        "z_order": slot.get_z_order(),
    }


def remove_widget_from_blueprint_tree(widget_tree, widget):
    if not widget_tree or not widget:
        return False

    root_widget = get_root_widget(widget_tree)
    subtree = get_widget_subtree(widget)

    if root_widget == widget:
        if not set_object_property(widget_tree, "root_widget", None):
            return False
    else:
        try:
            widget.remove_from_parent()
        except Exception:
            return False

    transient_package = unreal.get_transient_package()
    for subtree_widget in subtree:
        try:
            subtree_widget.rename(None, transient_package)
        except Exception:
            continue

    return True


def touch_editor_object(target):
    if not target:
        return

    try:
        target.modify()
    except Exception:
        pass

    try:
        target.mark_package_dirty()
    except Exception:
        pass


def try_compile_blueprint(blueprint):
    try:
        if hasattr(unreal, "BlueprintEditorLibrary") and hasattr(
            unreal.BlueprintEditorLibrary, "compile_blueprint"
        ):
            unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
            return True
    except Exception:
        pass

    try:
        if hasattr(unreal, "KismetEditorUtilities") and hasattr(
            unreal.KismetEditorUtilities, "compile_blueprint"
        ):
            unreal.KismetEditorUtilities.compile_blueprint(blueprint)
            return True
    except Exception:
        pass

    return False


def save_widget_blueprint(widget_blueprint):
    touch_editor_object(widget_blueprint)

    try:
        widget_tree = get_widget_tree(widget_blueprint)
        touch_editor_object(widget_tree)
        touch_editor_object(get_root_widget(widget_tree))
    except Exception:
        pass

    try:
        widget_blueprint.post_edit_change()
    except Exception:
        pass

    try_compile_blueprint(widget_blueprint)

    try:
        result = unreal.EditorAssetLibrary.save_loaded_asset(widget_blueprint)
        if result is None:
            return True
        return bool(result)
    except TypeError:
        try:
            result = unreal.EditorAssetLibrary.save_loaded_asset(widget_blueprint, False)
            if result is None:
                return True
            return bool(result)
        except Exception:
            pass
    except Exception:
        pass

    asset_path = get_asset_package_name(widget_blueprint)
    if asset_path:
        try:
            result = unreal.EditorAssetLibrary.save_asset(asset_path, False)
            if result is None:
                return True
            return bool(result)
        except Exception:
            pass

    return False


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
    blueprint_asset = load_asset_by_identifier(blueprint_name_or_path, ["Blueprint"])
    blueprint_class_name = get_object_class_name(blueprint_asset)

    if blueprint_class_name.endswith("WidgetBlueprint") and not allow_widget:
        raise ValueError(
            "Expected a non-widget blueprint, but got widget blueprint: {0}".format(
                blueprint_name_or_path
            )
        )

    if allow_widget and not blueprint_class_name.endswith("WidgetBlueprint"):
        raise ValueError(
            "Expected a widget blueprint, but got: {0}".format(
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
    scs = get_editor_property_value(blueprint, "simple_construction_script")
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
        if hasattr(temp_actor, "add_component_by_class"):
            try:
                component_template = temp_actor.add_component_by_class(
                    component_class,
                    True,
                    unreal.Transform(),
                    False,
                )
            except Exception:
                component_template = None

        if not component_template:
            component_template = unreal.new_object(component_class, temp_actor, template_name)

        if not component_template:
            raise RuntimeError(
                "Failed to create a temporary component instance: {0}".format(template_name)
            )

        try:
            component_template.rename(template_name, temp_actor)
        except Exception:
            pass

        apply_scene_component_transform(component_template, location, rotation, scale)

        for property_name, property_value in (component_properties or {}).items():
            apply_component_property(component_template, property_name, property_value)

        unreal.KismetEditorUtilities.add_components_to_blueprint(
            blueprint,
            [component_template],
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

    new_template = new_object_with_flags(
        component_class,
        generated_class,
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
            and class_is_child_of(component_template.get_class(), unreal.StaticMeshComponent)
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


def get_actor_mesh_components(actor):
    if not actor:
        return []

    component_classes = [
        getattr(unreal, "StaticMeshComponent", None),
        getattr(unreal, "SkeletalMeshComponent", None),
        getattr(unreal, "InstancedStaticMeshComponent", None),
        getattr(unreal, "HierarchicalInstancedStaticMeshComponent", None),
        getattr(unreal, "MeshComponent", None),
    ]

    components = []
    seen_names = set()
    for component_class in component_classes:
        if not component_class:
            continue

        try:
            class_components = list(actor.get_components_by_class(component_class) or [])
        except Exception:
            class_components = []

        for component in class_components:
            component_name = get_object_name(component)
            if component_name in seen_names:
                continue
            seen_names.add(component_name)
            components.append(component)

    return components


def get_material_summary(material_interface):
    if not material_interface:
        return {}

    return {
        "name": get_object_name(material_interface),
        "class": get_object_class_name(material_interface),
        "path": get_asset_package_name(material_interface)
        or get_asset_object_path(material_interface),
    }


def get_component_material_info(component):
    material_info = []

    material_slot_names = []
    try:
        if hasattr(component, "get_material_slot_names"):
            material_slot_names = list(component.get_material_slot_names() or [])
    except Exception:
        material_slot_names = []

    try:
        material_count = int(component.get_num_materials())
    except Exception:
        material_count = len(material_slot_names)

    if material_count <= 0:
        material_count = len(material_slot_names)

    for slot_index in range(max(material_count, 0)):
        material_interface = None
        try:
            material_interface = component.get_material(slot_index)
        except Exception:
            material_interface = None

        slot_name = ""
        if slot_index < len(material_slot_names):
            slot_name = str(material_slot_names[slot_index])

        material_info.append(
            {
                "slot_index": slot_index,
                "slot_name": slot_name,
                "material": get_material_summary(material_interface),
            }
        )

    return material_info


def load_material_asset(material_identifier):
    return load_asset_by_identifier(
        material_identifier,
        [
            "Material",
            "MaterialInstance",
            "MaterialInstanceConstant",
            "MaterialInterface",
        ],
    )


def apply_material_to_component(component, material_identifier, slot_index=0):
    if component is None:
        raise ValueError("A render component is required")

    material_asset = load_material_asset(material_identifier)
    if not hasattr(component, "set_material"):
        raise ValueError(
            "Component '{0}' does not support material assignment.".format(
                get_object_name(component)
            )
        )

    component.set_material(int(slot_index), material_asset)
    return material_asset


def find_actor_material_component(actor, component_name=None):
    mesh_components = get_actor_mesh_components(actor)
    if component_name:
        for component in mesh_components:
            if get_object_name(component) == component_name:
                return component
        raise ValueError(
            "Material-capable component not found on actor: {0}".format(component_name)
        )

    if not mesh_components:
        raise ValueError(
            "Actor '{0}' does not have a material-capable mesh component.".format(
                actor.get_actor_label()
            )
        )

    return mesh_components[0]


def get_actor_material_report(actor):
    return {
        "actor": get_actor_summary(actor),
        "components": [
            {
                "name": get_object_name(component),
                "class": get_object_class_name(component),
                "materials": get_component_material_info(component),
            }
            for component in get_actor_mesh_components(actor)
        ],
    }


def create_material_instance_constant(
    parent_material, instance_name=None, package_path="/Game/MCP/GeneratedMaterials"
):
    material_instance_class = getattr(unreal, "MaterialInstanceConstant", None)
    material_factory_class = getattr(unreal, "MaterialInstanceConstantFactoryNew", None)
    material_library = getattr(unreal, "MaterialEditingLibrary", None)

    if material_instance_class is None or material_factory_class is None:
        raise ValueError(
            "MaterialInstanceConstant asset creation is not exposed in this UE4.27 Python environment."
        )

    instance_asset_name = sanitize_asset_name(
        instance_name or "{0}_MCPInst".format(get_object_name(parent_material)),
        fallback="GeneratedMaterialInstance",
    )
    package_path = get_asset_package_path_for_create(package_path)
    instance_asset_path = "{0}/{1}".format(package_path, instance_asset_name)

    try:
        existing_asset = unreal.EditorAssetLibrary.load_asset(instance_asset_path)
        if existing_asset:
            if material_library and hasattr(material_library, "set_material_instance_parent"):
                material_library.set_material_instance_parent(existing_asset, parent_material)
            else:
                set_object_property(existing_asset, "parent", parent_material)
            save_loaded_editor_asset(existing_asset)
            return existing_asset
    except Exception:
        pass

    factory = material_factory_class()
    material_instance = create_asset_with_factory(
        instance_asset_name,
        package_path,
        material_instance_class,
        factory,
    )
    if not material_instance:
        raise RuntimeError(
            "Failed to create material instance '{0}'".format(instance_asset_name)
        )

    if material_library and hasattr(material_library, "set_material_instance_parent"):
        material_library.set_material_instance_parent(material_instance, parent_material)
    else:
        set_object_property(material_instance, "parent", parent_material)

    save_loaded_editor_asset(material_instance)
    return material_instance


def tint_material_interface(
    material_interface,
    color_values,
    parameter_name=None,
    instance_name=None,
    package_path="/Game/MCP/GeneratedMaterials",
):
    material_library = getattr(unreal, "MaterialEditingLibrary", None)
    material_class_name = get_object_class_name(material_interface)
    parameter_candidates = []
    if parameter_name:
        parameter_candidates.append(parameter_name)
    parameter_candidates.extend(
        [
            "BaseColor",
            "Color",
            "Tint",
            "TintColor",
            "BodyColor",
            "AlbedoTint",
        ]
    )

    if material_class_name == "Material":
        material_interface = create_material_instance_constant(
            material_interface,
            instance_name=instance_name,
            package_path=package_path,
        )

    if (
        material_library is None
        or not hasattr(material_library, "set_material_instance_vector_parameter_value")
        or not hasattr(material_library, "update_material_instance")
    ):
        raise ValueError(
            "MaterialEditingLibrary vector parameter editing is not exposed in this UE4.27 Python environment."
        )

    color_value = as_linear_color(color_values)
    for parameter_candidate in parameter_candidates:
        try:
            success = material_library.set_material_instance_vector_parameter_value(
                material_interface,
                unreal.Name(parameter_candidate)
                if hasattr(unreal, "Name")
                else parameter_candidate,
                color_value,
            )
            if success:
                material_library.update_material_instance(material_interface)
                save_loaded_editor_asset(material_interface)
                return material_interface, parameter_candidate
        except Exception:
            continue

    raise ValueError(
        "Could not set a vector color parameter on material '{0}'.".format(
            get_object_name(material_interface)
        )
    )


def apply_physics_to_component_instance(component, args):
    if component is None:
        raise ValueError("A primitive component is required")

    simulate_physics = bool(args.get("simulate_physics", True))
    gravity_enabled = bool(args.get("gravity_enabled", True))
    mass = float(args.get("mass", 1.0))
    linear_damping = float(args.get("linear_damping", 0.01))
    angular_damping = float(args.get("angular_damping", 0.0))

    simulate_setter = getattr(component, "set_simulate_physics", None)
    if callable(simulate_setter):
        simulate_setter(simulate_physics)

    gravity_setter = getattr(component, "set_enable_gravity", None)
    if callable(gravity_setter):
        gravity_setter(gravity_enabled)

    if hasattr(component, "set_mass_override_in_kg"):
        bone_name = unreal.Name("") if hasattr(unreal, "Name") else ""
        try:
            component.set_mass_override_in_kg(bone_name, mass, True)
        except Exception:
            pass

    set_object_property(component, "linear_damping", linear_damping)
    set_object_property(component, "angular_damping", angular_damping)

    return {
        "component_name": get_object_name(component),
        "component_class": get_object_class_name(component),
        "simulate_physics": simulate_physics,
        "gravity_enabled": gravity_enabled,
        "mass": mass,
        "linear_damping": linear_damping,
        "angular_damping": angular_damping,
    }


_BASIC_SHAPE_ASSET_PATHS = {
    "cube": "/Engine/BasicShapes/Cube.Cube",
    "sphere": "/Engine/BasicShapes/Sphere.Sphere",
    "cylinder": "/Engine/BasicShapes/Cylinder.Cylinder",
    "cone": "/Engine/BasicShapes/Cone.Cone",
    "plane": "/Engine/BasicShapes/Plane.Plane",
}


def load_basic_shape_mesh(shape_name="cube"):
    mesh_path = _BASIC_SHAPE_ASSET_PATHS.get(str(shape_name or "cube").lower())
    if not mesh_path:
        raise ValueError("Unsupported basic shape: {0}".format(shape_name))

    shape_mesh = unreal.EditorAssetLibrary.load_asset(mesh_path)
    if not shape_mesh:
        raise ValueError("Could not load engine basic shape mesh: {0}".format(mesh_path))

    return shape_mesh


def spawn_basic_shape_actor(
    label,
    location,
    scale=None,
    rotation=None,
    shape_name="cube",
    material_identifier=None,
):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor,
        as_vector3(location),
        as_rotator(rotation),
    )
    if not actor:
        raise RuntimeError("Failed to spawn StaticMeshActor for '{0}'".format(label))

    actor.set_actor_label(label)
    mesh_component = actor.get_component_by_class(unreal.StaticMeshComponent)
    if mesh_component is None:
        raise RuntimeError(
            "Spawned actor '{0}' does not expose a StaticMeshComponent.".format(label)
        )

    mesh_component.set_static_mesh(load_basic_shape_mesh(shape_name))
    if scale is not None:
        actor.set_actor_scale3d(as_vector3(scale, [1.0, 1.0, 1.0]))

    if material_identifier:
        apply_material_to_component(mesh_component, material_identifier)

    return actor
