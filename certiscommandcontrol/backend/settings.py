from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    WORKSPACE: str = "."
    UPLOAD_DIR: str = "./uploads"
    MODEL_DIR: str = "./models"

    X3D_CHECKPOINT: str
    X3D_MODEL_NAME: str = "x3d_s"
    CLIP_LEN: int = 48
    SIZE: int = 224
    TOPK: int = 5

    
    THREAT_THRESHOLD: float = 0.45

    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    INCIDENT_FRAMES_BUCKET: str = "incident-frames"

    SEA_LION_API_KEY: str
    SEA_LION_MODEL: str = "aisingapore/Gemma-SEA-LION-v4-27B-IT"

    CORS_ORIGINS: str = "http://localhost:5173"

    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    def threat_classes_set(self) -> set[str]:
        return {c.strip().lower() for c in self.THREAT_CLASSES.split(",") if c.strip()}
