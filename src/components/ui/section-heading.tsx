type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  id?: string;
};

export function SectionHeading({ eyebrow, title, id }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div className="section-heading-copy">
        <p className="section-heading-eyebrow">{eyebrow}</p>
        <h2 className="section-heading-title" id={id}>
          {title}
        </h2>
      </div>
    </div>
  );
}
