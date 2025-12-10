// export-db.js - Script para exportar dados do SQLite em memória para CSV
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');

// 1. INICIALIZAR BANCO DE DADOS (igual ao seu código atual)
console.log('🔄 Inicializando banco de dados em memória...');

const db = new sqlite3.Database(':memory:');

// Função auxiliar para executar queries
const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            resolve(this);
        });
    });
};

const dbAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
};

const initializeDatabase = async () => {
    try {
        // Criar tabelas
        await dbRun(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT DEFAULT 'editor',
                is_active INTEGER DEFAULT 1,
                last_login TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                price REAL NOT NULL,
                old_price REAL,
                discount TEXT,
                whatsapp_link TEXT NOT NULL,
                condition TEXT DEFAULT 'Novo',
                available_quantity INTEGER DEFAULT 0,
                sold_quantity INTEGER DEFAULT 0,
                free_shipping INTEGER DEFAULT 0,
                category TEXT,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Inserir dados de exemplo (igual ao seu código)
        // 1. Criar usuário admin
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
        const passwordHash = bcrypt.hashSync(adminPassword, 10);
        
        await dbRun(
            `INSERT OR REPLACE INTO admin_users (username, email, password_hash, full_name, role) 
             VALUES (?, ?, ?, ?, ?)`,
            [
                process.env.ADMIN_USERNAME || 'admin',
                process.env.ADMIN_EMAIL || 'admin@mjtech.com.br',
                passwordHash,
                process.env.ADMIN_FULLNAME || 'Administrador MJ Tech',
                'admin'
            ]
        );

        // 2. Inserir produtos de exemplo
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
                title: 'Manutenção de Notebook - MJ TECH',
                description: 'Limpeza interna, formatação e otimização para notebooks e computadores',
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
            await dbRun(
                `INSERT OR REPLACE INTO products 
                (id, title, description, image_url, price, old_price, discount, 
                 whatsapp_link, condition, available_quantity, sold_quantity, 
                 free_shipping, category, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                Object.values(product)
            );
        }

        console.log('✅ Banco de dados inicializado com dados de exemplo');

    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error);
        throw error;
    }
};

// 2. FUNÇÃO PARA EXPORTAR PARA CSV
const exportTableToCSV = async (tableName, columns = null) => {
    try {
        // Buscar dados da tabela
        const rows = await dbAll(`SELECT * FROM ${tableName}`);
        
        if (rows.length === 0) {
            console.log(`⚠️  Tabela ${tableName} está vazia`);
            return false;
        }

        // Se não especificou colunas, usa todas as colunas da primeira linha
        const headers = columns || Object.keys(rows[0]);
        
        // Criar conteúdo CSV
        let csvContent = '';
        
        // Cabeçalho
        csvContent += headers.map(h => `"${h}"`).join(',') + '\n';
        
        // Dados
        rows.forEach(row => {
            const rowData = headers.map(header => {
                let value = row[header];
                
                // Converter para string e escapar aspas
                if (value === null || value === undefined) {
                    value = '';
                } else if (typeof value === 'object') {
                    value = JSON.stringify(value);
                } else {
                    value = String(value);
                }
                
                // Escapar aspas duplas
                value = value.replace(/"/g, '""');
                
                // Se contém vírgula, quebra de linha ou aspas, colocar entre aspas
                if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                    return `"${value}"`;
                }
                
                return value;
            });
            
            csvContent += rowData.join(',') + '\n';
        });

        // Salvar arquivo
        const filename = `${tableName}_export.csv`;
        fs.writeFileSync(filename, csvContent);
        
        console.log(`✅ Arquivo ${filename} gerado com ${rows.length} registros`);
        console.log(`📊 Colunas: ${headers.join(', ')}`);
        
        return true;
        
    } catch (error) {
        console.error(`❌ Erro ao exportar tabela ${tableName}:`, error.message);
        return false;
    }
};

// 3. EXECUTAR EXPORTAÇÃO
const main = async () => {
    try {
        console.log('🚀 Iniciando exportação de dados...');
        
        // Inicializar banco
        await initializeDatabase();
        
        // Exportar tabelas
        console.log('\n--- Exportando Tabelas ---');
        
        // Tabela admin_users
        await exportTableToCSV('admin_users', [
            'username', 'email', 'password_hash', 'full_name', 'role', 
            'is_active', 'last_login', 'created_at'
        ]);
        
        // Tabela products
        await exportTableToCSV('products', [
            'id', 'title', 'description', 'image_url', 'price', 'old_price',
            'discount', 'whatsapp_link', 'condition', 'available_quantity',
            'sold_quantity', 'free_shipping', 'category', 'is_active',
            'created_at', 'updated_at'
        ]);
        
        console.log('\n🎉 Exportação concluída!');
        console.log('\n📁 Arquivos gerados:');
        console.log('   • admin_users_export.csv');
        console.log('   • products_export.csv');
        console.log('\n📋 Próximos passos:');
        console.log('   1. Acesse seu projeto Supabase');
        console.log('   2. Vá em "Table Editor"');
        console.log('   3. Clique em "+ New table"');
        console.log('   4. Escolha "Import data from CSV"');
        console.log('   5. Faça upload dos arquivos acima');
        
    } catch (error) {
        console.error('❌ Erro na exportação:', error);
    } finally {
        db.close();
    }
};

// Executar script
main();
