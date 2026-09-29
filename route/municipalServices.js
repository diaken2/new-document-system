import express from "express"
import MunicipalService from "../models/MunicipalServices.js"
import { createRoleBasedFilter, addSearchFilter, shouldPopulateDepartment } from "../utils/roleFilters.js";
const router = express.Router();

// Получить все заявки с фильтрами
// Получить архивные заявки на услуги


// Вспомогательная функция для форматирования даты для поиска
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
router.get('/archived', async (req, res) => {
  try {
    const { 
      search = '', 
      department = '', 
      page = 1, 
      limit = 10,
      serviceType = ''
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
    
    // 2. Фильтр по департаменту для локальных пользователей
    if (user && (user.role === 'department_clerk' || user.role === 'department_head')) {
      filter.department = user.department?._id || user.department;
    }
    
    // 3. Фильтр по департаменту из запроса (для супер-делопроизводителей)
    if (department && user && ['super_clerk', 'admin'].includes(user.role)) {
      filter.department = department;
    }
    
    // 4. Фильтр по типу услуги
    if (serviceType && serviceType !== 'all') {
      filter.serviceName = serviceType;
    }
    
    // 5. Поиск
    if (search) {
      filter.$or = [
        { regNumber: { $regex: search, $options: 'i' } },
        { applicantName: { $regex: search, $options: 'i' } },
        { shortContent: { $regex: search, $options: 'i' } },
        { serviceName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // 6. Пагинация
    const skip = (page - 1) * limit;
    
    // 7. Строим запрос с populate
    let query = MunicipalService.find(filter)
      .populate('executor', 'fullName position department')
      .sort({ archivedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // 8. Populate департамента для глобальных пользователей
    if (user && shouldPopulateDepartment(user.role)) {
      query = query.populate('department', 'name code');
    }
    
    // 9. Выполняем запрос
    const services = await query;
    
    // 10. Общее количество
    const total = await MunicipalService.countDocuments(filter);
    
    res.json({
      success: true,
      data: services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Ошибка получения архива услуг:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Восстановить заявку из архива
router.put('/:id/restore', async (req, res) => {
  try {
    const service = await MunicipalService.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    // Populate для ответа
    const populatedService = await MunicipalService.findById(service._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');
    
    res.json({ 
      success: true, 
      message: 'Заявка восстановлена',
      data: populatedService 
    });
  } catch (error) {
    console.error('Ошибка восстановления заявки:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// [Остальной существующий код остается без изменений, но ДОБАВИТЬ в основной GET]
// Получить все заявки с фильтрами
router.get('/', async (req, res) => {
  try {
    console.log('=== ЗАПРОС МУНИЦИПАЛЬНЫХ УСЛУГ ===');
    
    const { 
      search = '', 
      department = '', 
      status = '',
      serviceType = '',
      page = 1, 
      limit = 10,
      dateFilter = ''
    } = req.query;

    // Получаем пользователя из заголовка
    let user = {};
    const userHeader = req.headers['x-user-data'];
    if (userHeader) {
      try {
        user = JSON.parse(userHeader);
      } catch (e) {
        console.log('Не удалось распарсить заголовок пользователя');
      }
    }

    console.log('Пользователь для муниципальных услуг:', user);
    
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
    
    // 5. Фильтр по типу услуги
    if (serviceType && serviceType !== 'all') {
      filter.serviceName = serviceType;
    }
    
    console.log('Базовый фильтр:', filter);
    
    // 6. Пагинация
    const skip = (page - 1) * limit;
    
    // 7. Строим запрос
    let query = MunicipalService.find(filter);
    
    // 8. Populate департамента
    if (shouldPopulateDepartment(userRole)) {
      query = query.populate('department', 'name code');
    }
    
    // 9. Populate исполнителя
    query = query.populate('executor', 'fullName position department');
    
    // 10. Выполняем запрос
    const allServices = await query.sort({ date: -1 }).exec();
    
    // 11. Фильтрация по поиску (если есть)
    let filteredServices = allServices;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredServices = allServices.filter(service => {
        // Проверяем все текстовые поля
        const textMatch = 
          (service.regNumber && service.regNumber.toLowerCase().includes(searchTerm)) ||
          (service.applicantName && service.applicantName.toLowerCase().includes(searchTerm)) ||
          (service.shortContent && service.shortContent.toLowerCase().includes(searchTerm)) ||
          (service.serviceName && service.serviceName.toLowerCase().includes(searchTerm)) ||
          (service.source && service.source.toLowerCase().includes(searchTerm)) ||
          (service.note && service.note.toLowerCase().includes(searchTerm)) ||
          (service.applicantType && service.applicantType.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (service.executor && service.executor.fullName && service.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (service.executor && service.executor.position && service.executor.position.toLowerCase().includes(searchTerm)) ||
          (service.department && service.department.name && service.department.name.toLowerCase().includes(searchTerm)) ||
          (service.department && service.department.code && service.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты
        const dateMatch = 
          (service.date && formatDateForSearch(service.date).includes(searchTerm)) ||
          (service.applicantDate && formatDateForSearch(service.applicantDate).includes(searchTerm)) ||
          (service.controlDate && formatDateForSearch(service.controlDate).includes(searchTerm)) ||
          (service.actualDate && formatDateForSearch(service.actualDate).includes(searchTerm)) ||
          (service.extendedDate && formatDateForSearch(service.extendedDate).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 12. Фильтрация по сроку исполнения (dateFilter)
    if (dateFilter && dateFilter !== 'all') {
      filteredServices = filteredServices.filter(service => {
        if (!service.controlDate) return false;
        
        const controlDate = new Date(service.controlDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const diffTime = controlDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        switch (dateFilter) {
          case 'overdue':
            return diffDays < 0 && service.status !== 'completed';
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
    
    // 13. Применяем пагинацию
    const total = filteredServices.length;
    const paginatedServices = filteredServices.slice(skip, skip + parseInt(limit));
    
    console.log('Результат запроса:', {
      всего: allServices.length,
      послеПоиска: filteredServices.length,
      послеПагинации: paginatedServices.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedServices,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
  } catch (error) {
    console.error('Ошибка при получении заявок на услуги:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении заявок' 
    });
  }
});


// Получить заявку по ID
router.get('/:id', async (req, res) => {
  try {
    const service = await MunicipalService.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    res.json({ success: true, data: service });
  } catch (error) {
    console.error('Ошибка при получении заявки:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении заявки' 
    });
  }
});


// В municipal-services.js добавьте:

router.get('/archived', async (req, res) => {
  try {
    console.log('=== ЗАПРОС АРХИВА МУНИЦИПАЛЬНЫХ УСЛУГ ===');
    
    const { 
      search = '', 
      department = '', 
      page = 1, 
      limit = 10,
      serviceType = ''
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
    
    // 3. Фильтр по типу услуги
    if (serviceType && serviceType !== 'all') {
      filter.serviceName = serviceType;
    }
    
    console.log('Базовый фильтр архива:', filter);
    
    // 4. Пагинация
    const skip = (page - 1) * limit;
    
    // 5. Строим запрос
    let query = MunicipalService.find(filter);
    
    // 6. Populate департамента
    if (shouldPopulateDepartment(userRole)) {
      query = query.populate('department', 'name code');
    }
    
    // 7. Populate исполнителя
    query = query.populate('executor', 'fullName position department');
    
    // 8. Выполняем запрос
    const allServices = await query.sort({ archivedAt: -1 }).exec();
    
    // 9. Фильтрация по поиску (если есть)
    let filteredServices = allServices;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredServices = allServices.filter(service => {
        // Проверяем все текстовые поля
        const textMatch = 
          (service.regNumber && service.regNumber.toLowerCase().includes(searchTerm)) ||
          (service.applicantName && service.applicantName.toLowerCase().includes(searchTerm)) ||
          (service.shortContent && service.shortContent.toLowerCase().includes(searchTerm)) ||
          (service.serviceName && service.serviceName.toLowerCase().includes(searchTerm)) ||
          (service.source && service.source.toLowerCase().includes(searchTerm)) ||
          (service.note && service.note.toLowerCase().includes(searchTerm)) ||
          (service.applicantType && service.applicantType.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (service.executor && service.executor.fullName && service.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (service.executor && service.executor.position && service.executor.position.toLowerCase().includes(searchTerm)) ||
          (service.department && service.department.name && service.department.name.toLowerCase().includes(searchTerm)) ||
          (service.department && service.department.code && service.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты
        const dateMatch = 
          (service.date && formatDateForSearch(service.date).includes(searchTerm)) ||
          (service.applicantDate && formatDateForSearch(service.applicantDate).includes(searchTerm)) ||
          (service.controlDate && formatDateForSearch(service.controlDate).includes(searchTerm)) ||
          (service.actualDate && formatDateForSearch(service.actualDate).includes(searchTerm)) ||
          (service.extendedDate && formatDateForSearch(service.extendedDate).includes(searchTerm)) ||
          (service.archivedAt && formatDateForSearch(service.archivedAt).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 10. Применяем пагинацию
    const total = filteredServices.length;
    const paginatedServices = filteredServices.slice(skip, skip + parseInt(limit));
    
    console.log('Результат архива:', {
      всего: allServices.length,
      послеПоиска: filteredServices.length,
      послеПагинации: paginatedServices.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedServices,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
  } catch (error) {
    console.error('Ошибка получения архива услуг:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Восстановить заявку из архива
router.put('/:id/restore', async (req, res) => {
  try {
    const service = await MunicipalService.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null,
        archivedBy: null
      },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Заявка восстановлена',
      data: service 
    });
  } catch (error) {
    console.error('Ошибка восстановления заявки:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
// Создать заявку
router.post('/', async (req, res) => {
  try {
    // Получаем информацию о пользователе
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
    const lastService = await MunicipalService.findOne().sort({ regNumber: -1 });
    let regNumber = req.body.regNumber;
    
    if (!regNumber && lastService && lastService.regNumber) {
      const match = lastService.regNumber.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1]) + 1;
        regNumber = `УСЛ-${num}`;
      } else {
        regNumber = `УСЛ-1`;
      }
    } else if (!regNumber) {
      regNumber = `УСЛ-1`;
    }
    
    const service = new MunicipalService({
      ...req.body,
      regNumber,
      department: departmentId,
      status: req.body.status || 'active'
    });
    
    await service.save();

    // Populate для ответа
    const populatedService = await MunicipalService.findById(service._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');

    res.status(201).json({
      success: true,
      message: 'Заявка на услугу успешно создана',
      data: populatedService
    });
  } catch (error) {
    console.error('Ошибка при создании заявки:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Обновить заявку
router.put('/:id', async (req, res) => {
  try {
    const service = await MunicipalService.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    res.json({
      success: true,
      message: 'Заявка обновлена',
      data: service
    });
  } catch (error) {
    console.error('Ошибка при обновлении заявки:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Архивировать заявку
router.put('/:id/archive', async (req, res) => {
  try {
    const service = await MunicipalService.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'archived',
        isArchived: true,
        archivedAt: new Date(),
        actualDate: new Date()
      },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    res.json({
      success: true,
      message: 'Заявка отправлена в архив',
      data: service
    });
  } catch (error) {
    console.error('Ошибка при архивации заявки:', error);
    res.status(400).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Удалить заявку
router.delete('/:id', async (req, res) => {
  try {
    const service = await MunicipalService.findByIdAndDelete(req.params.id);
    
    if (!service) {
      return res.status(404).json({ 
        success: false, 
        error: 'Заявка не найдена' 
      });
    }
    
    res.json({
      success: true,
      message: 'Заявка удалена'
    });
  } catch (error) {
    console.error('Ошибка при удалении заявки:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});



export default router;