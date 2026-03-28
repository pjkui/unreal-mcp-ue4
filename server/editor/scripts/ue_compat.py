import json
import os
import re
import tempfile
from pathlib import Path

import unreal


def _has_unreal_class(class_name):
    return hasattr(unreal, class_name)


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


def get_asset_package_name(asset_or_data):
    try:
        if hasattr(asset_or_data, "package_name"):
            return str(asset_or_data.package_name)
    except Exception:
        pass

    try:
        package = asset_or_data.get_package()
        if package:
            return package.get_name()
    except Exception:
        pass

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


def set_object_property(target, prop_name, prop_value):
    try:
        if hasattr(target, "set_editor_property"):
            target.set_editor_property(prop_name, prop_value)
            return True
    except Exception:
        pass

    try:
        if hasattr(target, prop_name):
            setattr(target, prop_name, prop_value)
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
    try:
        value = target.get_editor_property(prop_name)
        if value is not None:
            return value
    except Exception:
        pass

    try:
        value = getattr(target, prop_name)
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
        if hasattr(class_reference, "static_class"):
            return class_reference.static_class()
    except Exception:
        pass

    return class_reference


def class_is_child_of(class_reference, parent_class_reference):
    class_object = get_UClass(class_reference)
    parent_class_object = get_UClass(parent_class_reference)

    if not class_object or not parent_class_object:
        return False

    try:
        return bool(class_object.is_child_of(parent_class_object))
    except Exception:
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
