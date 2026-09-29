import express from "express";
import Executor from "../models/Executor.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Все роуты требуют аутентификации
router.use(authenticate);

// Получить всех исполнителей (с пагинацией и поиском)
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50, activeOnly = 'true' } = req.query;
    
    // Создаем фильтр
    const filter = {};
    
    // Фильтр по активности
    if (activeOnly === 'true') {
      filter.isActive = true;
    }
    
    // Поиск по имени или должности
    if (search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { fullName: searchRegex },
        { position: searchRegex },
        { department: searchRegex }
      ];
    }
    
    // Пагинация
    const skip = (page - 1) * limit;
    
    // Выполняем запрос
    const [executors, total] = await Promise.all([
      Executor.find(filter)
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-__v')
        .lean(),
      Executor.countDocuments(filter)
    ]);
    
    res.json({
      success: true,
      data: executors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка при получении исполнителей:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Получить всех исполнителей для выпадающего списка (без пагинации)
router.get('/list', async (req, res) => {
  try {
    const executors = await Executor.find({ isActive: true })
      .sort({ fullName: 1 })
      .select('fullName position department _id')
      .lean();
    
    res.json({
      success: true,
      data: executors
    });
  } catch (error) {
    console.error('Ошибка при получении списка исполнителей:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Создать нового исполнителя
router.post('/', async (req, res) => {
  try {
    const { fullName, position, department, phone, email, notes } = req.body;
    
    // Проверка обязательных полей
    if (!fullName || fullName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'ФИО обязательно для заполнения'
      });
    }
    
    // Проверка на дубликат (по имени)
    const existingExecutor = await Executor.findOne({ 
      fullName: { $regex: new RegExp(`^${fullName.trim()}$`, 'i') }
    });
    
    if (existingExecutor) {
      return res.status(400).json({
        success: false,
        error: 'Исполнитель с таким ФИО уже существует'
      });
    }
    
    // Создаем исполнителя
    const executor = new Executor({
      fullName: fullName.trim(),
      position: position ? position.trim() : '',
      department: department ? department.trim() : '',
      phone: phone ? phone.trim() : '',
      email: email ? email.trim().toLowerCase() : '',
      notes: notes ? notes.trim() : '',
      createdBy: req.user.userId
    });
    
    await executor.save();
    
    // Убираем служебные поля из ответа
    const executorResponse = executor.toObject();
    delete executorResponse.__v;
    
    res.status(201).json({
      success: true,
      message: 'Исполнитель успешно создан',
      data: executorResponse
    });
  } catch (error) {
    console.error('Ошибка при создании исполнителя:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Обновить исполнителя
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Проверяем существование исполнителя
    const executor = await Executor.findById(id);
    if (!executor) {
      return res.status(404).json({
        success: false,
        error: 'Исполнитель не найден'
      });
    }
    
    // Если меняется имя, проверяем на дубликат
    if (updateData.fullName && updateData.fullName.trim() !== executor.fullName) {
      const existingExecutor = await Executor.findOne({ 
        fullName: { $regex: new RegExp(`^${updateData.fullName.trim()}$`, 'i') },
        _id: { $ne: id }
      });
      
      if (existingExecutor) {
        return res.status(400).json({
          success: false,
          error: 'Исполнитель с таким ФИО уже существует'
        });
      }
    }
    
    // Обновляем данные
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        if (typeof updateData[key] === 'string') {
          executor[key] = updateData[key].trim();
        } else {
          executor[key] = updateData[key];
        }
      }
    });
    
    executor.updatedAt = new Date();
    await executor.save();
    
    const executorResponse = executor.toObject();
    delete executorResponse.__v;
    
    res.json({
      success: true,
      message: 'Исполнитель успешно обновлен',
      data: executorResponse
    });
  } catch (error) {
    console.error('Ошибка при обновлении исполнителя:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Удалить исполнителя (мягкое удаление)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const executor = await Executor.findById(id);
    if (!executor) {
      return res.status(404).json({
        success: false,
        error: 'Исполнитель не найден'
      });
    }
    
    // Мягкое удаление - деактивация
    executor.isActive = false;
    executor.updatedAt = new Date();
    await executor.save();
    
    res.json({
      success: true,
      message: 'Исполнитель успешно деактивирован'
    });
  } catch (error) {
    console.error('Ошибка при удалении исполнителя:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;