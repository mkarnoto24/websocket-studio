import { db } from './../../../src/utils/db_main_connection'
import { User } from '../dal/user.interface'

// Get all users
export async function getAllUsers(): Promise<User[]> {
  const [rows] = await db.query('SELECT * FROM users')
  return rows as User[]
}

// Get detail user by ID
export async function getUserById(idOrEmail: string | number): Promise<User | null> {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ? OR email = ? LIMIT 1', [
    idOrEmail,
    idOrEmail
  ])
  const users = rows as User[]
  return users[0] ?? null
}
