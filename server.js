const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Public static assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use('/img', express.static(path.join(publicDir, 'img')));
app.use('/static/uploads', express.static(path.join(publicDir, 'img')));

// Ensure data directory exists
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pitim_delivery.sqlite');
const db = new sqlite3.Database(dbPath);

// SQLite Promise wrappers
const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

// Database Initialization & Seeding
async function initDB() {
    await run("PRAGMA journal_mode = WAL;");

    // 1. Tabela de Itens do Cardápio (Compartilhado entre Mesa e Delivery)
    await run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        image_url TEXT,
        active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Tabela de Clientes para Autocomplete no Delivery
    await run(`CREATE TABLE IF NOT EXISTS users (
        whatsapp TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        neighborhood TEXT,
        number TEXT,
        complement TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. Tabela de Comandas Presenciais por Mesa
    await run(`CREATE TABLE IF NOT EXISTS comandas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        payment_method TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME
    )`);

    // 4. Tabela Unificada de Pedidos (Delivery e Mesas)
    await run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_source TEXT DEFAULT 'delivery',
        comanda_id INTEGER,
        table_number TEXT,
        customer_whatsapp TEXT,
        customer_name TEXT NOT NULL,
        customer_address TEXT,
        customer_neighborhood TEXT,
        customer_number TEXT,
        customer_complement TEXT,
        type TEXT NOT NULL,
        payment_method TEXT,
        change_for REAL,
        items_json TEXT NOT NULL,
        notes TEXT,
        subtotal REAL NOT NULL,
        delivery_fee REAL DEFAULT 0,
        total REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migração segura caso a tabela orders já existisse sem as colunas de mesa
    try {
        const orderCols = await all("PRAGMA table_info(orders);");
        const colNames = orderCols.map(c => c.name);
        if (!colNames.includes('order_source')) {
            await run("ALTER TABLE orders ADD COLUMN order_source TEXT DEFAULT 'delivery';");
        }
        if (!colNames.includes('comanda_id')) {
            await run("ALTER TABLE orders ADD COLUMN comanda_id INTEGER;");
        }
        if (!colNames.includes('table_number')) {
            await run("ALTER TABLE orders ADD COLUMN table_number TEXT;");
        }
    } catch (e) {
        console.error("Erro na verificação de colunas de orders:", e.message);
    }

    // 5. Tabela de Itens Individuais dos Pedidos (para rastreio em preparo / entregue)
    await run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'received',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    )`);

    // 6. Tabela de Chamados de Garçom e Fechamento de Mesa
    await run(`CREATE TABLE IF NOT EXISTS table_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number TEXT NOT NULL,
        customer_name TEXT,
        call_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        total REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        attended_at DATETIME
    )`);

    // 7. Tabela de Configurações
    await run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Settings defaults
    const defaultSettings = [
        ['is_open', '1'],
        ['delivery_fee', '8.00'],
        ['delivery_time', '40 a 50 minutos'],
        ['store_address', 'Rua Central, Pitim Petiscaria & Espetos'],
        ['store_phone', '(16) 99999-9999'],
        ['pix_key', '16999999999'],
        ['pix_name', 'Pitim Petiscaria e Espetos'],
        ['direct_http_enabled', '1'],
        ['direct_http_url', 'https://chatwoot.cajuru.cloud/api/v1/widget/messages'],
        ['direct_http_method', 'POST'],
        ['direct_http_headers', '{"Content-Type": "application/json"}'],
        ['admin_user', 'admin'],
        ['admin_pass', 'admin123']
    ];

    for (const [k, v] of defaultSettings) {
        const row = await get(`SELECT key FROM settings WHERE key = ?`, [k]);
        if (!row) {
            await run(`INSERT INTO settings (key, value) VALUES (?, ?)`, [k, v]);
        }
    }

    // Seed Items if empty
    const hasItems = await get(`SELECT id FROM items LIMIT 1`);
    if (!hasItems) {
        const initialMenu = [
            // 1. Espetos na Brasa (Todos R$ 10,00)
            ['Espetos na Brasa', 'Espeto de Carne', 10.00, 'Carne bovina selecionada, macia e assada no ponto perfeito na brasa.', '/img/espetos_grelhados.jpg', 1],
            ['Espetos na Brasa', 'Espeto de Linguiça', 10.00, 'Linguiça toscana artesanal saborosa e bem tostadinha na brasa.', '/img/espetos_grelhados.jpg', 2],
            ['Espetos na Brasa', 'Espeto de Queijo', 10.00, 'Queijo coalho no espeto grelhado na brasa com casquinha crocante e dourada.', '/img/espetos_grelhados.jpg', 3],
            ['Espetos na Brasa', 'Medalhão de Frango', 10.00, 'Cubos suculentos de peito de frango envolvidos em tiras crocantes de bacon defumado.', '/img/espetos_grelhados.jpg', 4],
            ['Espetos na Brasa', 'Medalhão de Queijo', 10.00, 'Cubos generosos de queijo selecionado envoltos em bacon crocante.', '/img/espetos_grelhados.jpg', 5],
            ['Espetos na Brasa', 'Medalhão de Romeu e Julieta', 10.00, 'Clássica combinação gourmet de queijo macio com goiabada cascão na brasa.', '/img/espetos_grelhados.jpg', 6],

            // 2. Porções & Petiscos
            ['Porções & Petiscos', 'Porção de Batata Frita Simples', 25.00, 'Batata frita crocante, sequinha e dourada, servida com molho especial.', '/img/batata_simples.jpg', 10],
            ['Porções & Petiscos', 'Porção de Batata Frita com Mussarela', 30.00, 'Batata frita coberta com generosa camada de mussarela derretida e orégano.', '/img/batata_mussarela.jpg', 11],
            ['Porções & Petiscos', 'Porção de Frango a Passarinho', 35.00, 'Pedaços crocantes de frango frito temperado, alho dourado e fatias de limão fresco.', '/img/frango_passarinho.jpg', 12],
            ['Porções & Petiscos', 'Porção de Filé de Tilápia', 45.00, 'Iscas de filé de tilápia empanadas e super crocantes, com molho tártaro artesanal e limão.', '/img/file_tilapia.jpg', 13],
            ['Porções & Petiscos', 'Porção de Tábua de Frios', 35.00, 'Seleção especial de queijos em cubos, salame fatiado, azeitonas selecionadas e presunto.', '/img/tabua_frios.jpg', 14],
            ['Porções & Petiscos', 'Porção de Torresmo com Mandioca Frita', 50.00, 'Torresmo pururuca super crocante acompanhado de mandioca macia, frita e dourada.', '/img/torresmo_mandioca.jpg', 15],

            // 3. Bolinhos Especiais
            ['Bolinhos Especiais', 'Bolinha de Mandioca com Carne Seca', 35.00, 'Massa artesanal de mandioca bem aveludada recheada com carne seca desfiada e temperada.', '/img/bolinho_mandioca.jpg', 20],
            ['Bolinhos Especiais', 'Bolinho de Cabotiá com Carne Seca', 35.00, 'Massa especial de abóbora cabotiá recheada com suculenta carne seca acebolada.', '/img/bolinho_cabotia.jpg', 21],
            ['Bolinhos Especiais', 'Bolinho de Costela', 35.00, 'Bolinho artesanal recheado com pura costela bovina desfiada lentamente temperada.', '/img/bolinho_costela.jpg', 22],

            // 4. Cervejas Geladas
            ['Cervejas Geladas', 'Heineken Long Neck 330ml', 12.00, 'Cerveja Premium Lager puro malte, super gelada.', '', 30],
            ['Cervejas Geladas', 'Stella Artois Long Neck 330ml', 11.00, 'Cerveja puro malte belga equilibrada e refrescante.', '', 31],
            ['Cervejas Geladas', 'Corona Extra Long Neck 330ml', 12.00, 'Cerveja mexicana refrescante, acompanha fatia de limão.', '', 32],
            ['Cervejas Geladas', 'Cerveja Original 600ml', 15.00, 'Pilsen clássica garrafa 600ml trincando de gelada.', '', 33],
            ['Cervejas Geladas', 'Amstel Puro Malte Lata 350ml', 7.00, 'Lager puro malte de receita europeia em lata gelada.', '', 34],
            ['Cervejas Geladas', 'Brahma Duplo Malte Lata 350ml', 7.00, 'Cerveja com equilíbrio duplo malte marcante.', '', 35],
            ['Cervejas Geladas', 'Skol Pilsen Lata 350ml', 6.00, 'Cerveja pilsen leve e que desce redondo.', '', 36],

            // 5. Refrigerantes & Bebidas
            ['Refrigerantes & Bebidas', 'Coca-Cola Original Lata 350ml', 6.00, 'Refrigerante em lata bem gelado.', '', 40],
            ['Refrigerantes & Bebidas', 'Coca-Cola Zero Lata 350ml', 6.00, 'Refrigerante sabor zero açúcar em lata gelada.', '', 41],
            ['Refrigerantes & Bebidas', 'Coca-Cola 2 Litros', 14.00, 'Garrafa de 2 litros gelada para compartilhar.', '', 42],
            ['Refrigerantes & Bebidas', 'Guaraná Antarctica Lata 350ml', 6.00, 'Guaraná tradicional em lata super gelado.', '', 43],
            ['Refrigerantes & Bebidas', 'Guaraná Antarctica 2 Litros', 12.00, 'Garrafa de 2 litros gelada.', '', 44],
            ['Refrigerantes & Bebidas', 'Suco Del Valle Uva Lata 290ml', 7.00, 'Suco de fruta em lata bem refrescante.', '', 45],
            ['Refrigerantes & Bebidas', 'Água Mineral sem Gás 500ml', 4.00, 'Água mineral natural garrafa 500ml.', '', 46],
            ['Refrigerantes & Bebidas', 'Água Mineral com Gás 500ml', 5.00, 'Água mineral com gás garrafa 500ml.', '', 47]
        ];

        for (const item of initialMenu) {
            await run(`INSERT INTO items (category, name, price, description, image_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)`, item);
        }
        console.log("Cardápio inicial Pitim Petiscaria cadastrado com sucesso!");
    }
}
initDB().catch(console.error);

