/* The app chrome: sidebar (desktop), top bar and tab bar (phone). Badges come from GET /v1/admin/system/counts/;
   the escrow slip from GET /v1/admin/system/dashboard/. */
import L from '../lib/core.js';
import { useStore } from '../lib/hooks.js';
import Icon from './Icon.jsx';
import { openAlerts } from './AlertsSheet.jsx';
import { ROLE_NAME } from '../lib/admin.js';

const cur = (nav, key) => (nav === key ? { 'aria-current': 'page' } : {});
const Badge = ({ n }) => <span className="badge" hidden={!n}>{n}</span>;

export function Sidebar({ nav }) {
  const s = useStore(), c = L.chrome();
  return (
    <aside className="side" aria-label="Main">
      <a className="sbox brand" href="#home" aria-label="Linkloom admin home"><img src="assets/logo-mark.svg" width="28" height="28" alt="" /><span>linkloom</span></a>
      <div className="sbox nav-box">
        <nav className="nav" aria-label="Sections">
          <a href="#home" data-nav="home" {...cur(nav, 'home')}>Command</a>
          <a href="#verify" data-nav="verify" {...cur(nav, 'verify')}>Verification <Badge n={c.verify} /></a>
          <a href="#accounts" data-nav="accounts" {...cur(nav, 'accounts')}>Accounts</a>
          <a href="#marketplace" data-nav="marketplace" {...cur(nav, 'marketplace')}>Marketplace <Badge n={c.campaigns} /></a>
          <a href="#moderation" data-nav="moderation" {...cur(nav, 'moderation')}>Moderation <Badge n={c.moderation} /></a>
          <a href="#orders" data-nav="orders" {...cur(nav, 'orders')}>Orders &amp; escrow <Badge n={c.orders} /></a>
          <a href="#finance" data-nav="finance" {...cur(nav, 'finance')}>Financials</a>
          <a href="#audit" data-nav="audit" {...cur(nav, 'audit')}>Audit log</a>
        </nav>
        <p className="nav-note">Admin console · every action is logged</p>
      </div>
      <a className="sbox slipbox" href="#orders">
        <span className="t-cap slip-l">Escrow balance</span>
        <span className="t-money t-money-m">{s.live && s.live.escrow != null ? L.inr(s.live.escrow) : '—'}</span>
        {s.live && s.live.liveOrders ? <span className="pill pill-escrow"><Icon n="lock" /> {s.live.liveOrders} live orders</span> : null}
        <span className="slip-plan">{s.live && s.live.escrow != null ? 'Audit log · every action sealed' : 'Open Orders & escrow for the pipeline'}</span>
      </a>
      <a className="sbox me" href="#security" data-nav="security" {...cur(nav, 'security')}>
        <span className="avatar" data-me-initials="">{L.initials(s.me.name)}</span>
        <span className="me-t"><b>{s.me.name}</b><span>{(ROLE_NAME[s.me.adminRole] || s.me.email || 'Admin') + ' · MFA on'}</span></span>
      </a>
    </aside>
  );
}

export function TopBar() {
  const s = useStore(), c = L.chrome();
  return (
    <header className="top">
      <a className="hbox hlogo" href="#home" aria-label="Linkloom admin home"><img src="assets/logo-mark.svg" width="26" height="26" alt="" /><span>linkloom</span></a>
      <div className="grow"></div>
      <div className="hbox icons">
        <a className="ibtn bell" href="#audit" aria-label="Audit log"><Icon n="shield" /></a>
        <button className="ibtn bell" type="button" id="bell" aria-haspopup="dialog" aria-label={c.bell ? `Alerts, ${c.bell} unread` : 'Alerts'} onClick={openAlerts}>
          <Icon n="bell" /><span className="bell-n" hidden={!c.bell}>{c.bell}</span>
        </button>
        <a className="avatar" href="#security" aria-label="Your admin account" data-me-initials="">{L.initials(s.me.name)}</a>
      </div>
    </header>
  );
}

const TABS = [['home', 'home', 'Command'], ['verify', 'verified', 'Verify'], ['accounts', 'users', 'Accounts'], ['orders', 'lock', 'Escrow'], ['audit', 'shield', 'Audit']];
export function TabBar({ nav }) {
  return (
    <nav className="tabbar dark" aria-label="Sections">
      {TABS.map(([k, ic, label]) => <a key={k} href={'#' + k} data-nav={k} {...cur(nav, k)}><Icon n={ic} />{label}</a>)}
    </nav>
  );
}
