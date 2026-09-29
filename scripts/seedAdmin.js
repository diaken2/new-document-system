// scripts/seedAdmin.js
import mongoose from 'mongoose';
import User from '../models/User.js';
import { hashPassword } from '../utils/auth.js';
import dotenv from 'dotenv';
dotenv.config();

const createAdminUser = async () => {
  try {
    await mongoose.connect("mongodb+srv://documentsystem_db_user:infolearn88@cluster0.k8a3yfn.mongodb.net/?appName=Cluster0");
    
    const adminExists = await User.findOne({ username: 'admin' });
    
    if (!adminExists) {
      const hashedPassword = await hashPassword('admin123');
      
      const admin = new User({
        username: 'admin',
        password: hashedPassword,
        fullName: 'Администратор Системы',
        role: 'admin',
        email: 'admin@admin.com',
        isActive: true
      });
      
      await admin.save();
      console.log('✅ Администратор создан:');
      console.log('Логин: admin');
      console.log('Пароль: admin123');
    } else {
      console.log('⚠️ Администратор уже существует');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
};

createAdminUser();