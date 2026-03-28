from typing import Dict, Optional
import json


def parse_json_value(value_str):
    if value_str and value_str != "null" and value_str.strip():
        return json.loads(value_str)
    return None


def add_child_widget(
    widget_blueprint_path: str,
    parent_widget_name: str,
    child_widget_class: str,
    child_widget_name: str,
    position: Optional[Dict[str, float]] = None,
    z_order: Optional[int] = None,
):
    try:
        widget_blueprint = load_widget_blueprint(widget_blueprint_path)
        widget_tree = get_widget_tree(widget_blueprint)

        parent_widget = find_widget_in_tree(widget_tree, parent_widget_name)
        if not parent_widget:
            return {"error": "Parent widget not found: {0}".format(parent_widget_name)}

        child_widget = create_widget_instance(
            widget_tree, child_widget_class, child_widget_name
        )
        add_widget_to_tree(widget_tree, child_widget, parent_widget)

        if position is not None:
            set_widget_canvas_position(child_widget, position, z_order)

        if not save_widget_blueprint(widget_blueprint):
            return {
                "error": "Child widget was added but the widget blueprint could not be saved."
            }

        return {
            "success": True,
            "widget_blueprint_path": widget_blueprint_path,
            "parent_widget_name": parent_widget_name,
            "child_widget_name": get_widget_name(child_widget),
            "class": get_widget_class_name(child_widget),
            "layout": get_canvas_slot_layout(child_widget),
        }
    except Exception as exc:
        return {"error": "Failed to add child widget: {0}".format(str(exc))}


def main():
    widget_blueprint_path = parse_json_value("""${widget_blueprint_path}""")
    parent_widget_name = parse_json_value("""${parent_widget_name}""")
    child_widget_class = parse_json_value("""${child_widget_class}""")
    child_widget_name = parse_json_value("""${child_widget_name}""")
    position = parse_json_value("""${position}""")
    z_order = parse_json_value("""${z_order}""")

    result = add_child_widget(
        widget_blueprint_path=widget_blueprint_path,
        parent_widget_name=parent_widget_name,
        child_widget_class=child_widget_class,
        child_widget_name=child_widget_name,
        position=position,
        z_order=z_order,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
