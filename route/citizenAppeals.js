import express from "express"
import CitizenAppeal from "../models/CitizenAppeal.js"
import { createRoleBasedFilter, addSearchFilter, shouldPopulateDepartment } from "../utils/roleFilters.js";
const router = express.Router();
// Получить архивные обращения
const formatDateForSearch = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    // Форматируем в нескольких форматах для поиска
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}.${month}.${year} ${year}-${month}-${day}`;
  } catch (e) {
    console.error('Ошибка форматирования даты для поиска:', e);
    return '';
  }
};
// Получить архивные обращения
router.get('/archived', async (req, res) => {
  try {
    console.log('=== ЗАПРОС АРХИВА ОБРАЩЕНИЙ ===');
    
    const { search = '', department = '', page = 1, limit = 10 } = req.query;
    
    // Получаем пользователя из заголовков
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
    
    // 2. Фильтр по роли пользователя
    const userRole = user?.role;
    const userDepartmentId = user?.department?._id || user?.department;
    
    if (userRole === 'department_clerk' || userRole === 'department_head') {
      // Локальные пользователи видят только свой департамент
      filter.department = userDepartmentId;
    } else if (department && department !== 'all') {
      // Глобальные пользователи могут фильтровать по департаменту
      filter.department = department;
    }
    
    console.log('Базовый фильтр архива:', filter);
    
    // 3. Пагинация
    const skip = (page - 1) * limit;
    
    // 4. Строим запрос
    let query = CitizenAppeal.find(filter);
    
    // 5. Populate департамента
    if (shouldPopulateDepartment(userRole)) {
      query = query.populate('department', 'name code');
    }
    
    // 6. Populate исполнителя
    query = query.populate('executor', 'fullName position department');
    
    // 7. Выполняем запрос
    const allAppeals = await query.sort({ archivedAt: -1 }).exec();
    
    // 8. Фильтрация по поиску (если есть)
    let filteredAppeals = allAppeals;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredAppeals = allAppeals.filter(appeal => {
        // Проверяем все текстовые поля
        const textMatch = 
          (appeal.regNumber && appeal.regNumber.toLowerCase().includes(searchTerm)) ||
          (appeal.citizenName && appeal.citizenName.toLowerCase().includes(searchTerm)) ||
          (appeal.citizenAddress && appeal.citizenAddress.toLowerCase().includes(searchTerm)) ||
          (appeal.shortContent && appeal.shortContent.toLowerCase().includes(searchTerm)) ||
          (appeal.outgoingNumber && appeal.outgoingNumber.toLowerCase().includes(searchTerm)) ||
          (appeal.note && appeal.note.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (appeal.executor && appeal.executor.fullName && appeal.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (appeal.executor && appeal.executor.position && appeal.executor.position.toLowerCase().includes(searchTerm)) ||
          (appeal.department && appeal.department.name && appeal.department.name.toLowerCase().includes(searchTerm)) ||
          (appeal.department && appeal.department.code && appeal.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты
        const dateMatch = 
          (appeal.date && formatDateForSearch(appeal.date).includes(searchTerm)) ||
          (appeal.outgoingDate && formatDateForSearch(appeal.outgoingDate).includes(searchTerm)) ||
          (appeal.controlDate && formatDateForSearch(appeal.controlDate).includes(searchTerm)) ||
          (appeal.actualDate && formatDateForSearch(appeal.actualDate).includes(searchTerm)) ||
          (appeal.archivedAt && formatDateForSearch(appeal.archivedAt).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 9. Применяем пагинацию
    const total = filteredAppeals.length;
    const paginatedAppeals = filteredAppeals.slice(skip, skip + parseInt(limit));
    
    console.log('Результат архива:', {
      всего: allAppeals.length,
      послеПоиска: filteredAppeals.length,
      послеПагинации: paginatedAppeals.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedAppeals,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
  } catch (error) {
    console.error('Ошибка получения архива обращений:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Восстановить обращение из архива
router.put('/:id/restore', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найдено' 
      });
    }
    
    // Populate для ответа
    const populatedAppeal = await CitizenAppeal.findById(appeal._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');
    
    res.json({ 
      success: true, 
      message: 'Обращение восстановлено',
      data: populatedAppeal 
    });
  } catch (error) {
    console.error('Ошибка восстановления обращения:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Получить все обращения с фильтрами
router.get('/', async (req, res) => {
  try {
    console.log('=== ЗАПРОС ОБРАЩЕНИЙ ГРАЖДАН ===');
    
    const { 
      search = '', 
      department = '', 
      status = '',
      page = 1, 
      limit = 10,
      dateFilter = ''
    } = req.query;

    // Получаем пользователя из заголовков
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя');
      }
    }

    console.log('Пользователь из запроса:', user);
    
    // 1. Базовый фильтр
    const filter = {};
    
    // 2. Фильтр по роли пользователя
    const userRole = user?.role;
    const userDepartmentId = user?.department?._id || user?.department;
    
    if (userRole === 'department_clerk' || userRole === 'department_head') {
      // Локальные пользователи видят только свой департамент
      filter.department = userDepartmentId;
    } else if (department && department !== 'all') {
      // Глобальные пользователи могут фильтровать по департаменту
      filter.department = department;
    }
    
    // 3. Исключаем архивные документы
    filter.isArchived = false;
    
    // 4. Фильтр по статусу
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    console.log('Базовый фильтр:', filter);
    
    // 5. Пагинация
    const skip = (page - 1) * limit;
    
    // 6. Строим запрос
    let query = CitizenAppeal.find(filter);
    
    // 7. Populate департамента
    if (shouldPopulateDepartment(userRole)) {
      query = query.populate('department', 'name code');
    }
    
    // 8. Populate исполнителя
    query = query.populate('executor', 'fullName position department');
    
    // 9. Выполняем запрос
    const allAppeals = await query.sort({ date: -1 }).exec();
    
    // 10. Фильтрация по поиску (если есть)
    let filteredAppeals = allAppeals;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredAppeals = allAppeals.filter(appeal => {
        // Проверяем все текстовые поля
        const textMatch = 
          (appeal.regNumber && appeal.regNumber.toLowerCase().includes(searchTerm)) ||
          (appeal.citizenName && appeal.citizenName.toLowerCase().includes(searchTerm)) ||
          (appeal.citizenAddress && appeal.citizenAddress.toLowerCase().includes(searchTerm)) ||
          (appeal.shortContent && appeal.shortContent.toLowerCase().includes(searchTerm)) ||
          (appeal.outgoingNumber && appeal.outgoingNumber.toLowerCase().includes(searchTerm)) ||
          (appeal.note && appeal.note.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (appeal.executor && appeal.executor.fullName && appeal.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (appeal.executor && appeal.executor.position && appeal.executor.position.toLowerCase().includes(searchTerm)) ||
          (appeal.department && appeal.department.name && appeal.department.name.toLowerCase().includes(searchTerm)) ||
          (appeal.department && appeal.department.code && appeal.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты
        const dateMatch = 
          (appeal.date && formatDateForSearch(appeal.date).includes(searchTerm)) ||
          (appeal.outgoingDate && formatDateForSearch(appeal.outgoingDate).includes(searchTerm)) ||
          (appeal.controlDate && formatDateForSearch(appeal.controlDate).includes(searchTerm)) ||
          (appeal.actualDate && formatDateForSearch(appeal.actualDate).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 11. Фильтрация по сроку исполнения (dateFilter)
    if (dateFilter && dateFilter !== 'all') {
      filteredAppeals = filteredAppeals.filter(appeal => {
        if (!appeal.controlDate) return false;
        
        const controlDate = new Date(appeal.controlDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const diffTime = controlDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        switch (dateFilter) {
          case 'overdue':
            return diffDays < 0 && appeal.status !== 'completed';
          case 'today':
            return diffDays === 0;
          case '3days':
            return diffDays >= 0 && diffDays <= 3;
          case '7days':
            return diffDays >= 0 && diffDays <= 7;
          case '14days':
            return diffDays >= 0 && diffDays <= 14;
          default:
            return true;
        }
      });
    }
    
    // 12. Применяем пагинацию
    const total = filteredAppeals.length;
    const paginatedAppeals = filteredAppeals.slice(skip, skip + parseInt(limit));
    
    console.log('Результат запроса:', {
      всего: allAppeals.length,
      послеПоиска: filteredAppeals.length,
      послеПагинации: paginatedAppeals.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedAppeals,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
  } catch (error) {
    console.error('Ошибка при получении обращений:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении обращений' 
    });
  }
});


// Получить обращение по ID
router.get('/:id', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findById(req.params.id);
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найдено' 
      });
    }
    
    res.json({ success: true, data: appeal });
  } catch (error) {
    console.error('Ошибка при получении обращения:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении обращения' 
    });
  }
});

// Создать обращение
router.post('/', async (req, res) => {
  try {
    // Получаем информацию о пользователе из запроса
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя');
      }
    }

    // Определяем департамент
    let departmentId = req.body.department;
    
    // Если пользователь локальный - используем его департамент
    if (user.role === 'department_clerk' || user.role === 'department_head') {
      departmentId = user.department;
    }
    
    // Автогенерация номера если не указан
    const lastAppeal = await CitizenAppeal.findOne().sort({ regNumber: -1 });
    let regNumber = req.body.regNumber;
    
    if (!regNumber && lastAppeal && lastAppeal.regNumber) {
      const match = lastAppeal.regNumber.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1]) + 1;
        regNumber = `ГР-${num}`;
      } else {
        regNumber = `ГР-1`;
      }
    } else if (!regNumber) {
      regNumber = `ГР-1`;
    }
    
    const appeal = new CitizenAppeal({
      ...req.body,
      regNumber,
      department: departmentId,
      status: req.body.status || 'active'
    });
    
    await appeal.save();
    
    // Populate для ответа
    const populatedAppeal = await CitizenAppeal.findById(appeal._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department'); // ДОБАВЬТЕ
    
    res.status(201).json({
      success: true,
      message: 'Обращение успешно создано',
      data: populatedAppeal
    });
  } catch (error) {
    console.error('Ошибка при создании обращения:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Продолжение citizen-appeals.js
router.put('/:id/restore', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найдено' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Обращение восстановлено',
      data: appeal 
    });
  } catch (error) {
    console.error('Ошибка восстановления обращения:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Обновить обращение
router.put('/:id', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найден' 
      });
    }
    
    res.json({
      success: true,
      message: 'Обращение обновлено',
      data: appeal
    });
  } catch (error) {
    console.error('Ошибка при обновлении обращения:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Архивировать обращение
router.put('/:id/archive', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'archived',
        isArchived: true,
        archivedAt: new Date(),
        actualDate: new Date()
      },
      { new: true }
    );
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найдено' 
      });
    }
    
    res.json({
      success: true,
      message: 'Обращение отправлено в архив',
      data: appeal
    });
  } catch (error) {
    console.error('Ошибка при архивации обращения:', error);
    res.status(400).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Удалить обращение
router.delete('/:id', async (req, res) => {
  try {
    const appeal = await CitizenAppeal.findByIdAndDelete(req.params.id);
    
    if (!appeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Обращение не найдено' 
      });
    }
    
    res.json({
      success: true,
      message: 'Обращение удалено'
    });
  } catch (error) {
    console.error('Ошибка при удалении обращения:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

export default router;