import type { ReactNode } from "react";

type StatusLabelProps = {
  children: ReactNode;
};

export function StatusLabel({ children }: StatusLabelProps) {
  return <span className="status-label">{children}</span>;
}
