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
