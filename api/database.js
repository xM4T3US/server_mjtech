const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Configuração do banco de dados
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database/mjtech.db');

// Criar instância do banco de dados
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        process.exit(1);
    }
    console.log('✅ Conectado ao banco de dados SQLite:', DB_PATH);
    
    // Ativar foreign keys
    db.run('PRAGMA foreign_keys = ON');
    
    // Otimizações
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA cache_size = -2000');
});

// Funções utilitárias
const dbHelpers = {
    // Executar query com retorno
    get: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    // Executar query com múltiplos resultados
    all: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    // Executar query (INSERT, UPDATE, DELETE)
    run: (query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },
    
    // Executar transação
    transaction: (queries) => {
        return new Promise(async (resolve, reject) => {
            try {
                await dbHelpers.run('BEGIN TRANSACTION');
                
                for (const query of queries) {
                    await dbHelpers.run(query.sql, query.params);
                }
                
                await dbHelpers.run('COMMIT');
                resolve(true);
            } catch (error) {
                await dbHelpers.run('ROLLBACK');
                reject(error);
            }
        });
    },
    
    // Fechar conexão
    close: () => {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }
};

// Modelos de dados
const models = {
    // Usuários
    users: {
        create: async (userData) => {
            const { username, email, passwordHash, fullName, role = 'editor' } = userData;
            
            return await dbHelpers.run(
                `INSERT INTO admin_users 
                (username, email, password_hash, full_name, role) 
                VALUES (?, ?, ?, ?, ?)`,
                [username, email, passwordHash, fullName, role]
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
                'SELECT id, username, email, full_name, role, is_active, last_login, created_at FROM admin_users ORDER BY created_at DESC'
            );
        },
        
        logAccess: async (logData) => {
            const { userId, username, ipAddress, userAgent, action, success, details } = logData;
            
            return await dbHelpers.run(
                `INSERT INTO access_logs 
                (user_id, username, ip_address, user_agent, action, success, details) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, username, ipAddress, userAgent, action, success, details]
            );
        }
    },
    
    // Produtos
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
    
    // Configurações
    settings: {
        get: async (key) => {
            return await dbHelpers.get(
                'SELECT value FROM settings WHERE key = ?',
                [key]
            );
        },
        
        set: async (key, value, description = null) => {
            return await dbHelpers.run(
                `INSERT OR REPLACE INTO settings (key, value, description, updated_at) 
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
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

module.exports = { db, dbHelpers, models };
