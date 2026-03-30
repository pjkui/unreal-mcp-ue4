def _helper_exposes_method(helper, method_names):
    for method_name in method_names:
        try:
            if callable(getattr(helper, method_name, None)):
                return True
        except Exception:
            continue

    return False


def _resolve_source_control_helper():
    for class_name in ("SourceControlHelpers", "SourceControl"):
        try:
            helper = getattr(unreal, class_name, None)
            if helper and _helper_exposes_method(
                helper, ("current_provider", "CurrentProvider")
            ):
                return helper, class_name
        except Exception:
            pass

        try:
            helper = unreal.load_class(None, "/Script/SourceControl.{0}".format(class_name))
            if helper and _helper_exposes_method(
                helper, ("current_provider", "CurrentProvider")
            ):
                return helper, class_name
        except Exception:
            continue

    raise RuntimeError(
        "SourceControlHelpers is not exposed in this UE4.27 Python environment."
    )


def _call_helper_method(helper, method_names, *args):
    last_error = None
    method_found = False

    for method_name in method_names:
        try:
            method = getattr(helper, method_name, None)
            if callable(method):
                method_found = True
                return method(*args)
        except Exception as exc:
            last_error = exc
            continue

    if last_error is not None:
        raise last_error

    if method_found:
        raise RuntimeError(
            "Source control helper could not execute {0}".format(method_names[0])
        )

    raise RuntimeError(
        "Source control helper does not expose {0}".format(method_names[0])
    )


def _text_to_string(value):
    if value is None:
        return ""

    try:
        if hasattr(value, "to_string"):
            return str(value.to_string())
    except Exception:
        pass

    return str(value)


def _provider_snapshot(helper):
    return {
        "provider": _text_to_string(
            _call_helper_method(helper, ("current_provider", "CurrentProvider"))
        ),
        "enabled": bool(
            _call_helper_method(helper, ("is_enabled", "IsEnabled"))
        ),
        "available": bool(
            _call_helper_method(helper, ("is_available", "IsAvailable"))
        ),
    }


def _last_error(helper):
    try:
        last_error = _call_helper_method(helper, ("last_error_msg", "LastErrorMsg"))
    except Exception:
        return ""

    return _text_to_string(last_error).strip()


def _append_last_error(payload, helper):
    last_error = _last_error(helper)
    if last_error:
        payload["last_error"] = last_error
    return payload


def _coerce_string_list(values, label):
    if values is None:
        raise ValueError("{0} is required".format(label))

    if not isinstance(values, (list, tuple)):
        raise ValueError("{0} must be a list of strings".format(label))

    normalized_values = []
    for value in values:
        normalized_value = str(value or "").strip()
        if normalized_value:
            normalized_values.append(normalized_value)

    if not normalized_values:
        raise ValueError("{0} is required".format(label))

    return normalized_values


def _property_candidates(prop_name):
    raw_name = str(prop_name or "").strip()
    if not raw_name:
        return []

    candidates = []

    def _append(name):
        if name and name not in candidates:
            candidates.append(name)

    for candidate in get_property_name_candidates(raw_name):
        _append(candidate)

    if raw_name.startswith("b_"):
        for candidate in get_property_name_candidates(raw_name[2:]):
            _append(candidate)
    elif raw_name.startswith("b") and len(raw_name) > 1 and raw_name[1].isupper():
        for candidate in get_property_name_candidates(
            raw_name[1].lower() + raw_name[2:]
        ):
            _append(candidate)
    else:
        for candidate in get_property_name_candidates("b_" + raw_name):
            _append(candidate)

        for candidate in get_property_name_candidates(
            "b" + raw_name[:1].upper() + raw_name[1:]
        ):
            _append(candidate)

    return candidates


def _struct_property_value(target, prop_name, default=None):
    for candidate_name in _property_candidates(prop_name):
        try:
            if hasattr(target, "get_editor_property"):
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


def _serialize_source_control_state(state):
    if state is None:
        return None

    return {
        "filename": _text_to_string(_struct_property_value(state, "filename", "")),
        "is_valid": bool(_struct_property_value(state, "is_valid", False)),
        "is_unknown": bool(_struct_property_value(state, "is_unknown", False)),
        "can_check_in": bool(_struct_property_value(state, "can_check_in", False)),
        "can_check_out": bool(_struct_property_value(state, "can_check_out", False)),
        "is_checked_out": bool(_struct_property_value(state, "is_checked_out", False)),
        "is_current": bool(_struct_property_value(state, "is_current", False)),
        "is_source_controlled": bool(
            _struct_property_value(state, "is_source_controlled", False)
        ),
        "is_added": bool(_struct_property_value(state, "is_added", False)),
        "is_deleted": bool(_struct_property_value(state, "is_deleted", False)),
        "is_ignored": bool(_struct_property_value(state, "is_ignored", False)),
        "can_edit": bool(_struct_property_value(state, "can_edit", False)),
        "can_delete": bool(_struct_property_value(state, "can_delete", False)),
        "is_modified": bool(_struct_property_value(state, "is_modified", False)),
        "can_add": bool(_struct_property_value(state, "can_add", False)),
        "is_conflicted": bool(_struct_property_value(state, "is_conflicted", False)),
        "can_revert": bool(_struct_property_value(state, "can_revert", False)),
        "is_checked_out_other": bool(
            _struct_property_value(state, "is_checked_out_other", False)
        ),
        "checked_out_other": _text_to_string(
            _struct_property_value(state, "checked_out_other", "")
        ),
        "is_checked_out_in_other_branch": bool(
            _struct_property_value(state, "is_checked_out_in_other_branch", False)
        ),
        "is_modified_in_other_branch": bool(
            _struct_property_value(state, "is_modified_in_other_branch", False)
        ),
        "previous_user": _text_to_string(
            _struct_property_value(state, "previous_user", "")
        ),
    }
