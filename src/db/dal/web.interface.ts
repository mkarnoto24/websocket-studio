import { RowDataPacket } from 'mysql2'
export interface Web extends RowDataPacket {
  id: string
  event_id: number | null
  tenant_id: number | null
  is_primary: boolean
  name: string
  slug: string | null
  status: 'DRAFT' | 'PUBLISH'
  created_at: Date | null
  updated_at: Date | null
}