// Middleware Auth Master
async function authAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Token de autenticação necessário' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const adminPassRow = await get(`SELECT value FROM settings WHERE key = 'admin_pass'`);
    const validPass = adminPassRow ? adminPassRow.value : 'admin123';

    // Allow master token or direct password match
    if (token === 'pitim-master-token-2026' || token === validPass || token === 'admin123') {
        next();
    } else {
        res.status(401).json({ error: 'Acesso master não autorizado' });
    }
}

// Format message for WhatsApp / Chatwoot
function formatOrderMessage(order) {
    const itemsList = order.items.map(it => {
        let line = `• ${it.quantity}x ${it.name} (R$ ${Number(it.price).toFixed(2).replace('.', ',')})`;
        if (it.notes && it.notes.trim()) {
            line += `\n   Obs: _${it.notes.trim()}_`;
        }
        return line;
    }).join('\n');

    let typeDesc = '🛵 Entrega em Domicílio';
    let addr = `${order.address || ''}${order.number ? ', Nº ' + order.number : ''}${order.neighborhood ? ' - Bairro: ' + order.neighborhood : ''}${order.complement ? ' (' + order.complement + ')' : ''}`;

    if (order.type === 'takeout') {
        typeDesc = '🏪 Retirada no Balcão';
        addr = 'Retirada no estabelecimento';
    } else if (order.type === 'table' || order.order_source === 'table') {
        typeDesc = `🪑 Consumo Presencial (${order.table_number || 'Mesa'})`;
        addr = `Presencial: ${order.table_number || 'Mesa'}`;
    }

    let msg = `🔥 *NOVO PEDIDO #${order.id} - PITIM PETISCARIA*\n`;
    msg += `------------------------------------\n`;
    msg += `👤 *Cliente:* ${order.name}\n`;
    if (order.whatsapp) msg += `📱 *WhatsApp:* ${order.whatsapp}\n`;
    msg += `📍 *Tipo:* ${typeDesc}\n`;
    if (order.type === 'delivery') {
        msg += `🏠 *Endereço:* ${addr}\n`;
    }
    msg += `------------------------------------\n`;
    msg += `📋 *ITENS DO PEDIDO:*\n${itemsList}\n`;
    msg += `------------------------------------\n`;
    msg += `💵 *Subtotal:* R$ ${Number(order.subtotal).toFixed(2).replace('.', ',')}\n`;
    if (order.type === 'delivery') {
        msg += `🛵 *Taxa de Entrega:* R$ ${Number(order.delivery_fee).toFixed(2).replace('.', ',')}\n`;
    }
    msg += `💰 *TOTAL:* R$ ${Number(order.total).toFixed(2).replace('.', ',')}\n`;
    msg += `💳 *Pagamento:* ${order.paymentMethod || 'A combinar / Na Mesa'}\n`;
    if (order.changeFor) {
        msg += `🪙 *Troco para:* R$ ${Number(order.changeFor).toFixed(2).replace('.', ',')}\n`;
    }
    if (order.notes && order.notes.trim()) {
        msg += `📝 *Observações:* ${order.notes.trim()}\n`;
    }
    msg += `------------------------------------\n`;
    msg += `🕒 ${new Date().toLocaleString('pt-BR')}`;
    return msg;
}

