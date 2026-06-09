const router = require('express').Router();
const jwt = require('jsonwebtoken');
const controller = require('./controller');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid token' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  next();
}

function replicaOnlyMiddleware(req, res, next) {
  if (process.env.IS_REPLICA !== 'true') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

router.get('/products', controller.listProducts);
router.get('/products/:id', controller.getProduct);
router.post('/products', authMiddleware, adminMiddleware, controller.createProduct);
router.post('/internal/products', replicaOnlyMiddleware, controller.internalCreate);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
