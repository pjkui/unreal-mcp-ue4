from typing import Dict, Optional
import json


def parse_json_value(value_str):
    if value_str and value_str != "null" and value_str.strip():
        return json.loads(value_str)
    return None


def add_widget(
    widget_blueprint_path: str,
    widget_class: str,
    widget_name: str,
    parent_widget_name: Optional[str] = None,
    position: Optional[Dict[str, float]] = None,
    z_order: Optional[int] = None,
):
    try:
        widget_blueprint = load_widget_blueprint(widget_blueprint_path)
        widget_tree = get_widget_tree(widget_blueprint)

        parent_widget = None
        if parent_widget_name:
            parent_widget = find_widget_in_tree(widget_tree, parent_widget_name)
            if not parent_widget:
                return {
                    "error": "Parent widget not found: {0}".format(parent_widget_name)
                }

        new_widget = create_widget_instance(widget_tree, widget_class, widget_name)
        add_widget_to_tree(widget_tree, new_widget, parent_widget)

        if position is not None:
            set_widget_canvas_position(new_widget, position, z_order)

        if not save_widget_blueprint(widget_blueprint):
            return {
                "error": "Widget was added but the widget blueprint could not be saved."
            }

        return {
            "success": True,
            "widget_blueprint_path": widget_blueprint_path,
            "widget_name": get_widget_name(new_widget),
            "class": get_widget_class_name(new_widget),
            "parent_widget_name": parent_widget_name,
            "is_root_widget": parent_widget is None,
            "layout": get_canvas_slot_layout(new_widget),
        }
    except Exception as exc:
        return {"error": "Failed to add widget: {0}".format(str(exc))}


def main():
    widget_blueprint_path = parse_json_value("""${widget_blueprint_path}""")
    widget_class = parse_json_value("""${widget_class}""")
    widget_name = parse_json_value("""${widget_name}""")
    parent_widget_name = parse_json_value("""${parent_widget_name}""")
    position = parse_json_value("""${position}""")
    z_order = parse_json_value("""${z_order}""")

    result = add_widget(
        widget_blueprint_path=widget_blueprint_path,
        widget_class=widget_class,
        widget_name=widget_name,
        parent_widget_name=parent_widget_name,
        position=position,
        z_order=z_order,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
