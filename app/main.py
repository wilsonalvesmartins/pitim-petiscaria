import os
import io
import uuid
import shutil
import sqlite3
import re
import urllib.parse
from typing import List, Dict, Any, Optional
from datetime import datetime
import requests
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import qrcode

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(ROOT_DIR, "data"))
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads", "ads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pitim_tv.db")

# ========================================================
# DATABASE (SQLite with WAL mode)
# ========================================================
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ads (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            filename TEXT NOT NULL,
            url TEXT NOT NULL,
            duration INTEGER DEFAULT 10,
            active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS queue (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            thumbnail TEXT,
            url TEXT,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            thumbnail TEXT,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tv_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)
        default_settings = {
            "admin_user": "admin",
            "admin_pass": "admin123",
            "default_playlist_id": "PL4fGSIFgk8UkS8f_yO_e1Wj2iFvPZ6n8G",
            "default_photo_duration": "10",
            "qr_text": "Faça seu pedido:",
            "qr_url": "https://pitim.187.77.41.37.sslip.io",
            "ticker_text": "🔥 Bem-vindos ao Pitim Petiscaria & Espetos! | 🍢 Os melhores espetinhos e porções na brasa | 🍺 Chopp e cervejas artesanais | 📶 Wi-Fi: Pitim_Clientes | 📱 Peça pelo QR Code!"
        }
        for k, v in default_settings.items():
            cursor.execute("INSERT OR IGNORE INTO tv_settings (key, value) VALUES (?, ?)", (k, v))

        cursor.execute("SELECT COUNT(*) FROM ads")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
            INSERT INTO ads (id, title, type, filename, url, duration, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                "ad-default-1",
                "Destaque da Casa - Pitim",
                "image",
                "sample_ad.jpg",
                "/static/img/sample_ad.jpg",
                12,
                1
            ))
        conn.commit()

init_db()

def get_ads(active_only: bool = False) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM ads WHERE active = 1 ORDER BY created_at ASC" if active_only else "SELECT * FROM ads ORDER BY created_at ASC"
        cursor.execute(query)
        return [dict(r) for r in cursor.fetchall()]

def add_ad(title: str, ad_type: str, filename: str, url: str, duration: int = 10) -> Dict[str, Any]:
    ad_id = f"ad-{uuid.uuid4().hex[:8]}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO ads (id, title, type, filename, url, duration, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        """, (ad_id, title, ad_type, filename, url, duration))
        conn.commit()
        cursor.execute("SELECT * FROM ads WHERE id = ?", (ad_id,))
        return dict(cursor.fetchone())

