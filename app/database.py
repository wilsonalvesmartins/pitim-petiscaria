import os
import sqlite3
from datetime import datetime, timedelta, timezone

DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pitim.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Products table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            description TEXT,
            image_url TEXT,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Comandas table (linked to table_number + customer_name)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS comandas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            status TEXT DEFAULT 'open', -- 'open', 'closing_requested', 'paid', 'closed'
            payment_method TEXT,        -- 'dinheiro', 'pix', 'cartao_credito', 'cartao_debito'
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            closed_at TEXT
        );
        """)

        # Orders table (each submission of the cart)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comanda_id INTEGER NOT NULL,
            status TEXT DEFAULT 'received', -- 'received', 'preparing', 'delivered', 'canceled'
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(comanda_id) REFERENCES comandas(id) ON DELETE CASCADE
        );
        """)

        # Order items table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            subtotal REAL NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'received',
            created_at TEXT NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
        """)

        # Admin notifications log table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'new_order', 'close_bill', 'waiter_call'
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            table_number TEXT NOT NULL,
            customer_name TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_comandas_table_customer ON comandas(table_number, customer_name);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_comandas_created_at ON comandas(created_at);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_comanda_id ON orders(comanda_id);")

        conn.commit()

def get_12h_cutoff():
    """Return ISO string for timestamp 12 hours ago (UTC)"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=12)
    return cutoff.isoformat()

def get_now_iso():
    return datetime.now(timezone.utc).isoformat()
