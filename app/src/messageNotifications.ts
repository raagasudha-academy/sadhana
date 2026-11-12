import type { InstitutionId } from './types';

export type MessageThreadActivity = {
  threadId: string;
  peerId: string;
  peerName: string;
  classId: string;
  className: string;
  lastMessage: string;
  lastAt: string;
  unreadCount: number;
};

export function messageThreadNotifications(
  institution: InstitutionId,
  threads: MessageThreadActivity[],
  studentId?: string,
) {
  return threads.map((thread) => ({
    id: `message:${institution}:${thread.threadId}`,
    institution,
    title: thread.unreadCount
      ? `New message from ${thread.peerName}`
      : `Message with ${thread.peerName}`,
    detail: `${thread.className} · ${thread.lastMessage}`,
    age: new Date(thread.lastAt).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    category: 'Messages',
    read: thread.unreadCount === 0,
    unreadCount: thread.unreadCount,
    messageThread: {
      threadId: thread.threadId,
      peerId: thread.peerId,
      classId: thread.classId,
      ...(studentId ? { studentId } : {}),
    },
  }));
}
