import json


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


def _provider_info(args):
    helper, helper_name = _resolve_source_control_helper()
    payload = {
        "success": True,
        "helper_class": helper_name,
    }
    payload.update(_provider_snapshot(helper))
    return _append_last_error(payload, helper)


def _query_state(args):
    file_value = str(args.get("file") or "").strip()
    if not file_value:
        return {"success": False, "message": "file is required"}

    helper, helper_name = _resolve_source_control_helper()
    payload = {
        "success": True,
        "file": file_value,
        "helper_class": helper_name,
    }
    payload.update(_provider_snapshot(helper))
    state = _call_helper_method(
        helper,
        ("query_file_state", "QueryFileState"),
        file_value,
        True,
    )
    payload["state"] = _serialize_source_control_state(state)
    return _append_last_error(payload, helper)


def _query_states(args):
    files = _coerce_string_list(args.get("files"), "files")
    helper, helper_name = _resolve_source_control_helper()
    payload = {
        "success": True,
        "files": files,
        "count": len(files),
        "helper_class": helper_name,
    }
    payload.update(_provider_snapshot(helper))
    try:
        states = _call_helper_method(
            helper,
            ("query_file_states", "QueryFileStates"),
            files,
            True,
        )
    except RuntimeError as exc:
        if "does not expose query_file_states" not in str(exc):
            raise

        states = [
            _call_helper_method(
                helper,
                ("query_file_state", "QueryFileState"),
                file_value,
                True,
            )
            for file_value in files
        ]
    payload["states"] = [
        _serialize_source_control_state(state) for state in (states or [])
    ]
    return _append_last_error(payload, helper)


def _run_file_operation(
    operation_name,
    method_names,
    single_key=None,
    multi_key=None,
    description_key=None,
    keep_checked_out_key=None,
):
    def _handler(args):
        helper, helper_name = _resolve_source_control_helper()
        payload = {
            "helper_class": helper_name,
            "operation": operation_name,
        }
        payload.update(_provider_snapshot(helper))

        call_args = []

        if single_key:
            file_value = str(args.get(single_key) or "").strip()
            if not file_value:
                return {"success": False, "message": "{0} is required".format(single_key)}
            payload["file"] = file_value
            call_args.append(file_value)

        if multi_key:
            files = _coerce_string_list(args.get(multi_key), multi_key)
            payload[multi_key] = files
            payload["count"] = len(files)
            call_args.append(files)

        if description_key:
            description = str(args.get(description_key) or "").strip()
            if not description:
                return {
                    "success": False,
                    "message": "{0} is required".format(description_key),
                }
            payload["description"] = description
            call_args.append(description)

        call_args.append(True)

        if keep_checked_out_key:
            keep_checked_out = bool(args.get(keep_checked_out_key, False))
            payload["keep_checked_out"] = keep_checked_out
            call_args.append(keep_checked_out)

        success = bool(_call_helper_method(helper, method_names, *call_args))
        payload["success"] = success
        if not success and "message" not in payload:
            payload["message"] = "{0} failed".format(operation_name)
        return _append_last_error(payload, helper)

    return _handler


def _revert_and_reload_packages(args):
    packages = _coerce_string_list(args.get("packages"), "packages")
    helper, helper_name = _resolve_source_control_helper()
    payload = {
        "helper_class": helper_name,
        "operation": "revert_and_reload_packages",
        "packages": packages,
        "count": len(packages),
        "revert_all": bool(args.get("revert_all", False)),
        "reload_world": bool(args.get("reload_world", False)),
    }
    payload.update(_provider_snapshot(helper))

    success = bool(
        _call_helper_method(
            helper,
            ("revert_and_reload_packages", "RevertAndReloadPackages"),
            packages,
            payload["revert_all"],
            payload["reload_world"],
        )
    )
    payload["success"] = success
    if not success:
        payload["message"] = "revert_and_reload_packages failed"
    return _append_last_error(payload, helper)


OPERATIONS = {
    "get_source_control_provider": _provider_info,
    "query_source_control_state": _query_state,
    "query_source_control_states": _query_states,
    "check_out_file": _run_file_operation(
        "check_out_file",
        ("check_out_file", "CheckOutFile"),
        single_key="file",
    ),
    "check_out_files": _run_file_operation(
        "check_out_files",
        ("check_out_files", "CheckOutFiles"),
        multi_key="files",
    ),
    "check_out_or_add_file": _run_file_operation(
        "check_out_or_add_file",
        ("check_out_or_add_file", "CheckOutOrAddFile"),
        single_key="file",
    ),
    "check_out_or_add_files": _run_file_operation(
        "check_out_or_add_files",
        ("check_out_or_add_files", "CheckOutOrAddFiles"),
        multi_key="files",
    ),
    "mark_file_for_add": _run_file_operation(
        "mark_file_for_add",
        ("mark_file_for_add", "MarkFileForAdd"),
        single_key="file",
    ),
    "mark_files_for_add": _run_file_operation(
        "mark_files_for_add",
        ("mark_files_for_add", "MarkFilesForAdd"),
        multi_key="files",
    ),
    "mark_file_for_delete": _run_file_operation(
        "mark_file_for_delete",
        ("mark_file_for_delete", "MarkFileForDelete"),
        single_key="file",
    ),
    "mark_files_for_delete": _run_file_operation(
        "mark_files_for_delete",
        ("mark_files_for_delete", "MarkFilesForDelete"),
        multi_key="files",
    ),
    "revert_file": _run_file_operation(
        "revert_file",
        ("revert_file", "RevertFile"),
        single_key="file",
    ),
    "revert_files": _run_file_operation(
        "revert_files",
        ("revert_files", "RevertFiles"),
        multi_key="files",
    ),
    "revert_unchanged_files": _run_file_operation(
        "revert_unchanged_files",
        ("revert_unchanged_files", "RevertUnchangedFiles"),
        multi_key="files",
    ),
    "sync_file": _run_file_operation(
        "sync_file",
        ("sync_file", "SyncFile"),
        single_key="file",
    ),
    "sync_files": _run_file_operation(
        "sync_files",
        ("sync_files", "SyncFiles"),
        multi_key="files",
    ),
    "check_in_files": _run_file_operation(
        "check_in_files",
        ("check_in_files", "CheckInFiles"),
        multi_key="files",
        description_key="description",
        keep_checked_out_key="keep_checked_out",
    ),
    "revert_and_reload_packages": _revert_and_reload_packages,
}


def main():
    operation = decode_template_json("""${operation}""")
    args = decode_template_json("""${args}""")

    handler = OPERATIONS.get(operation)
    if not handler:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": "Unknown source control tool operation: {0}".format(
                        operation
                    ),
                },
                indent=2,
            )
        )
        return

    try:
        result = handler(args or {})
    except Exception as exc:
        result = {"success": False, "message": str(exc)}

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
