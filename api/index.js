const express = require('express');
const cors = require('cors');

const app = express();

// Configurar CORS
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// BANCO DE DADOS DE PRODUTOS (em memória)
// ============================================

let productsDatabase = [
  // EXEMPLO DE PRODUTO - ADICIONE SEUS PRODUTOS AQUI
  {
    id: 'mjtech-001',
    title: 'Reparo de Celular - MJ TECH',
    description: 'Conserto profissional de smartphones com garantia e peças de qualidade',
    image: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    price: 99.90,
    oldPrice: 149.90,
    discount: '33% OFF',
    link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular',
    condition: 'Serviço',
    available_quantity: 999,
    sold_quantity: 150,
    free_shipping: false,
    category: 'SERVIÇOS',
    active: true,
    createdAt: '2024-12-09T10:00:00.000Z'
  },
  {
    id: 'mjtech-002',
    title: 'Manutenção de Notebook - MJ TECH',
    description: 'Limpeza interna, formatação e otimização para notebooks e computadores',
    image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    price: 129.90,
    oldPrice: 179.90,
    discount: '28% OFF',
    link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook',
    condition: 'Serviço',
    available_quantity: 999,
    sold_quantity: 89,
    free_shipping: false,
    category: 'SERVIÇOS',
    active: true,
    createdAt: '2024-12-09T10:00:00.000Z'
  },
  {
    id: 'mjtech-003',
    title: 'Mouse Gamer MJ TECH Edition',
    description: 'Mouse gamer com design exclusivo MJ TECH, RGB e 16000 DPI',
    image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    price: 79.90,
    oldPrice: 119.90,
    discount: '33% OFF',
    link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre o mouse gamer',
    condition: 'Novo',
    available_quantity: 25,
    sold_quantity: 42,
    free_shipping: true,
    category: 'PERIFÉRICOS',
    active: true,
    createdAt: '2024-12-09T10:00:00.000Z'
  },
  {
    id: 'mjtech-004',
    title: 'Teclado Mecânico MJ TECH Pro',
    description: 'Teclado mecânico com switches Outemu Blue e iluminação RGB',
    image: 'https://images.unsplash.com/photo-1541140532154-b024d705b90a?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
    price: 189.90,
    oldPrice: 279.90,
    discount: '32% OFF',
    link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre o teclado mecânico',
    condition: 'Novo',
    available_quantity: 18,
    sold_quantity: 31,
    free_shipping: true,
    category: 'PERIFÉRICOS',
    active: true,
    createdAt: '2024-12-09T10:00:00.000Z'
  }
];

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

function generateId() {
  return 'prod-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// ROTAS DA API (BACKEND)
// ============================================

// ROTA 1: API principal - Listar produtos para o site
app.get('/api/products', (req, res) => {
  try {
    const activeProducts = productsDatabase.filter(p => p.active);
    
    const formattedProducts = activeProducts.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      image: product.image,
      price: formatPrice(product.price),
      oldPrice: product.oldPrice ? formatPrice(product.oldPrice) : null,
      discount: product.discount,
      link: product.link,
      condition: product.condition,
      available_quantity: product.available_quantity,
      sold_quantity: product.sold_quantity,
      free_shipping: product.free_shipping,
      category: product.category,
      source: 'manual'
    }));
    
    res.json({
      success: true,
      store: "MJ TECH",
      count: formattedProducts.length,
      products: formattedProducts,
      timestamp: new Date().toISOString(),
      source: 'manual_catalog'
    });
    
  } catch (error) {
    console.error('❌ Erro na API de produtos:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar produtos'
    });
  }
});

// ROTA 2: API Admin - Cadastrar novo produto (MANUAL)
app.post('/api/admin/products', (req, res) => {
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
    
    // Validações básicas
    if (!title || !price || !link) {
      return res.status(400).json({
        success: false,
        error: 'Título, preço e link são obrigatórios'
      });
    }
    
    const newProduct = {
      id: generateId(),
      title: title,
      description: description || title,
      image: image || 'https://via.placeholder.com/300x300/1a1a2e/4a90e2?text=MJ+TECH',
      price: parseFloat(price),
      oldPrice: oldPrice ? parseFloat(oldPrice) : null,
      discount: discount || null,
      link: link,
      condition: condition || 'Novo',
      available_quantity: parseInt(available_quantity) || 10,
      sold_quantity: parseInt(sold_quantity) || 0,
      free_shipping: free_shipping || false,
      category: category || 'TECNOLOGIA',
      active: true,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
    
    productsDatabase.push(newProduct);
    
    res.json({
      success: true,
      message: '✅ Produto cadastrado manualmente com sucesso!',
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

// ROTA 4: API Admin - Ativar/desativar produto
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

// ROTA 5: API Admin - Excluir produto
app.delete('/api/admin/products/:id', (req, res) => {
  const { id } = req.params;
  
  const index = productsDatabase.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: 'Produto não encontrado'
    });
  }
  
  const deletedProduct = productsDatabase.splice(index, 1)[0];
  
  res.json({
    success: true,
    message: 'Produto excluído',
    product: deletedProduct
  });
});

// ROTA 6: API Admin - Atualizar produto
app.put('/api/admin/products/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const product = productsDatabase.find(p => p.id === id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Produto não encontrado'
      });
    }
    
    // Atualizar campos permitidos
    const allowedFields = [
      'title', 'description', 'image', 'price', 'oldPrice', 'discount',
      'link', 'condition', 'available_quantity', 'sold_quantity',
      'free_shipping', 'category'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'price' || field === 'oldPrice') {
          product[field] = parseFloat(updates[field]);
        } else if (field === 'available_quantity' || field === 'sold_quantity') {
          product[field] = parseInt(updates[field]);
        } else if (field === 'free_shipping') {
          product[field] = Boolean(updates[field]);
        } else {
          product[field] = updates[field];
        }
      }
    });
    
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

// ROTA 7: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API (Manual Catalog)',
    status: 'operational',
    version: '6.0.0',
    timestamp: new Date().toISOString(),
    products_count: productsDatabase.length,
    active_products: productsDatabase.filter(p => p.active).length,
    mode: 'full_manual'
  });
});

// ROTA 8: Informações da loja
app.get('/api/store', (req, res) => {
  res.json({
    success: true,
    store: {
      name: "MJ TECH",
      website: "https://mjtech.net.br",
      whatsapp: "https://wa.me/5519995189387",
      contact_email: "contato@mjtech.net.br",
      catalog_type: "manual_complete"
    },
    timestamp: new Date().toISOString()
  });
});

// ROTA 9: Rota raiz
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API',
    message: 'Sistema de catálogo manual funcionando!',
    endpoints: {
      products: '/api/products - Lista de produtos para o site',
      admin_panel: '/admin - Painel de administração',
      health: '/api/health - Status do sistema'
    }
  });
});

// ============================================
// MIDDLEWARE DE ERRO
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Erro:', err.message);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor'
  });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

module.exports = app;

console.log('🚀 MJ TECH API Manual Catalog (Full Manual) carregada');
console.log(`📦 Produtos cadastrados: ${productsDatabase.length}`);
console.log('✅ Sistema 100% manual - Sem dependência do Mercado Livre API');
