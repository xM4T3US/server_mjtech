const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 3600 }); // Cache de 1 hora

// Configurar CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// BANCO DE DADOS SIMPLES (em memória)
// ============================================

let productsDatabase = [
  // EXEMPLO: Adicione seus links do Mercado Livre aqui
  // {
  //   id: 'MLB1234567890',
  //   mlUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890',
  //   customTitle: 'Reparo de Celular Premium',
  //   customDescription: 'Conserto completo com peças originais',
  //   customPrice: 129.90,
  //   active: true,
  //   createdAt: new Date().toISOString()
  // }
];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function extractProductId(url) {
  // Extrai ID de várias formas de URL do ML
  const patterns = [
    /MLB-(\d+)/,
    /\/MLB-(\d+)/,
    /\/p\/MLB(\d+)/,
    /items\/(MLB\d+)/,
    /(\d+)$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1].startsWith('MLB') ? match[1] : `MLB${match[1]}`;
    }
  }
  
  return null;
}

async function fetchProductFromML(url) {
  try {
    console.log(`🔍 Buscando produto: ${url}`);
    
    // Extrair ID do produto da URL
    const productId = extractProductId(url);
    if (!productId) {
      throw new Error('URL inválida do Mercado Livre');
    }
    
    // Buscar dados do produto na API pública do ML
    const response = await axios.get(`https://api.mercadolibre.com/items/${productId}`, {
      timeout: 10000
    });
    
    const item = response.data;
    
    // Buscar imagens separadamente (melhor qualidade)
    let images = [];
    if (item.pictures && item.pictures.length > 0) {
      images = item.pictures.map(pic => pic.url.replace('http://', 'https://'));
    }
    
    return {
      id: item.id,
      originalTitle: item.title,
      description: item.title, // Ou usar atributos SHORT_DESCRIPTION
      price: item.price,
      originalPrice: item.original_price,
      condition: item.condition,
      availableQuantity: item.available_quantity,
      soldQuantity: item.sold_quantity || 0,
      freeShipping: item.shipping?.free_shipping || false,
      permalink: item.permalink,
      images: images,
      thumbnail: item.thumbnail ? item.thumbnail.replace('http://', 'https://') : null,
      category: item.domain_id || 'TECNOLOGIA',
      rawData: item // Dados completos para referência
    };
    
  } catch (error) {
    console.error('❌ Erro ao buscar produto:', error.message);
    throw new Error(`Não foi possível buscar o produto: ${error.message}`);
  }
}

function formatPrice(price) {
  if (!price || isNaN(price)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(price);
}

function calculateDiscount(originalPrice, currentPrice) {
  if (!originalPrice || originalPrice <= currentPrice) return null;
  const discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  return `${discount}% OFF`;
}

function getDefaultImage(category) {
  const images = {
    'TECNOLOGIA': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    'CELULARES': 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    'INFORMÁTICA': 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    'ELETRÔNICOS': 'https://images.unsplash.com/photo-1498049794561-7780e7231661?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80'
  };
  
  return images[category] || 'https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH';
}

// Função para formatar produtos para resposta da API
function formatProductsForAPI(mlData, customData) {
  const productId = mlData.id;
  
  // Usar dados customizados ou do ML
  return {
    id: productId,
    title: customData.customTitle || mlData.originalTitle,
    description: customData.customDescription || mlData.description,
    image: mlData.images[0] || mlData.thumbnail || getDefaultImage(mlData.category),
    price: formatPrice(customData.customPrice || mlData.price),
    oldPrice: mlData.originalPrice ? formatPrice(mlData.originalPrice) : null,
    discount: calculateDiscount(mlData.originalPrice, mlData.price),
    link: customData.mlUrl,
    condition: mlData.condition === 'new' ? 'Novo' : 'Usado',
    available_quantity: mlData.availableQuantity,
    sold_quantity: mlData.soldQuantity,
    free_shipping: mlData.freeShipping,
    category: mlData.category.replace('MLB-', ''),
    source: 'ml_direct',
    custom: !!customData.customTitle
  };
}

// ============================================
// ROTAS DA API (BACKEND)
// ============================================

// ROTA 1: API principal - Listar produtos para o site
app.get('/api/products', async (req, res) => {
  try {
    const activeProducts = productsDatabase.filter(p => p.active);
    
    if (activeProducts.length === 0) {
      return res.json({
        success: true,
        store: "MJ TECH",
        count: 0,
        products: [],
        message: "Nenhum produto cadastrado ainda. Use /admin para cadastrar.",
        timestamp: new Date().toISOString()
      });
    }
    
    // Buscar dados atualizados do ML para cada produto
    const productsWithData = [];
    
    for (const product of activeProducts) {
      try {
        const mlData = await fetchProductFromML(product.mlUrl);
        const formattedProduct = formatProductsForAPI(mlData, product);
        productsWithData.push(formattedProduct);
        
      } catch (error) {
        console.log(`⚠️ Produto ${product.id} não disponível: ${error.message}`);
        // Pode pular produtos com erro
      }
    }
    
    res.json({
      success: true,
      store: "MJ TECH",
      count: productsWithData.length,
      products: productsWithData,
      timestamp: new Date().toISOString(),
      source: 'manual_catalog'
    });
    
  } catch (error) {
    console.error('❌ Erro na API de produtos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar produtos',
      message: error.message
    });
  }
});

