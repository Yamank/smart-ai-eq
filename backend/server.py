from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated, Any
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os
import re
import json
import uuid
import logging
import hashlib
import asyncio

import bcrypt
import httpx
import jwt
from jwt import PyJWKClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone  # noqa: E402
from catalog_seed import CATALOG  # noqa: E402
import audio_dsp  # noqa: E402

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
APPLE_AUDIENCES = [a.strip() for a in os.environ["APPLE_AUDIENCES"].split(",") if a.strip()]
SEED_VERSION = 3

app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger("smart-eq")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


def now():
    return datetime.now(timezone.utc)


# ---------------- Mongo base models ----------------
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc):
        return cls.model_validate(doc) if doc else None

    def to_mongo(self):
        d = self.model_dump(by_alias=True)
        if d.get("_id") is None:
            d.pop("_id", None)
        else:
            d["_id"] = ObjectId(d["_id"])
        return d


class Manufacturer(BaseDocument):
    name: str
    created_at: str = Field(default_factory=lambda: now().isoformat())


class HeadphoneModel(BaseDocument):
    manufacturer: str
    name: str
    year: Optional[int] = None
    type: Optional[str] = None
    firmware: List[str] = []
    created_at: str = Field(default_factory=lambda: now().isoformat())


class Feedback(BaseDocument):
    kind: str
    manufacturer: str = ""
    model: str = ""
    firmware: str = ""
    notes: str = ""
    user_email: str = ""
    status: str = "open"
    created_at: str = Field(default_factory=lambda: now().isoformat())


class Band(BaseModel):
    freq: float
    gain: float
    q: float
    reason: str = ""


class EqProfile(BaseDocument):
    user_id: str
    name: str
    manufacturer: str
    model: str
    firmware: str
    band_count: int
    bands: List[Band]
    song: dict = {}
    analysis: dict = {}
    created_at: str = Field(default_factory=lambda: now().isoformat())


# ---------------- Auth ----------------
def public_user(u):
    return {"user_id": u["user_id"], "email": u.get("email", ""), "name": u.get("name", ""),
            "picture": u.get("picture", ""), "role": u.get("role", "user")}


async def upsert_user(email: str, name: str = "", picture: str = "", extra: Optional[dict] = None):
    email = (email or "").lower()
    q = {"email": email} if email else {"apple_sub": (extra or {}).get("apple_sub")}
    existing = await db.users.find_one(q, {"_id": 0})
    role = "admin" if email == ADMIN_EMAIL else (existing or {}).get("role", "user")
    if existing:
        upd = {"role": role, **(extra or {})}
        if name:
            upd["name"] = name
        if picture:
            upd["picture"] = picture
        await db.users.update_one({"user_id": existing["user_id"]}, {"$set": upd})
        existing.update(upd)
        return existing
    user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "name": name, "picture": picture,
            "role": role, "created_at": now().isoformat(), **(extra or {})}
    await db.users.insert_one(dict(user))
    return user


async def create_session(user):
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await db.user_sessions.insert_one({"session_token": token, "user_id": user["user_id"],
                                       "expires_at": now() + timedelta(days=30), "created_at": now()})
    return {"session_token": token, "user": public_user(user)}


