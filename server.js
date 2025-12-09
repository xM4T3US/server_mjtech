const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 1800 });

app.use(cors());
app.use(express.json());

const ML_CONFIG = {
    CLIENT_ID: '2796287764814805',
    CLIENT_SECRET: '2Sp7CHFPuSVKOuYOea1Nk6Is2Z6WNl7J',
    SELLER_ID: '356374200',
    ACCESS_TOKEN: null,
    TOKEN_EXPIRES: null
};

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
        
        return ML_CONFIG.ACCESS_TOKEN;
        
    } catch (error) {
        throw new Error('Falha na conexão com Mercado Livre');
    }
}

async function fetchProductsFromMercadoLivre() {
    try {
        let token = ML_CONFIG.ACCESS_TOKEN;
        
        if (!token || Date.now() >= ML_CONFIG.TOKEN_EXPIRES) {
            token = await getAccessToken();
        }
        
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
            timeout: 10000
        });
        
        const products = response.data.results.map((item, index) => {
            let imageUrl = item.thumbnail;
            
            if (imageUrl) {
                imageUrl = imageUrl.replace('-I.jpg', '-O.jpg');
                imageUrl = imageUrl.replace('http://', 'https://');
            }
            
            if (item.pictures && item.pictures[0] && item.pictures[0].url) {
                imageUrl = item.pictures[0].url;
            }
            
            if (!imageUrl || imageUrl.includes('placeholder')) {
                imageUrl = `https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH`;
            }
            
            let discount = null;
            if (item.original_price && item.original_price > item.price) {
                const discountValue = Math.round(((item.original_price - item.price) / item.original_price) * 100);
                discount = `${discountValue}% OFF`;
            }
            
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
        
        products.sort((a, b) => b.available_quantity - a.available_quantity);
        return products;
        
    } catch (error) {
        console.error('Erro ao buscar produtos:', error.message);
        return getFallbackProducts();
    }
}

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
            link: "https://www.mercadolivre.com.br",
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
            image: "https://http2.mlstatic.com/D_NQ_NP_2X_787972-MLB76058379480_052024-F.webp",
            price: "R$ 79,90",
            oldPrice: "R$ 119,90",
            discount: "33% OFF",
            link: "https://www.mercadolivre.com.br",
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
            image: "https://http2.mlstatic.com/D_NQ_NP_2X_798104-MLB77068584739_072024-F.webp",
            price: "R$ 189,90",
            oldPrice: "R$ 279,90",
            discount: "32% OFF",
            link: "https://www.mercadolivre.com.br",
            condition: "Novo",
            available_quantity: 18,
            sold_quantity: 31,
            free_shipping: true,
            category: "PERIFÉRICOS"
        }
    ];
}

// Rotas da API
app.get('/api/products', async (req, res) => {
    try {
        const cacheKey = `products_${ML_CONFIG.SELLER_ID}`;
        let products = cache.get(cacheKey);
        let source = 'cache';
        
        if (!products) {
            products = await fetchProductsFromMercadoLivre();
            cache.set(cacheKey, products);
            source = 'api';
        }
        
        res.json({
            success: true,
            store: "MJ TECH",
            seller_id: ML_CONFIG.SELLER_ID,
            count: products.length,
            products: products,
            timestamp: new Date().toISOString(),
            source: source
        });
        
    } catch (error) {
        const fallbackProducts = getFallbackProducts();
        res.status(200).json({ 
            success: true,
            store: "MJ TECH",
            count: fallbackProducts.length,
            products: fallbackProducts,
            source: 'fallback'
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        service: 'MJ TECH Store API',
        status: 'operational',
        timestamp: new Date().toISOString(),
        mercado_libre: {
            connected: !!ML_CONFIG.ACCESS_TOKEN,
            seller_id: ML_CONFIG.SELLER_ID
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 MJ TECH API rodando em: http://localhost:${PORT}`);
    console.log(`📦 API de produtos: http://localhost:${PORT}/api/products`);
});
