// index.js - БЕЗ middleware
import express from "express"
import mongoose from "mongoose";
import cors from "cors"
import dotenv from 'dotenv';
dotenv.config();
import path from 'node:path';
import { fileURLToPath } from 'node:url';


// Импорт роутов
import documentRoutes from "./route/documents.js"
import citizenAppealRoutes from "./route/citizenAppeals.js";
import municipalServiceRoutes from "./route/municipalServices.js";
import initiativeLetterRoutes from "./route/initiativeLetters.js";
import authRoutes from "./route/auth.js"
import departamentRoutes from "./route/departaments.js"
import reportRoutes from "./route/reports.js"
import executorsRouter from './route/executors.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());





app.use(express.json());

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/doc_system')
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => {
    console.error('❌ Ошибка MongoDB:', err);
    process.exit(1);
  });

// =========== ВСЕ РОУТЫ БЕЗ ПРОВЕРКИ АУТЕНТИФИКАЦИИ ===========
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/citizen-appeals', citizenAppealRoutes);
app.use('/api/municipal-services', municipalServiceRoutes);
app.use('/api/initiative-letters', initiativeLetterRoutes);
app.use('/api/reports',reportRoutes );

app.use('/api/departments', departamentRoutes);
app.use('/api/executors', executorsRouter);
// Главная
app.get('/api', (req, res) => {
  res.json({ message: 'API системы делопроизводства', version: '1.0.0' });
});
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});