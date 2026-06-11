require('dotenv').config();
const path = require('path');
const express = require('express');
const routes = require('./routes');
const { startHeartbeat } = require('./controller');

const app = express();
app.use(express.json());
app.use(routes);
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`gateway running on :${PORT}`);
  startHeartbeat();
});
