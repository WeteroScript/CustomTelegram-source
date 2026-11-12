import { Link, useLocation } from 'react-router-dom';

export default function Layout({ user, children, onLogout }) {
  const location = useLocation();
  const nav = [
    ['/chats', 'Чаты'],
    ['/wallet', 'Кошелёк'],
    ['/gifts', 'Подарки'],
    ['/profile', 'Профиль']
  ];
  if (user?.is_admin || user?.is_owner) nav.push(['/admin', 'Админ']);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">CustomTelegram</div>
        <nav>
          {nav.map(([path, label]) => (
            <Link key={path} to={path} className={location.pathname.startsWith(path) ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user.first_name}</div>
          <div className="muted small">+{user.digital_id}</div>
          <button className="link" onClick={onLogout}>Выйти</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}