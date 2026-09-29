import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  code: { 
    type: String, 
    unique: true,
    trim: true,
    uppercase: true
  },
  description: String,
  parentDepartment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department' 
  },
  head: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// // ВАРИАНТ 1: Сделать хук синхронным (без async)
// departmentSchema.pre('save', function(next) {
//   if (!this.code || this.code.trim() === '') {
//     // Генерируем код из названия
//     const code = this.name
//       .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, '')
//       .split(' ')
//       .map(word => word.substring(0, 4).toUpperCase())
//       .join('_')
//       .substring(0, 20);
    
//     this.code = code || 'DEPT_' + Date.now().toString().slice(-6);
//   }
//   next();
// });

// ВАРИАНТ 2: Или сделать асинхронным, но без next()
// departmentSchema.pre('save', async function() {
//   if (!this.code || this.code.trim() === '') {
//     const code = this.name
//       .replace(/[^a-zA-Zа-яА-Я0-9\s]/g, '')
//       .split(' ')
//       .map(word => word.substring(0, 4).toUpperCase())
//       .join('_')
//       .substring(0, 20);
    
//     this.code = code || 'DEPT_' + Date.now().toString().slice(-6);
//   }
// });

export default mongoose.model('Department', departmentSchema);