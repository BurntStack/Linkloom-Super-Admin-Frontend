/* Moderation (#moderation, #report-<id>): abuse reports.
   - GET  /v1/admin/moderation/abuse-reports/?status=        reports
   - GET  /v1/admin/moderation/abuse-reports/<id>/           one report, with what was reported
   - POST /v1/admin/moderation/abuse-reports/<id>/remove/ · warn/ · suspend-account/ · dismiss/   { reason }
   Bid alerts and review moderation live on the Marketplace screen (#marketplace-bids, #marketplace-reviews). */
import { useRef } from 'react';
import L, { data } from '../lib/core.js';
import { useRerender } from '../lib/hooks.js';
import { api, str, pick, nameOf, idOf, label } from '../lib/admin.js';
import { refreshCounts } from '../lib/live.js';
import Icon from '../components/Icon.jsx';
import { usePaged, useLoad, useStagger, Failed, Loading, Empty, More, Row, Status, Fields, Lists, RoleNote, ActBtn, Seg, Head, decide, reason, when } from '../components/Admin.jsx';

const ui = () => (data.ui.mod = data.ui.mod || { status: 'open' });
const rep = r => ({
  id: str(r.id), status: str(pick(r.status, r.state)).toLowerCase(),
  kind: str(pick(r.targetType, r.contentType, r.kind, r.type, r.objectType)).toLowerCase(),
  reason: str(pick(r.reason, r.category, r.reasonCode)), text: str(pick(r.description, r.details, r.message, r.note)),
  reporter: nameOf(pick(r.reporter, r.reportedBy, r.createdBy)), target: nameOf(pick(r.target, r.reportedUser, r.subject, r.account, r.content)),
  targetId: idOf(pick(r.target, r.reportedUser, r.subject)), at: str(pick(r.createdAt, r.reportedAt))
});
const targetHref = r => (!r.targetId ? '' : /campaign/.test(r.kind) ? `#campaign-${r.targetId}` : /brand/.test(r.kind) ? `#brand-${r.targetId}` : /creator|profile|user/.test(r.kind) ? `#creator-${r.targetId}` : '');

function Queue() {
  const root = useRef(null);
  const rerender = useRerender();
  const u = ui();
  const p = usePaged(api.reports, { status: u.status });
  useStagger(root, '.adm-row', [p.loading, u.status]);
  const rows = p.rows.map(rep);
  return (
    <div className="view-in adm" ref={root}>
      <Head eyebrow="Moderation" title="Abuse reports" lede="Reported profiles, messages, files, reviews and campaigns." />
      <nav className="chips" aria-label="Moderation queues"><a className="chip" href="#moderation" aria-current="page">Abuse reports</a><a className="chip" href="#marketplace-bids">Bid alerts</a><a className="chip" href="#marketplace-reviews">Reviews</a></nav>
      <Seg label="Status" value={u.status} onChange={v => { u.status = v; rerender(); }} opts={[['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['', 'All']]} />
      <RoleNote area="moderation" doing="Acting on reports" />
      {p.err ? <Failed err={p.err} retry={p.reload} what="Abuse reports" /> : p.loading ? <Loading what="abuse reports" />
        : rows.length ? <ul className="adm-list no-anchor">{rows.map(r => <Row key={r.id} href={`#report-${r.id}`} title={r.target || label(r.kind || 'report')}
            sub={[label(r.kind || 'content'), r.reason && label(r.reason), r.reporter && `by ${r.reporter}`, when(r.at)].filter(Boolean).join(' · ')}
            pills={<Status s={r.status} />} />)}</ul>
        : <Empty title="No reports here." text="Reports from creators and brands show up here." />}
      <More p={p} />
    </div>
  );
}

function Detail({ id }) {
  const root = useRef(null);
  const r = useLoad(() => api.report(id), [id]);
  useStagger(root, '.adm-card', [!!r.data]);
  const back = <a className="btn-q adm-back" href="#moderation"><Icon n="back" />Abuse reports</a>;
  if (r.err) return <div className="view-in adm">{back}<Failed err={r.err} retry={r.reload} what="This report" /></div>;
  if (!r.data) return <div className="view-in">{back}<Loading what="this report" /></div>;
  const d = r.data, x = rep(d), open = !/dismiss|resolv|action|closed|removed/.test(x.status);
  const go = (action, t, o = {}) => () => decide({ title: t, confirm: o.confirm || label(action), tone: o.tone, toast: o.toast || 'Done', intro: o.intro, fields: [reason(4)],
    run: b => api.reportAction(x.id, action, b), done: () => { refreshCounts(); r.reload(); } });
  const href = targetHref(x);
  return (
    <div className="view-in adm" ref={root}>
      {back}
      <Head eyebrow={`Report · ${label(x.kind || 'content')}`} title={x.target || 'Reported content'} lede={[x.reason && label(x.reason), x.reporter && `Reported by ${x.reporter}`, when(x.at)].filter(Boolean).join(' · ')}>
        <Status s={x.status} />{href ? <a className="btn-q" href={href}>Open what was reported</a> : null}
      </Head>
      <div className="adm-grid">
        <div className="adm-col">
          {x.text ? <section className="card adm-card"><h2 className="t-h3">What the reporter said</h2><p>{x.text}</p></section> : null}
          <section className="card adm-card"><h2 className="t-h3">Report</h2><Fields obj={d} skip={['id']} /></section>
          <Lists obj={d} />
        </div>
        <div className="adm-col">
          <section className="card adm-card"><h2 className="t-h3">Decision</h2>
            <RoleNote area="moderation" doing="Acting on reports" />
            {open ? <div className="adm-acts">
              <ActBtn area="moderation" ic="trash" tone="p" onClick={go('remove', 'Remove the reported content?', { tone: 'danger', toast: 'Content removed' })}>Remove content</ActBtn>
              <ActBtn area="moderation" ic="alert" onClick={go('warn', 'Warn the account?', { toast: 'Warning sent' })}>Warn</ActBtn>
              <ActBtn area="moderation" ic="lock" onClick={go('suspend-account', 'Suspend the reported account?', { tone: 'danger', toast: 'Account suspended', intro: 'Their tokens stop working at once.' })}>Suspend account</ActBtn>
              <ActBtn area="moderation" ic="close" onClick={go('dismiss', 'Dismiss this report?', { toast: 'Report dismissed' })}>Dismiss</ActBtn>
            </div> : <p className="muted">{`This report is ${label(x.status || 'closed').toLowerCase()}.`}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

L.register('moderation', { title: 'Moderation', nav: 'moderation', Component: Queue });
L.register('report', { title: 'Report', nav: 'moderation', Component: ({ param }) => <Detail id={param} key={param} /> });
