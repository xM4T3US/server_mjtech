const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { models } = require('./database');
require('dotenv').config();

const app = express();

// ============================================
// CONFIGURAÇÕES
// ============================================
const SECRET_KEY = process.env.JWT_SECRET;
const TOKEN_EXPIRATION = process.env.TOKEN_EXPIRATION || '8h';
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME) || 900; // 15 minutos

// Configurar CORS
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5500', 'https://server-mjtech.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MIDDLEWARES DE AUTENTICAÇÃO
// ============================================

// Middleware para verificar token JWT
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
        
        // Verificar se usuário ainda existe e está ativo
        const user = await models.users.findById(decoded.id);
        
        if (!user || !user.is_active) {
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

// Middleware para verificar permissão de admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Acesso restrito a administradores'
        });
    }
    next();
};

// Middleware para logging
const requestLogger = async (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', async () => {
        const duration = Date.now() - start;
        
        try {
            await models.users.logAccess({
                userId: req.user?.id || null,
                username: req.user?.username || 'anonymous',
                ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                action: `${req.method} ${req.originalUrl}`,
                success: res.statusCode < 400,
                details: `Status: ${res.statusCode}, Duration: ${duration}ms`
            });
        } catch (error) {
            console.error('Erro ao registrar log:', error);
        }
    });
    
    next();
};

app.use(requestLogger);

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

// ROTA: Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, remember = false } = req.body;

        // Validações básicas
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Usuário e senha são obrigatórios'
            });
        }

        // Buscar usuário por username ou email
        let user = await models.users.findByUsername(username);
        if (!user) {
            user = await models.users.findByEmail(username);
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Verificar se conta está bloqueada
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const lockTime = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);
            return res.status(423).json({
                success: false,
                error: `Conta bloqueada. Tente novamente em ${lockTime} minutos`
            });
        }

        // Verificar se usuário está ativo
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Conta desativada. Entre em contato com o administrador'
            });
        }

        // Verificar senha
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordValid) {
            // Incrementar tentativas falhas
            const failedAttempts = user.failed_attempts + 1;
            
            if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
                const lockUntil = new Date(Date.now() + LOCKOUT_TIME * 1000);
                
                await models.users.update(user.id, {
                    failed_attempts: failedAttempts,
                    locked_until: lockUntil.toISOString()
                });
                
                return res.status(423).json({
                    success: false,
                    error: 'Muitas tentativas falhas. Conta bloqueada por 15 minutos'
                });
            } else {
                await models.users.update(user.id, {
                    failed_attempts: failedAttempts
                });
                
                const attemptsLeft = MAX_LOGIN_ATTEMPTS - failedAttempts;
                return res.status(401).json({
                    success: false,
                    error: `Credenciais inválidas. ${attemptsLeft} tentativa(s) restante(s)`
                });
            }
        }

        // Login bem-sucedido - resetar tentativas falhas
        await models.users.update(user.id, {
            failed_attempts: 0,
            locked_until: null,
            last_login: new Date().toISOString()
        });

        // Gerar token JWT
        const tokenPayload = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        const token = jwt.sign(tokenPayload, SECRET_KEY, {
            expiresIn: remember ? '7d' : TOKEN_EXPIRATION
        });

        // Registrar log de acesso
        await models.users.logAccess({
            userId: user.id,
            username: user.username,
            ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            action: 'LOGIN',
            success: true,
            details: 'Login bem-sucedido'
        });

        // Retornar resposta
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

// ROTA: Verificar token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        valid: true
    });
});

