import type {SupabaseClient} from '@supabase/supabase-js';
import type {AccountingIdentity} from './accounting-telegram';

export function accountingStore(client: SupabaseClient, identity: AccountingIdentity) {
  const dedicated = identity.mode === 'dedicated';
  const jobQuery = (query: any) => dedicated ? query.eq('bot_id', identity.botId).eq('chat_id', identity.chatId) : query;
  const jobs = () => client.from(identity.jobsTable);
  return {
    identity,
    async receive(update: any, message: any) {
      const row = {
        ...(dedicated ? {bot_id: identity.botId, chat_id: identity.chatId} : {}),
        update_id: update.update_id, message_id: message.message_id, sender_id: String(message.from.id),
        text: String(message.text || message.caption || '').slice(0, 4096), status: 'received'
      };
      const result = await jobs().upsert(row, {onConflict: dedicated ? 'bot_id,update_id' : 'update_id', ignoreDuplicates: true});
      if (result.error) throw Error('Job insert failed');
      return this.get(update.update_id);
    },
    async get(id: number) {
      const result = await jobQuery(jobs().select('*').eq('update_id', id)).single();
      if (result.error || !result.data) throw Error('Job read failed');
      return result.data;
    },
    async save(id: number, value: Record<string, unknown>) {
      const result = await jobQuery(jobs().update(value).eq('update_id', id));
      if (result.error) throw Error('Job persistence failed');
    },
    async priorMessage(messageId:number):Promise<{status:string}|null> {
      if(!dedicated)return null;
      const current=await jobs().select('status').eq('chat_id',identity.chatId).eq('message_id',messageId).neq('bot_id',identity.botId).limit(1);
      if(current.error)throw Error('Prior bot message check failed');
      if(current.data?.length)return {status:String(current.data[0].status)};
      if(identity.chatId===process.env.STAFF_TELEGRAM_CHAT_ID){
        const legacy=await client.from('dream_accounting_jobs').select('status').eq('message_id',messageId).limit(1);
        if(legacy.error)throw Error('Legacy message state check failed');
        if(legacy.data?.length)return {status:String(legacy.data[0].status)};
      }
      return null;
    },
    async duplicate(messageId: number, imageKey?: string) {
      // Photos address the fixed accounting workbook. Check across bot identities
      // and source rooms, including the old live bot during cutover.
      let query = jobs().select('update_id').eq('status', 'applied');
      query = imageKey ? query.eq('image_key', imageKey) : query.eq('message_id', messageId);
      if (dedicated && !imageKey) query = query.eq('chat_id', identity.chatId);
      const current = await query.limit(1);
      if (current.error) throw Error('Duplicate check failed');
      if (current.data?.length) return true;
      if (dedicated && (imageKey || identity.chatId === process.env.STAFF_TELEGRAM_CHAT_ID)) {
        let legacy = client.from('dream_accounting_jobs').select('update_id').eq('status', 'applied');
        legacy = imageKey ? legacy.eq('image_key', imageKey) : legacy.eq('message_id', messageId);
        const previous = await legacy.limit(1);
        if (previous.error) throw Error('Legacy duplicate check failed');
        return Boolean(previous.data?.length);
      }
      return false;
    },
    async previous(messageId: number) {
      if (!Number.isSafeInteger(messageId)) return null;
      let query = jobs().select('text,plan,status').or(`message_id.eq.${messageId},reply_id.eq.${messageId}`);
      if (dedicated) query = query.eq('chat_id', identity.chatId);
      const current = await query.order('created_at', {ascending: false}).limit(1);
      if (current.error) throw Error('Context lookup failed');
      if (current.data?.length) return current.data[0];
      if (dedicated && identity.chatId === process.env.STAFF_TELEGRAM_CHAT_ID) {
        const old = await client.from('dream_accounting_jobs').select('text,plan,status')
          .or(`message_id.eq.${messageId},reply_id.eq.${messageId}`).order('created_at', {ascending: false}).limit(1);
        if (old.error) throw Error('Legacy context lookup failed');
        return old.data?.[0] || null;
      }
      return null;
    },
    async rules() {
      const result = await client.from(identity.rulesTable).select('id,kind,content').eq('active', true).order('id').limit(50);
      if (result.error) throw Error('Rule lookup failed');
      return result.data || [];
    },
    async removeRule(id: number) {
      const result = await client.from(identity.rulesTable).update({active: false}).eq('id', id).eq('active', true).select('id');
      if (result.error) throw Error('Rule removal failed');
      return Boolean(result.data?.length);
    },
    async saveRule(rule: {kind: string; content: string}, job: any, sender: number) {
      const row = {
        ...rule, source_text: job.text, source_update: job.update_id, sender_id: String(sender),
        ...(dedicated ? {source_bot_id: identity.botId, source_chat_id: identity.chatId} : {})
      };
      const result = await client.from(identity.rulesTable).upsert(row, {onConflict: dedicated ? 'source_bot_id,source_update' : 'source_update'})
        .select('id,kind,content').single();
      if (result.error) throw Error('Rule save failed');
      return result.data;
    }
  };
}
