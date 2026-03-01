from pydantic import BaseModel
from typing import Optional


class LocationInput(BaseModel):
    lat: float
    lng: float
    label: str


class RegisterBody(BaseModel):
    name: str
    email: str
    password: str
    approximate_location: LocationInput


class LoginBody(BaseModel):
    email: str
    password: str


class ConfirmListingBody(BaseModel):
    draft_id: str
    item_name: str
    description: str
    price: float
    location: LocationInput
    media_urls: list[str] = []


class HelperProfileBody(BaseModel):
    user_id: str
    location: LocationInput
    vehicle_type: str
    lift_capacity_kg: float
    default_quoted_fee: float = 0
    assistance_notes: Optional[str] = None


class ExpressInterestBody(BaseModel):
    helper_id: str
    product_id: str
    quoted_fee: float


class HelperAcceptBody(BaseModel):
    buyer_id: str
    helper_id: str
    product_id: str
    chat_id: Optional[str] = None  # If omitted, helper is stored and added when buyer-seller chat is created


class ChatInitiateBody(BaseModel):
    product_id: str
    buyer_id: str
    seller_id: str


class ChatParticipantsBody(BaseModel):
    user_id: str
    role: str  # helper | buyer | seller


class ChatMessageBody(BaseModel):
    sender_id: str
    content: str


class FinalizeIntentBody(BaseModel):
    chat_id: str
    product_id: str
    confirmed_by: str
    role: str  # buyer | seller
    amount: float


class PaymentHoldBody(BaseModel):
    buyer_id: str
    product_id: str
    chat_id: str
    amount: float


class PaymentReleaseBody(BaseModel):
    hold_id: str
    confirmed_by: str


class StatusBody(BaseModel):
    status: str  # sold
