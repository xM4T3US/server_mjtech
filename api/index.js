const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();

// ============================================
// CONFIGURAÇÕES
// ============================================
const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secret-key';
const TOKEN_EXPIRATION = '8h';

// Configurar CORS
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CONEXÃO COM SQLITE EM MEMÓRIA
// ============================================
const db = new sqlite3.Database(':memory:');

console.log('✅ SQLite em memória inicializado');

// Helper functions
const dbHelper = {
    get: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    all: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    run: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }
};

// ============================================
// INICIALIZAÇÃO DO BANCO DE DADOS
// ============================================
async function initializeDatabase() {
    try {
        console.log('🔄 Inicializando banco SQLite...');
        
        // Criar tabelas
        await dbHelper.run(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT DEFAULT 'editor',
                is_active INTEGER DEFAULT 1,
                last_login TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await dbHelper.run(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                price REAL NOT NULL,
                old_price REAL,
                discount TEXT,
                whatsapp_link TEXT NOT NULL,
                condition TEXT DEFAULT 'Novo',
                available_quantity INTEGER DEFAULT 0,
                sold_quantity INTEGER DEFAULT 0,
                free_shipping INTEGER DEFAULT 0,
                category TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Tabelas criadas');
        
        // Criar usuário admin se não existir
        const adminCheck = await dbHelper.get("SELECT id FROM admin_users WHERE username = ?", ['admin_mjtech']);
        
        if (!adminCheck) {
            const adminPassword = process.env.ADMIN_PASSWORD || 'S3nh@F0rt3!2025';
            const passwordHash = bcrypt.hashSync(adminPassword, 10);
            
            await dbHelper.run(
                `INSERT INTO admin_users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`,
                [
                    process.env.ADMIN_USERNAME || 'admin_mjtech',
                    process.env.ADMIN_EMAIL || 'admin@mjtech.com.br',
                    passwordHash,
                    process.env.ADMIN_FULLNAME || 'Administrador MJ Tech',
                    'admin'
                ]
            );
            
            console.log('✅ Usuário admin criado');
            console.log('👤 Usuário:', process.env.ADMIN_USERNAME || 'admin_mjtech');
            console.log('🔑 Senha:', adminPassword);
        }
        
        // Inserir produtos de exemplo
        const productsCheck = await dbHelper.get("SELECT COUNT(*) as count FROM products");
        
        if (productsCheck.count === 0) {
            await dbHelper.run(`
                INSERT INTO products (id, title, description, image_url, price, old_price, discount, 
                                    whatsapp_link, condition, available_quantity, sold_quantity, 
                                    free_shipping, category) VALUES
                ('mjtech-001', 'Reparo de Celular - MJ TECH', 'Conserto profissional de smartphones com garantia e peças de qualidade', 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80', 99.90, 149.90, '33% OFF', 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular', 'Serviço', 999, 150, 0, 'SERVIÇOS'),
                ('mjtech-002', 'Manutenção de Notebook - MJ TECH', 'Limpeza interna, formatação e otimização para notebooks e computadores', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80', 129.90, 179.90, '28% OFF', 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook', 'Serviço', 50, 25, 0, 'SERVIÇOS')
            `);
            console.log('✅ Produtos de exemplo inseridos');
        }
        
        console.log('🎉 Banco inicializado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error.message);
    }
}

// Inicializar banco
initializeDatabase();

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token de acesso não fornecido' 
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const user = await dbHelper.get('SELECT * FROM admin_users WHERE id = ? AND is_active = 1', [decoded.id]);
        
        if (!user) {
            return res.status(403).json({ 
                success: false, 
                error: 'Usuário não encontrado ou inativo' 
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };
        
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            error: 'Token inválido ou expirado' 
        });
    }
};

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

// ROTA 1: Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Usuário e senha são obrigatórios'
            });
        }

        // Buscar usuário
        const user = await dbHelper.get(
            'SELECT * FROM admin_users WHERE (username = ? OR email = ?) AND is_active = 1',
            [username, username]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Verificar senha
        const passwordValid = bcrypt.compareSync(password, user.password_hash);
        
        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Atualizar último login
        await dbHelper.run(
            'UPDATE admin_users SET last_login = datetime("now") WHERE id = ?',
            [user.id]
        );

        // Gerar token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                role: user.role 
            },
            SECRET_KEY,
            { expiresIn: TOKEN_EXPIRATION }
        );

        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('❌ Erro no login:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA 2: Verificar token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        valid: true
    });
});

