import os
from .database import get_db

INITIAL_PRODUCTS = [
    # 1. Porções & Petiscos
    {
        "name": "Porção de Batata Frita Simples",
        "category": "Porções & Petiscos",
        "price": 25.00,
        "description": "Batata frita crocante, sequinha e dourada, servida com molho especial.",
        "image_url": "/static/uploads/batata_simples.png",
        "is_active": 1,
        "sort_order": 1
    },
    {
        "name": "Porção de Batata Frita com Mussarela",
        "category": "Porções & Petiscos",
        "price": 30.00,
        "description": "Batata frita coberta com generosa camada de mussarela derretida e orégano.",
        "image_url": "/static/uploads/batata_mussarela.png",
        "is_active": 1,
        "sort_order": 2
    },
    {
        "name": "Porção de Frango a Passarinho",
        "category": "Porções & Petiscos",
        "price": 35.00,
        "description": "Pedaços crocantes de frango frito temperado, alho dourado e fatias de limão.",
        "image_url": "/static/uploads/frango_passarinho.png",
        "is_active": 1,
        "sort_order": 3
    },
    {
        "name": "Porção de Filé de Tilápia",
        "category": "Porções & Petiscos",
        "price": 45.00,
        "description": "Iscas de filé de tilápia empanadas e super crocantes, com molho tártaro artesanal e limão.",
        "image_url": "/static/uploads/file_tilapia.png",
        "is_active": 1,
        "sort_order": 4
    },
    {
        "name": "Porção de Tábua de Frios",
        "category": "Porções & Petiscos",
        "price": 35.00,
        "description": "Seleção especial de queijos em cubos, salame fatiado, azeitonas selecionadas e presunto.",
        "image_url": "/static/uploads/tabua_frios.png",
        "is_active": 1,
        "sort_order": 5
    },
    {
        "name": "Porção de Torresmo com Mandioca Frita",
        "category": "Porções & Petiscos",
        "price": 50.00,
        "description": "Torresmo pururuca crocante acompanhado de mandioca macia e dourada.",
        "image_url": "/static/uploads/torresmo_mandioca.png",
        "is_active": 1,
        "sort_order": 6
    },

    # 2. Bolinhos Especiais
    {
        "name": "Bolinha de Mandioca com Carne Seca",
        "category": "Bolinhos Especiais",
        "price": 35.00,
        "description": "Massa artesanal de mandioca bem macia recheada com carne seca desfiada e temperada.",
        "image_url": "/static/uploads/bolinho_mandioca.png",
        "is_active": 1,
        "sort_order": 10
    },
    {
        "name": "Bolinho de Cabotiá com Carne Seca",
        "category": "Bolinhos Especiais",
        "price": 35.00,
        "description": "Massa aveludada de abóbora cabotiá recheada com carne seca de primeira.",
        "image_url": "/static/uploads/bolinho_cabotia.png",
        "is_active": 1,
        "sort_order": 11
    },
    {
        "name": "Bolinho de Costela",
        "category": "Bolinhos Especiais",
        "price": 35.00,
        "description": "Massa crocante com recheio suculento de costela bovina desfiada cozida lentamente.",
        "image_url": "/static/uploads/bolinho_costela.png",
        "is_active": 1,
        "sort_order": 12
    },

    # 3. Espetos na Brasa (Todos R$ 10,00)
    {
        "name": "Espeto de Carne",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Corte nobre bovino grelhado na brasa no ponto ideal.",
        "image_url": "/static/uploads/espeto_carne.png",
        "is_active": 1,
        "sort_order": 20
    },
    {
        "name": "Espeto de Linguiça",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Linguiça artesanal suculenta e assada lentamente na brasa.",
        "image_url": "/static/uploads/espeto_linguica.png",
        "is_active": 1,
        "sort_order": 21
    },
    {
        "name": "Espeto de Queijo Coalho",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Queijo coalho tostadinho por fora e derretido por dentro.",
        "image_url": "/static/uploads/espeto_queijo.png",
        "is_active": 1,
        "sort_order": 22
    },
    {
        "name": "Espeto Medalhão de Frango",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Cubos macios de peito de frango envolvidos em fatia de bacon crocante.",
        "image_url": "/static/uploads/espeto_frango.png",
        "is_active": 1,
        "sort_order": 23
    },
    {
        "name": "Espeto Medalhão de Queijo",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Cubos de queijo especial envolvidos com bacon dourado.",
        "image_url": "/static/uploads/espeto_med_queijo.png",
        "is_active": 1,
        "sort_order": 24
    },
    {
        "name": "Espeto Medalhão Romeu e Julieta",
        "category": "Espetos na Brasa",
        "price": 10.00,
        "description": "Irresistível combinação de queijo, goiabada cascão e bacon na brasa.",
        "image_url": "/static/uploads/espeto_romeu_julieta.png",
        "is_active": 1,
        "sort_order": 25
    },

    # 4. Cervejas Geladas
    {
        "name": "Heineken Long Neck 330ml",
        "category": "Cervejas Geladas",
        "price": 12.00,
        "description": "Puro malte premium holandesa, servida estupidamente gelada.",
        "image_url": "/static/uploads/cerveja_heineken.png",
        "is_active": 1,
        "sort_order": 30
    },
    {
        "name": "Corona Extra Long Neck 330ml",
        "category": "Cervejas Geladas",
        "price": 12.00,
        "description": "Cerveja leve e refrescante, servida com fatia de limão.",
        "image_url": "/static/uploads/cerveja_corona.png",
        "is_active": 1,
        "sort_order": 31
    },
    {
        "name": "Brahma Duplo Malte 600ml",
        "category": "Cervejas Geladas",
        "price": 14.00,
        "description": "Cerveja com dois maltes especiais, sabor marcante e cremoso.",
        "image_url": "/static/uploads/cerveja_brahma.png",
        "is_active": 1,
        "sort_order": 32
    },
    {
        "name": "Original 600ml",
        "category": "Cervejas Geladas",
        "price": 15.00,
        "description": "Clássica de boteco, sabor equilibrado e muito refrescante.",
        "image_url": "/static/uploads/cerveja_original.png",
        "is_active": 1,
        "sort_order": 33
    },
    {
        "name": "Amstel Lager 600ml",
        "category": "Cervejas Geladas",
        "price": 13.00,
        "description": "Cerveja puro malte europeia, suave e refrescante.",
        "image_url": "/static/uploads/cerveja_amstel.png",
        "is_active": 1,
        "sort_order": 34
    },
    {
        "name": "Skol Pilsen 600ml",
        "category": "Cervejas Geladas",
        "price": 12.00,
        "description": "A que desce redondo, servida na temperatura perfeita.",
        "image_url": "/static/uploads/cerveja_skol.png",
        "is_active": 1,
        "sort_order": 35
    },

    # 5. Refrigerantes & Bebidas
    {
        "name": "Coca-Cola Original 350ml Lata",
        "category": "Refrigerantes & Bebidas",
        "price": 6.00,
        "description": "Refrigerante Coca-Cola em lata 350ml, bem gelada.",
        "image_url": "/static/uploads/coca_cola.png",
        "is_active": 1,
        "sort_order": 40
    },
    {
        "name": "Coca-Cola Sem Açúcar 350ml Lata",
        "category": "Refrigerantes & Bebidas",
        "price": 6.00,
        "description": "Refrigerante Coca-Cola Zero açúcar em lata 350ml.",
        "image_url": "/static/uploads/coca_zero.png",
        "is_active": 1,
        "sort_order": 41
    },
    {
        "name": "Guaraná Antarctica 350ml Lata",
        "category": "Refrigerantes & Bebidas",
        "price": 6.00,
        "description": "Refrigerante Guaraná Antarctica em lata 350ml.",
        "image_url": "/static/uploads/guarana.png",
        "is_active": 1,
        "sort_order": 42
    },
    {
        "name": "Fanta Laranja 350ml Lata",
        "category": "Refrigerantes & Bebidas",
        "price": 6.00,
        "description": "Refrigerante Fanta sabor laranja lata 350ml.",
        "image_url": "/static/uploads/fanta.png",
        "is_active": 1,
        "sort_order": 43
    },
    {
        "name": "Água Mineral sem Gás 500ml",
        "category": "Refrigerantes & Bebidas",
        "price": 4.00,
        "description": "Garrafa de água mineral natural 500ml.",
        "image_url": "/static/uploads/agua_sem_gas.png",
        "is_active": 1,
        "sort_order": 44
    },
    {
        "name": "Água Mineral com Gás 500ml",
        "category": "Refrigerantes & Bebidas",
        "price": 5.00,
        "description": "Garrafa de água mineral gaseificada 500ml.",
        "image_url": "/static/uploads/agua_com_gas.png",
        "is_active": 1,
        "sort_order": 45
    },
    {
        "name": "Suco Natural Del Valle / Polpa 300ml",
        "category": "Refrigerantes & Bebidas",
        "price": 8.00,
        "description": "Copo de 300ml geladinho (Laranja, Maracujá ou Uva).",
        "image_url": "/static/uploads/suco.png",
        "is_active": 1,
        "sort_order": 46
    },
    {
        "name": "Red Bull Energy Drink 250ml",
        "category": "Refrigerantes & Bebidas",
        "price": 16.00,
        "description": "Lata de energético Red Bull 250ml gelada.",
        "image_url": "/static/uploads/redbull.png",
        "is_active": 1,
        "sort_order": 47
    }
]

