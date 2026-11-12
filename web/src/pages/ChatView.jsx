import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../api.js';

const EMOJI = ['👍', '❤️', '🔥', '😂', '🎉'];

export default function ChatView({ user }) {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [text, setText] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);

  const load = () => api(`/messages/${id}`).then(setMessages).catch(() => setMessages([]));

  useEffect(() => {
    load();
    api(`/chats/${id}/info`).then(setChatInfo).catch(() => {});
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${getToken()}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'message' && msg.chatId === Number(id)) {
          setMessages((prev) => [...prev, { ...msg.message, reactions: [] }]);
        }
      } catch {}
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = { text };
    setText('');
    try {
      const msg = await api(`/messages/${id}`, { method: 'POST', body: JSON.stringify(body) });
      setMessages((prev) => [...prev, { ...msg, reactions: [] }]);
    } catch {}
  };

  const react = async (messageId, emoji) => {
    setPickerFor(null);
    try {
      const data = await api(`/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
      setMessages((prev) => prev.map((m) =>
        m.id === data.messageId ? { ...m, reactions: data.reactions } : m
      ));
    } catch {}
  };

  const senderName = (m) =>
    [m.sender_first_name, m.sender_last_name].filter(Boolean).join(' ') || 'Пользователь';

  return (
    <div className="chat-page">
      <header className="chat-header">
        <Link to="/chats">←</Link>
        <h3>{chatInfo?.title || `Чат ${id}`}</h3>
        {chatInfo?.peer && (
          <span className="muted small">@{chatInfo.peer.username || chatInfo.peer.digital_id}</span>
        )}
      </header>
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.sender_id === user.id ? 'msg own' : 'msg'}>
            {chatInfo?.type !== 'private' && m.sender_id !== user.id && (
              <div className="muted small">{senderName(m)}</div>
            )}
            <div>{m.text}</div>
            {m.reactions?.length > 0 && (
              <div className="reactions">
                {m.reactions.map((r) => (
                  <button key={r.emoji} className="reaction-chip" onClick={() => react(m.id, r.emoji)}>
                    {r.emoji} {r.n}
                  </button>
                ))}
              </div>
            )}
            <div className="msg-footer">
              <span className="muted small">{new Date(m.created_at).toLocaleTimeString()}{m.edited ? ' · изменено' : ''}</span>
              <button className="link small" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>☺</button>
            </div>
            {pickerFor === m.id && (
              <div className="emoji-picker">
                {EMOJI.map((e) => (
                  <button key={e} className="reaction-chip" onClick={() => react(m.id, e)}>{e}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form className="composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" />
        <button>Отправить</button>
      </form>
    </div>
  );
}