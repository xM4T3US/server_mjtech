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
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(null, true); // Em produção, restrinja conforme necessário
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Configurações - SEM necessidade de Client ID/Secret
const STORE_CONFIG = {
    SELLER_ID: '356374200',
    STORE_NICKNAME: 'MJ-TECH' // Altere se seu nickname for diferente
};

console.log('🚀 MJ TECH API PÚBLICA - Configuração carregada');
console.log(`🏪 Loja: ${STORE_CONFIG.STORE_NICKNAME} (ID: ${STORE_CONFIG.SELLER_ID})`);

// ============================================
// FUNÇÃO PRINCIPAL - BUSCA PÚBLICA DE PRODUTOS
// ============================================

async function fetchProductsFromMercadoLivre() {
    try {
        console.log('🔍 Iniciando busca pública de produtos...');
        
        // ESTRATÉGIA 1: Buscar por NICKNAME (mais confiável)
        console.log(`👤 Buscando por nickname: ${STORE_CONFIG.STORE_NICKNAME}`);
        const nicknameResponse = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
            params: {
                nickname: STORE_CONFIG.STORE_NICKNAME,
                limit: 15,
                sort: 'recent',
                status: 'active'
            },
            timeout: 15000
        });
        
        console.log(`📊 Resultados por nickname: ${nicknameResponse.data.results?.length || 0}`);
        
        // Se encontrou produtos pelo nickname
        if (nicknameResponse.data.results && nicknameResponse.data.results.length > 0) {
            const products = formatProducts(nicknameResponse.data.results);
            console.log(`✅ ${products.length} produtos encontrados via nickname`);
            return products;
        }
        
        // ESTRATÉGIA 2: Buscar por USER_ID (alternativa)
        console.log(`🆔 Buscando por seller_id: ${STORE_CONFIG.SELLER_ID}`);
        try {
            const userIdResponse = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
                params: {
                    seller_id: STORE_CONFIG.SELLER_ID,
                    limit: 15,
                    sort: 'recent',
                    status: 'active'
                },
                timeout: 15000
            });
            
            console.log(`📊 Resultados por seller_id: ${userIdResponse.data.results?.length || 0}`);
            
            if (userIdResponse.data.results && userIdResponse.data.results.length > 0) {
                const products = formatProducts(userIdResponse.data.results);
                console.log(`✅ ${products.length} produtos encontrados via seller_id`);
                return products;
            }
        } catch (userIdError) {
            console.log(`⚠️ Busca por seller_id falhou: ${userIdError.message}`);
        }
        
        // ESTRATÉGIA 3: Buscar produtos relacionados à tecnologia
        console.log('🔧 Buscando produtos de tecnologia (fallback genérico)...');
        const techResponse = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
            params: {
                q: 'tecnologia celular computador notebook reparo',
                category: 'MLB1648', // Categoria de Informática
                limit: 12,
                sort: 'recent',
                official_store: true // Apenas lojas oficiais
            },
            timeout: 15000
        });
        
        console.log(`📊 Resultados genéricos: ${techResponse.data.results?.length || 0}`);
        
        if (techResponse.data.results && techResponse.data.results.length > 0) {
            const products = formatProducts(techResponse.data.results);
            console.log(`✅ ${products.length} produtos genéricos encontrados`);
            return products;
        }
        
        // Se todas as estratégias falharem
        console.log('⚠️ Todas as buscas falharam, usando fallback personalizado');
        return getFallbackProducts();
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO na busca pública:', error.message);
        console.error('Detalhes:', error.response?.data || 'Sem detalhes adicionais');
        
        // Última tentativa: buscar informação do usuário
        try {
            console.log('🔄 Tentando obter informações do usuário...');
            const userInfo = await axios.get(`https://api.mercadolibre.com/users/${STORE_CONFIG.SELLER_ID}`, {
                timeout: 10000
            });
            
            console.log(`👤 Usuário encontrado: ${userInfo.data.nickname}`);
            console.log(`📧 Email: ${userInfo.data.email}`);
            
            // Tenta buscar com o nickname real
            const finalAttempt = await axios.get(`https://api.mercadolibre.com/sites/MLB/search`, {
                params: {
                    nickname: userInfo.data.nickname,
                    limit: 10
                },
                timeout: 10000
            });
            
            if (finalAttempt.data.results && finalAttempt.data.results.length > 0) {
                return formatProducts(finalAttempt.data.results);
            }
            
        } catch (userError) {
            console.error('❌ Falha na recuperação do usuário:', userError.message);
        }
        
        return getFallbackProducts();
    }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function formatProducts(items) {
    if (!items || !Array.isArray(items)) {
        console.log('⚠️ Nenhum item para formatar');
        return getFallbackProducts();
    }
    
    return items.map((item, index) => {
        // Obter a melhor imagem disponível
        let imageUrl = item.thumbnail || '';
        
        // Melhorar qualidade da imagem
        if (imageUrl) {
            imageUrl = imageUrl.replace('-I.jpg', '-O.jpg');
            imageUrl = imageUrl.replace('http://', 'https://');
        }
        
        // Se tiver outras imagens, usar a primeira
        if (item.pictures && item.pictures[0] && item.pictures[0].url) {
            imageUrl = item.pictures[0].url;
        }
        
        // Fallback para imagem
        if (!imageUrl || imageUrl.includes('placeholder')) {
            imageUrl = `https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH+${index + 1}`;
        }
        
        // Calcular desconto
        let discount = null;
        if (item.original_price && item.original_price > item.price) {
            const discountValue = Math.round(((item.original_price - item.price) / item.original_price) * 100);
            discount = `${discountValue}% OFF`;
        }
        
        // Verificar frete grátis
        const freeShipping = item.shipping?.free_shipping || false;
        
        // Formatar título e descrição
        const title = item.title || 'Produto MJ TECH';
        const description = title.length > 120 ? title.substring(0, 120) + '...' : title;
        
        return {
            id: item.id || `prod-${Date.now()}-${index}`,
            title: title,
            description: description,
            image: imageUrl,
            price: formatPrice(item.price),
            oldPrice: item.original_price ? formatPrice(item.original_price) : null,
            discount: discount,
            link: item.permalink || `https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre produtos MJ TECH`,
            condition: item.condition === 'new' ? 'Novo' : 'Usado',
            available_quantity: item.available_quantity || 10,
            sold_quantity: item.sold_quantity || 0,
            free_shipping: freeShipping,
            category: item.domain_id ? item.domain_id.replace('MLB-', '') : 'TECNOLOGIA',
            source: 'ml_api' // Indica que veio da API real
        };
    });
}