def toggle_ad(ad_id: str, active: bool) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE ads SET active = ? WHERE id = ?", (1 if active else 0, ad_id))
        conn.commit()
        cursor.execute("SELECT * FROM ads WHERE id = ?", (ad_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_ad_duration(ad_id: str, duration: int) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE ads SET duration = ? WHERE id = ?", (duration, ad_id))
        conn.commit()
        cursor.execute("SELECT * FROM ads WHERE id = ?", (ad_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def delete_ad(ad_id: str) -> Optional[str]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM ads WHERE id = ?", (ad_id,))
        row = cursor.fetchone()
        filename = row[0] if row else None
        cursor.execute("DELETE FROM ads WHERE id = ?", (ad_id,))
        conn.commit()
        return filename

def get_queue() -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, video_id as videoId, title, author, thumbnail, url, added_at as addedAt FROM queue ORDER BY added_at ASC")
        return [dict(r) for r in cursor.fetchall()]

def add_to_queue(video_info: Dict[str, Any]) -> Dict[str, Any]:
    q_id = f"q-{uuid.uuid4().hex[:8]}"
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO queue (id, video_id, title, author, thumbnail, url)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            q_id,
            video_info.get("videoId"),
            video_info.get("title", ""),
            video_info.get("author", "YouTube"),
            video_info.get("thumbnail", ""),
            video_info.get("url", "")
        ))
        conn.commit()
        cursor.execute("SELECT id, video_id as videoId, title, author, thumbnail, url, added_at as addedAt FROM queue WHERE id = ?", (q_id,))
        return dict(cursor.fetchone())

def remove_from_queue(q_id: str) -> bool:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM queue WHERE id = ?", (q_id,))
        conn.commit()
        return cursor.rowcount > 0

def clear_queue():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM queue")
        conn.commit()

def pop_next_video() -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, video_id as videoId, title, author, thumbnail, url FROM queue ORDER BY added_at ASC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return None
        item = dict(row)
        cursor.execute("DELETE FROM queue WHERE id = ?", (item["id"],))
        cursor.execute("""
        INSERT INTO history (id, video_id, title, author, thumbnail)
        VALUES (?, ?, ?, ?, ?)
        """, (f"h-{uuid.uuid4().hex[:8]}", item["videoId"], item["title"], item.get("author", ""), item.get("thumbnail", "")))
        conn.commit()
        return item

def get_settings() -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM tv_settings")
        return {r["key"]: r["value"] for r in cursor.fetchall()}

def update_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.cursor()
        for k, v in updates.items():
            cursor.execute("INSERT OR REPLACE INTO tv_settings (key, value) VALUES (?, ?)", (k, str(v)))
        conn.commit()
    return get_settings()

# ========================================================
# YOUTUBE URL RESOLVER
# ========================================================
def extract_youtube_info(url_or_id: str) -> Dict[str, Any]:
    clean = url_or_id.strip()
    if re.match(r'^[a-zA-Z0-9_-]{11}$', clean):
        video_id = clean
    else:
        parsed = urllib.parse.urlparse(clean)
        video_id = None
        if "youtu.be" in parsed.netloc:
            video_id = parsed.path.lstrip("/").split("?")[0].split("&")[0]
        elif "youtube.com" in parsed.netloc:
            if "/shorts/" in parsed.path:
                video_id = parsed.path.split("/shorts/")[1].split("/")[0].split("?")[0]
            elif "/embed/" in parsed.path:
                video_id = parsed.path.split("/embed/")[1].split("/")[0].split("?")[0]
            else:
                qs = urllib.parse.parse_qs(parsed.query)
                if "v" in qs:
                    video_id = qs["v"][0]
                    
    if not video_id or len(video_id) != 11:
        raise ValueError(f"Link do YouTube inválido: '{url_or_id}'")

    title = f"Vídeo do YouTube ({video_id})"
    author = "YouTube"
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        resp = requests.get(oembed_url, timeout=4)
        if resp.status_code == 200:
            info = resp.json()
            title = info.get("title", title)
            author = info.get("author_name", author)
    except Exception:
        pass

    thumbnail = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
    return {
        "videoId": video_id,
        "title": title,
        "author": author,
        "thumbnail": thumbnail,
        "url": f"https://www.youtube.com/watch?v={video_id}"
    }

# ========================================================
# FASTAPI APP & WEBSOCKETS
# ========================================================
app = FastAPI(title="Pitim Petiscaria - TV & Remote Control")

SESSION_SECRET = os.environ.get("SESSION_SECRET", "pitim-secret-cajuru-cloud-2026")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, max_age=86400 * 30)

app.mount("/static", StaticFiles(directory=os.path.join(ROOT_DIR, "static")), name="static")
app.mount("/uploads", StaticFiles(directory=os.path.join(DATA_DIR, "uploads")), name="uploads")

templates = Jinja2Templates(directory=os.path.join(ROOT_DIR, "templates"))

current_playback = {
    "current_video": None,
    "isPlaying": True,
    "volume": 85
}

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for conn in list(self.active_connections):
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(conn)

manager = ConnectionManager()

def is_authenticated(request: Request) -> bool:
    return request.session.get("authenticated") is True

def require_auth(request: Request):
    if not is_authenticated(request):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autorizado")

# ========================================================
# HTML ROUTES
# ========================================================
@app.get("/", response_class=HTMLResponse)
async def tv_page(request: Request):
    settings = get_settings()
    ads = get_ads(active_only=True)
    return templates.TemplateResponse(
        request=request,
        name="tv.html",
        context={
            "settings": settings,
            "ads": ads,
            "current_video": current_playback["current_video"],
            "playback_state": current_playback
        }
    )

@app.get("/acesso", response_class=HTMLResponse)
async def admin_page(request: Request):
    authenticated = is_authenticated(request)
    settings = get_settings()
    ads = get_ads(active_only=False)
    queue = get_queue()
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={
            "authenticated": authenticated,
            "settings": settings,
            "ads": ads,
            "queue": queue,
            "current_video": current_playback["current_video"],
            "playback_state": current_playback
        }
    )

