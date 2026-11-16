/* Liquid button: the label rolls on hover (two stacked copies, styled in core.css).
   <Lq as="a" href="#orders" className="lq-p">Open</Lq>  ->  <a class="lq lq-p"><span class="t">…</span><span class="t2">…</span></a> */
export default function Lq({ as: Tag = 'button', className = '', children, ...rest }) {
  if (Tag === 'button' && !rest.type) rest.type = 'button';
  return (
    <Tag className={('lq ' + className).trim()} {...rest}>
      <span className="t">{children}</span><span className="t2" aria-hidden="true">{children}</span>
    </Tag>
  );
}
