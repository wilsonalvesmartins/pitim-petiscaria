import os
import sqlite3
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pitim_tv.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # ADS TABLE
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS ads (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            type TEXT NOT NULL, -- 'image' or 'video'
            filename TEXT NOT NULL,
            url TEXT NOT NULL,
            duration INTEGER DEFAULT 10,
            active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # YOUTUBE QUEUE TABLE
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

        # HISTORY TABLE
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

        # SETTINGS TABLE
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tv_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """)

        # Default settings
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

        # Default sample ad if empty
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

# Initialize on module load
init_db()

def get_ads(active_only: bool = False) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        if active_only:
            cursor.execute("SELECT * FROM ads WHERE active = 1 ORDER BY created_at ASC")
        else:
            cursor.execute("SELECT * FROM ads ORDER BY created_at ASC")
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
