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
    origin: '*', // Em produção, restrinja aos seus domínios
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// INICIALIZAÇÃO DO BANCO DE DADOS EM MEMÓRIA
// ============================================
const db = new sqlite3.Database(':memory:'); // SQLite em memória (VOLÁTIL)

// Função para inicializar o banco
const initializeDatabase = () => {
    console.log('🔄 Inicializando banco de dados em memória...');

    // Criar tabelas
    db.serialize(() => {
        // Tabela de usuários
        db.run(`
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

        // Tabela de produtos
        db.run(`
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

        // Verificar se já existe usuário admin
        db.get(`SELECT COUNT(*) as count FROM admin_users WHERE username = 'admin'`, (err, row) => {
            if (err) {
                console.error('❌ Erro ao verificar admin:', err.message);
                return;
            }

            if (row.count === 0) {
                // Criar usuário admin padrão
                const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
                const passwordHash = bcrypt.hashSync(adminPassword, 10);
                
                db.run(
                    `INSERT INTO admin_users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`,
                    [
                        process.env.ADMIN_USERNAME || 'admin',
                        process.env.ADMIN_EMAIL || 'admin@mjtech.com.br',
                        passwordHash,
                        process.env.ADMIN_FULLNAME || 'Administrador MJ Tech',
                        'admin'
                    ],
                    function(err) {
                        if (err) {
                            console.error('❌ Erro ao criar admin:', err.message);
                        } else {
                            console.log('✅ Usuário admin criado com ID:', this.lastID);
                            console.log('👤 Usuário:', process.env.ADMIN_USERNAME || 'admin');
                            console.log('🔑 Senha:', adminPassword);
                            console.log('⚠️ ALTERE A SENHA NO PAINEL APÓS O PRIMEIRO LOGIN!');
                        }
                    }
                );
            } else {
                console.log('✅ Usuário admin já existe no sistema');
            }
        });

        // Inserir produtos de exemplo
        db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
            if (row.count === 0) {
                const sampleProducts = [
                    {
                        id: 'mjtech-001',
                        title: 'Reparo de Celular - MJ TECH',
                        description: 'Conserto profissional de smartphones com garantia e peças de qualidade',
                        image_url: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
                        price: 99.90,
                        old_price: 149.90,
                        discount: '33% OFF',
                        whatsapp_link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular',
                        condition: 'Serviço',
                        available_quantity: 999,
                        sold_quantity: 150,
                        free_shipping: 0,
                        category: 'SERVIÇOS'
                    },
                    {
                        id: 'mjtech-002',
                        title: 'Manutenção de Notebook - MJ TECH',
                        description: 'Limpeza interna, formatação e otimização para notebooks e computadores',
                        image_url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
                        price: 129.90,
                        old_price: 179.90,
                        discount: '28% OFF',
                        whatsapp_link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook',
                        condition: 'Serviço',
                        available_quantity: 50,
                        sold_quantity: 25,
                        free_shipping: 0,
                        category: 'SERVIÇOS'
                    }
                ];

                sampleProducts.forEach(product => {
                    db.run(
                        `INSERT INTO products (id, title, description, image_url, price, old_price, discount, whatsapp_link, condition, available_quantity, sold_quantity, free_shipping, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        Object.values(product)
                    );
                });
                console.log('✅ Produtos de exemplo inseridos');
            }
        });

        console.log('✅ Banco de dados inicializado com sucesso!');
    });
};

// Inicializar banco de dados
initializeDatabase();

// ============================================
// FUNÇÕES AUXILIARES DO BANCO
// ============================================
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
// ROTAS DE AUTENTICAÇÃO (PÚBLICAS)
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
// ROTAS DE PRODUTOS (PÚBLICAS)
// ============================================

// ROTA 3: Listar produtos ativos (público)
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

// ============================================
// ROTAS ADMINISTRATIVAS (PROTEGIDAS)
// ============================================

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

// ROTA 5: Criar novo produto (admin)
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

// ROTA 6: Atualizar produto (admin)
app.put('/api/admin/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const product = await dbHelper.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        // Construir query dinâmica
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = fields.map(field => `${field} = ?`).join(', ');
        
        await dbHelper.run(
            `UPDATE products SET ${setClause}, updated_at = datetime("now") WHERE id = ?`,
            [...values, id]
        );
        
        res.json({
            success: true,
            message: 'Produto atualizado com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao atualizar produto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ROTA 7: Ativar/desativar produto (admin)
app.put('/api/admin/products/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await dbHelper.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        const newStatus = product.is_active ? 0 : 1;
        await dbHelper.run(
            'UPDATE products SET is_active = ?, updated_at = datetime("now") WHERE id = ?',
            [newStatus, id]
        );
        
        res.json({
            success: true,
            message: `Produto ${newStatus ? 'ativado' : 'desativado'}`,
            is_active: newStatus
        });
        
    } catch (error) {
        console.error('❌ Erro ao alternar produto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ROTA 8: Excluir produto (admin)
app.delete('/api/admin/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await dbHelper.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        await dbHelper.run('DELETE FROM products WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Produto excluído permanentemente'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir produto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ROTAS PÚBLICAS ADICIONAIS
// ============================================

// ROTA 9: Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        status: 'online',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ROTA 10: Informações da loja
app.get('/api/store', (req, res) => {
    res.json({
        success: true,
        store: {
            name: "MJ TECH",
            whatsapp: "https://wa.me/5519995189387",
            email: "contato@mjtech.com.br",
            catalog_type: "manual_complete"
        }
    });
});

// ROTA 11: Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        message: 'Sistema de catálogo com autenticação segura',
        endpoints: {
            public: {
                products: '/api/products',
                store: '/api/store',
                health: '/api/health'
            },
            admin: {
                login: 'POST /api/auth/login',
                products: 'GET /api/admin/products (requer token)'
            }
        }
    });
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

module.exports = app;
