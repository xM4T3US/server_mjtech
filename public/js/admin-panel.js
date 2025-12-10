// Script principal do painel administrativo
class AdminPanel {
    constructor() {
        this.API_BASE_URL = window.location.origin;
        this.token = localStorage.getItem('mjtech_admin_token');
        this.user = JSON.parse(localStorage.getItem('mjtech_admin_user') || '{}');
        
        this.init();
    }

    async init() {
        if (!this.token) {
            window.location.href = '/admin';
            return;
        }

        this.loadProducts();
        this.setupEventListeners();
        this.updateUserInfo();
    }

    setupEventListeners() {
        // Formulário de cadastro
        const productForm = document.getElementById('productForm');
        if (productForm) {
            productForm.addEventListener('submit', (e) => this.handleProductSubmit(e));
        }

        // Botão de logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    updateUserInfo() {
        const userNameEl = document.getElementById('userName');
        const userRoleEl = document.getElementById('userRole');
        
        if (userNameEl && this.user) {
            userNameEl.textContent = this.user.fullName || this.user.username;
        }
        
        if (userRoleEl && this.user) {
            userRoleEl.textContent = this.user.role === 'admin' ? 'Administrador' : 'Editor';
        }
    }

    async loadProducts() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/admin/products`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.status === 401) {
                this.logout();
                return;
            }

            const data = await response.json();
            
            if (data.success) {
                this.renderProducts(data.products);
                this.updateStats(data.products);
            }
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            this.showMessage('❌ Erro ao carregar produtos', 'error');
        }
    }

    renderProducts(products) {
        const container = document.getElementById('productList');
        if (!container) return;

        if (!products || products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open"></i>
                    <p>Nenhum produto cadastrado ainda</p>
                </div>
            `;
            return;
        }

        container.innerHTML = products.map(product => this.createProductCard(product)).join('');
    }

    createProductCard(product) {
        const formattedPrice = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(product.price);

        const formattedOldPrice = product.oldPrice ? 
            new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(product.oldPrice) : null;

        const discount = product.discount || 
            (product.oldPrice && product.oldPrice > product.price ? 
                `${Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF` : 
                null);

        return `
            <div class="product-item" id="product-${product.id}">
                <div class="product-header">
                    <div class="product-title">${product.title}</div>
                    <div class="product-status ${product.active ? '' : 'inactive'}">
                        ${product.active ? 'Ativo' : 'Inativo'}
                    </div>
                </div>
                
                ${product.image ? `<img src="${product.image}" alt="${product.title}" class="product-image-preview">` : ''}
                
                <div class="product-details">${product.description}</div>
                
                <div>
                    <span class="product-price">${formattedPrice}</span>
                    ${formattedOldPrice ? `<span class="product-old-price">${formattedOldPrice}</span>` : ''}
                    ${discount ? `<span class="discount-badge">${discount}</span>` : ''}
                </div>
                
                <div class="product-meta">
                    <i class="fas fa-tag"></i> ${product.category} | 
                    <i class="fas fa-check-circle"></i> ${product.condition} |
                    <i class="fas fa-box"></i> ${product.available_quantity} disponíveis
                </div>
                
                <div class="product-actions">
                    <button onclick="adminPanel.toggleProduct('${product.id}')" class="action-btn toggle-btn">
                        <i class="fas fa-power-off"></i>
                        ${product.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button onclick="adminPanel.editProduct('${product.id}')" class="action-btn edit-btn">
                        <i class="fas fa-edit"></i>
                        Editar
                    </button>
                    <button onclick="adminPanel.deleteProduct('${product.id}')" class="action-btn delete-btn">
                        <i class="fas fa-trash"></i>
                        Excluir
                    </button>
                </div>
            </div>
        `;
    }

    updateStats(products) {
        const totalEl = document.getElementById('totalProducts');
        const activeEl = document.getElementById('activeProducts');
        const inactiveEl = document.getElementById('inactiveProducts');

        if (totalEl && activeEl && inactiveEl) {
            const total = products.length;
            const active = products.filter(p => p.active).length;
            const inactive = total - active;

            totalEl.textContent = total;
            activeEl.textContent = active;
            inactiveEl.textContent = inactive;
        }
    }

    async handleProductSubmit(e) {
        e.preventDefault();

        const formData = {
            title: document.getElementById('title').value.trim(),
            description: document.getElementById('description').value.trim(),
            image: document.getElementById('image').value.trim(),
            price: parseFloat(document.getElementById('price').value),
            oldPrice: document.getElementById('oldPrice').value ? 
                      parseFloat(document.getElementById('oldPrice').value) : null,
            link: document.getElementById('link').value.trim(),
            condition: document.getElementById('condition').value,
            category: document.getElementById('category').value,
            available_quantity: parseInt(document.getElementById('available_quantity').value) || 0,
            sold_quantity: parseInt(document.getElementById('sold_quantity').value) || 0,
            free_shipping: document.getElementById('free_shipping').checked
        };

        // Validações
        if (!formData.title || !formData.image || !formData.price || !formData.link) {
            this.showMessage('❌ Preencha todos os campos obrigatórios!', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/admin/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage('✅ Produto cadastrado com sucesso!', 'success');
                document.getElementById('productForm').reset();
                this.loadProducts();
            } else {
                this.showMessage('❌ Erro: ' + (data.error || 'Falha ao cadastrar'), 'error');
            }
        } catch (error) {
            this.showMessage('❌ Erro de conexão: ' + error.message, 'error');
        }
    }

    async toggleProduct(productId) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/admin/products/${productId}/toggle`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.showMessage(`✅ Produto ${data.product.active ? 'ativado' : 'desativado'}`, 'success');
                this.loadProducts();
            }
        } catch (error) {
            this.showMessage('❌ Erro: ' + error.message, 'error');
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Tem certeza que deseja excluir este produto?\nEsta ação não pode ser desfeita.')) {
            return;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}/api/admin/products/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                this.showMessage('✅ Produto excluído permanentemente', 'success');
                this.loadProducts();
            }
        } catch (error) {
            this.showMessage('❌ Erro: ' + error.message, 'error');
        }
    }

    logout() {
        localStorage.removeItem('mjtech_admin_token');
        localStorage.removeItem('mjtech_admin_user');
        window.location.href = '/admin';
    }

    showMessage(text, type) {
        // Implementar lógica de exibição de mensagens
        console.log(`${type}: ${text}`);
    }
}

// Inicializar painel quando a página carregar
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});
