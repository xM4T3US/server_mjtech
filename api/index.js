const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();

// ============================================
// CONFIGURAÇÕES
// ============================================
const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secret-key';
const TOKEN_EXPIRATION = '8h';

// Configurar CORS
app.use(cors({
    origin: '*', // Em produção, restrinja: ['https://seusite.com']
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// CONEXÃO COM POSTGRESQL (SUPABASE)
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessário para Supabase
    }
});

// Testar conexão com o banco
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erro ao conectar ao PostgreSQL:', err.message);
    } else {
        console.log('✅ Conectado ao PostgreSQL (Supabase)');
        release();
        
        // Inicializar banco de dados
        initializeDatabase();
    }
});

// ============================================
// INICIALIZAÇÃO DO BANCO DE DADOS
// ============================================
async function initializeDatabase() {
    try {
        console.log('🔄 Verificando e inicializando tabelas...');
        
        // Criar tabelas se não existirem
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                image_url TEXT,
                price DECIMAL(10,2) NOT NULL,
                old_price DECIMAL(10,2),
                discount VARCHAR(20),
                whatsapp_link TEXT NOT NULL,
                condition VARCHAR(20) DEFAULT 'Novo',
                available_quantity INTEGER DEFAULT 0,
                sold_quantity INTEGER DEFAULT 0,
                free_shipping BOOLEAN DEFAULT FALSE,
                category VARCHAR(50),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        
        console.log('✅ Tabelas verificadas/criadas');
        
        // Verificar se admin já existe
        const adminCheck = await pool.query(
            "SELECT id FROM admin_users WHERE username = $1",
            [process.env.ADMIN_USERNAME || 'admin_mjtech']
        );
        
        if (adminCheck.rows.length === 0) {
            // Criar usuário admin
            const adminPassword = process.env.ADMIN_PASSWORD || 'S3nh@F0rt3!2025';
            const passwordHash = bcrypt.hashSync(adminPassword, 10);
            
            await pool.query(
                `INSERT INTO admin_users (username, email, password_hash, full_name, role) 
                 VALUES ($1, $2, $3, $4, $5)`,
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
            console.log('⚠️ Altere a senha após o primeiro login!');
        }
        
        // Verificar produtos de exemplo
        const productsCheck = await pool.query("SELECT COUNT(*) as count FROM products");
        if (productsCheck.rows[0].count === '0') {
            await pool.query(`
                INSERT INTO products (id, title, description, image_url, price, old_price, discount, 
                                    whatsapp_link, condition, available_quantity, sold_quantity, 
                                    free_shipping, category) VALUES
                ('mjtech-001', 'Reparo de Celular - MJ TECH', 'Conserto profissional de smartphones com garantia e peças de qualidade', 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80', 99.90, 149.90, '33% OFF', 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular', 'Serviço', 999, 150, FALSE, 'SERVIÇOS'),
                ('mjtech-002', 'Manutenção de Notebook - MJ TECH', 'Limpeza interna, formatação e otimização para notebooks e computadores', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80', 129.90, 179.90, '28% OFF', 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook', 'Serviço', 50, 25, FALSE, 'SERVIÇOS')
            `);
            console.log('✅ Produtos de exemplo inseridos');
        }
        
        console.log('🎉 Banco de dados inicializado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro na inicialização do banco:', error.message);
    }
}

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
        const userResult = await pool.query(
            'SELECT * FROM admin_users WHERE id = $1 AND is_active = TRUE',
            [decoded.id]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'Usuário não encontrado ou inativo' 
            });
        }

        req.user = {
            id: userResult.rows[0].id,
            username: userResult.rows[0].username,
            email: userResult.rows[0].email,
            role: userResult.rows[0].role
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
        const userResult = await pool.query(
            'SELECT * FROM admin_users WHERE (username = $1 OR email = $1) AND is_active = TRUE',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        const user = userResult.rows[0];

        // Verificar senha
        const passwordValid = bcrypt.compareSync(password, user.password_hash);
        
        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Atualizar último login
        await pool.query(
            'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
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

// ROTA 3: Listar produtos ativos
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM products WHERE is_active = TRUE ORDER BY created_at DESC'
        );
        
        const formatPrice = (price) => {
            if (!price || isNaN(price)) return 'R$ 0,00';
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                minimumFractionDigits: 2
            }).format(price);
        };
        
        const formattedProducts = result.rows.map(product => ({
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
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json({
            success: true,
            count: result.rows.length,
            products: result.rows
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
        
        await pool.query(
            `INSERT INTO products 
            (id, title, description, image_url, price, old_price, discount, 
             whatsapp_link, condition, available_quantity, sold_quantity, 
             free_shipping, category) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
                free_shipping ? true : false,
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

// ROTA 6: Ativar/desativar produto (admin)
app.put('/api/admin/products/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        const product = result.rows[0];
        const newStatus = !product.is_active;
        
        await pool.query(
            'UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = $2',
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

// ============================================
// ROTAS PÚBLICAS ADICIONAIS
// ============================================

// ROTA 7: Health Check
app.get('/api/health', async (req, res) => {
    try {
        // Testar conexão com o banco
        await pool.query('SELECT 1');
        res.json({
            success: true,
            service: 'MJ TECH Store API',
            status: 'online',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            database: 'PostgreSQL (Supabase)'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            database: 'offline'
        });
    }
});

// ROTA 8: Informações da loja
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

// ROTA 9: Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API v2.0',
        message: 'Sistema com PostgreSQL (Supabase)',
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
// EXPORTAR APP PARA VERCEL
// ============================================

module.exports = app;