async def current_user(request: Request, required=True):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        if required:
            raise HTTPException(401, "Not authenticated")
        return None
    s = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not s:
        raise HTTPException(401, "Invalid session")
    exp = s["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        raise HTTPException(401, "Session expired")
    u = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User not found")
    return u


async def admin_user(request: Request):
    u = await current_user(request)
    if u.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return u


class SessionIn(BaseModel):
    session_id: str


class AppleIn(BaseModel):
    identity_token: str
    full_name: str = ""
    email: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


_apple_jwks = PyJWKClient("https://appleid.apple.com/auth/keys")


@api.post("/auth/session")
async def auth_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                        headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    d = r.json()
    user = await upsert_user(d["email"], d.get("name", ""), d.get("picture", ""), {"provider": "google"})
    return await create_session(user)


@api.post("/auth/apple")
async def auth_apple(body: AppleIn):
    try:
        key = await asyncio.to_thread(_apple_jwks.get_signing_key_from_jwt, body.identity_token)
        claims = jwt.decode(body.identity_token, key.key, algorithms=["RS256"], audience=APPLE_AUDIENCES,
                            issuer="https://appleid.apple.com")
    except Exception as e:
        logger.warning("Apple token rejected: %s", e)
        raise HTTPException(401, "Invalid Apple identity token")
    sub = claims["sub"]
    email = claims.get("email") or body.email
    if not email:
        existing = await db.users.find_one({"apple_sub": sub}, {"_id": 0})
        email = (existing or {}).get("email", "")
    user = await upsert_user(email, body.full_name, "", {"apple_sub": sub, "provider": "apple"})
    return await create_session(user)


@api.post("/auth/login")
async def auth_login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower().strip()}, {"_id": 0})
    if not u or not u.get("password_hash") or not bcrypt.checkpw(body.password.encode(), u["password_hash"].encode()):
        raise HTTPException(401, "Invalid email or password")
    return await create_session(u)


@api.get("/auth/me")
async def auth_me(request: Request):
    return public_user(await current_user(request))


@api.post("/auth/logout")
async def auth_logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth[7:]})
    return {"ok": True}


# ---------------- Catalog ----------------
async def catalog_payload():
    mans = [Manufacturer.from_mongo(d) for d in await db.manufacturers.find().to_list(5000)]
    models = [HeadphoneModel.from_mongo(d) for d in await db.headphones.find().to_list(20000)]
    by = {m.name: [] for m in mans}
    for m in models:
        by.setdefault(m.manufacturer, []).append(
            {"id": m.id, "name": m.name, "year": m.year, "type": m.type, "firmware": m.firmware})
    meta = await db.meta.find_one({"key": "catalog"}, {"_id": 0}) or {}
    out = []
    for name in sorted(by, key=str.lower):
        ms = sorted(by[name], key=lambda x: (-(x["year"] or 0), x["name"].lower()))
        out.append({"name": name, "models": ms})
    return {"updated_at": meta.get("updated_at", ""), "manufacturers": out}


async def touch_catalog():
    await db.meta.update_one({"key": "catalog"}, {"$set": {"updated_at": now().isoformat()}}, upsert=True)


@api.get("/catalog")
async def get_catalog():
    return await catalog_payload()


class CatalogUpsert(BaseModel):
    manufacturer: str
    model: str = ""
    year: Optional[int] = None
    type: str = ""
    firmware: List[str] = []


