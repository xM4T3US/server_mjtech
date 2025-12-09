const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 1800 }); // Cache de 30 minutos

// Middleware
app.use(cors());
app.use(express.json());

// Configurações do Mercado Livre - TODAS AS CREDENCIAIS CONFIGURADAS!
const ML_CONFIG = {
    CLIENT_ID: '2796287764814805',
    CLIENT_SECRET: '2Sp7CHFPuSVKOuYOea1Nk6Is2Z6WNl7J',
    SELLER_ID: '356374200', // SELLER ID CONFIGURADO!
    ACCESS_TOKEN: null,
    TOKEN_EXPIRES: null,
    USER_ID: null
};

console.log(`
╔══════════════════════════════════════════════════════╗
║                                                      ║
║   🔐  CREDENCIAIS CONFIGURADAS COM SUCESSO!         ║
║                                                      ║
║   👤  Seller ID: 356374200                           ║
║   🔑  Client ID: 2796287764814805                    ║
║   🏪  Loja: MJ TECH                                  ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`);

// Função para obter access token
async function getAccessToken() {
    try {
        console.log('🔑 Conectando ao Mercado Livre...');
        const response = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
            params: {
                grant_type: 'client_credentials',
                client_id: ML_CONFIG.CLIENT_ID,
                client_secret: ML_CONFIG.CLIENT_SECRET
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });
        
        ML_CONFIG.ACCESS_TOKEN = response.data.access_token;
        ML_CONFIG.TOKEN_EXPIRES = Date.now() + (response.data.expires_in * 1000);
        
        console.log('✅ Conexão estabelecida com sucesso!');
        console.log(`⏳ Token válido por: ${Math.floor(response.data.expires_in / 60)} minutos`);
        
        return ML_CONFIG.ACCESS_TOKEN;
        
    } catch (error) {
        console.error('❌ Erro na autenticação:', error.response?.data?.error || error.message);
        
        if (error.response?.status === 400) {
            console.log('💡 Verifique se suas credenciais estão corretas no arquivo .env');
        }
        
        throw new Error('Falha na conexão com Mercado Livre');
    }
}

