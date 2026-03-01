from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import user, auth, seller, products, helper, chat, payment

app = FastAPI(title="Campus Marketplace API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
