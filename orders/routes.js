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

router.post('/orders', authMiddleware, controller.createOrder);
router.get('/orders/:userId', authMiddleware, controller.getOrders);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
