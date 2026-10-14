import type { ReactNode } from "react";

type ErrorMessageProps = {
  children: ReactNode;
  id?: string;
};

export function ErrorMessage({ children, id }: ErrorMessageProps) {
  return (
    <p className="error-message" id={id} role="alert">
      {children}
    </p>
  );
}
