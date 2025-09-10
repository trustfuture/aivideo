from typing import Any, Dict, List

from fastapi import Request
from loguru import logger

from app.config import config
from app.controllers.v1.base import new_router
from app.models.exception import HttpException
from app.utils import utils
from app.services import voice as voice_service


router = new_router()


@router.get("/voices", summary="List available TTS voices by server")
def list_voices(request: Request, server: str = "azure-tts-v1"):
    try:
        server = (server or "").strip().lower()
        voices: List[str] = []
        if server == "siliconflow":
            voices = voice_service.get_siliconflow_voices()
        else:
            all_voices = voice_service.get_all_azure_voices()
            if server == "azure-tts-v2":
                voices = [v for v in all_voices if "-V2" in v]
            else:
                voices = [v for v in all_voices if "-V2" not in v]
        return utils.get_response(200, {"voices": voices, "server": server})
    except Exception as e:
        raise HttpException(task_id="", status_code=400, message=str(e))


@router.post("/tts/test", summary="Synthesize a short test audio clip for preview")
def tts_test(request: Request, body: Dict[str, Any]):
    try:
        text = str(body.get("text") or "Hello, this is a test.")
        server = str(body.get("server") or "azure-tts-v1").strip().lower()
        voice_name = str(body.get("voice_name") or "").strip()
        voice_rate = float(body.get("voice_rate") or 1.0)
        voice_volume = float(body.get("voice_volume") or 1.0)

        if not voice_name:
            raise ValueError("missing voice_name")

        task_id = utils.get_uuid()
        task_dir = utils.task_dir(task_id)
        out_file = f"{task_dir}/tmp-tts.mp3"

        # trigger synthesis according to voice pattern (server param is mostly hint)
        _ = voice_service.tts(
            text=text,
            voice_name=voice_name,
            voice_rate=voice_rate,
            voice_file=out_file,
            voice_volume=voice_volume,
        )

        endpoint = config.app.get("endpoint", "") or str(request.base_url)
        endpoint = endpoint.rstrip("/")
        url = f"{endpoint}/tasks/{task_id}/tmp-tts.mp3"
        return utils.get_response(200, {"file": out_file, "url": url, "server": server})
    except Exception as e:
        logger.error(f"tts_test failed: {e}")
        raise HttpException(task_id="", status_code=400, message=str(e))

