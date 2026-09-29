import express from "express";
import Employee from "../models/Employee.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Получить всех сотрудников (с фильтрацией)
router.get('/', authenticate, async (req, res) => {
  try {
    const { department, search, activeOnly = 'true' } = req.query;
    const filter = {};
    
    // Фильтр по активности
    if (activeOnly === 'true') {
      filter.isActive = true;
    }
    
    // Фильтр по департаменту
    if (department && department !== 'all') {
      filter.department = department;
    }
    
    // Поиск по ФИО или должности
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const employees = await Employee.find(filter)
      .populate('department', 'name code')
      .sort({ lastName: 1, firstName: 1 });
    
    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

// Получить сотрудников по департаменту (для select'ов)
router.get('/by-department/:departmentId', authenticate, async (req, res) => {
  try {
    const employees = await Employee.find({
      department: req.params.departmentId,
      isActive: true
    })
    .select('fullName position')
    .sort({ fullName: 1 });
    
    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

// Создать сотрудника (только админ)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    
    const populated = await Employee.findById(employee._id)
      .populate('department', 'name code');
    
    res.status(201).json({
      success: true,
      message: 'Сотрудник создан',
      data: populated
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Обновить сотрудника
router.put('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('department', 'name code');
    
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Сотрудник не найден' });
    }
    
    res.json({
      success: true,
      message: 'Сотрудник обновлен',
      data: employee
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Деактивировать сотрудника
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Сотрудник деактивирован',
      data: employee
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

export default router;