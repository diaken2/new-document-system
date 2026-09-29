import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema({
  // Основные данные
  lastName: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  
  // ФИО для отображения (автогенерация)
  fullName: { type: String },
  
  // Рабочие данные
  position: { type: String, required: true }, // Должность
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department',
    required: true 
  },
  
  // Контакты
  workPhone: String,
  mobilePhone: String,
  email: String,
  
  // Рабочие данные
  employeeId: { type: String, unique: true }, // Табельный номер
  isActive: { type: Boolean, default: true },
  
  // Дополнительно
  office: String, // Кабинет
  workSchedule: String, // График работы
  
}, {
  timestamps: true
});

// Автогенерация полного имени
employeeSchema.pre('save', function(next) {
  this.fullName = `${this.lastName} ${this.firstName} ${this.middleName || ''}`.trim();
  next();
});

// Автогенерация табельного номера
employeeSchema.pre('save', async function(next) {
  if (!this.employeeId) {
    const lastEmployee = await mongoose.model('Employee').findOne().sort({ employeeId: -1 });
    let nextNumber = 1;
    
    if (lastEmployee && lastEmployee.employeeId) {
      const match = lastEmployee.employeeId.match(/\d+/);
      if (match) {
        nextNumber = parseInt(match[0]) + 1;
      }
    }
    
    this.employeeId = `EMP${nextNumber.toString().padStart(4, '0')}`;
  }
  next();
});

export default mongoose.model('Employee', employeeSchema);