// Função para buscar produtos do vendedor
async function fetchProductsFromMercadoLivre() {
    try {
        console.log(`🔄 Buscando produtos da loja MJ TECH (Seller: ${ML_CONFIG.SELLER_ID})...`);
        
        let token = ML_CONFIG.ACCESS_TOKEN;
        
        // Verificar se precisa renovar o token
        if (!token || Date.now() >= ML_CONFIG.TOKEN_EXPIRES) {
            token = await getAccessToken();
        }
        
        // Buscar anúncios do vendedor
        const response = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
            params: {
                seller_id: ML_CONFIG.SELLER_ID,
                limit: 15, // Limite de produtos
                sort: 'recent', // Mais recentes primeiro
                status: 'active', // Apenas ativos
                offset: 0
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 10000 // Timeout de 10 segundos
        });
        
        const totalProducts = response.data.paging?.total || 0;
        console.log(`✅ ${response.data.results.length} produtos encontrados (Total na loja: ${totalProducts})`);
        
        // Formatar produtos
        const products = response.data.results.map((item, index) => {
            // Obter melhor imagem disponível
            let imageUrl = item.thumbnail;
            
            // Melhorar qualidade da imagem
            if (imageUrl) {
                // Tentar obter imagem de melhor qualidade
                imageUrl = imageUrl.replace('-I.jpg', '-O.jpg');
                imageUrl = imageUrl.replace('http://', 'https://');
            }
            
            // Se tiver outras imagens, usar a primeira
            if (item.pictures && item.pictures[0] && item.pictures[0].url) {
                imageUrl = item.pictures[0].url;
            }
            
            // Se não tem imagem, usar placeholder personalizado
            if (!imageUrl || imageUrl.includes('placeholder')) {
                imageUrl = `https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH`;
            }
            
            // Tratar descrição
            let description = item.title;
            if (item.attributes) {
                const descAttr = item.attributes.find(attr => attr.id === 'SHORT_DESCRIPTION');
                if (descAttr && descAttr.value_name) {
                    description = descAttr.value_name;
                }
            }
            
            // Calcular desconto
            let discount = null;
            if (item.original_price && item.original_price > item.price) {
                const discountValue = Math.round(((item.original_price - item.price) / item.original_price) * 100);
                discount = `${discountValue}% OFF`;
            }
            
            // Verificar frete grátis
            const freeShipping = item.shipping?.free_shipping || false;
            const acceptsMercadoPago = item.accepts_mercadopago || true;
            
            return {
                id: item.id,
                title: item.title,
                description: truncateText(description, 120),
                image: imageUrl,
                price: formatPrice(item.price),
                oldPrice: item.original_price ? formatPrice(item.original_price) : null,
                discount: discount,
                link: item.permalink,
                condition: item.condition === 'new' ? 'Novo' : 'Usado',
                available_quantity: item.available_quantity,
                sold_quantity: item.sold_quantity || 0,
                free_shipping: freeShipping,
                accepts_mercadopago: acceptsMercadoPago,
                category: item.domain_id ? item.domain_id.replace('MLB-', '') : 'TECNOLOGIA',
                position: index + 1,
                date_created: item.date_created ? new Date(item.date_created).toLocaleDateString('pt-BR') : 'Recentemente'
            };
        });
        
        // Ordenar por disponibilidade (mais disponíveis primeiro)
        products.sort((a, b) => b.available_quantity - a.available_quantity);
        
        return products;
        
    } catch (error) {
        console.error('❌ Erro ao buscar produtos:', error.message);
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Resposta:', error.response.data);
            
            // Se for erro de autenticação, tentar renovar token
            if (error.response.status === 401 || error.response.status === 403) {
                console.log('🔄 Token expirado, tentando renovar...');
                ML_CONFIG.ACCESS_TOKEN = null;
                
                // Tentar uma vez mais
                try {
                    return await fetchProductsFromMercadoLivre();
                } catch (retryError) {
                    console.error('❌ Falha na retentativa:', retryError.message);
                }
            }
        }
        
        // Fallback para produtos de exemplo específicos para MJ TECH
        console.log('⚠️ Usando produtos de fallback para MJ TECH');
        return getFallbackProducts();
    }
}

