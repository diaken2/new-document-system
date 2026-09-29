// scripts/seedDepartments.js
import mongoose from 'mongoose';
import Department from '../models/Department.js';

const initialDepartments = [
  { name: 'Администрация Главы', code: 'ADM_HEAD' },
  { name: 'Канцелярия', code: 'CHANCELLERY' },
  { name: 'Департамент экономики', code: 'DEP_ECON' },
  { name: 'Департамент финансов', code: 'DEP_FIN' },
  { name: 'Департамент строительства', code: 'DEP_BUILD' },
  { name: 'Департамент ЖКХ', code: 'DEP_HCS' },
  { name: 'Департамент образования', code: 'DEP_EDUC' },
  { name: 'Департамент здравоохранения', code: 'DEP_HEALTH' },
];

const seedDepartments = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/doc_system');
    
    for (const dept of initialDepartments) {
      const exists = await Department.findOne({ name: dept.name });
      if (!exists) {
        await Department.create(dept);
        console.log(`✅ Создан: ${dept.name}`);
      }
    }
    
    console.log('🎉 Департаменты созданы');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
};

seedDepartments();