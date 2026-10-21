import {NextResponse} from 'next/server';
// Compatibility for old guest clients. Notification delivery now belongs to the
// transactional database outbox; this endpoint must never send a second message.
export async function POST(){return NextResponse.json({ok:true,delivery:'server-queue'});}
