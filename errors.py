"""Safe errors that can cross the HTTP/LLM boundary without leaking provider secrets."""


class ServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def as_dict(self) -> dict[str, str]:
        return {"status": "error", "code": self.code, "message": self.message}