// ============================================
// ROTAS DE PRODUTOS
// ============================================

// ROTA 3: Listar produtos ativos
app.get('/api/products', async (req, res) => {
    try {
        const products = await dbHelper.all(
            'SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC'
        );
        
        const formatPrice = (price) => {
            if (!price || isNaN(price)) return 'R$ 0,00';
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                minimumFractionDigits: 2
            }).format(price);
        };
        
        const formattedProducts = products.map(product => ({
            id: product.id,
            title: product.title,
            description: product.description,
            image: product.image_url,
            price: formatPrice(product.price),
            oldPrice: product.old_price ? formatPrice(product.old_price) : null,
            discount: product.discount,
            link: product.whatsapp_link,
            condition: product.condition,
            available_quantity: product.available_quantity,
            sold_quantity: product.sold_quantity,
            free_shipping: product.free_shipping ? 'Frete Grátis' : '',
            category: product.category
        }));
        
        res.json({
            success: true,
            store: "MJ TECH",
            count: formattedProducts.length,
            products: formattedProducts
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar produtos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar produtos'
        });
    }
});

// ROTA 4: Listar todos os produtos (admin)
app.get('/api/admin/products', authenticateToken, async (req, res) => {
    try {
        const products = await dbHelper.all('SELECT * FROM products ORDER BY created_at DESC');
        res.json({
            success: true,
            count: products.length,
            products: products
        });
    } catch (error) {
        console.error('❌ Erro ao listar produtos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA 5: Criar produto (admin)
app.post('/api/admin/products', authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            image,
            price,
            oldPrice,
            discount,
            link,
            condition,
            available_quantity,
            sold_quantity,
            free_shipping,
            category
        } = req.body;
        
        if (!title || !price || !link) {
            return res.status(400).json({
                success: false,
                error: 'Título, preço e link são obrigatórios'
            });
        }
        
        const productId = `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        await dbHelper.run(
            `INSERT INTO products 
            (id, title, description, image_url, price, old_price, discount, 
             whatsapp_link, condition, available_quantity, sold_quantity, 
             free_shipping, category) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                productId,
                title,
                description || title,
                image || 'https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH',
                parseFloat(price),
                oldPrice ? parseFloat(oldPrice) : null,
                discount || null,
                link,
                condition || 'Novo',
                parseInt(available_quantity) || 10,
                parseInt(sold_quantity) || 0,
                free_shipping ? 1 : 0,
                category || 'TECNOLOGIA'
            ]
        );
        
        res.json({
            success: true,
            message: '✅ Produto cadastrado com sucesso!',
            productId: productId
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar produto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

// ROTA 6: Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        status: 'online',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: 'SQLite em memória'
    });
});

// ROTA 7: Informações da loja
app.get('/api/store', (req, res) => {
    res.json({
        success: true,
        store: {
            name: "MJ TECH",
            whatsapp: "https://wa.me/5519995189387",
            email: "contato@mjtech.com.br"
        }
    });
});

// ROTA 8: Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        message: 'Sistema com SQLite em memória',
        endpoints: {
            public: {
                products: '/api/products',
                store: '/api/store',
                health: '/api/health'
            },
            admin: {
                login: 'POST /api/auth/login'
            }
        }
    });
});

// ============================================
// EXPORTAR APP
// ============================================

module.exports = app;
