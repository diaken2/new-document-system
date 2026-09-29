

import express from "express"
import Document from "../models/Document.js"
import { authenticate } from "../middleware/auth.js";
import mongoose from "mongoose"
import { createRoleBasedFilter, addSearchFilter, shouldPopulateDepartment } from "../utils/roleFilters.js"
const router = express.Router();
router.use(authenticate);

router.get('/archived', async (req, res) => {
  try {
    console.log('=== ЗАПРОС АРХИВА ===');
    console.log('Пользователь из auth:', req.user);
    console.log('Параметры запроса:', req.query);
    
    const { search = '', department = '', page = 1, limit = 10 } = req.query;
    
    // 1. Создаем базовый фильтр
    const filter = {};
    
    // 2. Фильтр по роли пользователя
    const userRole = req.user?.role;
    const userDepartmentId = req.user?.department?._id || req.user?.department;
    
    if (userRole === 'department_clerk' || userRole === 'department_head') {
      // Локальные пользователи видят только свой департамент
      filter.department = userDepartmentId;
    } else if (department && department !== 'all') {
      // Глобальные пользователи могут фильтровать по департаменту
      filter.department = department;
    }
    
    // 3. Фильтр архива
    filter.isArchived = true;
    
    console.log('Базовый фильтр:', filter);
    
    // 4. Пагинация
    const skip = (page - 1) * limit;
    
    // 5. Строим запрос
    let query = Document.find(filter);
    
    // 6. Populate департамента
    query = query.populate('department', 'name code');
    
    // 7. Populate исполнителя
    query = query.populate('executor', 'fullName position department') ;
    
    // 8. Выполняем запрос
    const allDocuments = await query.sort({ archivedAt: -1 }).exec();
    
    // 9. Фильтрация по поиску (если есть)
    let filteredDocuments = allDocuments;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredDocuments = allDocuments.filter(doc => {
        // Проверяем все текстовые поля
        const textMatch = 
          (doc.regNumber && doc.regNumber.toLowerCase().includes(searchTerm)) ||
          (doc.correspondentName && doc.correspondentName.toLowerCase().includes(searchTerm)) ||
          (doc.shortContent && doc.shortContent.toLowerCase().includes(searchTerm)) ||
          (doc.outgoingNumber && doc.outgoingNumber.toLowerCase().includes(searchTerm)) ||
          (doc.note && doc.note.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (doc.executor && doc.executor.fullName && doc.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (doc.executor && doc.executor.position && doc.executor.position.toLowerCase().includes(searchTerm)) ||
          (doc.department && doc.department.name && doc.department.name.toLowerCase().includes(searchTerm)) ||
          (doc.department && doc.department.code && doc.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты (если поиск похож на дату)
        const dateMatch = 
          (doc.date && formatDateForSearch(doc.date).includes(searchTerm)) ||
          (doc.outgoingDate && formatDateForSearch(doc.outgoingDate).includes(searchTerm)) ||
          (doc.controlDate && formatDateForSearch(doc.controlDate).includes(searchTerm)) ||
          (doc.actualDate && formatDateForSearch(doc.actualDate).includes(searchTerm)) ||
          (doc.archivedAt && formatDateForSearch(doc.archivedAt).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 10. Применяем пагинацию
    const total = filteredDocuments.length;
    const paginatedDocuments = filteredDocuments.slice(skip, skip + parseInt(limit));
    
    console.log('Результат архива:', {
      всего: allDocuments.length,
      послеПоиска: filteredDocuments.length,
      послеПагинации: paginatedDocuments.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedDocuments,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения архива:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// Восстановить документ из архива
router.put('/:id/restore', async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      { 
        isArchived: false,
        status: 'active',
        archivedAt: null
      },
      { new: true }
    );
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Документ не найден' });
    }
    
    res.json({ 
      success: true, 
      message: 'Документ восстановлен',
      data: document 
    });
  } catch (error) {
    console.error('Ошибка восстановления:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// Получить все документы с фильтрами
// Получить все документы с фильтрами
router.get('/', async (req, res) => {
  try {
    console.log('=== ЗАПРОС ДОКУМЕНТОВ ===');
    console.log('Пользователь:', req.user);
    console.log('Параметры:', req.query);
    
    const { 
      search = '', 
      department = '', 
      status = '',
      page = 1, 
      limit = 10,
      dateFilter = ''
    } = req.query;
    
    // 1. Создаем базовый фильтр
    const filter = {};
    
    // 2. Фильтр по роли пользователя
    const userRole = req.user?.role;
    const userDepartmentId = req.user?.department?._id || req.user?.department;
    
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
    let query = Document.find(filter);
    
    // 7. Populate департамента
    query = query.populate('department', 'name code');
    
    // 8. Populate исполнителя
    query = query.populate('executor', 'fullName position department') ;
    
    // 9. Выполняем запрос
    const allDocuments = await query.sort({ date: -1 }).exec();
    
    // 10. Фильтрация по поиску (если есть)
    let filteredDocuments = allDocuments;
    if (search && search.trim() !== '') {
      const searchTerm = search.trim().toLowerCase();
      
      filteredDocuments = allDocuments.filter(doc => {
        // Проверяем все текстовые поля
        const textMatch = 
          (doc.regNumber && doc.regNumber.toLowerCase().includes(searchTerm)) ||
          (doc.correspondentName && doc.correspondentName.toLowerCase().includes(searchTerm)) ||
          (doc.shortContent && doc.shortContent.toLowerCase().includes(searchTerm)) ||
          (doc.outgoingNumber && doc.outgoingNumber.toLowerCase().includes(searchTerm)) ||
          (doc.note && doc.note.toLowerCase().includes(searchTerm));
        
        // Проверяем populate поля
        const populateMatch = 
          (doc.executor && doc.executor.fullName && doc.executor.fullName.toLowerCase().includes(searchTerm)) ||
          (doc.executor && doc.executor.position && doc.executor.position.toLowerCase().includes(searchTerm)) ||
          (doc.department && doc.department.name && doc.department.name.toLowerCase().includes(searchTerm)) ||
          (doc.department && doc.department.code && doc.department.code.toLowerCase().includes(searchTerm));
        
        // Проверяем даты
        const dateMatch = 
          (doc.date && formatDateForSearch(doc.date).includes(searchTerm)) ||
          (doc.outgoingDate && formatDateForSearch(doc.outgoingDate).includes(searchTerm)) ||
          (doc.controlDate && formatDateForSearch(doc.controlDate).includes(searchTerm)) ||
          (doc.actualDate && formatDateForSearch(doc.actualDate).includes(searchTerm));
        
        return textMatch || populateMatch || dateMatch;
      });
    }
    
    // 11. Применяем пагинацию
    const total = filteredDocuments.length;
    const paginatedDocuments = filteredDocuments.slice(skip, skip + parseInt(limit));
    
    console.log('Результат запроса:', {
      всего: allDocuments.length,
      послеПоиска: filteredDocuments.length,
      послеПагинации: paginatedDocuments.length,
      пагинация: { page, limit, total }
    });
    
    res.json({
      success: true,
      data: paginatedDocuments,
      pagination: { 
        page: parseInt(page), 
        limit: parseInt(limit), 
        total, 
        pages: Math.ceil(total / limit) 
      },
      userInfo: {
        role: req.user.role,
        department: req.user.department
      }
    });
  } catch (error) {
    console.error('Ошибка при получении документов:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении документов' 
    });
  }
});
// Получить документ по ID
router.get('/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department') ;
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        error: 'Документ не найден' 
      });
    }
    
    res.json({ success: true, data: document });
  } catch (error) {
    console.error('Ошибка при получении документа:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера при получении документа' 
    });
  }
});

// Создать документ
router.post('/', async (req, res) => {
  try {
    console.log('Создание документа, данные:', req.body);
    
    // Определяем департамент в зависимости от роли пользователя
    let departmentId;
    const userRole = req.user.role;
    
    if (userRole === 'department_clerk' || userRole === 'department_head') {
      // Локальные пользователи: используем их департамент
      departmentId = req.user.department;
    } else {
      // Глобальные пользователи: департамент из запроса
      departmentId = req.body.department;
    }
    
    // Автогенерация номера если не указан
    const lastDoc = await Document.findOne().sort({ regNumber: -1 });
    let regNumber = req.body.regNumber;
    
    if (!regNumber && lastDoc && lastDoc.regNumber) {
      const match = lastDoc.regNumber.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1]) + 1;
        regNumber = `245-${num}`;
      } else {
        regNumber = `245-1`;
      }
    } else if (!regNumber) {
      regNumber = `245-1`;
    }
    
    const document = new Document({
      ...req.body,
      regNumber,
      department: departmentId, // Используем правильный department
      status: req.body.status || 'active'
    });
    
    await document.save();
    
    // Populate для ответа
    const populatedDoc = await Document.findById(document._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department') ;
    
    res.status(201).json({
      success: true,
      message: 'Документ успешно создан',
      data: populatedDoc
    });
  } catch (error) {
    console.error('Ошибка при создании документа:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Обновить документ
// Обновить документ
router.put('/:id', async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        error: 'Документ не найден' 
      });
    }
    
    // Populate для ответа
    const populatedDoc = await Document.findById(document._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department') ;
    
    res.json({
      success: true,
      message: 'Документ обновлен',
      data: populatedDoc
    });
  } catch (error) {
    console.error('Ошибка при обновлении документа:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Архивировать документ
// Архивировать документ
router.put('/:id/archive', async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'archived',
        isArchived: true,
        archivedAt: new Date(),
        actualDate: new Date()
      },
      { new: true }
    );
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        error: 'Документ не найден' 
      });
    }
    
    // Populate для ответа
    const populatedDoc = await Document.findById(document._id)
      .populate('department', 'name code')
      .populate('executor', 'fullName position department');
    
    res.json({
      success: true,
      message: 'Документ отправлен в архив',
      data: populatedDoc
    });
  } catch (error) {
    console.error('Ошибка при архивации документа:', error);
    res.status(400).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Удалить документ
router.delete('/:id', async (req, res) => {
  try {
    const document = await Document.findByIdAndDelete(req.params.id);
    
    if (!document) {
      return res.status(404).json({ 
        success: false, 
        error: 'Документ не найден' 
      });
    }
    
    res.json({
      success: true,
      message: 'Документ удален'
    });
  } catch (error) {
    console.error('Ошибка при удалении документа:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

export default router