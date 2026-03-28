import json


_KNOWN_DATA_CLASS_TOKENS = (
    "dataasset",
    "primarydataasset",
    "datatable",
    "curvetable",
    "stringtable",
    "compositedatatable",
    "compositecurvetable",
)


def _asset_summary(asset):
    return {
        "name": get_object_name(asset),
        "class": get_object_class_name(asset),
        "asset_path": get_asset_package_name(asset) or get_asset_object_path(asset),
    }


def _data_asset_class_matches(asset_class_name):
    normalized = str(asset_class_name or "").strip().lower()
    if not normalized:
        return False

    return any(token in normalized for token in _KNOWN_DATA_CLASS_TOKENS)


def _load_data_asset_class(class_name):
    normalized = str(class_name or "DataAsset").strip()
    resolved = resolve_class_reference(normalized, ["Engine"])

    if not resolved:
        try:
            resolved = unreal.load_class(None, normalized)
        except Exception:
            resolved = None

    if not resolved:
        return None

    if not class_is_child_of(resolved, unreal.DataAsset):
        return None

    return resolved


def _resolve_script_struct(struct_name):
    normalized = str(struct_name or "").strip()
    if not normalized:
        return None

    struct_type = getattr(unreal, normalized, None)
    if struct_type:
        try:
            static_struct = getattr(struct_type, "static_struct", None)
            if callable(static_struct):
                return static_struct()
        except Exception:
            pass

    candidates = [normalized]
    if not normalized.startswith("/Script/"):
        candidates.extend(
            [
                "/Script/Engine.{0}".format(normalized),
                "/Script/CoreUObject.{0}".format(normalized),
            ]
        )

    for candidate in candidates:
        try:
            loaded = unreal.load_object(None, candidate)
            if loaded:
                return loaded
        except Exception:
            continue

    return None


def search_data_assets(args):
    search_term = str(args.get("search_term") or args.get("query") or "").strip().lower()
    include_engine = bool(args.get("include_engine", False))
    limit = int(args.get("limit", 100))
    results = []

    for asset_data in get_asset_registry().get_all_assets():
        package_name = get_asset_package_name(asset_data)
        if not include_engine and package_name.startswith("/Engine/"):
            continue

        asset_class_name = get_asset_class_name(asset_data)
        searchable_text = "{0} {1} {2}".format(
            package_name,
            get_asset_object_path(asset_data),
            asset_class_name,
        ).lower()
        if search_term and search_term not in searchable_text:
            continue

        if not _data_asset_class_matches(asset_class_name):
            try:
                asset = unreal.EditorAssetLibrary.load_asset(package_name)
            except Exception:
                asset = None

            if not asset:
                continue

            asset_class_name = get_object_class_name(asset)
            if not (
                _data_asset_class_matches(asset_class_name)
                or class_is_child_of(asset.get_class(), unreal.DataAsset)
            ):
                continue

        results.append(
            {
                "name": str(asset_data.asset_name),
                "class": asset_class_name,
                "path": package_name,
            }
        )

    results.sort(key=lambda entry: (entry["path"].startswith("/Engine/"), entry["path"]))
    return {
        "success": True,
        "count": len(results[:limit]),
        "assets": results[:limit],
    }


