export type UserRole = 'ADMIN' | 'ENGINEER' | 'MOLD' | 'SALES' | 'DOC_CONTROL';
export type DocumentType = 'PART_DRAWING' | 'PRODUCT_DRAWING' | 'SPEC' | 'SOP' | 'QC';
export type DocumentStatus = 'DRAFT' | 'PENDING' | 'RELEASED' | 'OBSOLETE';
export type FileType = 'DWG' | 'PDF' | 'THREE_D' | 'THUMB' | 'WORD';

export interface UserItem {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Series {
  id: string;
  code: string;
  name: string;
  description?: string;
  _count?: { products: number };
}

export interface PartCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  _count?: { parts: number };
}

export interface DocumentCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  _count?: { documents: number };
}

export interface Part {
  id: string;
  partNumber: string;
  name: string;
  description?: string;
  categoryId: string;
  category?: PartCategory;
}

export interface Product {
  id: string;
  productCode: string;
  name: string;
  description?: string;
  seriesId: string;
  series?: Series;
}

export interface DocumentFile {
  id: string;
  documentId: string;
  fileName: string;
  originalName: string;
  fileType: FileType;
  fileSize: number;
  mimeType: string;
  filePath?: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  version: number;
  categoryId?: string;
  category?: DocumentCategory | null;
  remark?: string | null;
  createdById: string;
  createdBy?: { name: string };
  createdAt: string;
  updatedAt: string;
  parts: Array<{ partId: string; part: { id: string; partNumber: string; name: string } }>;
  products: Array<{ productId: string; product: { id: string; productCode: string; name: string } }>;
  files: DocumentFile[];
}

/** 分頁回應統一格式 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;  // 修正：後端欄位為 message，非 content
  isRead: boolean;
  userId: string;
  createdAt: string;
}