@api.post("/admin/catalog")
async def admin_upsert_catalog(body: CatalogUpsert, request: Request):
    await admin_user(request)
    man = body.manufacturer.strip()
    if not man:
        raise HTTPException(400, "Manufacturer required")
    existing_man = await db.manufacturers.find_one({"name": {"$regex": f"^{re.escape(man)}$", "$options": "i"}})
    if existing_man:
        man = existing_man["name"]
    else:
        await db.manufacturers.insert_one(Manufacturer(name=man).to_mongo())
    result = {"manufacturer": man, "model": None, "added_firmware": []}
    if body.model.strip():
        name = body.model.strip()
        fw_new = [f.strip() for f in body.firmware if f.strip()]
        doc = await db.headphones.find_one({"manufacturer": man, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if doc:
            hm = HeadphoneModel.from_mongo(doc)
            added = [f for f in fw_new if f not in hm.firmware]
            hm.firmware = added + [f for f in hm.firmware if f not in added]
            if body.year:
                hm.year = body.year
            if body.type:
                hm.type = body.type
            await db.headphones.replace_one({"_id": ObjectId(hm.id)}, hm.to_mongo())
            result.update(model=hm.name, added_firmware=added)
        else:
            hm = HeadphoneModel(manufacturer=man, name=name, year=body.year, type=body.type or None,
                                firmware=fw_new or ["Unknown"])
            await db.headphones.insert_one(hm.to_mongo())
            result.update(model=name, added_firmware=hm.firmware)
    await touch_catalog()
    return result


@api.delete("/admin/catalog/models/{model_id}")
async def admin_delete_model(model_id: str, request: Request):
    await admin_user(request)
    await db.headphones.delete_one({"_id": ObjectId(model_id)})
    await touch_catalog()
    return {"ok": True}


# ---------------- Feedback ----------------
class FeedbackIn(BaseModel):
    kind: str
    manufacturer: str = ""
    model: str = ""
    firmware: str = ""
    notes: str = ""


@api.post("/feedback")
async def create_feedback(body: FeedbackIn, request: Request):
    u = await current_user(request)
    fb = Feedback(**body.model_dump(), user_email=u.get("email", ""))
    res = await db.feedback.insert_one(fb.to_mongo())
    fb.id = str(res.inserted_id)
    return fb.model_dump()


@api.get("/admin/feedback")
async def list_feedback(request: Request):
    await admin_user(request)
    docs = await db.feedback.find().sort("created_at", -1).to_list(500)
    return [Feedback.from_mongo(d).model_dump() for d in docs]


class FeedbackStatus(BaseModel):
    status: str


@api.patch("/admin/feedback/{fid}")
async def update_feedback(fid: str, body: FeedbackStatus, request: Request):
    await admin_user(request)
    await db.feedback.update_one({"_id": ObjectId(fid)}, {"$set": {"status": body.status}})
    return {"ok": True}


# ---------------- Settings ----------------
AVAILABLE_MODELS = [
    {"provider": "openai", "model": "gpt-5.6-terra", "label": "GPT 5.6 Terra"},
    {"provider": "openai", "model": "gpt-5.5", "label": "GPT 5.5"},
    {"provider": "anthropic", "model": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5"},
    {"provider": "gemini", "model": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro"},
    {"provider": "gemini", "model": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
]
DEFAULT_SETTINGS = {"allow_user_keys": False, "default_provider": "openai", "default_model": "gpt-5.6-terra"}


async def get_settings_doc():
    d = await db.settings.find_one({"key": "app"}, {"_id": 0, "key": 0}) or {}
    return {**DEFAULT_SETTINGS, **d, "available_models": AVAILABLE_MODELS}


@api.get("/settings")
async def get_settings():
    return await get_settings_doc()


class SettingsIn(BaseModel):
    allow_user_keys: bool
    default_provider: str
    default_model: str


@api.put("/admin/settings")
async def put_settings(body: SettingsIn, request: Request):
    await admin_user(request)
    if not any(m["provider"] == body.default_provider and m["model"] == body.default_model for m in AVAILABLE_MODELS):
        raise HTTPException(400, "Unknown model")
    await db.settings.update_one({"key": "app"}, {"$set": body.model_dump()}, upsert=True)
    return await get_settings_doc()


# ---------------- EQ AI ----------------
LIMITS = {
    8: [(20, 99), (100, 199), (200, 399), (400, 999), (1000, 2999), (3000, 5999), (6000, 11999), (12000, 20000)],
    10: [(20, 49), (50, 99), (100, 199), (200, 399), (400, 799), (800, 1599), (1600, 3199), (3200, 6399),
         (6400, 12799), (12800, 20000)],
}


def clamp_bands(raw: List[Any], count: int):
    lim = LIMITS[count]
    out = []
    for i, (lo, hi) in enumerate(lim):
        b = raw[i] if i < len(raw) and isinstance(raw[i], dict) else {}
        try:
            f = float(b.get("freq", (lo * hi) ** 0.5))
        except (TypeError, ValueError):
            f = (lo * hi) ** 0.5
        try:
            g = float(b.get("gain", 0))
        except (TypeError, ValueError):
            g = 0.0
        try:
            q = float(b.get("q", 1.0))
        except (TypeError, ValueError):
            q = 1.0
        out.append({
            "freq": int(round(min(max(f, lo), hi))),
            "gain": round(min(max(g, -8), 8) * 2) / 2,
            "q": round(min(max(q, 0.1), 10) * 10) / 10,
            "reason": str(b.get("reason", ""))[:200],
        })
    return out


SYSTEM_PROMPT = """You are a world-class audio mastering engineer and headphone acoustics expert.
You know published frequency-response measurements (Harman target, AutoEQ/oratory1990/RTINGS/Crinacle style data),
manufacturer firmware/DSP change logs, music metadata (genre, BPM, key, loudness/dynamic range, spectral balance),
and psychoacoustics (equal-loudness contours, masking, sibilance, listening fatigue).
Given a song and a headphone + firmware, recommend a parametric EQ (peaking filters) that compensates the headphone's
deviations from target as tuned by that firmware AND flatters the song's genre and spectral profile.
STRICT RULES:
- Exactly N bands, band i frequency MUST stay inside the given range for band i.
- gain in dB, multiple of 0.5, between -8 and +8.
- Q between 0.1 and 10, multiple of 0.1.
- Be tasteful: avoid stacking boosts; prefer cuts for resonances.
Respond ONLY with minified JSON, no markdown, matching:
{"song":{"title":"","artist":"","genre":"","bpm":0,"key":"","dynamic_range":"","spectral_profile":"","characteristics":""},
"headphone":{"sound_signature":"","firmware_notes":"","known_issues":""},
"bands":[{"freq":0,"gain":0,"q":0,"reason":""}],
"preamp":0,"summary":""}"""


class RecommendIn(BaseModel):
    manufacturer: str
    model: str
    firmware: str = "Latest"
    band_count: int = 8
    song_title: str = ""
    artist: str = ""
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None


def parse_json(text: str):
    t = text.strip()
    t = re.sub(r"^```(?:json)?|```$", "", t, flags=re.M).strip()
    s, e = t.find("{"), t.rfind("}")
    return json.loads(t[s:e + 1])


@api.post("/eq/recommend")
async def recommend(body: RecommendIn, request: Request):
    await current_user(request)
    count = body.band_count if body.band_count in (8, 10) else 8
    firmware = body.firmware or "Latest"
    if firmware.lower() == "latest":
        hm = await db.headphones.find_one({"manufacturer": body.manufacturer, "name": body.model})
        if hm and hm.get("firmware"):
            firmware = hm["firmware"][0]
    settings = await get_settings_doc()
    provider, model_name, key = settings["default_provider"], settings["default_model"], EMERGENT_LLM_KEY
    if settings["allow_user_keys"] and body.api_key and body.provider and body.model_name:
        provider, model_name, key = body.provider, body.model_name, body.api_key

    cache_key = hashlib.sha1(json.dumps([body.song_title.lower().strip(), body.artist.lower().strip(),
                                         body.manufacturer, body.model, firmware, count, provider, model_name]).encode()).hexdigest()
    cached = await db.eq_cache.find_one({"key": cache_key}, {"_id": 0})
    if cached and cached.get("created_at", "") > (now() - timedelta(days=14)).isoformat():
        return {**cached["result"], "cached": True}

    ranges = "\n".join(f"Band {i + 1}: {lo}-{hi} Hz" for i, (lo, hi) in enumerate(LIMITS[count]))
    song_line = (f'Song: "{body.song_title}" by {body.artist or "unknown artist"}' if body.song_title
                 else "Song: none detected - produce a general-purpose EQ for this headphone (balanced for mixed genres).")
    prompt = (f"{song_line}\nHeadphone: {body.manufacturer} {body.model}\nFirmware: {firmware}\n"
              f"N = {count} bands with ranges:\n{ranges}\nReturn the JSON now.")
    chat = LlmChat(api_key=key, session_id=f"eq-{uuid.uuid4().hex[:8]}", system_message=SYSTEM_PROMPT).with_model(provider, model_name)
    text = ""
    try:
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
        data = parse_json(text)
    except Exception as e:
        logger.exception("AI EQ failed")
        raise HTTPException(502, f"AI recommendation failed: {str(e)[:160]}")
    result = {
        "bands": clamp_bands(data.get("bands", []), count),
        "band_count": count,
        "firmware": firmware,
        "song": data.get("song", {}),
        "headphone": data.get("headphone", {}),
        "preamp": max(-12, min(0, float(data.get("preamp", 0) or 0))),
        "summary": str(data.get("summary", "")),
        "ai_model": model_name,
    }
    await db.eq_cache.update_one({"key": cache_key}, {"$set": {"key": cache_key, "result": result,
                                                               "created_at": now().isoformat()}}, upsert=True)
    return {**result, "cached": False}


@api.get("/eq/preview")
async def eq_preview(p: str = ""):
    if not re.fullmatch(r"[0-9.:,\-]*", p) or len(p) > 400:
        raise HTTPException(400, "Bad spec")
    try:
        data = await asyncio.to_thread(audio_dsp.render, p)
    except ValueError:
        raise HTTPException(400, "Bad spec")
    return Response(content=data, media_type="audio/wav", headers={"Cache-Control": "public, max-age=86400"})


class ProfileIn(BaseModel):
    name: str
    manufacturer: str
    model: str
    firmware: str
    band_count: int
    bands: List[Band]
    song: dict = {}
    analysis: dict = {}


@api.post("/eq/profiles")
async def save_profile(body: ProfileIn, request: Request):
    u = await current_user(request)
    prof = EqProfile(user_id=u["user_id"], **body.model_dump())
    res = await db.eq_profiles.insert_one(prof.to_mongo())
    prof.id = str(res.inserted_id)
    return prof.model_dump()


@api.get("/eq/profiles")
async def list_profiles(request: Request):
    u = await current_user(request)
    docs = await db.eq_profiles.find({"user_id": u["user_id"]}).sort("created_at", -1).to_list(200)
    return [EqProfile.from_mongo(d).model_dump() for d in docs]


@api.delete("/eq/profiles/{pid}")
async def delete_profile(pid: str, request: Request):
    u = await current_user(request)
    await db.eq_profiles.delete_one({"_id": ObjectId(pid), "user_id": u["user_id"]})
    return {"ok": True}


@api.get("/")
async def root():
    return {"message": "Smart AI EQ API"}


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email")
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.headphones.create_index([("manufacturer", 1), ("name", 1)])
    await db.eq_cache.create_index("key", unique=True)
    # admin seed (idempotent; updates hash if password changed)
    admin = await db.users.find_one({"email": ADMIN_EMAIL})
    if not admin or not admin.get("password_hash") or not bcrypt.checkpw(ADMIN_PASSWORD.encode(), admin["password_hash"].encode()):
        h = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode()
        if admin:
            await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"password_hash": h, "role": "admin"}})
        else:
            await db.users.insert_one({"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": ADMIN_EMAIL, "name": "Admin",
                                       "picture": "", "role": "admin", "password_hash": h, "created_at": now().isoformat()})
    # catalog seed (only inserts missing items; never overwrites admin edits)
    meta = await db.meta.find_one({"key": "seed"})
    if not meta or meta.get("version", 0) < SEED_VERSION:
        for man, models in CATALOG.items():
            await db.manufacturers.update_one({"name": man}, {"$setOnInsert": Manufacturer(name=man).to_mongo()}, upsert=True)
            for name, year, typ, fw in models:
                hm = HeadphoneModel(manufacturer=man, name=name, year=year, type=typ, firmware=fw)
                await db.headphones.update_one({"manufacturer": man, "name": name}, {"$setOnInsert": hm.to_mongo()}, upsert=True)
        await db.meta.update_one({"key": "seed"}, {"$set": {"version": SEED_VERSION}}, upsert=True)
        await touch_catalog()
    asyncio.get_running_loop().run_in_executor(None, audio_dsp.render, "")


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
