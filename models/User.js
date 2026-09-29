import mongoose from "mongoose";

// models/User.js - ОДНА модель на всё
const userSchema = new mongoose.Schema({
  // Основные данные
  username: { type: String, required: true, unique: true },
  password: { type: String, required: function() {
      // Пароль обязателен только при создании нового пользователя
      return this.isNew;
    } },
  fullName: { type: String, required: true },
  email: String,
  phone: String,
  
  // Рабочие данные
  position: { type: String}, // Должность ("Главный специалист")
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department',
   
  },
  
  // Системные права
  role: { 
    type: String, 
    enum: ['admin', 'super_clerk', 'department_clerk', 'department_head', 'general_head'],
    required: true 
  },
  
  // Статус
  isActive: { type: Boolean, default: true },
  workPhone: String,
  office: String, // Кабинет
  
}, { timestamps: true });

// Метод для проверки пароля (добавим после)
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);