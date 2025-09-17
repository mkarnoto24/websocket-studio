import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

export const db = mysql.createPool({
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || ''
  // waitForConnections: true,
  // connectionLimit: 10,
  // queueLimit: 0,
})
