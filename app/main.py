import os
import shutil
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import json

from fastapi import (
    FastAPI, Request, HTTPException, Depends, status, 
    WebSocket, WebSocketDisconnect, UploadFile, File, Form
)
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import init_db, get_db, get_12h_cutoff, get_now_iso
from .seed_data import seed_database_if_empty
from .auth import (
    verify_credentials, create_admin_token, get_current_admin, 
    is_admin_logged_in, ADMIN_USER
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

app = FastAPI(title="Pitim Petiscaria - Menu Virtual & Comanda Digital")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# WebSocket Connection Manager for Master notifications
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        text = json.dumps(message)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(text)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

# Pydantic Models
class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    notes: Optional[str] = ""

class CreateOrderIn(BaseModel):
    table_number: str
    customer_name: str
    notes: Optional[str] = ""
    items: List[OrderItemIn]

class ConsultComandaIn(BaseModel):
    table_number: str
    customer_name: str

class CloseComandaIn(BaseModel):
    table_number: str
    customer_name: str
    comanda_id: Optional[int] = None

class LoginIn(BaseModel):
    username: str
    password: str

class ProductIn(BaseModel):
    name: str
    category: str
    price: float = Field(gt=0)
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    is_active: Optional[int] = 1
    sort_order: Optional[int] = 0

class QuickPriceIn(BaseModel):
    price: float = Field(gt=0)

class ComandaStatusIn(BaseModel):
    status: str
    payment_method: Optional[str] = None

class ItemStatusIn(BaseModel):
    status: str

# Startup Event
@app.on_event("startup")
def on_startup():
    init_db()
    seed_database_if_empty()

# -------------------------------------------------------------
# WebSocket for Master / Garçom real-time updates
# -------------------------------------------------------------
@app.websocket("/ws/admin")
async def websocket_admin_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# -------------------------------------------------------------
# Public API Endpoints (Customer / Cardápio)
# -------------------------------------------------------------
@app.get("/api/products")
def get_products():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, category, price, description, image_url, is_active, sort_order
            FROM products
            WHERE is_active = 1
            ORDER BY sort_order ASC, name ASC
        """)
        rows = cursor.fetchall()
        
        products = [dict(r) for r in rows]
        categories = {}
        for p in products:
            cat = p["category"]
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(p)
            
        return {
            "products": products,
            "categories": categories
        }

@app.post("/api/orders")
async def create_order(payload: CreateOrderIn):
    table_num = payload.table_number.strip()
    cust_name = payload.customer_name.strip()
    
    if not table_num:
        raise HTTPException(status_code=400, detail="Por favor, selecione ou informe o número da mesa.")
    if not cust_name:
        raise HTTPException(status_code=400, detail="Por favor, informe seu nome para identificar a comanda.")
    if not payload.items:
        raise HTTPException(status_code=400, detail="O carrinho está vazio.")

    cutoff = get_12h_cutoff()
    now_iso = get_now_iso()

    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. Check for active comanda in the last 12 hours for this Table + Customer
        cursor.execute("""
            SELECT id, status FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND LOWER(TRIM(customer_name)) = LOWER(?)
              AND created_at >= ?
              AND status IN ('open', 'closing_requested')
            ORDER BY id DESC LIMIT 1
        """, (table_num, cust_name, cutoff))
        
        comanda_row = cursor.fetchone()
        if comanda_row:
            comanda_id = comanda_row["id"]
            if comanda_row["status"] == "closing_requested":
                cursor.execute("UPDATE comandas SET status = 'open', updated_at = ? WHERE id = ?", (now_iso, comanda_id))
            else:
                cursor.execute("UPDATE comandas SET updated_at = ? WHERE id = ?", (now_iso, comanda_id))
        else:
            cursor.execute("""
                INSERT INTO comandas (table_number, customer_name, status, created_at, updated_at)
                VALUES (?, ?, 'open', ?, ?)
            """, (table_num, cust_name, now_iso, now_iso))
            comanda_id = cursor.lastrowid

        # 2. Create Order
        cursor.execute("""
            INSERT INTO orders (comanda_id, status, notes, created_at)
            VALUES (?, 'received', ?, ?)
        """, (comanda_id, payload.notes or "", now_iso))
        order_id = cursor.lastrowid

        # 3. Insert Items
        order_items_summary = []
        order_total = 0.0

        for item in payload.items:
            cursor.execute("SELECT name, price FROM products WHERE id = ?", (item.product_id,))
            prod = cursor.fetchone()
            if not prod:
                continue
            
            p_name = prod["name"]
            p_price = float(prod["price"])
            subtotal = round(p_price * item.quantity, 2)
            order_total += subtotal

            cursor.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, notes, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?)
            """, (order_id, item.product_id, p_name, item.quantity, p_price, subtotal, item.notes or "", now_iso))
            
            order_items_summary.append({
                "name": p_name,
                "quantity": item.quantity,
                "subtotal": subtotal,
                "notes": item.notes or ""
            })

        # 4. Insert notification
        cursor.execute("""
            INSERT INTO notifications (type, title, message, table_number, customer_name, created_at)
            VALUES ('new_order', ?, ?, ?, ?, ?)
        """, (
            f"Novo Pedido - {table_num}",
            f"{cust_name} pediu {len(order_items_summary)} itens (Total R$ {order_total:.2f})",
            table_num,
            cust_name,
            now_iso
        ))

        conn.commit()

    # 5. Notify Master Panel via WebSocket with sound alert flag!
    event_data = {
        "event": "new_order",
        "sound": True,
        "table_number": table_num,
        "customer_name": cust_name,
        "comanda_id": comanda_id,
        "order_id": order_id,
        "items": order_items_summary,
        "total": order_total,
        "timestamp": now_iso
    }
    await manager.broadcast(event_data)

    return {
        "success": True,
        "message": "Pedido enviado para a cozinha com sucesso!",
        "order_id": order_id,
        "comanda_id": comanda_id,
        "table_number": table_num,
        "customer_name": cust_name
    }