// Trigger Direct HTTP Request (Chatwoot / Webhook)
async function triggerDirectHttpRequest(payload) {
    try {
        const enabledSetting = await get(`SELECT value FROM settings WHERE key = 'direct_http_enabled'`);
        if (enabledSetting && enabledSetting.value === '0') {
            return { sent: false, reason: 'disabled' };
        }

        const urlSetting = await get(`SELECT value FROM settings WHERE key = 'direct_http_url'`);
        const url = urlSetting ? urlSetting.value.trim() : '';
        if (!url || !url.startsWith('http')) {
            return { sent: false, reason: 'invalid_url' };
        }

        const methodSetting = await get(`SELECT value FROM settings WHERE key = 'direct_http_method'`);
        const method = (methodSetting ? methodSetting.value : 'POST').toUpperCase();

        const headersSetting = await get(`SELECT value FROM settings WHERE key = 'direct_http_headers'`);
        let headers = { 'Content-Type': 'application/json' };
        if (headersSetting && headersSetting.value) {
            try {
                headers = { ...headers, ...JSON.parse(headersSetting.value) };
            } catch (e) {
                console.error("Erro ao parsear headers customizados:", e.message);
            }
        }

        const response = await fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(payload)
        });

        const status = response.status;
        let responseBody = '';
        try { responseBody = await response.text(); } catch (e) {}

        console.log(`[HTTP Request] Disparo para ${url} | Status: ${status}`);
        return { sent: true, status, body: responseBody };
    } catch (err) {
        console.error("[HTTP Request Erro]", err.message);
        return { sent: false, error: err.message };
    }
}

// ================= ROTAS PÚBLICAS =================

