// Chat page (task 3.5). Server component: reads ?q= and hands it to the client chat panel.
import { ChatPanel } from '@/components/chat/chat-panel';

export const metadata = { title: 'Chat · Support Triage AI' };

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <ChatPanel initialQuestion={q} />;
}
