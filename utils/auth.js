import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Хеширование пароля
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

// Создание JWT токена
export const generateToken = (userId, role, department) => {
  return jwt.sign(
    { userId, role, department },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// Проверка пароля
export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};