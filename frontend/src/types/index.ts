export interface UserItem {
  id: string;
  username: string;
  name: string;
  role: string;
  department?: string;
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

export interface DocumentItem {
  id: string;
  title: string;
  documentType: string;
  status: string;
  version: number;
  partId?: string;
  productId?: string;
  categoryId?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  files?: DocumentFile[];
}

export interface DocumentFile {
  id: string;
  fileName: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  documentId: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  userId: string;
  createdAt: string;
}