def create_data_asset(args):
    asset_name = args.get("name") or args.get("asset_name")
    content_path = args.get("path") or "/Game/Data"
    data_asset_class_name = args.get("data_asset_class") or "DataAsset"

    if not asset_name:
        return {"success": False, "message": "name or asset_name is required"}

    factory_class = getattr(unreal, "DataAssetFactory", None)
    if not factory_class:
        return {
            "success": False,
            "message": "DataAssetFactory is not exposed in this UE4.27 Python environment.",
        }

    data_asset_class = _load_data_asset_class(data_asset_class_name)
    if not data_asset_class:
        return {
            "success": False,
            "message": "Data asset class not found or not derived from DataAsset: {0}".format(
                data_asset_class_name
            ),
        }

    asset_leaf_name, package_path = split_asset_name_and_path(asset_name, content_path)

    try:
        factory = factory_class()
        factory.set_editor_property("data_asset_class", get_UClass(data_asset_class))
        asset = create_asset_with_factory(
            asset_leaf_name,
            package_path,
            data_asset_class,
            factory,
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    if not asset:
        return {
            "success": False,
            "message": "Failed to create data asset '{0}'".format(asset_leaf_name),
        }

    asset_path = "{0}/{1}".format(package_path, asset_leaf_name)
    saved = save_loaded_editor_asset(asset)
    return {
        "success": True,
        "asset": _asset_summary(asset),
        "asset_path": asset_path,
        "saved": bool(saved),
        "data_asset_class": get_object_name(get_UClass(data_asset_class)),
    }


def create_data_table(args):
    asset_name = args.get("name") or args.get("asset_name")
    content_path = args.get("path") or "/Game/Data"
    row_struct_name = args.get("row_struct") or args.get("struct")

    if not asset_name:
        return {"success": False, "message": "name or asset_name is required"}

    if not row_struct_name:
        return {"success": False, "message": "row_struct or struct is required"}

    factory_class = getattr(unreal, "DataTableFactory", None)
    data_table_class = resolve_class_reference("DataTable", ["Engine"])
    if not factory_class or not data_table_class:
        return {
            "success": False,
            "message": "DataTableFactory is not exposed in this UE4.27 Python environment.",
        }

    row_struct = _resolve_script_struct(row_struct_name)
    if not row_struct:
        return {
            "success": False,
            "message": "Row struct could not be resolved: {0}".format(row_struct_name),
        }

    asset_leaf_name, package_path = split_asset_name_and_path(asset_name, content_path)

    try:
        factory = factory_class()
        factory.set_editor_property("struct", row_struct)
        asset = create_asset_with_factory(
            asset_leaf_name,
            package_path,
            data_table_class,
            factory,
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    if not asset:
        return {
            "success": False,
            "message": "Failed to create data table '{0}'".format(asset_leaf_name),
        }

    asset_path = "{0}/{1}".format(package_path, asset_leaf_name)
    saved = save_loaded_editor_asset(asset)
    return {
        "success": True,
        "asset": _asset_summary(asset),
        "asset_path": asset_path,
        "saved": bool(saved),
        "row_struct": str(row_struct_name),
    }


def create_string_table(args):
    asset_name = args.get("name") or args.get("asset_name")
    content_path = args.get("path") or "/Game/Data"

    if not asset_name:
        return {"success": False, "message": "name or asset_name is required"}

    factory_class = getattr(unreal, "StringTableFactory", None)
    string_table_class = resolve_class_reference("StringTable", ["Engine"])
    if not factory_class or not string_table_class:
        return {
            "success": False,
            "message": "StringTableFactory is not exposed in this UE4.27 Python environment.",
        }

    asset_leaf_name, package_path = split_asset_name_and_path(asset_name, content_path)

    try:
        factory = factory_class()
        asset = create_asset_with_factory(
            asset_leaf_name,
            package_path,
            string_table_class,
            factory,
        )
    except Exception as exc:
        return {"success": False, "message": str(exc)}

    if not asset:
        return {
            "success": False,
            "message": "Failed to create string table '{0}'".format(asset_leaf_name),
        }

    asset_path = "{0}/{1}".format(package_path, asset_leaf_name)
    saved = save_loaded_editor_asset(asset)
    return {
        "success": True,
        "asset": _asset_summary(asset),
        "asset_path": asset_path,
        "saved": bool(saved),
    }


OPERATIONS = {
    "search_data_assets": search_data_assets,
    "create_data_asset": create_data_asset,
    "create_data_table": create_data_table,
    "create_string_table": create_string_table,
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
                    "message": "Unknown data tool operation: {0}".format(operation),
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
