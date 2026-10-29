import './feesComingSoon.css';
/** Render only on an administrator-authorized route. No billing data or API requests. */
export default function FeesComingSoon(){
  return <section className="sadhana-fees" aria-labelledby="fees-heading">
    <header className="sadhana-fees__head"><div><p className="sadhana-fees__eyebrow">Academy operations</p><h1 id="fees-heading">Fees</h1><p>Financial management is planned for a later release.</p></div><span className="sadhana-fees__status">Coming soon</span></header>
    <div className="sadhana-fees__grid" aria-label="Planned feature previews">
      {['Fee plans','Payment tracking','Statements'].map(label=><article className="sadhana-fees__card" key={label}><div className="sadhana-fees__placeholder" aria-hidden="true"/><h2>{label}</h2><p>Not yet available</p></article>)}
    </div>
    <p className="sadhana-fees__note">No invoices, charges, payment processing or financial records are enabled.</p>
  </section>;
}
