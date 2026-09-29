import mongoose from "mongoose";

const documentSchema = new mongoose.Schema({
  // Входящее
  regNumber: { type: String, },
  date: { type: Date, required: true, default: Date.now },
  
  // Корреспондент
  outgoingNumber: String,
  outgoingDate: Date,
  correspondentName: { type: String, },
  
  // Основные поля
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department',
    
  },
  shortContent: { type: String, },
  controlDate: { type: Date, },
  
  // Исполнение
  actualDate: Date,
  extendedDate: Date, // Доп контроль
  
  // Исполнитель
  executor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Executor',
    
  },
  
  // Дополнительно
  note: String,
  
  // Статус
  status: { 
    type: String, 
    enum: ['active', 'completed', 'overdue', 'archived'],
    default: 'active'
  },
  
  // Архив
  isArchived: { type: Boolean, default: false },
  archivedAt: Date
}, {
  timestamps: true
});
export default mongoose.model('Document', documentSchema);