const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

// Caminho do banco de dados
const dbPath = process.env.DB_PATH || path.join(__dirname, '../database/mjtech.db');

// Criar diretório database se não existir
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Conectar ao banco de dados
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado ao banco de dados SQLite');
});

// Função para executar queries
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

// Script SQL para criar as tabelas
const initSQL = `
-- ============================================
-- TABELA DE USUÁRIOS ADMINISTRATIVOS
-- ============================================
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'editor' CHECK(role IN ('admin', 'editor')),
    is_active BOOLEAN DEFAULT 1,
    last_login TIMESTAMP,
    failed_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA DE PRODUTOS
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    image_url TEXT,
    price DECIMAL(10,2) NOT NULL,
    old_price DECIMAL(10,2),
    discount VARCHAR(20),
    whatsapp_link TEXT NOT NULL,
    condition VARCHAR(20) DEFAULT 'Novo',
    available_quantity INTEGER DEFAULT 0,
    sold_quantity INTEGER DEFAULT 0,
    free_shipping BOOLEAN DEFAULT 0,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABELA DE LOGS DE ACESSO
-- ============================================
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    action VARCHAR(50),
    success BOOLEAN,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users(id)
);

-- ============================================
-- TABELA DE CONFIGURAÇÕES
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON access_logs(created_at);
`;

// Função principal
async function initializeDatabase() {
    try {
        console.log('🔄 Inicializando banco de dados...');
        
        // Executar script SQL
        const queries = initSQL.split(';').filter(q => q.trim());
        
        for (const query of queries) {
            if (query.trim()) {
                await runQuery(query);
            }
        }
        
        console.log('✅ Tabelas criadas com sucesso!');
        
        // Verificar se o admin já existe
        const adminExists = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM admin_users WHERE username = ? OR email = ?',
                [process.env.ADMIN_USERNAME, process.env.ADMIN_EMAIL],
                (err, row) => {
                    if (err) reject(err);
                    resolve(!!row);
                }
            );
        });
        
        if (!adminExists) {
            // Criar usuário admin padrão
            const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
            
            await runQuery(
                `INSERT INTO admin_users 
                (username, email, password_hash, full_name, role, is_active) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    process.env.ADMIN_USERNAME,
                    process.env.ADMIN_EMAIL,
                    passwordHash,
                    process.env.ADMIN_FULLNAME,
                    'admin',
                    1
                ]
            );
            
            console.log('✅ Usuário administrador criado:');
            console.log('   👤 Usuário:', process.env.ADMIN_USERNAME);
            console.log('   📧 E-mail:', process.env.ADMIN_EMAIL);
            console.log('   🔑 Senha:', process.env.ADMIN_PASSWORD);
            console.log('   ⚠️ ALTERE A SENHA APÓS O PRIMEIRO LOGIN!');
        } else {
            console.log('✅ Usuário administrador já existe');
        }
        
        // Inserir configurações padrão
        await runQuery(
            `INSERT OR REPLACE INTO settings (key, value, description) VALUES 
            ('store_name', 'MJ TECH', 'Nome da loja'),
            ('store_whatsapp', 'https://wa.me/5519995189387', 'Link do WhatsApp'),
            ('store_email', 'contato@mjtech.com.br', 'E-mail de contato'),
            ('max_login_attempts', ?, 'Tentativas máximas de login'),
            ('lockout_time', ?, 'Tempo de bloqueio em segundos'),
            ('session_timeout', ?, 'Timeout da sessão em segundos')`,
            [
                process.env.MAX_LOGIN_ATTEMPTS || 5,
                process.env.LOCKOUT_TIME || 900,
                process.env.SESSION_TIMEOUT || 7200
            ]
        );
        
        console.log('✅ Configurações inseridas');
        
        // Inserir produtos de exemplo
        const productCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
                if (err) reject(err);
                resolve(row.count);
            });
        });
        
        if (productCount === 0) {
            const sampleProducts = [
                {
                    id: 'mjtech-001',
                    title: 'Reparo de Celular - MJ TECH',
                    description: 'Conserto profissional de smartphones com garantia e peças de qualidade',
                    image_url: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
                    price: 99.90,
                    old_price: 149.90,
                    discount: '33% OFF',
                    whatsapp_link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre reparo de celular',
                    condition: 'Serviço',
                    available_quantity: 999,
                    sold_quantity: 150,
                    free_shipping: 0,
                    category: 'SERVIÇOS',
                    is_active: 1
                },
                {
                    id: 'mjtech-002',
                    title: 'Manutenção de Notebook',
                    description: 'Limpeza interna, formatação e otimização para notebooks',
                    image_url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
                    price: 129.90,
                    old_price: 179.90,
                    discount: '28% OFF',
                    whatsapp_link: 'https://wa.me/5519995189387?text=Olá! Gostaria de informações sobre manutenção de notebook',
                    condition: 'Serviço',
                    available_quantity: 50,
                    sold_quantity: 25,
                    free_shipping: 0,
                    category: 'SERVIÇOS',
                    is_active: 1
                }
            ];
            
            for (const product of sampleProducts) {
                await runQuery(
                    `INSERT INTO products 
                    (id, title, description, image_url, price, old_price, discount, 
                     whatsapp_link, condition, available_quantity, sold_quantity, 
                     free_shipping, category, is_active) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        product.id,
                        product.title,
                        product.description,
                        product.image_url,
                        product.price,
                        product.old_price,
                        product.discount,
                        product.whatsapp_link,
                        product.condition,
                        product.available_quantity,
                        product.sold_quantity,
                        product.free_shipping,
                        product.category,
                        product.is_active
                    ]
                );
            }
            
            console.log('✅ Produtos de exemplo inseridos');
        }
        
        console.log('🎉 Banco de dados inicializado com sucesso!');
        console.log('📊 Estatísticas:');
        console.log('   👥 Usuários: 1 (admin)');
        console.log('   📦 Produtos: 2 (exemplo)');
        console.log('   ⚙️ Configurações: 6');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Executar inicialização
initializeDatabase();