@app.post("/api/comanda/consultar")
def consult_comanda(payload: ConsultComandaIn):
    table_num = payload.table_number.strip()
    cust_name = payload.customer_name.strip()
    
    if not table_num or not cust_name:
        raise HTTPException(status_code=400, detail="Mesa e Nome são obrigatórios.")

    cutoff = get_12h_cutoff()

    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, table_number, customer_name, status, payment_method, created_at, updated_at, closed_at
            FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND LOWER(TRIM(customer_name)) = LOWER(?)
              AND created_at >= ?
            ORDER BY id DESC LIMIT 1
        """, (table_num, cust_name, cutoff))
        
        comanda = cursor.fetchone()
        if not comanda:
            return {
                "exists": False,
                "table_number": table_num,
                "customer_name": cust_name,
                "items": [],
                "orders": [],
                "total": 0.0,
                "status": "none"
            }

        comanda_dict = dict(comanda)
        comanda_id = comanda_dict["id"]

        cursor.execute("""
            SELECT o.id as order_id, o.status as order_status, o.created_at as order_time, o.notes as order_notes,
                   oi.id as item_id, oi.product_name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes as item_notes, oi.status as item_status
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.comanda_id = ?
            ORDER BY o.id DESC, oi.id ASC
        """, (comanda_id,))
        
        rows = cursor.fetchall()
        
        orders_map = {}
        items_list = []
        total_amount = 0.0

        for r in rows:
            oid = r["order_id"]
            if oid not in orders_map:
                orders_map[oid] = {
                    "order_id": oid,
                    "status": r["order_status"],
                    "created_at": r["order_time"],
                    "notes": r["order_notes"],
                    "items": []
                }
            
            item_data = {
                "item_id": r["item_id"],
                "product_name": r["product_name"],
                "quantity": r["quantity"],
                "unit_price": r["unit_price"],
                "subtotal": r["subtotal"],
                "notes": r["item_notes"],
                "status": r["item_status"]
            }
            orders_map[oid]["items"].append(item_data)
            items_list.append(item_data)
            total_amount += float(r["subtotal"])

        comanda_dict["exists"] = True
        comanda_dict["total"] = round(total_amount, 2)
        comanda_dict["orders"] = list(orders_map.values())
        comanda_dict["items"] = items_list

        return comanda_dict

@app.post("/api/comanda/fechar")
async def request_close_comanda(payload: CloseComandaIn):
    table_num = payload.table_number.strip()
    cust_name = payload.customer_name.strip()
    
    cutoff = get_12h_cutoff()
    now_iso = get_now_iso()

    with get_db() as conn:
        cursor = conn.cursor()
        
        if payload.comanda_id:
            cursor.execute("SELECT id, status FROM comandas WHERE id = ?", (payload.comanda_id,))
        else:
            cursor.execute("""
                SELECT id, status FROM comandas
                WHERE LOWER(TRIM(table_number)) = LOWER(?)
                  AND LOWER(TRIM(customer_name)) = LOWER(?)
                  AND created_at >= ?
                  AND status IN ('open', 'closing_requested')
                ORDER BY id DESC LIMIT 1
            """, (table_num, cust_name, cutoff))
            
        comanda = cursor.fetchone()
        if not comanda:
            raise HTTPException(status_code=404, detail="Comanda ativa não encontrada para esta mesa e nome.")

        comanda_id = comanda["id"]
        cursor.execute("UPDATE comandas SET status = 'closing_requested', updated_at = ? WHERE id = ?", (now_iso, comanda_id))

        cursor.execute("""
            SELECT SUM(oi.subtotal) as total
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.comanda_id = ?
        """, (comanda_id,))
        total_row = cursor.fetchone()
        total_comanda = total_row["total"] or 0.0

        cursor.execute("""
            INSERT INTO notifications (type, title, message, table_number, customer_name, created_at)
            VALUES ('close_bill', ?, ?, ?, ?, ?)
        """, (
            f"FECHAR COMANDA - {table_num}",
            f"{cust_name} solicitou o fechamento da conta (Total R$ {total_comanda:.2f}). O garçom deve se dirigir à mesa.",
            table_num,
            cust_name,
            now_iso
        ))

        conn.commit()

    await manager.broadcast({
        "event": "close_bill",
        "sound": True,
        "priority": "HIGH",
        "table_number": table_num,
        "customer_name": cust_name,
        "comanda_id": comanda_id,
        "total": total_comanda,
        "timestamp": now_iso
    })

    return {
        "success": True,
        "message": "Solicitação recebida! O garçom está a caminho para receber o pagamento.",
        "comanda_id": comanda_id,
        "table_number": table_num,
        "customer_name": cust_name
    }

# -------------------------------------------------------------
# Admin Master Authentication
# -------------------------------------------------------------
@app.post("/api/auth/login")
def admin_login(payload: LoginIn):
    if verify_credentials(payload.username, payload.password):
        token = create_admin_token()
        response = JSONResponse(content={"success": True, "token": token, "username": payload.username})
        response.set_cookie(
            key="pitim_admin_token",
            value=token,
            max_age=86400 * 7,
            httponly=True,
            samesite="lax",
            secure=False
        )
        return response
    raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")

@app.post("/api/auth/logout")
def admin_logout():
    response = JSONResponse(content={"success": True})
    response.delete_cookie("pitim_admin_token")
    return response

# -------------------------------------------------------------
# Admin Master API Endpoints (Protected by get_current_admin)
# -------------------------------------------------------------
@app.get("/api/admin/active-tables")
def get_active_tables(is_admin: bool = Depends(get_current_admin)):
    cutoff = get_12h_cutoff()
    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.id, c.table_number, c.customer_name, c.status, c.payment_method, c.created_at, c.updated_at, c.closed_at,
                   COALESCE(SUM(oi.subtotal), 0) as total_amount,
                   COUNT(DISTINCT o.id) as orders_count,
                   COUNT(oi.id) as items_count
            FROM comandas c
            LEFT JOIN orders o ON o.comanda_id = c.id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE c.created_at >= ? AND c.status IN ('open', 'closing_requested')
            GROUP BY c.id
            ORDER BY c.table_number ASC, c.id DESC
        """, (cutoff,))
        
        comandas = [dict(r) for r in cursor.fetchall()]

        tables = {}
        closing_requested_count = 0
        total_active_money = 0.0

        for c in comandas:
            t_num = c["table_number"]
            if t_num not in tables:
                tables[t_num] = {
                    "table_number": t_num,
                    "comandas": [],
                    "table_total": 0.0,
                    "has_closing_request": False,
                    "latest_update": c["updated_at"]
                }
            
            tables[t_num]["comandas"].append(c)
            tables[t_num]["table_total"] += float(c["total_amount"])
            total_active_money += float(c["total_amount"])
            
            if c["status"] == "closing_requested":
                tables[t_num]["has_closing_request"] = True
                closing_requested_count += 1

        cursor.execute("""
            SELECT id, type, title, message, table_number, customer_name, is_read, created_at
            FROM notifications
            WHERE created_at >= ?
            ORDER BY id DESC LIMIT 30
        """, (cutoff,))
        recent_notifications = [dict(r) for r in cursor.fetchall()]

        return {
            "tables": list(tables.values()),
            "stats": {
                "active_tables_count": len(tables),
                "active_comandas_count": len(comandas),
                "closing_requested_count": closing_requested_count,
                "total_active_money": round(total_active_money, 2)
            },
            "notifications": recent_notifications
        }

