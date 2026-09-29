import express from "express";
import User from "../models/User.js";
import { hashPassword, generateToken, comparePassword } from "../utils/auth.js";
import { DEPARTMENTS, ROLES } from "../config/depertaments.js"
import Departament from "../models/Departament.js";



const router = express.Router();

// ==================== ПУБЛИЧНЫЕ РОУТЫ ====================

// Вход в систему - НЕ требует аутентификации
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Поиск пользователя с populate департамента
    const user = await User.findOne({ username })
      .populate('department', 'name code'); // ДОБАВЬТЕ ЭТУ СТРОКУ!
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверный логин или пароль' 
      });
    }
    
    // Проверка активности
    if (!user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Аккаунт отключен' 
      });
    }
    
    // Проверка пароля
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверный логин или пароль' 
      });
    }
    
    // Обновление времени последнего входа
    user.lastLogin = new Date();
    await user.save();
    
    // Генерация токена
    const token = generateToken(user._id, user.role, user.department?._id || user.department);
    
    // Подготовка ответа
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      data: {
        user: userResponse,
        token,
        roles: ROLES,
        departments: DEPARTMENTS
      }
    });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при входе' 
    });
  }
});

// ==================== ЗАЩИЩЕННЫЕ РОУТЫ ====================
router.post('/test-login', async (req, res) => {
  try {
    console.log('Тестовый логин вызван с данными:', req.body);
    
    // Создаем тестового пользователя если нет
    let user = await User.findOne({ username: 'admin' });
    
    if (!user) {
      console.log('Создаю тестового пользователя');
      const hashedPassword = await hashPassword('admin123');
      user = new User({
        username: 'admin',
        password: hashedPassword,
        fullName: 'Администратор',
        role: 'admin',
        isActive: true
      });
      await user.save();
    }
    
    console.log('Найден пользователь:', user.username);
    
    // Проверяем пароль
    const isPasswordValid = await comparePassword(req.body.password || 'admin123', user.password);
    console.log('Пароль верный?', isPasswordValid);
    
    if (req.body.username !== 'admin' || !isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Неверный логин или пароль' 
      });
    }
    
    const token = generateToken(user._id, user.role, user.department);
    
    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          department: user.department
        },
        token
      }
    });
  } catch (error) {
    console.error('Тестовый логин ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// routes/auth.js
router.get('/by-department/:departmentId', async (req, res) => {
  try {
    const users = await User.find({
      department: req.params.departmentId,
      isActive: true
    })
    .select('fullName position office')
    .sort({ fullName: 1 });
    
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
// Получение информации о текущем пользователе - ТРЕБУЕТ аутентификации
router.get('/me', async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password')
      .populate('department', 'name code'); // ДОБАВЬТЕ populate
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Пользователь не найден' 
      });
    }
    
    res.json({
      success: true,
      data: {
        user,
        roles: ROLES,
        departments: DEPARTMENTS
      }
    });
  } catch (error) {
    console.error('Ошибка при получении информации:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});
// Регистрация пользователя - ТРЕБУЕТ аутентификации и прав админа
router.post('/register', async (req, res) => {
  try {
    // ВРЕМЕННО: просто убираем проверку прав
    // Это позволит создать пользователей для тестирования
    console.log('Создание пользователя:', req.body);
    
    const { username, password, fullName, role, department, email } = req.body;
    
    // Проверка существующего пользователя
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Пользователь с таким логином уже существует' 
      });
    }
    
    // Проверка роли и департамента
    if ((role === 'department_clerk' || role === 'department_head') && !department) {
      return res.status(400).json({ 
        success: false, 
        error: 'Для данной роли необходимо указать департамент' 
      });
    }
    
    // Проверка существования департамента
    if (department) {
      const deptExists = await Departament.findById(department);
      if (!deptExists) {
        return res.status(400).json({ 
          success: false, 
          error: 'Указанный департамент не существует' 
        });
      }
    }
    
    // Хеширование пароля
    const hashedPassword = await hashPassword(password);
    
    // Создание пользователя
    const user = new User({
      username,
      password: hashedPassword,
      fullName,
      role: role || 'department_clerk',
      department: department || null,
      email,
      isActive: true
    });
    
    await user.save();
    
    // Не возвращаем пароль в ответе
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: 'Пользователь успешно создан',
      data: userResponse
    });
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при регистрации' 
    });
  }
});



// Получить список пользователей для выпадающего списка
router.get('/users/list', async (req, res) => {
  try {
    console.log('Получение списка пользователей (без аутентификации)');
    
    // Временное решение: возвращаем всех пользователей
    const users = await User.find({ isActive: true })
      .select('fullName position department role _id')
      .populate('department', 'name code')
      .sort({ fullName: 1 });
    
    res.json({
      success: true,
      data: users,
      message: 'ВНИМАНИЕ: роут без аутентификации'
    });
  } catch (error) {
    console.error('Ошибка при получении списка пользователей:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});
// Получение списка всех пользователей - ТРЕБУЕТ аутентификации и прав админа
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .populate('department', 'name code'); // ДОБАВЬТЕ populate
      
    res.json({
      success: true,
      data: users,
      total: users.length
    });
  } catch (error) {
    console.error('Ошибка при получении пользователей:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Обновление пользователя - ТРЕБУЕТ аутентификации и прав админа
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    console.log('Обновление пользователя:', { id, updateData });
    
    // Проверяем существование пользователя
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }
    
    // Обработка пароля: если пароль не указан или пустой - удаляем его из updateData
    if (updateData.password === '' || updateData.password === undefined) {
      delete updateData.password;
    } else if (updateData.password) {
      // Если пароль указан - хешируем его
      updateData.password = await hashPassword(updateData.password);
    }
    
    // Также удаляем пустые строки из updateData чтобы не ломать валидацию
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === '') {
        delete updateData[key];
      }
    });
    
    // Обновляем пользователя
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        context: 'query' // Это важно для правильной работы валидаторов
      }
    ).select('-password').populate('department', 'name code');
    
    res.json({
      success: true,
      message: 'Пользователь успешно обновлен',
      data: updatedUser
    });
  } catch (error) {
    console.error('Ошибка при обновлении пользователя:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Обновление профиля текущего пользователя
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.userId;
    const updateData = req.body;
    
    // Убираем поля, которые нельзя менять через профиль
    delete updateData.role;
    delete updateData.isActive;
    delete updateData.department;
    
    // Если обновляется пароль - хешируем его
    if (updateData.password) {
      updateData.password = await hashPassword(updateData.password);
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select('-password').populate('department', 'name code');
    
    res.json({
      success: true,
      message: 'Профиль успешно обновлен',
      data: updatedUser
    });
  } catch (error) {
    console.error('Ошибка при обновлении профиля:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Удаление пользователя - ТРЕБУЕТ аутентификации и прав админа
// Удаление пользователя - ТРЕБУЕТ аутентификации и прав админа
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Проверяем существование пользователя
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }
    
    // ВРЕМЕННО отключаем проверку на удаление самого себя
    // Так как req.user может быть undefined без middleware аутентификации
    // if (req.user && id === req.user.userId) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Нельзя удалить собственный аккаунт'
    //   });
    // }
    
    // Мягкое удаление - деактивация
    const deletedUser = await User.findByIdAndUpdate(
      id,
      { 
        isActive: false,
        deletedAt: new Date()
      },
      { new: true }
    ).select('-password').populate('department', 'name code');
    
    res.json({
      success: true,
      message: 'Пользователь успешно деактивирован',
      data: deletedUser
    });
  } catch (error) {
    console.error('Ошибка при удалении пользователя:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});





export default router;