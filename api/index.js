const express = require('express');
const app = express();
app.get('/', (req, res) => {
    res.send('API Online - Teste');
});
module.exports = app;
