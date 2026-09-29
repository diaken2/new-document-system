// utils/roleFilters.js

/**
 * Создает базовый фильтр в зависимости от роли пользователя
 * @param {Object} user - Пользователь из req.user (может быть undefined)
 * @param {Object} query - Параметры запроса из req.query
 * @returns {Object} Фильтр для Mongoose
 */
const createRoleBasedFilter = (user, query) => {
  // Проверяем, есть ли user
  const userRole = user?.role || '';
  const userDepartment = user?.department || '';
  
  const { 
    search = '', 
    department: queryDepartment = '', 
    status = '', 
    dateFilter = '' 
  } = query;
  
  // Базовый фильтр
  const filter = {};
  
  // === ФИЛЬТРАЦИЯ ПО РОЛИ ===
  // Если пользователь есть и он локальный - фильтруем по его департаменту
  if (userRole === 'department_clerk' || userRole === 'department_head') {
    if (userDepartment) {
      filter.department = userDepartment;
    }
  }
  // Если пользователь глобальный и указан департамент в фильтре
  else if ((userRole === 'super_clerk' || userRole === 'general_head' || userRole === 'admin') && queryDepartment && queryDepartment !== 'all') {
    filter.department = queryDepartment;
  }
  // Если user не определен или не имеет роли - возвращаем пустой фильтр
  // (или можно добавить логику по умолчанию)
  
  // === ФИЛЬТР ПО СТАТУСУ ===
  if (status && status !== 'all') {
    filter.status = status;
  }
  
  // === ФИЛЬТР ПО СРОКУ ИСПОЛНЕНИЯ ===
  if (dateFilter && dateFilter !== 'all') {
    const today = new Date();
    
    switch (dateFilter) {
      case 'overdue':
        filter.controlDate = { $lt: today };
        filter.status = 'active';
        break;
      case 'today':
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        filter.controlDate = { $gte: startOfDay, $lte: endOfDay };
        filter.status = 'active';
        break;
      case '3days':
        const in3Days = new Date(today);
        in3Days.setDate(today.getDate() + 3);
        filter.controlDate = { $gte: today, $lte: in3Days };
        filter.status = 'active';
        break;
      case '7days':
        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);
        filter.controlDate = { $gte: today, $lte: in7Days };
        filter.status = 'active';
        break;
      case '14days':
        const in14Days = new Date(today);
        in14Days.setDate(today.getDate() + 14);
        filter.controlDate = { $gte: today, $lte: in14Days };
        filter.status = 'active';
        break;
    }
  }
  
  return filter;
};

/**
 * Добавляет поля для поиска в фильтр
 * @param {Object} filter - Существующий фильтр
 * @param {string} search - Строка поиска
 * @param {Array} searchFields - Поля для поиска
 * @returns {Object} Обновленный фильтр
 */
const addSearchFilter = (filter, search, searchFields) => {
  if (search && searchFields.length > 0) {
    filter.$or = searchFields.map(field => ({
      [field]: { $regex: search, $options: 'i' }
    }));
  }
  return filter;
};

/**
 * Определяет, нужно ли populate департамент
 * @param {string} role - Роль пользователя
 * @returns {boolean}
 */
const shouldPopulateDepartment = (role) => {
  // Глобальные пользователи видят название департамента
  return role === 'super_clerk' || role === 'general_head' || role === 'admin';
};

export { createRoleBasedFilter, addSearchFilter, shouldPopulateDepartment };