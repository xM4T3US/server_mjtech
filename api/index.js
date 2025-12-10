const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { models } = require('./database');
require('dotenv').config();

const app = express();

// Configurações
const SECRET_KEY = process.env.JWT_SECRET || 'fallback-secret-key-for-development';
const TOKEN_EXPIRATION = process.env.TOKEN_EXPIRATION || '8h';

// CORS para Vercel
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://server-mjtech.vercel.app',
    'https://server-mjtech.vercel.app'
];

app.use(cors({
    origin: function(origin, callback) {
        // Permite requisições sem origin (como mobile apps ou curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política CORS para este site não permite acesso da origem especificada.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de autenticação
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token de acesso não fornecido'
            });
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        const user = await models.users.findById(decoded.id);
        
        if (!user || !user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Usuário não encontrado ou inativo'
            });
        }

        req.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
        };
        
        next
