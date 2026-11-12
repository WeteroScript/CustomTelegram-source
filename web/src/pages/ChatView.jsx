import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../api.js';

const EMOJI = ['👍', '❤️', '🔥', '😂', '🎉'];
const ROLE_LABELS = { owner: 'владелец', admin: 'админ', member: 'участник', restricted: 'ограничен' };

function fmtDelay(seconds) {
  if (seconds < 60) return `через ${seconds} сек`;
  if (seconds < 3600) return `через ${Math.floor(seconds / 60)} мин`;
  return `через ${Math.floor(seconds / 3600)} ч`;
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

// Короткий звук нового сообщения через WebAudio, без внешних файлов.
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {}
}

export default function ChatView({ user }) {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [chatInfo, setChatInfo] = useState(null);
  const [onlineIds, setOnlineIds] = useState({});
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [pickerFor, setPickerFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [forwardFor, setForwardFor] = useState(null);
  const [forwardTarget, setForwardTarget] = useState('');
  const [selfDestruct, setSelfDestruct] = useState('');
  const [scheduleIn, setScheduleIn] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState([]);
  const [addUserId, setAddUserId] = useState('');
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingSentAt = useRef(0);
  const typingTimer = useRef(null);

  const load = () => api(`/messages/${id}`).then(setMessages).catch(() => setMessages([]));
  const loadPinned = () => api(`/messages/${id}/pinned`).then(setPinned).catch(() => setPinned([]));
  const loadScheduled = () => api(`/messages/${id}/scheduled`).then(setScheduled).catch(() => setScheduled([]));
  const markRead = () => api(`/chats/${id}/read`, { method: 'POST' }).catch(() => {});
  const loadMembers = () => api(`/chats/${id}/members`).then(setMembers).catch(() => setMembers([]));

  useEffect(() => {
    // Запрашиваем право на браузерные уведомления один раз.
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
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
          setTyping(false);
          markRead();
          // Уведомление и звук, только когда вкладка не на переднем плане.
          if (document.hidden) {
            playBeep();
            if ('Notification' in window && Notification.permission === 'granted') {
              const title = msg.message.sender_id === user.id
                ? 'Вы'
                : `${msg.message.sender_first_name || ''} ${msg.message.sender_last_name || ''}`.trim() || 'Новое сообщение';
              new Notification(title, {
                body: String(msg.message.text || 'Вложение').slice(0, 80),
                tag: `chat-${msg.chatId}`
              });
            }
          }
        } else if (msg.type === 'reaction') {
          setMessages((prev) => prev.map((m) =>
            m.id === msg.messageId ? { ...m, reactions: msg.reactions } : m
          ));
        } else if (msg.type === 'message_edited' && msg.chatId === Number(id)) {
          setMessages((prev) => prev.map((m) =>
            m.id === msg.id ? { ...m, text: msg.text, edited: true } : m
          ));
        } else if (msg.type === 'message_deleted' && msg.chatId === Number(id)) {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        } else if (msg.type === 'typing' && msg.chatId === Number(id) && msg.userId !== user.id) {
          setTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), 3000);
        } else if (msg.type === 'presence') {
          setOnlineIds((prev) => ({ ...prev, [msg.userId]: msg.online }));
        }
      } catch {}
    };
    wsRef.current = ws;
    return () => {
      ws.close();
      clearTimeout(typingTimer.current);
    };
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
  }, [messages, typing]);

  // Сигнал набора не чаще раза в две секунды.
  const onTextChanged = (value) => {
    setText(value);
    const now = Date.now();
    if (value && !editing && now - typingSentAt.current > 2000 && wsRef.current?.readyState === 1) {
      typingSentAt.current = now;
      wsRef.current.send(JSON.stringify({ type: 'typing', chatId: Number(id) }));
    }
  };

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

  const startEditing = (m) => {
    setEditing({ id: m.id, text: m.text });
    setReplyTo(null);
  };

  const saveEditing = async (e) => {
    e.preventDefault();
    if (!editing?.text?.trim()) return;
    try {
      await api(`/messages/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editing.text })
      });
      // Обновление придёт по WebSocket, но применим и локально.
      setMessages((prev) => prev.map((m) =>
        m.id === editing.id ? { ...m, text: editing.text, edited: true } : m
      ));
      setEditing(null);
    } catch {
      setNotice('Не удалось изменить сообщение');
    }
  };

  const removeMessage = async (messageId) => {
    try {
      await api(`/messages/${messageId}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      loadPinned();
    } catch {
      setNotice('Не удалось удалить сообщение');
    }
  };

  // Загрузка файла и отправка сообщения с медиа.
  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'upload_failed');
      const now = Date.now();
      await api(`/messages/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          text: text.trim() || null,
          kind: data.kind,
          payload: { media: data.media },
          mediaId: data.id,
          replyTo: replyTo?.id || undefined,
          selfDestructAt: selfDestruct
            ? new Date(now + Number(selfDestruct) * 1000).toISOString()
            : undefined
        })
      });
      setText('');
      setReplyTo(null);
    } catch (err) {
      setNotice(err.message === 'limit_file_size'
        ? 'Файл больше 10 МБ'
        : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
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

  // Выгрузка истории чата: файл приходит с сервера как вложение.
  const exportHistory = async () => {
    try {
      const res = await fetch(`/api/messages/${id}/export`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice('Не удалось выгрузить историю');
    }
  };

  const openMembers = () => {
    setShowMembers(!showMembers);
    if (!showMembers) loadMembers();
  };

  const changeRole = async (userId, role) => {
    setNotice('');
    try {
      await api(`/chats/${id}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
      loadMembers();
    } catch {
      setNotice('Не удалось изменить роль');
    }
  };

  const kickMember = async (userId) => {
    setNotice('');
    try {
      await api(`/chats/${id}/members/${userId}`, { method: 'DELETE' });
      loadMembers();
    } catch {
      setNotice('Не удалось исключить участника');
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    setNotice('');
    if (!addUserId.trim()) return;
    try {
      const found = await api(`/users/${addUserId.trim()}`);
      await api(`/chats/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: found.id })
      });
      setAddUserId('');
      loadMembers();
    } catch {
      setNotice('Пользователь не найден или нет прав');
    }
  };

  const myRole = members.find((m) => m.id === user.id)?.role || chatInfo?.role || 'member';
  const canManage = ['owner', 'admin'].includes(myRole);
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
        {chatInfo?.type === 'group' && (
          <button className="link small" onClick={openMembers}>
            👥 {showMembers ? 'Скрыть участников' : 'Участники'}
          </button>
        )}
        <button className="link small" onClick={exportHistory}>⬇ История</button>
        <form className="row chat-search" onSubmit={doSearch}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по чату" />
          <button>Найти</button>
        </form>
      </header>
      {showMembers && chatInfo?.type === 'group' && (
        <div className="members-panel">
          <div className="muted small">Ваша роль: {ROLE_LABELS[myRole] || myRole}</div>
          {canManage && (
            <form className="row" onSubmit={addMember}>
              <input value={addUserId} onChange={(e) => setAddUserId(e.target.value)} placeholder="Цифровой ID для добавления" />
              <button>Добавить</button>
            </form>
          )}
          <ul className="list">
            {members.map((u) => (
              <li key={u.id}>
                <div>
                  <strong>{u.first_name} {u.last_name}</strong>
                  <div className="muted small">
                    <span className={u.online ? 'online-dot' : 'offline-dot'} />
                    @{u.username || u.digital_id} · {ROLE_LABELS[u.role] || u.role}
                  </div>
                </div>
                {canManage && u.id !== user.id && u.role !== 'owner' && (
                  <div className="row member-controls">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      disabled={myRole === 'admin' && u.role === 'admin'}
                    >
                      <option value="admin">админ</option>
                      <option value="member">участник</option>
                      <option value="restricted">ограничен</option>
                    </select>
                    <button
                      className="cancel-btn"
                      onClick={() => kickMember(u.id)}
                      disabled={myRole === 'admin' && u.role === 'admin'}
                    >
                      Исключить
                    </button>
                  </div>
                )}
              </li>
            ))}
            {members.length === 0 && <li className="muted">Список загружается…</li>}
          </ul>
        </div>
      )}
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
            {m.kind === 'image' && m.payload?.media && (
              <a href={m.payload.media.url} target="_blank" rel="noreferrer">
                <img className="msg-image" src={m.payload.media.thumb || m.payload.media.url} alt={m.payload.media.name} />
              </a>
            )}
            {m.kind === 'file' && m.payload?.media && (
              <a className="file-attachment" href={m.payload.media.url} target="_blank" rel="noreferrer">
                📎 {m.payload.media.name}
                <span className="muted small"> {fmtSize(m.payload.media.size)}</span>
              </a>
            )}
            {m.text && <div>{m.text}</div>}
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
              {m.sender_id === user.id && m.kind === 'text' && (
                <button className="link small" onClick={() => startEditing(m)}>✎</button>
              )}
              {m.sender_id === user.id && (
                <button className="link small" onClick={() => removeMessage(m.id)}>🗑</button>
              )}
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
        {typing && <div className="typing-indicator muted small">печатает…</div>}
        <div ref={bottomRef} />
      </div>
      {notice && <div className="muted composer-notice">{notice}</div>}
      {uploading && <div className="muted composer-notice">Загрузка файла…</div>}
      {replyTo && (
        <div className="reply-bar">
          Ответ на: {String(replyTo.text || 'вложение').slice(0, 50)}
          <button className="link small" onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}
      {editing ? (
        <form className="composer editing" onSubmit={saveEditing}>
          <span className="muted small">Редактирование</span>
          <input
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            autoFocus
          />
          <button>Сохранить</button>
          <button type="button" className="cancel-btn" onClick={() => setEditing(null)}>Отмена</button>
        </form>
      ) : (
        <form className="composer" onSubmit={send}>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={onFilePicked}
            accept="image/*,.pdf,.doc,.docx,.txt,.zip,.mp3,.mp4"
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>📎</button>
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
          <input value={text} onChange={(e) => onTextChanged(e.target.value)} placeholder="Сообщение" />
          <button>Отправить</button>
        </form>
      )}
    </div>
  );
}