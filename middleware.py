"""Reject oversized request bodies before JSON parsing or multipart disk spooling."""

from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestSizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_upload_bytes: int) -> None:
        self.app = app
        self.max_upload_bytes = max_upload_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # Leave room for multipart framing; the endpoint also caps the file's exact size.
        limit = self.max_upload_bytes + 65536 if scope["path"] == "/voice/stt-test" else 131072
        content_length = Headers(scope=scope).get("content-length")
        if content_length:
            try:
                declared = int(content_length)
            except ValueError:
                await JSONResponse({"detail": "Invalid Content-Length."}, 400)(scope, receive, send)
                return
            if declared > limit:
                await JSONResponse({"detail": "Request body too large."}, 413)(scope, receive, send)
                return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(413, "Request body too large.")
            return message

        await self.app(scope, limited_receive, send)
