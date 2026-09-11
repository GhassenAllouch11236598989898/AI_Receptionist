import pytest

from config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        business_timezone="Africa/Lagos",
        api_access_key=None,
        public_base_url="https://receptionist.example.com",
        openai_api_key="test-openai",
        deepgram_api_key="test-deepgram",
        elevenlabs_api_key="test-elevenlabs",
        elevenlabs_voice_id="voice123",
        supabase_url="https://test-project.supabase.co",
        supabase_service_role_key="test-server-key",
        twilio_auth_token="test-twilio",
        twilio_account_sid="AC" + "a" * 32,
    )