// ROTA: Alterar senha
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Senha atual e nova senha são obrigatórias'
            });
        }

        // Buscar usuário
        const user = await models.users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar senha atual
        const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!passwordValid) {
            return res.status(400).json({
                success: false,
                error: 'Senha atual incorreta'
            });
        }

        // Criptografar nova senha
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Atualizar senha
        await models.users.update(user.id, {
            password_hash: newPasswordHash,
            failed_attempts: 0,
            locked_until: null
        });

        // Registrar log
        await models.users.logAccess({
            userId: user.id,
            username: user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'CHANGE_PASSWORD',
            success: true,
            details: 'Senha alterada com sucesso'
        });

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao alterar senha:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA: Logout (apenas registrar)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        await models.users.logAccess({
            userId: req.user.id,
            username: req.user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'LOGOUT',
            success: true,
            details: 'Logout realizado'
        });

        res.json({
            success: true,
            message: 'Logout realizado com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro no logout:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA: Obter perfil do usuário
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = await models.users.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                role: user.role,
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });
    } catch (error) {
        console.error('❌ Erro ao obter perfil:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ============================================
// ROTAS ADMINISTRATIVAS (PROTEGIDAS)
// ============================================

// ROTA: Listar usuários (apenas admin)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await models.users.getAll();
        
        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error('❌ Erro ao listar usuários:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA: Criar usuário (apenas admin)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, fullName, role = 'editor' } = req.body;

        // Validações
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({
                success: false,
                error: 'Todos os campos são obrigatórios'
            });
        }

        // Verificar se usuário já existe
        const existingUser = await models.users.findByUsername(username);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Nome de usuário já existe'
            });
        }

        const existingEmail = await models.users.findByEmail(email);
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                error: 'E-mail já cadastrado'
            });
        }

        // Criptografar senha
        const passwordHash = await bcrypt.hash(password, 10);

        // Criar usuário
        const result = await models.users.create({
            username,
            email,
            password_hash: passwordHash,
            full_name: fullName,
            role: ['admin', 'editor'].includes(role) ? role : 'editor'
        });

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            userId: result.id
        });

    } catch (error) {
        console.error('❌ Erro ao criar usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ============================================
// ROTAS DE PRODUTOS
// ============================================

// ROTA: Listar produtos (público)
app.get('/api/products', async (req, res) => {
    try {
        const products = await models.products.getActive();
        
        // Formatar preços
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

// ROTA: Listar todos os produtos (admin)
app.get('/api/admin/products', authenticateToken, async (req, res) => {
    try {
        const products = await models.products.getAll();
        const stats = await models.products.getStats();
        
        res.json({
            success: true,
            count: products.length,
            stats: stats,
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

// ROTA: Criar produto (admin)
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
        
        // Validações
        if (!title || !price || !link) {
            return res.status(400).json({
                success: false,
                error: 'Título, preço e link são obrigatórios'
            });
        }
        
        // Gerar ID único
        const productId = `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Calcular desconto automático
        let finalDiscount = discount;
        if (!discount && oldPrice && oldPrice > price) {
            const discountValue = Math.round(((oldPrice - price) / oldPrice) * 100);
            finalDiscount = `${discountValue}% OFF`;
        }
        
        // Criar produto
        await models.products.create({
            id: productId,
            title: title,
            description: description || title,
            image_url: image || 'https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH',
            price: parseFloat(price),
            old_price: oldPrice ? parseFloat(oldPrice) : null,
            discount: finalDiscount,
            whatsapp_link: link,
            condition: condition || 'Novo',
            available_quantity: parseInt(available_quantity) || 10,
            sold_quantity: parseInt(sold_quantity) || 0,
            free_shipping: free_shipping ? 1 : 0,
            category: category || 'TECNOLOGIA',
            is_active: 1
        });
        
        // Registrar log
        await models.users.logAccess({
            userId: req.user.id,
            username: req.user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'CREATE_PRODUCT',
            success: true,
            details: `Produto criado: ${title}`
        });
        
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

// ROTA: Atualizar produto (admin)
app.put('/api/admin/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Verificar se produto existe
        const product = await models.products.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        // Atualizar produto
        await models.products.update(id, updates);
        
        // Registrar log
        await models.users.logAccess({
            userId: req.user.id,
            username: req.user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'UPDATE_PRODUCT',
            success: true,
            details: `Produto atualizado: ${product.title}`
        });
        
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

// ROTA: Ativar/desativar produto (admin)
app.put('/api/admin/products/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se produto existe
        const product = await models.products.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        // Alternar status
        await models.products.toggleActive(id);
        const newStatus = !product.is_active;
        
        // Registrar log
        await models.users.logAccess({
            userId: req.user.id,
            username: req.user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'TOGGLE_PRODUCT',
            success: true,
            details: `Produto ${newStatus ? 'ativado' : 'desativado'}: ${product.title}`
        });
        
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

// ROTA: Excluir produto (admin)
app.delete('/api/admin/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se produto existe
        const product = await models.products.findById(id);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Produto não encontrado'
            });
        }
        
        // Excluir produto
        await models.products.delete(id);
        
        // Registrar log
        await models.users.logAccess({
            userId: req.user.id,
            username: req.user.username,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            action: 'DELETE_PRODUCT',
            success: true,
            details: `Produto excluído: ${product.title}`
        });
        
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
// ROTAS DE CONFIGURAÇÃO
// ============================================

// ROTA: Obter configurações
app.get('/api/admin/settings', authenticateToken, async (req, res) => {
    try {
        const settings = await models.settings.getAll();
        
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('❌ Erro ao obter configurações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA: Atualizar configuração
app.put('/api/admin/settings/:key', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Valor é obrigatório'
            });
        }
        
        await models.settings.set(key, value);
        
        res.json({
            success: true,
            message: 'Configuração atualizada'
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar configuração:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

// ROTA: Health Check
app.get('/api/health', async (req, res) => {
    try {
        const stats = await models.products.getStats();
        const userCount = await models.users.getAll();
        
        res.json({
            success: true,
            service: 'MJ TECH Store API',
            status: 'operational',
            version: '3.0.0',
            timestamp: new Date().toISOString(),
            database: 'SQLite',
            stats: {
                products: stats?.total || 0,
                products_active: stats?.active || 0,
                products_sold: stats?.total_sold || 0,
                users: userCount.length || 0
            }
        });
    } catch (error) {
        console.error('❌ Erro no health check:', error);
        res.status(500).json({
            success: false,
            error: 'Serviço indisponível'
        });
    }
});

// ROTA: Informações da loja
app.get('/api/store', async (req, res) => {
    try {
        const settings = await models.settings.getAll();
        
        res.json({
            success: true,
            store: {
                name: settings.store_name || "MJ TECH",
                whatsapp: settings.store_whatsapp || "https://wa.me/5519995189387",
                email: settings.store_email || "contato@mjtech.com.br",
                security: "Sistema protegido com autenticação JWT"
            }
        });
    } catch (error) {
        console.error('❌ Erro ao obter informações da loja:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor'
        });
    }
});

// ROTA: Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API v3.0',
        message: 'Sistema de catálogo com autenticação segura e banco de dados SQLite',
        endpoints: {
            public: {
                products: '/api/products',
                store: '/api/store',
                health: '/api/health'
            },
            admin: {
                login: '/api/auth/login',
                panel: '/admin (interface web)'
            }
        },
        security: 'Protegido com JWT, bcrypt e rate limiting'
    });
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function formatPrice(price) {
    if (!price || isNaN(price)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(price);
}

// ============================================
// MIDDLEWARE DE ERRO
// ============================================

app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado:', err.message);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
    });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

const PORT = process.env.PORT || 3000;

// Inicializar servidor apenas se não estiver em ambiente serverless
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('🚀 MJ TECH API v3.0 iniciada');
        console.log(`🔗 URL: http://localhost:${PORT}`);
        console.log('🔐 Sistema protegido com autenticação JWT');
        console.log('💾 Banco de dados: SQLite');
        console.log('📊 Endpoints disponíveis:');
        console.log('   /api/products      - Produtos públicos');
        console.log('   /api/auth/login    - Login administrativo');
        console.log('   /admin             - Painel administrativo');
    });
}

module.exports = app;
