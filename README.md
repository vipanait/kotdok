This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Telegram Extra Check Flow Setup

The app supports requesting one extra symptom check when user credits are exhausted.
Admin confirmation is done from a Telegram channel message with inline buttons.

Add these variables to `.env.local`:

```bash
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_APPROVAL_CHAT_ID=-1001234567890
TELEGRAM_WEBHOOK_SECRET=your-random-secret
```

Webhook endpoint in this app:

```bash
https://<your-domain>/api/telegram/webhook
```

Set Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-domain>/api/telegram/webhook",
    "secret_token": "'"${TELEGRAM_WEBHOOK_SECRET}"'"
  }'
```

Quick health check:

1. Exhaust checks for a user (`credits = 0`).
2. Click "Request one more" on dashboard.
3. Confirm request in Telegram.
4. Verify `profiles.credits` increases by `+1` and a `credit_ledger` row with `reason = admin_grant` appears.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
