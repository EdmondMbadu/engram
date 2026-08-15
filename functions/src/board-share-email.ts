export type DirectBoardShareEmailParams = {
  recipientName: string | null;
  recipientEmail: string;
  senderName: string;
  boardTitle: string;
  boardDescription: string;
  boardCoverImageUrl: string;
  boardUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isBlockedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '0.0.0.0'
    || host === '::1'
    || host === 'metadata.google.internal'
    || host.endsWith('.internal')
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || /^(?:fc|fd)[0-9a-f]{2}:/.test(host)
    || /^fe[89ab][0-9a-f]:/.test(host);
}

export function safeBoardShareImageUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().slice(0, 2000) : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const normalizedPath = url.pathname.toLowerCase();
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
      || url.username
      || url.password
      || isBlockedImageHost(url.hostname)
      || /\.(?:svg|tiff?)$/.test(normalizedPath)) {
      return '';
    }
    return url.toString();
  } catch {
    return '';
  }
}

export function buildDirectBoardShareEmail(params: DirectBoardShareEmailParams) {
  const recipientName = params.recipientName?.trim() || 'there';
  const senderName = params.senderName.trim() || 'A LivingWiki member';
  const boardTitle = params.boardTitle.trim() || 'LivingWiki board';
  const boardDescription = params.boardDescription.trim();
  const boardUrl = params.boardUrl.trim();
  const coverImageUrl = safeBoardShareImageUrl(params.boardCoverImageUrl);
  const subject = `${senderName} shared “${boardTitle}” with you`.slice(0, 180);
  const safeRecipientName = escapeHtml(recipientName);
  const safeSenderName = escapeHtml(senderName);
  const safeBoardTitle = escapeHtml(boardTitle);
  const safeBoardDescription = escapeHtml(boardDescription);
  const safeBoardUrl = escapeHtml(boardUrl);
  const safeCoverImageUrl = escapeHtml(coverImageUrl);

  const text = `Hi ${recipientName},

${senderName} shared a LivingWiki board with you.

${boardTitle}
${boardDescription ? `\n${boardDescription}\n` : ''}
Open the board:
${boardUrl}

The LivingWiki Team`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #102017 0%, #1c7c41 100%); padding: 34px 30px; border-radius: 18px 18px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 850;">LivingWiki</h1>
        <p style="color: rgba(255,255,255,0.76); margin: 10px 0 0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;">A board shared with you</p>
      </div>
      <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">Hi <strong>${safeRecipientName}</strong>,</p>
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 22px;">
          <strong>${safeSenderName}</strong> shared a LivingWiki board with you.
        </p>
        <div style="background: #f8faf9; border: 1px solid #dbe8df; border-radius: 14px; overflow: hidden; margin: 0 0 24px;">
          ${safeCoverImageUrl ? `
          <a href="${safeBoardUrl}" style="display: block; text-decoration: none;">
            <img src="${safeCoverImageUrl}" alt="${safeBoardTitle} cover image" width="578" style="display: block; width: 100%; height: 260px; object-fit: cover; border: 0;" />
          </a>` : ''}
          <div style="padding: 20px;">
            <h2 style="color: #102017; font-size: 22px; line-height: 1.25; margin: 0 0 10px;">${safeBoardTitle}</h2>
            ${safeBoardDescription ? `<p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0;">${safeBoardDescription}</p>` : ''}
          </div>
        </div>
        <div style="text-align: center; margin: 26px 0;">
          <a href="${safeBoardUrl}" style="background: #1c7c41; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 999px; font-weight: 850; display: inline-block; font-size: 15px;">
            Open Board
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">Shared from LivingWiki.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
