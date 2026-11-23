import {createInsuranceRelay} from '../../../lib/insurance-notification-relay';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

export async function POST(request:Request) {
  return createInsuranceRelay({
    secret:process.env.INSURANCE_RELAY_SECRET,
    botToken:process.env.TELEGRAM_BOT_TOKEN,
    staffChatId:process.env.STAFF_TELEGRAM_CHAT_ID
  })(request);
}
