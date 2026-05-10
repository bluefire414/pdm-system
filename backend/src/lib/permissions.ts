import { Role, DocumentType, FileType, Roles, DocumentTypes, FileTypes } from './constants';

export interface PermissionRule {
  canView: boolean;
  canDownload: boolean;
}

const PERMISSION_MATRIX: Record<
  Role,
  Partial<Record<string, Partial<Record<string, PermissionRule>>>>
> = {
  [Roles.ADMIN]: {
    [DocumentTypes.PART_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.PRODUCT_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SPEC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SOP]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.QC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
  },
  [Roles.ENGINEER]: {
    [DocumentTypes.PART_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.PRODUCT_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SPEC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SOP]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.QC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
  },
  [Roles.MOLD]: {
    [DocumentTypes.PART_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.PRODUCT_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
  },
  [Roles.SALES]: {
    [DocumentTypes.PRODUCT_DRAWING]: {
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SPEC]: {
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
  },
  [Roles.DOC_CONTROL]: {
    [DocumentTypes.PART_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.PRODUCT_DRAWING]: {
      [FileTypes.DWG]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
      [FileTypes.THREE_D]: { canView: true, canDownload: true },
      [FileTypes.THUMB]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SPEC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.SOP]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
    [DocumentTypes.QC]: {
      [FileTypes.WORD]: { canView: true, canDownload: true },
      [FileTypes.PDF]: { canView: true, canDownload: true },
    },
  },
};

export function getPermission(
  role: Role,
  documentType: string,
  fileType: string
): PermissionRule {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return { canView: false, canDownload: false };

  const docPerms = rolePerms[documentType];
  if (!docPerms) return { canView: false, canDownload: false };

  const filePerm = docPerms[fileType];
  if (!filePerm) return { canView: false, canDownload: false };

  return filePerm;
}

export function canAccessDocument(
  role: Role,
  documentType: string
): boolean {
  const rolePerms = PERMISSION_MATRIX[role];
  if (!rolePerms) return false;
  return !!rolePerms[documentType];
}
