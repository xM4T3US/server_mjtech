const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
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
// CONEXÃO COM SUPABASE
// ============================================
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

console.log('✅ Supabase conectado');

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
const formatPrice = (price) => {
    if (!price || isNaN(price)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(price);
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
        
        // Buscar usuário no Supabase
        const { data: user, error } = await supabase
            .from('admin_users')
            .select('*')
            .eq('id', decoded.id)
            .eq('is_active', true)
            .single();

        if (error || !user) {
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

        // Buscar usuário no Supabase
        const { data: users, error } = await supabase
            .from('admin_users')
            .select('*')
            .or(`username.eq.${username},email.eq.${username}`)
            .eq('is_active', true);

        if (error || !users || users.length === 0) {
            console.log('❌ Usuário não encontrado:', username);
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        const user = users[0];

        // Verificar senha
        const passwordValid = bcrypt.compareSync(password, user.password_hash);
        
        if (!passwordValid) {
            console.log('❌ Senha inválida para:', username);
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas'
            });
        }

        // Atualizar último login
        await supabase
            .from('admin_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

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
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Erro Supabase:', error);
            throw error;
        }
        
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
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        
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
        
        const { data, error } = await supabase
            .from('products')
            .insert({
                id: productId,
                title: title,
                description: description || title,
                image_url: image || 'https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH',
                price: parseFloat(price),
                old_price: oldPrice ? parseFloat(oldPrice) : null,
                discount: discount || null,
                whatsapp_link: link,
                condition: condition || 'Novo',
                available_quantity: parseInt(available_quantity) || 10,
                sold_quantity: parseInt(sold_quantity) || 0,
                free_shipping: free_shipping ? true : false,
                category: category || 'TECNOLOGIA',
                is_active: true
            });

        if (error) throw error;
        
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
// ROTAS PÚBLICAS ADICIONAIS
// ============================================

// ROTA 6: Health Check
app.get('/api/health', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('id')
            .limit(1);
        
        res.json({
            success: true,
            service: 'MJ TECH Store API',
            status: 'online',
            version: '6.0.0',
            timestamp: new Date().toISOString(),
            database: 'Supabase PostgreSQL',
            supabase_connected: !error
        });
    } catch (error) {
        res.json({
            success: false,
            service: 'MJ TECH Store API',
            status: 'degraded',
            database: 'connection failed',
            error: error.message
        });
    }
});

// ROTA 7: Informações da loja
app.get('/api/store', (req, res) => {
    res.json({
        success: true,
        store: {
            name: "MJ TECH",
            whatsapp: "https://wa.me/5519995189387",
            email: "contato@mjtech.com.br",
            security: "Sistema protegido com JWT e Supabase"
        }
    });
});

// ROTA 8: Rota raiz
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API v6.0',
        message: 'Sistema completo com Supabase PostgreSQL',
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
        },
        instructions: 'Acesse /admin para o painel administrativo'
    });
});

// ============================================
// EXPORTAR APP PARA VERCEL
// ============================================

module.exports = app;
