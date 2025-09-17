import { db } from './../../../src/utils/db_main_connection'
import { Web } from '../dal/web.interface'

// Get detail web by ID
export async function getWebById(id: string): Promise<Web | null> {
  const [rows] = await db.query('SELECT * FROM webs WHERE id = ? LIMIT 1', [id])
  const webs = rows as Web[]
  return webs[0] ?? null
}
