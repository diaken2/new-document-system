import mongoose from "mongoose";

const initiativeLetterSchema = new mongoose.Schema({
  regNumber: { type: String },
  date: { type: Date, required: true, default: Date.now },
  correspondent: { type: String },
  description: { type: String },
  department: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Department'
  },
  
  // МЕНЯЕМ НА Executor
  executor: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Executor', // Меняем с User на Executor
    default: null
  },
  
  note: String,
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  }
}, {
  timestamps: true
});

export default mongoose.model('InitiativeLetter', initiativeLetterSchema);