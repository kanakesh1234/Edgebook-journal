import { forwardRef, type AnchorHTMLAttributes } from "react";
import { navigate } from "./next-navigation";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  replace?: boolean; scroll?: boolean; prefetch?: boolean | null;
};

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, replace, scroll: _s, prefetch: _p, onClick, ...rest }, ref,
) {
  const url = typeof href === "string"
    ? href
    : (href.pathname ?? "/") + (href.query ? "?" + new URLSearchParams(href.query).toString() : "");
  return (
    <a
      ref={ref}
      href={url}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target === "_blank" || /^(https?:|mailto:|tel:)/.test(url)) return;
        e.preventDefault();
        navigate(url, replace);
      }}
    />
  );
});
export default Link;
