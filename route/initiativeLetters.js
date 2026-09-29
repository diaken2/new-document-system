import express from "express"
import InitiativeLetter from "../models/InitiativeLetter.js"
import { createRoleBasedFilter, shouldPopulateDepartment } from "../utils/roleFilters.js";

const router = express.Router();
// В initiative-letters.js добавьте:

router.get('/archived', async (req, res) => {
  try {
    const { 
      search = '', 
      department = '', 
      status = '',
      page = 1, 
      limit = 10 
    } = req.query;
    
    // Получаем пользователя
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя');
      }
    }
    
    // 1. Базовый фильтр для архива
    const filter = { isArchived: true };
    
    // 2. Фильтр по статусу
    if (status) {
      switch(status) {
        case 'archived':
          filter.status = 'archived';
          break;
        case 'completed':
          filter.status = 'completed';
          break;
        case 'overdue':
          filter.status = 'overdue';
          break;
        default:
          // Если значение не распознано, не добавляем фильтр
      }
    }
    
    // 3. Фильтр по департаменту для локальных пользователей
    if (user && (user.role === 'department_clerk' || user.role === 'department_head')) {
      filter.department = user.department?._id || user.department;
    }
    
    // 4. Фильтр по департаменту из запроса (для супер-делопроизводителей)
    if (department && user && ['super_clerk', 'admin'].includes(user.role)) {
      filter.department = department;
    }
    
    // 5. Поиск
    if (search) {
      const searchConditions = [
        { regNumber: { $regex: search, $options: 'i' } },
        { correspondent: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { note: { $regex: search, $options: 'i' } } // Добавили note
      ];
      
      // Для поиска по исполнителю нужно сначала найти пользователей
      if (search) {
        try {
          const User = mongoose.model('User');
          const users = await User.find({
            $or: [
              { fullName: { $regex: search, $options: 'i' } },
              { position: { $regex: search, $options: 'i' } }
            ]
          }).select('_id');
          
          if (users.length > 0) {
            const userIds = users.map(u => u._id);
            searchConditions.push({ executor: { $in: userIds } });
          }
        } catch (err) {
          console.log('Ошибка при поиске пользователей:', err.message);
        }
      }
      
      filter.$or = searchConditions;
    }
    
    const skip = (page - 1) * limit;
    
    // Строим запрос с populate
    let query = InitiativeLetter.find(filter)
      .populate('executor', 'fullName position department')
      .sort({ archivedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Populate департамента
    if (user && shouldPopulateDepartment(user.role)) {
      query = query.populate('department', 'name code');
    }
    
    const letters = await query;
    
    const total = await InitiativeLetter.countDocuments(filter);
    
    res.json({
      success: true,
      data: letters,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения архива писем:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
router.put('/:id/archive', async (req, res) => {
  try {
    // Получаем пользователя
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя');
      }
    }
    
    const letter = await InitiativeLetter.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: true,
        status: 'archived',
        archivedAt: new Date(),
        archivedBy: user?._id || null
      },
      { new: true }
    );
    
    if (!letter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Письмо не найдено' 
      });
    }
    
    // Populate для ответа
    const populatedLetter = await InitiativeLetter.findById(letter._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department')
      .populate('archivedBy', 'fullName');
    
    res.json({ 
      success: true, 
      message: 'Письмо отправлено в архив',
      data: populatedLetter 
    });
  } catch (error) {
    console.error('Ошибка архивации письма:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Обновить письмо
router.put('/:id', async (req, res) => {
  try {
    const letter = await InitiativeLetter.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!letter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Письмо не найдено' 
      });
    }
    
    // Populate для ответа
    const populatedLetter = await InitiativeLetter.findById(letter._id)
      .populate('department', 'name code')
     .populate('executor', 'fullName position department');
    
    res.json({
      success: true,
      message: 'Письмо обновлено',
      data: populatedLetter
    });
  } catch (error) {
    console.error('Ошибка при обновлении письма:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Восстановить письмо из архива (уже есть, но улучшим)
router.put('/:id/restore', async (req, res) => {
  try {
    const letter = await InitiativeLetter.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );
    
    if (!letter) {
      return res.status(404).json({ 
        success: false, 
        error: 'Письмо не найдено' 
      });
    }
    
    // Populate для ответа
    const populatedLetter = await InitiativeLetter.findById(letter._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');
    
    res.json({ 
      success: true, 
      message: 'Письмо восстановлено',
      data: populatedLetter 
    });
  } catch (error) {
    console.error('Ошибка восстановления письма:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// [В основном GET маршруте ДОБАВИТЬ исключение архивных]
router.get('/', async (req, res) => {
  try {
    const { search = '', department = '', page = 1, limit = 10 } = req.query;
    
    // Получаем пользователя из заголовка
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя:', e.message);
      }
    }
    
    // 1. Базовый фильтр по роли
    const filter = createRoleBasedFilter(user, { department });
    
    // ДОБАВИТЬ: исключаем архивные документы
    filter.isArchived = false;
    
    // 2. Поиск
    if (search) {
      const searchConditions = [
        { regNumber: { $regex: search, $options: 'i' } },
        { correspondent: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { note: { $regex: search, $options: 'i' } }
      ];
      
      // Для поиска по исполнителю
      if (search) {
        try {
          const User = mongoose.model('User');
          const users = await User.find({
            $or: [
              { fullName: { $regex: search, $options: 'i' } },
              { position: { $regex: search, $options: 'i' } }
            ]
          }).select('_id');
          
          if (users.length > 0) {
            const userIds = users.map(u => u._id);
            searchConditions.push({ executor: { $in: userIds } });
          }
        } catch (err) {
          console.log('Ошибка при поиске пользователей:', err.message);
        }
      }
      
      filter.$or = searchConditions;
    }

    // 3. Пагинация
    const skip = (page - 1) * limit;
    
    // 4. Строим запрос с populate
    let query = InitiativeLetter.find(filter).sort({ date: -1 });
    
    // 5. Populate департамента
    if (user && user.role && shouldPopulateDepartment(user.role)) {
      query = query.populate('department', 'name code');
    }
    
    // 6. ВСЕГДА populate исполнителя!
    query = query.populate('executor', 'fullName position department');
    
    // 7. Выполняем запрос
    const letters = await query
      .skip(skip)
      .limit(parseInt(limit));

    // 8. Общее количество (без populate для скорости)
    const total = await InitiativeLetter.countDocuments(filter);

    res.json({
      success: true,
      data: letters,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
  } catch (error) {
    console.error('Ошибка при получении писем:', error);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

// Создать письмо
router.post('/', async (req, res) => {
  try {
    // Получаем информацию о пользователе
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя:', e.message);
      }
    }

    // Определяем департамент
    let departmentId = req.body.department;
    
    // Если пользователь локальный - используем его департамент
    if (user && (user.role === 'department_clerk' || user.role === 'department_head')) {
      departmentId = user.department;
    }

    const letter = new InitiativeLetter({
      ...req.body,
      department: departmentId
    });
    
    await letter.save();

    // Populate для ответа
    const populatedLetter = await InitiativeLetter.findById(letter._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');

    res.status(201).json({ 
      success: true, 
      message: 'Письмо успешно создано',
      data: populatedLetter 
    });
  } catch (error) {
    console.error('Ошибка при создании письма:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;