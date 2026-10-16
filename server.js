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

    await run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        image_url TEXT,
        active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0
    )`);

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

    await run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_whatsapp TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_address TEXT,
        customer_neighborhood TEXT,
        customer_number TEXT,
        customer_complement TEXT,
        type TEXT NOT NULL,
        payment_method TEXT NOT NULL,
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
            ['Cervejas', 'Heineken Long Neck 330ml', 12.00, 'Cerveja Premium Lager puro malte, super gelada.', '', 30],
            ['Cervejas', 'Stella Artois Long Neck 330ml', 11.00, 'Cerveja puro malte belga equilibrada e refrescante.', '', 31],
            ['Cervejas', 'Corona Extra Long Neck 330ml', 12.00, 'Cerveja mexicana refrescante, acompanha fatia de limão.', '', 32],
            ['Cervejas', 'Cerveja Original 600ml', 15.00, 'Pilsen clássica garrafa 600ml trincando de gelada.', '', 33],
            ['Cervejas', 'Amstel Puro Malte Lata 350ml', 7.00, 'Lager puro malte de receita europeia em lata gelada.', '', 34],
            ['Cervejas', 'Brahma Duplo Malte Lata 350ml', 7.00, 'Cerveja com equilíbrio duplo malte marcante.', '', 35],
            ['Cervejas', 'Skol Pilsen Lata 350ml', 6.00, 'Cerveja pilsen leve e que desce redondo.', '', 36],

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

    const typeDesc = order.type === 'delivery' ? '🛵 Entrega em Domicílio' : '🏪 Retirada no Balcão';
    const addr = order.type === 'delivery' 
        ? `${order.address || ''}${order.number ? ', Nº ' + order.number : ''}${order.neighborhood ? ' - Bairro: ' + order.neighborhood : ''}${order.complement ? ' (' + order.complement + ')' : ''}`
        : 'Retirada no estabelecimento';

    let msg = `🔥 *NOVO PEDIDO #${order.id} - PITIM PETISCARIA*\n`;
    msg += `------------------------------------\n`;
    msg += `👤 *Cliente:* ${order.name}\n`;
    msg += `📱 *WhatsApp:* ${order.whatsapp}\n`;
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
    msg += `💳 *Pagamento:* ${order.paymentMethod || 'A combinar'}\n`;
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
app.get('/api/menu', async (req, res) => {
    try {
        const items = await all(`SELECT * FROM items WHERE active = 1 ORDER BY sort_order ASC, id ASC`);
        const settingsRows = await all(`SELECT key, value FROM settings WHERE key IN ('is_open', 'delivery_fee', 'delivery_time', 'store_address', 'store_phone', 'pix_key', 'pix_name')`);
        const settings = {};
        settingsRows.forEach(r => settings[r.key] = r.value);
        res.json({ items, settings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Busca dados existentes do cliente por número de WhatsApp / Telefone
app.get('/api/users/:whatsapp', async (req, res) => {
    try {
        const cleanPhone = req.params.whatsapp.replace(/\D/g, '');
        const user = await get(`SELECT * FROM users WHERE whatsapp = ? OR whatsapp = ?`, [cleanPhone, req.params.whatsapp]);
        res.json(user || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Histórico de pedidos do cliente (Meus Pedidos)
app.get('/api/client/orders/:whatsapp', async (req, res) => {
    try {
        const cleanPhone = req.params.whatsapp.replace(/\D/g, '');
        const orders = await all(
            `SELECT * FROM orders WHERE customer_whatsapp = ? OR customer_whatsapp = ? ORDER BY created_at DESC LIMIT 20`,
            [cleanPhone, req.params.whatsapp]
        );
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar status de pedido específico
app.get('/api/client/order/:id', async (req, res) => {
    try {
        const order = await get(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
        if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Realizar novo pedido
app.post('/api/orders', async (req, res) => {
    const { 
        whatsapp, name, address, neighborhood, number, complement,
        type, paymentMethod, changeFor, items, notes, subtotal, delivery_fee, total 
    } = req.body;

    try {
        // Verifica se a petiscaria está aberta
        const isOpenRow = await get(`SELECT value FROM settings WHERE key = 'is_open'`);
        if (isOpenRow && isOpenRow.value === '0') {
            return res.status(400).json({ error: 'A Petiscaria Pitim está fechada no momento. Por favor, verifique o horário de funcionamento.' });
        }

        if (!whatsapp || !name || !items || !items.length) {
            return res.status(400).json({ error: 'Dados incompletos para envio do pedido.' });
        }

        const cleanPhone = whatsapp.replace(/\D/g, '');

        // Salva ou atualiza cadastro do cliente
        await run(`INSERT INTO users (whatsapp, name, address, neighborhood, number, complement, updated_at) 
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(whatsapp) DO UPDATE SET 
                     name = excluded.name,
                     address = excluded.address,
                     neighborhood = excluded.neighborhood,
                     number = excluded.number,
                     complement = excluded.complement,
                     updated_at = CURRENT_TIMESTAMP`,
            [cleanPhone, name, address || '', neighborhood || '', number || '', complement || '']
        );

        // Salva o pedido
        const itemsJson = JSON.stringify(items);
        const result = await run(`INSERT INTO orders 
            (customer_whatsapp, customer_name, customer_address, customer_neighborhood, customer_number, customer_complement,
             type, payment_method, change_for, items_json, notes, subtotal, delivery_fee, total, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendente')`,
            [
                cleanPhone, name, address || '', neighborhood || '', number || '', complement || '',
                type, paymentMethod, changeFor || null, itemsJson, notes || '', subtotal, delivery_fee || 0, total
            ]
        );

        const orderId = result.lastID;
        const fullOrder = {
            id: orderId,
            whatsapp: cleanPhone,
            name,
            address: address || '',
            neighborhood: neighborhood || '',
            number: number || '',
            complement: complement || '',
            type,
            paymentMethod,
            changeFor,
            items,
            notes,
            subtotal,
            delivery_fee: delivery_fee || 0,
            total,
            status: 'Pendente',
            created_at: new Date().toISOString()
        };

        const formattedMessage = formatOrderMessage(fullOrder);

        // Dispara HTTP Request direto de forma assíncrona
        triggerDirectHttpRequest({
            event: 'new_order',
            order_id: orderId,
            customer: {
                whatsapp: cleanPhone,
                name: name,
                address: address || '',
                neighborhood: neighborhood || '',
                number: number || '',
                complement: complement || ''
            },
            type,
            payment_method: paymentMethod,
            change_for: changeFor,
            items,
            notes: notes || '',
            subtotal,
            delivery_fee: delivery_fee || 0,
            total,
            status: 'Pendente',
            formatted_message: formattedMessage,
            created_at: fullOrder.created_at
        }).catch(e => console.error("Erro disparador HTTP:", e));

        res.json({ 
            success: true, 
            orderId: orderId,
            message: 'Pedido realizado com sucesso!'
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

// Listar todos os pedidos
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
        const order = await get(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
        
        if (order) {
            let parsedItems = [];
            try { parsedItems = JSON.parse(order.items_json); } catch(e) {}
            
            triggerDirectHttpRequest({
                event: 'status_update',
                order_id: order.id,
                customer_whatsapp: order.customer_whatsapp,
                customer_name: order.customer_name,
                status: order.status,
                type: order.type,
                total: order.total,
                items: parsedItems,
                formatted_message: `🔔 *ATUALIZAÇÃO DO PEDIDO #${order.id}*\nOlá ${order.customer_name}, seu pedido agora está: *${status.toUpperCase()}*!`
            }).catch(e => console.error("Erro disparador HTTP status update:", e));
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir pedido
app.delete('/api/admin/orders/:id', authAdmin, async (req, res) => {
    try {
        await run(`DELETE FROM orders WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar todos os itens (inclusive inativos para edição)
app.get('/api/admin/items', authAdmin, async (req, res) => {
    try {
        const items = await all(`SELECT * FROM items ORDER BY category, sort_order, id`);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar item no cardápio
app.post('/api/admin/items', authAdmin, async (req, res) => {
    const { category, name, price, description, image_url, active, sort_order } = req.body;
    try {
        const result = await run(
            `INSERT INTO items (category, name, price, description, image_url, active, sort_order) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [category, name, Number(price) || 0, description || '', image_url || '', active !== undefined ? active : 1, sort_order || 0]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Editar item no cardápio / Alterar Preços
app.put('/api/admin/items/:id', authAdmin, async (req, res) => {
    const { category, name, price, description, image_url, active, sort_order } = req.body;
    try {
        await run(
            `UPDATE items SET 
                category = coalesce(?, category),
                name = coalesce(?, name),
                price = coalesce(?, price),
                description = coalesce(?, description),
                image_url = coalesce(?, image_url),
                active = coalesce(?, active),
                sort_order = coalesce(?, sort_order)
             WHERE id = ?`,
            [category, name, price !== undefined ? Number(price) : null, description, image_url, active, sort_order, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Excluir item do cardápio
app.delete('/api/admin/items/:id', authAdmin, async (req, res) => {
    try {
        await run(`DELETE FROM items WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obter configurações completas
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

// Atualizar configurações globais
app.put('/api/admin/settings', authAdmin, async (req, res) => {
    try {
        for (const [key, value] of Object.entries(req.body)) {
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

// Rotas do Front-end
app.get('/acesso', (req, res) => {
    res.sendFile(path.join(publicDir, 'acesso.html'));
});

app.get('/admin', (req, res) => {
    res.redirect('/acesso');
});

app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Porta do servidor (padrão 3002 ou PORT de ambiente)
const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🍢 Pitim Petiscaria Delivery rodando na porta ${PORT}`);
    console.log(`📱 Menu Virtual: http://localhost:${PORT}`);
    console.log(`🔒 Acesso Master: http://localhost:${PORT}/acesso (login: admin | senha: admin123)`);
});
