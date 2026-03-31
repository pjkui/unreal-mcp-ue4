def delete_actor(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    deleted_actor = get_actor_summary(actor)
    if not destroy_actor(actor):
        return {
            "success": False,
            "message": "Failed to delete actor: {0}".format(actor_name),
        }

    return {
        "success": True,
        "message": "Deleted actor: {0}".format(actor_name),
        "actor": deleted_actor,
    }


def set_actor_transform(args):
    actor_name = args.get("name")
    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    if args.get("location") is not None:
        actor.set_actor_location(_vector_from_list(args.get("location")), False, False)

    if args.get("rotation") is not None:
        actor.set_actor_rotation(_rotator_from_list(args.get("rotation")), False)

    if args.get("scale") is not None:
        actor.set_actor_scale3d(_vector_from_list(args.get("scale"), [1.0, 1.0, 1.0]))

    return {"success": True, "actor": get_actor_summary(actor)}


def set_actor_property(args):
    actor_name = args.get("name")
    property_name = args.get("property_name")
    property_value = args.get("property_value")

    actor = find_actor_by_name(actor_name)
    if not actor:
        return {
            "success": False,
            "message": "Actor not found: {0}".format(actor_name),
        }

    if not property_name:
        return {"success": False, "message": "property_name is required"}

    if not apply_actor_property(actor, property_name, property_value):
        return {
            "success": False,
            "message": "Failed to set actor property '{0}'".format(property_name),
        }

    return {"success": True, "actor": get_actor_property_report(actor)}
