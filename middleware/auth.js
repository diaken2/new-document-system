// middleware/auth.js
import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  try {
    // 1. Получаем токен из заголовка
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Требуется авторизация' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // 2. Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // 3. Добавляем пользователя в запрос
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      department: decoded.department
    };
    
    console.log('Аутентифицирован пользователь:', req.user);
    
    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Срок действия токена истек' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Недействительный токен' 
      });
    }
    
    res.status(401).json({ 
      success: false, 
      error: 'Ошибка аутентификации' 
    });
  }
};

export { authenticate };