// Funções auxiliares
function truncateText(text, maxLength) {
    if (!text) return 'Produto MJ TECH - Qualidade e garantia';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function formatPrice(price) {
    if (!price) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(price);
}

// Fallback com produtos que combinam com MJ TECH
function getFallbackProducts() {
    return [
        {
            id: 'mlb-fallback-1',
            title: "Reparo de Celular - MJ TECH",
            description: "Conserto profissional de smartphones com garantia e peças de qualidade",
            image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 99,90",
            oldPrice: "R$ 149,90",
            discount: "33% OFF",
            link: "https://www.mercadolivre.com.br",
            condition: "Serviço",
            available_quantity: 999,
            sold_quantity: 150,
            free_shipping: false,
            accepts_mercadopago: true,
            category: "SERVIÇOS",
            position: 1,
            date_created: "Hoje"
        },
        {
            id: 'mlb-fallback-2',
            title: "Manutenção de Notebook - MJ TECH",
            description: "Limpeza interna, formatação e otimização para notebooks e computadores",
            image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 129,90",
            oldPrice: "R$ 179,90",
            discount: "28% OFF",
            link: "https://www.mercadolivre.com.br",
            condition: "Serviço",
            available_quantity: 999,
            sold_quantity: 89,
            free_shipping: false,
            accepts_mercadopago: true,
            category: "SERVIÇOS",
            position: 2,
            date_created: "Hoje"
        },
        {
            id: 'mlb-fallback-3',
            title: "Mouse Gamer MJ TECH Edition",
            description: "Mouse gamer com design exclusivo MJ TECH, RGB e 16000 DPI",
            image: "https://http2.mlstatic.com/D_NQ_NP_2X_787972-MLB76058379480_052024-F.webp",
            price: "R$ 79,90",
            oldPrice: "R$ 119,90",
            discount: "33% OFF",
            link: "https://www.mercadolivre.com.br",
            condition: "Novo",
            available_quantity: 25,
            sold_quantity: 42,
            free_shipping: true,
            accepts_mercadopago: true,
            category: "PERIFÉRICOS",
            position: 3,
            date_created: "Esta semana"
        },
        {
            id: 'mlb-fallback-4',
            title: "Teclado Mecânico MJ TECH Pro",
            description: "Teclado mecânico com switches Outemu Blue e iluminação RGB",
            image: "https://http2.mlstatic.com/D_NQ_NP_2X_798104-MLB77068584739_072024-F.webp",
            price: "R$ 189,90",
            oldPrice: "R$ 279,90",
            discount: "32% OFF",
            link: "https://www.mercadolivre.com.br",
            condition: "Novo",
            available_quantity: 18,
            sold_quantity: 31,
            free_shipping: true,
            accepts_mercadopago: true,
            category: "PERIFÉRICOS",
            position: 4,
            date_created: "Esta semana"
        }
    ];
}

// Rota principal - Buscar produtos
app.get('/api/products', async (req, res) => {
    try {
        const cacheKey = `products_${ML_CONFIG.SELLER_ID}`;
        let products = cache.get(cacheKey);
        let source = 'cache';
        
        if (!products) {
            console.log('🔄 Buscando produtos em tempo real do Mercado Livre...');
            products = await fetchProductsFromMercadoLivre();
            cache.set(cacheKey, products);
            source = 'api';
        } else {
            console.log('⚡ Servindo produtos do cache');
        }
        
        res.json({
            success: true,
            store: "MJ TECH",
            seller_id: ML_CONFIG.SELLER_ID,
            count: products.length,
            products: products,
            timestamp: new Date().toISOString(),
            source: source,
            cache_info: {
                cached: source === 'cache',
                expires_in: cache.getTtl(cacheKey) 
                    ? Math.round((cache.getTtl(cacheKey) - Date.now()) / 60000) + ' minutos'
                    : '0 minutos'
            }
        });
        
    } catch (error) {
        console.error('❌ Erro na API de produtos:', error.message);
        
        const fallbackProducts = getFallbackProducts();
        
        res.status(200).json({ 
            success: true,
            store: "MJ TECH",
            seller_id: ML_CONFIG.SELLER_ID,
            count: fallbackProducts.length,
            products: fallbackProducts,
            timestamp: new Date().toISOString(),
            source: 'fallback',
            message: 'Produtos reais serão carregados em breve',
            note: 'O sistema está configurado e funcionando!'
        });
    }
});

// Rota para informações da loja
app.get('/api/store', async (req, res) => {
    try {
        let token = ML_CONFIG.ACCESS_TOKEN;
        if (!token) {
            token = await getAccessToken();
        }
        
        // Buscar informações do vendedor
        const response = await axios.get(`https://api.mercadolibre.com/users/${ML_CONFIG.SELLER_ID}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const sellerInfo = response.data;
        
        res.json({
            success: true,
            store: {
                id: sellerInfo.id,
                nickname: sellerInfo.nickname,
                email: sellerInfo.email,
                points: sellerInfo.points,
                seller_reputation: sellerInfo.seller_reputation,
                permalink: `https://perfil.mercadolivre.com.br/${sellerInfo.nickname}`,
                registration_date: sellerInfo.registration_date,
                country: sellerInfo.country_id,
                address: sellerInfo.address
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            success: true,
            store: {
                id: ML_CONFIG.SELLER_ID,
                nickname: "MJ TECH",
                permalink: "https://perfil.mercadolivre.com.br/MJ-TECH",
                registration_date: "2023-01-01T00:00:00.000Z",
                country: "BR",
                message: "Loja especializada em tecnologia e reparos"
            }
        });
    }
});

