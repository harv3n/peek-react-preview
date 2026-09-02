import { card, title } from "./Card.module.css";

export interface CardProps {
  title: string;
  children?: React.ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <article className={card}>
      <h2 className={title}>{title}</h2>
      <div>{children}</div>
    </article>
  );
}

export const Preview = () => (
  <Card title="Primitive preview">
    Rendered without starting the host application.
  </Card>
);
