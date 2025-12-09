const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 1800 }); // Cache de 30 minutos

// Configurar CORS para permitir GitHub Pages e localhost
const allowedOrigins = [
  'https://xM4T3US.github.io',
  'https://matjuniorrj.github.io',
  'https://mjtech.net.br',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:8080'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requisições sem origem (como mobile apps ou curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      // Para desenvolvimento, você pode permitir todas as origens
      // Em produção, mantenha apenas os domínios autorizados
      return callback(null, true); // TODO: Em produção, restrinja isso
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configurações do Mercado Livre
const ML_CONFIG = {
    CLIENT_ID: process.env.ML_CLIENT_ID || '2796287764814805',
    CLIENT_SECRET: process.env.ML_CLIENT_SECRET || '2Sp7CHFPuSVKOuYOea1Nk6Is2Z6WNl7J',
    SELLER_ID: process.env.ML_SELLER_ID || '356374200',
    ACCESS_TOKEN: null,
    TOKEN_EXPIRES: null
};

console.log('🚀 MJ TECH API - Configuração carregada');
console.log(`👤 Seller ID: ${ML_CONFIG.SELLER_ID}`);

// Função para obter access token
async function getAccessToken() {
    try {
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
        
        console.log('✅ Token obtido com sucesso');
        return ML_CONFIG.ACCESS_TOKEN;
        
    } catch (error) {
        console.error('❌ Erro na autenticação:', error.message);
        throw new Error('Falha na conexão com Mercado Livre');
    }
}

// Função para buscar produtos do vendedor
async function fetchProductsFromMercadoLivre() {
    try {
        let token = ML_CONFIG.ACCESS_TOKEN;
        
        // Verificar se precisa renovar o token
        if (!token || Date.now() >= ML_CONFIG.TOKEN_EXPIRES) {
            token = await getAccessToken();
        }
        
        console.log(`🔍 Buscando produtos da loja ${ML_CONFIG.SELLER_ID}...`);
        
        // Buscar anúncios do vendedor
        const response = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
            params: {
                seller_id: ML_CONFIG.SELLER_ID,
                limit: 12,
                sort: 'recent',
                status: 'active'
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 15000
        });
        
        const products = response.data.results.map((item, index) => {
            // Obter melhor imagem disponível
            let imageUrl = item.thumbnail;
            
            if (imageUrl) {
                imageUrl = imageUrl.replace('-I.jpg', '-O.jpg');
                imageUrl = imageUrl.replace('http://', 'https://');
            }
            
            if (item.pictures && item.pictures[0] && item.pictures[0].url) {
                imageUrl = item.pictures[0].url;
            }
            
            // Fallback para imagem
            if (!imageUrl || imageUrl.includes('placeholder')) {
                imageUrl = `https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH`;
            }
            
            // Calcular desconto
            let discount = null;
            if (item.original_price && item.original_price > item.price) {
                const discountValue = Math.round(((item.original_price - item.price) / item.original_price) * 100);
                discount = `${discountValue}% OFF`;
            }
            
            // Verificar frete grátis
            const freeShipping = item.shipping?.free_shipping || false;
            
            return {
                id: item.id,
                title: item.title,
                description: truncateText(item.title, 100),
                image: imageUrl,
                price: formatPrice(item.price),
                oldPrice: item.original_price ? formatPrice(item.original_price) : null,
                discount: discount,
                link: item.permalink,
                condition: item.condition === 'new' ? 'Novo' : 'Usado',
                available_quantity: item.available_quantity,
                sold_quantity: item.sold_quantity || 0,
                free_shipping: freeShipping,
                category: item.domain_id ? item.domain_id.replace('MLB-', '') : 'TECNOLOGIA'
            };
        });
        
        // Ordenar por disponibilidade
        products.sort((a, b) => b.available_quantity - a.available_quantity);
        
        console.log(`✅ ${products.length} produtos encontrados`);
        return products;
        
    } catch (error) {
        console.error('❌ Erro ao buscar produtos:', error.message);
        return getFallbackProducts();
    }
}

