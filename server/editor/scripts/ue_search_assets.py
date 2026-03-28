from typing import Any, Dict, Optional
import json


def search_assets(
    search_term: str, asset_class: Optional[str] = None
) -> Dict[str, Any]:
    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    all_assets = asset_registry.get_all_assets()

    matching_assets = []
    search_term_lower = search_term.lower()
    asset_class_filter = asset_class.strip().lower() if asset_class else None

    for asset in all_assets:
        asset_name = str(asset.asset_name)
        package_path = str(asset.package_path)
        asset_class_name = get_asset_class_name(asset)

        name_match = search_term_lower in asset_name.lower()
        path_match = search_term_lower in package_path.lower()

        class_match = True
        if asset_class_filter:
            class_match = asset_class_filter in asset_class_name.lower()

        if name_match or path_match:
            if class_match:
                matching_assets.append(
                    {
                        "name": asset_name,
                        "path": package_path,
                        "object_path": get_asset_object_path(asset),
                        "class": asset_class_name,
                        "package_name": get_asset_package_name(asset),
                    }
                )

    def relevance_score(asset_info):
        name_exact = search_term_lower == asset_info["name"].lower()
        name_starts = asset_info["name"].lower().startswith(search_term_lower)
        return (name_exact * 3) + (name_starts * 2) + 1

    matching_assets.sort(key=relevance_score, reverse=True)

    return {
        "search_term": search_term,
        "asset_class_filter": asset_class_filter,
        "total_matches": len(matching_assets),
        "assets": matching_assets[:50],
    }


def main():
    result = search_assets("${search_term}", "${asset_class}")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
