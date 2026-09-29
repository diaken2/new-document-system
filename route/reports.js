// routes/reports.js
import express from "express";
import Document from "../models/Document.js";
import CitizenAppeal from "../models/CitizenAppeal.js";
import MunicipalService from "../models/MunicipalServices.js";
import InitiativeLetter from "../models/InitiativeLetter.js";
import Department from "../models/Departament.js";

const router = express.Router();

// Вспомогательные функции
const buildDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Включить весь последний день
    
    filter.date = { 
      $gte: start, 
      $lte: end 
    };
  }
  return filter;
};

const buildDepartmentFilter = (departmentId) => {
  const filter = {};
  if (departmentId && departmentId !== 'all') {
    filter.department = departmentId;
  }
  return filter;
};

const getDocTypeName = (type) => {
  const types = {
    'document': 'Общее делопроизводство',
    'appeal': 'Обращения граждан',
    'service': 'Муниципальные услуги',
    'letter': 'Инициативные письма'
  };
  return types[type] || type;
};

// 1. ОТЧЕТ: Количество поступивших за период (СООТВЕТСТВУЕТ ТЗ)
router.get('/incoming-count', async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    
    const dateFilter = buildDateFilter(startDate, endDate);
    const deptFilter = buildDepartmentFilter(departmentId);
    const filter = { ...dateFilter, ...deptFilter };
    
    // Подсчет ВСЕХ документов (архивных и неархивных)
    const [documents, appeals, services, letters] = await Promise.all([
      Document.countDocuments(filter),
      CitizenAppeal.countDocuments(filter),
      MunicipalService.countDocuments(filter),
      InitiativeLetter.countDocuments(filter)
    ]);
    
    const total = documents + appeals + services + letters;
    
    // Название департамента
    let departmentName = 'Все департаменты (вся администрация)';
    if (departmentId && departmentId !== 'all') {
      const dept = await Department.findById(departmentId);
      departmentName = dept ? `${dept.name} (${dept.code})` : departmentId;
    }
    
    res.json({
      success: true,
      data: {
        total,
        byType: {
          'Общее делопроизводство': documents,
          'Обращения граждан': appeals,
          'Муниципальные услуги': services,
          'Инициативные письма': letters
        },
        period: startDate && endDate ? 
          `${new Date(startDate).toLocaleDateString('ru-RU')} - ${new Date(endDate).toLocaleDateString('ru-RU')}` : 
          'За весь период',
        department: departmentName,
        note: 'Подсчет всех поступивших документов за указанный период'
      }
    });
    
  } catch (error) {
    console.error('Ошибка в отчете incoming-count:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 2. ОТЧЕТ: По услугам (ПОЛНОСТЬЮ ПЕРЕДЕЛАН ПО ТЗ)
router.get('/services', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    
    const dateFilter = buildDateFilter(startDate, endDate);
    
    // Агрегация с ПРАВИЛЬНОЙ логикой по ТЗ
    const servicesStats = await MunicipalService.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$serviceName',
          // 1. Количество поступивших заявлений (ВСЕ)
          received: { $sum: 1 },
          
          // 2. Исполнено в срок (в архиве и actualDate ≤ controlDate)
          completedOnTime: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isArchived', true] }, // В архиве
                    {
                      $or: [
                        { $eq: ['$controlDate', null] }, // Нет срока = в срок
                        { 
                          $and: [
                            { $ne: ['$actualDate', null] },
                            { $lte: ['$actualDate', '$controlDate'] } // Исполнено до срока
                          ]
                        }
                      ]
                    }
                  ]
                },
                1,
                0
              ]
            }
          },
          
          // 3. Исполнено с нарушением срока (в архиве, но actualDate > controlDate)
          completedLate: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isArchived', true] }, // В архиве
                    { $ne: ['$controlDate', null] }, // Есть срок
                    { $ne: ['$actualDate', null] }, // Есть дата исполнения
                    { $gt: ['$actualDate', '$controlDate'] } // Исполнено после срока
                  ]
                },
                1,
                0
              ]
            }
          },
          
          // 4. Не исполнено (не в архиве)
          notCompleted: {
            $sum: {
              $cond: [
                { $eq: ['$isArchived', false] },
                1,
                0
              ]
            }
          },
          
          // 5. Не исполнено в срок (не в архиве и срок прошел)
          overdueNotCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isArchived', false] }, // Не в архиве
                    { $ne: ['$controlDate', null] }, // Есть срок
                    { $lt: ['$controlDate', today] } // Срок прошел
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          serviceName: '$_id',
          received: 1,
          completedOnTime: 1,
          completedLate: 1,
          notCompleted: 1,
          overdueNotCompleted: 1,
          
          // Вычисляемые поля для анализа
          completedTotal: { $add: ['$completedOnTime', '$completedLate'] },
          completionRate: {
            $cond: [
              { $gt: ['$received', 0] },
              { 
                $multiply: [
                  { $divide: [{ $add: ['$completedOnTime', '$completedLate'] }, '$received'] },
                  100
                ]
              },
              0
            ]
          },
          timelyCompletionRate: {
            $cond: [
              { $gt: [{ $add: ['$completedOnTime', '$completedLate'] }, 0] },
              { 
                $multiply: [
                  { $divide: ['$completedOnTime', { $add: ['$completedOnTime', '$completedLate'] }] },
                  100
                ]
              },
              0
            ]
          },
          violationRate: {
            $cond: [
              { $gt: ['$received', 0] },
              { 
                $multiply: [
                  { $divide: ['$completedLate', '$received'] },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      { $sort: { received: -1 } }
    ]);
    
    // Общая статистика по всем услугам
    const overallStats = servicesStats.reduce((acc, service) => {
      acc.received += service.received;
      acc.completedOnTime += service.completedOnTime;
      acc.completedLate += service.completedLate;
      acc.notCompleted += service.notCompleted;
      acc.overdueNotCompleted += service.overdueNotCompleted;
      return acc;
    }, { received: 0, completedOnTime: 0, completedLate: 0, notCompleted: 0, overdueNotCompleted: 0 });
    
    res.json({ 
      success: true, 
      data: servicesStats,
      overall: overallStats,
      period: startDate && endDate ? 
        `${new Date(startDate).toLocaleDateString('ru-RU')} - ${new Date(endDate).toLocaleDateString('ru-RU')}` : 
        'За весь период',
      note: 'Отчет по услугам с разделением: исполнено в срок, исполнено с нарушением, не исполнено'
    });
    
  } catch (error) {
    console.error('Ошибка в отчете services:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 3. ОТЧЕТ: По структуркам Администрации (ПОЛНОСТЬЮ ПЕРЕДЕЛАН ПО ТЗ)
router.get('/departments', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    
    const dateFilter = buildDateFilter(startDate, endDate);
    
    // Получаем все активные департаменты
    const departments = await Department.find({ isActive: true })
      .select('name code _id')
      .sort({ name: 1 });
    
    const departmentStats = await Promise.all(
      departments.map(async (dept) => {
        const deptFilter = { ...dateFilter, department: dept._id };
        
        // Получаем ВСЕ документы департамента (все типы)
        const [documents, appeals, services, letters] = await Promise.all([
          Document.find(deptFilter),
          CitizenAppeal.find(deptFilter),
          MunicipalService.find(deptFilter),
          InitiativeLetter.find(deptFilter)
        ]);
        
        // Объединяем все документы
        const allDocs = [...documents, ...appeals, ...services, ...letters];
        
        // 1. Сколько поступило (ВСЕ документы за период)
        const received = allDocs.length;
        
        // 2. Исполнено (в архиве)
        const completed = allDocs.filter(doc => doc.isArchived).length;
        
        // 3. Исполнено в срок (в архиве и не просрочено)
        const completedOnTime = allDocs.filter(doc => 
          doc.isArchived && // В архиве
          (!doc.controlDate || // Нет срока ИЛИ
          (doc.actualDate && new Date(doc.actualDate) <= new Date(doc.controlDate))) // Исполнено до срока
        ).length;
        
        // 4. Исполнено с нарушениями (в архиве, но просрочено) - КЛЮЧЕВОЕ ДЛЯ ТЗ!
        const completedLate = allDocs.filter(doc => 
          doc.isArchived && // В архиве
          doc.controlDate && // Есть срок
          doc.actualDate && // Есть дата исполнения
          new Date(doc.actualDate) > new Date(doc.controlDate) // Исполнено после срока
        ).length;
        
        // 5. Не исполнено
        const notCompleted = allDocs.filter(doc => !doc.isArchived).length;
        
        // 6. Не исполнено и просрочено
        const overdueNotCompleted = allDocs.filter(doc => 
          !doc.isArchived && // Не в архиве
          doc.controlDate && // Есть срок
          new Date(doc.controlDate) < today // Срок прошел
        ).length;
        
        // Разбивка по типам документов
        const byType = {
          documents: documents.length,
          appeals: appeals.length,
          services: services.length,
          letters: letters.length
        };
        
        // Эффективность
        const efficiency = received > 0 ? 
          Math.round((completedOnTime / received) * 100) : 0;
        
        // Уровень нарушений
        const violationLevel = received > 0 ?
          Math.round(((completedLate + overdueNotCompleted) / received) * 100) : 0;
        
        return {
          _id: dept._id,
          name: dept.name,
          code: dept.code,
          
          // ПО ТЗ: "у кого сколько поступило"
          received,
          byType,
          
          // ПО ТЗ: "сколько исполнено"
          completed,
          
          // ПО ТЗ: "сколько исполнено с нарушениями" - ОТДЕЛЬНО!
          completedLate,
          
          // Дополнительно для полноты картины
          completedOnTime,
          notCompleted,
          overdueNotCompleted,
          
          // Метрики
          efficiency,
          violationLevel,
          completionRate: received > 0 ? Math.round((completed / received) * 100) : 0
        };
      })
    );
    
    // Фильтруем только департаменты с активностью
    const activeDepartments = departmentStats.filter(dept => dept.received > 0);
    
    // Сортируем по количеству нарушений (самые проблемные сверху)
    activeDepartments.sort((a, b) => b.completedLate - a.completedLate);
    
    // Общая статистика
    const overallStats = activeDepartments.reduce((acc, dept) => {
      acc.received += dept.received;
      acc.completed += dept.completed;
      acc.completedLate += dept.completedLate;
      acc.completedOnTime += dept.completedOnTime;
      return acc;
    }, { received: 0, completed: 0, completedLate: 0, completedOnTime: 0 });
    
    res.json({
      success: true,
      data: activeDepartments,
      overall: overallStats,
      period: startDate && endDate ? 
        `${new Date(startDate).toLocaleDateString('ru-RU')} - ${new Date(endDate).toLocaleDateString('ru-RU')}` : 
        'За весь период',
      note: 'Отчет по структуркам: поступило, исполнено, исполнено с нарушениями'
    });
    
  } catch (error) {
    console.error('Ошибка в отчете departments:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 4. ОТЧЕТ: О нарушении исполнения и неисполненных в срок (РАЗДЕЛЕН НА ДВА)
// 4.1 Нарушение исполнения (исполнено, но с опозданием)
// В reports.js полностью перепишите endpoint /violations/completion-late:

router.get('/violations/completion-late', async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    const today = new Date();
    
    console.log('=== ОТЧЕТ: Исполнено с опозданием ===');
    console.log('Период:', startDate, 'до', endDate);
    console.log('Департамент:', departmentId);
    console.log('Сегодня:', today.toISOString());
    
    // ФИЛЬТР ДАТЫ: по controlDate ИЛИ actualDate
    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      dateFilter = {
        $or: [
          { controlDate: { $gte: start, $lte: end } },
          { actualDate: { $gte: start, $lte: end } },
          { date: { $gte: start, $lte: end } } // Также по дате поступления
        ]
      };
    }
    
    const deptFilter = buildDepartmentFilter(departmentId);
    
    // Основной фильтр нарушений
    const violationFilter = {
      ...dateFilter,
      ...deptFilter,
      isArchived: true,
      controlDate: { $ne: null, $exists: true },
      actualDate: { $ne: null, $exists: true }
    };
    
    console.log('Фильтр поиска:', JSON.stringify(violationFilter, null, 2));
    
    // Альтернативный вариант: искать ВСЕ нарушения без фильтра по дате
    // если не указан период
    if (!startDate || !endDate) {
      delete violationFilter.$or;
      console.log('Поиск ВСЕХ нарушений (период не указан)');
    }
    
    const [documents, appeals, services] = await Promise.all([
      Document.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .lean(),
      CitizenAppeal.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .lean(),
      MunicipalService.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .lean()
    ]);
    
    console.log('Найдено документов всего:', 
      documents.length + appeals.length + services.length);
    
    const violations = [];
    
    // Функция проверки
    const checkAndAddViolation = (doc, type) => {
      if (!doc.controlDate || !doc.actualDate) return;
      
      try {
        const controlDate = new Date(doc.controlDate);
        const actualDate = new Date(doc.actualDate);
        
        console.log(`Проверка ${doc.regNumber || 'Б/Н'}:`);
        console.log(`  Срок: ${controlDate.toLocaleDateString('ru-RU')}`);
        console.log(`  Исполнено: ${actualDate.toLocaleDateString('ru-RU')}`);
        
        if (actualDate > controlDate) {
          const daysLate = Math.floor((actualDate - controlDate) / (1000 * 60 * 60 * 24));
          
          console.log(`  ⚠️ НАРУШЕНИЕ! Опоздание на ${daysLate} дней`);
          
          let status = 'Низкий';
          let color = '#757575';
          if (daysLate > 30) {
            status = 'Критично';
            color = '#d32f2f';
          } else if (daysLate > 14) {
            status = 'Высокий';
            color = '#f57c00';
          } else if (daysLate > 7) {
            status = 'Средний';
            color = '#ffb74d';
          }
          
          violations.push({
            id: doc._id,
            type: getDocTypeName(type),
            docType: type,
            violationType: 'completion_late',
            regNumber: doc.regNumber || 'Б/Н',
            department: doc.department?.name || 'Не указан',
            departmentCode: doc.department?.code || '',
            dueDate: controlDate.toLocaleDateString('ru-RU'),
            completionDate: actualDate.toLocaleDateString('ru-RU'),
            daysLate,
            status,
            color,
            responsible: doc.executor?.fullName || 'Не указан',
            description: doc.shortContent || doc.description || doc.citizenName || '',
            dateReceived: doc.date ? new Date(doc.date).toLocaleDateString('ru-RU') : '',
            processingDays: doc.date ? Math.floor((actualDate - new Date(doc.date)) / (1000*60*60*24)) : 0
          });
        } else {
          console.log(`  ✅ В срок или раньше`);
        }
      } catch (error) {
        console.error(`Ошибка обработки:`, error);
      }
    };
    
    documents.forEach(doc => checkAndAddViolation(doc, 'document'));
    appeals.forEach(doc => checkAndAddViolation(doc, 'appeal'));
    services.forEach(doc => checkAndAddViolation(doc, 'service'));
    
    console.log(`Всего нарушений найдено: ${violations.length}`);
    
    // Сортируем
    violations.sort((a, b) => b.daysLate - a.daysLate);
    
    res.json({
      success: true,
      data: violations,
      stats: {
        total: violations.length,
        avgDaysLate: violations.length > 0 ? 
          Math.round(violations.reduce((sum, v) => sum + v.daysLate, 0) / violations.length) : 0
      }
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// 4.2 Не исполненные в срок
router.get('/violations/overdue-not-completed', async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    const today = new Date();
    
    const dateFilter = buildDateFilter(startDate, endDate);
    const deptFilter = buildDepartmentFilter(departmentId);
    
    // Фильтр: Не исполнено (не в архиве) и срок прошел
    const violationFilter = {
      ...dateFilter,
      ...deptFilter,
      isArchived: false,
      controlDate: { $lt: today, $ne: null }
    };
    
    const [documents, appeals, services] = await Promise.all([
      Document.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .sort({ controlDate: 1 }) // Самые старые просрочки сверху
        .limit(200),
      CitizenAppeal.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .sort({ controlDate: 1 })
        .limit(200),
      MunicipalService.find(violationFilter)
        .populate('department', 'name code')
        .populate('executor', 'fullName position')
        .sort({ controlDate: 1 })
        .limit(200)
    ]);
    
    const violations = [];
    
    // Обработка документов
    const processViolations = (docs, type) => {
      docs.forEach(doc => {
        const dueDate = new Date(doc.controlDate);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        
        // Уровень серьезности
        let status = 'Низкий';
        let color = '#757575';
        if (daysOverdue > 30) {
          status = 'Критично';
          color = '#d32f2f';
        } else if (daysOverdue > 14) {
          status = 'Высокий';
          color = '#f57c00';
        } else if (daysOverdue > 7) {
          status = 'Средний';
          color = '#ffb74d';
        }
        
        violations.push({
          id: doc._id,
          type: getDocTypeName(type),
          docType: type,
          violationType: 'overdue_not_completed',
          regNumber: doc.regNumber || 'Б/Н',
          department: doc.department?.name || 'Не указан',
          departmentCode: doc.department?.code || '',
          dueDate: dueDate.toLocaleDateString('ru-RU'),
          daysOverdue,
          status,
          color,
          responsible: doc.executor?.fullName || 'Не указан',
          description: doc.shortContent || doc.description || doc.citizenName || '',
          dateReceived: doc.date ? new Date(doc.date).toLocaleDateString('ru-RU') : '',
          inSystemDays: doc.date ? Math.floor((today - new Date(doc.date)) / (1000*60*60*24)) : 0
        });
      });
    };
    
    processViolations(documents, 'document');
    processViolations(appeals, 'appeal');
    processViolations(services, 'service');
    
    // Сортируем по количеству дней просрочки
    violations.sort((a, b) => b.daysOverdue - a.daysOverdue);
    
    // Статистика
    const stats = {
      total: violations.length,
      byType: {
        documents: documents.length,
        appeals: appeals.length,
        services: services.length
      },
      bySeverity: {
        critical: violations.filter(v => v.status === 'Критично').length,
        high: violations.filter(v => v.status === 'Высокий').length,
        medium: violations.filter(v => v.status === 'Средний').length,
        low: violations.filter(v => v.status === 'Низкий').length
      },
      avgDaysOverdue: violations.length > 0 ? 
        Math.round(violations.reduce((sum, v) => sum + v.daysOverdue, 0) / violations.length) : 0,
      oldestOverdue: violations.length > 0 ? violations[violations.length - 1].daysOverdue : 0
    };
    
    res.json({
      success: true,
      data: violations,
      stats,
      period: startDate && endDate ? 
        `${new Date(startDate).toLocaleDateString('ru-RU')} - ${new Date(endDate).toLocaleDateString('ru-RU')}` : 
        'За весь период',
      generatedAt: new Date().toLocaleString('ru-RU'),
      reportType: 'Не исполненные в срок',
      note: 'Документы, которые не были исполнены и у которых истек срок исполнения',
      today: today.toLocaleDateString('ru-RU')
    });
    
  } catch (error) {
    console.error('Ошибка в отчете overdue-not-completed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 5. Объединенный отчет о нарушениях (для обратной совместимости)
// В reports.js найдите функцию router.get('/violations', ...)
// ЗАМЕНИТЕ её полностью:

router.get('/violations', async (req, res) => {
  try {
    // 1. ПЕРВОЕ ДЕЛО: получаем параметры из запроса
    const { startDate, endDate, departmentId } = req.query;
    
    // 2. Отладочный вывод
    console.log('=== DEBUG ОБЪЕДИНЕННЫЙ ОТЧЕТ ===');
    console.log('Параметры запроса:', { 
      startDate: startDate || 'не указано', 
      endDate: endDate || 'не указано', 
      departmentId: departmentId || 'не указано' 
    });
    
    // 3. Получаем данные из двух endpoint'ов
    const [completionLateRes, overdueNotCompletedRes] = await Promise.all([
      // Запрос к endpoint'у "Исполнено с опозданием"
      fetch(`https://document-system-backend.vercel.app/api/reports/violations/completion-late?${new URLSearchParams({
        startDate: startDate || '',
        endDate: endDate || '',
        departmentId: departmentId || ''
      })}`).then(r => r.json()).catch(err => {
        console.error('Ошибка получения completion-late:', err);
        return { success: false, data: [] };
      }),
      
      // Запрос к endpoint'у "Не исполнено в срок"
      fetch(`https://document-system-backend.vercel.app/api/reports/violations/overdue-not-completed?${new URLSearchParams({
        startDate: startDate || '',
        endDate: endDate || '',
        departmentId: departmentId || ''
      })}`).then(r => r.json()).catch(err => {
        console.error('Ошибка получения overdue-not-completed:', err);
        return { success: false, data: [] };
      })
    ]);
    
    console.log('Результат completion-late:', completionLateRes.success, 'документов:', completionLateRes.data?.length || 0);
    console.log('Результат overdue-not-completed:', overdueNotCompletedRes.success, 'документов:', overdueNotCompletedRes.data?.length || 0);
    
    // 4. Объединяем данные
    const completionLateData = completionLateRes.success ? completionLateRes.data : [];
    const overdueNotCompletedData = overdueNotCompletedRes.success ? overdueNotCompletedRes.data : [];
    
    const allViolations = [...completionLateData, ...overdueNotCompletedData];
    
    console.log('Всего объединено документов:', allViolations.length);
    
    // 5. Сортируем по серьезности
    const severityOrder = { 'Критично': 4, 'Высокий': 3, 'Средний': 2, 'Низкий': 1 };
    allViolations.sort((a, b) => {
      const severityA = severityOrder[a.status] || 0;
      const severityB = severityOrder[b.status] || 0;
      
      if (severityB !== severityA) return severityB - severityA;
      
      const daysA = a.daysLate || a.daysOverdue || 0;
      const daysB = b.daysLate || b.daysOverdue || 0;
      return daysB - daysA;
    });
    
    // 6. Возвращаем результат
    res.json({
      success: true,
      data: allViolations,
      stats: {
        total: allViolations.length,
        completionLate: completionLateData.length,
        overdueNotCompleted: overdueNotCompletedData.length
      },
      period: startDate && endDate ? 
        `${new Date(startDate).toLocaleDateString('ru-RU')} - ${new Date(endDate).toLocaleDateString('ru-RU')}` : 
        'За весь период',
      generatedAt: new Date().toLocaleString('ru-RU'),
      note: 'Объединенный отчет: нарушение исполнения + не исполненные в срок'
    });
    
  } catch (error) {
    console.error('Ошибка в объединенном отчете violations:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
});

// 6. Статистика для дашборда
router.get('/dashboard-stats', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Активные документы (не в архиве)
    const [activeDocs, activeAppeals, activeServices, activeLetters] = await Promise.all([
      Document.countDocuments({ isArchived: false }),
      CitizenAppeal.countDocuments({ isArchived: false }),
      MunicipalService.countDocuments({ isArchived: false }),
      InitiativeLetter.countDocuments({ isArchived: false })
    ]);
    
    // Архивированные (исполненные)
    const [archivedDocs, archivedAppeals, archivedServices] = await Promise.all([
      Document.countDocuments({ isArchived: true }),
      CitizenAppeal.countDocuments({ isArchived: true }),
      MunicipalService.countDocuments({ isArchived: true })
    ]);
    
    // Просроченные активные
    const overdueFilter = {
      isArchived: false,
      controlDate: { $lt: today, $ne: null }
    };
    
    const [overdueDocs, overdueAppeals, overdueServices] = await Promise.all([
      Document.countDocuments(overdueFilter),
      CitizenAppeal.countDocuments(overdueFilter),
      MunicipalService.countDocuments(overdueFilter)
    ]);
    
    // За последние 30 дней
    const recentFilter = { 
      date: { $gte: thirtyDaysAgo },
      isArchived: false 
    };
    
    const [recentDocs, recentAppeals, recentServices] = await Promise.all([
      Document.countDocuments(recentFilter),
      CitizenAppeal.countDocuments(recentFilter),
      MunicipalService.countDocuments(recentFilter)
    ]);
    
    // Исполненные с опозданием
    const lateCompletionFilter = {
      isArchived: true,
      controlDate: { $ne: null },
      $expr: { $gt: ['$actualDate', '$controlDate'] }
    };
    
    const [lateDocs, lateAppeals, lateServices] = await Promise.all([
      Document.countDocuments(lateCompletionFilter),
      CitizenAppeal.countDocuments(lateCompletionFilter),
      MunicipalService.countDocuments(lateCompletionFilter)
    ]);
    
    const totalActive = activeDocs + activeAppeals + activeServices + activeLetters;
    const totalArchived = archivedDocs + archivedAppeals + archivedServices;
    const totalOverdue = overdueDocs + overdueAppeals + overdueServices;
    const totalLate = lateDocs + lateAppeals + lateServices;
    const totalRecent = recentDocs + recentAppeals + recentServices;
    
    res.json({
      success: true,
      data: {
        totals: {
          active: totalActive,
          archived: totalArchived,
          total: totalActive + totalArchived
        },
        violations: {
          overdue: totalOverdue,
          lateCompletion: totalLate,
          totalViolations: totalOverdue + totalLate
        },
        recent: {
          active: totalRecent,
          trend: totalRecent > 0 ? 'increase' : 'stable'
        },
        byType: {
          documents: { active: activeDocs, archived: archivedDocs, overdue: overdueDocs, late: lateDocs },
          appeals: { active: activeAppeals, archived: archivedAppeals, overdue: overdueAppeals, late: lateAppeals },
          services: { active: activeServices, archived: archivedServices, overdue: overdueServices, late: lateServices },
          letters: { active: activeLetters, archived: 0, overdue: 0, late: 0 }
        },
        metrics: {
          completionRate: totalActive + totalArchived > 0 ? 
            Math.round((totalArchived / (totalActive + totalArchived)) * 100) : 0,
          timelyRate: totalArchived > 0 ? 
            Math.round(((totalArchived - totalLate) / totalArchived) * 100) : 0,
          violationRate: totalActive + totalArchived > 0 ? 
            Math.round(((totalOverdue + totalLate) / (totalActive + totalArchived)) * 100) : 0
        },
        generatedAt: new Date().toLocaleString('ru-RU')
      }
    });
    
  } catch (error) {
    console.error('Ошибка в dashboard-stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;