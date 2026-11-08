// Server-safe page head (icons are rendered here, not passed through a client boundary).
export default function PageHead({ crumb, title, icon: Icon, finding, tools }: {
  crumb: string; title: string; icon?: React.ElementType; finding?: React.ReactNode; tools?: React.ReactNode;
}) {
  return (
    <>
      <div className="ov-crumb">{crumb.split(" / ").map((c, i, a) => (
        <span key={i} style={{ margin: 0 }}>{c}{i < a.length - 1 && <span>›</span>}</span>
      ))}</div>
      <div className="ak-head">
        <div>
          <h1 className="ak-title">{Icon && <Icon />}{title}</h1>
          {finding && <p className="ak-finding">{finding}</p>}
        </div>
        {tools && <div className="ak-head-tools">{tools}</div>}
      </div>
    </>
  );
}
