export const Roles = {
  ADMIN: 'ADMIN',
  ENGINEER: 'ENGINEER',
  MOLD: 'MOLD',
  SALES: 'SALES',
  DOC_CONTROL: 'DOC_CONTROL',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const DocumentTypes = {
  PART_DRAWING: 'PART_DRAWING',
  PRODUCT_DRAWING: 'PRODUCT_DRAWING',
  SPEC: 'SPEC',
  SOP: 'SOP',
  QC: 'QC',
} as const;

export type DocumentType = (typeof DocumentTypes)[keyof typeof DocumentTypes];

export const FileTypes = {
  DWG: 'DWG',
  PDF: 'PDF',
  THREE_D: 'THREE_D',
  THUMB: 'THUMB',
  WORD: 'WORD',
} as const;

export type FileType = (typeof FileTypes)[keyof typeof FileTypes];

export const DocumentStatuses = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  RELEASED: 'RELEASED',
  OBSOLETE: 'OBSOLETE',
} as const;

export type DocumentStatus = (typeof DocumentStatuses)[keyof typeof DocumentStatuses];
