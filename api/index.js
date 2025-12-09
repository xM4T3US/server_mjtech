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
// FUNÇÃO PRINCIPAL: Buscar produtos do ML
// ============================================

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

// ============================================
// ROTAS DA API
// ============================================

// ROTA 1: Listar todos os produtos cadastrados
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
        
        // Usar dados customizados ou do ML
        const finalProduct = {
          id: mlData.id,
          title: product.customTitle || mlData.originalTitle,
          description: product.customDescription || mlData.description,
          image: mlData.images[0] || mlData.thumbnail || getDefaultImage(mlData.category),
          price: formatPrice(product.customPrice || mlData.price),
          oldPrice: mlData.originalPrice ? formatPrice(mlData.originalPrice) : null,
          discount: calculateDiscount(mlData.originalPrice, mlData.price),
          link: product.mlUrl,
          condition: mlData.condition === 'new' ? 'Novo' : 'Usado',
          available_quantity: mlData.availableQuantity,
          sold_quantity: mlData.soldQuantity,
          free_shipping: mlData.freeShipping,
          category: mlData.category.replace('MLB-', ''),
          source: 'ml_direct',
          custom: !!product.customTitle
        };
        
        productsWithData.push(finalProduct);
        
      } catch (error) {
        console.log(`⚠️ Produto ${product.id} não disponível: ${error.message}`);
        // Pode pular produtos com erro ou adicionar fallback
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

// ROTA 2: Painel de Administração (HTML)
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MJ TECH - Painel de Produtos</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'Segoe UI', sans-serif;
            }
            
            body {
                background: linear-gradient(135deg, #1a1a2e 0%, #0a0a0a 100%);
                color: white;
                min-height: 100vh;
                padding: 20px;
            }
            
            .container {
                max-width: 1000px;
                margin: 0 auto;
            }
            
            header {
                text-align: center;
                margin-bottom: 40px;
                padding: 30px;
                background: rgba(74, 144, 226, 0.1);
                border-radius: 15px;
                border: 1px solid rgba(74, 144, 226, 0.3);
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
            }
            
            .dashboard {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                margin-bottom: 40px;
            }
            
            @media (max-width: 768px) {
                .dashboard {
                    grid-template-columns: 1fr;
                }
            }
            
            .card {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 15px;
                padding: 25px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .card h2 {
                color: #4a90e2;
                margin-bottom: 20px;
                font-size: 1.4rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                color: #b6e0ff;
                font-weight: 500;
            }
            
            input, textarea {
                width: 100%;
                padding: 12px 15px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: white;
                font-size: 1rem;
            }
            
            textarea {
                min-height: 100px;
                resize: vertical;
            }
            
            input:focus, textarea:focus {
                outline: none;
                border-color: #4a90e2;
            }
            
            .btn {
                background: linear-gradient(45deg, #4a90e2, #25D366);
                color: white;
                padding: 12px 25px;
                border-radius: 8px;
                border: none;
                font-weight: bold;
                cursor: pointer;
                transition: transform 0.3s ease;
                width: 100%;
                font-size: 1rem;
            }
            
            .btn:hover {
                transform: translateY(-2px);
            }
            
            .btn-secondary {
                background: rgba(74, 144, 226, 0.2);
                border: 1px solid #4a90e2;
                margin-top: 10px;
            }
            
            .product-list {
                max-height: 400px;
                overflow-y: auto;
            }
            
            .product-item {
                background: rgba(0, 0, 0, 0.3);
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 15px;
                border-left: 3px solid #4a90e2;
            }
            
            .product-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .product-title {
                font-weight: bold;
                color: white;
                font-size: 1.1rem;
            }
            
            .product-status {
                background: #25D366;
                color: white;
                padding: 3px 10px;
                border-radius: 15px;
                font-size: 0.8rem;
                font-weight: bold;
            }
            
            .product-status.inactive {
                background: #ff3b30;
            }
            
            .product-url {
                color: #b6e0ff;
                font-size: 0.9rem;
                word-break: break-all;
                margin-bottom: 10px;
            }
            
            .product-actions {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }
            
            .action-btn {
                padding: 5px 12px;
                border-radius: 5px;
                border: none;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: bold;
            }
            
            .edit-btn {
                background: #ff9500;
                color: white;
            }
            
            .toggle-btn {
                background: #4a90e2;
                color: white;
            }
            
            .delete-btn {
                background: #ff3b30;
                color: white;
            }
            
            .message {
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                text-align: center;
                font-weight: bold;
            }
            
            .success {
                background: rgba(37, 211, 102, 0.2);
                border: 1px solid #25D366;
                color: #25D366;
            }
            
            .error {
                background: rgba(255, 59, 48, 0.2);
                border: 1px solid #ff3b30;
                color: #ff3b30;
            }
            
            .api-info {
                background: rgba(255, 217, 0, 0.1);
                border: 1px solid rgba(255, 217, 0, 0.3);
                padding: 15px;
                border-radius: 10px;
                margin-top: 30px;
                font-family: monospace;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <div class="logo">MJ</div>
                <h1>MJ TECH - Painel de Produtos</h1>
                <p class="subtitle">Cadastre os links dos seus anúncios do Mercado Livre</p>
            </header>
            
            <div id="message" class="message" style="display: none;"></div>
            
            <div class="dashboard">
                <!-- Formulário de Cadastro -->
                <div class="card">
                    <h2>📝 Cadastrar Novo Produto</h2>
                    <form id="productForm">
                        <div class="form-group">
                            <label for="mlUrl">URL do Mercado Livre *</label>
                            <input type="url" id="mlUrl" name="mlUrl" required 
                                   placeholder="https://produto.mercadolivre.com.br/MLB-1234567890">
                        </div>
                        
                        <div class="form-group">
                            <label for="customTitle">Título Personalizado (opcional)</label>
                            <input type="text" id="customTitle" name="customTitle" 
                                   placeholder="Deixe em branco para usar título original">
                        </div>
                        
                        <div class="form-group">
                            <label for="customDescription">Descrição Personalizada (opcional)</label>
                            <textarea id="customDescription" name="customDescription" 
                                      placeholder="Deixe em branco para usar descrição original"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="customPrice">Preço Personalizado (opcional)</label>
                            <input type="number" step="0.01" id="customPrice" name="customPrice" 
                                   placeholder="Deixe em branco para usar preço original">
                        </div>
                        
                        <button type="submit" class="btn">💾 Salvar Produto</button>
                    </form>
                    
                    <button onclick="testProduct()" class="btn btn-secondary">
                        🔄 Testar Busca do Produto
                    </button>
                </div>
                
                <!-- Lista de Produtos -->
                <div class="card">
                    <h2>📦 Produtos Cadastrados</h2>
                    <div id="productList" class="product-list">
                        <p>Carregando produtos...</p>
                    </div>
                </div>
            </div>
            
            <div class="api-info">
                <strong>Endpoint da API:</strong><br>
                <code>https://server-mjtech.vercel.app/api/products</code><br><br>
                <strong>Para usar no seu site:</strong><br>
                <code>const API_URL = 'https://server-mjtech.vercel.app/api/products';</code>
            </div>
        </div>
        
        <script>
            // Carregar produtos ao iniciar
            loadProducts();
            
            // Formulário de cadastro
            document.getElementById('productForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const formData = {
                    mlUrl: document.getElementById('mlUrl').value,
                    customTitle: document.getElementById('customTitle').value || null,
                    customDescription: document.getElementById('customDescription').value || null,
                    customPrice: document.getElementById('customPrice').value ? 
                        parseFloat(document.getElementById('customPrice').value) : null
                };
                
                try {
                    const response = await fetch('/api/admin/products', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        showMessage('✅ Produto cadastrado com sucesso!', 'success');
                        document.getElementById('productForm').reset();
                        loadProducts();
                    } else {
                        showMessage('❌ Erro: ' + (data.error || 'Falha ao cadastrar'), 'error');
                    }
                } catch (error) {
                    showMessage('❌ Erro de conexão: ' + error.message, 'error');
                }
            });
            
            // Função para testar busca de produto
            async function testProduct() {
                const url = document.getElementById('mlUrl').value;
                if (!url) {
                    showMessage('❌ Digite uma URL para testar', 'error');
                    return;
                }
                
                showMessage('🔍 Testando busca do produto...', 'success');
                
                try {
                    const response = await fetch('/api/admin/test?url=' + encodeURIComponent(url));
                    const data = await response.json();
                    
                    if (data.success) {
                        showMessage('✅ Produto encontrado: ' + data.product.originalTitle, 'success');
                        
                        // Preencher automaticamente os campos
                        if (!document.getElementById('customTitle').value) {
                            document.getElementById('customTitle').value = data.product.originalTitle;
                        }
                        if (!document.getElementById('customPrice').value) {
                            document.getElementById('customPrice').value = data.product.price;
                        }
                    } else {
                        showMessage('❌ ' + data.error, 'error');
                    }
                } catch (error) {
                    showMessage('❌ Erro: ' + error.message, 'error');
                }
            }
            
            // Carregar lista de produtos
            async function loadProducts() {
                try {
                    const response = await fetch('/api/admin/products');
                    const data = await response.json();
                    
                    const container = document.getElementById('productList');
                    
                    if (!data.products || data.products.length === 0) {
                        container.innerHTML = '<p>Nenhum produto cadastrado ainda.</p>';
                        return;
                    }
                    
                    container.innerHTML = '';
                    
                    data.products.forEach(product => {
                        const productEl = document.createElement('div');
                        productEl.className = 'product-item';
                        productEl.innerHTML = \`
                            <div class="product-header">
                                <div class="product-title">\${product.customTitle || product.originalTitle || 'Sem título'}</div>
                                <div class="product-status \${product.active ? '' : 'inactive'}">
                                    \${product.active ? 'Ativo' : 'Inativo'}
                                </div>
                            </div>
                            <div class="product-url">\${product.mlUrl}</div>
                            <div class="product-actions">
                                <button onclick="toggleProduct('\${product.id}')" class="action-btn toggle-btn">
                                    \${product.active ? 'Desativar' : 'Ativar'}
                                </button>
                                <button onclick="editProduct('\${product.id}')" class="action-btn edit-btn">
                                    Editar
                                </button>
                                <button onclick="deleteProduct('\${product.id}')" class="action-btn delete-btn">
                                    Excluir
                                </button>
                            </div>
                        \`;
                        container.appendChild(productEl);
                    });
                    
                } catch (error) {
                    document.getElementById('productList').innerHTML = 
                        '<p>Erro ao carregar produtos: ' + error.message + '</p>';
                }
            }
            
            // Funções auxiliares
            async function toggleProduct(productId) {
                try {
                    const response = await fetch(\`/api/admin/products/\${productId}/toggle\`, {
                        method: 'PUT'
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        showMessage('✅ Status atualizado', 'success');
                        loadProducts();
                    }
                } catch (error) {
                    showMessage('❌ Erro: ' + error.message, 'error');
                }
            }
            
            async function deleteProduct(productId) {
                if (!confirm('Tem certeza que deseja excluir este produto?')) return;
                
                try {
                    const response = await fetch(\`/api/admin/products/\${productId}\`, {
                        method: 'DELETE'
                    });
                    
                    const data = await response.json();
                    if (data.success) {
                        showMessage('✅ Produto excluído', 'success');
                        loadProducts();
                    }
                } catch (error) {
                    showMessage('❌ Erro: ' + error.message, 'error');
                }
            }
            
            async function editProduct(productId) {
                // Implementar edição se necessário
                showMessage('✏️ Funcionalidade de edição em desenvolvimento', 'success');
            }
            
            function showMessage(text, type) {
                const messageEl = document.getElementById('message');
                messageEl.textContent = text;
                messageEl.className = \`message \${type}\`;
                messageEl.style.display = 'block';
                
                setTimeout(() => {
                    messageEl.style.display = 'none';
                }, 5000);
            }
            
            // Carregar a cada 30 segundos para atualizações
            setInterval(loadProducts, 30000);
        </script>
    </body>
    </html>
  `);
});

// ROTA 3: API para gerenciar produtos (backend)
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

// ROTA 4: Listar produtos (admin)
app.get('/api/admin/products', (req, res) => {
  res.json({
    success: true,
    count: productsDatabase.length,
    products: productsDatabase
  });
});

// ROTA 5: Testar URL do produto
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

// ROTA 6: Ativar/desativar produto
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

// ROTA 7: Excluir produto
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

// Rota de saúde
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API (Manual Catalog)',
    status: 'operational',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    products_count: productsDatabase.length,
    active_products: productsDatabase.filter(p => p.active).length,
    mode: 'manual_catalog'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'MJ TECH Store API',
    message: 'Acesse /admin para cadastrar produtos',
    endpoints: {
      products: '/api/products',
      admin_panel: '/admin',
      health: '/api/health'
    },
    note: 'Sistema de catálogo manual - Cadastre seus links do Mercado Livre'
  });
});

// Exportar app para Vercel
module.exports = app;