def seed_database_if_empty():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM products")
        count = cursor.fetchone()[0]
        if count == 0:
            for p in INITIAL_PRODUCTS:
                cursor.execute("""
                INSERT INTO products (name, category, price, description, image_url, is_active, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (p["name"], p["category"], p["price"], p["description"], p["image_url"], p["is_active"], p["sort_order"]))
            conn.commit()
            print(f"Banco populado com {len(INITIAL_PRODUCTS)} produtos iniciais!")

    generate_drink_badges_if_missing()

def generate_drink_badges_if_missing():
    try:
        from PIL import Image, ImageDraw, ImageFont
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        uploads_dir = os.path.join(base_dir, "static", "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        drinks = {
            "cerveja_heineken.png": ("#006400", "#ffffff", "HEINEKEN", "Cerveja 330ml"),
            "cerveja_corona.png": ("#1c355e", "#f3b733", "CORONA", "Extra 330ml"),
            "cerveja_brahma.png": ("#b22222", "#ffffff", "BRAHMA", "Duplo Malte 600ml"),
            "cerveja_original.png": ("#f1c40f", "#2c3e50", "ORIGINAL", "Antarctica 600ml"),
            "cerveja_amstel.png": ("#c0392b", "#ffffff", "AMSTEL", "Puro Malte 600ml"),
            "cerveja_skol.png": ("#f39c12", "#ffffff", "SKOL", "Pilsen 600ml"),
            "coca_cola.png": ("#c00000", "#ffffff", "COCA-COLA", "Original 350ml"),
            "coca_zero.png": ("#1a1a1a", "#e74c3c", "COCA ZERO", "Sem Açúcar 350ml"),
            "guarana.png": ("#27ae60", "#ffffff", "GUARANÁ", "Antarctica 350ml"),
            "fanta.png": ("#e67e22", "#ffffff", "FANTA", "Laranja 350ml"),
            "agua_sem_gas.png": ("#2980b9", "#ffffff", "ÁGUA", "Natural 500ml"),
            "agua_com_gas.png": ("#16a085", "#ffffff", "ÁGUA C/ GÁS", "Gaseificada 500ml"),
            "suco.png": ("#d35400", "#ffffff", "SUCO NATURAL", "Gelado 300ml"),
            "redbull.png": ("#2c3e50", "#3498db", "RED BULL", "Energy 250ml"),
        }
        font = ImageFont.load_default()
        for filename, (bg_color, fg_color, title, subtitle) in drinks.items():
            filepath = os.path.join(uploads_dir, filename)
            if not os.path.exists(filepath):
                img = Image.new("RGBA", (140, 140), bg_color)
                draw = ImageDraw.Draw(img)
                draw.rectangle([3, 3, 136, 136], outline=(255, 255, 255, 120), width=2)
                draw.text((70, 60), title, fill=fg_color, anchor="mm", font=font)
                draw.text((70, 80), subtitle, fill=(240, 240, 240, 220), anchor="mm", font=font)
                img.save(filepath, format="WEBP", quality=75)
    except Exception as e:
        pass
