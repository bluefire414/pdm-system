import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || 'PDM系統 <noreply@send.salecomlab.com>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── HTML 樣板 ─────────────────────────────────────────────────────────────────

function buildHtml(title: string, body: string, linkHref: string, linkText: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 0">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <tr>
          <td style="background:#1677ff;padding:20px 32px">
            <span style="color:#fff;font-size:20px;font-weight:bold">PDM 產品資料管理系統</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 16px;color:#262626;font-size:18px">${title}</h2>
            <div style="color:#595959;font-size:14px;line-height:1.8">${body}</div>
            <div style="margin:28px 0 0">
              <a href="${linkHref}"
                 style="display:inline-block;background:#1677ff;color:#fff;text-decoration:none;
                        padding:10px 24px;border-radius:6px;font-size:14px;font-weight:bold">
                ${linkText}
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:16px 32px;border-top:1px solid #f0f0f0">
            <p style="margin:0;color:#8c8c8c;font-size:12px">此信由系統自動發送，請勿回覆。</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── 基礎發送函式（fire and forget） ──────────────────────────────────────────

export function sendEmail(to: string | string[], subject: string, html: string): void {
  if (!resend) {
    console.log(`[Email] RESEND_API_KEY 未設定，跳過寄送 subject="${subject}"`);
    return;
  }
  resend.emails.send({ from: FROM, to, subject, html })
    .catch((err) => console.error(`[Email] 寄送失敗 subject="${subject}"`, err));
}

// ─── ECN 通知樣板 ──────────────────────────────────────────────────────────────

/** 新 ECN 待審核 → 寄給所有 ADMIN */
export function sendEcnCreatedEmail(
  toList: string[],
  ecnData: { ecnId: string; ecnNumber: string; title: string; requesterName: string },
): void {
  if (toList.length === 0) return;
  sendEmail(
    toList,
    `[待審核] 新 ECN 申請：${ecnData.ecnNumber}`,
    buildHtml(
      `新 ECN 申請待審核：${ecnData.ecnNumber}`,
      `<p>工程師 <strong>${ecnData.requesterName}</strong> 提出了新的工程變更申請，請儘快進行審核。</p>
       <p><strong>ECN 編號：</strong>${ecnData.ecnNumber}</p>
       <p><strong>標題：</strong>${ecnData.title}</p>`,
      `${FRONTEND_URL}/ecns/${ecnData.ecnId}`,
      '前往審核',
    ),
  );
}

/** ECN 審核通過 → 寄給申請者 */
export function sendEcnApprovedEmail(
  to: string,
  ecnData: { ecnId: string; ecnNumber: string; title: string },
): void {
  sendEmail(
    to,
    `[已核准] ECN ${ecnData.ecnNumber} 審核通過`,
    buildHtml(
      `您的變更申請已核准：${ecnData.ecnNumber}`,
      `<p>您提出的工程變更申請已通過審核，文件版本已更新。</p>
       <p><strong>ECN 編號：</strong>${ecnData.ecnNumber}</p>
       <p><strong>標題：</strong>${ecnData.title}</p>`,
      `${FRONTEND_URL}/ecns/${ecnData.ecnId}`,
      '查看詳情',
    ),
  );
}

/** ECN 審核退回 → 寄給申請者（含退回意見） */
export function sendEcnRejectedEmail(
  to: string,
  ecnData: { ecnId: string; ecnNumber: string; title: string; comment?: string },
): void {
  const commentSection = ecnData.comment
    ? `<p><strong>退回意見：</strong>${ecnData.comment}</p>`
    : '';
  sendEmail(
    to,
    `[已退回] ECN ${ecnData.ecnNumber} 審核退回`,
    buildHtml(
      `您的變更申請已退回：${ecnData.ecnNumber}`,
      `<p>您提出的工程變更申請已被退回，請根據審核意見修改後重新提交。</p>
       <p><strong>ECN 編號：</strong>${ecnData.ecnNumber}</p>
       <p><strong>標題：</strong>${ecnData.title}</p>
       ${commentSection}`,
      `${FRONTEND_URL}/ecns/${ecnData.ecnId}`,
      '查看詳情',
    ),
  );
}

/** ECN 即將逾期提醒 → 寄給所有 ADMIN（cron job 使用） */
export function sendEcnDueSoonEmail(
  toList: string[],
  ecnData: { ecnId: string; ecnNumber: string; title: string; dueDate: Date },
): void {
  if (toList.length === 0) return;
  const dueDateStr = ecnData.dueDate.toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  sendEmail(
    toList,
    `[提醒] ECN ${ecnData.ecnNumber} 將於 3 天後逾期`,
    buildHtml(
      `ECN ${ecnData.ecnNumber} 將於 3 天後逾期`,
      `<p>以下 ECN 即將到達截止日期，請盡快完成審核。</p>
       <p><strong>ECN 編號：</strong>${ecnData.ecnNumber}</p>
       <p><strong>標題：</strong>${ecnData.title}</p>
       <p><strong>截止日期：</strong>${dueDateStr}</p>`,
      `${FRONTEND_URL}/ecns/${ecnData.ecnId}`,
      '前往審核',
    ),
  );
}
