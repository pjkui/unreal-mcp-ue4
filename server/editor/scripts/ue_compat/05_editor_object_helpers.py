def touch_editor_object(target):
    if not target:
        return

    try:
        target.modify()
    except Exception:
        pass

    try:
        target.mark_package_dirty()
    except Exception:
        pass


def try_compile_blueprint(blueprint):
    try:
        if hasattr(unreal, "BlueprintEditorLibrary") and hasattr(
            unreal.BlueprintEditorLibrary, "compile_blueprint"
        ):
            unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
            return True
    except Exception:
        pass

    try:
        if hasattr(unreal, "KismetEditorUtilities") and hasattr(
            unreal.KismetEditorUtilities, "compile_blueprint"
        ):
            unreal.KismetEditorUtilities.compile_blueprint(blueprint)
            return True
    except Exception:
        pass

    return False