// Cardápio completo e configurações públicas
app.get(['/api/menu', '/api/products'], async (req, res) => {
    try {
        const items = await all(`SELECT * FROM items WHERE active = 1 ORDER BY sort_order ASC, id ASC`);
        const settingsRows = await all(`SELECT key, value FROM settings WHERE key IN ('is_open', 'delivery_fee', 'delivery_time', 'store_address', 'store_phone', 'pix_key', 'pix_name')`);
        const settings = {};
        settingsRows.forEach(r => settings[r.key] = r.value);
        res.json({ items, settings, products: items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Busca dados existentes do cliente por número de WhatsApp / Telefone (Delivery)
app.get('/api/users/:whatsapp', async (req, res) => {
    try {
        const cleanPhone = req.params.whatsapp.replace(/\D/g, '');
        const user = await get(`SELECT * FROM users WHERE whatsapp = ? OR whatsapp = ?`, [cleanPhone, req.params.whatsapp]);
        if (!user) {
            return res.status(404).json({ message: 'Cliente não cadastrado' });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar status de pedido específico (Delivery)
app.get('/api/client/order/:id', async (req, res) => {
    try {
        const order = await get(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
        if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ROTAS DE COMANDA DIGITAL (PRESENCIAL) =================

// Consultar Comanda Digital Individual nas últimas 12h
app.post('/api/comanda/consultar', async (req, res) => {
    const table_num = (req.body.table_number || '').trim();
    const cust_name = (req.body.customer_name || '').trim();

    if (!table_num || !cust_name) {
        return res.status(400).json({ error: 'Mesa e Nome são obrigatórios.' });
    }

    try {
        const comanda = await get(`
            SELECT id, table_number, customer_name, status, payment_method, created_at, updated_at, closed_at
            FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND LOWER(TRIM(customer_name)) = LOWER(?)
              AND created_at >= datetime('now', '-12 hours')
            ORDER BY id DESC LIMIT 1
        `, [table_num, cust_name]);

        if (!comanda) {
            return res.json({
                exists: false,
                table_number: table_num,
                customer_name: cust_name,
                items: [],
                total: 0.0,
                status: 'none'
            });
        }

        // Busca itens consumidos vinculados a essa comanda
        const items = await all(`
            SELECT oi.id, oi.product_name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes, oi.status, oi.created_at
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.comanda_id = ? AND o.status != 'Cancelado'
            ORDER BY oi.id ASC
        `, [comanda.id]);

        const total = items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0);

        res.json({
            exists: true,
            comanda_id: comanda.id,
            table_number: comanda.table_number,
            customer_name: comanda.customer_name,
            status: comanda.status,
            payment_method: comanda.payment_method,
            total: total,
            items: items
        });
    } catch (err) {
        console.error("Erro ao consultar comanda:", err);
        res.status(500).json({ error: err.message });
    }
});

// Solicitar Fechamento da Comanda Individual
app.post('/api/comanda/fechar', async (req, res) => {
    const table_num = (req.body.table_number || '').trim();
    const cust_name = (req.body.customer_name || '').trim();

    try {
        let comanda = null;
        if (req.body.comanda_id) {
            comanda = await get(`SELECT id, table_number, customer_name, status FROM comandas WHERE id = ?`, [req.body.comanda_id]);
        } else {
            comanda = await get(`
                SELECT id, table_number, customer_name, status FROM comandas
                WHERE LOWER(TRIM(table_number)) = LOWER(?)
                  AND LOWER(TRIM(customer_name)) = LOWER(?)
                  AND created_at >= datetime('now', '-12 hours')
                  AND status IN ('open', 'closing_requested')
                ORDER BY id DESC LIMIT 1
            `, [table_num, cust_name]);
        }

        if (!comanda) {
            return res.status(404).json({ error: 'Comanda ativa não encontrada para esta mesa e nome.' });
        }

        await run(`UPDATE comandas SET status = 'closing_requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [comanda.id]);

        const sumRow = await get(`
            SELECT COALESCE(SUM(oi.subtotal), 0) as total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.comanda_id = ? AND o.status != 'Cancelado'
        `, [comanda.id]);
        const total = sumRow ? sumRow.total : 0;

        await run(`
            INSERT INTO table_calls (table_number, customer_name, call_type, status, total, created_at)
            VALUES (?, ?, 'close_comanda', 'pending', ?, CURRENT_TIMESTAMP)
        `, [comanda.table_number, comanda.customer_name, total]);

        res.json({
            success: true,
            message: 'Garçom notificado! Ele já está vindo à sua mesa.',
            comanda_id: comanda.id,
            status: 'closing_requested'
        });
    } catch (err) {
        console.error("Erro ao solicitar fechamento de comanda:", err);
        res.status(500).json({ error: err.message });
    }
});

// Solicitar Fechamento da Mesa Inteira
app.post('/api/comanda/fechar-mesa', async (req, res) => {
    const table_num = (req.body.table_number || '').trim();
    const req_name = (req.body.customer_name || req.body.requester_name || 'Cliente').trim();

    if (!table_num) {
        return res.status(400).json({ error: 'Mesa não informada.' });
    }

    try {
        const comandas = await all(`
            SELECT id, customer_name, status FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND created_at >= datetime('now', '-12 hours')
              AND status IN ('open', 'closing_requested')
        `, [table_num]);

        if (!comandas || comandas.length === 0) {
            return res.status(404).json({ error: 'Não há comandas abertas nesta mesa nas últimas 12 horas.' });
        }

        for (const c of comandas) {
            await run(`UPDATE comandas SET status = 'closing_requested', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [c.id]);
        }

        const sumRow = await get(`
            SELECT COALESCE(SUM(oi.subtotal), 0) as total
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE LOWER(TRIM(o.table_number)) = LOWER(?)
              AND o.created_at >= datetime('now', '-12 hours')
              AND o.status != 'Cancelado'
        `, [table_num]);
        const total = sumRow ? sumRow.total : 0;

        await run(`
            INSERT INTO table_calls (table_number, customer_name, call_type, status, total, created_at)
            VALUES (?, ?, 'close_table', 'pending', ?, CURRENT_TIMESTAMP)
        `, [table_num, req_name, total]);

        res.json({
            success: true,
            message: `Garçom notificado para fechamento da ${table_num}!`,
            total: total
        });
    } catch (err) {
        console.error("Erro ao solicitar fechamento de mesa:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= REALIZAÇÃO DE PEDIDOS (UNIFICADA) =================

app.post('/api/orders', async (req, res) => {
    const { 
        whatsapp, name, customer_name, address, neighborhood, number, complement,
        type, paymentMethod, changeFor, items, notes, subtotal, delivery_fee, total,
        table_number, order_source
    } = req.body;

    try {
        // Verifica se a petiscaria está aberta
        const isOpenRow = await get(`SELECT value FROM settings WHERE key = 'is_open'`);
        if (isOpenRow && isOpenRow.value === '0') {
            return res.status(400).json({ error: 'A Petiscaria Pitim está fechada no momento. Por favor, verifique o horário de funcionamento.' });
        }

        const clientName = (customer_name || name || '').trim();
        const isTableOrder = (type === 'table' || order_source === 'table' || (table_number && table_number.trim().length > 0));

        if (!items || !items.length) {
            return res.status(400).json({ error: 'O pedido deve conter pelo menos um item.' });
        }

        if (isTableOrder && (!table_number || !clientName)) {
            return res.status(400).json({ error: 'Mesa e Nome são obrigatórios para pedido presencial.' });
        }

        if (!isTableOrder && (!whatsapp || !clientName)) {
            return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios para entrega.' });
        }

        // Enriquece os itens se vier apenas com product_id
        const enrichedItems = [];
        for (const it of items) {
            let itemName = it.name || it.product_name;
            let itemPrice = it.price !== undefined ? it.price : it.unit_price;

            if ((!itemName || itemPrice === undefined) && (it.product_id || it.id)) {
                const prodRow = await get(`SELECT name, price FROM items WHERE id = ?`, [it.product_id || it.id]);
                if (prodRow) {
                    itemName = itemName || prodRow.name;
                    itemPrice = itemPrice !== undefined ? itemPrice : prodRow.price;
                }
            }

            const q = Number(it.quantity || 1);
            const p = Number(itemPrice || 0);
            enrichedItems.push({
                product_id: it.product_id || it.id || null,
                name: itemName || 'Item do Cardápio',
                price: p,
                quantity: q,
                subtotal: p * q,
                notes: it.notes || ''
            });
        }

        // Cálculo seguro de totais
        const calcSubtotal = (subtotal !== undefined && subtotal !== null) 
            ? Number(subtotal) 
            : enrichedItems.reduce((acc, it) => acc + it.subtotal, 0);

        let calcDeliveryFee = 0;
        if (!isTableOrder && type === 'delivery') {
            if (delivery_fee !== undefined && delivery_fee !== null) {
                calcDeliveryFee = Number(delivery_fee);
            } else {
                const feeRow = await get(`SELECT value FROM settings WHERE key = 'delivery_fee'`);
                calcDeliveryFee = feeRow ? Number(feeRow.value) : 8.0;
            }
        }

        const calcTotal = (total !== undefined && total !== null) 
            ? Number(total) 
            : (calcSubtotal + calcDeliveryFee);

        let comandaId = null;

        // Se for pedido na Mesa Presencial, vincula à Comanda
        if (isTableOrder) {
            const tableClean = table_number.trim();
            // Procura comanda aberta nas últimas 12h
            let openComanda = await get(`
                SELECT id, status FROM comandas
                WHERE LOWER(TRIM(table_number)) = LOWER(?)
                  AND LOWER(TRIM(customer_name)) = LOWER(?)
                  AND created_at >= datetime('now', '-12 hours')
                  AND status IN ('open', 'closing_requested')
                ORDER BY id DESC LIMIT 1
            `, [tableClean, clientName]);

            if (!openComanda) {
                const comResult = await run(`
                    INSERT INTO comandas (table_number, customer_name, status, created_at, updated_at)
                    VALUES (?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [tableClean, clientName]);
                comandaId = comResult.lastID;
            } else {
                comandaId = openComanda.id;
                await run(`UPDATE comandas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [comandaId]);
            }
        } else {
            // Se for Delivery, salva ou atualiza cadastro do cliente
            const cleanPhone = whatsapp.replace(/\D/g, '');
            await run(`INSERT INTO users (whatsapp, name, address, neighborhood, number, complement, updated_at) 
                       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                       ON CONFLICT(whatsapp) DO UPDATE SET 
                         name = excluded.name,
                         address = excluded.address,
                         neighborhood = excluded.neighborhood,
                         number = excluded.number,
                         complement = excluded.complement,
                         updated_at = CURRENT_TIMESTAMP`,
                [cleanPhone, clientName, address || '', neighborhood || '', number || '', complement || '']
            );
        }

        const cleanPhone = whatsapp ? whatsapp.replace(/\D/g, '') : '';
        const orderType = isTableOrder ? 'table' : (type || 'delivery');
        const orderSrc = isTableOrder ? 'table' : 'delivery';
        const itemsJson = JSON.stringify(enrichedItems);

        // Insere o Pedido
        const orderResult = await run(`INSERT INTO orders 
            (order_source, comanda_id, table_number, customer_whatsapp, customer_name, customer_address, 
             customer_neighborhood, customer_number, customer_complement, type, payment_method, change_for, 
             items_json, notes, subtotal, delivery_fee, total, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente')`,
            [
                orderSrc, comandaId, isTableOrder ? table_number.trim() : null, cleanPhone, clientName,
                address || '', neighborhood || '', number || '', complement || '',
                orderType, paymentMethod || (isTableOrder ? 'Consumo Presencial' : 'A combinar'),
                changeFor || null, itemsJson, notes || '', calcSubtotal, calcDeliveryFee, calcTotal
            ]
        );

        const orderId = orderResult.lastID;

        // Insere cada item em order_items
        for (const it of enrichedItems) {
            await run(`INSERT INTO order_items 
                (order_id, product_id, product_name, quantity, unit_price, subtotal, notes, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'received', CURRENT_TIMESTAMP)`,
                [orderId, it.product_id, it.name, it.quantity, it.price, it.subtotal, it.notes || '']
            );
        }

        const fullOrder = {
            id: orderId,
            order_source: orderSrc,
            table_number: isTableOrder ? table_number.trim() : null,
            comanda_id: comandaId,
            whatsapp: cleanPhone,
            name: clientName,
            address: address || '',
            neighborhood: neighborhood || '',
            number: number || '',
            complement: complement || '',
            type: orderType,
            paymentMethod: paymentMethod || (isTableOrder ? 'Consumo Presencial' : 'A combinar'),
            changeFor,
            items: enrichedItems,
            notes,
            subtotal: calcSubtotal,
            delivery_fee: calcDeliveryFee,
            total: calcTotal,
            status: 'Pendente',
            created_at: new Date().toISOString()
        };

        const formattedMessage = formatOrderMessage(fullOrder);

        // Dispara HTTP Request direto de forma assíncrona
        triggerDirectHttpRequest({
            event: isTableOrder ? 'new_table_order' : 'new_order',
            order_id: orderId,
            order_source: orderSrc,
            table_number: fullOrder.table_number,
            customer: {
                whatsapp: cleanPhone,
                name: clientName,
                address: address || '',
                neighborhood: neighborhood || '',
                number: number || '',
                complement: complement || ''
            },
            type: orderType,
            payment_method: fullOrder.paymentMethod,
            change_for: changeFor,
            items: enrichedItems,
            notes: notes || '',
            subtotal: calcSubtotal,
            delivery_fee: calcDeliveryFee,
            total: calcTotal,
            status: 'Pendente',
            formatted_message: formattedMessage,
            created_at: fullOrder.created_at
        }).catch(e => console.error("Erro disparador HTTP:", e));

        res.json({ 
            success: true, 
            orderId: orderId,
            comandaId: comandaId,
            message: isTableOrder ? 'Pedido enviado com sucesso para a cozinha!' : 'Pedido realizado com sucesso!'
        });
    } catch (err) {
        console.error("Erro ao criar pedido:", err);
        res.status(500).json({ error: err.message });
    }
});

// ================= ROTAS MASTER / ADMIN =================

// Autenticação Master
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userRow = await get(`SELECT value FROM settings WHERE key = 'admin_user'`);
        const passRow = await get(`SELECT value FROM settings WHERE key = 'admin_pass'`);
        const validUser = userRow ? userRow.value : 'admin';
        const validPass = passRow ? passRow.value : 'admin123';

        if (username === validUser && password === validPass) {
            return res.json({ success: true, token: 'pitim-master-token-2026' });
        }
        res.status(401).json({ error: 'Credenciais inválidas. Verifique usuário e senha.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar Mesas Ativas (Últimas 12h) para o Painel Master
app.get('/api/admin/active-tables', authAdmin, async (req, res) => {
    try {
        const comandas = await all(`
            SELECT c.id, c.table_number, c.customer_name, c.status, c.payment_method, c.created_at, c.updated_at, c.closed_at,
                   COALESCE(SUM(oi.subtotal), 0) as total_amount,
                   COUNT(DISTINCT o.id) as orders_count,
                   COUNT(oi.id) as items_count
            FROM comandas c
            LEFT JOIN orders o ON o.comanda_id = c.id AND o.status != 'Cancelado'
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE c.created_at >= datetime('now', '-12 hours') AND c.status IN ('open', 'closing_requested')
            GROUP BY c.id
            ORDER BY c.table_number ASC, c.id DESC
        `);

        // Popula itens detalhados para cada comanda
        for (const c of comandas) {
            c.items = await all(`
                SELECT oi.id, oi.product_name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes, oi.status, oi.created_at
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.comanda_id = ? AND o.status != 'Cancelado'
                ORDER BY oi.id ASC
            `, [c.id]);
        }

        const tables = {};
        let closing_requested_count = 0;
        let total_active_money = 0.0;

        for (const c of comandas) {
            const t_num = c.table_number;
            if (!tables[t_num]) {
                tables[t_num] = {
                    table_number: t_num,
                    comandas: [],
                    table_total: 0.0,
                    has_closing_request: false,
                    last_activity: c.updated_at
                };
            }

            tables[t_num].comandas.push(c);
            tables[t_num].table_total += Number(c.total_amount || 0);
            total_active_money += Number(c.total_amount || 0);

            if (c.status === 'closing_requested') {
                tables[t_num].has_closing_request = true;
                closing_requested_count++;
            }
        }

        // Busca chamados urgentes pendentes
        const urgent_calls = await all(`
            SELECT * FROM table_calls 
            WHERE status = 'pending' AND created_at >= datetime('now', '-12 hours')
            ORDER BY id DESC
        `);

        res.json({
            tables: Object.values(tables),
            urgent_calls: urgent_calls,
            total_active_money: total_active_money,
            closing_requested_count: closing_requested_count
        });
    } catch (err) {
        console.error("Erro ao carregar mesas ativas:", err);
        res.status(500).json({ error: err.message });
    }
});

// Fechar / Dar Baixa na Mesa Inteira (Master)
app.post('/api/admin/table/:table_number/close', authAdmin, async (req, res) => {
    const table_num = (req.params.table_number || '').trim();
    const pay_method = req.body.payment_method || 'PIX';

    try {
        const rows = await all(`
            SELECT id FROM comandas
            WHERE LOWER(TRIM(table_number)) = LOWER(?)
              AND created_at >= datetime('now', '-12 hours')
              AND status IN ('open', 'closing_requested')
        `, [table_num]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Nenhuma comanda ativa encontrada para esta mesa.' });
        }

        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');

        await run(`
            UPDATE comandas 
            SET status = 'closed', payment_method = ?, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
        `, [pay_method, ...ids]);

        // Atualiza pedidos para concluídos
        await run(`
            UPDATE orders 
            SET status = 'Concluído', updated_at = CURRENT_TIMESTAMP
            WHERE comanda_id IN (${placeholders})
        `, ids);

        // Marca chamados como atendidos
        await run(`
            UPDATE table_calls 
            SET status = 'attended', attended_at = CURRENT_TIMESTAMP
            WHERE LOWER(TRIM(table_number)) = LOWER(?) AND status = 'pending'
        `, [table_num]);

        res.json({ success: true, message: `Mesa ${table_num} encerrada com sucesso!` });
    } catch (err) {
        console.error("Erro ao fechar mesa:", err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar Status de Comanda Individual (Master)
app.post('/api/admin/comanda/:comanda_id/status', authAdmin, async (req, res) => {
    const { status, payment_method } = req.body;
    try {
        const comanda = await get(`SELECT id, table_number, customer_name FROM comandas WHERE id = ?`, [req.params.comanda_id]);
        if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada.' });

        const isClosed = (status === 'closed' || status === 'paid');
        await run(`
            UPDATE comandas 
            SET status = ?, 
                payment_method = COALESCE(?, payment_method),
                updated_at = CURRENT_TIMESTAMP,
                closed_at = ${isClosed ? 'CURRENT_TIMESTAMP' : 'closed_at'}
            WHERE id = ?
        `, [status, payment_method || null, req.params.comanda_id]);

        if (isClosed) {
            await run(`UPDATE orders SET status = 'Concluído', updated_at = CURRENT_TIMESTAMP WHERE comanda_id = ?`, [comanda.id]);
            await run(`
                UPDATE table_calls 
                SET status = 'attended', attended_at = CURRENT_TIMESTAMP
                WHERE LOWER(TRIM(table_number)) = LOWER(?) 
                  AND LOWER(TRIM(customer_name)) = LOWER(?) 
                  AND status = 'pending'
            `, [comanda.table_number, comanda.customer_name]);
        }

        res.json({ success: true, status });
    } catch (err) {
        console.error("Erro ao atualizar status da comanda:", err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar Status de Item Individual do Pedido (Recebido / Preparando / Entregue)
app.post('/api/admin/order-item/:item_id/status', authAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await run(`UPDATE order_items SET status = ? WHERE id = ?`, [status, req.params.item_id]);
        res.json({ success: true, item_id: req.params.item_id, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atender Chamado de Garçom (Master)
app.post('/api/admin/table-calls/:id/attend', authAdmin, async (req, res) => {
    try {
        await run(`UPDATE table_calls SET status = 'attended', attended_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lançamento Manual de Pedido (Garçom / Master)
app.post('/api/admin/manual-order', authAdmin, async (req, res) => {
    const { order_source, table_number, customer_name, whatsapp, items, notes } = req.body;

    try {
        if (!items || !items.length) {
            return res.status(400).json({ error: 'Nenhum item adicionado.' });
        }

        const isTable = (order_source === 'table' || (table_number && table_number.trim().length > 0));
        const clientName = (customer_name || (isTable ? `Mesa ${table_number}` : 'Cliente Balcão')).trim();

        let comandaId = null;
        if (isTable) {
            const tableClean = table_number.trim();
            let openComanda = await get(`
                SELECT id FROM comandas
                WHERE LOWER(TRIM(table_number)) = LOWER(?)
                  AND LOWER(TRIM(customer_name)) = LOWER(?)
                  AND created_at >= datetime('now', '-12 hours')
                  AND status IN ('open', 'closing_requested')
                ORDER BY id DESC LIMIT 1
            `, [tableClean, clientName]);

            if (!openComanda) {
                const comRes = await run(`
                    INSERT INTO comandas (table_number, customer_name, status, created_at, updated_at)
                    VALUES (?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [tableClean, clientName]);
                comandaId = comRes.lastID;
            } else {
                comandaId = openComanda.id;
            }
        }

        const subtotal = items.reduce((acc, it) => acc + (Number(it.price) * Number(it.quantity)), 0);
        const itemsJson = JSON.stringify(items);

        const orderResult = await run(`
            INSERT INTO orders 
            (order_source, comanda_id, table_number, customer_whatsapp, customer_name, customer_address, type, payment_method, items_json, notes, subtotal, delivery_fee, total, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'Preparando')
        `, [
            isTable ? 'table' : 'takeout',
            comandaId,
            isTable ? table_number.trim() : null,
            whatsapp || '',
            clientName,
            isTable ? `Presencial: ${table_number.trim()}` : 'Balcão',
            isTable ? 'table' : 'takeout',
            isTable ? 'Consumo Presencial' : 'Balcão',
            itemsJson,
            notes || '',
            subtotal,
            subtotal
        ]);

        const orderId = orderResult.lastID;

        for (const it of items) {
            await run(`
                INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, notes, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'preparing', CURRENT_TIMESTAMP)
            `, [orderId, it.id || null, it.name, it.quantity, it.price, it.price * it.quantity, it.notes || '']);
        }

        res.json({ success: true, orderId: orderId, comandaId: comandaId });
    } catch (err) {
        console.error("Erro ao lançar pedido manual:", err);
        res.status(500).json({ error: err.message });
    }
});

// Listar todos os pedidos (Delivery e Mesa)
app.get('/api/admin/orders', authAdmin, async (req, res) => {
    try {
        const orders = await all(`SELECT * FROM orders ORDER BY created_at DESC`);
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Atualizar status do pedido
app.put('/api/admin/orders/:id/status', authAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);

        // Se o pedido tiver comanda e for concluído, verifica se atualiza comanda
        const order = await get(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
        if (order) {
            // Dispara notificação de mudança de status se for delivery
            if (order.customer_whatsapp) {
                triggerDirectHttpRequest({
                    event: 'order_status_updated',
                    order_id: order.id,
                    new_status: status,
                    customer: {
                        whatsapp: order.customer_whatsapp,
                        name: order.customer_name
                    }
                }).catch(e => console.error("Erro HTTP status:", e));
            }
        }

        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir pedido
app.delete('/api/admin/orders/:id', authAdmin, async (req, res) => {
    try {
        await run(`DELETE FROM order_items WHERE order_id = ?`, [req.params.id]);
        await run(`DELETE FROM orders WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD de Itens do Cardápio
app.get('/api/admin/items', authAdmin, async (req, res) => {
    try {
        const items = await all(`SELECT * FROM items ORDER BY category ASC, sort_order ASC, id ASC`);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/items', authAdmin, async (req, res) => {
    const { category, name, price, description, image_url, active, sort_order } = req.body;
    try {
        const result = await run(`INSERT INTO items (category, name, price, description, image_url, active, sort_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [category, name, Number(price), description || '', image_url || '', active !== undefined ? active : 1, sort_order || 0]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/items/:id', authAdmin, async (req, res) => {
    const { category, name, price, description, image_url, active, sort_order } = req.body;
    try {
        const item = await get(`SELECT * FROM items WHERE id = ?`, [req.params.id]);
        if (!item) return res.status(404).json({ error: 'Item não encontrado' });

        await run(`UPDATE items SET 
            category = COALESCE(?, category),
            name = COALESCE(?, name),
            price = COALESCE(?, price),
            description = COALESCE(?, description),
            image_url = COALESCE(?, image_url),
            active = COALESCE(?, active),
            sort_order = COALESCE(?, sort_order)
            WHERE id = ?`,
            [
                category !== undefined ? category : null,
                name !== undefined ? name : null,
                price !== undefined ? Number(price) : null,
                description !== undefined ? description : null,
                image_url !== undefined ? image_url : null,
                active !== undefined ? active : null,
                sort_order !== undefined ? sort_order : null,
                req.params.id
            ]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/items/:id', authAdmin, async (req, res) => {
    try {
        await run(`DELETE FROM items WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Configurações do Sistema
app.get('/api/admin/settings', authAdmin, async (req, res) => {
    try {
        const rows = await all(`SELECT key, value FROM settings`);
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/settings', authAdmin, async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            await run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, String(value)]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Testar disparo HTTP direto
app.post('/api/admin/test-http', authAdmin, async (req, res) => {
    try {
        const sampleOrder = {
            id: 9999,
            whatsapp: '16999999999',
            name: 'Cliente Teste Pitim',
            address: 'Rua de Teste',
            neighborhood: 'Centro',
            number: '100',
            complement: 'Apto 1',
            type: 'delivery',
            paymentMethod: 'PIX',
            changeFor: null,
            items: [
                { name: 'Espeto de Carne', quantity: 2, price: 10.00, notes: 'Bem passado' },
                { name: 'Porção de Batata Frita com Mussarela', quantity: 1, price: 30.00, notes: '' },
                { name: 'Heineken Long Neck 330ml', quantity: 2, price: 12.00, notes: '' }
            ],
            notes: 'Campainha está quebrada, favor buzinar.',
            subtotal: 74.00,
            delivery_fee: 8.00,
            total: 82.00,
            status: 'Pendente',
            created_at: new Date().toISOString()
        };

        const formatted = formatOrderMessage(sampleOrder);
        const result = await triggerDirectHttpRequest({
            event: 'test_dispatch',
            order_id: 9999,
            customer: {
                whatsapp: sampleOrder.whatsapp,
                name: sampleOrder.name,
                address: sampleOrder.address,
                neighborhood: sampleOrder.neighborhood,
                number: sampleOrder.number,
                complement: sampleOrder.complement
            },
            type: sampleOrder.type,
            items: sampleOrder.items,
            subtotal: sampleOrder.subtotal,
            delivery_fee: sampleOrder.delivery_fee,
            total: sampleOrder.total,
            formatted_message: formatted
        });

        res.json({ success: true, result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ROTAS DE FRONT-END =================

// Comanda Presencial (Mesa / Balcão)
app.get(['/comanda', '/mesa', '/cardapio'], (req, res) => {
    res.sendFile(path.join(publicDir, 'comanda.html'));
});

// Delivery & Retirada
app.get('/delivery', (req, res) => {
    res.sendFile(path.join(publicDir, 'delivery.html'));
});

// Painel Master Unificado (Mesas + Delivery)
app.get(['/acesso', '/admin'], (req, res) => {
    res.sendFile(path.join(publicDir, 'acesso.html'));
});

// Página Inicial / Roteamento inteligente por Domínio
app.get('/', (req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    // Se o domínio for comanda-pitim... ou comanda.cajuru... abre direto a Comanda Presencial
    if (host.includes('comanda')) {
        return res.sendFile(path.join(publicDir, 'comanda.html'));
    }
    // Caso padrão: Delivery (com botão de acesso à mesa)
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Fallback para SPA
app.get('*', (req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    if (host.includes('comanda')) {
        return res.sendFile(path.join(publicDir, 'comanda.html'));
    }
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Porta do servidor (padrão 3002 ou PORT de ambiente)
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🍢 Pitim Petiscaria Sistema Unificado rodando na porta ${PORT}`);
    console.log(`📱 Delivery:         http://localhost:${PORT}/delivery`);
    console.log(`🪑 Comanda Presencial: http://localhost:${PORT}/comanda`);
    console.log(`🔒 Acesso Master:    http://localhost:${PORT}/acesso (login: admin | senha: admin123)`);
});
