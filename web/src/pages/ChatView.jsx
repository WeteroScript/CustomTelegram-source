import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../api.js';

const EMOJI = ['👍', '❤️', '🔥', '😂', '🎉'];

function fmtDelay(seconds) {
  if (seconds < 60) return `через ${seconds} сек`;
  if (seconds < 3600) return `через ${Math.floor(seconds / 60)} мин`;
  return `через ${Math.floor(seconds / 3600)} ч`;
}

export default function ChatView({ user }) {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [onlineIds, setOnlineIds] = useState({});
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [forwardFor, setForwardFor] = useState(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [selfDestruct, setSelfDestruct] = useState('');
  const [scheduleIn, setScheduleIn] = useState('');
  const [notice, setNotice] = useState('');
  const wsRef = useRef(null);
  const bottomRef = useRef(null);

  const load = () => api(`/messages/${id}`).then(setMessages).catch(() => setMessages([]));
  const loadPinned = () => api(`/messages/${id}/pinned`).then(setPinned).catch(() => setPinned([]));
  const loadScheduled = () => api(`/messages/${id}/scheduled`).then(setScheduled).catch(() => setScheduled([]));
  const markRead = () => api(`/chats/${id}/read`, { method: 'POST' }).catch(() => {});

  useEffect(() => {
    load();
    loadPinned();
    loadScheduled();
    markRead();
    api(`/chats/${id}/info`).then((info) => {
      setChatInfo(info);
      if (info.peer?.id) {
        api(`/users/online?ids=${info.peer.id}`).then((list) => {
          setOnlineIds((prev) => ({ ...prev, [info.peer.id]: Boolean(list[0]?.online) }));
        }).catch(() => {});
      }
    }).catch(() => {});
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${getToken()}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'message' && msg.chatId === Number(id)) {
          // Дубликаты отфильтровываются: сообщение могло прийти и по REST.
          setMessages((prev) => prev.some((m) => m.id === msg.message.id)
            ? prev
            : [...prev, { ...msg.message, reactions: [] }]);
          markRead();
        } else if (msg.type === 'reaction') {
          setMessages((prev) => prev.map((m) =>
            m.id === msg.messageId ? { ...m, reactions: msg.reactions } : m
          ));
        } else if (msg.type === 'presence') {
          setOnlineIds((prev) => ({ ...prev, [msg.userId]: msg.online }));
        }
      } catch {}
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [id]);

  // Обновляем список отложенных: истёкшие уходят в чат сами.
  useEffect(() => {
    if (scheduled.length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      const remaining = scheduled.filter((s) => new Date(s.scheduled_at).getTime() > now);
      if (remaining.length !== scheduled.length) {
        loadScheduled();
        load();
      } else {
        setScheduled(remaining);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [scheduled]);

  const doSearch = (e) => {
    e.preventDefault();
    if (search.trim()) api(`/messages/${id}?q=${encodeURIComponent(search.trim())}`).then(setMessages).catch(() => {});
    else load();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const now = Date.now();
    const body = {
      text,
      replyTo: replyTo?.id || undefined,
      selfDestructAt: selfDestruct
        ? new Date(now + Number(selfDestruct) * 1000).toISOString()
        : undefined,
      scheduledAt: scheduleIn
        ? new Date(now + Number(scheduleIn) * 1000).toISOString()
        : undefined
    };
    setText('');
    setReplyTo(null);
    try {
      await api(`/messages/${id}`, { method: 'POST', body: JSON.stringify(body) });
      if (scheduleIn) {
        setNotice('Сообщение отложено');
        loadScheduled();
      }
    } catch {
      setNotice('Не удалось отправить сообщение');
    }
  };

  const cancelScheduled = async (messageId) => {
    try {
      await api(`/messages/${messageId}/schedule`, { method: 'DELETE' });
      loadScheduled();
    } catch {
      setNotice('Не удалось отменить');
    }
  };

  const react = async (messageId, emoji) => {
    setPickerFor(null);
    try {
      await api(`/messages/${messageId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
      // Итоговые реакции придут всем по WebSocket, локально ничего не меняем.
    } catch {}
  };

  const pin = async (messageId) => {
    try {
      await api(`/messages/${messageId}/pin`, { method: 'POST' });
      load();
      loadPinned();
    } catch {
      setNotice('Нет прав на закрепление');
    }
  };

  const forward = async (e) => {
    e.preventDefault();
    setNotice('');
    try {
      await api(`/messages/${forwardFor}/forward`, {
        method: 'POST',
        body: JSON.stringify({ toChatId: Number(forwardTarget) })
      });
      setNotice('Переслано в чат ' + forwardTarget);
      setForwardFor(null);
      setForwardTarget('');
    } catch {
      setNotice('Не удалось переслать: проверьте номер чата');
    }
  };

  const senderName = (m) =>
    [m.sender_first_name, m.sender_last_name].filter(Boolean).join(' ') || 'Пользователь';

  const peerOnline = chatInfo?.peer ? Boolean(onlineIds[chatInfo.peer.id]) : false;

  return (
    <div className="chat-page">
      <header className="chat-header">
        <Link to="/chats">←</Link>
        <h3>{chatInfo?.title || `Чат ${id}`}</h3>
        {chatInfo?.peer && (
          <span className="muted small">
            <span className={peerOnline ? 'online-dot' : 'offline-dot'} />
            {peerOnline ? 'в сети' : 'не в сети'}
          </span>
        )}
        <form className="row chat-search" onSubmit={doSearch}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по чату" />
          <button>Найти</button>
        </form>
      </header>
      {pinned.length > 0 && (
        <div className="pinned-bar">
          📌 {String(pinned[0].text).slice(0, 60)}
          {pinned.length > 1 && <span className="muted small"> (+{pinned.length - 1})</span>}
        </div>
      )}
      {scheduled.length > 0 && (
        <div className="scheduled-bar">
          <span className="muted small">Отложено: {scheduled.length}</span>
          {scheduled.map((s) => (
            <span key={s.id} className="scheduled-item">
              «{String(s.text).slice(0, 25)}» {fmtDelay(Math.max(0, (new Date(s.scheduled_at) - Date.now()) / 1000))}
              <button className="link small" onClick={() => cancelScheduled(s.id)}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={m.sender_id === user.id ? 'msg own' : 'msg'}>
            {chatInfo?.type !== 'private' && m.sender_id !== user.id && (
              <div className="muted small">{senderName(m)}</div>
            )}
            {m.forwarded_from && <div className="muted small">Переслано</div>}
            {m.reply_text !== undefined && m.reply_text !== null && (
              <div className="reply-quote muted small">
                {m.reply_sender_name || '?'}: {String(m.reply_text).slice(0, 60)}
              </div>
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
            {m.self_destruct_at && (
              <div className="muted small">Исчезнет: {new Date(m.self_destruct_at).toLocaleTimeString()}</div>
            )}
            <div className="msg-footer">
              <span className="muted small">{new Date(m.created_at).toLocaleTimeString()}{m.edited ? ' · изменено' : ''}</span>
              <button className="link small" onClick={() => setReplyTo(replyTo?.id === m.id ? null : m)}>↩</button>
              <button className="link small" onClick={() => setForwardFor(forwardFor === m.id ? null : m.id)}>→</button>
              <button className="link small" onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}>☺</button>
              <button className="link small" onClick={() => pin(m.id)}>{m.pinned ? '📌✕' : '📌'}</button>
            </div>
            {pickerFor === m.id && (
              <div className="emoji-picker">
                {EMOJI.map((e) => (
                  <button key={e} className="reaction-chip" onClick={() => react(m.id, e)}>{e}</button>
                ))}
              </div>
            )}
            {forwardFor === m.id && (
              <form className="inline-form" onSubmit={forward}>
                <input value={forwardTarget} onChange={(e) => setForwardTarget(e.target.value)} placeholder="Номер чата" />
                <button>Переслать</button>
              </form>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {notice && <div className="muted composer-notice">{notice}</div>}
      {replyTo && (
        <div className="reply-bar">
          Ответ на: {String(replyTo.text).slice(0, 50)}
          <button className="link small" onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}
      <form className="composer" onSubmit={send}>
        <select value={scheduleIn} onChange={(e) => setScheduleIn(e.target.value)} title="Отложенная отправка">
          <option value="">Сейчас</option>
          <option value="60">Через 1 мин</option>
          <option value="600">Через 10 мин</option>
          <option value="3600">Через 1 ч</option>
          <option value="86400">Через 1 день</option>
        </select>
        <select value={selfDestruct} onChange={(e) => setSelfDestruct(e.target.value)} title="Самоуничтожение">
          <option value="">Без таймера</option>
          <option value="10">10 сек</option>
          <option value="60">1 мин</option>
          <option value="300">5 мин</option>
          <option value="3600">1 час</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение" />
        <button>Отправить</button>
      </form>
    </div>
  );
}