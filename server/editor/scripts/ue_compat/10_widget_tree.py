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


def get_python_class_reference(class_reference):
    if not class_reference:
        return None

    try:
        if isinstance(class_reference, type):
            return class_reference
    except Exception:
        pass

    class_object = None
    unreal_class_type = getattr(unreal, "Class", None)

    try:
        if unreal_class_type and isinstance(class_reference, unreal_class_type):
            class_object = class_reference
    except Exception:
        pass

    if class_object is None:
        try:
            if hasattr(class_reference, "get_class"):
                class_object = class_reference.get_class()
        except Exception:
            class_object = None

    if class_object is None:
        try:
            if hasattr(class_reference, "static_class"):
                class_object = class_reference.static_class()
        except Exception:
            class_object = None

    class_name = get_object_name(class_object or class_reference)
    if not class_name:
        return None

    try:
        resolved_class = getattr(unreal, class_name, None)
        if isinstance(resolved_class, type):
            return resolved_class
    except Exception:
        pass

    return None


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

    python_class = get_python_class_reference(class_reference)
    parent_python_class = get_python_class_reference(parent_class_reference)
    if python_class and parent_python_class:
        try:
            return issubclass(python_class, parent_python_class)
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


def object_is_instance_of(target_object, parent_class_reference):
    if not target_object or not parent_class_reference:
        return False

    parent_python_class = get_python_class_reference(parent_class_reference)
    if parent_python_class:
        try:
            return isinstance(target_object, parent_python_class)
        except Exception:
            pass

    try:
        return class_is_child_of(target_object.get_class(), parent_class_reference)
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

    asset_path = get_asset_package_name(widget_blueprint)
    asset_name = str(asset_path or "").rsplit("/", 1)[-1]
    if asset_path and asset_name:
        for tree_path in (
            "{0}.{1}:WidgetTree".format(asset_path, asset_name),
            "{0}.{1}_C:WidgetTree".format(asset_path, asset_name),
        ):
            try:
                widget_tree = unreal.load_object(None, tree_path)
                if widget_tree and get_object_class_name(widget_tree) == "WidgetTree":
                    return widget_tree
            except Exception:
                continue

    raise ValueError(
        "Widget blueprint does not expose an editable widget tree in UE4.27 Python."
    )


def get_root_widget(widget_tree):
    root_widget = get_editor_property_value(widget_tree, "root_widget")
    if root_widget:
        return root_widget

    root_candidates = []
    for widget in iter_widget_tree_widgets(widget_tree):
        try:
            if widget.get_parent():
                continue
        except Exception:
            pass

        score = 0
        widget_name = get_widget_name(widget)
        child_count = 0

        if is_panel_widget(widget):
            score += 100
        if object_is_instance_of(widget, unreal.CanvasPanel):
            score += 50
        if object_is_instance_of(widget, unreal.Widget):
            score += 10

        try:
            if hasattr(widget, "get_children_count"):
                child_count = int(widget.get_children_count())
        except Exception:
            pass

        score += min(child_count, 25)

        if widget_name == "CanvasPanel_0":
            score += 2
        elif widget_name.lower().startswith("canvaspanel"):
            score += 1

        root_candidates.append((score, widget_name, widget))

    if root_candidates:
        root_candidates.sort(key=lambda item: (-item[0], item[1]))
        return root_candidates[0][2]

    try:
        tree_path = widget_tree.get_path_name()
    except Exception:
        tree_path = ""

    if tree_path:
        for candidate_name in (
            "CanvasPanel_0",
            "RootCanvas",
            "Overlay_0",
            "SizeBox_0",
            "Border_0",
        ):
            try:
                candidate_widget = unreal.load_object(
                    None, "{0}.{1}".format(tree_path, candidate_name)
                )
                if candidate_widget and object_is_instance_of(
                    candidate_widget, unreal.Widget
                ):
                    return candidate_widget
            except Exception:
                continue

    return None


def is_panel_widget(widget):
    if not widget:
        return False

    try:
        return object_is_instance_of(widget, unreal.PanelWidget)
    except Exception:
        return False


def get_panel_children(widget):
    if not is_panel_widget(widget):
        return []

    try:
        return list(widget.get_all_children())
    except Exception:
        return []


def iter_widget_tree_widgets(widget_tree):
    iterator_class = getattr(unreal, "ObjectIterator", None)
    if not iterator_class or not widget_tree:
        return []

    widgets = []
    try:
        iterator = iterator_class(unreal.Widget)
    except Exception:
        try:
            iterator = iterator_class()
        except Exception:
            return []

    for widget in iterator:
        try:
            if widget.get_outer() == widget_tree:
                widgets.append(widget)
        except Exception:
            continue

    widgets.sort(key=lambda item: get_widget_name(item))
    return widgets


def find_widget_in_tree(widget_tree, widget_name):
    if not widget_name:
        return None

    try:
        widget = widget_tree.find_widget(widget_name)
        if widget:
            return widget
    except Exception:
        pass

    for widget in iter_widget_tree_widgets(widget_tree):
        if get_widget_name(widget) == widget_name:
            return widget

    try:
        tree_path = widget_tree.get_path_name()
    except Exception:
        tree_path = ""

    if tree_path:
        try:
            widget = unreal.load_object(None, "{0}.{1}".format(tree_path, widget_name))
            if widget and object_is_instance_of(widget, unreal.Widget):
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
    try:
        direct_parent = target_widget.get_parent()
        if direct_parent:
            return direct_parent
    except Exception:
        pass

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


def require_panel_widget(widget, widget_name=None):
    if is_panel_widget(widget):
        return widget

    raise ValueError(
        "Widget '{0}' is not a panel widget and cannot contain child widgets.".format(
            widget_name or get_widget_name(widget)
        )
    )