@app.get("/api/admin/comanda/{comanda_id}")
def get_comanda_detail(comanda_id: int, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM comandas WHERE id = ?", (comanda_id,))
        c = cursor.fetchone()
        if not c:
            raise HTTPException(status_code=404, detail="Comanda não encontrada.")
            
        comanda_dict = dict(c)

        cursor.execute("""
            SELECT o.id as order_id, o.status as order_status, o.created_at as order_time, o.notes as order_notes,
                   oi.id as item_id, oi.product_id, oi.product_name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes as item_notes, oi.status as item_status
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.comanda_id = ?
            ORDER BY o.id ASC, oi.id ASC
        """, (comanda_id,))
        
        rows = cursor.fetchall()
        orders = {}
        total = 0.0
        for r in rows:
            oid = r["order_id"]
            if oid not in orders:
                orders[oid] = {
                    "order_id": oid,
                    "status": r["order_status"],
                    "created_at": r["order_time"],
                    "notes": r["order_notes"],
                    "items": []
                }
            item = {
                "item_id": r["item_id"],
                "product_id": r["product_id"],
                "product_name": r["product_name"],
                "quantity": r["quantity"],
                "unit_price": r["unit_price"],
                "subtotal": r["subtotal"],
                "notes": r["item_notes"],
                "status": r["item_status"]
            }
            orders[oid]["items"].append(item)
            total += float(r["subtotal"])

        comanda_dict["total"] = round(total, 2)
        comanda_dict["orders"] = list(orders.values())
        return comanda_dict

@app.post("/api/admin/manual-order")
async def add_manual_order(payload: CreateOrderIn, is_admin: bool = Depends(get_current_admin)):
    table_num = payload.table_number.strip()
    cust_name = payload.customer_name.strip()
    
    if not table_num or not cust_name:
        raise HTTPException(status_code=400, detail="Mesa e Nome são obrigatórios.")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Selecione ao menos um item.")

    cutoff = get_12h_cutoff()
    now_iso = get_now_iso()

    with get_db() as conn:
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND LOWER(TRIM(customer_name)) = LOWER(?)
              AND created_at >= ?
              AND status IN ('open', 'closing_requested')
            ORDER BY id DESC LIMIT 1
        """, (table_num, cust_name, cutoff))
        
        comanda_row = cursor.fetchone()
        if comanda_row:
            comanda_id = comanda_row["id"]
            cursor.execute("UPDATE comandas SET updated_at = ? WHERE id = ?", (now_iso, comanda_id))
        else:
            cursor.execute("""
                INSERT INTO comandas (table_number, customer_name, status, created_at, updated_at)
                VALUES (?, ?, 'open', ?, ?)
            """, (table_num, cust_name, now_iso, now_iso))
            comanda_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO orders (comanda_id, status, notes, created_at)
            VALUES (?, 'received', ?, ?)
        """, (comanda_id, f"Lançado pelo Garçom/Master. {payload.notes or ''}", now_iso))
        order_id = cursor.lastrowid

        order_items_summary = []
        order_total = 0.0

        for item in payload.items:
            cursor.execute("SELECT name, price FROM products WHERE id = ?", (item.product_id,))
            prod = cursor.fetchone()
            if not prod:
                continue
            
            p_name = prod["name"]
            p_price = float(prod["price"])
            subtotal = round(p_price * item.quantity, 2)
            order_total += subtotal

            cursor.execute("""
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, notes, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?)
            """, (order_id, item.product_id, p_name, item.quantity, p_price, subtotal, item.notes or "", now_iso))
            
            order_items_summary.append({
                "name": p_name,
                "quantity": item.quantity,
                "subtotal": subtotal
            })

        conn.commit()

    await manager.broadcast({
        "event": "manual_order_added",
        "sound": False,
        "table_number": table_num,
        "customer_name": cust_name,
        "comanda_id": comanda_id,
        "order_id": order_id,
        "total": order_total
    })

    return {"success": True, "comanda_id": comanda_id, "order_id": order_id}

