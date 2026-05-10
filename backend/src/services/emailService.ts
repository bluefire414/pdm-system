import nodemailer from 'nodemailer';

const SMTP_CONFIGURED =
  !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

const transporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@pdm-system';

function buildHtml(title: string, body: string, linkHref: string, linkText: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 0">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
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

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.log(`[Email] SMTP 未設定，跳過寄送 to=${to} subject="${subject}"`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[Email] 寄送失敗 to=${to} subject="${subject}"`, err);
  }
}

export function buildEcnCreatedEmail(ecnNo: string, title: string, description: string): string {
  return buildHtml(
    `新的 ECN 待審核：${ecnNo}`,
    `<p>工程師提出了一份新的變更申請，請儘快進行審核。</p>
     <p><strong>ECN 編號：</strong>${ecnNo}</p>
     <p><strong>標題：</strong>${title}</p>
     <p><strong>說明：</strong>${description}</p>`,
    `${FRONTEND_URL}/ecns`,
    '前往審核',
  );
}

export function buildEcnApprovedEmail(ecnNo: string, title: string): string {
  return buildHtml(
    `您的變更申請已核准：${ecnNo}`,
    `<p>您提出的工程變更申請已通過審核，文件版本已更新。</p>
     <p><strong>ECN 編號：</strong>${ecnNo}</p>
     <p><strong>標題：</strong>${title}</p>`,
    `${FRONTEND_URL}/ecns`,
    '查看詳情',
  );
}

export function buildEcnRejectedEmail(ecnNo: string, title: string): string {
  return buildHtml(
    `您的變更申請已退回：${ecnNo}`,
    `<p>您提出的工程變更申請已被退回，請根據審核意見修改後重新提交。</p>
     <p><strong>ECN 編號：</strong>${ecnNo}</p>
     <p><strong>標題：</strong>${title}</p>`,
    `${FRONTEND_URL}/ecns`,
    '查看詳情',
  );
}

export function buildEcnDueSoonEmail(ecnNo: string, title: string, dueDate: Date): string {
  const dueDateStr = dueDate.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  return buildHtml(
    `ECN ${ecnNo} 將於 3 天後逾期`,
    `<p>以下 ECN 即將到達截止日期，請盡快完成審核。</p>
     <p><strong>ECN 編號：</strong>${ecnNo}</p>
     <p><strong>標題：</strong>${title}</p>
     <p><strong>截止日期：</strong>${dueDateStr}</p>`,
    `${FRONTEND_URL}/ecns`,
    '前往審核',
  );
}
