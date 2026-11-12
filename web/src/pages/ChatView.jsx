import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../api.js';

export default function ChatView({ user }) {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [text, setText] = useState('');
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
          setMessages((prev) => [...prev, msg.message]);
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
      setMessages((prev) => [...prev, msg]);
    } catch {}
  };

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
            <div>{m.text}</div>
            <div className="muted small">{new Date(m.created_at).toLocaleTimeString()}{m.edited ? ' · изменено' : ''}</div>
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