@app.post("/api/admin/comanda/{comanda_id}/status")
async def update_comanda_status(comanda_id: int, payload: ComandaStatusIn, is_admin: bool = Depends(get_current_admin)):
    now_iso = get_now_iso()
    new_status = payload.status
    
    with get_db() as conn:
        cursor = conn.cursor()
        closed_at = now_iso if new_status in ('paid', 'closed') else None
        
        cursor.execute("""
            UPDATE comandas
            SET status = ?, payment_method = COALESCE(?, payment_method), updated_at = ?, closed_at = ?
            WHERE id = ?
        """, (new_status, payload.payment_method, now_iso, closed_at, comanda_id))
        
        conn.commit()

    await manager.broadcast({
        "event": "comanda_status_changed",
        "comanda_id": comanda_id,
        "status": new_status,
        "payment_method": payload.payment_method
    })

    return {"success": True, "comanda_id": comanda_id, "status": new_status}

@app.post("/api/admin/order-item/{item_id}/status")
async def update_item_status(item_id: int, payload: ItemStatusIn, is_admin: bool = Depends(get_current_admin)):
    new_status = payload.status
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE order_items SET status = ? WHERE id = ?", (new_status, item_id))
        conn.commit()

    await manager.broadcast({
        "event": "item_status_changed",
        "item_id": item_id,
        "status": new_status
    })

    return {"success": True, "item_id": item_id, "status": new_status}