// Funções auxiliares
function truncateText(text, maxLength) {
    if (!text) return 'Produto MJ TECH';
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
    console.log('⚠️ Usando produtos de fallback');
    return [
        {
            id: 'mlb-fallback-1',
            title: "Reparo de Celular - MJ TECH",
            description: "Conserto profissional de smartphones com garantia e peças de qualidade",
            image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 99,90",
            oldPrice: "R$ 149,90",
            discount: "33% OFF",
            link: "https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular",
            condition: "Serviço",
            available_quantity: 999,
            sold_quantity: 150,
            free_shipping: false,
            category: "SERVIÇOS"
        },
        {
            id: 'mlb-fallback-2',
            title: "Manutenção de Notebook - MJ TECH",
            description: "Limpeza interna, formatação e otimização para notebooks e computadores",
            image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 129,90",
            oldPrice: "R$ 179,90",
            discount: "28% OFF",
            link: "https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook",
            condition: "Serviço",
            available_quantity: 999,
            sold_quantity: 89,
            free_shipping: false,
            category: "SERVIÇOS"
        },
        {
            id: 'mlb-fallback-3',
            title: "Mouse Gamer MJ TECH Edition",
            description: "Mouse gamer com design exclusivo MJ TECH, RGB e 16000 DPI",
            image: "https://images.unsplash.com/photo-1527814050087-3793815479db?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 79,90",
            oldPrice: "R$ 119,90",
            discount: "33% OFF",
            link: "https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre o mouse gamer",
            condition: "Novo",
            available_quantity: 25,
            sold_quantity: 42,
            free_shipping: true,
            category: "PERIFÉRICOS"
        },
        {
            id: 'mlb-fallback-4',
            title: "Teclado Mecânico MJ TECH Pro",
            description: "Teclado mecânico com switches Outemu Blue e iluminação RGB",
            image: "https://images.unsplash.com/photo-1541140532154-b024d705b90a?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80",
            price: "R$ 189,90",
            oldPrice: "R$ 279,90",
            discount: "32% OFF",
            link: "https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre o teclado mecânico",
            condition: "Novo",
            available_quantity: 18,
            sold_quantity: 31,
            free_shipping: true,
            category: "PERIFÉRICOS"
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
            console.log('🔄 Buscando produtos em tempo real...');
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
                expires_in: '30 minutos'
            }
        });
        
    } catch (error) {
        console.error('❌ Erro na API de produtos:', error.message);
        
        const fallbackProducts = getFallbackProducts();
        
        res.json({ 
            success: true,
            store: "MJ TECH",
            seller_id: ML_CONFIG.SELLER_ID,
            count: fallbackProducts.length,
            products: fallbackProducts,
            timestamp: new Date().toISOString(),
            source: 'fallback',
            message: 'Produtos reais serão carregados em breve'
        });
    }
});

// Rota para informações da loja
app.get('/api/store', async (req, res) => {
    try {
        res.json({
            success: true,
            store: {
                id: ML_CONFIG.SELLER_ID,
                nickname: "MJ TECH",
                permalink: "https://perfil.mercadolivre.com.br/MJ-TECH",
                country: "BR",
                message: "Loja especializada em tecnologia e reparos",
                contact: {
                    whatsapp: "https://wa.me/5519995189387",
                    website: "https://mjtech.net.br"
                }
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            success: true,
            store: {
                id: ML_CONFIG.SELLER_ID,
                nickname: "MJ TECH",
                message: "Loja especializada em tecnologia e reparos"
            }
        });
    }
});

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        status: 'operational',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.VERCEL_ENV || 'production',
        
        mercado_libre: {
            connected: !!ML_CONFIG.ACCESS_TOKEN,
            seller_id: ML_CONFIG.SELLER_ID,
            token_expires: ML_CONFIG.TOKEN_EXPIRES 
                ? new Date(ML_CONFIG.TOKEN_EXPIRES).toLocaleTimeString('pt-BR')
                : 'not_available'
        },
        
        cache: {
            enabled: true,
            ttl: '30 minutes',
            stats: cache.getStats()
        }
    });
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
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Rota de teste
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: '🎉 MJ TECH API está funcionando perfeitamente!',
        endpoints: {
            products: '/api/products',
            health: '/api/health',
            store: '/api/store',
            refresh: '/api/refresh'
        },
        deployment: 'Vercel',
        timestamp: new Date().toISOString()
    });
});

// Rota raiz com informações
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        description: 'API para integração com Mercado Livre',
        version: '2.0.0',
        endpoints: {
            products: '/api/products - Lista de produtos da loja',
            health: '/api/health - Status do sistema',
            store: '/api/store - Informações da loja',
            refresh: '/api/refresh - Forçar atualização de produtos'
        },
        store: {
            name: 'MJ TECH',
            seller_id: ML_CONFIG.SELLER_ID,
            website: 'https://mjtech.net.br',
            whatsapp: 'https://wa.me/5519995189387'
        },
        documentation: 'API pronta para integração com frontend'
    });
});

// Rota para teste CORS
app.options('*', cors());

// Middleware de erro
app.use((err, req, res, next) => {
    console.error('Erro:', err.message);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Exportar app para Vercel
module.exports = app;