// ROTA 2: API Admin - Cadastrar novo produto
app.post('/api/admin/products', async (req, res) => {
  try {
    const { mlUrl, customTitle, customDescription, customPrice } = req.body;
    
    if (!mlUrl) {
      return res.status(400).json({
        success: false,
        error: 'URL do Mercado Livre é obrigatória'
      });
    }
    
    // Testar se a URL é válida
    const productId = extractProductId(mlUrl);
    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'URL inválida do Mercado Livre'
      });
    }
    
    // Verificar se já existe
    const existing = productsDatabase.find(p => p.id === productId);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Produto já cadastrado'
      });
    }
    
    // Buscar dados do produto
    const mlData = await fetchProductFromML(mlUrl);
    
    // Adicionar ao banco de dados
    const newProduct = {
      id: productId,
      mlUrl: mlUrl,
      customTitle: customTitle || null,
      customDescription: customDescription || null,
      customPrice: customPrice || null,
      originalTitle: mlData.originalTitle,
      originalPrice: mlData.price,
      active: true,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    productsDatabase.push(newProduct);
    
    res.json({
      success: true,
      message: 'Produto cadastrado com sucesso',
      product: newProduct
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ROTA 3: API Admin - Listar todos os produtos
app.get('/api/admin/products', (req, res) => {
  res.json({
    success: true,
    count: productsDatabase.length,
    products: productsDatabase
  });
});

// ROTA 4: API Admin - Testar URL do produto
app.get('/api/admin/test', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL é obrigatória'
      });
    }
    
    const productData = await fetchProductFromML(url);
    
    res.json({
      success: true,
      product: productData
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ROTA 5: API Admin - Ativar/desativar produto
app.put('/api/admin/products/:id/toggle', (req, res) => {
  const { id } = req.params;
  
  const product = productsDatabase.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Produto não encontrado'
    });
  }
  
  product.active = !product.active;
  product.lastUpdated = new Date().toISOString();
  
  res.json({
    success: true,
    message: `Produto ${product.active ? 'ativado' : 'desativado'}`,
    product: product
  });
});

// ROTA 6: API Admin - Excluir produto
app.delete('/api/admin/products/:id', (req, res) => {
  const { id } = req.params;
  
  const index = productsDatabase.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Produto não encontrado'
    });
  }
  
  productsDatabase.splice(index, 1);
  
  res.json({
    success: true,
    message: 'Produto excluído'
  });
});

// ROTA 7: API Admin - Atualizar produto
app.put('/api/admin/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customTitle, customDescription, customPrice } = req.body;
    
    const product = productsDatabase.find(p => p.id === id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produto não encontrado'
      });
    }
    
    // Atualizar campos
    if (customTitle !== undefined) product.customTitle = customTitle || null;
    if (customDescription !== undefined) product.customDescription = customDescription || null;
    if (customPrice !== undefined) product.customPrice = customPrice || null;
    
    product.lastUpdated = new Date().toISOString();
    
    res.json({
      success: true,
      message: 'Produto atualizado',
      product: product
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ROTA 8: Forçar atualização de todos os produtos
app.post('/api/admin/products/refresh', async (req, res) => {
  try {
    const updatedProducts = [];
    
    for (const product of productsDatabase) {
      try {
        const mlData = await fetchProductFromML(product.mlUrl);
        
        // Atualizar dados originais
        product.originalTitle = mlData.originalTitle;
        product.originalPrice = mlData.price;
        product.lastUpdated = new Date().toISOString();
        
        updatedProducts.push(product.id);
      } catch (error) {
        console.log(`⚠️ Não foi possível atualizar ${product.id}: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `${updatedProducts.length} produtos atualizados`,
      updated: updatedProducts
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

// ROTA 9: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API (Manual Catalog)',
    status: 'operational',
    version: '5.0.0',
    timestamp: new Date().toISOString(),
    products_count: productsDatabase.length,
    active_products: productsDatabase.filter(p => p.active).length,
    mode: 'manual_catalog'
  });
});

// ROTA 10: Rota raiz - Informações da API
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API',
    message: 'Acesse /admin para cadastrar produtos',
    endpoints: {
      api_products: '/api/products - Lista de produtos para o site',
      admin_panel: '/admin - Painel de administração (HTML)',
      admin_api: {
        list: '/api/admin/products - Listar produtos (JSON)',
        create: 'POST /api/admin/products - Cadastrar produto',
        test: 'GET /api/admin/test?url=URL - Testar URL',
        toggle: 'PUT /api/admin/products/:id/toggle - Ativar/desativar',
        update: 'PUT /api/admin/products/:id - Atualizar',
        delete: 'DELETE /api/admin/products/:id - Excluir',
        refresh: 'POST /api/admin/products/refresh - Atualizar todos'
      },
      health: '/api/health - Status do sistema'
    },
    note: 'Sistema de catálogo manual - Cadastre seus links do Mercado Livre'
  });
});

// ROTA 11: Informações da loja
app.get('/api/store', (req, res) => {
  res.json({
    success: true,
    store: {
      name: "MJ TECH",
      website: "https://mjtech.net.br",
      whatsapp: "https://wa.me/5519995189387",
      contact_email: "contato@mjtech.net.br",
      catalog_type: "manual"
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================
// MIDDLEWARE DE ERRO
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Erro:', err.message);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: err.message
  });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

// Exportar app para Vercel
module.exports = app;

console.log('🚀 MJ TECH API Manual Catalog carregada');
console.log(`📦 Produtos cadastrados: ${productsDatabase.length}`);
console.log('✅ API pronta para receber requisições');