# -------------------------------------------------------------
# Admin Products CRUD & Management
# -------------------------------------------------------------
@app.get("/api/admin/products")
def admin_get_all_products(is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, category, price, description, image_url, is_active, sort_order, created_at
            FROM products
            ORDER BY category ASC, sort_order ASC, name ASC
        """)
        return [dict(r) for r in cursor.fetchall()]

@app.post("/api/admin/products")
def admin_create_product(payload: ProductIn, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO products (name, category, price, description, image_url, is_active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (payload.name, payload.category, payload.price, payload.description or "", payload.image_url or "", payload.is_active, payload.sort_order))
        conn.commit()
        new_id = cursor.lastrowid
        return {"success": True, "id": new_id}

@app.put("/api/admin/products/{product_id}")
def admin_update_product(product_id: int, payload: ProductIn, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE products
            SET name = ?, category = ?, price = ?, description = ?, image_url = ?, is_active = ?, sort_order = ?
            WHERE id = ?
        """, (payload.name, payload.category, payload.price, payload.description or "", payload.image_url or "", payload.is_active, payload.sort_order, product_id))
        conn.commit()
        return {"success": True, "id": product_id}

@app.post("/api/admin/products/{product_id}/quick-price")
def admin_quick_price(product_id: int, payload: QuickPriceIn, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE products SET price = ? WHERE id = ?", (payload.price, product_id))
        conn.commit()
        return {"success": True, "id": product_id, "price": payload.price}

@app.post("/api/admin/products/{product_id}/toggle")
def admin_toggle_product(product_id: int, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE products SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?", (product_id,))
        cursor.execute("SELECT is_active FROM products WHERE id = ?", (product_id,))
        new_status = cursor.fetchone()[0]
        conn.commit()
        return {"success": True, "id": product_id, "is_active": new_status}

@app.delete("/api/admin/products/{product_id}")
def admin_delete_product(product_id: int, is_admin: bool = Depends(get_current_admin)):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        return {"success": True, "id": product_id}

@app.post("/api/admin/upload-image")
async def upload_image(file: UploadFile = File(...), is_admin: bool = Depends(get_current_admin)):
    clean_filename = f"{int(datetime.now().timestamp())}_{file.filename.replace(' ', '_')}"
    target_path = os.path.join(UPLOADS_DIR, clean_filename)
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"success": True, "url": f"/static/uploads/{clean_filename}"}

@app.get("/api/admin/reports")
def get_reports(is_admin: bool = Depends(get_current_admin)):
    cutoff = get_12h_cutoff()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.id, c.table_number, c.customer_name, c.payment_method, c.closed_at,
                   COALESCE(SUM(oi.subtotal), 0) as total
            FROM comandas c
            JOIN orders o ON o.comanda_id = c.id
            JOIN order_items oi ON oi.order_id = o.id
            WHERE c.created_at >= ? AND c.status = 'paid'
            GROUP BY c.id
            ORDER BY c.closed_at DESC
        """, (cutoff,))
        paid_comandas = [dict(r) for r in cursor.fetchall()]

        total_revenue = sum(r["total"] for r in paid_comandas)

        methods = {}
        for c in paid_comandas:
            m = c["payment_method"] or "Outro"
            methods[m] = round(methods.get(m, 0.0) + float(c["total"]), 2)

        cursor.execute("""
            SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.subtotal) as total_sales
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN comandas c ON o.comanda_id = c.id
            WHERE c.created_at >= ?
            GROUP BY oi.product_name
            ORDER BY total_qty DESC LIMIT 10
        """, (cutoff,))
        top_items = [dict(r) for r in cursor.fetchall()]

        return {
            "total_revenue": round(total_revenue, 2),
            "paid_comandas_count": len(paid_comandas),
            "payment_methods": methods,
            "top_items": top_items,
            "recent_paid": paid_comandas[:15]
        }

# -------------------------------------------------------------
# HTML Views
# -------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def index_page():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Pitim Petiscaria - Menu Virtual</h1>")

@app.get("/acesso", response_class=HTMLResponse)
def admin_page(request: Request):
    admin_file = os.path.join(STATIC_DIR, "acesso.html")
    if os.path.exists(admin_file):
        with open(admin_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Acesso Master</h1>")

@app.get("/cardapio", response_class=HTMLResponse)
def cardapio_alias():
    return RedirectResponse(url="/")
