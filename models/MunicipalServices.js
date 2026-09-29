import mongoose from "mongoose";

const municipalServiceSchema = new mongoose.Schema({
  // Входящее
  regNumber: { type: String },
  date: { type: Date, required: true, default: Date.now },
  
  // Заявитель
  applicantName: { type: String, required: true },
  applicantDate: { type: Date, required: true },
  applicantType: { type: String, default: 'физическое лицо' },
  
  // Основные поля
  source: { type: String, required: true }, // Откуда поступило
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department'
  },
  shortContent: { type: String, required: true },
  serviceName: { type: String, required: true },
  controlDate: { type: Date, required: true },
  
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
  
  // Архив
  isArchived: { type: Boolean, default: false },
  archivedAt: Date
}, {
  timestamps: true
});

export default mongoose.model('MunicipalService', municipalServiceSchema);