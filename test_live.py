import requests
import json
import sys

base = "http://pitim.187.77.41.37.sslip.io"

try:
    print("1. Getting products from live menu...")
    res = requests.get(f"{base}/api/products").json()
    prods = res["products"]
    print(f"   [OK] Total products loaded: {len(prods)}")
    first_item = prods[0]
    print(f"   [OK] First product: {first_item['name']} - R$ {first_item['price']}")

    print("\n2. Placing customer order from Table 7...")
    order_payload = {
        "table_number": "7",
        "customer_name": "Wilson Teste",
        "notes": "Mesa próxima à janela",
        "items": [
            {"product_id": first_item["id"], "quantity": 2, "notes": "Porção caprichada"}
        ]
    }
    order_res = requests.post(f"{base}/api/orders", json=order_payload).json()
    print(f"   [OK] Order created: {order_res}")
    comanda_id = order_res["comanda_id"]

    print("\n3. Querying customer comanda (exact table + name match)...")
    comanda = requests.post(f"{base}/api/comanda/consultar", json={"table_number": "7", "customer_name": "Wilson Teste"}).json()
    print(f"   [OK] Comanda ID: {comanda['id']}, Mesa: {comanda['table_number']}, Cliente: {comanda['customer_name']}, Total: R$ {comanda['total']:.2f}, Status: {comanda['status']}")

    print("\n4. Testing 'Fechar comanda' CTA...")
    close_res = requests.post(f"{base}/api/comanda/fechar", json={"table_number": "7", "customer_name": "Wilson Teste"}).json()
    print(f"   [OK] Close request result: {close_res['message']}")

    print("\n5. Testing Master Admin Login (/acesso)...")
    login_res = requests.post(f"{base}/api/auth/login", json={"username": "admin", "password": "admin123"}).json()
    token = login_res.get("token")
    assert token, "Token not found"
    print(f"   [OK] Authenticated successfully! Token: {token[:25]}...")

    print("\n6. Checking Master Admin Active Tables & Alerts...")
    headers = {"Authorization": f"Bearer {token}"}
    admin_data = requests.get(f"{base}/api/admin/active-tables", headers=headers).json()
    tables = admin_data["tables"]
    stats = admin_data["stats"]
    print(f"   [OK] Stats: {stats['active_tables_count']} active tables, {stats['active_comandas_count']} comandas, {stats['closing_requested_count']} closing requests.")
    for t in tables:
        print(f"        -> Mesa {t['table_number']}: Total R$ {t['table_total']:.2f} | Closing requested: {t['has_closing_request']}")

    print("\n7. Settling Comanda as Paid (PIX)...")
    settle = requests.post(f"{base}/api/admin/comanda/{comanda_id}/status", json={"status": "paid", "payment_method": "PIX"}, headers=headers).json()
    print(f"   [OK] Settle result: Comanda {settle['comanda_id']} -> Status: {settle['status']}")

    print("\n=======================================================")
    print(">>> ALL LIVE TESTS COMPLETED AND PASSED WITH 100% SUCCESS! <<<")
    print("=======================================================")

except Exception as e:
    print(f"\n[FAIL] ERROR: {e}")
    sys.exit(1)
