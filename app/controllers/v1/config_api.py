from typing import Any, Dict, List, Union

from fastapi import Request
from loguru import logger

from app.config import config
from app.controllers.v1.base import new_router
from app.models.exception import HttpException
from app.utils import utils


router = new_router()


# Whitelist for readable/writable fields
ALLOWED_FIELDS: Dict[str, List[str]] = {
    "app": [
        "llm_provider",
        "pexels_api_keys",
        "pixabay_api_keys",
        "subtitle_provider",
        "endpoint",
        "max_concurrent_tasks",
        # LLM providers - keys/base/model
        "pollinations_api_key",
        "pollinations_base_url",
        "pollinations_model_name",
        "ollama_base_url",
        "ollama_model_name",
        "openai_api_key",
        "openai_base_url",
        "openai_model_name",
        "moonshot_api_key",
        "moonshot_base_url",
        "moonshot_model_name",
        "oneapi_api_key",
        "oneapi_base_url",
        "oneapi_model_name",
        "g4f_model_name",
        "azure_api_key",
        "azure_base_url",
        "azure_model_name",
        "azure_api_version",
        "gemini_api_key",
        "gemini_model_name",
        "qwen_api_key",
        "qwen_model_name",
        "deepseek_api_key",
        "deepseek_base_url",
        "deepseek_model_name",
    ],
    "azure": [
        "speech_region",
        "speech_key",
    ],
    "siliconflow": [
        "api_key",
    ],
    "ui": [
        "language",
        "font_name",
        "text_fore_color",
        "font_size",
    ],
}


def _mask_secret(v: str) -> str:
    if not isinstance(v, str) or not v:
        return ""
    # Return a coarse mask without revealing length
    return "***"


def _normalize_list(v: Union[str, List[str], None]) -> List[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        # split by comma
        items = [x.strip() for x in v.split(",")]
        return [x for x in items if x]
    return []


def _get_config_snapshot() -> Dict[str, Any]:
    try:
        app_cfg = config.app or {}
        azure_cfg = config.azure or {}
        sf_cfg = config.siliconflow or {}
        ui_cfg = config.ui or {}

        app_data: Dict[str, Any] = {}
        for k in ALLOWED_FIELDS["app"]:
            if k in ["pexels_api_keys", "pixabay_api_keys"]:
                original = _normalize_list(app_cfg.get(k, []))
                app_data[k] = ["***" for _ in original]
            else:
                v = app_cfg.get(k)
                # mask secret-like keys
                if isinstance(k, str) and (k.endswith("_api_key") or k in {"azure_api_key"}):
                    app_data[k] = _mask_secret(str(v or ""))
                else:
                    app_data[k] = v

        data = {
            "app": app_data,
            "azure": {
                "speech_region": azure_cfg.get("speech_region", ""),
                # mask secrets in GET
                "speech_key": _mask_secret(azure_cfg.get("speech_key", "")),
            },
            "siliconflow": {
                "api_key": _mask_secret(sf_cfg.get("api_key", "")),
            },
            "ui": {
                k: ui_cfg.get(k)
                for k in ALLOWED_FIELDS["ui"]
            },
        }
        return data
    except Exception as e:
        logger.error(f"get config snapshot failed: {e}")
        # fall back to empty
        return {"app": {}, "azure": {}, "siliconflow": {}, "ui": {}}


@router.get("/config", summary="Get product-level configuration (whitelisted)")
def get_config(_: Request):
    data = _get_config_snapshot()
    return utils.get_response(200, data)


def _merge_dict(target: Dict[str, Any], updates: Dict[str, Any], allowed: List[str]):
    for k in allowed:
        if k not in updates:
            continue
        v = updates.get(k)
        # normalize list fields
        if k in ["pexels_api_keys", "pixabay_api_keys"]:
            target[k] = _normalize_list(v)
        else:
            target[k] = v


@router.put("/config", summary="Update configuration (merge + save)")
def update_config(request: Request, body: Dict[str, Any]):
    request_id = request.headers.get("X-Request-ID", "")
    try:
        # Merge by sections
        if not isinstance(body, dict):
            raise ValueError("invalid body: expect object")

        app_updates = body.get("app") or {}
        azure_updates = body.get("azure") or {}
        sf_updates = body.get("siliconflow") or {}
        ui_updates = body.get("ui") or {}

        if app_updates:
            if not isinstance(app_updates, dict):
                raise ValueError("app must be object")
            _merge_dict(config.app, app_updates, ALLOWED_FIELDS["app"])

        if azure_updates:
            if not isinstance(azure_updates, dict):
                raise ValueError("azure must be object")
            _merge_dict(config.azure, azure_updates, ALLOWED_FIELDS["azure"])

        if sf_updates:
            if not isinstance(sf_updates, dict):
                raise ValueError("siliconflow must be object")
            _merge_dict(config.siliconflow, sf_updates, ALLOWED_FIELDS["siliconflow"])

        if ui_updates:
            if not isinstance(ui_updates, dict):
                raise ValueError("ui must be object")
            _merge_dict(config.ui, ui_updates, ALLOWED_FIELDS["ui"])

        # persist
        config.save_config()

        data = _get_config_snapshot()
        return utils.get_response(200, data)
    except Exception as e:
        raise HttpException(task_id="", status_code=400, message=f"{request_id}: {str(e)}")
