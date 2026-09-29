import mongoose from "mongoose";

const citizenAppealSchema = new mongoose.Schema({
  // Входящее
  regNumber: { type: String },
  date: { type: Date, required: true, default: Date.now },
  
  // Корреспондент (гражданин)
  outgoingNumber: String,
  outgoingDate: Date,
  citizenName: { type: String },
  citizenAddress: { type: String },
  
  // Основные поля
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department'
  },
  shortContent: { type: String },
  controlDate: { type: Date },
  
  // Исполнение
  actualDate: Date,
  extendedDate: Date, // Доп контроль
  
  // Исполнитель - меняем на ссылку на Executor
  executor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Executor', // Меняем с User на Executor
    default: null
  },
  
  // Дополнительно
  note: String,
  
  // Статус
  status: { 
    type: String, 
    enum: ['active', 'completed', 'overdue', 'archived'],
    default: 'active'
  },
  
  // Тип обращения (опционально)
  appealType: {
    type: String,
    enum: ['жалоба', 'предложение', 'заявление', 'вопрос', 'благодарность'],
    default: 'заявление'
  },
  
  // Архив
  isArchived: { type: Boolean, default: false },
  archivedAt: Date
}, {
  timestamps: true
});

export default mongoose.model('CitizenAppeal', citizenAppealSchema);