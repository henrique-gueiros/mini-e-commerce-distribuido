const router = require('express').Router();
const { proxyRequest, getProductsTarget } = require('./controller');

function requireToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing authorization token' });
  }
  next();
}

// Users — public
router.post('/users/register', (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));
router.post('/users/login', (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));

// Users — protected
router.get('/users/:id', requireToken, (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));

// Products — public reads (round-robin between primary and replica)
router.get('/products', (req, res) => {
  const { name, url } = getProductsTarget();
  return proxyRequest(name, url, req, res);
});
router.get('/products/:id', (req, res) => {
  const { name, url } = getProductsTarget();
  return proxyRequest(name, url, req, res);
});

// Products — protected write (always to primary)
router.post('/products', requireToken, (req, res) =>
  proxyRequest('products', process.env.PRODUCTS_URL, req, res));

// Orders — protected
router.post('/orders', requireToken, (req, res) =>
  proxyRequest('orders', process.env.ORDERS_URL, req, res));
router.get('/orders/:userId', requireToken, (req, res) =>
  proxyRequest('orders', process.env.ORDERS_URL, req, res));

// Gateway health
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
