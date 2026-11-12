import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MessagesPage from '../../src/MessagesPage';

afterEach(() => cleanup());

describe('in-app class messages', () => {
  it('lets an assigned teacher open a student conversation and send a message', async () => {
    const contact = {
      peerId: 'PERSON-STUDENT',
      peerName: 'Sam Student',
      peerRole: 'student' as const,
      classId: 'CLASS-SRUTI',
      className: 'Carnatic music',
      threadId: 'a'.repeat(64),
      photoUrl: 'https://photos.example/student',
    };
    const listMessageContacts = vi.fn().mockResolvedValue({ records: [contact] });
    const listMessageThreads = vi.fn().mockResolvedValue({ records: [] });
    const getMessageThread = vi.fn().mockResolvedValue({ records: [] });
    const markMessageThreadRead = vi.fn().mockResolvedValue({ updated: 0 });
    const sendMessage = vi.fn().mockResolvedValue({ record: { id: 'MESSAGE-1' } });
    const cloud = {
      api: {
        listMessageContacts,
        listMessageThreads,
        getMessageThread,
        markMessageThreadRead,
        sendMessage,
      },
    } as any;
    const view = render(<MessagesPage cloud={cloud} workspace="sruti" />);
    expect(await screen.findByRole('region', { name: 'Students' })).toBeTruthy();
    await waitFor(() =>
      expect(view.container.querySelector('.messages-avatar img')?.getAttribute('src')).toBe(
        contact.photoUrl,
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Sam Student/ }));
    expect(
      await screen.findByRole('region', { name: 'Conversation with Sam Student' }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Practice lesson 2' } });
    expect(screen.getByLabelText('Message').getAttribute('maxlength')).toBe('200');
    expect(screen.getByText('17/200 · Enter to send')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('sruti', {
        peerId: contact.peerId,
        classId: contact.classId,
        text: 'Practice lesson 2',
        threadId: undefined,
      }),
    );
    expect(getMessageThread).toHaveBeenCalledWith(
      'sruti',
      contact.threadId,
      contact.peerId,
      contact.classId,
      undefined,
    );
  });

  it('organizes available contacts into Students, Teachers and Admins sections', async () => {
    const contacts = [
      {
        peerId: 'PERSON-STUDENT',
        peerName: 'Sam Student',
        peerRole: 'student' as const,
        classId: 'CLASS-1',
        className: 'Music',
        threadId: '1'.repeat(64),
      },
      {
        peerId: 'PERSON-TEACHER',
        peerName: 'Tara Teacher',
        peerRole: 'teacher' as const,
        classId: 'CLASS-2',
        className: 'Dance',
        threadId: '2'.repeat(64),
      },
      {
        peerId: 'ADMIN-1',
        peerName: 'Academy Admin',
        peerRole: 'admin' as const,
        classId: 'ACADEMY-SRUTI',
        className: 'Śruti Vedam',
        threadId: '3'.repeat(64),
      },
    ];
    const cloud = {
      api: {
        listMessageContacts: vi.fn().mockResolvedValue({ records: contacts }),
        listMessageThreads: vi.fn().mockResolvedValue({ records: [] }),
        getMessageThread: vi.fn(),
        markMessageThreadRead: vi.fn(),
        sendMessage: vi.fn(),
      },
    } as any;
    render(<MessagesPage cloud={cloud} workspace="sruti" />);
    for (const section of ['Students', 'Teachers', 'Admins'])
      expect(await screen.findByRole('region', { name: section })).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Students/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /Sam Student/ })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: /Sam Student/ })).toBeTruthy();
  });

  it('uses the selected student identity for messages while a parent views as that student', async () => {
    const studentId = 'PERSON-TANISHA',
      contact = {
        peerId: 'PERSON-TEACHER',
        peerName: 'Tara Teacher',
        peerRole: 'teacher' as const,
        classId: 'CLASS-SRUTI',
        className: 'Vedic Chanting',
        threadId: 'd'.repeat(64),
      };
    const listMessageContacts = vi.fn().mockResolvedValue({ records: [contact] }),
      listMessageThreads = vi.fn().mockResolvedValue({ records: [] });
    const getMessageThread = vi.fn().mockResolvedValue({ records: [] }),
      markMessageThreadRead = vi.fn().mockResolvedValue({ updated: 0 }),
      sendMessage = vi.fn().mockResolvedValue({ record: { id: 'MESSAGE-2' } });
    const cloud = {
      api: {
        listMessageContacts,
        listMessageThreads,
        getMessageThread,
        markMessageThreadRead,
        sendMessage,
      },
    } as any;
    render(<MessagesPage cloud={cloud} workspace="sruti" studentId={studentId} />);
    expect(await screen.findByRole('region', { name: 'Teachers' })).toBeTruthy();
    expect(listMessageContacts).toHaveBeenCalledWith('sruti', studentId);
    fireEvent.click(await screen.findByRole('button', { name: /Tara Teacher/ }));
    await waitFor(() =>
      expect(getMessageThread).toHaveBeenCalledWith(
        'sruti',
        contact.threadId,
        contact.peerId,
        contact.classId,
        studentId,
      ),
    );
    await waitFor(() =>
      expect(markMessageThreadRead).toHaveBeenCalledWith(
        'sruti',
        contact.threadId,
        contact.peerId,
        contact.classId,
        studentId,
      ),
    );
  });

  it('keeps an authorised prior conversation visible when the new-contact list is empty', async () => {
    const thread = {
      peerId: 'PERSON-ADMIN',
      peerName: 'Academy Admin',
      peerRole: 'admin' as const,
      classId: 'ACADEMY-SRUTI',
      className: 'Śruti Vedam',
      threadId: 'b'.repeat(64),
      lastMessage: 'Thanks for your message',
      lastAt: '2026-11-09T10:00:00Z',
      unreadCount: 1,
    };
    const listMessageContacts = vi.fn().mockResolvedValue({ records: [] });
    const listMessageThreads = vi.fn().mockResolvedValue({ records: [thread] });
    const getMessageThread = vi.fn().mockResolvedValue({ records: [] });
    const markMessageThreadRead = vi.fn().mockResolvedValue({ updated: 1 });
    const cloud = {
      api: {
        listMessageContacts,
        listMessageThreads,
        getMessageThread,
        markMessageThreadRead,
        sendMessage: vi.fn(),
      },
    } as any;
    render(<MessagesPage cloud={cloud} workspace="sruti" />);
    const prior = await screen.findByRole('button', { name: /Academy Admin/ });
    expect(prior.textContent).toContain('Thanks for your message');
    fireEvent.click(prior);
    expect(
      await screen.findByRole('region', { name: 'Conversation with Academy Admin' }),
    ).toBeTruthy();
  });
});
