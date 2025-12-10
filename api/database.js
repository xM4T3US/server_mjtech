const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configuração do banco de dados para Vercel
let DB_PATH = ':memory:'; // Default para Vercel

// Verificar se estamos no Vercel
if (process.env.VERCEL) {
    // No Vercel, usamos memória
    DB_PATH = ':memory:';
    console.log('⚡ Usando banco de dados em memória (Vercel)');
} else {
    // Localmente, usamos arquivo
    DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/mjtech.db');
    
    // Criar diretório se não existir
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

// Conectar ao banco de dados
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado ao banco de dados:', DB_PATH);
    
    // Ativar foreign keys
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
});

// Inicializar banco de dados
const initializeDatabase = async () => {
    try {
        console.log('🔄 Inicializando banco de dados...');
        
        // Criar tabelas
        const initSQL = `
        -- Tabela de usuários
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
        
        -- Tabela de produtos
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
        
        -- Tabela de logs
        CREATE TABLE IF NOT EXISTS access_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username VARCHAR(50),
            ip_address VARCHAR(45),
            user_agent TEXT,
            action VARCHAR(50),
            success BOOLEAN,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Tabela de configurações
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(50) PRIMARY KEY,
            value TEXT,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        `;
        
        // Executar queries
        const queries = initSQL.split(';').filter(q => q.trim());
        for (const query of queries) {
            if (query.trim()) {
                await new Promise((resolve, reject) => {
                    db.run(query, (err) => {
                        if (err) reject(err);
                        resolve();
                    });
                });
            }
        }
        
        console.log('✅ Tabelas criadas com sucesso!');
        
        // Verificar se o admin já existe
        const adminExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM admin_users WHERE username = ?', 
                  [process.env.ADMIN_USERNAME || 'admin'], 
                  (err, row) => {
                if (err) reject(err);
                resolve(!!row);
            });
        });
        
        if (!adminExists) {
            // Criar usuário admin padrão
            const adminUsername = process.env.ADMIN_USERNAME || 'admin_mjtech';
            const adminPassword = process.env.ADMIN_PASSWORD || 'S3nh@F0rt3!2025';
            const passwordHash = bcrypt.hashSync(adminPassword, 10);
            
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO admin_users 
                    (username, email, password_hash, full_name, role) 
                    VALUES (?, ?, ?, ?, ?)`,
                    [
                        adminUsername,
                        process.env.ADMIN_EMAIL || 'admin@mjtech.com.br',
                        passwordHash,
                        process.env.ADMIN_FULLNAME || 'Administrador MJ Tech',
                        'admin'
                    ],
                    function(err) {
                        if (err) reject(err);
                        console.log('✅ Usuário admin criado com sucesso!');
                        console.log('👤 Usuário:', adminUsername);
                        console.log('🔑 Senha:', adminPassword);
                        console.log('⚠️ ALTERE A SENHA NO PRIMEIRO LOGIN!');
                        resolve();
                    }
                );
            });
            
            // Inserir configurações padrão
            const settings = [
                ['store_name', 'MJ TECH', 'Nome da loja'],
                ['store_whatsapp', 'https://wa.me/5519995189387', 'Link do WhatsApp'],
                ['store_email', 'contato@mjtech.com.br', 'E-mail de contato'],
                ['max_login_attempts', '5', 'Tentativas máximas de login'],
                ['lockout_time', '900', 'Tempo de bloqueio em segundos'],
                ['session_timeout', '7200', 'Timeout da sessão em segundos']
            ];
            
            for (const [key, value, description] of settings) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)',
                        [key, value, description],
                        (err) => {
                            if (err) reject(err);
                            resolve();
                        }
                    );
                });
            }
            
            // Inserir produtos de exemplo
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
                }
            ];
            
            for (const product of sampleProducts) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO products 
                        (id, title, description, image_url, price, old_price, discount, 
                         whatsapp_link, condition, available_quantity, sold_quantity, 
                         free_shipping, category, is_active) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        Object.values(product),
                        (err) => {
                            if (err) reject(err);
                            resolve();
                        }
                    );
                });
            }
            
            console.log('🎉 Banco de dados inicializado com sucesso!');
        } else {
            console.log('✅ Banco de dados já inicializado');
        }
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
    }
};

// Funções utilitárias
const dbHelpers = {
    get: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    all: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    run: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }
};

// Modelos
const models = {
    users: {
        create: async (userData) => {
            return await dbHelpers.run(
                `INSERT INTO admin_users (username, email, password_hash, full_name, role) 
                VALUES (?, ?, ?, ?, ?)`,
                [userData.username, userData.email, userData.password_hash, 
                 userData.full_name, userData.role || 'editor']
            );
        },
        
        findByUsername: async (username) => {
            return await dbHelpers.get(
                'SELECT * FROM admin_users WHERE username = ?',
                [username]
            );
        },
        
        findByEmail: async (email) => {
            return await dbHelpers.get(
                'SELECT * FROM admin_users WHERE email = ?',
                [email]
            );
        },
        
        findById: async (id) => {
            return await dbHelpers.get(
                'SELECT * FROM admin_users WHERE id = ?',
                [id]
            );
        },
        
        update: async (id, updates) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(f => `${f} = ?`).join(', ');
            
            return await dbHelpers.run(
                `UPDATE admin_users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [...values, id]
            );
        },
        
        getAll: async () => {
            return await dbHelpers.all(
                'SELECT id, username, email, full_name, role, is_active, last_login, created_at 
                FROM admin_users ORDER BY created_at DESC'
            );
        },
        
        logAccess: async (logData) => {
            return await dbHelpers.run(
                `INSERT INTO access_logs 
                (user_id, username, ip_address, user_agent, action, success, details) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    logData.userId,
                    logData.username,
                    logData.ipAddress,
                    logData.userAgent,
                    logData.action,
                    logData.success ? 1 : 0,
                    logData.details
                ]
            );
        }
    },
    
    products: {
        create: async (productData) => {
            const fields = Object.keys(productData);
            const values = Object.values(productData);
            const placeholders = fields.map(() => '?').join(', ');
            
            return await dbHelpers.run(
                `INSERT INTO products (${fields.join(', ')}) VALUES (${placeholders})`,
                values
            );
        },
        
        getAll: async () => {
            return await dbHelpers.all('SELECT * FROM products ORDER BY created_at DESC');
        },
        
        getActive: async () => {
            return await dbHelpers.all(
                'SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC'
            );
        },
        
        findById: async (id) => {
            return await dbHelpers.get('SELECT * FROM products WHERE id = ?', [id]);
        },
        
        update: async (id, updates) => {
            const fields = Object.keys(updates);
            const values = Object.values(updates);
            const setClause = fields.map(f => `${f} = ?`).join(', ');
            
            return await dbHelpers.run(
                `UPDATE products SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [...values, id]
            );
        },
        
        delete: async (id) => {
            return await dbHelpers.run('DELETE FROM products WHERE id = ?', [id]);
        },
        
        toggleActive: async (id) => {
            return await dbHelpers.run(
                `UPDATE products SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [id]
            );
        },
        
        getStats: async () => {
            return await dbHelpers.get(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive,
                    SUM(sold_quantity) as total_sold,
                    SUM(price * sold_quantity) as total_revenue
                FROM products
            `);
        }
    },
    
    settings: {
        get: async (key) => {
            const result = await dbHelpers.get(
                'SELECT value FROM settings WHERE key = ?',
                [key]
            );
            return result ? result.value : null;
        },
        
        set: async (key, value, description = null) => {
            return await dbHelpers.run(
                `INSERT OR REPLACE INTO settings (key, value, description) VALUES (?, ?, ?)`,
                [key, value, description]
            );
        },
        
        getAll: async () => {
            const rows = await dbHelpers.all('SELECT * FROM settings ORDER BY key');
            return rows.reduce((obj, row) => {
                obj[row.key] = row.value;
                return obj;
            }, {});
        }
    }
};

// Inicializar banco de dados quando o módulo carregar
initializeDatabase();

module.exports = { db, dbHelpers, models };
