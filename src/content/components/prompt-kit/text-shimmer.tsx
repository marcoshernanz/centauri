import type { ReactNode } from "react";

type TextShimmerProps = {
  children: ReactNode;
  className?: string;
};

const joinClassNames = (...tokens: Array<string | undefined | null | false>) =>
  tokens.filter(Boolean).join(" ");

export const TextShimmer = ({ children, className }: TextShimmerProps) => {
  return <span className={joinClassNames("sp-text-shimmer", className)}>{children}</span>;
};