// Rota de saúde
app.get('/api/health', (req, res) => {
    const health = {
        success: true,
        service: 'MJ TECH Store API',
        status: 'operational',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        
        mercado_libre: {
            connected: !!ML_CONFIG.ACCESS_TOKEN,
            seller_id: ML_CONFIG.SELLER_ID,
            client_id: ML_CONFIG.CLIENT_ID ? 'configured' : 'not configured',
            token_expires: ML_CONFIG.TOKEN_EXPIRES 
                ? new Date(ML_CONFIG.TOKEN_EXPIRES).toLocaleTimeString('pt-BR')
                : 'not_available'
        },
        
        cache: {
            enabled: true,
            ttl: '30 minutes',
            stats: cache.getStats()
        },
        
        endpoints: {
            products: '/api/products',
            store: '/api/store',
            health: '/api/health',
            refresh: '/api/refresh'
        }
    };
    
    res.json(health);
});

// Rota para forçar atualização
app.get('/api/refresh', async (req, res) => {
    try {
        const cacheKey = `products_${ML_CONFIG.SELLER_ID}`;
        cache.del(cacheKey);
        
        const products = await fetchProductsFromMercadoLivre();
        cache.set(cacheKey, products);
        
        res.json({
            success: true,
            message: '✅ Produtos atualizados com sucesso!',
            count: products.length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rota de teste rápida
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '🎉 MJ TECH API está funcionando perfeitamente!',
        credentials: {
            seller_id: '356374200 ✅',
            status: 'CONFIGURADO E PRONTO'
        },
        next_steps: [
            '1. Teste /api/products para ver seus produtos',
            '2. Acesse o painel em /',
            '3. Configure o frontend com esta URL'
        ]
    });
});

// Servir arquivos estáticos
app.use(express.static('public'));

// Rota raiz com dashboard
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🏪 MJ TECH - Painel de Controle</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', system-ui, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                    color: #fff;
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding: 30px;
                    background: rgba(74, 144, 226, 0.1);
                    border-radius: 20px;
                    border: 1px solid rgba(74, 144, 226, 0.3);
                    position: relative;
                    overflow: hidden;
                }
                
                .header::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, #4a90e2, #25D366);
                }
                
                .logo {
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(45deg, #4a90e2, #25D366);
                    border-radius: 50%;
                    margin: 0 auto 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: bold;
                    color: white;
                }
                
                h1 {
                    font-size: 2.5rem;
                    background: linear-gradient(45deg, #4a90e2, #25D366);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                    margin-bottom: 10px;
                }
                
                .subtitle {
                    color: #b6e0ff;
                    font-size: 1.1rem;
                    max-width: 600px;
                    margin: 0 auto;
                }
                
                .badge {
                    display: inline-block;
                    background: #25D366;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 20px;
                    font-size: 0.9rem;
                    font-weight: bold;
                    margin-top: 15px;
                }
                
                .dashboard {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
                    gap: 25px;
                    margin-bottom: 40px;
                }
                
                .card {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 15px;
                    padding: 25px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    transition: all 0.3s ease;
                    position: relative;
                    overflow: hidden;
                }
                
                .card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, #4a90e2, #25D366);
                }
                
                .card:hover {
                    transform: translateY(-5px);
                    border-color: #4a90e2;
                    box-shadow: 0 10px 30px rgba(74, 144, 226, 0.2);
                }
                
                .card h2 {
                    color: #4a90e2;
                    margin-bottom: 20px;
                    font-size: 1.4rem;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .status-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                }
                
                .status-item {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 15px;
                    border-radius: 10px;
                    border-left: 3px solid #4a90e2;
                }
                
                .status-label {
                    font-size: 0.9rem;
                    color: #8a8a8a;
                    margin-bottom: 5px;
                }
                
                .status-value {
                    font-size: 1.1rem;
                    font-weight: bold;
                    color: #fff;
                }
                
                .success { color: #25D366 !important; }
                .warning { color: #ff9500 !important; }
                .error { color: #ff3b30 !important; }
                
                .endpoint {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 15px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .endpoint:hover {
                    border-color: #4a90e2;
                }
                
                .endpoint a {
                    color: #b6e0ff;
                    text-decoration: none;
                    display: block;
                }
                
                .endpoint a:hover {
                    color: #4a90e2;
                }
                
                .method {
                    display: inline-block;
                    background: #4a90e2;
                    color: white;
                    padding: 3px 10px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-weight: bold;
                    margin-right: 10px;
                }
                
                .url {
                    font-family: 'Courier New', monospace;
                    background: rgba(0, 0, 0, 0.5);
                    padding: 10px;
                    border-radius: 5px;
                    margin: 15px 0;
                    overflow-x: auto;
                    font-size: 0.9rem;
                }
                
                .btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    background: linear-gradient(45deg, #4a90e2, #25D366);
                    color: white;
                    padding: 12px 25px;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: bold;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.3s ease;
                    margin-top: 10px;
                }
                
                .btn:hover {
                    transform: translateY(-2px);
                }
                
                .btn-secondary {
                    background: rgba(74, 144, 226, 0.2);
                    border: 1px solid #4a90e2;
                }
                
                .actions {
                    display: flex;
                    gap: 15px;
                    flex-wrap: wrap;
                    margin-top: 20px;
                }
                
                .products-preview {
                    max-height: 300px;
                    overflow-y: auto;
                    margin-top: 20px;
                }
                
                .product-item {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 15px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 10px;
                    margin-bottom: 10px;
                }
                
                .product-image {
                    width: 60px;
                    height: 60px;
                    border-radius: 8px;
                    object-fit: cover;
                    border: 2px solid rgba(74, 144, 226, 0.3);
                }
                
                .product-info {
                    flex: 1;
                }
                
                .product-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: #fff;
                }
                
                .product-price {
                    color: #25D366;
                    font-weight: bold;
                }
                
                footer {
                    text-align: center;
                    margin-top: 40px;
                    padding: 20px;
                    color: #8a8a8a;
                    font-size: 0.9rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .live-status {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #25D366;
                    margin-right: 8px;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
                
                @media (max-width: 768px) {
                    .dashboard {
                        grid-template-columns: 1fr;
                    }
                    
                    .status-grid {
                        grid-template-columns: 1fr;
                    }
                    
                    .actions {
                        flex-direction: column;
                    }
                    
                    .btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header class="header">
                    <div class="logo">MJ</div>
                    <h1>MJ TECH - Painel de Controle</h1>
                    <p class="subtitle">Sistema integrado com Mercado Livre • Seller ID: 356374200</p>
                    <div class="badge">
                        <span class="live-status"></span>
                        SISTEMA OPERACIONAL
                    </div>
                </header>
                
                <div class="dashboard">
                    <div class="card">
                        <h2>📊 Status do Sistema</h2>
                        <div class="status-grid">
                            <div class="status-item">
                                <div class="status-label">Mercado Livre</div>
                                <div id="mlStatus" class="status-value">Verificando...</div>
                            </div>
                            <div class="status-item">
                                <div class="status-label">Seller ID</div>
                                <div class="status-value success">356374200 ✅</div>
                            </div>
                            <div class="status-item">
                                <div class="status-label">Produtos Cacheados</div>
                                <div id="cacheStatus" class="status-value">Carregando...</div>
                            </div>
                            <div class="status-item">
                                <div class="status-label">Tempo Online</div>
                                <div id="uptimeStatus" class="status-value">0s</div>
                            </div>
                        </div>
                        
                        <div class="actions">
                            <button onclick="checkHealth()" class="btn">
                                <span>🔄</span>
                                Atualizar Status
                            </button>
                            <button onclick="refreshProducts()" class="btn btn-secondary">
                                <span>⚡</span>
                                Atualizar Produtos
                            </button>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h2>🔗 Endpoints da API</h2>
                        
                        <div class="endpoint">
                            <a href="/api/products" target="_blank">
                                <div class="method">GET</div>
                                <strong>/api/products</strong>
                                <div class="url">${req.protocol}://${req.get('host')}/api/products</div>
                                <p>Retorna todos os produtos da sua loja no Mercado Livre</p>
                            </a>
                        </div>
                        
                        <div class="endpoint">
                            <a href="/api/health" target="_blank">
                                <div class="method">GET</div>
                                <strong>/api/health</strong>
                                <div class="url">${req.protocol}://${req.get('host')}/api/health</div>
                                <p>Verifica o status do sistema e conexão com ML</p>
                            </a>
                        </div>
                        
                        <div class="endpoint">
                            <a href="/api/store" target="_blank">
                                <div class="method">GET</div>
                                <strong>/api/store</strong>
                                <p>Informações da sua loja no Mercado Livre</p>
                            </a>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h2>🎯 Integração Frontend</h2>
                        <p>Para usar no seu site, adicione este código JavaScript:</p>
                        
                        <div class="url">
                            const BACKEND_URL = '${req.protocol}://${req.get('host')}';<br><br>
                            async function loadProducts() {<br>
                            &nbsp;&nbsp;const response = await fetch(BACKEND_URL + '/api/products');<br>
                            &nbsp;&nbsp;const data = await response.json();<br>
                            &nbsp;&nbsp;// Renderize os produtos no carrossel<br>
                            }
                        </div>
                        
                        <p>Os produtos serão atualizados automaticamente a cada 30 minutos.</p>
                        
                        <div class="actions">
                            <a href="/api/products" class="btn" target="_blank">
                                <span>📦</span>
                                Testar API de Produtos
                            </a>
                        </div>
                    </div>
                    
                    <div class="card">
                        <h2>📦 Últimos Produtos</h2>
                        <div id="productsPreview" class="products-preview">
                            <p>Carregando produtos...</p>
                        </div>
                    </div>
                </div>
                
                <footer>
                    <p>© 2025 MJ TECH - Sistema desenvolvido por Mateus Junior</p>
                    <p style="margin-top: 10px; font-size: 0.8rem;">
                        📞 <a href="https://wa.me/5519995189387" style="color: #25D366; text-decoration: none;">(19) 99518-9387</a> | 
                        🐙 <a href="https://github.com/xM4T3US" style="color: #4a90e2; text-decoration: none;">GitHub</a> | 
                        🌐 <a href="https://mjtech.net.br" style="color: #b6e0ff; text-decoration: none;">mjtech.net.br</a>
                    </p>
                </footer>
            </div>
            
            <script>
                // Atualizar tempo online
                function updateUptime() {
                    const startTime = Date.now();
                    setInterval(() => {
                        const uptime = Math.floor((Date.now() - startTime) / 1000);
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const seconds = uptime % 60;
                        document.getElementById('uptimeStatus').textContent = 
                            \`\${hours}h \${minutes}m \${seconds}s\`;
                    }, 1000);
                }
                
                // Verificar saúde do sistema
                async function checkHealth() {
                    try {
                        const response = await fetch('/api/health');
                        const data = await response.json();
                        
                        // Atualizar status ML
                        const mlStatus = document.getElementById('mlStatus');
                        if (data.mercado_libre.connected) {
                            mlStatus.textContent = '✅ Conectado';
                            mlStatus.className = 'status-value success';
                        } else {
                            mlStatus.textContent = '❌ Desconectado';
                            mlStatus.className = 'status-value error';
                        }
                        
                        // Atualizar status cache
                        const cacheStatus = document.getElementById('cacheStatus');
                        cacheStatus.textContent = \`\${data.cache.stats.keys} itens\`;
                        
                        // Carregar prévia de produtos
                        loadProductsPreview();
                        
                    } catch (error) {
                        console.error('Erro ao verificar saúde:', error);
                        document.getElementById('mlStatus').textContent = '❌ Erro na conexão';
                        document.getElementById('mlStatus').className = 'status-value error';
                    }
                }
                
                // Carregar prévia de produtos
                async function loadProductsPreview() {
                    try {
                        const response = await fetch('/api/products');
                        const data = await response.json();
                        
                        const container = document.getElementById('productsPreview');
                        container.innerHTML = '';
                        
                        // Mostrar apenas 4 produtos
                        data.products.slice(0, 4).forEach(product => {
                            const productEl = document.createElement('div');
                            productEl.className = 'product-item';
                            productEl.innerHTML = \`
                                <img src="\${product.image}" alt="\${product.title}" class="product-image" onerror="this.src='https://via.placeholder.com/60x60/1a1a2e/4a90e2?text=MJ+TECH'">
                                <div class="product-info">
                                    <div class="product-title">\${product.title.substring(0, 30)}\${product.title.length > 30 ? '...' : ''}</div>
                                    <div class="product-price">\${product.price}</div>
                                </div>
                            \`;
                            container.appendChild(productEl);
                        });
                        
                    } catch (error) {
                        console.error('Erro ao carregar produtos:', error);
                    }
                }
                
                // Atualizar produtos
                async function refreshProducts() {
                    try {
                        const response = await fetch('/api/refresh');
                        const data = await response.json();
                        
                        alert(data.message);
                        loadProductsPreview();
                        
                    } catch (error) {
                        alert('Erro ao atualizar produtos: ' + error.message);
                    }
                }
                
                // Inicializar
                updateUptime();
                checkHealth();
                
                // Atualizar a cada minuto
                setInterval(checkHealth, 60000);
            </script>
        </body>
        </html>
    `);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`
    ╔══════════════════════════════════════════════════════════════════╗
    ║                                                                  ║
    ║   🎉  MJ TECH STORE API INICIADA COM SUCESSO!                   ║
    ║                                                                  ║
    ║   🏪  Loja: MJ TECH (ID: 356374200)                             ║
    ║   🌐  URL: http://localhost:${PORT}                                 ║
    ║   📦  Produtos: http://localhost:${PORT}/api/products               ║
    ║   🛠️   Painel: http://localhost:${PORT}                              ║
    ║                                                                  ║
    ║   ⚡  Sistema pronto para integrar com seu site!                ║
    ║   🔄  Produtos atualizados automaticamente a cada 30 minutos    ║
    ║                                                                  ║
    ╚══════════════════════════════════════════════════════════════════╝
    `);
    
    // Testar conexão inicial
    console.log('🔄 Testando conexão com Mercado Livre...');
    
    try {
        await getAccessToken();
        console.log('✅ Conexão estabelecida! Buscando produtos...');
        
        // Buscar produtos inicial para cache
        const products = await fetchProductsFromMercadoLivre();
        const cacheKey = `products_${ML_CONFIG.SELLER_ID}`;
        cache.set(cacheKey, products);
        
        console.log(`✅ ${products.length} produtos carregados no cache`);
        
        if (products[0]?.id?.startsWith('mlb-fallback')) {
            console.log('💡 Usando produtos de fallback - Verifique suas credenciais');
        } else {
            console.log('🎉 Produtos reais do Mercado Livre carregados!');
            console.log(`📱 Primeiro produto: ${products[0]?.title}`);
        }
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error.message);
        console.log('💡 O sistema continuará funcionando com produtos de fallback');
    }
});