# ========================================================
# API ROUTES
# ========================================================
@app.post("/api/auth/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    
    settings = get_settings()
    valid_user = settings.get("admin_user", "admin")
    valid_pass = settings.get("admin_pass", "admin123")
    
    if username == valid_user and password == valid_pass:
        request.session["authenticated"] = True
        return {"success": True, "message": "Login realizado com sucesso"}
    return JSONResponse(status_code=400, content={"success": False, "message": "Usuário ou senha incorretos"})

@app.post("/api/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"success": True}

@app.get("/api/state")
async def get_state():
    return {
        "current_video": current_playback["current_video"],
        "playback_state": current_playback,
        "queue": get_queue(),
        "ads": get_ads(active_only=True),
        "settings": get_settings()
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({
        "type": "INIT_STATE",
        "data": {
            "current_video": current_playback["current_video"],
            "playback_state": current_playback,
            "queue": get_queue(),
            "ads": get_ads(active_only=True),
            "settings": get_settings()
        }
    })
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type")
            
            if event_type == "TV_VIDEO_ENDED":
                next_video = pop_next_video()
                current_playback["current_video"] = next_video
                await manager.broadcast({
                    "type": "PLAY_VIDEO",
                    "video": next_video
                })
                await manager.broadcast({
                    "type": "QUEUE_UPDATED",
                    "queue": get_queue(),
                    "current_video": next_video
                })
            elif event_type == "TV_NOW_PLAYING":
                video = data.get("video")
                if video:
                    current_playback["current_video"] = video
                    await manager.broadcast({
                        "type": "NOW_PLAYING_SYNC",
                        "video": video
                    })
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.post("/api/player/skip")
async def skip_video(request: Request):
    require_auth(request)
    next_video = pop_next_video()
    current_playback["current_video"] = next_video
    
    await manager.broadcast({
        "type": "SKIP_VIDEO",
        "next_video": next_video
    })
    await manager.broadcast({
        "type": "QUEUE_UPDATED",
        "queue": get_queue(),
        "current_video": next_video
    })
    return {"success": True, "next_video": next_video}

@app.post("/api/player/play-pause")
async def play_pause(request: Request):
    require_auth(request)
    body = await request.json()
    is_playing = body.get("isPlaying", True)
    current_playback["isPlaying"] = is_playing
    
    await manager.broadcast({
        "type": "PLAY_STATE",
        "isPlaying": is_playing
    })
    return {"success": True, "isPlaying": is_playing}

@app.post("/api/player/volume")
async def set_volume(request: Request):
    require_auth(request)
    body = await request.json()
    vol = max(0, min(100, int(body.get("volume", 85))))
    current_playback["volume"] = vol
    
    await manager.broadcast({
        "type": "SET_VOLUME",
        "volume": vol
    })
    return {"success": True, "volume": vol}

@app.post("/api/queue/add")
async def add_queue_item(request: Request):
    require_auth(request)
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL é obrigatória")

    try:
        info = extract_youtube_info(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    item = add_to_queue(info)
    
    if not current_playback["current_video"]:
        next_vid = pop_next_video()
        current_playback["current_video"] = next_vid
        await manager.broadcast({
            "type": "PLAY_VIDEO",
            "video": next_vid
        })

    await manager.broadcast({
        "type": "QUEUE_UPDATED",
        "queue": get_queue(),
        "current_video": current_playback["current_video"]
    })
    return {"success": True, "item": item, "queue": get_queue()}

@app.post("/api/queue/remove")
async def remove_queue_item(request: Request):
    require_auth(request)
    body = await request.json()
    item_id = body.get("id")
    removed = remove_from_queue(item_id)
    
    await manager.broadcast({
        "type": "QUEUE_UPDATED",
        "queue": get_queue(),
        "current_video": current_playback["current_video"]
    })
    return {"success": removed, "queue": get_queue()}

@app.post("/api/queue/clear")
async def clear_queue_items(request: Request):
    require_auth(request)
    clear_queue()
    await manager.broadcast({
        "type": "QUEUE_UPDATED",
        "queue": [],
        "current_video": current_playback["current_video"]
    })
    return {"success": True}

@app.post("/api/ads/upload")
async def upload_ad_file(
    request: Request,
    file: UploadFile = File(...),
    title: str = Form(""),
    duration: int = Form(10)
):
    require_auth(request)
    filename = file.filename or "ad"
    ext = os.path.splitext(filename)[1].lower()
    
    valid_img = [".png", ".jpg", ".jpeg", ".webp", ".gif"]
    valid_vid = [".mp4", ".webm", ".mov"]
    
    if ext in valid_img:
        ad_type = "image"
    elif ext in valid_vid:
        ad_type = "video"
    else:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use PNG, JPG, WEBP, MP4 ou WebM.")

    safe_filename = f"{uuid.uuid4().hex[:12]}{ext}"
    dest_path = os.path.join(UPLOADS_DIR, safe_filename)
    
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    ad_title = title.strip() or ("Vídeo Promocional" if ad_type == "video" else "Imagem Promocional")
    ad_duration = duration if ad_type == "image" else 0
    ad_url = f"/uploads/ads/{safe_filename}"
    
    created = add_ad(
        title=ad_title,
        ad_type=ad_type,
        filename=safe_filename,
        url=ad_url,
        duration=ad_duration
    )
    
    await manager.broadcast({
        "type": "ADS_UPDATED",
        "ads": get_ads(active_only=True)
    })
    return {"success": True, "ad": created}

@app.post("/api/ads/{ad_id}/toggle")
async def toggle_ad_status(ad_id: str, request: Request):
    require_auth(request)
    body = await request.json()
    active = body.get("active", True)
    updated = toggle_ad(ad_id, active)
    
    await manager.broadcast({
        "type": "ADS_UPDATED",
        "ads": get_ads(active_only=True)
    })
    return {"success": True, "ad": updated}

@app.post("/api/ads/{ad_id}/duration")
async def change_ad_duration(ad_id: str, request: Request):
    require_auth(request)
    body = await request.json()
    duration = max(3, int(body.get("duration", 10)))
    updated = update_ad_duration(ad_id, duration)
    
    await manager.broadcast({
        "type": "ADS_UPDATED",
        "ads": get_ads(active_only=True)
    })
    return {"success": True, "ad": updated}

@app.delete("/api/ads/{ad_id}")
async def remove_ad(ad_id: str, request: Request):
    require_auth(request)
    filename = delete_ad(ad_id)
    if filename:
        fpath = os.path.join(UPLOADS_DIR, filename)
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
            except Exception:
                pass
                
    await manager.broadcast({
        "type": "ADS_UPDATED",
        "ads": get_ads(active_only=True)
    })
    return {"success": True}

@app.post("/api/settings")
async def save_settings(request: Request):
    require_auth(request)
    body = await request.json()
    
    allowed = ["qr_text", "qr_url", "ticker_text", "default_playlist_id", "default_photo_duration"]
    updates = {k: v for k, v in body.items() if k in allowed}
    
    if "admin_pass" in body and body["admin_pass"].strip():
        updates["admin_pass"] = body["admin_pass"].strip()
        
    updated = update_settings(updates)
    
    await manager.broadcast({
        "type": "SETTINGS_UPDATED",
        "settings": updated
    })
    return {"success": True, "settings": updated}

@app.get("/api/qrcode")
async def generate_qrcode():
    settings = get_settings()
    url = settings.get("qr_url", "https://pitim.187.77.41.37.sslip.io")
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="#ff9800", back_color="#121316")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
