import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MessageCircle, RefreshCw, Send } from 'lucide-react';
import type { CloudSession } from './CloudAuth';
import type { InstitutionId } from './types';
import './messagesPage.css';

type Contact = {
  peerId: string;
  peerName: string;
  peerRole: 'teacher' | 'student' | 'admin' | 'guardian';
  classId: string;
  className: string;
  threadId: string;
  photoUrl?: string;
};
type Thread = Contact & { lastMessage: string; lastAt: string; unreadCount: number };
type Message = {
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  createdAt: string;
  read: boolean;
};
const contactSections = [
  { role: 'student', label: 'Students' },
  { role: 'teacher', label: 'Teachers' },
  { role: 'admin', label: 'Admins' },
  { role: 'guardian', label: 'Families' },
] as const;
function MessageAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  return (
    <span className="messages-avatar" aria-hidden="true">
      <span>{name.slice(0, 1).toUpperCase()}</span>
      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
export default function MessagesPage({
  cloud,
  workspace,
  studentId,
  compact = false,
}: {
  cloud: CloudSession;
  workspace: InstitutionId;
  studentId?: string;
  compact?: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]),
    [threads, setThreads] = useState<Thread[]>([]),
    [active, setActive] = useState<Contact | null>(null),
    [rows, setRows] = useState<Message[]>([]);
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const refreshThreads = useCallback(async () => {
    const data = await cloud.api.listMessageThreads(workspace, studentId);
    setThreads(data.records);
  }, [cloud, workspace, studentId]);
  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [people] = await Promise.all([
        cloud.api.listMessageContacts(workspace, studentId),
        refreshThreads(),
      ]);
      setContacts(people.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load messages');
    } finally {
      setLoading(false);
    }
  }, [cloud, workspace, studentId, refreshThreads]);
  const loadActive = useCallback(
    async (contact: Contact, markRead = true) => {
      try {
        const result = await cloud.api.getMessageThread(
          workspace,
          contact.threadId,
          contact.peerId,
          contact.classId,
          studentId,
        );
        setRows(result.records);
        if (markRead) {
          await cloud.api.markMessageThreadRead(
            workspace,
            contact.threadId,
            contact.peerId,
            contact.classId,
            studentId,
          );
          await refreshThreads();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load this conversation');
      }
    },
    [cloud, workspace, studentId, refreshThreads],
  );
  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);
  useEffect(() => {
    if (!active) return;
    void loadActive(active);
    const timer = window.setInterval(() => void loadActive(active), 30000);
    return () => window.clearInterval(timer);
  }, [active, loadActive]);
  useEffect(() => {
    if (bottom.current?.scrollIntoView)
      bottom.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [rows]);
  // The API has already revalidated every inbox thread. Keep valid history
  // visible even when its peer is no longer offered in the new-contact list.
  const recent = useMemo(() => threads, [threads]);
  const recentIds = new Set(recent.map((item) => item.threadId));
  const choose = (contact: Contact) => {
    setError('');
    setRows([]);
    setActive(contact);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!active || !text.trim() || busy) return;
    const message = text.trim();
    setBusy(true);
    setError('');
    try {
      await cloud.api.sendMessage(workspace, {
        peerId: active.peerId,
        classId: active.classId,
        text: message,
        threadId: recentIds.has(active.threadId) ? active.threadId : undefined,
        studentId,
      });
      setText('');
      await loadActive(active);
      await refreshThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message could not be sent');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className={`messages-page${compact ? ' messages-page-compact' : ''}`}
      aria-label="Messages"
    >
      {!compact && (
        <header className="messages-page-head">
          <div>
            <p className="messages-eyebrow">YOUR ACADEMY · YOUR LEARNING</p>
            <h1>Messages</h1>
            <p className="messages-page-description">Message approved contacts in your academy.</p>
          </div>
          <button
            type="button"
            className="messages-refresh"
            onClick={() => void loadDirectory()}
            disabled={loading}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </header>
      )}
      {error && (
        <p className="messages-error" role="alert">
          {error}
        </p>
      )}
      <div className="messages-layout">
        <aside className="messages-inbox" aria-label="Conversations">
          <label className="messages-new">
            New conversation
            <select
              aria-label="New conversation"
              value=""
              onChange={(e) => {
                const contact = contacts.find(
                  (item) => `${item.peerId}|${item.classId}` === e.target.value,
                );
                if (contact) choose(contact);
              }}
            >
              <option value="">Choose a class contact</option>
              {contactSections.map((section) => {
                const rows = contacts.filter((contact) => contact.peerRole === section.role);
                return rows.length ? (
                  <optgroup key={section.role} label={section.label}>
                    {rows.map((contact) => (
                      <option
                        key={`${contact.peerId}|${contact.classId}`}
                        value={`${contact.peerId}|${contact.classId}`}
                      >
                        {contact.peerName} · {contact.className}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <h3>Recent</h3>
          {loading ? (
            <p role="status">Loading conversations…</p>
          ) : recent.length ? (
            recent.map((thread) => (
              <button
                type="button"
                key={thread.threadId}
                className={`messages-thread ${active?.threadId === thread.threadId ? 'selected' : ''}`}
                onClick={() => choose(thread)}
              >
                <MessageAvatar name={thread.peerName} photoUrl={thread.photoUrl} />
                <span className="messages-thread-copy">
                  <strong>{thread.peerName}</strong>
                  <small>
                    {thread.className} · {thread.lastMessage}
                  </small>
                </span>
                {thread.unreadCount > 0 && (
                  <span className="messages-unread" aria-label={`${thread.unreadCount} unread`}>
                    {thread.unreadCount}
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="messages-empty-list">No conversations yet.</p>
          )}
          {contactSections.map((section) => {
            const rows = contacts.filter((contact) => contact.peerRole === section.role),
              collapsed = collapsedSections[section.role] === true,
              contentId = `messages-contact-${section.role}`;
            return rows.length ? (
              <section
                key={section.role}
                className="messages-contact-section"
                aria-label={section.label}
              >
                <h3>
                  <button
                    type="button"
                    className="messages-section-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={contentId}
                    onClick={() =>
                      setCollapsedSections((previous) => ({
                        ...previous,
                        [section.role]: !previous[section.role],
                      }))
                    }
                  >
                    {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <span>{section.label}</span>
                    <small>{rows.length}</small>
                  </button>
                </h3>
                <div id={contentId} hidden={collapsed}>
                  {rows.map((contact) => (
                    <button
                      type="button"
                      key={`${contact.peerId}|${contact.classId}`}
                      className={`messages-thread ${active?.threadId === contact.threadId ? 'selected' : ''}`}
                      onClick={() => choose(contact)}
                    >
                      <MessageAvatar name={contact.peerName} photoUrl={contact.photoUrl} />
                      <span className="messages-thread-copy">
                        <strong>{contact.peerName}</strong>
                        <small>{contact.className}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null;
          })}
        </aside>
        <section
          className="messages-conversation"
          aria-label={active ? `Conversation with ${active.peerName}` : 'Conversation'}
        >
          {active ? (
            <>
              <header className="messages-conversation-head">
                <MessageAvatar name={active.peerName} photoUrl={active.photoUrl} />
                <div>
                  <h3>{active.peerName}</h3>
                  <p>
                    {active.peerRole === 'admin'
                      ? 'Administrator'
                      : active.peerRole === 'teacher'
                        ? 'Teacher'
                        : active.peerRole === 'student'
                          ? 'Student'
                          : 'Family'}{' '}
                    · {active.className}
                  </p>
                </div>
              </header>
              <div className="messages-history" aria-live="polite">
                {rows.length ? (
                  rows.map((message) => (
                    <article
                      key={message.id}
                      className={`messages-bubble ${message.senderId === active.peerId ? 'incoming' : 'outgoing'}`}
                    >
                      <p>{message.text}</p>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleString()}
                      </time>
                    </article>
                  ))
                ) : (
                  <div className="messages-first">
                    <MessageCircle size={27} />
                    <strong>Start the conversation</strong>
                    <span>Keep messages focused on this class.</span>
                  </div>
                )}
                <div ref={bottom} />
              </div>
              <form className="messages-compose" onSubmit={(e) => void submit(e)}>
                <label htmlFor="message-text">Message</label>
                <textarea
                  id="message-text"
                  maxLength={200}
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Write a message…"
                />
                <div>
                  <small>{text.length}/200 · Enter to send</small>
                  <button type="submit" disabled={busy || !text.trim()}>
                    <Send size={16} />
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="messages-first messages-no-selection">
              <MessageCircle size={32} />
              <strong>Select a conversation</strong>
              <span>Choose a recent conversation or start a message with a class contact.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
