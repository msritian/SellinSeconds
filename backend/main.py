import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.routers import user, auth, seller, products, helper, chat, payment

log = logging.getLogger(__name__)


class Log4xxMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        if 400 <= response.status_code < 600:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            log.warning("HTTP %s %s -> %s", response.status_code, request.url.path, body.decode("utf-8", errors="replace"))
            return Response(content=body, status_code=response.status_code, headers=dict(response.headers))
        return response


app = FastAPI(title="Campus Marketplace API", version="1.0")

app.add_middleware(Log4xxMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(user.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(seller.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(helper.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(payment.router, prefix="/api/v1")


@app.get("/")
def root():
    return {"message": "Campus Marketplace API", "docs": "/docs"}
