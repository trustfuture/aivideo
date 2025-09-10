import os
from fastapi import Request

from app.controllers.v1.base import new_router
from app.utils import utils

router = new_router()


@router.get("/fonts", summary="List available fonts from resource/fonts")
def list_fonts(_: Request):
    font_dir = utils.font_dir()
    try:
        files = []
        for name in sorted(os.listdir(font_dir)):
            if name.startswith('.'):
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in [".ttf", ".ttc", ".otf"]:
                files.append(name)
        return utils.get_response(200, {"files": files})
    except Exception:
        # graceful fallback
        return utils.get_response(200, {"files": []})

