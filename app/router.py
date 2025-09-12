"""Application configuration - root APIRouter.

Defines all FastAPI application endpoints.

Resources:
    1. https://fastapi.tiangolo.com/tutorial/bigger-applications

"""

from fastapi import APIRouter

from app.controllers.v1 import llm, video, material
from app.controllers.v1 import subtitles_api
from app.controllers.v1 import config_api
from app.controllers.v1 import voice as voice_api
from app.controllers.v1 import fonts as fonts_api

root_api_router = APIRouter()
# v1
root_api_router.include_router(video.router)
root_api_router.include_router(llm.router)
root_api_router.include_router(material.router)
root_api_router.include_router(config_api.router)
root_api_router.include_router(voice_api.router)
root_api_router.include_router(fonts_api.router)
root_api_router.include_router(subtitles_api.router)
