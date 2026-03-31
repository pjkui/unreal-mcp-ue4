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
