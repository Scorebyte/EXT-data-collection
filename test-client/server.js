const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(4000, () => console.log('Test client: http://localhost:4000'));
