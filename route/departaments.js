import express from "express";
import Department from "../models/Departament.js";


const router = express.Router();
// const checkAuth = (req, res, next) => {
//   try {
//     const authHeader = req.header('Authorization');
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       return res.status(401).json({ 
//         success: false, 
//         error: 'Требуется авторизация' 
//       });
//     }
    
//     const token = authHeader.replace('Bearer ', '');
//     const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
//     req.userId = decoded.userId;
//     req.userRole = decoded.role;
//     req.userDepartment = decoded.department;
    
//     next();
//   } catch (error) {
//     res.status(401).json({ 
//       success: false, 
//       error: 'Недействительный токен' 
//     });
//   }
// };

// Все роуты документов защищены
// router.use(checkAuth);
// Получить все департаменты

router.get('/list', async (req, res) => {
  try {
    // Упрощённый список без populate для выпадающего списка
    const departments = await Department.find({ isActive: true })
      .select('name code _id')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

router.get('/', async (req, res) => {
  try {
    // Можно добавить параметр для упрощённого списка
    const simple = req.query.simple === 'true';
    
    let query = Department.find({ isActive: true });
    
    if (simple) {
      query = query.select('name code _id');
    } else {
      query = query
        .populate('head', 'fullName email')
        .populate('parentDepartment', 'name code');
    }
    
    const departments = await query.sort({ name: 1 });

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});
// router.get('/',  async (req, res) => {
//   try {
//     const departments = await Department.find({ isActive: true })
//       .populate('head', 'fullName email')
//       .populate('parentDepartment', 'name code')
//       .sort({ name: 1 });

//     res.json({
//       success: true,
//       data: departments
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, error: 'Ошибка сервера' });
//   }
// });

// Создать департамент (только админ)
router.post('/', async (req, res) => {
  try {
    console.log('Создание департамента:', req.body);
    
    const { name, code, description, parentDepartment } = req.body;
    
    // ОБЯЗАТЕЛЬНО только название
    if (!name || name.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        error: 'Название обязательно' 
      });
    }
    
    // Код теперь не обязателен - его сгенерирует хук
    
    // Проверка уникальности названия
    const existingDept = await Department.findOne({ 
      name: name.trim() 
    });
    
    if (existingDept) {
      return res.status(400).json({ 
        success: false, 
        error: 'Департамент с таким названием уже существует' 
      });
    }
    
    const department = new Department({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : '', // Пустая строка - хук сгенерирует
      description: description || '',
      parentDepartment: parentDepartment || null,
      isActive: true
    });
    
    await department.save();
    
    console.log('Департамент создан успешно:', department);
    
    res.status(201).json({
      success: true,
      message: 'Департамент создан',
      data: {
        _id: department._id,
        name: department.name,
        code: department.code, // Будет сгенерирован автоматически
        isActive: department.isActive
      }
    });
  } catch (error) {
    console.error('Ошибка создания департамента:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Обновить департамент
router.put('/:id', async (req, res) => {
  try {
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!department) {
      return res.status(404).json({ success: false, error: 'Департамент не найден' });
    }
    
    res.json({
      success: true,
      message: 'Департамент обновлен',
      data: department
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Деактивировать департамент (мягкое удаление)
router.delete('/:id', async (req, res) => {
  try {
    // УПРОЩАЕМ: временно убираем проверку пользователей
    // const User = mongoose.model('User');
    // const usersInDept = await User.countDocuments({ 
    //   department: req.params.id,
    //   isActive: true 
    // });
    
    // if (usersInDept > 0) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Нельзя удалить департамент, в котором есть активные пользователи'
    //   });
    // }
    
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!department) {
      return res.status(404).json({
        success: false,
        error: 'Департамент не найден'
      });
    }
    
    res.json({
      success: true,
      message: 'Департамент деактивирован',
      data: department
    });
  } catch (error) {
    console.error('Ошибка удаления департамента:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
export default router;