function formatPrice(price) {
    if (!price || isNaN(price)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(price);
}

// Fallback com produtos que combinam com MJ TECH
function getFallbackProducts() {
    console.log('🛡️ Usando produtos de fallback da MJ TECH');
    return [
        {
            id: 'mjtech-service-1',
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
            category: "SERVIÇOS",
            source: 'fallback'
        },
        {
            id: 'mjtech-service-2',
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
            category: "SERVIÇOS",
            source: 'fallback'
        },
        {
            id: 'mjtech-product-1',
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
            category: "PERIFÉRICOS",
            source: 'fallback'
        },
        {
            id: 'mjtech-product-2',
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
            category: "PERIFÉRICOS",
            source: 'fallback'
        }
    ];
}

// ============================================
// ROTAS DA API
// ============================================

// Rota principal - Buscar produtos
app.get('/api/products', async (req, res) => {
    try {
        const cacheKey = `products_${STORE_CONFIG.SELLER_ID}`;
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
        
        // Determinar se são produtos reais ou fallback
        const hasRealProducts = products.some(p => p.source === 'ml_api');
        const productSource = hasRealProducts ? 'mercado_livre' : 'fallback';
        
        res.json({
            success: true,
            store: "MJ TECH",
            seller_id: STORE_CONFIG.SELLER_ID,
            nickname: STORE_CONFIG.STORE_NICKNAME,
            count: products.length,
            products: products.map(p => {
                const { source, ...rest } = p;
                return rest;
            }),
            timestamp: new Date().toISOString(),
            source: productSource,
            cache_info: {
                cached: source === 'cache',
                expires_in: '30 minutos'
            },
            note: productSource === 'mercado_livre' 
                ? '✅ Produtos reais do Mercado Livre' 
                : '🛡️ Produtos de exemplo da MJ TECH'
        });
        
    } catch (error) {
        console.error('❌ Erro na API de produtos:', error.message);
        
        const fallbackProducts = getFallbackProducts();
        
        res.json({ 
            success: true,
            store: "MJ TECH",
            seller_id: STORE_CONFIG.SELLER_ID,
            count: fallbackProducts.length,
            products: fallbackProducts.map(p => {
                const { source, ...rest } = p;
                return rest;
            }),
            timestamp: new Date().toISOString(),
            source: 'fallback',
            note: '🛡️ Sistema em manutenção - Produtos de exemplo'
        });
    }
});

// Rota para informações da loja
app.get('/api/store', (req, res) => {
    res.json({
        success: true,
        store: {
            id: STORE_CONFIG.SELLER_ID,
            nickname: STORE_CONFIG.STORE_NICKNAME,
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
});

// Rota de saúde
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API (Pública)',
        status: 'operational',
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.VERCEL_ENV || 'production',
        api_mode: 'public_no_auth',
        store: {
            nickname: STORE_CONFIG.STORE_NICKNAME,
            seller_id: STORE_CONFIG.SELLER_ID
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
        const cacheKey = `products_${STORE_CONFIG.SELLER_ID}`;
        cache.del(cacheKey);
        
        const products = await fetchProductsFromMercadoLivre();
        cache.set(cacheKey, products);
        
        const hasRealProducts = products.some(p => p.source === 'ml_api');
        
        res.json({
            success: true,
            message: hasRealProducts 
                ? '✅ Produtos atualizados do Mercado Livre!' 
                : '🛡️ Produtos de exemplo atualizados',
            count: products.length,
            source: hasRealProducts ? 'mercado_livre' : 'fallback',
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
        message: '🎉 MJ TECH API PÚBLICA funcionando!',
        endpoints: {
            products: '/api/products',
            health: '/api/health',
            store: '/api/store',
            refresh: '/api/refresh'
        },
        mode: 'public_api_no_authentication',
        note: 'Esta versão usa a API pública do Mercado Livre',
        timestamp: new Date().toISOString()
    });
});

// Rota raiz com informações
app.get('/', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API (Pública)',
        description: 'API pública para integração com Mercado Livre - Sem autenticação necessária',
        version: '3.0.0',
        endpoints: {
            products: '/api/products - Lista de produtos da loja',
            health: '/api/health - Status do sistema',
            store: '/api/store - Informações da loja',
            refresh: '/api/refresh - Forçar atualização de produtos'
        },
        store: {
            name: 'MJ TECH',
            seller_id: STORE_CONFIG.SELLER_ID,
            nickname: STORE_CONFIG.STORE_NICKNAME,
            website: 'https://mjtech.net.br',
            whatsapp: 'https://wa.me/5519995189387'
        },
        note: 'API configurada para busca pública - Modo sem autenticação OAuth'
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
